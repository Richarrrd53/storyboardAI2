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
  function setupRoseAnimation(group, path, particleCount = 45, depth = null) {
    if (!group || !path) return null;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const trailSpan = 0.32;
    const durationMs = 5400;
    const rotationDurationMs = 28000;
    // 50 BPM: one gentle pulse per 1.2s, within the 40–60 BPM sleeping
    // range described by Sleep Foundation (animation reference, not a sensor).
    const pulseDurationMs = depth ? 1200 : 4600;
    const handoffMs = 480;
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

    const frontParticles = depth ? particles.map(() => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('fill', 'currentColor');
      depth.group.appendChild(circle);
      return circle;
    }) : [];

    function project(pt) {
      // Orthographic projection preserves five equally long petals. Depth
      // controls occlusion only, without stretching the near-side petals.
      return {
        x: pt.x,
        y: pt.y,
        z: pt.z,
        perspective: 1
      };
    }

    function paintDepth(detailScale, progress, animateParticles) {
      const lapSide = lap => ((lap % 2) + 2) % 2 === 0 ? 1 : -1;
      const smooth = value => {
        const t = Math.max(0, Math.min(1, value));
        return t * t * (3 - 2 * t);
      };
      const halfWindow = handoffMs / durationMs / 2;
      const seam = Math.round(progress);
      const distance = progress - seam;
      const trackVisibility = seam > 0 && Math.abs(distance) < halfWindow
        ? smooth(Math.abs(distance) / halfWindow) : 1;
      const trackSide = lapSide(Math.floor(progress));
      const paths = ['', ''];
      let previous = null;
      for (let i = 0; i <= 360; i++) {
        const p = project(point(i / 360, detailScale));
        p.z *= trackSide;
        const side = p.z >= 0 ? 1 : 0;
        const command = `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
        if (!previous) paths[side] += `M ${command} `;
        else if ((previous.z >= 0 ? 1 : 0) === side) paths[side] += `L ${command} `;
        else {
          const mix = previous.z / (previous.z - p.z);
          const cross = `${(previous.x + (p.x - previous.x) * mix).toFixed(2)} ${(previous.y + (p.y - previous.y) * mix).toFixed(2)}`;
          paths[1 - side] += `L ${cross} `;
          paths[side] += `M ${cross} L ${command} `;
        }
        previous = p;
      }
      // A complete rear track fills the area vacated as the near track eases
      // behind the cover, then comes forward with the opposite lap ordering.
      path.setAttribute('d', buildPath(detailScale, 360));
      depth.path.setAttribute('d', paths[1]);
      path.setAttribute('stroke-width', String(strokeWidth));
      depth.path.setAttribute('stroke-width', String(strokeWidth));
      path.setAttribute('opacity', '0.18');
      depth.path.setAttribute('opacity', String(0.18 * trackVisibility));
      // Remove the rear stroke wherever the front stroke is drawn, so the
      // same translucent white never accumulates into brighter intersections.
      if (depth.maskPath) {
        depth.maskPath.setAttribute('d', paths[1]);
        depth.maskPath.setAttribute('stroke-width', String(strokeWidth));
        // Alpha compensation keeps intersections at exactly the same track
        // opacity throughout the handoff, rather than double-painting them.
        depth.maskPath.setAttribute('opacity', String(trackVisibility * 0.82 / (1 - 0.18 * trackVisibility)));
      }
      particles.forEach((node, index) => {
        const particle = getParticle(index, progress, detailScale);
        const p = project(particle);
        // Each tip-to-tip side has one depth sign; the next side has the
        // opposite sign. Every trail particle crosses the tip independently.
        const particleProgress = progress - index / (particleCount - 1) * trailSpan;
        const z = p.z * lapSide(Math.floor(particleProgress));
        const nearWeight = smooth((z + 4) / 8);
        const particleVisibility = animateParticles ? 1 : 0;
        [node, frontParticles[index]].forEach((circle, side) => {
          circle.setAttribute('cx', p.x.toFixed(2));
          circle.setAttribute('cy', p.y.toFixed(2));
          circle.setAttribute('r', (particle.radius * p.perspective).toFixed(2));
          const layerWeight = side ? nearWeight : (1 - nearWeight) * 0.45;
          circle.setAttribute('opacity', (particle.opacity * layerWeight * particleVisibility).toFixed(3));
        });
      });
    }

    function normalizeProgress(progress) {
      return ((progress % 1) + 1) % 1;
    }

    function getDetailScale(time) {
      const pulseProgress = (time % pulseDurationMs) / pulseDurationMs;
      const pulseAngle = pulseProgress * Math.PI * 2;
      if (depth) return 0.86 + 0.14 * (0.5 - 0.5 * Math.cos(pulseAngle));
      return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
    }

    function getRotation(time) {
      return -((time % rotationDurationMs) / rotationDurationMs) * 360;
    }

    function point(progress, detailScale) {
      // An odd-petal rose closes after PI. Drawing the second half with a
      // different depth would duplicate all five petals into extra orbit rails.
      const t = progress * Math.PI * (depth ? 1 : 2);
      const a = roseA + detailScale * roseABoost;
      const amplitude = a * (roseBreathBase + detailScale * roseBreathBoost);
      const r = amplitude * Math.cos(roseK * t);
      return {
        x: 50 + Math.cos(t) * r * roseScale,
        y: 50 + Math.sin(t) * r * roseScale,
        // One sign per tip-to-tip side. Five sides means the next complete
        // lap naturally reverses their near/far order without rotating petals.
        z: depth ? amplitude * Math.sin(roseK * t) * roseScale * 0.35 : 0,
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
        z: pt.z,
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

      if (depth) {
        paintDepth(detailScale, time / durationMs, true);
        animId = requestAnimationFrame(render);
        return;
      }

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

    // Paint a static curve for reduced-motion users before animation starts.
    path.setAttribute('d', buildPath(getDetailScale(0)));
    if (depth) paintDepth(getDetailScale(0), 0, false);

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

  function ensureInnerLoader(main) {
    let loader = document.getElementById('page-inner-loader');
    if (!loader) {
      const originalOverlay = document.getElementById('transition-loader-overlay');
      if (originalOverlay) {
        loader = originalOverlay.cloneNode(true);
        loader.id = 'page-inner-loader';
        const group = loader.querySelector('#transition-loader-group');
        if (group) group.id = 'page-inner-loader-group';
        const path = loader.querySelector('#transition-loader-path');
        if (path) path.id = 'page-inner-loader-path';
        const text = loader.querySelector('#transition-loader-text');
        if (text) {
          text.id = 'page-inner-loader-text';
          text.textContent = '劇本載入中...';
        }
        main.appendChild(loader);
      }
    }
  }

  const TransitionLoader = {
    ensureInnerLoader,
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
