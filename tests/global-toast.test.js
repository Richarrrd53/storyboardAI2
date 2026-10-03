const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function createMockElement(tagName = 'div', id = '', className = '') {
  const children = [];
  const eventListeners = {};
  const dataset = {};
  const classListSet = new Set(className ? className.split(' ').filter(Boolean) : []);
  const style = {
    display: '',
    setProperty: (k, v) => { style[k] = v; },
    removeProperty: (k) => { delete style[k]; }
  };

  const el = {
    tagName: tagName.toUpperCase(),
    id,
    dataset,
    style,
    children,
    textContent: '',
    attributes: {},
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
    click() {
      if (typeof this.onclick === 'function') {
        this.onclick({ preventDefault: () => {} });
      }
    }
  };

  return el;
}

function setupMockEnvironment() {
  const elements = new Map();

  const body = createMockElement('body');
  const globalToast = createMockElement('div', 'global-toast', 'global-toast');
  const globalToastText = createMockElement('span', 'global-toast-text');
  const globalToastUndo = createMockElement('button', 'global-toast-undo');
  globalToast.appendChild(globalToastText);
  globalToast.appendChild(globalToastUndo);

  const authToast = createMockElement('div', 'toast', 'toast');

  body.appendChild(globalToast);
  body.appendChild(authToast);

  elements.set('global-toast', globalToast);
  elements.set('global-toast-text', globalToastText);
  elements.set('global-toast-undo', globalToastUndo);
  elements.set('toast', authToast);

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
    createElement: (tag) => createMockElement(tag)
  };

  global.window = {
    location: { origin: 'http://localhost' },
    document: doc
  };
  global.document = doc;

  const scriptCode = fs.readFileSync(
    path.resolve(process.cwd(), 'public/js/components/global-toast.js'),
    'utf-8'
  );
  const fn = new Function('window', 'document', scriptCode);
  fn(global.window, global.document);

  return { globalToast, globalToastText, globalToastUndo, authToast, GlobalToast: global.window.GlobalToast };
}

test('GlobalToast: Module interface and compatibility bridges', () => {
  const { GlobalToast } = setupMockEnvironment();
  assert.ok(GlobalToast, 'GlobalToast must exist');
  assert.strictEqual(typeof GlobalToast.showSpaToast, 'function');
  assert.strictEqual(typeof GlobalToast.showToast, 'function');
  assert.strictEqual(typeof GlobalToast.dismissAll, 'function');
  assert.strictEqual(typeof global.window.showSpaToast, 'function');
  assert.strictEqual(typeof global.window.showToast, 'function');
});

test('GlobalToast: showSpaToast() displays message and adds .show class', () => {
  const { globalToast, globalToastText, GlobalToast } = setupMockEnvironment();

  GlobalToast.showSpaToast('分鏡已建立', null, 3000);

  assert.strictEqual(globalToastText.textContent, '分鏡已建立');
  assert.ok(globalToast.classList.contains('show'));
});

test('GlobalToast: showSpaToast() handles onUndo callback and dismisses on click', () => {
  const { globalToast, globalToastUndo, GlobalToast } = setupMockEnvironment();

  let undoClicked = false;
  GlobalToast.showSpaToast('已刪除分鏡', () => {
    undoClicked = true;
  }, 5000);

  assert.strictEqual(globalToastUndo.style.display, '');

  globalToastUndo.click();

  assert.strictEqual(undoClicked, true);
  assert.strictEqual(globalToast.classList.contains('show'), false);
});

test('GlobalToast: showSpaToast() auto-dismisses after duration', async () => {
  const { globalToast, GlobalToast } = setupMockEnvironment();

  GlobalToast.showSpaToast('短暫提示', null, 30);
  assert.ok(globalToast.classList.contains('show'));

  await new Promise(r => setTimeout(r, 60));
  assert.strictEqual(globalToast.classList.contains('show'), false);
});

test('GlobalToast: showToast() manages #toast element and fallback', async () => {
  const { authToast, globalToast, GlobalToast } = setupMockEnvironment();

  GlobalToast.showToast('電子信箱不能為空', 30);
  assert.strictEqual(authToast.textContent, '電子信箱不能為空');
  assert.ok(authToast.classList.contains('show'));

  await new Promise(r => setTimeout(r, 60));
  assert.strictEqual(authToast.classList.contains('show'), false);

  // Fallback when #toast removed
  authToast.remove();
  GlobalToast.showToast('回退到 global toast', 30);
  assert.ok(globalToast.classList.contains('show'));
});

test('GlobalToast: dismissAll() clears all active toasts immediately', () => {
  const { globalToast, authToast, GlobalToast } = setupMockEnvironment();

  GlobalToast.showSpaToast('測試', null, 5000);
  GlobalToast.showToast('測試登入', 5000);
  assert.ok(globalToast.classList.contains('show'));
  assert.ok(authToast.classList.contains('show'));

  GlobalToast.dismissAll();
  assert.strictEqual(globalToast.classList.contains('show'), false);
  assert.strictEqual(authToast.classList.contains('show'), false);
});
