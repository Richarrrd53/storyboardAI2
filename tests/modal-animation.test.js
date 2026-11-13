const test = require('node:test');
const assert = require('node:assert/strict');
const { ModalAnimation } = require('../public/js/sys');

function createMockNode() {
  const listeners = {};
  const classes = new Set();
  const style = {};
  return {
    style,
    className: '',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c)
    },
    addEventListener: (ev, fn) => {
      listeners[ev] = listeners[ev] || [];
      listeners[ev].push(fn);
    },
    dispatchEvent: (ev) => {
      (listeners[ev] || []).forEach(f => f({ type: ev }));
    }
  };
}

test('ModalAnimation: open sets initial zero blur & scale 0, then transitions to blur and scale 1 in 10ms', async () => {
  const overlay = createMockNode();
  const panel = createMockNode();

  ModalAnimation.open(overlay, panel, { blur: '20px', backdropBg: 'rgba(0,0,0,0.5)' });

  // Initial state right after open()
  assert.equal(overlay.style.display, 'flex');
  assert.equal(overlay.style.backdropFilter, 'blur(0px)');
  assert.equal(panel.style.scale, '0');
  assert.ok(overlay.style.transition.includes('cubic-bezier(.4,0,.2,1)'));
  assert.ok(panel.style.transition.includes('cubic-bezier(.34,1.59,.69,.99)'));

  // After 20ms timeout
  await new Promise(r => setTimeout(r, 25));

  assert.ok(overlay.classList.contains('active'));
  assert.equal(overlay.style.backdropFilter, 'blur(20px)');
  assert.equal(panel.style.scale, '1');
  assert.equal(overlay.style.opacity, '1');
});

test('ModalAnimation: close sets closing easing curve, then scale 0 and blur 0 in 10ms, then display none', async () => {
  const overlay = createMockNode();
  const panel = createMockNode();

  ModalAnimation.open(overlay, panel, { blur: '16px' });
  await new Promise(r => setTimeout(r, 25));

  let closedCompleted = false;
  ModalAnimation.close(overlay, panel, {
    duration: 100, // shorten for fast test
    onComplete: () => {
      closedCompleted = true;
    }
  });

  // Step 1: Immediate easing curve change
  assert.ok(panel.style.transition.includes('cubic-bezier(.31, .01, .66, -0.59)'));

  // Step 2: After 20ms timeout, scale drops to 0 and blur drops to 0px
  await new Promise(r => setTimeout(r, 25));
  assert.equal(panel.style.scale, '0');
  assert.equal(overlay.style.backdropFilter, 'blur(0px)');

  // Step 3: After duration + 50ms, display becomes none and onComplete fires
  assert.equal(overlay.style.background, 'rgba(15, 23, 42, 0.45)', 'Exit must retain backdrop alpha until removed');
  await new Promise(r => setTimeout(r, 150));
  assert.equal(overlay.style.display, 'none');
  assert.equal(closedCompleted, true);
});

test('legacy delete can explicitly preserve its existing backdrop fade', async () => {
  const overlay = createMockNode(); const panel = createMockNode();
  ModalAnimation.open(overlay, panel); await new Promise(r => setTimeout(r, 25));
  ModalAnimation.close(overlay, panel, { duration: 20, fadeBackdrop: true, legacyMotion: true });
  assert.ok(overlay.style.transition.includes('background-color'), 'legacy delete keeps its animated backdrop transition');
  await new Promise(r => setTimeout(r, 25));
  assert.equal(overlay.style.background, 'rgba(15, 23, 42, 0)');
});

test('reopening a central modal cancels the previous exit completion', async () => {
  const overlay = createMockNode(), panel = createMockNode(); let staleClosed = false;
  ModalAnimation.open(overlay, panel); await new Promise(r => setTimeout(r, 25));
  ModalAnimation.close(overlay, panel, { duration: 40, onComplete: () => { staleClosed = true; } });
  ModalAnimation.open(overlay, panel); await new Promise(r => setTimeout(r, 120));
  assert.equal(staleClosed, false); assert.equal(overlay.style.display, 'flex'); assert.equal(panel.style.scale, '1');
  ModalAnimation.cancel(overlay);
});

test('reduced motion settles ordinary central modals immediately while keeping the delete exception', () => {
  const previousWindow = global.window;
  global.window = { matchMedia: () => ({ matches: true }) };
  try {
    const overlay = createMockNode(), panel = createMockNode();
    ModalAnimation.open(overlay, panel);
    assert.equal(panel.style.scale, '1'); assert.ok(panel.style.transition.includes('0ms'));
    const legacyOverlay = createMockNode(), legacyPanel = createMockNode();
    ModalAnimation.open(legacyOverlay, legacyPanel, { legacyMotion: true });
    assert.equal(legacyPanel.style.scale, '0'); assert.ok(legacyPanel.style.transition.includes('400ms'));
    ModalAnimation.cancel(overlay); ModalAnimation.cancel(legacyOverlay);
  } finally { global.window = previousWindow; }
});
