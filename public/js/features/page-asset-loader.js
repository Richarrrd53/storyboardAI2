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

  // In-memory HTML document cache (bounded LRU)
  const MAX_HTML_CACHE_ENTRIES = 6;
  const htmlCacheOrder = [];
  if (!root.htmlMemoryCache) {
    root.htmlMemoryCache = {};
  }
  const ASSET_VERSION = root.__STORYBOARD_ASSET_VERSION__ || '20261126';

  // Prefetch Queue & Hover Intent state
  const MAX_PREFETCH_CONCURRENCY = 2;
  const HOVER_INTENT_MS = 140;
  let activePrefetches = 0;
  const prefetchQueue = []; // { key, priority, run, epoch }
  const prefetchQueuedKeys = new Set();
  const hoverIntentTimers = new Map(); // intentKey -> { timer, key }
  const prefetchStats = {
    queued: 0,
    executed: 0,
    cancelled: 0,
    deduped: 0,
    deferredByMotion: 0
  };
  let motionResumeBound = false;

  function ensureMotionResumeHook() {
    if (motionResumeBound || !root.MotionCoordinator?.subscribe) return;
    motionResumeBound = true;
    root.MotionCoordinator.subscribe((summary) => {
      if (summary && summary.count === 0 && prefetchQueue.length > 0) {
        drainPrefetchQueue();
      }
    });
  }

  function drainPrefetchQueue() {
    ensureMotionResumeHook();
    if (prefetchQueue.length === 0) return;
    if (activePrefetches >= MAX_PREFETCH_CONCURRENCY) return;
    if (root.MotionCoordinator?.isActive?.()) {
      prefetchStats.deferredByMotion++;
      return;
    }

    // Sort by priority (lower number = higher priority)
    prefetchQueue.sort((a, b) => a.priority - b.priority);

    while (activePrefetches < MAX_PREFETCH_CONCURRENCY && prefetchQueue.length > 0) {
      if (root.MotionCoordinator?.isActive?.()) {
        prefetchStats.deferredByMotion++;
        break;
      }
      const task = prefetchQueue.shift();
      prefetchQueuedKeys.delete(task.key);
      if (task.epoch !== cacheEpoch) {
        prefetchStats.cancelled++;
        continue;
      }
      activePrefetches++;
      prefetchStats.executed++;
      Promise.resolve()
        .then(() => task.run())
        .catch(() => {})
        .finally(() => {
          activePrefetches = Math.max(0, activePrefetches - 1);
          drainPrefetchQueue();
        });
    }
  }

  function enqueuePrefetch(key, run, priority = 3) {
    if (prefetchQueuedKeys.has(key)) {
      prefetchStats.deduped++;
      return;
    }
    prefetchQueuedKeys.add(key);
    prefetchStats.queued++;
    prefetchQueue.push({ key, priority, run, epoch: cacheEpoch });
    drainPrefetchQueue();
  }

  function cancelPrefetchIntent(intentKey) {
    if (!intentKey) return false;
    const entry = hoverIntentTimers.get(intentKey);
    if (!entry) return false;
    clearTimeout(entry.timer);
    hoverIntentTimers.delete(intentKey);
    prefetchStats.cancelled++;
    // Also remove if still waiting in queue
    const idx = prefetchQueue.findIndex(t => t.key === entry.key);
    if (idx !== -1) {
      prefetchQueue.splice(idx, 1);
      prefetchQueuedKeys.delete(entry.key);
    }
    return true;
  }

  function pruneParsedDoc(doc) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return doc;
    try {
      // Strip scripts/styles/meta/title from cached template doc to reduce retained DOM nodes
      doc.querySelectorAll('script, style, link, meta, title').forEach(el => el.remove?.());
    } catch (_) {}
    return doc;
  }

  function storeHtmlCache(url, doc) {
    root.htmlMemoryCache[url] = doc;
    const idx = htmlCacheOrder.indexOf(url);
    if (idx !== -1) htmlCacheOrder.splice(idx, 1);
    htmlCacheOrder.push(url);
    while (htmlCacheOrder.length > MAX_HTML_CACHE_ENTRIES) {
      const oldest = htmlCacheOrder.shift();
      if (oldest && oldest !== url) {
        delete root.htmlMemoryCache[oldest];
      }
    }
  }

  function touchHtmlCache(url) {
    const idx = htmlCacheOrder.indexOf(url);
    if (idx !== -1) {
      htmlCacheOrder.splice(idx, 1);
      htmlCacheOrder.push(url);
    }
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

  let indexCache = null, pendingIndex = null;
  const templateDetails = new Map();
  let pendingTemplatesPromise = null;
  let cacheTemplatesList = null;
  let cacheEpoch = 0;
  let templateEpoch = 0;
  let cacheController = new AbortController();
  const pendingScripts = new Map();
  const pendingCSS = new Map();
  const cancelCSS = new Map();
  const pendingDocs = new Map();
  // Legacy readers/writers share this exact value; invalidation also retires pending requests.
  Object.defineProperty(root, 'cacheTemplatesList', {
    configurable: true,
    get: () => cacheTemplatesList,
    set(value) { cacheTemplatesList = value; templateEpoch++; pendingTemplatesPromise = null; indexCache = null; pendingIndex = null; templateDetails.clear(); }
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
      const finish = loaded => {
        link.onload = null;
        link.onerror = null;
        if (loaded) loadedCSS.add(fullUrl);
        else link.remove();
        resolve();
      };
      link.onload = () => finish(true);
      // A failed imported font can fire error even though the stylesheet itself
      // parsed successfully. Keep that sheet; only retire an absent CSS resource.
      link.onerror = () => finish(!!link.sheet);
      cancelCSS.set(fullUrl, () => finish(false));
      document.head.appendChild(link);
    });
    pendingCSS.set(fullUrl, promise);
    promise.finally(() => {
      if (pendingCSS.get(fullUrl) === promise) {
        pendingCSS.delete(fullUrl);
        cancelCSS.delete(fullUrl);
      }
    });
    return promise;
  }

  function removePageCSS(nextCSS = []) {
    const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'http://localhost';
    const normalizedNext = nextCSS.map(href => new URL(href, origin).pathname);
    document.querySelectorAll('link[data-spa-sheet]').forEach(el => {
      const href = new URL(el.href, origin).pathname;
      if (!normalizedNext.includes(href)) {
        // Removing a loading link may never fire load/error. Retire its promise
        // now so a rapid revisit can start a fresh stylesheet request.
        cancelCSS.get(href)?.();
        pendingCSS.delete(href);
        cancelCSS.delete(href);
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
    if (root.htmlMemoryCache[url]) {
      touchHtmlCache(url);
      return root.htmlMemoryCache[url];
    }
    if (!pendingDocs.has(url)) {
      const epoch = cacheEpoch;
      const promise = (async () => {
        const sep = url.includes('?') ? '&' : '?';
        const res = await fetch(`${url}${sep}v=${ASSET_VERSION}`, { signal: cacheController.signal });
        if (!res.ok) throw new Error(`Page request failed: ${res.status}`);
        const html = await res.text();
        if (epoch !== cacheEpoch) throw abortError();
        const doc = pruneParsedDoc(new DOMParser().parseFromString(html, 'text/html'));
        storeHtmlCache(url, doc);
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

  function fetchTemplateIndex(signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    if (Array.isArray(cacheTemplatesList)) return Promise.resolve(cacheTemplatesList);
    if (indexCache?.expires > Date.now()) return Promise.resolve(indexCache.items);
    if (!pendingIndex) {
      const epoch = templateEpoch;
      const promise = (async () => {
        const items = []; let total = Infinity;
        while (items.length < total) {
          const response = await fetch(`/api/get-templates?view=index&limit=100&offset=${items.length}`, { signal: cacheController.signal });
          if (!response.ok) throw new Error('Catalog request failed');
          const page = await response.json();
          if (!Array.isArray(page.items) || !Number.isFinite(page.total)) throw new Error('Invalid catalog response');
          items.push(...page.items); total = page.total;
          if (!page.items.length) break;
        }
        if (epoch !== templateEpoch) throw abortError();
        indexCache = { items, expires: Date.now() + 60000 }; return items;
      })();
      pendingIndex = promise;
      const done = () => { if (pendingIndex === promise) pendingIndex = null; };
      promise.then(done, done);
    }
    return waitFor(pendingIndex, signal);
  }
  async function fetchTemplateDetail(id, signal) {
    const cached = templateDetails.get(id);
    if (cached?.expires > Date.now()) return cached.item;
    const epoch = templateEpoch;
    const response = await fetch('/api/templates/' + encodeURIComponent(id), { signal });
    if (!response.ok) throw new Error('Template request failed');
    const item = await response.json();
    if (epoch !== templateEpoch || signal?.aborted) throw abortError();
    if (templateDetails.size >= 20) templateDetails.delete(templateDetails.keys().next().value);
    templateDetails.set(id, { item, expires: Date.now() + 60000 }); return item;
  }
  function fetchProjectDetail(projectId, signal, options = {}) {
    return root.ProjectStore.fetchProjectDetail(projectId, { signal, ...options });
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
    else if (page === 'discovery-settings') htmlUrl = '/html/discovery-settings.html';

    // Lightweight HTML template prefetch remains immediate (cached after first fetch)
    if (htmlUrl && !root.htmlMemoryCache[htmlUrl]) {
      fetchPageDoc(htmlUrl).catch(() => {});
    }

    const auth = root.spaAuth;
    if (auth && typeof auth.isLoggedIn === 'function' && auth.isLoggedIn()) {
      if (page === 'dashboard' || page === 'projects' || page === 'history') {
        if (typeof auth.fetchProjects === 'function' && !root.ProjectStore?.getProjects?.()) {
          enqueuePrefetch('api:projects', () => auth.fetchProjects(), 2);
        }
      } else if (page === 'template') {
        if (!Array.isArray(cacheTemplatesList) && !(indexCache?.expires > Date.now())) {
          enqueuePrefetch('api:templates:index', () => fetchTemplateIndex(), 3);
        }
      } else if (page === 'project' && opts.id) {
        const pid = String(opts.id);
        // Skip if already cached or in-flight
        if (root.ProjectStore?.getProjectDetail?.(pid) || root.ProjectStore?.inFlightDetailsPromises?.[pid]) {
          prefetchStats.deduped++;
          return;
        }
        const taskKey = `api:project:${pid}`;
        const scheduleDetail = () => {
          enqueuePrefetch(taskKey, () => fetchProjectDetail(pid, undefined, { prefetch: true, source: 'prefetch' }), 3);
        };
        if (opts.intentKey) {
          cancelPrefetchIntent(opts.intentKey);
          const timer = setTimeout(() => {
            hoverIntentTimers.delete(opts.intentKey);
            scheduleDetail();
          }, HOVER_INTENT_MS);
          hoverIntentTimers.set(opts.intentKey, { timer, key: taskKey });
        } else {
          scheduleDetail();
        }
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
    htmlCacheOrder.length = 0;
    cacheTemplatesList = null;
    pendingTemplatesPromise = null;
    indexCache = null; pendingIndex = null; templateDetails.clear();
    pendingDocs.clear();
    // Cancel pending hover intents and queued prefetches on session reset
    for (const entry of hoverIntentTimers.values()) {
      clearTimeout(entry.timer);
    }
    hoverIntentTimers.clear();
    prefetchQueue.length = 0;
    prefetchQueuedKeys.clear();
    // CSS/JS registrations survive session cache invalidation.
  }

  function getPrefetchStats() {
    return {
      ...prefetchStats,
      activePrefetches,
      queuedLength: prefetchQueue.length,
      pendingHoverIntents: hoverIntentTimers.size,
      htmlCacheEntries: htmlCacheOrder.length
    };
  }

  const PageAssetLoader = {
    injectCSS,
    removePageCSS,
    injectScript,
    injectScripts,
    removePageScripts,
    fetchPageDoc,
    prefetchPage,
    cancelPrefetchIntent,
    getPrefetchStats,
    prefetchAuthResources,
    fetchTemplates,
    fetchTemplateIndex, fetchTemplateDetail,
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
