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
          card.onclick = () => navigate('project', { id: p.id });
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

  async function renderHistory() {
    const doc = await fetchPageDoc('/html/history.html');
    const m = initMain();
    m.className = 'spa-history-wrap';
    const mainContent = doc.querySelector('main.history-main');
    if (mainContent) {
      m.appendChild(mainContent.cloneNode(true));
    }

    await ensureSharedLayout();

    const projectsGrid = document.getElementById('projects-grid');
    if (projectsGrid) {
      projectsGrid.innerHTML = '<div style="color:var(--text-mid); text-align:center; padding: 40px; grid-column: 1/-1;">載入中...</div>';
      const projects = await spaAuth.fetchProjects();
      projectsGrid.innerHTML = '';

      if (!projects || projects.length === 0) {
        projectsGrid.innerHTML = `
          <div class="projects-empty">
            <h3>目前尚無歷史專案</h3>
            <p>你可以先新增專案，系統會自動保留歷史紀錄。</p>
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
              <div class="project-date">專案風格：${p.style || '未指定'}</div>
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

  async function renderTemplate() {
    const doc = await fetchPageDoc('/html/template.html');
    const m = initMain();
    m.className = 'spa-template-wrap';
    const mainContent = doc.querySelector('main.template-main');
    if (mainContent) m.appendChild(mainContent.cloneNode(true));

    await ensureSharedLayout();

    if (typeof initTemplatePage === 'function') {
      initTemplatePage();
    }

    const catsEl = document.getElementById('template-cats');
    const gridEl = document.getElementById('template-grid');
    const detailEl = document.getElementById('template-detail');

    gridEl.innerHTML = '<div style="color:var(--text-mid); text-align:center; padding: 40px; grid-column: 1/-1;">載入中...</div>';

    // 取得模板資料
    let templates = [];
    try {
      const res = await fetch('/api/get-templates');
      if (res.ok) templates = await res.json();
    } catch (e) { templates = []; }

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

    // group by category/type
    const groups = {};
    templates.forEach(t => {
      const k = t.category || t.type || '未分類';
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    });

    // render categories
    const categories = Object.keys(groups);
    catsEl.innerHTML = categories.map((c, i) => `<button class="tpl-cat ${i===0? 'active':''}" data-cat="${c}">${c} <span class="count">(${groups[c].length})</span></button>`).join('');

    function renderGridFor(cat) {
      const items = groups[cat] || [];
      gridEl.innerHTML = items.map(it => `
        <div class="template-card" data-id="${it.id || ''}" data-title="${(it.title||'無標題').replace(/"/g,'')}">
          <div class="template-thumb">${it.thumbnail? `<img src="${it.thumbnail}" alt="${it.title}">` : '📄'}</div>
          <div class="template-info"><div class="template-title">${it.title || '無標題'}</div></div>
        </div>
      `).join('');

      // attach click handlers
      gridEl.querySelectorAll('.template-card').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          const t = items.find(x => (x.id||'') === id) || items.find(x => (x.title||'') === el.dataset.title);
          if (!t) return;
          detailEl.innerHTML = `
            <h3>${t.title || '無標題'}</h3>
            <p><strong>分類：</strong>${t.category || t.type || '未分類'}</p>
            <div class="template-body">${t.content ? (typeof t.content === 'string' ? t.content : JSON.stringify(t.content)) : '<em>無內容預覽</em>'}</div>
          `;
          detailEl.scrollIntoView({ behavior: 'smooth' });
        });
      });
    }

    // initial render
    renderGridFor(categories[0]);

    catsEl.querySelectorAll('.tpl-cat').forEach(b => {
      b.addEventListener('click', () => {
        catsEl.querySelectorAll('.tpl-cat').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderGridFor(b.dataset.cat);
      });
    });
  }

  async function renderProject(idOrOpts) {
    const id = typeof idOrOpts === 'string' ? idOrOpts : (idOrOpts?.id || null);
    let projectId = id;
    if (!projectId) {
      const hash = window.location.hash || '';
      const m = hash.match(/^#\/project\/(.+)$/);
      if (m) projectId = m[1];
    }

    const mEl = initMain();
    mEl.className = 'spa-project-wrap';

    if (!projectId) {
      mEl.innerHTML = `<div class="projects-empty"><h3>找不到專案 ID</h3></div>`;
      return;
    }

    mEl.innerHTML = '<div style="padding:24px;">載入中…</div>';

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        headers: { 'Authorization': `Bearer ${spaAuth.getToken()}` }
      });
      if (!res.ok) {
        mEl.innerHTML = `<div class="projects-empty"><h3>無法取得專案（${res.status}）</h3></div>`;
        return;
      }
      const data = await res.json();
      const p = data?.project;
      if (!p) {
        throw new Error('伺服器回傳資料缺少 project 欄位');
      }

      const shots = Array.isArray(p.shots) ? p.shots : (p.shots ? [p.shots] : []);
      // ✅ 修改點 1：將 safeTranslate 與 safeFormat 預設補上 async 處理
      const safeTranslate = typeof window.translatePromptText === 'function' ? window.translatePromptText : async (v) => String(v || '');
      const safeFormat = typeof window.formatPromptText === 'function' ? window.formatPromptText : async (v) => String(v || '');

      // ✅ 修改點 2：改用 await Promise.all 確保所有翻譯都跑完再產生 HTML
      const shotsHtmlArray = await Promise.all(shots.map(async (s, index) => {
        if (!s || typeof s !== 'object') return '';
        const payload = s.payload || {};
        
        // 取得翻譯
        const shotPrompt = await safeTranslate(payload.shotPrompt || payload.prompt || '');
        const finalPrompt = await safeTranslate(payload.finalPrompt || '');
        
        // 🔽 增加這兩行：在這裡先 await 等待 format 執行完畢 🔽
        const formattedShotPrompt = await safeFormat(shotPrompt);
        const formattedFinalPrompt = await safeFormat(finalPrompt);
        // 🔼 -------------------------------------------------- 🔼
        
        const emotion = payload.emotion || s.emotion || '';
        const imageUrl = payload.image || '';

        return `
          <div class="shot-card">
            <div class="shot-card-header">
              <div class="shot-card-title-wrapper">
                <div class="shot-ordinal">鏡頭 ${s.order ?? index + 1}</div>
                <div class="shot-title">${s.title || '未命名鏡頭'}</div>
              </div>
              <div class="shot-tags">
                <span class="shot-chip">時長：${s.duration || '未設定'}</span>
                <span class="shot-chip">相機：${s.camera || '未設定'}</span>
                ${emotion ? `<span class="shot-chip">情緒：${emotion}</span>` : ''}
              </div>
            </div>
            <div class="shot-card-body">
              ${shotPrompt ? `<div class="shot-section"><span class="shot-section-label">鏡頭說明</span><p class="shot-section-text">${formattedShotPrompt}</p></div>` : ''}
              ${finalPrompt ? `<div class="shot-section"><span class="shot-section-label">最終提示</span><p class="shot-section-text">${formattedFinalPrompt}</p></div>` : ''}
              ${imageUrl ? `<div class="shot-image-wrapper"><img class="shot-image" src="${imageUrl}" alt="${s.title || 'shot image'}"></div>` : ''}
            </div>
            <details class="shot-more">
              <summary>查看原始資料</summary>
              <pre class="shot-payload">${JSON.stringify(payload, null, 2)}</pre>
            </details>
          </div>
        `;
      }));

      // ✅ 將陣列合併回字串
      const shotsHtml = shotsHtmlArray.join('');

      mEl.innerHTML = `
        <div class="project-detail">
          <div class="project-summary">
            <div>
              <h2>${p.title}</h2>
              <div class="project-meta-row">作者: ${p.author?.name || '未知'} • 建立於 ${new Date(p.createAt).toLocaleString('zh-TW')}</div>
            </div>
            <div class="project-attributes">
              <span class="project-attribute">風格：${p.style || '未指定'}</span>
              <span class="project-attribute">比例：${p.ratio || '未指定'}</span>
              <span class="project-attribute">專案 ID：${p.shortId || p.id}</span>
            </div>
          </div>
          <div class="project-cover">
            ${p.cover ? `<img src="${p.cover}" alt="cover">` : `<div class="project-cover-empty">尚無封面</div>`}
          </div>
          <section class="project-shots">
            <div class="project-shots-headline">
              <h3>鏡頭列表</h3>
              <span class="shots-count">共 ${p.shots?.length || 0} 鏡頭</span>
            </div>
            ${shotsHtml || '<div class="projects-empty"><p>尚無鏡頭資料</p></div>'}
          </section>
        </div>
      `;
    } catch (e) {
      console.error('renderProject error', e, { projectId, data: e?.data });
      mEl.innerHTML = `<div class="projects-empty"><h3>讀取專案發生錯誤</h3><p>${e.message || '未知錯誤'}</p></div>`;
    }
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
        else if (href.includes('template.html')) page = 'template';
        else if (href.includes('history.html')) page = 'history';

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
      js: ['/js/math-curve-loader.js', '/js/token-manager.js', '/js/prompt-translate.js', '/js/generate.js'],
      render: () => renderGenerate()
    },
    template: {
      css: ['/css/dashboard.css', '/css/template.css'],
      js: ['/js/generate-prefill-path.js', '/js/template.js'],
      render: () => renderTemplate()
    },
    project: {
      css: ['/css/dashboard.css'],
      js: [],
      render: (opts) => renderProject(opts?.id || opts)
    },
    history: {
      css: ['/css/dashboard.css'],
      js: ['/js/generate-prefill-path.js'],
      render: () => renderHistory()
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

    if (page === 'dashboard' || page === 'generate' || page === 'history' || page === 'template') {
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
      const jsToLoad = Array.isArray(def.js) ? def.js : [];
      for (const src of jsToLoad) await injectScript(src);
    }

    if (page === 'generate' && typeof window.initGeneratePage === 'function') {
        window.initGeneratePage();
    } 
    else if (page === 'landing' && typeof window.initLandingPage === 'function') {
        window.initLandingPage();
    }

    if (page === 'dashboard' || page === 'generate' || page === 'history' || page === 'template' || page === 'project') {
      showDashTopbar();
      updateTopbarActive(page);
    } else if (page === 'landing' || page === 'login' || page === 'register') {
      showLandingNav();
    }

    if (dashboardTopbar) {
      dashboardTopbar.style.display = (page === 'dashboard' || page === 'generate' || page === 'history' || page === 'template' || page === 'project') ? '' : 'none';
    }
    if (mobileBottomNav) {
      mobileBottomNav.style.display = (page === 'dashboard' || page === 'generate' || page === 'history' || page === 'template' || page === 'project') ? '' : 'none';
    }
    const userPanel = document.getElementById('spa-user-panel');
    if (userPanel) {
      userPanel.style.display = (page === 'dashboard' || page === 'generate' || page === 'history' || page === 'template' || page === 'project') ? '' : 'none';
      if (page !== 'dashboard' && page !== 'generate' && page !== 'history' && page !== 'template' && page !== 'project') userPanel.classList.remove('active');
    }

    if (!opts.noHistory) {
      let hash = '';
      if (page === 'landing') hash = '';
      else if (page === 'project' && opts && opts.id) hash = `#/project/${opts.id}`;
      else hash = `#/${page}`;
      history.pushState({ page, id: opts?.id }, '', window.location.pathname + window.location.search + hash);
    }

    if (window.parent && window.parent !== window) {
      const parentPath = page === 'landing' ? '/' : `/${page}`;
      window.parent.history.replaceState(null, '', parentPath);
    }

    window.scrollTo(0, 0);

    await new Promise(resolve => setTimeout(resolve, 80));

    await maskOpen();

    currentPage = page;
    isTransitioning = false;
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
    // Global error capture to help identify uncaught runtime errors in SPA
    window.addEventListener('error', (ev) => {
      try {
        const msg = ev?.error?.stack || `${ev.message} at ${ev.filename}:${ev.lineno}:${ev.colno}`;
        console.error('Captured error:', ev.error || ev.message, ev);
        // show a non-blocking overlay if possible
        try {
          const overlay = document.createElement('div');
          overlay.style.position = 'fixed';
          overlay.style.right = '12px';
          overlay.style.bottom = '12px';
          overlay.style.zIndex = '99999';
          overlay.style.maxWidth = '480px';
          overlay.style.padding = '10px 12px';
          overlay.style.background = 'rgba(0,0,0,0.85)';
          overlay.style.color = '#fff';
          overlay.style.fontSize = '12px';
          overlay.style.borderRadius = '6px';
          overlay.textContent = 'Error: ' + (ev?.message || 'see console');
          document.body.appendChild(overlay);
          setTimeout(() => overlay.remove(), 20000);
        } catch (e) {}
        // also show alert to prompt user to copy stack
        alert('發生未捕捉錯誤，請複製 Console 的錯誤訊息並貼給我。\n\n' + (msg ? msg.toString().slice(0,2000) : 'no stack'));
      } catch (e) { console.error('error handler failed', e); }
    });

    window.addEventListener('unhandledrejection', (ev) => {
      try {
        console.error('Unhandled rejection', ev.reason);
        alert('未處理的 Promise 錯誤：請貼上 Console 中的錯誤訊息。\n\n' + (ev.reason && ev.reason.stack ? ev.reason.stack : String(ev.reason)).slice(0,2000));
      } catch (e) { console.error('rejection handler failed', e); }
    });
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
      const landingJs = Array.isArray(pageDefs.landing?.js) ? pageDefs.landing.js : [];
      for (const src of landingJs) {
        await injectScript(src);
      }
      
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
      window.scrollTo(0, 0);
      
      updateRailHoles();
      
      if (typeof window.initLandingPage === 'function') {
        window.initLandingPage();
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      
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