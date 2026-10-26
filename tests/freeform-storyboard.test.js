const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const free = require('../public/js/features/freeform-storyboard');
const source = name => fs.readFileSync(path.join(__dirname, '../public/js/features', name + '.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const input = { story: '咖啡師磨豆並沖煮咖啡', style: { name: '電影', prompt: 'cinematic light' }, ratio: '橫向16:9', duration: 30 };
function plan(duration = 30, count = { 15: 6, 30: 10, 45: 12, 60: 15 }[duration]) {
  return { meta: { title: '咖啡的早晨' }, characters: { hero: { appearance: 'barista', outfit: 'blue apron' } }, shots: Array.from({ length: count }, (_, index) => ({
    id: index + 1, story: `咖啡師的具體動作 ${index + 1}`, camera: 'overhead close-up', duration: duration / count + 's',
    emotion: '平靜', purpose: '帶出製作流程的下一個細節', dialogue: '', shotPrompt: `Barista preparing coffee step ${index + 1}, warm morning light`, characters: ['hero']
  })) };
}
function fixture(intercept) {
  const calls = [];
  const context = vm.createContext({ AbortController, console, setTimeout, clearTimeout, fetch: async (url, options) => {
    const body = JSON.parse(options.body || '{}'); calls.push({ url, body, signal: options.signal });
    const custom = await intercept?.(url, body, options, calls);
    if (custom) return custom;
    let data;
    if (body.type === 'story') {
      const revised = body.question.startsWith('依以下已確認分鏡');
      data = { response: JSON.stringify(revised ? JSON.parse(body.question.slice(body.question.indexOf('{'))) : plan()) };
    } else data = { image: ['coffee.png'] };
    return { ok: true, json: async () => data };
  } });
  context.window = context;
  vm.runInContext(source('freeform-storyboard'), context);
  vm.runInContext(source('generation-task'), context);
  return { task: context.GenerationTask, calls };
}
const response = data => ({ ok: true, json: async () => data });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('all duration options validate their ranges and totals; prompt distinguishes beats from shots', () => {
  for (const duration of [15, 30, 45, 60]) {
    assert.equal(free.validate(plan(duration), duration).shots.length, plan(duration).shots.length);
    assert.match(free.prompt({ ...input, duration }), new RegExp(`${free.ranges[duration][0]}–${free.ranges[duration][1]}`));
    assert.match(free.prompt({ ...input, duration }), /Story Beat.*Shot/);
  }
  assert.equal(free.duration(undefined), 30);
  assert.throws(() => free.validate(plan(30, 4), 30), /8–12/);
  assert.throws(() => free.validate(plan(30, 13), 30), /8–12/);
});

test('generated wire schemas use one ID type across every duration; legacy saved string IDs still validate', () => {
  for (const target of [15, 30, 45, 60]) {
    const schema = free.schema(target);
    assert.equal(schema.properties.shots.items.properties.id.type, 'integer');
    assert.equal(schema.properties.shots.minItems, free.ranges[target][0]);
    assert.equal(schema.properties.shots.maxItems, free.ranges[target][1]);
    assert.equal(schema.properties.characters.type, 'array');
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type) assert.equal(typeof node.type, 'string', 'Provider output schemas must avoid mixed scalar type arrays');
      Object.values(node).forEach(visit);
    }
    visit(schema);
  }
  const legacy = plan(); legacy.shots.forEach((shot, i) => { shot.id = 'saved-' + i; });
  assert.equal(free.validate(legacy).shots[0].id, 'saved-0');
});

test('installed SDK sends the corrected story schema and MEDIUM settings to Vertex unchanged', async () => {
  const { GoogleGenAI } = require('@google/genai');
  const { getModelConfig } = require('../lib/ai/model-config');
  const originalFetch = global.fetch; const sent = [];
  global.fetch = async (url, options) => {
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan()) }] } }] }), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const client = new GoogleGenAI({ vertexai: true, project: 'fixture', location: 'global', googleAuthOptions: { authClient: { getRequestHeaders: async () => new Headers() } } });
    for (const target of [15, 30, 45, 60]) {
      const options = getModelConfig('story', { includeThoughts: true });
      await client.models.generateContent({ ...options, config: { ...options.config, responseJsonSchema: free.schema(target) }, contents: [{ text: 'fixture' }] });
      const config = sent.at(-1).generationConfig;
      assert.deepEqual(config.responseJsonSchema, free.schema(target));
      assert.equal(config.thinkingConfig.thinkingLevel, 'MEDIUM');
      assert.equal(config.responseMimeType, 'application/json');
    }
  } finally { global.fetch = originalFetch; }
});

