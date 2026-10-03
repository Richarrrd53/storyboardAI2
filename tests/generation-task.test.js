const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const taskSource = fs.readFileSync(path.join(__dirname, '../public/js/features/generation-task.js'), 'utf8');
const creationSource = fs.readFileSync(path.join(__dirname, '../public/js/features/creation.js'), 'utf8');
const options = () => ({ story: 'A small journey', style: { name: '預設風格', prompt: 'natural light' }, ratio: '橫向16:9', selectedTemplate: null });
const storyboard = {
  meta: { title: 'Journey' }, characters: { hero: { appearance: 'young woman', outfit: 'blue jacket' } },
  shots: [1, 2].map(id => ({ id, story: `Shot ${id}`, camera: 'wide', duration: '4s', emotion: 'joy', shotPrompt: 'a walk', characters: ['hero'] }))
};
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const response = (data, ok = true, status = 200) => ({ ok, status, json: async () => data });
async function tick() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function fixture(customFetch) {
  const timers = new Map();
  const calls = [], pill = [];
  let timerId = 0, invalidations = 0;
  const context = vm.createContext({
    console: { log() {}, error() {} }, AbortController,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body, signal: init.signal });
      const custom = customFetch?.(url, body, init, calls.length);
      if (custom !== undefined) return custom;
      return response(url === '/api/projects' ? { project: { id: 'project-42' } }
        : body.type === 'story' ? { response: JSON.stringify(storyboard) } : { image: ['data:image/png;base64,test'] });
    },
    spaAuth: { isLoggedIn: () => true, getToken: () => 'test-token' },
    clearSpaCache: () => { invalidations++; },
    updateGlobalPillProgress: (pct, running) => pill.push({ pct, running })
  });
  context.window = context;
  vm.runInContext(creationSource, context);
  vm.runInContext(taskSource, context);
  const task = context.GenerationTask;
  async function drain() {
    for (let i = 0; i < 100; i++) {
      await tick();
      if (task.getState().status !== 'generating') return;
      if (!timers.size) return;
      const [id, timer] = timers.entries().next().value;
      timers.delete(id); timer.fn();
    }
    throw new Error('Task failed to settle');
  }
  return { context, task, calls, timers, pill, drain, get invalidations() { return invalidations; } };
}

test('start, sequential requests, progress, completed and original save contract', async () => {
  const f = fixture(); const states = [];
  f.task.subscribe(state => states.push(state));
  const pending = f.task.start(options());
  assert.equal(f.task.getState().status, 'generating');
  assert.equal(f.task.getState().progress.pct, 5);
  const taskId = f.task.getState().taskId;
  await f.drain(); await pending;
  const state = f.task.getState();
  assert.equal(state.taskId, taskId);
  assert.equal(state.status, 'completed'); assert.equal(state.projectId, 'project-42');
  assert.deepEqual(states.filter(s => s.status === 'generating').map(s => s.progress.pct), [5, 30, 50, 71, 92, 95, 100]);
  assert.deepEqual(f.calls.map(c => c.url), ['/api/ask-gemini', '/api/ask-gemini', '/api/ask-gemini', '/api/projects']);
  assert.deepEqual(f.calls.slice(0, 3).map(c => c.body.type), ['story', 'image', 'image']);
  assert.equal(f.calls[0].body.ratio, '橫向16:9');
  assert.match(f.calls[0].body.question, /^使用者故事：/m, 'prompt whitespace is preserved during extraction');
  const saved = f.calls.at(-1).body;
  assert.equal(saved.title, 'Journey'); assert.equal(saved.shots[0].duration, '4s');
  assert.equal(saved.shots[0].payload.emotion, 'joy'); assert.equal(saved.metadata.originalStory, options().story);
  assert.match(saved.shots[0].payload.finalPrompt, /young woman, blue jacket/);
  assert.equal('generationStatus' in f.context.CreationSessionStore, false);
  assert.equal(f.invalidations, 1); assert.equal(f.timers.size, 0);
  assert.equal(f.pill.at(-1).running, false);
});

