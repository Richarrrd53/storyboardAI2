(function () {
  'use strict';
  let currentPage = 'landing';
  let currentOpts = {};
  let currentRouteMounted = true;
  let currentNavController = null;
  let navSeq = 0;
  let targetPage = null;
  let targetOpts = null;
  let activePageInstance = null;
  const assets = window.PageAssetLoader;
  const transition = window.NavigationTransition;
  const host = window.PageHost;
  const spaAuth = window.spaAuth;

  function updateRailHoles() {
    if (window.AppShell?.updateRailHoles) {
      window.AppShell.updateRailHoles();
    }
  }

  const pageDefs = {
    landing: {
      css: [],
      js: ['/js/landing-animation.js', '/js/landing.js'],
    },

    login: {
      css: ['/css/auth.css'],
      js: [],
    },

    register: {
      css: ['/css/auth.css'],
      js: [],
    },

    dashboard: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js'],
    },

    projects: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js'],
    },

    generate: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css', '/css/template.css', '/css/template-workflow.css?v=20261006-4'],
      js: ['/js/math-curve-loader.js', '/js/token-manager.js', '/js/prompt-translate.js'],
    },

    history: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/generate-prefill-path.js'],
    },

    template: {
      css: [
        '/css/dashboard.css',
        '/css/generate.css',
        '/css/math-curve-loader.css',
        '/css/template.css',
        '/css/template-editor.css?v=20261006-2',
        '/css/template-detail.css?v=20261014-2'
      ],
      js: ['/js/dynamic-mask.js', '/js/generate-prefill-path.js', '/js/template-timeline.js', '/js/template-editor.js?v=20261006-2', '/js/template.js'],
    },

    discovery: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/discovery.css', '/css/math-curve-loader.css'],
      js: ['/js/discovery.js'],
    },

    project: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css', '/css/project-detail.css'],
      js: ['/js/prompt-translate.js', '/js/project-detail.js'],
    }
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

  function getRouteUrl(page, opts = {}) {
    if (window.parent && window.parent !== window) return getPathForPage(page, opts);
    if (page === 'template') {
      const route = opts.templateId ? `/template/${encodeURIComponent(opts.templateId)}` : '/template';
      return route;
    }
    // Hash routes must not inherit a template pathname when leaving its detail.
    const path = window.location.pathname.startsWith('/template') ? '/' : window.location.pathname;
    return path + window.location.search + getHashForPage(page, opts);
  }

  function getHistoryHost() {
    return window.parent && window.parent !== window ? window.parent : window;
  }

  function getPathForPage(page, opts = {}) {
    if (page === 'landing') return '/';
    if (page === 'project' && opts.id) return `/project/${encodeURIComponent(opts.id)}`;
    if (page === 'template' && opts.templateId) return `/template/${encodeURIComponent(opts.templateId)}`;
    if (page === 'generate' && opts.templateId) return `/generate?templateId=${encodeURIComponent(opts.templateId)}`;
    return `/${page}`;
  }

  function parseRouteFromLocation(location) {
    if (location.hash?.startsWith('#/')) return parseRouteFromHash(location.hash);
    return parseRouteFromHash('#' + (location.pathname || '/') + (location.search || ''));
  }

  function routeHistoryState(page, opts = {}, browseState) {
    return { page, id: opts.id || null, templateId: opts.templateId || null,
      ...(page === 'template' ? { templateBrowse: browseState || opts.browseState || null,
        templateFromBrowse: !!opts.templateFromBrowse } : {}) };
  }

  function syncParentRoute(page, opts = {}) {
    if (!window.parent || window.parent === window) return;
    const host = getHistoryHost();
    host.history.replaceState(routeHistoryState(page, opts, host.history.state?.templateBrowse), '', getPathForPage(page, opts));
  }

  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (_) { return value; }
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

    const templateMatch = route.match(/^template\/([^/]+)\/?$/);
    if (templateMatch) {
      let templateId;
      try { templateId = decodeURIComponent(templateMatch[1]); } catch (_) { templateId = templateMatch[1]; }
      return { page: 'template', opts: { ...opts, templateId } };
    }

    const projectMatch = route.match(/^project\/(.+)$/);
    if (projectMatch) {
      return {
        page: 'project',
        opts: { ...opts, id: safeDecode(projectMatch[1]) }
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

  function unmountPage(instance) {
    if (!instance) return;
    try { instance.unmount(); }
    catch (error) { console.error('[spa-router] Error unmounting page:', error); }
  }

  function syncHistory(page, opts, browse) {
    const historyHost = getHistoryHost();
    if (!opts.noHistory) {
      if (browse) historyHost.history.replaceState({ ...historyHost.history.state, templateBrowse: browse }, '', historyHost.location.href);
      historyHost.history.pushState(routeHistoryState(page, opts, browse), '', getRouteUrl(page, opts));
    }
    syncParentRoute(page, opts);
  }

  let pageController = null;
  async function navigate(page, opts = {}) {
    // Guards run before acquiring navigation state or changing presentation.
    if (opts.openQC) return window.CreationController.openQuickCompose();
    if (!pageDefs[page]) return;
    if (isDashboardPage(page) && !spaAuth.isLoggedIn()) {
      window.showSpaToast('您尚未登入，請先登入以存取該頁面。');
      return navigate('login', { force: true });
    }
    const activePage = targetPage || currentPage;
    const activeOpts = targetPage ? targetOpts : currentOpts;
    if ((targetPage || currentRouteMounted) && !opts.force && page === activePage && opts.id === activeOpts?.id && opts.templateId === activeOpts?.templateId) return;

    const browse = activePageInstance?.getHistoryState?.();
    if (page === 'template' && opts.templateId && activePage === 'template' && !activeOpts?.templateId) opts = { ...opts, templateFromBrowse: true };
    const reuse = page === 'template' && currentPage === 'template' && activePageInstance?.updateRoute && !opts.force;
    const internal = isDashboardPage(currentPage) && isDashboardPage(page);
    const mySeq = ++navSeq;
    if (currentNavController) currentNavController.abort();
    const controller = new AbortController();
    currentNavController = controller;
    const signal = controller.signal;
    const stale = () => signal.aborted || mySeq !== navSeq;
    targetPage = page;
    targetOpts = opts;
    document.body.classList.add('is-navigating');
    let animation = null;
    let mounted = null;
    try {
      window.ProjectOptionMorph.close('navigation');
      window.ProjectsPage.closeTagModal({ immediate: true, restoreFocus: false });
      const cover = window.currentCoverTransition || window._activeProjectTransition;
      if (cover && !(page === 'project' && String(opts.id) === String(cover.projectId))) cover.cancel();
      syncHistory(page, opts, browse);
      if ((currentPage === 'login' || currentPage === 'register') && isDashboardPage(page) && localStorage.getItem('sidebar_projects_expanded') === 'true') window.AppShell.collapseProjectsGroup();

      // Let the current page leave before teardown/layout changes remove its visible content.
      animation = transition.create({ signal, internal, fromQC: !!opts.fromQC, routeUpdate: !!reuse });
      await animation.start();
      if (stale()) return;

      if (!reuse) {
        if (pageController) pageController.abort();
        pageController = controller;
        unmountPage(activePageInstance);
        activePageInstance = null;
        currentRouteMounted = false;
        window.ProjectDeleteQueue.flushAll();
        window.GlobalToast.hideSpaToast?.();
        host.prepare(page);
        if (currentPage === 'landing' && page !== 'landing') transition.leaveLanding();
        transition.setLayout(page, isDashboardPage(page), opts);
      }
      if (reuse) {
        await activePageInstance.updateRoute(opts);
      } else {
        const def = pageDefs[page];
        await Promise.all(def.css.map(href => assets.injectCSS(href)));
        if (stale()) return;
        assets.removePageCSS(def.css);
        assets.removePageScripts();
        if (window._landingKill) { window._landingKill(); window._landingKill = null; }
        mounted = await host.mount({ page, signal, navigate, route: opts, scripts: def.js });
        if (stale()) { unmountPage(mounted); mounted = null; return; }
        activePageInstance = mounted;
        if (page === 'landing') {
          interceptCTAs();
          assets.prefetchAuthResources();
          await assets.injectScripts(def.js, signal);
          if (stale()) return;
          window.initLandingLogic?.();
          window.initLandingPage?.();
          requestAnimationFrame(() => { if (!stale()) window.ScrollTrigger?.refresh(); });
        }
        transition.setLayout(page, isDashboardPage(page), opts);
      }
      if (stale()) return;
      await animation.complete();
      if (stale()) return;
      currentPage = page;
      currentOpts = opts;
      currentRouteMounted = true;
      window.DynamicMaskSystem?.refresh();
    } catch (error) {
      if (!stale()) {
        controller.abort();
        unmountPage(mounted);
        if (activePageInstance === mounted) activePageInstance = null;
        if (error.name !== 'AbortError') console.error('[spa navigate error]', error);
        animation?.cancel();
      }
    } finally {
      // A superseded navigation cannot clear the successor's loader, DOM or state.
      if (mySeq === navSeq) {
        animation?.cleanup();
        currentNavController = null;
        targetPage = null;
        targetOpts = null;
        document.body.classList.remove('is-navigating');
      }
    }
  }

  function handlePopState(e) {
    const statePage = e.state?.page;
    const stateId = e.state?.id;
    const templateId = e.state?.templateId;

    window.CreationController.syncRoute(statePage);

    if (statePage) {
      navigate(statePage, {
        id: stateId || undefined,
        templateId: templateId || undefined,
        browseState: e.state?.templateBrowse,
        templateFromBrowse: e.state?.templateFromBrowse,
        noHistory: true,
        noOpenQC: true
      });
      return;
    }

    const parsed = parseRouteFromLocation(e.currentTarget?.location || window.location);
    navigate(parsed.page, {
      ...parsed.opts,
      noHistory: true,
      noOpenQC: true
    });
  }
  window.addEventListener('popstate', handlePopState);
  // The parent owns history for the iframe shell; both entrypoints use this router.
  if (window.parent && window.parent !== window) {
    window.parent.addEventListener('popstate', handlePopState);
    window.addEventListener('pagehide', () => window.parent.removeEventListener('popstate', handlePopState));
    window.addEventListener('pageshow', () => window.parent.addEventListener('popstate', handlePopState));
  }

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
        assets.prefetchPage(page);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    transition.initialize();

    document.addEventListener('click', (e) => {
      const logo = e.target.closest('.brand-logo, .logo');
      if (logo) {
        if (!isDashboardPage(currentPage)) {
          e.preventDefault();
          navigate('landing');
        }
      }
    });

    host.captureLanding();

    window.addEventListener('resize', updateRailHoles);
    updateRailHoles();

    const { page: initialPage, opts: initialOpts = {} } = parseRouteFromLocation(getHistoryHost().location);

    const initialHistoryHost = getHistoryHost();
    const savedRouteState = initialHistoryHost.history.state;
    if (savedRouteState?.page === initialPage && savedRouteState.templateId === (initialOpts.templateId || null)) {
      initialOpts.browseState = savedRouteState.templateBrowse;
      initialOpts.templateFromBrowse = savedRouteState.templateFromBrowse;
    }

    initialHistoryHost.history.replaceState(
      routeHistoryState(initialPage, initialOpts, initialOpts.browseState),
      '',
      initialPage === 'template' ? getRouteUrl(initialPage, initialOpts) : initialHistoryHost.location.href
    );

    if (initialPage !== 'landing') {
      navigate(initialPage, {
        ...initialOpts,
        browseState: initialHistoryHost.history.state?.templateBrowse,
        noHistory: true,
        force: true
      });
    } else {
      interceptCTAs();
      assets.prefetchAuthResources();
      const initialSeq = navSeq;
      await assets.injectScripts(pageDefs.landing.js);
      if (initialSeq !== navSeq) return;
      
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
      window.scrollTo(0, 0);
      
      updateRailHoles();
      
      if (typeof window.initLandingPage === 'function') {
        window.initLandingPage();
      }

      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      
      await transition.open(() => initialSeq === navSeq);
      if (typeof window.ScrollTrigger !== 'undefined') {
        window.ScrollTrigger.refresh();
      }
    }
  });

  window.spaNavigate = navigate;
  window.navigate = navigate;

})();
