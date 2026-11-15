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
      if(sel.includes(',')) return [...new Set(sel.split(',').flatMap(part=>this.querySelectorAll(part.trim())))];
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
  new Function(fs.readFileSync(path.resolve('public/js/components/overlay-manager.js'), 'utf8'))();
  new Function(fs.readFileSync(path.resolve('public/js/components/surface-morph.js'), 'utf8').replace('const p=s.p,g=s.geometry', 'if(root.__morphInput){s.p=root.__morphInput.p;s.dirMix=root.__morphInput.dirMix;}const p=s.p,g=s.geometry').replace('s.primitives=prims;', 's.primitives=prims;root.__morphFrame={p:s.p,velocity:s.velocity,dirMix:s.dirMix,prims,geometry:g};'))();
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

  // Wait for 650ms flight animation to complete and action callback to execute
  await new Promise(resolve => setTimeout(resolve, 720));

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


test('ProjectOptionMorph: generic dropdown shares singleton and restores actual trigger dimensions', () => {
  const {body,windowListeners} = setupMockEnvironment();
  const morph=loadProjectOptionMorph();
  const trigger=createMockElement('button');
  trigger.getBoundingClientRect=()=>({left:20,right:140,top:30,bottom:70,width:120,height:40});
  const content=createMockElement('div'); content.appendChild(createMockElement('button'));
  let closed=0;
  morph.openSurface(trigger,{content,width:240,label:'標籤',onClose:()=>closed++});
  assert.equal(trigger.getAttribute('aria-expanded'),'true');
  assert.equal(parseFloat(body.querySelector('.global-project-option-menu').style.width),240);
  assert.equal(body.querySelector('.morph-icon').style.width,'120px');
  assert.equal(body.querySelector('.global-project-option-menu').getAttribute('role'),'menu');
  morph.open(createMockElement('button'),{id:'project'},createMockElement('div'));
  assert.equal(closed,1);
  assert.equal(trigger.getAttribute('aria-expanded'),'false');
  assert.equal(windowListeners.keydown.length,1);
  morph.close('unmount');
  assert.equal(windowListeners.keydown.length,0);
  assert.equal(body.querySelector('.project-option-overlay'),null);
});

// The shared engine is exercised through the real compatibility adapter and a manual RAF clock.
function morphClock() {
  const env=setupMockEnvironment(); let time=0, sequence=0; const queue=new Map();
  window.performance.now=()=>time;
  window.requestAnimationFrame=fn=>{queue.set(++sequence,fn);return sequence;};
  window.cancelAnimationFrame=id=>queue.delete(id);
  env.step=ms=>{let remaining=ms;do{const dt=Math.min(16,remaining);time+=dt;remaining-=dt;const work=[...queue.values()];queue.clear();work.forEach(fn=>fn(time));}while(remaining>0);};
  env.pending=()=>queue.size;loadProjectOptionMorph();return env;
}
test('SurfaceMorph: reversing an in-flight close reuses the same surface without resetting geometry',()=>{
  const {body,step}=morphClock();const trigger=createMockElement('button'),content=createMockElement('div');
  const handle=window.SurfaceMorph.open(trigger,{content});step(180);
  const surface=body.querySelector('.surface-morph-surface');const width=surface.style.width;
  handle.close('toggle');assert.equal(surface.style.width,width);step(100);
  const closingWidth=surface.style.width;
  const reopened=window.SurfaceMorph.open(trigger,{content});
  assert.equal(reopened,handle);assert.equal(surface.style.width,closingWidth);assert.equal(body.querySelectorAll('.surface-morph-surface').length,1);
  step(1200);assert.equal(handle.phase,'open');window.SurfaceMorph.destroy();assert.equal(body.querySelector('.surface-morph-overlay'),null);
});
test('SurfaceMorph: route teardown cancels pending actions and restores the trigger',()=>{
  const {step,windowListeners}=morphClock();const trigger=createMockElement('button'),content=createMockElement('div');let actions=0;
  window.SurfaceMorph.open(trigger,{content});step(1200);window.SurfaceMorph.close('action',()=>actions++);
  window.SurfaceMorph.close('navigation');step(1000);
  assert.equal(actions,0);assert.equal(trigger.classList.contains('is-hidden-for-morph'),false);assert.equal(windowListeners.keydown.length,0);
});
test('SurfaceMorph: internal scroll is retained, ancestor scroll dismisses, reduced motion has no RAF',()=>{
  const {step,windowMock,body}=morphClock();const trigger=createMockElement('button'),content=createMockElement('div');
  const handle=window.SurfaceMorph.open(trigger,{content});step(1200);
  windowMock.dispatchEvent({type:'scroll',target:content});assert.equal(handle.phase,'open');
  windowMock.dispatchEvent({type:'scroll',target:body});assert.equal(handle.phase,'closing');step(1200);assert.equal(window.SurfaceMorph.getState(),null);
  windowMock.matchMedia=()=>({matches:true});
  const reduced=window.SurfaceMorph.open(trigger,{content});assert.equal(reduced.phase,'open');
  reduced.close('close');assert.equal(window.SurfaceMorph.getState(),null);
});
test('SurfaceMorph: explicit keepTrigger opt-in remains available to other adapters',()=>{
  const {step}=morphClock();const trigger=createMockElement('button'),content=createMockElement('div');
  window.SurfaceMorph.open(trigger,{content,keepTrigger:true,role:'dialog',keyboard:'content'});step(1200);
  assert.equal(trigger.classList.contains('surface-morph-trigger-hidden'),false);
  window.SurfaceMorph.close('close');assert.equal(trigger.classList.contains('surface-morph-trigger-hidden'),true);
  step(1200);assert.equal(trigger.classList.contains('surface-morph-trigger-hidden'),false);
});

