const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup() {
  const ctx = { console: { error() {} }, setTimeout, clearTimeout, module: { exports: {} } };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync('public/js/features/projects.js', 'utf8'), ctx);
  const { api, store, actions, deleteQueue } = ctx.module.exports;
  store.fetchProjects = async () => ({ ok: true });
  return { ctx, api, store, actions, deleteQueue };
}

test('restore uses one deferred confirmation across repeated intents; cancel makes zero requests', async () => {
  const e = setup(); let confirms = 0, restores = 0; let answer = deferred();
  e.ctx.confirm = () => { confirms++; return answer.promise; };
  e.api.restoreProject = async () => { restores++; return { ok: true }; };
  const p = { id: 'deleted', is_deleted: true };
  const a = e.actions.restoreProject(p), b = e.actions.restoreProject(p);
  assert.equal(a, b); assert.equal(confirms, 1); assert.equal(restores, 0); assert.equal(p.is_deleted, true);
  answer.resolve(false); assert.equal(await a, false); assert.equal(restores, 0);
  answer = deferred(); const retry = e.actions.restoreProject(p); answer.resolve(true);
  assert.equal(await retry, true); assert.equal(confirms, 2); assert.equal(restores, 1); assert.equal(p.is_deleted, false);
});

test('restore acceptance after session reset does not mutate or send an API', async () => {
  const e = setup(); const answer = deferred(); let calls = 0;
  e.ctx.confirm = () => answer.promise; e.api.restoreProject = async () => { calls++; return { ok: true }; };
  const p = { id: 'stale', is_deleted: true }; const result = e.actions.restoreProject(p);
  e.store.reset(); answer.resolve(true); assert.equal(await result, false); assert.equal(calls, 0); assert.equal(p.is_deleted, true);
});

test('restore failed API rolls optimistic state back and alerts once', async () => {
  const e = setup(); let alerts = 0, calls = 0; e.ctx.confirm = async () => true; e.ctx.alert = () => { alerts++; };
  e.api.restoreProject = async () => { calls++; return { ok: false }; };
  const p = { id: 'rollback', is_deleted: true };
  assert.equal(await e.actions.restoreProject(p), false); assert.equal(calls, 1); assert.equal(p.is_deleted, true);
  assert.equal(e.deleteQueue.recentlyRestored.has(p.id), false); assert.equal(alerts, 1);
});

test('rename is asynchronous, deduplicates, trims, retains API failure for retry and never invokes native prompt', async () => {
  const e = setup(); const result = deferred(); let options, calls = 0;
  e.ctx.prompt = () => { throw new Error('native prompt must not be called'); };
  e.ctx.DialogService = { prompt: opts => { options = opts; return result.promise; } };
  e.api.renameProject = async (id, title) => { assert.equal(title, '新標題'); calls++; return calls === 1 ? { ok: false, data: { error: '503' } } : { ok: true }; };
  const p = { id: 'rename', title: '原標題' }; const task = e.actions.renameProject(p);
  assert.equal(e.actions.renameProject(p), task); assert.equal(calls, 0); assert.equal(options.value, '原標題');
  assert.ok(options.validate('   ')); assert.equal(options.validate('新標題'), '');
  await assert.rejects(options.onSubmit(' 新標題 '), /503/); assert.equal(p.title, '原標題');
  await options.onSubmit(' 新標題 '); result.resolve({ confirmed: true, value: ' 新標題 ' });
  assert.equal(await task, true); assert.equal(calls, 2); assert.equal(p.title, '新標題');
});

test('rename same title and cancellation each make zero PATCH requests', async () => {
  const e = setup(); let calls = 0; e.api.renameProject = async () => { calls++; return { ok: true }; };
  const p = { id: 'same', title: '相同名稱' };
  e.ctx.DialogService = { prompt: async opts => { await opts.onSubmit(' 相同名稱 '); return { confirmed: true }; } };
  assert.equal(await e.actions.renameProject(p), false);
  e.ctx.DialogService = { prompt: async () => ({ confirmed: false, reason: 'escape' }) };
  assert.equal(await e.actions.renameProject(p), false); assert.equal(calls, 0);
});

test('rename late API response after reset cannot change old project', async () => {
  const e = setup(); const response = deferred(); let options;
  e.ctx.DialogService = { prompt: opts => { options = opts; return Promise.resolve({ confirmed: false }); } };
  const p = { id: 'late', title: 'old' }; await e.actions.renameProject(p);
  e.api.renameProject = () => response.promise;
  const submit = options.onSubmit('new'); e.store.reset(); response.resolve({ ok: true });
  await assert.rejects(submit, /工作階段/); assert.equal(p.title, 'old');
});
