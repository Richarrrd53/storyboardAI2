const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const B = require('../public/js/features/creative-brief');
const { generateDecision, createCopilotHandler, validateInput } = require('../lib/ai/copilot');
const { policy, classifyCreativeError, callWithinDeadline } = require('../lib/ai/creative-request');
const ready = { action: 'ready', message: '以朋友接過咖啡的特寫串起桌邊互動，讓聚會的溫度來自動作。', briefPatch: { ratio: '9:16', duration: 30 } };
const input = { story: '朋友聚會短片', brief: B.create('朋友聚會短片'), history: [], message: '', intent: 'answer', autoRounds: 1 };
const body = () => ({ ...input, requestId: 'round-two', revision: 1 });
function fixture(generate, options = {}) {
    const calls = [], events = [];
    const client = { models: { generateContent(args) { calls.push(structuredClone({ ...args, config: { ...args.config, abortSignal: undefined } })); return generate(args, calls.length); } } };
    return { calls, events, run: () => generateDecision(client, input, { requestId: 'round-two', logger: (event, data) => events.push({ event, ...data }), ...options }) };
}

test('slow invalid first response retains a real repair window, not the old 1001ms', async () => {
    let elapsed = 0;
    const f = fixture(async (_, attempt) => { if (attempt === 1) { elapsed = 33999; return { text: 'not JSON' }; } return { text: JSON.stringify(ready) }; }, { now: () => elapsed });
    const result = await f.run();
    assert.equal(result.action, 'ready');
    assert.deepEqual(f.calls.map(call => call.config.httpOptions.timeout), [35000, 20000]);
    assert.ok(f.calls.every(call => call.config.httpOptions.retryOptions.attempts === 1));
    assert.equal(result.meta.repairCount, 1);
    assert.equal(f.events[0].stage, 'parse_json');
});

test('insufficient recovery budget never starts a repair with milliseconds remaining', async () => {
    let elapsed = 0;
    const f = fixture(async () => { elapsed = policy.totalMs - 1; return { text: 'not JSON' }; }, { now: () => elapsed });
    await assert.rejects(f.run(), { code: 'AI_INVALID_RESPONSE' });
    assert.equal(f.calls.length, 1);
});

test('503 and 504 get one bounded backoff; repair failures keep their upstream classification', async () => {
    for (const status of [503, 504]) {
        const pauses = [];
        const f = fixture(async (_, attempt) => { if (attempt === 1) throw Object.assign(new Error('private upstream payload'), { status }); return { text: JSON.stringify(ready) }; }, { sleep: async ms => pauses.push(ms) });
        assert.equal((await f.run()).meta.retryCount, 1);
        assert.deepEqual(pauses, [500]);
        assert.equal(f.calls.length, 2);
        assert.equal(f.events[0].code, status === 504 ? 'AI_UPSTREAM_TIMEOUT' : 'AI_UPSTREAM_UNAVAILABLE');
        assert.ok(!JSON.stringify(f.events).includes('private upstream payload'));
        const repair = fixture(async (_, attempt) => { if (attempt === 1) return { text: 'broken' }; throw Object.assign(new Error('private'), { status }); });
        await assert.rejects(repair.run(), { status });
        assert.equal(repair.calls.length, 2);
        assert.equal(repair.events.at(-1).stage, 'repair_output');
        assert.equal(repair.events.at(-1).code, status === 504 ? 'AI_UPSTREAM_TIMEOUT' : 'AI_UPSTREAM_UNAVAILABLE');
    }
});

test('schema rejection differs from response validation; identical invalid requests are not retried', async () => {
    const upstream = fixture(async () => { throw Object.assign(new Error('INVALID_ARGUMENT responseJsonSchema'), { status: 400 }); });
    await assert.rejects(upstream.run());
    assert.equal(upstream.calls.length, 1); assert.equal(upstream.events[0].code, 'AI_SCHEMA_ERROR');
    const invalid = fixture(async () => ({ text: JSON.stringify({ ...ready, action: 'invalid' }) }));
    await assert.rejects(invalid.run(), { code: 'AI_INVALID_RESPONSE', stage: 'validate_schema' });
    assert.equal(invalid.calls.length, 2);
    assert.equal(invalid.events[0].stage, 'validate_schema');
});

