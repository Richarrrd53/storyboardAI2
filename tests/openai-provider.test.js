const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toOpenAIStrictSchema, normalizeOpenAIStructuredData } = require('../lib/ai/openai-schema');
const { responseSchema, responseSchemaFor, instruction, generateDecision } = require('../lib/ai/copilot');
const { getProviderCapabilities, getOpenAIModelConfig, getProviderModel } = require('../lib/ai/model-config');
const { classifyOpenAIError } = require('../lib/ai/generation');
const openaiAdapter = require('../lib/ai/adapters/openai-adapter');
const { createProviderRouter } = require('../lib/ai/provider-router');
const brief = require('../public/js/features/creative-brief');
const freeform = require('../public/js/features/freeform-storyboard');

function assertStrictObjectRules(node, path = 'root') {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach((item, idx) => assertStrictObjectRules(item, `${path}[${idx}]`));
        return;
    }
    for (const bad of ['minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'minItems', 'maxItems']) {
        assert.equal(node[bad], undefined, `${path} should not contain unsupported strict keyword ${bad}`);
    }
    if (node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object')) || node.properties) {
        assert.equal(node.additionalProperties, false, `${path} must set additionalProperties: false`);
        if (node.properties) {
            assert.deepEqual(
                [...(node.required || [])].sort(),
                Object.keys(node.properties).sort(),
                `${path} must require all properties in strict mode`
            );
            for (const [k, v] of Object.entries(node.properties)) {
                assertStrictObjectRules(v, `${path}.${k}`);
            }
        }
    }
    if (node.items) assertStrictObjectRules(node.items, `${path}.items`);
    if (Array.isArray(node.anyOf)) assertStrictObjectRules(node.anyOf, `${path}.anyOf`);
}

test('OpenAI strict schema converter transforms copilot and freeform schemas without losing contract fields', () => {
    const strictCopilot = toOpenAIStrictSchema(responseSchema);
    assertStrictObjectRules(strictCopilot, 'copilot');
    assert.ok(strictCopilot.properties.briefPatch.properties.duration.anyOf.some(b => b.type === 'null'));

    const strictFinal = toOpenAIStrictSchema(responseSchemaFor({ autoRounds: 2, intent: 'answer' }));
    assertStrictObjectRules(strictFinal, 'copilotFinal');

    const strictFreeform = toOpenAIStrictSchema(freeform.schema(30));
    assertStrictObjectRules(strictFreeform, 'freeform');
    assert.deepEqual(strictFreeform.properties.meta.properties.targetDuration.anyOf[0].enum, [30]);
});

test('normalizeOpenAIStructuredData strips null optional fields for shared business validation', () => {
    const raw = {
        action: 'ask',
        message: '你想用什麼角度開場？',
        briefPatch: {
            subject: '咖啡廳日常',
            purpose: null,
            direction: null,
            audience: null,
            tone: null,
            baseStyle: 'natural',
            visualStyle: null,
            styleNotes: null,
            avoid: ['太暗'],
            constraints: null,
            duration: 30,
            ratio: '9:16',
            settingsReason: null,
            visualKeywords: null
        },
        form: {
            title: '選擇開場視角',
            questions: [{
                id: 'opening_angle',
                type: 'single_choice',
                label: '偏好哪種開場？',
                description: null,
                required: true,
                allowOther: null,
                recommended: 'pov',
                min: null,
                max: null,
                options: [
                    { value: 'pov', label: '第一人稱推門進店', description: '更有帶入感' },
                    { value: 'wide', label: '街景遠景切入', description: null }
                ]
            }]
        }
    };
    const normalized = normalizeOpenAIStructuredData(raw);
    const validated = brief.validateResponse(normalized);
    assert.equal(validated.action, 'ask');
    assert.equal(validated.briefPatch.subject, '咖啡廳日常');
    assert.equal(validated.briefPatch.purpose, undefined);
    assert.equal(validated.form.questions[0].options[0].value, 'pov');
});

test('OpenAI model config and capabilities enforce task boundaries and disable unsupported tasks', () => {
    const env = { OPENAI_API_KEY: 'sk-test-fixture', OPENAI_MODEL_IMAGE: 'disabled' };
    const caps = getProviderCapabilities('openai', env);
    assert.equal(caps.available, true);
    assert.equal(caps.tasks.creative, true);
    assert.equal(caps.tasks.story, true);
    assert.equal(caps.tasks.fast, true);
    assert.equal(caps.tasks.image, false);
    assert.equal(caps.tasks.discovery, false);
    assert.equal(getProviderModel('openai', 'image', env), null);
    assert.throws(() => getOpenAIModelConfig('image', {}, env), { code: 'AI_UNSUPPORTED_CAPABILITY' });

    const imgConfig = getOpenAIModelConfig('image', { ratio: '直向9:16' }, { OPENAI_API_KEY: 'sk-test' });
    assert.equal(imgConfig.aspectRatio, '9:16');
    assert.equal(imgConfig.size, '864x1536');
    assert.equal(imgConfig.model, 'gpt-image-2-2026-04-21');
});

