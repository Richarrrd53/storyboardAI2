const { vertexAvailable } = require('../google-credentials');

// Task-specific defaults; read at call time so each deployment can override independently.
const DEFAULT_MODELS = Object.freeze({
    fast: 'gemini-3.5-flash-lite',
    creative: 'gemini-3.8-flash',
    story: 'gemini-3.8-flash',
    image: 'gemini-nano-banana-2.1',
    discovery: 'gemini-3.8-flash',
    premiumStory: 'gemini-4-argon'
});
const MODEL_ENV = Object.freeze({ fast: 'GEMINI_MODEL_FAST', creative: 'GEMINI_MODEL_CREATIVE', story: 'GEMINI_MODEL_STORY',
    image: 'GEMINI_MODEL_IMAGE', discovery: 'DISCOVERY_GEMINI_MODEL', premiumStory: 'GEMINI_MODEL_PREMIUM_STORY' });

const PROVIDERS = Object.freeze(['gemini', 'openai']);
const DEFAULT_PROVIDER = 'gemini';

const OPENAI_DEFAULT_MODELS = Object.freeze({
    fast: 'gpt-6-luna',
    creative: 'gpt-6.1-terra',
    story: 'gpt-6.1-sol',
    image: 'gpt-image-2-2026-04-21',
    premiumStory: 'gpt-6.1-sol'
});
const OPENAI_MODEL_ENV = Object.freeze({
    fast: 'OPENAI_MODEL_FAST',
    creative: 'OPENAI_MODEL_CREATIVE',
    story: 'OPENAI_MODEL_STORY',
    image: 'OPENAI_MODEL_IMAGE',
    premiumStory: 'OPENAI_MODEL_PREMIUM_STORY'
});

const OPENAI_IMAGE_SIZES = Object.freeze({
    '1:1': '1024x1024',
    '16:9': '1536x864',
    '3:2': '1536x1024',
    '9:16': '864x1536',
    '2:3': '1024x1536'
});

function isValidProvider(provider) {
    return typeof provider === 'string' && PROVIDERS.includes(provider);
}

function getProviderModel(provider, task, env = process.env) {
    if (provider === 'gemini') return getModel(task, env);
    if (provider === 'openai') {
        if (!OPENAI_MODEL_ENV[task]) throw Object.assign(new Error(`OpenAI 不支援此任務：${task}`), { code: 'AI_UNSUPPORTED_CAPABILITY' });
        const configured = env[OPENAI_MODEL_ENV[task]]?.trim();
        if (configured && ['none', 'disabled', 'false'].includes(configured.toLowerCase())) return null;
        return configured || OPENAI_DEFAULT_MODELS[task];
    }
    throw Object.assign(new Error(`未知的 AI Provider：${provider}`), { code: 'AI_INVALID_REQUEST' });
}

function isProviderConfigured(provider, env = process.env) {
    if (provider === 'gemini' && env.API_KEYS_ACCOUNT_ONLY) return Boolean(env.GEMINI_API_KEY?.trim());
    if (provider === 'gemini') {
        const siteEnabled = !['false', '0', 'disabled', 'no', 'off'].includes(String(env.SITE_GEMINI_ENABLED ?? '').trim().toLowerCase());
        return Boolean(env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim() || (siteEnabled && vertexAvailable(env)));
    }
    if (provider === 'openai') return Boolean(env.OPENAI_API_KEY?.trim());
    return false;
}

function getProviderCapabilities(provider, env = process.env) {
    if (provider === 'gemini') {
        const available = isProviderConfigured('gemini', env);
        return {
            id: 'gemini',
            label: 'Google Gemini',
            available,
            reason: available ? null : '目前網站的 Gemini 服務暫時無法使用，請稍後重試或於 API 設定填入個人金鑰。',
            tasks: { fast: available, creative: available, story: available, image: available, discovery: available, premiumStory: available },
            features: { jsonSchema: true, thinking: true, thoughtSummaries: true, imageGeneration: available, videoInput: available }
        };
    }
    if (provider === 'openai') {
        const available = isProviderConfigured('openai', env);
        const imageModel = available ? getProviderModel('openai', 'image', env) : null;
        const imageEnabled = Boolean(available && imageModel);
        return {
            id: 'openai',
            label: 'OpenAI',
            available,
            reason: available ? null : '尚未綁定個人 OpenAI API 金鑰。',
            tasks: { fast: available, creative: available, story: available, image: imageEnabled, discovery: false, premiumStory: available },
            features: { jsonSchema: true, thinking: false, thoughtSummaries: false, imageGeneration: imageEnabled, videoInput: false }
        };
    }
    throw Object.assign(new Error(`未知的 AI Provider：${provider}`), { code: 'AI_INVALID_REQUEST' });
}