test('timeout, network, authentication, cancellation and upstream failure remain distinguishable', async () => {
    for (const [error, code] of [
        [{ name: 'AbortError' }, 'AI_UPSTREAM_TIMEOUT'], [{ message: 'fetch failed' }, 'AI_NETWORK_FAILURE'],
        [{ status: 503 }, 'AI_UPSTREAM_UNAVAILABLE'], [{ status: 504 }, 'AI_UPSTREAM_TIMEOUT'],
        [{ status: 403 }, 'AI_AUTH_PERMISSION'], [{ status: 429 }, 'AI_RATE_LIMIT'],
        [{ status: 503, message: 'backend timeout' }, 'AI_UPSTREAM_UNAVAILABLE'],
        [{ status: 403, message: 'network access denied' }, 'AI_AUTH_PERMISSION'],
        [{ status: 429, message: 'quota timeout' }, 'AI_RATE_LIMIT'],
        [{ code: 'AI_REQUEST_CANCELLED' }, 'AI_REQUEST_CANCELLED'], [{ code: 'AI_INVALID_RESPONSE' }, 'AI_INVALID_RESPONSE']
    ]) assert.equal(classifyCreativeError(error).code, code);
    // Even a provider that ignores its signal cannot keep the operation alive indefinitely.
    const client = { models: { generateContent: () => new Promise(() => {}) } };
    await assert.rejects(callWithinDeadline(client, { config: {} }, 5), { code: 'AI_UPSTREAM_TIMEOUT' });
    const controller = new AbortController();
    const pending = callWithinDeadline(client, { config: {} }, 1000, controller.signal); controller.abort();
    await assert.rejects(pending, { code: 'AI_REQUEST_CANCELLED' });
});

test('model input drops UI metadata and duplicate IDs but keeps the latest choice and every restriction', () => {
    const answer = { id: 'occasion', question: '聚會情境', values: [{ value: 'friends', label: '朋友聚會' }], other: '' };
    const result = validateInput({ ...body(), brief: { ...input.brief, answers: [{ ...answer, other: '舊答案' }, answer], requirements: ['不要太暗', '不要太暗'], unusedUI: 'not for model' } });
    assert.equal(result.brief.answers.length, 1); assert.equal(result.brief.answers[0].other, '');
    assert.deepEqual(result.brief.requirements, ['不要太暗']);
    assert.equal(result.brief.unusedUI, undefined); assert.equal(result.brief.revision, undefined);
    assert.equal(result.brief.originalStory, undefined);
});

test('disconnect aborts abandoned requests, but one disconnected duplicate cannot cancel another waiter', async () => {
    let signal, finish, calls = 0;
    const handler = createCopilotHandler(() => ({ models: { generateContent: args => { calls++; signal = args.config.abortSignal; return new Promise(resolve => { finish = resolve; }); } } }), { logger() {} });
    function connection() {
        const req = Object.assign(new EventEmitter(), { body: body(), ip: 'local', get: () => null, is: () => true });
        const res = Object.assign(new EventEmitter(), { writableEnded: false, status(code) { this.code = code; return this; }, json(data) { this.writableEnded = true; return data; } });
        return { req, res, run: () => handler(req, res) };
    }
    const first = connection(), second = connection();
    const a = first.run(), b = second.run();
    first.res.emit('close'); assert.equal(signal.aborted, false); assert.equal(calls, 1);
    finish({ text: JSON.stringify(ready) });
    assert.equal(await a, undefined); assert.equal((await b).action, 'ready');
    const third = connection(); third.req.body = { ...body(), requestId: 'abandoned' };
    const c = third.run(); third.res.emit('close');
    assert.equal(signal.aborted, true); await c;
    assert.equal(third.req.listenerCount('aborted'), 0); assert.equal(third.res.listenerCount('close'), 0);
});

test('disabled thoughts are absent from both the request and returned decision; model errors do not fall back', async () => {
    const f = fixture(async () => ({ candidates: [{ content: { parts: [{ thought: true, text: 'provider summary' }, { text: JSON.stringify(ready) }] } }] }),
        { env: { GEMINI_CREATIVE_INCLUDE_THOUGHTS: 'false' } });
    const result = await f.run();
    assert.equal(f.calls[0].model, 'gemini-3.8-flash');
    assert.equal(f.calls[0].config.thinkingConfig.thinkingLevel, 'MEDIUM');
    assert.equal(f.calls[0].config.thinkingConfig.includeThoughts, undefined);
    assert.equal(result.thoughtSummaries, undefined); assert.equal(result.meta.thoughtSummaryCount, 0);
    const unavailable = fixture(async () => { throw Object.assign(new Error('model not found'), { status: 404 }); });
    await assert.rejects(unavailable.run(), { status: 404 });
    assert.equal(unavailable.calls.length, 1); assert.equal(unavailable.events[0].code, 'AI_MODEL_UNAVAILABLE');
});

test('usage and summary metadata are recorded separately from JSON and the Creative Brief', async () => {
    const f = fixture(async () => ({ sdkHttpResponse: { responseInternal: { status: 200 } }, usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80, totalTokenCount: 230 },
        candidates: [{ content: { parts: [{ thought: true, text: 'provider summary' }, { text: JSON.stringify(ready) }] } }] }));
    const result = await f.run();
    assert.equal(result.meta.upstreamStatus, 200); assert.equal(result.meta.usage.totalTokens, 230);
    assert.equal(result.meta.thinkingLevel, 'MEDIUM'); assert.equal(result.meta.attempts.length, 1);
    assert.equal(result.meta.thoughtSummaryCount, 1); assert.equal(result.briefPatch.thoughtSummaries, undefined);
    assert.deepEqual(result.thoughtSummaries, ['provider summary']);
    assert.ok(!JSON.stringify(f.events).includes('provider summary'));
    assert.ok(!JSON.stringify(f.events).includes(input.story));
});
