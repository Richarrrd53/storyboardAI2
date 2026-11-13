const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Small deterministic DOM for lifecycle tests; browser focus/layout verified separately.
function environment(reduced = false, shared = true) {
  let clock = 0, next = 0;
  const timers = new Map();
  const animations = [];
  const context = { console, URL, AbortController, Promise };
  function events(target) {
    const listeners = {};
    target.addEventListener = (type, fn) => (listeners[type] ||= new Set()).add(fn);
    target.removeEventListener = (type, fn) => listeners[type]?.delete(fn);
    target.dispatchEvent = event => {
      event.target ||= target;
      event.preventDefault ||= () => { event.defaultPrevented = true; };
      event.stopImmediatePropagation ||= () => {};
      for (const fn of listeners[event.type] || []) fn(event);
    };
    return target;
  }
  class Element {
    constructor(tag) {
      events(this); this.tagName = tag; this.children = []; this.attributes = {};
      this.style = {}; this.inert = false; this.tabIndex = ['input', 'button'].includes(tag) ? 0 : -1;
      this.className = ''; this.dataset = {}; this.value = ''; this.textContent = ''; this.disabled = false;
      this.classList = { add: name => { this.className += ' ' + name; }, remove: () => {} };
    }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); this.parentElement = null; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    removeAttribute(key) { delete this.attributes[key]; }
    getAttribute(key) { return this.attributes[key] ?? null; }
    matches(selector) {
      return selector.split(',').some(raw => {
        const s = raw.trim();
        if (s === '[inert]') return this.inert;
        if (s === '[tabindex]') return this.attributes.tabindex != null;
        if (s.startsWith('.')) return this.className.split(' ').includes(s.slice(1));
        if (s.startsWith('#')) return this.id === s.slice(1);
        return s === this.tagName;
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(target) { return target === this || this.children.some(node => node.contains(target)); }
    get isConnected() { return this === document.body || !!this.parentElement?.isConnected; }
    focus() { document.activeElement = this; }
    select() {}
    getClientRects() { return [{}]; }
    animate(frames, options) { const animation = { frames, options, cancel() {}, finish() {} }; animations.push(animation); return animation; }
    click() { if (!this.disabled) { this.onclick?.(); this.dispatchEvent({ type: 'click' }); } }
    cloneNode() { const node = new Element(this.tagName); node.className = this.className; return node; }
  }
  const document = events({ body: new Element('body'), createElement: tag => new Element(tag) });
  document.querySelector = selector => document.body.querySelector(selector);
  document.querySelectorAll = selector => document.body.querySelectorAll(selector);
  document.activeElement = document.body;
  Object.assign(context, {
    document, matchMedia: () => ({ matches: reduced, addEventListener() {} }),
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout(fn, ms = 0) { const id = ++next; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: () => ++next, cancelAnimationFrame() {}
  });
  context.window = context; events(context); vm.createContext(context);
  for (const file of ['components/overlay-manager.js', 'components/dialog-service.js', ...(shared ? ['sys.js'] : [])]) {
    vm.runInContext(fs.readFileSync('public/js/' + file, 'utf8'), context);
  }
  if (!shared) delete context.ModalAnimation;
  const advance = ms => {
    const end = clock + ms;
    while (true) {
      const entries = [...timers.entries()].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at);
      if (!entries.length) break;
      const [id, value] = entries[0]; timers.delete(id); clock = value.at; value.fn();
    }
    clock = end;
  };
  const tick = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
  return { context, document, advance, tick, animations, service: context.DialogService,
    panel: () => document.querySelector('.sb-dialog'),
    click: selector => document.querySelector(selector).click(),
    submit: () => document.querySelector('form').dispatchEvent({ type: 'submit' }) };
}

test('confirm returns explicit false, defaults description safely and resolves once', async () => {
  const e = environment();
  const result = e.service.confirm({ title: '<script>literal</script>' });
  assert.equal(e.document.querySelector('h2').textContent, '<script>literal</script>');
  assert.equal(e.document.querySelector('.sb-dialog-description'), null);
  let resolved = 0; result.then(() => resolved++);
  e.click('.sb-dialog-cancel'); e.click('.sb-dialog-cancel');
  assert.equal(resolved, 0); e.advance(450);
  assert.equal((await result).confirmed, false); await e.tick(); assert.equal(resolved, 1);
  assert.equal(e.panel(), null);
});

test('central dialogs match delete scale/blur signature and keep scrim alpha on exit', async () => {
  const e = environment(false, false); const result = e.service.confirm({ title: 'motion' });
  assert.equal(e.animations[0].frames[0].backdropFilter, 'blur(0px)');
  assert.equal(e.animations[1].frames[0].scale, '0');
  assert.equal(e.animations[1].options.easing, 'cubic-bezier(.34,1.59,.69,.99)');
  assert.equal(e.animations[1].options.duration, 400);
  e.click('.sb-dialog-cancel');
  const exit = e.animations.slice(-2);
  assert.equal(exit[1].frames[1].scale, '0');
  assert.equal(exit[1].options.easing, 'cubic-bezier(.31,.01,.66,-.59)');
  assert.equal(exit[0].frames[1].backdropFilter, 'blur(0px)');
  assert.ok(exit[0].frames.every(frame => !('opacity' in frame) && !('background' in frame)));
  e.advance(450); assert.equal((await result).confirmed, false);
});

test('global facade preserves boolean confirm, void alert and native prompt', async () => {
  const e = environment(true); const originalPrompt = () => 'native'; e.context.prompt = originalPrompt;
  const confirm = e.context.confirm('測試'); await e.tick(); e.click('.sb-dialog-cancel');
  assert.strictEqual(await confirm, false);
  const alert = e.context.alert('<b>文字</b>'); await e.tick(); e.submit(); await e.tick();
  assert.strictEqual(await alert, undefined); assert.equal(e.context.prompt, originalPrompt);
});

test('queued dialogs stay single and abort cancels active and queued work', async () => {
  const e = environment(); const controller = new AbortController();
  const first = e.service.confirm({ title: 'one', signal: controller.signal });
  const second = e.service.prompt({ title: 'two', signal: controller.signal });
  assert.equal(e.document.querySelectorAll('.sb-dialog').length, 1);
  controller.abort();
  assert.equal((await first).reason, 'abort'); assert.equal((await second).reason, 'abort');
  assert.equal(e.document.body.children.length, 0);
});

test('prompt keeps failed input, prevents concurrent submit, retries once and releases busy state', async () => {
  const e = environment(true); let calls = 0, release;
  const result = e.service.prompt({ value: '原名', validate: value => value.trim() ? '' : '不可空白', onSubmit: async () => {
    calls++; await new Promise(resolve => { release = resolve; }); if (calls === 1) throw new Error('503 error');
  } });
  const input = e.document.querySelector('input'); input.value = '  ';
  e.submit(); await e.tick(); assert.equal(calls, 0); assert.equal(input.getAttribute('aria-invalid'), 'true');
  input.value = '新名'; e.submit(); e.submit(); await e.tick(); assert.equal(calls, 1);
  e.document.dispatchEvent({ type: 'keydown', key: 'Escape' }); assert.ok(e.panel());
  release(); await e.tick(); assert.equal(input.value, '新名'); assert.equal(input.readOnly, false);
  assert.equal(e.document.querySelector('.sb-dialog-error').textContent, '503 error');
  e.submit(); await e.tick(); release(); await e.tick(); assert.equal((await result).value, '新名'); assert.equal(calls, 2);
});

test('IME Enter is prevented and abort while submitting ignores late completion', async () => {
  const e = environment(true); let calls = 0, release;
  const c = new AbortController();
  const result = e.service.prompt({ signal: c.signal, onSubmit: () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const input = e.document.querySelector('input'); input.dispatchEvent({ type: 'compositionstart' });
  const event = { type: 'keydown', key: 'Enter', isComposing: true };
  e.document.querySelector('form').dispatchEvent(event); e.submit(); await e.tick();
  assert.equal(event.defaultPrevented, true); assert.equal(calls, 0);
  input.dispatchEvent({ type: 'compositionend' }); e.submit(); await e.tick(); assert.equal(calls, 1);
  c.abort(); assert.equal((await result).confirmed, false); release(); await e.tick(); assert.equal(e.panel(), null);
});

test('modal leases trap Tab, preserve pre-existing inert/overflow and return focus', async () => {
  const e = environment(true); const trigger = e.document.createElement('button');
  const hidden = e.document.createElement('main'); hidden.inert = true;
  e.document.body.append(trigger, hidden); e.document.body.style.overflow = 'clip'; trigger.focus();
  const result = e.service.prompt({ value: 'name' });
  assert.equal(trigger.inert, true); assert.equal(e.document.activeElement.tagName, 'input');
  e.document.dispatchEvent({ type: 'keydown', key: 'Tab', shiftKey: true });
  assert.equal(e.document.activeElement.className.includes('sb-dialog-submit'), true);
  e.document.dispatchEvent({ type: 'keydown', key: 'Tab' }); assert.equal(e.document.activeElement.tagName, 'input');
  e.click('.sb-dialog-cancel'); await result;
  assert.equal(trigger.inert, false); assert.equal(hidden.inert, true); assert.equal(e.document.body.style.overflow, 'clip');
  assert.equal(e.document.activeElement, trigger);
});

test('overlapping modal leases retain inert and scroll lock until the last owner releases', () => {
  const e = environment(); const background = e.document.createElement('main');
  e.document.body.append(background); e.document.body.style.overflow = 'clip';
  const makeLease = () => {
    const overlay = e.document.createElement('div'), panel = e.document.createElement('section'); panel.tabIndex = -1;
    overlay.append(panel); e.document.body.append(overlay);
    return e.context.OverlayManager.acquire({ overlay, panel, initialFocus: panel });
  };
  const first = makeLease(), second = makeLease();
  first.release({ restoreFocus: false });
  assert.equal(background.inert, true); assert.equal(e.document.body.style.overflow, 'hidden');
  second.release({ restoreFocus: false });
  assert.equal(background.inert, false); assert.equal(e.document.body.style.overflow, 'clip');
});

test('page signal cancels closing dialogs without later focus or duplicate resolve', async () => {
  const e = environment(); const c = new AbortController(); e.service.setPageSignal(c.signal);
  const result = e.service.confirm({}); e.click('.sb-dialog-cancel'); c.abort();
  assert.equal((await result).reason, 'abort'); e.advance(500); assert.equal(e.panel(), null);
  assert.equal((await e.service.prompt({})).reason, 'abort');
});

test('legacy delete retains 1000ms close / 1500ms true result and abort is boolean false', async () => {
  const e = environment(); const source = e.document.createElement('div'); source.className = 'project-card';
  const result = e.context.confirm('delete', '', 'delete', '刪除', source); await e.tick();
  e.document.querySelector('.primary').click(); e.advance(1499);
  let done = false; result.then(() => { done = true; }); await e.tick(); assert.equal(done, false);
  e.advance(1); assert.strictEqual(await result, true);
  const c = new AbortController(); e.service.setPageSignal(c.signal); c.abort();
  assert.strictEqual(await e.context.confirm('delete', '', 'delete', '刪除', source), false);
});

test('navigation during cancelled legacy exit releases its modal lease immediately', async () => {
  const e = environment(); const c = new AbortController(); e.service.setPageSignal(c.signal);
  const trigger = e.document.createElement('button'); e.document.body.append(trigger); trigger.focus();
  const source = e.document.createElement('div'); source.className = 'project-card';
  const result = e.context.confirm('delete', '', 'delete', '刪除', source); await e.tick();
  e.document.querySelector('.secondary').click(); assert.strictEqual(await result, false);
  assert.equal(trigger.inert, true); c.abort(); assert.equal(trigger.inert, false);
  e.advance(500); assert.equal(e.document.activeElement === trigger, false);
});

test('all central dialog kinds exit from scale 1 to 0 with the approved anticipation curve',async()=>{
 for(const kind of ['alert','confirm','prompt']) {
  const e=environment(false,false);const done=e.service[kind]({title:kind,defaultValue:'name'});
  if(kind==='alert'){e.submit();await e.tick();}else e.click('.sb-dialog-cancel');
  const [backdrop,panel]=e.animations.slice(-2);
  assert.equal(panel.frames[0].scale,'1');assert.equal(panel.frames[1].scale,'0');
  assert.equal(panel.options.easing,'cubic-bezier(.31,.01,.66,-.59)');
  assert.ok(backdrop.frames.every(frame=>!('opacity' in frame)&&!('backgroundColor' in frame)));
  e.advance(450);await done;
 }
});

// Exercise the actual sys.js motion owner, not just animation descriptors in the fallback.
test('rename, logout, restore and alert use the tag-editor scale lifecycle until exit completes',async()=>{
 for(const [kind,title] of [['prompt','重新命名'],['confirm','登出'],['confirm','還原'],['alert','提示']]) {
  const e=environment();const done=e.service[kind]({title});const panel=e.panel();
  assert.equal(panel.style.scale,'0');e.advance(410);assert.equal(panel.style.scale,'1');
  assert.equal(e.animations.length,0);
  if(kind==='alert'){e.submit();await e.tick();}else e.click('.sb-dialog-cancel');
  assert.match(panel.style.transition,/scale 400ms cubic-bezier\(\.31, \.01, \.66, -0\.59\)/);
  e.advance(10);assert.equal(panel.style.scale,'0');
  assert.equal(e.document.querySelector('.sb-dialog-overlay').style.opacity,'1');
  e.advance(399);assert.equal(e.panel(),panel);e.advance(41);await done;assert.equal(e.panel(),null);
 }
});


test('Phase7 reduced alert, confirm and prompt complete once through both actual motion owners',async()=>{
 for(const shared of [true,false])for(const kind of ['alert','confirm','prompt']){
  const e=environment(true,shared);const done=e.service[kind]({title:'Phase7 '+kind,value:'fixture'});let settled=0;done.then(()=>settled++);
  if(kind==='alert'){e.submit();await e.tick();}else e.click('.sb-dialog-cancel');
  e.advance(60);await e.tick();await done;assert.equal(e.panel(),null);assert.equal(settled,1);
  e.advance(5000);await e.tick();assert.equal(settled,1);
 }
});


test('backdrop dismisses central dialogs but clicks inside do not', async () => {
  for (const kind of ['confirm', 'prompt', 'alert']) {
    const e = environment(true);
    const result = e.service[kind]({});
    const overlay = e.document.querySelector('.sb-dialog-overlay');
    overlay.dispatchEvent({ type: 'click', target: e.panel() });
    assert.ok(e.panel());
    overlay.click();
    const value = await result;
    assert.equal(value.reason, 'backdrop');
    assert.equal(e.panel(), null);
  }
});
