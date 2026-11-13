/**
 * StoryboardAI - Shared App Shell (P4-1)
 * Manages global application shell UI components:
 * - Sidebar (links, toggle, projects sub-list, rail holes)
 * - Topbar (avatar, title, visibility)
 * - UserPanel (profile, logout, gestures, desktop/mobile drawer)
 * - Mobile Bottom Navigation (track physics, active indicators, viewport adjustments)
 * - ProjectStore subscription for automatic sidebar project list synchronization
 */
(function () {
  'use strict';

  let shellOptions = {
    navigate: (page, opts) => window.spaNavigate?.(page, opts),
    spaAuth: null
  };

  let selectedRoute = null;
  let secondaryRoute = false;
  let dashboardSidebar = null;
  let dashboardTopbar = null;
  let dashboardUserPanel = null;
  let userPanelBackdrop = null;
  let mobileBottomNav = null;
  let burgerContainer = null;
  let sideLogo = null;

  let storeUnsubscribe = null;
  let lastRenderedProjectsJSON = null;
  let accountController = null;
  let depthTimer = null;
  let updateMobNavVisual = null;
  let isNavInteracting = false;
  let navSpringRaf = null;
  let selectorRaf = null;
  let cancelMobNavInteraction = null;
  let justHandledPointerNav = false;
  let cleanupMobNavGestures = null;
  let cacheMobNavMetrics = null;

  // Cleanup tracking
  const registeredListeners = [];
  function addTrackedListener(target, event, handler, options) {
    if (!target) return;
    target.addEventListener(event, handler, options);
    registeredListeners.push({ target, event, handler, options });
  }

  function isMobileView() {
    return window.matchMedia('(max-width: 768px), (max-width: 767px) and (orientation: portrait), (max-width: 480px)').matches;
  }

  function isDashboardPage(page) {
    return ['dashboard', 'projects', 'generate', 'history', 'template', 'discovery', 'discovery-settings', 'project', 'analysis'].includes(page);
  }

  function getBackgroundDepthTargets() {
    const targets = [];
    const pageMain = document.getElementById('page-main');
    if (pageMain) targets.push(pageMain);
    return targets;
  }

  function setBackgroundDepthProgress(progress) {
    clearTimeout(depthTimer);
    if (!progress) {
      getBackgroundDepthTargets().forEach(el => {el.classList.remove('bg-depth-scaled', 'bg-depth-animating'); ['transform','border-radius','overflow','transition'].forEach(name=>el.style.removeProperty(name));});
      return;
    }
    if (!isMobileView()) return;
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
    clearTimeout(depthTimer);
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
    depthTimer = setTimeout(() => {
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

  /* ==========================================================================
     DOM ENSURANCE: SIDEBAR, TOPBAR, USER PANEL, MOBILE NAV
     ========================================================================== */

  async function ensureShellDOM(signal, fetchDoc) {
    dashboardSidebar = dashboardSidebar || document.getElementById('dash-sidebar');
    dashboardTopbar = dashboardTopbar || document.getElementById('spa-topbar');

    if (!dashboardSidebar || !dashboardTopbar) {
      let doc = null;
      if (typeof fetchDoc === 'function') {
        doc = await fetchDoc('/html/dashboard.html', signal);
      } else if (typeof window.fetch === 'function') {
        try {
          const res = await fetch('/html/dashboard.html', { signal });
          if (res.ok) {
            const html = await res.text();
            const parser = new DOMParser();
            doc = parser.parseFromString(html, 'text/html');
          }
        } catch (_) {}
      }

      if (doc && !signal?.aborted) {
        const sidebar = doc.querySelector('header.sidebar') || doc.querySelector('aside.sidebar') || doc.querySelector('.sidebar');
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

      if (!dashboardSidebar && !document.getElementById('dash-sidebar')) {
        dashboardSidebar = document.createElement('aside');
        dashboardSidebar.className = 'sidebar';
        dashboardSidebar.id = 'dash-sidebar';
        dashboardSidebar.innerHTML = `
          <ul id="sidebar-projects-list"></ul>
          <div id="nav-projects-group"></div>
        `;
        document.body.appendChild(dashboardSidebar);
      }

      if (!dashboardTopbar && !document.getElementById('spa-topbar')) {
        dashboardTopbar = document.createElement('header');
        dashboardTopbar.className = 'topbar';
        dashboardTopbar.id = 'spa-topbar';
        dashboardTopbar.innerHTML = `<div id="top-avatar"></div>`;
        document.body.appendChild(dashboardTopbar);
      }
    }

    ensureUserPanelDOM();
    ensureMobileBottomNavDOM();
    updateRailHoles();
  }

  function ensureUserPanelDOM() {
    let avatar = document.getElementById('top-avatar');
    if (avatar && !avatar.classList.contains('account-row')) {
      const row = document.createElement('button');
      row.id = 'top-avatar'; row.type = 'button'; row.className = 'account-row';
      row.setAttribute('aria-label', '帳戶選單'); row.setAttribute('aria-haspopup', 'dialog');
      row.setAttribute('aria-expanded', 'false');
      row.innerHTML = `<span class="account-row__avatar" aria-hidden="true">帳</span><span class="account-row__identity"><span class="account-row__name">帳戶</span><span class="account-row__secondary" hidden></span></span><svg class="account-row__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      const parent = avatar.parentNode || avatar.parentElement;
      if (parent?.replaceChild) parent.replaceChild(row, avatar);
      else if (parent) { parent.removeChild(avatar); parent.appendChild(row); }
    }
    let panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel') || dashboardUserPanel;
    let backdrop = document.getElementById('spa-user-panel-backdrop');
    if (!backdrop) { backdrop = document.createElement('div'); backdrop.id = 'spa-user-panel-backdrop'; document.body.appendChild(backdrop); }
    backdrop.hidden = true; userPanelBackdrop = backdrop;
    if (!panel) { panel = document.createElement('div'); document.body.appendChild(panel); }
    if (!panel.classList.contains('account-panel')) {
      panel.id = 'spa-user-panel'; panel.className = 'account-panel';
      panel.innerHTML = `<div class="user-panel-handle" aria-hidden="true"></div>
        <button type="button" class="account-panel-close" aria-label="關閉帳戶面板">×</button>
        <div class="up-header"><div class="up-avatar" aria-hidden="true">帳</div><div class="account-panel-identity"><p class="up-name">帳戶</p><p class="up-email" hidden></p><span class="up-plan" hidden></span></div></div>
        <div class="up-body"><button type="button" class="up-btn" disabled><img src="../icon/profile.svg" alt=""><span>個人檔案</span></button><button type="button" class="up-btn" disabled><img src="../icon/upgrade.svg" alt=""><span>升級方案</span></button><a href="../history" class="up-btn" id="up-recycle-bin"><img src="../icon/trash-blur.svg" alt=""><span>資源回收桶</span></a><button type="button" class="up-btn" disabled><img src="../icon/setting.svg" alt=""><span>設定</span></button></div>
        <div class="account-panel-footer"><button type="button" class="up-btn up-logout"><img src="../icon/logout.svg" alt=""><span>登出</span></button></div>`;
    }
    dashboardUserPanel = panel;
    if (!accountController) accountController = window.UserPanelController.create({panel, backdrop, isMobile:isMobileView,
      onStateChange:()=>updateMobileBottomNavActive(), onDepth:setBackgroundDepthProgress, animateDepth:animateBackgroundDepth});
    return {panel, backdrop};
  }

  function ensureMobileBottomNavDOM() {
    let mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
    if (!mobNav) {
      mobNav = document.createElement('nav');
      mobNav.className = 'mobile-bottom-nav';
      mobNav.id = 'spa-mobile-nav';
      mobNav.setAttribute('aria-label', '行動版底部導航');
      mobNav.removeAttribute('role');
      mobNav.setAttribute('draggable', 'false');
      mobNav.innerHTML = `
        <div class="mobile-nav__indicator" id="mobile-nav-indicator" aria-hidden="true"></div>
        <div class="mobile-nav__track mobile-nav__track--base">
            <a href="../dashboard" class="mobile-nav__item active" id="mob-nav-home" aria-current="page" aria-label="首頁" draggable="false">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.5Z"></path>
                        <path d="M9 21V12H15V21"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label">首頁</span>
            </a>
            <a href="../projects" class="mobile-nav__item" id="mob-nav-projects" aria-label="分鏡" draggable="false">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg icon-fill-target" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M6.85929 1.25001C6.88904 1.25001 6.91919 1.25002 6.94976 1.25002L6.98675 1.25001C7.33818 1.24999 7.56433 1.24998 7.78542 1.27065C8.68728 1.35499 9.54516 1.69531 10.2586 2.25002H16.5C16.5196 2.25002 16.5389 2.25001 16.5579 2.25001C16.9666 2.24994 17.2449 2.2499 17.4895 2.2821C19.1722 2.50364 20.4964 3.82779 20.7179 5.51054C20.7263 5.57397 20.7325 5.63966 20.737 5.70931C21.0145 5.83579 21.2715 5.99934 21.5077 6.21185C21.6061 6.30032 21.6997 6.39394 21.7882 6.49231C22.3165 7.07965 22.5422 7.79459 22.648 8.63601C22.75 9.4479 22.75 10.4741 22.75 11.747V14.0564C22.75 15.8942 22.75 17.3498 22.5969 18.489C22.4393 19.6615 22.1071 20.6104 21.3588 21.3588C20.6104 22.1071 19.6615 22.4393 18.489 22.5969C17.3498 22.75 15.8942 22.75 14.0564 22.75H9.94361C8.10584 22.75 6.65021 22.75 5.51099 22.5969C4.33857 22.4393 3.38962 22.1071 2.64126 21.3588C1.8929 20.6104 1.56078 19.6615 1.40315 18.489C1.24999 17.3498 1.25 15.8942 1.25002 14.0564L1.25002 6.94976C1.25002 6.91919 1.25001 6.88904 1.25001 6.85929C1.2499 6.06338 1.24982 5.55685 1.33237 5.11935C1.6949 3.19788 3.19788 1.6949 5.11935 1.33237C5.55685 1.24982 6.06338 1.2499 6.85929 1.25001ZM19.1474 5.32768C18.8895 4.5029 18.1732 3.88506 17.2937 3.76927C17.1598 3.75163 16.9883 3.75002 16.5 3.75002H11.8113C12.4542 4.38908 12.7459 4.65598 13.0768 4.84005C13.2948 4.96134 13.526 5.05713 13.766 5.12552C14.1793 5.24333 14.6324 5.25002 15.8284 5.25002L16.253 5.25002C17.4153 5.25 18.3718 5.24999 19.1474 5.32768ZM6.94976 2.75002C6.03312 2.75002 5.67873 2.75329 5.39746 2.80636C4.08277 3.05441 3.05441 4.08277 2.80636 5.39746C2.75329 5.67873 2.75002 6.03312 2.75002 6.94976V14C2.75002 15.9068 2.75161 17.2615 2.88978 18.2892C3.02504 19.2953 3.27871 19.8749 3.70192 20.2981C4.12513 20.7213 4.70478 20.975 5.71087 21.1103C6.73853 21.2484 8.0932 21.25 10 21.25H14C15.9068 21.25 17.2615 21.2484 18.2892 21.1103C19.2953 20.975 19.8749 20.7213 20.2981 20.2981C20.7213 19.8749 20.975 19.2953 21.1103 18.2892C21.2484 17.2615 21.25 15.9068 21.25 14V11.7979C21.25 10.4621 21.2486 9.5305 21.1597 8.82312C21.0731 8.13448 20.9141 7.76356 20.6729 7.49539C20.6198 7.43637 20.5637 7.3802 20.5046 7.32712C20.2365 7.08592 19.8656 6.92692 19.1769 6.84034C18.4695 6.75141 17.538 6.75002 16.2021 6.75002H15.8284C15.7912 6.75002 15.7545 6.75002 15.7182 6.75003C14.6702 6.75025 13.9944 6.75038 13.3548 6.56806C13.0041 6.46811 12.6661 6.32811 12.3475 6.15083C11.7663 5.82747 11.2885 5.3495 10.5476 4.60833C10.522 4.58265 10.496 4.55666 10.4697 4.53035L9.91943 3.98009C9.63616 3.69682 9.52778 3.58951 9.41731 3.49793C8.91403 3.08073 8.29664 2.825 7.64576 2.76413C7.50289 2.75077 7.35038 2.75002 6.94976 2.75002ZM12.25 10C12.25 9.5858 12.5858 9.25002 13 9.25002H18C18.4142 9.25002 18.75 9.5858 18.75 10C18.75 10.4142 18.4142 10.75 18 10.75H13C12.5858 10.75 12.25 10.4142 12.25 10Z"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label">分鏡</span>
            </a>
            <div class="mobile-nav__item mobile-nav__item--create" id="mob-nav-generate" aria-label="新建分鏡" draggable="false"></div>
            <a href="../template" class="mobile-nav__item" id="mob-nav-template" aria-label="模板" draggable="false">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label">模板</span>
            </a>
            <button type="button" class="mobile-nav__item" id="mob-nav-profile" aria-label="我的設定" draggable="false">
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
        <div class="mobile-nav__track mobile-nav__track--focus" aria-hidden="true">
            <div class="mobile-nav__item mobile-nav__item--focus">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg mobile-nav__svg--focus" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H15V12H9V21H4C3.44772 21 3 20.5523 3 20V9.5Z"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label" style="visibility: hidden;">首頁</span>
            </div>
            <div class="mobile-nav__item mobile-nav__item--focus">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg mobile-nav__svg--focus" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M2 6.94975C2 6.06722 2 5.62595 2.06935 5.25839C2.37464 3.64031 3.64031 2.37464 5.25839 2.06935C5.62595 2 6.06722 2 6.94975 2C7.33642 2 7.52976 2 7.71557 2.01738C8.51665 2.09229 9.27652 2.40704 9.89594 2.92051C10.0396 3.03961 10.1763 3.17633 10.4497 3.44975L11 4C11.8158 4.81578 12.2237 5.22367 12.7121 5.49543C12.9804 5.64471 13.2651 5.7626 13.5604 5.84678C14.0979 6 14.6747 6 15.8284 6H16.2021C18.8345 6 20.1506 6 21.0062 6.76946C21.0849 6.84024 21.1598 6.91514 21.2305 6.99383C22 7.84935 22 9.16554 22 11.7979V14C22 17.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V6.94975ZM13 9.25C12.5858 9.25 12.25 9.58579 12.25 10C12.25 10.4142 12.5858 10.75 13 10.75H18C18.4142 10.75 18.75 10.4142 18.75 10C18.75 9.58579 18.4142 9.25 18 9.25H13Z"></path>
                        <path d="M16.9856 3.02094C16.8321 3 16.6492 3 16.2835 3H12L12.3699 3.38312C13.0359 4.07299 13.2919 4.33051 13.5877 4.50096C13.7594 4.5999 13.9415 4.67804 14.1304 4.73383C14.4559 4.82993 14.8128 4.83538 15.7546 4.83538L16.089 4.83538C17.0914 4.83536 17.8995 4.83535 18.5389 4.91862C18.6984 4.93939 18.8521 4.96582 19 5C18.8144 3.96313 18.0043 3.15985 16.9856 3.02094Z"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label" style="visibility: hidden;">分鏡</span>
            </div>
            <div class="mobile-nav__item mobile-nav__item--focus mobile-nav__item--create">
                <span class="mobile-nav__label" style="visibility: hidden;">新建</span>
            </div>
            <div class="mobile-nav__item mobile-nav__item--focus">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg mobile-nav__svg--focus" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label" style="visibility: hidden;">模板</span>
            </div>
            <div class="mobile-nav__item mobile-nav__item--focus">
                <div class="mobile-nav__icon-wrap">
                    <svg class="mobile-nav__svg mobile-nav__svg--focus" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM12 6C10.3431 6 9 7.34315 9 9C9 10.6569 10.3431 12 12 12C13.6569 12 15 10.6569 15 9C15 7.34315 13.6569 6 12 6ZM17.9691 20C17.81 17.1085 16.9247 15 11.9999 15C7.07521 15 6.18991 17.1085 6.03076 20A10 10 0 0 0 17.9691 20Z"></path>
                    </svg>
                </div>
                <span class="mobile-nav__label" style="visibility: hidden;">我的</span>
            </div>
        </div>
      `;
      document.body.appendChild(mobNav);
    }
    mobileBottomNav = mobNav;
    initMobileBottomNavGestures();
  }

  /* ==========================================================================
     SIDEBAR LOGIC & INTERACTIONS
     ========================================================================== */

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

  function bindSidebarLinks() {
    const containers = [
      document.getElementById('dash-sidebar') || dashboardSidebar,
      document.getElementById('spa-topbar') || dashboardTopbar
    ];

    burgerContainer = burgerContainer || document.getElementById("burger-container");
    sideLogo = sideLogo || document.getElementById("side-logo");

    if (burgerContainer && sideLogo) {
      const burger = document.getElementById("burger");
      if (burger && !burger.dataset.bound) {
        burger.dataset.bound = 'true';
        const onBurgerChange = () => {
          expandSidebar(burger.checked);
        };
        addTrackedListener(burger, 'change', onBurgerChange);
      }
      if (burgerContainer) {
        burgerContainer.style.opacity = '1';
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
        else if (cleanPath.includes('discovery/settings')) page = 'discovery-settings';
        else if (cleanPath.includes('discovery')) page = 'discovery';
        else if (cleanPath.includes('analysis')) page = 'analysis';

        if (page) {
          a.dataset.spaBound = 'true';
          const onLinkClick = (e) => {
            e.preventDefault();
            const sidebar = document.getElementById('dash-sidebar') || dashboardSidebar;
            const fromSidebar = !!(sidebar && sidebar.contains(a));
            if (fromSidebar && page !== 'projects' && page !== 'project') {
              expandSidebar(false);
            }
            shellOptions.navigate(page, { fromSidebar });
          };
          addTrackedListener(a, 'click', onLinkClick);
        }
      });
    });

    // Setup projects group toggle button
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
        const onToggleClick = (e) => {
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
        };
        addTrackedListener(toggleBtn, 'click', onToggleClick);
      }
    }

    const projectsLink = document.getElementById('nav-projects') || dashboardSidebar?.querySelector('#nav-projects');
    if (projectsLink && subList && navProjectsGroup && !projectsLink.dataset.toggleBound) {
      projectsLink.dataset.toggleBound = 'true';
      const onProjectsClick = () => {
        subList.classList.add('expanded');
        navProjectsGroup.classList.add('expanded');
        localStorage.setItem('sidebar_projects_expanded', 'true');
      };
      addTrackedListener(projectsLink, 'click', onProjectsClick);
    }
  }

  function updateSidebarActive(page) {
    const sidebar = document.getElementById('dash-sidebar') || dashboardSidebar;
    if (!sidebar) return;

    let activeMainPage = page;
    if (page === 'discovery-settings') activeMainPage = 'discovery';
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
        (activeMainPage === 'template' && href.includes('template')) ||
        (activeMainPage === 'discovery' && href.includes('discovery'));

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

    // Direct ProjectStore access as authoritative source
    let projects = [];
    if (window.ProjectStore && typeof window.ProjectStore.getProjects === 'function') {
      projects = window.ProjectStore.getProjects();
    } else if (Array.isArray(window.cacheProjectsList)) {
      projects = window.cacheProjectsList;
    }

    const activeProjects = (projects || []).filter(p => !p.is_deleted && !(window.ProjectDeleteQueue?.isPending(p.id)));
    const currentJSON = JSON.stringify(activeProjects.map(p => ({ id: p.id, title: p.title })));

    if (currentJSON !== lastRenderedProjectsJSON) {
      lastRenderedProjectsJSON = currentJSON;

      // Clean up previous tracked listeners belonging to sidebarList's children
      for (let i = registeredListeners.length - 1; i >= 0; i--) {
        const item = registeredListeners[i];
        if (!item || !item.target) continue;

        // Node type guard: parameter 1 of Node.contains must be a DOM Node (exclude window or non-nodes)
        const isDomNode = (typeof Node !== 'undefined' && item.target instanceof Node) ||
                          (typeof window !== 'undefined' && window.Node && item.target instanceof window.Node) ||
                          Boolean(item.target && typeof item.target.nodeType === 'number');

        if (!isDomNode) continue;

        const isChild = typeof sidebarList.contains === 'function'
          ? sidebarList.contains(item.target)
          : Boolean(item.target.parentElement === sidebarList || item.target.closest?.('#sidebar-projects-list'));

        if (isChild) {
          item.target.removeEventListener(item.event, item.handler, item.options);
          registeredListeners.splice(i, 1);
        }
      }

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
        const onGenClick = (e) => {
          e.preventDefault();
          shellOptions.navigate('generate');
        };
        addTrackedListener(a, 'click', onGenClick);
      } else if (href.includes('project/')) {
        const id = href.split('project/')[1];
        const onProjClick = (e) => {
          e.preventDefault();
          shellOptions.navigate('project', { id });
        };
        addTrackedListener(a, 'click', onProjClick);
      }
    });
  }

  function highlightActiveSidebarProject(sidebarList) {
    if (!sidebarList) return;
    sidebarList.querySelectorAll('.sub-link').forEach(l => l.classList.remove('active'));

    const currentHash = window.location.hash || '';
    const match = currentHash.match(/^#\/project\/(.+)$/);
    if (match && match[1]) {
      const activeId = decodeURIComponent(match[1]);
      const activeLink = sidebarList.querySelector(`.project-sub-link[data-id="${activeId}"]`);
      if (activeLink) {
        activeLink.classList.add('active');
      }
    }
  }

  function updateRailHoles() {
    const railTop = document.getElementById('rail-top');
    const railBottom = document.getElementById('rail-bottom');
    if (!railTop || !railBottom) return;

    const targetNum = Math.floor(window.innerWidth / (0.028 * window.innerHeight)) + 1;
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

  /* ==========================================================================
     USER PANEL (TOPBAR AVATAR, GESTURES, PROFILE)
     ========================================================================== */

  function toggleUserPanel(open) {
    ensureUserPanelDOM();
    accountController.toggle(open);
  }

  async function syncUserProfile(signal) {
    const avatar = document.getElementById('top-avatar') || dashboardTopbar?.querySelector('#top-avatar');
    const panel = document.getElementById('spa-user-panel');
    const auth = shellOptions.spaAuth || window.spaAuth;

    if (avatar && !avatar.dataset.bound) {
      avatar.dataset.bound = 'true';
      const onAvatarClick = (e) => {
        e.stopPropagation();
        toggleUserPanel();
      };
      addTrackedListener(avatar, 'click', onAvatarClick);
    }

    const recycle = panel?.querySelector('#up-recycle-bin');
    if (recycle && !recycle.dataset.spaBound) {
      recycle.dataset.spaBound = 'true';
      addTrackedListener(recycle, 'click', e => {
        if (e.button && e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        e.stopPropagation();
        toggleUserPanel(false);
        shellOptions.navigate('history');
      });
    }

    const logout = panel?.querySelector('.up-logout');
    if (logout && !logout.dataset.spaBound) {
      logout.dataset.spaBound = 'true';
      const onLogoutClick = async (e) => {
        e.preventDefault();
        toggleUserPanel(false);
        const isConfirmed = window.DialogService
          ? (await window.DialogService.confirm({title:'是否確定登出？', returnFocus:accountController?.trigger})).confirmed
          : await (window.confirmDialog || window.confirm)('是否確定登出？');
        if (isConfirmed) {
          auth?.logout?.();
        }
      };
      addTrackedListener(logout, 'click', onLogoutClick);
    }

    if (!auth || typeof auth.fetchUser !== 'function') return;

    try {
      const result = await auth.fetchUser(signal);
      if (signal?.aborted || result?.aborted) return;

      if (result && result.user && panel) {
        const user = result.user;
        const name = user.name || '帳戶';
        const drawAvatar = target => {
          if (!target) return;
          target.textContent = name.charAt(0).toUpperCase();
          if (user.image) { const image = document.createElement('img'); image.src = user.image; image.alt = ''; target.textContent = ''; target.appendChild(image); }
        };
        drawAvatar(avatar?.querySelector('.account-row__avatar'));
        drawAvatar(panel.querySelector('.up-avatar'));
        for (const target of [avatar?.querySelector('.account-row__name'), panel.querySelector('.up-name')]) if (target) target.textContent = name;
        avatar?.setAttribute('aria-label', `${name}，帳戶選單`);
        for (const target of [avatar?.querySelector('.account-row__secondary'), panel.querySelector('.up-email')]) if (target) {target.textContent = user.email || ''; target.hidden = !user.email;}
        const plan = panel.querySelector('.up-plan');
        if (plan) {plan.textContent = ({free:'Free',pro:'Pro',promax:'Pro Max'})[user.plan] || user.plan || ''; plan.hidden = !user.plan;}

      }
    } catch (_) {}


  }

  /* ==========================================================================
     MOBILE BOTTOM NAVIGATION GESTURES & ACTIVE STATE
     ========================================================================== */

  function initMobileBottomNavGestures() {
    const mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
    if (!mobNav || mobNav.dataset.gesturesBound) return;
    mobNav.dataset.gesturesBound = 'true';

    // Only actual page scroll owners can compact the persistent shell.
    const lastScrollPositions = new WeakMap();
    addTrackedListener(document, 'scroll', (event) => {
      const scroller = event.target;
      if (!isMobileView() || !scroller?.matches?.('.content-body, .page-scroll')) return;
      const current = Math.max(0, scroller.scrollTop);
      const state = lastScrollPositions.get(scroller) || { top: 0, direction: 0, distance: 0 };
      const delta = current - state.top;
      const direction = Math.sign(delta);
      if (direction && direction !== state.direction) { state.direction = direction; state.distance = 0; }
      state.distance += Math.abs(delta);
      state.top = current;
      lastScrollPositions.set(scroller, state);
      if (current <= 0 || (direction < 0 && state.distance >= 12)) document.body.classList.remove('mobile-nav-compact');
      else if (direction > 0 && state.distance >= 12) document.body.classList.add('mobile-nav-compact');
    }, { capture: true, passive: true });

    // Sample the navigation's presentation during CSS morphs. The page renderer
    // owns its own layers, including the 88px baseline after navigation exits.
    let navigationFrame = null;
    let navigationUntil = 0;
    function publishNavigation(now) {
      navigationFrame = null;
      const rect = mobNav.getBoundingClientRect();
      const visible = isMobileView() && rect.width > 0 && mobNav.style.opacity !== '0';
      const viewportBottom = window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight;
      const progress = visible ? Math.max(0, Math.min(1, (viewportBottom - rect.top) / Math.max(1, rect.height))) : 0;
      window.ProgressiveEdgeBlurSystem?.setNavigation('bottom', {
        enabled: isMobileView() && rect.width > 0 && mobNav.style.display !== 'none' && !document.body.classList.contains('workspace-secondary'),
        progress,
        extent: Math.max(152, viewportBottom - rect.top + 48)
      });
      if (now < navigationUntil) navigationFrame = requestAnimationFrame(publishNavigation);
    }
    function scheduleNavigation() {
      navigationUntil = performance.now() + 500;
      if (navigationFrame === null) navigationFrame = requestAnimationFrame(publishNavigation);
    }
    addTrackedListener(mobNav, 'transitionrun', scheduleNavigation);
    addTrackedListener(mobNav, 'focusin', () => {
      document.body.classList.remove('mobile-nav-compact');
      scheduleNavigation();
    });
    const navigationObserver = window.MutationObserver ? new MutationObserver(scheduleNavigation) : null;
    navigationObserver?.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    navigationObserver?.observe(mobNav, { attributes: true, attributeFilter: ['style'] });
    const navResizeObserver = window.ResizeObserver ? new ResizeObserver(() => {
      if (isNavInteracting) onPointerRelease(null, true);
      cacheMetrics();
      updateMobileBottomNavActive();
      scheduleNavigation();
    }) : null;
    navResizeObserver?.observe(mobNav);
    scheduleNavigation();
    addTrackedListener(mobNav, 'pointerdown', () => {
      document.body.classList.remove('mobile-nav-compact');
    }, { capture: true });
    addTrackedListener(mobNav, 'click', () => {
      document.body.classList.remove('mobile-nav-compact');
    }, { capture: true });

    if (typeof window.mountAICreationCapsule === 'function') {
      try { window.mountAICreationCapsule(); } catch (_) {}
    }

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
    let navMetricScale = 1;
    let visual = null;

    const maxDx = 18;
    const maxDy = 12;
    const insetX = parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-inset-x')) || 5;
    const insetY = parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-inset-y')) || 5;
    let indicatorWidth = parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-width')) || 64;

    const items = Array.from(mobNav.querySelectorAll('.mobile-nav__track--base .mobile-nav__item')).length
      ? Array.from(mobNav.querySelectorAll('.mobile-nav__track--base .mobile-nav__item'))
      : Array.from(mobNav.querySelectorAll('.mobile-nav__item:not(.mobile-nav__item--focus)'));
    const indicator = mobNav.querySelector('.mobile-nav__indicator');
    const maskedItems = items.filter(item => !item.classList.contains('mobile-nav__item--create') && item.id !== 'mob-nav-generate');

    addTrackedListener(mobNav, 'dragstart', (e) => e.preventDefault());
    items.forEach(it => it.setAttribute('draggable', 'false'));

    function updateIndicatorVisual(x, scale = 1.0, isSettling = false, opacity = 1.0) {
      if (selectorRaf) cancelAnimationFrame(selectorRaf);
      selectorRaf = null;
      mobNav.classList.remove('is-selector-moving');
      const target = { x, scale, opacity, width: indicatorWidth };
      if (!visual || !isSettling || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        visual = target;
        paintIndicator(visual.x, visual.scale, false, visual.opacity, visual.width);
        return;
      }
      const from = { ...visual };
      const started = performance.now();
      mobNav.classList.add('is-selector-moving');
      function step(now) {
        const t = Math.min(1, (now - started) / 240);
        const eased = 1 - Math.pow(1 - t, 3);
        visual = Object.fromEntries(Object.keys(target).map(key => [key, from[key] + (target[key] - from[key]) * eased]));
        paintIndicator(visual.x, visual.scale, false, visual.opacity, visual.width);
        if (t < 1) selectorRaf = requestAnimationFrame(step);
        else { selectorRaf = null; mobNav.classList.remove('is-selector-moving'); }
      }
      selectorRaf = requestAnimationFrame(step);
    }

    function paintIndicator(x, scale = 1.0, isSettling = false, opacity = 1.0, width = indicatorWidth) {
      if (!indicator || !mobNav) return;
      const focusTrack = mobNav.querySelector('.mobile-nav__track--focus');

      const opacityStr = opacity.toString();
      indicator.style.opacity = opacityStr;
      if (focusTrack) focusTrack.style.opacity = opacityStr;
      indicator.style.width = `${width}px`;
      indicator.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0) scale(${scale.toFixed(4)})`;

      if (!focusTrack) return;

      if (focusTrack) {
        if (opacity <= 0.01) {
          const hiddenClip = 'inset(0 100% 0 0 round 999px)';
          focusTrack.style.clipPath = hiddenClip;
          if (focusTrack.style.webkitClipPath !== undefined) {
            focusTrack.style.webkitClipPath = hiddenClip;
          }
          mobNav.style.setProperty('--nav-clip-path', hiddenClip);
          updateBaseInverseMask(0, 0, 0, 0, 0, 0);
          return;
        }

        const navW = cachedNavRect ? cachedNavRect.width : (mobNav.getBoundingClientRect?.().width || 0);
        const navH = cachedNavRect ? cachedNavRect.height : (mobNav.getBoundingClientRect?.().height || 64);
        const selW = width;
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
        if (focusTrack.style.webkitClipPath !== undefined) {
          focusTrack.style.webkitClipPath = clipValue;
        }
        mobNav.style.setProperty('--nav-clip-path', clipValue);
        updateBaseInverseMask(navW, navH, left, top, scaledW, scaledH);
      }
    }
    function updateBaseInverseMask(navW, navH, left, top, scaledW, scaledH) {
      const fullMask = "linear-gradient(#000 0 0)";

      // 尺寸無效時，回復完整顯示
      if (
        ![navW, navH, left, top, scaledW, scaledH]
          .every(Number.isFinite) ||
        navW <= 0 ||
        navH <= 0 ||
        scaledW <= 0 ||
        scaledH <= 0
      ) {
        maskedItems.forEach(item => {
          item.style.webkitMaskImage = fullMask;
          item.style.maskImage = fullMask;
        });
        return;
      }

      // 與 Focus 使用相同的幾何資訊
      const svg = `
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="${navW}"
          height="${navH}"
          viewBox="0 0 ${navW} ${navH}"
        >
          <rect
            x="${left}"
            y="${top}"
            width="${scaledW}"
            height="${scaledH}"
            rx="999"
            ry="999"
            fill="black"
          />
        </svg>
      `;

      const encodedSVG = encodeURIComponent(svg);

      const holeMask =
        `url("data:image/svg+xml,${encodedSVG}")`;

      const finalMask = `
        linear-gradient(#000 0 0),
        ${holeMask}
      `;

      // The shared nav-sized hole is positioned in each item's local coordinates.
      maskedItems.forEach(item => {
        const metric = cachedMetrics.find(entry => entry.item === item);
        if (!metric) return;
        const position = `0 0, ${(-metric.left).toFixed(2)}px ${(-metric.top).toFixed(2)}px`;
        const size = `100% 100%, ${navW}px ${navH}px`;
        item.style.webkitMaskSize = item.style.maskSize = size;
        item.style.webkitMaskPosition = item.style.maskPosition = position;
        item.style.webkitMaskImage = item.style.maskImage = finalMask;
      });
    }

    updateMobNavVisual = updateIndicatorVisual;

    function cacheMetrics() {
      if (!mobNav.getBoundingClientRect) return;
      const rect = mobNav.getBoundingClientRect();
      navMetricScale = mobNav.offsetWidth > 0 ? rect.width / mobNav.offsetWidth : 1;
      if (!navMetricScale) navMetricScale = 1;
      cachedNavRect = { left: rect.left + (mobNav.clientLeft || 0) * navMetricScale, top: rect.top, bottom: rect.bottom, width: mobNav.clientWidth || rect.width / navMetricScale, height: mobNav.clientHeight || rect.height / navMetricScale };
      cachedMetrics = items.map(it => {
        const r = it.getBoundingClientRect ? it.getBoundingClientRect() : { left: 0, width: 0 };
        return {
          item: it,
          id: it.id,
          centerX: cachedNavRect.left + (r.left - cachedNavRect.left + r.width / 2) / navMetricScale,
          left: (r.left - cachedNavRect.left) / navMetricScale,
          top: ((r.top || 0) - cachedNavRect.top) / navMetricScale,
          width: r.width / navMetricScale,
          isCreate: it.classList?.contains('mobile-nav__item--create') || it.id === 'mob-nav-generate'
        };
      });

      const focusItems = mobNav.querySelectorAll('.mobile-nav__track--focus > .mobile-nav__item');
      focusItems.forEach((item, index) => {
        const metric = cachedMetrics[index];
        if (!metric) return;
        item.style.position = 'absolute';
        item.style.left = `${metric.centerX - cachedNavRect.left - metric.width / 2}px`;
        item.style.width = `${metric.width}px`;
      });

      if (cachedMetrics.length >= 1 && cachedNavRect && cachedNavRect.width > 0) {
        const target = currentTargetItem || items.find(item => item.classList.contains('active')) || items[0];
        const metric = cachedMetrics.find(entry => entry.item === target);
        indicatorWidth = Math.max(1, metric?.width || 64);
        mobNav.style.setProperty('--nav-selector-width', `${indicatorWidth}px`);

        const mobBtn = mobNav.querySelector('#mob-nav-circle-wrap') || mobNav.querySelector('.mob-circle-btn');
        if (mobBtn && mobBtn.getBoundingClientRect) {
          const br = mobBtn.getBoundingClientRect();
          if (br && br.width > 0) {
            window.__mobBtnRestingBottomPx = Math.max(0, Math.round(window.innerHeight - br.bottom));
            document.documentElement?.style?.setProperty('--mob-btn-bottom', `${window.__mobBtnRestingBottomPx}px`);
          }
        }
      }
    }
    cacheMobNavMetrics = cacheMetrics;

    function clearSnapHover() {
      items.forEach(it => {
        it.classList?.remove('snap-target', 'selector-hovered', 'is-hovered');
      });
      const circleBtn = mobNav.querySelector('.mob-circle-btn') || document.getElementById('global-create-capsule');
      if (circleBtn) {
        circleBtn.classList?.remove('snap-hover', 'selector-hovered', 'is-hovered');
      }
    }

    function highlightTargetItem(targetItem) {
      if (!targetItem) {
        clearSnapHover();
        return;
      }
      items.forEach(it => {
        if (it === targetItem) {
          it.classList?.add('snap-target');
        } else {
          it.classList?.remove('snap-target', 'selector-hovered', 'is-hovered');
        }
      });
      const circleBtn = mobNav.querySelector('.mob-circle-btn') || document.getElementById('global-create-capsule');
      const isCreate = targetItem.classList?.contains('mobile-nav__item--create') || targetItem.id === 'mob-nav-generate';
      if (circleBtn) {
        if (isCreate) {
          circleBtn.classList?.add('snap-hover', 'selector-hovered', 'is-hovered');
          targetItem.classList?.add('selector-hovered', 'is-hovered');
        } else {
          circleBtn.classList?.remove('snap-hover', 'selector-hovered', 'is-hovered');
          targetItem.classList?.remove('selector-hovered', 'is-hovered');
        }
      }
    }

    function findClosestMetric(clientX) {
      const rect = mobNav.getBoundingClientRect();
      const scale = rect.width / cachedNavRect.width || navMetricScale;
      clientX = cachedNavRect.left + (clientX - rect.left) / scale;
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
    cleanupMobNavGestures = () => {
      cleanupWindowListeners();
      navigationObserver?.disconnect();
      navResizeObserver?.disconnect();
      if (navigationFrame !== null) cancelAnimationFrame(navigationFrame);
      if (selectorRaf) cancelAnimationFrame(selectorRaf);
      selectorRaf = null;
      cancelMobNavInteraction = null;
    };
    cancelMobNavInteraction = () => onPointerRelease(null, true);

    function onPointerDown(e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (isNavInteracting || e.isPrimary === false) return;

      if (navSpringRaf) {
        cancelAnimationFrame(navSpringRaf);
        navSpringRaf = null;
      }
      mobNav.style.transform = '';
      mobNav.style.transition = 'none';

      isNavInteracting = true;
      mobNav.classList.add('is-interacting');
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
      cacheMetrics();
      lastSnappedItem = currentTargetItem;
      highlightTargetItem(currentTargetItem);

      // 按下即動：只要有點擊到 link 就觸發 selector 移動過來，手指點擊時微反饋 (scale 1.05)
      if (indicator && currentTargetItem && cachedNavRect) {
        indicator.classList.add('is-active', 'is-pressed');
        const tMetric = cachedMetrics.find(m => m.item === currentTargetItem);
        const targetCenterX = tMetric ? tMetric.centerX : (currentTargetItem.getBoundingClientRect ? (currentTargetItem.getBoundingClientRect().left + currentTargetItem.getBoundingClientRect().width / 2) : 0);
        const finalOffset = targetCenterX - cachedNavRect.left - indicatorWidth / 2;
        curIndicatorX = Math.max(insetX, Math.min(cachedNavRect.width - indicatorWidth - insetX, finalOffset));
        updateIndicatorVisual(curIndicatorX, 0.945, true, 1.0);
      }

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

      curDx = Math.sign(rawDx) * maxDx * (1 - 1 / (1 + (Math.abs(rawDx) * 0.16) / maxDx));
      curDy = Math.sign(rawDy) * maxDy * (1 - 1 / (1 + (Math.abs(rawDy) * 0.16) / maxDy));

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

      if (cachedNavRect && (isCancelled || e.clientY < cachedNavRect.top - 65 || e.clientY > cachedNavRect.bottom + 65 || e.clientX < cachedNavRect.left - 50 || e.clientX > cachedNavRect.left + cachedNavRect.width * navMetricScale + 50)) {
        if (!isCancelled) {
          isCancelled = true;
          currentTargetItem = null;
          clearSnapHover();
          updateMobileBottomNavActive();
        }
      } else {
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

        // 跟手磁吸吸附
        if (indicator && cachedNavRect && closestMetric) {
          if (Math.hypot(rawDx, rawDy) > 4) {
            indicator.classList.remove('is-settling');
          }
          indicatorWidth = Math.max(1, closestMetric.width);
          const rect = mobNav.getBoundingClientRect();
          const scale = rect.width / cachedNavRect.width || navMetricScale;
          const fingerRelX = (e.clientX - rect.left) / scale - indicatorWidth / 2;
          const pressedScale = 0.945;
          const scaledOverhang = indicatorWidth * (pressedScale - 1) / 2;
          curIndicatorX = Math.max(insetX + scaledOverhang, Math.min(cachedNavRect.width - indicatorWidth - insetX - scaledOverhang, fingerRelX));

          indicator.classList.add('is-active');
          updateIndicatorVisual(curIndicatorX, pressedScale, false, 1.0);
        }
      }

    }

    function onPointerRelease(e, forceCancel = false) {
      if (!isNavInteracting) return;
      if (!forceCancel && activePointerId !== null && e && e.pointerId !== activePointerId) return;

      const releasedTargetItem = currentTargetItem;
      const isActuallyCancelled = isCancelled || forceCancel;
      const releaseCancelled = isActuallyCancelled || !releasedTargetItem;
      // Browsers synthesize click after pointerup, including abandoned drags.
      // Suppress that click for cancelled gestures as well as committed ones.
      window.__justHandledPointerNav = Date.now();
      justHandledPointerNav = true;
      setTimeout(() => { justHandledPointerNav = false; }, 450);

      cleanupWindowListeners();
      clearSnapHover();

      isNavInteracting = false;
      mobNav.classList.remove('is-interacting');
      activePointerId = null;
      currentTargetItem = null;
      indicator?.classList.remove('is-pressed');

      if (indicator && releasedTargetItem && cachedNavRect) {
        indicator.classList.add('is-active');
        indicator.classList.remove('is-pressed');
        const tMetric = cachedMetrics.find(m => m.item === releasedTargetItem);
        const targetCenterX = tMetric ? tMetric.centerX : (releasedTargetItem.getBoundingClientRect ? (releasedTargetItem.getBoundingClientRect().left + releasedTargetItem.getBoundingClientRect().width / 2) : 0);
        const finalOffset = targetCenterX - cachedNavRect.left - indicatorWidth / 2;
        curIndicatorX = Math.max(insetX, Math.min(cachedNavRect.width - indicatorWidth - insetX, finalOffset));
        updateIndicatorVisual(curIndicatorX, 1.0, true, 1.0);
      }

      const dragDist = Math.hypot(curDx, curDy);
      const isLargeDisplacement = dragDist > 5.0;

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
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        mobNav.style.transform = '';
        mobNav.style.transformOrigin = 'center center';
      } else navSpringRaf = requestAnimationFrame(springStep);

      if (releaseCancelled) {
        updateMobileBottomNavActive();
        return;
      }

      window.__justHandledPointerNav = Date.now();
      justHandledPointerNav = true;
      setTimeout(() => { justHandledPointerNav = false; }, 450);

      const targetItem = releasedTargetItem;
      if (targetItem.id === 'mob-nav-profile') {
        toggleUserPanel();
      } else if (targetItem.id === 'mob-nav-generate' || targetItem.classList?.contains('mobile-nav__item--create')) {
        if (window.AICreationController) {
          if (window.AICreationController.surfaceState === 'quick-compose') {
            window.AICreationController.closeQuickCompose();
          } else {
            window.AICreationController.openQuickCompose();
          }
        }
      } else {
        const href = targetItem.getAttribute('href') || '';
        if (href.includes('generate')) {
          if (window.AICreationController) {
            window.AICreationController.openQuickCompose();
          }
          return;
        }
        let targetRoute = 'dashboard';
        if (href.includes('projects')) targetRoute = 'projects';
        else if (href.includes('template')) targetRoute = 'template';
        else if (href.includes('history')) targetRoute = 'history';
        else if (href.includes('discovery')) targetRoute = 'discovery';
        shellOptions.navigate(targetRoute);
      }
    }

    function onPointerUp(e) {
      onPointerRelease(e, false);
    }

    function onPointerCancel(e) {
      onPointerRelease(e, true);
    }

    addTrackedListener(mobNav, 'pointerdown', onPointerDown);
    addTrackedListener(mobNav, 'click', (e) => {
      e.stopPropagation();
    });

    const mobGenItem = mobNav.querySelector('#mob-nav-generate');
    if (mobGenItem) {
      addTrackedListener(mobGenItem, 'pointerenter', () => {
        const cap = document.getElementById('global-create-capsule');
        if (cap && !cap.classList?.contains('is-expanded')) {
          cap.classList?.add('selector-hovered', 'is-hovered');
        }
      });
      addTrackedListener(mobGenItem, 'pointerleave', () => {
        const cap = document.getElementById('global-create-capsule');
        if (cap && !isNavInteracting) {
          cap.classList?.remove('selector-hovered', 'is-hovered');
        }
      });
    }

    items.forEach(item => {
      const onItemClick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (justHandledPointerNav || (window.__justHandledPointerNav && Date.now() - window.__justHandledPointerNav < 450)) return;

        if (item.id === 'mob-nav-profile') {
          toggleUserPanel();
          return;
        }

        if (item.id === 'mob-nav-generate' || item.classList?.contains('mobile-nav__item--create')) {
          if (indicator) {
            indicator.classList?.add('is-active');
            const itemRect = item.getBoundingClientRect ? item.getBoundingClientRect() : { left: 0, width: 0 };
            const navRect = mobNav.getBoundingClientRect ? mobNav.getBoundingClientRect() : { left: 0, width: 0 };
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
          return;
        }

        const href = item.getAttribute('href') || '';
        let targetRoute = 'dashboard';
        if (href.includes('projects')) targetRoute = 'projects';
        else if (href.includes('template')) targetRoute = 'template';
        else if (href.includes('history')) targetRoute = 'history';
        else if (href.includes('discovery')) targetRoute = 'discovery';

        shellOptions.navigate(targetRoute);
      };
      addTrackedListener(item, 'click', onItemClick);
    });

    if (window.visualViewport && !mobNav.dataset.viewportBound) {
      mobNav.dataset.viewportBound = 'true';
      const initialHeight = window.visualViewport.height;

      const onViewportChange = () => {
        const isQuickComposeActive = document.body.classList?.contains('ai-quick-compose-active') ||
          (window.AICreationController && window.AICreationController.surfaceState === 'quick-compose');

        if (isQuickComposeActive) {
          mobNav.style.opacity = '1';
          mobNav.style.pointerEvents = 'auto';

          const lift = Math.max(0, window.innerHeight - window.visualViewport.height);
          const qcContainer = document.getElementById('quick-creation-container');

          if (lift > 80) {
            document.body.classList?.add('ai-keyboard-open');
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
              document.body.classList?.remove('ai-keyboard-open');
            }
          }
        } else {
          document.body.classList?.remove('ai-keyboard-open');
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

      addTrackedListener(window.visualViewport, 'resize', onViewportChange);
      addTrackedListener(window.visualViewport, 'scroll', onViewportChange);
    }
  }

  function updateMobileBottomNavActive(page) {
    const mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
    if (!mobNav || isNavInteracting) return;
    cacheMobNavMetrics?.();

    const panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel') || dashboardUserPanel;
    const isProfileActive = page === 'profile' || (panel && panel.classList.contains('active'));

    let activeMainPage = page;
    if (!activeMainPage || activeMainPage === 'profile') {
      const hash = selectedRoute ? '#/' + selectedRoute : window.location.pathname + window.location.hash;
      if (hash.includes('projects')) activeMainPage = 'projects';
      else if (hash.includes('template')) activeMainPage = 'template';
      else if (hash.includes('history')) activeMainPage = 'history';
      else activeMainPage = 'dashboard';
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
      } else if (activeMainPage === 'generate') {
        isActive = (item.id === 'mob-nav-generate' || item.classList.contains('mobile-nav__item--create'));
      } else {
        if (item.id === 'mob-nav-generate' || item.classList.contains('mobile-nav__item--create')) {
          isActive = false;
        } else {
          const href = item.getAttribute('href') || '';
          const isDashboard = activeMainPage === 'dashboard' && (href.includes('dashboard') || item.id === 'mob-nav-home');
          const isProjects = activeMainPage === 'projects' && (href.includes('projects') || item.id === 'mob-nav-projects');
          const isTemplate = activeMainPage === 'template' && (href.includes('template') || item.id === 'mob-nav-template');
          isActive = isDashboard || isProjects || isTemplate;
        }
      }

      if (isActive) {
        item.classList.add('active');
        if (item.id === 'mob-nav-profile') item.setAttribute('aria-pressed','true');
        activeItem = item;
      } else {
        item.classList.remove('active');
        if (item.id === 'mob-nav-profile') item.setAttribute('aria-pressed','false');
      }
      // The route remains current while the visual indicator visits an action surface.
      if (item.getAttribute('href')) {
        const routeId = {dashboard:'mob-nav-home',projects:'mob-nav-projects',template:'mob-nav-template'}[activeMainPage];
        if (item.id === routeId) item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');
      }
    });

    cacheMobNavMetrics?.();
    const indicator = mobNav.querySelector('.mobile-nav__indicator');
    if (indicator) {
      if (activeItem) {
        const itemRect = activeItem.getBoundingClientRect();
        const navRect = mobNav.getBoundingClientRect();
        const insetX = parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-inset-x')) || 5;
        const currentIndicatorWidth = parseFloat(getComputedStyle(mobNav).getPropertyValue('--nav-selector-width')) || 64;
        if (navRect.width > 0 && itemRect.width > 0) {
          const metricScale = mobNav.offsetWidth > 0 ? navRect.width / mobNav.offsetWidth : 1;
          const itemCenterX = (itemRect.left - navRect.left + itemRect.width / 2) / metricScale - (mobNav.clientLeft || 0);
          const targetOffset = itemCenterX - currentIndicatorWidth / 2;
          const finalOffset = Math.max(insetX, Math.min(navRect.width / metricScale - currentIndicatorWidth - insetX, targetOffset));
          indicator.classList.add('is-active');
          if (updateMobNavVisual) {
            updateMobNavVisual(finalOffset, 1.0, true, 1.0);
          } else {
            indicator.style.transform = `translate3d(${finalOffset.toFixed(2)}px, 0, 0) scale(1)`;
            indicator.style.opacity = '1';
          }
        } else {
          requestAnimationFrame(() => {
            const currentMobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
            if (!currentMobNav) return;
            const nR = currentMobNav.getBoundingClientRect ? currentMobNav.getBoundingClientRect() : { width: 0, left: 0 };
            const iR = activeItem.getBoundingClientRect ? activeItem.getBoundingClientRect() : { width: 0, left: 0 };
            if (nR.width > 0 && iR.width > 0) {
              const iCenterX = iR.left + iR.width / 2;
              const tOffset = iCenterX - nR.left - currentIndicatorWidth / 2;
              const fOffset = Math.max(insetX, Math.min(nR.width - currentIndicatorWidth - insetX, tOffset));
              indicator.classList.add('is-active');
              if (updateMobNavVisual) {
                updateMobNavVisual(fOffset, 1.0, true, 1.0);
              } else {
                indicator.style.transform = `translate3d(${fOffset.toFixed(2)}px, 0, 0) scale(1)`;
                indicator.style.opacity = '1';
              }
            }
          });
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

  /* ==========================================================================
     PROJECTSTORE SUBSCRIPTION
     ========================================================================== */

  function subscribeProjectStore() {
    if (storeUnsubscribe) {
      return;
    }
    if (window.ProjectStore && typeof window.ProjectStore.subscribe === 'function') {
      storeUnsubscribe = window.ProjectStore.subscribe(() => {
        updateSidebarProjects();
      });
    }
  }

  /* ==========================================================================
     GLOBAL / DOCUMENT EVENT LISTENERS
     ========================================================================== */

  let globalListenersBound = false;
  function bindGlobalListeners() {
    if (globalListenersBound) return;
    globalListenersBound = true;

    const onResize = () => {
      updateRailHoles();
      if (!isMobileView()) {
        const bgTargets = getBackgroundDepthTargets();
        bgTargets.forEach(el => {
          el.classList.remove('bg-depth-scaled', 'bg-depth-animating');
          el.style.removeProperty('transform');
          el.style.removeProperty('border-radius');
          el.style.removeProperty('overflow');
        });

      }
      if (typeof cacheMobNavMetrics === 'function') {
        try { cacheMobNavMetrics(); } catch (_) {}
      }
      if (mobileBottomNav && !window.OverlayManager?.isModalActive?.()) {
        const navUnavailable = mobileBottomNav.hidden || (secondaryRoute && isMobileView());
        mobileBottomNav.inert = navUnavailable;
        mobileBottomNav.setAttribute('aria-hidden', String(navUnavailable));
      }
      updateMobileBottomNavActive();
    };
    addTrackedListener(window, 'resize', onResize);


  }

  /* ==========================================================================
     PUBLIC API
     ========================================================================== */

  async function init(options = {}) {
    shellOptions = {
      ...shellOptions,
      ...options
    };

    await ensureShellDOM(options.signal, options.fetchDoc);
    accountController?.bindPage(options.signal);
    bindSidebarLinks();
    bindGlobalListeners();
    subscribeProjectStore();
    void syncUserProfile(options.signal);
    updateSidebarProjects();

    return {
      destroy
    };
  }

  function setPendingRoute(page) {
    if (selectedRoute !== page) accountController?.close('navigation', true);
    selectedRoute = page;
    updateSidebarActive(page);
    updateMobileBottomNavActive(page);
  }

  function updateRoute(page, opts = {}) {
    cancelMobNavInteraction?.();
    if (selectedRoute !== page) accountController?.close('navigation', true);
    selectedRoute = page;
    const isDashboard = isDashboardPage(page);
    secondaryRoute = page === 'project' || page === 'discovery-settings' || page === 'generate' || (page === 'template' && !!opts.templateId);
    document.body.classList.toggle('workspace-secondary', secondaryRoute);

    if (dashboardSidebar) {
      dashboardSidebar.style.display = isDashboard ? '' : 'none';
    }
    if (dashboardTopbar) {
      dashboardTopbar.style.display = isDashboard ? '' : 'none';
    }
    const mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
    if (mobNav) {
      const navHidden = !isDashboard || page === 'history' || page === 'discovery-settings';
      mobNav.style.display = navHidden ? 'none' : '';
      mobNav.hidden = navHidden;
      mobNav.inert = navHidden || (secondaryRoute && isMobileView());
      mobNav.setAttribute('aria-hidden', String(navHidden || (secondaryRoute && isMobileView())));
    }
    document.body.classList.remove('mobile-nav-compact');

    const userPanel = document.getElementById('spa-user-panel') || dashboardUserPanel;
    if (userPanel) {
      if (!isDashboard) {
        userPanel.style.display = 'none';
        userPanel.classList.remove('active');
      } else {
        userPanel.style.display = '';
      }
    }

    if (isDashboard) {
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
      updateMobileBottomNavActive(page);
    }
  }

  function collapseProjectsGroup() {
    localStorage.setItem('sidebar_projects_expanded', 'false');
    expandSidebar(false);
    const subList = document.getElementById('sidebar-projects-list') || dashboardSidebar?.querySelector('#sidebar-projects-list');
    const navProjectsGroup = document.getElementById('nav-projects-group') || dashboardSidebar?.querySelector('#nav-projects-group');
    if (subList) subList.classList.remove('expanded');
    if (navProjectsGroup) navProjectsGroup.classList.remove('expanded');
  }

  function destroy() {
    accountController?.destroy(); accountController = null;
    if (selectorRaf) cancelAnimationFrame(selectorRaf);
    selectorRaf = null;
    document.body.classList.remove('mobile-nav-compact');
    if (storeUnsubscribe) {
      try {
        storeUnsubscribe();
      } catch (_) {}
      storeUnsubscribe = null;
    }

    if (cleanupMobNavGestures) {
      try { cleanupMobNavGestures(); } catch (_) {}
      cleanupMobNavGestures = null;
    }

    if (navSpringRaf) {
      try { cancelAnimationFrame(navSpringRaf); } catch (_) {}
      navSpringRaf = null;
    }

    isNavInteracting = false;
    justHandledPointerNav = false;
    cacheMobNavMetrics = null;

    registeredListeners.forEach(({ target, event, handler, options }) => {
      try {
        target.removeEventListener(event, handler, options);
      } catch (_) {}
    });
    registeredListeners.length = 0;
    globalListenersBound = false;

    // Reset dataset flags on persistent DOM elements for clean re-init
    const burger = document.getElementById('burger');
    if (burger) delete burger.dataset.bound;

    const toggleBtn = document.getElementById('projects-toggle-btn');
    if (toggleBtn) delete toggleBtn.dataset.bound;

    const projectsLink = document.getElementById('nav-projects');
    if (projectsLink) delete projectsLink.dataset.toggleBound;

    const avatar = document.getElementById('top-avatar');
    if (avatar) {
      delete avatar.dataset.bound;
      avatar.onclick = null;
    }

    const panel = document.getElementById('spa-user-panel') || document.getElementById('user-panel') || dashboardUserPanel;
    if (panel) {
      delete panel.dataset.dragBound;
      const logout = panel.querySelector('.up-logout');
      if (logout) delete logout.dataset.spaBound;
      const recycle = panel.querySelector('#up-recycle-bin');
      if (recycle) delete recycle.dataset.spaBound;
    }

    const backdrop = document.getElementById('spa-user-panel-backdrop') || userPanelBackdrop;
    if (backdrop) delete backdrop.dataset.bound;

    const mobNav = document.getElementById('spa-mobile-nav') || mobileBottomNav;
    if (mobNav) {
      delete mobNav.dataset.gesturesBound;
      delete mobNav.dataset.viewportBound;
    }

    document.querySelectorAll('[data-spa-bound]').forEach(el => {
      delete el.dataset.spaBound;
    });

    lastRenderedProjectsJSON = null;
    dashboardSidebar = null;
    dashboardTopbar = null;
    dashboardUserPanel = null;
    userPanelBackdrop = null;
    mobileBottomNav = null;
    burgerContainer = null;
    sideLogo = null;
    updateMobNavVisual = null;
    isNavInteracting = false;
  }

  const AppShell = {
    init: (...args) => init(...args),
    setPendingRoute,
    updateRoute: (...args) => updateRoute(...args),
    expandSidebar: (...args) => expandSidebar(...args),
    updateSidebarProjects: (...args) => updateSidebarProjects(...args),
    toggleUserPanel: (...args) => toggleUserPanel(...args),
    collapseProjectsGroup: (...args) => collapseProjectsGroup(...args),
    updateRailHoles: (...args) => updateRailHoles(...args),
    updateMobileBottomNavActive: (...args) => updateMobileBottomNavActive(...args),
    syncUserProfile: (...args) => syncUserProfile(...args),
    isMobileView: (...args) => isMobileView(...args),
    destroy: (...args) => destroy(...args)
  };

  window.AppShell = AppShell;

  // Compatibility Bridges for legacy callers (safely decoupled from `this` context)
  window.updateSidebarProjects = function (...args) {
    return AppShell.updateSidebarProjects(...args);
  };
  window.toggleUserPanel = function (...args) {
    return AppShell.toggleUserPanel(...args);
  };
  window.expandSidebar = function (...args) {
    return AppShell.expandSidebar(...args);
  };
  window.updateMobileBottomNavActive = function (...args) {
    return AppShell.updateMobileBottomNavActive(...args);
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppShell;
  }
})();
