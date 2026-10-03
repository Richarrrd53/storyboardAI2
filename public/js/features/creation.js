/**
 * features/creation.js
 * 
 * StoryboardAI Creation Feature Layer
 * Manages creation business state, cross-page CreationSessionStore,
 * QuickCompose -> Generate handoff orchestration, workspace lifecycle,
 * and duplicate submission guards.
 */
(function(root) {
  'use strict';

  // ── 1. Authoritative CreationSessionStore ──
  function createInitialSession() {
    return {
      entryMode: 'full', // 'quick' | 'full'
      story: '',
      styleIndex: 0,
      ratio: '橫向16:9',
      selectedTemplate: null,
      currentPhase: 1,
      targetPhase: 1,
      draft: {
        story: '',
        styleIndex: 0,
        ratio: '橫向16:9',
        selectedTemplate: null
      }
    };
  }

  // Preserve existing store if already initialized, otherwise create new
  const session = (root.CreationSessionStore && typeof root.CreationSessionStore === 'object')
    ? root.CreationSessionStore
    : createInitialSession();

  if (!session.draft) {
    session.draft = {
      story: '',
      styleIndex: 0,
      ratio: '橫向16:9',
      selectedTemplate: null
    };
  }

  session.reset = function() {
    root.GenerationTask?.reset();
    const fresh = createInitialSession();
    Object.keys(fresh).forEach(key => {
      if (key === 'draft') {
        session.draft = { ...fresh.draft };
      } else {
        session[key] = fresh[key];
      }
    });
    return session;
  };

  root.CreationSessionStore = session;

  // ── 2. Creation Controller Business State ──
  // Standalone fallback only; with QuickCompose mounted, its UI state/accessors win.
  let surfaceState = 'closed'; // 'closed' | 'quick-compose' | 'closing' | 'workspace'
  let previousRoute = null;
  let previousScrollY = 0;
  let lastOpenTime = 0;
  let isSubmitting = false;
  let activeSubmitTimer = null;
  let activeProxyEl = null;
  let resetVersion = 0;

  function isMobileView() {
    if (root.AppShell?.isMobileView) return root.AppShell.isMobileView();
    if (typeof root.isMobileView === 'function') return root.isMobileView();
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(max-width: 768px), (max-width: 767px) and (orientation: portrait), (max-width: 480px)').matches;
    }
    return false;
  }

  function getNavigateFn(customNavigate) {
    if (typeof customNavigate === 'function') return customNavigate;
    if (root.spaNavigate && typeof root.spaNavigate === 'function') return root.spaNavigate;
    if (root.navigate && typeof root.navigate === 'function') return root.navigate;
    return null;
  }

  // ── 3. Submit from QuickCompose to Generate Workspace ──
  async function submitFromQuickCompose(promptText, options = {}) {
    // Duplicate submit guard
    if (isSubmitting) {
      return false;
    }

    const qcInput = typeof document !== 'undefined' ? document.getElementById('qc-story-input') : null;
    const story = (typeof promptText === 'string' && promptText.trim())
      ? promptText.trim()
      : ((qcInput ? qcInput.value.trim() : '') || (session.draft?.story || ''));

    if (!story) {
      return false;
    }

    const submitVersion = resetVersion;
    isSubmitting = true;

    // Update authoritative CreationSessionStore
    session.story = story;
    if (session.draft) {
      session.draft.story = '';
    }
    session.entryMode = 'quick';
    session.targetPhase = options.targetPhase || 2;

    const isMob = isMobileView();
    const isReduced = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // 1. Capture origin position of input box
    let startRect = null;
    let composerFace = null;
    let capsule = null;
    if (typeof document !== 'undefined') {
      composerFace = document.getElementById('qc-composer-area');
      capsule = document.getElementById('global-create-capsule');
      const startEl = composerFace || capsule;
      if (startEl && typeof startEl.getBoundingClientRect === 'function') {
        const r = startEl.getBoundingClientRect();
        if (r && r.width > 0 && r.height > 0) {
          startRect = r;
        }
      }
    }

    const halfHeightRadius = startRect && startRect.height > 0
      ? Math.min(28, Math.round(startRect.height / 2))
      : (isMob ? 27 : 26);

    // 2. Capture target bounding box of #page-main
    let targetRect = null;
    let pageMainEl = typeof document !== 'undefined' ? document.getElementById('page-main') : null;
    if (pageMainEl && typeof pageMainEl.getBoundingClientRect === 'function') {
      const r = pageMainEl.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) {
        targetRect = r;
      }
    }
    const targetRadius = isMob ? `${halfHeightRadius}px` : (pageMainEl && typeof window !== 'undefined' ? (window.getComputedStyle(pageMainEl).borderRadius || '24px') : '24px');
    if (!targetRect || targetRect.width <= 0) {
      targetRect = {
        top: 0,
        left: 0,
        width: typeof window !== 'undefined' ? (window.innerWidth || 1024) : 1024,
        height: typeof window !== 'undefined' ? (window.innerHeight || 768) : 768
      };
    }

    // 3. Hide original capsule and mobile generate button
    if (typeof document !== 'undefined') {
      const mobGen = document.getElementById('mob-nav-generate');
      if (mobGen) {
        mobGen.classList.add('disabled-on-workspace');
        mobGen.setAttribute('aria-disabled', 'true');
        mobGen.style.setProperty('pointer-events', 'none', 'important');
      }
      if (capsule) {
        capsule.style.setProperty('transition', 'none', 'important');
        capsule.style.setProperty('opacity', '0', 'important');
        capsule.style.setProperty('visibility', 'hidden', 'important');
        capsule.style.setProperty('pointer-events', 'none', 'important');
        capsule.classList.remove('is-expanded');
        capsule.classList.add('hidden-by-workspace');
      }
    }

    // 4. Create temporary transition proxy
    let proxy = null;
    if (typeof document !== 'undefined' && startRect && !isReduced) {
      proxy = document.createElement('div');
      proxy.id = 'qc-transition-proxy';
      proxy.className = 'qc-transition-proxy' + (isMob ? ' is-mobile' : '');
      const displayText = story.length > 32 ? story.slice(0, 32) + '…' : story;
      proxy.innerHTML = `
        <div class="proxy-header-row">
          <div class="proxy-badge">
            <span class="proxy-sparkle">✦</span>
            <span class="proxy-text">${displayText}</span>
            <span class="proxy-check">✓</span>
          </div>
        </div>
      `;
      proxy.style.position = 'fixed';
      proxy.style.top = `${startRect.top}px`;
      proxy.style.left = `${startRect.left}px`;
      proxy.style.width = `${startRect.width}px`;
      proxy.style.height = `${startRect.height}px`;
      proxy.style.zIndex = '99999';
      proxy.style.pointerEvents = 'none';
      proxy.style.borderRadius = `${halfHeightRadius}px`;
      proxy.style.boxSizing = 'border-box';
      document.body.appendChild(proxy);
      activeProxyEl = proxy;
    }

    // Update mobile bottom nav active
    if (root.AppShell?.updateMobileBottomNavActive) {
      root.AppShell.updateMobileBottomNavActive('generate');
    } else if (typeof root.updateMobileBottomNavActive === 'function') {
      root.updateMobileBottomNavActive('generate');
    }

    // 5. Synchronized morph & collapse
    const triggerSynchronizedMorphAndCollapse = () => {
      if (submitVersion !== resetVersion) return;
      if (proxy && proxy.parentNode) {
        proxy.style.top = `${targetRect.top}px`;
        proxy.style.left = `${targetRect.left}px`;
        proxy.style.width = `${targetRect.width}px`;
        proxy.style.height = `${targetRect.height}px`;
        proxy.style.borderRadius = targetRadius;
        proxy.classList.add('is-expanded-page-main');
      }

      surfaceState = 'closing';
      if (root.QuickCompose) {
        root.QuickCompose.state = 'closing';
      }

      if (typeof document !== 'undefined') {
        document.body.classList.add('ai-quick-compose-closing');
        const layer = document.getElementById('ai-creation-layer');
        if (layer) {
          layer.classList.remove('state-quick-compose');
          layer.classList.add('state-closing');
        }
        const qcContainer = document.getElementById('quick-creation-container');
        if (qcContainer) {
          qcContainer.style.transition = 'opacity 700ms cubic-bezier(0.16, 1, 0.3, 1), transform 800ms cubic-bezier(0.16, 1, 0.3, 1), filter 700ms ease';
          qcContainer.style.opacity = '0';
          qcContainer.style.transform = 'translateY(32px) scale(0.92)';
          qcContainer.style.filter = 'blur(8px)';
          qcContainer.style.pointerEvents = 'none';
        }
        const focusField = document.getElementById('ai-focus-field');
        if (focusField) {
          focusField.style.transition = 'opacity 750ms cubic-bezier(0.16, 1, 0.3, 1), backdrop-filter 750ms ease, -webkit-backdrop-filter 750ms ease';
          focusField.style.opacity = '0';
          focusField.style.pointerEvents = 'none';
        }
      }
    };

    if (proxy && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          triggerSynchronizedMorphAndCollapse();
        });
      });
    } else {
      triggerSynchronizedMorphAndCollapse();
    }

    // 6. Clear QC inputs
    if (qcInput) {
      qcInput.value = '';
    }
    if (typeof document !== 'undefined') {
      const qcSendBtn = document.getElementById('qc-send-btn');
      if (qcSendBtn) {
        qcSendBtn.disabled = true;
        qcSendBtn.setAttribute('data-active', 'false');
      }
    }

    // 7. Navigate to generate route Phase 2
    const navFn = getNavigateFn(options.navigate);
    if (navFn) {
      await navFn('generate', { fromQC: true, targetPhase: 2 });
    }

    if (submitVersion !== resetVersion) return false;

    // 8. Complete transition and clean up proxy
    const totalWait = isReduced ? 0 : 880;
    if (activeSubmitTimer) {
      clearTimeout(activeSubmitTimer);
    }

    activeSubmitTimer = setTimeout(() => {
      activeSubmitTimer = null;
      if (submitVersion !== resetVersion) return;
      if (proxy) {
        proxy.style.opacity = '0';
        proxy.style.visibility = 'hidden';
        proxy.style.pointerEvents = 'none';
        if (proxy.parentNode) {
          proxy.remove();
        }
        activeProxyEl = null;
      }

      if (typeof document !== 'undefined') {
        const qcContainer = document.getElementById('quick-creation-container');
        if (qcContainer) {
          qcContainer.style.opacity = '0';
          qcContainer.style.pointerEvents = 'none';
        }
        const focusField = document.getElementById('ai-focus-field');
        if (focusField) {
          focusField.style.opacity = '0';
          focusField.style.pointerEvents = 'none';
        }
        if (capsule) {
          capsule.style.setProperty('transition', 'none', 'important');
          capsule.style.setProperty('opacity', '0', 'important');
          capsule.style.setProperty('visibility', 'hidden', 'important');
          capsule.style.setProperty('pointer-events', 'none', 'important');
          capsule.classList.remove('is-expanded');
          capsule.classList.add('hidden-by-workspace');
        }
        const layer = document.getElementById('ai-creation-layer');
        if (layer) {
          layer.classList.remove('state-quick-compose', 'state-closing', 'state-workspace', 'state-transitioning');
          layer.classList.add('state-closed');
        }
        document.body.classList.remove('ai-quick-compose-active', 'ai-quick-compose-closing', 'ai-keyboard-open');

        const contentEl = document.getElementById('page-content');
        if (contentEl) {
          contentEl.style.transition = 'none';
          contentEl.style.visibility = 'visible';
          contentEl.style.opacity = '1';
          contentEl.style.filter = '';
          contentEl.classList.remove('qc-transition-hidden');
        }
        const wsEl = document.querySelector('.generate-workspace');
        if (wsEl) {
          wsEl.style.transition = 'none';
          wsEl.style.visibility = 'visible';
          wsEl.style.opacity = '1';
          wsEl.classList.remove('qc-transition-hidden');
        }
      }

      surfaceState = 'closed';
      if (root.QuickCompose) {
        root.QuickCompose.state = 'closed';
      }
      isSubmitting = false;
    }, totalWait);

    return true;
  }

  // ── 4. Open Workspace Directly ──
  function openWorkspace(options = {}) {
    session.entryMode = 'full';
    session.targetPhase = options.targetPhase || 1;
    const navFn = getNavigateFn(options.navigate);
    if (navFn) {
      navFn('generate', { fromSidebar: true, targetPhase: session.targetPhase, ...options });
    }
  }

  // ── 5. Close Workspace ──
  function closeWorkspace(target = 'dashboard', options = {}) {
    surfaceState = 'closed';
    if (root.QuickCompose) {
      root.QuickCompose.state = 'closed';
    }
    const currentRoute = root.spaRouter?.currentPage || root.currentPage;
    if (target && currentRoute === 'generate') {
      const navFn = getNavigateFn(options.navigate);
      if (navFn) {
        navFn(target);
      }
    }
  }

  // ── 6. Reset ──
  function reset() {
    resetVersion++;
    if (activeSubmitTimer) {
      clearTimeout(activeSubmitTimer);
      activeSubmitTimer = null;
    }
    if (activeProxyEl && activeProxyEl.parentNode) {
      activeProxyEl.remove();
      activeProxyEl = null;
    }
    if (typeof document !== 'undefined') {
      const strayProxy = document.getElementById('qc-transition-proxy');
      if (strayProxy) strayProxy.remove();
    }
    isSubmitting = false;
    // Session reset cancels GenerationTask before replacing the draft.
    session.reset();
    surfaceState = 'closed';
    previousRoute = null;
    previousScrollY = 0;
    lastOpenTime = 0;
    if (root.QuickCompose?.reset) {
      root.QuickCompose.reset();
    } else if (root.QuickCompose) {
      root.QuickCompose.state = 'closed';
      root.QuickCompose.close?.(true);
    }
  }

  // ── 7. Route Synchronization ──
  function syncRoute(page, opts = {}) {
    const uiState = CreationController.surfaceState;
    if (page === 'generate') {
      if (opts && opts.targetPhase) {
        session.targetPhase = opts.targetPhase;
      }
      surfaceState = 'workspace';
      if (root.QuickCompose) {
        root.QuickCompose.state = 'workspace';
      }
    } else {
      if (uiState === 'workspace') {
        surfaceState = 'closed';
        if (root.QuickCompose) {
          root.QuickCompose.state = 'closed';
        }
      }
      if ((uiState === 'quick-compose' || uiState === 'closing') && root.QuickCompose) {
        root.QuickCompose.close(true);
        surfaceState = 'closed';
      }
    }
  }

  // ── 8. Public CreationController Interface ──
  const CreationController = {
    getState() {
      return {
        surfaceState: CreationController.surfaceState,
        isSubmitting,
        previousRoute: CreationController.previousRoute,
        previousScrollY: CreationController.previousScrollY,
        lastOpenTime: CreationController.lastOpenTime,
        session
      };
    },
    get surfaceState() {
      return root.QuickCompose ? root.QuickCompose.state : surfaceState;
    },
    set surfaceState(val) {
      surfaceState = val;
      if (root.QuickCompose) {
        root.QuickCompose.state = val;
      }
    },
    get isSubmitting() {
      return isSubmitting;
    },
    get previousRoute() {
      return root.QuickCompose ? root.QuickCompose.previousRoute : previousRoute;
    },
    set previousRoute(val) {
      previousRoute = val;
      if (root.QuickCompose) {
        root.QuickCompose.previousRoute = val;
      }
    },
    get previousScrollY() {
      return root.QuickCompose ? root.QuickCompose.previousScrollY : previousScrollY;
    },
    set previousScrollY(val) {
      previousScrollY = val;
      if (root.QuickCompose) {
        root.QuickCompose.previousScrollY = val;
      }
    },
    get lastOpenTime() {
      return root.QuickCompose ? root.QuickCompose.lastOpenTime : lastOpenTime;
    },
    set lastOpenTime(val) {
      lastOpenTime = val;
      if (root.QuickCompose) {
        root.QuickCompose.lastOpenTime = val;
      }
    },

    submitFromQuickCompose,
    submitToWorkspace: submitFromQuickCompose,
    openWorkspace,
    openWorkspaceDirectly: openWorkspace,
    closeWorkspace,
    reset,
    syncRoute,

    // Proxy / Visual Helpers
    resetQuickComposeVisuals(targetPage) {
      return root.QuickCompose?.resetVisuals?.(targetPage);
    },
    openQuickCompose() {
      return root.QuickCompose?.open?.();
    },
    closeQuickCompose(force = false) {
      return root.QuickCompose?.close?.(force);
    }
  };

  root.CreationController = CreationController;

  // ── 9. Compatibility: Dashboard/AppShell and standalone dashboard HTML still call this alias. ──
  root.AICreationController = CreationController;

})(typeof window !== 'undefined' ? window : globalThis);
