/**
 * StoryboardAI — Project Cover Transition Module (Project Reveal)
 * 
 * 負責專案卡片點擊後的 Shared Element 封面轉場 (Project Reveal Transition)：
 * - 封面從 16:9 卡片抽出並 morph 至專案真實比例 (Flight Morph, 520ms)
 * - 導航至專案工作區 (200ms SPA navigate)
 * - 等待工作區第一鏡就緒 (Center Hold & State: 'waiting-project')
 * - 飛行封面等比縮放並滑行歸位至第一鏡畫面 (Return Anim, 380ms)
 * - 無縫淡出過渡 (Crossfade Handoff, 90ms)
 * - 失敗或取消時的優雅縮回降級 (Legacy Shrink Fallback, 380ms)
 * - 跨頁切換、銷毀時的即時清理 (Immediate Teardown)
 * 
 * 符合 StoryboardAI Design System & P4-4 規範：
 * - 嚴格保留原演算法、幾何計算與動畫時序
 * - 提供 window.ProjectCoverTransition 及向下相容 bridge
 */

(function (root) {
  'use strict';

  // Active transition tracking
  let activeTransitionSession = null;

  function removeNode(node) {
    if (!node) return;
    const parent = node.parentNode || node.parentElement;
    if (parent && typeof parent.removeChild === 'function') {
      parent.removeChild(node);
    } else if (typeof node.remove === 'function') {
      node.remove();
    }
  }

  function parseAspectRatio(ratioInput, width, height) {
    if (root && root.ProjectCard?.parseAspectRatio) {
      return root.ProjectCard.parseAspectRatio(ratioInput, width, height);
    }
    if (typeof window !== 'undefined' && window.ProjectCard?.parseAspectRatio) {
      return window.ProjectCard.parseAspectRatio(ratioInput, width, height);
    }
    return 16 / 9;
  }

  function calculateTransitionTargetSize(options) {
    if (root && root.ProjectCard?.calculateTransitionTargetSize) {
      return root.ProjectCard.calculateTransitionTargetSize(options);
    }
    if (typeof window !== 'undefined' && window.ProjectCard?.calculateTransitionTargetSize) {
      return window.ProjectCard.calculateTransitionTargetSize(options);
    }
    return { width: 760, height: 427.5, left: 100, top: 100, aspectRatio: 16 / 9 };
  }

  function getContainedImageRect(img) {
    if (root && root.ProjectCard?.getContainedImageRect) {
      return root.ProjectCard.getContainedImageRect(img);
    }
    if (typeof window !== 'undefined' && window.ProjectCard?.getContainedImageRect) {
      return window.ProjectCard.getContainedImageRect(img);
    }
    return img ? (img.getBoundingClientRect ? img.getBoundingClientRect() : null) : null;
  }

  /**
   * 啟動專案封面轉場動畫
   * @param {HTMLElement} card 
   * @param {Object} p 
   * @param {Object} [options]
   */
  function launch(card, p, options = {}) {
    if (!card || !p) return null;
    if (card.classList && card.classList.contains('is-navigating')) return null;
    if (card.classList) card.classList.add('is-navigating');

    // Close any active option morph immediately
    const pom = (typeof window !== 'undefined' && window.ProjectOptionMorph) || (root && root.ProjectOptionMorph);
    if (pom && typeof pom.isOpen === 'function' && pom.isOpen()) {
      pom.close('immediate');
    } else if (typeof root.closeGlobalOptionMorph === 'function') {
      root.closeGlobalOptionMorph();
    } else if (typeof window !== 'undefined' && typeof window.closeGlobalOptionMorph === 'function') {
      window.closeGlobalOptionMorph();
    }

    // Cancel any previous active transition
    if (activeTransitionSession && typeof activeTransitionSession.cancel === 'function') {
      activeTransitionSession.cancel();
    }

    const navFn = options.navigate || (typeof window !== 'undefined' && (window.navigate || window.spaNavigate)) || (typeof root.navigate === 'function' ? root.navigate : null);

    const folderShell = card.querySelector ? card.querySelector('.project-folder-shell') : null;
    const primaryCover = card.querySelector ? card.querySelector('.project-preview-primary') : null;
    if (!folderShell || !primaryCover) {
      if (typeof navFn === 'function') {
        navFn('project', { id: p.id });
      } else if (typeof window !== 'undefined' && window.location) {
        window.location.hash = `#/project/${encodeURIComponent(p.id)}`;
      }
      return null;
    }

    // 1. App-Level Transition Layer (strictly outside page-main, child of body)
    let transitionLayer = document.getElementById('transition-layer');
    if (!transitionLayer || transitionLayer.parentElement !== document.body) {
      if (transitionLayer) removeNode(transitionLayer);
      transitionLayer = document.createElement('div');
      transitionLayer.id = 'transition-layer';
      transitionLayer.className = 'app-transition-layer';
      document.body.appendChild(transitionLayer);
    }

    if (card.classList) card.classList.add('is-expanded');

    // Spec Section 7 & 8: Transition Origin is the current 16:9 preview frame!
    const curRect = primaryCover.getBoundingClientRect ? primaryCover.getBoundingClientRect() : { width: 282, height: 158.6, left: 100, top: 100 };
    const startW = curRect.width || 282;
    const startH = curRect.height || 158.6;
    const startLeft = curRect.left || 0;
    const startTop = curRect.top || 0;

    // Spec Section 2: Project True Ratio
    const projectRatio = parseAspectRatio(
      primaryCover.dataset?.trueRatio || primaryCover.dataset?.ratio || p.ratio,
      p.width,
      p.height
    );

    // Spec Section 10: Calculate True Ratio Target Size
    const viewportWidth = (typeof window !== 'undefined' && window.innerWidth) || 1200;
    const viewportHeight = (typeof window !== 'undefined' && window.innerHeight) || 800;
    const targetGeom = calculateTransitionTargetSize({
      aspectRatio: projectRatio,
      viewportWidth,
      viewportHeight
    });
    const targetW = targetGeom.width;
    const targetH = targetGeom.height;
    const targetLeft = targetGeom.left;
    const targetTop = targetGeom.top;

    // 2. Folder Shell & Secondary Preview drop down and fade out
    if (folderShell.style) {
      folderShell.style.transition = 'transform 300ms cubic-bezier(.4, 0, .2, 1), opacity 240ms ease';
      folderShell.style.transform = 'translateY(32px)';
      folderShell.style.opacity = '0';
    }

    const secondary = card.querySelector ? card.querySelector('.project-preview-secondary') : null;
    if (secondary && secondary.style) {
      secondary.style.transition = 'opacity 200ms ease, transform 240ms ease';
      secondary.style.opacity = '0';
      secondary.style.transform = 'translateY(20px) scale(0.92)';
    }

    // 3. Spec Section 8: Transition Flying Cover in App-Level Layer
    const flyingCover = document.createElement('div');
    flyingCover.className = 'project-reveal-curtain';
    flyingCover.style.position = 'fixed';
    flyingCover.style.left = `${startLeft}px`;
    flyingCover.style.top = `${startTop}px`;
    flyingCover.style.width = `${startW}px`;
    flyingCover.style.height = `${startH}px`;
    flyingCover.style.zIndex = '999999';
    flyingCover.style.borderRadius = '14px';
    flyingCover.style.border = '1px solid rgba(255, 255, 255, 0.45)';
    flyingCover.style.overflow = 'hidden';
    flyingCover.style.boxShadow = '0 16px 36px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.35)';
    flyingCover.style.transformOrigin = '45% 100%'; // Spec Section 12
    flyingCover.style.background = '#0f172a';
    flyingCover.style.boxSizing = 'border-box';

    const mainImgEl = primaryCover.querySelector
      ? (primaryCover.querySelector('.project-preview-primary-image') ||
         primaryCover.querySelector('.cover-main') ||
         primaryCover.querySelector('img.lazy-thumb') ||
         primaryCover.querySelector('img'))
      : null;

    let bgImg = null;
    let frostedOverlay = null;
    let mainImgWrap = null;
    let mainImgClone = null;
    const isContain = projectRatio < (16 / 9) - 0.01;

    if (mainImgEl && mainImgEl.src) {
      if (isContain) {
        if (flyingCover.classList) flyingCover.classList.add('is-contain-shell');
        flyingCover.style.background = '#ffffff';

        // Background Layer Morph (Section 4 & 14 - Light White Frosted Material)
        bgImg = document.createElement('img');
        bgImg.src = mainImgEl.src;
        bgImg.className = 'cover-background transition-cover-bg';
        bgImg.style.cssText = 'position: absolute; inset: -12px; width: calc(100% + 24px); height: calc(100% + 24px); object-fit: cover; filter: blur(24px) saturate(.95) brightness(1.06); transform: scale(1.10); opacity: 0.42; pointer-events: none; border-radius: inherit; z-index: 1;';
        flyingCover.appendChild(bgImg);

        frostedOverlay = document.createElement('div');
        frostedOverlay.className = 'transition-cover-overlay';
        frostedOverlay.style.cssText = 'position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255, 255, 255, 0.58) 0%, rgba(248, 250, 252, 0.48) 100%); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); pointer-events: none; border-radius: inherit; z-index: 1;';
        flyingCover.appendChild(frostedOverlay);

        // Main Image Inner Wrap for seamless crop morph (Section 15)
        const innerW_start = Math.round(startH * projectRatio * 10) / 10;
        const innerH_start = startH;

        mainImgWrap = document.createElement('div');
        mainImgWrap.className = 'cover-main-wrap transition-cover-media';
        mainImgWrap.style.cssText = `position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: ${innerW_start}px; height: ${innerH_start}px; overflow: hidden; border-radius: inherit; z-index: 2; display: flex; align-items: center; justify-content: center;`;

        mainImgClone = document.createElement('img');
        mainImgClone.src = mainImgEl.src;
        mainImgClone.className = 'cover-main transition-cover-image';
        mainImgClone.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block; border-radius: inherit; filter: drop-shadow(0 4px 14px rgba(15, 23, 42, 0.10));';
        mainImgWrap.appendChild(mainImgClone);
        flyingCover.appendChild(mainImgWrap);
      } else {
        // Section 3 & 17: projectRatio >= 16/9
        mainImgWrap = document.createElement('div');
        mainImgWrap.className = 'cover-main-wrap transition-cover-media';
        mainImgWrap.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; border-radius: inherit; z-index: 2; display: flex; align-items: center; justify-content: center;';

        mainImgClone = document.createElement('img');
        mainImgClone.src = mainImgEl.src;
        mainImgClone.className = 'cover-main transition-cover-image';
        mainImgClone.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block; border-radius: inherit;';
        mainImgWrap.appendChild(mainImgClone);
        flyingCover.appendChild(mainImgWrap);
      }
    } else {
      flyingCover.innerHTML = primaryCover.innerHTML;
    }

    const scrim = document.createElement('div');
    scrim.className = 'project-reveal-scrim';
    transitionLayer.appendChild(scrim);
    transitionLayer.appendChild(flyingCover);

    if (primaryCover.style) primaryCover.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      if (scrim.style) scrim.style.opacity = '1';
    });

    // Transition Session Controller (Shared Element State Machine)
    const session = {
      id: `cover-trans-${p.id}-${Date.now()}`,
      projectId: p.id,
      targetRoute: `/project/${p.id}`,
      card,
      primaryCover,
      folderShell,
      secondary,
      flyingCover,
      scrim,
      flightAnim: null,
      targetLeft,
      targetTop,
      targetW,
      targetH,
      state: 'extracting', // 'extracting' | 'flying' | 'waiting-project' | 'returning' | 'handoff' | 'complete' | 'cancelled'
      cancelled: false,
      pendingTarget: null,

      onFirstShotReady(targetWrap, targetImg) {
        if (this.state === 'complete' || this.state === 'returning' || this.cancelled) return;
        if (this.state === 'extracting' || this.state === 'flying') {
          this.pendingTarget = { targetWrap, targetImg };
          return;
        }
        this.executeReturn(targetWrap, targetImg);
      },

      executeReturn(targetWrap, targetImg) {
        if (this.state === 'complete' || this.state === 'returning' || this.cancelled) return;
        this.state = 'returning';

        // Wait 2 requestAnimationFrame frames to guarantee layout stability
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (this.cancelled || this.state === 'complete') return;
            if (!targetWrap || (targetWrap.isConnected !== undefined && !targetWrap.isConnected)) {
              this.cancel();
              return;
            }

            // Plan Section 3 & 4: Get actual visible contained image rect
            const imgEl = targetImg || (targetWrap.querySelector ? targetWrap.querySelector('img') : null) || targetWrap;
            const targetRect = getContainedImageRect(imgEl) || (targetWrap.getBoundingClientRect ? targetWrap.getBoundingClientRect() : null);
            if (!targetRect || targetRect.width <= 0 || targetRect.height <= 0) {
              this.cancel();
              return;
            }

            // Plan Section 1: Lock Cover Dimensions from Center Hold
            const sourceRect = this.flyingCover?.getBoundingClientRect ? this.flyingCover.getBoundingClientRect() : null;
            if (!sourceRect || sourceRect.width <= 0 || sourceRect.height <= 0) {
              this.cancel();
              return;
            }

            // Plan Section 2: Uniform Scale & Translation
            const scale = targetRect.width / sourceRect.width;
            const dx = targetRect.left - sourceRect.left;
            const dy = targetRect.top - sourceRect.top;

            if (this.flyingCover?.style) {
              this.flyingCover.style.transformOrigin = 'top left';
            }

            // Scrim fades out smoothly
            if (this.scrim && this.scrim.style) {
              this.scrim.style.transition = 'opacity 320ms cubic-bezier(.4, 0, .2, 1)';
              this.scrim.style.opacity = '0';
            }

            // Plan Section 6: First Shot remains hidden during return
            if (targetWrap.style) {
              targetWrap.style.opacity = '0';
            }

            const endRadius = Math.max(2, Math.round(8 / scale));

            // Plan Section 2 & 9: Return ONLY animates translate + uniform scale + border-radius + shadow.
            if (!this.flyingCover || typeof this.flyingCover.animate !== 'function') {
              this.cleanup();
              return;
            }

            const returnAnim = this.flyingCover.animate([
              {
                transform: 'translate(0px, 0px) scale(1)',
                borderRadius: '10px',
                boxShadow: '0 32px 80px rgba(0, 0, 0, 0.45)'
              },
              {
                transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
                borderRadius: `${endRadius}px`,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)'
              }
            ], {
              duration: 380,
              easing: 'cubic-bezier(.4, 0, .2, 1)',
              fill: 'forwards'
            });

            returnAnim.onfinish = () => {
              if (this.cancelled) return;
              this.state = 'handoff';

              // Plan Section 7: Seamless handoff (60~120ms crossfade)
              if (targetWrap) {
                if (targetWrap.classList) targetWrap.classList.remove('is-transition-target');
                if (targetWrap.style) {
                  targetWrap.style.transition = 'opacity 90ms ease';
                  targetWrap.style.opacity = '1';
                }
              }

              if (!this.flyingCover || typeof this.flyingCover.animate !== 'function') {
                this.cleanup();
                return;
              }

              const crossFade = this.flyingCover.animate([
                { opacity: 1 },
                { opacity: 0 }
              ], {
                duration: 90,
                fill: 'forwards'
              });

              crossFade.onfinish = () => {
                this.cleanup();
              };
            };
          });
        });
      },

      cancel() {
        if (this.state === 'complete' || this.cancelled) return;
        this.cancelled = true;
        this.state = 'cancelled';
        this.runLegacyCoverShrink();
      },

      fallbackDismiss() {
        this.cancel();
      },

      runLegacyCoverShrink() {
        if (this.state === 'complete') return;
        this.state = 'cancelled';

        if (this.flightAnim) {
          try { this.flightAnim.cancel(); } catch (e) {}
        }

        if (this.scrim && this.scrim.style) {
          this.scrim.style.transition = 'opacity 300ms ease';
          this.scrim.style.opacity = '0';
        }

        if (!this.flyingCover || typeof this.flyingCover.animate !== 'function') {
          this.cleanup();
          return;
        }

        const exitAnim = this.flyingCover.animate([
          { transform: 'scale(1)', opacity: 1 },
          { offset: 0.22, transform: 'scale(1.015)', opacity: 0.98 },
          { offset: 1, transform: 'scale(0.92) translateY(12px)', opacity: 0 }
        ], {
          duration: 380,
          easing: 'cubic-bezier(0.36, 0, 0.66, -0.56)', // --motion-ease-anticipate
          fill: 'forwards'
        });

        exitAnim.onfinish = () => {
          this.cleanup();
          const targetWrap = document.querySelector ? document.querySelector('.shot-cell-thumb-wrap.is-transition-target') : null;
          if (targetWrap) {
            if (targetWrap.classList) targetWrap.classList.remove('is-transition-target');
            if (targetWrap.style) targetWrap.style.opacity = '1';
          }
        };
      },

      cleanup() {
        if (this.state === 'complete') return;
        this.state = 'complete';

        removeNode(this.scrim);
        this.scrim = null;

        removeNode(this.flyingCover);
        this.flyingCover = null;

        removeNode(frostedOverlay);
        frostedOverlay = null;

        if (this.primaryCover && this.primaryCover.style) this.primaryCover.style.visibility = '';
        if (this.folderShell && this.folderShell.style) {
          this.folderShell.style.transform = '';
          this.folderShell.style.opacity = '';
        }
        if (this.secondary && this.secondary.style) {
          this.secondary.style.opacity = '';
          this.secondary.style.transform = '';
        }
        if (this.card && this.card.classList) {
          this.card.classList.remove('is-navigating', 'is-expanded');
        }

        if (activeTransitionSession === this) {
          activeTransitionSession = null;
        }
        if (typeof window !== 'undefined') {
          if (window._activeProjectTransition === this) window._activeProjectTransition = null;
          if (window.currentCoverTransition === this) window.currentCoverTransition = null;
        }
        if (typeof global !== 'undefined') {
          if (global._activeProjectTransition === this) global._activeProjectTransition = null;
          if (global.currentCoverTransition === this) global.currentCoverTransition = null;
        }
        if (root && root !== window) {
          if (root._activeProjectTransition === this) root._activeProjectTransition = null;
          if (root.currentCoverTransition === this) root.currentCoverTransition = null;
        }
      }
    };

    activeTransitionSession = session;
    if (typeof window !== 'undefined') {
      window.currentCoverTransition = session;
      window._activeProjectTransition = session;
    }
    if (typeof global !== 'undefined') {
      global.currentCoverTransition = session;
      global._activeProjectTransition = session;
    }
    if (root && root !== window) {
      root.currentCoverTransition = session;
      root._activeProjectTransition = session;
    }

    // Spec Section 18: Trigger SPA Navigation at ~200ms (~40% into flight morph)
    let navTriggered = false;
    const triggerNav = () => {
      if (!navTriggered) {
        navTriggered = true;
        if (typeof navFn === 'function') {
          navFn('project', { id: p.id });
        } else if (typeof window !== 'undefined' && window.location) {
          window.location.hash = `#/project/${encodeURIComponent(p.id)}`;
        }
      }
    };
    setTimeout(triggerNav, 200);

    // Spec Section 9, 11, 12, 13: Flight Morph Keyframes (0 - 520ms)
    session.state = 'flying';
    const flightKeyframes = [
      {
        offset: 0,
        left: `${startLeft}px`,
        top: `${startTop}px`,
        width: `${startW}px`,
        height: `${startH}px`,
        transform: 'rotate(-4.5deg) scale(1)',
        borderRadius: '14px',
        borderWidth: '1px',
        boxShadow: '0 16px 36px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.35)'
      },
      {
        offset: 0.20,
        left: `${startLeft + (targetLeft - startLeft) * 0.12}px`,
        top: `${startTop - 28}px`,
        width: `${startW}px`,
        height: `${startH}px`,
        transform: 'rotate(-3.5deg) scale(1.02)',
        borderRadius: '13px',
        borderWidth: '1px',
        boxShadow: '0 24px 52px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.25)'
      },
      {
        offset: 0.60,
        left: `${startLeft + (targetLeft - startLeft) * 0.78}px`,
        top: `${Math.min(startTop, targetTop) - 14 + (targetTop - startTop) * 0.65}px`,
        width: `${targetW}px`,
        height: `${targetH}px`,
        transform: 'rotate(-0.8deg) scale(1.01)',
        borderRadius: '10px',
        borderWidth: '0.5px',
        boxShadow: '0 32px 72px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.15)'
      },
      {
        offset: 1,
        left: `${targetLeft}px`,
        top: `${targetTop}px`,
        width: `${targetW}px`,
        height: `${targetH}px`,
        transform: 'rotate(0deg) scale(1)',
        borderRadius: '10px',
        borderWidth: '0px',
        boxShadow: '0 32px 80px rgba(0, 0, 0, 0.45), 0 0 0 0px rgba(255, 255, 255, 0)'
      }
    ];

    if (typeof flyingCover.animate === 'function') {
      const anim = flyingCover.animate(flightKeyframes, {
        duration: 520,
        easing: 'cubic-bezier(.4, 0, .2, 1)',
        fill: 'forwards'
      });
      session.flightAnim = anim;

      // Background Layer Morph (20%: 0.42 -> 40%: 0.18 -> 60%: 0)
      if (bgImg && typeof bgImg.animate === 'function') {
        bgImg.animate([
          { offset: 0, opacity: 0.42 },
          { offset: 0.20, opacity: 0.42 },
          { offset: 0.40, opacity: 0.18 },
          { offset: 0.60, opacity: 0 },
          { offset: 1, opacity: 0 }
        ], {
          duration: 520,
          easing: 'cubic-bezier(.4, 0, .2, 1)',
          fill: 'forwards'
        });
      }

      if (frostedOverlay && typeof frostedOverlay.animate === 'function') {
        frostedOverlay.animate([
          { offset: 0, opacity: 1 },
          { offset: 0.20, opacity: 1 },
          { offset: 0.40, opacity: 0.4 },
          { offset: 0.60, opacity: 0 },
          { offset: 1, opacity: 0 }
        ], {
          duration: 520,
          easing: 'cubic-bezier(.4, 0, .2, 1)',
          fill: 'forwards'
        });
      }

      // Spec Section 15: Main Image Inner Wrap Morph
      if (mainImgWrap && isContain && typeof mainImgWrap.animate === 'function') {
        const innerW_start = Math.round(startH * projectRatio * 10) / 10;
        const innerH_start = startH;

        mainImgWrap.animate([
          { offset: 0, width: `${innerW_start}px`, height: `${innerH_start}px` },
          { offset: 0.20, width: `${innerW_start}px`, height: `${innerH_start}px` },
          { offset: 0.60, width: `${targetW}px`, height: `${targetH}px` },
          { offset: 1, width: `${targetW}px`, height: `${targetH}px` }
        ], {
          duration: 520,
          easing: 'cubic-bezier(.4, 0, .2, 1)',
          fill: 'forwards'
        });
      }

      // Spec Section 19: Center Hold & Wait for First Shot Ready
      anim.onfinish = () => {
        triggerNav(); // Safety fallback

        if (session.state === 'complete' || session.cancelled) return;

        // Settle fixed in center with true project ratio
        flyingCover.style.left = `${targetLeft}px`;
        flyingCover.style.top = `${targetTop}px`;
        flyingCover.style.width = `${targetW}px`;
        flyingCover.style.height = `${targetH}px`;
        flyingCover.style.transform = 'none';
        flyingCover.style.borderRadius = '10px';
        flyingCover.style.borderWidth = '0px';
        flyingCover.style.opacity = '1';
        flyingCover.style.background = 'transparent';

        if (bgImg) removeNode(bgImg);
        bgImg = null;
        if (frostedOverlay) removeNode(frostedOverlay);
        frostedOverlay = null;

        // Normalize Media Layer completely at Center Hold
        if (mainImgWrap && mainImgWrap.style) {
          mainImgWrap.style.position = 'relative';
          mainImgWrap.style.inset = '0';
          mainImgWrap.style.left = '0';
          mainImgWrap.style.top = '0';
          mainImgWrap.style.width = '100%';
          mainImgWrap.style.height = '100%';
          mainImgWrap.style.transform = 'none';
          mainImgWrap.style.display = 'flex';
          mainImgWrap.style.alignItems = 'center';
          mainImgWrap.style.justifyContent = 'center';
          mainImgWrap.style.overflow = 'hidden';
        }
        if (mainImgClone && mainImgClone.style) {
          mainImgClone.style.width = '100%';
          mainImgClone.style.height = '100%';
          mainImgClone.style.objectFit = 'contain';
          mainImgClone.style.objectPosition = 'center';
          mainImgClone.style.transform = 'none';
          mainImgClone.style.filter = 'none';
          mainImgClone.style.display = 'block';
        }

        session.state = 'waiting-project';

        // If First Shot already arrived while extracting/flight, execute return immediately
        if (session.pendingTarget) {
          const { targetWrap, targetImg } = session.pendingTarget;
          session.pendingTarget = null;
          session.executeReturn(targetWrap, targetImg);
        }
      };
    } else {
      // Headless / Non-animation fallback
      triggerNav();
      session.state = 'waiting-project';
    }

    return session;
  }

  function getActiveTransition(projectId) {
    if (activeTransitionSession) {
      if (!projectId || String(activeTransitionSession.projectId) === String(projectId)) {
        return activeTransitionSession;
      }
    }
    return null;
  }

  function cancel(projectId) {
    const active = getActiveTransition(projectId);
    if (active) {
      active.cancel();
    }
  }

  function cleanup() {
    if (activeTransitionSession) {
      activeTransitionSession.cleanup();
    }
  }

  const ProjectCoverTransition = {
    launch,
    getActiveTransition,
    cancel,
    cleanup
  };

  // Mount on global window / root
  const rootObj = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : root);

  function createBridges(target) {
    if (!target) return;
    target.ProjectCoverTransition = ProjectCoverTransition;
    target.launchProjectRevealTransition = function launchProjectRevealTransition(card, p, options) {
      return ProjectCoverTransition.launch(card, p, options);
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
    module.exports = ProjectCoverTransition;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
