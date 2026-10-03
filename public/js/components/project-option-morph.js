/**
 * StoryboardAI — Project Option Morph Controller v4
 * 
 * 負責專案卡片 Option Menu 的 Continuous Overlap Standard Morph 動畫與 Portal 互動：
 * - open / close / toggle 動畫狀態機 (480ms open, 440ms close)
 * - 全域 Fixed Overlay / Portal 生命週期與幾何定位
 * - 觸發按鈕幾何即時測量與動態軌跡計算 (Quadratic Bézier + Material cubic-bezier(.4, 0, .2, 1))
 * - 單例 Session 管理 (Singleton: 同一時間僅允許單一 active session)
 * - 點擊外部 / 滾動 / 視窗縮放 / Escape 鍵關閉與即時清理
 * - Action 委派 (委派至 ProjectActions / 回呼，不含 CRUD 本體)
 * 
 * 符合 StoryboardAI Design System & P4-3 規範
 */

(function (root) {
  'use strict';

  // Synchronized with CSS .project-option-btn (width: 48px, height: 36px)
  const OPTION_BTN_WIDTH = 48;
  const OPTION_BTN_HEIGHT = 36;

  let activeMorphSession = null;

  // High-precision cubic-bezier solver for standard Material curve cubic-bezier(.4, 0, .2, 1)
  function createCubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;

    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;

    function sampleCurveX(t) {
      return ((ax * t + bx) * t + cx) * t;
    }
    function sampleCurveY(t) {
      return ((ay * t + by) * t + cy) * t;
    }
    function sampleCurveDerivativeX(t) {
      return (3 * ax * t + 2 * bx) * t + cx;
    }

    function solveCurveX(x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const currentX = sampleCurveX(t) - x;
        if (Math.abs(currentX) < 1e-6) return t;
        const dX = sampleCurveDerivativeX(t);
        if (Math.abs(dX) < 1e-6) break;
        t -= currentX / dX;
      }
      let t0 = 0, t1 = 1;
      t = x;
      while (t0 < t1) {
        const currentX = sampleCurveX(t);
        if (Math.abs(currentX - x) < 1e-6) return t;
        if (x > currentX) t0 = t;
        else t1 = t;
        t = (t1 + t0) / 2;
      }
      return t;
    }

    return function (x) {
      return sampleCurveY(solveCurveX(x));
    };
  }

  const easeStandard = createCubicBezier(0.4, 0, 0.2, 1);

  function getQuadraticBezierPoint(p0, p1, p2, t) {
    const inv = 1 - t;
    return {
      x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
      y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y
    };
  }

  // Session-bound window listeners
  let globalListenersAttached = false;
  function attachGlobalListeners() {
    if (globalListenersAttached) return;
    globalListenersAttached = true;
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    window.addEventListener('resize', onWindowResize, { passive: true });
    window.addEventListener('orientationchange', onWindowResize, { passive: true });
    window.addEventListener('keydown', onWindowKeydown);
  }

  function detachGlobalListeners() {
    if (!globalListenersAttached) return;
    globalListenersAttached = false;
    window.removeEventListener('scroll', onWindowScroll);
    window.removeEventListener('resize', onWindowResize);
    window.removeEventListener('orientationchange', onWindowResize);
    window.removeEventListener('keydown', onWindowKeydown);
  }

  function onWindowScroll() {
    if (activeMorphSession) close('scroll');
  }

  function onWindowResize() {
    if (activeMorphSession) close('resize');
  }

  function onWindowKeydown(e) {
    if (e.key === 'Escape' && activeMorphSession) {
      close('escape');
    }
  }

  /**
   * 立即拆除 Session DOM 與狀態，防止任何殘留
   */
  function teardownSession(session) {
    if (!session || session.cleanedUp) return;
    session.cleanedUp = true;

    if (session.rafId) {
      cancelAnimationFrame(session.rafId);
      session.rafId = null;
    }

    // 復原 trigger button 與 card 樣式
    if (session.triggerBtn && session.triggerBtn.classList) {
      session.triggerBtn.classList.remove('is-hidden-for-morph');
    }
    if (session.card && session.card.classList) {
      session.card.classList.remove('is-menu-open');
      const isHovered = typeof session.card.matches === 'function' ? session.card.matches(':hover') : false;
      if (!isHovered) {
        session.card.classList.remove('is-expanded');
      }
    }

    // 移除 overlay DOM
    const overlayParent = session.overlay?.parentNode || session.overlay?.parentElement;
    if (overlayParent && typeof overlayParent.removeChild === 'function') {
      overlayParent.removeChild(session.overlay);
    } else if (session.overlay && typeof session.overlay.remove === 'function') {
      session.overlay.remove();
    }

    detachGlobalListeners();
  }

  /**
   * 關閉 Option Morph 選單
   * @param {string|Function} [reasonOrComplete]
   * @param {Function} [onComplete]
   */
  function close(reasonOrComplete, onComplete) {
    let reason = null;
    let completeCb = null;

    if (typeof reasonOrComplete === 'function') {
      completeCb = reasonOrComplete;
    } else {
      reason = reasonOrComplete;
      completeCb = onComplete;
    }

    if (!activeMorphSession) {
      if (typeof completeCb === 'function') completeCb();
      return;
    }

    const session = activeMorphSession;
    activeMorphSession = null;

    if (session.rafId) {
      cancelAnimationFrame(session.rafId);
      session.rafId = null;
    }

    // 即時關閉情況（路由切換、頁面卸載、組件銷毀）：不執行 440ms 動畫，立即釋放
    if (reason === 'navigation' || reason === 'unmount' || reason === 'destroy' || reason === 'immediate') {
      teardownSession(session);
      if (typeof completeCb === 'function') completeCb();
      return;
    }

    const { overlay, menu, morphIcon, triggerBtn, p2, targetBounds } = session;
    const { targetLeft, targetTop, expandedWidth, expandedHeight } = targetBounds;

    // Recalculate target p0 live from triggerBtn rect to guarantee 100% zero-jump alignment
    let p0_target = session.p0;
    if (triggerBtn && typeof triggerBtn.getBoundingClientRect === 'function') {
      try {
        const liveRect = triggerBtn.getBoundingClientRect();
        if (liveRect && (liveRect.width > 0 || liveRect.height > 0 || liveRect.top > 0 || liveRect.left > 0)) {
          p0_target = {
            x: liveRect.left + liveRect.width / 2,
            y: liveRect.top + liveRect.height / 2
          };
        }
      } catch (_) {}
    }

    // Return trajectory control point (gentle upward arc ~14px)
    const p1_return = {
      x: (p0_target.x + p2.x) / 2,
      y: Math.min(p0_target.y, p2.y) - 14
    };

    const finalCenter = {
      x: targetLeft + expandedWidth / 2,
      y: targetTop + expandedHeight / 2
    };

    if (menu.classList) {
      menu.classList.remove('is-settled');
      menu.classList.remove('is-content-visible');
      menu.classList.add('is-items-collapsing');
    }

    const closeStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const closeTotalDuration = 440; // ms

    function stepClose(now) {
      const currentTime = (typeof now === 'number' && !isNaN(now))
        ? now
        : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
      const elapsed = currentTime - closeStart;

      // 1. Unified Flight Position from p2 to p0_target (30 - 230ms, arrives at center at 230ms)
      let flightPt;
      if (elapsed <= 30) {
        flightPt = p2;
      } else if (elapsed <= 230) {
        const fp = (elapsed - 30) / 200;
        const fEase = easeStandard(fp);
        flightPt = getQuadraticBezierPoint(p2, p1_return, p0_target, fEase);
      } else {
        flightPt = p0_target;
      }

      // 2. Geometry & Scale
      let curW, curH, curCenterX, curCenterY, curRadius, curScale = 1;

      if (elapsed < 40) {
        // Phase A1: Menu items start reverse stagger blur/fade while Surface stays full size
        curW = expandedWidth;
        curH = expandedHeight;
        curRadius = 17;
        curCenterX = finalCenter.x;
        curCenterY = finalCenter.y;
        if (morphIcon) morphIcon.style.opacity = '0';
      } else if (elapsed < 180) {
        // Phase A2: Items reach 60-70% fade; Surface visibly contracts to 20px dot (40 - 180ms, dur: 140ms)
        const cp = (elapsed - 40) / 140;
        const cEase = easeStandard(cp);
        const invEase = 1 - cEase;

        curW = 20 + (expandedWidth - 20) * invEase;
        curH = 20 + (expandedHeight - 20) * invEase;
        curRadius = 50 - 33 * invEase;

        curCenterX = flightPt.x + (finalCenter.x - p2.x) * invEase;
        curCenterY = flightPt.y + (finalCenter.y - p2.y) * invEase;

        if (morphIcon) morphIcon.style.opacity = '0';
      } else if (elapsed < 230) {
        // Phase B: Pure 20px Dot glides the remaining flight path into p0_target (180 - 230ms)
        curW = 20;
        curH = 20;
        curRadius = 50;
        curCenterX = flightPt.x;
        curCenterY = flightPt.y;

        if (morphIcon) morphIcon.style.opacity = '0';
      } else if (elapsed < closeTotalDuration) {
        // Phase C: Dot is now at p0_target; dedicate full 210ms (230 - 440ms) to steady growth
        const rp = (elapsed - 230) / 210;
        const rEase = easeStandard(rp);

        curW = 20 + (OPTION_BTN_WIDTH - 20) * rEase;
        curH = 20 + (OPTION_BTN_HEIGHT - 20) * rEase;
        curRadius = 9999;
        curCenterX = p0_target.x;
        curCenterY = p0_target.y;

        // Icon emerges when Button is ~35-45% grown (at ~26px), coalescing from inside
        const iconStart = 0.35;
        if (morphIcon) {
          if (rEase <= iconStart) {
            morphIcon.style.opacity = '0';
            morphIcon.style.filter = 'blur(4px)';
            morphIcon.style.transform = 'scale(0.7)';
          } else {
            const ip = (rEase - iconStart) / (1 - iconStart);
            const iEase = easeStandard(ip);
            morphIcon.style.opacity = iEase.toFixed(2);
            const blurVal = (4 * (1 - iEase)).toFixed(1);
            morphIcon.style.filter = blurVal > 0.1 ? `blur(${blurVal}px)` : 'none';
            morphIcon.style.transform = `scale(${(0.7 + 0.3 * iEase).toFixed(3)})`;
          }
        }

        // Calm critically-damped settle (<= 1.004)
        const bump = Math.sin(rEase * Math.PI) * Math.max(0, 1 - 0.5 * rEase);
        curScale = 1 + 0.004 * bump;
      } else {
        curW = OPTION_BTN_WIDTH;
        curH = OPTION_BTN_HEIGHT;
        curRadius = 9999;
        curCenterX = p0_target.x;
        curCenterY = p0_target.y;
        curScale = 1;
        if (morphIcon) {
          morphIcon.style.opacity = '1';
          morphIcon.style.filter = 'none';
          morphIcon.style.transform = 'scale(1)';
        }
      }

      if (menu && menu.style) {
        menu.style.width = `${curW.toFixed(1)}px`;
        menu.style.height = `${curH.toFixed(1)}px`;
        menu.style.left = `${(curCenterX - curW / 2).toFixed(1)}px`;
        menu.style.top = `${(curCenterY - curH / 2).toFixed(1)}px`;
        menu.style.borderRadius = (curRadius >= 45 || elapsed >= 230) ? '9999px' : `${curRadius.toFixed(1)}%`;
        menu.style.transform = `scale(${curScale.toFixed(4)})`;
      }

      if (elapsed < closeTotalDuration) {
        session.rafId = requestAnimationFrame(stepClose);
        return;
      }

      // Cleanup
      teardownSession(session);
      if (typeof completeCb === 'function') completeCb();
    }

    session.rafId = requestAnimationFrame(stepClose);
  }

  /**
   * 開啟 Option Morph 選單
   * @param {HTMLElement} triggerBtn 
   * @param {Object} project 
   * @param {HTMLElement} card 
   * @param {Object|boolean} options 
   */
  function open(triggerBtn, project, card, options = {}) {
    if (!triggerBtn || !project) return;

    // 正規化參數：相容舊式 open(triggerBtn, project, card, isHistoryPage, refreshCallback)
    let opts = {};
    if (typeof options === 'boolean') {
      opts = {
        isHistoryPage: options,
        refreshCallback: arguments[4]
      };
    } else if (options && typeof options === 'object') {
      opts = { ...options };
    }

    // 1. Singleton / Active Session 處理
    if (activeMorphSession) {
      const wasSame = activeMorphSession.triggerBtn === triggerBtn;
      if (wasSame) {
        close('toggle');
        return;
      }
      teardownSession(activeMorphSession);
      activeMorphSession = null;
    }

    const rect = triggerBtn.getBoundingClientRect ? triggerBtn.getBoundingClientRect() : { left: 0, top: 0, width: OPTION_BTN_WIDTH, height: OPTION_BTN_HEIGHT, right: OPTION_BTN_WIDTH };
    const p0 = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    // 2. 建立 Global Fixed Overlay & Menu DOM
    const overlay = document.createElement('div');
    overlay.className = 'project-option-overlay is-active';

    const menu = document.createElement('div');
    menu.className = 'global-project-option-menu';
    menu.style.width = `${OPTION_BTN_WIDTH}px`;
    menu.style.height = `${OPTION_BTN_HEIGHT}px`;
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.top}px`;
    menu.style.borderRadius = '9999px';

    // Morphing Icon (••━)
    const morphIcon = document.createElement('span');
    morphIcon.className = 'morph-icon';
    morphIcon.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="5" r="1.5" />
        <circle cx="8" cy="11" r="1.5" />
      </svg>
    `;

    const isHistory = Boolean(opts.isHistoryPage || opts.isHistory || project.is_deleted);

    // Menu Content
    const menuContent = document.createElement('div');
    menuContent.className = 'morph-menu-content';
    if (isHistory) {
      menuContent.innerHTML = `
        <button class="morph-item restore" type="button" data-action="restore">
          <span class="morph-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </span>
          <span>還原分鏡</span>
        </button>
      `;
    } else {
      menuContent.innerHTML = `
        <button class="morph-item rename" type="button" data-action="rename">
          <span class="morph-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </span>
          <span>重新命名</span>
        </button>
        <button class="morph-item duplicate" type="button" data-action="duplicate">
          <span class="morph-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </span>
          <span>複製分鏡</span>
        </button>
        <button class="morph-item export" type="button" data-action="export">
          <span class="morph-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </span>
          <span>匯出 JSON</span>
        </button>
        <div class="morph-divider"></div>
        <button class="morph-item delete" type="button" data-action="delete">
          <span class="morph-item-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </span>
          <span>刪除分鏡</span>
        </button>
      `;
    }

    menu.appendChild(morphIcon);
    menu.appendChild(menuContent);
    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    // 3. 測量展開高度
    let expandedHeight = isHistory ? 48 : 178;
    try {
      const measureWrap = document.createElement('div');
      measureWrap.className = 'global-project-option-menu';
      measureWrap.style.cssText = 'position:fixed; left:-9999px; top:-9999px; width:156px; height:auto; visibility:hidden; opacity:0; pointer-events:none;';
      const cloneMeasure = menuContent.cloneNode(true);
      cloneMeasure.style.position = 'static';
      cloneMeasure.style.opacity = '1';
      cloneMeasure.style.pointerEvents = 'none';
      measureWrap.appendChild(cloneMeasure);
      document.body.appendChild(measureWrap);
      const measuredH = measureWrap.getBoundingClientRect ? measureWrap.getBoundingClientRect().height : 0;
      if (measuredH > 0) {
        expandedHeight = Math.ceil(measuredH);
      }
      document.body.removeChild(measureWrap);
    } catch (_) {}

    const expandedWidth = 156;
    let targetTop = rect.top;
    let targetLeft = rect.right - expandedWidth;

    const viewportH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 800;
    if (targetTop + expandedHeight > viewportH - 12) {
      targetTop = viewportH - expandedHeight - 12;
    }
    if (targetTop < 12) targetTop = 12;
    if (targetLeft < 12) targetLeft = 12;

    const targetBounds = { targetLeft, targetTop, expandedWidth, expandedHeight };

    // Target expansion center P2: Biased towards bottom-right
    const p2 = {
      x: targetLeft + expandedWidth * 0.60,
      y: targetTop + expandedHeight * 0.35
    };

    // Parabolic control point P1 with subtle natural arc
    const p1 = {
      x: (p0.x + p2.x) / 2 + 2,
      y: (p0.y + p2.y) / 2 - 4
    };

    // Final bounding box center
    const finalCenter = {
      x: targetLeft + expandedWidth / 2,
      y: targetTop + expandedHeight / 2
    };

    // Hide original button in card
    if (triggerBtn.classList) {
      triggerBtn.classList.add('is-hidden-for-morph');
    }
    if (card && card.classList) {
      card.classList.add('is-menu-open', 'is-expanded');
    }

    const session = {
      card,
      overlay,
      menu,
      morphIcon,
      triggerBtn,
      p0,
      p1,
      p2,
      finalCenter,
      targetBounds,
      rafId: null,
      cleanedUp: false
    };
    activeMorphSession = session;

    // Attach scroll, resize, escape listeners
    attachGlobalListeners();

    // 4. CONTINUOUS OVERLAP MORPH ANIMATION (0 - 480ms)
    const openStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    let contentTriggered = false;

    function stepOpen(now) {
      if (activeMorphSession !== session) return;

      const currentTime = (typeof now === 'number' && !isNaN(now))
        ? now
        : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
      const elapsed = currentTime - openStart;

      // 1. Icon dissolves immediately without delay (0 - 70ms)
      if (elapsed <= 70) {
        const ip = easeStandard(elapsed / 70);
        morphIcon.style.opacity = (1 - ip).toFixed(2);
        morphIcon.style.filter = `blur(${(4 * ip).toFixed(1)}px)`;
        morphIcon.style.transform = `scale(${(1 - 0.3 * ip).toFixed(3)})`;
      } else {
        morphIcon.style.opacity = '0';
        morphIcon.style.filter = 'blur(4px)';
      }

      // 2. Flight Position (30 - 260ms, dur: 230ms)
      let flightPt;
      if (elapsed < 30) {
        flightPt = p0;
      } else if (elapsed <= 260) {
        const fp = (elapsed - 30) / 230;
        const fEase = easeStandard(fp);
        flightPt = getQuadraticBezierPoint(p0, p1, p2, fEase);
      } else {
        flightPt = p2;
      }

      // 3. Geometry (Width, Height, Center, Radius)
      let curW, curH, curCenterX, curCenterY, curRadius;

      if (elapsed < 80) {
        // Initial button shrinking phase (48x36px -> 20x20px)
        const sp = easeStandard(elapsed / 80);
        curW = OPTION_BTN_WIDTH - (OPTION_BTN_WIDTH - 20) * sp;
        curH = OPTION_BTN_HEIGHT - (OPTION_BTN_HEIGHT - 20) * sp;
        curCenterX = flightPt.x;
        curCenterY = flightPt.y;
        curRadius = 9999;
      } else if (elapsed < 90) {
        // 20px Dot at start of expansion
        curW = 20;
        curH = 20;
        curCenterX = flightPt.x;
        curCenterY = flightPt.y;
        curRadius = 9999;
      } else if (elapsed < 350) {
        // Surface expands in mid-air (90 - 350ms, dur: 260ms)
        const ep = (elapsed - 90) / 260;
        const eEase = easeStandard(ep);

        curW = 20 + (expandedWidth - 20) * eEase;
        curH = 20 + (expandedHeight - 20) * eEase;
        curRadius = 24 - 7 * eEase;

        curCenterX = flightPt.x + (finalCenter.x - p2.x) * eEase;
        curCenterY = flightPt.y + (finalCenter.y - p2.y) * eEase;
      } else {
        // Geometry locked at target bounds
        curW = expandedWidth;
        curH = expandedHeight;
        curCenterX = finalCenter.x;
        curCenterY = finalCenter.y;
        curRadius = 17;
      }

      if (menu && menu.style) {
        menu.style.width = `${curW.toFixed(1)}px`;
        menu.style.height = `${curH.toFixed(1)}px`;
        menu.style.left = `${(curCenterX - curW / 2).toFixed(1)}px`;
        menu.style.top = `${(curCenterY - curH / 2).toFixed(1)}px`;
        menu.style.borderRadius = (elapsed >= 350) ? '17px' : (elapsed < 90 ? '9999px' : `${curRadius.toFixed(1)}px`);
      }

      // 4. Trigger Menu Items at ~290ms
      if (elapsed >= 290 && !contentTriggered) {
        contentTriggered = true;
        if (menu.classList) menu.classList.add('is-content-visible');
      }

      // 5. Ultra-subtle Inertia Settle (350 - 480ms)
      if (elapsed >= 350 && elapsed < 480) {
        const sp = (elapsed - 350) / 130;
        const bump = Math.sin(sp * Math.PI) * Math.max(0, 1 - 0.25 * sp);
        const settleScale = 1 + 0.010 * bump;
        if (menu.style) menu.style.transform = `scale(${settleScale.toFixed(4)})`;
      } else if (elapsed >= 480) {
        if (menu.style) menu.style.transform = 'scale(1)';
        if (menu.classList) menu.classList.add('is-settled');
        session.rafId = null;
        return;
      } else {
        if (menu.style) menu.style.transform = 'scale(1)';
      }

      session.rafId = requestAnimationFrame(stepOpen);
    }

    session.rafId = requestAnimationFrame(stepOpen);

    // 5. Event handling: outside click / backdrop
    overlay.addEventListener('pointerdown', (e) => {
      if (menu.contains ? !menu.contains(e.target) : e.target === overlay) {
        if (e && typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
        close('outside_click');
      }
    });

    // 6. Menu item action clicks
    const items = menu.querySelectorAll ? menu.querySelectorAll('.morph-item') : [];
    items.forEach(item => {
      item.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
        const action = item.dataset?.action;
        close('action', () => {
          const envGlobal = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : root));
          const nodeGlobal = typeof global !== 'undefined' ? global : null;
          const cb = () => {
            if (typeof opts.refreshCallback === 'function') opts.refreshCallback();
            const updateFn = envGlobal.updateSidebarProjects || (nodeGlobal ? nodeGlobal.updateSidebarProjects : null);
            if (typeof updateFn === 'function') {
              updateFn();
            }
          };

          const actions = opts.projectActions || envGlobal.ProjectActions || (nodeGlobal ? nodeGlobal.ProjectActions : null);
          if (action === 'rename') {
            const fn = (actions && typeof actions.renameProject === 'function')
              ? actions.renameProject
              : (typeof envGlobal.renameProject === 'function' ? envGlobal.renameProject : (nodeGlobal ? nodeGlobal.renameProject : null));
            if (typeof fn === 'function') fn(project, card, cb);
          } else if (action === 'duplicate') {
            const fn = (actions && typeof actions.duplicateProject === 'function')
              ? actions.duplicateProject
              : (typeof envGlobal.duplicateProject === 'function' ? envGlobal.duplicateProject : (nodeGlobal ? nodeGlobal.duplicateProject : null));
            if (typeof fn === 'function') fn(project, card, cb);
          } else if (action === 'export') {
            const fn = (actions && typeof actions.exportProject === 'function')
              ? actions.exportProject
              : (typeof envGlobal.exportProject === 'function' ? envGlobal.exportProject : (nodeGlobal ? nodeGlobal.exportProject : null));
            if (typeof fn === 'function') fn(project);
          } else if (action === 'delete') {
            const fn = (actions && typeof actions.deleteProject === 'function')
              ? actions.deleteProject
              : (typeof envGlobal.deleteProject === 'function' ? envGlobal.deleteProject : (nodeGlobal ? nodeGlobal.deleteProject : null));
            if (typeof fn === 'function') fn(project, card, cb);
          } else if (action === 'restore') {
            const fn = (actions && typeof actions.restoreProject === 'function')
              ? actions.restoreProject
              : (typeof envGlobal.restoreProject === 'function' ? envGlobal.restoreProject : (nodeGlobal ? nodeGlobal.restoreProject : null));
            if (typeof fn === 'function') fn(project, card, cb);
          }
        });
      });
    });
  }

  function isOpen() {
    return Boolean(activeMorphSession);
  }

  function destroy() {
    close('destroy');
  }

  const ProjectOptionMorph = {
    open,
    close,
    isOpen,
    destroy
  };

  // Mount on global window / root
  const rootObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : root);

  function createBridges(target) {
    if (!target) return;
    target.ProjectOptionMorph = ProjectOptionMorph;
    target.openGlobalOptionMorph = function openGlobalOptionMorph(triggerBtn, p, card, isHistoryPage, refreshCallback) {
      return ProjectOptionMorph.open(triggerBtn, p, card, {
        isHistoryPage: Boolean(isHistoryPage),
        refreshCallback
      });
    };
    target.closeGlobalOptionMorph = function closeGlobalOptionMorph(onComplete) {
      return ProjectOptionMorph.close(null, onComplete);
    };
  }

  createBridges(rootObj);
  if (typeof global !== 'undefined' && global !== rootObj) {
    createBridges(global);
  }
  if (typeof window !== 'undefined' && window !== rootObj) {
    createBridges(window);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectOptionMorph;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
