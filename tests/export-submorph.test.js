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
    },
    dispatchEvent(evt) {
      for (const h of (listeners.window[evt.type] || [])) {
        h.fn({ ...evt, preventDefault: () => {}, stopPropagation: () => {}, stopImmediatePropagation: () => {} });
      }
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

function createSpringHarness() {
  const ctx = createHarness();
  let reducedMotion = false;
  ctx.window.matchMedia = () => ({ matches: reducedMotion, addEventListener: () => {}, removeEventListener: () => {} });
  ctx.setReducedMotion = (v) => { reducedMotion = v; };

  let rafId = 0;
  const rafQueue = new Map();
  let nowMs = 1000;
  ctx.window.performance = { now: () => nowMs };
  ctx.performance = ctx.window.performance;

  const springCtx = {
    window: ctx.window,
    document: ctx.document,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    requestAnimationFrame: (fn) => { const id = ++rafId; rafQueue.set(id, fn); return id; },
    cancelAnimationFrame: (id) => { rafQueue.delete(id); },
    performance: ctx.window.performance
  };

  loadInto(springCtx, 'public/js/components/overlay-manager.js');
  loadInto(springCtx, 'public/js/components/surface-morph.js');
  loadInto(springCtx, 'public/js/features/export/export-dialog.js');
  loadInto(springCtx, 'public/js/components/project-option-morph.js');

  function stepFrames(count, dtMs = 16) {
    for (let i = 0; i < count; i++) {
      nowMs += dtMs;
      const pending = Array.from(rafQueue.entries());
      rafQueue.clear();
      for (const [, fn] of pending) fn(nowMs);
    }
  }

  return { window: ctx.window, document: ctx.document, body: ctx.body, stepFrames };
}

test('Level-2 SubMorph uses spring physics, recedes Level-1, and retracts on dimmed Level-1 click or Escape', () => {
  const { window, document, body, stepFrames } = createSpringHarness();
  const trigger = document.createElement('button');
  body.appendChild(trigger);

  window.ProjectOptionMorph.open(trigger, { id: 'proj-2', title: 'Spring Test' });
  stepFrames(40, 16);
  assert.equal(window.SurfaceMorph.isOpen(), true);

  const exportBtn = body.querySelector('[data-action="export"]');
  exportBtn.click();
  assert.equal(window.SurfaceMorph.isSubmenuOpen(), true);

  const primarySurface = body.querySelector('.surface-morph-surface');
  const subPanel = body.querySelector('.export-submorph-panel');
  assert.ok(subPanel, 'Submenu panel should be mounted');

  // Step a few frames mid-open (not settled yet)
  stepFrames(4, 16);
  assert.ok(primarySurface.classList.contains('is-submorph-receded'), 'Level-1 should be receded');
  const dimMid = parseFloat(primarySurface.style['--morph-sub-dim'] || '0');
  assert.ok(dimMid > 0 && dimMid < 1, `Expected mid-flight subP dim between 0 and 1, got ${dimMid}`);
  assert.equal(exportBtn.style.visibility, 'hidden', 'Origin trigger row should be hidden while Level-2 is visible');

  // Interrupt mid-open by clicking dimmed Level-1 surface -> should retract smoothly without closing Level-1
  primarySurface.dispatchEvent({ type: 'pointerdown', target: primarySurface, pointerId: 1, button: 0, pointerType: 'mouse' });
  document.dispatchEvent({ type: 'pointerup', target: primarySurface, pointerId: 1, button: 0, pointerType: 'mouse' });
  primarySurface.dispatchEvent({ type: 'click', target: primarySurface, pointerId: 1, detail: 1 });
  assert.equal(window.SurfaceMorph.isSubmenuOpen(), false, 'Submenu target should flip to closing');
  assert.equal(window.SurfaceMorph.isOpen(), true, 'Level-1 menu must remain open');

  // Step frames until retracted
  stepFrames(45, 16);
  assert.equal(body.querySelector('.export-submorph-panel'), null, 'Submenu panel should be removed after spring settles at 0');
  assert.equal(exportBtn.style.visibility, '', 'Origin trigger row visibility should be restored');
  assert.equal(primarySurface.classList.contains('is-submorph-receded'), false);

  // Re-open and test Escape retracts Level-2 only
  exportBtn.click();
  stepFrames(45, 16);
  assert.equal(window.SurfaceMorph.isSubmenuOpen(), true);
  assert.ok(body.querySelector('.export-submorph-panel').classList.contains('interactive'));

  window.dispatchEvent({ type: 'keydown', key: 'Escape', isComposing: false });
  assert.equal(window.SurfaceMorph.isSubmenuOpen(), false, 'Escape should retract Level-2');
  assert.equal(window.SurfaceMorph.isOpen(), true, 'Escape from Level-2 should keep Level-1 open');
});

test('Level-2 SubMorph supports touch slide-to-select gesture and closes all cleanly', () => {
  const { window, document, body, stepFrames } = createSpringHarness();
  let exported = false;
  window.StoryboardExport = { exportJson: () => { exported = true; } };

  const trigger = document.createElement('button');
  body.appendChild(trigger);

  window.ProjectOptionMorph.open(trigger, { id: 'proj-3', title: 'Gesture Test' });
  stepFrames(40, 16);
  body.querySelector('[data-action="export"]').click();
  stepFrames(40, 16);

  const subPanel = body.querySelector('.export-submorph-panel');
  const headerBtn = subPanel.querySelector('[data-export-action="retract"]');
  const jsonBtn = subPanel.querySelector('[data-export-action="json"]');

  let pointTarget = headerBtn;
  document.elementFromPoint = () => pointTarget;

  // Touch down on header, slide to jsonBtn, release
  headerBtn.dispatchEvent({ type: 'pointerdown', target: headerBtn, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: 120, clientY: 120 });
  assert.ok(headerBtn.classList.contains('is-gesture-hover'), 'Header should get gesture hover on touch down');

  pointTarget = jsonBtn;
  document.dispatchEvent({ type: 'pointermove', target: jsonBtn, pointerId: 7, pointerType: 'touch', clientX: 120, clientY: 200 });
  assert.equal(headerBtn.classList.contains('is-gesture-hover'), false);
  assert.ok(jsonBtn.classList.contains('is-gesture-hover'), 'JSON option should get gesture hover when finger slides onto it');

  document.dispatchEvent({ type: 'pointerup', target: jsonBtn, pointerId: 7, pointerType: 'touch', clientX: 120, clientY: 200 });
  assert.equal(window.SurfaceMorph.isOpen(), false, 'Menu should close after executing Level-2 action');

  stepFrames(50, 16);
  assert.equal(exported, true, 'Releasing finger on JSON option should execute exportJson');
  assert.equal(body.querySelector('.surface-morph-overlay'), null, 'Overlay should be removed after close spring finishes');
});

test('openFormatMenu copies trigger label on desktop and keeps icon-only on mobile', () => {
  const { window, document, body, stepFrames } = createSpringHarness();
  let mobile = false;
  const origGetComputedStyle = window.getComputedStyle;
  window.getComputedStyle = (el) => ({
    ...origGetComputedStyle(el),
    display: el?.tagName === 'SPAN' ? (mobile ? 'none' : 'inline') : 'inline-flex',
    font: '600 13px sans-serif',
    color: 'rgb(15, 23, 42)',
    padding: mobile ? '0px' : '8px 16px',
    gap: mobile ? '0px' : '6px',
    justifyContent: mobile ? 'center' : 'normal'
  });

  const trigger = document.createElement('button');
  trigger.className = 'project-workspace-btn';
  const svg = document.createElement('svg');
  svg.nodeType = 1;
  const label = document.createElement('span');
  label.nodeType = 1;
  label.textContent = '匯出分鏡';
  label.cloneNode = () => {
    const c = document.createElement('span');
    c.textContent = label.textContent;
    return c;
  };
  trigger.appendChild(svg);
  trigger.appendChild(label);
  body.appendChild(trigger);

  window.StoryboardExportDialog.openFormatMenu(trigger, { projectId: 'proj-4', project: { id: 'proj-4', title: 'Detail' } });
  let morphIcon = body.querySelector('.morph-icon');
  assert.ok(morphIcon, 'Morph icon proxy should be mounted');
  assert.ok(morphIcon.classList.contains('morph-icon--trigger'), 'Morph icon should copy trigger contents');
  let clonedLabel = morphIcon.querySelector('span');
  assert.equal(clonedLabel?.textContent, '匯出分鏡', 'Desktop morph proxy should include trigger label');
  assert.equal(clonedLabel?.style.display, 'inline', 'Desktop morph proxy label should remain visible');

  window.SurfaceMorph.close('outside_click');
  stepFrames(50, 16);

  mobile = true;
  window.StoryboardExportDialog.openFormatMenu(trigger, { projectId: 'proj-4', project: { id: 'proj-4', title: 'Detail' } });
  morphIcon = body.querySelector('.morph-icon');
  clonedLabel = morphIcon?.querySelector('span');
  assert.equal(clonedLabel?.style.display, 'none', 'Mobile morph proxy should keep label hidden (icon-only)');

  window.SurfaceMorph.close('outside_click');
  stepFrames(50, 16);
});
