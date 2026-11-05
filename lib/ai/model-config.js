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

module.exports = { DEFAULT_MODELS, getModel, getModelConfig };
