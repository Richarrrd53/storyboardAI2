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
    visibility: '',
    transition: '',
    transform: '',
    transformOrigin: '',
    opacity: '',
    filter: '',
    width: '',
    height: '',
    left: '',
    top: '',
    zIndex: '',
    borderRadius: '',
    border: '',
    borderWidth: '',
    overflow: '',
    boxShadow: '',
    background: '',
    boxSizing: '',
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
    isConnected: true,
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
      if (p && typeof p.removeChild === 'function') {
        p.removeChild(this);
      }
    },
    contains(child) {
      let curr = child;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentElement || curr.parentNode;
      }
      return false;
    },
    getBoundingClientRect() {
      return { left: 100, top: 120, width: 282, height: 158.6, right: 382, bottom: 278.6 };
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
    animate(keyframes, options) {
      let onfinishCb = null;
      let cancelled = false;
      const animObj = {
        keyframes,
        options,
        playState: 'running',
        get onfinish() { return onfinishCb; },
        set onfinish(fn) {
          onfinishCb = fn;
          // Trigger finish asynchronously for test flow
          setTimeout(() => {
            if (!cancelled && typeof onfinishCb === 'function') {
              animObj.playState = 'finished';
              onfinishCb();
            }
          }, 10);
        },
        cancel() {
          cancelled = true;
          animObj.playState = 'idle';
        }
      };
      return animObj;
    }
  };

  return el;
}

function setupMockEnvironment() {
  const body = createMockElement('body');

  const windowMock = {
    document: {
      body,
      createElement: (tag) => createMockElement(tag),
      getElementById: (id) => {
        if (id === 'transition-layer') return body.querySelector('#transition-layer');
        return null;
      },
      querySelector: (sel) => body.querySelector(sel),
      querySelectorAll: (sel) => body.querySelectorAll(sel)
    },
    innerWidth: 1200,
    innerHeight: 800,
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    currentCoverTransition: null,
    _activeProjectTransition: null,
    ProjectCard: {
      parseAspectRatio: () => 16 / 9,
      calculateTransitionTargetSize: () => ({ width: 760, height: 427.5, left: 220, top: 186 }),
      getContainedImageRect: () => ({ left: 200, top: 150, width: 320, height: 180 })
    }
  };

  global.window = windowMock;
  global.document = windowMock.document;
  global.requestAnimationFrame = windowMock.requestAnimationFrame;
  global.cancelAnimationFrame = windowMock.cancelAnimationFrame;

  return { body, windowMock };
}

function loadProjectCoverTransition() {
  const code = fs.readFileSync(path.resolve('public/js/components/project-cover-transition.js'), 'utf8');
  const fn = new Function(code);
  fn();
  return global.window?.ProjectCoverTransition || global.ProjectCoverTransition;
}

function createTestCard(options = {}) {
  const card = createMockElement('div', 'card-1', 'project-card project-folder-card');
  const folderShell = createMockElement('div', '', 'project-folder-shell');
  const primaryCover = createMockElement('div', '', 'project-preview-primary');
  const img = createMockElement('img', '', 'project-preview-primary-image');
  img.src = 'https://example.com/cover.jpg';
  primaryCover.appendChild(img);

  const secondary = createMockElement('div', '', 'project-preview-secondary');

  card.appendChild(folderShell);
  card.appendChild(primaryCover);
  card.appendChild(secondary);

  return { card, folderShell, primaryCover, secondary, img };
}

test('ProjectCoverTransition: Module interface and compatibility bridge', () => {
  setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  assert.ok(PCT, 'ProjectCoverTransition should exist');
  assert.strictEqual(typeof PCT.launch, 'function');
  assert.strictEqual(typeof PCT.getActiveTransition, 'function');
  assert.strictEqual(typeof PCT.cancel, 'function');
  assert.strictEqual(typeof PCT.cleanup, 'function');

  assert.strictEqual(typeof global.launchProjectRevealTransition, 'function');
  assert.strictEqual(typeof global.window.launchProjectRevealTransition, 'function');
});

