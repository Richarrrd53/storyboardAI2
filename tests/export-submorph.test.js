const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadInto(ctx, relPath) {
  const code = fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
  const fn = new Function('window', 'document', 'global', 'globalThis', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', code);
  fn(ctx.window, ctx.document, ctx.window, ctx.window, ctx.setTimeout, ctx.clearTimeout, ctx.requestAnimationFrame, ctx.cancelAnimationFrame, ctx.performance);
}

function createHarness() {
  const listeners = { window: {}, document: {} };
  let activeElement = null;

  function makeEl(tag = 'div', cls = '') {
    const classSet = new Set(cls.split(/\s+/).filter(Boolean));
    const elListeners = {};
    const attrs = {};
    const style = {
      setProperty: (k, v) => { style[k] = v; },
      removeProperty: (k) => { delete style[k]; }
    };
    const el = {
      tagName: tag.toUpperCase(),
      style,
      dataset: {},
      children: [],
      parentElement: null,
      parentNode: null,
      isConnected: true,
      tabIndex: 0,
      disabled: false,
      hidden: false,
      inert: false,
      _html: '',
      get className() { return Array.from(classSet).join(' '); },
      set className(v) { classSet.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => classSet.add(c)); },
      classList: {
        add: (...c) => c.forEach(x => classSet.add(x)),
        remove: (...c) => c.forEach(x => classSet.delete(x)),
        toggle: (c, f) => {
          const on = f === undefined ? !classSet.has(c) : Boolean(f);
          if (on) classSet.add(c); else classSet.delete(c);
          return on;
        },
        contains: (c) => classSet.has(c)
      },
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      hasAttribute: (k) => k in attrs,
      removeAttribute: (k) => { delete attrs[k]; },
      appendChild(child) {
        child.parentElement = el;
        child.parentNode = el;
        el.children.push(child);
        return child;
      },
      removeChild(child) {
        const i = el.children.indexOf(child);
        if (i >= 0) el.children.splice(i, 1);
        child.parentElement = null;
        child.parentNode = null;
      },
      remove() { el.parentNode?.removeChild?.(el); el.isConnected = false; },
      contains(node) {
        if (!node) return false;
        if (node === el) return true;
        return el.children.some(c => c.contains(node));
      },
      matches(sel) {
        return sel.split(',').map(s => s.trim()).some(part => {
          if (part.startsWith('.')) return classSet.has(part.slice(1));
          if (part.startsWith('[') && part.endsWith(']')) {
            const inner = part.slice(1, -1);
            const eq = inner.indexOf('=');
            if (eq === -1) return inner in attrs;
            const k = inner.slice(0, eq);
            const val = inner.slice(eq + 1).replace(/^["']|["']$/g, '');
            return attrs[k] === val;
          }
          return el.tagName.toLowerCase() === part.toLowerCase();
        });
      },
      closest(sel) {
        let cur = el;
        while (cur) {
          if (cur.matches?.(sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const res = [];
        const walk = (node) => {
          for (const c of node.children || []) {
            if (c.matches?.(sel)) res.push(c);
            walk(c);
          }
        };
        walk(el);
        return res;
      },
      querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
      cloneNode() { return makeEl(tag, el.className); },
      getBoundingClientRect: () => ({ left: 100, top: 100, width: 182, height: 44, right: 282, bottom: 144 }),
      addEventListener(type, fn, opts) {
        elListeners[type] = elListeners[type] || [];
        elListeners[type].push({ fn, capture: typeof opts === 'boolean' ? opts : Boolean(opts?.capture) });
      },
      removeEventListener(type, fn, opts) {
        const capture = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
        elListeners[type] = (elListeners[type] || []).filter(l => !(l.fn === fn && l.capture === capture));
      },
      dispatchEvent(evt) {
        evt.target = evt.target || el;
        evt.preventDefault = evt.preventDefault || (() => { evt.defaultPrevented = true; });
        evt.stopPropagation = evt.stopPropagation || (() => { evt._stopped = true; });
        evt.stopImmediatePropagation = evt.stopImmediatePropagation || (() => { evt._stopped = true; evt._stoppedImmediate = true; });
        const path = [];
        let cur = evt.target;
        while (cur) { path.unshift(cur); cur = cur.parentElement; }
        for (const h of (listeners.document[evt.type] || [])) {
          if (h.capture && !evt._stoppedImmediate) h.fn(evt);
        }
        for (const node of path) {
          if (evt._stopped) break;
          for (const h of (node._listeners?.[evt.type] || [])) {
            if (h.capture && !evt._stoppedImmediate) h.fn(evt);
          }
        }
        for (let i = path.length - 1; i >= 0; i--) {
          if (evt._stopped) break;
          for (const h of (path[i]._listeners?.[evt.type] || [])) {
            if (!h.capture && !evt._stoppedImmediate) h.fn(evt);
          }
        }
        for (const h of (listeners.document[evt.type] || [])) {
          if (!h.capture && !evt._stopped && !evt._stoppedImmediate) h.fn(evt);
        }
      },
      _listeners: elListeners,
      focus() {
        activeElement = el;
        document.dispatchEvent({ type: 'focusin', target: el });
      },
      click() {
        el.dispatchEvent({ type: 'click', target: el, pointerId: 1, detail: 1 });
      },
      get innerHTML() { return el._html; },
      set innerHTML(html) {
        el._html = String(html);
        el.children = [];
        if (html.includes('data-action="export"')) {
          const btn = makeEl('button', 'morph-item export');
          btn.dataset.action = 'export';
          btn.setAttribute('data-action', 'export');
          const icon = makeEl('span', 'morph-item-icon');
          const label = makeEl('span', 'morph-item-label');
          label.textContent = '匯出分鏡';
          const chevron = makeEl('span', 'morph-item-chevron');
          btn.appendChild(icon);
          btn.appendChild(label);
          btn.appendChild(chevron);
          el.appendChild(btn);
        }
        if (html.includes('data-export-action="retract"')) {
          const inner = makeEl('div', 'export-submorph-inner');
          const header = makeEl('button', 'morph-item export-submorph-header');
          header.dataset.exportAction = 'retract';
          header.setAttribute('data-export-action', 'retract');
          header.appendChild(makeEl('span', 'morph-item-chevron'));
          const div = makeEl('div', 'morph-divider export-submorph-divider');
          const jsonBtn = makeEl('button', 'morph-item export-format-item export-submorph-option');
          jsonBtn.dataset.exportAction = 'json';
          jsonBtn.setAttribute('data-export-action', 'json');
          const pdfBtn = makeEl('button', 'morph-item export-format-item export-submorph-option');
          pdfBtn.dataset.exportAction = 'pdf';
          pdfBtn.setAttribute('data-export-action', 'pdf');
          inner.appendChild(header);
          inner.appendChild(div);
          inner.appendChild(jsonBtn);
          inner.appendChild(pdfBtn);
          el.appendChild(inner);
        }
      }
    };
    return el;
  }

  const body = makeEl('body');
  const document = {
    body,
    documentElement: { clientWidth: 1280, clientHeight: 800 },
    get activeElement() { return activeElement; },
    createElement: (tag) => makeEl(tag),
    addEventListener(type, fn, opts) {
      listeners.document[type] = listeners.document[type] || [];
      listeners.document[type].push({ fn, capture: typeof opts === 'boolean' ? opts : Boolean(opts?.capture) });
    },
    removeEventListener(type, fn, opts) {
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
      listeners.document[type] = (listeners.document[type] || []).filter(l => !(l.fn === fn && l.capture === capture));
    },
    dispatchEvent(evt) {
      const target = evt.target || body;
      for (const h of (listeners.document[evt.type] || [])) {
        h.fn({ ...evt, target, preventDefault: () => {}, stopPropagation: () => {}, stopImmediatePropagation: () => {} });
      }
    }
  };

  const window = {
    document,
    innerWidth: 1280,
    innerHeight: 800,
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    getComputedStyle: () => ({ getPropertyValue: () => '15' }),
    addEventListener(type, fn, opts) {
      listeners.window[type] = listeners.window[type] || [];
      listeners.window[type].push({ fn, capture: typeof opts === 'boolean' ? opts : Boolean(opts?.capture) });
    },
    removeEventListener(type, fn, opts) {
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts?.capture);
      listeners.window[type] = (listeners.window[type] || []).filter(l => !(l.fn === fn && l.capture === capture));
    }
  };

  const ctx = {
    window,
    document,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { fn(performance.now()); return 1; },
    cancelAnimationFrame: () => {},
    performance: { now: () => Date.now() }
  };

  loadInto(ctx, 'public/js/components/overlay-manager.js');
  loadInto(ctx, 'public/js/components/surface-morph.js');
  loadInto(ctx, 'public/js/features/export/export-dialog.js');
  loadInto(ctx, 'public/js/components/project-option-morph.js');

  return { window, document, body };
}

test('Export SubMorph stays open on focusin/pointerdown/click and executes export action', () => {
  const { window, document, body } = createHarness();
  let exportedProject = null;
  window.StoryboardExport = {
    exportJson: (source) => { exportedProject = source; }
  };

  const trigger = document.createElement('button');
  body.appendChild(trigger);

  window.ProjectOptionMorph.open(trigger, { id: 'proj-1', title: 'Test' });
  assert.equal(window.SurfaceMorph.isOpen(), true, 'Level-1 menu should open');

  const exportBtn = body.querySelector('[data-action="export"]');
  assert.ok(exportBtn, 'Level-1 export button should exist');
  assert.ok(exportBtn.querySelector('.morph-item-chevron'), 'Level-1 export button should include chevron indicator');

  // Clicking export opens Level-2 submorph (and focuses json option inside it)
  exportBtn.click();

  const subPanel = body.querySelector('.export-submorph-panel');
  assert.ok(subPanel, 'Level-2 export submorph panel should be mounted');
  assert.equal(window.SurfaceMorph.isOpen(), true, 'SurfaceMorph must remain open after Level-2 submorph opens and focuses');
  assert.ok(subPanel.querySelector('.export-submorph-header')?.querySelector('.morph-item-chevron'), 'Level-2 header should include chevron indicator');

  const jsonBtn = subPanel.querySelector('[data-export-action="json"]');
  assert.ok(jsonBtn, 'JSON option button should exist in Level-2 panel');

  // Simulate pointerdown + click inside Level-2 panel
  jsonBtn.dispatchEvent({ type: 'pointerdown', target: jsonBtn, pointerId: 1, button: 0 });
  assert.equal(window.SurfaceMorph.isOpen(), true, 'pointerdown inside Level-2 panel must not close menu');

  jsonBtn.click();
  assert.ok(exportedProject, 'Clicking JSON option in Level-2 panel should execute exportJson');
  assert.equal(exportedProject.projectId, 'proj-1');
  assert.equal(window.SurfaceMorph.isOpen(), false, 'Menu should close cleanly after executing Level-2 action');
});