test('upstream schema rejection stops without a JSON repair or image requests; manual retry retains the brief', async () => {
  let rejected = true;
  const f = fixture((url, body) => rejected && body.type === 'story' ? { ok: false, status: 502, json: async () => ({
    code: 'AI_SCHEMA_ERROR', details: '分鏡輸出格式設定未被服務接受', diagnostics: { requestId: body.requestId, upstreamStatus: 400 }
  }) } : null);
  const creativeBrief = { originalStory: input.story, confirmed: { avoid: ['太暗'] }, answers: [], requirements: ['不要太商業化'], revision: 3 };
  await f.task.start({ ...input, creativeBrief });
  let state = f.task.getState();
  assert.equal(state.status, 'error'); assert.equal(state.error.code, 'AI_SCHEMA_ERROR');
  assert.equal(state.error.requestId, f.calls[0].body.requestId);
  assert.equal(f.calls.length, 1); assert.equal(state.activity.phase, 'requesting');
  assert.equal(JSON.stringify(state.input.creativeBrief), JSON.stringify(creativeBrief));
  rejected = false; await f.task.retry(); state = f.task.getState();
  assert.equal(state.status, 'awaiting_confirmation'); assert.equal(f.calls.length, 2);
  assert.equal(f.calls.some(call => call.body.type === 'image'), false);
  assert.match(f.calls[1].body.question, /不要太商業化/);
});
test('pre-image validation rejects empty visuals, bad timing, invalid characters, non-English prompts and placeholders', () => {
  for (const edit of [
    p => { p.shots[0].story = ''; }, p => { p.shots[0].duration = 'three'; },
    p => { p.shots.forEach(s => { s.duration = '1s'; }); },
    p => { p.shots[0].characters = ['unknown']; }, p => { p.shots[0].shotPrompt = '中文描述'; },
    p => { p.shots[0].shotPrompt = 'A cup of {product}'; }, p => { p.shots[0].story = 'TODO'; },
    p => { p.shots[0].purpose = ''; }, p => { p.shots[0].camera = ''; },
    p => { p.shots[1].story = p.shots[0].story; }, p => { p.characters = []; }
  ]) { const p = plan(); edit(p); assert.throws(() => free.validate(p)); }
});
test('free script stops for confirmation; duplicate confirm shares image work and saves compatible output', async () => {
  const f = fixture(); await f.task.start(input);
  assert.equal(f.task.getState().status, 'awaiting_confirmation');
  assert.equal(f.task.getState().progress.pct, 0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.task.getState().result.generatedShotData.length, 0);
  const first = f.task.confirmPlan(); assert.equal(f.task.confirmPlan(), first); await first;
  assert.equal(f.task.getState().status, 'completed');
  assert.equal(f.calls.filter(c => c.body.type === 'image').length, 10);
  assert.equal(f.task.getState().progress.completed, 10);
  assert.equal(f.task.getState().save.status, 'local');
});
test('invalid model output is repaired once, including bad JSON; never truncated or rendered', async () => {
  for (const bad of ['invalid json', JSON.stringify(plan(30, 4)), JSON.stringify(plan(30, 15))]) {
    const f = fixture((url, body) => body.type === 'story' ? response({ response: bad }) : null);
    await f.task.start(input);
    assert.equal(f.task.getState().status, 'error');
    assert.equal(f.calls.length, 2);
    assert.ok(f.calls.every(c => c.body.type === 'story'));
    assert.match(f.calls[1].body.question, /修正/);
  }
});
test('successful bounded repair enters preview with the complete plan', async () => {
  let count = 0;
  const f = fixture((url, body) => body.type === 'story' && ++count === 1 ? response({ response: JSON.stringify(plan(30, 4)) }) : null);
  await f.task.start(input); assert.equal(f.task.getState().status, 'awaiting_confirmation');
  assert.equal(f.task.getState().result.storyboardData.shots.length, 10); assert.equal(f.calls.length, 2);
});
test('edited text and order survive prompt synchronization; invalid manual timing blocks images', async () => {
  const f = fixture(); await f.task.start(input);
  const data = f.task.getState().result.storyboardData;
  data.shots[0].story = '咖啡粉倒入濾杯'; data.shots[0].duration = '3.5s';
  [data.shots[0], data.shots[1]] = [data.shots[1], data.shots[0]];
  f.task.updatePlan(data); await f.task.confirmPlan();
  assert.equal(f.calls.filter(c => c.body.type === 'story').length, 2);
  assert.equal(f.task.getState().result.generatedShotData[1].title, '咖啡粉倒入濾杯');
  assert.equal(f.task.getState().result.generatedShotData[1].duration, '3.5s');
  const bad = fixture(); await bad.task.start(input); const invalid = bad.task.getState().result.storyboardData;
  invalid.shots[0].duration = '-3s'; bad.task.updatePlan(invalid); await bad.task.confirmPlan();
  assert.equal(bad.task.getState().status, 'awaiting_confirmation'); assert.equal(bad.calls.length, 1);
  assert.match(bad.task.getState().error.message, /時長/);
});
test('prompt synchronization failure returns to editable plan without rendering; retry keeps edits', async () => {
  let fail = true;
  const f = fixture((url, body) => body.question?.startsWith('依以下已確認分鏡') && fail ? response({ response: '{"shots":[]}' }) : null);
  await f.task.start(input); const data = f.task.getState().result.storyboardData; data.shots[0].story = '調整磨豆機'; f.task.updatePlan(data);
  await f.task.confirmPlan(); assert.equal(f.task.getState().status, 'awaiting_confirmation');
  assert.equal(f.calls.filter(c => c.body.type === 'image').length, 0);
  fail = false; await f.task.confirmPlan(); assert.equal(f.task.getState().status, 'completed');
  assert.equal(f.task.getState().result.generatedShotData[0].title, '調整磨豆機');
});
test('cancel during images retains success and resumes only unfinished shots', async () => {
  let release; let images = 0;
  const f = fixture((url, body) => body.type === 'image' && ++images === 2 ? new Promise(resolve => { release = resolve; }) : null);
  await f.task.start(input); const pending = f.task.confirmPlan();
  while (!release) await tick();
  assert.equal(f.task.getState().progress.completed, 1); f.task.cancel();
  release(response({ image: ['late.png'] })); await pending;
  assert.equal(f.task.getState().status, 'cancelled');
  await f.task.retry(); assert.equal(f.task.getState().status, 'awaiting_confirmation');
  await f.task.confirmPlan(); assert.equal(f.task.getState().status, 'completed');
  assert.equal(images, 11); assert.equal(f.task.getState().progress.completed, 10);
});
test('cancel/reset during planning rejects late responses and confirmation remains inert', async () => {
  let release; const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const pending = f.task.start(input); await tick(); f.task.cancel();
  release(response({ response: JSON.stringify(plan()) })); await pending;
  await f.task.confirmPlan(); assert.equal(f.task.getState().status, 'cancelled'); assert.equal(f.calls.length, 1);
  f.task.reset(); assert.equal(f.task.getState().status, 'idle');
});
test('single failed shot retry preserves successful images and does not regenerate script', async () => {
  let count = 0;
  const f = fixture((url, body) => body.type === 'image' && ++count >= 2 && count <= 4 ? { ok: false, json: async () => ({ error: 'image failure' }) } : null);
  await f.task.start(input); await f.task.confirmPlan();
  assert.equal(f.task.getState().progress.completed, 9);
  assert.equal(f.task.getState().status, 'error');
  assert.equal(f.task.getState().result.failedShotIndexes.length, 1);
  await f.task.retryFailedImages(1);
  assert.equal(f.task.getState().progress.completed, 10); assert.equal(count, 13);
  assert.equal(f.calls.filter(c => c.body.type === 'story').length, 1);
});

