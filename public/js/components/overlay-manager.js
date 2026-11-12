(function (root) {
  'use strict';
  // Dialog-only leases. Other floating surfaces retain their existing owners.
  const stack = [];
  let observer = null;
  let originalOverflow = '';
  const inertBefore = new Map();
  function syncInert() {
    const top = stack[stack.length - 1];
    if (!top) return;
    for (const node of document.body.children) {
      if (!inertBefore.has(node)) inertBefore.set(node, node.inert);
      node.inert = node !== top.overlay;
    }
  }
  function acquire({ overlay, panel, initialFocus, returnFocus, onEscape }) {
    const lease = { overlay, panel, initialFocus, returnFocus, onEscape };
    if (!stack.length) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      observer = new MutationObserver(syncInert);
      observer.observe(document.body, { childList: true });
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('focusin', onFocus, true);
    }
    stack.push(lease);
    syncInert();
    (initialFocus || panel).focus({ preventScroll: true });
    let released = false;
    return {
      release({ restoreFocus = true } = {}) {
        if (released) return;
        released = true;
        const wasTop = stack[stack.length - 1] === lease;
        stack.splice(stack.indexOf(lease), 1);
        if (stack.length) syncInert();
        else {
          observer.disconnect(); observer = null;
          document.removeEventListener('keydown', onKey, true);
          document.removeEventListener('focusin', onFocus, true);
          for (const [node, inert] of inertBefore) node.inert = inert;
          inertBefore.clear();
          document.body.style.overflow = originalOverflow;
        }
        if (!restoreFocus || !wasTop) return;
        const previous = stack[stack.length - 1];
        const target = returnFocus?.isConnected && !returnFocus.closest('[inert]')
          ? returnFocus : previous?.panel || document.querySelector('#page-content h1, main h1, main');
        if (target && !target.closest('[inert]')) {
          if (!target.matches('button, a[href], input, textarea, select, [tabindex]')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        }
      }
    };
  }
  function focusables(panel) {
    return Array.from(panel.querySelectorAll('button, a[href], input, textarea, select, [tabindex]'))
      .filter(el => !el.disabled && el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length);
  }
  function onKey(event) {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); top.onEscape?.();
    } else if (event.key === 'Tab') {
      const items = focusables(top.panel);
      const index = items.indexOf(document.activeElement);
      if (!items.length) { event.preventDefault(); top.panel.focus(); }
      else if (index < 0 || (event.shiftKey && index === 0) || (!event.shiftKey && index === items.length - 1)) {
        event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0].focus();
      }
    }
  }
  function onFocus(event) {
    const top = stack[stack.length - 1];
    if (top && !top.panel.contains(event.target)) (focusables(top.panel)[0] || top.panel).focus();
  }
  root.OverlayManager = { acquire };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OverlayManager;
})(typeof window !== 'undefined' ? window : globalThis);
