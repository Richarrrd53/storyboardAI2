const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Mock DOM Environment
function createMockElement(tagName = 'div', id = '', className = '') {
  const children = [];
  const eventListeners = {};
  const dataset = {};
  const classListSet = new Set(className ? className.split(' ').filter(Boolean) : []);
  const style = {
    display: '',
    transition: '',
    transform: '',
    opacity: '',
    filter: '',
    width: '',
    height: '',
    left: '',
    top: '',
    borderRadius: '',
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
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classListSet.has(cls)) classListSet.delete(cls);
          else classListSet.add(cls);
        } else if (force) {
          classListSet.add(cls);
        } else {
          classListSet.delete(cls);
        }
      },
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
      return this._innerHTML || '';
    },
    set innerHTML(val) {
      this._innerHTML = val;
      this._rebuildChildren(val);
    },
    _rebuildChildren(html) {
      this.children.length = 0;
      if (!html) return;
      const tagRegex = /<([a-z0-9\-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-z0-9\-]+)([^>]*)\/>/gi;
      let m;
      while ((m = tagRegex.exec(html)) !== null) {
        const tag = m[1] || m[4];
        const attrs = m[2] || m[5] || '';
        const inner = m[3] || '';
        const idMatch = attrs.match(/id="([^"]+)"/);
        const classMatch = attrs.match(/class="([^"]+)"/);
        const actionMatch = attrs.match(/data-action="([^"]+)"/);
        const child = createMockElement(tag, idMatch ? idMatch[1] : '', classMatch ? classMatch[1] : '');
        if (actionMatch) {
          child.dataset.action = actionMatch[1];
          child.setAttribute('data-action', actionMatch[1]);
        }
        child.parentElement = this;
        child.textContent = inner.replace(/<[^>]+>/g, '').trim();
        if (inner.includes('<')) {
          child.innerHTML = inner;
        }
        this.appendChild(child);
      }
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
    cloneNode(deep = true) {
      const clone = createMockElement(this.tagName.toLowerCase(), this.id, this.className);
      clone.innerHTML = this.innerHTML;
      return clone;
    },
    contains(child) {
      let curr = child;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentElement;
      }
      return false;
    },
    matches(sel) {
      if (sel === ':hover') return false;
      return false;
    },
    getBoundingClientRect() {
      return { left: 100, top: 120, width: 48, height: 36, right: 148, bottom: 156 };
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const results = [];
      function traverse(node) {
        for (const child of node.children) {
          let match = false;
          if (sel.startsWith('[')) {
            const attrMatch = sel.match(/\[([a-z0-9\-]+)(?:="([^"]+)")?\]/i);
            if (attrMatch) {
              const attrName = attrMatch[1];
              const attrVal = attrMatch[2];
              if (attrVal !== undefined) {
                if (child.getAttribute(attrName) === attrVal || (attrName === 'data-action' && child.dataset?.action === attrVal)) {
                  match = true;
                }
              } else if (child.hasAttribute(attrName)) {
                match = true;
              }
            }
          } else if (sel.startsWith('#')) {
            if (child.id === sel.slice(1)) match = true;
          } else if (sel.includes('.')) {
            const parts = sel.split('.');
            const tagPart = parts[0];
            const clsPart = parts[1];
            if ((!tagPart || child.tagName.toLowerCase() === tagPart.toLowerCase()) && child.classList.contains(clsPart)) {
              match = true;
            }
          } else if (child.tagName.toLowerCase() === sel.toLowerCase()) {
            match = true;
          }

          if (match) results.push(child);
          traverse(child);
        }
      }
      traverse(this);
      return results;
    },
    addEventListener(evt, fn) {
      if (!eventListeners[evt]) eventListeners[evt] = [];
      eventListeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (!eventListeners[evt]) return;
      eventListeners[evt] = eventListeners[evt].filter(f => f !== fn);
    },
    dispatchEvent(evt) {
      const fns = eventListeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    getListenerCount(evt) {
      return eventListeners[evt]?.length || 0;
    }
  };

  return el;
}

