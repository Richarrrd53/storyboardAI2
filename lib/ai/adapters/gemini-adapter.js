const { getModel, getModelConfig } = require('../model-config');
const { parseResponse, generateImage: generateGeminiImage, emptyContent } = require('../generation');
const { callWithinDeadline } = require('../creative-request');

async function generateText(client, { task, prompt, systemInstruction, responseSchema, includeThoughts = false, requestId, env = process.env }) {
    const modelConfig = getModelConfig(task, { includeThoughts }, env);
    const config = {
        ...modelConfig.config,
        ...(systemInstruction ? { systemInstruction } : {}),
        ...(responseSchema ? { responseJsonSchema: responseSchema } : {})
    };
    const response = await client.models.generateContent({
        ...modelConfig,
        config,
        contents: [{ text: prompt }]
    });
    const parsed = parseResponse(response, { includeThoughts });
    if (!parsed.response.trim()) {
        throw emptyContent('模型未回傳有效文字，請重試。');
    }
    return {
        ...parsed,
        provider: 'gemini',
        model: modelConfig.model,
        requestId: requestId || null
    };
}

async function generateImage(client, { question, ratio, requestId, env = process.env }) {
    const result = await generateGeminiImage(client, { question, ratio });
    return {
        ...result,
        provider: 'gemini',
        model: getModel('image', env),
        requestId: requestId || null
    };
}

async function generateCopilotTurn(client, { modelConfig, schema, systemInstruction, contents, continuationToken, timeout, signal, upstreamGraceMs = 10000 }) {
    return callWithinDeadline(client, {
        ...modelConfig,
        config: {
            ...modelConfig.config,
            responseMimeType: 'application/json',
            responseJsonSchema: schema,
            automaticContinuation: false,
            ...(continuationToken ? { continuationToken } : {}),
            maxOutputTokens: 8192,
            systemInstruction
        },
        contents
    }, timeout, signal, upstreamGraceMs);
}

module.exports = {
    id: 'gemini',
    generateText,
    generateImage,
    generateCopilotTurn
};
