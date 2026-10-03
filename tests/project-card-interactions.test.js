const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Mock DOM element creation
function createMockElement(tagName = 'div', id = '', className = '') {
  const children = [];
  const eventListeners = {};
  const dataset = {};
  const classListSet = new Set(className ? className.split(' ').filter(Boolean) : []);
  const style = {
    display: '',
    transition: '',
    transform: '',
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
    scrollWidth: 100,
    clientWidth: 100,
    onclick: null,
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
    appendChild(child) {
      children.push(child);
      child.parentElement = this;
      return child;
    },
    remove() {
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx !== -1) this.parentElement.children.splice(idx, 1);
        this.parentElement = null;
      }
    },
    contains(child) {
      let curr = child;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentElement;
      }
      return false;
    },
    closest(sel) {
      let curr = this;
      while (curr) {
        if (sel.startsWith('#') && curr.id === sel.slice(1)) return curr;
        if (sel.startsWith('.') && curr.classList?.contains(sel.slice(1))) return curr;
        if (curr.tagName?.toLowerCase() === sel.toLowerCase()) return curr;
        curr = curr.parentElement;
      }
      return null;
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const results = [];
      function traverse(node) {
        for (const child of node.children) {
          let match = false;
          if (sel.startsWith('#')) {
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
      if (evt.type === 'click' && typeof el.onclick === 'function') {
        el.onclick(evt);
      }
    },
    getListenerCount(evt) {
      return eventListeners[evt]?.length || 0;
    }
  };

  return el;
}

// Build standard test card DOM
function createTestProjectCard(options = {}) {
  const { variant = 'default', isDeleted = false } = options;
  const card = createMockElement('div', '', `project-card project-folder-card variant-${variant}${isDeleted ? ' project-card-deleted' : ''}`);
  card.dataset.variant = variant;

  const optionBtn = createMockElement('button', '', 'project-option-btn');
  card.appendChild(optionBtn);

  const titleWrapper = createMockElement('div', '', 'project-title-wrapper');
  titleWrapper.clientWidth = 120;
  const titleEl = createMockElement('span', '', 'project-title');
  titleEl.scrollWidth = 180; // overflow > 2
  titleWrapper.appendChild(titleEl);
  card.appendChild(titleWrapper);

  return { card, optionBtn, titleWrapper, titleEl };
}

function loadInteractionsModule() {
  const code = fs.readFileSync(path.resolve('public/js/components/project-card-interactions.js'), 'utf8');
  const fn = new Function(code);
  fn();
  return global.ProjectCardInteractions;
}

test('ProjectCardInteractions: Module interface & compatibility bridge', () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  assert.ok(PCI, 'ProjectCardInteractions must exist');
  assert.strictEqual(typeof PCI.bind, 'function');
  assert.strictEqual(typeof PCI.bindAll, 'function');
  assert.strictEqual(typeof PCI.unbind, 'function');
  assert.strictEqual(typeof PCI.destroyWithin, 'function');

  // Verify backward compatibility bridge
  assert.strictEqual(typeof global.setupProjectCardEvents, 'function');
});

test('ProjectCardInteractions: Dashboard compact card click launches reveal transition', () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  const { card } = createTestProjectCard({ variant: 'compact' });
  const project = { id: 'dash-p1', title: 'Dashboard Project', is_deleted: false };

  let transitionCard = null;
  let transitionProject = null;
  global.launchProjectRevealTransition = (c, p) => {
    transitionCard = c;
    transitionProject = p;
  };
  global.matchMedia = () => ({ matches: false });

  PCI.bind(card, project, { variant: 'compact' });

  assert.ok(card.classList.contains('variant-compact'), 'Should have variant-compact class');
  assert.strictEqual(card.dataset.id, 'dash-p1');

  // Click card
  card.dispatchEvent({ type: 'click', target: card });

  assert.strictEqual(transitionCard, card);
  assert.strictEqual(transitionProject, project);

  PCI.unbind(card);
});