test('SurfaceMorph: selected filter text may resize without dismissing a multi-select menu',()=>{
  const {step}=morphClock();const observers=[];
  window.ResizeObserver=class { constructor(fn){this.notify=fn;observers.push(this);} observe(){} disconnect(){this.disconnected=true;} };
  const trigger=createMockElement('button'),content=createMockElement('div');
  window.SurfaceMorph.open(trigger,{content});step(1200);assert.equal(observers.length,0);
  window.SurfaceMorph.close('immediate');window.SurfaceMorph.open(trigger,{content,role:'dialog'});step(1200);
  const observer=observers[0];observer.notify([{contentRect:{width:52,height:52}}]);
  assert.equal(window.SurfaceMorph.isOpen(),true);observer.notify([{contentRect:{width:260,height:52}}]);
  assert.equal(window.SurfaceMorph.getState(),null);assert.equal(observer.disconnected,true);
});

test('Account Morph hides the trigger when expanded and dissolves the plate into transparency',()=>{
 const {step}=morphClock();const trigger=createMockElement('button'),content=createMockElement('div');
 const handle=window.SurfaceMorph.open(trigger,{content,role:'dialog',transparentTrigger:true});
 step(1200);assert.equal(trigger.classList.contains('surface-morph-trigger-hidden'),true);
 assert.equal(handle.menu.style['--morph-surface-presence'],'1');
 window.SurfaceMorph.close('close');step(80);
 const halfway=Number(handle.menu.style['--morph-surface-presence']);assert.ok(halfway>0&&halfway<1);
 step(1200);assert.equal(Number(handle.menu.style['--morph-surface-presence']),0);assert.equal(trigger.classList.contains('surface-morph-trigger-hidden'),false);
});

test('SurfaceMorph: interrupted expansion preserves every rendered channel and return lifetime',()=>{
 for(const elapsed of [50,160,200,350,420,470,650]) {
  const {step,windowMock}=morphClock();const trigger=createMockElement('button'),content=createMockElement('div');
  const handle=window.SurfaceMorph.open(trigger,{content});step(elapsed);
  const snapshot=()=>JSON.stringify([handle.menu,handle.menu.parentNode.querySelector('.morph-icon'),handle.menu.querySelector('.morph-menu-content')].map(el=>Object.fromEntries(Object.entries(el.style).filter(([key,value])=>key!=='willChange'&&typeof value!=='function'))));
  const initial=snapshot();handle.close('toggle');step(0);assert.equal(snapshot(),initial);
  windowMock.dispatchEvent({type:'scroll'});
  window.SurfaceMorph.close('focus_out');assert.equal(handle.phase,'closing');
  step(200);assert.notEqual(handle.menu.style.width,'20.00px');
  const closing=snapshot();window.SurfaceMorph.open(trigger,{content});step(0);assert.equal(snapshot(),closing);
  step(200);handle.close('toggle');step(50);assert.ok(window.SurfaceMorph.getState());step(1200);assert.equal(window.SurfaceMorph.getState(),null);
 }
});

