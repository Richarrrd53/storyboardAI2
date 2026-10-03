/**
 * StoryboardAI - Global Toast Component (P4-5)
 * Manages toast notifications across the application:
 * - Global SPA Toast (#global-toast) with undo callback support
 * - Auth / Dialog Toast (#toast) with auto-reflow
 * - Auto-dismiss timers and clean dismissal lifecycle
 */
(function (root) {
  'use strict';

  let spaToastTimeout = null;
  let authToastTimeout = null;

  function showSpaToast(message, onUndo, duration = 5000) {
    const toast = document.getElementById('global-toast');
    const toastText = document.getElementById('global-toast-text');
    const undoBtn = document.getElementById('global-toast-undo');
    if (!toast || !toastText || !undoBtn) return;

    if (spaToastTimeout) {
      clearTimeout(spaToastTimeout);
      spaToastTimeout = null;
    }

    toastText.textContent = message;

    if (onUndo && typeof onUndo === 'function') {
      undoBtn.style.display = '';
      undoBtn.onclick = (e) => {
        e.preventDefault();
        onUndo();
        toast.classList.remove('show');
        if (spaToastTimeout) {
          clearTimeout(spaToastTimeout);
          spaToastTimeout = null;
        }
      };
    } else {
      undoBtn.style.display = 'none';
      undoBtn.onclick = null;
    }

    void toast.offsetWidth; // Force reflow
    toast.classList.add('show');

    if (duration > 0) {
      spaToastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        spaToastTimeout = null;
      }, duration);
    }
  }

  function showToast(msg, duration = 2800) {
    const t = document.getElementById('toast');
    if (!t) {
      // Fallback to global toast if #toast is absent
      showSpaToast(msg, null, duration);
      return;
    }

    if (authToastTimeout) {
      clearTimeout(authToastTimeout);
      authToastTimeout = null;
    }

    t.classList.remove('show');
    t.textContent = msg;
    void t.offsetWidth; // Force reflow
    t.classList.add('show');

    if (duration > 0) {
      authToastTimeout = setTimeout(() => {
        t.classList.remove('show');
        authToastTimeout = null;
      }, duration);
    }
  }

  function hideSpaToast() {
    if (spaToastTimeout) {
      clearTimeout(spaToastTimeout);
      spaToastTimeout = null;
    }
    const toast = document.getElementById('global-toast');
    if (toast) {
      toast.classList.remove('show');
    }
  }

  function hideAuthToast() {
    if (authToastTimeout) {
      clearTimeout(authToastTimeout);
      authToastTimeout = null;
    }
    const t = document.getElementById('toast');
    if (t) {
      t.classList.remove('show');
    }
  }

  function dismissAll() {
    hideSpaToast();
    hideAuthToast();
  }

  const GlobalToast = {
    showSpaToast,
    showToast,
    hideSpaToast,
    hideAuthToast,
    dismissAll,
    hide: dismissAll
  };

  root.GlobalToast = GlobalToast;
  root.showSpaToast = showSpaToast;
  root.showToast = showToast;

})(typeof window !== 'undefined' ? window : globalThis);
