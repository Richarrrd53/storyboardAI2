/**
 * StoryboardAI - Semantic SVG Icon Motion System
 * Unified controller for part-level SVG micro-interactions across
 * Sidebar, Mobile Bottom Navigation, Option Menu, and User Panel.
 */
(function (root) {
  'use strict';

  const activeAnimations = new WeakMap(); // svg -> Set<{ part, anim, hasOpacity }>
  const boundContainers = new WeakMap();  // container -> cleanup()

  const EASE = {
    mechanical: 'cubic-bezier(0.22, 1, 0.36, 1)',
    organic: 'cubic-bezier(0.16, 1, 0.3, 1)',
    directional: 'cubic-bezier(0.25, 1, 0.5, 1)',
    settle: 'cubic-bezier(0.4, 0, 0.2, 1)'
  };

  function isReducedMotion() {
    return !!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  /**
   * 16 semantic SVG icon motion definitions (trash is shared across 3 surfaces).
   * All animations end at their exact resting state (offset: 1) and never loop.
   */
  const MOTIONS = {
    // ── Navigation (6) ──
    home: {
      family: 'organic',
      duration: 960,
      parts: {
        roof: {
          origin: '12px 9.5px',
          easing: EASE.organic,
          keyframes: [
            { transform: 'translate3d(0, 0, 0)', offset: 0 },
            { transform: 'translate3d(0, -1.4px, 0)', offset: 0.36 },
            { transform: 'translate3d(0, 0.2px, 0)', offset: 0.76 },
            { transform: 'translate3d(0, 0, 0)', offset: 1 }
          ]
        },
        body: {
          origin: '12px 21px',
          easing: EASE.organic,
          keyframes: [
            { transform: 'scaleY(1) translate3d(0, 0, 0)', offset: 0 },
            { transform: 'scaleY(0.955) translate3d(0, 0.25px, 0)', offset: 0.44 },
            { transform: 'scaleY(1.01) translate3d(0, 0, 0)', offset: 0.78 },
            { transform: 'scaleY(1) translate3d(0, 0, 0)', offset: 1 }
          ]
        }
      }
    },

    add: {
      family: 'directional',
      duration: 840,
      parts: {
        ring: {
          origin: '12px 12px',
          easing: EASE.directional,
          keyframes: [
            { transform: 'scale(1)', offset: 0 },
            { transform: 'scale(0.96)', offset: 0.24 },
            { transform: 'scale(1.05)', offset: 0.62 },
            { transform: 'scale(1)', offset: 1 }
          ]
        },
        vline: {
          origin: '12px 12px',
          easing: EASE.directional,
          keyframes: [
            { transform: 'scaleY(1)', offset: 0 },
            { transform: 'scaleY(0.76)', offset: 0.24 },
            { transform: 'scaleY(1.12)', offset: 0.62 },
            { transform: 'scaleY(1)', offset: 1 }
          ]
        },
        hline: {
          origin: '12px 12px',
          easing: EASE.directional,
          keyframes: [
            { transform: 'scaleX(1)', offset: 0 },
            { transform: 'scaleX(0.76)', offset: 0.24 },
            { transform: 'scaleX(1.12)', offset: 0.62 },
            { transform: 'scaleX(1)', offset: 1 }
          ]
        }
      }
    },

    folder: {
      family: 'mechanical',
      duration: 1140,
      parts: {
        lid: {
          origin: '12px 5px',
          easing: EASE.mechanical,
          keyframes: [
            { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 0 },
            { transform: 'translate3d(0, -1.2px, 0) rotate(-11deg)', offset: 0.34 },
            { transform: 'translate3d(0, -1.0px, 0) rotate(-9.5deg)', offset: 0.58 },
            { transform: 'translate3d(0, 0.1px, 0) rotate(1.5deg)', offset: 0.84 },
            { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 1 }
          ]
        },
        body: {
          origin: '12px 21px',
          easing: EASE.settle,
          keyframes: [
            { transform: 'translate3d(0, 0, 0)', offset: 0 },
            { transform: 'translate3d(0, 0.25px, 0)', offset: 0.84 },
            { transform: 'translate3d(0, 0, 0)', offset: 1 }
          ]
        }
      }
    },

    trash: {
      family: 'mechanical',
      duration: 1020,
      parts: {
        lid: {
          origin: '19px 6px',
          easing: EASE.mechanical,
          keyframes: [
            { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 0 },
            { transform: 'translate3d(0, -1.8px, 0) rotate(14deg)', offset: 0.36 },
            { transform: 'translate3d(0, -1.5px, 0) rotate(12deg)', offset: 0.58 },
            { transform: 'translate3d(0, 0.15px, 0) rotate(-1.5deg)', offset: 0.84 },
            { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 1 }
          ]
        }
      }
    },

    flame: {
      family: 'organic',
      duration: 1260,
      parts: {
        outer: {
          origin: '12px 21px',
          easing: EASE.organic,
          keyframes: [
            { transform: 'skewX(0deg) scaleY(1)', offset: 0 },
            { transform: 'skewX(-3deg) scaleY(1.04)', offset: 0.28 },
            { transform: 'skewX(2.6deg) scaleY(1.02)', offset: 0.6 },
            { transform: 'skewX(-0.8deg) scaleY(0.995)', offset: 0.84 },
            { transform: 'skewX(0deg) scaleY(1)', offset: 1 }
          ]
        },
        tongue: {
          origin: '12px 17px',
          easing: EASE.organic,
          keyframes: [
            { transform: 'translate3d(0, 0, 0) scaleY(0.85)', opacity: 0, offset: 0 },
            { transform: 'translate3d(-0.4px, -2.2px, 0) scaleY(1.12)', opacity: 1, offset: 0.32 },
            { transform: 'translate3d(0.5px, -1.6px, 0) scaleY(1.04)', opacity: 0.9, offset: 0.64 },
            { transform: 'translate3d(0, 0, 0) scaleY(0.9)', opacity: 0, offset: 1 }
          ]
        }
      }
    },

    compass: {
      family: 'directional',
      duration: 1320,
      parts: {
        needle: {
          origin: '12px 12px',
          easing: EASE.mechanical,
          keyframes: [
            { transform: 'rotate(0deg)', offset: 0 },
            { transform: 'rotate(26deg)', offset: 0.32 },
            { transform: 'rotate(-10deg)', offset: 0.64 },
            { transform: 'rotate(3deg)', offset: 0.84 },
            { transform: 'rotate(0deg)', offset: 1 }
          ]
        }
      }
    },

    // ── Option Menu (5, trash shared above) ──
    pencil: {
      family: 'organic',
      duration: 1380,
      parts: {
        body: {
          origin: '2px 22px',
          easing: EASE.settle,
          keyframes: [
            { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 0 },
            { transform: 'translate3d(1.4px, -1.2px, 0) rotate(-5deg)', offset: 0.24 },
            { transform: 'translate3d(2.6px, 0px, 0) rotate(4deg)', offset: 0.5 },
            { transform: 'translate3d(1.1px, 1.0px, 0) rotate(-2deg)', offset: 0.74 },
            { transform: 'translate3d(0, 0, 0) rotate(0deg)', offset: 1 }
          ]
        }
      }
    },

    tag: {
      family: 'mechanical',
      duration: 1080,
      parts: {
        body: {
          origin: '7px 7px',
          easing: EASE.mechanical,
          keyframes: [
            { transform: 'rotate(0deg)', offset: 0 },
            { transform: 'rotate(12deg)', offset: 0.32 },
            { transform: 'rotate(-4.5deg)', offset: 0.64 },
            { transform: 'rotate(1.5deg)', offset: 0.84 },
            { transform: 'rotate(0deg)', offset: 1 }
          ]
        }
      }
    },

    copy: {
      family: 'mechanical',
      duration: 1080,
      parts: {
        back: {
          origin: '9px 9px',
          easing: EASE.mechanical,
          keyframes: [
            { transform: 'translate3d(0, 0, 0)', offset: 0 },
            { transform: 'translate3d(3.8px, 3.8px, 0)', offset: 0.38 },
            { transform: 'translate3d(-0.9px, -0.9px, 0)', offset: 0.74 },
            { transform: 'translate3d(0, 0, 0)', offset: 1 }
          ]
        },
        front: {
          origin: '15px 15px',
          easing: EASE.mechanical,
          keyframes: [
            { transform: 'translate3d(0, 0, 0)', offset: 0 },
            { transform: 'translate3d(-0.8px, -0.8px, 0)', offset: 0.38 },
            { transform: 'translate3d(0.35px, 0.35px, 0)', offset: 0.74 },
            { transform: 'translate3d(0, 0, 0)', offset: 1 }
          ]
        }
      }
    },

    download: {
      family: 'directional',
      duration: 960,
      parts: {
        arrow: {
          origin: '12px 12px',
          easing: EASE.directional,
          keyframes: [
            { transform: 'translate3d(0, 0, 0)', offset: 0 },
            { transform: 'translate3d(0, -1.2px, 0)', offset: 0.24 },
            { transform: 'translate3d(0, 2.6px, 0)', offset: 0.58 },
            { transform: 'translate3d(0, -0.3px, 0)', offset: 0.82 },
            { transform: 'translate3d(0, 0, 0)', offset: 1 }
          ]
        },
        tray: {
          origin: '12px 19px',
          easing: EASE.settle,
          keyframes: [
            { transform: 'translate3d(0, 0, 0)', offset: 0 },
            { transform: 'translate3d(0, 0, 0)', offset: 0.44 },
            { transform: 'translate3d(0, 1.0px, 0)', offset: 0.64 },
            { transform: 'translate3d(0, 0, 0)', offset: 1 }
          ]
        }
      }
    },

    // ── User Panel (5, trash shared above) ──
    profile: {
      family: 'organic',
      duration: 900,
      parts: {
        head: {
          origin: '12px 9px',
          easing: EASE.organic,
          keyframes: [
            { transform: 'translate3d(0, 0, 0)', offset: 0 },
            { transform: 'translate3d(0, -1.0px, 0)', offset: 0.42 },
            { transform: 'translate3d(0, 0, 0)', offset: 1 }
          ]
        },
        shoulders: {
          origin: '12px 18px',
          easing: EASE.organic,
          keyframes: [
            { transform: 'scaleX(1)', offset: 0 },
            { transform: 'scaleX(1.06)', offset: 0.45 },
            { transform: 'scaleX(1)', offset: 1 }
          ]
        }
      }
    },

    upgrade: {
      family: 'directional',
      duration: 960,
      parts: {
        arrow: {
          origin: '12px 12px',
          easing: EASE.directional,
          keyframes: [
            { transform: 'translate3d(0, 0, 0)', offset: 0 },
            { transform: 'translate3d(0, -2.8px, 0)', offset: 0.46 },
            { transform: 'translate3d(0, 0.4px, 0)', offset: 0.8 },
            { transform: 'translate3d(0, 0, 0)', offset: 1 }
          ]
        }
      }
    },

    settings: {
      family: 'mechanical',
      duration: 1140,
      parts: {
        gear: {
          origin: '12px 12px',
          easing: EASE.mechanical,
          keyframes: [
            { transform: 'rotate(0deg)', offset: 0 },
            { transform: 'rotate(30deg)', offset: 0.46 },
            { transform: 'rotate(-4deg)', offset: 0.78 },
            { transform: 'rotate(0deg)', offset: 1 }
          ]
        }
      }
    },

    logout: {
      family: 'directional',
      duration: 900,
      parts: {
        arrow: {
          origin: '9px 12px',
          easing: EASE.directional,
          keyframes: [
            { transform: 'translate3d(0, 0, 0)', offset: 0 },
            { transform: 'translate3d(-2.8px, 0, 0)', offset: 0.46 },
            { transform: 'translate3d(0.35px, 0, 0)', offset: 0.8 },
            { transform: 'translate3d(0, 0, 0)', offset: 1 }
          ]
        }
      }
    }
  };

  function resolveSvg(target) {
    if (!target) return null;
    if (target.tagName && target.tagName.toLowerCase() === 'svg') return target;
    return target.querySelector?.('svg[data-im-icon]') || null;
  }

  function clearTracking(svg, entry) {
    const set = activeAnimations.get(svg);
    if (!set) return;
    set.delete(entry);
    if (set.size === 0) activeAnimations.delete(svg);
  }

  function cancel(target) {
    const svg = resolveSvg(target);
    if (!svg) return;
    const set = activeAnimations.get(svg);
    if (!set) return;
    for (const entry of Array.from(set)) {
      try { entry.anim.cancel(); } catch (_) {}
    }
    activeAnimations.delete(svg);
  }

  function reverse(target, duration = 450) {
    const svg = resolveSvg(target);
    if (!svg) return;
    const set = activeAnimations.get(svg);
    if (!set || set.size === 0) return;

    const running = Array.from(set).filter(entry => entry.anim?.playState === 'running');
    if (running.length === 0) {
      cancel(svg);
      return;
    }

    if (isReducedMotion()) {
      cancel(svg);
      return;
    }

    const snapshots = running.map(entry => {
      const style = root.getComputedStyle?.(entry.part);
      const transform = style?.transform && style.transform !== 'none' ? style.transform : 'none';
      const opacity = entry.hasOpacity && style?.opacity !== undefined ? Number(style.opacity) : null;
      return { part: entry.part, transform, opacity, origin: entry.origin, restOpacity: entry.restOpacity };
    });

    cancel(svg);

    const nextSet = new Set();
    for (const snap of snapshots) {
      if (typeof snap.part.animate !== 'function') continue;
      if (snap.origin) snap.part.style.transformOrigin = snap.origin;
      snap.part.style.transformBox = 'view-box';
      const fromFrame = { transform: snap.transform };
      const toFrame = { transform: 'none' };
      if (snap.opacity !== null) {
        fromFrame.opacity = snap.opacity;
        toFrame.opacity = snap.restOpacity ?? 0;
      }
      const anim = snap.part.animate([fromFrame, toFrame], {
        duration,
        easing: EASE.mechanical,
        fill: 'none'
      });
      const entry = { part: snap.part, anim, hasOpacity: snap.opacity !== null, origin: snap.origin, restOpacity: snap.restOpacity };
      nextSet.add(entry);
      const done = () => clearTracking(svg, entry);
      anim.onfinish = done;
      anim.oncancel = done;
    }
    if (nextSet.size > 0) activeAnimations.set(svg, nextSet);
  }

  function play(target, motionName, opts = {}) {
    const svg = resolveSvg(target);
    if (!svg) return false;
    const name = motionName || svg.dataset?.imIcon;
    const def = MOTIONS[name];
    if (!def) return false;

    cancel(svg);
    if (isReducedMotion()) return false;

    const duration = Number.isFinite(opts.duration) ? opts.duration : def.duration;
    const set = new Set();

    for (const [partName, spec] of Object.entries(def.parts)) {
      const parts = svg.querySelectorAll?.(`[data-im-part="${partName}"]`);
      if (!parts || parts.length === 0) continue;

      const hasOpacity = spec.keyframes.some(frame => frame.opacity !== undefined);
      const restOpacity = hasOpacity ? (spec.keyframes[spec.keyframes.length - 1].opacity ?? 1) : undefined;

      parts.forEach(part => {
        if (typeof part.animate !== 'function') return;
        if (spec.origin) part.style.transformOrigin = spec.origin;
        part.style.transformBox = 'view-box';
        const anim = part.animate(spec.keyframes, {
          duration,
          easing: spec.easing || EASE[def.family] || EASE.settle,
          fill: 'none'
        });
        const entry = { part, anim, hasOpacity, origin: spec.origin, restOpacity };
        set.add(entry);
        const done = () => clearTracking(svg, entry);
        anim.onfinish = done;
        anim.oncancel = done;
      });
    }

    if (set.size > 0) {
      activeAnimations.set(svg, set);
      return true;
    }
    return false;
  }

  function cleanup(container) {
    if (!container) return;
    const svgs = container.querySelectorAll?.('svg[data-im-icon]') || [];
    svgs.forEach(svg => cancel(svg));
  }

  /**
   * Bind Desktop hover & focus-visible icon motion on a menu/panel container.
   * Touch pointers are excluded here so SurfaceMorph virtual hover owns touch.
   */
  function bindHoverContainer(container, options = {}) {
    if (!container || boundContainers.has(container)) {
      return boundContainers.get(container) || (() => {});
    }

    const itemSelector = options.itemSelector || 'button, a[href], .morph-item, .up-btn';
    const canAnimate = options.canAnimate || (() => true);
    let activeItem = null;

    const isItemDisabled = (item) =>
      !item || item.disabled || item.getAttribute?.('aria-disabled') === 'true' || item.closest?.('[hidden], [inert]');

    const activateItem = (item) => {
      if (!item || isItemDisabled(item) || !canAnimate(item)) return;
      if (activeItem && activeItem !== item) {
        reverse(activeItem);
      }
      activeItem = item;
      play(item);
    };

    const deactivateItem = (item) => {
      if (!item) return;
      if (activeItem === item) activeItem = null;
      reverse(item);
    };

    const onPointerOver = (event) => {
      if (event.pointerType === 'touch') return;
      const item = event.target?.closest?.(itemSelector);
      if (!item || !container.contains(item) || item === activeItem) return;
      activateItem(item);
    };

    const onPointerOut = (event) => {
      if (event.pointerType === 'touch') return;
      const item = event.target?.closest?.(itemSelector);
      if (!item || !container.contains(item)) return;
      const related = event.relatedTarget;
      if (related && item.contains(related)) return;
      deactivateItem(item);
    };

    const onFocusIn = (event) => {
      const item = event.target?.closest?.(itemSelector);
      if (!item || !container.contains(item)) return;
      let focusVisible = false;
      try { focusVisible = !!item.matches?.(':focus-visible'); } catch (_) {}
      if (focusVisible) activateItem(item);
    };

    const onFocusOut = (event) => {
      const item = event.target?.closest?.(itemSelector);
      if (!item || !container.contains(item)) return;
      const related = event.relatedTarget;
      if (related && item.contains(related)) return;
      deactivateItem(item);
    };

    container.addEventListener('pointerover', onPointerOver);
    container.addEventListener('pointerout', onPointerOut);
    container.addEventListener('focusin', onFocusIn);
    container.addEventListener('focusout', onFocusOut);

    const dispose = () => {
      container.removeEventListener('pointerover', onPointerOver);
      container.removeEventListener('pointerout', onPointerOut);
      container.removeEventListener('focusin', onFocusIn);
      container.removeEventListener('focusout', onFocusOut);
      cleanup(container);
      boundContainers.delete(container);
    };

    boundContainers.set(container, dispose);
    return dispose;
  }

  const api = {
    MOTIONS,
    play,
    reverse,
    cancel,
    cleanup,
    bindHoverContainer,
    isReducedMotion
  };

  root.IconMotion = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
