const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function createMockElement(tagName = 'div', id = '', className = '') {
  const children = [];
  const classListSet = new Set(className ? className.split(' ').filter(Boolean) : []);
  const style = {
    display: '',
    setProperty: (k, v) => { style[k] = v; },
    removeProperty: (k) => { delete style[k]; }
  };

  const el = {
    tagName: tagName.toUpperCase(),
    id,
    style,
    children,
    textContent: '',
    attributes: {},
    dataset: {},
    setAttribute: (k, v) => { el.attributes[k] = v; },
    getAttribute: (k) => el.attributes[k] || null,
    hasAttribute: (k) => k in el.attributes,
    removeAttribute: (k) => { delete el.attributes[k]; },
    classList: {
      add: (...cls) => cls.forEach(c => classListSet.add(c)),
      remove: (...cls) => cls.forEach(c => classListSet.delete(c)),
      contains: (cls) => classListSet.has(cls)
    },
    get className() {
      return Array.from(classListSet).join(' ');
    },
    set className(val) {
      classListSet.clear();
      (val || '').split(' ').filter(Boolean).forEach(c => classListSet.add(c));
    },
    appendChild(child) {
      children.push(child);
      child.parentElement = this;
      child.parentNode = this;
      setTimeout(() => {
        if (typeof child.onload === 'function') child.onload();
      }, 0);
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentElement = null;
        child.parentNode = null;
      }
      return child;
    },
    remove() {
      const p = this.parentElement || this.parentNode;
      if (p) {
        p.removeChild(this);
      }
    }
  };

  return el;
}

function setupMockEnvironment() {
  const head = createMockElement('head');
  const body = createMockElement('body');

  const doc = {
    head,
    body,
    getElementById: (id) => null,
    createElement: (tag) => createMockElement(tag),
    querySelectorAll: (sel) => {
      const results = [];
      function search(node) {
        if (!node) return;
        if (sel.includes('link[data-spa-sheet]') && node.tagName === 'LINK' && node.dataset.spaSheet) {
          results.push(node);
        }
        for (const c of (node.children || [])) {
          search(c);
        }
      }
      search(head);
      search(body);
      return results;
    },
    querySelector: (sel) => {
      let found = null;
      function search(node) {
        if (!node || found) return;
        if (sel.includes('script[data-spa-script]') && node.tagName === 'SCRIPT' && node.dataset.spaScript) {
          found = node;
          return;
        }
        for (const c of (node.children || [])) {
          search(c);
        }
      }
      search(head);
      search(body);
      return found;
    }
  };

  global.window = {
    location: { origin: 'http://localhost', href: 'http://localhost/' },
    document: doc,
    htmlMemoryCache: {},
    DOMParser: class {
      parseFromString(html, type) {
        const parsed = createMockElement('html');
        parsed.innerHTML = html;
        return parsed;
      }
    }
  };
  global.document = doc;
  global.DOMParser = global.window.DOMParser;
  global.fetch = async (url) => {
    return {
      ok: true,
      text: async () => `<html><body><div id="mock-page">${url}</div></body></html>`,
      json: async () => ([])
    };
  };

  const scriptCode = fs.readFileSync(
    path.resolve(process.cwd(), 'public/js/features/page-asset-loader.js'),
    'utf-8'
  );
  const fn = new Function('window', 'document', scriptCode);
  fn(global.window, global.document);

  return { head, body, PageAssetLoader: global.window.PageAssetLoader };
}

test('PageAssetLoader: Module interface and compatibility bridges', () => {
  const { PageAssetLoader } = setupMockEnvironment();
  assert.ok(PageAssetLoader, 'PageAssetLoader must exist');
  assert.strictEqual(typeof PageAssetLoader.injectCSS, 'function');
  assert.strictEqual(typeof PageAssetLoader.removePageCSS, 'function');
  assert.strictEqual(typeof PageAssetLoader.injectScript, 'function');
  assert.strictEqual(typeof PageAssetLoader.injectScripts, 'function');
  assert.strictEqual(typeof PageAssetLoader.removePageScripts, 'function');
  assert.strictEqual(typeof PageAssetLoader.fetchPageDoc, 'function');
  assert.strictEqual(typeof PageAssetLoader.prefetchPage, 'function');
  assert.strictEqual(typeof PageAssetLoader.prefetchAuthResources, 'function');

  assert.strictEqual(typeof global.window.injectCSS, 'function');
  assert.strictEqual(typeof global.window.removePageCSS, 'function');
  assert.strictEqual(typeof global.window.injectScript, 'function');
  assert.strictEqual(typeof global.window.injectScripts, 'function');
  assert.strictEqual(typeof global.window.fetchPageDoc, 'function');
});

