(function (root) {
  'use strict';
  const queue = [];
  let active = null;
  let pageSignal = null;
  let sequence = 0;
  const motion = root.matchMedia?.('(prefers-reduced-motion: reduce)');
  const cancelled = (kind, reason) => kind === 'legacy' ? false : kind === 'alert' ? { dismissed: true, reason } : { confirmed: false, reason };
  function request(kind, options = {}) {
    return new Promise(resolve => {
      const entry = { kind, options, resolve, signal: options.signal || pageSignal };
      if (entry.signal?.aborted) { resolve(cancelled(kind, 'abort')); return; }
      entry.abort = () => {
        if (active?.entry === entry) active.finish(cancelled(kind, 'abort'), true);
        else {
          const index = queue.indexOf(entry);
          if (index >= 0) queue.splice(index, 1);
          entry.signal?.removeEventListener('abort', entry.abort);
          resolve(cancelled(kind, 'abort'));
        }
      };
      entry.signal?.addEventListener('abort', entry.abort, { once: true });
      queue.push(entry); drain();
    });
  }
  function node(tag, className, text) {
    const el = document.createElement(tag); el.className = className;
    if (text != null) el.textContent = String(text);
    return el;
  }
  function drain() {
    if (active || !queue.length) return;
    const entry = queue.shift();
    const { kind, options: opts } = entry;
    if (kind === 'legacy') {
      let task;
      try { task = opts.run(entry.signal); }
      catch (error) {
        entry.signal?.removeEventListener('abort', entry.abort);
        entry.resolve(false); drain(); return;
      }
      let ended = false;
      const done = result => {
        if (ended) return;
        ended = true; entry.signal?.removeEventListener('abort', entry.abort);
        active = null; entry.resolve(result); drain();
      };
      active = { entry, finish: () => { task.cancel?.(); done(false); } };
      Promise.resolve(task).then(done, () => done(false));
      return;
    }
    root.ProjectOptionMorph?.close('immediate');
    const tokens = root.getComputedStyle?.(document.documentElement);
    const durationToken = tokens?.getPropertyValue('--dialog-duration').trim() || '400ms';
    const duration = parseFloat(durationToken) * (durationToken.endsWith('ms') ? 1 : 1000);
    const enterEase = tokens?.getPropertyValue('--dialog-enter-ease').trim() || 'cubic-bezier(.34,1.59,.69,.99)';
    const exitEase = tokens?.getPropertyValue('--dialog-exit-ease').trim() || 'cubic-bezier(.31,.01,.66,-.59)';
    const returnFocus = opts.returnFocus || document.activeElement;
    const id = `sb-dialog-${++sequence}`;
    const overlay = node('div', 'sb-dialog-overlay');
    const panel = node('section', 'sb-dialog');
    panel.dataset.kind = kind; panel.tabIndex = -1;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    const mark = node('span', 'sb-dialog-mark');
    const paths = kind === 'prompt' ? '<path d="m16 3 5 5-12 12H4v-5L16 3Z"/><path d="m13 6 5 5"/>' : kind === 'alert' ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 3v1"/>' : '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v1"/>';
    mark.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    mark.setAttribute('aria-hidden', 'true');
    const title = node('h2', 'sb-dialog-title', opts.title || (kind === 'prompt' ? '重新命名分鏡' : kind === 'alert' ? '提示' : '確認操作'));
    title.id = `${id}-title`; panel.setAttribute('aria-labelledby', title.id);
    panel.append(mark, title);
    if (opts.description) {
      const description = node('p', 'sb-dialog-description', opts.description);
      description.id = `${id}-description`;
      panel.setAttribute('aria-describedby', description.id); panel.append(description);
    }
    const form = node('form', 'sb-dialog-form'); form.noValidate = true;
    let input = null;
    const error = node('p', 'sb-dialog-error'); error.id = `${id}-error`; error.setAttribute('aria-live', 'polite');
    if (kind === 'prompt') {
      const label = node('label', 'sb-dialog-label', opts.label || '分鏡名稱');
      input = node('input', 'sb-dialog-input'); input.id = `${id}-input`; input.type = 'text';
      input.value = opts.value == null ? '' : String(opts.value); input.autocomplete = 'off';
      label.htmlFor = input.id; input.setAttribute('aria-describedby', error.id);
      const field = node('div', 'sb-dialog-field'); field.append(input);
      form.append(label, field);
    }
    form.append(error);
    const actions = node('div', 'sb-dialog-actions');
    const cancel = node('button', 'sb-dialog-button sb-dialog-cancel sys-btn secondary', opts.cancelText || '取消'); cancel.type = 'button';
    const submit = node('button', 'sb-dialog-button sb-dialog-submit sys-btn primary', opts.confirmText || (kind === 'prompt' ? '儲存名稱' : '確定')); submit.type = 'submit';
    if (opts.danger) submit.dataset.danger = 'true';
    if (kind !== 'alert') actions.append(cancel);
    actions.append(submit); form.append(actions); panel.append(form); overlay.append(panel); document.body.append(overlay);
    let busy = false, settled = false, timer = null;
    const animations = [];
    const lease = root.OverlayManager.acquire({ overlay, panel, returnFocus,
      initialFocus: input || (opts.danger && kind !== 'alert' ? cancel : submit),
      onEscape: () => { if (kind !== 'alert' && !busy) finish(cancelled(kind, 'escape')); }
    });
    if (input) input.select();
    function dispose(result) {
      clearTimeout(timer); animations.forEach(a => a.cancel());
      entry.signal?.removeEventListener('abort', entry.abort);
      overlay.remove(); lease.release({ restoreFocus: result.reason !== 'abort' });
      active = null; entry.resolve(result); drain();
    }
    function finish(result, immediate = false) {
      if (settled) {
        // Navigation can abort an already closing dialog; never steal the new page's focus.
        if (immediate && active?.entry === entry) dispose(result);
        return;
      }
      settled = true; submit.disabled = true; cancel.disabled = true;
      if (immediate || motion?.matches) { dispose(result); return; }
      const renderedTransform = root.getComputedStyle?.(panel)?.transform;
      const currentTransform = !renderedTransform || renderedTransform === 'none' ? 'scale(1)' : renderedTransform;
      const currentBlur = root.getComputedStyle?.(overlay)?.backdropFilter || 'blur(var(--dialog-backdrop-blur, 50px))';
      animations.forEach(a => a.cancel());
      // Keep scrim alpha constant throughout exit; only reverse blur and panel scale.
      animate(overlay, [{ backdropFilter: currentBlur, webkitBackdropFilter: currentBlur }, { backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)' }], duration, 'cubic-bezier(.8,0,.6,1)');
      animate(panel, [{ transform: currentTransform }, { transform: 'scale(0)' }], duration, exitEase);
      timer = setTimeout(() => dispose(result), duration);
    }
    function animate(el, frames, duration, easing) {
      if (el.animate) animations.push(el.animate(frames, { duration, easing, fill: 'both' }));
    }
    active = { entry, finish };
    cancel.addEventListener('click', () => { if (!busy) finish(cancelled(kind, 'cancel')); });
    let composing = false;
    input?.addEventListener('compositionstart', () => { composing = true; });
    input?.addEventListener('compositionend', () => { composing = false; });
    form.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.isComposing || composing || event.keyCode === 229)) event.preventDefault();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || settled || composing) return;
      const value = input?.value || '';
      busy = true; panel.setAttribute('aria-busy', 'true'); submit.disabled = true; cancel.disabled = true;
      if (input) input.readOnly = true;
      try {
        const message = await opts.validate?.(value);
        if (settled) return;
        if (message) throw new Error(message);
        submit.textContent = opts.onSubmit ? '儲存中…' : submit.textContent;
        await opts.onSubmit?.(value);
        if (settled) return;
        finish(kind === 'alert' ? { dismissed: true, reason: 'acknowledge' } : kind === 'prompt' ? { confirmed: true, value } : { confirmed: true });
      } catch (err) {
        if (settled) return;
        error.textContent = err?.message || '操作失敗，請稍後再試';
        input?.setAttribute('aria-invalid', 'true');
      } finally {
        if (!settled) {
          busy = false; panel.removeAttribute('aria-busy'); submit.disabled = false; cancel.disabled = false;
          submit.textContent = opts.confirmText || (kind === 'prompt' ? '儲存名稱' : '確定');
          if (input) { input.readOnly = false; input.focus(); }
        }
      }
    });
    input?.addEventListener('input', () => { error.textContent = ''; input.removeAttribute('aria-invalid'); });
    if (!motion?.matches) {
      animate(overlay, [{ backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)' }, { backdropFilter: 'blur(var(--dialog-backdrop-blur, 50px))', webkitBackdropFilter: 'blur(var(--dialog-backdrop-blur, 50px))' }], duration, 'cubic-bezier(.4,0,.2,1)');
      animate(panel, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], duration, enterEase);
    }
  }
  root.DialogService = {
    alert: options => request('alert', options),
    confirm: options => request('confirm', options),
    prompt: options => request('prompt', options),
    runLegacy: options => request('legacy', options),
    setPageSignal(signal) { pageSignal = signal; },
    cancelAll() {
      for (const entry of [...queue]) entry.abort();
      active?.finish(cancelled(active.entry.kind, 'abort'), true);
    }
  };
  root.addEventListener?.('pagehide', () => root.DialogService.cancelAll());
  motion?.addEventListener?.('change', () => {
    // Finish WAAPI effects immediately; result/focus continue through the same owner.
    if (motion.matches) document.querySelectorAll('.sb-dialog-overlay, .sb-dialog').forEach(el => el.getAnimations?.().forEach(a => a.finish()));
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.DialogService;
})(typeof window !== 'undefined' ? window : globalThis);
