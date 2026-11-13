(function () {
  'use strict';
  const assets = window.PageAssetLoader;
  let landing = null;
  function captureLanding() {
    const main = document.getElementById('page-main');
    landing = { html: main.innerHTML, className: main.className };
    getOrCreateContentContainer();
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
    window.TransitionLoader.ensureInnerLoader(m);
    return content;
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


  const views = {
    login: ['/html/login.html', 'auth-main spa-login-wrap', 'AuthPage'],
    register: ['/html/login.html', 'auth-main spa-login-wrap', 'AuthPage'],
    dashboard: ['/html/dashboard.html', 'spa-dash-wrap', 'DashboardPage'],
    projects: ['/html/projects.html', 'spa-projects-wrap', 'ProjectsPage'],
    history: ['/html/history.html', 'spa-history-wrap', 'HistoryPage'],
    template: ['/html/template.html', 'spa-template-wrap', 'TemplatesPage'],
    generate: ['/html/generate.html', 'spa-gen-wrap'],
    discovery: ['/html/discovery.html', 'spa-discovery-wrap'],
    'discovery-settings': ['/html/discovery-settings.html', 'spa-discovery-settings-wrap'],
    project: [null, 'spa-project-wrap', 'ProjectDetailPage']
  };
  const shellClasses = {
    landing: 'page-shell page-landing',
    dashboard: 'page-shell page-dashboard dash-main home-main',
    projects: 'page-shell page-projects dash-main projects-main',
    template: 'page-shell page-template dash-main template-main',
    discovery: 'page-shell page-discovery dash-main',
    'discovery-settings': 'page-shell page-discovery-settings dash-main',
    generate: 'page-shell page-generate gen-main',
    history: 'page-shell page-projects dash-main history-main',
    login: 'page-shell page-auth auth-main', register: 'page-shell page-auth auth-main',
    project: 'page-shell page-project-detail dash-main'
  };
  function prepare(page) {
    const main = document.getElementById('page-main');
    if (!main) throw new Error('Missing page-main');
    main.className = shellClasses[page];
    main.style.padding = '';
  }
  async function mount({ page, signal, navigate, route = {}, scripts = [], onTiming = () => {} }) {
    if (signal.aborted) return null;
    window.DialogService?.setPageSignal(signal);
    if (page === 'landing') {
      const root = initMain();
      root.className = landing.className || 'landing-content';
      root.innerHTML = landing.html;
      return null;
    }
    const [url, className, component] = views[page];
    const doc = url ? await assets.fetchPageDoc(url, signal) : null;
    if (signal.aborted) return null;
    const root = initMain();
    if (doc) cloneMainContent(doc, root);
    root.className = className;
    if (['generate', 'template', 'discovery', 'discovery-settings'].includes(page)) document.getElementById('page-main').style.padding = '0';
    if (!['login', 'register'].includes(page)) {
      const shellStart = performance.now();
      await window.AppShell.init({ navigate, spaAuth: window.spaAuth, signal, fetchDoc: assets.fetchPageDoc });
      onTiming('shell', performance.now() - shellStart);
      if (signal.aborted) return null;
      assets.injectCSS('/css/generate.css');
      assets.injectCSS('/css/math-curve-loader.css');
      window.QuickCompose.mount();
    }
    // Dependencies are ready before page initialization, including Generate and template deep links.
    const loaded = await assets.injectScripts(scripts, signal);
    if (loaded.some(value => !value)) {
      if (signal.aborted) return null;
      throw new Error('Page scripts failed to load: ' + page);
    }
    if (signal.aborted) return null;
    const context = { root, signal, navigate, route };
    if (component) {
      if (page === 'register') context.route = { ...route, showRegister: true };
      if (page === 'project') Object.assign(context, { id: route.id, opts: route });
      return window[component].mount(context);
    }
    if (page === 'generate') {
      window.preselectedTemplateId = route.templateId || null;
      window.CreationController.syncRoute('generate', route);
      if (!window.TemplateWorkflow) await assets.injectScripts(['/js/features/template-workflow.js?v=20261006-3'], signal);
      const generated = await assets.injectScripts(['/js/generate.js?v=20261006-4'], signal);
      if (generated.some(value => !value) && !signal.aborted) throw new Error('Generate script failed to load');
      if (signal.aborted) return null;
      return window.initGeneratePage({ ...route, signal });
    }
    if (page === 'discovery' || page === 'discovery-settings') {
      const instance = page === 'discovery' ? window.initDiscoveryPage(context) : window.initDiscoverySettingsPage(context);
      const routes = { '/discovery':'discovery', '/discovery/settings':'discovery-settings', '/template':'template', '/dashboard':'dashboard' };
      const onLink = event => {
        if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest?.('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute?.('download')) return;
        const destination = routes[link.getAttribute('href')];
        if (destination && typeof navigate === 'function') { event.preventDefault(); navigate(destination); }
      };
      root.addEventListener('click', onLink);
      let disposed = false;
      function unmount() {
        if (disposed) return;disposed = true;
        root.removeEventListener('click', onLink);signal.removeEventListener('abort',unmount);
        instance?.unmount?.();
      }
      signal.addEventListener('abort',unmount,{once:true});
      if (signal.aborted) unmount();
      return {unmount};
    }
    return null;
  }
  window.PageHost = { preload: (page, signal) => views[page]?.[0] ? assets.fetchPageDoc(views[page][0], signal) : Promise.resolve(), mount, prepare, captureLanding, getContent: getOrCreateContentContainer };
})();
