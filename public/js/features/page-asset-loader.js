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
  let cacheEpoch = 0;
  let templateEpoch = 0;
  let cacheController = new AbortController();
  const pendingScripts = new Map();
  const pendingCSS = new Map();
  const pendingDocs = new Map();
  // Legacy readers/writers share this exact value; invalidation also retires pending requests.
  Object.defineProperty(root, 'cacheTemplatesList', {
    configurable: true,
    get: () => cacheTemplatesList,
    set(value) { cacheTemplatesList = value; templateEpoch++; pendingTemplatesPromise = null; }
  });

  function abortError() { return new DOMException('Navigation aborted', 'AbortError'); }
  function waitFor(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const abort = () => reject(abortError());
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }

  function injectCSS(href) {
    const origin = root.location?.origin || 'http://localhost';
    const fullUrl = new URL(href, origin).pathname;
    if (loadedCSS.has(fullUrl)) return Promise.resolve();
    if (pendingCSS.has(fullUrl)) return pendingCSS.get(fullUrl);
    const promise = new Promise((resolve) => {
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
    pendingCSS.set(fullUrl, promise);
    promise.finally(() => pendingCSS.delete(fullUrl));
    return promise;
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
    if (signal?.aborted) return Promise.resolve(false);
    const base = root.location?.href || 'http://localhost/';
    const pathname = new URL(src, base).pathname;
    if (loadedScripts.has(pathname)) return Promise.resolve(true);
    if (!pendingScripts.has(pathname)) {
      const promise = new Promise(resolve => {
        const script = document.createElement('script');
        script.dataset.spaScript = '1';
        script.dataset.src = pathname;
        script.async = false;
        if (src.includes('landing-animation.js')) script.type = 'module';
        script.src = src;
        const finish = loaded => {
          script.onload = null;
          script.onerror = null;
          if (loaded) loadedScripts.add(pathname);
          else script.remove();
          resolve(loaded);
        };
        script.onload = () => finish(true);
        script.onerror = () => finish(false);
        document.body.appendChild(script);
      });
      pendingScripts.set(pathname, promise);
      promise.finally(() => pendingScripts.delete(pathname));
    }
    return waitFor(pendingScripts.get(pathname), signal).catch(error => {
      if (error.name === 'AbortError') return false;
      throw error;
    });
  }

  async function injectScripts(scripts = [], signal) {
    const results = [];
    for (const src of scripts) {
      const loaded = await injectScript(src, signal);
      results.push(loaded);
      if (!loaded) break;
    }
    return results;
  }

  function removePageScripts() {
    // Retain scripts in DOM to prevent duplicate execution upon revisits
  }

  async function fetchPageDoc(url, signal) {
    if (signal?.aborted) throw abortError();
    if (root.htmlMemoryCache[url]) return root.htmlMemoryCache[url];
    if (!pendingDocs.has(url)) {
      const epoch = cacheEpoch;
      const promise = (async () => {
        const res = await fetch(url + '?v=' + Date.now(), { signal: cacheController.signal });
        if (!res.ok) throw new Error(`Page request failed: ${res.status}`);
        const html = await res.text();
        if (epoch !== cacheEpoch) throw abortError();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        root.htmlMemoryCache[url] = doc;
        return doc;
      })();
      pendingDocs.set(url, promise);
      promise.then(() => { if (pendingDocs.get(url) === promise) pendingDocs.delete(url); }, () => { if (pendingDocs.get(url) === promise) pendingDocs.delete(url); });
    }
    return waitFor(pendingDocs.get(url), signal);
  }

  async function fetchTemplates(signal) {
    if (signal?.aborted) throw abortError();
    if (Array.isArray(cacheTemplatesList)) return cacheTemplatesList;
    if (!pendingTemplatesPromise) {
      const epoch = cacheEpoch;
      const revision = templateEpoch;
      const promise = (async () => {
        const res = await fetch('/api/get-templates', { signal: cacheController.signal });
        if (!res.ok) throw new Error('Catalog request failed');
        const templates = await res.json();
        if (epoch !== cacheEpoch || revision !== templateEpoch) throw abortError();
        if (!Array.isArray(templates)) throw new Error('Invalid catalog response');
        cacheTemplatesList = templates;
        return templates;
      })();
      pendingTemplatesPromise = promise;
      const done = () => { if (pendingTemplatesPromise === promise) pendingTemplatesPromise = null; };
      promise.then(done, done);
    }
    return waitFor(pendingTemplatesPromise, signal);
  }

  function fetchProjectDetail(projectId, signal) {
    return root.ProjectStore.fetchProjectDetail(projectId, { signal });
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
    cacheEpoch++;
    templateEpoch++;
    cacheController.abort();
    cacheController = new AbortController();
    root.htmlMemoryCache = {};
    cacheTemplatesList = null;
    pendingTemplatesPromise = null;
    pendingDocs.clear();
    // CSS/JS registrations survive session cache invalidation.
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