function setupMockEnvironment() {
  const body = createMockElement('body');
  const windowListeners = {};

  const windowMock = {
    document: {
      body,
      createElement: (tag) => createMockElement(tag),
      removeChild: (child) => body.removeChild(child)
    },
    innerHeight: 800,
    innerWidth: 1200,
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (!windowListeners[evt]) return;
      windowListeners[evt] = windowListeners[evt].filter(f => f !== fn);
    },
    dispatchEvent: (evt) => {
      const fns = windowListeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    windowListeners,
    performance: { now: () => Date.now() },
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };

  global.window = windowMock;
  global.document = windowMock.document;
  global.performance = windowMock.performance;
  global.requestAnimationFrame = windowMock.requestAnimationFrame;
  global.cancelAnimationFrame = windowMock.cancelAnimationFrame;

  return { body, windowMock, windowListeners };
}

function loadProjectOptionMorph() {
  const code = fs.readFileSync(path.resolve('public/js/components/project-option-morph.js'), 'utf8');
  const fn = new Function(code);
  fn();
  return global.window?.ProjectOptionMorph || global.ProjectOptionMorph;
}

test('ProjectOptionMorph: Module interface and compatibility bridge', () => {
  setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  assert.ok(POM, 'ProjectOptionMorph should exist');
  assert.strictEqual(typeof POM.open, 'function');
  assert.strictEqual(typeof POM.close, 'function');
  assert.strictEqual(typeof POM.isOpen, 'function');
  assert.strictEqual(typeof POM.destroy, 'function');

  assert.strictEqual(typeof global.openGlobalOptionMorph, 'function');
  assert.strictEqual(typeof global.closeGlobalOptionMorph, 'function');
});

test('ProjectOptionMorph: open and close creates and removes portal cleanly', () => {
  const { body } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div', 'card-1', 'project-card');
  const btn = createMockElement('button', 'btn-1', 'project-option-btn');
  card.appendChild(btn);
  body.appendChild(card);

  const project = { id: 'p1', title: 'Test Story' };

  assert.strictEqual(POM.isOpen(), false);
  POM.open(btn, project, card);

  assert.strictEqual(POM.isOpen(), true, 'Option morph should be open');
  assert.ok(btn.classList.contains('is-hidden-for-morph'), 'Trigger button should be hidden for morph');
  assert.ok(card.classList.contains('is-menu-open'), 'Card should have is-menu-open class');

  const overlay = body.querySelector('.project-option-overlay');
  assert.ok(overlay, 'Portal overlay must be appended to body');
  const menu = overlay.querySelector('.global-project-option-menu');
  assert.ok(menu, 'Portal menu must exist inside overlay');

  // Immediate close
  POM.close('immediate');
  assert.strictEqual(POM.isOpen(), false, 'Option morph should be closed');
  assert.strictEqual(btn.classList.contains('is-hidden-for-morph'), false, 'Trigger button should be unhidden');
  assert.strictEqual(card.classList.contains('is-menu-open'), false, 'Card should lose is-menu-open');
  assert.strictEqual(body.querySelector('.project-option-overlay'), null, 'Overlay should be removed from body');
});

test('ProjectOptionMorph: double open on same trigger acts as toggle close', () => {
  const { body } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div');
  const btn = createMockElement('button');
  card.appendChild(btn);
  body.appendChild(card);
  const project = { id: 'p1' };

  POM.open(btn, project, card);
  assert.strictEqual(POM.isOpen(), true);

  // Open again with same trigger button
  POM.open(btn, project, card);
  // Double open should initiate close
  assert.strictEqual(POM.isOpen(), false, 'Double open on same trigger should toggle closed');
});