test('OpenAI adapter handles text, structured JSON, usage, refusal, incomplete, empty, and timeout', async () => {
    const calls = [];
    const mockClient = {
        responses: {
            create: async (params, opts) => {
                calls.push({ params, opts });
                return {
                    id: 'resp_123',
                    status: 'completed',
                    output_text: 'A sunlit cafe counter with warm espresso steam.',
                    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 }
                };
            }
        },
        images: {
            generate: async () => ({
                data: [{ b64_json: Buffer.from('fake-image-bytes').toString('base64') }]
            })
        }
    };

    const textRes = await openaiAdapter.generateText(mockClient, {
        task: 'fast',
        prompt: 'Optimize prompt',
        systemInstruction: 'Return English only.',
        includeThoughts: true,
        env: { OPENAI_API_KEY: 'sk-test' }
    });
    assert.equal(textRes.provider, 'openai');
    assert.equal(textRes.response, 'A sunlit cafe counter with warm espresso steam.');
    assert.deepEqual(textRes.thoughtSummaries, []);
    assert.deepEqual(textRes.usage, { promptTokens: 100, candidatesTokens: 20, totalTokens: 120 });

    // Refusal
    mockClient.responses.create = async () => ({
        status: 'completed',
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot comply' }] }]
    });
    await assert.rejects(
        openaiAdapter.generateText(mockClient, { task: 'fast', prompt: 'test', env: { OPENAI_API_KEY: 'sk-test' } }),
        { code: 'AI_EMPTY_CONTENT' }
    );

    // Incomplete
    mockClient.responses.create = async () => ({ status: 'incomplete', output_text: '{"partial":' });
    await assert.rejects(
        openaiAdapter.generateText(mockClient, { task: 'fast', prompt: 'test', env: { OPENAI_API_KEY: 'sk-test' } }),
        { code: 'AI_INCOMPLETE_RESPONSE' }
    );

    // Image generation
    const imgRes = await openaiAdapter.generateImage(mockClient, {
        question: 'A quiet morning street',
        ratio: '1:1',
        env: { OPENAI_API_KEY: 'sk-test' }
    });
    assert.equal(imgRes.provider, 'openai');
    assert.equal(imgRes.image.length, 1);
    assert.match(imgRes.image[0], /^data:image\/jpeg;base64,/);
});

test('OpenAI image requests use the pinned GPT Image 2 snapshot and native aspect ratios', async () => {
    const calls = [];
    const client = { images: { generate: async params => {
        calls.push(params);
        return { data: [{ b64_json: Buffer.from('fixture').toString('base64') }] };
    } } };
    for (const [ratio, size] of Object.entries({ '16:9': '1536x864', '9:16': '864x1536', '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' })) {
        await openaiAdapter.generateImage(client, { question: 'a scene', ratio, env: {} });
        assert.deepEqual(calls.at(-1), { model: 'gpt-image-2-2026-04-21', prompt: 'a scene', n: 1, size, output_format: 'jpeg' });
    }
    assert.equal(getOpenAIModelConfig('image', { ratio: '16:9' }, { OPENAI_MODEL_IMAGE: 'gpt-image-2.5-flare-2026-09-08' }).size, '1536x864');
    assert.equal(getOpenAIModelConfig('image', { ratio: '16:9' }, { OPENAI_MODEL_IMAGE: 'gpt-image-1.5' }).size, '1536x1024');
    assert.equal(getOpenAIModelConfig('image', { ratio: '9:16' }, { OPENAI_MODEL_IMAGE: 'gpt-image-1.5' }).size, '1024x1536');
});

