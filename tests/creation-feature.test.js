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
    value: '',
    disabled: false,
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
    get innerHTML() {
      return '';
    },
    set innerHTML(val) {
      children.length = 0;
      const idMatches = val.match(/id="([^"]+)"/g) || [];
      idMatches.forEach(m => {
        const childId = m.replace('id="', '').replace('"', '');
        const childTag = childId.includes('input') ? 'textarea' : (childId.includes('btn') ? 'button' : 'div');
        const childEl = createMockElement(childTag, childId);
        children.push(childEl);
        childEl.parentElement = el;
        childEl.parentNode = el;
      });
    },
    appendChild(child) {
      if (child.parentElement) {
        child.parentElement.removeChild(child);
      }
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
    addEventListener(evt, fn) {
      if (!eventListeners[evt]) eventListeners[evt] = [];
      eventListeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (!eventListeners[evt]) return;
      const idx = eventListeners[evt].indexOf(fn);
      if (idx !== -1) eventListeners[evt].splice(idx, 1);
    },
    dispatchEvent(evt) {
      const fns = eventListeners[evt.type] || [];
      fns.forEach(f => f(evt));
      return true;
    },
    getBoundingClientRect() {
      return { top: 100, left: 100, width: 300, height: 48, bottom: 148, right: 400 };
    },
    querySelector(sel) {
      function find(node) {
        if (!node) return null;
        if (sel.startsWith('#') && node.id === sel.slice(1)) return node;
        if (sel.startsWith('.') && node.classList.contains(sel.slice(1))) return node;
        for (const c of (node.children || [])) {
          const res = find(c);
          if (res) return res;
        }
        return null;
      }
      for (const c of children) {
        const found = find(c);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll(sel) {
      const matches = [];
      function collect(node) {
        if (!node) return;
        if (sel.startsWith('#') && node.id === sel.slice(1)) matches.push(node);
        if (sel.startsWith('.') && node.classList.contains(sel.slice(1))) matches.push(node);
        for (const c of (node.children || [])) collect(c);
      }
      for (const c of children) collect(c);
      return matches;
    },
    closest(sel) {
      let cur = this;
      while (cur) {
        if (sel.startsWith('#') && cur.id === sel.slice(1)) return cur;
        if (sel.startsWith('.') && cur.classList.contains(sel.slice(1))) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    focus() {},
    blur() {}
  };

  return el;
}

function setupMockEnvironment() {
  const docListeners = {};
  const winListeners = {};

  const documentElement = createMockElement('html');
  const body = createMockElement('body');
  documentElement.appendChild(body);

  const pageMain = createMockElement('main', 'page-main');
  body.appendChild(pageMain);

  const doc = {
    documentElement,
    body,
    createElement: (tag) => createMockElement(tag),
    getElementById: (id) => {
      function find(node) {
        if (!node) return null;
        if (node.id === id) return node;
        for (const child of (node.children || [])) {
          const found = find(child);
          if (found) return found;
        }
        return null;
      }
      return find(documentElement);
    },
    querySelector: (sel) => documentElement.querySelector(sel),
    querySelectorAll: (sel) => documentElement.querySelectorAll(sel),
    addEventListener: (evt, fn) => {
      if (!docListeners[evt]) docListeners[evt] = [];
      docListeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (!docListeners[evt]) return;
      const idx = docListeners[evt].indexOf(fn);
      if (idx !== -1) docListeners[evt].splice(idx, 1);
    },
    dispatchEvent: (evt) => {
      const fns = docListeners[evt.type] || [];
      fns.forEach(f => f(evt));
      return true;
    },
    _docListeners: docListeners
  };

  const navHistory = [];
  const win = {
    document: doc,
    innerWidth: 1024,
    innerHeight: 768,
    scrollY: 0,
    scrollTo: (x, y) => { win.scrollY = y; },
    getComputedStyle: () => ({
      borderRadius: '24px'
    }),
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb) => { cb(); return 1; },
    cancelAnimationFrame: () => {},
    addEventListener: (evt, fn) => {
      if (!winListeners[evt]) winListeners[evt] = [];
      winListeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (!winListeners[evt]) return;
      const idx = winListeners[evt].indexOf(fn);
      if (idx !== -1) winListeners[evt].splice(idx, 1);
    },
    dispatchEvent: (evt) => {
      const fns = winListeners[evt.type] || [];
      fns.forEach(f => f(evt));
      return true;
    },
    navigate: (route, opts) => {
      navHistory.push({ route, opts });
      return Promise.resolve();
    },
    _navHistory: navHistory,
    _winListeners: winListeners
  };

  // Load features/creation.js
  const creationCode = fs.readFileSync(path.join(__dirname, '../public/js/features/creation.js'), 'utf8');
  const creationFn = new Function('window', 'document', 'root', creationCode);
  creationFn(win, doc, win);

  // Load components/quick-compose.js
  const qcCode = fs.readFileSync(path.join(__dirname, '../public/js/components/quick-compose.js'), 'utf8');
  const qcFn = new Function('window', 'document', 'root', qcCode);
  qcFn(win, doc, win);

  return { win, doc, navHistory, CreationController: win.CreationController, CreationSessionStore: win.CreationSessionStore, QuickCompose: win.QuickCompose };
}

test('CreationFeature: Module interface and compatibility bridges', () => {
  const { win, CreationController, CreationSessionStore } = setupMockEnvironment();

  assert.ok(CreationController, 'window.CreationController must exist');
  assert.ok(CreationSessionStore, 'window.CreationSessionStore must exist');
  assert.equal(win.AICreationController, CreationController, 'window.AICreationController must bridge to CreationController');

  assert.equal(typeof CreationController.getState, 'function');
  assert.equal(typeof CreationController.submitFromQuickCompose, 'function');
  assert.equal(typeof CreationController.openWorkspace, 'function');
  assert.equal(typeof CreationController.closeWorkspace, 'function');
  assert.equal(typeof CreationController.reset, 'function');
  assert.equal(typeof CreationController.syncRoute, 'function');

  assert.equal(typeof win.AICreationController.submitToWorkspace, 'function');
  assert.equal(typeof win.AICreationController.openWorkspaceDirectly, 'function');
  assert.equal(typeof win.AICreationController.closeWorkspace, 'function');
});

test('CreationSessionStore: Authoritative single-source-of-truth and reset contract', () => {
  const { CreationSessionStore } = setupMockEnvironment();

  // Test initial shape
  assert.equal(CreationSessionStore.story, '');
  assert.equal(CreationSessionStore.currentPhase, 1);
  assert.equal(CreationSessionStore.targetPhase, 1);
  assert.equal(CreationSessionStore.entryMode, 'full');
  assert.ok(CreationSessionStore.draft, 'draft must exist');

  // Mutate session state
  CreationSessionStore.story = '奇幻冒險故事';
  CreationSessionStore.currentPhase = 2;
  CreationSessionStore.targetPhase = 3;
  CreationSessionStore.draft.story = '草稿內容';

  // Execute reset()
  CreationSessionStore.reset();

  assert.equal(CreationSessionStore.story, '', 'story must be reset to empty');
  assert.equal(CreationSessionStore.currentPhase, 1, 'currentPhase must be reset to 1');
  assert.equal(CreationSessionStore.targetPhase, 1, 'targetPhase must be reset to 1');
  assert.equal(CreationSessionStore.draft.story, '', 'draft.story must be reset');
});

test('CreationController: QuickCompose submit -> Generate route handoff', async () => {
  const { win, doc, navHistory, CreationController, CreationSessionStore, QuickCompose } = setupMockEnvironment();

  QuickCompose.mount();
  const input = doc.getElementById('qc-story-input');
  input.value = '一個關於時間旅行的故事';

  const sendBtn = doc.getElementById('qc-send-btn');
  sendBtn.disabled = false;

  // Trigger click on send button
  sendBtn.dispatchEvent({
    type: 'click',
    preventDefault: () => {},
    stopPropagation: () => {}
  });

  // Verify CreationSessionStore updated
  assert.equal(CreationSessionStore.story, '一個關於時間旅行的故事');
  assert.equal(CreationSessionStore.entryMode, 'quick');
  assert.equal(CreationSessionStore.targetPhase, 2);

  // Verify navigation to generate Phase 2
  assert.equal(navHistory.length, 1);
  assert.equal(navHistory[0].route, 'generate');
  assert.equal(navHistory[0].opts.fromQC, true);
  assert.equal(navHistory[0].opts.targetPhase, 2);
});

test('CreationController: Enter key in textarea triggers submit', () => {
  const { doc, navHistory, CreationSessionStore, QuickCompose } = setupMockEnvironment();

  QuickCompose.mount();
  const input = doc.getElementById('qc-story-input');
  input.value = '微風輕拂的海邊日常';

  // Simulate Enter keydown
  input.dispatchEvent({
    type: 'keydown',
    key: 'Enter',
    shiftKey: false,
    preventDefault: () => {}
  });

  assert.equal(CreationSessionStore.story, '微風輕拂的海邊日常');
  assert.equal(navHistory.length, 1);
  assert.equal(navHistory[0].route, 'generate');
});

test('CreationController: Duplicate submit guard prevents simultaneous submissions', async () => {
  const { CreationController, navHistory } = setupMockEnvironment();

  // First submit
  const p1 = CreationController.submitFromQuickCompose('故事一');
  // Immediate second submit
  const p2 = CreationController.submitFromQuickCompose('故事二');

  const res1 = await p1;
  const res2 = await p2;

  assert.equal(res1, true, 'First submit should succeed');
  assert.equal(res2, false, 'Second submit while busy should be rejected');
  assert.equal(navHistory.length, 1, 'Only one navigation should occur');
});

test('CreationController: CreationSessionStore state persistence across route leave / return', () => {
  const { CreationController, CreationSessionStore } = setupMockEnvironment();

  // Story set
  CreationSessionStore.story = '永恆星際旅程';
  CreationSessionStore.targetPhase = 2;

  // Simulate route change to dashboard
  CreationController.syncRoute('dashboard');
  assert.equal(CreationSessionStore.story, '永恆星際旅程', 'Story must persist when leaving generate');
  assert.equal(CreationController.surfaceState, 'closed');

  // Simulate return to generate
  CreationController.syncRoute('generate', { targetPhase: 2 });
  assert.equal(CreationSessionStore.story, '永恆星際旅程', 'Story must persist when returning to generate');
  assert.equal(CreationController.surfaceState, 'workspace');
});

test('CreationController: Direct Generate entry (openWorkspaceDirectly)', () => {
  const { navHistory, CreationController, CreationSessionStore } = setupMockEnvironment();

  CreationController.openWorkspace({ targetPhase: 1 });

  assert.equal(CreationSessionStore.entryMode, 'full');
  assert.equal(CreationSessionStore.targetPhase, 1);
  assert.equal(navHistory.length, 1);
  assert.equal(navHistory[0].route, 'generate');
  assert.equal(navHistory[0].opts.fromSidebar, true);
  assert.equal(navHistory[0].opts.targetPhase, 1);
});

test('CreationController: Explicit reset & logout reset', () => {
  const { CreationController, CreationSessionStore, QuickCompose } = setupMockEnvironment();

  QuickCompose.mount();
  QuickCompose.open();
  CreationSessionStore.story = '即將被重置的故事';

  assert.equal(QuickCompose.state, 'quick-compose');

  // Execute reset
  CreationController.reset();

  assert.equal(CreationSessionStore.story, '', 'Story must be cleared');
  assert.equal(CreationController.surfaceState, 'closed', 'Surface state must be closed');
  assert.equal(CreationController.isSubmitting, false, 'isSubmitting must be false');
});

test('CreationController: Destroy & remount QuickCompose lifecycle maintains submission ability', async () => {
  const { doc, navHistory, QuickCompose, CreationSessionStore } = setupMockEnvironment();

  QuickCompose.mount();
  QuickCompose.destroy();
  QuickCompose.mount();

  const input = doc.getElementById('qc-story-input');
  input.value = '重新掛載後的故事';

  const sendBtn = doc.getElementById('qc-send-btn');
  sendBtn.dispatchEvent({
    type: 'click',
    preventDefault: () => {},
    stopPropagation: () => {}
  });

  assert.equal(CreationSessionStore.story, '重新掛載後的故事');
  assert.equal(navHistory.length, 1);
});

test('CreationController: Mobile submit updates mobile navigation selector', async () => {
  const { win, navHistory, CreationController } = setupMockEnvironment();

  let mobileNavActive = null;
  win.AppShell = {
    isMobileView: () => true,
    updateMobileBottomNavActive: (route) => {
      mobileNavActive = route;
    }
  };

  await CreationController.submitFromQuickCompose('手機端送出測試');

  assert.equal(mobileNavActive, 'generate', 'Mobile nav active must be set to generate');
  assert.equal(navHistory.length, 1);
  assert.equal(navHistory[0].route, 'generate');
});


test('CreationController snapshot reads QuickCompose UI state and route metadata', () => {
  const { CreationController, QuickCompose } = setupMockEnvironment();
  QuickCompose.mount(); QuickCompose.open();
  const snapshot = CreationController.getState();
  assert.equal(snapshot.surfaceState, 'quick-compose');
  assert.equal(snapshot.previousRoute, QuickCompose.previousRoute);
  assert.equal(snapshot.previousScrollY, QuickCompose.previousScrollY);
  assert.equal(snapshot.lastOpenTime, QuickCompose.lastOpenTime);
  CreationController.reset();
});

test('reset order cancels task, replaces session, then clears QC UI without unbinding', () => {
  const { win, doc, CreationController, CreationSessionStore, QuickCompose } = setupMockEnvironment();
  QuickCompose.mount(); QuickCompose.open();
  const input = doc.getElementById('qc-story-input'); const send = doc.getElementById('qc-send-btn');
  input.value = 'private draft'; send.disabled = false;
  CreationSessionStore.story = 'old story'; CreationSessionStore.draft.story = 'private draft';
  const order = [];
  win.GenerationTask = { reset() { order.push('task'); assert.equal(CreationSessionStore.story, 'old story'); } };
  const resetUI = QuickCompose.reset;
  QuickCompose.reset = () => { order.push('UI'); assert.equal(CreationSessionStore.story, ''); assert.equal(CreationSessionStore.draft.story, ''); resetUI(); };
  CreationController.reset();
  assert.deepEqual(order, ['task', 'UI']); assert.equal(QuickCompose.isMounted, true);
  assert.equal(QuickCompose.state, 'closed'); assert.equal(input.value, ''); assert.equal(send.disabled, true);
  assert.equal(CreationController.lastOpenTime, 0); assert.equal(CreationController.previousRoute, null);
});

test('reset during pending handoff prevents a late navigation completion from rearming UI cleanup', async () => {
  const { doc, CreationController, CreationSessionStore, QuickCompose } = setupMockEnvironment();
  QuickCompose.mount(); QuickCompose.open();
  let finishNavigation;
  const navigation = new Promise(resolve => { finishNavigation = resolve; });
  const pending = CreationController.submitFromQuickCompose('old handoff', { navigate: () => navigation });
  assert.equal(CreationController.isSubmitting, true);
  CreationController.reset(); finishNavigation();
  assert.equal(await pending, false);
  assert.equal(CreationController.isSubmitting, false); assert.equal(CreationSessionStore.story, '');
  assert.equal(QuickCompose.state, 'closed'); assert.equal(doc.getElementById('qc-story-input').value, '');
  assert.equal(doc.getElementById('qc-transition-proxy'), null);
});

test('ordinary route sync closes the actual mobile QC surface without resetting app state', () => {
  const { win, doc, CreationController, CreationSessionStore, QuickCompose } = setupMockEnvironment();
  win.innerWidth = 390; win.matchMedia = () => ({ matches: true });
  win.scrollY = 120;
  let resets = 0; win.GenerationTask = { reset() { resets++; } };
  QuickCompose.mount(); QuickCompose.open();
  CreationSessionStore.story = 'persist across navigation';
  assert.equal(doc.body.style.position, 'fixed');
  CreationController.syncRoute('projects');
  assert.equal(QuickCompose.state, 'closed'); assert.equal(doc.body.style.position, '');
  assert.equal(CreationSessionStore.story, 'persist across navigation'); assert.equal(resets, 0);
});
