/**
 * StoryboardAI — Projects Page Module
 * 
 * 負責「我的分鏡」列表頁面的組裝、骨架屏、列表渲染、排序、標籤篩選、標籤管理與生命週期管理。
 * 遵循統一 Page Lifecycle 契約：mount() 回傳 { unmount() }
 */

(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }

  const PRESET_SUGGESTED_TAGS = ['商業廣告', '品牌企劃', '短影音', '個人創作', '畢業專題'];

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
        <h3>尚無分鏡</h3>
        <p>開始建立你的第一個分鏡腳本！</p>
      </div>
    `;
  }

  function renderFilterEmptyState(container, onClear) {
    if (!container) return;
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'projects-empty projects-empty-filtered';
    wrap.innerHTML = `
      <div class="projects-empty-icon" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
      </div>
      <h3>無符合的分鏡</h3>
      <p>沒有符合目前標籤篩選條件的分鏡，嘗試清除篩選或選擇其他標籤。</p>
    `;
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-secondary projects-empty-clear-btn';
    clearBtn.id = 'empty-clear-filters-btn';
    clearBtn.textContent = '清除篩選';
    if (typeof onClear === 'function') {
      clearBtn.addEventListener('click', onClear);
    }
    wrap.appendChild(clearBtn);
    container.appendChild(wrap);
  }

  function extractTagsWithCounts(projectsList) {
    const counts = {};
    if (!Array.isArray(projectsList)) return { allTags: [], counts };
    const isPendingDelete = (id) => {
      if (global.ProjectDeleteQueue && typeof global.ProjectDeleteQueue.isPending === 'function') {
        return global.ProjectDeleteQueue.isPending(id);
      }
      return false;
    };

    projectsList.forEach(p => {
      if (p.is_deleted || isPendingDelete(p.id)) return;
      const tags = Array.isArray(p.tags) ? p.tags : ((p.metadata && Array.isArray(p.metadata.tags)) ? p.metadata.tags : []);
      tags.forEach(t => {
        const clean = String(t || '').trim();
        if (clean) {
          counts[clean] = (counts[clean] || 0) + 1;
        }
      });
    });

    const allTags = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    return { allTags, counts };
  }

  function getFilteredAndSortedProjects(projectsList, selectedTags = null) {
    if (!Array.isArray(projectsList)) return [];
    const isPendingDelete = (id) => {
      if (global.ProjectDeleteQueue && typeof global.ProjectDeleteQueue.isPending === 'function') {
        return global.ProjectDeleteQueue.isPending(id);
      }
      return false;
    };

    const hasTagFilter = selectedTags && (selectedTags instanceof Set ? selectedTags.size > 0 : selectedTags.length > 0);
    const tagSet = hasTagFilter ? (selectedTags instanceof Set ? selectedTags : new Set(selectedTags)) : null;

    return projectsList
      .filter(p => {
        if (p.is_deleted || isPendingDelete(p.id)) return false;
        if (!tagSet) return true;
        const tags = Array.isArray(p.tags) ? p.tags : ((p.metadata && Array.isArray(p.metadata.tags)) ? p.metadata.tags : []);
        // OR 邏輯：只要符合任一所選標籤即保留
        return tags.some(t => tagSet.has(t));
      })
      .sort((a, b) => new Date(b.updateAt || b.createAt) - new Date(a.updateAt || a.createAt));
  }

  function renderProjectsList(projectsGrid, activeProjects, onCardMutate, onTagClick, isFiltered = false, onClearFilters = null) {
    if (!projectsGrid) return;
    projectsGrid.innerHTML = '';
    if (activeProjects.length === 0) {
      if (isFiltered) {
        renderFilterEmptyState(projectsGrid, onClearFilters);
      } else {
        renderEmptyState(projectsGrid);
      }
      return;
    }

    activeProjects.forEach(p => {
      const card = document.createElement('div');
      if (global.ProjectCard && typeof global.ProjectCard.buildLightFilmCardHTML === 'function') {
        card.innerHTML = global.ProjectCard.buildLightFilmCardHTML(p);
      } else if (typeof global.buildLightFilmCardHTML === 'function') {
        card.innerHTML = global.buildLightFilmCardHTML(p);
      }

      if (typeof global.setupProjectCardEvents === 'function') {
        global.setupProjectCardEvents(card, p, false, () => {
          if (typeof onCardMutate === 'function') onCardMutate();
        });
      }
      projectsGrid.appendChild(card);
    });

    if (typeof global.lazyLoadProjectThumbs === 'function') {
      global.lazyLoadProjectThumbs(projectsGrid);
    }
  }

  const ModalAnimation = (typeof window !== 'undefined' && window.ModalAnimation) || (typeof global !== 'undefined' && global.ModalAnimation) || {
    EASING_BACKDROP: 'cubic-bezier(.4,0,.2,1)',
    EASING_CARD_ENTER: 'cubic-bezier(.33,1.53,.69,.99)',
    EASING_CARD_LEAVE: 'cubic-bezier(.31, .01, .66, -0.59)',
    DURATION: 400,

    open(overlay, panel, options = {}) {
      if (!overlay) return;
      const duration = options.duration || this.DURATION;
      const blur = options.blur || '16px';
      const backdropBg = options.backdropBg || 'rgba(15, 23, 42, 0.45)';

      overlay.style.display = 'flex';
      overlay.style.pointerEvents = 'none';
      overlay.style.transition = `all ${duration}ms ${this.EASING_BACKDROP}`;
      overlay.style.backdropFilter = 'blur(0px)';
      if (overlay.style.webkitBackdropFilter !== undefined) {
        overlay.style.webkitBackdropFilter = 'blur(0px)';
      }
      overlay.style.background = 'rgba(15, 23, 42, 0)';
      overlay.style.opacity = '0';

      if (panel) {
        panel.style.transition = `all ${duration}ms ${this.EASING_CARD_ENTER}`;
        panel.style.scale = '0';
        panel.style.opacity = '0';
      }

      setTimeout(() => {
        if (overlay.classList && typeof overlay.classList.add === 'function') {
          overlay.classList.add('active');
        } else if (typeof overlay.className === 'string' && !overlay.className.includes('active')) {
          overlay.className = (overlay.className + ' active').trim();
        }
        overlay.style.pointerEvents = 'auto';
        overlay.style.opacity = '1';
        overlay.style.background = backdropBg;
        overlay.style.backdropFilter = `blur(${blur})`;
        if (overlay.style.webkitBackdropFilter !== undefined) {
          overlay.style.webkitBackdropFilter = `blur(${blur})`;
        }
        if (panel) {
          panel.style.scale = '1';
          panel.style.opacity = '1';
        }
        if (typeof options.onOpened === 'function') options.onOpened();
      }, 10);
    },

    close(overlay, panel, options = {}) {
      if (!overlay) return;
      const duration = options.duration || this.DURATION;
      const onComplete = typeof options === 'function' ? options : (options.onComplete || null);

      overlay.style.pointerEvents = 'none';

      if (panel) {
        panel.style.transition = `all ${duration}ms ${this.EASING_CARD_LEAVE}`;
      }
      overlay.style.transition = `all ${duration}ms ${this.EASING_BACKDROP}`;

      setTimeout(() => {
        if (panel) {
          panel.style.scale = '0';
          panel.style.opacity = '0';
        }
        overlay.style.backdropFilter = 'blur(0px)';
        if (overlay.style.webkitBackdropFilter !== undefined) {
          overlay.style.webkitBackdropFilter = 'blur(0px)';
        }
        overlay.style.background = 'rgba(15, 23, 42, 0)';
        overlay.style.opacity = '0';
        if (overlay.classList && typeof overlay.classList.remove === 'function') {
          overlay.classList.remove('active');
        } else if (typeof overlay.className === 'string') {
          overlay.className = overlay.className.replace(/\bactive\b/g, '').trim();
        }
      }, 10);

      setTimeout(() => {
        overlay.style.display = 'none';
        if (typeof onComplete === 'function') {
          onComplete();
        }
      }, duration + 50);
    }
  };

  function openProjectTagModal(project, onSave) {
    if (typeof document === 'undefined' || !document.body || !project) return null;

    const initialTags = Array.isArray(project.tags)
      ? project.tags
      : ((project.metadata && Array.isArray(project.metadata.tags)) ? project.metadata.tags : []);
    const localTags = new Set(initialTags.map(t => String(t || '').trim()).filter(Boolean));

    const storeProjects = (global.ProjectStore && typeof global.ProjectStore.getProjects === 'function')
      ? (global.ProjectStore.getProjects() || [])
      : [];
    const { allTags: poolTags } = extractTagsWithCounts(storeProjects);
    const suggestionPool = Array.from(new Set([...PRESET_SUGGESTED_TAGS, ...poolTags]));

    const overlay = document.createElement('div');
    overlay.className = 'project-tags-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'project-tags-modal-title');

    const projectTitleEsc = escapeHtml(project.title || '未命名分鏡');

    overlay.innerHTML = `
      <div class="project-tags-modal-backdrop"></div>
      <div class="project-tags-modal-panel">
        <div class="project-tags-modal-header">
          <div class="project-tags-modal-title-group">
            <h3 id="project-tags-modal-title" class="project-tags-modal-title">編輯分鏡標籤</h3>
            <p class="project-tags-modal-subtitle">「${projectTitleEsc}」</p>
          </div>
          <button type="button" class="project-tags-modal-close" aria-label="關閉">&times;</button>
        </div>
        <div class="project-tags-modal-body">
          <div class="project-tags-section">
            <div class="project-tags-section-header">
              <span class="project-tags-section-label">目前標籤</span>
              <span class="project-tags-section-count" id="modal-tags-count">(${localTags.size})</span>
            </div>
            <div class="project-tags-chips-wrap" id="modal-chips-wrap"></div>
          </div>
          <div class="project-tags-input-group">
            <input type="text" class="project-tags-input" id="modal-tag-input" placeholder="新增自訂標籤（例如：商業廣告、短影音）" maxlength="24" />
            <button type="button" class="btn btn-secondary project-tags-add-btn" id="modal-tag-add-btn">新增</button>
          </div>
          <div class="project-tags-section project-tags-suggestions-section">
            <span class="project-tags-section-label">常用推薦標籤</span>
            <div class="project-tags-suggestions-wrap" id="modal-suggestions-wrap"></div>
          </div>
        </div>
        <div class="project-tags-modal-footer">
          <button type="button" class="btn btn-ghost project-tags-cancel-btn" id="modal-cancel-btn">取消</button>
          <button type="button" class="btn btn-primary project-tags-save-btn" id="modal-save-btn">儲存標籤</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const panel = overlay.querySelector('.project-tags-modal-panel');
    ModalAnimation.open(overlay, panel, { blur: '16px', backdropBg: 'rgba(15, 23, 42, 0.45)' });

    const chipsWrap = overlay.querySelector('#modal-chips-wrap');
    const suggestionsWrap = overlay.querySelector('#modal-suggestions-wrap');
    const tagsCountEl = overlay.querySelector('#modal-tags-count');
    const inputEl = overlay.querySelector('#modal-tag-input');
    const addBtn = overlay.querySelector('#modal-tag-add-btn');
    const saveBtn = overlay.querySelector('#modal-save-btn');
    const cancelBtn = overlay.querySelector('#modal-cancel-btn');
    const closeBtn = overlay.querySelector('.project-tags-modal-close');
    const backdrop = overlay.querySelector('.project-tags-modal-backdrop');

    function renderModalChips() {
      if (!chipsWrap) return;
      chipsWrap.innerHTML = '';
      if (tagsCountEl) tagsCountEl.textContent = `(${localTags.size})`;

      if (localTags.size === 0) {
        chipsWrap.innerHTML = '<span class="project-tags-empty-hint">尚未設定任何標籤，請從下方推薦選擇或輸入新標籤</span>';
      } else {
        localTags.forEach(t => {
          const chip = document.createElement('span');
          chip.className = 'project-tag-chip';
          const tEsc = escapeHtml(t);
          chip.innerHTML = `
            <span class="project-tag-chip-text">#${tEsc}</span>
            <button type="button" class="project-tag-chip-remove" data-tag="${tEsc}" aria-label="移除標籤 ${tEsc}">&times;</button>
          `;
          const removeBtn = chip.querySelector('.project-tag-chip-remove');
          if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              localTags.delete(t);
              renderModalChips();
              renderModalSuggestions();
            });
          }
          chipsWrap.appendChild(chip);
        });
      }
    }

    function renderModalSuggestions() {
      if (!suggestionsWrap) return;
      suggestionsWrap.innerHTML = '';
      const available = suggestionPool.filter(t => !localTags.has(t));
      if (available.length === 0) {
        suggestionsWrap.innerHTML = '<span class="project-tags-empty-hint">所有推薦標籤皆已加入</span>';
        return;
      }
      available.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'project-tag-suggestion-pill';
        const tEsc = escapeHtml(t);
        btn.innerHTML = `+ #${tEsc}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          localTags.add(t);
          renderModalChips();
          renderModalSuggestions();
        });
        suggestionsWrap.appendChild(btn);
      });
    }

    function addTagFromInput() {
      if (!inputEl) return;
      const val = inputEl.value.trim();
      if (!val) return;
      localTags.add(val);
      inputEl.value = '';
      renderModalChips();
      renderModalSuggestions();
    }

    if (addBtn) addBtn.addEventListener('click', addTagFromInput);
    if (inputEl) {
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addTagFromInput();
        }
      });
    }

    let isClosing = false;
    function destroyModal() {
      if (isClosing) return;
      isClosing = true;

      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('keydown', onKeyDown);
      }
      ModalAnimation.close(overlay, panel, {
        duration: 400,
        onComplete: () => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
      });
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        destroyModal();
      }
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', onKeyDown);
    }

    if (closeBtn) closeBtn.addEventListener('click', destroyModal);
    if (cancelBtn) cancelBtn.addEventListener('click', destroyModal);
    if (backdrop) backdrop.addEventListener('click', destroyModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) destroyModal();
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = '儲存中...';
        try {
          if (typeof onSave === 'function') {
            await onSave(Array.from(localTags));
          }
        } finally {
          destroyModal();
        }
      });
    }

    renderModalChips();
    renderModalSuggestions();
    if (inputEl && typeof inputEl.focus === 'function') {
      setTimeout(() => inputEl.focus(), 50);
    }

    return {
      close: destroyModal
    };
  }

  // 掛載到全域供 Option Morph 等外部模組調用
  if (typeof global !== 'undefined') {
    global.openProjectTagModal = openProjectTagModal;
  }

  async function mount(context = {}) {
    const { root, signal } = context;
    let isMounted = true;
    let selectedTags = new Set();

    global.onProjectCardTagClick = (clickedTag) => {
      if (!isMounted) return;
      if (selectedTags.has(clickedTag)) {
        selectedTags.delete(clickedTag);
      } else {
        selectedTags.add(clickedTag);
      }
      updateView();
    };

    const projectsGrid = (root ? root.querySelector('#projects-grid') : null) || document.getElementById('projects-grid');
    if (!projectsGrid) {
      return { unmount() {} };
    }

    const projectsToolbar = (root ? root.querySelector('#projects-toolbar') : null) || document.getElementById('projects-toolbar');
    const tagsScroll = (root ? root.querySelector('#projects-tags-scroll') : null) || document.getElementById('projects-tags-scroll');
    const clearFilterBtn = (root ? root.querySelector('#projects-clear-filter-btn') : null) || document.getElementById('projects-clear-filter-btn');
    const countBadge = (root ? root.querySelector('#projects-count-badge') : null) || document.getElementById('projects-count-badge');

    function updateView() {
      if (!isMounted) return;
      const list = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
        ? global.ProjectStore.getProjects()
        : null;

      if (!list) {
        projectsGrid.innerHTML = SKELETON_CARDS_HTML;
        return;
      }

      const allActive = getFilteredAndSortedProjects(list, null);
      const totalCount = allActive.length;

      const filteredProjects = getFilteredAndSortedProjects(list, selectedTags);
      const filteredCount = filteredProjects.length;

      // 1. 更新標籤篩選列
      if (tagsScroll) {
        const { allTags, counts } = extractTagsWithCounts(list);
        tagsScroll.innerHTML = '';

        // 「全部」按鈕
        const allBtn = document.createElement('button');
        allBtn.type = 'button';
        allBtn.className = `project-filter-pill ${selectedTags.size === 0 ? 'is-active' : ''}`;
        allBtn.setAttribute('data-tag', '__ALL__');
        allBtn.innerHTML = `全部 <span class="filter-count">${totalCount}</span>`;
        allBtn.addEventListener('click', () => {
          if (selectedTags.size > 0) {
            selectedTags.clear();
            updateView();
          }
        });
        tagsScroll.appendChild(allBtn);

        // 各個個別標籤按鈕
        allTags.forEach(tag => {
          const tagBtn = document.createElement('button');
          tagBtn.type = 'button';
          const isActive = selectedTags.has(tag);
          tagBtn.className = `project-filter-pill ${isActive ? 'is-active' : ''}`;
          tagBtn.setAttribute('data-tag', tag);
          const tagEsc = escapeHtml(tag);
          tagBtn.innerHTML = `#${tagEsc} <span class="filter-count">${counts[tag] || 0}</span>`;
          tagBtn.addEventListener('click', () => {
            if (selectedTags.has(tag)) {
              selectedTags.delete(tag);
            } else {
              selectedTags.add(tag);
            }
            updateView();
          });
          tagsScroll.appendChild(tagBtn);
        });
      }

      // 2. 清除篩選按鈕
      if (clearFilterBtn) {
        if (selectedTags.size > 0) {
          clearFilterBtn.style.display = 'inline-flex';
          clearFilterBtn.onclick = () => {
            selectedTags.clear();
            updateView();
          };
        } else {
          clearFilterBtn.style.display = 'none';
        }
      }

      // 3. 頂部計數徽章
      if (countBadge) {
        if (selectedTags.size > 0) {
          countBadge.textContent = `${filteredCount} / ${totalCount}`;
        } else {
          countBadge.textContent = `${totalCount}`;
        }
      }

      // 4. 渲染分鏡清單
      const isFiltered = selectedTags.size > 0;
      renderProjectsList(
        projectsGrid,
        filteredProjects,
        () => {
          updateView();
          if (typeof global.updateSidebarProjects === 'function') {
            global.updateSidebarProjects();
          }
        },
        (clickedTag) => {
          if (selectedTags.has(clickedTag)) {
            selectedTags.delete(clickedTag);
          } else {
            selectedTags.add(clickedTag);
          }
          updateView();
        },
        isFiltered,
        () => {
          selectedTags.clear();
          updateView();
        }
      );
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
    const projectsBody = (root ? root.querySelector('.projects-body') : null) || document.querySelector('.projects-body');
    if (projectsBody && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.attach === 'function') {
      global.DynamicMaskSystem.attach(projectsBody, { maskSize: 36, direction: 'vertical' });
    }

    // 4. 生命週期卸載契約 (Unmount Contract)
    function unmount() {
      if (!isMounted) return;
      isMounted = false;
      selectedTags.clear();
      if (global.onProjectCardTagClick) {
        global.onProjectCardTagClick = null;
      }
      if (signal) {
        signal.removeEventListener('abort', unmount);
      }
      if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
      }
      if (projectsBody && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.detach === 'function') {
        global.DynamicMaskSystem.detach(projectsBody);
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

  const ProjectsPage = {
    mount,
    getFilteredAndSortedProjects,
    extractTagsWithCounts,
    renderProjectsList,
    renderEmptyState,
    renderFilterEmptyState,
    openProjectTagModal
  };

  if (typeof global !== 'undefined') {
    global.ProjectsPage = ProjectsPage;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectsPage;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
