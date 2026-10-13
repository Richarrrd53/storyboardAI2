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
  assert.ok(panel.style.transition.includes('cubic-bezier(.33,1.53,.69,.99)'));

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
  await new Promise(r => setTimeout(r, 150));
  assert.equal(overlay.style.display, 'none');
  assert.equal(closedCompleted, true);
});