test('PageAssetLoader: injectCSS() and removePageCSS() lifecycle', async () => {
  const { head, PageAssetLoader } = setupMockEnvironment();

  await PageAssetLoader.injectCSS('/css/dashboard.css');
  assert.strictEqual(head.children.length, 1);
  assert.strictEqual(head.children[0].dataset.spaSheet, '1');

  // Dedup subsequent load
  await PageAssetLoader.injectCSS('/css/dashboard.css');
  assert.strictEqual(head.children.length, 1);

  await PageAssetLoader.injectCSS('/css/generate.css');
  assert.strictEqual(head.children.length, 2);

  // Remove dashboard CSS keeping generate CSS
  PageAssetLoader.removePageCSS(['/css/generate.css']);
  assert.strictEqual(head.children.length, 1);
  assert.strictEqual(head.children[0].href, '/css/generate.css');
});

test('PageAssetLoader: injectScript() appends script and deduplicates', async () => {
  const { body, PageAssetLoader } = setupMockEnvironment();

  const loaded = await PageAssetLoader.injectScript('/js/sample.js');
  assert.strictEqual(loaded, true);
  assert.strictEqual(body.children.length, 1);
  assert.strictEqual(body.children[0].dataset.spaScript, '1');

  // Dedup subsequent call
  const reloaded = await PageAssetLoader.injectScript('/js/sample.js');
  assert.strictEqual(reloaded, true);
  assert.strictEqual(body.children.length, 1);
});

test('PageAssetLoader: injectScripts() loads array of scripts', async () => {
  const { PageAssetLoader } = setupMockEnvironment();

  const results = await PageAssetLoader.injectScripts(['/js/a.js', '/js/b.js']);
  assert.deepStrictEqual(results, [true, true]);
});

test('PageAssetLoader: fetchPageDoc() caches parsed DOM in memory', async () => {
  const { PageAssetLoader } = setupMockEnvironment();

  const doc1 = await PageAssetLoader.fetchPageDoc('/html/projects.html');
  assert.ok(doc1, 'Document should be parsed');
  assert.strictEqual(global.window.htmlMemoryCache['/html/projects.html'], doc1);

  // Subsequent fetch returns memory cache directly without network
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; };
  const doc2 = await PageAssetLoader.fetchPageDoc('/html/projects.html');
  assert.strictEqual(doc2, doc1);
  assert.strictEqual(fetchCalled, false);
});

test('PageAssetLoader: prefetchPage() and prefetchAuthResources()', async () => {
  const { PageAssetLoader } = setupMockEnvironment();

  let fetchedUrls = [];
  global.fetch = async (url) => {
    fetchedUrls.push(url);
    return {
      ok: true,
      text: async () => '<html></html>',
      json: async () => ([])
    };
  };

  await PageAssetLoader.prefetchPage('projects');
  assert.ok(fetchedUrls.some(u => u.includes('/html/projects.html')));

  global.window.spaAuth = {
    isLoggedIn: () => false
  };
  PageAssetLoader.prefetchAuthResources();
  assert.ok(fetchedUrls.some(u => u.includes('/html/login.html')));
});

test('session cache clearing preserves loaded CSS/JS and rejects late catalog responses', async () => {
  const { body, PageAssetLoader } = setupMockEnvironment();
  await PageAssetLoader.injectCSS('/css/sample.css');
  await PageAssetLoader.injectScript('/js/sample.js');
  let release;
  global.fetch = () => new Promise(resolve => { release = resolve; });
  const old = PageAssetLoader.fetchTemplates();
  const rejected = assert.rejects(old, { name: 'AbortError' });
  PageAssetLoader.clearMemoryCache();
  release({ ok: true, json: async () => [{ id: 'old-session' }] });
  await rejected;
  assert.equal(window.cacheTemplatesList, null);
  assert.equal(PageAssetLoader.loadedCSS.has('/css/sample.css'), true);
  assert.equal(PageAssetLoader.loadedScripts.has('/js/sample.js'), true);
  await PageAssetLoader.injectScript('/js/sample.js');
  assert.equal(body.children.length, 1);
  global.fetch = async () => ({ ok: true, json: async () => [{ id: 'new-session' }] });
  assert.equal((await PageAssetLoader.fetchTemplates())[0].id, 'new-session');
});

