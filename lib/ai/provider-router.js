const {
    DEFAULT_PROVIDER,
    isValidProvider,
    isProviderConfigured,
    getProviderCapabilities,
    getProviderModel
} = require('./model-config');
const { validatePrompt } = require('./generation');
const geminiAdapter = require('./adapters/gemini-adapter');
const openaiAdapter = require('./adapters/openai-adapter');

const ADAPTERS = Object.freeze({
    gemini: geminiAdapter,
    openai: openaiAdapter
});

function resolveProvider({ requestedProvider, userProvider } = {}) {
    if (requestedProvider !== undefined && requestedProvider !== null && requestedProvider !== '') {
        if (!isValidProvider(requestedProvider)) {
            throw Object.assign(new Error(`不支援的 AI Provider：${requestedProvider}`), {
                status: 400,
                code: 'AI_INVALID_REQUEST'
            });
        }
        return requestedProvider;
    }
    if (userProvider && isValidProvider(userProvider)) {
        return userProvider;
    }
    return DEFAULT_PROVIDER;
}

function assertProviderTaskSupported(provider, task, env = process.env) {
    if (env.API_KEYS_ACCOUNT_ONLY && !isProviderConfigured(provider, env)) {
        throw Object.assign(new Error(`請先在 API 設定填入此帳號自己的 ${provider === 'openai' ? 'OpenAI' : 'Gemini'} API Key。`), {
            status: 403, code: 'PERSONAL_API_KEY_REQUIRED'
        });
    }
    if (provider === 'openai') {
        if (!isProviderConfigured('openai', env)) {
            throw Object.assign(new Error('請先在 API 設定填入此帳號自己的 OpenAI API Key，或切換回 Google Gemini。'), {
                status: 403,
                code: 'PERSONAL_API_KEY_REQUIRED'
            });
        }
        const caps = getProviderCapabilities('openai', env);
        if (!caps.tasks[task]) {
            throw Object.assign(new Error(`OpenAI 目前不支援此任務（${task}）。`), {
                status: 400,
                code: 'AI_UNSUPPORTED_CAPABILITY'
            });
        }
    }
}

function createProviderRouter({ getGeminiClient, getOpenAIClient, env = process.env, getRuntimeEnv = () => env } = {}) {
    function getClient(provider) {
        if (provider === 'openai') {
            if (typeof getOpenAIClient !== 'function') {
                throw Object.assign(new Error('OpenAI client 尚未初始化。'), { status: 503, code: 'AI_AUTH_ERROR' });
            }
            return getOpenAIClient();
        }
        if (typeof getGeminiClient !== 'function') {
            throw Object.assign(new Error('Gemini client 尚未初始化。'), { status: 503, code: 'AI_AUTH_PERMISSION' });
        }
        return getGeminiClient();
    }

    function getAdapter(provider) {
        const adapter = ADAPTERS[provider];
        if (!adapter) {
            throw Object.assign(new Error(`不支援的 AI Provider：${provider}`), { status: 400, code: 'AI_INVALID_REQUEST' });
        }
        return adapter;
    }

    async function generateText(params) {
        const runtimeEnv = params.env || getRuntimeEnv();
        const provider = resolveProvider({ requestedProvider: params.provider, userProvider: params.userProvider });
        assertProviderTaskSupported(provider, params.task, runtimeEnv);
        const adapter = getAdapter(provider);
        const client = getClient(provider);
        return adapter.generateText(client, { ...params, env: runtimeEnv });
    }

    async function generateImage(params) {
        const runtimeEnv = params.env || getRuntimeEnv();
        const provider = resolveProvider({ requestedProvider: params.provider, userProvider: params.userProvider });
        assertProviderTaskSupported(provider, 'image', runtimeEnv);
        const adapter = getAdapter(provider);
        const client = getClient(provider);
        return adapter.generateImage(client, { ...params, env: runtimeEnv });
    }

    async function optimizePrompt(params) {
        const runtimeEnv = params.env || getRuntimeEnv();
        const result = await generateText({
            ...params,
            task: 'fast',
            prompt: params.promptGenRequest,
            systemInstruction: params.systemInstruction || 'Return only the complete English image prompt. No headings, introduction, markdown, JSON, surrounding quotes or explanations.',
            env: runtimeEnv
        });
        return {
            ...result,
            prompt: validatePrompt(result.response)
        };
    }

    return {
        resolveProvider,
        assertProviderTaskSupported,
        getClient,
        getAdapter,
        getModel: (provider, task, runtimeEnv = env) => getProviderModel(provider, task, runtimeEnv),
        getCapabilities: (runtimeEnv = env) => ({
            defaultProvider: DEFAULT_PROVIDER,
            providers: {
                gemini: getProviderCapabilities('gemini', runtimeEnv),
                openai: getProviderCapabilities('openai', runtimeEnv)
            }
        }),
        generateText,
        generateImage,
        optimizePrompt
    };
}

module.exports = {
    resolveProvider,
    assertProviderTaskSupported,
    createProviderRouter
};
