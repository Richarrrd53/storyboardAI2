const { test } = require('node:test');
const assert = require('node:assert/strict');

test('AI routes preserve task contracts, edited shots and provider isolation', async () => {
    Object.assign(process.env, { NODE_ENV: 'production', JWT_SECRET: 'ai-route-fixture',
        GOOGLE_CLOUD_PROJECT_ID: 'fixture', GOOGLE_APPLICATION_CREDENTIALS: '', GCP_SERVICE_ACCOUNT_BASE64: '',
        GEMINI_API_KEY: '', GOOGLE_API_KEY: '', DISCOVERY_SETTINGS_SECRET: 'fixture-only-encryption-secret-long-enough' });
    const { getModel } = require('../lib/ai/model-config');
    const sdkPath = require.resolve('@google/genai');
    const originalSdk = require(sdkPath);
    let request, response, thrown, checkedModel, clientOptions, writes = 0;
    // generateContent is an instance field in SDK v2; a prototype patch would make real requests.
    require.cache[sdkPath].exports = { ...originalSdk, GoogleGenAI: class {
        constructor(options) {
            clientOptions = options;
            this.models = {
                generateContent: async args => { request = args; if (thrown) throw thrown; return response; },
                get: async args => { checkedModel = args.model; return { name: args.model }; }
            };
        }
    } };
    const shot = { id: 's', projectId: 'p', order: 1, title: 'Edited shot', camera: 'close-up',
        createAt: new Date(), updateAt: new Date(), payload: { image: 'data:image/png;base64,old', finalPrompt: 'Edited prompt', emotion: 'calm', custom: 'keep' } };
    const project = { id: 'p', authorId: 'u', ratio: '9:16', style: 'Watercolor' };
    const prismaPath = require.resolve('@prisma/client');
    const originalPrisma = require(prismaPath);
    require.cache[prismaPath].exports = { PrismaClient: class {
        constructor() {
            this.project = { findUnique: async () => project, update: async () => project };
            this.shot = { findUnique: async () => shot, update: async ({ data }) => { writes++; Object.assign(shot, data); return shot; } };
        }
    } };
    const app = require('../server');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = require('jsonwebtoken').sign({ id: 'u' }, process.env.JWT_SECRET);
    const post = async (url, body, cookie = '') => {
        const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Cookie: cookie }, body: JSON.stringify(body) });
        return { status: res.status, data: await res.json() };
    };
    const parts = values => ({ candidates: [{ content: { parts: values } }] });
    try {
        const creative = require('../public/js/features/creative-brief');
        const copilotInput = { story: '咖啡廳，明亮電影感，避免太暗', brief: creative.create('咖啡廳'), history: [], message: '', intent: 'start', autoRounds: 0, requestId: 'http-copilot', revision: 0 };
        response = parts([{ text: JSON.stringify({ action: 'ready', message: '用顧客入店的動作開始，保持明亮自然光。', briefPatch: { visualStyle: '明亮電影感', avoid: ['太暗'] } }) }]);
        const copilot = await post('/api/creation/copilot', copilotInput);
        assert.equal(copilot.status, 200);
        assert.equal(copilot.data.action, 'ready');
        assert.equal(request.model, getModel('creative'));
        assert.equal(request.config.thinkingConfig.thinkingLevel, 'MEDIUM');
        assert.equal(request.config.responseMimeType, 'application/json');
        assert.ok(request.config.responseJsonSchema.properties.form);
        assert.equal(clientOptions.vertexai, true);
        const unauthorized = await fetch(base + '/api/creation/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid' }, body: JSON.stringify(copilotInput) });
        assert.equal(unauthorized.status, 401);
        const oversized = await post('/api/creation/copilot', { ...copilotInput, story: 'a'.repeat(70000) });
        assert.equal(oversized.status, 413);
        response = parts([{ thought: true, text: 'Provider planning summary' }, { text: JSON.stringify({ meta: { title: 'POV' }, characters: [], shots: [] }) }]);
        const structured = await post('/api/ask-gemini', { type: 'story', question: 'POV without an on-screen observer', contract: 'freeform-v2', duration: 30, includeThoughts: true });
        assert.equal(structured.status, 200);
        assert.deepEqual(structured.data.thoughtSummaries, ['Provider planning summary']);
        assert.deepEqual(JSON.parse(structured.data.response).characters, []);
        assert.equal(request.config.responseJsonSchema.properties.characters.type, 'array');
        assert.ok(request.config.responseJsonSchema.properties.characters.items.required.includes('appearance'));
        assert.equal(request.config.thinkingConfig.includeThoughts, true);
        assert.equal((await post('/api/ask-gemini', { type: 'story', question: 'invalid', contract: 'freeform-v2', duration: 99 })).status, 400);
        for (const [type, task] of [['flash', 'fast'], ['story', 'story']]) {
            response = parts([{ thought: true, text: 'ignore this summary' }, { text: '{"shots":' }, { text: '[]}' }]);
            const result = await post('/api/ask-gemini', { type, question: 'plan', model: 'untrusted-client-model' });
            assert.equal(result.status, 200);
            assert.equal(request.model, getModel(task));
            assert.deepEqual(JSON.parse(result.data.response), { shots: [] });
            assert.deepEqual(result.data.image, []);
            assert.equal(result.data.usage.totalTokens, null);
        }
        response = parts([{ text: 'done' }, { inlineData: { mimeType: 'image/jpeg', data: 'new' } }]);
        const image = await post('/api/ask-gemini', { type: 'image', question: 'scene', ratio: '9:16' });
        assert.deepEqual(image.data.image, ['data:image/jpeg;base64,new']);
        assert.equal(request.model, getModel('image'));
        assert.equal(request.config.imageConfig.aspectRatio, '9:16');
        for (const key of ['temperature', 'topP', 'topK', 'seed']) assert.equal(request.config[key], undefined);
        const regen = await post('/api/projects/p/shots/s/regenerate', {});
        assert.equal(regen.status, 200);
        assert.equal(request.model, getModel('image'));
        assert.equal(request.contents[0].text, 'Edited prompt');
        assert.equal(shot.payload.image, image.data.image[0]);
        assert.equal(shot.payload.custom, 'keep');
        assert.equal(shot.payload.imageHistory[0].image, image.data.image[0]);
        assert.match(regen.data.shot.payload.image, /^\/api\/projects\/p\/shots\/s\/image\?v=/);
        response = parts([{ text: 'No image available' }]);
        const before = JSON.stringify(shot.payload), priorWrites = writes;
        assert.equal((await post('/api/projects/p/shots/s/regenerate', {})).data.code, 'AI_EMPTY_CONTENT');
        assert.equal(JSON.stringify(shot.payload), before);
        assert.equal(writes, priorWrites);
        assert.equal((await post('/api/ask-gemini', { type: 'image', question: 'scene' })).data.code, 'AI_EMPTY_CONTENT');

        response = parts([{ thought: true, text: 'hidden' }, { text: 'A cyclist, ' }, { text: 'soft cinematic morning light.' }]);
        const optimized = await post('/api/projects/p/shots/s/optimize-prompt', { cameraDetails: { lens: '50mm' } });
        assert.equal(optimized.data.prompt, 'A cyclist, soft cinematic morning light.');
        assert.equal(request.model, getModel('fast'));
        for (const value of ['Edited shot', 'close-up', '50mm', 'calm', 'Watercolor', '9:16']) assert.ok(request.contents[0].text.includes(value));
        response = parts([{ text: '```json\n{}\n```' }]);
        assert.equal((await post('/api/projects/p/shots/s/optimize-prompt', {})).data.code, 'AI_EMPTY_CONTENT');

        for (const [status, code] of [[403, 'AI_AUTH_PERMISSION'], [404, 'AI_MODEL_UNAVAILABLE'], [429, 'AI_RATE_LIMIT'], [503, 'AI_TEMPORARY_FAILURE']]) {
            thrown = Object.assign(new Error('private-key-secret-upstream'), { status });
            const failure = await post('/api/ask-gemini', { type: 'flash', question: 'test' });
            assert.equal(failure.data.code, code);
            assert.ok(!JSON.stringify(failure).includes('private-key-secret'));
        }
        thrown = undefined;
        const sections = Object.fromEntries(['setup', 'problem', 'solution', 'ending'].map(name => [name, { status: 'unknown', text: '無法觀察', timestamp: '00:00' }]));
        response = parts([{ thought: true, text: 'summary' }, { text: JSON.stringify({ sections }) }]);
        const analysis = await post('/api/discovery/analyze', { videoId: 'abcdefghijk', skill: 'short-video-template-lab' });
        assert.equal(analysis.status, 200);
        assert.equal(analysis.data.provider, 'vertex-ai');
        assert.equal(clientOptions.vertexai, true);
        assert.equal(clientOptions.location, 'global');
        assert.equal(request.model, getModel('discovery'));
        assert.equal(request.config.thinkingConfig.thinkingLevel, 'MEDIUM');
        assert.match(request.contents[0].parts[0].fileData.fileUri, /youtube.com/);
        const { ApiSettings } = require('../lib/discovery/api-settings');
        let cookie;
        new ApiSettings().write({ cookie: (name, value) => { cookie = `${name}=${value}`; } }, { geminiApiKey: 'fixture-developer-api-key-12345' }, false);
        const developer = await post('/api/discovery/analyze', { videoId: 'abcdefghijk', skill: 'short-video-template-lab' }, cookie);
        assert.equal(developer.data.provider, 'gemini-developer-api');
        assert.equal(checkedModel, getModel('discovery'));
        assert.equal(clientOptions.vertexai, false);
        assert.equal(clientOptions.project, undefined);
        assert.equal(clientOptions.googleAuthOptions, undefined);
    } finally {
        require.cache[sdkPath].exports = originalSdk;
        require.cache[prismaPath].exports = originalPrisma;
        await new Promise(resolve => server.close(resolve));
    }
});