test('ProjectCoverTransition: Missing folder shell or primary cover falls back to immediate navigation', () => {
  const { body } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const emptyCard = createMockElement('div', 'card-empty', 'project-card');
  body.appendChild(emptyCard);

  let navigatedTo = null;
  const project = { id: 'p-no-cover', title: 'No Cover' };

  const session = PCT.launch(emptyCard, project, {
    navigate: (page, opts) => {
      navigatedTo = { page, opts };
    }
  });

  assert.strictEqual(session, null, 'Should return null when required elements are missing');
  assert.deepStrictEqual(navigatedTo, { page: 'project', opts: { id: 'p-no-cover' } });
});

test('ProjectCoverTransition: Card already navigating bails out (idempotency)', () => {
  const { body } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const { card } = createTestCard();
  card.classList.add('is-navigating');
  body.appendChild(card);

  const session = PCT.launch(card, { id: 'p1' });
  assert.strictEqual(session, null, 'Should bail out if card already has is-navigating');
});

test('ProjectCoverTransition: Closes active Option Morph immediately upon launch', () => {
  const { body, windowMock } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  let morphClosedWith = null;
  windowMock.ProjectOptionMorph = {
    isOpen: () => true,
    close: (reason) => { morphClosedWith = reason; }
  };

  const { card } = createTestCard();
  body.appendChild(card);

  PCT.launch(card, { id: 'p1' });
  assert.strictEqual(morphClosedWith, 'immediate', 'Should close option morph with immediate');
});

test('ProjectCoverTransition: Creates transition layer and session on launch', () => {
  const { body, windowMock } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const { card, primaryCover, folderShell } = createTestCard();
  body.appendChild(card);

  const project = { id: 'proj-123', ratio: '16:9' };
  const session = PCT.launch(card, project);

  assert.ok(session, 'Session must be returned');
  assert.strictEqual(session.projectId, 'proj-123');
  assert.strictEqual(card.classList.contains('is-navigating'), true);
  assert.strictEqual(card.classList.contains('is-expanded'), true);
  assert.strictEqual(primaryCover.style.visibility, 'hidden');

  // Verify layer & curtain
  const transitionLayer = body.querySelector('#transition-layer');
  assert.ok(transitionLayer, 'Transition layer must be in body');
  const flyingCover = transitionLayer.querySelector('.project-reveal-curtain');
  assert.ok(flyingCover, 'Flying cover curtain must exist in transition layer');
  const scrim = transitionLayer.querySelector('.project-reveal-scrim');
  assert.ok(scrim, 'Scrim must exist in transition layer');

  // Verify globals
  assert.strictEqual(windowMock.currentCoverTransition, session);
  assert.strictEqual(windowMock._activeProjectTransition, session);
  assert.strictEqual(PCT.getActiveTransition('proj-123'), session);

  session.cleanup();
});

test('ProjectCoverTransition: Fires navigation trigger after 200ms', async () => {
  const { body } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const { card } = createTestCard();
  body.appendChild(card);

  let navTriggered = false;
  let navTarget = null;

  const session = PCT.launch(card, { id: 'p-nav' }, {
    navigate: (page, opts) => {
      navTriggered = true;
      navTarget = { page, opts };
    }
  });

  assert.strictEqual(navTriggered, false, 'Should not navigate synchronously at 0ms');

  await new Promise(r => setTimeout(r, 220));

  assert.strictEqual(navTriggered, true, 'Should navigate at ~200ms');
  assert.deepStrictEqual(navTarget, { page: 'project', opts: { id: 'p-nav' } });

  session.cleanup();
});

test('ProjectCoverTransition: Launching new transition cancels previous active session', () => {
  const { body } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const { card: card1 } = createTestCard();
  const { card: card2 } = createTestCard();
  body.appendChild(card1);
  body.appendChild(card2);

  const session1 = PCT.launch(card1, { id: 'p-first' });
  assert.strictEqual(session1.cancelled, false);

  const session2 = PCT.launch(card2, { id: 'p-second' });
  assert.strictEqual(session1.cancelled, true, 'Previous session must be cancelled');
  assert.strictEqual(session2.cancelled, false, 'New session must be active');

  session2.cleanup();
});