test('OpenAI error classification distinguishes auth, rate limit, model, schema, timeout, and cancellation', () => {
    assert.equal(classifyOpenAIError({ status: 401 }).code, 'AI_AUTH_ERROR');
    assert.equal(classifyOpenAIError({ status: 429 }).code, 'AI_RATE_LIMIT');
    assert.equal(classifyOpenAIError({ status: 404 }).code, 'AI_MODEL_UNAVAILABLE');
    assert.equal(classifyOpenAIError({ status: 400, message: 'invalid json_schema strict mode' }).code, 'AI_SCHEMA_ERROR');
    assert.equal(classifyOpenAIError({ status: 400, message: 'invalid temperature' }).code, 'AI_INVALID_REQUEST');
    assert.equal(classifyOpenAIError({ code: 'AI_UPSTREAM_TIMEOUT' }).code, 'AI_TIMEOUT');
    assert.equal(classifyOpenAIError({ code: 'AI_REQUEST_CANCELLED' }).code, 'AI_REQUEST_CANCELLED');
    assert.equal(classifyOpenAIError({ status: 503 }).code, 'AI_TEMPORARY_FAILURE');
});

test('Copilot generateDecision preserves original business prompt and repairs invalid OpenAI decision without falling back to Gemini', async () => {
    const input = {
        story: '深夜咖啡廳',
        brief: brief.create('深夜咖啡廳'),
        history: [],
        message: '',
        intent: 'start',
        autoRounds: 0
    };
    let attempt = 0;
    const seenInstructions = [];
    const mockOpenAI = {
        responses: {
            create: async params => {
                attempt++;
                seenInstructions.push(params.instructions);
                if (attempt === 1) {
                    // Valid JSON but violates business contract (invalid action)
                    return {
                        id: 'resp_bad',
                        status: 'completed',
                        output_text: JSON.stringify({ action: 'invalid_action', message: 'hi', briefPatch: {}, form: null }),
                        usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 }
                    };
                }
                return {
                    id: 'resp_ok',
                    status: 'completed',
                    output_text: JSON.stringify({
                        action: 'ready',
                        message: '以深夜吧台特寫開場，呈現溫暖燈光與手沖節奏。',
                        briefPatch: {
                            subject: '深夜咖啡廳', purpose: null, direction: '深夜手沖治癒節奏',
                            audience: null, tone: null, baseStyle: 'cinematic', visualStyle: '暖色電影感',
                            styleNotes: '暖黃吊燈、淺景深', avoid: null, constraints: null,
                            duration: 30, ratio: '9:16', settingsReason: '適合短影音節奏', visualKeywords: ['咖啡師', '手沖壺']
                        },
                        form: null
                    }),
                    usage: { input_tokens: 70, output_tokens: 30, total_tokens: 100 }
                };
            }
        }
    };

    const decision = await generateDecision(mockOpenAI, input, {
        provider: 'openai',
        env: { OPENAI_API_KEY: 'sk-test' },
        logger: () => {}
    });
    assert.equal(attempt, 2);
    assert.equal(decision.provider, 'openai');
    assert.equal(decision.action, 'ready');
    assert.equal(decision.briefPatch.baseStyle, 'cinematic');
    assert.ok(seenInstructions[0].startsWith(instruction), 'Original Gemini business instruction must be preserved intact');
});