test('ProjectOptionMorph: open A -> open B replaces active session cleanly', () => {
  const { body } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const cardA = createMockElement('div', 'card-a');
  const btnA = createMockElement('button', 'btn-a');
  cardA.appendChild(btnA);

  const cardB = createMockElement('div', 'card-b');
  const btnB = createMockElement('button', 'btn-b');
  cardB.appendChild(btnB);

  POM.open(btnA, { id: 'pA' }, cardA);
  assert.strictEqual(POM.isOpen(), true);
  assert.ok(cardA.classList.contains('is-menu-open'));

  // Open B while A is open
  POM.open(btnB, { id: 'pB' }, cardB);

  // A is closed immediately and B becomes active
  assert.strictEqual(cardA.classList.contains('is-menu-open'), false, 'Card A should be closed');
  assert.ok(cardB.classList.contains('is-menu-open'), 'Card B should be open');
  assert.strictEqual(POM.isOpen(), true, 'Option morph should remain open (for B)');

  POM.close('immediate');
  assert.strictEqual(cardB.classList.contains('is-menu-open'), false);
  assert.strictEqual(POM.isOpen(), false);
});

test('ProjectOptionMorph: repeated close idempotency', () => {
  const { body } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div');
  const btn = createMockElement('button');
  card.appendChild(btn);
  body.appendChild(card);

  POM.open(btn, { id: 'p1' }, card);
  assert.strictEqual(POM.isOpen(), true);

  // Multiple consecutive close calls
  assert.doesNotThrow(() => {
    POM.close('immediate');
    POM.close('immediate');
    POM.close('escape');
    POM.close();
  }, 'Multiple close calls should never throw');

  assert.strictEqual(POM.isOpen(), false);
  assert.strictEqual(body.querySelector('.project-option-overlay'), null);
});

test('ProjectOptionMorph: outside click closes menu', () => {
  const { body } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div');
  const btn = createMockElement('button');
  card.appendChild(btn);
  body.appendChild(card);

  POM.open(btn, { id: 'p1' }, card);
  const overlay = body.querySelector('.project-option-overlay');
  assert.ok(overlay);

  // Click on overlay directly (outside menu)
  overlay.dispatchEvent({
    type: 'pointerdown',
    target: overlay,
    stopPropagation: () => {}
  });

  assert.strictEqual(POM.isOpen(), false, 'Outside click on overlay should close option morph');
});

test('ProjectOptionMorph: Escape key closes menu', () => {
  const { windowMock } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div');
  const btn = createMockElement('button');

  POM.open(btn, { id: 'p1' }, card);
  assert.strictEqual(POM.isOpen(), true);

  // Dispatch Escape key
  windowMock.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.strictEqual(POM.isOpen(), false, 'Escape key should close option morph');
});

test('ProjectOptionMorph: Window scroll and resize closes menu', () => {
  const { windowMock } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div');
  const btn = createMockElement('button');

  POM.open(btn, { id: 'p1' }, card);
  assert.strictEqual(POM.isOpen(), true);

  // Scroll event
  windowMock.dispatchEvent({ type: 'scroll' });
  assert.strictEqual(POM.isOpen(), false, 'Window scroll should close option morph');

  // Re-open and test resize
  POM.open(btn, { id: 'p1' }, card);
  assert.strictEqual(POM.isOpen(), true);
  windowMock.dispatchEvent({ type: 'resize' });
  assert.strictEqual(POM.isOpen(), false, 'Window resize should close option morph');
});

test('ProjectOptionMorph: History mode renders restore action only', () => {
  const { body } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div');
  const btn = createMockElement('button');
  card.appendChild(btn);

  // History project (deleted)
  const deletedProject = { id: 'del-1', title: 'Deleted Story', is_deleted: true };
  POM.open(btn, deletedProject, card, { isHistoryPage: true });

  const overlay = body.querySelector('.project-option-overlay');
  const restoreBtn = overlay.querySelector('[data-action="restore"]');
  const renameBtn = overlay.querySelector('[data-action="rename"]');

  assert.ok(restoreBtn, 'Restore button must exist in history mode');
  assert.strictEqual(renameBtn, null, 'Rename button must NOT exist in history mode');

  POM.close('immediate');
});

