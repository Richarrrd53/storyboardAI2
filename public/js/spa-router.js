(function () {
  'use strict';
  const AUTH_KEY = 'spa_logged_in';
  let currentPage = 'landing';
  let isTransitioning = false;
  let dashboardTopbar = null;
  let mobileBottomNav = null;
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
    if (mobileBottomNav) {
      mobileBottomNav.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1) 0.05s';
      mobileBottomNav.style.transform = 'translateY(0)';
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
      dashboardTopbar.style.transform = 'translateY(-130%)';
    }
    if (mobileBottomNav) {
      mobileBottomNav.style.transition = 'transform 0.45s cubic-bezier(0.76,0,0.24,1)';
      mobileBottomNav.style.transform = 'translateY(130%)';
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

  const loadedScripts = new Set();

  function injectScript(src) {
    return new Promise((resolve) => {
      const pathname = new URL(src, window.location.href).pathname;
      
      if (loadedScripts.has(pathname)) {
        resolve();
        return;
      }
      
      const s = document.createElement('script');
      s.dataset.spaScript = '1';
      if (src.includes('landing-animation.js')) {
        s.type = 'module';
      }
      s.src = src; 
      s.onload = () => {
        loadedScripts.add(pathname);
        resolve();
      };
      s.onerror = resolve;
      document.body.appendChild(s);
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

    window.handleRegister = function () {
      showToast('註冊功能尚未推出！');
    };

    window.handleSocialLogin = function (provider) {
      showToast(`\u4F7F\u7528 ${provider} \u767B\u5165\u4E2D\u2026`);
      setTimeout(() => { spaAuth.login(); navigate('dashboard'); }, 1200);
    };
  }

  async function ensureSharedLayout() {
    if (!dashboardTopbar) {
      const doc = await fetchPageDoc('/html/dashboard.html');
      const topbar = doc.querySelector('header.topbar');
      if (topbar) {
        dashboardTopbar = topbar.cloneNode(true);
        dashboardTopbar.id = 'spa-topbar';
        dashboardTopbar.style.transform = 'translateY(-130%)';
        document.body.appendChild(dashboardTopbar);
      }

      const mobNav = doc.querySelector('.mobile-bottom-nav');
      if (mobNav) {
        mobileBottomNav = mobNav.cloneNode(true);
        mobileBottomNav.id = 'spa-mobile-nav';
        mobileBottomNav.style.transform = 'translateY(130%)';
        document.body.appendChild(mobileBottomNav);
      }

      const up = doc.querySelector('.user-panel');
      if (up) {
        const upEl = up.cloneNode(true);
        upEl.id = 'spa-user-panel';
        document.body.appendChild(upEl);
      }
    }

    await initSharedLayoutLogic();
  }

  async function initSharedLayoutLogic() {
    updateRailHoles();

    const avatar = document.getElementById('top-avatar') || dashboardTopbar?.querySelector('#top-avatar');
    const panel = document.getElementById('spa-user-panel');

    const user = await spaAuth.fetchUser();
    if (user && panel) {
      const name = user.name || 'User';
      const initial = name.charAt(0).toUpperCase();
      const userImage = (user.image) ? `<img src="${user.image}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" alt="" >`: initial;
      if (avatar) avatar.innerHTML = userImage;

      const upAvatar = panel.querySelector('.up-avatar');
      if (upAvatar) upAvatar.innerHTML = userImage;

      const upName = panel.querySelector('.up-name');
      if (upName) upName.textContent = name;

      const upPlan = panel.querySelector('.up-plan');
      const plan = user.plan || 'free';
      const plans = {"free": "Free", "pro": "Pro", "promax": "Pro Max"};
      if (upPlan) {
        
        upPlan.classList.add(user.plan);
        upPlan.textContent = plans[user.plan];
      }

      const upEmail = panel.querySelector('.up-email');
      if (upEmail) upEmail.textContent = user.email;
    } else if (!user && spaAuth.isLoggedIn()) {
      spaAuth.logout();
    }

    if (avatar && panel) {
      avatar.onclick = e => { e.stopPropagation(); panel.classList.toggle('active'); };
    }

    const logout = panel?.querySelector('.up-logout');
    if (logout) logout.addEventListener('click', e => { e.preventDefault(); spaAuth.logout(); });

    bindTopbarLinks();
  }

  async function renderDashboard() {
    const doc = await fetchPageDoc('/html/dashboard.html');
    const m = initMain();
    m.className = 'spa-dash-wrap';
    const mainContent = doc.querySelector('main.dash-main');
    if (mainContent) m.appendChild(mainContent.cloneNode(true));

    await ensureSharedLayout();

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
          const thumbContent = p.cover 
            ? `<img src="${p.cover}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;" alt="${p.title}">`
            : `🎬`;
          card.innerHTML = `
            <div class="card-strip">
              <div class="strip-hole"></div>
              <div class="strip-hole"></div>
              <div class="strip-hole"></div>
            </div>
            <div class="project-thumb">${thumbContent}</div>
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
          projectsGrid.appendChild(card);
        });
      }
    }
  }

  async function initDashboardLogic() {
    updateRailHoles();

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
          const thumbContent = p.cover 
            ? `<img src="${p.cover}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;" alt="${p.title}">`
            : `🎬`;
          card.innerHTML = `
            <div class="project-thumb">${thumbContent}</div>
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

    await ensureSharedLayout();
  }

  function bindTopbarLinks() {
    const containers = [
      document.getElementById('spa-topbar') || dashboardTopbar,
      document.getElementById('spa-mobile-nav') || mobileBottomNav
    ];

    containers.forEach(container => {
      if (!container) return;
      container.querySelectorAll('a[href]').forEach(a => {
        if (a.dataset.spaBound) return;

        const href = a.getAttribute('href') || '';
        let page = null;
        if (href.includes('generate.html')) page = 'generate';
        else if (href.includes('dashboard.html')) page = 'dashboard';
        
        if (page) {
          a.dataset.spaBound = 'true';
          a.addEventListener('click', e => {
            e.preventDefault();
            navigate(page);
          });
        }
      });
    });
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
        const m = document.getElementById('page-main');
        m.className = landingClass;
        m.innerHTML = landingHTML;
        interceptCTAs();
      }
    },
    login: { css: ['/css/auth.css'], js: ['/js/auth.js'], render: (o) => renderLogin(o?.showRegister) },
    register: { css: ['/css/auth.css'], js: ['/js/auth.js'], render: () => renderLogin(true) },
    dashboard: { css: ['/css/dashboard.css'], js: ['/js/generate-prefill-path.js'], render: () => renderDashboard() },
    generate: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/math-curve-loader.js', '/js/token-manager.js', '/js/generate.js'],
      render: () => renderGenerate()
    },
  };

  function updateTopbarActive(page) {
    const containers = [dashboardTopbar, mobileBottomNav];
    
    containers.forEach(container => {
      if (!container) return;
      const links = container.querySelectorAll('.top-link');
      if (links.length === 0) return;
      
      links.forEach(l => {
        l.classList.remove('active');
        const img = l.querySelector('img');
        if (img && img.src) {
          img.src = img.src.replace("focus", "blur");
        }
      });
      
      if (page === 'dashboard' && links[0]) links[0].classList.add('active');
      if (page === 'generate' && links[1]) links[1].classList.add('active');
      if (page === 'history' && links[2]) links[2].classList.add('active');
      if (page === 'template' && links[3]) links[3].classList.add('active');
      if (page === 'analysis' && links[4]) links[4].classList.add('active');
      
      links.forEach(l => {
        if (l.classList.contains('active')){
          const img = l.querySelector('img');
          if (img && img.src) {
            img.src = img.src.replace("blur", "focus");
          }
        }
      });
    });
  }

  async function navigate(page, opts = {}) {
    if (isTransitioning) return;
    if (page === currentPage && !opts.force) return;
    isTransitioning = true;

    if (window._landingKill) {
      window._landingKill();
      window._landingKill = null;
    }

    if (page === 'dashboard' || page === 'generate') {
      updateTopbarActive(page);
      showDashTopbar();
    } 

    await maskClose();

    const def = pageDefs[page];
    const nextCSS = def ? def.css : [];
    removePageCSS(nextCSS);
    removePageScripts();

    if (def) {
      def.css.forEach(href => injectCSS(href));
      await def.render(opts);
      for (const src of def.js) await injectScript(src);
    }
    if (page === 'generate' && typeof window.initGeneratePage === 'function') {
        window.initGeneratePage();
    } 
    else if (page === 'landing' && typeof window.initLandingPage === 'function') {
        window.initLandingPage();
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
    if (mobileBottomNav) {
      mobileBottomNav.style.display = (page === 'dashboard' || page === 'generate') ? '' : 'none';
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
    window.scrollTo(0, 0);
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

    window.addEventListener('resize', updateRailHoles);
    updateRailHoles();
    
    let v = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--v', `${v}px`);

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

  const bgTop = document.getElementById("bg-top");
  const railTop = document.getElementById("rail-top");
  const railBottom = document.getElementById("rail-bottom");

  railTop.style.top = bgTop.offsetHeight * (5/7) + "px";
  railBottom.style.bottom = bgTop.offsetHeight * (5/7) + "px";

  window.spaNavigate = navigate;

})();