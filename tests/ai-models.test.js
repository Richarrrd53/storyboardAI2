const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_MODELS, getModel, getModelConfig } = require('../lib/ai/model-config');
const { parseResponse, generateImage, validatePrompt, classifyAIError } = require('../lib/ai/generation');
const { vertexAuthOptions, vertexAvailable } = require('../lib/google-credentials');
const { ApiSettings } = require('../lib/discovery/api-settings');

test('task defaults and environment overrides are independent', () => {
    assert.deepEqual(DEFAULT_MODELS, { fast: 'gemini-3.5-flash-lite', story: 'gemini-3.8-flash',
        image: 'gemini-nano-banana-2.1', discovery: 'gemini-3.8-flash', premiumStory: 'gemini-4-argon' });
    const names = { fast: 'GEMINI_MODEL_FAST', story: 'GEMINI_MODEL_STORY', image: 'GEMINI_MODEL_IMAGE',
        discovery: 'DISCOVERY_GEMINI_MODEL', premiumStory: 'GEMINI_MODEL_PREMIUM_STORY' };
    for (const [task, name] of Object.entries(names)) {
        const env = { [name]: ' custom-model ' };
        for (const other of Object.keys(names)) assert.equal(getModel(other, env), other === task ? 'custom-model' : DEFAULT_MODELS[other]);
        assert.equal(getModel(task, { [name]: ' ' }), DEFAULT_MODELS[task]);
    }
});

test('text thinking and image settings cannot leak into other task types', () => {
    assert.equal(getModelConfig('fast').config.thinkingConfig, undefined);
    for (const task of ['story', 'discovery']) {
        assert.equal(getModelConfig(task).config.thinkingConfig.thinkingLevel, 'MEDIUM');
        assert.equal(getModelConfig(task, { thinkingLevel: 'LOW' }).config.thinkingConfig.thinkingLevel, 'LOW');
        assert.equal(getModelConfig(task, { thinkingLevel: 'HIGH' }).config.thinkingConfig.thinkingLevel, 'HIGH');
        assert.throws(() => getModelConfig(task, { thinkingLevel: 'MINIMAL' }));
    }
    for (const ratio of ['1:1', '16:9', '9:16', '3:2', '2:3']) {
        assert.deepEqual(getModelConfig('image', { ratio: `Landscape (${ratio})` }).config, {
            responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: ratio, imageSize: '1K' }
        });
    }
    assert.equal(getModelConfig('image', { ratio: 'invalid' }).config.imageConfig.aspectRatio, '16:9');
});

test('response parsing excludes thoughts and joins all final parts without merging candidate alternatives', () => {
    const result = parseResponse({ candidates: [{ content: { parts: [
        { thought: true, text: 'private reasoning' }, { text: '{"shots":' },
        { thought: true, inlineData: { data: 'preview', mimeType: 'image/png' } },
        { text: '[]}' }, { inlineData: { data: 'jpeg', mimeType: 'image/jpeg' } },
        { inlineData: { data: 'png', mimeType: 'image/png' } }
    ] } }, { content: { parts: [{ text: 'alternative' }] } }] });
    assert.deepEqual(JSON.parse(result.response), { shots: [] });
    assert.deepEqual(result.image, ['data:image/jpeg;base64,jpeg', 'data:image/png;base64,png']);
    assert.deepEqual(result.usage, { promptTokens: null, candidatesTokens: null, totalTokens: null });
    assert.equal(parseResponse({ usageMetadata: { totalTokenCount: 4 } }).usage.totalTokens, 4);
});

test('opt-in summaries stay separate from JSON and images; default parsing is unchanged', () => {
    const response = { candidates: [{ content: { parts: [{ thought: true, text: 'Real provider summary' }, { text: '{"value":1}' }] } }] };
    assert.equal(parseResponse(response).thoughtSummaries, undefined);
    const result = parseResponse(response, { includeThoughts: true });
    assert.deepEqual(result.thoughtSummaries, ['Real provider summary']);
    assert.deepEqual(JSON.parse(result.response), { value: 1 });
    assert.deepEqual(parseResponse({ text: '{}' }, { includeThoughts: true }).thoughtSummaries, []);
    assert.equal(getModelConfig('fast', { includeThoughts: true }).config.thinkingConfig.includeThoughts, true);
    assert.equal(getModelConfig('image', { includeThoughts: true }).config.thinkingConfig, undefined);
});

test('shared image generation finds images after text, preserves MIME and rejects empty output', async () => {
    let request;
    const client = { models: { generateContent: async args => {
        request = args;
        return { candidates: [{ content: { parts: [{ text: 'Image:' }, { inlineData: { data: 'img', mimeType: 'image/jpeg' } }] } }] };
    } } };
    assert.deepEqual((await generateImage(client, { question: 'a scene', ratio: '9:16' })).image, ['data:image/jpeg;base64,img']);
    assert.equal(request.model, getModel('image'));
    for (const key of ['temperature', 'topP', 'topK', 'seed', 'thinkingConfig']) assert.equal(request.config[key], undefined);
    client.models.generateContent = async () => ({ candidates: [] });
    await assert.rejects(generateImage(client, { question: 'scene' }), { code: 'AI_EMPTY_CONTENT' });
});