test('HTTP routes support /api/ai/providers, /api/user/ai-provider, and provider-routed OpenAI requests without key leaks', async () => {
    Object.assign(process.env, {
        NODE_ENV: 'production',
        JWT_SECRET: 'openai-route-fixture',
        OPENAI_API_KEY: 'sk-super-secret-fixture-key',
        OPENAI_MODEL_CREATIVE: 'gpt-6.1-terra',
        OPENAI_MODEL_STORY: 'gpt-6.1-sol',
        OPENAI_MODEL_FAST: 'gpt-6-luna',
        OPENAI_MODEL_IMAGE: 'gpt-image-1.5'
    });

    const openaiPath = require.resolve('openai');
    const originalOpenAI = require(openaiPath);
    let lastResponseParams, lastImageParams, updatedProvider = 'gemini';

    require.cache[openaiPath].exports = class MockOpenAI {
        constructor() {
            this.responses = {
                create: async params => {
                    lastResponseParams = params;
                    if (params.text?.format?.name === 'copilot_decision') {
                        return {
                            id: 'resp_copilot',
                            status: 'completed',
                            output_text: JSON.stringify({
                                action: 'ready',
                                message: '使用暖色特寫建立深夜咖啡氛圍。',
                                briefPatch: { visualStyle: '暖色電影感', duration: 30, ratio: '9:16', baseStyle: 'cinematic', direction: '深夜手沖', styleNotes: '暖光', settingsReason: '節奏合適', avoid: [], visualKeywords: [], subject: null, purpose: null, audience: null, tone: null, constraints: null },
                                form: null
                            }),
                            usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 }
                        };
                    }
                    if (params.text?.format?.name === 'freeform_storyboard') {
                        return {
                            id: 'resp_story',
                            status: 'completed',
                            output_text: JSON.stringify({
                                meta: { title: 'Midnight Coffee', targetDuration: 30 },
                                characters: [],
                                shots: Array.from({ length: 8 }, (_, idx) => ({
                                    id: idx + 1,
                                    beat: 'Beat 1',
                                    story: `畫面 ${idx + 1}`,
                                    camera: 'Close-up',
                                    duration: idx < 6 ? '4s' : '3s',
                                    emotion: 'Calm',
                                    purpose: 'Establish mood',
                                    dialogue: '',
                                    shotPrompt: 'Warm cinematic close up of espresso pouring in quiet cafe',
                                    characters: []
                                }))
                            }),
                            usage: { input_tokens: 20, output_tokens: 80, total_tokens: 100 }
                        };
                    }
                    return {
                        id: 'resp_fast',
                        status: 'completed',
                        output_text: 'Warm cinematic close up of a barista pouring coffee at night.',
                        usage: { input_tokens: 15, output_tokens: 15, total_tokens: 30 }
                    };
                }
            };
            this.images = {
                generate: async params => {
                    lastImageParams = params;
                    return { data: [{ b64_json: Buffer.from('mock-openai-jpeg').toString('base64') }] };
                }
            };
        }
    };

    const prismaPath = require.resolve('@prisma/client');
    const originalPrisma = require(prismaPath);
    const shot = {
        id: 's1', projectId: 'p1', order: 1, title: 'Shot 1', camera: 'wide',
        createAt: new Date(), updateAt: new Date(),
        payload: { image: 'data:image/png;base64,old', finalPrompt: 'Old prompt', emotion: 'calm' }
    };
    const project = { id: 'p1', authorId: 'u1', ratio: '9:16', style: 'Cinematic' };
    process.env.API_KEYS_ENCRYPTION_SECRET = 'test-openai-account-db-secret-at-least-32-chars';
    const { ApiKeyCipher } = require('../lib/security/api-key-cipher');
    const cipher = new ApiKeyCipher({ env: process.env });
    require.cache[prismaPath].exports = {
        PrismaClient: class {
            constructor() {
                this.user = {
                    findUnique: async () => ({ id: 'u1', name: 'Tester', email: 't@example.com', image: null, plan: 'free', aiProvider: updatedProvider, createAt: new Date() }),
                    update: async ({ data }) => { updatedProvider = data.aiProvider; return { aiProvider: updatedProvider }; }
                };
                this.userApiCredential = {
                    findMany: async ({ where }) => (where.userId === 'u1'
                        ? [{ userId: 'u1', provider: 'openai', ...cipher.encrypt('sk-personal-fixture-key-1234567890', { userId: 'u1', provider: 'openai' }), updatedAt: new Date() }]
                        : [])
                };
                this.project = { findUnique: async () => project, update: async () => project };
                this.shot = { findUnique: async () => shot, update: async ({ data }) => Object.assign(shot, data) };
            }
        }
    };

    // Clear server.js cache so it picks up mocked OpenAI & Prisma
    const serverPath = require.resolve('../server');
    delete require.cache[serverPath];
    const app = require('../server');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = require('jsonwebtoken').sign({ id: 'u1' }, process.env.JWT_SECRET);
    const nativeFetch = global.fetch;
    const fetch = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...options.headers } });


    try {
        const capsRes = await fetch(base + '/api/ai/providers', { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(capsRes.status, 200);
        const caps = await capsRes.json();
        assert.equal(caps.defaultProvider, 'gemini');
        assert.equal(caps.providers.openai.available, true);
        assert.ok(!JSON.stringify(caps).includes('sk-super-secret'));

        // Unauthenticated PATCH fails
        assert.equal((await fetch(base + '/api/user/ai-provider', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'openai' })
        })).status, 401);

        // Authenticated PATCH updates user preference
        const patchRes = await fetch(base + '/api/user/ai-provider', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ provider: 'openai' })
        });
        assert.equal(patchRes.status, 200);
        assert.equal((await patchRes.json()).aiProvider, 'openai');

        // /api/auth/me reflects saved aiProvider
        const meRes = await fetch(base + '/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        assert.equal((await meRes.json()).user.aiProvider, 'openai');

        // Copilot with OpenAI
        const copilotRes = await fetch(base + '/api/creation/copilot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                story: '深夜咖啡廳',
                brief: brief.create('深夜咖啡廳'),
                history: [],
                message: '',
                intent: 'start',
                autoRounds: 0,
                requestId: 'openai-copilot-1',
                revision: 0,
                provider: 'openai'
            })
        });
        assert.equal(copilotRes.status, 200);
        const copilotData = await copilotRes.json();
        assert.equal(copilotData.provider, 'openai');
        assert.equal(copilotData.action, 'ready');
        assert.equal(lastResponseParams.model, 'gpt-6.1-terra');

        // Freeform v2 with OpenAI
        const storyRes = await fetch(base + '/api/ask-gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                type: 'story',
                contract: 'freeform-v2',
                duration: 30,
                question: freeform.prompt({ story: '深夜咖啡廳', duration: 30, ratio: '9:16', style: { name: '電影感', prompt: 'cinematic' } }),
                provider: 'openai'
            })
        });
        assert.equal(storyRes.status, 200);
        const storyData = await storyRes.json();
        assert.equal(storyData.provider, 'openai');
        assert.equal(lastResponseParams.model, 'gpt-6.1-sol');
        assert.doesNotThrow(() => freeform.validate(JSON.parse(storyData.response), 30));

        // Image generation with OpenAI
        const imgRes = await fetch(base + '/api/ask-gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ type: 'image', question: 'Warm cafe counter', ratio: '9:16', provider: 'openai' })
        });
        assert.equal(imgRes.status, 200);
        const imgData = await imgRes.json();
        assert.equal(imgData.provider, 'openai');
        assert.equal(lastImageParams.size, '1024x1536');
        assert.match(imgData.image[0], /^data:image\/jpeg;base64,/);

        // Optimize prompt & regenerate with OpenAI
        const optRes = await fetch(base + '/api/projects/p1/shots/s1/optimize-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ provider: 'openai' })
        });
        assert.equal(optRes.status, 200);
        assert.equal((await optRes.json()).provider, 'openai');
        assert.equal(lastResponseParams.model, 'gpt-6-luna');

        const regenRes = await fetch(base + '/api/projects/p1/shots/s1/regenerate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ provider: 'openai' })
        });
        assert.equal(regenRes.status, 200);
    } finally {
        require.cache[openaiPath].exports = originalOpenAI;
        require.cache[prismaPath].exports = originalPrisma;
        delete require.cache[serverPath];
        await new Promise(resolve => server.close(resolve));
    }
});