test('ProjectCardInteractions: Prefers-reduced-motion navigates without transition', () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  const { card } = createTestProjectCard();
  const project = { id: 'rm-p1', title: 'Reduced Motion Project', is_deleted: false };

  let navigatedPage = null;
  let navigatedOpts = null;
  let transitionCalled = false;

  global.matchMedia = () => ({ matches: true });
  global.navigate = (page, opts) => {
    navigatedPage = page;
    navigatedOpts = opts;
  };
  global.launchProjectRevealTransition = () => {
    transitionCalled = true;
  };

  PCI.bind(card, project);
  card.dispatchEvent({ type: 'click', target: card });

  assert.strictEqual(transitionCalled, false, 'Transition should NOT be launched when reduced motion is preferred');
  assert.strictEqual(navigatedPage, 'project');
  assert.strictEqual(navigatedOpts.id, 'rm-p1');

  PCI.unbind(card);
});

test('ProjectCardInteractions: History deleted card click prompts restore and does NOT launch transition', () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  const { card } = createTestProjectCard();
  const project = { id: 'del-p1', title: 'Deleted Project', is_deleted: true };

  let transitionCalled = false;
  let restoreCalled = false;
  let refreshCalled = false;
  let sidebarUpdated = false;

  global.confirm = () => true;
  global.launchProjectRevealTransition = () => { transitionCalled = true; };
  global.restoreProject = (p, c, cb) => {
    restoreCalled = true;
    cb();
  };
  global.updateSidebarProjects = () => {
    sidebarUpdated = true;
  };

  PCI.bind(card, project, {
    isHistoryPage: true,
    refreshCallback: () => { refreshCalled = true; }
  });

  assert.ok(card.classList.contains('project-card-deleted'), 'Should have project-card-deleted class');

  // Click card
  card.dispatchEvent({ type: 'click', target: card });

  assert.strictEqual(transitionCalled, false, 'Transition should NOT be called for deleted card');
  assert.strictEqual(restoreCalled, true, 'restoreProject should be called');
  assert.strictEqual(refreshCalled, true, 'refreshCallback should be triggered on restore');
  assert.strictEqual(sidebarUpdated, true, 'updateSidebarProjects should be triggered on restore');

  PCI.unbind(card);
});

test('ProjectCardInteractions: Option button click invokes openGlobalOptionMorph and stops propagation', () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  const { card, optionBtn } = createTestProjectCard();
  const project = { id: 'opt-p1', title: 'Option Project', is_deleted: false };

  let morphBtn = null;
  let morphProject = null;
  let cardClickFired = false;
  let stopped = false;

  global.openGlobalOptionMorph = (btn, p, c, isHist, cb) => {
    morphBtn = btn;
    morphProject = p;
  };

  PCI.bind(card, project);

  const event = {
    type: 'click',
    target: optionBtn,
    stopPropagation: () => { stopped = true; }
  };

  optionBtn.dispatchEvent(event);

  assert.strictEqual(stopped, true, 'Option button click must call e.stopPropagation()');
  assert.strictEqual(morphBtn, optionBtn, 'Option morph must receive option button');
  assert.strictEqual(morphProject, project, 'Option morph must receive project');

  PCI.unbind(card);
});

test('ProjectCardInteractions: Title overflow marquee starts on hover and cleans up on leave', async () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  const { card, titleEl } = createTestProjectCard();
  const project = { id: 'marq-p1', title: 'Very Long Story Title That Overflows' };

  PCI.bind(card, project);

  // Hover into card
  card.dispatchEvent({ type: 'pointerenter', target: card });

  // Advance timer for marquee initiation
  await new Promise(r => setTimeout(r, 450));
  assert.ok(titleEl.style.transform.includes('translateX(-'), 'Title transform should move to negative translateX');

  // Leave card
  card.dispatchEvent({ type: 'pointerleave', target: card });
  assert.strictEqual(titleEl.style.transform, 'translateX(0)', 'Title transform should reset to 0 on leave');

  PCI.unbind(card);
});

test('ProjectCardInteractions: Card hover expands and triggers prefetch', () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  const { card } = createTestProjectCard();
  const project = { id: 'hov-p1', title: 'Hover Project', is_deleted: false };

  let prefetchedPage = null;
  let prefetchedOpts = null;
  global.prefetchPage = (page, opts) => {
    prefetchedPage = page;
    prefetchedOpts = opts;
  };

  PCI.bind(card, project);

  // Hover enter
  card.dispatchEvent({ type: 'pointerenter', target: card });
  assert.ok(card.classList.contains('is-expanded'), 'Card should gain is-expanded on enter');
  assert.strictEqual(prefetchedPage, 'project');
  assert.strictEqual(prefetchedOpts.id, 'hov-p1');

  // Hover leave
  card.dispatchEvent({ type: 'pointerleave', target: card });
  assert.strictEqual(card.classList.contains('is-expanded'), false, 'Card should lose is-expanded on leave');

  // If menu is open, is-expanded is preserved
  card.classList.add('is-menu-open');
  card.dispatchEvent({ type: 'pointerenter', target: card });
  card.dispatchEvent({ type: 'pointerleave', target: card });
  assert.ok(card.classList.contains('is-expanded'), 'Card should retain is-expanded if is-menu-open');

  PCI.unbind(card);
});