test('SurfaceMorph: animated focus-out dismissal does not steal focus back from the next control',()=>{
 const {step}=morphClock();const trigger=createMockElement('button'),content=createMockElement('div');let focused=0;trigger.focus=()=>focused++;
 window.SurfaceMorph.open(trigger,{content});step(1200);window.SurfaceMorph.close('focus_out');step(1200);
 assert.equal(window.SurfaceMorph.getState(),null);assert.equal(focused,0);
});

function measuredMorph(width,height,viewportWidth=1440) {
 const env=morphClock();window.innerWidth=viewportWidth;
 const create=window.document.createElement;
 window.document.createElement=tag=>{const el=create(tag);const rect=el.getBoundingClientRect;el.getBoundingClientRect=()=>el.style.cssText?.includes('-9999')?{height}:rect();return el;};
 const trigger=createMockElement('button');trigger.getBoundingClientRect=()=>({left:300,top:400,width:40,height:40,right:340,bottom:440});
 window.getComputedStyle=()=>({borderTopLeftRadius:'12px',borderTopRightRadius:'8px',borderBottomRightRadius:'6px',borderBottomLeftRadius:'4px'});
 const content=createMockElement('div');const item=createMockElement('button');content.appendChild(item);
 const handle=window.SurfaceMorph.open(trigger,{content,width,radius:20});return {...env,trigger,content,item,handle};
}
// Compare actual rendered primitives against the original HTML, including the
// asymmetric opening/closing curves and the disappearing bridge/source blobs.
// Frozen geometry sampled from the supplied HTML. The suite does not depend on
// temp/ (which is ignored by git), and does not duplicate the engine equations.
const referenceFrames=require('./fixtures/morph-reference.json');

test('SurfaceMorph: rendered liquid geometry matches reference frames on both legs',()=>{
 for(const width of [32,140,260]) {
  const {step,trigger}=measuredMorph(240,280);window.SurfaceMorph.destroy();
  trigger.getBoundingClientRect=()=>({left:100,top:100,right:100+width,bottom:140,width,height:40});
  const h=window.SurfaceMorph.open(trigger,{content:createMockElement('div'),width:240});
  for(const reference of referenceFrames.filter(f=>f.width===width)) {
   window.__morphInput=reference;step(0);
   assert.deepEqual(JSON.parse(JSON.stringify(window.__morphFrame.prims)),reference.prims,`width=${width}, p=${reference.p}, dir=${reference.dirMix}`);
  }
  delete window.__morphInput;window.SurfaceMorph.destroy();
 }
});

test('SurfaceMorph: spring integration and direction blending match the HTML frame for frame',()=>{
 const {step,handle}=measuredMorph(240,280);let p=0,velocity=0,dirMix=1;
 const advance=target=>{const dt=.016;dirMix+=(target-dirMix)*(1-Math.exp(-dt*18));
  for(let i=0;i<4;i++){velocity+=(-(target?195:235)*(p-target)-(target?24.5:27.5)*velocity)*(dt/4);p+=velocity*(dt/4);}
  if(Math.abs(p-target)<.0006&&Math.abs(velocity)<.004){p=target;velocity=0;}
  p=Math.max(0,Math.min(1,p));step(16);
  assert.equal(window.__morphFrame.p,p);assert.equal(window.__morphFrame.velocity,velocity);assert.equal(window.__morphFrame.dirMix,dirMix);
 };
 for(let i=0;i<16;i++)advance(1);handle.close('toggle');for(let i=0;i<6;i++)advance(0);
 window.SurfaceMorph.open(window.SurfaceMorph.getState().trigger,{content:createMockElement('div')});for(let i=0;i<16;i++)advance(1);
 window.SurfaceMorph.destroy();
});

test('SurfaceMorph: centered expansion, blur, row stagger and interaction use reference progress',()=>{
 const {step,trigger}=measuredMorph(240,280);window.SurfaceMorph.destroy();
 const content=createMockElement('div');for(let i=0;i<5;i++)content.appendChild(createMockElement('button','','morph-item'));
 const h=window.SurfaceMorph.open(trigger,{content,width:240}),icon=h.menu.parentNode.querySelector('.morph-icon');
 step(32);assert.ok(Number(icon.style.opacity)<1);assert.ok(parseFloat(icon.style.filter.slice(5))>0);assert.equal(h.menu.inert,true);
 step(80);assert.ok(Number(content.children[0].style.opacity)>Number(content.children[4].style.opacity));
 step(200);assert.equal(h.menu.inert,false);assert.equal(icon.style.opacity,'0');
 step(1200);const f=window.__morphFrame,b=f.prims.blobB;
 assert.equal(h.phase,'open');assert.equal(b.w,240);assert.equal(b.h,280);assert.equal(b.x,320);assert.equal(b.y-b.h/2,450);
 for(const row of content.children){assert.equal(row.style.opacity,'1');assert.equal(row.style.filter,'none');}
 assert.equal(window.__morphFrame.prims.kAM,0);assert.equal(window.__morphFrame.prims.kMB,0);
 window.SurfaceMorph.destroy();for(const row of content.children)assert.equal(row.style.opacity,'');
});

