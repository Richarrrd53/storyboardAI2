/** Dynamic Mask for scroll content, with independent navigation backdrops.
 * Generic vertical/horizontal containers keep their original opacity fade.
 * Header blur stays above the masked content; bottom blur is opt-in via nav presence.
 */
(function (window, document) {
  'use strict';
  if (window.DynamicMaskSystem) return;

  const instances = new Map();
  const headerHosts = new WeakMap();
  const blurHosts = new WeakMap();
  const maskSelector = '[data-dynamic-mask], [data-progressive-blur], .dynamic-gradient-mask, .content-body, .page-scroll';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const edgePattern = { topBase: 48, topTransition: 24, bottomBase: 88, bottomExtension: 64 };
  let bottomNavigation = { enabled: false, progress: 1, extent: 152 };

  class DynamicMask {
    constructor(element, options = {}) {
      this.element = element;
      this.options = Object.assign({
        maskSize: 36, // 遮罩預設高度/寬度 (px)
        direction: 'vertical', // 'vertical' | 'horizontal'
        edgeMode: 'auto', // 'auto' | 'both' | 'bottom'
        scrollElement: null, // 自訂滾動元素 (若容器本身不滾動但內部滾動)
        activeClass: 'has-dynamic-mask'
      }, options);

      // 支援從 HTML 屬性覆寫設定
      if (element.dataset) {
        if (element.dataset.maskSize) {
          const s = parseFloat(element.dataset.maskSize);
          if (!isNaN(s)) this.options.maskSize = s;
        }
        if (element.dataset.maskDirection) {
          this.options.direction = element.dataset.maskDirection;
        }
        if (element.dataset.maskEdges) this.options.edgeMode = element.dataset.maskEdges;
      }

      this.scrollElement = this.resolveScrollElement();
      this.rafId = null;
      this.headerLayoutDirty = true;
      this.geometryDirty = true;
      this.edges = new Map();
      this.hiddenDistance = 0;
      this.directionDistance = 0;
      this.lastTop = this.scrollElement.scrollTop || 0;
      this.lastTime = performance.now();
      this.direction = 0;

      this.onScroll = this.onScroll.bind(this);
      this.scheduleUpdate = this.scheduleUpdate.bind(this);

      this.init();
    }

    resolveScrollElement() {
      if (this.options.scrollElement) {
        if (typeof this.options.scrollElement === 'string') {
          return document.querySelector(this.options.scrollElement) || this.element;
        }
        return this.options.scrollElement;
      }
      return this.element;
    }

    init() {
      if (!this.element || !this.scrollElement) return;

      this.overlayHost = this.element.parentElement || document.body;
      this.element.classList.add(this.options.activeClass);
      this.clearMask();

      // 監聽滾動事件 (使用 passive 以保證最高幀率)
      this.scrollElement.addEventListener('scroll', this.onScroll, { passive: true });
      this.scrollElement.addEventListener('load', this.scheduleUpdate, true);

      // 監聽視窗或內部尺寸變化
      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => {
          // Compact subtitle animations resize the header, but must never
          // re-enter the flow measurement / scroll compensation cycle.
          this.geometryDirty = true;
          if (this.measuredWidth !== this.element.clientWidth) this.headerLayoutDirty = true;
          this.scheduleUpdate();
        });
        this.resizeObserver.observe(this.element);
        this.resizeContentTargets = new Set();
        this.observeContentSize();
        if (this.scrollElement !== this.element) {
          this.resizeObserver.observe(this.scrollElement);
        }
      }

      // 監聽內容變更
      if (window.MutationObserver) {
        this.mutationObserver = new MutationObserver(records => {
          if (this.header && records.some(record => this.header.contains(record.target))) this.headerLayoutDirty = true;
          this.geometryDirty = true;
          this.observeContentSize();
          this.scheduleUpdate();
        });
        this.mutationObserver.observe(this.scrollElement, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }

      this.onFocus = () => {
        this.hiddenDistance = 0;
        this.directionDistance = 0;
        this.scheduleUpdate();
      };
      this.onAncestorScroll = event => {
        if (event.target !== this.scrollElement && event.target?.contains?.(this.element)) {
          this.geometryDirty = true;
          this.scheduleUpdate();
        }
      };
      document.addEventListener('scroll', this.onAncestorScroll, { capture: true, passive: true });
      this.update();
    }

    observeContentSize() {
      if (!this.resizeObserver) return;
      const children = new Set(this.scrollElement.children);
      this.resizeContentTargets.forEach(child => {
        if (!children.has(child)) this.resizeObserver.unobserve(child);
      });
      children.forEach(child => {
        if (!this.resizeContentTargets.has(child)) this.resizeObserver.observe(child);
      });
      this.resizeContentTargets = children;
    }

    updateHeader(scrollTop, maxScroll) {
      // A header and its viewport are siblings in the existing flex layout.
      // Horizontal and special standalone masks never acquire header ownership.
      const header = this.element.classList.contains('content-body')
        ? this.element.parentElement?.querySelector?.(':scope > .content-header, :scope > .editor-menubar')
        : null;
      const toolbar = header?.nextElementSibling?.classList.contains('projects-toolbar')
        ? header.nextElementSibling : null;
      if (header !== this.header || toolbar !== this.headerToolbar) {
        if (this.header) this.resizeObserver?.unobserve(this.header);
        if (this.headerToolbar) this.resizeObserver?.unobserve(this.headerToolbar);
        this.clearHeaderPresentation();
        this.header = header;
        this.headerToolbar = toolbar;
        this.headerHost = header?.parentElement;
        if (this.headerHost) {
          headerHosts.set(this.headerHost, this);

        }
        this.hiddenDistance = 0;
        this.directionDistance = 0;
        this.lastTop = scrollTop;
        this.direction = 0;
        this.headerScrolled = false;
        this.headerLayoutDirty = true;
        if (header) {
          this.resizeObserver?.observe(header);
          this.mutationObserver?.observe(header, { childList: true, subtree: true, characterData: true });
        }
        if (toolbar) this.resizeObserver?.observe(toolbar);
      }
      if (!header) return;
      header.classList.add('has-scroll-backdrop');
      if (this.focusHeader !== header) {
        this.focusHeader?.removeEventListener('focusin', this.onFocus);
        this.focusHeader = header;
        header.addEventListener('focusin', this.onFocus);
        if (toolbar?.dataset.headerToolbar !== 'pinned') toolbar?.addEventListener('focusin', this.onFocus);
      }
      this.headerHost?.classList.add('has-header-backdrop');
      toolbar?.classList.add('has-scroll-backdrop');
      if (this.headerLayoutDirty) {
        // Animate from each subtitle's actual height so it finishes with the capsule.
        header.querySelectorAll('.project-workspace-header-sub, .project-workspace-meta, .content-header-subtitle').forEach(sub => {
          sub.style.setProperty('--header-sub-height', `${sub.scrollHeight}px`);
        });
        // Measure the original flow before compensating the viewport. A transparent
        // header needs content behind it; otherwise the sibling viewport clips it away.
        const savedScrollTop = this.scrollElement.scrollTop;
        header.classList.remove('has-edge-navigation');
        toolbar?.classList.remove('has-edge-navigation');
        header.classList.remove('is-content-scrolled');
        this.element.classList.remove('has-header-underlay');
        const paddingTop = parseFloat(window.getComputedStyle?.(this.element).paddingTop) || 0;
        const gap = this.element.offsetParent === header.offsetParent
          ? this.element.offsetTop - header.offsetTop - header.offsetHeight
          : this.element.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
        const overlap = header.offsetHeight + Math.max(0, gap);
        this.element.style.setProperty('--header-underlap', `${overlap}px`);
        this.element.style.setProperty('--header-body-padding-top', `${paddingTop + overlap}px`);
        this.headerTop = header.offsetTop;
        this.headerTravel = overlap + this.headerTop + 12;
        header.style.setProperty('--edge-navigation-top', `${header.offsetTop}px`);
        if (toolbar) toolbar.style.setProperty('--edge-navigation-top', `${toolbar.offsetTop}px`);
        header.classList.add('has-edge-navigation');
        toolbar?.classList.add('has-edge-navigation');
        this.element.classList.add('has-header-underlay');
        this.measuredWidth = this.element.clientWidth;
        this.geometryDirty = true;
        this.scrollElement.scrollTop = savedScrollTop;
        this.headerLayoutDirty = false;
      }
      this.setHeaderScrolled(scrollTop, maxScroll);
    }

    setHeaderScrolled(scrollTop, maxScroll) {
      const mobile = window.matchMedia('(max-width: 768px)').matches;
      const top = clamp(scrollTop, 0, maxScroll);
      const now = performance.now();
      const delta = top - this.lastTop;
      const elapsed = Math.max(8, now - this.lastTime);
      const direction = Math.sign(delta);
      if (direction && direction !== this.direction) {
        this.direction = direction;
        this.directionDistance = 0;
      }
      const before = this.directionDistance;
      this.directionDistance += Math.abs(delta);
      const travel = this.headerTravel || 120;
      if (top < 12 || maxScroll < travel + 96 || ((this.header?.contains(document.activeElement) || (this.headerToolbar?.dataset.headerToolbar !== 'pinned' && this.headerToolbar?.contains(document.activeElement))) && document.activeElement?.matches?.(':focus-visible'))) {
        this.hiddenDistance = 0;
        this.directionDistance = 0;
      } else if (direction > 0) {
        const threshold = this.hiddenDistance > 0 ? 8 : (mobile ? 80 : 96);
        this.hiddenDistance += Math.max(0, this.directionDistance - threshold) - Math.max(0, before - threshold);
      } else if (direction < 0) {
        // Partial dismissal reverses immediately after a small jitter guard.
        // Fully hidden navigation needs sustained intent, even on fast wheels.
        const threshold = this.hiddenDistance < travel ? 8 :
          (this.directionDistance >= 28 && Math.abs(delta) / elapsed > 0.65 ? 28 : (mobile ? 52 : 64));
        this.hiddenDistance -= Math.max(0, this.directionDistance - threshold) - Math.max(0, before - threshold);
      }
      this.hiddenDistance = clamp(this.hiddenDistance, 0, travel);
      this.lastTop = top;
      this.lastTime = now;
      this.headerVisibility = 1 - this.hiddenDistance / travel;
      this.headerScrolled = maxScroll > 1 && top > 0;
      this.header?.classList.toggle('is-content-scrolled', this.headerScrolled);
      this.headerToolbar?.classList.toggle('is-content-scrolled', this.headerScrolled);
      this.headerHost?.classList.toggle('is-content-scrolled', this.headerScrolled);
      for (const nav of [this.header, this.headerToolbar]) {
        if (!nav) continue;
        const pinned = nav.dataset.headerToolbar === 'pinned';
        nav.style.setProperty('--navigation-offset', `${-Math.min(this.hiddenDistance, pinned ? Math.max(0, parseFloat(nav.style.getPropertyValue('--edge-navigation-top')) || 0) : this.hiddenDistance)}px`);
        nav.style.setProperty('--navigation-visibility', this.headerVisibility.toFixed(4));
        // Inert only at the endpoint; focusin restores partially visible controls.
        nav.inert = !pinned && this.headerVisibility === 0;
      }
    }

    clearHeaderPresentation() {
      this.focusHeader?.removeEventListener('focusin', this.onFocus);
      this.headerToolbar?.removeEventListener('focusin', this.onFocus);
      this.focusHeader = null;
      // A late teardown must not clear a successor using the same SPA container.
      if (!this.headerHost || headerHosts.get(this.headerHost) === this) {
        for (const nav of [this.header, this.headerToolbar]) {
          if (!nav) continue;
          nav.inert = false;
          for (const key of ['--navigation-offset', '--navigation-visibility', '--edge-navigation-top']) nav.style.removeProperty(key);
        }
        this.header?.querySelectorAll('.project-workspace-header-sub, .project-workspace-meta, .content-header-subtitle').forEach(sub => {
          sub.style.removeProperty('--header-sub-height');
        });
        this.header?.classList.remove('has-scroll-backdrop', 'is-content-scrolled', 'has-edge-navigation');
        this.headerToolbar?.classList.remove('has-scroll-backdrop', 'is-content-scrolled', 'has-edge-navigation');
        this.headerHost?.classList.remove('has-header-backdrop', 'is-content-scrolled');
        this.headerHost?.style.removeProperty('--header-backdrop-height');
        this.headerHost?.style.removeProperty('--header-backdrop-top');
        if (this.headerHost) headerHosts.delete(this.headerHost);
      }
      this.element.classList.remove('has-header-underlay');
      this.element.style.removeProperty('--header-underlap');
      this.element.style.removeProperty('--header-body-padding-top');
    }

    onScroll() {
      this.scheduleUpdate();
    }

    scheduleUpdate() {
      if (this.rafId) return;
      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null;
        this.update();
      });
    }

    update() {
      if (!this.element || !this.scrollElement) return;
      if (this.element.isConnected === false) { this.destroy(); return; }
      const vertical = this.options.direction !== 'horizontal';
      const owner = this.scrollElement;
      const max = Math.max(0, vertical ? owner.scrollHeight - owner.clientHeight : owner.scrollWidth - owner.clientWidth);
      const position = clamp(vertical ? owner.scrollTop : Math.abs(owner.scrollLeft), 0, max);
      if (vertical) this.updateHeader(position, max);
      // Entry transforms do not trigger ResizeObserver. Track their presentation
      // through the last frame so cached edge positions cannot retain an offset.
      const geometryMoving = [...(this.element.getAnimations?.() || []), ...(this.overlayHost.getAnimations?.() || [])]
        .some(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity);
      if (geometryMoving || this.geometryWasMoving) this.geometryDirty = true;
      this.geometryWasMoving = geometryMoving;
      if (this.geometryDirty || !this.rect) {
        const bounds = this.element.getBoundingClientRect();
        const viewport = window.visualViewport;
        let left = Math.max(0, bounds.left), top = Math.max(viewport?.offsetTop || 0, bounds.top);
        let right = Math.min(window.innerWidth, bounds.right), bottom = Math.min(viewport ? viewport.offsetTop + viewport.height : window.innerHeight, bounds.bottom);
        this.edgeRadii = { tl: 0, tr: 0, bl: 0, br: 0 };
        // Portalled layers must respect every enclosing scroll viewport.
        for (let parent = this.element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const style = window.getComputedStyle(parent);
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX + style.overflowY)) {
            const clip = parent.getBoundingClientRect();
            left = Math.max(left, clip.left); right = Math.min(right, clip.right);
            top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
            const radii = this.edgeRadii;
            if (Math.abs(top - clip.top) <= 1) {
              radii.tl = Math.max(radii.tl, parseFloat(style.borderTopLeftRadius) || 0);
              radii.tr = Math.max(radii.tr, parseFloat(style.borderTopRightRadius) || 0);
            }
            if (Math.abs(bottom - clip.bottom) <= 1) {
              radii.bl = Math.max(radii.bl, parseFloat(style.borderBottomLeftRadius) || 0);
              radii.br = Math.max(radii.br, parseFloat(style.borderBottomRightRadius) || 0);
            }
          }
        }
        this.rect = { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
        const hostBounds = this.overlayHost.getBoundingClientRect();
        this.hostGeometry = {
          left: hostBounds.left, top: hostBounds.top,
          scaleX: this.overlayHost.offsetWidth ? hostBounds.width / this.overlayHost.offsetWidth || 1 : 1,
          scaleY: this.overlayHost.offsetHeight ? hostBounds.height / this.overlayHost.offsetHeight || 1 : 1
        };
        this.geometryDirty = false;
      }
      const page = this.element.matches('.content-body, .page-scroll');
      const mobile = window.matchMedia('(max-width: 768px)').matches;
      const size = Math.max(1, this.options.maskSize);
      const bottomOnly = this.options.edgeMode === 'bottom' || (this.options.edgeMode === 'auto' && page);
      if (max <= 1) this.clearMask();
      else if (vertical) this.applyVerticalMask(bottomOnly ? 0 : position, max - position, size);
      else this.applyHorizontalMask(position, max - position, size);

      // Only navigation owns progressive overlays. Generic scroll containers
      // retain Dynamic Mask, including both horizontal edges and overflow fading.
      let topExtent = 0;
      if (vertical && page && this.header && this.options.edgeMode !== 'bottom') {
        const bottom = this.headerToolbar?.getBoundingClientRect().bottom || this.header.getBoundingClientRect().bottom;
        // Projects has a second navigation row. Size its fade from the full
        // header stack so the pinned filters retain a light backdrop as it hides.
        const transition = this.headerToolbar
          ? Math.max(edgePattern.topTransition, (this.header.offsetHeight + this.headerToolbar.offsetHeight) * 0.4)
          : edgePattern.topTransition;
        topExtent = Math.max(edgePattern.topBase, bottom - this.rect.top + transition);
      }
      const nav = document.getElementById('spa-mobile-nav');
      const bottomEnabled = vertical && page && mobile && bottomNavigation.enabled && nav?.isConnected;
      const bottomExtent = bottomEnabled ? edgePattern.bottomBase + Math.max(edgePattern.bottomExtension, bottomNavigation.extent - edgePattern.bottomBase) * bottomNavigation.progress : 0;
      // A two-row header needs its whole backdrop even on the first scroll:
      // growing it one pixel per scrolled pixel leaves Projects filters exposed.
      const visibleTopExtent = this.headerToolbar && position > 0 ? topExtent : Math.min(topExtent, position);
      this.renderEdge('top', max <= 1 ? 0 : visibleTopExtent, this.rect);
      this.renderEdge('bottom', max <= 1 ? 0 : Math.min(bottomExtent, max - position), this.rect);
      if (geometryMoving) this.scheduleUpdate();
    }

    renderEdge(edge, extent, rect) {
      let layers = this.edges.get(edge);
      if (!layers && extent <= 0) return;
      if (!layers) {
        if (!this.blurHostRegistered) {
          let host = blurHosts.get(this.overlayHost);
          if (!host) {
            host = { count: 0, positioned: window.getComputedStyle(this.overlayHost).position === 'static' };
            blurHosts.set(this.overlayHost, host);
            if (host.positioned) this.overlayHost.classList.add('progressive-edge-host');
          }
          host.count++;
          this.blurHostRegistered = true;
        }
        const blurSteps = edge === 'top' ? [1.5, 4, 8, 0] : [1.5, 4, 8];
        layers = blurSteps.map((blur, index) => {
          const layer = document.createElement('div');
          layer.className = `progressive-edge-blur progressive-edge-blur--${edge}${blur === 0 ? ' progressive-edge-blur--tint' : ''}`;
          layer.setAttribute('aria-hidden', 'true');
          layer.style.setProperty('--edge-blur', `${blur}px`);
          const axis = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[edge];
          const masks = ['#000 0%, #000 65%, transparent 100%', '#000 0%, #000 25%, transparent 75%', '#000 0%, transparent 48%'];
          if (blur !== 0) {
            const mask = `linear-gradient(to ${axis}, ${masks[index]})`;
            layer.style.maskImage = mask;
            layer.style.webkitMaskImage = mask;
          }
          // Stay beside the scroll owner, beneath its Header/Toolbar. A body
          // portal could paint over navigation trapped in an ancestor stacking
          // context (entry animations, transforms, isolation, or opacity).
          this.overlayHost.appendChild(layer);
          return layer;
        });
        this.edges.set(edge, layers);
      }
      const vertical = edge === 'top' || edge === 'bottom';
      extent = Math.min(extent, (vertical ? rect.height : rect.width) / 2);
      for (const layer of layers) {
        layer.style.visibility = extent > 0 && rect.width > 0 && rect.height > 0 ? 'visible' : 'hidden';
        const host = this.hostGeometry;
        const left = edge === 'right' ? rect.right - extent : rect.left;
        const top = edge === 'bottom' ? rect.bottom - extent : rect.top;
        layer.style.left = `${(left - host.left) / host.scaleX - this.overlayHost.clientLeft + this.overlayHost.scrollLeft}px`;
        layer.style.top = `${(top - host.top) / host.scaleY - this.overlayHost.clientTop + this.overlayHost.scrollTop}px`;
        layer.style.width = `${(vertical ? rect.width : extent) / host.scaleX}px`;
        layer.style.height = `${(vertical ? extent : rect.height) / host.scaleY}px`;
        const r = this.edgeRadii || {};
        layer.style.borderRadius = edge === 'top' ? `${r.tl || 0}px ${r.tr || 0}px 0 0` : edge === 'bottom' ? `0 0 ${r.br || 0}px ${r.bl || 0}px` : '0';
      }
    }

    applyVerticalMask(overflowTop, overflowBottom, M) {
      const el = this.element;
      const hasTop = overflowTop > 0;
      const hasBottom = overflowBottom > 0;

      if (!hasTop && !hasBottom) {
        this.clearMask();
        return;
      }

      // 上方遮罩位移邏輯：
      // 遮罩高度 M (如 36px)。當上方溢出 0px -> 36px 時，遮罩位移 36px -> 0px。
      // 若溢出 10px，遮罩向上位移 26px，容器頂部 0px 處對應漸層位置 26px ((36-10)/36)。
      let topStops = '';
      let topShift = M;
      if (hasTop) {
        if (overflowTop < M) {
          const shift = M - overflowTop;
          topShift = shift;
          const startAlpha = (shift / M).toFixed(4);
          const hTop = Math.max(1, Math.round(overflowTop));
          topStops = `rgba(0, 0, 0, ${startAlpha}) 0px, black ${hTop}px`;
        } else {
          topShift = 0;
          topStops = `transparent 0px, black ${M}px`;
        }
      } else {
        topStops = 'black 0px';
      }

      // 下方遮罩位移邏輯：
      // 當下方溢出 0px -> 36px 時，遮罩位移 36px -> 0px。
      // 若下方溢出 10px，遮罩向下位移 26px，容器底部 100% 處對應漸層透明度 ((36-10)/36)。
      let bottomStops = '';
      let bottomShift = M;
      if (hasBottom) {
        if (overflowBottom < M) {
          const shift = M - overflowBottom;
          bottomShift = shift;
          const endAlpha = (shift / M).toFixed(4);
          const hBottom = Math.max(1, Math.round(overflowBottom));
          bottomStops = `black calc(100% - ${hBottom}px), rgba(0, 0, 0, ${endAlpha}) 100%`;
        } else {
          bottomShift = 0;
          bottomStops = `black calc(100% - ${M}px), transparent 100%`;
        }
      } else {
        bottomStops = 'black 100%';
      }

      const maskVal = `linear-gradient(to bottom, ${topStops}, ${bottomStops})`;
      el.style.setProperty('-webkit-mask-image', maskVal);
      el.style.setProperty('mask-image', maskVal);
      el.style.setProperty('--mask-top-shift', `${topShift}px`);
      el.style.setProperty('--mask-bottom-shift', `${bottomShift}px`);
    }

    applyHorizontalMask(overflowLeft, overflowRight, M) {
      const el = this.element;
      const hasLeft = overflowLeft > 0;
      const hasRight = overflowRight > 0;

      if (!hasLeft && !hasRight) {
        this.clearMask();
        return;
      }

      let leftStops = '';
      let leftShift = M;
      if (hasLeft) {
        if (overflowLeft < M) {
          const shift = M - overflowLeft;
          leftShift = shift;
          const startAlpha = (shift / M).toFixed(4);
          const wLeft = Math.max(1, Math.round(overflowLeft));
          leftStops = `rgba(0, 0, 0, ${startAlpha}) 0px, black ${wLeft}px`;
        } else {
          leftShift = 0;
          leftStops = `transparent 0px, black ${M}px`;
        }
      } else {
        leftStops = 'black 0px';
      }

      let rightStops = '';
      let rightShift = M;
      if (hasRight) {
        if (overflowRight < M) {
          const shift = M - overflowRight;
          rightShift = shift;
          const endAlpha = (shift / M).toFixed(4);
          const wRight = Math.max(1, Math.round(overflowRight));
          rightStops = `black calc(100% - ${wRight}px), rgba(0, 0, 0, ${endAlpha}) 100%`;
        } else {
          rightShift = 0;
          rightStops = `black calc(100% - ${M}px), transparent 100%`;
        }
      } else {
        rightStops = 'black 100%';
      }

      const maskVal = `linear-gradient(to right, ${leftStops}, ${rightStops})`;
      el.style.setProperty('-webkit-mask-image', maskVal);
      el.style.setProperty('mask-image', maskVal);
      el.style.setProperty('--mask-left-shift', `${leftShift}px`);
      el.style.setProperty('--mask-right-shift', `${rightShift}px`);
    }

    clearMask() {
      // Remove the owned content mask when overflow ends or the instance detaches.
      for (const key of ['mask-image', '-webkit-mask-image', '--mask-top-shift', '--mask-bottom-shift', '--mask-left-shift', '--mask-right-shift']) this.element.style.removeProperty(key);
    }

    destroy() {
      if (this.rafId) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.scrollElement) {
        this.scrollElement.removeEventListener('scroll', this.onScroll);
        this.scrollElement.removeEventListener('load', this.scheduleUpdate, true);
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
      document.removeEventListener('scroll', this.onAncestorScroll, true);
      this.edges.forEach(layers => layers.forEach(layer => layer.remove()));
      this.edges.clear();
      const host = blurHosts.get(this.overlayHost);
      if (this.blurHostRegistered && host && --host.count === 0) {
        if (host.positioned) this.overlayHost.classList.remove('progressive-edge-host');
        blurHosts.delete(this.overlayHost);
      }
      this.clearMask();
      this.clearHeaderPresentation();
      this.header = null;
      this.headerToolbar = null;
      this.headerHost = null;
      if (this.element) {
        this.element.classList.remove(this.options.activeClass);
      }
      instances.delete(this.element);
    }
  }

  function pruneDetached() {
    instances.forEach(instance => {
      if (instance.element.isConnected === false || instance.scrollElement.isConnected === false) instance.destroy();
    });
  }

  // 全域管理器
  const DynamicMaskSystem = {
    attach(element, options = {}) {
      if (!element) return null;
      pruneDetached();
      if (instances.has(element)) {
        const inst = instances.get(element);
        inst.update();
        return inst;
      }
      const instance = new DynamicMask(element, options);
      instances.set(element, instance);
      return instance;
    },

    detach(element) {
      if (!element) return;
      const instance = instances.get(element);
      if (instance) {
        instance.destroy();
      }
    },

    get(element) {
      return instances.get(element) || null;
    },

    update(element) {
      const inst = instances.get(element);
      if (inst) inst.update();
    },

    updateAll() {
      pruneDetached();
      instances.forEach(inst => { inst.headerLayoutDirty = true; inst.geometryDirty = true; inst.update(); });
    },

    /**
     * 自動掃描綁定帶有 [data-dynamic-mask]、.dynamic-gradient-mask 或 .content-body 的容器
     */
    initAuto() {
      pruneDetached();
      const targets = document.querySelectorAll(maskSelector);
      targets.forEach(el => {
        if (!instances.has(el)) {
          DynamicMaskSystem.attach(el);
        } else {
          const instance = instances.get(el);
          instance.headerLayoutDirty = true;
          instance.geometryDirty = true;
          instance.scheduleUpdate();
        }
      });
    },

    refresh(root = document) {
      pruneDetached();
      const targets = root.querySelectorAll ? root.querySelectorAll(maskSelector) : [];
      if (root.matches?.(maskSelector)) DynamicMaskSystem.attach(root);
      targets.forEach(el => {
        let inst = instances.get(el);
        if (!inst) {
          inst = DynamicMaskSystem.attach(el);
        } else {
          inst.headerLayoutDirty = true;
          inst.geometryDirty = true;
          inst.scheduleUpdate();
        }
      });
    }
  };

  DynamicMaskSystem.setNavigation = (edge, state) => {
    if (edge !== 'bottom') return;
    bottomNavigation = { enabled: state.enabled === true, progress: clamp(state.progress, 0, 1), extent: state.extent || 152 };
    instances.forEach(instance => instance.scheduleUpdate());
  };
  window.ProgressiveEdgeBlurSystem = window.DynamicMaskSystem = DynamicMaskSystem;
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    instances.forEach(instance => {
      instance.hiddenDistance = 0;
      instance.directionDistance = 0;
      instance.setHeaderScrolled(instance.scrollElement.scrollTop || 0, Math.max(0, instance.scrollElement.scrollHeight - instance.scrollElement.clientHeight));
      instance.scheduleUpdate();
    });
  }, true);

  // One shared observer handles SPA replacement, not one document observer per page.
  // Ignore normal text/particle changes; instance observers already handle content.
  if (window.MutationObserver) {
    let reconcileFrame = null;
    const lifecycleObserver = new window.MutationObserver(records => {
      const affectsViewport = records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 1 && (node.matches?.(`${maskSelector}, .content-header, .editor-menubar, .projects-toolbar`) ||
          node.querySelector?.(`${maskSelector}, .content-header, .editor-menubar, .projects-toolbar`))));
      if (!affectsViewport || reconcileFrame !== null) return;
      reconcileFrame = window.requestAnimationFrame(() => {
        reconcileFrame = null;
        DynamicMaskSystem.initAuto();
      });
    });
    lifecycleObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  // 自動在 DOM 準備就緒時初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      DynamicMaskSystem.initAuto();
    });
  } else {
    setTimeout(() => {
      DynamicMaskSystem.initAuto();
    }, 10);
  }

  const updateViewport = () => instances.forEach(instance => {
    instance.geometryDirty = true;
    instance.scheduleUpdate();
  });
  window.visualViewport?.addEventListener('resize', updateViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateViewport, { passive: true });

  // 視窗 resize 時統一觸發微調
  window.addEventListener('resize', () => {
    DynamicMaskSystem.updateAll();
  }, { passive: true });

})(window, document);
