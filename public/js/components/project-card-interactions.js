/**
 * StoryboardAI — Project Card Interactions Module
 * 
 * 負責專案卡片 (Project Card) 的事件與互動綁定層：
 * - Project Card 點擊與跨頁轉場協調 (Card Click / Entry Transition)
 * - Option Menu 按鈕點擊與事件冒泡防護 (Option Button StopPropagation)
 * - 標題溢出跑馬燈互動 (Title Marquee pointerenter / pointerleave)
 * - 卡片懸浮展開與預載互動 (Card Hover is-expanded / pointerleave)
 * - 事件監聽器生命週期管理、去重與清理 (Listener Lifecycle / Dedup / Teardown)
 * 
 * 符合 StoryboardAI Design System & P4-2 規範：
 * - 透過 Bridge 調用 Option Morph、Cover Transition、Navigation 與 ProjectActions
 * - 杜絕重複綁定 (bind idempotency) 與記憶體洩漏 (no detached DOM leaks)
 */

(function (global) {
  'use strict';

  // WeakMap 追蹤卡片綁定狀態與清理回呼
  const cardCleanups = new WeakMap();
  // WeakMap 保存最新專案參考，讓增量更新保留 DOM 與事件綁定且不產生 stale closure
  const cardProjectRef = new WeakMap();

  function updateProject(card, project) {
    if (!card || !project) return;
    cardProjectRef.set(card, project);
    global.ProjectCard?.register?.(card, project);
    if (card.dataset && project.id !== undefined) {
      card.dataset.id = project.id;
    }
  }

  function resolveCurrentProject(card, fallbackProject) {
    const ref = cardProjectRef.get(card) || fallbackProject;
    if (ref?.id && global.ProjectStore?.getProjects) {
      const list = global.ProjectStore.getProjects();
      if (Array.isArray(list)) {
        const fresh = list.find(item => String(item.id) === String(ref.id));
        if (fresh) return fresh;
      }
    }
    return ref;
  }

  /**
   * 解除單一卡片的所有互動監聽與定時器
   * @param {HTMLElement} card 
   */
  function unbind(card) {
    if (!card) return;

    const cleanup = cardCleanups.get(card) || card._pciCleanup;
    if (typeof cleanup === 'function') {
      try {
        cleanup();
      } catch (err) {
        console.error('Error during ProjectCard unbind:', err);
      }
    }

    cardCleanups.delete(card);
    cardProjectRef.delete(card);
    delete card._pciCleanup;
    delete card.dataset?.interactionsBound;
  }

  /**
   * 清理指定容器內所有專案卡片的互動監聽
   * @param {HTMLElement} container 
   */
  function destroyWithin(container) {
    if (!container) return;
    const cards = container.querySelectorAll ? container.querySelectorAll('.project-card') : [];
    cards.forEach(card => unbind(card));
  }

  /**
   * 綁定單一卡片的事件與互動
   * @param {HTMLElement} card 
   * @param {Object} project 
   * @param {Object|boolean} options 
   * @param {Function} [legacyRefreshCb]
   */
  function bind(card, project, options = {}, legacyRefreshCb) {
    if (!card || !project) return;

    // 正規化參數：支援 bind(card, p, isHistoryPage, refreshCallback)
    let opts = {};
    if (typeof options === 'boolean') {
      opts = {
        isHistoryPage: options,
        refreshCallback: legacyRefreshCb
      };
    } else if (options && typeof options === 'object') {
      opts = { ...options };
      if (legacyRefreshCb && !opts.refreshCallback) {
        opts.refreshCallback = legacyRefreshCb;
      }
    }

    // 1. 冪等性防護：若該卡片已綁定過，先清理舊監聽與定時器
    unbind(card);
    cardProjectRef.set(card, project);
    global.ProjectCard?.register?.(card, project);

    const getCurrentProject = () => resolveCurrentProject(card, project);
    const isDeleted = Boolean(project.is_deleted || opts.isHistoryPage || opts.isHistory);
    const variant = opts.variant || card.dataset?.variant || 'default';
    if (card.dataset) {
      card.dataset.id = project.id;
      card.dataset.variant = variant;
      card.dataset.interactionsBound = 'true';
    }

    // 保留特定現有 class（例如 is-menu-open, is-navigating, is-selected 等）
    const keepClasses = [];
    if (card.classList?.contains('is-menu-open')) keepClasses.push('is-menu-open');
    if (card.classList?.contains('is-navigating')) keepClasses.push('is-navigating');
    if (card.classList?.contains('is-expanded')) keepClasses.push('is-expanded');
    if (card.classList?.contains('is-selected')) keepClasses.push('is-selected');

    card.className = `project-card project-folder-card variant-${variant}${isDeleted ? ' project-card-deleted' : ''}${keepClasses.length ? ' ' + keepClasses.join(' ') : ''}`;

    const cleanupFns = [];
    const getSelectionController = () => opts.selectionController || card.closest?.('#projects-grid')?._selectionController;

    // 2. Option 按鈕點擊與事件冒泡隔離
    const optionBtn = card.querySelector ? card.querySelector('.project-option-btn') : null;
    if (optionBtn) {
      const onOptionClick = (e) => {
        if (e && typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
        const currentProject = getCurrentProject();
        const selCtrl = getSelectionController();
        if (selCtrl?.isActive?.()) {
          selCtrl.handleCardClick?.(currentProject.id, e);
          return;
        }
        if (typeof opts.openOptionMorph === 'function') {
          opts.openOptionMorph(optionBtn, currentProject, card, isDeleted, opts.refreshCallback);
        } else if (typeof global.openGlobalOptionMorph === 'function') {
          global.openGlobalOptionMorph(optionBtn, currentProject, card, isDeleted, opts.refreshCallback);
        }
      };

      optionBtn.addEventListener('click', onOptionClick);
      cleanupFns.push(() => {
        optionBtn.removeEventListener('click', onOptionClick);
      });
    }

    // 2.5 標籤點擊事件防冒泡與篩選委派（支援增量更新標籤 DOM）
    const handleTagPillClick = (e, tagBtn) => {
      if (e && typeof e.stopPropagation === 'function') {
        e.stopPropagation();
      }
      const currentProject = getCurrentProject();
      const selCtrl = getSelectionController();
      if (selCtrl?.isActive?.()) {
        selCtrl.handleCardClick?.(currentProject.id, e);
        return;
      }
      const tag = tagBtn.dataset ? tagBtn.dataset.tag : tagBtn.getAttribute?.('data-tag');
      if (tag) {
        if (typeof opts.onTagClick === 'function') {
          opts.onTagClick(tag, currentProject);
        } else if (typeof global.onProjectCardTagClick === 'function') {
          global.onProjectCardTagClick(tag, currentProject);
        }
      }
    };
    const tagPills = card.querySelectorAll ? card.querySelectorAll('.project-tag-pill') : [];
    if (tagPills.length > 0) {
      tagPills.forEach(tagBtn => {
        const onTagClick = (e) => handleTagPillClick(e, tagBtn);
        tagBtn.addEventListener('click', onTagClick);
        cleanupFns.push(() => {
          tagBtn.removeEventListener('click', onTagClick);
        });
      });
    }

    // 3. 標題溢出跑馬燈互動 (Title Marquee)
    const titleWrapper = card.querySelector ? card.querySelector('.project-title-wrapper') : null;
    const titleEl = card.querySelector ? card.querySelector('.project-title') : null;
    if (titleWrapper && titleEl) {
      let scrollTimer = null;
      let returnTimer = null;

      const onTitleEnter = (event) => {
        if (event?.pointerType === 'touch') return;
        if (global.getComputedStyle?.(titleEl).whiteSpace === 'normal') return;
        const titleMask = global.getComputedStyle?.(titleWrapper);
        if ((titleMask?.maskImage && titleMask.maskImage !== 'none') || (titleMask?.webkitMaskImage && titleMask.webkitMaskImage !== 'none')) return;
        if (global.matchMedia?.('(max-width: 768px)').matches) return;
        const overflow = (titleEl.scrollWidth || 0) - (titleWrapper.clientWidth || 0);
        if (overflow <= 2) return;

        scrollTimer = setTimeout(() => {
          const duration = Math.min(Math.max(overflow / 35, 1.4), 3.0);
          titleEl.style.transition = `transform ${duration}s cubic-bezier(.4, 0, .2, 1)`;
          titleEl.style.transform = `translateX(-${overflow + 8}px)`;

          returnTimer = setTimeout(() => {
            titleEl.style.transition = `transform ${duration * 0.7}s cubic-bezier(.4, 0, .2, 1)`;
            titleEl.style.transform = 'translateX(0)';
          }, (duration * 1000) + 650);
        }, 400);
      };

      const onTitleLeave = () => {
        if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; }
        if (returnTimer) { clearTimeout(returnTimer); returnTimer = null; }
        titleEl.style.transition = 'transform 0.35s cubic-bezier(.4, 0, .2, 1)';
        titleEl.style.transform = 'translateX(0)';
      };

      // A desktop marquee must not survive a resize into a masked mobile title.
      const titleResizeObserver = typeof global.ResizeObserver === 'function'
        ? new global.ResizeObserver(onTitleLeave)
        : null;
      titleResizeObserver?.observe(titleWrapper);

      card.addEventListener('pointerenter', onTitleEnter);
      card.addEventListener('pointerleave', onTitleLeave);

      cleanupFns.push(() => {
        if (scrollTimer) clearTimeout(scrollTimer);
        if (returnTimer) clearTimeout(returnTimer);
        titleResizeObserver?.disconnect();
        card.removeEventListener('pointerenter', onTitleEnter);
        card.removeEventListener('pointerleave', onTitleLeave);
      });
    }

    // 4. 卡片懸浮展開與 Prefetch
    const onCardEnter = (event) => {
      if (event?.pointerType === 'touch') return;
      if (isDeleted || getSelectionController()?.isActive?.()) return;
      card.classList?.add('is-expanded');
      const currentProject = getCurrentProject();
      const prefetchOpts = { id: currentProject.id, intentKey: card };
      if (typeof opts.prefetchPage === 'function') {
        opts.prefetchPage('project', prefetchOpts);
      } else if (typeof global.prefetchPage === 'function') {
        global.prefetchPage('project', prefetchOpts);
      }
    };

    const onCardLeave = () => {
      global.PageAssetLoader?.cancelPrefetchIntent?.(card);
      if (card.classList?.contains('is-menu-open')) return;
      card.classList?.remove('is-expanded');
    };

    card.addEventListener('pointerenter', onCardEnter);
    card.addEventListener('pointerleave', onCardLeave);

    cleanupFns.push(() => {
      global.PageAssetLoader?.cancelPrefetchIntent?.(card);
      card.removeEventListener('pointerenter', onCardEnter);
      card.removeEventListener('pointerleave', onCardLeave);
    });

    // 5. 卡片點擊互動 (Card Click: Entry Transition or Restore)
    let isClickHandling = false;
    let lastClickTime = 0;

    const onCardClick = (e) => {
      const currentProject = getCurrentProject();
      const selCtrl = getSelectionController();
      if (selCtrl?.isActive?.()) {
        if (selCtrl.handleCardClick?.(currentProject.id, e)) {
          return;
        }
      }

      // 確保不是點擊在 Option Button 上
      if (e && e.target && e.target.closest && e.target.closest('.project-option-btn')) {
        return;
      }

      // 委派處理動態增量更新後的標籤 pill 點擊
      const dynamicTagPill = e?.target?.closest?.('button.project-tag-pill[data-tag]');
      if (dynamicTagPill && dynamicTagPill.dataset?.delegatedTag === '1') {
        handleTagPillClick(e, dynamicTagPill);
        return;
      }

      // 多選模式 / 修飾鍵 / 長按抑制：優先交給 ProjectSelectionController 處理
      if (selCtrl && typeof selCtrl.handleCardClick === 'function') {
        if (selCtrl.handleCardClick(currentProject.id, e)) {
          return;
        }
      }

      const titleLink = e?.target?.closest?.('a.project-title');
      if (titleLink) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;
        e.preventDefault?.();
      }

      // 防止短時間內重複觸發 (Card click 仍只觸發一次 transition)
      const now = Date.now();
      if (isClickHandling || (now - lastClickTime < 300)) {
        return;
      }
      isClickHandling = true;
      lastClickTime = now;
      setTimeout(() => { isClickHandling = false; }, 350);

      // (A) 回收桶專案點擊：彈出還原提示
      if (isDeleted) {
        if (selCtrl?.isActive?.() || selCtrl?.shouldSuppressCardClick?.()) {
          return;
        }
        // The feature action owns confirmation. Never treat a Promise as a boolean here.
        const onRestored = () => {
          if (typeof opts.refreshCallback === 'function') opts.refreshCallback();
          if (typeof global.updateSidebarProjects === 'function') global.updateSidebarProjects();
        };
        const restore = [opts.restoreProject, global.restoreProject, global.ProjectActions?.restoreProject]
          .find(action => typeof action === 'function');
        if (typeof restore === 'function') {
          Promise.resolve(restore(currentProject, card, onRestored)).catch(error => {
            console.error('Project restore failed', error);
          });
        }
        return;
      }

      // (B) 正常專案點擊：檢查 prefers-reduced-motion
      if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        if (typeof opts.onNavigate === 'function') {
          opts.onNavigate('project', { id: currentProject.id });
        } else if (typeof global.navigate === 'function') {
          global.navigate('project', { id: currentProject.id });
        } else if (typeof global.spaNavigate === 'function') {
          global.spaNavigate('project', { id: currentProject.id });
        } else if (global.location) {
          global.location.hash = `#/project/${encodeURIComponent(currentProject.id)}`;
        }
        return;
      }

      // (C) 正常專案點擊：觸發 Cover Transition (Project Reveal)
      if (typeof opts.launchRevealTransition === 'function') {
        opts.launchRevealTransition(card, currentProject);
      } else if (typeof global.launchProjectRevealTransition === 'function') {
        global.launchProjectRevealTransition(card, currentProject);
      } else if (typeof opts.onNavigate === 'function') {
        opts.onNavigate('project', { id: currentProject.id });
      } else if (typeof global.navigate === 'function') {
        global.navigate('project', { id: currentProject.id });
      } else if (typeof global.spaNavigate === 'function') {
        global.spaNavigate('project', { id: currentProject.id });
      } else if (global.location) {
        global.location.hash = `#/project/${encodeURIComponent(currentProject.id)}`;
      }
    };

    card.addEventListener('click', onCardClick);

    cleanupFns.push(() => {
      card.removeEventListener('click', onCardClick);
    });

    // 註冊卡片清理函式
    const cardCleanup = () => {
      cleanupFns.forEach(fn => {
        try { fn(); } catch (_) {}
      });
      cleanupFns.length = 0;
    };

    cardCleanups.set(card, cardCleanup);
    card._pciCleanup = cardCleanup;

    return {
      unbind: () => unbind(card)
    };
  }

  /**
   * 批次綁定容器內所有專案卡片
   * @param {HTMLElement} container 
   * @param {Array} projects 
   * @param {Object} options 
   */
  function bindAll(container, projects = [], options = {}) {
    if (!container) return;
    const cards = container.querySelectorAll ? container.querySelectorAll('.project-card') : [];
    if (!cards || !cards.length) return;

    if (Array.isArray(projects) && projects.length) {
      const projectMap = new Map();
      projects.forEach(p => {
        if (p && p.id) projectMap.set(String(p.id), p);
      });

      cards.forEach((card, idx) => {
        const id = card.dataset?.id;
        const p = (id && projectMap.get(String(id))) || projects[idx];
        if (p) {
          bind(card, p, options);
        }
      });
    } else {
      cards.forEach(card => {
        const id = card.dataset?.id;
        if (id) {
          bind(card, { id }, options);
        }
      });
    }
  }

  const ProjectCardInteractions = {
    bind,
    bindAll,
    updateProject,
    unbind,
    destroyWithin
  };

  // Mount on global window
  if (typeof global !== 'undefined') {
    global.ProjectCardInteractions = ProjectCardInteractions;
    // Backward compatibility bridge
    global.setupProjectCardEvents = function setupProjectCardEvents(card, p, isHistoryPage, refreshCallback) {
      return ProjectCardInteractions.bind(card, p, {
        isHistoryPage: Boolean(isHistoryPage),
        refreshCallback
      });
    };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectCardInteractions;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
