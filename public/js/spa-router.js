(function () {
  'use strict';
  const AUTH_KEY = 'spa_logged_in';
  let currentPage = 'landing';
  let currentOpts = {};
  let isTransitioning = false;
  let currentNavController = null;
  let navSeq = 0;
  let targetPage = null;
  let targetOpts = null;
  
  let burgerContainer = null;
  let sideLogo = null;
  
  let dashboardSidebar = null;
  let dashboardTopbar = null;
  let dashboardUserPanel = null;
  let mobileBottomNav = null;
  
  let landingHTML = '';
  let landingClass = '';

  let cacheProjectsList = null;
  let lastRenderedProjectsJSON = '';
  let cacheTemplatesList = null;
  const cacheProjectDetails = {};
  const pendingDeletions = {};
  const recentlyDeleted = new Set();
  const recentlyRestored = new Set();
  let activePageInstance = null;

  if (typeof window !== 'undefined' && window.ProjectStore) {
    window.ProjectStore.subscribe((projects, event) => {
      cacheProjectsList = projects;
      updateSidebarProjects();
    });
  }

  const SKELETON_CARDS_HTML = Array.from({ length: 4 }).map(() => `
    <div class="project-card project-folder-card skeleton">
      <div class="project-folder-preview-stack">
        <div class="project-preview-primary skeleton-pulse" style="background: #1e293b; width: 88%; max-width: 256px; height: 142px; border-radius: 14px;"></div>
      </div>
      <div class="project-folder-shell">
        <div class="project-folder-header-row">
          <div class="project-folder-tab">
            <span class="project-folder-tab-dot"></span>
          </div>
          <div class="project-folder-shelf"></div>
          <div class="project-folder-notch-wrap">
            <div class="project-option-slot">
              <div class="skeleton-pulse" style="width: 36px; height: 32px; border-radius: 9999px; background: #e2e8f0;"></div>
            </div>
          </div>
        </div>
        <div class="project-folder-content">
          <div class="skeleton-pulse" style="background: #e2e8f0; height: 0.75rem; border-radius: 4px; width: 30%; margin-bottom: 6px;"></div>
          <div class="skeleton-pulse" style="background: #e2e8f0; height: 1.1rem; border-radius: 4px; width: 75%; margin-bottom: 10px;"></div>
          <div style="display: flex; gap: 8px;">
            <div class="skeleton-pulse" style="background: #f1f5f9; height: 26px; width: 64px; border-radius: 9999px;"></div>
            <div class="skeleton-pulse" style="background: #f1f5f9; height: 26px; width: 78px; border-radius: 9999px;"></div>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  window.htmlMemoryCache = {};

  // Purge any stale page caches from localStorage to ensure always up-to-date HTML
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('spa_page_cache_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {}

  window.spaMaskClose = maskClose;
  window.spaMaskOpen = maskOpen;
  window.spaSeedProjectCache = (projectId, projectData) => {
    if (window.ProjectStore) window.ProjectStore.seedProjectDetail(projectId, projectData);
    cacheProjectDetails[projectId] = projectData;
  };
  window.spaInvalidateProjectCache = (projectId) => {
    if (window.ProjectStore) window.ProjectStore.invalidateProjectDetail(projectId);
    delete cacheProjectDetails[projectId];
    cacheProjectsList = null;
  };

  let pendingProjectsPromise = null;
  let pendingTemplatesPromise = null;
  const pendingProjectDetailsPromises = {};

  function resetCreationState() {
    if (window.CreationController?.reset) window.CreationController.reset();
    else window.GenerationTask?.cleanup(); // Legacy entry without the creation feature.
  }

  window.clearSpaCache = () => {
    if (window.ProjectStore) window.ProjectStore.reset();
    cacheProjectsList = null;
    cacheTemplatesList = null;
    for (const key in cacheProjectDetails) {
      delete cacheProjectDetails[key];
    }
    for (const key in pendingDeletions) {
      clearTimeout(pendingDeletions[key].deleteTimeout);
      clearTimeout(pendingDeletions[key].transitionTimeout);
      delete pendingDeletions[key];
    }
    recentlyDeleted.clear();
    recentlyRestored.clear();
    for (const key in window.htmlMemoryCache) {
      delete window.htmlMemoryCache[key];
    }
    for (const key in pendingProjectDetailsPromises) {
      delete pendingProjectDetailsPromises[key];
    }
    pendingProjectsPromise = null;
    pendingTemplatesPromise = null;
  };

  // ── GLOBAL TOAST COMPONENT BRIDGE (components/global-toast.js) ──
  const showSpaToast = (message, onUndo, duration = 5000) => {
    if (window.GlobalToast?.showSpaToast) {
      return window.GlobalToast.showSpaToast(message, onUndo, duration);
    }
  };
  window.showSpaToast = showSpaToast;

  const maskTop = () => document.getElementById('black-mask-top');
  const maskBot = () => document.getElementById('black-mask-bottom');
  const landingNav = () => document.querySelector('.nav');

  const AUTH_TOKEN_KEY = 'spa_auth_token';

  window.spaAuth = {
    isLoggedIn: () => !!localStorage.getItem(AUTH_TOKEN_KEY),
    getToken: () => localStorage.getItem(AUTH_TOKEN_KEY),
    login: async (email, password) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        let errorMsg = '登入失敗';
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = `伺服器回應異常 (${res.status} ${res.statusText})`;
        }
        throw new Error(errorMsg);
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('伺服器回傳非預期的資料格式，請稍後再試');
      }
      resetCreationState();
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      window.clearSpaCache();
      return data;
    },
    logout: async () => {
      resetCreationState();
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) { }
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.clearSpaCache();
      window.location.hash = '';
      if (window.parent && window.parent !== window) {
        window.parent.history.replaceState(null, '', '/');
      }
      const capsule = document.getElementById('global-create-capsule');
      if (capsule) capsule.remove();
      const layer = document.getElementById('ai-creation-layer');
      if (layer) layer.remove();
      document.body.classList.remove('dashboard-layout');
      navigate('landing', { force: true });
    },
    fetchUser: async (signal) => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return null;

      try {
        const res = await fetch('/api/auth/me', {
          signal,
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            resetCreationState();
            localStorage.removeItem(AUTH_TOKEN_KEY);
            window.clearSpaCache();
            return { valid: false };
          }
          return { valid: true, error: true };
        }

        try {
          const data = await res.json();
          return { valid: true, user: data.user };
        } catch {
          return { valid: true, error: true };
        }
      } catch (e) {
        if (e.name === 'AbortError') return { valid: true, aborted: true };
        return { valid: true, error: true };
      }
    },
    fetchProjects: async (signal) => {
      if (window.ProjectStore) {
        const list = await window.ProjectStore.fetchProjects({ signal });
        cacheProjectsList = list;
        return list;
      }
      return [];
    }
  };

  function rafDelay(ms) {
    return new Promise(resolve => {
      let done = false;
      const start = performance.now();
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve();
        }
      }, ms + 50);
      function frame(now) {
        if (done) return;
        if (now - start >= ms) {
          done = true;
          clearTimeout(timer);
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      }
      requestAnimationFrame(frame);
    });
  }

  // ── PAGE ASSET LOADER BRIDGES (features/page-asset-loader.js) ──
  async function fetchTemplates(signal) {
    if (window.PageAssetLoader?.fetchTemplates) {
      return window.PageAssetLoader.fetchTemplates(signal);
    }
    return [];
  }

  async function fetchProjectDetail(projectId, signal) {
    if (window.PageAssetLoader?.fetchProjectDetail) {
      return window.PageAssetLoader.fetchProjectDetail(projectId, signal);
    }
    if (window.ProjectStore) {
      const p = await window.ProjectStore.fetchProjectDetail(projectId, { signal });
      if (p) cacheProjectDetails[projectId] = p;
      return p;
    }
    return null;
  }

  async function prefetchPage(page, opts = {}) {
    if (window.PageAssetLoader?.prefetchPage) {
      return window.PageAssetLoader.prefetchPage(page, opts);
    }
  }

  function prefetchAuthResources() {
    if (window.PageAssetLoader?.prefetchAuthResources) {
      return window.PageAssetLoader.prefetchAuthResources();
    }
  }

  function esc(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // ─── PROJECT CARD COMPONENT BRIDGE (components/project-card.js) ─────────
  const formatRatioBadge = (ratio) => (window.ProjectCard?.formatRatioBadge ? window.ProjectCard.formatRatioBadge(ratio) : (ratio || '16:9'));
  const normalizeRatio = (ratio) => (window.ProjectCard?.normalizeRatio ? window.ProjectCard.normalizeRatio(ratio) : '16:9');
  const parseAspectRatio = (ratioInput, width, height) => (window.ProjectCard?.parseAspectRatio ? window.ProjectCard.parseAspectRatio(ratioInput, width, height) : 16 / 9);
  const calculateProjectCoverGeometry = (options) => (window.ProjectCard?.calculateProjectCoverGeometry ? window.ProjectCard.calculateProjectCoverGeometry(options) : { frame: { width: 282, height: 158.6, insertDepth: 46, aspectRatio: 16 / 9 }, collapsed: { width: 282, height: 158.6, insertDepth: 46, aspectRatio: 16 / 9 }, expanded: { width: 282, height: 158.6, insertDepth: 46, x: 0, hoverLift: 16, hoverRotate: -4.5, aspectRatio: 16 / 9 }, width: 282, height: 158.6, insertDepth: 46, trueRatio: 16 / 9, hoverLift: 16, hoverRotate: -4.5 });
  const calculateTransitionTargetSize = (options) => (window.ProjectCard?.calculateTransitionTargetSize ? window.ProjectCard.calculateTransitionTargetSize(options) : { width: 760, height: 427.5, left: 100, top: 100, aspectRatio: 16 / 9 });
  const getContainedImageRect = (img) => (window.ProjectCard?.getContainedImageRect ? window.ProjectCard.getContainedImageRect(img) : (img ? img.getBoundingClientRect() : null));
  const calculateBalancedPreviewSize = (options) => calculateProjectCoverGeometry(options);
  const formatRatioText = (ratio) => (window.ProjectCard?.formatRatioText ? window.ProjectCard.formatRatioText(ratio) : (ratio || '橫向 16:9'));
  const formatRelativeTime = (dateInput) => (window.ProjectCard?.formatRelativeTime ? window.ProjectCard.formatRelativeTime(dateInput) : '剛剛編輯');
  const renderProjectCard = (p, options) => (window.ProjectCard?.renderProjectCard ? window.ProjectCard.renderProjectCard(p, options) : '');
  const buildLightFilmCardHTML = (p, isHistory = false) => (window.ProjectCard?.buildLightFilmCardHTML ? window.ProjectCard.buildLightFilmCardHTML(p, isHistory) : renderProjectCard(p, { variant: 'default', isHistory }));
  const buildHomeRecentCardHTML = (p) => (window.ProjectCard?.buildHomeRecentCardHTML ? window.ProjectCard.buildHomeRecentCardHTML(p) : renderProjectCard(p, { variant: 'compact' }));

  // Compatibility top-level aliases
  window.calculateProjectCoverGeometry = calculateProjectCoverGeometry;
  window.calculateBalancedPreviewSize = calculateBalancedPreviewSize;
  window.calculateTransitionTargetSize = calculateTransitionTargetSize;
  window.getContainedImageRect = getContainedImageRect;
  window.parseAspectRatio = parseAspectRatio;
  window.normalizeRatio = normalizeRatio;
  window.formatRatioBadge = formatRatioBadge;
  window.formatRatioText = formatRatioText;
  window.formatRelativeTime = formatRelativeTime;
  window.renderProjectCard = renderProjectCard;
  window.buildLightFilmCardHTML = buildLightFilmCardHTML;
  window.buildHomeRecentCardHTML = buildHomeRecentCardHTML;


  // ══════════════════════════════════════════════════════════════
  // GLOBAL OPTION MORPH CONTROLLER (Compatibility Bridges)
  // ══════════════════════════════════════════════════════════════
  function openGlobalOptionMorph(triggerBtn, p, card, isHistoryPage, refreshCallback) {
    if (window.ProjectOptionMorph && typeof window.ProjectOptionMorph.open === 'function') {
      return window.ProjectOptionMorph.open(triggerBtn, p, card, {
        isHistoryPage: Boolean(isHistoryPage),
        refreshCallback
      });
    }
  }

  function closeGlobalOptionMorph(onComplete) {
    if (window.ProjectOptionMorph && typeof window.ProjectOptionMorph.close === 'function') {
      return window.ProjectOptionMorph.close(null, onComplete);
    } else if (typeof onComplete === 'function') {
      onComplete();
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PROJECT REVEAL / COVER TRANSITION BRIDGE
  // ══════════════════════════════════════════════════════════════
  function launchProjectRevealTransition(card, p, options = {}) {
    if (window.ProjectCoverTransition && typeof window.ProjectCoverTransition.launch === 'function') {
      return window.ProjectCoverTransition.launch(card, p, { navigate, ...options });
    }
  }

  function setupProjectCardEvents(card, p, isHistoryPage, refreshCallback) {
    if (window.ProjectCardInteractions && typeof window.ProjectCardInteractions.bind === 'function') {
      return window.ProjectCardInteractions.bind(card, p, {
        isHistoryPage: Boolean(isHistoryPage),
        refreshCallback
      });
    }
  }

  function lazyLoadProjectThumbs(container) {
    if (!container) return;
    const thumbs = container.querySelectorAll('.project-thumb.loading');
    thumbs.forEach(thumb => {
      const src = thumb.dataset.src;
      if (!src) return;
      
      const img = new Image();
      img.onload = () => {
        const fallback = thumb.querySelector('.thumb-fallback');
        if (fallback) fallback.style.display = 'none';

        // Maintain project's configured aspect ratio (from data-ratio or p.ratio)
        const projectRatioAttr = thumb.dataset.trueRatio || thumb.dataset.ratio || thumb.closest('.project-folder-preview-stack')?.dataset.ratio;
        const targetRatio = projectRatioAttr ? parseAspectRatio(projectRatioAttr) : (img.naturalWidth && img.naturalHeight ? (img.naturalWidth / img.naturalHeight) : (16 / 9));

        thumb.dataset.trueRatio = targetRatio;

        const isCompact = !!thumb.closest('.variant-compact');
        const isMob = typeof isMobileView === 'function' ? isMobileView() : false;
        const geom = calculateProjectCoverGeometry({
          aspectRatio: targetRatio,
          variant: isCompact ? 'compact' : 'default',
          isMobile: isMob
        });

        thumb.style.setProperty('--cover-width', `${geom.frame.width}px`);
        thumb.style.setProperty('--cover-height', `${geom.frame.height}px`);
        thumb.style.setProperty('--insert-depth', `${geom.frame.insertDepth}px`);
        thumb.style.setProperty('--collapsed-width', `${geom.collapsed.width}px`);
        thumb.style.setProperty('--collapsed-height', `${geom.collapsed.height}px`);
        thumb.style.setProperty('--collapsed-insert-depth', `${geom.collapsed.insertDepth}px`);
        thumb.style.setProperty('--expanded-width', `${geom.expanded.width}px`);
        thumb.style.setProperty('--expanded-height', `${geom.expanded.height}px`);
        thumb.style.setProperty('--expanded-insert-depth', `${geom.collapsed.insertDepth}px`);
        thumb.style.setProperty('--expanded-x', '0px');
        thumb.style.setProperty('--hover-lift', `${geom.hoverLift}px`);
        thumb.style.setProperty('--hover-rotate', `${geom.hoverRotate}deg`);

        thumb.dataset.collapsedW = geom.collapsed.width;
        thumb.dataset.collapsedH = geom.collapsed.height;
        thumb.dataset.expandedW = geom.expanded.width;
        thumb.dataset.expandedH = geom.expanded.height;
        thumb.dataset.expandedX = 0;
        thumb.dataset.expandedDepth = geom.collapsed.insertDepth;
        thumb.dataset.hoverLift = geom.hoverLift;

        const isFolderPrimary = thumb.classList.contains('project-preview-primary');
        const badges = thumb.querySelector('.thumb-overlay-badges');

        if (isFolderPrimary) {
          // Spec Section 3 & 4:
          // Fixed 16:9 Frame.
          // If targetRatio < 16/9: fit = contain, with blurred background layer!
          // If targetRatio >= 16/9: fit = cover.
          const isContain = targetRatio < (16 / 9) - 0.01;
          let bgImg = null;

          if (isContain) {
            thumb.classList.add('has-contain-preview');
            bgImg = new Image();
            bgImg.className = 'project-preview-primary-bg cover-background';
            bgImg.alt = '';
            bgImg.src = img.src;
            bgImg.style.opacity = '0';
            if (badges) {
              thumb.insertBefore(bgImg, badges);
            } else {
              thumb.appendChild(bgImg);
            }
          } else {
            thumb.classList.remove('has-contain-preview');
          }

          img.className = `lazy-thumb project-preview-primary-image cover-main ${isContain ? 'fit-contain' : 'fit-cover'}`;
          img.alt = 'Cover';
          img.style.opacity = '0';
          if (badges) {
            thumb.insertBefore(img, badges);
          } else {
            thumb.appendChild(img);
          }

          requestAnimationFrame(() => {
            if (bgImg) bgImg.style.opacity = '';
            img.style.opacity = '1';
            thumb.classList.remove('loading');
          });
        } else {
          // Legacy non-folder card
          img.className = 'lazy-thumb';
          img.alt = 'Cover';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          img.style.opacity = '0';
          img.style.transition = 'opacity 0.45s ease-in-out, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
          if (badges) {
            thumb.insertBefore(img, badges);
          } else {
            thumb.appendChild(img);
          }

          requestAnimationFrame(() => {
            img.style.opacity = '1';
            thumb.classList.remove('loading');
          });
        }
      };
      img.onerror = () => {
        thumb.classList.remove('loading');
      };
      img.src = src.startsWith('/api/') ? src : `/api/projects/${src}/cover`;
    });
  }

  window.setupProjectCardEvents = setupProjectCardEvents;
  window.lazyLoadProjectThumbs = lazyLoadProjectThumbs;

  function lazyLoadProjectViewThumbs(container) {
    if (!container) return;
    const thumbs = container.querySelectorAll('.project-view-thumb.loading');
    thumbs.forEach(thumb => {
      const src = thumb.dataset.src;
      if (!src) return;
      
      const img = new Image();
      img.onload = () => {
        img.className = 'lazy-thumb';
        img.alt = 'Shot';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.45s ease-in-out';
        
        thumb.appendChild(img);
        requestAnimationFrame(() => {
          img.style.opacity = '1';
          thumb.classList.remove('loading');
        });
      };
      img.onerror = () => {
        thumb.innerHTML = '<div class="placeholder">NO IMAGE</div>';
        thumb.classList.remove('loading');
      };
      img.src = src;
    });
  }

  function maskClose() {
    return new Promise(resolve => {
      const easing = 'cubic-bezier(.4,0,.2,1)';
      requestAnimationFrame(() => {
        maskTop().style.transition = `all 0.4s ${easing}`;
        maskBot().style.transition = `all 0.4s ${easing}`;
        
        maskTop().style.pointerEvents = 'auto';
        maskBot().style.pointerEvents = 'auto';
        
        maskTop().style.opacity = '1';
        maskTop().style.backdropFilter = 'blur(50px)';
        maskTop().style.webkitBackdropFilter = 'blur(50px)';
        
        maskBot().style.opacity = '1';
        rafDelay(400).then(resolve);
      });
    });
  }

  function maskOpen() {
    return new Promise(resolve => {
      const easing = 'cubic-bezier(.4,0,.2,1)';
      requestAnimationFrame(() => {
        maskTop().style.transition = `all 0.4s ${easing}`;
        maskBot().style.transition = `all 0.4s ${easing}`;
        
        maskTop().style.opacity = '0';
        maskTop().style.backdropFilter = 'blur(0px)';
        maskTop().style.webkitBackdropFilter = 'blur(0px)';
        
        maskBot().style.opacity = '0';
        
        rafDelay(400).then(() => {
          maskTop().style.pointerEvents = 'none';
          maskBot().style.pointerEvents = 'none';
          resolve();
        });
      });
    });
  }

  function showDashTopbar() {
    const nav = landingNav();
    if (nav) {
      nav.style.transition = 'transform 0.45s cubic-bezier(0.76,0,0.24,1)';
      nav.style.transform = 'translateY(-100%)';
    }
  }

  function showLandingNav() {
    const nav = landingNav();
    if (nav) {
      nav.style.transition = 'transform 0.45s cubic-bezier(0.16,1,0.3,1)';
      nav.style.transform = 'translateY(0)';
    }
  }

  // ── PAGE ASSET LOADER BRIDGES (features/page-asset-loader.js) ──
  function injectCSS(href) {
    if (window.PageAssetLoader?.injectCSS) {
      return window.PageAssetLoader.injectCSS(href);
    }
    return Promise.resolve();
  }

  function removePageCSS(nextCSS = []) {
    if (window.PageAssetLoader?.removePageCSS) {
      return window.PageAssetLoader.removePageCSS(nextCSS);
    }
  }

  function injectScript(src, signal) {
    if (window.PageAssetLoader?.injectScript) {
      return window.PageAssetLoader.injectScript(src, signal);
    }
    return Promise.resolve(true);
  }

  function injectScripts(scripts, signal) {
    if (window.PageAssetLoader?.injectScripts) {
      return window.PageAssetLoader.injectScripts(scripts, signal);
    }
    return Promise.resolve([]);
  }

  function removePageScripts() {
    if (window.PageAssetLoader?.removePageScripts) {
      return window.PageAssetLoader.removePageScripts();
    }
  }

  async function fetchPageDoc(url, signal) {
    if (window.PageAssetLoader?.fetchPageDoc) {
      return window.PageAssetLoader.fetchPageDoc(url, signal);
    }
    if (window.htmlMemoryCache && window.htmlMemoryCache[url]) {
      return window.htmlMemoryCache[url];
    }
    const res = await fetch(url + '?v=' + Date.now(), { signal });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (window.htmlMemoryCache) window.htmlMemoryCache[url] = doc;
    return doc;
  }

  const style = document.createElement('style');
  style.textContent = `
    #page-main {
      position: relative;
    }
    #page-content {
      transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), filter 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #page-inner-loader {
      position: absolute !important;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.55);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999 !important;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    #page-inner-loader.active {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(style);

  // ── TRANSITION LOADER COMPONENT BRIDGES (components/transition-loader.js) ──
  function setupRoseAnimation(group, path, particleCount = 45) {
    if (window.TransitionLoader?.setupRoseAnimation) {
      return window.TransitionLoader.setupRoseAnimation(group, path, particleCount);
    }
    return null;
  }

  function getOrCreateContentContainer() {
    const m = document.getElementById('page-main');
    if (!m) return null;
    let content = document.getElementById('page-content');
    if (!content) {
      content = document.createElement('div');
      content.id = 'page-content';
      const loader = document.getElementById('page-inner-loader');
      const children = Array.from(m.childNodes).filter(node => node !== loader);
      children.forEach(child => {
        content.appendChild(child);
      });
      m.appendChild(content);
    }
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
        m.appendChild(loader);
      }
    }
    return content;
  }

  function showInnerLoader() {
    if (window.TransitionLoader?.showInnerLoader) {
      return window.TransitionLoader.showInnerLoader();
    }
  }

  function hideInnerLoader() {
    if (window.TransitionLoader?.hideInnerLoader) {
      return window.TransitionLoader.hideInnerLoader();
    }
  }

  function initMain() {
    const content = getOrCreateContentContainer();
    if (content) {
      content.innerHTML = '';
      content.className = '';
      content.style.display = '';
    }
    return content;
  }

  function cloneMainContent(doc, content) {
    const newMain = doc.querySelector('main');
    const pageMain = document.getElementById('page-main');
    if (newMain) {
      if (pageMain && newMain.className) {
        pageMain.className = newMain.className;
      }
      if (content) {
        content.innerHTML = '';
        if (newMain.className) {
          content.className = newMain.className;
        }
        Array.from(newMain.childNodes).forEach(child => {
          content.appendChild(child.cloneNode(true));
        });
      }
    }
  }

  async function deleteProject(p, card, refreshCallback) {
    if (window.ProjectActions) {
      return window.ProjectActions.deleteProject(p, card, () => {
        cacheProjectsList = window.ProjectStore?.getProjects() || cacheProjectsList;
        if (typeof refreshCallback === 'function') refreshCallback();
      });
    }
  }

  async function restoreProject(p, card, refreshCallback) {
    if (window.ProjectActions) {
      return window.ProjectActions.restoreProject(p, card, () => {
        cacheProjectsList = window.ProjectStore?.getProjects() || cacheProjectsList;
        if (typeof refreshCallback === 'function') refreshCallback();
      });
    }
  }

  async function renameProject(p, card, refreshCallback) {
    if (window.ProjectActions) {
      return window.ProjectActions.renameProject(p, card, () => {
        cacheProjectsList = window.ProjectStore?.getProjects() || cacheProjectsList;
        if (typeof refreshCallback === 'function') refreshCallback();
      });
    }
  }

  async function duplicateProject(p, card, refreshCallback) {
    if (window.ProjectActions) {
      return window.ProjectActions.duplicateProject(p, card, () => {
        cacheProjectsList = window.ProjectStore?.getProjects() || cacheProjectsList;
        if (typeof refreshCallback === 'function') refreshCallback();
      });
    }
  }

  async function exportProject(p) {
    if (window.ProjectActions) {
      return window.ProjectActions.exportProject(p);
    }
  }

  function showProjectOptionsDropdown(project, card, anchorEl, isHistoryPage, refreshCallback) {
    const overlay = document.createElement('div');
    overlay.className = 'options-dropdown-overlay';

    const menu = document.createElement('div');
    menu.className = 'options-dropdown-menu';

    let actionsHtml = '';
    if (project.is_deleted || isHistoryPage) {
      actionsHtml = `
        <button class="options-dropdown-item restore" id="opt-restore" type="button">
          <span class="options-dropdown-item-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
          </span>
          <span>還原分鏡</span>
        </button>
      `;
    } else {
      actionsHtml = `
        <button class="options-dropdown-item rename" id="opt-rename" type="button">
          <span class="options-dropdown-item-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </span>
          <span>重新命名</span>
        </button>
        <button class="options-dropdown-item duplicate" id="opt-duplicate" type="button">
          <span class="options-dropdown-item-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </span>
          <span>複製分鏡</span>
        </button>
        <button class="options-dropdown-item export" id="opt-export" type="button">
          <span class="options-dropdown-item-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </span>
          <span>匯出 JSON</span>
        </button>
        <div class="options-dropdown-divider"></div>
        <button class="options-dropdown-item delete" id="opt-delete" type="button">
          <span class="options-dropdown-item-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </span>
          <span>移至回收桶</span>
        </button>
      `;
    }

    menu.innerHTML = actionsHtml;
    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    const rect = anchorEl.getBoundingClientRect();
    const menuWidth = 170;
    const gap = 6;

    let top = rect.bottom + window.scrollY + gap;
    let left = rect.right + window.scrollX - menuWidth;
    let transformOrigin = 'top right';

    const menuEstimatedHeight = (project.is_deleted || isHistoryPage) ? 60 : 180;
    if (rect.bottom + menuEstimatedHeight + gap > window.innerHeight && rect.top - menuEstimatedHeight > 0) {
      top = rect.top + window.scrollY - menuEstimatedHeight - gap;
      transformOrigin = 'bottom right';
    }

    left = Math.max(10, Math.min(left, window.innerWidth - menuWidth - 10));

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.transformOrigin = transformOrigin;

    setTimeout(() => {
      overlay.classList.add('active');
      menu.classList.add('active');
    }, 10);

    const closeDropdown = () => {
      menu.classList.remove('active');
      setTimeout(() => {
        overlay.classList.remove('active');
      }, 200);
      setTimeout(() => overlay.remove(), 350);
    };

    overlay.addEventListener('click', closeDropdown);

    const renameBtn = menu.querySelector('#opt-rename');
    if (renameBtn) {
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        renameProject(project, card, refreshCallback);
      });
    }

    const duplicateBtn = menu.querySelector('#opt-duplicate');
    if (duplicateBtn) {
      duplicateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        duplicateProject(project, card, refreshCallback);
      });
    }

    const exportBtn = menu.querySelector('#opt-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        exportProject(project);
      });
    }

    const deleteBtn = menu.querySelector('#opt-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        deleteProject(project, card, refreshCallback);
      });
    }

    const restoreBtn = menu.querySelector('#opt-restore');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        restoreProject(project, card, refreshCallback);
      });
    }
  }


  async function renderLogin(showRegister) {
    const doc = await fetchPageDoc('/html/login.html');
    const m = initMain();
    m.className = 'auth-main spa-login-wrap';
    cloneMainContent(doc, m);
    m.classList.add('auth-main', 'spa-login-wrap');
    initLoginLogic(showRegister);
  }

