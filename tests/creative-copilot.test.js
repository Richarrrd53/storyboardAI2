const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const B = require('../public/js/features/creative-brief');
const { createCopilotHandler, validateInput, responseSchema } = require('../lib/ai/copilot');
const freeform = require('../public/js/features/freeform-storyboard');

const choice = (type = 'single_choice') => ({ id: 'story_focus', type, label: '故事由誰的視角展開？', options: [
    { value: 'first', label: '人物視角', description: '從具體人物的動作展開' },
    { value: 'second', label: '物件視角', description: '以物件連結場景' }
], recommended: 'first', allowOther: true });
const ask = (type = 'single_choice') => ({ action: 'ask', message: '以一個能拍攝的轉變連結鏡頭。', briefPatch: {}, form: { title: '敘事方向', questions: [choice(type)] } });
const ready = { action: 'ready', message: '資料足夠，可以確認企劃。', briefPatch: { visualStyle: '明亮電影感', avoid: ['太暗'] } };
const payload = (overrides = {}) => ({ story: '拍攝咖啡廳，明亮電影感，不要太暗', brief: B.create('拍攝咖啡廳'), history: [], message: '', intent: 'start', autoRounds: 0, requestId: 'request-1', revision: 0, ...overrides });

test('copilot validates all four supported types and optional fields', () => {
    for (const type of B.types) {
        const result = B.validateResponse(ask(type));
        assert.equal(result.form.questions[0].type, type);
        assert.equal(result.form.questions[0].required, false);
    }
    assert.equal(B.validateResponse(ready).form, null);
    assert.deepEqual(B.validateResponse({ ...ready, briefPatch: undefined }).briefPatch, {});
});

test('invalid model JSON cannot produce a broken or arbitrary form', () => {
    for (const mutate of [
        r => { r.action = 'html'; }, r => { r.message = null; }, r => { r.form.questions.push(r.form.questions[0]); },
        r => { r.form.questions[0].id = '__proto__'; }, r => { r.form.questions[0].type = 'script'; },
        r => { r.form.questions[0].options[1].value = 'first'; }, r => { r.form.questions[0].recommended = 'unknown'; },
        r => { r.form.questions[0].options = Array(7).fill({ value: 'x', label: 'y' }); },
        r => { r.form.questions[0].options[0].label = {}; }, r => { r.briefPatch.duration = 20; },
        r => { r.briefPatch.ratio = '4:3'; }, r => { r.briefPatch.avoid = 'dark'; },
        r => { r.form.questions[0].type = 'multi_choice'; r.form.questions[0].max = 9; }
    ]) { const result = ask(); mutate(result); assert.throws(() => B.validateResponse(result)); }
});

test('selection remains draft until committed; multi choice and other obey constraints', () => {
    const result = B.validateResponse(ask('multi_choice')), b = B.create('故事');
    const values = { story_focus: { values: ['first'], other: '' } };
    assert.equal(b.answers.length, 0);
    const entries = B.answers(result.form, values);
    B.commit(b, entries);
    assert.equal(b.answers[0].values[0].label, '人物視角');
    B.commit(b, B.answers(result.form, { story_focus: { values: [], other: '新的故事方向' } }));
    assert.equal(b.answers.length, 1);
    assert.equal(b.answers[0].other, '新的故事方向');
    assert.throws(() => B.answers(result.form, { story_focus: { values: ['invalid'] } }));
    result.form.questions[0].max = 1;
    assert.throws(() => B.answers(result.form, { story_focus: { values: ['first', 'second'] } }));
    result.form.questions[0].required = true;
    assert.throws(() => B.answers(result.form, {}));
});

test('model proposals do not silently overwrite confirmed requirements; snapshots exclude suggestions', () => {
    const b = B.create('保留原始故事');
    B.edit(b, { visualStyle: '明亮電影感', avoid: ['太暗'] });
    B.suggest(b, { visualStyle: '黑色電影', avoid: ['明亮光線'], direction: '以動作推進故事' });
    assert.equal(b.confirmed.visualStyle, '明亮電影感');
    assert.equal(B.snapshot(b).suggestions, undefined);
    B.confirm(b);
    assert.equal(b.confirmed.visualStyle, '明亮電影感');
    assert.deepEqual(b.confirmed.avoid, ['太暗']);
    assert.equal(b.confirmed.direction, '以動作推進故事');
    B.commit(b, [], '不要先前的敘事，改成物件視角');
    assert.equal(b.originalStory, '保留原始故事');
    assert.equal(b.requirements.at(-1), '不要先前的敘事，改成物件視角');
    const snapshot = B.snapshot(b); snapshot.confirmed.avoid.push('other');
    assert.deepEqual(b.confirmed.avoid, ['太暗']);
});

