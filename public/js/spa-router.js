(function () {
  'use strict';
  const AUTH_KEY = 'spa_logged_in';
  let currentPage = 'landing';
  let isTransitioning = false;
  let dashboardTopbar = null;
  let landingHTML = '';
  let landingClass = '';

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
      return data;
    },
    logout: async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) { }
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.location.hash = '';
      if (window.parent && window.parent !== window) {
        window.parent.history.replaceState(null, '', '/');
      }
      navigate('landing', { force: true });
    },
    fetchUser: async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return null;
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          return null;
        }
        const data = await res.json();
        return data.user;
      } catch (e) {
        return null;
      }
    },
    fetchProjects: async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return [];
      try {
        const res = await fetch('/api/projects', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.projects || [];
      } catch (e) {
        return [];
      }
    }
  };

  function maskClose() {
    return new Promise(resolve => {
      const easing = 'cubic-bezier(0.76,0,0.24,1)';
      maskTop().style.transition = `top 0.4s ${easing}`;
      maskBot().style.transition = `bottom 0.4s ${easing}`;
      maskTop().style.top = '0';
      maskBot().style.bottom = '0';
      setTimeout(resolve, 420);
    });
  }

  function maskOpen() {
    return new Promise(resolve => {
      const easing = 'cubic-bezier(0.16,1,0.3,1)';
      maskTop().style.transition = `top 0.5s ${easing}`;
      maskBot().style.transition = `bottom 0.5s ${easing}`;
      maskTop().style.top = '-50%';
      maskBot().style.bottom = '-50%';
      setTimeout(resolve, 520);
    });
  }

  function showDashTopbar() {
    const nav = landingNav();
    if (nav) {
      nav.style.transition = 'transform 0.45s cubic-bezier(0.76,0,0.24,1)';
      nav.style.transform = 'translateY(-100%)';
    }
    if (dashboardTopbar) {
      dashboardTopbar.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s';
      dashboardTopbar.style.transform = 'translateY(0)';
    }
  }

  function showLandingNav() {
    const nav = landingNav();
    if (nav) {
      nav.style.transition = 'transform 0.45s cubic-bezier(0.16,1,0.3,1)';
      nav.style.transform = 'translateY(0)';
    }
    if (dashboardTopbar) {
      dashboardTopbar.style.transition = 'transform 0.45s cubic-bezier(0.76,0,0.24,1)';
      dashboardTopbar.style.transform = 'translateY(-100%)';
    }
  }

  const loadedCSS = new Set();
  const injectedScripts = [];

  function injectCSS(href) {
    if (loadedCSS.has(href)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    link.dataset.spaSheet = '1';
    document.head.appendChild(link);
    loadedCSS.add(href);
  }

  function removePageCSS(nextCSS = []) {
    document.querySelectorAll('link[data-spa-sheet]').forEach(el => {
      const href = new URL(el.href).pathname;
      if (!nextCSS.includes(href)) {
        el.remove();
        loadedCSS.delete(href);
      }
    });
  }

  function injectScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.dataset.spaScript = '1';
      if (src.includes('landing-animation.js')) {
        s.type = 'module';
      }
      s.src = src + '?t=' + Date.now();
      s.onload = resolve;
      s.onerror = resolve;
      document.body.appendChild(s);
      injectedScripts.push(s);
    });
  }

  function removePageScripts() {
    injectedScripts.forEach(s => s.remove());
    injectedScripts.length = 0;
  }

  async function fetchPageDoc(url) {
    const res = await fetch(url);
    const html = await res.text();
    return new DOMParser().parseFromString(html, 'text/html');
  }

  function initMain() {
    const m = document.getElementById('page-main');
    m.innerHTML = '';
    return m;
  }

  async function renderLogin(showRegister) {
    const doc = await fetchPageDoc('/html/login.html');
    const m = initMain();
    m.className = 'spa-login-wrap';
    const container = doc.querySelector('.auth-container');
    const toast = doc.querySelector('.toast');
    if (container) m.appendChild(container.cloneNode(true));
    if (toast) m.appendChild(toast.cloneNode(true));
    initLoginLogic(showRegister);
  }

  function initLoginLogic(showRegister) {
    window.switchTab = function (tab) {
      const lp = document.getElementById('panel-login');
      const rp = document.getElementById('panel-register');
      const tl = document.getElementById('tab-login');
      const tr = document.getElementById('tab-register');
      if (!lp || !rp) return;
      if (tab === 'login') {
        tl.classList.add('active'); tr.classList.remove('active');
        lp.style.display = 'block'; rp.style.display = 'none';
      } else {
        tr.classList.add('active'); tl.classList.remove('active');
        rp.style.display = 'block'; lp.style.display = 'none';
      }
    };
    if (showRegister) setTimeout(() => window.switchTab('register'), 50);

    window.togglePwd = function (id, btn) {
      const inp = document.getElementById(id);
      if (!inp) return;
      if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '\uD83D\uDE48'; }
      else { inp.type = 'password'; btn.textContent = '\uD83D\uDC41'; }
    };

    function showToast(msg) {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg; t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2800);
    }

    window.handleLogin = async function () {
      const email = document.getElementById('login-email')?.value;
      const pass = document.getElementById('login-password')?.value;
      if (!email || !pass) { showToast('\u8ACB\u586B\u5BEB\u96FB\u5B50\u4FE1\u7B4E\u548C\u5BC6\u78BC'); return; }
      showToast('\u767B\u5165\u4E2D\u2026');
      try {
        await spaAuth.login(email, pass);
        navigate('dashboard');
      } catch (error) {
        showToast(error.message);
      }
    };

    window.handleRegister = function () {
      showToast('\u5EFA\u7ACB\u5E33\u865F\u4E2D\u2026');
      setTimeout(() => { spaAuth.login(); navigate('dashboard'); }, 1200);
    };

    window.handleSocialLogin = function (provider) {
      showToast(`\u4F7F\u7528 ${provider} \u767B\u5165\u4E2D\u2026`);
      setTimeout(() => { spaAuth.login(); navigate('dashboard'); }, 1200);
    };
  }

  async function renderDashboard() {
    const doc = await fetchPageDoc('/html/dashboard.html');
    const m = initMain();
    m.className = 'spa-dash-wrap';
    const mainContent = doc.querySelector('main.dash-main');
    if (mainContent) m.appendChild(mainContent.cloneNode(true));

    if (!dashboardTopbar) {
      const topbar = doc.querySelector('header.topbar');
      if (topbar) {
        dashboardTopbar = topbar.cloneNode(true);
        dashboardTopbar.id = 'spa-topbar';
        dashboardTopbar.style.transform = 'translateY(-100%)';
        document.body.appendChild(dashboardTopbar);
      }
      const up = doc.querySelector('.user-panel');
      if (up) {
        const upEl = up.cloneNode(true);
        upEl.id = 'spa-user-panel';
        document.body.appendChild(upEl);
      }
    }

    initDashboardLogic();
  }

  async function initDashboardLogic() {
    refillRail();

    const avatar = document.getElementById('top-avatar') || dashboardTopbar?.querySelector('#top-avatar');
    const panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel');

    const user = await spaAuth.fetchUser();
    if (user && panel) {
      const name = user.name || 'User';
      const initial = name.charAt(0).toUpperCase();
      if (avatar) avatar.textContent = initial;

      const upAvatar = panel.querySelector('.up-avatar');
      if (upAvatar) upAvatar.textContent = initial;

      const upName = panel.querySelector('.up-name');
      if (upName) upName.textContent = name;

      const upEmail = panel.querySelector('.up-email');
      if (upEmail) upEmail.textContent = user.email;
    } else if (!user && spaAuth.isLoggedIn()) {
      spaAuth.logout();
    }

    if (avatar && panel) {
      avatar.onclick = e => { e.stopPropagation(); panel.classList.toggle('active'); };
      document.addEventListener('click', () => panel.classList.remove('active'), { once: false });
    }

    const logout = panel?.querySelector('.up-logout');
    if (logout) logout.addEventListener('click', e => { e.preventDefault(); spaAuth.logout(); });

    const projectsGrid = document.getElementById('projects-grid');
    if (projectsGrid) {
      projectsGrid.innerHTML = '<div style="color:var(--text-mid); text-align:center; padding: 40px; grid-column: 1/-1;">載入中...</div>';
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
          card.innerHTML = `
            <div class="project-thumb">🎬</div>
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
      }
    }

    bindTopbarLinks();
  }

  async function renderGenerate() {
    const doc = await fetchPageDoc('/html/generate.html');
    const m = initMain();
    m.className = 'spa-gen-wrap';
    doc.querySelectorAll('.phase').forEach(p => m.appendChild(p.cloneNode(true)));
  }

  function bindTopbarLinks() {
    const tb = document.getElementById('spa-topbar') || dashboardTopbar;
    if (!tb) return;
    tb.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      let page = null;
      if (href.includes('generate.html')) page = 'generate';
      else if (href.includes('dashboard.html')) page = 'dashboard';
      if (page) {
        const newA = a.cloneNode(true);
        newA.addEventListener('click', e => { e.preventDefault(); navigate(page); });
        a.parentNode.replaceChild(newA, a);
      }
    });
  }

  function refillRail() {
    ['rail-top', 'rail-bottom'].forEach(id => {
      const r = document.getElementById(id);
      if (!r) return;
      r.innerHTML = '';
      const n = Math.ceil(window.innerWidth / 28);
      for (let i = 0; i < n; i++) {
        const h = document.createElement('div');
        h.className = 'rail-hole';
        r.appendChild(h);
      }
    });
  }

  const pageDefs = {
    landing: {
      css: [],
      js: ['/js/landing-animation.js', '/js/landing.js'],
      render: () => {
        const m = document.getElementById('page-main');
        m.className = landingClass;
        m.innerHTML = landingHTML;
        interceptCTAs();
      }
    },
    login: { css: ['/css/auth.css'], js: [], render: (o) => renderLogin(o?.showRegister) },
    register: { css: ['/css/auth.css'], js: [], render: () => renderLogin(true) },
    dashboard: { css: ['/css/dashboard.css'], js: ['/js/generate-prefill-path.js'], render: () => renderDashboard() },
    generate: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/math-curve-loader.js', '/js/token-manager.js', '/js/generate.js'],
      render: () => renderGenerate()
    },
  };

  function updateTopbarActive(page) {
    if (!dashboardTopbar) return;
    const links = dashboardTopbar.querySelectorAll('.top-link');
    links.forEach(l => l.classList.remove('active'));
    if (page === 'dashboard' && links[0]) links[0].classList.add('active');
    if (page === 'generate' && links[1]) links[1].classList.add('active');
  }

  async function navigate(page, opts = {}) {
    if (isTransitioning) return;
    if (page === currentPage && !opts.force) return;
    isTransitioning = true;

    if (window._landingKill) {
      window._landingKill();
      window._landingKill = null;
    }

    await maskClose();
    window.scrollTo(0, 0);

    const def = pageDefs[page];
    const nextCSS = def ? def.css : [];
    removePageCSS(nextCSS);
    removePageScripts();

    if (def) {
      def.css.forEach(href => injectCSS(href));
      await def.render(opts);
      for (const src of def.js) await injectScript(src);
    }

    if (page === 'dashboard' || page === 'generate') {
      showDashTopbar();
      updateTopbarActive(page);
    } else if (page === 'landing' || page === 'login' || page === 'register') {
      showLandingNav();
    }

    if (dashboardTopbar) {
      dashboardTopbar.style.display = (page === 'dashboard' || page === 'generate') ? '' : 'none';
    }
    const userPanel = document.getElementById('spa-user-panel');
    if (userPanel) {
      userPanel.style.display = (page === 'dashboard' || page === 'generate') ? '' : 'none';
      if (page !== 'dashboard' && page !== 'generate') userPanel.classList.remove('active');
    }

    if (!opts.noHistory) {
      const hash = page === 'landing' ? '' : `#/${page}`;
      history.pushState({ page }, '', window.location.pathname + window.location.search + hash);
    }

    if (window.parent && window.parent !== window) {
      const parentPath = page === 'landing' ? '/' : `/${page}`;
      window.parent.history.replaceState(null, '', parentPath);
    }

    currentPage = page;
    isTransitioning = false;

    await maskOpen();
  }

  window.addEventListener('popstate', e => {
    const page = e.state?.page || 'landing';
    navigate(page, { noHistory: true, force: true });
  });

  function interceptCTAs() {
    document.querySelectorAll('[data-navigate]').forEach(el => {
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
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const m = document.getElementById('page-main');
    if (m) {
      landingHTML = m.innerHTML;
      landingClass = m.className;
    }

    if (maskTop() && maskBot()) {
      maskTop().style.transition = 'none';
      maskBot().style.transition = 'none';
      maskTop().style.top = '0';
      maskBot().style.bottom = '0';
    }

    let initialPage = 'landing';
    const hash = window.location.hash;
    if (hash && hash.startsWith('#/')) {
      const route = hash.substring(2);
      if (pageDefs[route]) {
        initialPage = route;
      }
    }
    history.replaceState({ page: initialPage }, '', window.location.pathname + window.location.search + hash);

    if (initialPage !== 'landing') {
      navigate(initialPage, { noHistory: true, force: true });
    } else {
      interceptCTAs();
      for (const src of pageDefs.landing.js) {
        await injectScript(src);
      }
      await maskOpen();
    }
  });

  window.spaNavigate = navigate;

})();