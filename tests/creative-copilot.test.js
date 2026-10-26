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
    } } }), { logger() {} });
    async function call(body = payload(), identity = 'user:u', headers = {}) {
        const req = { body, ip: '127.0.0.1', copilotIdentity: identity, get: name => headers[name], is: type => type === 'application/json' };
        const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(data) { return { status: this.statusCode, data }; } };
        return handler(req, res);
    }
    return { call, requests };
}

test('Ask Gemini uses the creative task with constrained SDK output and ignores client model IDs', async () => {
    const f = routeFixture();
    const result = await f.call(payload({ model: 'arbitrary-expensive-model' }));
    assert.equal(result.status, 200);
    assert.equal(result.data.requestId, 'request-1');
    assert.equal(f.requests[0].model, require('../lib/ai/model-config').getModel('creative'));
    assert.equal(f.requests[0].config.thinkingConfig.thinkingLevel, 'MEDIUM');
    assert.equal(f.requests[0].config.responseMimeType, 'application/json');
    assert.deepEqual(f.requests[0].config.responseJsonSchema, responseSchema);
    assert.equal(f.requests[0].config.httpOptions.timeout, 70000, 'SDK upstream deadline includes grace; the application independently limits this inference to 60 seconds');
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
        await f.call(); assert.equal(f.requests.length, error.status === 503 ? 4 : 2);
    }
    for (const text of ['not JSON', JSON.stringify({ ...ask(), form: null })]) {
        const f = routeFixture(() => ({ text }));
        assert.equal((await f.call()).data.code, 'AI_INVALID_RESPONSE');
        assert.equal(f.requests.length, 2, 'invalid returned content gets at most one real-model repair');
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

test('network failure preserves original brief; successful ready retry accepts recommendations automatically', async () => {
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
    assert.equal(context.CreationSessionStore.creativeBrief.confirmed.visualStyle, '明亮電影感');
});

test('ready settings use stable style IDs; explicit ratio wins over AI and defaults', () => {
    const b = B.create('做一支 16:9 YouTube 影片，30 秒');
    assert.equal(b.confirmed.ratio, '16:9');
    B.suggest(b, { baseStyle: 'cinematic', styleNotes: '明亮自然光', ratio: '9:16', duration: 60, visualKeywords: ['咖啡師', '窗邊'] });
    B.confirm(b);
    assert.equal(b.confirmed.ratio, '16:9'); assert.equal(b.confirmed.duration, 30);
    assert.equal(b.confirmed.baseStyle, 'cinematic');
    B.edit(b, { baseStyle: 'watercolor' });
    assert.equal(b.confirmed.styleNotes, '明亮自然光');
    B.suggest(b, { baseStyle: 'natural', direction: '用物件的動作推進' }); B.confirm(b);
    assert.equal(b.confirmed.baseStyle, 'watercolor');
    B.commit(b, [], '改為 9:16、45 秒');
    assert.equal(b.confirmed.ratio, '9:16'); assert.equal(b.confirmed.duration, 45);
    assert.equal(b.confirmed.visualKeywords, undefined);
    assert.throws(() => B.patch({ baseStyle: 'imaginary' }));
    assert.throws(() => B.patch({ visualKeywords: ['a'] }));
});

test('three-plus-other is bounded and a hidden other draft is not submitted', () => {
    const form = B.validateResponse(ask()).form;
    const entries = B.answers(form, { story_focus: { values: ['first'], other: '保留草稿', otherActive: false } });
    assert.equal(entries[0].other, '');
    assert.throws(() => B.answers(form, { story_focus: { values: ['first'], other: '衝突的單選', otherActive: true } }));
    const invalid = ask(); invalid.form.questions[0].options = Array.from({ length: 4 }, (_, i) => ({ value: String(i), label: '選項' }));
    assert.throws(() => B.validateResponse(invalid));
});

test('copilot thought summaries originate from provider parts and cannot be injected through JSON', async () => {
    const f = routeFixture(() => ({ candidates: [{ content: { parts: [
        { thought: true, text: 'Provider summary' },
        { text: JSON.stringify({ ...ready, thoughtSummaries: ['Injected summary'] }) }
    ] } }] }));
    const result = await f.call();
    assert.deepEqual(result.data.thoughtSummaries, ['Provider summary']);
    assert.equal(f.requests[0].config.thinkingConfig.includeThoughts, true);
});

test('ready automatically advances exactly once and does not generate images', async () => {
    const context = controllerFixture(async (url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(url, '/api/creation/copilot');
        return { ok: true, json: async () => ({ ...ready, requestId: body.requestId, revision: body.revision }) };
    });
    const actions = [];
    const abort = new AbortController();
    context.CreativeCopilot.mount(abort.signal, action => actions.push(action));
    await context.CreativeCopilot.request();
    assert.deepEqual(actions, ['ready']);
    assert.equal(context.CreationSessionStore.copilot.lastInsight, ready.message);
    assert.equal(context.CreationSessionStore.story, 'AI 產品介紹，不虛構功能');
});

test('schema follows three-option limits; one invalid Gemini decision is repaired on the same configured model', async () => {
    const choiceSchema = responseSchema.properties.form.properties.questions.items.anyOf[0];
    assert.equal(choiceSchema.properties.options.maxItems, 3);
    assert.ok(choiceSchema.required.includes('options'));
    let count = 0;
    const bad = ask(); bad.form.questions[0].options = Array.from({ length: 4 }, (_, i) => ({ value: String(i), label: `方向 ${i}` }));
    const f = routeFixture(() => ({ text: JSON.stringify(++count === 1 ? bad : ready) }));
    const result = await f.call();
    assert.equal(result.status, 200); assert.equal(result.data.action, 'ready');
    assert.equal(f.requests.length, 2);
    assert.ok(f.requests.every(r => r.model === require('../lib/ai/model-config').getModel('creative')));
    const repair = JSON.parse(f.requests[1].contents.at(-1).parts[0].text);
    assert.equal(repair.repair, true); assert.match(repair.validationIssue, /選項數量/);
});

test('fenced JSON is parsed safely while genuinely empty responses remain distinct', async () => {
    const valid = routeFixture(() => ({ text: '```json\n' + JSON.stringify(ready) + '\n```' }));
    assert.equal((await valid.call()).status, 200);
    const empty = routeFixture(() => ({ text: '' }));
    assert.equal((await empty.call()).data.code, 'AI_EMPTY_CONTENT');
    assert.equal(empty.requests.length, 1);
});

test('model-added other affordance is normalized without discarding creative options', async () => {
    const decision = ask();
    decision.form.questions[0].options.push({ value: 'third', label: '第三個創作方向' }, { value: 'other', label: '其他／自行描述' });
    const f = routeFixture(() => ({ text: JSON.stringify(decision) }));
    const result = await f.call();
    assert.equal(result.status, 200);
    assert.equal(result.data.form.questions[0].options.length, 3);
    assert.equal(result.data.form.questions[0].options[2].value, 'third');
    assert.equal(result.data.form.questions[0].allowOther, true);
    assert.equal(f.requests.length, 1);
});

test('a proposal missing its options is repaired; free text remains a separate valid contract', async () => {
    const missing = ask('proposal_choice'); delete missing.form.questions[0].options;
    let count = 0;
    const f = routeFixture(() => ({ text: JSON.stringify(++count === 1 ? missing : ask('proposal_choice')) }));
    const result = await f.call();
    assert.equal(result.status, 200);
    assert.equal(result.data.form.questions[0].options.length, 2);
    assert.equal(f.requests.length, 2);
    const schemas = responseSchema.properties.form.properties.questions.items.anyOf;
    assert.ok(schemas[0].required.includes('options'));
    assert.equal(schemas[1].properties.type.enum[0], 'free_text');
    assert.ok(!schemas[1].required.includes('options'));
});

test('propose → confirmed friends → second-round timeout → retry → ready commits the answer once', async () => {
    const payloads = [];
    const proposal = ask('proposal_choice'); proposal.action = 'propose';
    proposal.form.questions[0].options[0].label = '朋友聚會';
    const context = controllerFixture(async (url, options) => {
        const body = JSON.parse(options.body); payloads.push(body);
        if (payloads.length === 2) return { ok: false, json: async () => ({ code: 'AI_UPSTREAM_TIMEOUT', error: '思考逾時；選擇已保留。' }) };
        return { ok: true, json: async () => ({ ...(payloads.length === 1 ? proposal : ready), requestId: body.requestId, revision: body.revision }) };
    });
    const actions = [];
    context.CreativeCopilot.mount(new AbortController().signal, action => actions.push(action));
    await context.CreativeCopilot.request();
    const s = context.CreationSessionStore, original = s.creativeBrief.originalStory;
    s.copilot.drafts = { story_focus: { values: ['first'], other: '' } };
    await context.CreativeCopilot.request('answer');
    assert.match(s.copilot.error, /逾時/);
    assert.equal(s.creativeBrief.answers.length, 1);
    assert.equal(s.creativeBrief.answers[0].values[0].label, '朋友聚會');
    assert.equal(s.copilot.stackRounds.length, 1);
    const revision = s.creativeBrief.revision;
    await context.CreativeCopilot.request('start', true);
    assert.deepEqual(payloads[1], payloads[2]);
    assert.equal(payloads[2].intent, 'answer'); assert.equal(payloads[2].revision, revision);
    assert.equal(s.creativeBrief.answers.length, 1); assert.equal(s.creativeBrief.originalStory, original);
    assert.equal(s.copilot.history.filter(m => m.role === 'user').length, 1);
    assert.equal(s.copilot.retry, null); assert.deepEqual(actions, ['ready']);
    assert.equal(s.copilot.stackRounds.length, 1);
    assert.deepEqual(Array.from(s.copilot.stackRounds[0].answerIds), ['story_focus']);
    assert.equal(s.copilot.discussionLog.filter(m => m.role === 'user').length, 1);
});

test('one submitted round groups multiple answers and free discussion without leaking UI data into API payloads', async () => {
    const sent = [];
    const context = controllerFixture(async (url, options) => {
        const body = JSON.parse(options.body); sent.push(body);
        return { ok: true, json: async () => ({ ...ask('multi_choice'), requestId: body.requestId, revision: body.revision }) };
    });
    await context.CreativeCopilot.request();
    const s = context.CreationSessionStore;
    s.copilot.drafts = { story_focus: { values: ['first', 'second'], other: '自然光', otherActive: true } };
    await context.CreativeCopilot.request('answer');
    assert.equal(s.copilot.stackRounds.length, 1);
    assert.equal(s.creativeBrief.answers[0].values.length, 2);
    s.copilot.message = '不要太商業化';
    await context.CreativeCopilot.request('continue');
    assert.equal(s.copilot.stackRounds.length, 2);
    assert.equal(s.copilot.stackRounds[1].message, '不要太商業化');
    assert.equal(s.creativeBrief.requirements.at(-1), '不要太商業化');
    assert.equal(sent[1].stackRounds, undefined); assert.equal(sent[1].brief.stackRounds, undefined);
    assert.equal(sent[2].history.filter(m => m.role === 'user').length, 2);
});

test('creation labels and provider error banners do not disclose the model', async () => {
    const context = controllerFixture(async () => ({ ok: false, json: async () => ({ code: 'AI_RATE_LIMIT', error: 'Gemini 配額不足或請求過多，請稍後重試。' }) }));
    await context.CreativeCopilot.request();
    assert.equal(context.CreationSessionStore.copilot.error, 'AI 請求過多，請稍後重試。');
    const summary = context.AIActivity.summaryMarkup(['模型實際提供的摘要']);
    assert.match(summary, /<summary>思考摘要<\/summary>/);
    assert.doesNotMatch(summary, /Gemini/);
});

test('start → ask → answer → ask → answer → ready keeps continuity and distinct confirmations', async () => {
    const payloads = [];
    const context = controllerFixture(async (url, options) => {
        const body = JSON.parse(options.body); payloads.push(body);
        const response = payloads.length === 3 ? ready : ask();
        if (payloads.length === 2) response.form.questions[0].id = 'visual_focus';
        return { ok: true, json: async () => ({ ...response, requestId: body.requestId, revision: body.revision }) };
    });
    await context.CreativeCopilot.request();
    const s = context.CreationSessionStore;
    s.copilot.drafts = { story_focus: { values: ['first'], other: '' } };
    await context.CreativeCopilot.request('answer');
    s.copilot.drafts = { visual_focus: { values: ['second'], other: '' } };
    await context.CreativeCopilot.request('answer');
    assert.deepEqual(payloads.map(p => p.intent), ['start', 'answer', 'answer']);
    assert.deepEqual(payloads.map(p => p.autoRounds), [0, 1, 2]);
    assert.equal(s.creativeBrief.answers.length, 2);
    assert.equal(payloads[2].history.length, 4);
    assert.equal(s.copilot.response.action, 'ready');
});

test('unexpected fetch AbortError is recoverable; a revised retry retains intent without recommitting answers', async () => {
    const payloads = [];
    const context = controllerFixture(async (url, options) => {
        const body = JSON.parse(options.body); payloads.push(body);
        if (payloads.length === 1) throw Object.assign(new Error('browser timeout'), { name: 'AbortError' });
        return { ok: true, json: async () => ({ ...ready, requestId: body.requestId, revision: body.revision }) };
    });
    await context.CreativeCopilot.request('delegate');
    const s = context.CreationSessionStore;
    assert.match(s.copilot.error, /可以重試/);
    context.CreativeBrief.edit(s.creativeBrief, { tone: '溫暖' });
    await context.CreativeCopilot.request('start', true);
    assert.equal(payloads[1].intent, 'delegate'); assert.notEqual(payloads[0].requestId, payloads[1].requestId);
    assert.equal(payloads[1].revision, payloads[0].revision + 1);
    assert.equal(payloads[1].brief.confirmed.tone, '溫暖');
});

test('an in-flight result cannot overwrite a newer brief revision', async () => {
    let finish;
    const context = controllerFixture(async (url, options) => {
        const body = JSON.parse(options.body); await new Promise(resolve => { finish = resolve; });
        return { ok: true, json: async () => ({ ...ready, requestId: body.requestId, revision: body.revision }) };
    });
    const pending = context.CreativeCopilot.request();
    const s = context.CreationSessionStore;
    context.CreativeBrief.edit(s.creativeBrief, { tone: '沉靜', avoid: ['太暗'] });
    finish(); await pending;
    assert.equal(s.creativeBrief.confirmed.tone, '沉靜');
    assert.equal(s.creativeBrief.suggestions.visualStyle, undefined);
    assert.equal(s.copilot.response, null); assert.ok(s.copilot.retry);
});

test('controller and backend together complete a structured two-round proposal conversation', async () => {
    const seen = [];
    const f = routeFixture(args => {
        const input = JSON.parse(args.contents[0].parts[0].text); seen.push(input);
        const response = input.intent === 'start' ? { ...ask('proposal_choice'), action: 'propose' } : ready;
        return { candidates: [{ content: { parts: [{ thought: true, text: 'provider summary' }, { text: JSON.stringify(response) }] } }] };
    });
    const context = controllerFixture(async (url, options) => {
        const result = await f.call(JSON.parse(options.body));
        return { ok: result.status === 200, json: async () => result.data };
    });
    await context.CreativeCopilot.request();
    const s = context.CreationSessionStore;
    assert.equal(s.copilot.response.action, 'propose');
    s.copilot.drafts = { story_focus: { values: ['first'], other: '' } };
    await context.CreativeCopilot.request('answer');
    assert.equal(s.copilot.response.action, 'ready');
    assert.equal(seen[1].brief.answers.length, 1);
    assert.equal(seen[1].brief.answers[0].values[0].value, 'first');
    assert.equal(seen[1].history.length, 2);
    assert.ok(!JSON.stringify(seen[1]).includes('provider summary'));
    assert.equal(s.creativeBrief.confirmed.visualStyle, '明亮電影感');
});