test('SurfaceMorph: final bounds fit narrow, wide and offset visual viewports',()=>{
 for(const viewportWidth of [375,390,768,1024,1440,1920]) {
  const {trigger,step}=measuredMorph(400,400,viewportWidth);window.SurfaceMorph.destroy();
  trigger.getBoundingClientRect=()=>({left:viewportWidth-45,right:viewportWidth-5,top:730,bottom:770,width:40,height:40});
  const h=window.SurfaceMorph.open(trigger,{content:createMockElement('div'),width:400});step(1200);
  const b=window.__morphFrame.prims.blobB;
  assert.ok(b.x-b.w/2>=14-.001);assert.ok(b.x+b.w/2<=viewportWidth-14+.001);
  assert.ok(b.y-b.h/2>=14-.001);assert.ok(b.y+b.h/2<=800-14+.001);assert.equal(h.phase,'open');window.SurfaceMorph.destroy();
 }
 const {step}=morphClock();window.visualViewport={offsetLeft:80,offsetTop:120,width:375,height:500};
 const h=window.SurfaceMorph.open(createMockElement('button'),{content:createMockElement('div'),width:400,height:600});step(1200);
 const b=window.__morphFrame.prims.blobB;assert.ok(b.x-b.w/2>=94);assert.ok(b.x+b.w/2<=441);assert.ok(b.y-b.h/2>=134);assert.ok(b.y+b.h/2<=606);window.SurfaceMorph.destroy();
});

test('SurfaceMorph: focus dismissal during activation leaves only the return RAF',()=>{
 const {step,pending,item,handle}=measuredMorph(240,280);
 item.focus=()=>handle.close('focus_out');step(200);assert.equal(handle.phase,'closing');assert.equal(pending(),1);
 step(1200);assert.equal(window.SurfaceMorph.getState(),null);assert.equal(pending(),0);
});

test('SurfaceMorph: resize during return releases the SDF overlay and listeners',()=>{
 const {step,windowMock,handle}=measuredMorph(320,280);step(1200);handle.close('close');step(100);
 windowMock.dispatchEvent({type:'resize'});assert.equal(window.SurfaceMorph.getState(),null);assert.equal(windowMock.windowListeners.resize.length,0);
});

test('SurfaceMorph: software SDF fallback paints material and releases its canvas',()=>{
 const {body,windowMock}=morphClock();windowMock.matchMedia=()=>({matches:true});
 let painted=null,cleared=0;const create=document.createElement;
 document.createElement=tag=>{const el=create(tag);if(tag==='canvas')el.getContext=kind=>kind==='webgl'?null:{
  clearRect(){cleared++;},createImageData(width,height){return {width,height,data:new Uint8ClampedArray(width*height*4)};},
  putImageData(image,left,top){painted={image,left,top};}
 };return el;};
 const h=window.SurfaceMorph.open(createMockElement('button'),{content:createMockElement('div'),width:120,height:80});
 assert.equal(h.phase,'open');assert.ok(cleared>0);assert.ok(painted);
 const b=window.__morphFrame.prims.blobB,{image,left,top}=painted;
 const index=(Math.floor(b.y-top)*image.width+Math.floor(b.x-left))*4;
 assert.equal(image.data[index+3],255);assert.equal(image.data[index],255);
 assert.equal(body.querySelectorAll('canvas').length,1);h.close('close');assert.equal(body.querySelectorAll('canvas').length,0);
});