test('optimized prompt validation preserves the entire English prompt and rejects wrappers', () => {
    const prompt = 'Wide shot, a quiet street.\nSoft morning light and a solitary cyclist.';
    assert.equal(validatePrompt(` ${prompt} `), prompt);
    for (const invalid of ['', '```text\nPrompt\n```', '{"prompt":"scene"}', 'Here is your prompt: street', '中文說明', '"A street scene"']) assert.throws(() => validatePrompt(invalid));
});

test('AI errors distinguish model, credentials, quota, temporary service and empty content safely', () => {
    for (const [error, code] of [ [{ status: 404 }, 'AI_MODEL_UNAVAILABLE'], [{ status: 403 }, 'AI_AUTH_PERMISSION'],
        [{ message: 'Could not load default credentials' }, 'AI_AUTH_PERMISSION'], [{ status: 429 }, 'AI_RATE_LIMIT'],
        [{ message: 'fetch failed' }, 'AI_TEMPORARY_FAILURE'], [{ status: 503 }, 'AI_TEMPORARY_FAILURE'],
        [{ code: 'AI_EMPTY_CONTENT' }, 'AI_EMPTY_CONTENT'],
        [{ status: 403, message: 'Agent Platform API has not been used in project before or it is disabled.' }, 'AI_API_DISABLED'] ]) assert.equal(classifyAIError(error).code, code);
    assert.ok(!classifyAIError({ message: 'secret-token' }).message.includes('secret-token'));
});

test('credential path takes precedence and base64 deployment credentials stay in memory', () => {
    const encoded = Buffer.from(JSON.stringify({ type: 'service_account', client_email: 'fixture@example.com', private_key: 'fixture' })).toString('base64');
    assert.deepEqual(vertexAuthOptions({ GOOGLE_APPLICATION_CREDENTIALS: __filename, GCP_SERVICE_ACCOUNT_BASE64: encoded }), {});
    assert.equal(vertexAuthOptions({ NODE_ENV: 'production', GCP_SERVICE_ACCOUNT_BASE64: encoded }).googleAuthOptions.credentials.client_email, 'fixture@example.com');
    assert.throws(() => vertexAuthOptions({ GCP_SERVICE_ACCOUNT_BASE64: 'invalid' }), /credentials/);
    assert.equal(vertexAvailable({ GOOGLE_CLOUD_PROJECT_ID: 'fixture', GOOGLE_APPLICATION_CREDENTIALS: __filename }), true);
    const status = new ApiSettings({ env: { GOOGLE_CLOUD_PROJECT_ID: 'fixture', GOOGLE_APPLICATION_CREDENTIALS: __filename } }).status();
    assert.equal(status.gemini.mode, 'vertex');
    assert.equal(status.gemini.provider, 'vertex-ai');
    assert.equal(status.gemini.model, DEFAULT_MODELS.discovery);
});

test('well-known local ADC works without an explicit credential path and wins over a stale cloud key', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'storyboard-adc-test-'));
    try {
        fs.writeFileSync(path.join(root, 'application_default_credentials.json'), '{}');
        const env = { NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT_ID: 'fixture', CLOUDSDK_CONFIG: root,
            GCP_SERVICE_ACCOUNT_BASE64: 'invalid-stale-key' };
        assert.equal(vertexAvailable(env), true);
        assert.deepEqual(vertexAuthOptions(env), {});
        assert.equal(new ApiSettings({ env }).status().gemini.mode, 'vertex');
        assert.equal(new ApiSettings({ env: { ...env, GEMINI_API_KEY: 'explicit-key' } }).status().gemini.provider, 'gemini-developer-api');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('installed SDK serializes Vertex and Developer API requests with the expected task settings', async () => {
    const { GoogleGenAI } = require('@google/genai');
    const originalFetch = global.fetch;
    const requests = [];
    global.fetch = async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(init.body), headers: new Headers(init.headers) });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), { headers: { 'Content-Type': 'application/json' } });
    };
    try {
        const vertex = new GoogleGenAI({ vertexai: true, project: 'fixture', location: 'global',
            googleAuthOptions: { authClient: { getRequestHeaders: async () => new Headers() } } });
        for (const task of ['fast', 'story', 'image', 'discovery']) await vertex.models.generateContent({ ...getModelConfig(task), contents: [{ text: 'fixture' }] });
        assert.ok(requests.every(request => request.url.startsWith('https://aiplatform.googleapis.com/')));
        assert.equal(requests[1].body.generationConfig.thinkingConfig.thinkingLevel, 'MEDIUM');
        assert.equal(requests[3].body.generationConfig.responseMimeType, 'application/json');
        assert.deepEqual(requests[2].body.generationConfig, { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '1K' } });
        assert.ok(requests.every(request => !request.headers.has('x-goog-api-key')));
        const developer = new GoogleGenAI({ vertexai: false, apiKey: 'fixture-key' });
        await developer.models.generateContent({ ...getModelConfig('discovery'), contents: [{ text: 'fixture' }] });
        assert.match(requests[4].url, /^https:\/\/generativelanguage.googleapis.com\//);
        assert.equal(requests[4].headers.get('x-goog-api-key'), 'fixture-key');
    } finally { global.fetch = originalFetch; }
});