test('Creative Brief snapshot reaches generation and image prompts keep reviewed lighting without preset conflicts', async () => {
  const B = require('../public/js/features/creative-brief');
  const brief = B.create('咖啡廳，明亮電影感，避免太暗');
  B.edit(brief, { visualStyle: '明亮電影感', avoid: ['太暗'] });
  B.commit(brief, [{ id: 'focus', question: '敘事視角', values: [{ value: 'customer', label: '顧客的小故事' }], other: '' }]);
  const f = fixture((url, body) => {
    if (body.type !== 'story') return null;
    const data = plan();
    data.shots.forEach(s => { s.shotPrompt = 'A bright airy cafe with natural daylight, no deep black shadows'; });
    return response({ response: JSON.stringify(data) });
  });
  await f.task.start({ ...input, story: brief.originalStory, creativeBrief: B.snapshot(brief), style: { name: '電影', prompt: 'deep shadows, film noir vibes' } });
  assert.equal(f.task.getState().input.creativeBrief.answers[0].values[0].label, '顧客的小故事');
  assert.match(f.calls[0].body.question, /明亮電影感/);
  assert.equal(f.calls.filter(c => c.body.type === 'image').length, 0);
  await f.task.confirmPlan();
  const images = f.calls.filter(c => c.body.type === 'image');
  assert.equal(images.length, 10);
  assert.ok(images.every(c => c.body.question.includes('bright airy cafe')));
  assert.ok(images.every(c => !c.body.question.includes('film noir vibes')));
  assert.equal(f.task.getState().status, 'completed');
});