// A touch clock dispatches document capture before target handlers, like a browser.
// Timers and RAF share time so the hold threshold and compatibility click suppression
// are tested without real sleeps or skipping the opening animation.
function touchMorphClock() {
 const env=setupMockEnvironment(),doc=window.document,listeners=new Map(),timers=new Map(),frames=new Map();
 let time=0,seq=0,hit=null;
 window.performance.now=()=>time;
 window.setTimeout=(fn,delay)=>{const id=++seq;timers.set(id,{at:time+delay,fn});return id;};
 window.clearTimeout=id=>timers.delete(id);
 window.requestAnimationFrame=fn=>{const id=++seq;frames.set(id,fn);return id;};window.cancelAnimationFrame=id=>frames.delete(id);
 doc.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);};
 doc.removeEventListener=(type,fn)=>listeners.set(type,(listeners.get(type)||[]).filter(f=>f!==fn));
 doc.elementFromPoint=()=>hit;
 const send=(type,target,props={})=>{
  const event={type,target,pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:120,clientY:140,detail:type==='click'?1:0,
   preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},stopPropagation(){this.stopped=true;},...props};
  for(const fn of [...listeners.get(type)||[]]){fn(event);if(event.stopped)break;}
  if(!event.stopped)target?.dispatchEvent?.(event);return event;
 };
 const step=ms=>{let remaining=ms;do {const dt=Math.min(16,remaining);time+=dt;remaining-=dt;
  for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.fn();}
  const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(time));
 }while(remaining>0);};
 loadProjectOptionMorph();
 const trigger=createMockElement('button');trigger.setAttribute('data-morph-trigger','');
 trigger.closest=selector=>selector.includes('data-morph')?trigger:null;
 let captured=null;trigger.setPointerCapture=id=>{captured=id;};trigger.hasPointerCapture=id=>captured===id;trigger.releasePointerCapture=()=>{captured=null;};
 const content=createMockElement('div'),items=['first','disabled','delete'].map(name=>{
  const item=createMockElement('button','','morph-item');item.closest=selector=>selector.includes('menuitem')?item:null;
  item.click=()=>send('click',item,{detail:0});content.appendChild(item);return item;
 });
 items[1].disabled=true;
 let opens=0;
 trigger.addEventListener('click',()=>{opens++;window.SurfaceMorph.open(trigger,{content});});trigger.click=()=>send('click',trigger,{detail:0});
 return {...env,step,send,trigger,items,content,setHit:el=>{hit=el;},opens:()=>opens,captured:()=>captured,pendingTimers:()=>timers.size};
}

test('SurfaceMorph: touch hold opens at 300ms, slides hover and commits exactly one release',()=>{
 const f=touchMorphClock();let first=0,deleted=0,background=0;
 f.items[0].addEventListener('click',()=>first++);f.items[2].addEventListener('click',()=>{window.SurfaceMorph.close('action',()=>deleted++);});
 const behind=createMockElement('button');behind.addEventListener('click',()=>background++);
 f.send('pointerdown',f.trigger);f.step(299);assert.equal(f.opens(),0);f.step(1);assert.equal(f.opens(),1);assert.equal(f.captured(),1);
 f.step(300);f.setHit(f.items[0]);f.send('pointermove',f.trigger,{clientY:200});assert.equal(f.items[0].classList.contains('is-gesture-hover'),true);
 f.setHit(f.items[1]);f.send('pointermove',f.trigger,{clientY:240});assert.equal(f.items[0].classList.contains('is-gesture-hover'),false);assert.equal(f.items[1].classList.contains('is-gesture-hover'),false);
 f.setHit(f.items[2]);f.send('pointermove',f.trigger,{clientY:280});assert.equal(f.items[2].classList.contains('is-gesture-hover'),true);
 f.send('pointerup',f.trigger,{clientY:280});assert.equal(f.captured(),null);assert.equal(f.items[2].classList.contains('is-gesture-hover'),false);
 assert.equal(window.SurfaceMorph.getState().phase,'closing');assert.ok(f.body.querySelector('.surface-morph-overlay'));
 f.send('click',behind);f.step(1200);assert.equal(deleted,1);assert.equal(first,0);assert.equal(background,0);assert.equal(window.SurfaceMorph.getState(),null);
});

test('SurfaceMorph: short taps still click once and moving before the hold cancels its timer',()=>{
 const f=touchMorphClock();f.send('pointerdown',f.trigger);f.step(150);f.send('pointerup',f.trigger);f.send('click',f.trigger);
 assert.equal(f.opens(),1);window.SurfaceMorph.destroy();f.step(1000);assert.equal(f.opens(),1);
 f.send('pointerdown',f.trigger);f.step(200);f.send('pointermove',f.trigger,{clientY:160});assert.equal(f.pendingTimers(),0);f.step(800);assert.equal(f.opens(),1);
});

