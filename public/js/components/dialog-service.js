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
    // Establish the hidden starting state before inserting or focusing the dialog.
    if (!motion?.matches) { panel.style.scale = '0'; overlay.style.backdropFilter = 'blur(0px)'; overlay.style.webkitBackdropFilter = 'blur(0px)'; }
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
    let checkboxInput = null;
    let blurTimer = null;
    const error = node('p', 'sb-dialog-error'); error.id = `${id}-error`; error.setAttribute('aria-live', 'polite');
    if (kind === 'prompt') {
      const label = node('label', 'sb-dialog-label', opts.label || '分鏡名稱');
      input = node('input', 'sb-dialog-input'); input.id = `${id}-input`;
      input.type = opts.inputType || 'text';
      input.value = opts.value == null ? '' : String(opts.value);
      input.autocomplete = opts.autocomplete || 'off';
      if (opts.placeholder) input.placeholder = String(opts.placeholder);
      label.htmlFor = input.id; input.setAttribute('aria-describedby', error.id);
      const field = node('div', 'sb-dialog-field'); field.append(input);
      if (opts.inputType === 'password' && opts.showPasswordToggle !== false) {
        field.classList.add('has-visibility');
        const toggle = node('button', 'sb-dialog-visibility');
        toggle.type = 'button';
        toggle.setAttribute('aria-label', '顯示密碼');
        toggle.setAttribute('aria-pressed', 'false');
        toggle.setAttribute('aria-controls', input.id);
        const maskId = `${id}-eye-mask`;
        toggle.innerHTML =
          `<img src="/icon/showControl.svg" alt="" class="sb-dialog-eye" style="mask:url(#${maskId});-webkit-mask:url(#${maskId});">` +
          `<img src="/icon/showSlash.svg" alt="" class="sb-dialog-eye-slash">` +
          `<svg class="sb-dialog-eye-mask-svg" viewBox="0 0 60 60" aria-hidden="true">` +
            `<defs><mask id="${maskId}" class="sb-dialog-eye-mask">` +
              `<rect x="0" y="0" width="24" height="24" rx="1" ry="1" fill="#ffffff"/>` +
              `<rect class="sb-dialog-eye-mask-cut" x="0" y="0" width="2" height="34" rx="1" ry="1" fill="#000000"/>` +
            `</mask></defs>` +
          `</svg>`;
        const slash = toggle.querySelector?.('.sb-dialog-eye-slash');
        const maskCut = toggle.querySelector?.('.sb-dialog-eye-mask-cut');
        let showing = false;
        toggle.addEventListener('click', () => {
          showing = !showing;
          const nextType = showing ? 'text' : 'password';
          toggle.setAttribute('aria-pressed', String(showing));
          toggle.setAttribute('aria-label', showing ? '隱藏密碼' : '顯示密碼');
          if (slash) slash.style.transform = showing ? 'translateY(-36px)' : 'translateY(0px)';
          if (maskCut) maskCut.style.transform = showing ? 'translate(54px, -36px) rotate(45deg)' : 'translate(18px, 0px) rotate(45deg)';
          clearTimeout(blurTimer);
          const applyType = () => {
            if (settled) return;
            input.style.filter = 'blur(0px)';
            input.type = nextType;
          };
          if (motion?.matches) {
            applyType();
          } else {
            input.style.filter = 'blur(3px)';
            blurTimer = setTimeout(applyType, 300);
          }
          input.focus();
        });
        field.append(toggle);
      }
      form.append(label, field);
    }
    form.append(error);
    if (opts.checkbox && opts.checkbox.label) {
      const checkboxLabel = node('label', 'sb-dialog-checkbox');
      checkboxInput = node('input', 'sb-dialog-checkbox-input');
      checkboxInput.type = 'checkbox';
      checkboxInput.id = `${id}-checkbox`;
      checkboxInput.checked = Boolean(opts.checkbox.checked);
      const checkboxText = node('span', '', opts.checkbox.label);
      const checkboxWrapper = node('span', 'checkbox-wrapper');
      checkboxWrapper.setAttribute('aria-hidden', 'true');
      checkboxWrapper.innerHTML = '<span class="checkbox-bg"></span><svg class="checkbox-icon" viewBox="0 0 24 24" fill="none"><path class="check-path" d="M4 12L10 18L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
      checkboxLabel.append(checkboxInput, checkboxWrapper, checkboxText);
      form.append(checkboxLabel);
    }
    const actions = node('div', 'sb-dialog-actions');
    const cancel = node('button', 'sb-dialog-button sb-dialog-cancel sys-btn secondary', opts.cancelText || '取消'); cancel.type = 'button';
    const submit = node('button', 'sb-dialog-button sb-dialog-submit sys-btn primary', opts.confirmText || (kind === 'prompt' ? '儲存名稱' : '確定')); submit.type = 'submit';
    if (opts.danger) submit.dataset.danger = 'true';
    const blurLayer = node('div', 'sb-dialog-blur');
    blurLayer.setAttribute('aria-hidden', 'true');
    if (kind !== 'alert') actions.append(cancel);
    actions.append(submit); form.append(actions); panel.append(form); overlay.append(blurLayer, panel); document.body.append(overlay);
    let busy = false, settled = false, timer = null;
    const animations = [];
    // Use the same scale lifecycle as the tag editor; standalone hosts retain a WAAPI fallback.
    const modalMotion = root.ModalAnimation;
    const lease = root.OverlayManager.acquire({ overlay, panel, returnFocus,
      initialFocus: input || (opts.danger && kind !== 'alert' ? cancel : submit),
      onEscape: () => { if (kind !== 'alert' && !busy) finish(cancelled(kind, 'escape')); }
    });
    if (input) input.select();
    function dispose(result) {
      clearTimeout(timer); clearTimeout(blurTimer); modalMotion?.cancel(overlay); animations.forEach(a => a.cancel());
      root.DynamicMaskSystem?.setMotionMode?.('normal');
      entry.signal?.removeEventListener('abort', entry.abort);
      if (input && opts.inputType === 'password') input.value = '';
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
      if (modalMotion) {
        modalMotion.close(overlay, panel, { duration, onComplete: () => dispose(result) });
        return;
      }
      const renderedScale = root.getComputedStyle?.(panel)?.scale;
      const currentScale = !renderedScale || renderedScale === 'none' ? '1' : renderedScale;
      const currentOpacity = root.getComputedStyle?.(blurLayer)?.opacity || '1';
      animations.forEach(a => a.cancel());
      // Fixed blur radius; fade backdrop opacity cleanly on the compositor.
      animate(blurLayer, [{ opacity: currentOpacity }, { opacity: '0' }], duration, 'cubic-bezier(.8,0,.6,1)');
      animate(panel, [{ scale: currentScale }, { scale: '0' }], duration, exitEase);
      timer = setTimeout(() => dispose(result), duration);
    }
    function animate(el, frames, duration, easing) {
      if (el.animate) animations.push(el.animate(frames, { duration, easing, fill: 'both' }));
    }
    active = { entry, finish };
    const withCheckbox = result => checkboxInput ? { ...result, checked: Boolean(checkboxInput.checked) } : result;
    cancel.addEventListener('click', () => { if (!busy) finish(withCheckbox(cancelled(kind, 'cancel'))); });
    overlay.addEventListener('click', event => {
      if (event.target === overlay && !busy && !settled) finish(cancelled(kind, 'backdrop'));
    });
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
        submit.textContent = opts.onSubmit ? (opts.submittingText || '儲存中…') : submit.textContent;
        await opts.onSubmit?.(value);
        if (settled) return;
        finish(kind === 'alert' ? { dismissed: true, reason: 'acknowledge' } : kind === 'prompt' ? withCheckbox({ confirmed: true, value }) : withCheckbox({ confirmed: true }));
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
    if (!motion?.matches && modalMotion) {
      modalMotion.open(overlay, panel, { duration, blur: 'var(--dialog-backdrop-blur, 20px)', backdropBg: 'var(--dialog-backdrop-bg)' });
    } else if (!motion?.matches) {
      blurLayer.style.backdropFilter = 'blur(var(--dialog-backdrop-blur, 20px))';
      if (blurLayer.style.webkitBackdropFilter !== undefined) blurLayer.style.webkitBackdropFilter = 'blur(var(--dialog-backdrop-blur, 20px))';
      animate(blurLayer, [{ opacity: '0' }, { opacity: '1' }], duration, 'cubic-bezier(.4,0,.2,1)');
      animate(panel, [{ scale: '0' }, { scale: '1' }], duration, enterEase);
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
