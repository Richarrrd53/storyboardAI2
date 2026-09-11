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

          let data;
          try {
            data = await res.json();
          } catch {
            return [];
          }
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

  function prefetchAuthResources() {
    if (!spaAuth.isLoggedIn()) {
      prefetchPage('login').catch(() => {});
      injectCSS('/css/auth.css').catch(() => {});
      fetch('/js/auth.js').catch(() => {});
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
    const isConfirmed = await confirm('是否刪除此分鏡？', `「${p.title}」將從此頁面上刪除，刪除後的分鏡將會移至「資源回收桶」，您可以在「歷史分鏡」復原`, 'delete', '刪除', card);
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
          window.showSpaToast(`分鏡「${p.title}」已移至資源回收桶。`);
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

    window.showSpaToast(`分鏡「${p.title}」已移至資源回收桶。`, () => {
      const item = pendingDeletions[p.id];
      if (item) {
        clearTimeout(item.deleteTimeout);
        clearTimeout(item.transitionTimeout);
        delete pendingDeletions[p.id];
      }
      window.showSpaToast("分鏡已復原。");
      refreshCallback();
    }, 5000);
  }

  async function restoreProject(p, card, refreshCallback) {
    const isConfirmed = await confirm('是否還原此分鏡？', ``, 'default', '還原', null);
    if (!isConfirmed) return;

    p.is_deleted = false;
    recentlyRestored.add(p.id);
    recentlyDeleted.delete(p.id);
    refreshCallback();

    window.showSpaToast(`分鏡「${p.title}」已還原。`);

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
          <span>還原分鏡</span>
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
          <span>開啟分鏡</span>
        </button>
        <button class="options-dropdown-item delete" id="opt-delete">
          <span class="options-dropdown-item-icon">
            <img class="delete-1" src="../icon/delete-1.svg">
            <img class="delete-2" src="../icon/delete-2.svg">
          </span>
          <span>刪除分鏡</span>
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

    let toastTimeout = null;
    function showToast(msg, duration = 2800) {
      const t = document.getElementById('toast');
      if (!t) return;
      if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
      }
      t.classList.remove('show');
      t.textContent = msg;
      void t.offsetWidth; // Force reflow
      t.classList.add('show');
      if (duration > 0) {
        toastTimeout = setTimeout(() => {
          t.classList.remove('show');
          toastTimeout = null;
        }, duration);
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

  function ensureUserPanelDOM() {
    let panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel') || dashboardUserPanel;
    let backdrop = document.getElementById('spa-user-panel-backdrop') || document.querySelector('.user-panel-backdrop');

    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'user-panel-backdrop';
      backdrop.id = 'spa-user-panel-backdrop';
      document.body.appendChild(backdrop);
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'user-panel';
      panel.id = 'spa-user-panel';
      panel.innerHTML = `
        <div class="user-panel-handle" aria-hidden="true"></div>
        <div class="up-header">
            <div class="up-avatar">黃</div>
            <div>
                <p class="up-name">創作者</p>
                <p class="up-email">creator@storyboard.ai</p>
            </div>
            <div class="up-plan">Free</div>
        </div>
        <div class="up-divide"></div>
        <div class="up-body">
            <a class="up-btn"><img src="../icon/profile.svg" alt=""><span>個人檔案</span></a>
            <a class="up-btn"><img src="../icon/upgrade.svg" alt=""><span>升級方案</span></a>
            <a href="../history" class="up-btn" id="up-recycle-bin"><img src="../icon/trash-blur.svg" alt=""><span>資源回收桶</span></a>
            <a class="up-btn"><img src="../icon/setting.svg" alt=""><span>設定</span></a>
        </div>
        <div class="up-divide"></div>
        <a href="../html/login.html" class="up-btn up-logout"><img src="../icon/logout.svg" alt=""><span>登出</span></a>
      `;
      document.body.appendChild(panel);
    }

    if (panel) {
      dashboardUserPanel = panel;
      if (!panel.querySelector('.user-panel-handle')) {
        const handle = document.createElement('div');
        handle.className = 'user-panel-handle';
        handle.setAttribute('aria-hidden', 'true');
        panel.prepend(handle);
      }
    }

    initUserPanelGestures();
    return { panel, backdrop };
  }

  async function ensureSharedLayout(signal) {
    dashboardSidebar = dashboardSidebar || document.getElementById('dash-sidebar');
    dashboardTopbar = dashboardTopbar || document.getElementById('spa-topbar');
    mobileBottomNav = mobileBottomNav || document.getElementById('spa-mobile-nav');
    dashboardUserPanel = dashboardUserPanel || document.getElementById('spa-user-panel') || document.getElementById('user-panel');

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
    }

    injectCSS('/css/generate.css').catch(() => {});
    injectCSS('/css/math-curve-loader.css').catch(() => {});
    ensureAIDockDOM();
    ensureMobileBottomNavDOM();
    await ensureUserPanelDOM(signal);
    await initSharedLayoutLogic(signal);
  }

  let aiDockPanel = null;
  let aiPillBtn = null;
  let aiDockUserClosed = false;
  let selectedDockStyleIndex = 0;
  let selectedDockRatio = '橫向16:9';
  let isAISubmitting = false;

  window.expandAIDockToFull = function() {
    navigate('generate');
  };

  window.updateCapsuleText = function(text) {
    const gctText = document.getElementById('gct-text');
    if (gctText && text) {
      gctText.textContent = text;
    }
    const pillText = document.getElementById('ai-pill-text');
    if (pillText && text) {
      pillText.textContent = text;
    }
  };

  window.triggerCapsulePulse = function() {
    const trigger = document.getElementById('global-create-trigger') || document.getElementById('ai-pill-btn');
    if (trigger) {
      trigger.classList.remove('glow-pulse');
      requestAnimationFrame(() => {
        trigger.classList.add('glow-pulse');
        setTimeout(() => {
          trigger.classList.remove('glow-pulse');
        }, 1800);
      });
    }
  };

  window.updateGlobalPillProgress = function(pct, isGenerating) {
    const gct = document.getElementById('global-create-trigger');
    const gctProgressFill = document.getElementById('gct-progress-fill');
    const gctText = document.getElementById('gct-text');

    if (gct) {
      if (isGenerating) {
        gct.classList.add('is-generating');
        if (gctProgressFill) gctProgressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (gctText) gctText.textContent = `✦ 正在規劃… ${Math.round(pct)}%`;
      } else {
        gct.classList.remove('is-generating');
        if (gctProgressFill) gctProgressFill.style.width = '0%';
        if (pct >= 100) {
          if (gctText) gctText.textContent = '分鏡已完成';
          window.triggerCapsulePulse();
        } else {
          const draftStory = window.CreationSessionStore?.draft?.story || '';
          if (draftStory.trim().length > 0) {
            if (gctText) gctText.textContent = '繼續創作';
          } else {
            if (gctText) gctText.textContent = '新增分鏡';
          }
        }
      }
    }

    const pillBtn = document.getElementById('ai-pill-btn');
    const progressFill = document.getElementById('ai-pill-progress-fill');
    const pillText = document.getElementById('ai-pill-text');
    
    if (pillBtn) {
      if (isGenerating) {
        pillBtn.classList.add('is-generating');
        if (progressFill) progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (pillText) pillText.textContent = `✦ 正在規劃… ${Math.round(pct)}%`;
      } else {
        pillBtn.classList.remove('is-generating');
        if (progressFill) progressFill.style.width = '0%';
        if (pct >= 100) {
          if (pillText) pillText.textContent = '✦ 分鏡已完成';
        } else {
          const draftStory = window.CreationSessionStore?.draft?.story || '';
          if (draftStory.trim().length > 0) {
            if (pillText) pillText.textContent = '✦ 繼續創作';
          } else {
            if (pillText) pillText.textContent = '✦ AI 創作';
          }
        }
      }
    }

    const mobCircle = document.getElementById('global-create-capsule') || document.getElementById('mob-nav-circle-wrap') || document.getElementById('mob-nav-capsule-wrap');
    const mobProgressFill = document.getElementById('gct-progress-fill') || document.getElementById('mob-circle-progress-fill') || document.getElementById('mob-pill-progress-fill');
    const mobCircleSpark = mobCircle ? mobCircle.querySelector('.mob-circle-spark') : null;
    const mobCircleText = document.getElementById('mob-circle-text') || document.getElementById('mob-pill-text');
    const mobItem = document.getElementById('mob-nav-generate');

    if (mobCircle) {
      if (isGenerating) {
        mobCircle.classList.add('is-generating');
        if (mobItem) mobItem.classList.add('is-generating');
        if (mobProgressFill) mobProgressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (mobCircleSpark) mobCircleSpark.style.display = 'none';
        if (mobCircleText) {
          mobCircleText.style.display = 'inline-block';
          mobCircleText.textContent = `${Math.round(pct)}%`;
        }
      } else {
        mobCircle.classList.remove('is-generating');
        if (mobItem) mobItem.classList.remove('is-generating');
        if (mobProgressFill) mobProgressFill.style.width = '0%';
        if (mobCircleSpark) mobCircleSpark.style.display = '';
        if (mobCircleText) {
          mobCircleText.style.display = 'none';
          mobCircleText.textContent = '';
        }
      }
    }
  };

  // ── Global Creation Controller (Spec Item 36-39) ──
  window.AICreationController = {
    surfaceState: 'closed', // 'closed' | 'quick-compose' | 'transitioning' | 'workspace'
    previousRoute: null,
    previousScrollY: 0,
    originRect: null,
    lastOpenTime: 0,

    openQuickCompose() {
      if (this.surfaceState === 'workspace') return;
      this.surfaceState = 'quick-compose';
      this.lastOpenTime = Date.now();
      this.previousRoute = currentPage || 'dashboard';
      this.previousScrollY = window.scrollY || document.documentElement.scrollTop || 0;

      if (isMobileView()) {
        document.documentElement.classList.add('ai-quick-compose-locked');
        document.body.classList.add('ai-quick-compose-locked');
        document.body.style.position = 'fixed';
        document.body.style.top = `-${this.previousScrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
        document.body.style.height = `calc(100% + ${this.previousScrollY}px)`;
        document.body.style.overflow = 'hidden';
      }

      const layer = document.getElementById('ai-creation-layer');
      const capsule = document.getElementById('global-create-capsule');

      if (capsule) {
        capsule.classList.remove('is-expanded');
        void capsule.offsetWidth;
        if (!isMobileView()) {
          capsule.style.opacity = '1';
          capsule.style.pointerEvents = 'auto';
        }
      }

      document.body.classList.remove('ai-quick-compose-closing');
      document.body.classList.add('ai-quick-compose-active');

      if (layer) {
        layer.classList.remove('state-closed', 'state-closing', 'state-workspace', 'state-transitioning');
        layer.classList.add('state-quick-compose');
      }

      // Trigger width expansion morph (circle/pill → expanded capsule)
      if (capsule) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (this.surfaceState === 'quick-compose') {
              capsule.classList.add('is-expanded');
            }
          });
        });
      }

      const qcInput = document.getElementById('qc-story-input');
      const sendBtn = document.getElementById('qc-send-btn');
      if (qcInput) {
        if (window.CreationSessionStore && window.CreationSessionStore.draft && window.CreationSessionStore.draft.story) {
          qcInput.value = window.CreationSessionStore.draft.story;
        }
        if (sendBtn) {
          sendBtn.disabled = !qcInput.value.trim();
        }
      }
    },

    closeQuickCompose() {
      if (this.surfaceState !== 'quick-compose') return;
      if (Date.now() - (this.lastOpenTime || 0) < 300) return;
      this.surfaceState = 'closing';

      const layer = document.getElementById('ai-creation-layer');
      const capsule = document.getElementById('global-create-capsule');
      const qcInput = document.getElementById('qc-story-input');

      if (qcInput) {
        qcInput.blur();
        if (window.CreationSessionStore && window.CreationSessionStore.draft) {
          window.CreationSessionStore.draft.story = qcInput.value;
        }
      }

      document.body.classList.remove('ai-keyboard-open');

      const mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
      if (mobNav) {
        mobNav.style.transform = '';
      }
      const qcContainer = document.getElementById('quick-creation-container');
      if (qcContainer) {
        qcContainer.style.transform = '';
      }

      // Restore mobile body scroll lock
      if (document.body.style.position === 'fixed') {
        const savedY = this.previousScrollY || 0;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.body.style.overflow = '';
        document.documentElement.classList.remove('ai-quick-compose-locked');
        document.body.classList.remove('ai-quick-compose-locked');
        window.scrollTo(0, savedY);
      }

      // Phase 1: Start reverse morph — capsule shrinks from expanded → collapsed button
      document.body.classList.remove('ai-quick-compose-active');
      document.body.classList.add('ai-quick-compose-closing');

      if (capsule) {
        capsule.classList.remove('is-expanded');
      }

      if (layer) {
        layer.classList.remove('state-quick-compose');
        layer.classList.add('state-closing');
      }

      // Smoothly glide mobile bottom nav selector back to original tab
      const restoreRoute = this.previousRoute || currentPage || 'dashboard';
      if (typeof updateMobileBottomNavActive === 'function') {
        updateMobileBottomNavActive(restoreRoute);
      }

      // Phase 2: After morph-back completes (560ms matches CSS transition duration),
      // clean up state and restore natural styles without hiding desktop button
      setTimeout(() => {
        if (this.surfaceState === 'closing') {
          this.surfaceState = 'closed';
          document.body.classList.remove('ai-quick-compose-closing');
          if (layer) {
            layer.classList.remove('state-closing', 'state-workspace', 'state-transitioning');
            layer.classList.add('state-closed');
          }

          // Restore natural CSS styling — NEVER leave opacity: 0 on desktop or mobile
          if (capsule) {
            capsule.style.opacity = '';
            capsule.style.pointerEvents = '';
          }
        }
      }, 580);
    },

    submitToWorkspace() {
      const qcInput = document.getElementById('qc-story-input');
      const story = (qcInput ? qcInput.value.trim() : '') || (window.CreationSessionStore?.draft?.story || '');
      if (!story) return;

      if (window.CreationSessionStore) {
        window.CreationSessionStore.story = story;
        window.CreationSessionStore.draft.story = story;
      }

      this.surfaceState = 'workspace';
      document.body.classList.remove('ai-quick-compose-active');

      if (document.body.style.position === 'fixed') {
        const savedY = this.previousScrollY || 0;
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.left = '';
        document.body.style.right = '';
        document.body.style.width = '';
        document.body.style.height = '';
        document.body.style.overflow = '';
        document.documentElement.classList.remove('ai-quick-compose-locked');
        document.body.classList.remove('ai-quick-compose-locked');
        window.scrollTo(0, savedY);
      }

      const layer = document.getElementById('ai-creation-layer');
      const capsule = document.getElementById('global-create-capsule');

      if (capsule) {
        capsule.classList.remove('is-expanded');
        capsule.classList.add('hidden-by-workspace');
      }

      if (layer) {
        layer.classList.remove('state-closed', 'state-quick-compose');
        layer.classList.add('state-transitioning');
        setTimeout(() => {
          layer.classList.remove('state-transitioning');
          layer.classList.add('state-workspace');
          document.body.classList.add('ai-workspace-active');
        }, 220);
      }

      const storyInput = document.getElementById('story-input');
      if (storyInput) {
        storyInput.value = story;
        if (typeof window.onStoryInput === 'function') {
          window.onStoryInput();
        }
      }

      if (typeof window.submitStory === 'function') {
        window.submitStory();
      }
    },

    openWorkspaceDirectly() {
      this.previousRoute = currentPage || 'dashboard';
      this.previousScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      this.surfaceState = 'workspace';
      document.body.classList.remove('ai-quick-compose-active');

      const layer = document.getElementById('ai-creation-layer');
      const capsule = document.getElementById('global-create-capsule');

      if (capsule) {
        capsule.classList.remove('is-expanded');
        capsule.classList.add('hidden-by-workspace');
      }

      if (layer) {
        layer.classList.remove('state-closed', 'state-quick-compose', 'state-transitioning');
        layer.classList.add('state-workspace');
        document.body.classList.add('ai-workspace-active');
      }
    },

    closeWorkspace() {
      this.surfaceState = 'closed';
      document.body.classList.remove('ai-quick-compose-active');

      const layer = document.getElementById('ai-creation-layer');
      const capsule = document.getElementById('global-create-capsule');

      if (layer) {
        layer.classList.remove('state-quick-compose', 'state-workspace', 'state-transitioning');
        layer.classList.add('state-closed');
        document.body.classList.remove('ai-workspace-active');
      }

      if (capsule) {
        capsule.classList.remove('hidden-by-workspace', 'is-expanded');
        capsule.style.opacity = '';
        capsule.style.pointerEvents = '';
      }

      if (this.previousScrollY) {
        window.scrollTo({ top: this.previousScrollY, behavior: 'instant' });
      }

      const restoreRoute = this.previousRoute && this.previousRoute !== 'generate' ? this.previousRoute : (currentPage || 'dashboard');
      if (typeof updateMobileBottomNavActive === 'function') {
        updateMobileBottomNavActive(restoreRoute);
      }

      if (currentPage === 'generate') {
        navigate(restoreRoute);
      }
    }
  };

  let globalCreateTrigger = null;
  let aiCreationLayer = null;

  function ensureAICreationLayerDOM() {
    if (document.getElementById('ai-creation-layer')) {
      globalCreateTrigger = document.getElementById('global-create-trigger');
      aiCreationLayer = document.getElementById('ai-creation-layer');
      aiDockPanel = aiCreationLayer;
      aiPillBtn = document.getElementById('global-create-capsule') || globalCreateTrigger;
      return;
    }

    // 1. Persistent Global AI Creation Layer Shell
    aiCreationLayer = document.createElement('div');
    aiCreationLayer.id = 'ai-creation-layer';
    aiCreationLayer.className = 'ai-creation-layer state-closed';
    aiCreationLayer.innerHTML = `
      <!-- Directional Frosted Focus Field (Smaller tightened blur) -->
      <div class="ai-focus-field" id="ai-focus-field"></div>

      <!-- Quick Creation Floating Content (Sequentially floats up above capsule) -->
      <div class="quick-creation-container" id="quick-creation-container">
        <div class="qc-card">
          <div class="qc-header">
            <div class="qc-brand">
              <span class="qc-sparkle">✦</span>
              <span class="qc-title">Storyboard AI</span>
            </div>
            <button class="qc-close-btn" id="qc-close-btn" type="button" title="關閉 (Esc)" aria-label="關閉">✕</button>
          </div>

          <div class="qc-intro">
            <h3 class="qc-greeting">今天想創作什麼？</h3>
            <p class="qc-sub">描述故事或創作靈感，AI 將為您打造專業分鏡</p>
          </div>

          <div class="qc-suggestion-row" id="qc-suggestion-row">
            <span class="qc-sugg-label">靈感推薦：</span>
            <div class="qc-sugg-chips-list">
              <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">蘋果牛奶廣告</button>
              <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">旅遊短影音</button>
              <button type="button" class="qc-sugg-chip qc-sugg-more-trigger" id="qc-sugg-more-trigger" onclick="toggleQuickMoreSuggestions(event)">＋更多</button>
              <div class="qc-sugg-tray" id="qc-sugg-tray" style="display: none;">
                <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">運動服品牌形象</button>
                <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">美食餐廳探店介紹</button>
                <button type="button" class="qc-sugg-chip" onclick="fillQuickSugg(this)">科技產品發表預告</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Fullscreen Creation Workspace -->
      <div class="creation-workspace" id="creation-workspace">
        <div class="workspace-header">
          <div class="workspace-nav">
            <button class="workspace-back-btn" id="workspace-back-btn" type="button">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span id="workspace-back-text">返回頁面</span>
            </button>
            <div class="workspace-brand-badge">
              <span>✦ Storyboard AI Workspace</span>
            </div>
          </div>
          <div class="workspace-actions">
            <button class="ai-dock-stop-btn" id="workspace-stop-btn" title="中斷生成" style="display:none;" type="button">■ 停止生成</button>
            <button class="workspace-close-btn" id="workspace-close-btn" title="關閉工作區 (返回原頁)" type="button">✕</button>
          </div>
        </div>
        <div class="workspace-content" id="workspace-content">
          <div class="ai-dock-loader" style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; min-height: 250px; gap: 16px; color: var(--primary);">
            <div style="width: 100px; height: 100px;">
              <svg class="loader math-loader-svg" viewBox="0 0 100 100" fill="none" aria-hidden="true" style="width: 100%; height: 100%; display: block;">
                <g class="math-loader-group">
                  <path class="math-loader-path" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" opacity="0.1"></path>
                </g>
                <g class="math-loader-sucked"></g>
              </svg>
            </div>
            <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-mid);">AI 創作工作區載入中...</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(aiCreationLayer);

    // 2. Persistent Unified Morphing Capsule (Trigger Button & Input Face as One)
    let capsule = document.getElementById('global-create-capsule');
    if (!capsule) {
      capsule = document.createElement('div');
      capsule.id = 'global-create-capsule';
      capsule.className = 'ai-unified-capsule mob-circle-btn';
      capsule.innerHTML = `
        <!-- Button Face -->
        <div class="capsule-btn-face" id="global-create-trigger" role="button" tabindex="0" aria-label="新增分鏡">
          <div class="ai-pill-btn-glow-container"><div class="ai-pill-btn-glow"></div></div>
          <div class="ai-pill-progress-fill" id="gct-progress-fill"></div>
          <span class="ai-pill-spark mob-circle-spark"><span class="ai-spark-desktop">+</span><span class="ai-spark-mobile">+</span></span>
          <span class="mob-circle-text" id="mob-circle-text" style="display:none;"></span>
          <span class="ai-pill-text" id="gct-text">新增分鏡</span>
        </div>

        <!-- Input Face -->
        <div class="capsule-input-face" id="qc-composer-area">
          <textarea id="qc-story-input" class="qc-textarea" placeholder="描述故事或創作方向... ✦" rows="1"></textarea>
          <button class="qc-send-btn" id="qc-send-btn" type="button" disabled aria-label="發送故事">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14.2199 21.63C13.0399 21.63 11.3699 20.8 10.0499 16.83L9.32988 14.67L7.16988 13.95C3.20988 12.63 2.37988 10.96 2.37988 9.78001C2.37988 8.61001 3.20988 6.93001 7.16988 5.60001L15.6599 2.77001C17.7799 2.06001 19.5499 2.27001 20.6399 3.35001C21.7299 4.43001 21.9399 6.21001 21.2299 8.33001L18.3999 16.82C17.0699 20.8 15.3999 21.63 14.2199 21.63Z" />
            </svg>
          </button>
        </div>
      `;
      document.body.appendChild(capsule);
    }

    mountAICreationCapsule();

    globalCreateTrigger = document.getElementById('global-create-trigger');
    aiDockPanel = aiCreationLayer;
    aiPillBtn = capsule;

    injectScripts(['/js/math-curve-loader.js', '/js/token-manager.js', '/js/prompt-translate.js', '/js/generate.js']).catch(() => {});

    if (typeof window.initMathCurveLoader === 'function') {
      window.initMathCurveLoader();
    }

    fetchPageDoc('/html/generate.html').then(doc => {
      const mountPoint = document.getElementById('workspace-content');
      const genMain = doc.querySelector('#page-main.gen-main') || doc.querySelector('main');
      if (mountPoint && genMain) {
        mountPoint.innerHTML = genMain.innerHTML;
        mountPoint.querySelectorAll('button').forEach(b => {
          if (!b.type) b.type = 'button';
        });
        if (typeof window.initGeneratePage === 'function') {
          window.initGeneratePage();
        }
      }
    }).catch(err => console.error("Failed to load generate.html into Creation Workspace", err));

    bindAICreationEvents();
  }

  function bindAICreationEvents() {
    const trigger = document.getElementById('global-create-trigger');
    const capsule = document.getElementById('global-create-capsule');

    if (capsule) {
      capsule.addEventListener('click', (e) => {
        if (!capsule.classList.contains('is-expanded')) {
          if (!isMobileView()) {
            e.preventDefault();
            e.stopPropagation();
            window.AICreationController.openQuickCompose();
          }
        } else {
          e.stopPropagation();
        }
      });
    }

    // Quick Compose Close
    const qcCloseBtn = document.getElementById('qc-close-btn');
    if (qcCloseBtn) {
      qcCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.AICreationController.closeQuickCompose();
      });
    }

    // Prevent drag / gesture penetration from quick creation container into background objects
    const qcContainer = document.getElementById('quick-creation-container');
    if (qcContainer) {
      ['pointerdown', 'mousedown'].forEach(evt => {
        qcContainer.addEventListener(evt, (e) => {
          e.stopPropagation();
        });
      });
      ['pointermove', 'touchmove', 'mousemove'].forEach(evt => {
        qcContainer.addEventListener(evt, (e) => {
          e.stopPropagation();
          if (e.cancelable && evt === 'touchmove') e.preventDefault();
        }, { passive: false });
      });
      qcContainer.addEventListener('wheel', (e) => {
        e.stopPropagation();
      });
    }

    // Focus Field click outside & prevent background drag through focus field
    const focusField = document.getElementById('ai-focus-field');
    if (focusField) {
      focusField.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (Date.now() - (window.AICreationController.lastOpenTime || 0) < 450) return;
        if (window.__justHandledPointerNav && (Date.now() - window.__justHandledPointerNav < 450)) return;
        window.AICreationController.closeQuickCompose();
      });
      focusField.addEventListener('touchmove', (e) => {
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      focusField.addEventListener('pointermove', (e) => {
        e.stopPropagation();
      });
    }

    if (capsule) {
      ['pointerdown', 'mousedown', 'touchstart'].forEach(evt => {
        capsule.addEventListener(evt, (e) => {
          if (capsule.classList.contains('is-expanded')) {
            e.stopPropagation();
          }
        });
      });
      ['pointermove', 'touchmove', 'mousemove'].forEach(evt => {
        capsule.addEventListener(evt, (e) => {
          if (capsule.classList.contains('is-expanded')) {
            e.stopPropagation();
            if (e.cancelable && evt === 'touchmove') e.preventDefault();
          }
        }, { passive: false });
      });
    }

    aiCreationLayer.addEventListener('click', (e) => {
      if (window.AICreationController.surfaceState === 'quick-compose') {
        if (!e.target.closest('#global-create-capsule, #quick-creation-container')) {
          e.preventDefault();
          window.AICreationController.closeQuickCompose();
        }
      }
    });

    // Quick story input typing & enter submit
    const qcInput = document.getElementById('qc-story-input');
    const qcSendBtn = document.getElementById('qc-send-btn');
    if (qcInput) {
      const resetAllScroll = () => {
        window.scrollTo(0, 0);
        if (document.documentElement) document.documentElement.scrollTop = 0;
        if (document.body) document.body.scrollTop = 0;
        if (window.parent && window.parent !== window) {
          try {
            window.parent.scrollTo(0, 0);
            if (window.parent.document.documentElement) window.parent.document.documentElement.scrollTop = 0;
            if (window.parent.document.body) window.parent.document.body.scrollTop = 0;
          } catch (e) {}
        }
      };

      qcInput.addEventListener('focus', () => {
        if (isMobileView()) {
          document.body.classList.add('ai-keyboard-open');
          resetAllScroll();
          requestAnimationFrame(resetAllScroll);
          setTimeout(resetAllScroll, 30);
          setTimeout(resetAllScroll, 100);
          setTimeout(resetAllScroll, 250);
        }
      });
      qcInput.addEventListener('blur', () => {
        if (isMobileView()) {
          setTimeout(() => {
            if (document.activeElement !== qcInput) {
              document.body.classList.remove('ai-keyboard-open');
            }
          }, 100);
        }
      });
      qcInput.addEventListener('input', () => {
        const val = qcInput.value.trim();
        if (qcSendBtn) qcSendBtn.disabled = !val;
        if (window.CreationSessionStore && window.CreationSessionStore.draft) {
          window.CreationSessionStore.draft.story = qcInput.value;
        }
      });
      qcInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (qcInput.value.trim()) {
            window.AICreationController.submitToWorkspace();
          }
        }
      });
    }

    if (qcSendBtn) {
      qcSendBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.AICreationController.submitToWorkspace();
      });
    }

    // Workspace Back & Close
    const wsBackBtn = document.getElementById('workspace-back-btn');
    const wsCloseBtn = document.getElementById('workspace-close-btn');
    if (wsBackBtn) {
      wsBackBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.AICreationController.closeWorkspace();
      });
    }
    if (wsCloseBtn) {
      wsCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.AICreationController.closeWorkspace();
      });
    }

    // Esc key close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (window.AICreationController.surfaceState === 'quick-compose') {
          window.AICreationController.closeQuickCompose();
        } else if (window.AICreationController.surfaceState === 'workspace') {
          window.AICreationController.closeWorkspace();
        }
      }
    });

    // Workspace Stop Generation
    const stopBtn = document.getElementById('workspace-stop-btn');
    if (stopBtn) {
      stopBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.abortGenerationFromUI === 'function') {
          await window.abortGenerationFromUI();
        } else {
          const confirmAbort = await confirm(
            '是否停止生成分鏡？',
            '中斷後現有產出進度將無法恢復。',
            'danger',
            '停止生成'
          );
          if (confirmAbort) {
            if (typeof window.abortStoryboardGeneration === 'function') {
              window.abortStoryboardGeneration();
            }
            window.isGeneratingStoryboard = false;
            if (typeof window.updateGlobalPillProgress === 'function') {
              window.updateGlobalPillProgress(100, false);
            }
            if (typeof window.resetAll === 'function') {
              window.resetAll();
            } else if (typeof window.showPhase === 'function') {
              window.showPhase('phase-compose');
            }
            if (typeof window.showSpaToast === 'function') {
              window.showSpaToast('已停止生成分鏡，已重置為初始狀態');
            }
          }
        }
      });
    }
  }

  function updateAICreationLayerState(page) {
    ensureAICreationLayerDOM();
    if (!globalCreateTrigger || !aiCreationLayer) return;

    const isDashboard = isDashboardPage(page);

    if (!isDashboard) {
      globalCreateTrigger.style.display = 'none';
      if (window.AICreationController.surfaceState !== 'closed') {
        window.AICreationController.closeWorkspace();
        window.AICreationController.closeQuickCompose();
      }
      return;
    }

    // On Dashboard pages, ensure trigger is visible
    globalCreateTrigger.style.display = '';

    if (page === 'generate') {
      // If user navigated directly to 'generate'
      if (window.AICreationController.surfaceState === 'closed') {
        window.AICreationController.openQuickCompose();
      }
    }
  }

  // Backward compatibility aliases
  function ensureAIDockDOM() {
    ensureAICreationLayerDOM();
  }

  function updateAIDockState(page) {
    updateAICreationLayerState(page);
  }

  function ensureMobileBottomNavDOM() {
    let mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
    if (!mobNav) {
      mobNav = document.createElement('nav');
      mobNav.className = 'mobile-bottom-nav';
      mobNav.id = 'spa-mobile-nav';
      mobNav.setAttribute('aria-label', '行動版底部導航');
      mobNav.setAttribute('role', 'tablist');
      mobNav.setAttribute('draggable', 'false');
      mobNav.innerHTML = `
        <div class="mobile-nav__indicator" id="mobile-nav-indicator" aria-hidden="true"></div>

        <!-- Base Track (Normal / Unselected Blur Icons) -->
        <div class="mobile-nav__track mobile-nav__track--base">
            <a href="../dashboard" class="mobile-nav__item active" id="mob-nav-home" role="tab" aria-selected="true" aria-label="首頁" draggable="false">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.5Z"></path>
                        <path d="M9 21V12H15V21"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label">首頁</span>
            </a>
            <a href="../projects" class="mobile-nav__item" id="mob-nav-projects" role="tab" aria-selected="false" aria-label="分鏡" draggable="false">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg icon-fill-target" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M6.85929 1.25001C6.88904 1.25001 6.91919 1.25002 6.94976 1.25002L6.98675 1.25001C7.33818 1.24999 7.56433 1.24998 7.78542 1.27065C8.68728 1.35499 9.54516 1.69531 10.2586 2.25002H16.5C16.5196 2.25002 16.5389 2.25001 16.5579 2.25001C16.9666 2.24994 17.2449 2.2499 17.4895 2.2821C19.1722 2.50364 20.4964 3.82779 20.7179 5.51054C20.7263 5.57397 20.7325 5.63966 20.737 5.70931C21.0145 5.83579 21.2715 5.99934 21.5077 6.21185C21.6061 6.30032 21.6997 6.39394 21.7882 6.49231C22.3165 7.07965 22.5422 7.79459 22.648 8.63601C22.75 9.4479 22.75 10.4741 22.75 11.747V14.0564C22.75 15.8942 22.75 17.3498 22.5969 18.489C22.4393 19.6615 22.1071 20.6104 21.3588 21.3588C20.6104 22.1071 19.6615 22.4393 18.489 22.5969C17.3498 22.75 15.8942 22.75 14.0564 22.75H9.94361C8.10584 22.75 6.65021 22.75 5.51099 22.5969C4.33857 22.4393 3.38962 22.1071 2.64126 21.3588C1.8929 20.6104 1.56078 19.6615 1.40315 18.489C1.24999 17.3498 1.25 15.8942 1.25002 14.0564L1.25002 6.94976C1.25002 6.91919 1.25001 6.88904 1.25001 6.85929C1.2499 6.06338 1.24982 5.55685 1.33237 5.11935C1.6949 3.19788 3.19788 1.6949 5.11935 1.33237C5.55685 1.24982 6.06338 1.2499 6.85929 1.25001ZM19.1474 5.32768C18.8895 4.5029 18.1732 3.88506 17.2937 3.76927C17.1598 3.75163 16.9883 3.75002 16.5 3.75002H11.8113C12.4542 4.38908 12.7459 4.65598 13.0768 4.84005C13.2948 4.96134 13.526 5.05713 13.766 5.12552C14.1793 5.24333 14.6324 5.25002 15.8284 5.25002L16.253 5.25002C17.4153 5.25 18.3718 5.24999 19.1474 5.32768ZM6.94976 2.75002C6.03312 2.75002 5.67873 2.75329 5.39746 2.80636C4.08277 3.05441 3.05441 4.08277 2.80636 5.39746C2.75329 5.67873 2.75002 6.03312 2.75002 6.94976V14C2.75002 15.9068 2.75161 17.2615 2.88978 18.2892C3.02504 19.2953 3.27871 19.8749 3.70192 20.2981C4.12513 20.7213 4.70478 20.975 5.71087 21.1103C6.73853 21.2484 8.0932 21.25 10 21.25H14C15.9068 21.25 17.2615 21.2484 18.2892 21.1103C19.2953 20.975 19.8749 20.7213 20.2981 20.2981C20.7213 19.8749 20.975 19.2953 21.1103 18.2892C21.2484 17.2615 21.25 15.9068 21.25 14V11.7979C21.25 10.4621 21.2486 9.5305 21.1597 8.82312C21.0731 8.13448 20.9141 7.76356 20.6729 7.49539C20.6198 7.43637 20.5637 7.3802 20.5046 7.32712C20.2365 7.08592 19.8656 6.92692 19.1769 6.84034C18.4695 6.75141 17.538 6.75002 16.2021 6.75002H15.8284C15.7912 6.75002 15.7545 6.75002 15.7182 6.75003C14.6702 6.75025 13.9944 6.75038 13.3548 6.56806C13.0041 6.46811 12.6661 6.32811 12.3475 6.15083C11.7663 5.82747 11.2885 5.3495 10.5476 4.60833C10.522 4.58265 10.496 4.55666 10.4697 4.53035L9.91943 3.98009C9.63616 3.69682 9.52778 3.58951 9.41731 3.49793C8.91403 3.08073 8.29664 2.825 7.64576 2.76413C7.50289 2.75077 7.35038 2.75002 6.94976 2.75002ZM12.25 10C12.25 9.5858 12.5858 9.25002 13 9.25002H18C18.4142 9.25002 18.75 9.5858 18.75 10C18.75 10.4142 18.4142 10.75 18 10.75H13C12.5858 10.75 12.25 10.4142 12.25 10Z"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label">分鏡</span>
            </a>
            <button type="button" class="mobile-nav__item mobile-nav__item--create" id="mob-nav-generate" role="tab" aria-selected="false" aria-label="新建分鏡" draggable="false"></button>
            <a href="../template" class="mobile-nav__item" id="mob-nav-template" role="tab" aria-selected="false" aria-label="模板" draggable="false">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 12C3 4.5885 4.5885 3 12 3C19.4115 3 21 4.5885 21 12C21 19.4115 19.4115 21 12 21C4.5885 21 3 19.4115 3 12Z"></path>
                        <path d="M14 14L16 16"></path>
                        <path d="M15 11.5C15 13.433 13.433 15 11.5 15C9.567 15 8 13.433 8 11.5C8 9.567 9.567 8 11.5 8C13.433 8 15 9.567 15 11.5Z"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label">模板</span>
            </a>
            <button type="button" class="mobile-nav__item" id="mob-nav-profile" role="tab" aria-selected="false" aria-label="我的設定" draggable="false">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="9" r="3"></circle>
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M17.9691 20C17.81 17.1085 16.9247 15 11.9999 15C7.07521 15 6.18991 17.1085 6.03076 20"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label">我的</span>
            </button>
        </div>

        <!-- Focus Track (Focus Icons Masked Dynamically by Selector Clip-Path) -->
        <div class="mobile-nav__track mobile-nav__track--focus" aria-hidden="true">
            <div class="mobile-nav__item mobile-nav__item--focus">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg mobile-nav__svg--focus" width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.5Z" fill="#0f172a"></path>
                        <path d="M8 21V12.5C8 10.2909 9.79086 8.5 12 8.5C14.2091 8.5 16 10.2909 16 12.5V21H8Z" fill="#fff"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label" style="visibility: hidden;">首頁</span>
            </div>
            <div class="mobile-nav__item mobile-nav__item--focus">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg mobile-nav__svg--focus" width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M2 6.94975C2 6.06722 2 5.62595 2.06935 5.25839C2.37464 3.64031 3.64031 2.37464 5.25839 2.06935C5.62595 2 6.06722 2 6.94975 2C7.33642 2 7.52976 2 7.71557 2.01738C8.51665 2.09229 9.27652 2.40704 9.89594 2.92051C10.0396 3.03961 10.1763 3.17633 10.4497 3.44975L11 4C11.8158 4.81578 12.2237 5.22367 12.7121 5.49543C12.9804 5.64471 13.2651 5.7626 13.5604 5.84678C14.0979 6 14.6747 6 15.8284 6H16.2021C18.8345 6 20.1506 6 21.0062 6.76946C21.0849 6.84024 21.1598 6.91514 21.2305 6.99383C22 7.84935 22 9.16554 22 11.7979V14C22 17.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V6.94975Z" fill="#0f172a"></path>
                        <rect x="6.5" y="8" width="11" height="9" rx="1.5" fill="#fff"></rect>
                        <path d="M9 11H15M9 13.5H13.5" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label" style="visibility: hidden;">分鏡</span>
            </div>
            <div class="mobile-nav__item mobile-nav__item--create" style="visibility:hidden; pointer-events:none;"></div>
            <div class="mobile-nav__item mobile-nav__item--focus">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg mobile-nav__svg--focus" width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M3 12C3 4.5885 4.5885 3 12 3C19.4115 3 21 4.5885 21 12C21 19.4115 19.4115 21 12 21C4.5885 21 3 19.4115 3 12Z" fill="#0f172a"></path>
                        <circle cx="11.5" cy="11.5" r="4.6" fill="#fff"></circle>
                        <circle cx="11.5" cy="11.5" r="2.2" fill="#0f172a"></circle>
                        <path d="M14.5 14.5L18 18" stroke="#fff" stroke-width="2.6" stroke-linecap="round"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label" style="visibility: hidden;">模板</span>
            </div>
            <div class="mobile-nav__item mobile-nav__item--focus">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg mobile-nav__svg--focus" width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" fill="#0f172a"></circle>
                        <circle cx="12" cy="8.5" r="3.6" fill="#fff"></circle>
                        <path d="M6 19.5C6.6 15.2 9 13.8 12 13.8C15 13.8 17.4 15.2 18 19.5C16.4 20.8 14.3 21.6 12 21.6C9.7 21.6 7.6 20.8 6 19.5Z" fill="#fff"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label" style="visibility: hidden;">我的</span>
            </div>
        </div>
      `;
      document.body.appendChild(mobNav);
      mobileBottomNav = mobNav;
    }
    mountAICreationCapsule();
    initMobileBottomNavGestures();
  }

  function mountAICreationCapsule() {
    const capsule = document.getElementById('global-create-capsule');
    if (!capsule) return;
    const isMobile = isMobileView();
    if (isMobile) {
      const mobGen = document.getElementById('mob-nav-generate');
      if (mobGen) {
        const oldWrap = mobGen.querySelector('#mob-nav-circle-wrap');
        if (oldWrap) {
          oldWrap.remove();
        }
        if (capsule.parentElement !== mobGen) {
          mobGen.appendChild(capsule);
        }
      }
    } else {
      if (capsule.parentElement !== document.body) {
        document.body.appendChild(capsule);
      }
    }
  }
  window.addEventListener('resize', mountAICreationCapsule);

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

  window.toggleUserPanel = function(open) {
    ensureUserPanelDOM();
    const panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel') || dashboardUserPanel;
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
      updateMobileBottomNavActive(targetPage || currentPage);
    }
  };

  function initUserPanelGestures() {
    const panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel') || dashboardUserPanel;
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
          backdrop.style.setProperty('opacity', '1', 'important');
          backdrop.style.setProperty('backdrop-filter', 'blur(4px)', 'important');
          backdrop.style.setProperty('-webkit-backdrop-filter', 'blur(4px)', 'important');
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

  function initMobileBottomNavGestures() {
    const mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
    if (!mobNav || mobNav.dataset.gesturesBound) return;
    mobNav.dataset.gesturesBound = 'true';

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
      items.forEach(it => {
        it.classList.remove('snap-target', 'selector-hovered', 'is-hovered');
      });
      const circleBtn = mobNav.querySelector('.mob-circle-btn') || document.getElementById('global-create-capsule');
      if (circleBtn) {
        circleBtn.classList.remove('snap-hover', 'selector-hovered', 'is-hovered');
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
          it.classList.remove('snap-target', 'selector-hovered', 'is-hovered');
        }
      });
      const circleBtn = mobNav.querySelector('.mob-circle-btn') || document.getElementById('global-create-capsule');
      const isCreate = targetItem.classList.contains('mobile-nav__item--create') || targetItem.id === 'mob-nav-generate';
      if (circleBtn) {
        if (isCreate) {
          circleBtn.classList.add('snap-hover', 'selector-hovered', 'is-hovered');
          targetItem.classList.add('selector-hovered', 'is-hovered');
        } else {
          circleBtn.classList.remove('snap-hover', 'selector-hovered', 'is-hovered');
          targetItem.classList.remove('selector-hovered', 'is-hovered');
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

      // Smooth soft micro-enlargement (scale: 1.026) instead of shrink
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

      if (e.cancelable && e.pointerType !== 'mouse') {
        e.preventDefault();
      }

      mobNav.style.transition = 'none';

      const rawDx = e.clientX - startX;
      const rawDy = e.clientY - startY;

      if (cachedNavRect && (e.clientY < cachedNavRect.top - 65 || e.clientY > cachedNavRect.bottom + 65)) {
        if (!isCancelled) {
          isCancelled = true;
          currentTargetItem = null;
          clearSnapHover();
          updateMobileBottomNavActive(targetPage || currentPage);
        }
      } else {
        isCancelled = false;
        // Finger movement tracking closest target item
        const closestMetric = findClosestMetric(e.clientX);
        const newTargetItem = closestMetric ? closestMetric.item : null;

        if (newTargetItem !== currentTargetItem) {
          currentTargetItem = newTargetItem;
          if (currentTargetItem !== lastSnappedItem) {
            lastSnappedItem = currentTargetItem;
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try { navigator.vibrate(8); } catch (_) {}
            }
          }
          highlightTargetItem(currentTargetItem);
        }

        // Follow finger with soft magnetic link attraction across all items including create button
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

      // Directional vertical stretch (threshold: |rawDy| > 8px) - X-axis stretch removed
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

      // Indicator smooth settling into link center without bouncing
      if (indicator && releasedTargetItem && cachedNavRect) {
        indicator.classList.add('is-active');
        indicator.classList.remove('is-pressed');
        const tMetric = cachedMetrics.find(m => m.item === releasedTargetItem);
        const targetCenterX = tMetric ? tMetric.centerX : (releasedTargetItem.getBoundingClientRect().left + releasedTargetItem.getBoundingClientRect().width / 2);
        const finalOffset = targetCenterX - cachedNavRect.left - indicatorWidth / 2;
        curIndicatorX = Math.max(insetX, Math.min(cachedNavRect.width - indicatorWidth - insetX, finalOffset));
        updateIndicatorVisual(curIndicatorX, 1.0, true, 1.0);
      }


      // Overshoot Rebound for large displacement
      const dragDist = Math.hypot(curDx, curDy);
      const isLargeDisplacement = dragDist > 5.0; // Lowered from 9 to 5.0

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
        updateMobileBottomNavActive(targetPage || currentPage);
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
          } else {
            window.AICreationController.openQuickCompose();
          }
        }
      } else {
        const href = targetItem.getAttribute('href') || '';
        let targetRoute = 'dashboard';
        if (href.includes('generate')) targetRoute = 'generate';
        else if (href.includes('projects')) targetRoute = 'projects';
        else if (href.includes('template')) targetRoute = 'template';
        else if (href.includes('history')) targetRoute = 'history';
        navigate(targetRoute);
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

    const mobGenItem = mobNav.querySelector('#mob-nav-generate');
    if (mobGenItem) {
      mobGenItem.addEventListener('pointerenter', () => {
        const cap = document.getElementById('global-create-capsule');
        if (cap && !cap.classList.contains('is-expanded')) {
          cap.classList.add('selector-hovered', 'is-hovered');
        }
      });
      mobGenItem.addEventListener('pointerleave', () => {
        const cap = document.getElementById('global-create-capsule');
        if (cap && !isNavInteracting) {
          cap.classList.remove('selector-hovered', 'is-hovered');
        }
      });
    }

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
            } else {
              window.AICreationController.openQuickCompose();
            }
          }
        } else {
          const href = item.getAttribute('href') || '';
          let targetRoute = 'dashboard';
          if (href.includes('generate')) targetRoute = 'generate';
          else if (href.includes('projects')) targetRoute = 'projects';
          else if (href.includes('template')) targetRoute = 'template';
          else if (href.includes('history')) targetRoute = 'history';
          navigate(targetRoute);
        }
      });
    });

    if (window.visualViewport && !mobNav.dataset.viewportBound) {
      mobNav.dataset.viewportBound = 'true';
      const initialHeight = window.visualViewport.height;

      const onViewportChange = () => {
        const isQuickComposeActive = document.body.classList.contains('ai-quick-compose-active') ||
          (window.AICreationController && window.AICreationController.surfaceState === 'quick-compose');

        if (isQuickComposeActive) {
          mobNav.style.opacity = '1';
          mobNav.style.pointerEvents = 'auto';

          if (isMobileView()) {
            if (window.scrollY !== 0 || (document.documentElement && document.documentElement.scrollTop !== 0)) {
              window.scrollTo(0, 0);
              if (document.documentElement) document.documentElement.scrollTop = 0;
            }
            if (window.parent && window.parent !== window) {
              try {
                if (window.parent.scrollY !== 0) window.parent.scrollTo(0, 0);
              } catch (e) {}
            }
          }

          const lift = Math.max(0, window.innerHeight - window.visualViewport.height);
          const qcContainer = document.getElementById('quick-creation-container');

          if (lift > 80) {
            document.body.classList.add('ai-keyboard-open');
            mobNav.style.transform = `translate3d(0, -${lift}px, 0)`;
            if (qcContainer) {
              qcContainer.style.transform = `translate3d(-50%, -${lift}px, 0)`;
            }
          } else {
            mobNav.style.transform = '';
            if (qcContainer) {
              qcContainer.style.transform = 'translateX(-50%)';
            }
            if (document.activeElement !== document.getElementById('qc-story-input')) {
              document.body.classList.remove('ai-keyboard-open');
            }
          }
        } else {
          document.body.classList.remove('ai-keyboard-open');
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
        }
      };

      window.visualViewport.addEventListener('resize', onViewportChange);
      window.visualViewport.addEventListener('scroll', () => {
        onViewportChange();
        if (document.body.classList.contains('ai-quick-compose-active') && isMobileView()) {
          window.scrollTo(0, 0);
          if (document.documentElement) document.documentElement.scrollTop = 0;
        }
      });

      window.addEventListener('scroll', () => {
        if (document.body.classList.contains('ai-quick-compose-active') && isMobileView()) {
          if (window.scrollY !== 0 || (document.documentElement && document.documentElement.scrollTop !== 0)) {
            window.scrollTo(0, 0);
            if (document.documentElement) document.documentElement.scrollTop = 0;
          }
          if (window.parent && window.parent !== window) {
            try {
              if (window.parent.scrollY !== 0) window.parent.scrollTo(0, 0);
            } catch (e) {}
          }
        }
      }, { passive: false });
    }

    window.addEventListener('resize', () => {
      updateMobileBottomNavActive(targetPage || currentPage);
    });
  }

  function updateMobileBottomNavActive(page) {
    const mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
    if (!mobNav) return;

    if (isNavInteracting) return;

    const panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel') || dashboardUserPanel;
    const isProfileActive = page === 'profile' || (panel && panel.classList.contains('active'));

    let activeMainPage = page;
    if (!activeMainPage || activeMainPage === 'profile' || (activeMainPage === currentPage && targetPage)) {
      activeMainPage = targetPage || currentPage;
    }
    if (!activeMainPage || activeMainPage === 'profile') {
      activeMainPage = currentPage || 'dashboard';
    }
    if (activeMainPage === 'project') {
      activeMainPage = 'projects';
    }

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
        const isGenerate = activeMainPage === 'generate' && (href.includes('generate') || item.id === 'mob-nav-generate');
        const isDashboard = activeMainPage === 'dashboard' && (href.includes('dashboard') || item.id === 'mob-nav-home');
        const isProjects = activeMainPage === 'projects' && (href.includes('projects') || item.id === 'mob-nav-projects');
        const isTemplate = activeMainPage === 'template' && (href.includes('template') || item.id === 'mob-nav-template');
        isActive = isGenerate || isDashboard || isProjects || isTemplate;
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

  window.addEventListener('resize', () => {
    if (!isMobileView()) {
      const bgTargets = getBackgroundDepthTargets();
      bgTargets.forEach(el => {
        el.classList.remove('bg-depth-scaled', 'bg-depth-animating');
        el.style.removeProperty('transform');
        el.style.removeProperty('border-radius');
        el.style.removeProperty('overflow');
      });
      const panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel');
      if (panel) {
        panel.style.removeProperty('transform');
      }
    }
  });

  async function initSharedLayoutLogic(signal) {
    updateRailHoles();
    initMobileBottomNavGestures();
    initUserPanelGestures();
    updateMobileBottomNavActive(targetPage || currentPage);

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
        window.toggleUserPanel();
      };
    }

    const logout = panel?.querySelector('.up-logout');
    if (logout && !logout.dataset.spaBound) {
      logout.dataset.spaBound = 'true';
      logout.addEventListener('click', async e => {
        e.preventDefault();
        window.toggleUserPanel(false);
        const isConfirmed = await confirm('是否確定登出？', '登出後將清除快取並返回首頁。', 'danger', '登出');
        if (isConfirmed) {
          spaAuth.logout();
        }
      });
    }

    bindSidebarLinks();

    const parsed = parseRouteFromHash(window.location.hash);
    if (parsed.page === 'project' || parsed.page === 'projects') {
      localStorage.setItem('sidebar_projects_expanded', 'true');
      if (window.innerWidth > 1024) {
        expandSidebar(true);
      }
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
              <h3>尚無分鏡</h3>
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
                <button class="project-option-btn" title="分鏡選項" data-id="${p.id}">⋯</button>
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
              <h3>尚無分鏡</h3>
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
                <button class="project-option-btn" title="分鏡選項" data-id="${p.id}">⋯</button>
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
      avatar.onclick = e => {
        e.stopPropagation();
        window.toggleUserPanel();
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

    const projectsGrid = document.getElementById('projects-grid');
    if (projectsGrid) {
      projectsGrid.innerHTML = SKELETON_CARDS_HTML;
      const projects = await spaAuth.fetchProjects();
      projectsGrid.innerHTML = '';

      if (!projects || projects.length === 0) {
        projectsGrid.innerHTML = `
          <div class="projects-empty">
            <h3>尚無分鏡</h3>
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

    if (typeof window.initGeneratePage === 'function') {
      window.initGeneratePage();
    }

    if (window.AICreationController) {
      window.AICreationController.openWorkspaceDirectly();
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
            <p>刪除的分鏡將會暫時保留在此處，以便日後還原。</p>
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
              alert('此分鏡已被刪除，請點擊右上角「⋯」按鈕並選擇「還原分鏡」進行還原。');
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
              <button class="project-option-btn" title="分鏡選項" data-id="${p.id}">⋯</button>
            </div>
            ${thumbHTML}
            <div class="project-info">
              <div class="project-title">${p.title}</div>
              <div class="project-meta">
                <span class="project-tag">${date}</span>
                <span class="project-tag">${p.ratio}</span>
              </div>
              <div class="project-date">分鏡風格：${p.style || '未指定'}</div>
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

    const pageMain = document.getElementById('page-main');
    if (pageMain) {
      pageMain.style.padding = '0';
    }

    cloneMainContent(doc, m);

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    const categoriesEl = document.getElementById('store-categories');
    const gridEl = document.getElementById('template-grid');
    const detailImmersiveEl = document.getElementById('template-detail-immersive');

    if (!categoriesEl || !gridEl || !detailImmersiveEl) return;

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

    // Calculate count per category
    const catCounts = { '全部': templates.length, 'product': 0, 'story': 0, 'twist': 0, 'custom': 0 };
    templates.forEach(t => {
      const cat = t.category || t.type;
      const key = (cat === 'custom' || cat === 'product' || cat === 'story' || cat === 'twist') ? cat : 'custom';
      catCounts[key]++;
    });

    // Update counts elements
    const countAllEl = document.getElementById('count-all');
    if (countAllEl) countAllEl.textContent = `${catCounts['全部']} 模板`;
    const countProdEl = document.getElementById('count-product');
    if (countProdEl) countProdEl.textContent = `${catCounts['product']} 模板`;
    const countStoryEl = document.getElementById('count-story');
    if (countStoryEl) countStoryEl.textContent = `${catCounts['story']} 模板`;
    const countTwistEl = document.getElementById('count-twist');
    if (countTwistEl) countTwistEl.textContent = `${catCounts['twist']} 模板`;
    const countCustomEl = document.getElementById('count-custom');
    if (countCustomEl) countCustomEl.textContent = `${catCounts['custom']} 模板`;

    let currentCategory = '全部';
    let searchQuery = '';

    function filterAndDisplay() {
      // 1. Filter by category
      let filtered = templates;
      if (currentCategory !== '全部') {
        filtered = templates.filter(t => {
          const c = t.category || t.type;
          if (currentCategory === 'custom') {
            return c !== 'product' && c !== 'story' && c !== 'twist';
          }
          return c === currentCategory;
        });
      }

      // 2. Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(t => {
          const nameMatch = (t.name || t.title || '').toLowerCase().includes(query);
          const descMatch = (t.description || '').toLowerCase().includes(query);
          const tagMatch = Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase().includes(query));
          return nameMatch || descMatch || tagMatch;
        });
      }

      // 3. Display
      if (filtered.length === 0) {
        gridEl.innerHTML = `
          <div style="color:var(--text-mid); text-align:center; padding: 60px; grid-column: 1/-1; font-size:1.05rem; font-weight:700;">
            沒有找到符合條件的模板
            <p style="font-size:0.9rem; color:#8b87a8; font-weight:normal; margin-top:8px;">試試其他關鍵字，或是點選其他分類瀏覽。</p>
          </div>
        `;
        return;
      }

      gridEl.innerHTML = filtered.map(t => {
        const shotCount = t.shotsCount || (t.structure ? t.structure.length : 0);
        const tags = Array.isArray(t.tags) ? t.tags.slice(0, 3).map(tag => `<span>${tag}</span>`).join(' ') : '';
        const platforms = Array.isArray(t.platform) ? t.platform.map(p => `<span class="platform-badge">${p}</span>`).join('') : '<span class="platform-badge">shorts</span>';
        
        let duration = '0s';
        if (t.structure && t.structure.length) {
          const sumSec = t.structure.map(s => parseInt(s.duration) || 0).reduce((a, b) => a + b, 0);
          duration = `${sumSec}s`;
        }

        return `
          <div class="template-card" data-id="${t.id}">
            <div class="template-card-header">
              <span class="template-card-cat">${CAT_MAP[t.category] || t.category || '未分類'}</span>
              <span class="template-card-shots">${shotCount} 鏡頭</span>
            </div>
            <div class="template-card-body">
              <h4>${t.name || t.title || '無標題'}</h4>
              <p>${t.description || '無描述'}</p>
              <div class="template-card-tags">
                ${tags}
              </div>
            </div>
            <div class="template-card-footer">
              <div class="platform-badges">
                ${platforms}
              </div>
              <div class="template-card-duration">
                ⏱️ ${duration}
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Add click listeners to template cards
      gridEl.querySelectorAll('.template-card').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          const template = templates.find(x => x.id === id);
          if (template && window.renderTemplateDetailTimeline) {
            window.renderTemplateDetailTimeline(template, detailImmersiveEl);
          }
        });
      });
    }

    // Set category card click listeners
    const catCards = categoriesEl.querySelectorAll('.category-card');
    catCards.forEach(card => {
      card.addEventListener('click', () => {
        catCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        currentCategory = card.dataset.catId;

        // Update titles
        const catTitleEl = document.getElementById('current-category-title');
        const catDescEl = document.getElementById('current-category-desc');

        if (currentCategory === '全部') {
          if (catTitleEl) catTitleEl.textContent = '熱門推薦爆點結構';
          if (catDescEl) catDescEl.textContent = '點擊下方卡片，深入查看時間軸軌道設計與 AI 剖析';
        } else {
          if (catTitleEl) catTitleEl.textContent = `${CAT_MAP[currentCategory] || currentCategory} 推薦模板`;
          if (catDescEl) catDescEl.textContent = `專門為 ${CAT_MAP[currentCategory] || currentCategory} 特性精選與優化的爆點結構`;
        }

        filterAndDisplay();
      });
    });

    // Set search listener
    const searchInput = document.getElementById('store-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        filterAndDisplay();
      });
    }

    // Initialize display
    filterAndDisplay();

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
      m.innerHTML = `<div class="projects-empty"><h3>找不到分鏡 ID</h3></div>`;
      return;
    }

    function renderProjectSkeleton(container) {
      container.innerHTML = `
        <div class="project-detail loading-skeleton">
          <div class="project-header-sticky">
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
          <div class="project-header-sticky">
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
          m.innerHTML = `<div class="projects-empty"><h3>無法取得分鏡</h3></div>`;
          return;
        }
        await renderWithProjectData(p);
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('renderProject error', e);
          m.innerHTML = `<div class="projects-empty"><h3>讀取分鏡發生錯誤</h3><p>${e.message || '未知錯誤'}</p></div>`;
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
      if (burger && !burger.dataset.bound) {
        burger.dataset.bound = 'true';
        burger.addEventListener('change', () => {
          expandSidebar(burger.checked);
        });
      }
      if (burgerContainer) {
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
            const sidebar = document.getElementById('dash-sidebar') || dashboardSidebar;
            if (sidebar && sidebar.contains(a) && page !== 'projects' && page !== 'project') {
              expandSidebar(false);
            }
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
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js'],
      render: (o, signal) => renderDashboard(signal)
    },

    projects: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js'],
      render: (o, signal) => renderProjectsPage(signal)
    },

    generate: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css', '/css/template.css'],
      js: ['/js/math-curve-loader.js', '/js/token-manager.js', '/js/prompt-translate.js', '/js/generate.js'],
      render: (o, signal) => renderGenerate(o, signal)
    },

    history: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js'],
      render: (o, signal) => renderHistory(signal)
    },

    template: {
      css: ['/css/dashboard.css', '/css/template.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js', '/js/template-timeline.js', '/js/template.js'],
      render: (o, signal) => renderTemplate(signal)
    },

    project: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
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
    if (window.innerWidth <= 1024) {
      document.body.classList.remove('sidebar-open');
      const burger = document.getElementById("burger");
      if (burger) burger.checked = false;
      return;
    }

    const burger = document.getElementById("burger");
    const sidebar = document.getElementById('dash-sidebar') || dashboardSidebar;
    if (!burger || !sidebar) return;

    burger.checked = expand;
    if (expand) {
      document.body.classList.add('sidebar-open');
      sidebar.style.width = '260px';
      sidebar.classList.add('open');
    } else {
      document.body.classList.remove('sidebar-open');
      sidebar.style.width = '60px';
      sidebar.classList.remove('open');
    }
  }

  function updateSidebarActive(page) {
    const sidebar = document.getElementById('dash-sidebar') || dashboardSidebar;
    if (!sidebar) return;

    let activeMainPage = page;
    if (page === 'project') {
      activeMainPage = 'projects';
    } else if (page === 'generate') {
      activeMainPage = 'generate';
    }

    const links = sidebar.querySelectorAll('.side-link');
    links.forEach(l => {
      const href = l.getAttribute('href') || '';
      const shouldBeActive = 
        (activeMainPage === 'generate' && href.includes('generate')) ||
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

    const btnPrimary = sidebar.querySelector('.sidebar-btn-primary');
    if (btnPrimary) {
      if (activeMainPage === 'generate') {
        btnPrimary.classList.add('active');
      } else {
        btnPrimary.classList.remove('active');
      }
    }

    updateSidebarProjects();
    updateMobileBottomNavActive(page);
  }

  function updateSidebarProjects() {
    const sidebar = document.getElementById('dash-sidebar') || dashboardSidebar;
    if (!sidebar) return;
    const sidebarList = sidebar.querySelector('#sidebar-projects-list');
    if (!sidebarList) return;

    const activeProjects = (cacheProjectsList || []).filter(p => !p.is_deleted && !pendingDeletions[p.id]);
    const currentJSON = JSON.stringify(activeProjects.map(p => ({ id: p.id, title: p.title })));

    if (currentJSON !== lastRenderedProjectsJSON) {
      lastRenderedProjectsJSON = currentJSON;
      sidebarList.innerHTML = '';
      
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
    }
  }

  async function navigate(page, opts = {}) {
    const pageMain = document.getElementById('page-main');
    if (pageMain) {
      pageMain.classList.remove('is-generating');
      pageMain.style.padding = '';
    }

    if (page === 'generate') {
      const contentEl = getOrCreateContentContainer();
      if (contentEl) {
        contentEl.style.transition = 'opacity 180ms ease, filter 180ms ease, transform 180ms ease';
        contentEl.style.opacity = '0';
        contentEl.style.filter = 'blur(12px)';
        contentEl.style.transform = 'scale(0.98)';
      }
    }

    // 當從登入/註冊頁面登入進入 Dashboard 時，若先前為展開狀態，自動將其收回（在 mask 遮罩期間完成）
    if ((currentPage === 'login' || currentPage === 'register') && isDashboardPage(page)) {
      if (localStorage.getItem('sidebar_projects_expanded') === 'true') {
        localStorage.setItem('sidebar_projects_expanded', 'false');
        expandSidebar(false);
        const subList = document.getElementById('sidebar-projects-list') || dashboardSidebar?.querySelector('#sidebar-projects-list');
        const navProjectsGroup = document.getElementById('nav-projects-group') || dashboardSidebar?.querySelector('#nav-projects-group');
        if (subList) subList.classList.remove('expanded');
        if (navProjectsGroup) navProjectsGroup.classList.remove('expanded');
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
      if (dashboardSidebar) dashboardSidebar.style.display = '';
      if (dashboardTopbar) dashboardTopbar.style.display = '';
      if (mobileBottomNav) mobileBottomNav.style.display = '';
      
      const userPanel = document.getElementById('spa-user-panel');
      if (userPanel) userPanel.style.display = '';

      // 進入專案頁面時，自動展開側邊欄與專案子清單 (僅限桌面版)
      if (page === 'project' || page === 'projects') {
        localStorage.setItem('sidebar_projects_expanded', 'true');
        if (window.innerWidth > 1024) {
          expandSidebar(true);
        }
        const subList = document.getElementById('sidebar-projects-list') || dashboardSidebar?.querySelector('#sidebar-projects-list');
        const navProjectsGroup = document.getElementById('nav-projects-group') || dashboardSidebar?.querySelector('#nav-projects-group');
        if (subList) subList.classList.add('expanded');
        if (navProjectsGroup) navProjectsGroup.classList.add('expanded');
      }

      updateSidebarActive(page);
      updateAIDockState(page);
    } else {
      document.body.classList.remove('dashboard-layout');
      if (page === 'login' || page === 'register') {
        document.body.classList.add('auth-layout');
      } else {
        document.body.classList.remove('auth-layout');
      }
      if (dashboardSidebar) dashboardSidebar.style.display = 'none';
      if (dashboardTopbar) dashboardTopbar.style.display = 'none';
      if (mobileBottomNav) mobileBottomNav.style.display = 'none';
      
      const userPanel = document.getElementById('spa-user-panel');
      if (userPanel) {
        userPanel.style.display = 'none';
        userPanel.classList.remove('active');
      }
      
      // 如果回到 landing / login / register，復原原本 navbar 的顯示並清除本機 margin
      const nav = document.getElementById('nav') || document.querySelector('.nav');
      if (nav) nav.style.display = '';
      showLandingNav();
      
      const pageMain = document.getElementById('page-main');
      if (pageMain) pageMain.style.margin = '';
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
        contentEl.style.transition = 'opacity 180ms ease, filter 180ms ease';
        contentEl.style.opacity = '0';
        contentEl.style.filter = 'blur(12px)';
      }
      await rafDelay(page === 'generate' ? 140 : 250);
      
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
      updateAIDockState(page);
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

      if (page === 'landing' && typeof window.initLandingPage === 'function') {
        prefetchAuthResources();
        if (typeof window.initLandingLogic === 'function') {
          window.initLandingLogic();
        }
        window.initLandingPage();
      } else if (page === 'template' && typeof window.initTemplatePage === 'function') {
        window.initTemplatePage();
      }

      if (isDashboardPage(page)) {
        document.body.classList.add('dashboard-layout');
        document.body.classList.remove('auth-layout');
        showDashTopbar();
        updateSidebarActive(page);
      updateAIDockState(page);
      } else if (page === 'landing') {
        document.body.classList.remove('dashboard-layout');
        document.body.classList.remove('auth-layout');
        showLandingNav();
      } else if (page === 'login' || page === 'register') {
        document.body.classList.remove('dashboard-layout');
        document.body.classList.add('auth-layout');
        showLandingNav();
      }

      if (dashboardSidebar) {
        dashboardSidebar.style.display = isDashboardPage(page) ? '' : 'none';
      }

      if (dashboardTopbar) {
        dashboardTopbar.style.display = isDashboardPage(page) ? '' : 'none';
      }

      const mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
      if (mobNav) {
        mobNav.style.display = isDashboardPage(page) ? '' : 'none';
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
          contentEl.style.transition = 'opacity 250ms ease, filter 250ms ease';
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

  document.addEventListener('DOMContentLoaded', async () => {
    initDashboardLoader();

    document.addEventListener('click', (e) => {
      if (justHandledPointerNav || (window.__justHandledPointerNav && Date.now() - window.__justHandledPointerNav < 450)) return;
      if (e.target.closest('#spa-mobile-nav, .mobile-bottom-nav')) return;
      const panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel') || dashboardUserPanel;
      const avatar = document.getElementById('top-avatar') || (typeof dashboardTopbar !== 'undefined' && dashboardTopbar ? dashboardTopbar.querySelector('#top-avatar') : null);
      if (panel && panel.classList.contains('active')) {
        if (!e.target.closest('#spa-user-panel, #user-panel') && !e.target.closest('#top-avatar') && (!avatar || !avatar.contains(e.target)) && !e.target.closest('#mob-nav-profile')) {
          if (typeof window.toggleUserPanel === 'function') {
            window.toggleUserPanel(false);
          } else {
            panel.classList.remove('active');
          }
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