test('SurfaceMorph: release outside, pointercancel and a second finger never execute a row',()=>{
 for(const reason of ['outside','cancel','second']) {
  const f=touchMorphClock();let clicks=0;f.items[2].addEventListener('click',()=>clicks++);
  f.send('pointerdown',f.trigger);f.step(1000);f.setHit(f.items[2]);f.send('pointermove',f.trigger,{clientY:280});
  if(reason==='outside'){f.setHit(null);f.send('pointerup',f.trigger,{clientX:900,clientY:500});}
  if(reason==='cancel')f.send('pointercancel',f.trigger);
  if(reason==='second')f.send('pointerdown',f.trigger,{pointerId:2,isPrimary:false});
  assert.equal(f.items[2].classList.contains('is-gesture-hover'),false);assert.equal(f.captured(),null);f.step(1200);assert.equal(clicks,0);if(reason==='cancel'){assert.equal(window.SurfaceMorph.getState().phase,'open');window.SurfaceMorph.destroy();}else assert.equal(window.SurfaceMorph.getState(),null);
 }
});

test('SurfaceMorph: lifting a stationary hold leaves its menu open and suppresses the native trigger click',()=>{
 const f=touchMorphClock();f.send('pointerdown',f.trigger);f.step(1000);f.send('pointerup',f.trigger);f.send('click',f.trigger);
 assert.equal(f.opens(),1);assert.notEqual(window.SurfaceMorph.getState().phase,'closing');f.step(1200);assert.equal(window.SurfaceMorph.getState().phase,'open');window.SurfaceMorph.destroy();
});

test('SurfaceMorph: disabled rows, removed openers and destroy during a pending hold do not execute',()=>{
 const f=touchMorphClock();let disabled=0;f.items[1].addEventListener('click',()=>disabled++);
 f.send('pointerdown',f.trigger);f.step(1000);f.setHit(f.items[1]);f.send('pointermove',f.trigger,{clientY:240});f.send('pointerup',f.trigger,{clientY:240});f.step(1200);assert.equal(disabled,0);
 f.send('pointerdown',f.trigger);f.trigger.isConnected=false;f.step(1000);assert.equal(f.opens(),1);
 f.trigger.isConnected=true;f.send('pointerdown',f.trigger);window.SurfaceMorph.destroy();f.step(1000);assert.equal(f.opens(),1);assert.equal(f.pendingTimers(),0);
});

test('SurfaceMorph: backdrop consumes background down/up/click throughout closing, including reduced motion',()=>{
 for(const reducedMotion of [false,true]) {
  const f=touchMorphClock();window.matchMedia=()=>({matches:reducedMotion});f.trigger.click();f.step(1200);
  const behind=createMockElement('button');let background=0;behind.addEventListener('pointerdown',()=>background++);behind.addEventListener('click',()=>background++);
  const down=f.send('pointerdown',behind);assert.equal(down.defaultPrevented,true);assert.equal(background,0);
  if(!reducedMotion){assert.ok(f.body.querySelector('.surface-morph-overlay'));f.send('pointerdown',behind,{pointerId:2});}
  f.step(2000);f.send('pointerup',behind,{pointerId:reducedMotion?1:2});const click=f.send('click',behind,{pointerId:reducedMotion?1:2});
  assert.equal(click.defaultPrevented,true);assert.equal(background,0);assert.equal(window.SurfaceMorph.getState(),null);
  // A fresh pointer transaction after cleanup is not swallowed.
  f.send('pointerdown',behind,{pointerId:3});f.send('pointerup',behind,{pointerId:3});f.send('click',behind,{pointerId:3});assert.equal(background,2);
 }
});


test('SurfaceMorph: capture transfer from a trigger icon keeps the held menu open',()=>{
 const f=touchMorphClock(),icon=createMockElement('svg');f.trigger.appendChild(icon);
 icon.closest=selector=>selector.includes('data-morph')?f.trigger:null;
 f.send('pointerdown',icon);f.step(300);assert.equal(f.opens(),1);
 // Touch initially captures the SVG. Explicit capture on its button transfers
 // ownership and emits lostpointercapture on the old target on the next event.
 f.send('lostpointercapture',icon);assert.notEqual(window.SurfaceMorph.getState().phase,'closing');
 f.step(300);f.setHit(f.items[2]);f.send('pointermove',f.trigger,{clientY:280});
 assert.equal(f.items[2].classList.contains('is-gesture-hover'),true);
 let selected=0;f.items[2].addEventListener('click',()=>selected++);f.send('pointerup',f.trigger,{clientY:280});assert.equal(selected,1);window.SurfaceMorph.destroy();
});

