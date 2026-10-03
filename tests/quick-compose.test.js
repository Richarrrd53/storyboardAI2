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
      // Extract IDs from template to simulate child presence
      const idMatches = val.match(/id="([^"]+)"/g) || [];
      idMatches.forEach(m => {
        const childId = m.replace('id="', '').replace('"', '');
        const childTag = childId.includes('input') ? 'textarea' : (childId.includes('btn') ? 'button' : 'div');
        const childEl = createMockElement(childTag, childId);
        if (childId === 'qc-sugg-tray') {
          childEl.style.display = 'none';
        }
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
    querySelector: (sel) => {
      return documentElement.querySelector(sel);
    },
    querySelectorAll: (sel) => {
      return documentElement.querySelectorAll(sel);
    },
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

  const win = {
    document: doc,
    innerWidth: 1024,
    innerHeight: 768,
    scrollY: 0,
    scrollTo: (x, y) => { win.scrollY = y; },
    getComputedStyle: () => ({
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontWeight: 'normal',
      lineHeight: '1.4',
      letterSpacing: 'normal',
      paddingTop: '8px',
      paddingBottom: '8px',
      paddingLeft: '12px',
      paddingRight: '12px'
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
    _docListeners: docListeners,
    _winListeners: winListeners
  };

  global.window = win;
  global.document = doc;
  global.requestAnimationFrame = win.requestAnimationFrame;
  global.cancelAnimationFrame = win.cancelAnimationFrame;

  const quickComposeCode = fs.readFileSync(path.join(__dirname, '../public/js/components/quick-compose.js'), 'utf8');
  eval(quickComposeCode);

  return { doc, win, QuickCompose: win.QuickCompose };
}

test('QuickCompose: Module interface and compatibility bridges', () => {
  const { win, QuickCompose } = setupMockEnvironment();

  assert.ok(QuickCompose, 'QuickCompose should be defined on window');
  assert.equal(typeof QuickCompose.mount, 'function');
  assert.equal(typeof QuickCompose.destroy, 'function');
  assert.equal(typeof QuickCompose.open, 'function');
  assert.equal(typeof QuickCompose.close, 'function');
  assert.equal(typeof QuickCompose.toggle, 'function');
  assert.equal(typeof QuickCompose.ensureDOM, 'function');
  assert.equal(typeof QuickCompose.mountCapsule, 'function');
  assert.equal(typeof QuickCompose.updateLayerState, 'function');
  assert.equal(typeof QuickCompose.autoGrow, 'function');
  assert.equal(typeof QuickCompose.fillSuggestion, 'function');
  assert.equal(typeof QuickCompose.toggleMoreSuggestions, 'function');
  assert.equal(typeof QuickCompose.updateProgress, 'function');
  assert.equal(typeof QuickCompose.triggerPulse, 'function');

  // Global compatibility bridges
  assert.equal(typeof win.autoGrowQCInput, 'function');
  assert.equal(typeof win.fillQuickSugg, 'function');
  assert.equal(typeof win.toggleQuickMoreSuggestions, 'function');
  assert.equal(typeof win.mountAICreationCapsule, 'function');
  assert.equal(typeof win.ensureAICreationLayerDOM, 'function');
  assert.equal(typeof win.ensureAIDockDOM, 'function');
  assert.equal(typeof win.updateAICreationLayerState, 'function');
  assert.equal(typeof win.updateAIDockState, 'function');
  assert.equal(typeof win.triggerCapsulePulse, 'function');
  assert.equal(typeof win.updateGlobalPillProgress, 'function');
});

test('QuickCompose: Singleton and mount idempotency', () => {
  const { doc, QuickCompose } = setupMockEnvironment();

  // First mount
  QuickCompose.mount();
  const layer1 = doc.getElementById('ai-creation-layer');
  const capsule1 = doc.getElementById('global-create-capsule');
  assert.ok(layer1, 'ai-creation-layer should be created');
  assert.ok(capsule1, 'global-create-capsule should be created');

  // Second mount (idempotency check)
  QuickCompose.mount();
  const layerCount = doc.body.children.filter(c => c.id === 'ai-creation-layer').length;
  const capsuleCount = doc.body.children.filter(c => c.id === 'global-create-capsule').length;
  assert.equal(layerCount, 1, 'ai-creation-layer must not be duplicated on repeated mount');
  assert.equal(capsuleCount, 1, 'global-create-capsule must not be duplicated on repeated mount');
});

test('QuickCompose: Desktop vs Mobile placement', () => {
  const { doc, win, QuickCompose } = setupMockEnvironment();

  // 1. Desktop placement: capsule attached to document.body
  win.isMobileView = () => false;
  QuickCompose.mount();
  const capsule = doc.getElementById('global-create-capsule');
  assert.equal(capsule.parentElement, doc.body, 'On desktop, capsule must be inside document.body');

  // 2. Mobile placement: capsule moved to #mob-nav-generate
  const mobGen = createMockElement('div', 'mob-nav-generate');
  doc.body.appendChild(mobGen);
  win.isMobileView = () => true;

  QuickCompose.mountCapsule();
  assert.equal(capsule.parentElement, mobGen, 'On mobile, capsule must be moved inside #mob-nav-generate');

  // 3. Switch back to desktop: capsule restored to document.body
  win.isMobileView = () => false;
  QuickCompose.mountCapsule();
  assert.equal(capsule.parentElement, doc.body, 'On desktop, capsule must be restored to document.body');
});

test('QuickCompose: UI State Machine and Expand / Collapse lifecycle', (t, done) => {
  const { doc, QuickCompose } = setupMockEnvironment();
  QuickCompose.mount();

  const capsule = doc.getElementById('global-create-capsule');
  const layer = doc.getElementById('ai-creation-layer');

  assert.equal(QuickCompose.state, 'closed', 'Initial state must be closed');

  // Expand
  QuickCompose.open();
  assert.equal(QuickCompose.state, 'quick-compose', 'State must become quick-compose after open()');
  assert.ok(capsule.classList.contains('is-expanded'), 'Capsule must have is-expanded class');
  assert.ok(layer.classList.contains('state-quick-compose'), 'Layer must have state-quick-compose class');
  assert.ok(doc.body.classList.contains('ai-quick-compose-active'), 'Body must have ai-quick-compose-active class');

  // Collapse (force)
  QuickCompose.close(true);
  assert.equal(QuickCompose.state, 'closed', 'State must immediately become closed with force=true');
  assert.ok(!capsule.classList.contains('is-expanded'), 'Capsule must not have is-expanded class');
  assert.ok(layer.classList.contains('state-closed'), 'Layer must have state-closed class');

  // Animated Collapse
  QuickCompose.open();
  QuickCompose.lastOpenTime = Date.now() - 500; // bypass 300ms debounce
  QuickCompose.close(false);
  assert.equal(QuickCompose.state, 'closing', 'State must enter closing during animated close');
  assert.ok(capsule.classList.contains('is-closing'), 'Capsule must have is-closing class');
  assert.ok(layer.classList.contains('state-closing'), 'Layer must have state-closing class');

  setTimeout(() => {
    assert.equal(QuickCompose.state, 'closed', 'State must finish closing and return to closed');
    assert.ok(!capsule.classList.contains('is-closing'), 'Capsule must remove is-closing class');
    done();
  }, 600);
});

test('QuickCompose: Suggestions interaction', () => {
  const { doc, QuickCompose } = setupMockEnvironment();
  QuickCompose.mount();

  const input = doc.getElementById('qc-story-input');
  const sendBtn = doc.getElementById('qc-send-btn');
  const tray = doc.getElementById('qc-sugg-tray');
  const moreTrigger = doc.getElementById('qc-sugg-more-trigger');

  // Suggestion click
  const mockChip = { textContent: '科技短影音' };
  QuickCompose.fillSuggestion(mockChip);

  assert.equal(input.value, '科技短影音', 'Input value must be populated from chip text');
  assert.equal(sendBtn.disabled, false, 'Send button must be enabled when input has text');
  assert.equal(sendBtn.getAttribute('data-active'), 'true', 'Send button data-active must be true');

  // Toggle more suggestions
  assert.equal(tray.style.display, 'none', 'Tray should initially be hidden');
  QuickCompose.toggleMoreSuggestions();
  assert.equal(tray.style.display, 'flex', 'Tray should be visible after toggle');
  assert.equal(moreTrigger.textContent, '－更少', 'Trigger text should become －更少');

  QuickCompose.toggleMoreSuggestions();
  assert.equal(tray.style.display, 'none', 'Tray should be hidden after second toggle');
  assert.equal(moreTrigger.textContent, '＋更多', 'Trigger text should become ＋更多');
});

test('QuickCompose: Escape key closes active QuickCompose', () => {
  const { doc, QuickCompose } = setupMockEnvironment();
  QuickCompose.mount();

  QuickCompose.open();
  assert.equal(QuickCompose.state, 'quick-compose');

  // Bypass 300ms debounce
  QuickCompose.lastOpenTime = Date.now() - 500;

  // Simulate Escape keypress
  doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.ok(QuickCompose.state === 'closing' || QuickCompose.state === 'closed', 'Escape key must close QuickCompose');
});

test('QuickCompose: Progress presentation and pulse', () => {
  const { doc, QuickCompose } = setupMockEnvironment();
  QuickCompose.mount();

  const trigger = doc.getElementById('global-create-trigger');
  const progressFill = doc.getElementById('gct-progress-fill');
  const gctText = doc.getElementById('gct-text');

  // Generating at 45%
  QuickCompose.updateProgress(45, true);
  assert.ok(trigger.classList.contains('is-generating'), 'Trigger should have is-generating class');
  assert.equal(progressFill.style.width, '45%', 'Progress fill width should match percentage');
  assert.ok(gctText.textContent.includes('45%'), 'Text should contain percentage');

  // Completed at 100%
  QuickCompose.updateProgress(100, false);
  assert.ok(!trigger.classList.contains('is-generating'), 'Trigger should remove is-generating class');
  assert.equal(gctText.textContent, '分鏡已完成', 'Text should display completed message');
});

test('QuickCompose: Listener lifecycle & clean destroy()', () => {
  const { win, doc, QuickCompose } = setupMockEnvironment();
  QuickCompose.mount();

  assert.equal(QuickCompose.isMounted, true, 'isMounted should be true after mount()');
  assert.ok((win._winListeners['resize'] || []).length > 0, 'Resize listener should be registered');
  assert.ok((doc._docListeners['keydown'] || []).length > 0, 'Keydown listener should be registered');

  QuickCompose.destroy();

  assert.equal(QuickCompose.isMounted, false, 'isMounted should be false after destroy()');
  assert.equal((win._winListeners['resize'] || []).length, 0, 'Resize listener must be unregistered');
  assert.equal((doc._docListeners['keydown'] || []).length, 0, 'Keydown listener must be unregistered');
});

test('AICreationController: Integration & delegation with QuickCompose', () => {
  const { win, QuickCompose } = setupMockEnvironment();
  QuickCompose.mount();

  const AICreationController = {
    get surfaceState() {
      return win.QuickCompose ? win.QuickCompose.state : 'closed';
    },
    set surfaceState(val) {
      if (win.QuickCompose) {
        win.QuickCompose.state = val;
      }
    },
    openQuickCompose() {
      return win.QuickCompose?.open();
    },
    closeQuickCompose(force) {
      return win.QuickCompose?.close(force);
    }
  };

  assert.equal(AICreationController.surfaceState, 'closed');
  AICreationController.openQuickCompose();
  assert.equal(AICreationController.surfaceState, 'quick-compose');
  assert.equal(QuickCompose.state, 'quick-compose');

  AICreationController.closeQuickCompose(true);
  assert.equal(AICreationController.surfaceState, 'closed');
  assert.equal(QuickCompose.state, 'closed');
});

test('QuickCompose: Event binding verification (Capsule click, Close button click, Send button click)', () => {
  const { doc, win, QuickCompose } = setupMockEnvironment();
  let submitted = false;
  win.AICreationController = {
    submitToWorkspace: () => {
      submitted = true;
    }
  };

  // Mount QuickCompose
  QuickCompose.mount();

  const capsule = doc.getElementById('global-create-capsule');
  const closeBtn = doc.getElementById('qc-close-btn');
  const sendBtn = doc.getElementById('qc-send-btn');
  const input = doc.getElementById('qc-story-input');

  assert.ok(capsule, '#global-create-capsule must exist');
  assert.ok(closeBtn, '#qc-close-btn must exist');
  assert.ok(sendBtn, '#qc-send-btn must exist');
  assert.ok(input, '#qc-story-input must exist');

  // 1. Direct click on desktop capsule opens QuickCompose
  assert.equal(QuickCompose.state, 'closed');
  capsule.dispatchEvent({
    type: 'click',
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.equal(QuickCompose.state, 'quick-compose', 'Clicking capsule must open QuickCompose');

  // 2. Direct click on close button closes QuickCompose
  QuickCompose.lastOpenTime = Date.now() - 500; // bypass 300ms debounce
  closeBtn.dispatchEvent({
    type: 'click',
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.ok(QuickCompose.state === 'closing' || QuickCompose.state === 'closed', 'Clicking close button must close QuickCompose');

  // 3. Direct click on send button submits to workspace
  QuickCompose.open();
  input.value = '一個溫馨的家庭故事';
  sendBtn.dispatchEvent({
    type: 'click',
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.equal(submitted, true, 'Clicking send button must trigger submitToWorkspace');
});

test('QuickCompose: bindEvents() guards against missing DOM elements and tracks node identity', () => {
  const { doc, QuickCompose } = setupMockEnvironment();

  // If called before DOM is created, bindEvents() must return false and NOT set isBound=true
  assert.equal(QuickCompose.bindEvents(), false, 'bindEvents must fail if elements are missing');

  // Create DOM
  QuickCompose.ensureDOM();
  assert.equal(QuickCompose.bindEvents(), true, 'bindEvents must succeed when all elements exist');

  // Calling again returns true (idempotent)
  assert.equal(QuickCompose.bindEvents(), true, 'Repeated call to bindEvents must return true');

  // If capsule is removed and recreated, bindEvents detects node change and rebinds
  const oldCapsule = doc.getElementById('global-create-capsule');
  oldCapsule.remove();
  assert.equal(QuickCompose.bindEvents(), false, 'bindEvents must fail if capsule was removed');

  QuickCompose.ensureDOM();
  assert.equal(QuickCompose.bindEvents(), true, 'bindEvents must rebind to newly created elements');
});

