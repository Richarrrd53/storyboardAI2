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
  let activeDisplayProjectsFn = null;
  let activeDisplayHistoryFn = null;

  const SKELETON_CARDS_HTML = Array.from({ length: 3 }).map(() => `
    <div class="project-card skeleton">
      <div class="card-strip">
        <div class="strip-hole"></div>
        <div class="strip-hole"></div>
        <div class="strip-hole"></div>
      </div>
      <div class="project-thumb skeleton-pulse" style="background: #e9e9f2; aspect-ratio: 16 / 9;"></div>
      <div class="project-info">
        <div class="skeleton-pulse" style="background: #e9e9f2; height: 1.2rem; border-radius: 4px; width: 70%; margin-bottom: 12px;"></div>
        <div class="project-meta" style="margin-bottom: 0; display: flex; gap: 12px;">
          <div class="skeleton-pulse" style="background: #e9e9f2; height: 16px; border-radius: 4px; width: 60px;"></div>
          <div class="skeleton-pulse" style="background: #e9e9f2; height: 16px; border-radius: 4px; width: 40px;"></div>
        </div>
      </div>
      <div class="card-strip bottom">
        <div class="strip-hole"></div>
        <div class="strip-hole"></div>
        <div class="strip-hole"></div>
      </div>
    </div>
  `).join('');

  window.htmlMemoryCache = {};
  window.spaMaskClose = maskClose;
  window.spaMaskOpen = maskOpen;
  window.spaSeedProjectCache = (projectId, projectData) => { cacheProjectDetails[projectId] = projectData; };

  let pendingProjectsPromise = null;
  let pendingTemplatesPromise = null;
  const pendingProjectDetailsPromises = {};

  window.clearSpaCache = () => {
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

  let toastTimeout = null;

  window.showSpaToast = (message, onUndo, duration = 5000) => {
    const toast = document.getElementById('global-toast');
    const toastText = document.getElementById('global-toast-text');
    const undoBtn = document.getElementById('global-toast-undo');
    if (!toast || !toastText || !undoBtn) return;

    if (toastTimeout) {
      clearTimeout(toastTimeout);
      toastTimeout = null;
    }

    toastText.textContent = message;

    if (onUndo) {
      undoBtn.style.display = '';
      undoBtn.onclick = (e) => {
        e.preventDefault();
        onUndo();
        toast.classList.remove('show');
        if (toastTimeout) {
          clearTimeout(toastTimeout);
          toastTimeout = null;
        }
      };
    } else {
      undoBtn.style.display = 'none';
      undoBtn.onclick = null;
    }

    toast.classList.add('show');

    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
      toastTimeout = null;
    }, duration);
  };

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
        const errorData = await res.json();
        throw new Error(errorData.error || '登入失敗');
      }
      const data = await res.json();
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      window.clearSpaCache();
      return data;
    },
    logout: async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) { }
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.clearSpaCache();
      window.location.hash = '';
      if (window.parent && window.parent !== window) {
        window.parent.history.replaceState(null, '', '/');
      }
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
            localStorage.removeItem(AUTH_TOKEN_KEY);
            window.clearSpaCache();
            return { valid: false };
          }
          return { valid: true, error: true };
        }

        const data = await res.json();
        return { valid: true, user: data.user };
      } catch (e) {
        if (e.name === 'AbortError') return { valid: true, aborted: true };
        return { valid: true, error: true };
      }
    },
    fetchProjects: async (signal) => {
      if (pendingProjectsPromise) {
        return pendingProjectsPromise;
      }

      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return [];

      pendingProjectsPromise = (async () => {
        try {
          const res = await fetch('/api/projects?include_deleted=true', {
            signal,
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (!res.ok) return [];

          const data = await res.json();
          const projects = data.projects || [];

          projects.forEach(p => {
            if (recentlyDeleted.has(p.id)) {
              p.is_deleted = true;
            }
            if (recentlyRestored.has(p.id)) {
              p.is_deleted = false;
            }
          });

          projects.forEach(p => {
            if (p.is_deleted && recentlyDeleted.has(p.id)) {
              recentlyDeleted.delete(p.id);
            }
            if (!p.is_deleted && recentlyRestored.has(p.id)) {
              recentlyRestored.delete(p.id);
            }
          });

          return projects;
        } catch (e) {
          if (e.name === 'AbortError') return [];
          return [];
        } finally {
          pendingProjectsPromise = null;
        }
      })();

      return pendingProjectsPromise;
    }
  };

  function rafDelay(ms) {
    return new Promise(resolve => {
      const start = performance.now();
      function frame(now) {
        if (now - start >= ms) {
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      }
      requestAnimationFrame(frame);
    });
  }

  async function fetchTemplates(signal) {
    if (cacheTemplatesList) return cacheTemplatesList;
    if (pendingTemplatesPromise) return pendingTemplatesPromise;

    pendingTemplatesPromise = (async () => {
      try {
        const res = await fetch('/api/get-templates', { signal });
        if (res.ok) {
          const templates = await res.json();
          cacheTemplatesList = templates;
          return templates;
        }
        return [];
      } catch (e) {
        return [];
      } finally {
        pendingTemplatesPromise = null;
      }
    })();

    return pendingTemplatesPromise;
  }

  async function fetchProjectDetail(projectId, signal) {
    if (cacheProjectDetails[projectId]) return cacheProjectDetails[projectId];
    if (pendingProjectDetailsPromises[projectId]) return pendingProjectDetailsPromises[projectId];

    pendingProjectDetailsPromises[projectId] = (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          signal,
          headers: { 'Authorization': `Bearer ${spaAuth.getToken()}` }
        });
        if (res.ok) {
          const data = await res.json();
          const p = data?.project;
          if (p) {
            cacheProjectDetails[projectId] = p;
            return p;
          }
        }
        return null;
      } catch (e) {
        return null;
      } finally {
        delete pendingProjectDetailsPromises[projectId];
      }
    })();

    return pendingProjectDetailsPromises[projectId];
  }

  async function prefetchPage(page, opts = {}) {
    let htmlUrl = null;
    if (page === 'login' || page === 'register') htmlUrl = '/html/login.html';
    else if (page === 'dashboard' || page === 'project') htmlUrl = '/html/dashboard.html';
    else if (page === 'projects') htmlUrl = '/html/projects.html';
    else if (page === 'generate') htmlUrl = '/html/generate.html';
    else if (page === 'history') htmlUrl = '/html/history.html';
    else if (page === 'template') htmlUrl = '/html/template.html';

    if (htmlUrl) {
      fetchPageDoc(htmlUrl).catch(() => {});
    }

    if (spaAuth.isLoggedIn()) {
      if (page === 'dashboard' || page === 'projects' || page === 'history') {
        if (!cacheProjectsList) {
          spaAuth.fetchProjects().catch(() => {});
        }
      } else if (page === 'template') {
        fetchTemplates().catch(() => {});
      } else if (page === 'project' && opts.id) {
        fetchProjectDetail(opts.id).catch(() => {});
      }
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
        img.className = 'lazy-thumb';
        img.alt = 'Cover';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'scale-down';
        img.style.opacity = '0';
        img.style.transition = 'opacity 0.45s ease-in-out';
        
        thumb.appendChild(img);
        requestAnimationFrame(() => {
          img.style.opacity = '1';
          thumb.classList.remove('loading');
        });
      };
      img.onerror = () => {
        thumb.innerHTML = '🎬';
        thumb.classList.remove('loading');
      };
      img.src = src;
    });
  }

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

  const loadedCSS = new Set();
  const injectedScripts = [];

  function injectCSS(href) {
    return new Promise((resolve) => {
      const fullUrl = new URL(href, window.location.origin).pathname;
      if (loadedCSS.has(fullUrl)) {
        resolve();
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.spaSheet = '1';
      link.onload = () => {
        loadedCSS.add(fullUrl);
        resolve();
      };
      link.onerror = () => {
        loadedCSS.add(fullUrl);
        resolve();
      };
      document.head.appendChild(link);
    });
  }

  function removePageCSS(nextCSS = []) {
    const normalizedNext = nextCSS.map(href => new URL(href, window.location.origin).pathname);
    document.querySelectorAll('link[data-spa-sheet]').forEach(el => {
      const href = new URL(el.href, window.location.origin).pathname;
      if (!normalizedNext.includes(href)) {
        el.remove();
        loadedCSS.delete(href);
      }
    });
  }

  const loadedScripts = new Set();

  function injectScript(src, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve(false);
        return;
      }

      const pathname = new URL(src, window.location.href).pathname;

      if (loadedScripts.has(pathname)) {
        resolve(true);
        return;
      }

      const existing = document.querySelector(`script[data-spa-script][data-src="${pathname}"]`);
      if (existing) {
        loadedScripts.add(pathname);
        resolve(true);
        return;
      }

      const s = document.createElement('script');
      s.dataset.spaScript = '1';
      s.dataset.src = pathname;

      if (src.includes('landing-animation.js')) {
        s.type = 'module';
      }

      s.src = src;

      const cleanup = () => {
        s.onload = null;
        s.onerror = null;
      };

      s.onload = () => {
        cleanup();

        if (!signal?.aborted) {
          loadedScripts.add(pathname);
        }

        resolve(true);
      };

      s.onerror = () => {
        cleanup();
        resolve(false);
      };

      document.body.appendChild(s);
    });
  }

  function injectScripts(scripts, signal) {
    if (!scripts || scripts.length === 0) return Promise.resolve();
    const promises = scripts.map(src => {
      return new Promise((resolve) => {
        if (signal?.aborted) {
          resolve(false);
          return;
        }

        const pathname = new URL(src, window.location.href).pathname;

        if (loadedScripts.has(pathname)) {
          resolve(true);
          return;
        }

        const existing = document.querySelector(`script[data-spa-script][data-src="${pathname}"]`);
        if (existing) {
          loadedScripts.add(pathname);
          resolve(true);
          return;
        }

        const s = document.createElement('script');
        s.dataset.spaScript = '1';
        s.dataset.src = pathname;

        if (src.includes('landing-animation.js')) {
          s.type = 'module';
        } else {
          s.async = false;
        }

        s.src = src;

        const cleanup = () => {
          s.onload = null;
          s.onerror = null;
        };

        s.onload = () => {
          cleanup();
          if (!signal?.aborted) {
            loadedScripts.add(pathname);
          }
          resolve(true);
        };

        s.onerror = () => {
          cleanup();
          resolve(false);
        };

        document.body.appendChild(s);
      });
    });
    return Promise.all(promises);
  }

  function removePageScripts() {
  }

  async function fetchPageDoc(url, signal) {
    if (window.htmlMemoryCache[url]) {
      return window.htmlMemoryCache[url];
    }
    const cacheKey = 'spa_page_cache_' + url;
    const cachedHTML = localStorage.getItem(cacheKey);
    if (cachedHTML) {
      const doc = new DOMParser().parseFromString(cachedHTML, 'text/html');
      window.htmlMemoryCache[url] = doc;
      return doc;
    }
    const res = await fetch(url + '?v=' + Date.now(), { signal });
    const html = await res.text();
    try {
      localStorage.setItem(cacheKey, html);
    } catch (e) {
      console.warn('Failed to cache page doc in localStorage:', e);
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    window.htmlMemoryCache[url] = doc;
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
    const startedAt = performance.now();

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

  let innerLoaderTimer = null;
  let innerRoseLoaderInstance = null;

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
    if (newMain && content) {
      content.innerHTML = '';
      if (newMain.className) {
        content.className = newMain.className;
      }
      Array.from(newMain.childNodes).forEach(child => {
        content.appendChild(child.cloneNode(true));
      });
    }
  }

  async function deleteProject(p, card, refreshCallback) {
    const isConfirmed = await confirm('是否刪除此專案？', `「${p.title}」將從此頁面上刪除，刪除後的專案將會移至「資源回收桶」，您可以在「歷史專案」復原`, 'delete', '刪除', card);
    if (!isConfirmed) return;

    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.9) translateY(20px)';

    const transitionTimeout = setTimeout(() => {
      refreshCallback();
    }, 400);

    const deleteTimeout = setTimeout(async () => {
      try {
        const token = spaAuth.getToken();
        const res = await fetch(`/api/projects/${p.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          p.is_deleted = true;
          recentlyDeleted.add(p.id);
          recentlyRestored.delete(p.id);
          const updated = await spaAuth.fetchProjects();
          cacheProjectsList = updated;
          window.showSpaToast(`專案「${p.title}」已移至資源回收桶。`);
        }
      } catch (err) {
        console.error('Failed to soft-delete project on server', err);
      }
      delete pendingDeletions[p.id];
      if (currentPage === 'dashboard' && activeDisplayProjectsFn) {
        activeDisplayProjectsFn(cacheProjectsList);
      } else if (currentPage === 'history' && activeDisplayHistoryFn) {
        activeDisplayHistoryFn(cacheProjectsList);
      }
    }, 5000);

    pendingDeletions[p.id] = {
      deleteTimeout,
      transitionTimeout,
      project: p
    };

    window.showSpaToast(`專案「${p.title}」已移至資源回收桶。`, () => {
      const item = pendingDeletions[p.id];
      if (item) {
        clearTimeout(item.deleteTimeout);
        clearTimeout(item.transitionTimeout);
        delete pendingDeletions[p.id];
      }
      window.showSpaToast("專案已復原。");
      refreshCallback();
    }, 5000);
  }

  async function restoreProject(p, card, refreshCallback) {
    const isConfirmed = await confirm('是否還原此專案？', ``, 'default', '還原', null);
    if (!isConfirmed) return;

    p.is_deleted = false;
    recentlyRestored.add(p.id);
    recentlyDeleted.delete(p.id);
    refreshCallback();

    window.showSpaToast(`專案「${p.title}」已還原。`);

    try {
      const token = spaAuth.getToken();
      const res = await fetch(`/api/projects/${p.id}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const updated = await spaAuth.fetchProjects();
        cacheProjectsList = updated;
      } else {
        throw new Error('還原失敗');
      }
    } catch (err) {
      console.error('Failed to restore project on server', err);
      p.is_deleted = true;
      recentlyRestored.delete(p.id);
      recentlyDeleted.add(p.id);
      refreshCallback();
      alert('還原失敗，伺服器出錯');
    }
  }

  function showProjectOptionsDropdown(project, card, optionBtn, isHistoryPage, refreshCallback) {
    const overlay = document.createElement('div');
    overlay.className = 'options-dropdown-overlay';

    const menu = document.createElement('div');
    menu.className = 'options-dropdown-menu';

    let actionsHtml = '';
    if (project.is_deleted) {
      actionsHtml = `
        <button class="options-dropdown-item restore" id="opt-restore">
          <span class="options-dropdown-item-icon">
            <img src="../icon/restore.svg">
          </span>
          <span>還原專案</span>
        </button>
      `;
    } else {
      actionsHtml = `
        <button class="options-dropdown-item open" id="opt-open">
          <span class="options-dropdown-item-icon">
            <div class="folder">
              <div class="front-side">
                <div class="cover"></div>
              </div>
              <div class="back-side">
                <div class="tip"></div>
                <div class="cover"></div>
              </div>
            </div>
          </span>
          <span>開啟專案</span>
        </button>
        <button class="options-dropdown-item delete" id="opt-delete">
          <span class="options-dropdown-item-icon">
            <img class="delete-1" src="../icon/delete-1.svg">
            <img class="delete-2" src="../icon/delete-2.svg">
          </span>
          <span>刪除專案</span>
        </button>
      `;
    }

    menu.innerHTML = actionsHtml;
    overlay.appendChild(menu);
    document.body.appendChild(overlay);

    const rect = optionBtn.getBoundingClientRect();
    const menuWidth = 170;
    const gap = 16;

    let top = rect.top + window.scrollY;

    let left = rect.right + window.scrollX + gap;
    let transformOrigin = 'top left';

    if (left + menuWidth > window.innerWidth) {
      left = rect.left + window.scrollX - menuWidth - gap;
      transformOrigin = 'top right';
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
      menu.style.transition = 
      setTimeout(() => {
        overlay.classList.remove('active');
      }, 500);
      setTimeout(() => overlay.remove(), 700);
    };

    overlay.addEventListener('click', closeDropdown);

    const openBtn = menu.querySelector('#opt-open');
    if (openBtn) {
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        navigate('project', { id: project.id });
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
        slash.style.transform = "translateY(-5vh)";
        mask.style.transform = "translate(7.5vh, -5vh) rotate(45deg)";
      }
      else {
        inp.style.filter = "blur(3px)";
        setTimeout(() => {
          inp.style.filter = "blur(0px)";

          inp.type = 'password';
        }, 300);
        slash.style.transform = "translateY(0vh)";
        mask.style.transform = "translate(2.5vh, 0vh) rotate(45deg)";
      }
    };

    function showToast(msg) {
      const t = document.getElementById('toast');
      if (!t) return;
      t.classList.remove('show');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2800);
    }

    window.handleLogin = async function () {
      const email = document.getElementById('login-email')?.value;
      const pass = document.getElementById('login-password')?.value;
      if (!email || !pass) { showToast('電子信箱和密碼不可為空！'); return; }
      showToast('正在驗證中...');
      try {
        await spaAuth.login(email, pass);
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

      showToast('正在註冊中...');
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password: pass })
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || '註冊失敗');
        }
        const data = await res.json();
        showToast('註冊成功！已為您自動登入。');
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
  dashboardSidebar = dashboardSidebar || document.getElementById('dash-sidebar');
  dashboardTopbar = dashboardTopbar || document.getElementById('spa-topbar');
  mobileBottomNav = mobileBottomNav || document.getElementById('spa-mobile-nav');
  dashboardUserPanel = dashboardUserPanel || document.getElementById('spa-user-panel');

  

  if (!dashboardSidebar || !dashboardTopbar) {
    const doc = await fetchPageDoc('/html/dashboard.html', signal);
    if (signal?.aborted) return;

    const sidebar = doc.querySelector('aside.sidebar') || doc.querySelector('.sidebar');
    if (sidebar && !document.getElementById('dash-sidebar')) {
      dashboardSidebar = sidebar.cloneNode(true);
      dashboardSidebar.id = 'dash-sidebar';
      document.body.appendChild(dashboardSidebar);
    }

    const topbar = doc.querySelector('header.topbar') || doc.querySelector('.topbar');
    if (topbar && !document.getElementById('spa-topbar')) {
      dashboardTopbar = topbar.cloneNode(true);
      dashboardTopbar.id = 'spa-topbar';
      document.body.appendChild(dashboardTopbar);
    }

    const mobNav = doc.querySelector('.mobile-bottom-nav');
    if (mobNav && !document.getElementById('spa-mobile-nav')) {
      mobileBottomNav = mobNav.cloneNode(true);
      mobileBottomNav.id = 'spa-mobile-nav';
      document.body.appendChild(mobileBottomNav);
    }

    const up = doc.querySelector('.user-panel');
    if (up && !document.getElementById('spa-user-panel')) {
      const upEl = up.cloneNode(true);
      upEl.id = 'spa-user-panel';
      dashboardUserPanel = upEl;
      document.body.appendChild(upEl);
    }
  }

  await initSharedLayoutLogic(signal);
}

  async function initSharedLayoutLogic(signal) {
    updateRailHoles();

    const avatar = document.getElementById('top-avatar') || dashboardTopbar?.querySelector('#top-avatar');
    const panel = document.getElementById('spa-user-panel');

    const result = await spaAuth.fetchUser(signal);
    if (signal?.aborted || result?.aborted) return;

    if (result && result.user && panel) {
      const name = result.user.name || 'User';
      const initial = name.charAt(0).toUpperCase();
      const userImage = result.user.image
        ? `<img src="${result.user.image}" style="width: 100%; height: 100%; border-radius: 50%;" alt="">`
        : initial;

      if (avatar) avatar.innerHTML = userImage;

      const upAvatar = panel.querySelector('.up-avatar');
      if (upAvatar) upAvatar.innerHTML = userImage;

      const upName = panel.querySelector('.up-name');
      if (upName) upName.textContent = name;

      const upPlan = panel.querySelector('.up-plan');
      const plans = { free: 'Free', pro: 'Pro', promax: 'Pro Max' };

      if (upPlan) {
        upPlan.classList.add(result.user.plan);
        upPlan.textContent = plans[result.user.plan];
      }

      const upEmail = panel.querySelector('.up-email');
      if (upEmail) upEmail.textContent = result.user.email;
    } else if (result && result.valid === false) {
      spaAuth.logout();
    }

    if (avatar && panel) {
      avatar.onclick = e => {
        e.stopPropagation();
        panel.classList.toggle('active');
      };
    }

    const logout = panel?.querySelector('.up-logout');
    if (logout && !logout.dataset.spaBound) {
      logout.dataset.spaBound = 'true';
      logout.addEventListener('click', async e => {
        e.preventDefault();
        const isConfirmed = await confirm('是否確定登出？', '登出後將清除快取並返回首頁。', 'danger', '登出');
        if (isConfirmed) {
          spaAuth.logout();
        }
      });
    }

    bindSidebarLinks();

    const parsed = parseRouteFromHash(window.location.hash);
    if (parsed.page === 'project' || parsed.page === 'generate' || parsed.page === 'projects') {
      localStorage.setItem('sidebar_projects_expanded', 'true');
      expandSidebar(true);
      const subList = document.getElementById('sidebar-projects-list') || dashboardSidebar?.querySelector('#sidebar-projects-list');
      const navProjectsGroup = document.getElementById('nav-projects-group') || dashboardSidebar?.querySelector('#nav-projects-group');
      if (subList) subList.classList.add('expanded');
      if (navProjectsGroup) navProjectsGroup.classList.add('expanded');
    }

    if (spaAuth.isLoggedIn() && !cacheProjectsList) {
      spaAuth.fetchProjects(signal).then(projects => {
        if (signal?.aborted) return;
        cacheProjectsList = projects;
        updateSidebarProjects();
      }).catch(err => {
        console.error("Failed to prefetch projects for sidebar", err);
      });
    }
  }

  async function renderDashboard(signal) {
    const doc = await fetchPageDoc('/html/dashboard.html', signal);
    if (signal?.aborted) return;

    const m = initMain();
    m.className = 'spa-dash-wrap';

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    const recentProjectsGrid = document.getElementById('recent-projects-grid');
    if (recentProjectsGrid) {
      function displayRecentProjects(projects) {
        const activeProjects = (projects || [])
          .filter(p => !p.is_deleted && !pendingDeletions[p.id])
          .sort((a, b) => new Date(b.createAt) - new Date(a.createAt));
        
        const recentProjects = activeProjects.slice(0, 3);
        
        recentProjectsGrid.innerHTML = '';
        if (recentProjects.length === 0) {
          recentProjectsGrid.innerHTML = `
            <div class="projects-empty">
              <h3>尚無專案</h3>
              <p>點擊上方「新建分鏡」開始建立你的第一個分鏡腳本！</p>
            </div>
          `;
        } else {
          recentProjects.forEach(p => {
            const date = new Date(p.createAt).toLocaleDateString('zh-TW');
            const card = document.createElement('div');
            card.className = 'project-card';
            
            card.onclick = (e) => {
              if (e.target.closest('.project-option-btn')) return;
              navigate('project', { id: p.id });
            };
            card.addEventListener('pointerenter', () => {
              prefetchPage('project', { id: p.id });
            });

            const thumbHTML = `<div class="project-thumb loading" data-src="/api/projects/${p.id}/cover"></div>`;

            card.innerHTML = `
              <div class="card-strip">
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
                <button class="project-option-btn" title="專案選項" data-id="${p.id}">⋯</button>
              </div>
              ${thumbHTML}
              <div class="project-info">
                <div class="project-title">${p.title}</div>
                <div class="project-meta">
                  <span class="project-tag">${date}</span>
                  <span class="project-tag">${p.ratio}</span>
                </div>
              </div>
              <div class="card-strip bottom">
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
              </div>
            `;

            const optionBtn = card.querySelector('.project-option-btn');
            if (optionBtn) {
              optionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showProjectOptionsDropdown(p, card, optionBtn, false, () => {
                  displayRecentProjects(cacheProjectsList);
                  updateSidebarProjects();
                });
              });
            }

            recentProjectsGrid.appendChild(card);
          });
          lazyLoadProjectThumbs(recentProjectsGrid);
        }
      }

      if (spaAuth.isLoggedIn()) {
        spaAuth.fetchUser(signal).then(result => {
          if (result && result.user) {
            const nameEl = document.getElementById('home-user-name');
            if (nameEl) nameEl.textContent = result.user.name || '創作者';
          }
        }).catch(() => {});
      }

      if (cacheProjectsList) {
        displayRecentProjects(cacheProjectsList);
        fetchProjectsBackground();
      } else {
        recentProjectsGrid.innerHTML = SKELETON_CARDS_HTML;
        fetchProjectsNetwork();
      }

      async function fetchProjectsNetwork() {
        const projects = await spaAuth.fetchProjects(signal);
        if (signal?.aborted) return;
        cacheProjectsList = projects;
        displayRecentProjects(projects);
        updateSidebarProjects();
      }

      async function fetchProjectsBackground() {
        try {
          const projects = await spaAuth.fetchProjects(signal);
          if (signal?.aborted) return;
          const currentJSON = JSON.stringify(cacheProjectsList);
          const newJSON = JSON.stringify(projects);
          if (currentJSON !== newJSON) {
            cacheProjectsList = projects;
            displayRecentProjects(projects);
            updateSidebarProjects();
          }
        } catch (e) {}
      }
    }
  }

  async function renderProjectsPage(signal) {
    const doc = await fetchPageDoc('/html/projects.html', signal);
    if (signal?.aborted) return;

    const m = initMain();
    m.className = 'spa-projects-wrap';

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    const projectsGrid = document.getElementById('projects-grid');
    if (projectsGrid) {
      function displayProjects(projects) {
        activeDisplayProjectsFn = displayProjects;
        const activeProjects = (projects || []).filter(p => !p.is_deleted && !pendingDeletions[p.id]);
        
        projectsGrid.innerHTML = '';
        if (activeProjects.length === 0) {
          projectsGrid.innerHTML = `
            <div class="projects-empty">
              <h3>尚無專案</h3>
              <p>開始建立你的第一個分鏡腳本！</p>
            </div>
          `;
        } else {
          activeProjects.forEach(p => {
            const date = new Date(p.createAt).toLocaleDateString('zh-TW');
            const card = document.createElement('div');
            card.className = 'project-card';
            
            card.onclick = (e) => {
              if (e.target.closest('.project-option-btn')) return;
              navigate('project', { id: p.id });
            };
            card.addEventListener('pointerenter', () => {
              prefetchPage('project', { id: p.id });
            });

            const thumbHTML = `<div class="project-thumb loading" data-src="/api/projects/${p.id}/cover"></div>`;

            card.innerHTML = `
              <div class="card-strip">
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
                <button class="project-option-btn" title="專案選項" data-id="${p.id}">⋯</button>
              </div>
              ${thumbHTML}
              <div class="project-info">
                <div class="project-title">${p.title}</div>
                <div class="project-meta">
                  <span class="project-tag">${date}</span>
                  <span class="project-tag">${p.ratio}</span>
                </div>
              </div>
              <div class="card-strip bottom">
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
              </div>
            `;

            const optionBtn = card.querySelector('.project-option-btn');
            if (optionBtn) {
              optionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showProjectOptionsDropdown(p, card, optionBtn, false, () => {
                  displayProjects(cacheProjectsList);
                  updateSidebarProjects();
                });
              });
            }

            projectsGrid.appendChild(card);
          });
          lazyLoadProjectThumbs(projectsGrid);
        }
      }

      if (cacheProjectsList) {
        displayProjects(cacheProjectsList);
        fetchProjectsBackground();
      } else {
        projectsGrid.innerHTML = SKELETON_CARDS_HTML;
        fetchProjectsNetwork();
      }

      async function fetchProjectsNetwork() {
        const projects = await spaAuth.fetchProjects(signal);
        if (signal?.aborted) return;
        cacheProjectsList = projects;
        displayProjects(projects);
        updateSidebarProjects();
      }

      async function fetchProjectsBackground() {
        try {
          const projects = await spaAuth.fetchProjects(signal);
          if (signal?.aborted) return;
          const currentJSON = JSON.stringify(cacheProjectsList);
          const newJSON = JSON.stringify(projects);
          if (currentJSON !== newJSON) {
            cacheProjectsList = projects;
            displayProjects(projects);
            updateSidebarProjects();
          }
        } catch (e) {}
      }
    }
  }

  async function initDashboardLogic() {
    updateRailHoles();

    const avatar = document.getElementById('top-avatar') || dashboardTopbar?.querySelector('#top-avatar');
    const panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel');

    const result = await spaAuth.fetchUser();
    if (result && result.user && panel) {
      const name = result.user.name || 'User';
      const initial = name.charAt(0).toUpperCase();
      if (avatar) avatar.textContent = initial;

      const upAvatar = panel.querySelector('.up-avatar');
      if (upAvatar) upAvatar.textContent = initial;

      const upName = panel.querySelector('.up-name');
      if (upName) upName.textContent = name;

      const upEmail = panel.querySelector('.up-email');
      if (upEmail) upEmail.textContent = result.user.email;
    } else if (result && result.valid === false) {
      spaAuth.logout();
    }

    if (avatar && panel) {
      avatar.onclick = e => { e.stopPropagation(); panel.classList.toggle('active'); };
      document.addEventListener('click', () => panel.classList.remove('active'), { once: false });
    }

    const logout = panel?.querySelector('.up-logout');
    if (logout && !logout.dataset.spaBound) {
      logout.dataset.spaBound = 'true';
      logout.addEventListener('click', async e => {
        e.preventDefault();
        const isConfirmed = await confirm('是否確定登出？', '登出後將清除快取並返回首頁。', 'danger', '登出');
        if (isConfirmed) {
          spaAuth.logout();
        }
      });
    }

    const projectsGrid = document.getElementById('projects-grid');
    if (projectsGrid) {
      projectsGrid.innerHTML = SKELETON_CARDS_HTML;
      const projects = await spaAuth.fetchProjects();
      projectsGrid.innerHTML = '';

      if (!projects || projects.length === 0) {
        projectsGrid.innerHTML = `
          <div class="projects-empty">
            <h3>尚無專案</h3>
            <p>開始建立你的第一個分鏡腳本！</p>
          </div>
        `;
      } else {
        projects.forEach(p => {
          const date = new Date(p.createAt).toLocaleDateString('zh-TW');
          const card = document.createElement('div');
          card.className = 'project-card';
          card.onclick = () => navigate('generate');
          card.addEventListener('pointerenter', () => {
            prefetchPage('generate');
          });
          const thumbHTML = `<div class="project-thumb loading" data-src="/api/projects/${p.id}/cover"></div>`;
          card.innerHTML = `
            ${thumbHTML}
            <div class="project-info">
              <div class="project-title">${p.title}</div>
              <div class="project-meta">
                <span class="project-tag">${p.style}</span>
                <span class="project-tag">${p.ratio}</span>
              </div>
              <div class="project-date">建立於 ${date}</div>
            </div>
          `;
          projectsGrid.appendChild(card);
        });
        lazyLoadProjectThumbs(projectsGrid);
      }
    }

    bindSidebarLinks();
  }

  async function renderGenerate(opts, signal) {
    const doc = await fetchPageDoc('/html/generate.html', signal);
    if (signal?.aborted) return;

    const m = initMain();
    m.className = 'spa-gen-wrap';

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);

    if (opts && opts.templateId) {
      window.preselectedTemplateId = opts.templateId;
    } else {
      window.preselectedTemplateId = null;
    }
  }

  async function renderHistory(signal) {
    const doc = await fetchPageDoc('/html/history.html', signal);
    if (signal?.aborted) return;

    const m = initMain();
    m.className = 'spa-history-wrap';

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    const projectsGrid = document.getElementById('projects-grid');
    if (!projectsGrid) return;

    function displayHistory(projects) {
      activeDisplayHistoryFn = displayHistory;

      const visibleProjects = (projects || []).filter(p => p.is_deleted && !pendingDeletions[p.id]);

      projectsGrid.innerHTML = '';
      if (!visibleProjects || visibleProjects.length === 0) {
        projectsGrid.innerHTML = `
          <div class="projects-empty">
            <h3>資源回收桶目前是空的</h3>
            <p>刪除的專案將會暫時保留在此處，以便日後還原。</p>
          </div>
        `;
      } else {
        visibleProjects.forEach(p => {
          const date = new Date(p.createAt).toLocaleDateString('zh-TW');
          const card = document.createElement('div');
          
          if (p.is_deleted) {
            card.className = 'project-card project-card-deleted';
            card.onclick = (e) => {
              if (e.target.closest('.project-option-btn')) return;
              alert('此專案已被刪除，請點擊右上角「⋯」按鈕並選擇「還原專案」進行還原。');
            };
          } else {
            card.className = 'project-card';
            card.onclick = (e) => {
              if (e.target.closest('.project-option-btn')) return;
              navigate('project', { id: p.id });
            };
            card.addEventListener('pointerenter', () => {
              prefetchPage('project', { id: p.id });
            });
          }

          const thumbHTML = `<div class="project-thumb loading" data-src="${p.id}"></div>`;

          card.innerHTML = `
            <div class="card-strip">
              <div class="strip-hole"></div>
              <div class="strip-hole"></div>
              <div class="strip-hole"></div>
              <button class="project-option-btn" title="專案選項" data-id="${p.id}">⋯</button>
            </div>
            ${thumbHTML}
            <div class="project-info">
              <div class="project-title">${p.title}</div>
              <div class="project-meta">
                <span class="project-tag">${date}</span>
                <span class="project-tag">${p.ratio}</span>
              </div>
              <div class="project-date">專案風格：${p.style || '未指定'}</div>
            </div>
            <div class="card-strip bottom">
              <div class="strip-hole"></div>
              <div class="strip-hole"></div>
              <div class="strip-hole"></div>
            </div>
          `;

          const optionBtn = card.querySelector('.project-option-btn');
          if (optionBtn) {
            optionBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              showProjectOptionsDropdown(p, card, optionBtn, true, () => {
                displayHistory(cacheProjectsList);
                updateSidebarProjects();
              });
            });
          }

          projectsGrid.appendChild(card);
        });
        lazyLoadProjectThumbs(projectsGrid);
      }
    }

    if (cacheProjectsList) {
      displayHistory(cacheProjectsList);
      fetchHistoryBackground();
    } else {
      projectsGrid.innerHTML = SKELETON_CARDS_HTML;
      fetchHistoryNetwork();
    }

    async function fetchHistoryNetwork() {
      const projects = await spaAuth.fetchProjects(signal);
      if (signal?.aborted) return;
      cacheProjectsList = projects;
      displayHistory(projects);
    }

    async function fetchHistoryBackground() {
      try {
        const projects = await spaAuth.fetchProjects(signal);
        if (signal?.aborted) return;
        const currentJSON = JSON.stringify(cacheProjectsList);
        const newJSON = JSON.stringify(projects);
        if (currentJSON !== newJSON) {
          cacheProjectsList = projects;
          displayHistory(projects);
        }
      } catch (e) {}
    }
  }

  async function renderTemplate(signal) {
    const doc = await fetchPageDoc('/html/template.html', signal);
    if (signal?.aborted) return;

    const m = initMain();
    m.className = 'spa-template-wrap';

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    const catsEl = document.getElementById('template-cats');
    const gridEl = document.getElementById('template-grid');
    const detailEl = document.getElementById('template-detail');

    if (!catsEl || !gridEl || !detailEl) return;

    gridEl.innerHTML = '<div style="color:var(--text-mid); text-align:center; padding: 40px; grid-column: 1/-1;">載入中...</div>';

    let templates = [];
    try {
      templates = await fetchTemplates(signal);
    } catch (e) {
      if (e.name === 'AbortError') return;
      templates = [];
    }

    if (signal?.aborted) return;

    if (!templates || templates.length === 0) {
      catsEl.innerHTML = '';
      gridEl.innerHTML = `
        <div class="projects-empty">
          <h3>目前尚無模板</h3>
          <p>已同步的爆點模板尚未產生，請稍後再試或上傳模板。</p>
        </div>
      `;
      return;
    }

    const CAT_MAP = {
      'product': '商品焦點',
      'story': '品牌故事',
      'twist': '反轉爆點',
      'custom': '自訂模板',
      '未分類': '未分類'
    };

    const groups = { '全部': templates };
    templates.forEach(t => {
      const dbCat = t.category || t.type || '未分類';
      const k = CAT_MAP[dbCat] || dbCat;
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    });

    const categories = ['全部', ...Object.keys(groups).filter(k => k !== '全部')];

    catsEl.innerHTML = categories
      .map((c, i) => `<button class="tpl-cat ${i === 0 ? 'active' : ''}" data-cat="${c}">${c} <span class="count">(${groups[c].length})</span></button>`)
      .join('');

    function renderGridFor(cat) {
      const items = groups[cat] || [];

      gridEl.innerHTML = items.map(it => `
        <div class="template-card" data-id="${it.id || ''}" data-title="${(it.name || it.title || '無標題').replace(/"/g, '')}">
          <div class="template-thumb">${it.thumbnail ? `<img src="${it.thumbnail}" alt="${it.name || it.title}">` : '📄'}</div>
          <div class="template-info">
            <div class="template-title">${it.name || it.title || '無標題'}</div>
          </div>
        </div>
      `).join('');

      gridEl.querySelectorAll('.template-card').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          const t = items.find(x => (x.id || '') === id) || items.find(x => (x.name || x.title || '') === el.dataset.title);
          if (!t) return;

          const varsList = Array.isArray(t.variables) ? t.variables : [];
          const platformText = Array.isArray(t.platform) ? t.platform.join(', ') : (t.platform || '無限制');
          const narrativeType = t.narrative?.type || '無';
          const paceLabel = t.visualFlow?.pace || 'medium';
          const duration = t.structure?.length ? t.structure.map(s => parseInt(s.duration) || 0).reduce((a, b) => a + b, 0) + 's' : '0s';

          detailEl.innerHTML = `
            <div class="template-detail-header" style="border-bottom: 2px solid var(--border-warm); padding-bottom: 20px; margin-bottom: 20px;">
              <span class="tc-category" style="background: var(--primary-soft); color: var(--primary); padding: 4px 10px; border-radius: 6px; font-size: 0.8rem; font-weight: 700; text-transform: uppercase;">${CAT_MAP[t.category] || t.category || '未分類'}</span>
              <h3 style="font-size: 1.6rem; font-weight: 800; color: #21143f; margin-top: 12px; margin-bottom: 8px;">${t.name || t.title || '無標題'}</h3>
              <p style="color: #6b6481; line-height: 1.6; font-size: 0.95rem; margin-bottom: 0;">${t.description || '無描述'}</p>
            </div>
            
            <div class="template-detail-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
              <div style="background: #fdfaf4; padding: 12px 16px; border-radius: 16px; border: 1px solid rgba(220,156,71,0.1);">
                <div style="font-size: 0.75rem; color: #a19a86; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">適用平台</div>
                <div style="font-size: 0.9rem; font-weight: 700; color: #5f4b2a;">${platformText}</div>
              </div>
              <div style="background: #fdfaf4; padding: 12px 16px; border-radius: 16px; border: 1px solid rgba(220,156,71,0.1);">
                <div style="font-size: 0.75rem; color: #a19a86; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">鏡頭個數 / 總長</div>
                <div style="font-size: 0.9rem; font-weight: 700; color: #5f4b2a;">${t.shotsCount || t.structure?.length || 0} 鏡 (${duration})</div>
              </div>
              <div style="background: #fdfaf4; padding: 12px 16px; border-radius: 16px; border: 1px solid rgba(220,156,71,0.1);">
                <div style="font-size: 0.75rem; color: #a19a86; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">敘事手法 / 語調</div>
                <div style="font-size: 0.9rem; font-weight: 700; color: #5f4b2a;">${narrativeType} (${t.narrative?.tone || 'casual'})</div>
              </div>
              <div style="background: #fdfaf4; padding: 12px 16px; border-radius: 16px; border: 1px solid rgba(220,156,71,0.1);">
                <div style="font-size: 0.75rem; color: #a19a86; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">節奏律動</div>
                <div style="font-size: 0.9rem; font-weight: 700; color: #5f4b2a;">${paceLabel} 節奏</div>
              </div>
            </div>

            <div style="margin-bottom: 24px;">
              <h4 style="font-weight: 800; color: #21143f; margin-bottom: 10px; font-size: 0.95rem;">可替換變數</h4>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                ${varsList.map(v => `<span style="background: #f0f0fa; color: #5d3a9b; padding: 4px 12px; border-radius: 20px; font-size: 0.82rem; font-weight: 700; border: 1px solid rgba(93,58,155,0.1);">${v}</span>`).join('') || '<em style="color:#a19a86;font-size:0.9rem;">無變數</em>'}
              </div>
            </div>

            <div style="margin-bottom: 30px;">
              <h4 style="font-weight: 800; color: #21143f; margin-bottom: 10px; font-size: 0.95rem;">推薦應用場景</h4>
              <p style="font-size: 0.92rem; color: #5f5f7d; line-height: 1.6;">${t.useCase || '美食、開箱、生活紀錄等系列短片。'}</p>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 12px; border-top: 1px solid #eee; padding-top: 20px;">
              <button class="btn btn-primary" id="tpl-use-btn" style="width: 100%; justify-content: center; height: 48px; border-radius: 12px; font-weight:700;">
                ✦ 選擇此模板並輸入故事
              </button>
            </div>
          `;

          const useBtn = detailEl.querySelector('#tpl-use-btn');
          if (useBtn) {
            useBtn.addEventListener('click', () => {
              window.spaNavigate('generate', { templateId: t.id });
            });
          }

          detailEl.scrollIntoView({ behavior: 'smooth' });
        });
      });
    }

    renderGridFor(categories[0]);

    catsEl.querySelectorAll('.tpl-cat').forEach(b => {
      b.addEventListener('click', () => {
        catsEl.querySelectorAll('.tpl-cat').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderGridFor(b.dataset.cat);
      });
    });

    if (typeof window.initTemplatePage === 'function') {
      window.initTemplatePage();
    }
  }

  async function renderProject(idOrOpts, signal) {
    const id = typeof idOrOpts === 'string' ? idOrOpts : (idOrOpts?.id || null);
    let projectId = id;

    if (!projectId) {
      const hash = window.location.hash || '';
      const match = hash.match(/^#\/project\/(.+)$/);
      if (match) projectId = match[1];
    }

    const m = initMain();
    m.className = 'spa-project-wrap';

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    if (!projectId) {
      m.innerHTML = `<div class="projects-empty"><h3>找不到專案 ID</h3></div>`;
      return;
    }

    function renderProjectSkeleton(container) {
      container.innerHTML = `
        <div class="project-detail loading-skeleton">
          <div class="project-summary">
            <div>
              <h2 class="skeleton-text" style="width: 250px; height: 32px; margin: 0;"></h2>
              <div class="project-meta-row skeleton-text" style="width: 180px; height: 16px; margin-top: 8px;"></div>
            </div>
            <div class="project-attributes">
              <span class="project-attribute skeleton-text" style="width: 80px; height: 20px; border-radius: 20px;"></span>
              <span class="project-attribute skeleton-text" style="width: 80px; height: 20px; border-radius: 20px;"></span>
              <span class="project-attribute skeleton-text" style="width: 60px; height: 20px; border-radius: 20px;"></span>
            </div>
          </div>

          <div class="view-toggle-container" style="opacity: 0.5; pointer-events: none;">
            <div class="view-toggle-bar">
              <button class="toggle-btn active"><span>載入中...</span></button>
            </div>
          </div>

          <div id="project-table-view" class="view-section visible" style="display: block;">
            <table class="storyboard-table" style="width:100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th class="th-cam">鏡頭</th>
                  <th class="th-img">畫面</th>
                  <th class="th-title">故事內容 / 動作</th>
                  <th class="th-time">時長</th>
                  <th class="th-note">情緒 / 備註</th>
                </tr>
              </thead>
              <tbody>
                ${[1, 2, 3, 4].map(idx => `
                  <tr>
                    <td class="camera-cell"><span class="skeleton-text" style="width: 20px; height: 16px;"></span></td>
                    <td class="img-cell"><div class="project-view-thumb loading"></div></td>
                    <td class="title-cell"><span class="skeleton-text" style="width: 80%; height: 16px;"></span></td>
                    <td class="time-cell"><span class="skeleton-text" style="width: 30px; height: 16px;"></span></td>
                    <td class="note-cell"><span class="skeleton-text" style="width: 40px; height: 16px;"></span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    async function renderWithProjectData(p) {
      const shots = Array.isArray(p.shots) ? p.shots : (p.shots ? [p.shots] : []);
      const safeTranslate = typeof window.translatePromptText === 'function'
        ? window.translatePromptText
        : async v => String(v || '');

      const safeFormat = typeof window.formatPromptText === 'function'
        ? window.formatPromptText
        : async v => String(v || '');

      const processedShots = await Promise.all(shots.map(async (s, index) => {
        const payload = s.payload || {};
        const shotPrompt = await safeTranslate(payload.shotPrompt || payload.prompt || '');
        const formattedShotPrompt = await safeFormat(shotPrompt);
        const emotion = payload.emotion || s.emotion || '';
        const imageUrl = payload.image || '';
        const order = s.order ?? (index + 1);
        return {
          order,
          title: s.title || '未命名鏡頭',
          camera: s.camera || '未設定',
          duration: s.duration || '0s',
          emotion,
          imageUrl,
          formattedShotPrompt
        };
      }));

      // Sort shots by order in ascending order
      processedShots.sort((a, b) => a.order - b.order);

      const ratioMatch = p.ratio ? p.ratio.match(/\d+[:/]\d+/) : null;
      const cleanRatio = ratioMatch ? ratioMatch[0] : '16:9';
      const aspectRatio = cleanRatio.replace(':', ' / ');

      if (signal?.aborted) return;

      let tableRowsHtml = '';
      processedShots.forEach(s => {
        tableRowsHtml += `
          <tr>
            <td class="camera-cell">${s.order}</td>
            <td class="img-cell">
              ${s.imageUrl ? `<div class="project-view-thumb loading" style="aspect-ratio: ${aspectRatio};" data-src="${s.imageUrl}"></div>` : `<div class="placeholder">NO IMAGE</div>`}
            </td>
            <td class="title-cell">${s.title}</td>
            <td class="time-cell">${s.duration}</td>
            <td class="note-cell">${s.emotion || '—'}</td>
          </tr>
        `;
      });

      const holeCount = Math.max(processedShots.length * 3, 20);
      let railHolesHtml = '';
      for (let i = 0; i < holeCount; i++) {
        railHolesHtml += '<div class="rail-hole"></div>';
      }

      let filmFramesHtml = '';
      processedShots.forEach(s => {
        filmFramesHtml += `
          <div class="film-frame">
            <div class="sprocket-row">
              <div class="sprocket"></div><div class="sprocket"></div><div class="sprocket"></div>
              <span class="frame-num">${String(s.order).padStart(2, '0')}</span>
            </div>
            <div class="film-img-wrap">
              ${s.imageUrl ? `<div class="project-view-thumb loading" style="aspect-ratio: ${aspectRatio};" data-src="${s.imageUrl}"></div>` : `<div class="film-placeholder">NO IMAGE</div>`}
            </div>
            <div class="film-caption">
              <div class="film-caption-title">${s.title}</div>
              <div class="film-camera">
                <span class="film-badge">${s.camera}</span>
                ${s.emotion ? `<div class="film-cam-detail">${s.emotion}</div>` : ''}
              </div>
            </div>
            <div class="sprocket-row bottom">
              <div class="sprocket"></div><div class="sprocket"></div><div class="sprocket"></div>
            </div>
          </div>
        `;
      });

      m.innerHTML = `
        <div class="project-detail">
          <div class="project-summary">
            <div>
              <h2>${p.title}</h2>
              <div class="project-meta-row">作者: ${p.author?.name || '未知'} • 建立於 ${new Date(p.createAt).toLocaleString('zh-TW')}</div>
            </div>
            <div class="project-attributes">
              <span class="project-attribute">風格：${p.style || '未指定'}</span>
              <span class="project-attribute">比例：${p.ratio || '未指定'}</span>
              <span class="project-attribute">共 ${processedShots.length} 鏡頭</span>
            </div>
          </div>

          <div class="view-toggle-container">
            <div class="view-toggle-bar">
              <button id="vbtn-table" class="toggle-btn active"><span>表格模式</span></button>
              <button id="vbtn-film" class="toggle-btn"><span>膠捲模式</span></button>
            </div>
          </div>

          <div id="project-table-view" class="view-section visible" style="display: block;">
            <table class="storyboard-table" style="width:100%; border-collapse: collapse;">
              <thead>
                <tr>
                  <th class="th-cam">鏡頭</th>
                  <th class="th-img">畫面</th>
                  <th class="th-title">故事內容 / 動作</th>
                  <th class="th-time">時長</th>
                  <th class="th-note">情緒 / 備註</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml || '<tr><td colspan="5" style="text-align:center; padding:24px;">尚無鏡頭資料</td></tr>'}
              </tbody>
            </table>
          </div>

          <div id="project-film-view" class="view-section" style="display: none; width: 100%; overflow: hidden;">
            <div class="filmstrip-rail" style="display:flex; gap:4px; padding: 10px 0;">${railHolesHtml}</div>
            <div class="filmstrip-container" style="overflow-x: auto; width: 100%; cursor: grab; user-select: none;">
              <div class="filmstrip" style="display: flex; gap: 20px; padding: 10px 0; width: max-content;">
                ${filmFramesHtml || '<div class="film-placeholder">尚無鏡頭資料</div>'}
              </div>
            </div>
            <div class="filmstrip-rail" style="display:flex; gap:4px; padding: 10px 0;">${railHolesHtml}</div>
          </div>
        </div>
      `;

      const btnTable = m.querySelector('#vbtn-table');
      const btnFilm = m.querySelector('#vbtn-film');
      const tableView = m.querySelector('#project-table-view');
      const filmView = m.querySelector('#project-film-view');

      function switchView(mode) {
        if (mode === 'table') {
          btnTable.classList.add('active');
          btnFilm.classList.remove('active');
          tableView.style.display = 'block';
          filmView.style.display = 'none';
        } else {
          btnFilm.classList.add('active');
          btnTable.classList.remove('active');
          filmView.style.display = 'block';
          tableView.style.display = 'none';
        }
      }

      btnTable.addEventListener('click', () => switchView('table'));
      btnFilm.addEventListener('click', () => switchView('film'));

      const container = filmView.querySelector('.filmstrip-container');
      if (container) {
        container.addEventListener('wheel', (e) => {
          if (e.deltaX !== 0) return;
          e.preventDefault();

          container._wheelTarget = (container._wheelTarget ?? container.scrollLeft) + e.deltaY * 2;
          if (!container._wheelRaf) {
            container._wheelRaf = requestAnimationFrame(function step() {
              const diff = container._wheelTarget - container.scrollLeft;
              if (Math.abs(diff) < 0.5) {
                container.scrollLeft = container._wheelTarget;
                container._wheelRaf = null;
              } else {
                container.scrollLeft += diff * 0.3;
                container._wheelRaf = requestAnimationFrame(step);
              }
            });
          }
        }, { passive: false });

        let isDragging = false;
        let startX = 0;
        let startScroll = 0;

        container.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          isDragging = true;
          startX = e.clientX;
          startScroll = container.scrollLeft;
          container._wheelTarget = container.scrollLeft;
          container.style.cursor = 'grabbing';
          container.setPointerCapture(e.pointerId);
        });

        container.addEventListener('pointermove', (e) => {
          if (!isDragging) return;
          const dx = e.clientX - startX;
          container.scrollLeft = startScroll - dx;
          container._wheelTarget = container.scrollLeft;
        });

        const stopDrag = () => {
          isDragging = false;
          container.style.cursor = 'grab';
        };
        container.addEventListener('pointerup', stopDrag);
        container.addEventListener('pointercancel', stopDrag);
      }
      lazyLoadProjectViewThumbs(m);
    }

    if (cacheProjectDetails[projectId]) {
      await renderWithProjectData(cacheProjectDetails[projectId]);
      fetchProjectBackground();
    } else {
      renderProjectSkeleton(m);
      fetchProjectNetwork();
    }

    async function fetchProjectNetwork() {
      try {
        const p = await fetchProjectDetail(projectId, signal);
        if (signal?.aborted) return;
        if (!p) {
          m.innerHTML = `<div class="projects-empty"><h3>無法取得專案</h3></div>`;
          return;
        }
        await renderWithProjectData(p);
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('renderProject error', e);
          m.innerHTML = `<div class="projects-empty"><h3>讀取專案發生錯誤</h3><p>${e.message || '未知錯誤'}</p></div>`;
        }
      }
    }

    async function fetchProjectBackground() {
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          signal,
          headers: { 'Authorization': `Bearer ${spaAuth.getToken()}` }
        });

        if (signal?.aborted) return;
        if (!res.ok) return;

        const data = await res.json();
        const p = data?.project;
        if (!p) return;

        const currentJSON = JSON.stringify(cacheProjectDetails[projectId]);
        const newJSON = JSON.stringify(p);
        if (currentJSON !== newJSON) {
          cacheProjectDetails[projectId] = p;
          await renderWithProjectData(p);
        }
      } catch (e) {}
    }
  }

  function bindSidebarLinks() {
    const containers = [
      document.getElementById('dash-sidebar') || dashboardSidebar,
      document.getElementById('spa-topbar') || dashboardTopbar,
      document.getElementById('spa-mobile-nav') || mobileBottomNav
    ];

    burgerContainer = burgerContainer || document.getElementById("burger-container");
    sideLogo = sideLogo || document.getElementById("side-logo");
    let burger = null;

    if(burgerContainer && sideLogo){
      burger = burger || document.getElementById("burger");
      if (!burger.checked){
        sideLogo.addEventListener('mouseenter', () => {
          burgerContainer.style.opacity = 1;
          burgerContainer.style.filter = 'blur(0)';
          sideLogo.children[0].style.opacity = 0;
          sideLogo.children[0].style.filter = 'blur(10px)';
        });
        sideLogo.addEventListener('mouseleave', () => {
          burgerContainer.style.opacity = 0;
          burgerContainer.style.filter = 'blur(10px)';
          sideLogo.children[0].style.opacity = 1;
          sideLogo.children[0].style.filter = 'blur(0px)';
        });
        burger.addEventListener('change', () => {
          const m = document.getElementById('page-main');
          if(burger.checked){
            dashboardSidebar.style.width = '260px';
            m.style.margin = '1vh 1vh 1vh calc(2vh + 260px)';
            dashboardSidebar.classList.add('open');
          }
          else{
            dashboardSidebar.style.width = '60px';
            m.style.margin = '1vh 1vh 1vh calc(2vh + 60px)';
            dashboardSidebar.classList.remove('open');
          }
        });
      }else{
        burgerContainer.style.opacity = 1;
        burgerContainer.style.filter = 'blur(0)';
      }
    }

    containers.forEach(container => {
      if (!container) return;

      container.querySelectorAll('a[href]').forEach(a => {
        if (a.dataset.spaBound) return;

        const href = a.getAttribute('href') || '';
        let page = null;

        const cleanPath = href.split('?')[0].split('#')[0];

        if (cleanPath.includes('generate')) page = 'generate';
        else if (cleanPath.includes('projects')) page = 'projects';
        else if (cleanPath.includes('dashboard')) page = 'dashboard';
        else if (cleanPath.includes('history')) page = 'history';
        else if (cleanPath.includes('template')) page = 'template';
        else if (cleanPath.includes('analysis')) page = 'analysis';

        if (page) {
          a.dataset.spaBound = 'true';
          a.addEventListener('click', e => {
            e.preventDefault();
            navigate(page);
          });
          a.addEventListener('pointerenter', () => {
            prefetchPage(page);
          });
        }
      });
    });

    // Setup projects group toggle button and localStorage state
    const toggleBtn = document.getElementById('projects-toggle-btn') || dashboardSidebar?.querySelector('#projects-toggle-btn');
    const subList = document.getElementById('sidebar-projects-list') || dashboardSidebar?.querySelector('#sidebar-projects-list');
    const navProjectsGroup = document.getElementById('nav-projects-group') || dashboardSidebar?.querySelector('#nav-projects-group');
    
    if (toggleBtn && subList && navProjectsGroup) {
      const isExpanded = localStorage.getItem('sidebar_projects_expanded') === 'true';
      if (isExpanded) {
        subList.classList.add('expanded');
        navProjectsGroup.classList.add('expanded');
      } else {
        subList.classList.remove('expanded');
        navProjectsGroup.classList.remove('expanded');
      }

      if (!toggleBtn.dataset.bound) {
        toggleBtn.dataset.bound = 'true';
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const currentlyExpanded = subList.classList.contains('expanded');
          if (currentlyExpanded) {
            subList.classList.remove('expanded');
            navProjectsGroup.classList.remove('expanded');
            localStorage.setItem('sidebar_projects_expanded', 'false');
          } else {
            subList.classList.add('expanded');
            navProjectsGroup.classList.add('expanded');
            localStorage.setItem('sidebar_projects_expanded', 'true');
          }
        });
      }
    }

    const projectsLink = document.getElementById('nav-projects') || dashboardSidebar?.querySelector('#nav-projects');
    if (projectsLink && subList && navProjectsGroup && !projectsLink.dataset.toggleBound) {
      projectsLink.dataset.toggleBound = 'true';
      projectsLink.addEventListener('click', () => {
        subList.classList.add('expanded');
        navProjectsGroup.classList.add('expanded');
        localStorage.setItem('sidebar_projects_expanded', 'true');
      });
    }
  }

  function updateRailHoles() {
    const railTop = document.getElementById('rail-top');
    const railBottom = document.getElementById('rail-bottom');
    if (!railTop || !railBottom) return;

    const targetNum = Math.floor(window.innerWidth / (0.028*window.innerHeight)) + 1;

    [railTop, railBottom].forEach(rail => {
      const currentHoles = rail.getElementsByClassName('rail-hole');
      const currentNum = currentHoles.length;

      if (currentNum < targetNum) {
        const diff = targetNum - currentNum;
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < diff; i++) {
          const hole = document.createElement('div');
          hole.classList.add('rail-hole');
          fragment.appendChild(hole);
        }
        rail.appendChild(fragment);
      } else if (currentNum > targetNum) {
        const diff = currentNum - targetNum;
        for (let i = 0; i < diff; i++) {
          rail.lastElementChild?.remove();
        }
      }
    });
  }

  const pageDefs = {
    landing: {
      css: [],
      js: ['/js/landing-animation.js', '/js/landing.js'],
      render: () => {
        const content = initMain();
        content.className = landingClass;
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
      css: ['/css/dashboard.css'],
      js: ['/js/generate-prefill-path.js'],
      render: (o, signal) => renderDashboard(signal)
    },

    projects: {
      css: ['/css/dashboard.css'],
      js: ['/js/generate-prefill-path.js'],
      render: (o, signal) => renderProjectsPage(signal)
    },

    generate: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css', '/css/template.css'],
      js: ['/js/math-curve-loader.js', '/js/token-manager.js', '/js/prompt-translate.js', '/js/generate.js'],
      render: (o, signal) => renderGenerate(o, signal)
    },

    history: {
      css: ['/css/dashboard.css'],
      js: ['/js/generate-prefill-path.js'],
      render: (o, signal) => renderHistory(signal)
    },

    template: {
      css: ['/css/dashboard.css', '/css/template.css'],
      js: ['/js/generate-prefill-path.js', '/js/template.js'],
      render: (o, signal) => renderTemplate(signal)
    },

    project: {
      css: ['/css/dashboard.css'],
      js: ['/js/prompt-translate.js'],
      render: (o, signal) => renderProject(o?.id || o, signal)
    }
  };

  window.spaNavigate = (page, opts) => {
    navigate(page, opts);
  };

  function isDashboardPage(page) {
    return ['dashboard', 'projects', 'generate', 'history', 'template', 'project', 'analysis'].includes(page);
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
    const burger = document.getElementById("burger");
    const m = document.getElementById('page-main');
    const sidebar = document.getElementById('dash-sidebar') || dashboardSidebar;
    if (!burger || !sidebar) return;

    burger.checked = expand;
    if (expand) {
      sidebar.style.width = '260px';
      if (m) m.style.margin = '1vh 1vh 1vh calc(2vh + 260px)';
      sidebar.classList.add('open');
      
      const burgerContainer = document.getElementById("burger-container");
      if (burgerContainer) {
        burgerContainer.style.opacity = '1';
        burgerContainer.style.filter = 'blur(0)';
      }
      const sideLogo = document.getElementById("side-logo");
      if (sideLogo && sideLogo.children[0]) {
        sideLogo.children[0].style.opacity = '0';
        sideLogo.children[0].style.filter = 'blur(10px)';
      }
    } else {
      sidebar.style.width = '60px';
      if (m) m.style.margin = '1vh 1vh 1vh calc(2vh + 60px)';
      sidebar.classList.remove('open');
      
      const burgerContainer = document.getElementById("burger-container");
      if (burgerContainer) {
        burgerContainer.style.opacity = '0';
        burgerContainer.style.filter = 'blur(10px)';
      }
      const sideLogo = document.getElementById("side-logo");
      if (sideLogo && sideLogo.children[0]) {
        sideLogo.children[0].style.opacity = '1';
        sideLogo.children[0].style.filter = 'blur(0px)';
      }
    }
  }

  function updateSidebarActive(page) {
    const sidebar = document.getElementById('dash-sidebar') || dashboardSidebar;
    if (!sidebar) return;

    let activeMainPage = page;
    if (page === 'project' || page === 'generate') {
      activeMainPage = 'projects';
    }

    const links = sidebar.querySelectorAll('.side-link');
    links.forEach(l => {
      const href = l.getAttribute('href') || '';
      const shouldBeActive = 
        (activeMainPage === 'dashboard' && href.includes('dashboard')) ||
        (activeMainPage === 'projects' && href.includes('projects')) ||
        (activeMainPage === 'history' && href.includes('history')) ||
        (activeMainPage === 'template' && href.includes('template'));
      
      const img = l.querySelector('img');

      if (shouldBeActive) {
        if (!l.classList.contains('active')) {
          l.classList.add('active');
          if (img && img.src) {
            img.src = img.src.replace("blur", "focus");
          }
        }
      } else {
        if (l.classList.contains('active')) {
          l.classList.remove('active');
          if (img && img.src) {
            img.src = img.src.replace("focus", "blur");
          }
        }
      }
    });

    updateSidebarProjects();
  }

  function updateSidebarProjects() {
    const sidebar = document.getElementById('dash-sidebar') || dashboardSidebar;
    if (!sidebar) return;
    const sidebarList = sidebar.querySelector('#sidebar-projects-list');
    if (!sidebarList) return;

    const activeProjects = (cacheProjectsList || []).filter(p => !p.is_deleted && !pendingDeletions[p.id]);
    const currentJSON = JSON.stringify(activeProjects.map(p => ({ id: p.id, title: p.title })));

    if (currentJSON !== lastRenderedProjectsJSON || !sidebarList.querySelector('.project-sub-link')) {
      lastRenderedProjectsJSON = currentJSON;
      sidebarList.innerHTML = '';
      
      const newProjectLink = document.createElement('a');
      newProjectLink.href = '../generate';
      newProjectLink.className = 'sub-link new-project-sub-link';
      newProjectLink.title = '新建專案';
      newProjectLink.innerHTML = `<span class="sub-text">+ 新建專案</span><div class="link-glow"></div>`;
      sidebarList.appendChild(newProjectLink);

      activeProjects.forEach(p => {
        const a = document.createElement('a');
        a.href = `../project/${p.id}`;
        a.className = 'sub-link project-sub-link';
        a.dataset.id = p.id;
        a.title = p.title;
        a.innerHTML = `<span class="sub-text">${p.title}</span><div class="link-glow"></div>`;
        sidebarList.appendChild(a);
      });

      bindSidebarSubLinks(sidebarList);
    }
    
    highlightActiveSidebarProject(sidebarList);
  }

  function bindSidebarSubLinks(container) {
    if (!container) return;
    container.querySelectorAll('a[href]').forEach(a => {
      if (a.dataset.spaBound) return;
      a.dataset.spaBound = 'true';
      const href = a.getAttribute('href') || '';
      
      if (href.includes('generate')) {
        a.addEventListener('click', e => {
          e.preventDefault();
          navigate('generate');
        });
      } else if (href.includes('project/')) {
        const id = href.split('project/')[1];
        a.addEventListener('click', e => {
          e.preventDefault();
          navigate('project', { id });
        });
        a.addEventListener('pointerenter', () => {
          prefetchPage('project', { id });
        });
      }
    });
  }

  function highlightActiveSidebarProject(sidebarList) {
    if (!sidebarList) return;
    sidebarList.querySelectorAll('.sub-link').forEach(l => l.classList.remove('active'));

    const currentHash = window.location.hash;
    const routeInfo = parseRouteFromHash(currentHash);
    
    if (routeInfo.page === 'project' && routeInfo.opts.id) {
      const activeLink = sidebarList.querySelector(`.project-sub-link[data-id="${routeInfo.opts.id}"]`);
      if (activeLink) {
        activeLink.classList.add('active');
      }
    } else if (routeInfo.page === 'generate') {
      const activeLink = sidebarList.querySelector('.new-project-sub-link');
      if (activeLink) {
        activeLink.classList.add('active');
      }
    }
  }

  async function navigate(page, opts = {}) {
    if (window.isGeneratingStoryboard) {
      const confirmLeave = await confirm(
        '是否要中斷目前生成進度並離開？',
        '離開後目前正在產出的分鏡與畫面將會遺失。',
        'danger',
        '離開'
      );
      if (!confirmLeave) {
        if (currentPage) {
          const prevHash = getHashForPage(currentPage, currentOpts);
          window.location.hash = prevHash;
        }
        return;
      } else {
        window.isGeneratingStoryboard = false;
        if (typeof window.abortStoryboardGeneration === 'function') {
          window.abortStoryboardGeneration();
        }
      }
    }

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

    for (const id in pendingDeletions) {
      const item = pendingDeletions[id];
      if (item) {
        clearTimeout(item.deleteTimeout);
        clearTimeout(item.transitionTimeout);
        
        const token = spaAuth.getToken();
        fetch(`/api/projects/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => console.error('Immediate delete failed on navigate', err));
        
        item.project.is_deleted = true;
        recentlyDeleted.add(id);
        recentlyRestored.delete(id);
        delete pendingDeletions[id];
      }
    }
    const toast = document.getElementById('global-toast');
    if (toast) {
      toast.classList.remove('show');
    }

    targetPage = page;
    targetOpts = opts;

    const mySeq = ++navSeq;

    // 立即隱藏 landing 頁面內容，防止 flash
    if (page !== 'landing') {
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
      if (dashboardSidebar) dashboardSidebar.style.display = '';
      if (dashboardTopbar) dashboardTopbar.style.display = '';
      if (mobileBottomNav) mobileBottomNav.style.display = '';
      
      const userPanel = document.getElementById('spa-user-panel');
      if (userPanel) userPanel.style.display = '';

      // 進入專案頁面時，自動展開側邊欄與專案子清單
      if (page === 'project' || page === 'projects' || page === 'generate') {
        localStorage.setItem('sidebar_projects_expanded', 'true');
        expandSidebar(true);
        const subList = document.getElementById('sidebar-projects-list') || dashboardSidebar?.querySelector('#sidebar-projects-list');
        const navProjectsGroup = document.getElementById('nav-projects-group') || dashboardSidebar?.querySelector('#nav-projects-group');
        if (subList) subList.classList.add('expanded');
        if (navProjectsGroup) navProjectsGroup.classList.add('expanded');
      }

      updateSidebarActive(page);
    } else {
      document.body.classList.remove('dashboard-layout');
      if (dashboardSidebar) dashboardSidebar.style.display = 'none';
      if (dashboardTopbar) dashboardTopbar.style.display = 'none';
      if (mobileBottomNav) mobileBottomNav.style.display = 'none';
      
      const userPanel = document.getElementById('spa-user-panel');
      if (userPanel) {
        userPanel.style.display = 'none';
        userPanel.classList.remove('active');
      }
      
      // 如果回到 landing / login / register，復原原本 navbar 的顯示
      const nav = document.getElementById('nav') || document.querySelector('.nav');
      if (nav) nav.style.display = '';
      showLandingNav();
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
      if (showLoaderTimer) {
        clearTimeout(showLoaderTimer);
        showLoaderTimer = null;
      }
      if (loaderShowing) {
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
        }, 450);
      }
    }

    signal.addEventListener('abort', cleanupTransitionLoader);

    const isDashboardTransition = isDashboardPage(currentPage) && isDashboardPage(page);

    const contentEl = getOrCreateContentContainer();

    if (isDashboardTransition) {
      if (contentEl) {
        contentEl.style.opacity = '0';
        contentEl.style.filter = 'blur(15px)';
      }
      await rafDelay(300);
      
      showLoaderTimer = setTimeout(() => {
        loaderShowing = true;
        const dashLoader = document.getElementById('spa-dash-loader');
        if (dashLoader) dashLoader.classList.add('active');
      }, 1000);
    } else {
      const maskPromise = maskClose();
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
          updateSidebarActive(page);
        }
        const cssPromises = def.css.map(href => injectCSS(href));
        await Promise.all(cssPromises);
        if (signal.aborted || mySeq !== navSeq) {
          hideInnerLoader();
          return;
        }

        removePageCSS(def.css);
        removePageScripts();

        await def.render(opts, signal);
        if (signal.aborted || mySeq !== navSeq) {
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

      window.scrollTo(0, 0);

      if (page === 'generate' && typeof window.initGeneratePage === 'function') {
        window.initGeneratePage();
      } else if (page === 'landing' && typeof window.initLandingPage === 'function') {
        window.initLandingPage();
      } else if (page === 'template' && typeof window.initTemplatePage === 'function') {
        window.initTemplatePage();
      }

      if (isDashboardPage(page)) {
        document.body.classList.add('dashboard-layout');
        showDashTopbar();
        updateSidebarActive(page);
      } else if (page === 'landing' || page === 'login' || page === 'register') {
        document.body.classList.remove('dashboard-layout');
        showLandingNav();
      }

      if (dashboardSidebar) {
        dashboardSidebar.style.display = isDashboardPage(page) ? '' : 'none';
      }

      if (dashboardTopbar) {
        dashboardTopbar.style.display = isDashboardPage(page) ? '' : 'none';
      }

      if (mobileBottomNav) {
        mobileBottomNav.style.display = isDashboardPage(page) ? '' : 'none';
      }

      const userPanel = document.getElementById('spa-user-panel');
      if (userPanel) {
        userPanel.style.display = isDashboardPage(page) ? '' : 'none';
        if (!isDashboardPage(page)) {
          userPanel.classList.remove('active');
        }
      }

      // 網址列已在 navigate 開頭即時變更，此處不再重複處理

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      cleanupTransitionLoader();

      if (signal.aborted || mySeq !== navSeq) return;

      if (isDashboardTransition) {
        if (contentEl) {
          contentEl.style.opacity = '1';
          contentEl.style.filter = 'blur(0px)';
        }
      } else {
        if (contentEl) {
          contentEl.style.opacity = '1';
          contentEl.style.filter = 'blur(0px)';
        }
        await maskOpen();
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
      if (currentNavController === controller) {
        currentNavController = null;
        isTransitioning = false;
        targetPage = null;
        targetOpts = null;
      }
    }
  }

  window.addEventListener('popstate', e => {
    const statePage = e.state?.page;
    const stateId = e.state?.id;

    if (statePage) {
      navigate(statePage, {
        id: stateId || undefined,
        noHistory: true,
        force: true
      });
      return;
    }

    const parsed = parseRouteFromHash(window.location.hash);
    navigate(parsed.page, {
      ...parsed.opts,
      noHistory: true,
      force: true
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
    if (document.getElementById('spa-dash-loader')) return;
    const loader = document.createElement('div');
    loader.id = 'spa-dash-loader';
    loader.className = 'dash-loader';
    loader.innerHTML = '<div class="dash-loader-spinner"></div>';
    document.body.appendChild(loader);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    initDashboardLoader();

    document.addEventListener('click', (e) => {
      const panel = document.getElementById('spa-user-panel');
      const avatar = document.getElementById('top-avatar') || (typeof dashboardTopbar !== 'undefined' && dashboardTopbar ? dashboardTopbar.querySelector('#top-avatar') : null);
      if (panel && panel.classList.contains('active')) {
        if (!e.target.closest('#spa-user-panel') && !e.target.closest('#top-avatar') && (!avatar || !avatar.contains(e.target))) {
          panel.classList.remove('active');
        }
      }
    });

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
    }
  });

  const bgTop = document.getElementById("bg-top");
  const railTop = document.getElementById("rail-top");
  const railBottom = document.getElementById("rail-bottom");

  if (bgTop && railTop && railBottom) {
    railTop.style.top = bgTop.offsetHeight * (5/7) + "px";
    railBottom.style.bottom = bgTop.offsetHeight * (5/7) + "px";
  }

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

  function startTextCycling() {
    const textEl = document.getElementById('transition-loader-text');
    if (!textEl) return;

    currentTextIndex = 0;
    textEl.textContent = cuteTexts[currentTextIndex];
    textEl.classList.remove('blur-out');

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

  function initTransitionLoader() {
    const overlay = document.getElementById('transition-loader-overlay');
    const group = document.getElementById('transition-loader-group');
    const path = document.getElementById('transition-loader-path');
    if (!overlay || !group || !path) return;

    window.spaTransitionLoader = setupRoseAnimation(group, path);
  }

  window.spaNavigate = navigate;

})();