test('SurfaceMorph: native touch cancellation preserves the open menu and blocks its compatibility click',()=>{
 const f=touchMorphClock();f.send('pointerdown',f.trigger);f.step(300);f.step(160);
 const overlay=f.body.querySelector('.surface-morph-overlay');
 f.send('pointercancel',f.trigger);f.send('lostpointercapture',f.trigger);
 assert.notEqual(window.SurfaceMorph.getState().phase,'closing');assert.equal(f.captured(),null);
 assert.equal(f.send('contextmenu',overlay).defaultPrevented,true);
 f.step(2000);f.send('touchend',f.trigger,{touches:[]});f.send('click',f.trigger);f.step(1200);assert.equal(f.opens(),1);assert.equal(window.SurfaceMorph.getState().phase,'open');
 let selected=0;f.items[0].addEventListener('click',()=>selected++);
 f.setHit(f.items[0]);f.send('pointerdown',f.items[0],{pointerId:2});f.send('pointerup',f.items[0],{pointerId:2});f.send('click',f.items[0],{pointerId:2});assert.equal(selected,1);window.SurfaceMorph.destroy();
});

test('SurfaceMorph: successful touch holds vibrate once; short taps and unsupported vibration are safe',()=>{
 const f=touchMorphClock(),pulses=[];window.navigator={vibrate:duration=>pulses.push(duration)};
 f.send('pointerdown',f.trigger);f.step(150);f.send('pointerup',f.trigger);assert.deepEqual(pulses,[]);
 f.send('pointerdown',f.trigger);f.step(299);assert.deepEqual(pulses,[]);f.step(1);assert.deepEqual(pulses,[12]);
 f.step(1000);f.send('lostpointercapture',f.trigger);assert.deepEqual(pulses,[12]);window.SurfaceMorph.destroy();
 for(const navigator of [{},{vibrate(){throw new Error('unavailable');}},{vibrate(){return false;}}]) {
  window.navigator=navigator;f.send('pointerdown',f.trigger);f.step(300);assert.notEqual(window.SurfaceMorph.getState().phase,'closing');window.SurfaceMorph.destroy();
 }
});


function sendTouch(f,type,target,point={identifier:17,clientX:120,clientY:140}) {
 return f.send(type,target,{changedTouches:[point],touches:type==='touchend'||type==='touchcancel'?[]:[point]});
}

test('SurfaceMorph: initial touch blocks selection and drag before the hold timer fires',()=>{
 const f=touchMorphClock(),icon=createMockElement('svg'),text=createMockElement('span');f.trigger.appendChild(icon);f.trigger.appendChild(text);
 icon.closest=selector=>selector.includes('data-morph')?f.trigger:null;
 const down=f.send('pointerdown',icon);assert.equal(down.defaultPrevented,true);
 assert.equal(sendTouch(f,'touchstart',icon).defaultPrevented,true);assert.equal(f.body.classList.contains('is-morph-holding'),true);
 assert.equal(f.send('selectstart',text).defaultPrevented,true);assert.equal(f.send('dragstart',icon).defaultPrevented,true);
 let cleared=0;window.document.getSelection=()=>({anchorNode:text,removeAllRanges(){cleared++;}});
 f.step(300);assert.equal(cleared,1);sendTouch(f,'touchcancel',icon);assert.equal(f.body.classList.contains('is-morph-holding'),false);
 const input=createMockElement('input');assert.notEqual(f.send('selectstart',input).defaultPrevented,true);window.SurfaceMorph.destroy();
});

test('SurfaceMorph: canceling native touchstart preserves one normal short tap on either release stream',()=>{
 for(const pointerUpFirst of [true,false]) {
  const f=touchMorphClock();f.send('pointerdown',f.trigger);sendTouch(f,'touchstart',f.trigger);f.step(150);
  if(pointerUpFirst)f.send('pointerup',f.trigger);
  sendTouch(f,'touchend',f.trigger);f.send('click',f.trigger);
  assert.equal(f.opens(),1);assert.equal(f.body.classList.contains('is-morph-holding'),false);window.SurfaceMorph.destroy();
 }
});

