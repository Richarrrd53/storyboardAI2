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
      sessionId: `creation-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      submitted: false,
      confirmBeforeImages: false,
      entryMode: 'full', // 'quick' | 'full'
      story: '',
      creativeBrief: null,
      copilot: null,
      styleIndex: 0,
      ratio: '直向9:16',
      duration: 30,
      selectedTemplate: null,
      templateValues: {},
      currentPhase: 1,
      targetPhase: 1,
      draft: {
        story: '',
        styleIndex: 0,
        ratio: '直向9:16',
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
      ratio: '直向9:16',
      selectedTemplate: null
    };
  }

  session.reset = function(options = {}) {
    const task = root.GenerationTask?.getState?.();
    if (!options.force && (task?.status === 'generating' || task?.save.status === 'saving')) return false;
    root.CreativeCopilot?.cancel();
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
  let resetVersion = 0;

  function getNavigateFn(customNavigate) {
    if (typeof customNavigate === 'function') return customNavigate;
    if (root.spaNavigate && typeof root.spaNavigate === 'function') return root.spaNavigate;
    if (root.navigate && typeof root.navigate === 'function') return root.navigate;
    return null;
  }

  // Derived once from the two authoritative stores; QC never owns work state.
  function workState() {
    const task = root.GenerationTask?.getState?.() || { status: 'idle', save: {}, progress: {} };
    const submitted = !!(session.submitted || session.copilot?.active || (session.story && session.currentPhase > 1));
    let label = session.draft?.story?.trim() ? '繼續輸入' : '開始創作', intent = 'new';
    if (task.status === 'completed') {
      if (task.save.status === 'saved') label = '開始新創作';
      else { label = '待儲存成果'; intent = 'view_result'; }
    } else if (task.status === 'generating') {
      intent = 'resume';
      label = task.save.status === 'saving' ? '正在儲存成果' : task.retry ? '等待自動重試' : task.stage === 'planning' ? '正在規劃分鏡' : `生成中 · ${task.progress.completed || 0}/${task.progress.total || 0}`;
    } else if (['error', 'cancelled'].includes(task.status)) { label = '待繼續生成'; intent = 'resume'; }
    else if (task.status === 'awaiting_confirmation') { label = '待確認文字分鏡'; intent = 'resume'; }
    else if (submitted) {
      intent = 'resume';
      label = session.currentPhase === 2 || session.currentPhase === 3 ? '創作設定中' : session.copilot?.busy ? '正在構思…' : '待確認創作方向';
    }
    return { label, intent, hasWork: intent !== 'new', task };
  }
  function publish() { root.QuickCompose?.updateProgress?.(); }
  function canReplace() {
    const { task } = workState();
    const running = task.status === 'generating' || task.save.status === 'saving';
    const unsaved = task.result?.generatedShotData?.length && task.save.status !== 'saved';
    const unfinished = session.submitted && task.status !== 'completed';
    if (!running && !unsaved && !unfinished) return true;
    const progress = task.progress.total ? `（已完成 ${task.progress.completed || 0}/${task.progress.total} 個分鏡）` : '';
    return root.confirm?.(`${running ? '目前工作仍在執行' : '目前創作尚未完成'}${progress}。開始新創作將中止並清除目前工作${unsaved ? '，尚未儲存的成果將會遺失' : ''}。確定繼續？`, '') ?? false;
  }
  function newCreation(options = {}) {
    const id = session.sessionId;
    const replace = allowed => { if (allowed !== true || session.sessionId !== id) return false; reset(options); return true; };
    const decision = canReplace();
    return decision?.then ? decision.then(replace) : replace(decision);
  }
  function resolveEntry(options = {}) {
    if (options.sessionId && options.sessionId !== session.sessionId) return null;
    if (options.creationIntent === 'new' && !options.sessionId) {
      const decision = newCreation();
      if (decision?.then) return decision.then(ok => ok ? resolveEntry({ ...options, sessionId: session.sessionId }) : null);
      if (!decision) return null;
    } else if (!options.creationIntent && workState().task.status === 'completed' && workState().task.save.status === 'saved') {
      reset();
    }
    const work = workState();
    const intent = options.creationIntent || (work.hasWork ? work.intent : 'new');
    const phase = work.task.status === 'awaiting_confirmation' ? 5 : work.task.status !== 'idle' ? 4 : session.currentPhase;
    return { ...options, targetPhase: intent === 'new' ? options.targetPhase || session.targetPhase : phase, creationIntent: intent, sessionId: session.sessionId };
  }

  let transition = null;
  function cleanupTransition() {
    const old = transition; transition = null;
    if (old) {
      old.controller?.abort();
      old.animations.forEach(a => a.cancel()); old.nodes.forEach(n => n.remove());
      old.source?.style.removeProperty('visibility');
    }
    if (typeof document !== 'undefined') {
      document.getElementById('qc-transition-proxy')?.remove();
      document.body.classList.remove('qc-text-handoff', 'qc-resume-handoff');
      for (const node of document.querySelectorAll('.qc-transition-hidden')) node.classList.remove('qc-transition-hidden');
    }
    isSubmitting = false;
  }
  function play(node, frames, duration, flight) {
    if (!node?.animate || root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    const animation = node.animate(frames, { duration, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' });
    flight.animations.push(animation);
    return animation.finished.catch(() => {});
  }
  async function handoff(intent, story, options = {}) {
    if (isSubmitting) return false;
    cleanupTransition(); isSubmitting = true;
    const ticket = resetVersion;
    const flight = { nodes: [], animations: [], source: null, controller: new AbortController() }; transition = flight;
    const doc = typeof document !== 'undefined' ? document : null;
    const input = doc?.getElementById('qc-story-input');
    const origin = intent === 'new' ? input : doc?.getElementById('global-create-capsule');
    const bounds = origin?.getBoundingClientRect();
    const shellBounds = (intent === 'new' ? doc?.getElementById('qc-composer-area') : origin)?.getBoundingClientRect() || bounds;
    let text = null, shell = null;
    if (doc && intent !== 'new') doc.body.classList.add('qc-resume-handoff');
    const reduced = root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (doc && bounds?.width && !reduced) {
      shell = doc.createElement('div'); shell.className = 'qc-workspace-morph';
      Object.assign(shell.style, { top: shellBounds.top + 'px', left: shellBounds.left + 'px', width: shellBounds.width + 'px', height: shellBounds.height + 'px' });
      doc.body.appendChild(shell); flight.nodes.push(shell);
      if (intent === 'new') {
        text = doc.createElement('div'); text.className = 'qc-story-flight'; text.textContent = story;
        const css = root.getComputedStyle?.(origin);
        Object.assign(text.style, { top: bounds.top + 'px', left: bounds.left + 'px', width: bounds.width + 'px', font: css?.font || 'inherit', lineHeight: css?.lineHeight || '1.6', padding: css?.padding || '0px', color: css?.color || 'inherit', maxHeight: bounds.height + 'px' });
        doc.body.appendChild(text); flight.nodes.push(text); flight.source = input;
        input.style.visibility = 'hidden'; doc.body.classList.add('qc-text-handoff');
      }
    }
    try {
      if (intent === 'new' && input) { input.value = ''; const send = doc.getElementById('qc-send-btn'); if (send) send.disabled = true; }
      if (doc?.getElementById('quick-creation-container')?.animate && !reduced) await play(doc?.getElementById('quick-creation-container'), [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(8px)' }], 220, flight);
      if (transition !== flight) return false;
      root.QuickCompose?.close?.(true);
      root.QuickCompose?.resetVisuals?.('generate');
      root.AppShell?.updateMobileBottomNavActive?.('generate');
      const frame = doc?.getElementById('page-main')?.getBoundingClientRect();
      const morph = frame && shell ? play(shell, [{}, { top: frame.top + 'px', left: frame.left + 'px', width: frame.width + 'px', height: frame.height + 'px', borderRadius: '24px', opacity: .35, filter: 'blur(8px)' }], 650, flight) : Promise.resolve();
      await getNavigateFn(options.navigate)?.('generate', { fromQC: true, creationIntent: intent, sessionId: session.sessionId, targetPhase: intent === 'new' ? 1 : session.targetPhase });
      if (ticket !== resetVersion || transition !== flight) return false;
      // Route completion establishes the real stack and its responsive layout.
      if (root.requestAnimationFrame) await new Promise(resolve => root.requestAnimationFrame(() => root.requestAnimationFrame(resolve)));
      if (transition !== flight) return false;
      // A user scroll/resize ends the temporary flight at the real, responsive card.
      for (const event of ['resize', 'orientationchange', 'scroll']) root.addEventListener?.(event, cleanupTransition, { signal: flight.controller.signal, passive: true, capture: true });
      const target = doc?.querySelector('.copilot-user-message p');
      if (text && target) {
        const to = target.getBoundingClientRect(), css = root.getComputedStyle?.(target);
        if (to.width) await play(text, [{}, { top: to.top + 'px', left: to.left + 'px', width: to.width + 'px', padding: '0px', maxHeight: to.height + 'px', fontSize: css?.fontSize || '16px', fontWeight: css?.fontWeight || '400', lineHeight: css?.lineHeight || '1.6' }], 650, flight);
      } else {
        const workspace = doc?.querySelector('.generate-workspace');
        doc?.body.classList.remove('qc-resume-handoff');
        await play(workspace, [{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)' }], 450, flight);
      }
      await morph;
      return ticket === resetVersion && transition === flight;
    } finally {
      if (transition === flight) {
        cleanupTransition();
        const page = root.spaRouter?.currentPage || root.currentPage || (doc?.querySelector('.generate-workspace') ? 'generate' : 'dashboard');
        root.QuickCompose?.resetVisuals?.(page);
        surfaceState = page === 'generate' ? 'workspace' : 'closed';
        if (root.QuickCompose) root.QuickCompose.state = surfaceState;
        publish();
      }
    }
  }
  async function submitFromQuickCompose(promptText, options = {}) {
    if (isSubmitting) return false;
    const story = (promptText || session.draft?.story || '').trim();
    if (!story) return false;
    const decision = newCreation({ preserveSurface: true });
    if (!(decision?.then ? await decision : decision)) return false;
    session.story = story; session.submitted = true;
    session.entryMode = 'quick'; session.targetPhase = 1;
    root.CreativeCopilot?.prepare(story);
    return handoff('new', story, options);
  }
  function resumeWorkspace(options = {}) { return handoff(workState().intent === 'view_result' ? 'view_result' : 'resume', '', options); }
  function openWorkspace(options = {}) {
    const navigate = entry => entry ? getNavigateFn(options.navigate)?.('generate', { fromSidebar: true, targetPhase: session.targetPhase, ...entry }) : false;
    const entry = resolveEntry(options);
    return entry?.then ? entry.then(navigate) : navigate(entry);
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
  function reset(options = {}) {
    resetVersion++;
    cleanupTransition();
    // Session reset cancels GenerationTask before replacing the draft.
    session.reset({ force: true });
    surfaceState = 'closed';
    previousRoute = null;
    previousScrollY = 0;
    lastOpenTime = 0;
    if (options.preserveSurface) return;
    if (root.QuickCompose?.reset) {
      root.QuickCompose.reset();
    } else if (root.QuickCompose) {
      root.QuickCompose.state = 'closed';
      root.QuickCompose.close?.(true);
    }
  }

  // ── 7. Route Synchronization ──
  function syncRoute(page, opts = {}) {
    if (page !== 'generate') cleanupTransition();
    const uiState = CreationController.surfaceState;
    if (page === 'generate') {
      if (opts.creationIntent === 'new' && opts.targetPhase) {
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

    workState, publish, newCreation, resolveEntry, resumeWorkspace, cleanupTransition,
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