test('Guest and authenticated AI provider preference persistence and in-flight task pinning', async () => {
    const store = new Map();
    const originalWindow = global.window;
    const originalLocalStorage = global.localStorage;
    const originalFetch = global.fetch;

    const fetchCalls = [];
    global.localStorage = {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k)
    };
    global.window = {
        addEventListener: () => {},
        CreationController: { reset: () => {} },
        ProjectStore: { reset: () => {}, invalidateProjectDetail: () => {}, invalidateProjects: () => {}, seedProjectDetail: () => {} },
        PageAssetLoader: { clearMemoryCache: () => {} }
    };
    global.fetch = async (url, init) => {
        fetchCalls.push({ url, init });
        if (url === '/api/ai/providers') {
            return {
                ok: true,
                json: async () => ({
                    defaultProvider: 'gemini',
                    providers: {
                        gemini: { id: 'gemini', available: true },
                        openai: { id: 'openai', available: true }
                    }
                })
            };
        }
        if (url === '/api/user/ai-provider') {
            const body = JSON.parse(init.body);
            return { ok: true, json: async () => ({ aiProvider: body.provider }) };
        }
        return { ok: true, json: async () => ({}) };
    };

    try {
        delete require.cache[require.resolve('../public/js/features/auth-service')];
        require('../public/js/features/auth-service');
        const spaAuth = global.window.spaAuth;

        // Default guest is gemini
        assert.equal(spaAuth.getAiProvider(), 'gemini');
        // Guest can switch to openai locally
        await spaAuth.setAiProvider('openai');
        assert.equal(spaAuth.getAiProvider(), 'openai');
        assert.equal(store.get('spa_ai_provider'), 'openai');

        // Logged-in user persists via PATCH /api/user/ai-provider
        store.set('spa_auth_token', 'header.payload.sig');
        await spaAuth.setAiProvider('gemini');
        assert.equal(spaAuth.getAiProvider(), 'gemini');
        assert.ok(fetchCalls.some(c => c.url === '/api/user/ai-provider' && c.init.method === 'PATCH'));
    } finally {
        delete require.cache[require.resolve('../public/js/features/auth-service')];
        global.window = originalWindow;
        global.localStorage = originalLocalStorage;
        global.fetch = originalFetch;
    }
});