function initLoginLogic(showRegister) {
    const brandLogos = document.querySelectorAll('.spa-login-wrap .brand-logo, .spa-login-wrap .logo, .auth-container .brand-logo, .auth-container .logo');
    brandLogos.forEach(logo => {
      if (logo.dataset.spaLogoBound) return;
      logo.dataset.spaLogoBound = 'true';
      logo.style.cursor = 'pointer';
      logo.addEventListener('click', (e) => {
        e.preventDefault();
        navigate('landing');
      });
    });

    window.switchTab = function (tab) {
      const lp = document.getElementById('panel-login');
      const rp = document.getElementById('panel-register');
      const inner = document.getElementById("auth-inner");
      const tl = document.getElementById('tab-login');
      const tr = document.getElementById('tab-register');
      if (!lp || !rp) return;
      if (tab === 'login') {
        tl.classList.add('active'); tr.classList.remove('active');
        inner.style.transform = "rotateY(0)";
        lp.style.pointerEvents = "auto";
        rp.style.pointerEvents = "none";
      } else {
        tr.classList.add('active'); tl.classList.remove('active');
        inner.style.transform = "rotateY(180deg)";
        lp.style.pointerEvents = "none";
        rp.style.pointerEvents = "auto";
      }
    };
    if (showRegister) setTimeout(() => window.switchTab('register'), 50);

    window.togglePwd = function (id, btnId) {
      const inp = document.getElementById(id);
      const slash = document.getElementById("inputShow"+btnId+"2");
      const mask = document.getElementById("inputShowMask"+btnId+"2");
      if (!inp) return;
      if (inp.type === 'password') { 
        inp.style.filter = "blur(3px)";
        setTimeout(() => {
          inp.style.filter = "blur(0px)";

          inp.type = 'text';
        }, 300);
        slash.style.transform = "translateY(-36px)";
        mask.style.transform = "translate(54px, -36px) rotate(45deg)";
      }
      else {
        inp.style.filter = "blur(3px)";
        setTimeout(() => {
          inp.style.filter = "blur(0px)";

          inp.type = 'password';
        }, 300);
        slash.style.transform = "translateY(0px)";
        mask.style.transform = "translate(18px, 0px) rotate(45deg)";
      }
    };

    function showToast(msg, duration = 2800) {
      if (window.GlobalToast?.showToast) {
        return window.GlobalToast.showToast(msg, duration);
      }
    }

    window.handleLogin = async function () {
      const email = document.getElementById('login-email')?.value;
      const pass = document.getElementById('login-password')?.value;
      if (!email || !pass) { showToast('電子信箱和密碼不可為空！'); return; }
      showToast('正在驗證中...', 99999);
      try {
        await spaAuth.login(email, pass);
        const t = document.getElementById('toast');
        if (t) t.classList.remove('show');
        navigate('dashboard');
      } catch (error) {
        showToast(error.message);
      }
    };

    window.handleRegister = async function () {
      const name = document.getElementById('register-username')?.value?.trim();
      const email = document.getElementById('register-email')?.value?.trim();
      const pass = document.getElementById('register-password')?.value;
      const pass2 = document.getElementById('register-password-2')?.value;
      
      if (!name || !email || !pass || !pass2) { 
        showToast('所有欄位皆不可為空！'); 
        return; 
      }
      if (pass !== pass2) { 
        showToast('兩次輸入的密碼不一致！'); 
        return; 
      }
      if (pass.length < 8) { 
        showToast('密碼長度至少需 8 個字元！'); 
        return; 
      }

      showToast('正在註冊中...', 99999);
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password: pass })
        });
        if (!res.ok) {
          let errorMsg = '註冊失敗';
          try {
            const errorData = await res.json();
            errorMsg = errorData.error || errorMsg;
          } catch {
            errorMsg = `伺服器回應異常 (${res.status} ${res.statusText})`;
          }
          throw new Error(errorMsg);
        }
        let data;
        try {
          data = await res.json();
        } catch {
          throw new Error('伺服器回傳非預期的資料格式，請稍後再試');
        }
        showToast('註冊成功！已為您自動登入。');
        resetCreationState();
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        navigate('dashboard');
      } catch (error) {
        showToast(error.message);
      }
    };

    window.handleSocialLogin = function (provider) {
      showToast(`\u4F7F\u7528 ${provider} \u767B\u5165\u4E2D\u2026`);
      setTimeout(() => { spaAuth.login(); navigate('dashboard'); }, 1200);
    };
  }

  async function ensureSharedLayout(signal) {
    if (window.AppShell?.init) {
      await window.AppShell.init({
        navigate,
        spaAuth,
        signal,
        fetchDoc: fetchPageDoc
      });
    }

    injectCSS('/css/generate.css').catch(() => {});
    injectCSS('/css/math-curve-loader.css').catch(() => {});
    ensureAIDockDOM();
  }

  // Legacy router-only HTML fallback; the authoritative alias lives in features/creation.js.
  window.AICreationController = window.CreationController || window.AICreationController || {
    get surfaceState() {
      return window.QuickCompose ? window.QuickCompose.state : 'closed';
    },
    set surfaceState(val) {
      if (window.QuickCompose) window.QuickCompose.state = val;
    },
    openQuickCompose() {
      return window.QuickCompose?.open?.();
    },
    closeQuickCompose(force = false) {
      return window.QuickCompose?.close?.(force);
    },
    submitToWorkspace() {
      return window.CreationController?.submitFromQuickCompose?.();
    },
    openWorkspaceDirectly() {
      return window.CreationController?.openWorkspace?.({ targetPhase: 1 });
    },
    closeWorkspace(target = 'dashboard') {
      return window.CreationController?.closeWorkspace?.(target);
    }
  };
  // Thin page-shell bridge; QuickCompose owns DOM, handlers and compatibility exports.
  function ensureAIDockDOM() {
    if (window.QuickCompose?.mount) {
      return window.QuickCompose.mount();
    }
    if (window.QuickCompose?.ensureDOM) {
      return window.QuickCompose.ensureDOM();
    }
  }

  function updateAIDockState(page) {
    if (window.QuickCompose?.updateLayerState) {
      return window.QuickCompose.updateLayerState(page);
    }
  }

  function isMobileView() {
    return window.AppShell?.isMobileView ? window.AppShell.isMobileView() : window.matchMedia('(max-width: 768px), (max-width: 767px) and (orientation: portrait), (max-width: 480px)').matches;
  }

  function updateMobileBottomNavActive(page) {
    if (window.AppShell?.updateMobileBottomNavActive) {
      window.AppShell.updateMobileBottomNavActive(page);
    }
  }

  async function renderDashboard(signal) {
    const doc = await fetchPageDoc('/html/dashboard.html', signal);
    if (signal?.aborted) return null;

    const m = initMain();
    m.className = 'spa-dash-wrap';

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return null;

    if (window.DashboardPage && typeof window.DashboardPage.mount === 'function') {
      return await window.DashboardPage.mount({ root: m, signal, navigate });
    }
    return null;
  }

  async function renderProjectsPage(signal) {
    const doc = await fetchPageDoc('/html/projects.html', signal);
    if (signal?.aborted) return null;

    const m = initMain();
    m.className = 'spa-projects-wrap';

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return null;

    if (window.ProjectsPage && typeof window.ProjectsPage.mount === 'function') {
      return await window.ProjectsPage.mount({ root: m, signal, navigate });
    }
    return null;
  }

  async function renderGenerate(opts, signal) {
    const doc = await fetchPageDoc('/html/generate.html', signal);
    if (signal?.aborted) return;

    const m = initMain();
    m.className = 'spa-gen-wrap';
    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    if (opts && opts.templateId) {
      window.preselectedTemplateId = opts.templateId;
    } else {
      window.preselectedTemplateId = null;
    }

    if (!window.CreationController) await injectScripts(['/js/features/creation.js'], signal);
    if (signal?.aborted) return null;
    window.CreationController?.syncRoute('generate', opts);
    if (!window.GenerationTask) await injectScripts(['/js/features/generation-task.js'], signal);
    await injectScripts(['/js/generate.js'], signal);
    if (signal?.aborted) return null;
    return window.initGeneratePage?.({ ...opts, signal });
  }

  async function renderHistory(signal) {
    const doc = await fetchPageDoc('/html/history.html', signal);
    if (signal?.aborted) return null;

    const m = initMain();
    m.className = 'spa-history-wrap';

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return null;

    if (window.HistoryPage && typeof window.HistoryPage.mount === 'function') {
      return await window.HistoryPage.mount({ root: m, signal, navigate });
    }
    return null;
  }

  async function renderTemplate(signal) {
    const doc = await fetchPageDoc('/html/template.html', signal);
    if (signal?.aborted) return null;

    const m = initMain();
    m.className = 'spa-template-wrap';

    const pageMain = document.getElementById('page-main');
    if (pageMain) {
      pageMain.style.padding = '0';
    }

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return null;

    if (window.TemplatesPage && typeof window.TemplatesPage.mount === 'function') {
      return await window.TemplatesPage.mount({ root: m, signal, navigate });
    }
    return null;
  }

  async function renderProject(idOrOpts, signal) {
    const id = typeof idOrOpts === 'string' ? idOrOpts : (idOrOpts?.id || null);
    let projectId = id;

    if (!projectId) {
      const hash = window.location.hash || '';
      const match = hash.match(/^#\/project\/(.+)$/);
      if (match) projectId = decodeURIComponent(match[1]);
    }

    const m = initMain();
    m.className = 'page-shell page-project-detail spa-project-wrap project-workspace';

    await ensureSharedLayout(signal);
    if (signal?.aborted) return null;

    if (window.ProjectDetailPage && typeof window.ProjectDetailPage.mount === 'function') {
      return await window.ProjectDetailPage.mount({
        root: m,
        signal,
        navigate,
        id: projectId,
        opts: typeof idOrOpts === 'object' ? idOrOpts : { id: projectId }
      });
    }

    if (!projectId) {
      m.innerHTML = `<div class="projects-empty"><h3>找不到分鏡 ID</h3></div>`;
      return null;
    }

    return null;
  }

  async function renderDiscovery(signal) {
    const doc = await fetchPageDoc('/html/discovery.html', signal);
    if (signal?.aborted) return;

    const m = initMain();

    const pageMain = document.getElementById('page-main');
    if (pageMain) {
      pageMain.style.padding = '0';
    }

    cloneMainContent(doc, m);
    m.className = 'spa-discovery-wrap discovery-shell';

    // Hide standalone nav and back-to-dashboard link inside dashboard shell
    const dNav = m.querySelector('.discovery-nav');
    if (dNav) dNav.style.display = 'none';
    const backLink = m.querySelector('.back-link');
    if (backLink) backLink.style.display = 'none';

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    if (typeof window.initDiscoveryPage === 'function') {
      window.initDiscoveryPage();
    }
  }

  function bindSidebarLinks() {
    // Handled by AppShell
  }

  function updateRailHoles() {
    if (window.AppShell?.updateRailHoles) {
      window.AppShell.updateRailHoles();
    }
  }

  const pageDefs = {
    landing: {
      css: [],
      js: ['/js/landing-animation.js', '/js/landing.js'],
      render: () => {
        const pageMain = document.getElementById('page-main');
        if (pageMain) {
          pageMain.className = 'page-shell page-landing';
        }
        const content = initMain();
        content.className = landingClass || 'landing-content';
        content.innerHTML = landingHTML;
        interceptCTAs();
      }
    },

    login: {
      css: ['/css/auth.css'],
      js: ['/js/auth.js'],
      render: (o) => renderLogin(o?.showRegister)
    },

    register: {
      css: ['/css/auth.css'],
      js: ['/js/auth.js'],
      render: () => renderLogin(true)
    },

    dashboard: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js'],
      mount: (o, signal) => renderDashboard(signal),
      render: (o, signal) => renderDashboard(signal)
    },

    projects: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js'],
      mount: (o, signal) => renderProjectsPage(signal),
      render: (o, signal) => renderProjectsPage(signal)
    },

    generate: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css', '/css/template.css'],
      js: ['/js/math-curve-loader.js', '/js/token-manager.js', '/js/prompt-translate.js'],
      render: (o, signal) => renderGenerate(o, signal)
    },

    history: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js'],
      mount: (o, signal) => renderHistory(signal),
      render: (o, signal) => renderHistory(signal)
    },

    template: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/template.css', '/css/math-curve-loader.css', '/css/template-detail.css?v=20260926-3'],
      js: ['/js/generate-prefill-path.js', '/js/template-timeline.js', '/js/template.js'],
      mount: (o, signal) => renderTemplate(signal),
      render: (o, signal) => renderTemplate(signal)
    },

    discovery: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/discovery.css', '/css/math-curve-loader.css'],
      js: ['/js/discovery.js'],
      render: (o, signal) => renderDiscovery(signal)
    },

    project: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css', '/css/project-detail.css'],
      js: ['/js/prompt-translate.js', '/js/project-detail.js'],
      mount: (o, signal) => renderProject(o?.id || o, signal),
      render: (o, signal) => renderProject(o?.id || o, signal)
    }
  };

  window.spaNavigate = (page, opts) => {
    navigate(page, opts);
  };

  function isDashboardPage(page) {
    return ['dashboard', 'projects', 'generate', 'history', 'template', 'discovery', 'project', 'analysis'].includes(page);
  }

  function getHashForPage(page, opts = {}) {
    if (page === 'landing') return '';
    if (page === 'project' && opts?.id) return `#/project/${opts.id}`;
    if (page === 'generate' && opts?.templateId) return `#/generate?templateId=${opts.templateId}`;
    return `#/${page}`;
  }

  function parseRouteFromHash(hash) {
    if (!hash || !hash.startsWith('#/')) {
      return { page: 'landing', opts: {} };
    }

    const fullRoute = hash.substring(2);
    const parts = fullRoute.split('?');
    const route = parts[0];
    const queryString = parts[1] || '';

    const opts = {};
    if (queryString) {
      const searchParams = new URLSearchParams(queryString);
      for (const [key, value] of searchParams.entries()) {
        opts[key] = value;
      }
    }

    const projectMatch = route.match(/^project\/(.+)$/);
    if (projectMatch) {
      return {
        page: 'project',
        opts: { ...opts, id: decodeURIComponent(projectMatch[1]) }
      };
    }

    if (pageDefs[route]) {
      return {
        page: route,
        opts
      };
    }

    return { page: 'landing', opts: {} };
  }

  function expandSidebar(expand = true) {
    if (window.AppShell?.expandSidebar) {
      window.AppShell.expandSidebar(expand);
    }
  }

  function updateSidebarActive(page) {
    if (window.AppShell?.updateRoute) {
      window.AppShell.updateRoute(page);
    }
  }

  function updateSidebarProjects() {
    if (window.AppShell?.updateSidebarProjects) {
      window.AppShell.updateSidebarProjects();
    }
  }

  async function navigate(page, opts = {}) {
    const isDashboardTransition = isDashboardPage(currentPage) && isDashboardPage(page);
    document.body.classList.add('is-navigating');

    if (opts.openQC) {
      if (window.AICreationController) {
        window.AICreationController.openQuickCompose();
      }
      return;
    }

    if (window.ProjectOptionMorph && window.ProjectOptionMorph.isOpen()) {
      window.ProjectOptionMorph.close('navigation');
    } else if (typeof closeGlobalOptionMorph === 'function') {
      closeGlobalOptionMorph();
    }

    const activeTransition = window.currentCoverTransition || window._activeProjectTransition;
    if (activeTransition) {
      const isTargetRoute = (page === 'project' && String(opts?.id) === String(activeTransition.projectId));
      if (!isTargetRoute) {
        activeTransition.cancel();
      }
    }

    const pageMain = document.getElementById('page-main');
    if (pageMain) {
      pageMain.classList.remove('is-generating');
      pageMain.style.padding = '';
      if (page === 'landing') {
        pageMain.className = 'page-shell page-landing';
      } else {
        pageMain.classList.remove('page-landing');
        if (page === 'dashboard') {
          pageMain.className = 'page-shell page-dashboard dash-main home-main';
        } else if (page === 'projects') {
          pageMain.className = 'page-shell page-projects dash-main projects-main';
        } else if (page === 'template') {
          pageMain.className = 'page-shell page-template dash-main template-main';
        } else if (page === 'discovery') {
          pageMain.className = 'page-shell page-discovery discovery-shell';
        } else if (page === 'generate') {
          pageMain.className = 'page-shell page-generate gen-main';
        } else if (page === 'history') {
          pageMain.className = 'page-shell page-projects dash-main history-main';
        } else if (page === 'login' || page === 'register') {
          pageMain.className = 'page-shell page-auth auth-main';
        } else if (page === 'project') {
          pageMain.className = 'page-shell page-project-detail dash-main';
        }
      }
    }

    // 當從登入/註冊頁面登入進入 Dashboard 時，若先前為展開狀態，自動將其收回（在 mask 遮罩期間完成）
    if ((currentPage === 'login' || currentPage === 'register') && isDashboardPage(page)) {
      if (localStorage.getItem('sidebar_projects_expanded') === 'true') {
        if (window.AppShell?.collapseProjectsGroup) {
          window.AppShell.collapseProjectsGroup();
        } else {
          localStorage.setItem('sidebar_projects_expanded', 'false');
          expandSidebar(false);
        }
      }
    }

    // 背景持續生成，允許頁面切換無縫過渡

    if (isDashboardPage(page) && !spaAuth.isLoggedIn()) {
      navigate('login', { force: true });
      setTimeout(() => {
        window.showSpaToast('您尚未登入，請先登入以存取該頁面。');
      }, 400);
      return;
    }

    const activePage = targetPage || currentPage;
    const activeOpts = targetPage ? targetOpts : currentOpts;

    const isSameRoute = (page === activePage) && 
      (opts.id === activeOpts?.id) && 
      (opts.templateId === activeOpts?.templateId);

    if (isSameRoute && !opts.force) return;

    if (activePageInstance) {
      try {
        activePageInstance.unmount?.();
      } catch (err) {
        console.error('[spa-router] Error unmounting previous page:', err);
      }
      activePageInstance = null;
    }

    if (window.ProjectDeleteQueue) {
      window.ProjectDeleteQueue.flushAll();
    }
    for (const id in pendingDeletions) {
      delete pendingDeletions[id];
    }
    const toast = document.getElementById('global-toast');
    if (toast) {
      toast.classList.remove('show');
    }

    targetPage = page;
    targetOpts = opts;
    updateMobileBottomNavActive(page);

    const mySeq = ++navSeq;

    // 立即隱藏 landing 頁面內容，防止 flash
    // 立即隱藏 landing 頁面內容，防止 flash (僅在當前為 landing 且要跳轉到其他頁面時)
    if (currentPage === 'landing' && page !== 'landing') {
      const pageMain = document.getElementById('page-main');
      if (pageMain) {
        let content = document.getElementById('page-content');
        if (!content) {
          content = document.createElement('div');
          content.id = 'page-content';
          const loader = document.getElementById('page-inner-loader');
          const children = Array.from(pageMain.childNodes).filter(node => node !== loader);
          children.forEach(child => {
            content.appendChild(child);
          });
          pageMain.appendChild(content);
        }
        content.style.display = 'none';
      }
      
      const nav = document.getElementById('nav') || document.querySelector('.nav');
      if (nav) {
        nav.style.display = 'none';
      }
    }

    // 即時變更網址列 (URL Hash)
    if (!opts.noHistory) {
      const hash = getHashForPage(page, opts);
      history.pushState(
        { page, id: opts?.id || null },
        '',
        window.location.pathname + window.location.search + hash
      );
    }

    if (window.parent && window.parent !== window) {
      const parentPath =
        page === 'landing'
          ? '/'
          : page === 'project' && opts?.id
            ? `/project/${opts.id}`
            : `/${page}`;

      window.parent.history.replaceState(null, '', parentPath);
    }

    // 即時變更側邊欄與佈局狀態
    if (isDashboardPage(page)) {
      document.body.classList.add('dashboard-layout');
      document.body.classList.remove('auth-layout');
      window.AppShell?.updateRoute?.(page, opts);
      if (isDashboardTransition) {
        updateAIDockState(page);
      }
    } else {
      document.body.classList.remove('dashboard-layout');
      if (page === 'login' || page === 'register') {
        document.body.classList.add('auth-layout');
      } else {
        document.body.classList.remove('auth-layout');
      }
      window.AppShell?.updateRoute?.(page, opts);

      // 如果回到 landing / login / register，復原原本 navbar 的顯示並清除本機 margin
      const nav = document.getElementById('nav') || document.querySelector('.nav');
      if (nav) nav.style.display = '';
      showLandingNav();
      
      const pageMain = document.getElementById('page-main');
      if (pageMain) pageMain.style.margin = '';

      updateAIDockState(page);
    }
    if (currentNavController) {
      currentNavController.abort();
    }

    const controller = new AbortController();
    currentNavController = controller;
    const signal = controller.signal;

    isTransitioning = true;

    let showLoaderTimer = null;
    let loaderShowing = false;

    function cleanupTransitionLoader() {
      if (window.TransitionLoader?.cleanup) {
        window.TransitionLoader.cleanup();
      } else {
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
          if (!loaderShowing && window.spaTransitionLoader) {
            window.spaTransitionLoader.stop();
          }
        }, 300);
      }
    }

    signal.addEventListener('abort', cleanupTransitionLoader);

    const contentEl = getOrCreateContentContainer();

    if (isDashboardTransition) {
      if (contentEl) {
        contentEl.style.transition = 'opacity 180ms ease, filter 180ms ease';
        contentEl.style.opacity = '0';
        contentEl.style.filter = 'blur(12px)';
        if (opts?.fromQC) {
          contentEl.style.visibility = 'hidden';
        }
      }
      if (!opts?.fromQC) {
        await rafDelay(page === 'generate' ? 140 : 250);
      }
      
      if (window.TransitionLoader?.startLoaderTimer) {
        window.TransitionLoader.startLoaderTimer(true);
      } else {
        showLoaderTimer = setTimeout(() => {
          loaderShowing = true;
          const dashLoader = document.getElementById('spa-dash-loader');
          if (dashLoader) dashLoader.classList.add('active');
        }, 1000);
      }
    } else {
      const maskPromise = maskClose();
      if (window.TransitionLoader?.startLoaderTimer) {
        window.TransitionLoader.startLoaderTimer(false);
      } else {
        showLoaderTimer = setTimeout(() => {
          loaderShowing = true;
          const overlay = document.getElementById('transition-loader-overlay');
          if (overlay) {
            overlay.classList.add('active');
          }
          if (window.spaTransitionLoader) {
            window.spaTransitionLoader.start();
          }
          startTextCycling();
        }, 1000);
      }
      await maskPromise;
    }

    try {
      showInnerLoader();
      const prefetchPromise = prefetchPage(page, opts);
      await prefetchPromise;

      if (signal.aborted || mySeq !== navSeq) {
        hideInnerLoader();
        return;
      }

      const def = pageDefs[page];
      if (def) {
        if (isDashboardPage(page)) {
          document.body.classList.add('dashboard-layout');
          showDashTopbar();
          window.AppShell?.updateRoute?.(page, opts);
        }
        const cssPromises = def.css.map(href => injectCSS(href));
        await Promise.all(cssPromises);
        if (signal.aborted || mySeq !== navSeq) {
          hideInnerLoader();
          return;
        }

        if (isDashboardPage(page)) {
          updateAIDockState(page);
        }

        removePageCSS(def.css);
        removePageScripts();

        const pageInstance = def.mount ? await def.mount(opts, signal) : await def.render(opts, signal);
        if (pageInstance && typeof pageInstance.unmount === 'function') {
          activePageInstance = pageInstance;
        }
        if (signal.aborted || mySeq !== navSeq) {
          if (activePageInstance) {
            try {
              activePageInstance.unmount?.();
            } catch (err) {}
            activePageInstance = null;
          }
          hideInnerLoader();
          return;
        }

        const jsToLoad = Array.isArray(def.js) ? def.js : [];
        await injectScripts(jsToLoad, signal);
        if (signal.aborted || mySeq !== navSeq) {
          hideInnerLoader();
          return;
        }
      }

      hideInnerLoader();

      if (window._landingKill) {
        window._landingKill();
        window._landingKill = null;
      }

      if (page === 'landing' && typeof window.initLandingPage === 'function') {
        prefetchAuthResources();
        if (typeof window.initLandingLogic === 'function') {
          window.initLandingLogic();
        }
        window.initLandingPage();
        requestAnimationFrame(() => {
          if (typeof window.ScrollTrigger !== 'undefined') {
            window.ScrollTrigger.refresh();
          }
        });
      } else if (page === 'template' && typeof window.initTemplatePage === 'function') {
        window.initTemplatePage();
      }

      if (isDashboardPage(page)) {
        document.body.classList.add('dashboard-layout');
        document.body.classList.remove('auth-layout');
        showDashTopbar();
        window.AppShell?.updateRoute?.(page, opts);
        updateAIDockState(page);
      } else if (page === 'landing') {
        document.body.classList.remove('dashboard-layout');
        document.body.classList.remove('auth-layout');
        window.AppShell?.updateRoute?.(page, opts);
        showLandingNav();
        updateAIDockState(page);
      } else if (page === 'login' || page === 'register') {
        document.body.classList.remove('dashboard-layout');
        document.body.classList.add('auth-layout');
        window.AppShell?.updateRoute?.(page, opts);
        showLandingNav();
        updateAIDockState(page);
      }

      // 網址列已在 navigate 開頭即時變更，此處不再重複處理

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      cleanupTransitionLoader();

      if (signal.aborted || mySeq !== navSeq) return;

      if (isDashboardTransition) {
        if (contentEl) {
          if (opts?.fromQC) {
            contentEl.style.transition = 'none';
            contentEl.style.opacity = '1';
            contentEl.style.visibility = 'visible';
            contentEl.style.filter = '';
          } else {
            contentEl.style.transition = 'opacity 250ms ease, filter 250ms ease';
            contentEl.style.opacity = '1';
            contentEl.style.visibility = '';
            contentEl.style.filter = 'blur(0px)';
          }
        }
      } else {
        if (contentEl) {
          contentEl.style.opacity = '1';
          contentEl.style.visibility = '';
          contentEl.style.filter = 'blur(0px)';
        }
        await maskOpen();
      }

      if (contentEl) {
        setTimeout(() => {
          contentEl.style.removeProperty('filter');
          contentEl.style.removeProperty('transition');
        }, 280);
      }

      if (signal.aborted || mySeq !== navSeq) return;

      currentPage = page;
      currentOpts = opts;
    } catch (e) {
      hideInnerLoader();
      if (e.name !== 'AbortError') {
        console.error('[spa navigate error]', e);
      }
    } finally {
      hideInnerLoader();
      cleanupTransitionLoader();
      if (contentEl) {
        contentEl.style.opacity = '1';
        contentEl.style.visibility = '';
        contentEl.style.filter = '';
        contentEl.style.transform = '';
      }
      if (currentNavController === controller) {
        currentNavController = null;
        isTransitioning = false;
        targetPage = null;
        targetOpts = null;
      }
      if (isDashboardPage(page) && page !== 'generate') {
        updateAIDockState(page);
      }
      if (window.DynamicMaskSystem) {
        window.DynamicMaskSystem.refresh();
      }
      document.body.classList.remove('is-navigating');
    }
  }

  window.addEventListener('popstate', e => {
    const statePage = e.state?.page;
    const stateId = e.state?.id;

    if (window.CreationController?.syncRoute) {
      window.CreationController.syncRoute(statePage);
    } else if (window.AICreationController) {
      if (window.AICreationController.surfaceState === 'workspace') {
        window.AICreationController.surfaceState = 'closed';
      }
      if (window.AICreationController.surfaceState === 'quick-compose') {
        window.AICreationController.closeQuickCompose(true);
      }
    }

    if (statePage) {
      navigate(statePage, {
        id: stateId || undefined,
        noHistory: true,
        force: true,
        noOpenQC: true
      });
      return;
    }

    const parsed = parseRouteFromHash(window.location.hash);
    navigate(parsed.page, {
      ...parsed.opts,
      noHistory: true,
      force: true,
      noOpenQC: true
    });
  });

  function interceptCTAs() {
    document.querySelectorAll('[data-navigate]').forEach(el => {
      if (el.dataset.spaBound) return;
      el.dataset.spaBound = 'true';

      el.addEventListener('click', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const target = el.getAttribute('data-navigate');
        if (spaAuth.isLoggedIn()) {
          navigate('dashboard');
        } else {
          navigate(target === 'register' ? 'register' : 'login');
        }
      });

      el.addEventListener('pointerenter', () => {
        const target = el.getAttribute('data-navigate');
        const page = spaAuth.isLoggedIn() ? 'dashboard' : (target === 'register' ? 'register' : 'login');
        prefetchPage(page);
      });
    });
  }

  function initDashboardLoader() {
    if (window.TransitionLoader?.initDashboardLoader) {
      return window.TransitionLoader.initDashboardLoader();
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initDashboardLoader();

    document.addEventListener('click', (e) => {
      const logo = e.target.closest('.brand-logo, .logo');
      if (logo) {
        if (!isDashboardPage(currentPage)) {
          e.preventDefault();
          navigate('landing');
        }
      }
    });

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('spa_page_cache_')) {
        localStorage.removeItem(key);
      }
    }

    initTransitionLoader();
    const m = document.getElementById('page-main');
    if (m) {
      landingHTML = m.innerHTML;
      landingClass = m.className;
      getOrCreateContentContainer();
    }

    if (maskTop() && maskBot()) {
      maskTop().style.transition = 'none';
      maskBot().style.transition = 'none';
      maskTop().style.pointerEvents = 'auto';
      maskBot().style.pointerEvents = 'auto';
      maskTop().style.opacity = '1';
      maskTop().style.backdropFilter = 'blur(15px)';
      maskTop().style.webkitBackdropFilter = 'blur(15px)';
      maskBot().style.opacity = '1';
    }

    window.addEventListener('resize', updateRailHoles);
    updateRailHoles();

    let initialPage = 'landing';
    let initialOpts = {};

    const parsedHash = parseRouteFromHash(window.location.hash);
    if (parsedHash.page !== 'landing') {
      initialPage = parsedHash.page;
      initialOpts = parsedHash.opts || {};
    } else {
      const pathname = window.location.pathname;
      if (pathname && pathname !== '/') {
        const projectMatch = pathname.match(/^\/project\/(.+)$/);
        if (projectMatch) {
          initialPage = 'project';
          initialOpts = { id: decodeURIComponent(projectMatch[1]) };
        } else {
          const cleanRoute = pathname.substring(1);
          if (pageDefs[cleanRoute]) {
            initialPage = cleanRoute;
          }
        }
      }
    }

    history.replaceState(
      { page: initialPage, id: initialOpts.id || null },
      '',
      window.location.pathname + window.location.search + window.location.hash
    );

    if (initialPage !== 'landing') {
      navigate(initialPage, {
        ...initialOpts,
        noHistory: true,
        force: true
      });
    } else {
      interceptCTAs();
      prefetchAuthResources();
      await injectScripts(pageDefs.landing.js);
      
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
      window.scrollTo(0, 0);
      
      updateRailHoles();
      
      if (typeof window.initLandingPage === 'function') {
        window.initLandingPage();
      }

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      
      await maskOpen();
      if (typeof window.ScrollTrigger !== 'undefined') {
        window.ScrollTrigger.refresh();
      }
    }
  });

  const bgTop = document.getElementById("bg-top");
  const railTop = document.getElementById("rail-top");
  const railBottom = document.getElementById("rail-bottom");

  if (bgTop && railTop && railBottom) {
    railTop.style.top = bgTop.offsetHeight * (5/7) + "px";
    railBottom.style.bottom = bgTop.offsetHeight * (5/7) + "px";
  }

  function startTextCycling() {
    if (window.TransitionLoader?.startTextCycling) {
      return window.TransitionLoader.startTextCycling();
    }
  }

  function stopTextCycling() {
    if (window.TransitionLoader?.stopTextCycling) {
      return window.TransitionLoader.stopTextCycling();
    }
  }

  function initTransitionLoader() {
    if (window.TransitionLoader?.initTransitionLoader) {
      return window.TransitionLoader.initTransitionLoader();
    }
  }

  window.spaNavigate = navigate;
  window.navigate = navigate;
  window.openGlobalOptionMorph = openGlobalOptionMorph;
  window.closeGlobalOptionMorph = closeGlobalOptionMorph;
  window.launchProjectRevealTransition = launchProjectRevealTransition;
  window.restoreProject = restoreProject;
  window.prefetchPage = prefetchPage;

})();