test('ProjectOptionMorph: Action click executes action via ProjectActions and closes', async () => {
  const { body } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div');
  const btn = createMockElement('button');
  card.appendChild(btn);

  let renameCalled = false;
  let refreshCalled = false;
  let sidebarUpdated = false;

  global.ProjectActions = {
    renameProject: (p, c, cb) => {
      renameCalled = true;
      cb();
    }
  };
  global.updateSidebarProjects = () => {
    sidebarUpdated = true;
  };

  const project = { id: 'act-1', title: 'Action Story' };
  POM.open(btn, project, card, {
    refreshCallback: () => { refreshCalled = true; }
  });

  const overlay = body.querySelector('.project-option-overlay');
  const renameBtn = overlay.querySelector('[data-action="rename"]');
  assert.ok(renameBtn);

  // Click rename action
  let stopped = false;
  renameBtn.dispatchEvent({
    type: 'click',
    stopPropagation: () => { stopped = true; }
  });

  assert.strictEqual(stopped, true, 'Action click should stop propagation');
  assert.strictEqual(POM.isOpen(), false, 'Option morph should be closed on action click');

  // Wait for 440ms flight animation to complete and action callback to execute
  await new Promise(resolve => setTimeout(resolve, 480));

  assert.strictEqual(renameCalled, true, 'ProjectActions.renameProject should be called');
  assert.strictEqual(refreshCalled, true, 'refreshCallback should be called');
  assert.strictEqual(sidebarUpdated, true, 'updateSidebarProjects should be called');
});

test('ProjectOptionMorph: Card rerender / detached card does not throw on close', () => {
  const { body } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div', 'old-card');
  const btn = createMockElement('button', 'old-btn');
  card.appendChild(btn);
  body.appendChild(card);

  POM.open(btn, { id: 'p1' }, card);
  assert.strictEqual(POM.isOpen(), true);

  // Simulate card removal / rerender while option morph is open
  card.remove();
  btn.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0 });

  assert.doesNotThrow(() => {
    POM.close('immediate');
  }, 'Closing when card DOM is detached should never throw');

  assert.strictEqual(POM.isOpen(), false);
});

test('ProjectOptionMorph: Route leave immediate cleanup (navigation)', () => {
  const { body } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div');
  const btn = createMockElement('button');
  card.appendChild(btn);
  body.appendChild(card);

  POM.open(btn, { id: 'p1' }, card);
  assert.strictEqual(POM.isOpen(), true);

  // Immediate close on route leave
  POM.close('navigation');
  assert.strictEqual(POM.isOpen(), false);
  assert.strictEqual(body.querySelector('.project-option-overlay'), null, 'Overlay should be destroyed immediately on navigation');
});

test('ProjectOptionMorph: Global listeners lifecycle (no duplicate or lingering listeners)', () => {
  const { windowListeners } = setupMockEnvironment();
  const POM = loadProjectOptionMorph();

  const card = createMockElement('div');
  const btn = createMockElement('button');

  assert.strictEqual(windowListeners['scroll']?.length || 0, 0, 'No scroll listeners before open');
  assert.strictEqual(windowListeners['resize']?.length || 0, 0, 'No resize listeners before open');
  assert.strictEqual(windowListeners['keydown']?.length || 0, 0, 'No keydown listeners before open');

  POM.open(btn, { id: 'p1' }, card);
  assert.strictEqual(windowListeners['scroll']?.length, 1, 'Scroll listener attached on open');
  assert.strictEqual(windowListeners['resize']?.length, 1, 'Resize listener attached on open');
  assert.strictEqual(windowListeners['keydown']?.length, 1, 'Keydown listener attached on open');

  POM.close('immediate');
  assert.strictEqual(windowListeners['scroll']?.length, 0, 'Scroll listener detached on close');
  assert.strictEqual(windowListeners['resize']?.length, 0, 'Resize listener detached on close');
  assert.strictEqual(windowListeners['keydown']?.length, 0, 'Keydown listener detached on close');
});
