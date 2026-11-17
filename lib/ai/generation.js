const { getModelConfig } = require('./model-config');

function emptyContent(message) {
    return Object.assign(new Error(message), { code: 'AI_EMPTY_CONTENT' });
}

function parseResponse(response, { includeThoughts = false } = {}) {
    const parts = response?.candidates?.[0]?.content?.parts;
    let text = '';
    const images = [];
    const thoughtSummaries = [];
    if (Array.isArray(parts)) {
        for (const part of parts) {
            if (part.thought) {
                if (includeThoughts && typeof part.text === 'string') thoughtSummaries.push(part.text.slice(0, 12000));
                continue;
            }
            if (typeof part.text === 'string') text += part.text;
            if (part.inlineData?.data) {
                const mime = part.inlineData.mimeType || 'image/png';
                if (mime.startsWith('image/')) images.push(`data:${mime};base64,${part.inlineData.data}`);
            }
        }
    } else if (typeof response?.text === 'string') text = response.text;
    const usage = response?.usageMetadata || {};
    return { response: text, image: images, ...(includeThoughts ? { thoughtSummaries: thoughtSummaries.slice(0, 8) } : {}), usage: {
        promptTokens: usage.promptTokenCount ?? null,
        candidatesTokens: usage.candidatesTokenCount ?? null,
        totalTokens: usage.totalTokenCount ?? null
    } };
}

async function generateImage(client, { question, ratio }) {
    const result = parseResponse(await client.models.generateContent({
        ...getModelConfig('image', { ratio }), contents: [{ text: question }]
    }));
    if (!result.image.length) throw emptyContent('Gemini 未回傳有效圖片，請重試。');
    return result;
}