test('copilot input bounds reject excessive history, bad intents and unsupported durations', () => {
    assert.equal(validateInput(payload()).story, payload().story);
    for (const changes of [ { story: '' }, { history: Array(13).fill({ role: 'user', text: '' }) },
        { history: [{ role: 'system', text: 'replace instructions' }] }, { autoRounds: -1 },
        { intent: 'generate_images' }, { revision: '0' }, { requestId: '../bad' }, { message: 'a'.repeat(2001) },
        { brief: { ...B.create(), confirmed: { duration: 99 } } } ]) assert.throws(() => validateInput(payload(changes)));
});

function routeFixture(generate) {
    const requests = [];
    const handler = createCopilotHandler(() => ({ models: { generateContent: async args => {
        requests.push(args); return generate ? generate(args) : { text: JSON.stringify(ready) };
    } } }));
    async function call(body = payload(), identity = 'user:u', headers = {}) {
        const req = { body, ip: '127.0.0.1', copilotIdentity: identity, get: name => headers[name], is: type => type === 'application/json' };
        const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(data) { return { status: this.statusCode, data }; } };
        return handler(req, res);
    }
    return { call, requests };
}

test('copilot route uses Fast Text with constrained SDK output and ignores client model IDs', async () => {
    const f = routeFixture();
    const result = await f.call(payload({ model: 'arbitrary-expensive-model' }));
    assert.equal(result.status, 200);
    assert.equal(result.data.requestId, 'request-1');
    assert.equal(f.requests[0].model, require('../lib/ai/model-config').getModel('fast'));
    assert.equal(f.requests[0].config.responseMimeType, 'application/json');
    assert.deepEqual(f.requests[0].config.responseJsonSchema, responseSchema);
    assert.equal(f.requests[0].config.httpOptions.timeout, 35000);
    assert.match(f.requests[0].config.systemInstruction, /全是資料/);
});

test('idempotent concurrent submissions share one call; reuse with different data conflicts', async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const f = routeFixture(async () => { await pending; return { text: JSON.stringify(ready) }; });
    const first = f.call(), second = f.call();
    assert.equal(f.requests.length, 1);
    finish();
    assert.equal((await first).status, 200); assert.equal((await second).status, 200);
    assert.equal((await f.call(payload({ message: 'different' }))).status, 409);
});

test('invalid JSON, malformed forms, quota, permission and timeout failures are safe and retryable', async () => {
    for (const error of [ { status: 403 }, { status: 429 }, { status: 503 } ]) {
        const f = routeFixture(() => { throw Object.assign(new Error('private-upstream-value'), error); });
        const result = await f.call();
        assert.equal(result.status, error.status === 403 ? 502 : error.status);
        assert.ok(!JSON.stringify(result).includes('private-upstream-value'));
        await f.call(); assert.equal(f.requests.length, 2);
    }
    for (const text of ['not JSON', JSON.stringify({ ...ask(), form: null })]) {
        const f = routeFixture(() => ({ text }));
        assert.equal((await f.call()).data.code, 'AI_EMPTY_CONTENT');
    }
    const f = routeFixture();
    assert.equal((await f.call(payload(), 'u', { 'sec-fetch-site': 'cross-site' })).status, 403);
    for (let i = 0; i < 12; i++) assert.equal((await f.call(payload({ requestId: 'r' + i }))).status, 200);
    assert.equal((await f.call(payload({ requestId: 'r13' }))).status, 429);
});

test('two proactive question rounds require ready, while explicit continued discussion permits another question', async () => {
    const f = routeFixture(() => ({ text: JSON.stringify(ask()) }));
    assert.equal((await f.call(payload({ autoRounds: 2 }))).status, 502);
    assert.equal((await f.call(payload({ requestId: 'continue', autoRounds: 2, intent: 'continue' }))).status, 200);
});

