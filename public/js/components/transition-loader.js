/**
 * StoryboardAI - Transition Loader Component (P4-5)
 * Manages loading animations and progress indicators during SPA transitions:
 * - Mathematical curve Rose Animation (SVG particle & dynamic path engine)
 * - Fullscreen transition overlay (#transition-loader-overlay)
 * - In-place dashboard loader spinner (#spa-dash-loader)
 * - Inset content loader (#page-inner-loader)
 * - Text cycling with blur transitions
 * - Seamless start / cleanup lifecycle
 */
(function (root) {
  'use strict';

  const cuteTexts = [
    "劇目準備中... 🎬",
    "正在排練精彩分鏡... 🎭",
    "正在佈置舞台場景... 🎪",
    "演員配音準備中... 🎙️",
    "正在為您調配電影色彩... 🎨",
    "導演正在校對腳本細節... 📝",
    "膠捲正在沖洗中，請稍候... 🎞️",
    "正在調度攝影機軌道... 📹",
    "正在後製調光與合成特效... ✨",
    "寫作靈感已送達，正在繪製草稿... 💡"
  ];

  let textCycleInterval = null;
  let currentTextIndex = 0;
  let innerLoaderTimer = null;
  let innerRoseLoaderInstance = null;
  let showLoaderTimer = null;
  let loaderShowing = false;

  /**
   * Pure mathematical rose curve particle & SVG path animation engine
   */
  function setupRoseAnimation(group, path, particleCount = 45) {
    if (!group || !path) return null;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const trailSpan = 0.32;
    const durationMs = 5400;
    const rotationDurationMs = 28000;
    const pulseDurationMs = 4600;
    const strokeWidth = 4.5;
    const roseA = 9.2;
    const roseABoost = 0.6;
    const roseBreathBase = 0.72;
    const roseBreathBoost = 0.28;
    const roseK = 5;
    const roseScale = 3.25;

    path.setAttribute('stroke-width', String(strokeWidth));
    group.innerHTML = '';
    group.appendChild(path);

    const particles = Array.from({ length: particleCount }, () => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('fill', 'currentColor');
      group.appendChild(circle);
      return circle;
    });

    function normalizeProgress(progress) {
      return ((progress % 1) + 1) % 1;
    }

    function getDetailScale(time) {
      const pulseProgress = (time % pulseDurationMs) / pulseDurationMs;
      const pulseAngle = pulseProgress * Math.PI * 2;
      return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
    }

    function getRotation(time) {
      return -((time % rotationDurationMs) / rotationDurationMs) * 360;
    }

    function point(progress, detailScale) {
      const t = progress * Math.PI * 2;
      const a = roseA + detailScale * roseABoost;
      const r = a * (roseBreathBase + detailScale * roseBreathBoost) * Math.cos(roseK * t);
      return {
        x: 50 + Math.cos(t) * r * roseScale,
        y: 50 + Math.sin(t) * r * roseScale,
      };
    }

    function buildPath(detailScale, steps = 180) {
      return Array.from({ length: steps + 1 }, (_, index) => {
        const pt = point(index / steps, detailScale);
        return `${index === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
      }).join(' ');
    }

    function getParticle(index, progress, detailScale) {
      const tailOffset = index / (particleCount - 1);
      const pt = point(normalizeProgress(progress - tailOffset * trailSpan), detailScale);
      const fade = Math.pow(1 - tailOffset, 0.56);
      return {
        x: pt.x,
        y: pt.y,
        radius: 0.6 + fade * 2.2,
        opacity: 0.04 + fade * 0.96,
      };
    }

    let animId = null;
    const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    function render(now) {
      const time = now - startedAt;
      const progress = (time % durationMs) / durationMs;
      const detailScale = getDetailScale(time);

      group.setAttribute('transform', `rotate(${getRotation(time)} 50 50)`);
      path.setAttribute('d', buildPath(detailScale));

      particles.forEach((node, index) => {
        const p = getParticle(index, progress, detailScale);
        node.setAttribute('cx', p.x.toFixed(2));
        node.setAttribute('cy', p.y.toFixed(2));
        node.setAttribute('r', p.radius.toFixed(2));
        node.setAttribute('opacity', p.opacity.toFixed(3));
      });

      animId = requestAnimationFrame(render);
    }

    return {
      start() {
        if (!animId) {
          animId = requestAnimationFrame(render);
        }
      },
      stop() {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
      }
    };
  }

  function startTextCycling() {
    const textEl = document.getElementById('transition-loader-text');
    if (!textEl) return;

    currentTextIndex = 0;
    textEl.textContent = cuteTexts[currentTextIndex];
    textEl.classList.remove('blur-out');

    if (textCycleInterval) {
      clearInterval(textCycleInterval);
    }

    textCycleInterval = setInterval(() => {
      textEl.classList.add('blur-out');
      setTimeout(() => {
        currentTextIndex = (currentTextIndex + 1) % cuteTexts.length;
        textEl.textContent = cuteTexts[currentTextIndex];
        textEl.classList.remove('blur-out');
      }, 500);
    }, 2800);
  }

  function stopTextCycling() {
    if (textCycleInterval) {
      clearInterval(textCycleInterval);
      textCycleInterval = null;
    }
  }

  function initDashboardLoader() {
    if (document.getElementById('spa-dash-loader')) return;
    const loader = document.createElement('div');
    loader.id = 'spa-dash-loader';
    loader.className = 'dash-loader';
    loader.innerHTML = '<div class="dash-loader-spinner"></div>';
    document.body.appendChild(loader);
  }

  function initTransitionLoader() {
    const overlay = document.getElementById('transition-loader-overlay');
    const group = document.getElementById('transition-loader-group');
    const path = document.getElementById('transition-loader-path');
    if (!overlay || !group || !path) return;

    root.spaTransitionLoader = setupRoseAnimation(group, path);
    return root.spaTransitionLoader;
  }

  function showInnerLoader() {
    if (innerLoaderTimer) clearTimeout(innerLoaderTimer);
    innerLoaderTimer = setTimeout(() => {
      const loader = document.getElementById('page-inner-loader');
      if (loader) {
        loader.classList.add('active');
        if (!innerRoseLoaderInstance) {
          const group = document.getElementById('page-inner-loader-group');
          const path = document.getElementById('page-inner-loader-path');
          innerRoseLoaderInstance = setupRoseAnimation(group, path);
        }
        if (innerRoseLoaderInstance) {
          innerRoseLoaderInstance.start();
        }
      }
    }, 250);
  }

  function hideInnerLoader() {
    if (innerLoaderTimer) {
      clearTimeout(innerLoaderTimer);
      innerLoaderTimer = null;
    }
    const loader = document.getElementById('page-inner-loader');
    if (loader) {
      loader.classList.remove('active');
    }
    if (innerRoseLoaderInstance) {
      innerRoseLoaderInstance.stop();
    }
  }

  function startLoaderTimer(isDashboardTransition) {
    if (showLoaderTimer) {
      clearTimeout(showLoaderTimer);
      showLoaderTimer = null;
    }
    loaderShowing = false;

    if (isDashboardTransition) {
      showLoaderTimer = setTimeout(() => {
        loaderShowing = true;
        const dashLoader = document.getElementById('spa-dash-loader');
        if (dashLoader) dashLoader.classList.add('active');
      }, 1000);
    } else {
      showLoaderTimer = setTimeout(() => {
        loaderShowing = true;
        const overlay = document.getElementById('transition-loader-overlay');
        if (overlay) {
          overlay.classList.add('active');
        }
        if (root.spaTransitionLoader) {
          root.spaTransitionLoader.start();
        }
        startTextCycling();
      }, 1000);
    }
  }

  function cleanup() {
    if (showLoaderTimer) {
      clearTimeout(showLoaderTimer);
      showLoaderTimer = null;
    }
    loaderShowing = false;
    const overlay = document.getElementById('transition-loader-overlay');
    if (overlay) overlay.classList.remove('active');
    const dashLoader = document.getElementById('spa-dash-loader');
    if (dashLoader) dashLoader.classList.remove('active');
    stopTextCycling();
    setTimeout(() => {
      if (!loaderShowing && root.spaTransitionLoader) {
        root.spaTransitionLoader.stop();
      }
    }, 300);
  }

  const TransitionLoader = {
    setupRoseAnimation,
    startTextCycling,
    stopTextCycling,
    initDashboardLoader,
    initTransitionLoader,
    showInnerLoader,
    hideInnerLoader,
    startLoaderTimer,
    cleanup,
    get isShowing() { return loaderShowing; }
  };

  root.TransitionLoader = TransitionLoader;
  root.setupRoseAnimation = setupRoseAnimation;
  root.startTextCycling = startTextCycling;
  root.stopTextCycling = stopTextCycling;
  root.initDashboardLoader = initDashboardLoader;
  root.initTransitionLoader = initTransitionLoader;
  root.showInnerLoader = showInnerLoader;
  root.hideInnerLoader = hideInnerLoader;

})(typeof window !== 'undefined' ? window : globalThis);
