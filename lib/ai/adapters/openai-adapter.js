const { getOpenAIModelConfig } = require('../model-config');
const { toOpenAIStrictSchema, normalizeOpenAIStructuredData } = require('../openai-schema');
const { emptyContent } = require('../generation');

const STRICT_SCHEMA_ADAPTER_NOTE = '\n\n[Output Format Adapter] Strictly follow the provided JSON schema. For any optional field not applicable to this turn, output null rather than inventing placeholder text or empty values.';

const failure = (code, message) => Object.assign(new Error(message), { code });

async function runWithinDeadline(taskFn, milliseconds, signal) {
    const controller = new AbortController();
    let timer;
    let onAbort;
    const stopped = new Promise((_, reject) => {
        onAbort = () => {
            const error = failure('AI_REQUEST_CANCELLED', 'Caller disconnected');
            controller.abort(error);
            reject(error);
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) return onAbort();
        timer = setTimeout(() => {
            const error = Object.assign(failure('AI_UPSTREAM_TIMEOUT', 'OpenAI request deadline exceeded'), {
                timeoutSource: 'application_deadline',
                timeoutMs: milliseconds
            });
            controller.abort(error);
            reject(error);
        }, milliseconds);
    });

    try {
        if (signal?.aborted) return await stopped;
        return await Promise.race([stopped, taskFn(controller.signal)]);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}

function extractResponseText(response) {
    if (typeof response?.output_text === 'string' && response.output_text.trim()) {
        return response.output_text;
    }
    const outputs = Array.isArray(response?.output) ? response.output : [];
    const chunks = [];
    for (const item of outputs) {
        if (item?.type === 'refusal') {
            throw emptyContent('OpenAI 拒絕了此請求，請調整內容後重試。');
        }
        if (item?.type === 'message' && Array.isArray(item.content)) {
            for (const part of item.content) {
                if (part?.type === 'refusal') {
                    throw emptyContent('OpenAI 拒絕了此請求，請調整內容後重試。');
                }
                if (part?.type === 'output_text' && typeof part.text === 'string') {
                    chunks.push(part.text);
                }
            }
        }
    }
    return chunks.join('');
}

function extractUsage(response) {
    const usage = response?.usage;
    if (!usage) return { promptTokens: null, candidatesTokens: null, totalTokens: null };
    return {
        promptTokens: usage.input_tokens ?? null,
        candidatesTokens: usage.output_tokens ?? null,
        totalTokens: usage.total_tokens ?? null
    };
}

function toResponsesInput(contents) {
    if (typeof contents === 'string') return contents;
    if (!Array.isArray(contents)) return String(contents || '');
    return contents.map(item => {
        const role = item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user';
        const text = Array.isArray(item.parts)
            ? item.parts.map(p => (typeof p?.text === 'string' ? p.text : '')).join('')
            : typeof item.text === 'string' ? item.text : String(item.content || '');
        return { role, content: text };
    });
}

function buildTextFormat(responseSchema, responseMimeType, schemaName) {
    if (responseSchema) {
        return {
            format: {
                type: 'json_schema',
                name: schemaName || 'storyboard_response',
                strict: true,
                schema: toOpenAIStrictSchema(responseSchema)
            }
        };
    }
    if (responseMimeType === 'application/json') {
        return { format: { type: 'json_object' } };
    }
    return undefined;
}

function parseAndNormalizeIfSchema(rawText, hasSchema) {
    if (!hasSchema) return rawText;
    const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        const parsed = JSON.parse(cleaned);
        return JSON.stringify(normalizeOpenAIStructuredData(parsed));
    } catch {
        return rawText;
    }
}

async function generateText(client, {
    task,
    prompt,
    systemInstruction,
    responseSchema,
    responseMimeType,
    schemaName,
    includeThoughts = false,
    signal,
    timeoutMs = 100000,
    requestId,
    env = process.env
}) {
    const modelConfig = getOpenAIModelConfig(task, {}, env);
    const instructions = systemInstruction
        ? (responseSchema ? systemInstruction + STRICT_SCHEMA_ADAPTER_NOTE : systemInstruction)
        : (responseSchema ? STRICT_SCHEMA_ADAPTER_NOTE.trim() : undefined);

    const textConfig = buildTextFormat(responseSchema, responseMimeType, schemaName);
    const params = {
        model: modelConfig.model,
        input: prompt,
        max_output_tokens: modelConfig.max_output_tokens,
        ...(instructions ? { instructions } : {}),
        ...(modelConfig.reasoning ? { reasoning: modelConfig.reasoning } : {}),
        ...(textConfig ? { text: textConfig } : {})
    };

    const response = await runWithinDeadline(
        abortSignal => client.responses.create(params, { signal: abortSignal }),
        timeoutMs,
        signal
    );

    if (response?.status === 'incomplete') {
        throw Object.assign(new Error('模型尚未完成回覆，已確認內容仍保留。'), {
            code: 'AI_INCOMPLETE_RESPONSE',
            responseReason: 'generation_incomplete',
            stage: 'receive_response'
        });
    }

    const rawText = extractResponseText(response);
    if (!rawText.trim()) {
        throw emptyContent('OpenAI 未回傳有效文字，請重試。');
    }

    const normalizedText = parseAndNormalizeIfSchema(rawText, Boolean(responseSchema));

    return {
        response: normalizedText,
        image: [],
        ...(includeThoughts ? { thoughtSummaries: [] } : {}),
        usage: extractUsage(response),
        provider: 'openai',
        model: modelConfig.model,
        requestId: response?.id || requestId || null,
        finishReason: response?.status || 'completed'
    };
}

