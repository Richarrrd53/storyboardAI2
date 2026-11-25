/** Dynamic Mask for scroll content, with independent navigation backdrops.
 * Generic vertical/horizontal containers keep their original opacity fade.
 * Header blur stays above the masked content; bottom blur is opt-in via nav presence.
 *
 * Phase 1 Performance Refactor:
 * - Granular dirty flags (geometryDirty, scrollDirty, viewportDirty, headerLayoutDirty, contentDirty, maskStyleDirty)
 * - Separated DOM Read -> Compute -> Write phases to eliminate forced synchronous layouts
 * - Cached mask-image, edge layer geometry, header nav CSS vars, and media query state
 * - Scoped MutationObserver / ResizeObserver handling & RAF-coalesced window resize
 * - Motion coordination mode ('normal' | 'coalesce' | 'defer') for major UI animations
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

  // Motion coordination state ('normal' | 'coalesce' | 'defer')
  let motionMode = 'normal';
  let deferredSyncNeeded = false;

  // Shared responsive breakpoint media query (avoid per-frame matchMedia allocations)
  const mobileQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 768px)') : null;
  let isMobileViewport = mobileQuery ? mobileQuery.matches : (window.innerWidth <= 768);
  if (mobileQuery) {
    const onMobileChange = (e) => {
      isMobileViewport = e.matches;
      instances.forEach((inst) => {
        inst.viewportDirty = true;
        inst.geometryDirty = true;
        inst.headerLayoutDirty = true;
        inst.scheduleUpdate();
      });
    };
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onMobileChange);
    else if (mobileQuery.addListener) mobileQuery.addListener(onMobileChange);
  }

  class DynamicMask {
    constructor(element, options = {}) {
      this.element = element;
      this.options = Object.assign({
        maskSize: 36,
        direction: 'vertical',
        edgeMode: 'auto',
        scrollElement: null,
        activeClass: 'has-dynamic-mask',
        keepMaskOnFocus: false
      }, options);

      if (element.dataset) {
        if (element.dataset.maskSize) {
          const s = parseFloat(element.dataset.maskSize);
          if (!isNaN(s)) this.options.maskSize = s;
        }
        if (element.dataset.maskDirection) {
          this.options.direction = element.dataset.maskDirection;
        }
        if (element.dataset.maskEdges) this.options.edgeMode = element.dataset.maskEdges;
        if (element.dataset.maskKeepOnFocus === 'true') this.options.keepMaskOnFocus = true;
      }

      this.scrollElement = this.resolveScrollElement();
      this.rafId = null;
      this.destroyed = false;

      // Granular dirty flags
      this.geometryDirty = true;
      this.scrollDirty = true;
      this.viewportDirty = true;
      this.headerLayoutDirty = true;
      this.contentDirty = true;
      this.maskStyleDirty = true;

      this.edges = new Map();
      this._edgeCache = new Map();
      this._lastMaskKey = null;
      this._maskCleared = false;
      this._lastNavWrite = new WeakMap();
      this._lastHeaderScrolled = null;
      this._cachedHeaderRectBottom = 0;
      this._cachedHeaderTopTransition = edgePattern.topTransition;
      this._cachedHeaderMetricsDirty = true;
      this._cachedIsPage = this.element.matches?.('.content-body, .page-scroll') || false;

      this.hiddenDistance = 0;
      this.directionDistance = 0;
      this.lastTop = this.scrollElement.scrollTop || 0;
      this.lastTime = performance.now();
      this.direction = 0;
      this.headerTop = 0;
      this.toolbarTop = 0;

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

      this.scrollElement.addEventListener('scroll', this.onScroll, { passive: true });
      this.onLoad = () => {
        this.contentDirty = true;
        this.maskStyleDirty = true;
        this.scheduleUpdate();
      };
      this.scrollElement.addEventListener('load', this.onLoad, true);

      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver((entries) => {
          if (motionMode === 'defer') {
            deferredSyncNeeded = true;
            this.geometryDirty = true;
            return;
          }
          let elementResized = false;
          let headerResized = false;
          let contentResized = false;
          for (let i = 0; i < entries.length; i++) {
            const target = entries[i].target;
            if (target === this.element || target === this.scrollElement) {
              elementResized = true;
            } else if (target === this.header || target === this.headerToolbar) {
              headerResized = true;
            } else {
              contentResized = true;
            }
          }
          if (elementResized) {
            this.geometryDirty = true;
            this.contentDirty = true;
            this._cachedHeaderMetricsDirty = true;
            const currentWidth = this.element.clientWidth;
            if (motionMode !== 'coalesce' && this.measuredWidth !== currentWidth) {
              this.headerLayoutDirty = true;
            }
          }
          if (headerResized) {
            this._cachedHeaderMetricsDirty = true;
          }
          if (contentResized) {
            this.contentDirty = true;
            this.maskStyleDirty = true;
          }
          this.scheduleUpdate();
        });
        this.resizeObserver.observe(this.element);
        this.resizeContentTargets = new Set();
        this.observeContentSize();
        if (this.scrollElement !== this.element) {
          this.resizeObserver.observe(this.scrollElement);
        }
      }

      if (window.MutationObserver) {
        this.mutationObserver = new MutationObserver((records) => {
          if (motionMode === 'defer') {
            deferredSyncNeeded = true;
            this.contentDirty = true;
            return;
          }
          let hasChildList = false;
          let affectsHeader = false;
          let relevant = false;
          for (let i = 0; i < records.length; i++) {
            const r = records[i];
            const t = r.target;
            // Ignore mutations originating from our own progressive blur overlay nodes
            if (t && t.classList && t.classList.contains('progressive-edge-blur')) continue;
            relevant = true;
            if (r.type === 'childList') hasChildList = true;
            if (this.header && this.header.contains(t)) affectsHeader = true;
          }
          if (!relevant) return;
          if (affectsHeader && motionMode !== 'coalesce') {
            this.headerLayoutDirty = true;
            this._cachedHeaderMetricsDirty = true;
          }
          this.contentDirty = true;
          this.maskStyleDirty = true;
          if (hasChildList && motionMode !== 'coalesce') {
            this.observeContentSize();
          }
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
        this.scrollDirty = true;
        this.maskStyleDirty = true;
        this.scheduleUpdate();
      };
      this.onAncestorScroll = (event) => {
        if (event.target !== this.scrollElement && event.target?.contains?.(this.element)) {
          this.geometryDirty = true;
          this.scheduleUpdate();
        }
      };
      document.addEventListener('scroll', this.onAncestorScroll, { capture: true, passive: true });
      this.onContentFocus = () => {
        this.maskStyleDirty = true;
        this.scheduleUpdate();
      };
      this.scrollElement.addEventListener('focusin', this.onContentFocus);
      this.scrollElement.addEventListener('focusout', this.onContentFocus);
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.onMotionChange = () => {
        this.scrollDirty = true;
        this.maskStyleDirty = true;
        this.scheduleUpdate();
      };
      this.motionQuery.addEventListener?.('change', this.onMotionChange);
      this.onVisibility = () => {
        if (document.hidden && this.rafId !== null) {
          window.cancelAnimationFrame(this.rafId);
          this.rafId = null;
        } else if (!document.hidden) {
          this.geometryDirty = true;
          this.contentDirty = true;
          this.scrollDirty = true;
          this.maskStyleDirty = true;
          this.lastTop = this.scrollElement.scrollTop || 0;
          this.lastTime = performance.now();
          this.directionDistance = 0;
          this.scheduleUpdate();
        }
      };
      document.addEventListener('visibilitychange', this.onVisibility);
      this.update();
    }

    observeContentSize() {
      if (!this.resizeObserver) return;
      const children = new Set(this.scrollElement.children);
      this.resizeContentTargets.forEach((child) => {
        if (!children.has(child)) this.resizeObserver.unobserve(child);
      });
      children.forEach((child) => {
        if (!this.resizeContentTargets.has(child)) this.resizeObserver.observe(child);
      });
      this.resizeContentTargets = children;
    }

    updateHeader(scrollTop, maxScroll) {
      const header = this.element.classList.contains('content-body')
        ? this.element.parentElement?.querySelector?.(':scope > .content-header, :scope > .editor-menubar')
        : null;
      const toolbar = header?.nextElementSibling?.classList.contains('projects-toolbar')
        ? header.nextElementSibling
        : null;
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
        this._lastHeaderScrolled = null;
        this.headerLayoutDirty = true;
        this._cachedHeaderMetricsDirty = true;
        if (header) {
          this.resizeObserver?.observe(header);
          this.mutationObserver?.observe(header, { childList: true, subtree: true, characterData: true });
        }
        if (toolbar) this.resizeObserver?.observe(toolbar);
      }
      if (!header) return;
      if (!header.classList.contains('has-scroll-backdrop')) header.classList.add('has-scroll-backdrop');
      if (this.focusHeader !== header) {
        this.focusHeader?.removeEventListener('focusin', this.onFocus);
        this.focusHeader = header;
        header.addEventListener('focusin', this.onFocus);
        if (toolbar?.dataset.headerToolbar !== 'pinned') toolbar?.addEventListener('focusin', this.onFocus);
      }
      if (this.headerHost && !this.headerHost.classList.contains('has-header-backdrop')) {
        this.headerHost.classList.add('has-header-backdrop');
      }
      if (toolbar && !toolbar.classList.contains('has-scroll-backdrop')) {
        toolbar.classList.add('has-scroll-backdrop');
      }

      if (this.headerLayoutDirty && motionMode !== 'coalesce') {
        // Phase 1A: Batch read subtitle heights before writing CSS variables
        const subs = header.querySelectorAll('.project-workspace-header-sub, .project-workspace-meta, .content-header-subtitle');
        const subHeights = [];
        for (let i = 0; i < subs.length; i++) {
          subHeights.push(subs[i].scrollHeight);
        }
        for (let i = 0; i < subs.length; i++) {
          subs[i].style.setProperty('--header-sub-height', `${subHeights[i]}px`);
        }

        // Phase 1B: Measure original flow before compensating viewport
        const savedScrollTop = this.scrollElement.scrollTop;
        header.classList.remove('has-edge-navigation');
        toolbar?.classList.remove('has-edge-navigation');
        header.classList.remove('is-content-scrolled');
        this.element.classList.remove('has-header-underlay');

        const paddingTop = parseFloat(window.getComputedStyle?.(this.element).paddingTop) || 0;
        const headerOffsetTop = header.offsetTop;
        const headerOffsetHeight = header.offsetHeight;
        const toolbarOffsetTop = toolbar ? toolbar.offsetTop : 0;
        const toolbarOffsetHeight = toolbar ? toolbar.offsetHeight : 0;
        const gap = this.element.offsetParent === header.offsetParent
          ? this.element.offsetTop - headerOffsetTop - headerOffsetHeight
          : this.element.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
        const overlap = headerOffsetHeight + Math.max(0, gap);
        const measuredWidth = this.element.clientWidth;

        // Phase 1C: Batch write flow compensation styles & restore classes
        this.element.style.setProperty('--header-underlap', `${overlap}px`);
        this.element.style.setProperty('--header-body-padding-top', `${paddingTop + overlap}px`);
        this.headerTop = headerOffsetTop;
        this.toolbarTop = toolbarOffsetTop;
        this.headerTravel = overlap + this.headerTop + 12;
        this._cachedHeaderTopTransition = toolbar
          ? Math.max(edgePattern.topTransition, (headerOffsetHeight + toolbarOffsetHeight) * 0.4)
          : edgePattern.topTransition;

        header.style.setProperty('--edge-navigation-top', `${headerOffsetTop}px`);
        if (toolbar) toolbar.style.setProperty('--edge-navigation-top', `${toolbarOffsetTop}px`);
        header.classList.add('has-edge-navigation');
        toolbar?.classList.add('has-edge-navigation');
        this.element.classList.add('has-header-underlay');
        this.measuredWidth = measuredWidth;
        this.geometryDirty = true;
        this._cachedHeaderMetricsDirty = true;
        this._lastHeaderScrolled = null;
        if (this.scrollElement.scrollTop !== savedScrollTop) {
          this.scrollElement.scrollTop = savedScrollTop;
        }
        this.headerLayoutDirty = false;
      }
      this.setHeaderScrolled(scrollTop, maxScroll);
    }

    setHeaderScrolled(scrollTop, maxScroll) {
      const mobile = isMobileViewport;
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
      const prevHidden = this.hiddenDistance;
      const activeEl = document.activeElement;
      const headerFocused = activeEl &&
        ((this.header?.contains(activeEl) || (this.headerToolbar?.dataset.headerToolbar !== 'pinned' && this.headerToolbar?.contains(activeEl))) &&
        activeEl.matches?.(':focus-visible'));

      if (this.motionQuery?.matches || top < 12 || maxScroll < travel + 96 || headerFocused) {
        this.hiddenDistance = 0;
        this.directionDistance = 0;
      } else if (direction > 0) {
        const threshold = this.hiddenDistance > 0 ? 8 : (mobile ? 80 : 96);
        this.hiddenDistance += Math.max(0, this.directionDistance - threshold) - Math.max(0, before - threshold);
      } else if (direction < 0) {
        const threshold = this.hiddenDistance < travel ? 8 :
          (this.directionDistance >= 28 && Math.abs(delta) / elapsed > 0.65 ? 28 : (mobile ? 52 : 64));
        this.hiddenDistance -= Math.max(0, this.directionDistance - threshold) - Math.max(0, before - threshold);
      }
      this.hiddenDistance = clamp(this.hiddenDistance, 0, travel);
      this.lastTop = top;
      this.lastTime = now;
      this.headerVisibility = 1 - this.hiddenDistance / travel;
      this.headerScrolled = !this.motionQuery?.matches && maxScroll > 1 && top > 0;

      if (Math.abs(this.hiddenDistance - prevHidden) > 0.05) {
        this._cachedHeaderMetricsDirty = true;
      }

      if (this._lastHeaderScrolled !== this.headerScrolled) {
        this._lastHeaderScrolled = this.headerScrolled;
        this.header?.classList.toggle('is-content-scrolled', this.headerScrolled);
        this.headerToolbar?.classList.toggle('is-content-scrolled', this.headerScrolled);
        this.headerHost?.classList.toggle('is-content-scrolled', this.headerScrolled);
        this._cachedHeaderMetricsDirty = true;
      }

      const visStr = this.headerVisibility.toFixed(4);
      const navs = [this.header, this.headerToolbar];
      for (let i = 0; i < navs.length; i++) {
        const nav = navs[i];
        if (!nav) continue;
        const pinned = nav.dataset.headerToolbar === 'pinned';
        const navTop = i === 0 ? this.headerTop : this.toolbarTop;
        const offsetPx = -Math.min(this.hiddenDistance, pinned ? Math.max(0, navTop || parseFloat(nav.style.getPropertyValue('--edge-navigation-top')) || 0) : this.hiddenDistance);
        const offsetStr = `${offsetPx}px`;
        const inertVal = !pinned && this.headerVisibility === 0;
        const prev = this._lastNavWrite.get(nav);
        if (!prev || prev.offset !== offsetStr) {
          nav.style.setProperty('--navigation-offset', offsetStr);
        }
        if (!prev || prev.vis !== visStr) {
          nav.style.setProperty('--navigation-visibility', visStr);
        }
        if (!prev || prev.inert !== inertVal) {
          nav.inert = inertVal;
        }
        this._lastNavWrite.set(nav, { offset: offsetStr, vis: visStr, inert: inertVal });
      }
    }

    clearHeaderPresentation() {
      this.focusHeader?.removeEventListener('focusin', this.onFocus);
      this.headerToolbar?.removeEventListener('focusin', this.onFocus);
      this.focusHeader = null;
      if (!this.headerHost || headerHosts.get(this.headerHost) === this) {
        for (const nav of [this.header, this.headerToolbar]) {
          if (!nav) continue;
          nav.inert = false;
          for (const key of ['--navigation-offset', '--navigation-visibility', '--edge-navigation-top']) nav.style.removeProperty(key);
          this._lastNavWrite.delete(nav);
        }
        this.header?.querySelectorAll('.project-workspace-header-sub, .project-workspace-meta, .content-header-subtitle').forEach((sub) => {
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
      this._lastHeaderScrolled = null;
    }

    onScroll() {
      this.scrollDirty = true;
      this.maskStyleDirty = true;
      this.scheduleUpdate();
    }

    scheduleUpdate() {
      if (this.destroyed || document.hidden || this.rafId !== null) return;
      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null;
        this.update();
      });
    }

    _measureGeometry() {
      const bounds = this.element.getBoundingClientRect();
      const viewport = window.visualViewport;
      let left = Math.max(0, bounds.left);
      let top = Math.max(viewport?.offsetTop || 0, bounds.top);
      let right = Math.min(window.innerWidth, bounds.right);
      let bottom = Math.min(viewport ? viewport.offsetTop + viewport.height : window.innerHeight, bounds.bottom);
      this.edgeRadii = { tl: 0, tr: 0, bl: 0, br: 0 };

      for (let parent = this.element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = window.getComputedStyle(parent);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX + style.overflowY)) {
          const clip = parent.getBoundingClientRect();
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
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
      this.rect = {
        left,
        top,
        right,
        bottom,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top)
      };
      const hostBounds = this.overlayHost.getBoundingClientRect();
      const hostOffsetW = this.overlayHost.offsetWidth;
      const hostOffsetH = this.overlayHost.offsetHeight;
      this.hostGeometry = {
        left: hostBounds.left,
        top: hostBounds.top,
        scaleX: hostOffsetW ? hostBounds.width / hostOffsetW || 1 : 1,
        scaleY: hostOffsetH ? hostBounds.height / hostOffsetH || 1 : 1,
        clientLeft: this.overlayHost.clientLeft || 0,
        clientTop: this.overlayHost.clientTop || 0,
        scrollLeft: this.overlayHost.scrollLeft || 0,
        scrollTop: this.overlayHost.scrollTop || 0
      };
      this.geometryDirty = false;
      this.viewportDirty = false;
    }

    update() {
      if (this.destroyed || !this.element || !this.scrollElement || document.hidden) return;
      if (this.element.isConnected === false) {
        this.destroy();
        return;
      }

      if (motionMode === 'defer') {
        deferredSyncNeeded = true;
        return;
      }

      const vertical = this.options.direction !== 'horizontal';
      const owner = this.scrollElement;

      // ---- PHASE 1: READS ----
      const max = Math.max(
        0,
        vertical ? owner.scrollHeight - owner.clientHeight : owner.scrollWidth - owner.clientWidth
      );
      const position = clamp(vertical ? owner.scrollTop : Math.abs(owner.scrollLeft), 0, max);

      // Update header (may mark geometryDirty if headerLayoutDirty)
      if (vertical) this.updateHeader(position, max);

      // Only inspect running animations when geometry is already dirty or was moving
      let geometryMoving = false;
      if (this.geometryDirty || this.viewportDirty || this.geometryWasMoving) {
        const elAnims = this.element.getAnimations?.() || [];
        const hostAnims = this.overlayHost.getAnimations?.() || [];
        for (let i = 0; i < elAnims.length; i++) {
          const a = elAnims[i];
          if (a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity) {
            geometryMoving = true;
            break;
          }
        }
        if (!geometryMoving) {
          for (let i = 0; i < hostAnims.length; i++) {
            const a = hostAnims[i];
            if (a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity) {
              geometryMoving = true;
              break;
            }
          }
        }
        if (geometryMoving || this.geometryWasMoving) this.geometryDirty = true;
        this.geometryWasMoving = geometryMoving;
      }

      if (this.geometryDirty || this.viewportDirty || !this.rect) {
        this._measureGeometry();
      }

      const page = this._cachedIsPage;
      const mobile = isMobileViewport;
      const size = Math.max(1, this.options.maskSize);
      const bottomOnly = this.options.edgeMode === 'bottom' || (this.options.edgeMode === 'auto' && page);
      const contentFocused = !this.options.keepMaskOnFocus && this.scrollElement.contains(document.activeElement);

      // Read header/selectionBar bottom only when metrics are dirty
      let topExtent = 0;
      if (vertical && page && this.header && this.options.edgeMode !== 'bottom') {
        const selectionActive = this.headerHost?.classList?.contains('is-selection-active');
        if (this._cachedHeaderMetricsDirty || selectionActive) {
          const selectionBar = selectionActive ? this.headerHost.querySelector('.projects-selection-bar') : null;
          const bottom = selectionBar
            ? selectionBar.getBoundingClientRect().bottom
            : (this.headerToolbar?.getBoundingClientRect().bottom || this.header.getBoundingClientRect().bottom);
          const transition = selectionBar ? edgePattern.topTransition : this._cachedHeaderTopTransition;
          this._cachedHeaderRectBottom = bottom;
          this._cachedTopExtentBase = Math.max(edgePattern.topBase, bottom - this.rect.top + transition);
          if (!selectionActive) this._cachedHeaderMetricsDirty = false;
        }
        topExtent = this._cachedTopExtentBase || edgePattern.topBase;
      }

      const nav = mobile ? document.getElementById('spa-mobile-nav') : null;
      const bottomEnabled = vertical && page && mobile && bottomNavigation.enabled && nav?.isConnected;
      const bottomExtent = bottomEnabled
        ? edgePattern.bottomBase + Math.max(edgePattern.bottomExtension, bottomNavigation.extent - edgePattern.bottomBase) * bottomNavigation.progress
        : 0;
      const visibleTopExtent = this.headerToolbar && position > 0 ? topExtent : Math.min(topExtent, position);

      const focusBounds = contentFocused && document.activeElement ? document.activeElement.getBoundingClientRect() : null;
      const focusTopLimit = focusBounds ? Math.max(0, focusBounds.top - this.rect.top - 8) : Infinity;
      const focusBottomLimit = focusBounds ? Math.max(0, this.rect.bottom - focusBounds.bottom - 8) : Infinity;

      // ---- PHASE 2: WRITES ----
      if (max <= 1 || contentFocused) {
        this.clearMask();
      } else if (vertical) {
        this.applyVerticalMask(bottomOnly ? 0 : position, max - position, size);
      } else {
        this.applyHorizontalMask(position, max - position, size);
      }

      this.renderEdge('top', max <= 1 ? 0 : Math.min(visibleTopExtent, focusTopLimit), this.rect);
      this.renderEdge('bottom', max <= 1 ? 0 : Math.min(bottomExtent, max - position, focusBottomLimit), this.rect);

      // Clear processed dirty flags
      this.scrollDirty = false;
      this.contentDirty = false;
      this.maskStyleDirty = false;

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
        const blurSteps = [1.5, 4, 8, 0];
        const frag = document.createDocumentFragment ? document.createDocumentFragment() : null;
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
          if (frag) frag.appendChild(layer);
          else this.overlayHost.appendChild(layer);
          return layer;
        });
        if (frag) this.overlayHost.appendChild(frag);
        this.edges.set(edge, layers);
      }

      const vertical = edge === 'top' || edge === 'bottom';
      extent = Math.min(extent, (vertical ? rect.height : rect.width) / 2);
      const visible = extent > 0 && rect.width > 0 && rect.height > 0;
      const visStr = visible ? 'visible' : 'hidden';

      const host = this.hostGeometry;
      const leftPx = (edge === 'right' ? rect.right - extent : rect.left) - host.left;
      const topPx = (edge === 'bottom' ? rect.bottom - extent : rect.top) - host.top;
      const leftStr = `${(leftPx / host.scaleX - host.clientLeft + host.scrollLeft).toFixed(2)}px`;
      const topStr = `${(topPx / host.scaleY - host.clientTop + host.scrollTop).toFixed(2)}px`;
      const widthStr = `${((vertical ? rect.width : extent) / host.scaleX).toFixed(2)}px`;
      const heightStr = `${((vertical ? extent : rect.height) / host.scaleY).toFixed(2)}px`;
      const r = this.edgeRadii || {};
      const radiusStr = edge === 'top'
        ? `${r.tl || 0}px ${r.tr || 0}px 0 0`
        : edge === 'bottom'
          ? `0 0 ${r.br || 0}px ${r.bl || 0}px`
          : '0';

      const prev = this._edgeCache.get(edge);
      if (
        prev &&
        prev.vis === visStr &&
        (!visible || (prev.left === leftStr && prev.top === topStr && prev.width === widthStr && prev.height === heightStr && prev.radius === radiusStr))
      ) {
        return;
      }

      const needVis = !prev || prev.vis !== visStr;
      const needLeft = visible && (!prev || prev.left !== leftStr);
      const needTop = visible && (!prev || prev.top !== topStr);
      const needWidth = visible && (!prev || prev.width !== widthStr);
      const needHeight = visible && (!prev || prev.height !== heightStr);
      const needRadius = visible && (!prev || prev.radius !== radiusStr);

      for (let i = 0; i < layers.length; i++) {
        const s = layers[i].style;
        if (needVis) s.visibility = visStr;
        if (needLeft) s.left = leftStr;
        if (needTop) s.top = topStr;
        if (needWidth) s.width = widthStr;
        if (needHeight) s.height = heightStr;
        if (needRadius) s.borderRadius = radiusStr;
      }

      this._edgeCache.set(edge, {
        vis: visStr,
        left: visible ? leftStr : (prev?.left ?? ''),
        top: visible ? topStr : (prev?.top ?? ''),
        width: visible ? widthStr : (prev?.width ?? ''),
        height: visible ? heightStr : (prev?.height ?? ''),
        radius: visible ? radiusStr : (prev?.radius ?? '')
      });
    }

    applyVerticalMask(overflowTop, overflowBottom, M) {
      const el = this.element;
      const hasTop = overflowTop > 0;
      const hasBottom = overflowBottom > 0;

      if (!hasTop && !hasBottom) {
        this.clearMask();
        return;
      }

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
      const cacheKey = `v|${maskVal}|${topShift}|${bottomShift}`;
      if (this._lastMaskKey === cacheKey) return;
      this._lastMaskKey = cacheKey;
      this._maskCleared = false;

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
      const cacheKey = `h|${maskVal}|${leftShift}|${rightShift}`;
      if (this._lastMaskKey === cacheKey) return;
      this._lastMaskKey = cacheKey;
      this._maskCleared = false;

      el.style.setProperty('-webkit-mask-image', maskVal);
      el.style.setProperty('mask-image', maskVal);
      el.style.setProperty('--mask-left-shift', `${leftShift}px`);
      el.style.setProperty('--mask-right-shift', `${rightShift}px`);
    }

    clearMask() {
      if (this._maskCleared) return;
      this._maskCleared = true;
      this._lastMaskKey = null;
      for (const key of ['mask-image', '-webkit-mask-image', '--mask-top-shift', '--mask-bottom-shift', '--mask-left-shift', '--mask-right-shift']) {
        this.element.style.removeProperty(key);
      }
    }

    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      if (this.rafId !== null) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.scrollElement) {
        this.scrollElement.removeEventListener('focusin', this.onContentFocus);
        this.scrollElement.removeEventListener('focusout', this.onContentFocus);
        this.scrollElement.removeEventListener('scroll', this.onScroll);
        this.scrollElement.removeEventListener('load', this.onLoad, true);
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
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.motionQuery?.removeEventListener?.('change', this.onMotionChange);
      this.edges.forEach((layers) => layers.forEach((layer) => layer.remove()));
      this.edges.clear();
      this._edgeCache.clear();
      const host = blurHosts.get(this.overlayHost);
      if (this.blurHostRegistered && host && --host.count === 0) {
        if (host.positioned) this.overlayHost.classList.remove('progressive-edge-host');
        blurHosts.delete(this.overlayHost);
      }
      this._maskCleared = false;
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
    instances.forEach((instance) => {
      if (instance.element.isConnected === false || instance.scrollElement.isConnected === false) instance.destroy();
    });
  }

  let resizeRafId = null;
  function scheduleResizeAll() {
    if (resizeRafId !== null) return;
    resizeRafId = window.requestAnimationFrame(() => {
      resizeRafId = null;
      pruneDetached();
      instances.forEach((inst) => {
        inst.viewportDirty = true;
        inst.headerLayoutDirty = true;
        inst.geometryDirty = true;
        inst._cachedHeaderMetricsDirty = true;
        inst.update();
      });
    });
  }

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
      instances.forEach((inst) => {
        inst.viewportDirty = true;
        inst.headerLayoutDirty = true;
        inst.geometryDirty = true;
        inst._cachedHeaderMetricsDirty = true;
        inst.update();
      });
    },

    setMotionMode(mode) {
      const next = mode === 'defer' || mode === 'coalesce' ? mode : 'normal';
      if (motionMode === next) return;
      const prev = motionMode;
      motionMode = next;
      if (next === 'normal' && (deferredSyncNeeded || prev === 'coalesce' || prev === 'defer')) {
        deferredSyncNeeded = false;
        pruneDetached();
        instances.forEach((inst) => {
          inst.geometryDirty = true;
          inst._cachedHeaderMetricsDirty = true;
          if (prev === 'coalesce' && inst.measuredWidth !== inst.element.clientWidth) {
            inst.headerLayoutDirty = true;
          }
          inst.scheduleUpdate();
        });
      }
    },

    getMotionMode() {
      return motionMode;
    },

    initAuto() {
      pruneDetached();
      const targets = document.querySelectorAll(maskSelector);
      targets.forEach((el) => {
        if (!instances.has(el)) {
          DynamicMaskSystem.attach(el);
        } else {
          const instance = instances.get(el);
          instance.headerLayoutDirty = true;
          instance.geometryDirty = true;
          instance._cachedHeaderMetricsDirty = true;
          instance.scheduleUpdate();
        }
      });
    },

    refresh(root = document) {
      pruneDetached();
      const targets = root.querySelectorAll ? root.querySelectorAll(maskSelector) : [];
      if (root.matches?.(maskSelector)) DynamicMaskSystem.attach(root);
      targets.forEach((el) => {
        let inst = instances.get(el);
        if (!inst) {
          inst = DynamicMaskSystem.attach(el);
        } else {
          inst.headerLayoutDirty = true;
          inst.geometryDirty = true;
          inst._cachedHeaderMetricsDirty = true;
          inst.scheduleUpdate();
        }
      });
    }
  };

  DynamicMaskSystem.setNavigation = (edge, state) => {
    if (edge !== 'bottom') return;
    const nextEnabled = state.enabled === true;
    const nextProgress = clamp(state.progress, 0, 1);
    const nextExtent = state.extent || 152;
    if (
      bottomNavigation.enabled === nextEnabled &&
      Math.abs(bottomNavigation.progress - nextProgress) < 0.001 &&
      bottomNavigation.extent === nextExtent
    ) {
      return;
    }
    bottomNavigation = { enabled: nextEnabled, progress: nextProgress, extent: nextExtent };
    instances.forEach((instance) => {
      if (instance.options.direction !== 'horizontal' && instance._cachedIsPage) {
        instance.scheduleUpdate();
      }
    });
  };
  window.ProgressiveEdgeBlurSystem = window.DynamicMaskSystem = DynamicMaskSystem;

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    instances.forEach((instance) => {
      instance.hiddenDistance = 0;
      instance.directionDistance = 0;
      instance.setHeaderScrolled(
        instance.scrollElement.scrollTop || 0,
        Math.max(0, instance.scrollElement.scrollHeight - instance.scrollElement.clientHeight)
      );
      instance.scheduleUpdate();
    });
  }, true);

  if (window.MutationObserver) {
    let reconcileFrame = null;
    const lifecycleObserver = new window.MutationObserver((records) => {
      if (motionMode === 'defer') return;
      const affectsViewport = records.some((record) =>
        [...record.addedNodes, ...record.removedNodes].some((node) =>
          node.nodeType === 1 &&
          !node.classList?.contains('progressive-edge-blur') &&
          (node.matches?.(`${maskSelector}, .content-header, .editor-menubar, .projects-toolbar`) ||
            node.querySelector?.(`${maskSelector}, .content-header, .editor-menubar, .projects-toolbar`))
        )
      );
      if (!affectsViewport || reconcileFrame !== null) return;
      reconcileFrame = window.requestAnimationFrame(() => {
        reconcileFrame = null;
        DynamicMaskSystem.initAuto();
      });
    });
    lifecycleObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      DynamicMaskSystem.initAuto();
    });
  } else {
    setTimeout(() => {
      DynamicMaskSystem.initAuto();
    }, 10);
  }

  const updateViewport = () => instances.forEach((instance) => {
    instance.viewportDirty = true;
    instance.geometryDirty = true;
    instance.scheduleUpdate();
  });
  window.visualViewport?.addEventListener('resize', updateViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateViewport, { passive: true });

  window.addEventListener('resize', scheduleResizeAll, { passive: true });

})(window, document);