test('ProjectCardInteractions: Duplicate bind does NOT duplicate listeners (Idempotency)', () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  const { card, optionBtn } = createTestProjectCard();
  const project = { id: 'dup-p1', title: 'Dup Project', is_deleted: false };

  // Bind 1st time
  PCI.bind(card, project);
  assert.strictEqual(card.getListenerCount('click'), 1, 'Card click listener count should be 1');
  assert.strictEqual(card.getListenerCount('pointerenter'), 2, 'Marquee + hover enter listener count should be 2');
  assert.strictEqual(optionBtn.getListenerCount('click'), 1, 'Option button listener count should be 1');

  // Bind 2nd time
  PCI.bind(card, project);
  assert.strictEqual(card.getListenerCount('click'), 1, 'Card click listener count should STILL be 1 after 2nd bind');
  assert.strictEqual(card.getListenerCount('pointerenter'), 2, 'Enter listener count should STILL be 2 after 2nd bind');
  assert.strictEqual(optionBtn.getListenerCount('click'), 1, 'Option button listener count should STILL be 1 after 2nd bind');

  // Bind 3rd time via legacy bridge
  global.setupProjectCardEvents(card, project, false, () => {});
  assert.strictEqual(card.getListenerCount('click'), 1, 'Card click listener count should STILL be 1 after bridge call');
  assert.strictEqual(card.getListenerCount('pointerenter'), 2, 'Enter listener count should STILL be 2 after bridge call');
  assert.strictEqual(optionBtn.getListenerCount('click'), 1, 'Option button listener count should STILL be 1 after bridge call');

  PCI.unbind(card);
  assert.strictEqual(card.getListenerCount('click'), 0, 'Click listener should be 0 after unbind');
  assert.strictEqual(card.getListenerCount('pointerenter'), 0, 'Enter listener should be 0 after unbind');
  assert.strictEqual(optionBtn.getListenerCount('click'), 0, 'Option listener should be 0 after unbind');
});

test('ProjectCardInteractions: Card click debounce guard allows only one transition trigger', () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  const { card } = createTestProjectCard();
  const project = { id: 'guard-p1', title: 'Guard Project', is_deleted: false };

  let transitionCount = 0;
  global.launchProjectRevealTransition = () => {
    transitionCount++;
  };
  global.matchMedia = () => ({ matches: false });

  PCI.bind(card, project);

  // Trigger rapid duplicate clicks
  card.dispatchEvent({ type: 'click', target: card });
  card.dispatchEvent({ type: 'click', target: card });
  card.dispatchEvent({ type: 'click', target: card });

  assert.strictEqual(transitionCount, 1, 'Rapid consecutive clicks must only trigger transition once');

  PCI.unbind(card);
});

test('ProjectCardInteractions: bindAll and destroyWithin lifecycle over container', () => {
  global.window = global;
  const PCI = loadInteractionsModule();

  const container = createMockElement('div', 'cards-grid');
  const card1 = createTestProjectCard().card;
  card1.dataset.id = 'p-1';
  const card2 = createTestProjectCard().card;
  card2.dataset.id = 'p-2';

  container.appendChild(card1);
  container.appendChild(card2);

  const projects = [
    { id: 'p-1', title: 'Project 1' },
    { id: 'p-2', title: 'Project 2' }
  ];

  PCI.bindAll(container, projects);
  assert.strictEqual(card1.getListenerCount('click'), 1);
  assert.strictEqual(card2.getListenerCount('click'), 1);

  // Teardown container
  PCI.destroyWithin(container);
  assert.strictEqual(card1.getListenerCount('click'), 0);
  assert.strictEqual(card2.getListenerCount('click'), 0);
});