test('SurfaceMorph: native Touch moves keep hover after Pointer cancellation and release clicks once',()=>{
 const f=touchMorphClock();let selected=0,behind=0;
 f.items[2].addEventListener('click',()=>selected++);const background=createMockElement('button');background.addEventListener('click',()=>behind++);
 f.send('pointerdown',f.trigger);sendTouch(f,'touchstart',f.trigger);f.step(300);f.send('pointercancel',f.trigger);f.step(300);
 assert.equal(f.body.classList.contains('is-morph-holding'),true);assert.equal(f.send('selectstart',f.items[0]).defaultPrevented,true);
 f.setHit(f.items[0]);sendTouch(f,'touchmove',f.trigger,{identifier:17,clientX:120,clientY:200});assert.equal(f.items[0].classList.contains('is-gesture-hover'),true);
 f.setHit(f.items[2]);sendTouch(f,'touchmove',f.trigger,{identifier:17,clientX:120,clientY:280});assert.equal(f.items[0].classList.contains('is-gesture-hover'),false);assert.equal(f.items[2].classList.contains('is-gesture-hover'),true);
 sendTouch(f,'touchend',f.trigger,{identifier:17,clientX:120,clientY:280});assert.equal(selected,1);assert.equal(f.body.classList.contains('is-morph-holding'),false);
 f.send('pointerup',f.trigger,{clientY:280});f.send('click',background);assert.equal(selected,1);assert.equal(behind,0);window.SurfaceMorph.destroy();
});

test('SurfaceMorph: canceled native Touch holds and early movement restore selection without actions',()=>{
 for(const active of [false,true]) {
  const f=touchMorphClock();let selected=0;f.items[2].addEventListener('click',()=>selected++);
  f.send('pointerdown',f.trigger);sendTouch(f,'touchstart',f.trigger);
  if(active){f.step(600);f.setHit(f.items[2]);sendTouch(f,'touchmove',f.trigger,{identifier:17,clientX:120,clientY:280});sendTouch(f,'touchcancel',f.trigger);}
  else {f.step(100);sendTouch(f,'touchmove',f.trigger,{identifier:17,clientX:120,clientY:180});}
  sendTouch(f,'touchend',f.trigger);f.send('click',f.trigger);f.step(1000);
  assert.equal(selected,0);assert.equal(f.opens(),active?1:0);assert.equal(f.body.classList.contains('is-morph-holding'),false);window.SurfaceMorph.destroy();
 }
});


test('SurfaceMorph: tap-opened menus immediately track touch hover and release exactly once',()=>{
 const f=touchMorphClock();let first=0,last=0,vibrations=0;window.navigator={vibrate(){vibrations++;}};
 f.items[0].addEventListener('click',()=>first++);f.items[2].addEventListener('click',()=>last++);
 f.trigger.click();f.step(1200);f.setHit(f.items[0]);f.send('pointerdown',f.items[0]);sendTouch(f,'touchstart',f.items[0]);
 assert.equal(f.items[0].classList.contains('is-gesture-hover'),true);assert.equal(f.pendingTimers(),0);assert.equal(f.opens(),1);
 f.setHit(f.items[1]);sendTouch(f,'touchmove',f.items[0],{identifier:17,clientX:120,clientY:240});assert.equal(f.items[1].classList.contains('is-gesture-hover'),false);
 f.send('pointercancel',f.items[0]);f.setHit(f.items[2]);sendTouch(f,'touchmove',f.items[0],{identifier:17,clientX:120,clientY:280});assert.equal(f.items[2].classList.contains('is-gesture-hover'),true);
 sendTouch(f,'touchend',f.items[0],{identifier:17,clientX:120,clientY:280});f.send('click',f.items[2]);
 assert.equal(first,0);assert.equal(last,1);assert.equal(vibrations,0);assert.equal(f.opens(),1);assert.equal(f.body.classList.contains('is-morph-holding'),false);window.SurfaceMorph.destroy();
});

test('SurfaceMorph: tap-opened row short taps still execute once and dragging out cancels safely',()=>{
 for(const dragOutside of [false,true]) {
  const f=touchMorphClock();let selected=0;f.items[0].addEventListener('click',()=>selected++);f.trigger.click();f.step(1200);
  f.setHit(f.items[0]);f.send('pointerdown',f.items[0]);sendTouch(f,'touchstart',f.items[0]);
  if(dragOutside){f.setHit(null);f.send('pointermove',f.items[0],{clientX:900,clientY:600});}
  f.send('pointerup',f.items[0],dragOutside?{clientX:900,clientY:600}:{});sendTouch(f,'touchend',f.items[0]);f.send('click',f.items[0]);
  assert.equal(selected,dragOutside?0:1);f.step(1200);if(dragOutside)assert.equal(window.SurfaceMorph.getState(),null);else window.SurfaceMorph.destroy();
 }
});
