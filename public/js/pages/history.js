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
      .sort((a, b) => new Date(b.deletedAt || b.updateAt || b.createAt) - new Date(a.deletedAt || a.updateAt || a.createAt));
  }

  function renderHistoryList(projectsGrid, deletedProjects, onCardMutate, selectionController = null) {
    if (!projectsGrid) return;
    if (global.ProjectCardInteractions?.destroyWithin) {
      global.ProjectCardInteractions.destroyWithin(projectsGrid);
    }
    projectsGrid.innerHTML = '';
    if (deletedProjects.length === 0) {
      renderEmptyState(projectsGrid);
      selectionController?.syncItems?.([]);
      return;
    }

    deletedProjects.forEach(p => {
      const card = document.createElement('div');
      if (global.ProjectCard && typeof global.ProjectCard.buildLightFilmCardHTML === 'function') {
        card.innerHTML = global.ProjectCard.buildLightFilmCardHTML(p, true);
      } else if (typeof global.buildLightFilmCardHTML === 'function') {
        card.innerHTML = global.buildLightFilmCardHTML(p, true);
      }

      if (global.ProjectCardInteractions?.bind) {
        global.ProjectCardInteractions.bind(card, p, {
          isHistoryPage: true,
          selectionController,
          refreshCallback: () => {
            if (typeof onCardMutate === 'function') onCardMutate();
          }
        });
      } else if (typeof global.setupProjectCardEvents === 'function') {
        global.setupProjectCardEvents(card, p, true, () => {
          if (typeof onCardMutate === 'function') onCardMutate();
        });
      }
      projectsGrid.appendChild(card);
    });

    selectionController?.syncItems?.(deletedProjects.map(p => String(p.id)));

    if (typeof global.lazyLoadProjectThumbs === 'function') {
      global.lazyLoadProjectThumbs(projectsGrid);
    }
  }

  async function mount(context = {}) {
    const { root, signal } = context;
    let isMounted = true;
    let isBatchBusy = false;
    let currentDeletedIds = [];

    const find = selector => (root ? root.querySelector(selector) : null) || document.querySelector(selector);
    const projectsGrid = find('#projects-grid');
    if (!projectsGrid) {
      return { unmount() {} };
    }

    const historyMain = root?.classList?.contains?.('history-main') ? root : find('.history-main');
    const historyHeader = find('.history-header');
    const historyBody = find('.history-body');
    const backButton = root?.querySelector('.history-back-btn');
    const headerActions = find('#history-header-actions');
    const selectModeBtn = find('#history-select-mode-btn');
    const bottomDock = find('#history-bottom-dock');
    const restoreAllBtn = find('#history-restore-all-btn');
    const emptyTrashBtn = find('#history-empty-trash-btn');
    const selectionBar = find('#history-selection-bar');
    const selectionCountEl = find('#history-selection-count');
    const batchRestoreBtn = find('#history-batch-restore-btn');
    const batchDeleteBtn = find('#history-batch-delete-btn');
    const selectAllBtn = find('#history-select-all-btn');
    const cancelSelectBtn = find('#history-cancel-select-btn');

    document?.body?.classList?.add?.('is-history-page');

    const goBack = event => {
      if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const navigate = context.navigate || global.spaNavigate;
      if (typeof navigate === 'function') { event.preventDefault(); navigate('projects'); }
    };
    backButton?.addEventListener('click', goBack);

    function syncSelectionUI(selState) {
      const active = Boolean(selState?.active);
      const count = selState?.count || 0;
      root?.classList?.toggle?.('is-selection-active', active);
      historyMain?.classList?.toggle?.('is-selection-active', active);
      historyHeader?.setAttribute?.('aria-hidden', active ? 'true' : 'false');
      if (historyBody && global.DynamicMaskSystem?.update) {
        global.DynamicMaskSystem.update(historyBody);
      }
      if (selectionBar) {
        selectionBar.classList?.toggle?.('is-visible', active);
        selectionBar.setAttribute?.('aria-hidden', active ? 'false' : 'true');
      }
      if (bottomDock) {
        bottomDock.classList?.toggle?.('is-selection-active', active);
        bottomDock.querySelector?.('.selection-dock-group--default')?.setAttribute?.('aria-hidden', active ? 'true' : 'false');
        bottomDock.querySelector?.('.selection-dock-group--selection')?.setAttribute?.('aria-hidden', active ? 'false' : 'true');
      }
      if (selectionCountEl) {
        selectionCountEl.textContent = `已選取 ${count} 項`;
      }
      if (batchRestoreBtn) batchRestoreBtn.disabled = isBatchBusy || count === 0;
      if (batchDeleteBtn) batchDeleteBtn.disabled = isBatchBusy || count === 0;
      if (selectAllBtn) selectAllBtn.disabled = isBatchBusy || currentDeletedIds.length === 0;
    }

    const selectionController = global.ProjectSelectionController?.create
      ? global.ProjectSelectionController.create({
          container: projectsGrid,
          scrollContainer: historyBody || projectsGrid.parentElement,
          mode: 'history',
          getOrderedIds: () => currentDeletedIds,
          onChange: syncSelectionUI
        })
      : null;

    if (selectionController) {
      projectsGrid._selectionController = selectionController;
    }

    const listeners = [];
    const listen = (el, type, fn) => {
      if (!el) return;
      el.addEventListener(type, fn);
      listeners.push(() => el.removeEventListener(type, fn));
    };

    const runBatch = async (fn) => {
      if (isBatchBusy || !isMounted) return;
      isBatchBusy = true;
      syncSelectionUI({ active: selectionController?.isActive(), count: selectionController?.getCount?.() || 0 });
      try {
        await fn();
      } finally {
        isBatchBusy = false;
        if (isMounted) {
          syncSelectionUI({ active: selectionController?.isActive(), count: selectionController?.getCount?.() || 0 });
        }
      }
    };

    listen(selectModeBtn, 'click', () => {
      selectionController?.enter?.();
    });

    listen(restoreAllBtn, 'click', () => runBatch(async () => {
      const res = await global.ProjectActions?.batchRestoreProjects?.([], () => updateView(), { all: true });
      if (res?.ok) selectionController?.clear();
    }));

    listen(emptyTrashBtn, 'click', () => runBatch(async () => {
      const res = await global.ProjectActions?.emptyTrash?.(() => updateView());
      if (res?.ok) selectionController?.clear();
    }));

    listen(batchRestoreBtn, 'click', () => runBatch(async () => {
      const ids = selectionController?.getSelectedIds() || [];
      const res = await global.ProjectActions?.batchRestoreProjects?.(ids, () => updateView());
      if (res?.ok) selectionController?.clear();
    }));

    listen(batchDeleteBtn, 'click', () => runBatch(async () => {
      const ids = selectionController?.getSelectedIds() || [];
      const res = await global.ProjectActions?.batchPermanentDeleteProjects?.(ids, () => updateView());
      if (res?.ok) selectionController?.clear();
    }));

    listen(selectAllBtn, 'click', () => {
      selectionController?.selectAll();
    });

    listen(cancelSelectBtn, 'click', () => {
      selectionController?.clear();
    });

    function updateView() {
      if (!isMounted) return;
      const list = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
        ? global.ProjectStore.getProjects()
        : null;

      if (!list) {
        projectsGrid.innerHTML = SKELETON_CARDS_HTML;
        if (headerActions) headerActions.hidden = true;
        bottomDock?.classList?.add?.('is-empty');
        return;
      }

      const deletedProjects = getDeletedProjects(list);
      currentDeletedIds = deletedProjects.map(p => String(p.id));
      const isEmpty = deletedProjects.length === 0;
      if (headerActions) {
        headerActions.hidden = isEmpty;
      }
      bottomDock?.classList?.toggle?.('is-empty', isEmpty);
      if (isEmpty && selectionController?.isActive?.()) {
        selectionController.clear();
      }
      renderHistoryList(projectsGrid, deletedProjects, () => {
        updateView();
        if (typeof global.updateSidebarProjects === 'function') {
          global.updateSidebarProjects();
        }
      }, selectionController);
    }

    // 1. 先訂閱 ProjectStore 狀態更新（僅監聽 list/session 範圍）
    let hasCommittedProjects = false;
    let unsubscribeStore = null;
    if (global.ProjectStore && typeof global.ProjectStore.subscribe === 'function') {
      unsubscribeStore = global.ProjectStore.subscribe((projects, event) => {
        if (!isMounted) return;
        if (event && event.scope === 'detail') return;
        if (event && event.type === 'detail_prefetched') return;
        if (event && event.changed === false && hasCommittedProjects) return;
        hasCommittedProjects = true;
        updateView();
      }, { scopes: ['list', 'session'], ignorePrefetch: true });
    }

    // 2. 畫面首載：快取優先 (Stale-While-Revalidate)
    const cached = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
      ? global.ProjectStore.getProjects()
      : null;

    if (cached) {
      hasCommittedProjects = true;
      updateView();
      if (global.ProjectStore && typeof global.ProjectStore.fetchProjects === 'function') {
        global.ProjectStore.fetchProjects({ signal, force: false }).catch(() => {});
      }
    } else {
      projectsGrid.innerHTML = SKELETON_CARDS_HTML;
      if (global.ProjectStore && typeof global.ProjectStore.fetchProjects === 'function') {
        global.ProjectStore.fetchProjects({ signal, force: false })
          .then((resolved) => {
            if (isMounted && !hasCommittedProjects && Array.isArray(resolved) && global.ProjectStore.getProjects()) {
              hasCommittedProjects = true;
              updateView();
            }
          })
          .catch(() => {
            if (isMounted && !global.ProjectStore.getProjects()) {
              renderEmptyState(projectsGrid);
            }
          });
      }
    }

    // 3. 接入 Dynamic Gradient Mask
    if (historyBody && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.attach === 'function') {
      global.DynamicMaskSystem.attach(historyBody, { maskSize: 36, direction: 'vertical' });
    }

    // 4. 生命週期卸載契約 (Unmount Contract)
    function unmount() {
      if (!isMounted) return;
      isMounted = false;
      document?.body?.classList?.remove?.('is-history-page');
      root?.classList?.remove?.('is-selection-active');
      historyMain?.classList?.remove?.('is-selection-active');
      backButton?.removeEventListener('click', goBack);
      listeners.forEach(off => off());
      listeners.length = 0;
      if (selectionController) {
        selectionController.destroy();
        if (projectsGrid._selectionController === selectionController) {
          delete projectsGrid._selectionController;
        }
      }
      if (global.ProjectCardInteractions?.destroyWithin) {
        global.ProjectCardInteractions.destroyWithin(projectsGrid);
      }
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