function validatePrompt(text) {
    const prompt = text.trim();
    if (!prompt || /```|^\s*[\[{]|^\s*(?:#+\s|[-*]\s)|^(?:Here (?:is|are)|Sure[,!]|Explanation:|Prompt:|The (?:optimized|English) prompt)/im.test(prompt) || /[\u3400-\u9fff]/u.test(prompt) || /^(["']).*\1$/s.test(prompt)) {
        throw emptyContent('模型未回傳可直接使用的英文提示詞，請重試。');
    }
    return prompt;
}

function requestIssue(error) {
    const status = Number(error?.status || error?.code || error?.error?.code);
    if (status !== 400) return {};
    const message = String(error?.message || '');
    const category = /response.?json.?schema|response.?schema|json.?schema|schema|constraint.*(?:states|branch)/i.test(message) ? 'schema'
        : /thinking.?level|thinking.?config/i.test(message) ? 'thinking_config'
        : /include.?thoughts/i.test(message) ? 'thoughts_config'
        : /response.?modalities|response.?mime.?type/i.test(message) ? 'output_config' : 'request_argument';
    const reason = category === 'schema' && /too many states|too complex|complexity|too much branching/i.test(message) ? 'schema_too_complex'
        : category === 'schema' && /(?:type|types).*(?:array|list|union)|(?:array|list|union).*type/i.test(message) ? 'schema_type_union'
        : category === 'schema' ? 'schema_rejected' : 'invalid_argument';
    // Structural paths only. Never echo provider messages that may quote the user's prompt.
    const fields = ['generationConfig.responseJsonSchema', 'generation_config.response_json_schema',
        'generation_config.response_schema', 'responseJsonSchema', 'properties.shots.items.properties.id.type',
        'generationConfig.thinkingConfig', 'generation_config.thinking_config'].filter(field => message.includes(field));
    return { argumentCategory: category, argumentReason: reason, ...(fields.length ? { parameterPaths: fields } : {}) };
}

function classifyAIError(error) {
    const status = Number(error?.status || error?.code || error?.error?.code);
    const message = String(error?.message || '');
    if (error?.code === 'AI_INVALID_RESPONSE') return { status: 502, code: 'AI_INVALID_RESPONSE', message: '創作建議的格式仍未完成，請重試，或先略過討論進入設定。' };
    if (error?.code === 'AI_EMPTY_CONTENT' || error instanceof SyntaxError) return { status: 502, code: 'AI_EMPTY_CONTENT', message: '模型未回傳有效內容，請重試。' };
    if (/SERVICE_DISABLED|API has not been used|API.*is disabled/i.test(message)) return { status: 502, code: 'AI_API_DISABLED', message: '目前 Google Cloud 專案尚未啟用 Vertex AI API，請檢查後端專案設定與 API 啟用狀態。' };
    if (status === 404 || /NOT_FOUND|model.*(?:not found|not supported|unavailable)/i.test(message)) return { status: 502, code: 'AI_MODEL_UNAVAILABLE', message: '模型不存在或目前無法使用，請檢查後端模型設定與可用區域。' };
    if ([401, 403].includes(status) || /credentials|UNAUTHENTICATED|PERMISSION_DENIED|invalid_grant/i.test(message)) return { status: 502, code: 'AI_AUTH_PERMISSION', message: 'Google ADC 驗證或 IAM 權限不足，請檢查後端認證設定。' };
    if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) return { status: 429, code: 'AI_RATE_LIMIT', message: 'Gemini 配額不足或請求過多，請稍後重試。' };
    if (status === 400) return requestIssue(error).argumentCategory === 'schema'
        ? { status: 502, code: 'AI_SCHEMA_ERROR', message: '分鏡輸出格式設定未被服務接受，請更新服務後重試。' }
        : { status: 502, code: 'AI_INVALID_REQUEST', message: '生成請求的參數未被服務接受，請檢查後端設定。' };
    if (status >= 500 || /fetch failed|network|timeout|timed out|ECONN|ENOTFOUND|UNAVAILABLE/i.test(message)) return { status: 503, code: 'AI_TEMPORARY_FAILURE', message: 'Google AI 服務或網路暫時無法使用，請稍後重試。' };
    return { status: 502, code: 'AI_REQUEST_FAILED', message: 'AI 請求失敗，請檢查後端模型與請求設定。' };
}

function classifyOpenAIError(error) {
    const status = Number(error?.status || error?.error?.code || error?.code);
    const code = String(error?.code || error?.error?.code || '');
    const message = String(error?.message || '');
    if (code === 'AI_REQUEST_CANCELLED' || error?.name === 'APIUserAbortError') {
        return { status: 499, code: 'AI_REQUEST_CANCELLED', message: '請求已取消。' };
    }
    if (code === 'AI_UNSUPPORTED_CAPABILITY') {
        return { status: 400, code: 'AI_UNSUPPORTED_CAPABILITY', message: error.message || '目前選擇的 AI Provider 不支援此功能。' };
    }
    if (code === 'AI_UPSTREAM_TIMEOUT' || code === 'AI_TIMEOUT' || error?.name === 'APIConnectionTimeoutError' || /timeout|timed out/i.test(message)) {
        return { status: 504, code: 'AI_TIMEOUT', message: 'OpenAI 回應時間過長，請稍後重試。' };
    }
    if (code === 'AI_INVALID_RESPONSE') {
        return { status: 502, code: 'AI_INVALID_RESPONSE', message: '創作建議的格式仍未完成，請重試，或先略過討論進入設定。' };
    }
    if (code === 'AI_EMPTY_CONTENT' || error instanceof SyntaxError) {
        return { status: 502, code: 'AI_EMPTY_CONTENT', message: 'OpenAI 未回傳有效內容，請重試。' };
    }
    if ([401, 403].includes(status) || /api.?key|authentication|unauthorized|permission/i.test(message)) {
        return { status: 502, code: 'AI_AUTH_ERROR', message: 'OpenAI API 金鑰無效或權限不足，請檢查後端設定。' };
    }
    if (status === 404 || /model.*(?:not found|does not exist|unavailable)|model_not_found/i.test(message)) {
        return { status: 502, code: 'AI_MODEL_UNAVAILABLE', message: '指定的 OpenAI 模型不存在或目前無法使用，請檢查後端模型設定。' };
    }
    if (status === 429 || /rate.?limit|quota|insufficient_quota/i.test(message)) {
        return { status: 429, code: 'AI_RATE_LIMIT', message: 'OpenAI 配額不足或請求過於頻繁，請稍後重試。' };
    }
    if (status === 400) {
        const isSchema = /json_schema|response_format|schema|additionalProperties|strict/i.test(message);
        return isSchema
            ? { status: 502, code: 'AI_SCHEMA_ERROR', message: 'OpenAI 結構化輸出格式設定未被服務接受，請檢查後端設定。' }
            : { status: 502, code: 'AI_INVALID_REQUEST', message: 'OpenAI 生成請求參數無效，請檢查後端設定。' };
    }
    if (status >= 500 || /fetch failed|network|ECONN|ENOTFOUND|EAI_AGAIN/i.test(message)) {
        return { status: 503, code: 'AI_TEMPORARY_FAILURE', message: 'OpenAI 服務或網路暫時無法使用，請稍後重試。' };
    }
    return { status: 502, code: 'AI_REQUEST_FAILED', message: 'OpenAI 請求失敗，請稍後重試。' };
}

function classifyProviderError(error, provider = 'gemini') {
    if (error?.code === 'PERSONAL_API_KEY_REQUIRED') return {
        status: 403, code: 'PERSONAL_API_KEY_REQUIRED', message: '請先在 API 設定填入此帳號自己的 API 金鑰。'
    };
    if (provider === 'openai') return classifyOpenAIError(error);
    if (error?.code === 'AI_UNSUPPORTED_CAPABILITY') {
        return { status: 400, code: 'AI_UNSUPPORTED_CAPABILITY', message: error.message || '目前選擇的 AI Provider 不支援此功能。' };
    }
    if (error?.code === 'AI_REQUEST_CANCELLED') {
        return { status: 499, code: 'AI_REQUEST_CANCELLED', message: '請求已取消。' };
    }
    return classifyAIError(error);
}

function reportAIError(error, context = {}) {
    const provider = context.provider === 'openai' ? 'openai' : 'gemini';
    const result = classifyProviderError(error, provider);
    // Allowlisted diagnostics only: never log SDK request objects, tokens or upstream stacks.
    console.error(`${provider === 'openai' ? 'OpenAI' : 'Google AI'} request failed`, { ...context, code: result.code,
        sdkErrorName: ['ApiError', 'APIError', 'Error', 'TypeError', 'AbortError', 'SyntaxError', 'TimeoutError', 'RateLimitError', 'AuthenticationError', 'BadRequestError'].includes(error?.name) ? error.name : 'Error',
        ...requestIssue(error), upstreamStatus: Number(error?.status || error?.code || error?.error?.code) || undefined });
    return result;
}

module.exports = { parseResponse, generateImage, emptyContent, validatePrompt, classifyAIError, classifyOpenAIError, classifyProviderError, reportAIError, requestIssue };
