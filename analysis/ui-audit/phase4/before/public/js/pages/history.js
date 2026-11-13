/**
 * StoryboardAI — History Page Module
 * 
 * 負責「資源回收桶」頁面的組裝、骨架屏、已刪除分鏡過濾、列表渲染與生命週期管理。
 * 遵循統一 Page Lifecycle 契約：mount() 回傳 { unmount() }
 */

(function (global) {
  'use strict';

  const SKELETON_CARDS_HTML = Array.from({ length: 4 }).map(() => `
    <div class="project-card project-folder-card skeleton">
      <div class="project-folder-preview-stack">
        <div class="project-preview-primary skeleton-pulse" style="background: #1e293b; width: 88%; max-width: 256px; height: 142px; border-radius: 14px;"></div>
      </div>
      <div class="project-folder-shell">
        <div class="project-folder-header-row">
          <div class="project-folder-tab">
            <span class="project-folder-tab-dot"></span>
          </div>
          <div class="project-folder-shelf"></div>
          <div class="project-folder-notch-wrap">
            <div class="project-option-slot">
              <div class="skeleton-pulse" style="width: 36px; height: 32px; border-radius: 9999px; background: #e2e8f0;"></div>
            </div>
          </div>
        </div>
        <div class="project-folder-content">
          <div class="skeleton-pulse" style="background: #e2e8f0; height: 0.75rem; border-radius: 4px; width: 30%; margin-bottom: 6px;"></div>
          <div class="skeleton-pulse" style="background: #e2e8f0; height: 1.1rem; border-radius: 4px; width: 75%; margin-bottom: 10px;"></div>
          <div style="display: flex; gap: 8px;">
            <div class="skeleton-pulse" style="background: #f1f5f9; height: 26px; width: 64px; border-radius: 9999px;"></div>
            <div class="skeleton-pulse" style="background: #f1f5f9; height: 26px; width: 78px; border-radius: 9999px;"></div>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  function renderEmptyState(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="projects-empty">
        <h3>資源回收桶目前是空的</h3>
        <p>刪除的分鏡將會暫時保留在此處，以便日後還原。</p>
      </div>
    `;
  }

  function getDeletedProjects(projectsList) {
    if (!Array.isArray(projectsList)) return [];
    const isPendingDelete = (id) => {
      if (global.ProjectDeleteQueue && typeof global.ProjectDeleteQueue.isPending === 'function') {
        return global.ProjectDeleteQueue.isPending(id);
      }
      return false;
    };

    return projectsList
      .filter(p => p.is_deleted && !isPendingDelete(p.id))
      .sort((a, b) => new Date(b.updateAt || b.createAt) - new Date(a.updateAt || a.createAt));
  }

  function renderHistoryList(projectsGrid, deletedProjects, onCardMutate) {
    if (!projectsGrid) return;
    projectsGrid.innerHTML = '';
    if (deletedProjects.length === 0) {
      renderEmptyState(projectsGrid);
      return;
    }

    deletedProjects.forEach(p => {
      const card = document.createElement('div');
      if (global.ProjectCard && typeof global.ProjectCard.buildLightFilmCardHTML === 'function') {
        card.innerHTML = global.ProjectCard.buildLightFilmCardHTML(p, true);
      } else if (typeof global.buildLightFilmCardHTML === 'function') {
        card.innerHTML = global.buildLightFilmCardHTML(p, true);
      }

      if (typeof global.setupProjectCardEvents === 'function') {
        global.setupProjectCardEvents(card, p, true, () => {
          if (typeof onCardMutate === 'function') onCardMutate();
        });
      }
      projectsGrid.appendChild(card);
    });

    if (typeof global.lazyLoadProjectThumbs === 'function') {
      global.lazyLoadProjectThumbs(projectsGrid);
    }
  }

  async function mount(context = {}) {
    const { root, signal } = context;
    let isMounted = true;

    const projectsGrid = (root ? root.querySelector('#projects-grid') : null) || document.getElementById('projects-grid');
    if (!projectsGrid) {
      return { unmount() {} };
    }

    function updateView() {
      if (!isMounted) return;
      const list = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
        ? global.ProjectStore.getProjects()
        : null;

      if (!list) {
        projectsGrid.innerHTML = SKELETON_CARDS_HTML;
        return;
      }

      const deletedProjects = getDeletedProjects(list);
      renderHistoryList(projectsGrid, deletedProjects, () => {
        updateView();
        if (typeof global.updateSidebarProjects === 'function') {
          global.updateSidebarProjects();
        }
      });
    }

    // 1. 畫面首載：快取優先 (Stale-While-Revalidate)
    const cached = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
      ? global.ProjectStore.getProjects()
      : null;

    if (cached) {
      updateView();
      if (global.ProjectStore && typeof global.ProjectStore.fetchProjects === 'function') {
        global.ProjectStore.fetchProjects({ signal, force: false }).catch(() => {});
      }
    } else {
      projectsGrid.innerHTML = SKELETON_CARDS_HTML;
      if (global.ProjectStore && typeof global.ProjectStore.fetchProjects === 'function') {
        global.ProjectStore.fetchProjects({ signal, force: false })
          .then(() => {
            if (isMounted) updateView();
          })
          .catch(() => {
            if (isMounted && !global.ProjectStore.getProjects()) {
              renderEmptyState(projectsGrid);
            }
          });
      }
    }

    // 2. 訂閱 ProjectStore 狀態更新
    let unsubscribeStore = null;
    if (global.ProjectStore && typeof global.ProjectStore.subscribe === 'function') {
      unsubscribeStore = global.ProjectStore.subscribe((projects, event) => {
        if (!isMounted) return;
        updateView();
      });
    }

    // 3. 接入 Dynamic Gradient Mask
    const historyBody = (root ? root.querySelector('.history-body') : null) || document.querySelector('.history-body');
    if (historyBody && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.attach === 'function') {
      global.DynamicMaskSystem.attach(historyBody, { maskSize: 36, direction: 'vertical' });
    }

    // 4. 生命週期卸載契約 (Unmount Contract)
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
      if (historyBody && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.detach === 'function') {
        global.DynamicMaskSystem.detach(historyBody);
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

  const HistoryPage = {
    mount,
    getDeletedProjects,
    renderHistoryList,
    renderEmptyState
  };

  if (typeof global !== 'undefined') {
    global.HistoryPage = HistoryPage;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HistoryPage;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
