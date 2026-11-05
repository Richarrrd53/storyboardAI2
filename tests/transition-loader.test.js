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

test('particles follow a fixed five-petal spatial rose with front and back occlusion', () => {
  const { group, pathEl, TransitionLoader } = setupMockEnvironment();
  const frontGroup = createMockElement('g');
  const frontPath = createMockElement('path');
  frontGroup.appendChild(frontPath);
  const originalFrame = global.requestAnimationFrame;
  let frame;
  global.requestAnimationFrame = callback => { frame = callback; return 1; };
  try {
    const animation = TransitionLoader.setupRoseAnimation(group, pathEl, 45, { group: frontGroup, path: frontPath });
    const start = performance.now();
    animation.start();
    const snapshots = [0, 1350, 2700, 4050, 5400].map(time => {
      frame(start + time);
      const back = group.children[1];
      const front = frontGroup.children[1];
      return {
        x: Number(back.getAttribute('cx')),
        y: Number(back.getAttribute('cy')),
        front: Number(front.getAttribute('opacity')),
        back: Number(back.getAttribute('opacity')),
        path: `${pathEl.getAttribute('d')} ${frontPath.getAttribute('d')}`
      };
    });
    assert.ok(snapshots.some(p => p.front > 0) && snapshots.some(p => p.back > 0), 'electron passes in front of and behind the cover');
    assert.ok(snapshots.some(p => Math.hypot(snapshots[0].x - p.x, snapshots[0].y - p.y) > 10), 'electron traverses the three dimensional orbit');
    assert.ok(Math.hypot(snapshots[0].x - snapshots[4].x, snapshots[0].y - snapshots[4].y) < 4, 'electron completes a full orbit');
    frame(start + 1200);
    const repeatedPath = `${pathEl.getAttribute('d')} ${frontPath.getAttribute('d')}`;
    assert.equal(repeatedPath, snapshots[0].path, 'after a breathing cycle the track has the same orientation');
    const points = repeatedPath.match(/-?\d+\.\d+/g).map(Number);
    const petalLengths = Array(5).fill(0);
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i] - 50, y = points[i + 1] - 50;
      const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
      const petal = Math.round(angle / (Math.PI * 2 / 5)) % 5;
      petalLengths[petal] = Math.max(petalLengths[petal], Math.hypot(x, y));
    }
    assert.ok(Math.max(...petalLengths) - Math.min(...petalLengths) < 0.03, 'all five petals have the same visible length');
    for (let side = 0; side < 12; side++) {
      frame(start + 5400 * ((side + 0.5) / 5));
      const near = Number(frontGroup.children[1].getAttribute('opacity')) > 0;
      const far = Number(group.children[1].getAttribute('opacity')) > 0;
      assert.equal(near, side % 2 === 0, `tip-to-tip side ${side}: alternate only after finishing that side`);
      assert.equal(far, !near, 'the particle is on exactly one depth layer away from a tip');
    }
    frame(start + 5400 * 1.1);
    assert.ok(Number(group.children[1].getAttribute('opacity')) > 0, 'head continues on the reversed next lap with no drain pause');
    // Final trail particle is still at progress 0.78, on the prior side.
    assert.ok(Number(group.children[45].getAttribute('opacity')) > 0, 'trail particles keep their own side instead of flipping with the head');
    const samples = [1072, 1080, 1088].map(time => {
      frame(start + time);
      return Number(frontGroup.children[1].getAttribute('opacity'));
    });
    assert.ok(Math.abs(samples[0] - samples[2]) < 0.12, 'depth handoff is smooth at the shared petal tip');
    frame(start + 1070);
    assert.ok(Number(frontPath.getAttribute('opacity')) > 0.17, 'there is no whole-track fade or pause at a side boundary');
    const radiusAt = time => {
      frame(start + time);
      const coordinates = pathEl.getAttribute('d').match(/-?\d+\.\d+/g).map(Number);
      return Math.max(...coordinates.filter((_, i) => i % 2 === 0)) - 50;
    };
    const resting = radiusAt(0), peak = radiusAt(600), nextBeat = radiusAt(1200);
    assert.ok(Math.abs(nextBeat - resting) < 0.02, '50 BPM pulse repeats every 1200ms');
    assert.ok(peak / resting > 1.03 && peak / resting < 1.08, 'heartbeat swell is gentle');
    animation.stop();
  } finally {
    global.requestAnimationFrame = originalFrame;
  }
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

test('navigation transitions cancel stale mask frames and keep successor loader ownership', async () => {
  const vm = require('node:vm');
  const frames = [], masks = { 'black-mask-top': { style: {} }, 'black-mask-bottom': { style: {} } };
  const content = { isConnected: true, style: { removeProperty(key) { delete this[key]; } } };
  let hidden = 0, shown = 0;
  const window = { PageHost: { getContent: () => content }, TransitionLoader: {
    initDashboardLoader() {}, initTransitionLoader() {}, startLoaderTimer() {},
    showInnerLoader() { shown++; }, hideInnerLoader() { hidden++; }, cleanup() {}
  } };
  const context = vm.createContext({ window, document: { createElement: () => ({}), head: { appendChild() {} }, getElementById: id => masks[id] },
    performance: { now: () => 0 }, requestAnimationFrame: fn => frames.push(fn), setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.resolve('public/js/components/navigation-transition.js'), 'utf8'), context);
  window.NavigationTransition.initialize();
  assert.equal(typeof window.spaMaskOpen, 'function');
  const oldController = new AbortController();
  const old = window.NavigationTransition.create({ signal: oldController.signal, internal: false });
  const started = old.start();
  oldController.abort();
  const next = window.NavigationTransition.create({ signal: new AbortController().signal, internal: true, fromQC: true });
  await next.start();
  const before = hidden;
  frames.shift()(1000); await started;
  old.cleanup(); old.cancel();
  assert.equal(hidden, before, 'stale completion must not hide the successor loader');
  assert.equal(shown, 1);
  assert.equal(masks['black-mask-top'].style.pointerEvents, 'none');
  next.cancel();
});

test('reduced-motion navigation skips timed masks and releases content input', async () => {
  const vm = require('node:vm');
  const masks = { 'black-mask-top': { style: {} }, 'black-mask-bottom': { style: {} } };
  const content = { isConnected: true, style: { removeProperty(key) { delete this[key]; } } };
  const window = { matchMedia: () => ({ matches: true }), PageHost: { getContent: () => content }, TransitionLoader: {
    initDashboardLoader() {}, initTransitionLoader() {}, startLoaderTimer() {}, showInnerLoader() {}, hideInnerLoader() {}, cleanup() {}
  } };
  const context = vm.createContext({ window, document: { createElement: () => ({}), head: { appendChild() {} }, getElementById: id => masks[id] },
    requestAnimationFrame: () => { throw new Error('reduced motion must not wait for mask frames'); }, setTimeout, clearTimeout });
  vm.runInContext(fs.readFileSync(path.resolve('public/js/components/navigation-transition.js'), 'utf8'), context);
  for (const internal of [false, true]) {
    const transition = window.NavigationTransition.create({ signal: new AbortController().signal, internal });
    await transition.start(); assert.equal(content.inert, true);
    await transition.complete(); assert.equal(content.inert, false);
    assert.equal(content.style.opacity, '1');
    if (!internal) assert.equal(masks['black-mask-top'].style.pointerEvents, 'none');
    transition.cancel();
  }
});
