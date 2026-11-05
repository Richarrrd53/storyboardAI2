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
  assert.equal(CreationSessionStore.targetPhase, 1);

  // Verify navigation to generate Phase 2
  assert.equal(navHistory.length, 1);
  assert.equal(navHistory[0].route, 'generate');
  assert.equal(navHistory[0].opts.fromQC, true);
  assert.equal(navHistory[0].opts.targetPhase, 1);
  assert.equal(navHistory[0].opts.creationIntent, 'new');
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


test('QC derives its labels and entry intents from submitted sessions and task/save state', () => {
  const { win, CreationController: c, CreationSessionStore: s } = setupMockEnvironment();
  let task = { status: 'idle', save: { status: 'idle' }, progress: {} };
  win.GenerationTask = { getState: () => task };
  assert.equal(c.workState().label, '開始創作');
  s.draft.story = 'unsubmitted'; assert.equal(c.workState().label, '繼續輸入'); assert.equal(c.workState().hasWork, false);
  s.story = 'submitted'; s.submitted = true; s.copilot = { busy: true, active: true };
  assert.equal(c.workState().label, '正在構思…');
  s.copilot.busy = false; assert.equal(c.workState().label, '待確認創作方向');
  s.currentPhase = 2; assert.equal(c.workState().label, '創作設定中');
  for (const [patch, label, intent] of [
    [{ status: 'generating', stage: 'planning' }, '正在規劃分鏡', 'resume'],
    [{ stage: 'images', progress: { completed: 4, total: 10 } }, '生成中 · 4/10', 'resume'],
    [{ retry: { retryAt: Date.now() + 10000 } }, '等待自動重試', 'resume'],
    [{ status: 'error' }, '待繼續生成', 'resume'],
    [{ status: 'cancelled' }, '待繼續生成', 'resume'],
    [{ status: 'awaiting_confirmation' }, '待確認文字分鏡', 'resume'],
    [{ status: 'completed', save: { status: 'failed' } }, '待儲存成果', 'view_result'],
    [{ save: { status: 'saved' } }, '開始新創作', 'new']
  ]) { Object.assign(task, patch); assert.equal(c.workState().label, label); assert.equal(c.workState().intent, intent); }
});

test('new creation guards running progress and unsaved results before any destructive reset', async () => {
  const { win, CreationController: c, CreationSessionStore: s } = setupMockEnvironment();
  let resets = 0, prompt = '';
  const task = { status: 'generating', save: { status: 'idle' }, progress: { completed: 4, total: 10 }, result: { generatedShotData: [{}] } };
  win.GenerationTask = { getState: () => task, reset: () => resets++ };
  win.confirm = message => { prompt = message; return false; };
  s.story = 'old'; s.submitted = true; const id = s.sessionId;
  assert.equal(s.reset(), false);
  assert.equal(await c.submitFromQuickCompose('new'), false);
  assert.equal(resets, 0); assert.equal(s.sessionId, id); assert.equal(s.story, 'old');
  assert.match(prompt, /4\/10/); assert.match(prompt, /尚未儲存/);
  task.status = 'completed'; task.save.status = 'failed';
  assert.equal(c.newCreation(), false); assert.equal(resets, 0);
  win.confirm = () => true; assert.equal(c.newCreation(), true);
  assert.equal(resets, 1); assert.notEqual(s.sessionId, id); assert.equal(s.ratio, '直向9:16');
});

test('QC resumes existing work without discussion preparation, task reset or new session', async () => {
  const { win, CreationController: c, CreationSessionStore: s, QuickCompose: qc, navHistory } = setupMockEnvironment();
  qc.mount(); let resets = 0, prepares = 0;
  s.submitted = true; s.story = 'existing'; s.currentPhase = s.targetPhase = 2;
  const id = s.sessionId; s.creativeBrief = { answers: ['keep'] };
  win.GenerationTask = { getState: () => ({ status: 'idle', save: {}, progress: {} }), reset: () => resets++ };
  win.CreativeCopilot = { prepare: () => prepares++ };
  await qc.open();
  assert.equal(navHistory.length, 1); assert.equal(navHistory[0].opts.creationIntent, 'resume');
  assert.equal(navHistory[0].opts.targetPhase, 2); assert.equal(s.sessionId, id);
  assert.equal(resets, 0); assert.equal(prepares, 0); assert.deepEqual(s.creativeBrief.answers, ['keep']);
});

test('saved completion opens an empty QC; same story submission receives a fresh session', async () => {
  const { win, doc, CreationController: c, CreationSessionStore: s, QuickCompose: qc } = setupMockEnvironment();
  qc.mount(); s.story = 'same story'; s.submitted = true; s.draft.story = 'stale story';
  const old = s.sessionId; let task = { status: 'completed', save: { status: 'saved' }, progress: {} };
  win.GenerationTask = { getState: () => task, reset: () => { task = { status: 'idle', save: {}, progress: {} }; } };
  qc.open(); assert.equal(doc.getElementById('qc-story-input').value, ''); assert.notEqual(s.sessionId, old);
  const opened = s.sessionId; await c.submitFromQuickCompose('same story');
  assert.notEqual(s.sessionId, opened); assert.equal(s.story, 'same story'); assert.equal(s.submitted, true);
});

test('entry resolution ignores phase hints on resume and only clears saved results for a general new entry', () => {
  const { win, CreationController: c, CreationSessionStore: s } = setupMockEnvironment();
  s.submitted = true; s.currentPhase = s.targetPhase = 2;
  let task = { status: 'idle', save: {}, progress: {} }; let resets = 0;
  win.GenerationTask = { getState: () => task, reset: () => { resets++; task = { status: 'idle', save: {}, progress: {} }; } };
  assert.equal(c.resolveEntry({ creationIntent: 'resume', targetPhase: 1 }).targetPhase, 2);
  task.status = 'completed'; task.save.status = 'saved';
  c.resolveEntry({ creationIntent: 'view_result' }); assert.equal(resets, 0);
  c.resolveEntry(); assert.equal(resets, 1); assert.equal(s.story, '');
});

test('handoff navigation failure always removes text/shell layers and submission lock', async () => {
  const { doc, CreationController: c } = setupMockEnvironment();
  await assert.rejects(c.submitFromQuickCompose('retained story', { navigate: async () => { throw new Error('mount failed'); } }), /mount failed/);
  assert.equal(c.isSubmitting, false);
  assert.equal(doc.querySelector('.qc-story-flight'), null); assert.equal(doc.querySelector('.qc-workspace-morph'), null);
  assert.equal(doc.body.classList.contains('qc-text-handoff'), false);
});


test('async app confirmation preserves work until accepted and rejects a stale approval', async () => {
  const { win, CreationController: c, CreationSessionStore: s } = setupMockEnvironment();
  s.story = 'in progress'; s.submitted = true;
  let decide; win.confirm = () => new Promise(resolve => { decide = resolve; });
  const old = s.sessionId; const pending = c.newCreation();
  assert.equal(s.sessionId, old); assert.equal(s.story, 'in progress');
  decide(true); assert.equal(await pending, true); assert.notEqual(s.sessionId, old);
  s.submitted = true; const late = c.newCreation(); c.reset(); const fresh = s.sessionId;
  decide(true); assert.equal(await late, false); assert.equal(s.sessionId, fresh);
});


test('stale QC route intents cannot enter a newer session', () => {
  const { CreationController: c, CreationSessionStore: s } = setupMockEnvironment();
  const old = s.sessionId; c.reset();
  assert.equal(c.resolveEntry({ fromQC: true, creationIntent: 'new', sessionId: old }), null);
});