test('duplicate start shares one promise, one task id and one API chain', async () => {
  const f = fixture(); const first = f.task.start(options()); const id = f.task.getState().taskId;
  assert.equal(f.task.start({ ...options(), story: 'duplicate' }), first);
  assert.equal(f.task.getState().taskId, id);
  await f.drain(); await first;
  assert.equal(f.calls.filter(c => c.body.type === 'story').length, 1);
});

test('template path retains normalized payload and image failure fallback', async () => {
  const f = fixture((url, body) => body.type === 'image' ? response({ error: 'image unavailable' }, false, 500) : undefined);
  const input = { ...options(), selectedTemplate: { id: 'tpl', name: 'Template', structure: [{ action: 'Open', camera: 'close', duration: '2s' }] } };
  const done = f.task.start(input); await f.drain(); await done;
  const state = f.task.getState();
  assert.equal(state.status, 'completed'); assert.equal(state.result.generatedImgs[0], '../icon/error.jpg');
  assert.equal(f.calls.some(c => c.body.type === 'story'), false);
  const saved = f.calls.at(-1).body;
  assert.equal(saved.title, 'Template'); assert.equal(saved.metadata.templateId, 'tpl');
  assert.equal(saved.shots[0].duration, '2s'); assert.equal(Object.keys(saved.characters).length, 0);
});

test('story error and malformed JSON are terminal, retry keeps original task input', async () => {
  let fail = true;
  const f = fixture((url, body) => fail && body.type === 'story' ? response({ error: 'try again' }, false, 503) : undefined);
  const first = f.task.start(options()); await f.drain(); await first;
  assert.equal(f.task.getState().status, 'error'); assert.equal(f.task.getState().error.status, 503);
  assert.equal(f.calls.length, 1); const oldId = f.task.getState().taskId;
  fail = false;
  const retry = f.task.retry(); await f.drain(); await retry;
  assert.equal(f.task.getState().status, 'completed'); assert.notEqual(f.task.getState().taskId, oldId);
  const malformed = fixture(() => response({ response: 'not JSON' }));
  const bad = malformed.task.start(options()); await malformed.drain(); await bad;
  assert.equal(malformed.task.getState().status, 'error'); assert.equal(malformed.calls.length, 1);
});

test('cancel owns fetch signal; late uncooperative response cannot revive cancelled task', async () => {
  const held = deferred(); const f = fixture(() => held.promise);
  const pending = f.task.start(options()); await tick();
  assert.equal(f.calls[0].signal.aborted, false);
  assert.equal(f.task.cancel(), true); assert.equal(f.calls[0].signal.aborted, true);
  assert.equal(f.task.getState().status, 'cancelled'); assert.equal(f.task.cancel(), false);
  held.resolve(response({ response: JSON.stringify(storyboard) })); await pending;
  assert.equal(f.task.getState().status, 'cancelled'); assert.equal(f.calls.length, 1); assert.equal(f.timers.size, 0);
});

test('cancel during delay clears timer and prevents later API/save', async () => {
  const f = fixture(); const pending = f.task.start(options()); await tick();
  assert.equal(f.timers.size, 1); f.task.cancel();
  assert.equal(f.timers.size, 0); await pending;
  assert.equal(f.calls.length, 1); assert.equal(f.task.getState().status, 'cancelled');
});

test('abort during image request escapes fallback and never starts next image or save', async () => {
  const held = deferred(); const f = fixture((url, body) => body.type === 'image' ? held.promise : undefined);
  const pending = f.task.start(options()); await f.drain();
  assert.equal(f.calls.at(-1).body.type, 'image'); f.task.cancel();
  held.resolve(response({ image: ['late-image'] })); await pending;
  assert.equal(f.calls.length, 2); assert.equal(f.task.getState().status, 'cancelled');
});

test('reset followed by new task rejects obsolete writes and obsolete finally cleanup', async () => {
  const held = deferred(); let first = true;
  const f = fixture((url, body) => { if (body.type === 'story' && first) { first = false; return held.promise; } });
  const old = f.task.start(options()); await tick(); f.task.reset();
  const next = f.task.start({ ...options(), story: 'New story' }); const newId = f.task.getState().taskId;
  held.resolve(response({ response: JSON.stringify(storyboard) })); await old;
  assert.equal(f.task.getState().taskId, newId); assert.equal(f.task.getState().status, 'generating');
  assert.equal(f.task.start(options()), next);
  await f.drain(); await next;
  assert.equal(f.task.getState().status, 'completed'); assert.equal(f.calls.at(-1).body.metadata.originalStory, 'New story');
});

