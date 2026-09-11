// Dashboard JS - Standalone & Mobile Gesture Controls

(function () {
  let lastToggleTime = 0;
  let lastOpenTime = 0;

  function isMobileView() {
    return window.matchMedia('(max-width: 768px), (max-width: 767px) and (orientation: portrait), (max-width: 480px)').matches;
  }

  function getBackgroundDepthTargets() {
    const targets = [];
    const pageMain = document.getElementById('page-main');
    if (pageMain) targets.push(pageMain);
    return targets;
  }

  function setBackgroundDepthProgress(progress) {
    if (!isMobileView()) return;
    // progress: 1 = fully open (scale 0.95), 0 = fully closed (scale 1.0)
    const bgTargets = getBackgroundDepthTargets();
    const scale = (1.0 - progress * 0.05).toFixed(4);
    const radius = (progress * 18).toFixed(1) + 'px';
    bgTargets.forEach(el => {
      el.classList.remove('bg-depth-animating');
      el.style.setProperty('transform', `scale(${scale})`, 'important');
      el.style.setProperty('border-radius', `${radius} ${radius} 0 0`, 'important');
      el.style.setProperty('overflow', 'hidden', 'important');
    });
  }

  function animateBackgroundDepth(isOpen, duration = 0.32) {
    if (!isMobileView()) return;
    const bgTargets = getBackgroundDepthTargets();
    bgTargets.forEach(el => {
      el.style.setProperty('transition', `transform ${duration}s cubic-bezier(0.16, 1, 0.3, 1), border-radius ${duration}s ease`, 'important');
      if (isOpen) {
        el.classList.add('bg-depth-scaled');
        el.style.setProperty('transform', 'scale(0.95)', 'important');
        el.style.setProperty('border-radius', '18px 18px 0 0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
      } else {
        el.classList.remove('bg-depth-scaled');
        el.style.setProperty('transform', 'scale(1)', 'important');
        el.style.setProperty('border-radius', '0px', 'important');
      }
    });
    setTimeout(() => {
      bgTargets.forEach(el => {
        el.style.removeProperty('transition');
        if (!isOpen) {
          el.style.removeProperty('transform');
          el.style.removeProperty('border-radius');
          el.style.removeProperty('overflow');
        }
      });
    }, duration * 1000);
  }

  window.toggleUserPanel = function (open) {
    const panel = document.getElementById('user-panel') || document.getElementById('spa-user-panel');
    const backdrop = document.getElementById('spa-user-panel-backdrop') || document.querySelector('.user-panel-backdrop');
    if (!panel) return;

    const isCurrentlyActive = panel.classList.contains('active');
    const shouldOpen = typeof open === 'boolean' ? open : !isCurrentlyActive;

    const now = Date.now();
    // 關鍵防護：若剛在 380ms 內打開面板，或剛透過底部導航指標點擊觸發，禁止任何外部點擊或合成事件將其關閉
    if (!shouldOpen && (now - lastOpenTime < 380 || (window.__justHandledPointerNav && now - window.__justHandledPointerNav < 380))) {
      return;
    }

    if (typeof open !== 'boolean' && now - lastToggleTime < 280) {
      return; // Debounce rapid double-taps
    }
    lastToggleTime = now;
    if (shouldOpen) {
      lastOpenTime = now;
    }

    const mobile = isMobileView();

    // 電腦版保持原樣：只切換 active class，不改寫 inline transform，不呼叫下測面板與 page-main 縮小動畫
    if (!mobile) {
      panel.style.removeProperty('display');
      panel.style.removeProperty('transform');
      panel.style.removeProperty('transition');
      if (backdrop) {
        backdrop.classList.remove('active');
        backdrop.style.removeProperty('opacity');
        backdrop.style.removeProperty('backdrop-filter');
        backdrop.style.removeProperty('-webkit-backdrop-filter');
      }
      if (shouldOpen) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
      return;
    }

    if (!panel.dataset.dragBound) {
      initUserPanelGestures();
    }

    if (shouldOpen) {
      panel.style.removeProperty('display');
      panel.classList.add('active');
      panel.style.removeProperty('transform');
      panel.style.setProperty('transform', 'translate3d(0, 0, 0)', 'important');
      panel.style.transition = '';
      if (backdrop) {
        backdrop.style.removeProperty('display');
        backdrop.classList.add('active');
        backdrop.style.opacity = '';
        backdrop.style.backdropFilter = '';
        backdrop.style.webkitBackdropFilter = '';
        backdrop.style.transition = '';
      }
      animateBackgroundDepth(true, 0.35);
      updateMobileBottomNavActive('profile');
    } else {
      panel.classList.remove('active');
      panel.style.removeProperty('transform');
      panel.style.transform = '';
      panel.style.transition = '';
      if (backdrop) {
        backdrop.classList.remove('active');
        backdrop.style.opacity = '';
        backdrop.style.backdropFilter = '';
        backdrop.style.webkitBackdropFilter = '';
        backdrop.style.transition = '';
      }
      animateBackgroundDepth(false, 0.32);
      updateMobileBottomNavActive();
    }
  };

  function initUserPanelGestures() {
    const panel = document.getElementById('user-panel') || document.getElementById('spa-user-panel');
    const backdrop = document.getElementById('spa-user-panel-backdrop') || document.querySelector('.user-panel-backdrop');
    if (!panel || panel.dataset.dragBound) return;
    panel.dataset.dragBound = 'true';

    if (backdrop && !backdrop.dataset.bound) {
      backdrop.dataset.bound = 'true';
      backdrop.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.toggleUserPanel(false);
      });
    }

    let startY = 0;
    let lastY = 0;
    let lastTime = 0;
    let curDy = 0;
    let vy = 0;
    let isDraggingPanel = false;
    let activePointerId = null;
    let panelHeight = 360;

    panel.addEventListener('pointerdown', (e) => {
      if (!isMobileView()) return;
      if (!panel.classList.contains('active')) return;
      const isHandle = !!e.target.closest('.user-panel-handle');
      const isHeader = !!e.target.closest('.up-header');
      const rect = panel.getBoundingClientRect();
      const isTopZone = (e.clientY - rect.top) < 85;
      const isInteractive = !!e.target.closest('a, button, input');

      if (!isHandle && (!isTopZone || isInteractive)) return;

      isDraggingPanel = true;
      activePointerId = e.pointerId;
      startY = e.clientY;
      lastY = e.clientY;
      lastTime = performance.now();
      curDy = 0;
      vy = 0;
      panelHeight = panel.getBoundingClientRect().height || 360;

      panel.style.setProperty('transition', 'none', 'important');
      if (backdrop) backdrop.style.setProperty('transition', 'none', 'important');

      window.addEventListener('pointermove', onPanelPointerMove, { passive: false });
      window.addEventListener('pointerup', onPanelPointerUp);
      window.addEventListener('pointercancel', onPanelPointerUp);

      try { panel.setPointerCapture(e.pointerId); } catch (_) {}
    });

    function onPanelPointerMove(e) {
      if (!isDraggingPanel || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      if (e.cancelable) e.preventDefault();

      const rawDy = e.clientY - startY;
      // 向上拖動時完全不位移，向下拉 1:1 即時跟手
      curDy = Math.max(0, rawDy);

      const now = performance.now();
      const dt = Math.max(1, now - lastTime);
      vy = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastTime = now;

      panel.style.setProperty('transform', `translate3d(0, ${curDy.toFixed(1)}px, 0)`, 'important');

      const ratio = Math.max(0, Math.min(1, curDy / panelHeight));
      const progress = Math.max(0, 1 - ratio);

      if (backdrop) {
        backdrop.style.setProperty('opacity', progress.toFixed(3), 'important');
        const blurVal = (progress * 4).toFixed(2);
        backdrop.style.setProperty('backdrop-filter', `blur(${blurVal}px)`, 'important');
        backdrop.style.setProperty('-webkit-backdrop-filter', `blur(${blurVal}px)`, 'important');
      }

      // 1:1 即時跟手縮放背景層級空間感
      setBackgroundDepthProgress(progress);
    }

    function onPanelPointerUp(e) {
      if (!isDraggingPanel) return;
      if (activePointerId !== null && e && e.pointerId !== activePointerId) return;

      window.removeEventListener('pointermove', onPanelPointerMove);
      window.removeEventListener('pointerup', onPanelPointerUp);
      window.removeEventListener('pointercancel', onPanelPointerUp);
      try {
        if (activePointerId !== null && panel.hasPointerCapture(activePointerId)) {
          panel.releasePointerCapture(activePointerId);
        }
      } catch (_) {}

      isDraggingPanel = false;
      activePointerId = null;

      // 到達 30% 以上的位移距離時收起，或帶有明顯向下速度時收起
      const ratio = curDy / panelHeight;
      const shouldDismiss = ratio >= 0.30 || vy > 0.38;

      if (shouldDismiss) {
        // 透過下拉力道加速：vy 越大，收起速度越快（duration 越短）
        const remainingRatio = Math.max(0.1, 1 - ratio);
        const velocityBonus = Math.min(0.18, Math.max(0, vy * 0.075));
        const duration = Math.max(0.10, Math.min(0.28, (0.24 * remainingRatio) - velocityBonus));

        panel.style.setProperty('transition', `transform ${duration.toFixed(2)}s cubic-bezier(0.12, 0.9, 0.25, 1), opacity ${duration.toFixed(2)}s ease`, 'important');
        panel.style.setProperty('transform', 'translate3d(0, 100%, 0)', 'important');

        if (backdrop) {
          backdrop.style.setProperty('transition', `opacity ${duration.toFixed(2)}s ease, backdrop-filter ${duration.toFixed(2)}s ease, -webkit-backdrop-filter ${duration.toFixed(2)}s ease`, 'important');
          backdrop.style.setProperty('opacity', '0', 'important');
          backdrop.style.setProperty('backdrop-filter', 'blur(0px)', 'important');
          backdrop.style.setProperty('-webkit-backdrop-filter', 'blur(0px)', 'important');
        }

        animateBackgroundDepth(false, duration);

        setTimeout(() => {
          window.toggleUserPanel(false);
        }, duration * 1000);
      } else {
        panel.style.setProperty('transition', 'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1)', 'important');
        panel.style.setProperty('transform', 'translate3d(0, 0, 0)', 'important');

        if (backdrop) {
          backdrop.style.setProperty('transition', 'opacity 0.26s ease, backdrop-filter 0.26s ease, -webkit-backdrop-filter 0.26s ease', 'important');
          backdrop.style.opacity = '1';
          backdrop.style.backdropFilter = 'blur(4px)';
          backdrop.style.webkitBackdropFilter = 'blur(4px)';
        }

        animateBackgroundDepth(true, 0.26);

        setTimeout(() => {
          panel.style.removeProperty('transition');
          if (backdrop) {
            backdrop.style.removeProperty('transition');
            backdrop.style.removeProperty('backdrop-filter');
            backdrop.style.removeProperty('-webkit-backdrop-filter');
          }
        }, 260);
      }
    }
  }

  let navSpringRaf = null;
  let isNavInteracting = false;
  let justHandledPointerNav = false;
  let updateMobNavVisual = null;

  function mountAICreationCapsule() {
    const capsule = document.getElementById('global-create-capsule');
    if (!capsule) return;
    if (capsule.parentElement !== document.body) {
      document.body.appendChild(capsule);
    }
  }
  window.addEventListener('resize', mountAICreationCapsule);

  function initMobileBottomNavGestures() {
    const mobNav = document.querySelector('.mobile-bottom-nav');
    if (!mobNav || mobNav.dataset.gesturesBound) return;
    mobNav.dataset.gesturesBound = 'true';
    mountAICreationCapsule();

    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let curDx = 0;
    let curDy = 0;
    let curScaleX = 1.0;
    let curScaleY = 1.0;
    let isCancelled = false;
    let currentTargetItem = null;
    let lastSnappedItem = null;
    let cachedMetrics = [];
    let cachedNavRect = null;
    let failsafeTimer = null;
    let curIndicatorX = 0;
    let pressStartTime = 0;

    const maxDx = 18;
    const maxDy = 12;
    const insetX = parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-inset-x')) || 5;
    const insetY = parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-inset-y')) || 5;
    let indicatorWidth = parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-width')) || 64;

    const items = Array.from(mobNav.querySelectorAll('.mobile-nav__track--base .mobile-nav__item')).length
      ? Array.from(mobNav.querySelectorAll('.mobile-nav__track--base .mobile-nav__item'))
      : Array.from(mobNav.querySelectorAll('.mobile-nav__item:not(.mobile-nav__item--focus)'));
    const indicator = mobNav.querySelector('.mobile-nav__indicator');

    mobNav.addEventListener('dragstart', (e) => e.preventDefault());
    items.forEach(it => it.setAttribute('draggable', 'false'));

    function updateIndicatorVisual(x, scale = 1.0, isSettling = false, opacity = 1.0) {
      if (!indicator || !mobNav) return;
      const focusTrack = mobNav.querySelector('.mobile-nav__track--focus');
      if (isSettling) {
        indicator.classList.add('is-settling');
        if (focusTrack) focusTrack.classList.add('is-settling');
      } else {
        indicator.classList.remove('is-settling');
        if (focusTrack) focusTrack.classList.remove('is-settling');
      }

      const opacityStr = opacity.toString();
      indicator.style.opacity = opacityStr;
      if (focusTrack) focusTrack.style.opacity = opacityStr;

      indicator.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0) scale(${scale.toFixed(4)})`;

      if (focusTrack) {
        if (opacity <= 0.01) {
          const hiddenClip = 'inset(0 100% 0 0 round 999px)';
          focusTrack.style.clipPath = hiddenClip;
          focusTrack.style.webkitClipPath = hiddenClip;
          mobNav.style.setProperty('--nav-clip-path', hiddenClip);
          return;
        }

        const navW = cachedNavRect ? cachedNavRect.width : mobNav.getBoundingClientRect().width;
        const navH = cachedNavRect ? cachedNavRect.height : (mobNav.getBoundingClientRect().height || 64);
        const selW = indicatorWidth;
        const selH = navH - (insetY * 2);
        const centerY = insetY + selH / 2;
        const centerX = x + selW / 2;

        const scaledW = selW * scale;
        const scaledH = selH * scale;

        const top = centerY - scaledH / 2;
        const bottom = navH - (centerY + scaledH / 2);
        const left = centerX - scaledW / 2;
        const right = navW - (centerX + scaledW / 2);

        const clipValue = `inset(${top.toFixed(2)}px ${right.toFixed(2)}px ${bottom.toFixed(2)}px ${left.toFixed(2)}px round 999px)`;
        focusTrack.style.clipPath = clipValue;
        focusTrack.style.webkitClipPath = clipValue;
        mobNav.style.setProperty('--nav-clip-path', clipValue);
      }
    }
    updateMobNavVisual = updateIndicatorVisual;

    function cacheMetrics() {
      cachedNavRect = mobNav.getBoundingClientRect();
      cachedMetrics = items.map(it => {
        const r = it.getBoundingClientRect();
        return {
          item: it,
          id: it.id,
          centerX: r.left + r.width / 2,
          isCreate: it.classList.contains('mobile-nav__item--create')
        };
      });

      if (cachedMetrics.length >= 1 && cachedNavRect && cachedNavRect.width > 0) {
        const c0 = cachedMetrics[0].centerX - cachedNavRect.left;
        const calcW = Math.round(2 * (c0 - insetX));
        if (calcW > 40 && calcW < 120) {
          indicatorWidth = calcW;
          indicator.style.width = `${indicatorWidth}px`;
          mobNav.style.setProperty('--nav-selector-width', `${indicatorWidth}px`);
        }

        const mobBtn = mobNav.querySelector('#mob-nav-circle-wrap') || mobNav.querySelector('.mob-circle-btn');
        if (mobBtn) {
          const br = mobBtn.getBoundingClientRect();
          if (br && br.width > 0) {
            window.__mobBtnRestingBottomPx = Math.max(0, Math.round(window.innerHeight - br.bottom));
            document.documentElement.style.setProperty('--mob-btn-bottom', `${window.__mobBtnRestingBottomPx}px`);
          }
        }
      }
    }
    window.addEventListener('resize', cacheMetrics);

    function clearSnapHover() {
      items.forEach(it => it.classList.remove('snap-target'));
      const circleBtn = mobNav.querySelector('.mob-circle-btn');
      if (circleBtn) {
        circleBtn.classList.remove('snap-hover');
      }
    }

    function highlightTargetItem(targetItem) {
      if (!targetItem) {
        clearSnapHover();
        return;
      }
      items.forEach(it => {
        if (it === targetItem) {
          it.classList.add('snap-target');
        } else {
          it.classList.remove('snap-target');
        }
      });
      const circleBtn = mobNav.querySelector('.mob-circle-btn');
      if (circleBtn) {
        if (targetItem.classList.contains('mobile-nav__item--create')) {
          circleBtn.classList.add('snap-hover');
        } else {
          circleBtn.classList.remove('snap-hover');
        }
      }
    }

    function findClosestMetric(clientX) {
      let closest = cachedMetrics[0] || null;
      let minXDist = Infinity;
      for (const m of cachedMetrics) {
        const d = Math.abs(clientX - m.centerX);
        if (d < minXDist) {
          minXDist = d;
          closest = m;
        }
      }
      return closest;
    }

    function cleanupWindowListeners() {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      if (failsafeTimer) {
        clearTimeout(failsafeTimer);
        failsafeTimer = null;
      }
    }

    function onPointerDown(e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      if (navSpringRaf) {
        cancelAnimationFrame(navSpringRaf);
        navSpringRaf = null;
      }
      mobNav.style.transform = '';
      mobNav.style.transition = 'none';

      isNavInteracting = true;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      curDx = 0;
      curDy = 0;
      isCancelled = false;
      pressStartTime = performance.now();

      const directItem = e.target ? e.target.closest('.mobile-nav__item') : null;
      cacheMetrics();
      const closestMetric = findClosestMetric(e.clientX);
      currentTargetItem = directItem || (closestMetric ? closestMetric.item : null);
      lastSnappedItem = currentTargetItem;
      highlightTargetItem(currentTargetItem);

      // 按下即動：只要有點擊到 link 就觸發 selector 移動過來，手指點擊時微反饋 (scale 1.05)
      if (indicator && currentTargetItem && cachedNavRect) {
        indicator.classList.add('is-active', 'is-pressed');
        const tMetric = cachedMetrics.find(m => m.item === currentTargetItem);
        const targetCenterX = tMetric ? tMetric.centerX : (currentTargetItem.getBoundingClientRect().left + currentTargetItem.getBoundingClientRect().width / 2);
        const finalOffset = targetCenterX - cachedNavRect.left - indicatorWidth / 2;
        curIndicatorX = Math.max(insetX, Math.min(cachedNavRect.width - indicatorWidth - insetX, finalOffset));
        updateIndicatorVisual(curIndicatorX, 1.05, true, 1.0);
      }

      curScaleX = 1.026;
      curScaleY = 1.026;

      mobNav.style.transition = 'transform 0.16s cubic-bezier(0.2, 0.9, 0.3, 1)';
      mobNav.style.transform = `translate3d(0px, 0px, 0) scale(${curScaleX.toFixed(4)}, ${curScaleY.toFixed(4)})`;

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerCancel);

      failsafeTimer = setTimeout(() => {
        if (isNavInteracting) {
          onPointerRelease(null, true);
        }
      }, 4000);
    }

    function onPointerMove(e) {
      if (!isNavInteracting || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      if (e.cancelable && e.pointerType !== 'mouse') e.preventDefault();

      mobNav.style.transition = 'none';

      const rawDx = e.clientX - startX;
      const rawDy = e.clientY - startY;

      if (cachedNavRect && (e.clientY < cachedNavRect.top - 65 || e.clientY > cachedNavRect.bottom + 65)) {
        if (!isCancelled) {
          isCancelled = true;
          currentTargetItem = null;
          clearSnapHover();
        }
      } else {
        isCancelled = false;
        const closestMetric = findClosestMetric(e.clientX);
        const closest = closestMetric ? closestMetric.item : null;
        if (closest && closest !== currentTargetItem) {
          currentTargetItem = closest;
          if (currentTargetItem !== lastSnappedItem) {
            lastSnappedItem = currentTargetItem;
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try { navigator.vibrate(8); } catch (_) {}
            }
          }
          highlightTargetItem(currentTargetItem);
        }

        if (indicator && cachedNavRect && closestMetric) {
          if (Math.hypot(rawDx, rawDy) > 4) {
            indicator.classList.remove('is-settling');
          }
          const fingerRelX = e.clientX - cachedNavRect.left - indicatorWidth / 2;
          const closestCenterRelX = closestMetric.centerX - cachedNavRect.left - indicatorWidth / 2;
          const distX = fingerRelX - closestCenterRelX;
          let targetIndX = fingerRelX - distX * 0.35;
          targetIndX = Math.max(insetX, Math.min(cachedNavRect.width - indicatorWidth - insetX, targetIndX));

          curIndicatorX += (targetIndX - curIndicatorX) * 0.36;

          indicator.classList.add('is-active');
          updateIndicatorVisual(curIndicatorX, 1.05, false, 1.0);
        }
      }

      curDx = Math.sign(rawDx) * maxDx * (1 - 1 / (1 + (Math.abs(rawDx) * 0.16) / maxDx));
      curDy = Math.sign(rawDy) * maxDy * (1 - 1 / (1 + (Math.abs(rawDy) * 0.16) / maxDy));

      let edgeStretchY = 0;
      let originY = 'center';
      if (Math.abs(rawDy) > 8) {
        edgeStretchY = Math.min(0.045, (Math.abs(rawDy) - 8) * 0.0035);
        originY = rawDy > 0 ? 'top' : 'bottom';
      }

      mobNav.style.transformOrigin = `center ${originY}`;

      const elapsed = performance.now() - pressStartTime;
      const baseScale = 1.0 + 0.026 * Math.min(1, elapsed / 140);
      curScaleX = baseScale;
      curScaleY = baseScale + edgeStretchY;

      mobNav.style.transform = `translate3d(${curDx.toFixed(2)}px, ${curDy.toFixed(2)}px, 0) scale(${curScaleX.toFixed(4)}, ${curScaleY.toFixed(4)})`;
    }

    function onPointerRelease(e, forceCancel = false) {
      if (!isNavInteracting) return;
      if (!forceCancel && activePointerId !== null && e && e.pointerId !== activePointerId) return;

      const releasedTargetItem = currentTargetItem;
      // If forceCancel happened without significant displacement (< 10px),
      // it was likely an interrupted tap or touch slop artifact from the mobile browser,
      // so we do NOT treat it as an intentional cancel!
      const isActuallyCancelled = isCancelled || (forceCancel && Math.hypot(curDx, curDy) >= 10);
      const releaseCancelled = isActuallyCancelled || !releasedTargetItem;

      cleanupWindowListeners();
      clearSnapHover();

      isNavInteracting = false;
      activePointerId = null;

      if (indicator && releasedTargetItem && cachedNavRect) {
        indicator.classList.add('is-active');
        indicator.classList.remove('is-pressed');
        const tMetric = cachedMetrics.find(m => m.item === releasedTargetItem);
        const targetCenterX = tMetric ? tMetric.centerX : (releasedTargetItem.getBoundingClientRect().left + releasedTargetItem.getBoundingClientRect().width / 2);
        const finalOffset = targetCenterX - cachedNavRect.left - indicatorWidth / 2;
        curIndicatorX = Math.max(insetX, Math.min(cachedNavRect.width - indicatorWidth - insetX, finalOffset));
        updateIndicatorVisual(curIndicatorX, 1.0, true, 1.0);
      }

      // Overshoot Rebound for displacement > 5.0
      const dragDist = Math.hypot(curDx, curDy);
      const isLargeDisplacement = dragDist > 5.0;

      let curX = curDx;
      let curY = curDy;
      let sX = curScaleX;
      let sY = curScaleY;
      let vx = isLargeDisplacement ? -Math.sign(curX) * Math.max(36, Math.min(65, Math.abs(curX) * 4)) : 0;
      let vy = isLargeDisplacement ? -Math.sign(curY) * Math.max(26, Math.min(50, Math.abs(curY) * 3.5)) : 0;
      let vsX = 0;
      let vsY = 0;

      const posStiffness = isLargeDisplacement ? 380 : 320;
      const posDamping = isLargeDisplacement ? 12.5 : 24;
      const scaleStiffness = 360;
      const scaleDamping = 22;
      let lastTime = performance.now();

      function springStep(now) {
        const dt = Math.min(0.032, (now - lastTime) / 1000);
        lastTime = now;

        const ax = -posStiffness * curX - posDamping * vx;
        const ay = -posStiffness * curY - posDamping * vy;
        vx += ax * dt;
        vy += ay * dt;
        curX += vx * dt;
        curY += vy * dt;

        const asX = -scaleStiffness * (sX - 1.0) - scaleDamping * vsX;
        const asY = -scaleStiffness * (sY - 1.0) - scaleDamping * vsY;
        vsX += asX * dt;
        vsY += asY * dt;
        sX += vsX * dt;
        sY += vsY * dt;

        mobNav.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0) scale(${sX.toFixed(4)}, ${sY.toFixed(4)})`;

        const isPosActive = Math.hypot(curX, curY) > 0.18 || Math.hypot(vx, vy) > 2;
        const isScaleActive = Math.hypot(sX - 1.0, sY - 1.0) > 0.001 || Math.hypot(vsX, vsY) > 0.05;

        if (isPosActive || isScaleActive) {
          navSpringRaf = requestAnimationFrame(springStep);
        } else {
          mobNav.style.transform = '';
          mobNav.style.transformOrigin = 'center center';
          navSpringRaf = null;
        }
      }
      navSpringRaf = requestAnimationFrame(springStep);

      if (releaseCancelled) {
        updateMobileBottomNavActive();
        return;
      }

      window.__justHandledPointerNav = Date.now();
      justHandledPointerNav = true;
      setTimeout(() => { justHandledPointerNav = false; }, 450);

      const targetItem = releasedTargetItem;
      if (targetItem.id === 'mob-nav-profile') {
        window.toggleUserPanel();
      } else if (targetItem.id === 'mob-nav-generate') {
        if (window.AICreationController) {
          if (window.AICreationController.surfaceState === 'quick-compose') {
            window.AICreationController.closeQuickCompose();
          } else if (window.AICreationController.surfaceState === 'closed') {
            window.AICreationController.openQuickCompose();
          }
        } else {
          window.location.href = '../generate';
        }
      } else {
        const href = targetItem.getAttribute('href');
        if (href) window.location.href = href;
      }
    }

    function onPointerUp(e) {
      onPointerRelease(e, false);
    }

    function onPointerCancel(e) {
      onPointerRelease(e, true);
    }

    mobNav.addEventListener('pointerdown', onPointerDown);
    mobNav.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    items.forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (justHandledPointerNav || (window.__justHandledPointerNav && Date.now() - window.__justHandledPointerNav < 450)) return;

        if (item.id === 'mob-nav-profile') {
          window.toggleUserPanel();
        } else if (item.id === 'mob-nav-generate') {
          if (indicator) {
            indicator.classList.add('is-active');
            const itemRect = item.getBoundingClientRect();
            const navRect = mobNav.getBoundingClientRect();
            const targetCenterX = itemRect.left + itemRect.width / 2;
            const finalOffset = targetCenterX - navRect.left - indicatorWidth / 2;
            updateIndicatorVisual(finalOffset, 1.05, true, 1.0);
            mobNav.style.transition = 'transform 0.16s cubic-bezier(0.2, 0.9, 0.3, 1)';
            mobNav.style.transform = 'translate3d(0px, 0px, 0) scale(1.026, 1.026)';
            setTimeout(() => {
              mobNav.style.transform = '';
              updateIndicatorVisual(finalOffset, 1.0, true, 1.0);
            }, 160);
          }
          if (window.AICreationController) {
            if (window.AICreationController.surfaceState === 'quick-compose') {
              window.AICreationController.closeQuickCompose();
            } else if (window.AICreationController.surfaceState === 'closed') {
              window.AICreationController.openQuickCompose();
            }
          } else {
            window.location.href = '../generate';
          }
        } else {
          const href = item.getAttribute('href');
          if (href) window.location.href = href;
        }
      });
    });

    if (window.visualViewport && !mobNav.dataset.viewportBound) {
      mobNav.dataset.viewportBound = 'true';
      const initialHeight = window.visualViewport.height;

      const onViewportChange = () => {
        const currentHeight = window.visualViewport.height;
        const isKeyboardOpen = (initialHeight - currentHeight) > 150;
        if (isKeyboardOpen) {
          mobNav.style.transform = 'translateY(120%)';
          mobNav.style.opacity = '0';
          mobNav.style.pointerEvents = 'none';
        } else {
          mobNav.style.transform = '';
          mobNav.style.opacity = '';
          mobNav.style.pointerEvents = '';
        }
      };

      window.visualViewport.addEventListener('resize', onViewportChange);
      window.visualViewport.addEventListener('scroll', onViewportChange);
    }
  }

  // Global capture-phase listener for mob-nav-profile
  document.addEventListener('click', (e) => {
    const profileBtn = e.target.closest('#mob-nav-profile');
    if (profileBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (!justHandledPointerNav && (!window.__justHandledPointerNav || Date.now() - window.__justHandledPointerNav >= 450)) {
        window.toggleUserPanel();
      }
    }
  }, true);

  function updateMobileBottomNavActive(page) {
    const mobNav = document.getElementById('spa-mobile-nav') || document.querySelector('.mobile-bottom-nav');
    if (!mobNav) return;
    if (isNavInteracting) return;

    const panel = document.getElementById('user-panel') || document.getElementById('spa-user-panel');
    const isProfileActive = page === 'profile' || (panel && panel.classList.contains('active'));

    const items = Array.from(mobNav.querySelectorAll('.mobile-nav__track--base .mobile-nav__item')).length
      ? Array.from(mobNav.querySelectorAll('.mobile-nav__track--base .mobile-nav__item'))
      : Array.from(mobNav.querySelectorAll('.mobile-nav__item:not(.mobile-nav__item--focus)'));
    let activeItem = null;
    items.forEach(item => {
      let isActive = false;
      if (isProfileActive) {
        isActive = (item.id === 'mob-nav-profile');
      } else {
        const href = item.getAttribute('href') || '';
        const isGenerate = page === 'generate' && (href.includes('generate') || item.id === 'mob-nav-generate');
        const isProjects = page === 'projects' && (href.includes('projects') || item.id === 'mob-nav-projects');
        const isTemplate = page === 'template' && (href.includes('template') || item.id === 'mob-nav-template');
        const isDashboard = (!page || page === 'dashboard') && (href.includes('dashboard') || item.id === 'mob-nav-home');
        isActive = isGenerate || isProjects || isTemplate || isDashboard;
      }

      if (isActive) {
        item.classList.add('active');
        item.setAttribute('aria-selected', 'true');
        activeItem = item;
      } else {
        item.classList.remove('active');
        item.setAttribute('aria-selected', 'false');
      }
    });

    const indicator = mobNav.querySelector('.mobile-nav__indicator');
    if (indicator) {
      if (activeItem) {
        const itemRect = activeItem.getBoundingClientRect();
        const navRect = mobNav.getBoundingClientRect();
        const insetX = parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-inset-x')) || 5;
        const currentIndicatorWidth = parseFloat(indicator.style.width) || parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-width')) || 64;
        if (navRect.width > 0 && itemRect.width > 0) {
          const itemCenterX = itemRect.left + itemRect.width / 2;
          const targetOffset = itemCenterX - navRect.left - currentIndicatorWidth / 2;
          const finalOffset = Math.max(insetX, Math.min(navRect.width - currentIndicatorWidth - insetX, targetOffset));
          indicator.classList.add('is-active');
          if (updateMobNavVisual) {
            updateMobNavVisual(finalOffset, 1.0, true, 1.0);
          } else {
            indicator.style.transform = `translate3d(${finalOffset.toFixed(2)}px, 0, 0) scale(1)`;
            indicator.style.opacity = '1';
          }
        }
      } else {
        indicator.classList.remove('is-active');
        if (updateMobNavVisual) {
          updateMobNavVisual(0, 1.0, true, 0.0);
        } else {
          indicator.style.opacity = '0';
        }
      }
    }
  }

  function init() {
    initUserPanelGestures();
    initMobileBottomNavGestures();
    updateMobileBottomNavActive();

    const avatar = document.getElementById('top-avatar');
    if (avatar) {
      avatar.onclick = (e) => {
        e.stopPropagation();
        window.toggleUserPanel();
      };
    }

    window.addEventListener('resize', () => {
      if (!isMobileView()) {
        const bgTargets = getBackgroundDepthTargets();
        bgTargets.forEach(el => {
          el.classList.remove('bg-depth-scaled', 'bg-depth-animating');
          el.style.removeProperty('transform');
          el.style.removeProperty('border-radius');
          el.style.removeProperty('overflow');
        });
        const panel = document.getElementById('user-panel') || document.getElementById('spa-user-panel');
        if (panel) {
          panel.style.removeProperty('transform');
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

