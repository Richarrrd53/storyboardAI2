/**
 * StoryboardAI - Page Asset Loader Feature (P4-5)
 * Manages loading, caching, injection, and prefetching of application assets:
 * - Stylesheet injection & dynamic page CSS removal (link[data-spa-sheet])
 * - Script injection with sequential loading & abort signal support (script[data-spa-script])
 * - HTML document memory caching & DOMParser resolution
 * - Route prefetching & auth resource prefetching
 * - LocalStorage stale cache eviction
 */
(function (root) {
  'use strict';

  // In-memory HTML document cache
  if (!root.htmlMemoryCache) {
    root.htmlMemoryCache = {};
  }

  // Purge any stale page caches from localStorage to ensure always up-to-date HTML
  try {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('spa_page_cache_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    }
  } catch (e) {}

  const loadedCSS = new Set();
  const loadedScripts = new Set();

  let pendingTemplatesPromise = null;
  let cacheTemplatesList = null;
  const cacheProjectDetails = {};

  function injectCSS(href) {
    return new Promise((resolve) => {
      const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'http://localhost';
      const fullUrl = new URL(href, origin).pathname;
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
    const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'http://localhost';
    const normalizedNext = nextCSS.map(href => new URL(href, origin).pathname);
    document.querySelectorAll('link[data-spa-sheet]').forEach(el => {
      const href = new URL(el.href, origin).pathname;
      if (!normalizedNext.includes(href)) {
        el.remove();
        loadedCSS.delete(href);
      }
    });
  }

  function injectScript(src, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve(false);
        return;
      }

      const base = (typeof window !== 'undefined' && window.location?.href) ? window.location.href : 'http://localhost/';
      const pathname = new URL(src, base).pathname;

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
    if (!scripts || scripts.length === 0) return Promise.resolve([]);
    const promises = scripts.map(src => {
      return new Promise((resolve) => {
        if (signal?.aborted) {
          resolve(false);
          return;
        }

        const base = (typeof window !== 'undefined' && window.location?.href) ? window.location.href : 'http://localhost/';
        const pathname = new URL(src, base).pathname;

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
    // Retain scripts in DOM to prevent duplicate execution upon revisits
  }

  async function fetchPageDoc(url, signal) {
    if (root.htmlMemoryCache && root.htmlMemoryCache[url]) {
      return root.htmlMemoryCache[url];
    }
    const res = await fetch(url + '?v=' + Date.now(), { signal });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (root.htmlMemoryCache) {
      root.htmlMemoryCache[url] = doc;
    }
    return doc;
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
          root.cacheTemplatesList = templates;
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
    if (root.ProjectStore && typeof root.ProjectStore.fetchProjectDetail === 'function') {
      const p = await root.ProjectStore.fetchProjectDetail(projectId, { signal });
      if (p) cacheProjectDetails[projectId] = p;
      return p;
    }
    return null;
  }

  async function prefetchPage(page, opts = {}) {
    let htmlUrl = null;
    if (page === 'login' || page === 'register') htmlUrl = '/html/login.html';
    else if (page === 'dashboard' || page === 'project') htmlUrl = '/html/dashboard.html';
    else if (page === 'projects') htmlUrl = '/html/projects.html';
    else if (page === 'generate') htmlUrl = '/html/generate.html';
    else if (page === 'history') htmlUrl = '/html/history.html';
    else if (page === 'template') htmlUrl = '/html/template.html';
    else if (page === 'discovery') htmlUrl = '/html/discovery.html';

    if (htmlUrl) {
      fetchPageDoc(htmlUrl).catch(() => {});
    }

    const auth = root.spaAuth;
    if (auth && typeof auth.isLoggedIn === 'function' && auth.isLoggedIn()) {
      if (page === 'dashboard' || page === 'projects' || page === 'history') {
        if (typeof auth.fetchProjects === 'function') {
          auth.fetchProjects().catch(() => {});
        }
      } else if (page === 'template') {
        fetchTemplates().catch(() => {});
      } else if (page === 'project' && opts.id) {
        fetchProjectDetail(opts.id).catch(() => {});
      }
    }
  }

  function prefetchAuthResources() {
    const auth = root.spaAuth;
    const isLogged = auth && typeof auth.isLoggedIn === 'function' ? auth.isLoggedIn() : false;
    if (!isLogged) {
      prefetchPage('login').catch(() => {});
      injectCSS('/css/auth.css').catch(() => {});
      fetch('/js/auth.js').catch(() => {});
    }
  }

  function clearMemoryCache() {
    root.htmlMemoryCache = {};
    cacheTemplatesList = null;
    loadedCSS.clear();
    loadedScripts.clear();
  }

  const PageAssetLoader = {
    injectCSS,
    removePageCSS,
    injectScript,
    injectScripts,
    removePageScripts,
    fetchPageDoc,
    prefetchPage,
    prefetchAuthResources,
    fetchTemplates,
    fetchProjectDetail,
    clearMemoryCache,
    get loadedCSS() { return loadedCSS; },
    get loadedScripts() { return loadedScripts; }
  };

  root.PageAssetLoader = PageAssetLoader;
  root.injectCSS = injectCSS;
  root.removePageCSS = removePageCSS;
  root.injectScript = injectScript;
  root.injectScripts = injectScripts;
  root.removePageScripts = removePageScripts;
  root.fetchPageDoc = fetchPageDoc;
  root.prefetchPage = prefetchPage;
  root.prefetchAuthResources = prefetchAuthResources;

})(typeof window !== 'undefined' ? window : globalThis);