test('typed wire characters, legacy object maps and JSON-encoded objects normalize without inventing details', () => {
  for (const shape of [
    [{ id: 'hero', appearance: 'barista', outfit: 'blue apron' }],
    { hero: { appearance: 'barista', outfit: 'blue apron' } },
    { hero: JSON.stringify({ appearance: 'barista', outfit: 'blue apron' }) },
    JSON.stringify({ hero: { description: 'barista', clothing: 'blue apron' } })
  ]) {
    const data = plan(); data.characters = shape;
    const valid = free.validate(data);
    assert.equal(valid.characters.hero.appearance, 'barista');
    assert.equal(valid.characters.hero.outfit, 'blue apron');
    assert.deepEqual(valid.shots[0].characters, ['hero']);
  }
  for (const characters of [{ hero: 'barista' }, { hero: { appearance: 'barista' } }, [{ id: 'hero', appearance: 'barista', outfit: 'blue apron' }, { id: 'hero', appearance: 'other', outfit: 'coat' }]]) {
    assert.throws(() => free.validate({ ...plan(), characters }));
  }
  const pov = plan(); pov.characters = []; pov.shots.forEach(s => { s.characters = []; });
  assert.deepEqual(free.validate(pov).characters, {});
  assert.equal(free.schema(30).properties.characters.items.required.includes('outfit'), true);
  assert.match(free.prompt(input), /藏鏡人 POV/);
});

test('planning sends the explicit contract and real summaries separately, including its repair status', async () => {
  let count = 0;
  const f = fixture((url, body) => body.type === 'story' ? response({ response: JSON.stringify(++count === 1 ? { ...plan(), characters: { hero: 'invalid description' } } : plan()), thoughtSummaries: ['Provider thought summary'] }) : null);
  const phases = []; f.task.subscribe(s => { phases.push(s.activity.phase); });
  await f.task.start({ ...input, ratio: undefined });
  assert.equal(f.task.getState().input.ratio, '直向9:16');
  assert.equal(f.calls[0].body.contract, 'freeform-v2');
  assert.equal(f.calls[0].body.includeThoughts, true);
  assert.ok(phases.includes('repairing')); assert.ok(phases.includes('validating'));
  assert.deepEqual(JSON.parse(JSON.stringify(f.task.getState().activity.thoughtSummaries)), ['Provider thought summary']);
  assert.equal(f.task.getState().status, 'awaiting_confirmation');
});