test('ProjectCoverTransition: onFirstShotReady executes return animation and cleans up', async () => {
  const { body, windowMock } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const { card } = createTestCard();
  body.appendChild(card);

  const session = PCT.launch(card, { id: 'p-return' });

  // Wait for initial flight anim finish (mock triggers after 10ms)
  await new Promise(r => setTimeout(r, 25));
  assert.strictEqual(session.state, 'waiting-project');

  // Create target shot element
  const targetWrap = createMockElement('div', 'target-wrap', 'shot-cell-thumb-wrap is-transition-target');
  const targetImg = createMockElement('img', 'target-img');
  targetWrap.appendChild(targetImg);
  body.appendChild(targetWrap);

  session.onFirstShotReady(targetWrap, targetImg);
  assert.strictEqual(session.state, 'returning');

  // Wait for returnAnim and crossFade to finish (2 RAFs + anim)
  await new Promise(r => setTimeout(r, 120));

  assert.strictEqual(session.state, 'complete');
  assert.strictEqual(windowMock.currentCoverTransition, null);
  assert.strictEqual(windowMock._activeProjectTransition, null);
});

test('ProjectCoverTransition: Pending target handled when first shot arrives during flight', async () => {
  const { body } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const { card } = createTestCard();
  body.appendChild(card);

  const session = PCT.launch(card, { id: 'p-pending' });

  // First shot arrives early while session is in extracting/flying state
  const targetWrap = createMockElement('div', '', 'shot-cell-thumb-wrap');
  const targetImg = createMockElement('img');
  targetWrap.appendChild(targetImg);
  body.appendChild(targetWrap);

  session.onFirstShotReady(targetWrap, targetImg);
  assert.ok(session.pendingTarget, 'Should record pending target when called early');

  // Let flight animation finish, which should immediately consume pendingTarget
  await new Promise(r => setTimeout(r, 35));

  assert.strictEqual(session.pendingTarget, null, 'Pending target should be consumed');
  assert.strictEqual(session.state, 'returning');

  await new Promise(r => setTimeout(r, 120));
  assert.strictEqual(session.state, 'complete');
});

test('ProjectCoverTransition: Fallback dismiss / cancel runs legacy shrink and cleans up', async () => {
  const { body, windowMock } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const { card, primaryCover } = createTestCard();
  body.appendChild(card);

  const session = PCT.launch(card, { id: 'p-cancel' });

  // Trigger fallback dismiss
  session.fallbackDismiss();
  assert.strictEqual(session.cancelled, true);

  // Wait for legacy shrink exit animation to finish
  await new Promise(r => setTimeout(r, 30));

  assert.strictEqual(session.state, 'complete');
  assert.strictEqual(primaryCover.style.visibility, '');
  assert.strictEqual(card.classList.contains('is-navigating'), false);
  assert.strictEqual(windowMock.currentCoverTransition, null);
});

test('ProjectCoverTransition: Top-level cancel() cancels active session matching projectId', () => {
  const { body } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const { card } = createTestCard();
  body.appendChild(card);

  const session = PCT.launch(card, { id: 'p-match' });
  assert.strictEqual(session.cancelled, false);

  PCT.cancel('other-id');
  assert.strictEqual(session.cancelled, false, 'Should not cancel non-matching id');

  PCT.cancel('p-match');
  assert.strictEqual(session.cancelled, true, 'Should cancel matching id');

  session.cleanup();
});

test('ProjectCoverTransition: Cleanup removes DOM nodes and restores card styles', () => {
  const { body, windowMock } = setupMockEnvironment();
  const PCT = loadProjectCoverTransition();

  const { card, primaryCover, folderShell, secondary } = createTestCard();
  body.appendChild(card);

  const session = PCT.launch(card, { id: 'p-clean' });
  const transitionLayer = body.querySelector('#transition-layer');
  assert.ok(transitionLayer.querySelector('.project-reveal-curtain'));

  session.cleanup();

  assert.strictEqual(transitionLayer.querySelector('.project-reveal-curtain'), null);
  assert.strictEqual(transitionLayer.querySelector('.project-reveal-scrim'), null);
  assert.strictEqual(primaryCover.style.visibility, '');
  assert.strictEqual(folderShell.style.transform, '');
  assert.strictEqual(folderShell.style.opacity, '');
  assert.strictEqual(secondary.style.transform, '');
  assert.strictEqual(secondary.style.opacity, '');
  assert.strictEqual(card.classList.contains('is-navigating'), false);
  assert.strictEqual(card.classList.contains('is-expanded'), false);
  assert.strictEqual(windowMock.currentCoverTransition, null);
  assert.strictEqual(windowMock._activeProjectTransition, null);
});
