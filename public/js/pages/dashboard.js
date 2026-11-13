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
        <div class="project-preview-primary skeleton-pulse"></div>
      </div>
      <div class="project-folder-shell">
        <div class="project-folder-header-row">
          <div class="project-folder-tab"><span class="project-folder-tab-dot"></span></div>
          <div class="project-folder-notch-wrap">
            <div class="project-option-slot"><div class="project-option-btn skeleton-pulse"></div></div>
          </div>
        </div>
        <div class="project-folder-content">
          <div class="project-updated skeleton-pulse">&nbsp;</div>
          <div class="project-title-wrapper"><div class="project-title skeleton-pulse">&nbsp;</div></div>
          <div class="project-meta">
            <span class="project-meta-pill skeleton-pulse">&nbsp; &nbsp; &nbsp;</span>
            <span class="project-meta-pill skeleton-pulse">&nbsp; &nbsp; &nbsp;</span>
          </div>
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

  function buildHeroModel(projects, failed = false) {
    if (failed) return { state: 'error', title: '故事，從下一個鏡頭繼續。', context: '暫時無法載入最近創作，仍可先瀏覽敘事模板。', images: [] };
    if (!Array.isArray(projects)) return { state: 'loading', title: '故事，從下一個鏡頭繼續。', context: '正在載入最近創作…', images: [] };
    const project = getRecentProjects(projects)[0];
    if (!project) return { state: 'empty', title: '把故事，排成下一個鏡頭。', context: '用 QC 記下第一個想法，或先從敘事模板尋找節奏。', images: [] };
    const candidates = [...(Array.isArray(project.previewImages) ? project.previewImages : []), ...(Array.isArray(project.shots) ? project.shots : []).map(shot => shot.payload?.image)];
    const images = [...new Set(candidates.filter(url => typeof url === 'string' && /^(https?:\/\/|\/(?!\/)|\.{1,2}\/)/i.test(url)))].slice(0, 3);
    return { state: 'project', id: project.id, title: project.title || '未命名分鏡', context: '接續最近編輯的分鏡，讓畫面與節奏再往前一步。', images };
  }

  function renderHero(root, projects, navigate, failed = false) {
    const find = id => root?.querySelector('#' + id) || document.getElementById(id);
    const hero = find('home-hero-card'), title = find('workspace-hero-title'), context = find('workspace-hero-context');
    if (!hero || !title || !context) return;
    const model = buildHeroModel(projects, failed);hero.dataset.state = model.state;title.textContent = model.title;context.textContent = model.context;
    const resume = find('workspace-hero-resume');
    if (resume) {
      resume.hidden = model.state !== 'project';resume.href = model.state === 'project' ? '/project/' + encodeURIComponent(model.id) : '/projects';
      resume.onclick = event => { if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate('project', {id: model.id}); };
    }
    const frames = find('workspace-hero-frames');if (!frames) return;
    frames.textContent = '';frames.dataset.count = String(model.images.length);frames.setAttribute('aria-label', model.images.length ? '最近分鏡的畫面' : '分鏡構圖');
    const addEmpty = () => {
      const frame = document.createElement('div');frame.className = 'workspace-frame workspace-frame-empty';frame.setAttribute('aria-hidden','true');
      for (const text of ['畫面', '運鏡 / 秒數']) {const label = document.createElement('span');label.textContent = text;frame.appendChild(label);}frames.appendChild(frame);
    };
    if (!model.images.length) addEmpty();
    model.images.forEach((url,index) => {
      const frame = document.createElement('figure');frame.className = 'workspace-frame';
      const image = document.createElement('img');image.src = url;image.alt = '分鏡畫面 ' + (index + 1);image.decoding = 'async';
      image.onerror = () => {image.remove();frame.classList.add('workspace-frame-empty');frame.textContent = '畫面尚未載入';};
      frame.appendChild(image);frames.appendChild(frame);
    });
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

    const homeAvatar = el('home-account-trigger');
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

      renderHero(root, list, navFn);
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
        renderHero(root, null, navFn);
        recentProjectsGrid.innerHTML = SKELETON_RECENT_CARDS_HTML;
        if (global.ProjectStore && typeof global.ProjectStore.fetchProjects === 'function') {
          global.ProjectStore.fetchProjects({ signal, force: false })
            .then(() => {
              if (isMounted) updateRecentView();
            })
            .catch(() => {
              if (isMounted && !global.ProjectStore.getProjects()) {
                renderHero(root, null, navFn, true);
                renderEmptyRecentState(recentProjectsGrid, () => {
                  if (global.AICreationController) global.AICreationController.openQuickCompose();
                  else navFn('generate');
                });
                const title = recentProjectsGrid.querySelector('.home-empty-title');
                const description = recentProjectsGrid.querySelector('.home-empty-desc');
                if (title) title.textContent = '暫時無法載入最近分鏡';
                if (description) description.textContent = '請稍後再試。你仍可用 QC 記下創作想法。';
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
      const resume = root?.querySelector('#workspace-hero-resume');
      if (resume) resume.onclick = null;
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
    buildHeroModel,
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