async function cropToAspectRatioIfNeeded(base64Data, mimeType, aspectRatio) {
    if (!['16:9', '9:16'].includes(aspectRatio)) {
        return `data:${mimeType};base64,${base64Data}`;
    }
    try {
        const sharp = require('sharp');
        const inputBuffer = Buffer.from(base64Data, 'base64');
        const metadata = await sharp(inputBuffer).metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;
        if (!width || !height) return `data:${mimeType};base64,${base64Data}`;

        const targetRatio = aspectRatio === '16:9' ? 16 / 9 : 9 / 16;
        const currentRatio = width / height;
        if (Math.abs(currentRatio - targetRatio) < 0.02) {
            return `data:${mimeType};base64,${base64Data}`;
        }

        let cropWidth = width;
        let cropHeight = height;
        if (currentRatio > targetRatio) {
            cropWidth = Math.round(height * targetRatio);
        } else {
            cropHeight = Math.round(width / targetRatio);
        }
        const left = Math.max(0, Math.floor((width - cropWidth) / 2));
        const top = Math.max(0, Math.floor((height - cropHeight) / 2));

        const cropped = await sharp(inputBuffer)
            .extract({ left, top, width: cropWidth, height: cropHeight })
            .jpeg({ quality: 90 })
            .toBuffer();

        return `data:image/jpeg;base64,${cropped.toString('base64')}`;
    } catch {
        return `data:${mimeType};base64,${base64Data}`;
    }
}

async function generateImage(client, { question, ratio, signal, timeoutMs = 100000, requestId, env = process.env }) {
    const modelConfig = getOpenAIModelConfig('image', { ratio }, env);
    const isDalle = /^dall-e/i.test(modelConfig.model);
    const params = {
        model: modelConfig.model,
        prompt: question,
        n: 1,
        size: isDalle && modelConfig.aspectRatio === '16:9' ? '1792x1024'
            : isDalle && modelConfig.aspectRatio === '9:16' ? '1024x1792'
                : modelConfig.size,
        ...(isDalle ? { response_format: 'b64_json' } : { output_format: modelConfig.output_format })
    };

    const response = await runWithinDeadline(
        abortSignal => client.images.generate(params, { signal: abortSignal }),
        timeoutMs,
        signal
    );

    const item = response?.data?.[0];
    if (!item?.b64_json) {
        throw emptyContent('OpenAI 未回傳有效圖片，請重試。');
    }

    const mimeType = isDalle ? 'image/png' : `image/${modelConfig.output_format || 'jpeg'}`;
    const dataUri = await cropToAspectRatioIfNeeded(item.b64_json, mimeType, modelConfig.aspectRatio);

    return {
        response: '',
        image: [dataUri],
        usage: { promptTokens: null, candidatesTokens: null, totalTokens: null },
        provider: 'openai',
        model: modelConfig.model,
        requestId: requestId || null
    };
}

async function generateCopilotTurn(client, { modelConfig, schema, systemInstruction, contents, timeout, signal }) {
    const params = {
        model: modelConfig.model,
        instructions: systemInstruction + STRICT_SCHEMA_ADAPTER_NOTE,
        input: toResponsesInput(contents),
        max_output_tokens: modelConfig.max_output_tokens || 8192,
        ...(modelConfig.reasoning ? { reasoning: modelConfig.reasoning } : {}),
        text: buildTextFormat(schema, 'application/json', 'copilot_decision')
    };

    const response = await runWithinDeadline(
        abortSignal => client.responses.create(params, { signal: abortSignal }),
        timeout,
        signal
    );

    if (response?.status === 'incomplete') {
        throw Object.assign(new Error('模型尚未完成回覆，已確認內容仍保留。'), {
            code: 'AI_INCOMPLETE_RESPONSE',
            responseReason: 'generation_incomplete',
            stage: 'receive_response'
        });
    }

    const rawText = extractResponseText(response);
    const normalizedText = parseAndNormalizeIfSchema(rawText, true);

    // Return a normalized envelope compatible with parseResponse() in copilot.js
    return {
        candidates: [{
            finishReason: response?.status === 'completed' ? 'STOP' : (response?.status || 'STOP'),
            content: {
                parts: [{ text: normalizedText }]
            }
        }],
        usageMetadata: {
            promptTokenCount: response?.usage?.input_tokens ?? null,
            candidatesTokenCount: response?.usage?.output_tokens ?? null,
            totalTokenCount: response?.usage?.total_tokens ?? null
        },
        sdkHttpResponse: {
            responseInternal: { status: 200 }
        },
        openaiResponseId: response?.id || null
    };
}

module.exports = {
    id: 'openai',
    generateText,
    generateImage,
    generateCopilotTurn,
    toResponsesInput,
    extractResponseText
};