test('aborted catalog consumers cannot poison a shared prefetch or overwrite invalidated data', async () => {
  const { PageAssetLoader } = setupMockEnvironment();
  let release;
  global.fetch = () => new Promise(resolve => { release = resolve; });
  const prefetch = PageAssetLoader.fetchTemplates();
  const controller = new AbortController();
  const consumer = PageAssetLoader.fetchTemplates(controller.signal);
  controller.abort();
  await assert.rejects(consumer, { name: 'AbortError' });
  release({ ok: true, json: async () => [{ id: 'shared' }] });
  await prefetch;
  assert.equal(window.cacheTemplatesList[0].id, 'shared');
  window.cacheTemplatesList = null;
  const stale = PageAssetLoader.fetchTemplates();
  const rejected = assert.rejects(stale, { name: 'AbortError' });
  window.cacheTemplatesList = [{ id: 'replacement' }];
  release({ ok: true, json: async () => [{ id: 'stale' }] });
  await rejected;
  assert.equal(window.cacheTemplatesList[0].id, 'replacement');
});

test('late HTML responses cannot repopulate a cleared session cache', async () => {
  const { PageAssetLoader } = setupMockEnvironment();
  let release;
  global.fetch = () => new Promise(resolve => { release = resolve; });
  const old = PageAssetLoader.fetchPageDoc('/html/dashboard.html');
  const rejected = assert.rejects(old, { name: 'AbortError' });
  PageAssetLoader.clearMemoryCache();
  release({ ok: true, text: async () => '<main>stale</main>' });
  await rejected;
  assert.equal(window.htmlMemoryCache['/html/dashboard.html'], undefined);
});

test('concurrent script consumers await real completion and execute dependencies in order', async () => {
  const { body, PageAssetLoader } = setupMockEnvironment();
  body.appendChild = script => { body.children.push(script); };
  const first = PageAssetLoader.injectScript('/js/a.js');
  const controller = new AbortController();
  const aborted = PageAssetLoader.injectScript('/js/a.js', controller.signal);
  let ready = false;
  const second = PageAssetLoader.injectScripts(['/js/a.js', '/js/b.js']).then(() => { ready = true; });
  controller.abort();
  assert.equal(await aborted, false);
  assert.equal(ready, false);
  assert.equal(body.children.length, 1);
  body.children[0].onload(); await first;
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(body.children.length, 2);
  assert.equal(ready, false);
  body.children[1].onload(); await second;
  assert.equal(ready, true);
});

function authFixture() {
  const vm = require('node:vm');
  const storage = new Map([['spa_auth_token', 'old-token']]);
  let resets = 0, clears = 0;
  const window = { CreationController: { reset() { resets++; } },
    ProjectStore: { reset() {}, invalidateProjectDetail() {}, invalidateProjects() {} },
    PageAssetLoader: { clearMemoryCache() { clears++; } }, location: {}, spaNavigate: async () => {} };
  window.parent = window;
  const context = vm.createContext({ window, document: { getElementById: () => null, body: { classList: { remove() {} } } },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: async () => ({ ok: true, json: async () => ({ token: 'new-token' }) }) });
  vm.runInContext(fs.readFileSync(path.resolve('public/js/features/auth-service.js'), 'utf8'), context);
  return { window, context, storage, resets: () => resets, clears: () => clears };
}

test('late session validation cannot log out a newer login and empty social login is rejected', async () => {
  const f = authFixture();
  let release;
  f.context.fetch = url => url === '/api/auth/me' ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ ok: true, json: async () => ({ token: 'new-token' }) });
  const oldUser = f.window.spaAuth.fetchUser();
  await f.window.spaAuth.login('creator@example.test', 'password123');
  release({ ok: false, status: 401 });
  assert.equal((await oldUser).stale, true);
  assert.equal(f.storage.get('spa_auth_token'), 'new-token');
  assert.equal(f.resets(), 1);
  assert.equal(f.clears(), 1);
  await assert.rejects(f.window.spaAuth.login());
});

test('logout invalidates a pending login and registration establishes one clean session', async () => {
  const f = authFixture();
  let release;
  f.context.fetch = url => url === '/api/auth/login' ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ ok: true, json: async () => ({ token: 'registered-token' }) });
  const pending = f.window.spaAuth.login('creator@example.test', 'password123');
  const rejected = assert.rejects(pending, /登入已取消/);
  await f.window.spaAuth.logout();
  release({ ok: true, json: async () => ({ token: 'late-token' }) });
  await rejected;
  assert.equal(f.storage.has('spa_auth_token'), false);
  await f.window.spaAuth.register('創作者', 'creator@example.test', 'password123');
  assert.equal(f.storage.get('spa_auth_token'), 'registered-token');
  assert.equal(f.resets(), 2);
  assert.equal(f.clears(), 2);
});