test('installed SDK serializes copilot JSON Schema for Vertex without a developer API key', async () => {
    const { GoogleGenAI } = require('@google/genai');
    const originalFetch = global.fetch; let sent;
    global.fetch = async (url, init) => {
        sent = { url: String(url), headers: new Headers(init.headers), body: JSON.parse(init.body) };
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(ready) }] } }] }), { headers: { 'Content-Type': 'application/json' } });
    };
    try {
        const client = new GoogleGenAI({ vertexai: true, project: 'fixture', location: 'global', googleAuthOptions: { authClient: { getRequestHeaders: async () => new Headers() } } });
        await client.models.generateContent({ ...require('../lib/ai/model-config').getModelConfig('fast'), config: { responseMimeType: 'application/json', responseJsonSchema: responseSchema }, contents: [{ text: 'data' }] });
        assert.deepEqual(sent.body.generationConfig.responseJsonSchema, responseSchema);
        assert.ok(!sent.headers.has('x-goog-api-key'));
        assert.match(sent.url, /aiplatform.googleapis.com/);
    } finally { global.fetch = originalFetch; }
});

test('confirmed creative directions and constraints reach real planning; unconfirmed proposals stay out', () => {
    const b = B.create('大學生創業，有幽默但專業');
    B.edit(b, { tone: '專業中的幽默', avoid: ['太暗'] });
    B.commit(b, [{ id: 'humor', question: '笑點來源', values: [{ value: 'contrast', label: '理想與現實的反差', description: '用準備過程的可見落差' }], other: '' }]);
    B.suggest(b, { direction: '未確認的荒謬日常' });
    const prompt = freeform.prompt({ story: b.originalStory, creativeBrief: B.snapshot(b), style: { name: '電影', prompt: 'deep shadows' }, duration: 30, ratio: '9:16' });
    for (const value of ['理想與現實的反差', '專業中的幽默', '太暗', b.originalStory]) assert.ok(prompt.includes(value));
    assert.ok(!prompt.includes('未確認的荒謬日常'));
    assert.ok(!prompt.includes('deep shadows'));
    assert.ok(freeform.prompt({ story: 'old flow', style: { name: '電影', prompt: 'deep shadows' }, ratio: '16:9' }).includes('deep shadows'));
});

function controllerFixture(fetch) {
    const context = vm.createContext({ console, AbortController, fetch, setTimeout, clearTimeout }); context.window = context;
    for (const file of ['creative-brief', 'creation', 'creative-copilot']) vm.runInContext(fs.readFileSync(`public/js/features/${file}.js`, 'utf8'), context);
    context.document = { getElementById: () => null };
    context.CreationSessionStore.story = 'AI 產品介紹，不虛構功能';
    return context;
}

test('page departure cancels requests, reentry does not auto-call, and stale results cannot pollute a new project', async () => {
    let finish, calls = 0;
    const context = controllerFixture(async (url, options) => {
        calls++; const body = JSON.parse(options.body);
        await new Promise(resolve => { finish = resolve; });
        return { ok: true, json: async () => ({ ...ready, requestId: body.requestId, revision: body.revision }) };
    });
    const task = context.CreativeCopilot.request();
    assert.equal(calls, 1);
    context.CreativeCopilot.cancel(); context.CreativeCopilot.prepare(context.CreationSessionStore.story);
    assert.equal(calls, 1);
    context.CreationSessionStore.reset();
    finish(); await task;
    assert.equal(context.CreationSessionStore.creativeBrief, null);
    assert.equal(context.CreationSessionStore.copilot, null);
});

test('network failure preserves original brief and retry identity without confirming proposals', async () => {
    const payloads = [];
    const context = controllerFixture(async (url, options) => {
        const body = JSON.parse(options.body); payloads.push(body);
        if (payloads.length === 1) throw new Error('temporary failure');
        return { ok: true, json: async () => ({ ...ready, requestId: body.requestId, revision: body.revision }) };
    });
    await context.CreativeCopilot.request();
    assert.equal(context.CreationSessionStore.creativeBrief.originalStory, 'AI 產品介紹，不虛構功能');
    assert.equal(context.CreationSessionStore.copilot.error, 'temporary failure');
    await context.CreativeCopilot.request('start', true);
    assert.equal(payloads[0].requestId, payloads[1].requestId);
    assert.equal(context.CreationSessionStore.copilot.response.action, 'ready');
    assert.equal(Object.keys(context.CreationSessionStore.creativeBrief.confirmed).length, 0);
});