test('cancel during save suppresses cache invalidation from late success', async () => {
  const held = deferred(); const f = fixture(url => url === '/api/projects' ? held.promise : undefined);
  const pending = f.task.start(options()); await f.drain();
  assert.equal(f.calls.at(-1).url, '/api/projects'); f.task.cancel();
  held.resolve(response({ project: { id: 'too-late' } })); await pending;
  assert.equal(f.invalidations, 0); assert.equal(f.task.getState().projectId, null);
});

test('save failure remains non-fatal and anonymous task skips save', async () => {
  const f = fixture(url => url === '/api/projects' ? response({}, false, 500) : undefined);
  const pending = f.task.start(options()); await f.drain(); await pending;
  assert.equal(f.task.getState().status, 'completed'); assert.equal(f.task.getState().projectId, null);
  f.context.spaAuth.isLoggedIn = () => false;
  const next = f.task.start(options()); await f.drain(); await next;
  assert.equal(f.calls.filter(c => c.url === '/api/projects').length, 1);
});

test('input/getState snapshots cannot mutate authoritative result or recreate legacy globals', async () => {
  const f = fixture(); const input = options(); const pending = f.task.start(input);
  input.story = 'Changed draft'; input.ratio = '1:1'; input.style.name = 'Changed style';
  f.context.CreationSessionStore.story = 'Another draft';
  await f.drain(); await pending;
  const state = f.task.getState(); state.result.generatedImgs.length = 0;
  for (const key of ['generatedImgs', 'generatedStoryTitles', 'generatedStoryCams', 'generatedPrompts', 'generatedShotData', 'storyboardData', 'isGeneratingStoryboard']) {
    assert.equal(key in f.context, false, `dead global ${key} must stay absent`);
  }
  for (const key of ['generationStatus', 'resolvedVariables', 'finalPrompts', 'storyboardData', 'error']) {
    assert.equal(key in f.context.CreationSessionStore, false, `task state ${key} must not be mirrored into creation`);
  }
  assert.equal(f.task.getState().result.generatedImgs.length, 2);
  assert.equal(f.task.getState().result.generatedPrompts.length, 2);
  assert.equal(f.calls.at(-1).body.metadata.originalStory, 'A small journey');
  assert.equal(f.calls.at(-1).body.style, '預設風格'); assert.equal(f.calls.at(-1).body.ratio, '橫向16:9');
});

test('unsubscribe simulates leave; resubscribe restores running and completed task without new requests', async () => {
  const f = fixture(); const received = [];
  const unsubscribe = f.task.subscribe(s => received.push(s.status));
  const pending = f.task.start(options()); await tick(); unsubscribe();
  const count = received.length; await f.drain(); await pending;
  assert.equal(received.length, count); assert.equal(f.task.getState().status, 'completed');
  let restored;
  const leave = f.task.subscribe(s => { restored = s; }); leave();
  assert.equal(restored.status, 'completed'); assert.equal(restored.result.generatedImgs.length, 2);
  assert.equal(f.calls.length, 4);
  const singleton = f.task; vm.runInContext(taskSource, f.context); assert.equal(f.context.GenerationTask, singleton);
});

test('CreationSessionStore reset and CreationController cleanup cancel app task; idle direct entry is inert', async () => {
  const f = fixture(); assert.equal(f.task.getState().status, 'idle'); assert.equal(f.calls.length, 0);
  for (const reset of [() => f.context.CreationSessionStore.reset(), () => f.context.CreationController.reset(), () => f.task.cleanup()]) {
    const pending = f.task.start(options()); await tick(); const last = f.calls.at(-1);
    reset(); await pending;
    assert.equal(last.signal.aborted, true); assert.equal(f.task.getState().status, 'idle');
    assert.equal(f.timers.size, 0); assert.equal(f.task.getState().result.generatedImgs.length, 0);
  }
});
