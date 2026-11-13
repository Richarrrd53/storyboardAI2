const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('source modal portals out of page content, waits for exit, and tears down its lease/listener', () => {
  const nodes = new Map(), listeners = new Set(), releases = [], calls = [];
  let body;
  function element(id) {
    const el = { id, style: {}, hidden: true, children: [], classList: { remove() {} },
      get isConnected() { return this === body || !!this.parentNode?.isConnected; },
      appendChild(child) { child.remove(); this.children.push(child); child.parentNode = this; },
      insertBefore(child) { this.appendChild(child); },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; },
      focus() {}, querySelector() { return nodes.get('panel'); }
    }; nodes.set(id, el); return el;
  }
  body = element('body'); const page = element('page'), modal = element('source-detail-modal'); body.appendChild(page); page.appendChild(modal);
  const panel = element('panel'); modal.appendChild(panel);
  const open = element('btn-open-source-modal'), close = element('btn-close-source-modal');
  const document = { body, getElementById: id => nodes.get(id) || null, querySelector: () => null };
  const context = { document, console, clearTimeout, setTimeout,
    addEventListener: (name, fn) => { if (name === 'keydown') listeners.add(fn); },
    removeEventListener: (name, fn) => { if (name === 'keydown') listeners.delete(fn); },
    ModalAnimation: { open: (...args) => calls.push(['open', ...args]), close: (...args) => calls.push(['close', ...args]), cancel: () => calls.push(['cancel']) },
    OverlayManager: { acquire: options => { assert.equal(options.overlay.parentNode, body, 'inert scope requires a body portal'); return { release: value => releases.push(value) }; } }
  };
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/js/template-timeline.js', 'utf8'), context);
  context.initSourceInfoModal({ name: 'Fixture', source: {} });
  assert.equal(listeners.size, 1); open.onclick(); assert.equal(modal.parentNode, body); assert.equal(modal.hidden, false);
  close.onclick(); assert.equal(modal.hidden, false, 'exit must finish before hiding');
  const exit = calls.find(call => call[0] === 'close'); exit[3].onComplete();
  assert.equal(modal.hidden, true); assert.equal(modal.parentNode, page); assert.equal(releases.length, 1);
  open.onclick(); page.remove(); context.destroyTemplateTimeline();
  assert.equal(modal.parentNode, null, 'unmounted content must not leave a body portal');
  assert.equal(listeners.size, 0); assert.equal(releases.at(-1).restoreFocus, false);
  assert.equal(open.onclick, null); assert.ok(calls.some(call => call[0] === 'cancel'));
});