function getOpenAIModelConfig(task, options = {}, env = process.env) {
    const model = getProviderModel('openai', task, env);
    if (!model) {
        throw Object.assign(new Error(`OpenAI 目前未啟用 ${task} 任務模型。`), { code: 'AI_UNSUPPORTED_CAPABILITY' });
    }
    if (task === 'image') {
        const aspectRatio = ['16:9', '9:16', '3:2', '2:3', '1:1'].find(value => String(options.ratio || '').includes(value)) || '16:9';
        return {
            model,
            aspectRatio,
            size: /^gpt-image-(?:[2-9]|\d{2,})(?:[.-]|$)/.test(model)
                ? OPENAI_IMAGE_SIZES[aspectRatio]
                : aspectRatio === '16:9' ? '1536x1024' : aspectRatio === '9:16' ? '1024x1536' : OPENAI_IMAGE_SIZES[aspectRatio],
            output_format: 'jpeg'
        };
    }
    const config = {
        model,
        max_output_tokens: options.maxOutputTokens || 8192
    };
    if (['creative', 'story', 'premiumStory'].includes(task)) {
        const effort = (options.reasoningEffort || env.OPENAI_REASONING_EFFORT || 'medium').trim().toLowerCase();
        if (['none', 'minimal', 'low', 'medium', 'high'].includes(effort)) {
            config.reasoning = { effort };
        }
    }
    return config;
}

function getModel(task, env = process.env) {
    if (!MODEL_ENV[task]) throw new Error('Unknown AI task');
    return env[MODEL_ENV[task]]?.trim() || DEFAULT_MODELS[task];
}

function getModelConfig(task, options = {}, env = process.env) {
    const { ratio } = options;
    const thinkingLevel = options.thinkingLevel ?? (task === 'creative' ? env.GEMINI_CREATIVE_THINKING_LEVEL?.trim() || 'MEDIUM' : 'MEDIUM');
    const configuredThoughts = task === 'creative' ? env.GEMINI_CREATIVE_INCLUDE_THOUGHTS?.trim().toLowerCase() : undefined;
    if (task === 'creative' && configuredThoughts && !['true', 'false'].includes(configuredThoughts)) {
        throw Object.assign(new Error('GEMINI_CREATIVE_INCLUDE_THOUGHTS must be true or false'), { code: 'AI_SCHEMA_ERROR' });
    }
    const includeThoughts = options.includeThoughts ?? (task === 'creative' && configuredThoughts !== 'false');
    const model = getModel(task, env);
    if (task === 'image') {
        const aspectRatio = ['16:9', '9:16', '3:2', '2:3', '1:1'].find(value => String(ratio || '').includes(value)) || '16:9';
        return { model, config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio, imageSize: '1K' } } };
    }
    const config = { responseModalities: ['TEXT'] };
    if (['creative', 'story', 'discovery', 'premiumStory'].includes(task)) {
        if (!['LOW', 'MEDIUM', 'HIGH'].includes(thinkingLevel)) throw Object.assign(new Error('Invalid thinking level'), { code: 'AI_SCHEMA_ERROR' });
        config.thinkingConfig = { thinkingLevel };
    }
    if (includeThoughts) config.thinkingConfig = { ...config.thinkingConfig, includeThoughts: true };
    // Callers may attach a contract schema; frontend repair/validation remains in place.
    if (['creative', 'story', 'discovery'].includes(task)) config.responseMimeType = 'application/json';
    return { model, config };
}

module.exports = {
    DEFAULT_MODELS,
    OPENAI_DEFAULT_MODELS,
    OPENAI_IMAGE_SIZES,
    PROVIDERS,
    DEFAULT_PROVIDER,
    getModel,
    getModelConfig,
    isValidProvider,
    getProviderModel,
    isProviderConfigured,
    getProviderCapabilities,
    getOpenAIModelConfig
};
