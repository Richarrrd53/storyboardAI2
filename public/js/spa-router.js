(function () {
  'use strict';
  const AUTH_KEY = 'spa_logged_in';
  let currentPage = 'landing';
  let isTransitioning = false;
  let currentNavController = null;
  let navSeq = 0;
  let targetPage = null;
  let dashboardTopbar = null;
  let mobileBottomNav = null;
  let landingHTML = '';
  let landingClass = '';

  // In-memory cache for API requests
  let cacheProjectsList = null;
  const cacheProjectDetails = {};
  const pendingDeletions = {};
  let activeDisplayProjectsFn = null;
  let activeDisplayHistoryFn = null;

  window.clearSpaCache = () => {
    cacheProjectsList = null;
    for (const key in cacheProjectDetails) {
      delete cacheProjectDetails[key];
    }
    for (const key in pendingDeletions) {
      clearTimeout(pendingDeletions[key].deleteTimeout);
      clearTimeout(pendingDeletions[key].transitionTimeout);
      delete pendingDeletions[key];
    }
    console.log("🧹 SPA client-side API cache cleared.");
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
          localStorage.removeItem(AUTH_TOKEN_KEY);
          return null;
        }

        const data = await res.json();
        return data.user;
      } catch (e) {
        if (e.name === 'AbortError') return null;
        return null;
      }
    },
    fetchProjects: async (signal) => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return [];

      try {
        const res = await fetch('/api/projects?include_deleted=true', {
          signal,
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) return [];

        const data = await res.json();
        return data.projects || [];
      } catch (e) {
        if (e.name === 'AbortError') return [];
        return [];
      }
    }
  }
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

  function injectScript(src, signal) {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve(false);
        return;
      }

      const pathname = new URL(src, window.location.href).pathname;

      // 已經載入過的 script，絕對不要再次 append
      if (loadedScripts.has(pathname)) {
        resolve(true);
        return;
      }

      // 如果 DOM 裡已經有同路徑 script，也視為已載入
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

  function removePageScripts() {
    // injectedScripts.forEach(s => s.remove());
    // injectedScripts.length = 0;
  }

  async function fetchPageDoc(url, signal) {
    const cacheKey = 'spa_page_cache_' + url;
    const cachedHTML = localStorage.getItem(cacheKey);
    if (cachedHTML) {
      return new DOMParser().parseFromString(cachedHTML, 'text/html');
    }
    const res = await fetch(url, { signal });
    const html = await res.text();
    try {
      localStorage.setItem(cacheKey, html);
    } catch (e) {
      console.warn('Failed to cache page doc in localStorage:', e);
    }
    return new DOMParser().parseFromString(html, 'text/html');
  }

  function initMain() {
    const m = document.getElementById('page-main');
    m.innerHTML = '';
    return m;
  }

  async function deleteProject(p, card, refreshCallback) {
    const isConfirmed = await confirm('是否刪除此專案？', `「${p.title}」將從此頁面上刪除，刪除後的專案將會移至「資源回收桶」，您可以在「歷史專案」復原`, 'delete', '刪除', card);
    if (!isConfirmed) return;

    // Apply transition immediately to fade out the card
    card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.9) translateY(20px)';

    // Set timer to update cache list UI representation after transition completes
    const transitionTimeout = setTimeout(() => {
      refreshCallback();
    }, 400);

    // Set timer to call delete API after 5 seconds
    const deleteTimeout = setTimeout(async () => {
      try {
        const token = spaAuth.getToken();
        const res = await fetch(`/api/projects/${p.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          p.is_deleted = true;
          const updated = await spaAuth.fetchProjects();
          cacheProjectsList = updated;
          // Show Deleted notification
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

    // Show Undo notification
    window.showSpaToast(`專案「${p.title}」已移至資源回收桶。`, () => {
      const item = pendingDeletions[p.id];
      if (item) {
        clearTimeout(item.deleteTimeout);
        clearTimeout(item.transitionTimeout);
        delete pendingDeletions[p.id];
      }
      // Show Restored notification
      window.showSpaToast("專案已復原。");
      refreshCallback();
    }, 5000);
  }

  async function restoreProject(p, card, refreshCallback) {
    if (!confirm('確定要還原此專案嗎？')) return;

    // Optimistically update the status in local representation
    p.is_deleted = false;
    refreshCallback();

    // Show restored toast notification
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
      refreshCallback();
      alert('還原失敗，伺服器出錯');
    }
  }

  function showProjectOptionsDropdown(project, card, optionBtn, isHistoryPage, refreshCallback) {
    const overlay = document.createElement('div');
    overlay.className = 'options-dropdown-overlay';

    const menu = document.createElement('div');
    menu.className = 'options-dropdown-menu';

    // Determine actions html
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

    // Calculate position relative to optionBtn
    const rect = optionBtn.getBoundingClientRect();
    const menuWidth = 170; // Matches CSS width
    const gap = 16; // Spacing gap

    // Top aligns with the button top
    let top = rect.top + window.scrollY;

    // Primary position: right side
    let left = rect.right + window.scrollX + gap;
    let transformOrigin = 'top left';

    // Check if it overflows the right edge of the screen
    if (left + menuWidth > window.innerWidth) {
      // Fallback: left side
      left = rect.left + window.scrollX - menuWidth - gap;
      transformOrigin = 'top right';
    }

    // Safety margins for small screen sizes
    left = Math.max(10, Math.min(left, window.innerWidth - menuWidth - 10));

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.transformOrigin = transformOrigin;

    // Trigger transition
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

    // Close when overlay is clicked
    overlay.addEventListener('click', closeDropdown);

    // Option: Open
    const openBtn = menu.querySelector('#opt-open');
    if (openBtn) {
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        navigate('project', { id: project.id });
      });
    }

    // Option: Delete
    const deleteBtn = menu.querySelector('#opt-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        deleteProject(project, card, refreshCallback);
      });
    }

    // Option: Restore
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
    if (!dashboardTopbar) {
      const doc = await fetchPageDoc('/html/dashboard.html', signal);
      if (signal?.aborted) return;

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

    await initSharedLayoutLogic(signal);
  }

  async function initSharedLayoutLogic(signal) {
    updateRailHoles();

    const avatar = document.getElementById('top-avatar') || dashboardTopbar?.querySelector('#top-avatar');
    const panel = document.getElementById('spa-user-panel');

    const user = await spaAuth.fetchUser(signal);
    if (signal?.aborted) return;

    if (user && panel) {
      const name = user.name || 'User';
      const initial = name.charAt(0).toUpperCase();
      const userImage = user.image
        ? `<img src="${user.image}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" alt="">`
        : initial;

      if (avatar) avatar.innerHTML = userImage;

      const upAvatar = panel.querySelector('.up-avatar');
      if (upAvatar) upAvatar.innerHTML = userImage;

      const upName = panel.querySelector('.up-name');
      if (upName) upName.textContent = name;

      const upPlan = panel.querySelector('.up-plan');
      const plans = { free: 'Free', pro: 'Pro', promax: 'Pro Max' };

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
      avatar.onclick = e => {
        e.stopPropagation();
        panel.classList.toggle('active');
      };
    }

    const logout = panel?.querySelector('.up-logout');
    if (logout) {
      logout.addEventListener('click', e => {
        e.preventDefault();
        spaAuth.logout();
      });
    }

    bindTopbarLinks();
  }

  async function renderDashboard(signal) {
    const doc = await fetchPageDoc('/html/dashboard.html', signal);
    if (signal?.aborted) return;

    const m = initMain();
    m.className = 'spa-dash-wrap';

    const mainContent = doc.querySelector('main.dash-main');
    if (mainContent) m.appendChild(mainContent.cloneNode(true));

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    const projectsGrid = document.getElementById('projects-grid');
    if (projectsGrid) {
      function displayProjects(projects) {
        activeDisplayProjectsFn = displayProjects;
        // Filter out soft-deleted and pending-deleted projects for the Dashboard
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
            
            // Navigate only if the click is not on the options button
            card.onclick = (e) => {
              if (e.target.closest('.project-option-btn')) return;
              navigate('project', { id: p.id });
            };

            const thumbContent = p.cover
              ? `<img src="${p.cover}" style="width: 100%; height: 100%; object-fit: cover;" alt="${p.title}">`
              : `🎬`;

            card.innerHTML = `
              <div class="card-strip">
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
                <div class="strip-hole"></div>
                <button class="project-option-btn" title="專案選項" data-id="${p.id}">⋯</button>
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

            const optionBtn = card.querySelector('.project-option-btn');
            if (optionBtn) {
              optionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showProjectOptionsDropdown(p, card, optionBtn, false, () => displayProjects(cacheProjectsList));
              });
            }

            projectsGrid.appendChild(card);
          });
        }
      }

      if (cacheProjectsList) {
        displayProjects(cacheProjectsList);
        fetchProjectsBackground();
      } else {
        projectsGrid.innerHTML = '<div style="color:var(--text-mid); text-align:center; padding: 40px; grid-column: 1/-1;">載入中...</div>';
        await fetchProjectsNetwork();
      }

      async function fetchProjectsNetwork() {
        const projects = await spaAuth.fetchProjects(signal);
        if (signal?.aborted) return;
        cacheProjectsList = projects;
        displayProjects(projects);
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
          }
        } catch (e) {}
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

  async function renderGenerate(signal) {
    const doc = await fetchPageDoc('/html/generate.html', signal);
    if (signal?.aborted) return;

    const m = initMain();
    m.className = 'spa-gen-wrap';

    doc.querySelectorAll('.phase').forEach(p => {
      m.appendChild(p.cloneNode(true));
    });

    await ensureSharedLayout(signal);
  }

  async function renderHistory(signal) {
    const doc = await fetchPageDoc('/html/history.html', signal);
    if (signal?.aborted) return;

    const m = initMain();
    m.className = 'spa-history-wrap';

    const mainContent = doc.querySelector('main.history-main');
    if (mainContent) m.appendChild(mainContent.cloneNode(true));

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    const projectsGrid = document.getElementById('projects-grid');
    if (!projectsGrid) return;

    function displayHistory(projects) {
      activeDisplayHistoryFn = displayHistory;

      // Filter out projects that are currently pending deletion
      const visibleProjects = (projects || []).filter(p => !pendingDeletions[p.id]);

      projectsGrid.innerHTML = '';
      if (!visibleProjects || visibleProjects.length === 0) {
        projectsGrid.innerHTML = `
          <div class="projects-empty">
            <h3>目前尚無歷史專案</h3>
            <p>你可以先新增專案，系統會自動保留歷史紀錄。</p>
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
          }

          const thumbContent = p.cover
            ? `<img src="${p.cover}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;" alt="${p.title}">`
            : `🎬`;

          card.innerHTML = `
            <div class="card-strip">
              <div class="strip-hole"></div>
              <div class="strip-hole"></div>
              <div class="strip-hole"></div>
              <button class="project-option-btn" title="專案選項" data-id="${p.id}">⋯</button>
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

          const optionBtn = card.querySelector('.project-option-btn');
          if (optionBtn) {
            optionBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              showProjectOptionsDropdown(p, card, optionBtn, true, () => displayHistory(cacheProjectsList));
            });
          }

          projectsGrid.appendChild(card);
        });
      }
    }

    if (cacheProjectsList) {
      displayHistory(cacheProjectsList);
      fetchHistoryBackground();
    } else {
      projectsGrid.innerHTML = '<div style="color:var(--text-mid); text-align:center; padding: 40px; grid-column: 1/-1;">載入中...</div>';
      await fetchHistoryNetwork();
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

    const mainContent = doc.querySelector('main.template-main');
    if (mainContent) m.appendChild(mainContent.cloneNode(true));

    await ensureSharedLayout(signal);
    if (signal?.aborted) return;

    const catsEl = document.getElementById('template-cats');
    const gridEl = document.getElementById('template-grid');
    const detailEl = document.getElementById('template-detail');

    if (!catsEl || !gridEl || !detailEl) return;

    gridEl.innerHTML = '<div style="color:var(--text-mid); text-align:center; padding: 40px; grid-column: 1/-1;">載入中...</div>';

    let templates = [];
    try {
      const res = await fetch('/api/get-templates', { signal });
      if (res.ok) templates = await res.json();
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

    const groups = {};
    templates.forEach(t => {
      const k = t.category || t.type || '未分類';
      if (!groups[k]) groups[k] = [];
      groups[k].push(t);
    });

    const categories = Object.keys(groups);

    catsEl.innerHTML = categories
      .map((c, i) => `<button class="tpl-cat ${i === 0 ? 'active' : ''}" data-cat="${c}">${c} <span class="count">(${groups[c].length})</span></button>`)
      .join('');

    function renderGridFor(cat) {
      const items = groups[cat] || [];

      gridEl.innerHTML = items.map(it => `
        <div class="template-card" data-id="${it.id || ''}" data-title="${(it.title || '無標題').replace(/"/g, '')}">
          <div class="template-thumb">${it.thumbnail ? `<img src="${it.thumbnail}" alt="${it.title}">` : '📄'}</div>
          <div class="template-info">
            <div class="template-title">${it.title || '無標題'}</div>
          </div>
        </div>
      `).join('');

      gridEl.querySelectorAll('.template-card').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          const t = items.find(x => (x.id || '') === id) || items.find(x => (x.title || '') === el.dataset.title);
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

      if (signal?.aborted) return;

      let tableRowsHtml = '';
      processedShots.forEach(s => {
        tableRowsHtml += `
          <tr>
            <td class="camera-cell">${s.order}</td>
            <td class="img-cell">
              ${s.imageUrl ? `<img src="${s.imageUrl}" onerror="this.outerHTML='<div class=\\'placeholder\\'>IMAGE FAILED</div>'">` : `<div class="placeholder">NO IMAGE</div>`}
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
              ${s.imageUrl ? `<img src="${s.imageUrl}" loading="lazy" onerror="this.outerHTML='<div class=\\'film-placeholder\\'>NO IMAGE</div>'">` : `<div class="film-placeholder">NO IMAGE</div>`}
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
    }

    if (cacheProjectDetails[projectId]) {
      await renderWithProjectData(cacheProjectDetails[projectId]);
      fetchProjectBackground();
    } else {
      m.innerHTML = '<div style="padding:24px;">載入中…</div>';
      await fetchProjectNetwork();
    }

    async function fetchProjectNetwork() {
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          signal,
          headers: { 'Authorization': `Bearer ${spaAuth.getToken()}` }
        });

        if (signal?.aborted) return;

        if (!res.ok) {
          m.innerHTML = `<div class="projects-empty"><h3>無法取得專案（${res.status}）</h3></div>`;
          return;
        }

        const data = await res.json();
        const p = data?.project;

        if (!p) throw new Error('伺服器回傳資料缺少 project 欄位');

        cacheProjectDetails[projectId] = p;
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
        else if (href.includes('history.html')) page = 'history';
        else if (href.includes('template.html')) page = 'template';
        else if (href.includes('analysis.html')) page = 'analysis';

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

    generate: {
      css: ['/css/dashboard.css', '/css/generate.css', '/css/math-curve-loader.css'],
      js: ['/js/math-curve-loader.js', '/js/token-manager.js', '/js/prompt-translate.js', '/js/generate.js'],
      render: (o, signal) => renderGenerate(signal)
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

  function isDashboardPage(page) {
    return ['dashboard', 'generate', 'history', 'template', 'project', 'analysis'].includes(page);
  }

  function getHashForPage(page, opts = {}) {
    if (page === 'landing') return '';
    if (page === 'project' && opts?.id) return `#/project/${opts.id}`;
    return `#/${page}`;
  }

  function parseRouteFromHash(hash) {
    if (!hash || !hash.startsWith('#/')) {
      return { page: 'landing', opts: {} };
    }

    const route = hash.substring(2);

    const projectMatch = route.match(/^project\/(.+)$/);
    if (projectMatch) {
      return {
        page: 'project',
        opts: { id: decodeURIComponent(projectMatch[1]) }
      };
    }

    if (pageDefs[route]) {
      return {
        page: route,
        opts: {}
      };
    }

    return { page: 'landing', opts: {} };
  }

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
    const activePage = targetPage || currentPage;

    if (page === activePage && !opts.force) return;

    // Flush any pending deletions immediately when switching pages
    for (const id in pendingDeletions) {
      const item = pendingDeletions[id];
      if (item) {
        clearTimeout(item.deleteTimeout);
        clearTimeout(item.transitionTimeout);
        
        // Immediately make the DELETE request in the background
        const token = spaAuth.getToken();
        fetch(`/api/projects/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(err => console.error('Immediate delete failed on navigate', err));
        
        item.project.is_deleted = true;
        delete pendingDeletions[id];
      }
    }
    const toast = document.getElementById('global-toast');
    if (toast) {
      toast.classList.remove('show');
    }

    targetPage = page;

    const mySeq = ++navSeq;

    if (currentNavController) {
      currentNavController.abort();
    }

    const controller = new AbortController();
    currentNavController = controller;
    const signal = controller.signal;

    isTransitioning = true;

    // Transition loader timer
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
        if (overlay) {
          overlay.classList.remove('active');
        }
        stopTextCycling();
        setTimeout(() => {
          if (!loaderShowing && window.spaTransitionLoader) {
            window.spaTransitionLoader.stop();
          }
        }, 450);
      }
    }

    signal.addEventListener('abort', cleanupTransitionLoader);

    // Start transition loader timeout (immediately for landing page & login/register pages, 1s for other pages)
    const delay = ['landing', 'login', 'register'].includes(page) ? 0 : 1000;
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
    }, delay);

    try {
      if (window._landingKill) {
        window._landingKill();
        window._landingKill = null;
      }

      if (isDashboardPage(page)) {
        updateTopbarActive(page);
        showDashTopbar();
      }

      const top = maskTop();
      const bot = maskBot();

      const maskAlreadyClosed =
        top &&
        bot &&
        (top.style.top === '0px' || top.style.top === '0') &&
        (bot.style.bottom === '0px' || bot.style.bottom === '0');

      if (!maskAlreadyClosed) {
        await maskClose();
      }

      if (signal.aborted || mySeq !== navSeq) return;

      const def = pageDefs[page];
      const nextCSS = def ? def.css : [];

      removePageCSS(nextCSS);
      removePageScripts();

      if (def) {
        def.css.forEach(href => injectCSS(href));

        await def.render(opts, signal);
        if (signal.aborted || mySeq !== navSeq) return;

        const jsToLoad = Array.isArray(def.js) ? def.js : [];
        for (const src of jsToLoad) {
          await injectScript(src, signal);
          if (signal.aborted || mySeq !== navSeq) return;
        }
      }

      if (page === 'generate' && typeof window.initGeneratePage === 'function') {
        window.initGeneratePage();
      } else if (page === 'landing' && typeof window.initLandingPage === 'function') {
        window.initLandingPage();
      } else if (page === 'template' && typeof window.initTemplatePage === 'function') {
        window.initTemplatePage();
      }

      if (isDashboardPage(page)) {
        showDashTopbar();
        updateTopbarActive(page);
      } else if (page === 'landing' || page === 'login' || page === 'register') {
        showLandingNav();
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

      window.scrollTo(0, 0);

      await new Promise(resolve => setTimeout(resolve, 80));

      cleanupTransitionLoader();

      if (signal.aborted || mySeq !== navSeq) return;

      await maskOpen();

      if (signal.aborted || mySeq !== navSeq) return;

      currentPage = page;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[spa navigate error]', e);
      }
    } finally {
      cleanupTransitionLoader();
      if (currentNavController === controller) {
        currentNavController = null;
        isTransitioning = false;
        targetPage = null;
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
    initTransitionLoader();
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
      for (const src of pageDefs.landing.js) {
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

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const particleCount = 45;
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

    const startedAt = performance.now();
    let animId = null;

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

    window.spaTransitionLoader = {
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

  window.spaNavigate = navigate;

})();