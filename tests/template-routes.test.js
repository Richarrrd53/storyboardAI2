const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const plain = value => JSON.parse(JSON.stringify(value));
function routerFixture(path = '/', embedded = false) {
  const events = {};
  const classes = new Set();
  const mounts = [], unmounts = [], errors = [], updates = [];
  const location = { pathname: path.split('?')[0], search: path.includes('?') ? '?' + path.split('?')[1] : '', hash: '', href: 'http://localhost' + path };
  const history = { state: null, writes: [],
    pushState(state, _, url) { this.state = state; this.writes.push({ state, url }); },
    replaceState(state, _, url) { this.state = state; }
  };
  const body = { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } };
  const main = { innerHTML: '<section>landing</section>', className: 'landing-content' };
  const document = { body, addEventListener: (name, fn) => { events[name] = fn; }, querySelectorAll: () => [], getElementById: () => main };
  const window = { location, history, addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener() {},
    spaAuth: { isLoggedIn: () => true },
    PageAssetLoader: { injectCSS: async () => {}, removePageCSS() {}, removePageScripts() {}, injectScripts: async () => [], prefetchAuthResources() {}, prefetchPage() {} },
    PageHost: { captureLanding() {}, prepare() {}, getContent() {}, async mount(context) {
      mounts.push(context);
      return { unmount: () => unmounts.push(context.page), updateRoute: route => updates.push(route), getHistoryState: () => ({ category: 'story', scrollTop: 512 }) };
    } },
    NavigationTransition: { initialize() {}, setLayout() {}, leaveLanding() {}, open: async () => {}, create: () => ({ start: async () => {}, complete: async () => {}, cancel() {}, cleanup() {} }) },
    ProjectOptionMorph: { close() {} }, ProjectsPage: { closeTagModal() {} }, ProjectDeleteQueue: { flushAll() {} },
    GlobalToast: { hideSpaToast() {} }, AppShell: { collapseProjectsGroup() {}, updateRailHoles() {} },
    CreationController: { openQuickCompose() {}, syncRoute() {} }, showSpaToast() {}, scrollTo() {}
  };
  window.parent = embedded ? { location, history, addEventListener() {}, removeEventListener() {} } : window;
  const context = vm.createContext({ window, document, history, URLSearchParams, AbortController, localStorage: { getItem: () => null }, console: { error: (...args) => errors.push(args) }, requestAnimationFrame: fn => fn(), setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/spa-router.js'), 'utf8'), context);
  return { window, events, classes, mounts, unmounts, errors, updates, history, context };
}
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

test('route transitions finish the old page exit before teardown and layout changes', async () => {
  const f = routerFixture('/dashboard');
  await f.events.DOMContentLoaded(); await settle();
  let finishExit;
  f.window.NavigationTransition.create = () => ({ start: () => new Promise(resolve => { finishExit = resolve; }), complete: async () => {}, cleanup() {}, cancel() {} });
  let prepared = false; f.window.PageHost.prepare = () => { prepared = true; };
  const pending = f.window.spaNavigate('generate');
  await settle();
  assert.equal(prepared, false);
  assert.equal(f.unmounts.length, 0);
  finishExit(); await pending;
  assert.equal(prepared, true);
  assert.deepEqual(f.unmounts, ['dashboard']);
  assert.equal(f.mounts.at(-1).page, 'generate');
});

test('template pathname and legacy hash deep links mount the canonical ID', async () => {
  for (const path of ['/template/GiZBQzIH6zA', '/html/index.html', '/']) {
    const f = routerFixture(path);
    if (path === '/html/index.html') f.window.location.hash = '#/template/GiZBQzIH6zA';
    if (path === '/') f.window.location.hash = '#/template?templateId=GiZBQzIH6zA';
    await f.events.DOMContentLoaded(); await settle();
    assert.equal(f.mounts[0].page, 'template');
    assert.equal(f.mounts[0].route.templateId, 'GiZBQzIH6zA');
    assert.deepEqual(f.errors, []);
  }
});

test('public navigation writes canonical URLs and preserves template browse state', async () => {
  const f = routerFixture();
  await f.window.spaNavigate('template');
  await f.window.navigate('template', { templateId: 'ID with 空白' });
  const last = f.history.writes.at(-1);
  assert.equal(last.url, '/template/ID%20with%20%E7%A9%BA%E7%99%BD');
  assert.equal(last.state.templateFromBrowse, true);
  assert.deepEqual(plain(last.state.templateBrowse), { category: 'story', scrollTop: 512 });
  assert.equal(f.mounts.length, 1, 'detail reuses the catalog instance');
  assert.equal(f.updates[0].templateId, 'ID with 空白');
  assert.equal(f.classes.has('is-navigating'), false);
});

test('project deep links and generate template selection use public navigation', async () => {
  const f = routerFixture('/template/old');
  await f.window.navigate('generate', { templateId: 'abc' });
  assert.equal(f.history.writes.at(-1).url, '/#/generate?templateId=abc');
  await f.window.navigate('project', { id: 'abc' });
  assert.equal(f.history.writes.at(-1).url, '/#/project/abc');
  for (const hash of ['', '#/project/abc']) {
    const deep = routerFixture('/project/abc'); deep.window.location.hash = hash;
    await deep.events.DOMContentLoaded(); await settle();
    assert.equal(deep.mounts[0].route.id, 'abc');
  }
});

test('malformed template encodings recover during initialization', async () => {
  const f = routerFixture('/template/%E0%A4%A');
  await f.events.DOMContentLoaded(); await settle();
  assert.equal(f.mounts[0].page, 'template');
  assert.equal(f.mounts[0].route.templateId, '%E0%A4%A');
});

test('embedded navigation writes parent paths and popstate restores detail without adding history', async () => {
  const f = routerFixture('/html/index.html', true);
  await f.window.navigate('generate', { templateId: 'abc' });
  assert.equal(f.history.writes.at(-1).url, '/generate?templateId=abc');
  assert.equal(f.window.location.pathname, '/html/index.html');
  f.events.popstate({ state: { page: 'template', templateId: 'restored', templateBrowse: { query: '咖啡' } } });
  await settle();
  assert.equal(f.history.writes.length, 1);
  assert.equal(f.mounts.at(-1).route.templateId, 'restored');
  assert.equal(f.mounts.at(-1).route.browseState.query, '咖啡');
});

test('guards, same routes and QuickCompose leave navigation state clear', async () => {
  const f = routerFixture();
  await f.window.navigate('dashboard', { openQC: true });
  assert.equal(f.classes.has('is-navigating'), false);
  await f.window.navigate('dashboard');
  await f.window.navigate('dashboard');
  assert.equal(f.mounts.length, 1);
  assert.equal(f.classes.has('is-navigating'), false);
  f.window.spaAuth.isLoggedIn = () => false;
  await f.window.navigate('projects');
  assert.equal(f.mounts.at(-1).page, 'login');
  assert.equal(f.classes.has('is-navigating'), false);
});

test('late mounts unmount only their own instance and cannot clear a newer navigation', async () => {
  const f = routerFixture();
  let resolveOld, resolveNew;
  let oldUnmounts = 0, newUnmounts = 0;
  f.window.PageHost.mount = ({ page }) => new Promise(resolve => {
    if (page === 'projects') resolveOld = resolve;
    else resolveNew = resolve;
  });
  const old = f.window.navigate('projects'); await settle();
  const next = f.window.navigate('history'); await settle();
  resolveOld({ unmount: () => oldUnmounts++ }); await old;
  assert.equal(oldUnmounts, 1);
  assert.equal(newUnmounts, 0);
  assert.equal(f.classes.has('is-navigating'), true);
  resolveNew({ unmount: () => newUnmounts++ }); await next;
  assert.equal(f.classes.has('is-navigating'), false);
  assert.equal(newUnmounts, 0);
});

test('mount errors release navigation state and allow recovery', async () => {
  const f = routerFixture();
  const mount = f.window.PageHost.mount;
  await f.window.navigate('dashboard');
  f.window.PageHost.mount = async () => { throw new Error('fixture failure'); };
  await f.window.navigate('projects');
  assert.equal(f.classes.has('is-navigating'), false);
  assert.equal(f.errors.length, 1);
  f.window.PageHost.mount = mount;
  await f.window.navigate('dashboard');
  assert.equal(f.mounts.length, 2, 'returning to the unmounted previous route must remount it');
});

test('production and development entrypoints both serve template deep links', () => {
  const config = JSON.parse(fs.readFileSync(require.resolve('../vercel.json'), 'utf8'));
  assert.equal(config.rewrites.find(rule => rule.source === '/(.*)').destination, '/main.html');
  assert.match(fs.readFileSync(require.resolve('../server.js'), 'utf8'), /'\/template\/:id'/);
});
