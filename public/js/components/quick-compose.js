/**
 * StoryboardAI - Quick Compose Component (P5-1)
 * Manages the UI, DOM, and interaction lifecycle of Quick Compose / Creation Dock:
 * - Capsule & creation layer DOM creation and mounting (#global-create-capsule, #ai-creation-layer)
 * - Desktop placement (body) vs Mobile placement (#mob-nav-generate)
 * - Expand & collapse state machine (closed, quick-compose, closing, workspace)
 * - Dynamic textarea autosize & offscreen calculation tester
 * - Input typing presentation & send button state synchronization
 * - Suggestion chips interaction & more suggestions toggle
 * - Conic glow & circular pill generation progress presentation
 * - Outside click, Escape key, and listener lifecycle cleanup
 */
(function (root) {
  'use strict';

  // ── State Variables ──
  let surfaceState = 'closed'; // 'closed' | 'quick-compose' | 'closing' | 'workspace'
  let lastOpenTime = 0;
  let previousRoute = null;
  let previousScrollY = 0;
  let isMounted = false;
  let isBound = false;
  let boundCapsule = null;
  let boundCloseBtn = null;
  let boundContainer = null;
  let boundFocusField = null;
  let boundLayer = null;
  let boundInput = null;
  let boundSendBtn = null;

  // Active Timers & Async Handles
  let closeTimer = null;
  let blurTimer = null;
  let activeMilestoneTimers = [];
  let onWidthDoneHandler = null;

  function raf(cb) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
    if (typeof root.requestAnimationFrame === 'function') return root.requestAnimationFrame(cb);
    return setTimeout(cb, 16);
  }

  // DOM Getters
  function getLayer() {
    return document.getElementById('ai-creation-layer');
  }

  function getCapsule() {
    return document.getElementById('global-create-capsule');
  }

  function getTrigger() {
    return document.getElementById('global-create-trigger');
  }

  function getInput() {
    return document.getElementById('qc-story-input');
  }

  function getSendBtn() {
    return document.getElementById('qc-send-btn');
  }

  function getCloseBtn() {
    return document.getElementById('qc-close-btn');
  }

  function getFocusField() {
    return document.getElementById('ai-focus-field');
  }

  function getContainer() {
    return document.getElementById('quick-creation-container');
  }

  function getSuggestionTray() {
    return document.getElementById('qc-sugg-tray');
  }

  function getSuggestionTrigger() {
    return document.getElementById('qc-sugg-more-trigger');
  }

  // ── Helpers ──
  function isMobileView() {
    if (root.AppShell?.isMobileView) return root.AppShell.isMobileView();
    if (typeof root.isMobileView === 'function') return root.isMobileView();
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(max-width: 768px), (max-width: 767px) and (orientation: portrait), (max-width: 480px)').matches;
    }
    return false;
  }

  function isDashboardRoute(page) {
    if (typeof root.isDashboardPage === 'function') {
      return root.isDashboardPage(page);
    }
    return ['dashboard', 'projects', 'generate', 'history', 'template', 'project', 'discovery'].includes(page);
  }

  function updateMobileNav(page) {
    if (root.AppShell?.updateMobileBottomNavActive) {
      root.AppShell.updateMobileBottomNavActive(page);
    } else if (typeof root.updateMobileBottomNavActive === 'function') {
      root.updateMobileBottomNavActive(page);
    }
  }

  function clearMilestoneTimers() {
    activeMilestoneTimers.forEach(id => clearTimeout(id));
    activeMilestoneTimers = [];
  }

  // ── Textarea Autosize Engine ──
  function getTargetWidth() {
    const isMob = isMobileView();
    const screenW = (typeof window !== 'undefined' && (window.innerWidth || document.documentElement?.clientWidth)) || 390;
    if (isMob) {
      const capsuleW = Math.min(screenW - 32, 440);
      return Math.max(capsuleW - 66, 120);
    } else {
      const capsuleW = Math.min(Math.max(screenW * 0.42, 380), 540);
      return Math.max(capsuleW - 68, 200);
    }
  }

  function measureScrollHeight(textarea, targetWidth) {
    if (!textarea) return 24;
    let tester = document.getElementById('qc-height-tester');
    if (tester && tester.tagName !== 'DIV') {
      tester.remove();
      tester = null;
    }
    if (!tester) {
      tester = document.createElement('div');
      tester.id = 'qc-height-tester';
      tester.setAttribute('aria-hidden', 'true');
      tester.tabIndex = -1;
      tester.style.cssText = 'position:fixed!important;top:-9999px!important;left:-9999px!important;visibility:hidden!important;pointer-events:none!important;z-index:-999!important;overflow:hidden!important;margin:0!important;border:0!important;';
      document.body.appendChild(tester);
    }

    const computed = (typeof window !== 'undefined' && window.getComputedStyle)
      ? window.getComputedStyle(textarea)
      : {
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 'normal',
          lineHeight: '1.4',
          letterSpacing: 'normal',
          paddingTop: '8px',
          paddingBottom: '8px',
          paddingLeft: '12px',
          paddingRight: '12px'
        };

    tester.style.fontFamily = computed.fontFamily;
    tester.style.fontSize = computed.fontSize;
    tester.style.fontWeight = computed.fontWeight;
    tester.style.lineHeight = computed.lineHeight;
    tester.style.letterSpacing = computed.letterSpacing;
    tester.style.wordBreak = 'break-word';
    tester.style.whiteSpace = 'pre-wrap';
    tester.style.boxSizing = 'border-box';
    tester.style.paddingTop = computed.paddingTop;
    tester.style.paddingBottom = computed.paddingBottom;
    tester.style.paddingLeft = computed.paddingLeft;
    tester.style.paddingRight = computed.paddingRight;
    tester.style.width = `${Math.round(targetWidth)}px`;

    const val = textarea.value || '';
    tester.textContent = val.endsWith('\n') ? val + ' ' : val;

    if (tester.getBoundingClientRect) {
      const rect = tester.getBoundingClientRect();
      return Math.ceil(rect.height || 24);
    }
    return 24;
  }

  function autoGrow() {
    const qcInput = getInput();
    const capsule = getCapsule();
    if (!qcInput || !capsule) return;

    if (!capsule.classList.contains('is-expanded')) {
      qcInput.style.removeProperty('height');
      qcInput.style.removeProperty('overflow-y');
      capsule.style.removeProperty('height');
      return;
    }

    const isMob = isMobileView();
    const initialCapsuleH = isMob ? 54 : 56;
    const maxCapsuleH = isMob ? 128 : 148;
    const padTop = isMob ? 7 : 8;
    const padBottom = isMob ? 7 : 8;
    const verticalPadding = padTop + padBottom;
    const minTextareaH = initialCapsuleH - verticalPadding;
    const maxTextareaH = maxCapsuleH - verticalPadding;

    const text = qcInput.value;

    if (!text || text.trim() === '') {
      qcInput.style.setProperty('height', `${minTextareaH}px`, 'important');
      qcInput.style.overflowY = 'hidden';
      capsule.style.setProperty('height', `${initialCapsuleH}px`, 'important');
      return;
    }

    const targetWidth = getTargetWidth();
    let scrollH;

    // When the capsule is actively morphing width or not yet fully laid out,
    // qcInput.clientWidth is artificially narrow. Measure against true target width
    // using the offscreen tester to strictly prevent false line wrapping.
    if (!qcInput.clientWidth || qcInput.clientWidth < targetWidth - 25) {
      scrollH = measureScrollHeight(qcInput, targetWidth);
    } else {
      qcInput.style.height = 'auto';
      scrollH = qcInput.scrollHeight;
    }

    const targetTextareaH = Math.min(Math.max(scrollH, minTextareaH), maxTextareaH);
    const targetCapsuleH = Math.min(Math.max(targetTextareaH + verticalPadding, initialCapsuleH), maxCapsuleH);

    qcInput.style.setProperty('height', `${targetTextareaH}px`, 'important');
    capsule.style.setProperty('height', `${targetCapsuleH}px`, 'important');

    if (scrollH > maxTextareaH) {
      qcInput.style.overflowY = 'auto';
    } else {
      qcInput.style.overflowY = 'hidden';
    }
  }

  // ── DOM Creation & Structure ──
  function ensureDOM() {
    let layer = getLayer();
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'ai-creation-layer';
      layer.className = 'ai-creation-layer state-closed';
      layer.innerHTML = `
        <!-- Directional Frosted Focus Field (Smaller tightened blur) -->
        <div class="ai-focus-field" id="ai-focus-field"></div>

        <!-- Quick Creation Floating Content (Sequentially floats up above capsule) -->
        <div class="quick-creation-container" id="quick-creation-container">
          <div class="qc-card">
            <div class="qc-header">
              <div class="qc-brand">
                <span class="qc-sparkle">✦</span>
                <span class="qc-title">Storyboard AI</span>
              </div>
              <button class="qc-close-btn" id="qc-close-btn" type="button" title="關閉 (Esc)" aria-label="關閉">✕</button>
            </div>

            <div class="qc-intro">
              <h3 class="qc-greeting">今天想創作什麼？</h3>
              <p class="qc-sub">描述故事或創作靈感，AI 將為您打造專業分鏡</p>
            </div>

            <div class="qc-suggestion-row" id="qc-suggestion-row">
              <span class="qc-sugg-label">靈感推薦：</span>
              <div class="qc-sugg-chips-list">
                <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">蘋果牛奶廣告</button>
                <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">旅遊短影音</button>
                <button type="button" class="qc-sugg-chip qc-sugg-more-trigger" id="qc-sugg-more-trigger" onclick="toggleQuickMoreSuggestions(event)">＋更多</button>
                <div class="qc-sugg-tray" id="qc-sugg-tray" style="display: none;">
                  <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">運動服品牌形象</button>
                  <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">美食餐廳探店介紹</button>
                  <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">科技產品發表預告</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(layer);
    }

    let capsule = getCapsule();
    if (!capsule) {
      capsule = document.createElement('div');
      capsule.id = 'global-create-capsule';
      capsule.className = 'ai-unified-capsule mob-circle-btn';
      capsule.innerHTML = `
        <!-- Conic Glow Aura -->
        <div class="ai-pill-btn-glow-ambient" aria-hidden="true">
          <div class="ai-pill-btn-glow-rotator"></div>
        </div>
        <div class="ai-pill-btn-glow-container" aria-hidden="true">
          <div class="ai-pill-btn-glow-rotator"></div>
        </div>

        <!-- Button Face -->
        <div class="capsule-btn-face" id="global-create-trigger" role="button" tabindex="0" aria-label="新增分鏡">
          <div class="ai-pill-progress-fill" id="gct-progress-fill"></div>
          <span class="ai-pill-spark mob-circle-spark"><span class="ai-spark-desktop">+</span><span class="ai-spark-mobile">+</span></span>
          <span class="mob-circle-text" id="mob-circle-text" style="display:none;"></span>
          <span class="ai-pill-text" id="gct-text">新增分鏡</span>
        </div>

        <!-- Input Face -->
        <div class="capsule-input-face" id="qc-composer-area">
          <textarea id="qc-story-input" class="qc-textarea" placeholder="描述故事或創作方向... ✦" rows="1"></textarea>
          <button class="qc-send-btn compose-send-btn" id="qc-send-btn" type="button" disabled aria-label="發送故事">
            <div class="state state--sent">
              <div class="icon">
                <svg width="1.5em" height="1.5em" viewBox="0 0 24 24" fill="none">
                  <path d="M14.2199 21.63C13.0399 21.63 11.3699 20.8 10.0499 16.83L9.32988 14.67L7.16988 13.95C3.20988 12.63 2.37988 10.96 2.37988 9.78001C2.37988 8.61001 3.20988 6.93001 7.16988 5.60001L15.6599 2.77001C17.7799 2.06001 19.5499 2.27001 20.6399 3.35001C21.7299 4.43001 21.9399 6.21001 21.2299 8.33001L18.3999 16.82C17.0699 20.8 15.3999 21.63 14.2199 21.63Z" fill="currentColor"></path>
                </svg>
              </div>
            </div>
          </button>
        </div>
      `;
      document.body.appendChild(capsule);
    }

    mountCapsule();
    bindEvents();

    // Async prefetch scripts for creation workspace if loader exists
    const injectFn = root.PageAssetLoader?.injectScripts || root.injectScripts;
    if (typeof injectFn === 'function') {
      injectFn(['/js/math-curve-loader.js', '/js/token-manager.js', '/js/prompt-translate.js', '/js/generate.js']).catch(() => {});
    }

    return { layer, capsule };
  }

  // ── Placement: Desktop vs Mobile ──
  function mountCapsule() {
    const capsule = getCapsule();
    if (!capsule) return;

    const isMob = isMobileView();
    if (isMob) {
      const mobGen = document.getElementById('mob-nav-generate');
      if (mobGen) {
        const oldWrap = mobGen.querySelector('#mob-nav-circle-wrap');
        if (oldWrap) {
          oldWrap.remove();
        }
        if (capsule.parentElement !== mobGen) {
          mobGen.appendChild(capsule);
        }
      }
    } else {
      if (capsule.parentElement !== document.body) {
        document.body.appendChild(capsule);
      }
    }

    if (capsule.classList.contains('is-expanded')) {
      autoGrow();
    }
  }

  // ── Visual Style Reset ──
  function resetVisuals(targetPage) {
    const activeRoute = targetPage !== undefined
      ? targetPage
      : (root.spaRouter?.currentPage || root.currentPage || 'dashboard');

    const qcContainer = getContainer();
    if (qcContainer) {
      qcContainer.style.removeProperty('opacity');
      qcContainer.style.removeProperty('transform');
      qcContainer.style.removeProperty('transition');
      qcContainer.style.removeProperty('filter');
      qcContainer.style.removeProperty('pointer-events');
      qcContainer.style.removeProperty('visibility');
    }

    const focusField = getFocusField();
    if (focusField) {
      focusField.style.removeProperty('opacity');
      focusField.style.removeProperty('transform');
      focusField.style.removeProperty('transition');
      focusField.style.removeProperty('filter');
      focusField.style.removeProperty('pointer-events');
      focusField.style.removeProperty('visibility');
    }

    const capsule = getCapsule();
    if (capsule) {
      capsule.style.removeProperty('height');
      if (activeRoute === 'generate') {
        capsule.classList.add('hidden-by-workspace');
        capsule.classList.remove('is-expanded');
        capsule.style.setProperty('opacity', '0', 'important');
        capsule.style.setProperty('visibility', 'hidden', 'important');
        capsule.style.setProperty('pointer-events', 'none', 'important');
        capsule.style.setProperty('transition', 'none', 'important');
      } else {
        capsule.style.removeProperty('opacity');
        capsule.style.removeProperty('pointer-events');
        capsule.style.removeProperty('transition');
        capsule.style.removeProperty('visibility');
        capsule.style.removeProperty('transform');
        capsule.style.removeProperty('display');
        capsule.classList.remove('hidden-by-workspace');
        capsule.classList.remove('is-expanded');
      }
    }

    const qcInput = getInput();
    if (qcInput) {
      qcInput.style.removeProperty('height');
      qcInput.style.removeProperty('overflow-y');
    }

    const tray = getSuggestionTray();
    if (tray) {
      tray.style.display = 'none';
    }
    const trigger = getSuggestionTrigger();
    if (trigger) {
      trigger.textContent = '＋更多';
    }
  }

  // ── Expand & Open UI State ──
  function open() {
    ensureDOM();
    mountCapsule();
    bindEvents();

    const currentRoute = root.spaRouter?.currentPage || root.currentPage || 'dashboard';
    if (surfaceState === 'workspace' || currentRoute === 'generate') return;

    // Clean up any residual inline styles so all elements display cleanly
    resetVisuals();

    surfaceState = 'quick-compose';
    lastOpenTime = Date.now();
    previousRoute = currentRoute;
    previousScrollY = (typeof window !== 'undefined' ? (window.scrollY || document.documentElement?.scrollTop || 0) : 0);

    if (isMobileView()) {
      document.documentElement.classList.add('ai-quick-compose-locked');
      document.body.classList.add('ai-quick-compose-locked');
      document.body.style.position = 'fixed';
      document.body.style.top = `-${previousScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.height = `calc(100% + ${previousScrollY}px)`;
      document.body.style.overflow = 'hidden';
    }

    const layer = getLayer();
    const capsule = getCapsule();
    const qcInput = getInput();
    const sendBtn = getSendBtn();

    // Populate draft story first so measurement can immediately inspect true content
    if (qcInput) {
      if (root.CreationSessionStore && root.CreationSessionStore.draft && root.CreationSessionStore.draft.story) {
        qcInput.value = root.CreationSessionStore.draft.story;
      }
      if (sendBtn) {
        const hasVal = !!qcInput.value.trim();
        sendBtn.disabled = !hasVal;
        sendBtn.setAttribute('data-active', hasVal ? 'true' : 'false');
      }
    }

    document.body.classList.remove('ai-quick-compose-closing');
    document.body.classList.add('ai-quick-compose-active');

    if (layer) {
      layer.classList.remove('state-closed', 'state-closing', 'state-workspace', 'state-transitioning');
      layer.classList.add('state-quick-compose');
    }

    // Expand capsule and coordinate auto-grow across width expansion transition
    if (capsule) {
      capsule.classList.remove('hidden-by-workspace');
      if (!isMobileView()) {
        capsule.style.opacity = '1';
        capsule.style.pointerEvents = 'auto';
      }

      const syncGrow = () => {
        if (surfaceState === 'quick-compose') {
          autoGrow();
        }
      };

      if (!capsule.classList.contains('is-expanded')) {
        raf(() => {
          raf(() => {
            if (surfaceState === 'quick-compose') {
              capsule.classList.add('is-expanded');
              syncGrow();
            }
          });
        });
      } else {
        syncGrow();
      }

      // Re-check auto-grow at milestone animation intervals
      clearMilestoneTimers();
      const t1 = setTimeout(syncGrow, 120);
      const t2 = setTimeout(syncGrow, 300);
      const t3 = setTimeout(syncGrow, 560);
      activeMilestoneTimers.push(t1, t2, t3);

      if (onWidthDoneHandler) {
        capsule.removeEventListener('transitionend', onWidthDoneHandler);
      }
      onWidthDoneHandler = (e) => {
        if (e.target === capsule && (e.propertyName === 'width' || e.propertyName === 'max-width')) {
          capsule.removeEventListener('transitionend', onWidthDoneHandler);
          onWidthDoneHandler = null;
          syncGrow();
        }
      };
      capsule.addEventListener('transitionend', onWidthDoneHandler);
    }
  }

  // ── Collapse & Close UI State ──
  function close(force = false) {
    if (surfaceState !== 'quick-compose' && !force) return;
    if (!force && Date.now() - (lastOpenTime || 0) < 300) return;
    surfaceState = force ? 'closed' : 'closing';

    clearMilestoneTimers();

    const layer = getLayer();
    const capsule = getCapsule();
    const qcInput = getInput();

    if (qcInput) {
      qcInput.blur();
      if (root.CreationSessionStore && root.CreationSessionStore.draft && !force) {
        root.CreationSessionStore.draft.story = qcInput.value;
      }
      qcInput.style.removeProperty('height');
      qcInput.style.removeProperty('overflow-y');
    }
    if (capsule) {
      capsule.style.removeProperty('height');
    }

    document.body.classList.remove('ai-keyboard-open');
    document.body.classList.remove('ai-quick-compose-active');

    const mobNav = document.getElementById('spa-mobile-nav');
    if (mobNav) {
      mobNav.style.transform = '';
    }
    const qcContainer = getContainer();
    if (qcContainer) {
      qcContainer.style.transform = '';
    }

    // Restore mobile body scroll lock
    if (document.body.style.position === 'fixed') {
      const savedY = previousScrollY || 0;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.body.style.overflow = '';
      document.documentElement.classList.remove('ai-quick-compose-locked');
      document.body.classList.remove('ai-quick-compose-locked');
      if (typeof window !== 'undefined' && window.scrollTo) {
        window.scrollTo(0, savedY);
      }
    }

    if (force) {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
      document.body.classList.remove('ai-quick-compose-closing');
      if (capsule) {
        capsule.classList.remove('is-expanded', 'is-closing');
        const currentRoute = root.spaRouter?.currentPage || root.currentPage || 'dashboard';
        if (currentRoute === 'generate') {
          capsule.classList.add('hidden-by-workspace');
          capsule.style.opacity = '0';
          capsule.style.pointerEvents = 'none';
        } else {
          capsule.classList.remove('hidden-by-workspace');
          capsule.style.removeProperty('opacity');
          capsule.style.removeProperty('pointer-events');
          capsule.style.removeProperty('visibility');
          capsule.style.removeProperty('transform');
          capsule.style.removeProperty('display');
        }
      }
      if (layer) {
        layer.classList.remove('state-quick-compose', 'state-closing', 'state-workspace', 'state-transitioning');
        layer.classList.add('state-closed');
      }
      resetVisuals();
      return;
    }

    // Phase 1: Start reverse morph — capsule shrinks from expanded → collapsed button
    document.body.classList.add('ai-quick-compose-closing');

    if (capsule) {
      capsule.classList.remove('is-expanded');
      capsule.classList.add('is-closing');
    }

    if (layer) {
      layer.classList.remove('state-quick-compose');
      layer.classList.add('state-closing');
    }

    // Smoothly glide mobile bottom nav selector back to original tab
    const restoreRoute = previousRoute || (root.spaRouter?.currentPage || root.currentPage || 'dashboard');
    updateMobileNav(restoreRoute);

    // Phase 2: After morph-back completes (560ms matches CSS transition duration),
    // clean up state and restore natural styles without hiding desktop button
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      closeTimer = null;
      if (surfaceState === 'closing') {
        surfaceState = 'closed';
        document.body.classList.remove('ai-quick-compose-closing');
        if (capsule) {
          capsule.classList.remove('is-closing');
        }
        if (layer) {
          layer.classList.remove('state-closing', 'state-workspace', 'state-transitioning');
          layer.classList.add('state-closed');
        }

        // Restore natural styling so next open displays normally
        resetVisuals();
      }
    }, 580);
  }

  function toggle() {
    if (surfaceState === 'quick-compose') {
      close();
    } else {
      open();
    }
  }

  // ── Suggestions Interaction ──
  function fillSuggestion(chip) {
    if (!chip) return;
    const text = chip.textContent.trim();
    const input = getInput();
    const sendBtn = getSendBtn();
    if (input) {
      input.value = text;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.setAttribute('data-active', 'true');
      }
      if (root.CreationSessionStore && root.CreationSessionStore.draft) {
        root.CreationSessionStore.draft.story = text;
      }
      if (typeof input.focus === 'function') {
        input.focus();
      }
      autoGrow();
    }
  }

  function toggleMoreSuggestions(event) {
    if (event) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }
    const tray = getSuggestionTray();
    const trigger = getSuggestionTrigger();
    if (!tray) return;
    const isHidden = (tray.style.display === 'none' || !tray.style.display);
    if (isHidden) {
      tray.style.display = 'flex';
      if (trigger) trigger.textContent = '－更少';
    } else {
      tray.style.display = 'none';
      if (trigger) trigger.textContent = '＋更多';
    }
  }

  // ── Route & State Synchronization ──
  function updateLayerState(page) {
    const isDashboard = isDashboardRoute(page);

    if (!isDashboard) {
      const capsule = getCapsule();
      if (capsule) {
        capsule.style.display = 'none';
        capsule.classList.remove('is-expanded');
      }
      const layer = getLayer();
      if (layer) {
        layer.style.display = 'none';
        layer.className = 'ai-creation-layer state-closed';
      }
      const trigger = getTrigger();
      if (trigger) {
        trigger.style.display = 'none';
      }
      if (surfaceState !== 'closed') {
        surfaceState = 'closed';
        close(true);
      }
      return;
    }

    ensureDOM();
    const trigger = getTrigger();
    const layer = getLayer();
    if (!trigger || !layer) return;

    const capsule = getCapsule();
    const mobGen = document.getElementById('mob-nav-generate');

    // On Dashboard pages, ensure trigger is visible
    trigger.style.display = '';

    if (page === 'generate') {
      // In /generate, the capsule trigger is hidden by the workspace
      if (capsule) {
        capsule.classList.remove('is-expanded');
        capsule.classList.add('hidden-by-workspace');
        capsule.style.setProperty('opacity', '0', 'important');
        capsule.style.setProperty('visibility', 'hidden', 'important');
        capsule.style.setProperty('pointer-events', 'none', 'important');
        capsule.style.setProperty('transition', 'none', 'important');
      }
      if (mobGen) {
        mobGen.classList.add('disabled-on-workspace');
        mobGen.setAttribute('aria-disabled', 'true');
        mobGen.style.setProperty('pointer-events', 'none', 'important');
      }
    } else {
      // If user navigated away from generate to another dashboard page, reset state & restore capsule
      if (mobGen) {
        mobGen.classList.remove('disabled-on-workspace');
        mobGen.removeAttribute('aria-disabled');
        mobGen.style.removeProperty('pointer-events');
      }
      if (surfaceState === 'workspace') {
        surfaceState = 'closed';
      }
      resetVisuals(page);
      if (capsule) {
        capsule.classList.remove('hidden-by-workspace');
        capsule.classList.remove('is-expanded');
        capsule.style.removeProperty('opacity');
        capsule.style.removeProperty('pointer-events');
        capsule.style.removeProperty('visibility');
        capsule.style.removeProperty('transform');
        capsule.style.removeProperty('display');
        capsule.style.removeProperty('transition');
      }
      mountCapsule();
    }
  }

  // ── Generation Progress Presentation ──
  function updateProgress(pct, isGenerating) {
    const gct = getTrigger();
    const gctProgressFill = document.getElementById('gct-progress-fill');
    const gctText = document.getElementById('gct-text');

    if (gct) {
      if (isGenerating) {
        gct.classList.add('is-generating');
        if (gctProgressFill) gctProgressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (gctText) gctText.textContent = `✦ 正在規劃… ${Math.round(pct)}%`;
      } else {
        gct.classList.remove('is-generating');
        if (gctProgressFill) gctProgressFill.style.width = '0%';
        if (pct >= 100) {
          if (gctText) gctText.textContent = '分鏡已完成';
          triggerPulse();
        } else {
          const draftStory = root.CreationSessionStore?.draft?.story || '';
          if (draftStory.trim().length > 0) {
            if (gctText) gctText.textContent = '繼續創作';
          } else {
            if (gctText) gctText.textContent = '新增分鏡';
          }
        }
      }
    }

    const pillBtn = document.getElementById('ai-pill-btn');
    const progressFill = document.getElementById('ai-pill-progress-fill');
    const pillText = document.getElementById('ai-pill-text');

    if (pillBtn) {
      if (isGenerating) {
        pillBtn.classList.add('is-generating');
        if (progressFill) progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (pillText) pillText.textContent = `✦ 正在規劃… ${Math.round(pct)}%`;
      } else {
        pillBtn.classList.remove('is-generating');
        if (progressFill) progressFill.style.width = '0%';
        if (pct >= 100) {
          if (pillText) pillText.textContent = '✦ 分鏡已完成';
        } else {
          const draftStory = root.CreationSessionStore?.draft?.story || '';
          if (draftStory.trim().length > 0) {
            if (pillText) pillText.textContent = '✦ 繼續創作';
          } else {
            if (pillText) pillText.textContent = '✦ AI 創作';
          }
        }
      }
    }

    const mobCircle = getCapsule() || document.getElementById('mob-nav-circle-wrap') || document.getElementById('mob-nav-capsule-wrap');
    const mobProgressFill = document.getElementById('gct-progress-fill') || document.getElementById('mob-circle-progress-fill') || document.getElementById('mob-pill-progress-fill');
    const mobCircleSpark = mobCircle ? mobCircle.querySelector('.mob-circle-spark') : null;
    const mobCircleText = document.getElementById('mob-circle-text') || document.getElementById('mob-pill-text');
    const mobItem = document.getElementById('mob-nav-generate');

    if (mobCircle) {
      if (isGenerating) {
        mobCircle.classList.add('is-generating');
        if (mobItem) mobItem.classList.add('is-generating');
        if (mobProgressFill) mobProgressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (mobCircleSpark) mobCircleSpark.style.display = 'none';
        if (mobCircleText) {
          mobCircleText.style.display = 'inline-block';
          mobCircleText.textContent = `${Math.round(pct)}%`;
        }
      } else {
        mobCircle.classList.remove('is-generating');
        if (mobItem) mobItem.classList.remove('is-generating');
        if (mobProgressFill) mobProgressFill.style.width = '0%';
        if (mobCircleSpark) mobCircleSpark.style.display = '';
        if (mobCircleText) {
          mobCircleText.style.display = 'none';
          mobCircleText.textContent = '';
        }
      }
    }
  }

  function triggerPulse() {
    const trigger = getTrigger() || document.getElementById('ai-pill-btn');
    if (trigger) {
      trigger.classList.remove('glow-pulse');
      raf(() => {
        trigger.classList.add('glow-pulse');
        setTimeout(() => {
          trigger.classList.remove('glow-pulse');
        }, 1800);
      });
    }
  }

  function updateCapsuleText(text) {
    const gctText = document.getElementById('gct-text');
    if (gctText && text) {
      gctText.textContent = text;
    }
    const pillText = document.getElementById('ai-pill-text');
    if (pillText && text) {
      pillText.textContent = text;
    }
  }

  // ── Submission Handler (Coordinates with Controller) ──
  function handleSubmit() {
    const input = getInput();
    const story = (input ? input.value.trim() : '') || (root.CreationSessionStore?.draft?.story || '');
    if (!story) return;

    if (root.CreationController && typeof root.CreationController.submitFromQuickCompose === 'function') {
      root.CreationController.submitFromQuickCompose(story);
    } else if (root.AICreationController && typeof root.AICreationController.submitToWorkspace === 'function') {
      root.AICreationController.submitToWorkspace();
    }
  }

  // ── Event Handlers Registry ──
  function onCapsuleClick(e) {
    const currentRoute = root.spaRouter?.currentPage || root.currentPage || 'dashboard';
    const capsule = getCapsule();
    if (currentRoute === 'generate' || (capsule && capsule.classList.contains('hidden-by-workspace'))) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (capsule && !capsule.classList.contains('is-expanded')) {
      if (!isMobileView()) {
        e.preventDefault();
        e.stopPropagation();
        open();
      }
    } else {
      e.stopPropagation();
    }
  }

  function onCloseBtnClick(e) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }

  function stopProp(e) {
    e.stopPropagation();
  }

  function onTouchMoveContainer(e) {
    e.stopPropagation();
    if (e.cancelable && e.type === 'touchmove') e.preventDefault();
  }

  function onFocusFieldClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (Date.now() - (lastOpenTime || 0) < 450) return;
    if (root.__justHandledPointerNav && (Date.now() - root.__justHandledPointerNav < 450)) return;
    close();
  }

  function onFocusFieldTouchMove(e) {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
  }

  function onCapsulePointer(e) {
    const capsule = getCapsule();
    if (capsule && capsule.classList.contains('is-expanded')) {
      e.stopPropagation();
    }
  }

  function onCapsuleMove(e) {
    const capsule = getCapsule();
    if (capsule && capsule.classList.contains('is-expanded')) {
      e.stopPropagation();
      if (e.cancelable && e.type === 'touchmove') e.preventDefault();
    }
  }

  function onLayerClick(e) {
    if (surfaceState === 'quick-compose') {
      if (!e.target.closest('#global-create-capsule, #quick-creation-container')) {
        e.preventDefault();
        close();
      }
    }
  }

  function onInputFocus() {
    if (isMobileView()) {
      document.body.classList.add('ai-keyboard-open');
    }
  }

  function onInputBlur() {
    if (isMobileView()) {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = null;
        const qcInput = getInput();
        if (document.activeElement !== qcInput) {
          document.body.classList.remove('ai-keyboard-open');
        }
      }, 100);
    }
  }

  function onInputInput() {
    const qcInput = getInput();
    const qcSendBtn = getSendBtn();
    if (!qcInput) return;
    const val = qcInput.value.trim();
    const hasVal = val.length > 0;
    if (qcSendBtn) {
      qcSendBtn.disabled = !hasVal;
      qcSendBtn.setAttribute('data-active', hasVal ? 'true' : 'false');
    }
    if (root.CreationSessionStore && root.CreationSessionStore.draft) {
      root.CreationSessionStore.draft.story = qcInput.value;
    }
    autoGrow();
  }

  function onInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const qcInput = getInput();
      if (qcInput && qcInput.value.trim()) {
        handleSubmit();
      }
    }
  }

  function onSendBtnClick(e) {
    e.preventDefault();
    handleSubmit();
  }

  function onDocumentKeyDown(e) {
    if (e.key === 'Escape') {
      if (surfaceState === 'quick-compose') {
        close();
      } else if (surfaceState === 'workspace') {
        if (root.CreationController?.closeWorkspace) {
          root.CreationController.closeWorkspace();
        } else if (root.AICreationController?.closeWorkspace) {
          root.AICreationController.closeWorkspace();
        }
      }
    }
  }

  function onWindowResize() {
    mountCapsule();
  }

  // ── Listeners Lifecycle ──
  function bindEvents() {
    const capsule = getCapsule();
    const qcCloseBtn = getCloseBtn();
    const qcContainer = getContainer();
    const focusField = getFocusField();
    const layer = getLayer();
    const qcInput = getInput();
    const qcSendBtn = getSendBtn();

    const allPresent = Boolean(
      capsule &&
      qcCloseBtn &&
      qcContainer &&
      focusField &&
      layer &&
      qcInput &&
      qcSendBtn
    );

    if (!allPresent) {
      isBound = false;
      return false;
    }

    if (
      isBound &&
      boundCapsule === capsule &&
      boundCloseBtn === qcCloseBtn &&
      boundContainer === qcContainer &&
      boundFocusField === focusField &&
      boundLayer === layer &&
      boundInput === qcInput &&
      boundSendBtn === qcSendBtn
    ) {
      return true;
    }

    unbindEvents();

    capsule.addEventListener('click', onCapsuleClick);
    ['pointerdown', 'mousedown', 'touchstart'].forEach(evt => {
      capsule.addEventListener(evt, onCapsulePointer);
    });
    ['pointermove', 'touchmove', 'mousemove'].forEach(evt => {
      capsule.addEventListener(evt, onCapsuleMove, { passive: false });
    });

    qcCloseBtn.addEventListener('click', onCloseBtnClick);

    ['pointerdown', 'mousedown'].forEach(evt => {
      qcContainer.addEventListener(evt, stopProp);
    });
    ['pointermove', 'touchmove', 'mousemove'].forEach(evt => {
      qcContainer.addEventListener(evt, onTouchMoveContainer, { passive: false });
    });
    qcContainer.addEventListener('wheel', stopProp);

    focusField.addEventListener('click', onFocusFieldClick);
    focusField.addEventListener('touchmove', onFocusFieldTouchMove, { passive: false });
    focusField.addEventListener('pointermove', stopProp);

    layer.addEventListener('click', onLayerClick);

    qcInput.addEventListener('focus', onInputFocus);
    qcInput.addEventListener('blur', onInputBlur);
    qcInput.addEventListener('input', onInputInput);
    qcInput.addEventListener('keydown', onInputKeyDown);

    qcSendBtn.addEventListener('click', onSendBtnClick);

    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', onDocumentKeyDown);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onWindowResize);
    }

    boundCapsule = capsule;
    boundCloseBtn = qcCloseBtn;
    boundContainer = qcContainer;
    boundFocusField = focusField;
    boundLayer = layer;
    boundInput = qcInput;
    boundSendBtn = qcSendBtn;
    isBound = true;
    return true;
  }

  function unbindEvents() {
    const capsule = boundCapsule || getCapsule();
    const qcCloseBtn = boundCloseBtn || getCloseBtn();
    const qcContainer = boundContainer || getContainer();
    const focusField = boundFocusField || getFocusField();
    const layer = boundLayer || getLayer();
    const qcInput = boundInput || getInput();
    const qcSendBtn = boundSendBtn || getSendBtn();

    if (capsule) {
      capsule.removeEventListener('click', onCapsuleClick);
      ['pointerdown', 'mousedown', 'touchstart'].forEach(evt => {
        capsule.removeEventListener(evt, onCapsulePointer);
      });
      ['pointermove', 'touchmove', 'mousemove'].forEach(evt => {
        capsule.removeEventListener(evt, onCapsuleMove);
      });
      if (onWidthDoneHandler) {
        capsule.removeEventListener('transitionend', onWidthDoneHandler);
        onWidthDoneHandler = null;
      }
    }

    if (qcCloseBtn) {
      qcCloseBtn.removeEventListener('click', onCloseBtnClick);
    }

    if (qcContainer) {
      ['pointerdown', 'mousedown'].forEach(evt => {
        qcContainer.removeEventListener(evt, stopProp);
      });
      ['pointermove', 'touchmove', 'mousemove'].forEach(evt => {
        qcContainer.removeEventListener(evt, onTouchMoveContainer);
      });
      qcContainer.removeEventListener('wheel', stopProp);
    }

    if (focusField) {
      focusField.removeEventListener('click', onFocusFieldClick);
      focusField.removeEventListener('touchmove', onFocusFieldTouchMove);
      focusField.removeEventListener('pointermove', stopProp);
    }

    if (layer) {
      layer.removeEventListener('click', onLayerClick);
    }

    if (qcInput) {
      qcInput.removeEventListener('focus', onInputFocus);
      qcInput.removeEventListener('blur', onInputBlur);
      qcInput.removeEventListener('input', onInputInput);
      qcInput.removeEventListener('keydown', onInputKeyDown);
    }

    if (qcSendBtn) {
      qcSendBtn.removeEventListener('click', onSendBtnClick);
    }

    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', onDocumentKeyDown);
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onWindowResize);
    }

    boundCapsule = null;
    boundCloseBtn = null;
    boundContainer = null;
    boundFocusField = null;
    boundLayer = null;
    boundInput = null;
    boundSendBtn = null;
    isBound = false;
  }

  // ── Public Lifecycle ──
  function mount() {
    ensureDOM();
    mountCapsule();
    bindEvents();
    isMounted = true;
    return {
      unmount: () => destroy()
    };
  }

  function reset() {
    close(true);
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = null;
    const input = getInput();
    const send = getSendBtn();
    if (input) input.value = '';
    if (send) {
      send.disabled = true;
      send.setAttribute('data-active', 'false');
    }
    previousRoute = null;
    previousScrollY = 0;
    lastOpenTime = 0;
    updateProgress(0, false);
  }

  function destroy() {
    close(true);
    clearMilestoneTimers();
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    unbindEvents();
    const tester = document.getElementById('qc-height-tester');
    if (tester) {
      tester.remove();
    }
    isMounted = false;
  }

  // ── Public Module Interface ──
  const QuickCompose = {
    mount,
    reset,
    destroy,
    unmount: destroy,
    ensureDOM,
    mountCapsule,
    open,
    expand: open,
    close,
    collapse: close,
    toggle,
    resetVisuals,
    updateLayerState,
    syncWithRoute: updateLayerState,
    autoGrow,
    getTargetWidth,
    measureScrollHeight,
    fillSuggestion,
    toggleMoreSuggestions,
    updateProgress,
    triggerPulse,
    updateCapsuleText,
    bindEvents,
    unbindEvents,

    get state() { return surfaceState; },
    set state(val) { surfaceState = val; },
    get lastOpenTime() { return lastOpenTime; },
    set lastOpenTime(val) { lastOpenTime = val; },
    get previousRoute() { return previousRoute; },
    set previousRoute(val) { previousRoute = val; },
    get previousScrollY() { return previousScrollY; },
    set previousScrollY(val) { previousScrollY = val; },
    get isMounted() { return isMounted; },
    get isExpanded() {
      const capsule = getCapsule();
      return !!(capsule && capsule.classList.contains('is-expanded'));
    },
    get isOpen() {
      return surfaceState === 'quick-compose';
    }
  };

  root.QuickCompose = QuickCompose;

  // Compatibility bridges: inline QC suggestion handlers and task progress are live callers.
  // Keep lifecycle aliases for standalone/legacy HTML and existing component consumers.
  root.autoGrowQCInput = autoGrow;
  root.fillQuickSugg = fillSuggestion;
  root.toggleQuickMoreSuggestions = toggleMoreSuggestions;
  root.mountAICreationCapsule = mountCapsule;
  root.ensureAICreationLayerDOM = ensureDOM;
  root.ensureAIDockDOM = ensureDOM;
  root.updateAICreationLayerState = updateLayerState;
  root.updateAIDockState = updateLayerState;
  root.triggerCapsulePulse = triggerPulse;
  root.updateGlobalPillProgress = updateProgress;
  root.updateCapsuleText = updateCapsuleText;

})(typeof window !== 'undefined' ? window : globalThis);
