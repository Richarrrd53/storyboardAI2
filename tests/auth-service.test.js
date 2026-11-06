const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/js/features/auth-service.js'), 'utf8');
function setup() {
  const storage = new Map([['spa_auth_token', 'first']]);
  const requests = [];
  let now = 1000;
  const window = { addEventListener() {}, CreationController: { reset() {} }, ProjectStore: { reset() {} }, PageAssetLoader: { clearMemoryCache() {} } };
  vm.runInNewContext(source, { window, atob: value => Buffer.from(value, 'base64').toString('utf8'), Date: { now: () => now }, localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }, fetch: (url, options) => new Promise(resolve => requests.push({url, options, resolve})) });
  const reply = (index, status = 200, user = { id: 'creator' }) => requests[index].resolve({ ok: status === 200, status, json: async () => ({ user }) });
  return { auth: window.spaAuth, requests, storage, reply, advance: ms => { now += ms; } };
}
test('user validation coalesces consumers; abort only detaches one consumer; success has a short TTL', async () => {
  const t = setup(); const abort = new AbortController();
  const first = t.auth.fetchUser(abort.signal), second = t.auth.fetchUser();
  assert.equal(t.requests.length, 1); assert.equal(t.requests[0].options.signal, undefined);
  abort.abort(); assert.equal((await first).aborted, true);
  t.reply(0); assert.equal((await second).user.id, 'creator');
  await t.auth.fetchUser(); assert.equal(t.requests.length, 1);
  t.advance(15001); const expired = t.auth.fetchUser(); assert.equal(t.requests.length, 2); t.reply(1); await expired;
});
test('token changes and out-of-order responses cannot seed the new session cache', async () => {
  const t = setup(); const old = t.auth.fetchUser(); t.storage.set('spa_auth_token', 'second');
  const fresh = t.auth.fetchUser(); t.reply(1, 200, { id: 'new' }); await fresh; t.reply(0); assert.equal((await old).stale, true);
  assert.equal((await t.auth.fetchUser()).user.id, 'new'); assert.equal(t.requests.length, 2);
});
test('unauthorized responses invalidate the token; transient errors never become successful cache entries', async () => {
  const t = setup(); let p = t.auth.fetchUser(); t.reply(0, 503); assert.equal((await p).error, true);
  p = t.auth.fetchUser(); t.reply(1, 401); assert.equal((await p).valid, false);
  assert.equal(t.auth.isLoggedIn(), false); assert.equal(await t.auth.fetchUser(), null);
});
test('forced validation bypasses the TTL but still shares an in-flight validation', async () => {
  const t = setup(); let p = t.auth.fetchUser(); t.reply(0); await p;
  p = t.auth.fetchUser(undefined, { force: true }); const shared = t.auth.fetchUser(undefined, { force: true });
  assert.equal(t.requests.length, 2); t.reply(1); await Promise.all([p, shared]);
});

test('explicit invalidation retires in-flight validations even when the token is unchanged', async () => {
  const t = setup(); const old = t.auth.fetchUser(); t.auth.invalidateUser();
  const fresh = t.auth.fetchUser(); t.reply(1, 200, { id: 'new' }); await fresh;
  t.reply(0); assert.equal((await old).stale, true);
  assert.equal((await t.auth.fetchUser()).user.id, 'new');
});

test('the short validation cache never outlives the token expiry', async () => {
  const t=setup(); t.storage.set('spa_auth_token','header.'+Buffer.from(JSON.stringify({exp:2})).toString('base64url')+'.signature');
  let pending=t.auth.fetchUser(); t.reply(0); await pending;
  t.advance(1001); pending=t.auth.fetchUser(); assert.equal(t.requests.length,2); t.reply(1); await pending;
});
