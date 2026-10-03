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
