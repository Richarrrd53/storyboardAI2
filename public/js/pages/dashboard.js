/**
 * StoryboardAI — Dashboard Page Module
 * 
 * 負責首頁 Dashboard 頁面組裝、問候語/使用者資訊呈現、最近專案 (Recent Projects) 區塊渲染、
 * Quick Actions 導航事件與生命週期管理。
 * 遵循統一 Page Lifecycle 契約：mount() 回傳 { unmount() }
 */

(function (global) {
  'use strict';

  const SKELETON_RECENT_CARDS_HTML = Array.from({ length: 4 }).map(() => `
    <div class="project-card project-folder-card skeleton variant-compact">
      <div class="project-folder-preview-stack">
        <div class="project-preview-primary skeleton-pulse" style="background: #1e293b; width: 100%; height: 110px; border-radius: 12px;"></div>
      </div>
      <div class="project-folder-shell">
        <div class="project-folder-header-row">
          <div class="project-folder-tab"><span class="project-folder-tab-dot"></span></div>
          <div class="project-folder-shelf"></div>
        </div>
        <div class="project-folder-content">
          <div class="skeleton-pulse" style="background: #e2e8f0; height: 0.7rem; border-radius: 4px; width: 35%; margin-bottom: 4px;"></div>
          <div class="skeleton-pulse" style="background: #e2e8f0; height: 0.95rem; border-radius: 4px; width: 70%; margin-bottom: 6px;"></div>
        </div>
      </div>
    </div>
  `).join('');

  function renderEmptyRecentState(container, onOpenQC) {
    if (!container) return;
    container.innerHTML = `
      <div class="home-empty-recent-card">
        <div class="home-empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary, #2563eb);"><path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8H4Z"/><path d="m4 11 2.3-4.6A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.8 1.4L20 11H4Z"/><path d="m6.5 5 2 6"/><path d="m11.5 5 2 6"/><path d="m16.5 5 2 6"/></svg>
        </div>
        <h3 class="home-empty-title">尚無最近編輯的分鏡</h3>
        <p class="home-empty-desc">點擊右下角 QC 創作按鈕，快速記錄你的第一個分鏡創意！</p>
        <button class="home-empty-qc-btn" type="button" id="home-empty-create-btn">
          <span>開啟 QC 創作</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    `;

    const emptyBtn = container.querySelector('#home-empty-create-btn');
    if (emptyBtn) {
      emptyBtn.onclick = () => {
        if (typeof onOpenQC === 'function') onOpenQC();
      };
    }
  }

  function getRecentProjects(projectsList) {
    if (!Array.isArray(projectsList)) return [];
    const isPendingDelete = (id) => {
      if (global.ProjectDeleteQueue && typeof global.ProjectDeleteQueue.isPending === 'function') {
        return global.ProjectDeleteQueue.isPending(id);
      }
      return false;
    };

    return projectsList
      .filter(p => !p.is_deleted && !isPendingDelete(p.id))
      .sort((a, b) => new Date(b.updateAt || b.createAt) - new Date(a.updateAt || a.createAt))
      .slice(0, 4);
  }

  function renderRecentProjectsList(recentGrid, recentProjects, onCardMutate) {
    if (!recentGrid) return;
    recentGrid.innerHTML = '';
    if (recentProjects.length === 0) {
      renderEmptyRecentState(recentGrid, () => {
        if (global.AICreationController) {
          global.AICreationController.openQuickCompose();
        } else if (typeof global.spaNavigate === 'function') {
          global.spaNavigate('generate');
        }
      });
      return;
    }

    recentProjects.forEach(p => {
      const card = document.createElement('div');
      if (global.ProjectCard && typeof global.ProjectCard.buildHomeRecentCardHTML === 'function') {
        card.innerHTML = global.ProjectCard.buildHomeRecentCardHTML(p);
      } else if (typeof global.buildHomeRecentCardHTML === 'function') {
        card.innerHTML = global.buildHomeRecentCardHTML(p);
      }

      card.dataset.variant = 'compact';
      if (typeof global.setupProjectCardEvents === 'function') {
        global.setupProjectCardEvents(card, p, false, () => {
          if (typeof onCardMutate === 'function') onCardMutate();
        });
      }
      recentGrid.appendChild(card);
    });

    if (typeof global.lazyLoadProjectThumbs === 'function') {
      global.lazyLoadProjectThumbs(recentGrid);
    }
  }

  function updateGreeting(root) {
    const greetingEl = (root ? root.querySelector('#home-greeting-text') : null) || document.getElementById('home-greeting-text');
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let timeGreet = '晚上好';
    if (hour >= 5 && hour < 11) timeGreet = '早安';
    else if (hour >= 11 && hour < 14) timeGreet = '午安';
    else if (hour >= 14 && hour < 18) timeGreet = '下午好';
    greetingEl.textContent = `${timeGreet}，今天想繼續哪個創作？`;
  }

  function bindQuickActionEvents(root, navFn) {
    const el = (id) => (root ? root.querySelector(`#${id}`) : null) || document.getElementById(id);

    // Hero Explore
    const exploreBtn = el('hero-explore-btn');
    if (exploreBtn) {
      exploreBtn.onclick = (e) => {
        e.preventDefault();
        navFn('template');
      };
    }

    // Desktop Quick Actions
    const qaScript = el('qa-script-analysis');
    if (qaScript) {
      qaScript.onclick = (e) => {
        e.preventDefault();
        if (global.AICreationController) global.AICreationController.openQuickCompose();
        else navFn('generate', { targetPhase: 1 });
      };
    }

    const qaTemplate = el('qa-template-hook');
    if (qaTemplate) {
      qaTemplate.onclick = (e) => {
        e.preventDefault();
        navFn('template');
      };
    }

    const qaDiscovery = el('qa-discovery-search');
    if (qaDiscovery) {
      qaDiscovery.onclick = (e) => {
        e.preventDefault();
        navFn('discovery');
      };
    }

    // Mobile shortcut buttons
    const mobScript = el('mob-shortcut-script');
    if (mobScript) {
      mobScript.onclick = (e) => {
        e.preventDefault();
        if (global.AICreationController) global.AICreationController.openQuickCompose();
        else navFn('generate', { targetPhase: 1 });
      };
    }

    const mobCreate = el('mob-shortcut-create');
    if (mobCreate) {
      mobCreate.onclick = (e) => {
        e.preventDefault();
        if (global.AICreationController) global.AICreationController.openQuickCompose();
        else navFn('generate');
      };
    }

    const mobTemplate = el('mob-shortcut-template');
    if (mobTemplate) {
      mobTemplate.onclick = (e) => {
        e.preventDefault();
        navFn('template');
      };
    }

    const mobDiscovery = el('mob-shortcut-discovery');
    if (mobDiscovery) {
      mobDiscovery.onclick = (e) => {
        e.preventDefault();
        navFn('discovery');
      };
    }

    // Notification & Avatar
    const notifyBtn = el('home-notify-btn');
    if (notifyBtn) {
      notifyBtn.onclick = () => {
        if (typeof global.showSpaToast === 'function') {
          global.showSpaToast('目前暫無新通知');
        }
      };
    }

    const homeAvatar = el('home-top-avatar');
    if (homeAvatar) {
      homeAvatar.onclick = (e) => {
        e.stopPropagation();
        if (typeof global.toggleUserPanel === 'function') {
          global.toggleUserPanel();
        }
      };
    }
  }

  async function mount(context = {}) {
    const { root, signal, navigate } = context;
    let isMounted = true;

    const navFn = typeof navigate === 'function' ? navigate : (p, o) => {
      if (typeof global.spaNavigate === 'function') global.spaNavigate(p, o);
    };

    // 1. 問候語與頁面特定事件綁定
    updateGreeting(root);
    bindQuickActionEvents(root, navFn);

    // 2. 使用者資訊資料來源呈現 (非阻塞)
    if (global.spaAuth && typeof global.spaAuth.isLoggedIn === 'function' && global.spaAuth.isLoggedIn()) {
      if (typeof global.spaAuth.fetchUser === 'function') {
        global.spaAuth.fetchUser(signal).then(result => {
          if (!isMounted) return;
          if (result && result.user) {
            const nameEl = (root ? root.querySelector('#home-user-name') : null) || document.getElementById('home-user-name');
            if (nameEl) nameEl.textContent = result.user.name || '創作者';
          }
        }).catch(() => {});
      }
    }

    // 3. 最近分鏡區塊 (Recent Projects) SWR 讀取
    const recentProjectsGrid = (root ? root.querySelector('#recent-projects-grid') : null) || document.getElementById('recent-projects-grid');

    function updateRecentView() {
      if (!isMounted || !recentProjectsGrid) return;
      const list = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
        ? global.ProjectStore.getProjects()
        : null;

      if (!list) {
        recentProjectsGrid.innerHTML = SKELETON_RECENT_CARDS_HTML;
        return;
      }

      const recentProjects = getRecentProjects(list);
      renderRecentProjectsList(recentProjectsGrid, recentProjects, () => {
        updateRecentView();
        if (typeof global.updateSidebarProjects === 'function') {
          global.updateSidebarProjects();
        }
      });
    }

    if (recentProjectsGrid) {
      const cached = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
        ? global.ProjectStore.getProjects()
        : null;

      if (cached) {
        updateRecentView();
        if (global.ProjectStore && typeof global.ProjectStore.fetchProjects === 'function') {
          global.ProjectStore.fetchProjects({ signal, force: false }).catch(() => {});
        }
      } else {
        recentProjectsGrid.innerHTML = SKELETON_RECENT_CARDS_HTML;
        if (global.ProjectStore && typeof global.ProjectStore.fetchProjects === 'function') {
          global.ProjectStore.fetchProjects({ signal, force: false })
            .then(() => {
              if (isMounted) updateRecentView();
            })
            .catch(() => {
              if (isMounted && !global.ProjectStore.getProjects()) {
                renderEmptyRecentState(recentProjectsGrid, () => {
                  if (global.AICreationController) global.AICreationController.openQuickCompose();
                  else navFn('generate');
                });
              }
            });
        }
      }
    }

    // 4. 訂閱 ProjectStore 狀態更新
    let unsubscribeStore = null;
    if (global.ProjectStore && typeof global.ProjectStore.subscribe === 'function') {
      unsubscribeStore = global.ProjectStore.subscribe((projects, event) => {
        if (!isMounted) return;
        updateRecentView();
      });
    }

    // 5. 接入 Dynamic Gradient Mask (垂直內容身與水平最近專案 Viewport)
    const contentBody = (root ? root.querySelector('.home-body') : null) || document.querySelector('.home-body') || document.querySelector('.content-body');
    if (contentBody && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.attach === 'function') {
      global.DynamicMaskSystem.attach(contentBody, { maskSize: 36, direction: 'vertical' });
    }

    const recentViewport = (root ? root.querySelector('#home-recent-viewport') : null) || document.getElementById('home-recent-viewport');
    if (recentViewport && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.attach === 'function') {
      global.DynamicMaskSystem.attach(recentViewport, { maskSize: 28, direction: 'horizontal' });
    }

    // 6. 生命週期卸載契約 (Unmount Contract)
    function unmount() {
      if (!isMounted) return;
      isMounted = false;
      if (signal) {
        signal.removeEventListener('abort', unmount);
      }
      if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
      }
      if (contentBody && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.detach === 'function') {
        global.DynamicMaskSystem.detach(contentBody);
      }
      if (recentViewport && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.detach === 'function') {
        global.DynamicMaskSystem.detach(recentViewport);
      }
    }

    if (signal) {
      if (signal.aborted) {
        unmount();
        return { unmount };
      }
      signal.addEventListener('abort', unmount, { once: true });
    }

    return {
      unmount
    };
  }

  const DashboardPage = {
    mount,
    getRecentProjects,
    renderRecentProjectsList,
    renderEmptyRecentState,
    updateGreeting
  };

  if (typeof global !== 'undefined') {
    global.DashboardPage = DashboardPage;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardPage;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
