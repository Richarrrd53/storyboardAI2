// Task-specific defaults; read at call time so each deployment can override independently.
const DEFAULT_MODELS = Object.freeze({
    fast: 'gemini-3.5-flash-lite',
    story: 'gemini-3.8-flash',
    image: 'gemini-nano-banana-2.1',
    discovery: 'gemini-3.8-flash',
    premiumStory: 'gemini-4-argon'
});
const MODEL_ENV = Object.freeze({ fast: 'GEMINI_MODEL_FAST', story: 'GEMINI_MODEL_STORY',
    image: 'GEMINI_MODEL_IMAGE', discovery: 'DISCOVERY_GEMINI_MODEL', premiumStory: 'GEMINI_MODEL_PREMIUM_STORY' });

function getModel(task, env = process.env) {
    if (!MODEL_ENV[task]) throw new Error('Unknown AI task');
    return env[MODEL_ENV[task]]?.trim() || DEFAULT_MODELS[task];
}

function getModelConfig(task, { ratio, thinkingLevel = 'MEDIUM' } = {}, env = process.env) {
    const model = getModel(task, env);
    if (task === 'image') {
        const aspectRatio = ['16:9', '9:16', '3:2', '2:3', '1:1'].find(value => String(ratio || '').includes(value)) || '16:9';
        return { model, config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio, imageSize: '1K' } } };
    }
    const config = { responseModalities: ['TEXT'] };
    if (['story', 'discovery', 'premiumStory'].includes(task)) {
        if (!['LOW', 'MEDIUM', 'HIGH'].includes(thinkingLevel)) throw new Error('Invalid thinking level');
        config.thinkingConfig = { thinkingLevel };
    }
    // Story prompts still use the existing frontend JSON repair/validation path.
    if (task === 'story' || task === 'discovery') config.responseMimeType = 'application/json';
    return { model, config };
}

module.exports = { DEFAULT_MODELS, getModel, getModelConfig };
