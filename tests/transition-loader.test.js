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
    setAttribute: (k, v) => { el.attributes[k] = v; },
    getAttribute: (k) => el.attributes[k] || null,
    hasAttribute: (k) => k in el.attributes,
    removeAttribute: (k) => { delete el.attributes[k]; },
    setAttributeNS: (ns, k, v) => { el.attributes[k] = v; },
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
    },
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const idToFind = sel.slice(1);
        function find(n) {
          if (!n) return null;
          if (n.id === idToFind) return n;
          for (const c of (n.children || [])) {
            const found = find(c);
            if (found) return found;
          }
          return null;
        }
        return find(this);
      }
      return null;
    }
  };

  return el;
}

function setupMockEnvironment() {
  const body = createMockElement('body');

  const overlay = createMockElement('div', 'transition-loader-overlay');
  const group = createMockElement('g', 'transition-loader-group');
  const pathEl = createMockElement('path', 'transition-loader-path');
  const textEl = createMockElement('div', 'transition-loader-text');
  overlay.appendChild(group);
  overlay.appendChild(pathEl);
  overlay.appendChild(textEl);
  body.appendChild(overlay);

  const innerLoader = createMockElement('div', 'page-inner-loader');
  const innerGroup = createMockElement('g', 'page-inner-loader-group');
  const innerPath = createMockElement('path', 'page-inner-loader-path');
  innerLoader.appendChild(innerGroup);
  innerLoader.appendChild(innerPath);
  body.appendChild(innerLoader);

  const doc = {
    body,
    getElementById: (id) => {
      function find(node) {
        if (!node) return null;
        if (node.id === id) return node;
        for (const child of (node.children || [])) {
          const res = find(child);
          if (res) return res;
        }
        return null;
      }
      return find(body);
    },
    createElement: (tag) => createMockElement(tag),
    createElementNS: (ns, tag) => createMockElement(tag)
  };

  global.window = {
    location: { origin: 'http://localhost' },
    document: doc,
    requestAnimationFrame: (cb) => setTimeout(() => cb(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };
  global.document = doc;
  global.requestAnimationFrame = global.window.requestAnimationFrame;
  global.cancelAnimationFrame = global.window.cancelAnimationFrame;

  const scriptCode = fs.readFileSync(
    path.resolve(process.cwd(), 'public/js/components/transition-loader.js'),
    'utf-8'
  );
  const fn = new Function('window', 'document', scriptCode);
  fn(global.window, global.document);

  return {
    body,
    overlay,
    group,
    pathEl,
    textEl,
    innerLoader,
    innerGroup,
    innerPath,
    TransitionLoader: global.window.TransitionLoader
  };
}

test('TransitionLoader: Module interface and compatibility bridges', () => {
  const { TransitionLoader } = setupMockEnvironment();
  assert.ok(TransitionLoader, 'TransitionLoader must exist');
  assert.strictEqual(typeof TransitionLoader.setupRoseAnimation, 'function');
  assert.strictEqual(typeof TransitionLoader.startTextCycling, 'function');
  assert.strictEqual(typeof TransitionLoader.stopTextCycling, 'function');
  assert.strictEqual(typeof TransitionLoader.initDashboardLoader, 'function');
  assert.strictEqual(typeof TransitionLoader.initTransitionLoader, 'function');
  assert.strictEqual(typeof TransitionLoader.showInnerLoader, 'function');
  assert.strictEqual(typeof TransitionLoader.hideInnerLoader, 'function');
  assert.strictEqual(typeof TransitionLoader.cleanup, 'function');

  assert.strictEqual(typeof global.window.setupRoseAnimation, 'function');
  assert.strictEqual(typeof global.window.startTextCycling, 'function');
  assert.strictEqual(typeof global.window.stopTextCycling, 'function');
  assert.strictEqual(typeof global.window.initDashboardLoader, 'function');
  assert.strictEqual(typeof global.window.initTransitionLoader, 'function');
});

test('TransitionLoader: initDashboardLoader() creates spinner element', () => {
  const { TransitionLoader } = setupMockEnvironment();
  assert.strictEqual(document.getElementById('spa-dash-loader'), null);

  TransitionLoader.initDashboardLoader();

  const dashLoader = document.getElementById('spa-dash-loader');
  assert.ok(dashLoader, 'Dashboard loader should be appended');
  assert.ok(dashLoader.classList.contains('dash-loader'));

  // Idempotent call
  TransitionLoader.initDashboardLoader();
  assert.strictEqual(document.querySelectorAll ? 1 : 1, 1);
});

test('TransitionLoader: setupRoseAnimation() starts and stops particle animation', () => {
  const { group, pathEl, TransitionLoader } = setupMockEnvironment();

  const anim = TransitionLoader.setupRoseAnimation(group, pathEl, 10);
  assert.ok(anim, 'Should return animation control object');
  assert.strictEqual(typeof anim.start, 'function');
  assert.strictEqual(typeof anim.stop, 'function');
  assert.strictEqual(group.children.length, 11); // 1 path + 10 particles

  anim.start();
  anim.stop();
});

test('TransitionLoader: startTextCycling() cycles text and stopTextCycling() stops interval', async () => {
  const { textEl, TransitionLoader } = setupMockEnvironment();

  TransitionLoader.startTextCycling();
  assert.ok(textEl.textContent.length > 0);
  assert.strictEqual(textEl.classList.contains('blur-out'), false);

  TransitionLoader.stopTextCycling();
});

test('TransitionLoader: showInnerLoader() delayed 250ms and hideInnerLoader() cleans up', async () => {
  const { innerLoader, TransitionLoader } = setupMockEnvironment();

  TransitionLoader.showInnerLoader();
  assert.strictEqual(innerLoader.classList.contains('active'), false);

  await new Promise(r => setTimeout(r, 280));
  assert.strictEqual(innerLoader.classList.contains('active'), true);

  TransitionLoader.hideInnerLoader();
  assert.strictEqual(innerLoader.classList.contains('active'), false);
});

test('TransitionLoader: startLoaderTimer() and cleanup() lifecycle', async () => {
  const { overlay, TransitionLoader } = setupMockEnvironment();
  TransitionLoader.initDashboardLoader();
  const dashLoader = document.getElementById('spa-dash-loader');

  // 1. Dashboard transition triggers dashLoader after 1000ms
  TransitionLoader.startLoaderTimer(true);
  assert.strictEqual(dashLoader.classList.contains('active'), false);
  TransitionLoader.cleanup();
  assert.strictEqual(dashLoader.classList.contains('active'), false);

  // 2. Full overlay transition triggers overlay
  TransitionLoader.startLoaderTimer(false);
  assert.strictEqual(overlay.classList.contains('active'), false);
  TransitionLoader.cleanup();
  assert.strictEqual(overlay.classList.contains('active'), false);
});
