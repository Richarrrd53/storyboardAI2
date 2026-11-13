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

  const projectCollator = new Intl.Collator('zh-Hant', {numeric:true,sensitivity:'base'});
  const cardStates = new WeakMap();

  const PRESET_SUGGESTED_TAGS = ['商業廣告', '品牌企劃', '短影音', '個人創作', '畢業專題'];
  let activeTagModal = null;

  function projectTags(project) {
    if (global.ProjectsFeature?.getProjectTags) return global.ProjectsFeature.getProjectTags(project);
    const tags = Array.isArray(project.tags) ? project.tags : project.metadata?.tags;
    return Array.isArray(tags) ? Array.from(new Set(tags.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean))) : [];
  }

  function closeTagModal(options = {}) {
    if (activeTagModal) activeTagModal.close(options);
  }

  function cleanupCards(container) {
    if (global.ProjectCardInteractions?.destroyWithin) global.ProjectCardInteractions.destroyWithin(container);
  }

  const SKELETON_CARDS_HTML = Array.from({ length: 4 }).map(() => `
    <div class="project-card project-folder-card skeleton">
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
      <p>沒有符合目前搜尋或標籤篩選條件的分鏡，嘗試清除篩選或選擇其他標籤。</p>
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
    const counts = Object.create(null);
    if (!Array.isArray(projectsList)) return { allTags: [], counts };
    const isPendingDelete = (id) => {
      if (global.ProjectDeleteQueue && typeof global.ProjectDeleteQueue.isPending === 'function') {
        return global.ProjectDeleteQueue.isPending(id);
      }
      return false;
    };

    projectsList.forEach(p => {
      if (p.is_deleted || isPendingDelete(p.id)) return;
      const tags = projectTags(p);
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

  function getFilteredAndSortedProjects(projectsList, selectedTags = null, options = {}) {
    if (!Array.isArray(projectsList)) return [];
    const isPendingDelete = (id) => {
      if (global.ProjectDeleteQueue && typeof global.ProjectDeleteQueue.isPending === 'function') {
        return global.ProjectDeleteQueue.isPending(id);
      }
      return false;
    };

    const hasTagFilter = selectedTags && (selectedTags instanceof Set ? selectedTags.size > 0 : selectedTags.length > 0);
    const tagSet = hasTagFilter ? new Set(Array.from(selectedTags).map(t => String(t).trim())) : null;

    return projectsList
      .filter(p => {
        if (p.is_deleted || isPendingDelete(p.id)) return false;
        const tags = projectTags(p);
        const query = String(options.query || '').trim().normalize('NFKC').toLocaleLowerCase('zh-Hant');
        const searchable = `${p.title || ''} ${tags.join(' ')}`.normalize('NFKC').toLocaleLowerCase('zh-Hant');
        return (!tagSet || tags.some(t => tagSet.has(t))) && (!query || searchable.includes(query));
      })
      .sort((a, b) => {
        const collator = projectCollator;
        const date = (p, created) => {
          const value = Date.parse(created ? (p.createAt || p.createdAt || '') : (p.updateAt || p.updatedAt || p.createAt || p.createdAt || ''));
          return Number.isFinite(value) ? value : 0;
        };
        const shots = p => Number(p.shotsCount ?? p.shotCount ?? p.shots?.length) || 0;
        const key = options.sort || 'updated';
        const comparison = key === 'name' ? collator.compare(a.title || '', b.title || '') :
          key === 'shots' ? shots(a) - shots(b) : date(a, key === 'created') - date(b, key === 'created');
        return (options.direction === 'asc' ? comparison : -comparison) || collator.compare(String(a.id), String(b.id));
      });
  }

  function renderProjectsList(projectsGrid, activeProjects, onCardMutate, onTagClick, isFiltered = false, onClearFilters = null) {
    if (!projectsGrid) return;
    let state = cardStates.get(projectsGrid);
    if (!state) { state = new Map(); cardStates.set(projectsGrid, state); }
    // Reconcile by project identity. Sorting and filtering keep the exact same
    // cover nodes and interaction bindings; only changed project data is rebuilt.
    const retained = new Set(activeProjects.map(project => String(project.id)));
    for (const [id, entry] of state) {
      if (!retained.has(id) && entry.card.parentNode === projectsGrid) entry.card.remove?.();
    }
    if (!state.size || !projectsGrid.querySelector?.('.project-card')) projectsGrid.innerHTML = '';
    if (!activeProjects.length) {
      if (isFiltered) renderFilterEmptyState(projectsGrid, onClearFilters);
      else renderEmptyState(projectsGrid);
      return;
    }
    projectsGrid.querySelectorAll?.('.projects-empty').forEach(element => element.remove());
    activeProjects.forEach(project => {
      const id = String(project.id);
      const signature = JSON.stringify(project);
      let entry = state.get(id);
      if (!entry) { entry = {card:document.createElement('div')}; state.set(id, entry); }
      const card = entry.card;
      if (card.parentNode !== projectsGrid) {
        // Undo can reattach a cached card after the delete animation. Its
        // transient opacity/transform must never survive into the visible grid.
        card.style.opacity = ''; card.style.transform = ''; card.style.transition = '';
      }
      if (entry.signature !== signature) {
        global.ProjectCardInteractions?.unbind?.(card);
        card.innerHTML = global.ProjectCard?.buildLightFilmCardHTML?.(project) || global.buildLightFilmCardHTML?.(project) || '';
        if (global.ProjectCardInteractions?.bind) global.ProjectCardInteractions.bind(card, project, {isDeleted:false, refreshCallback:onCardMutate, onTagClick});
        else global.setupProjectCardEvents?.(card, project, false, onCardMutate);
        entry.signature = signature;
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
    closeTagModal({ immediate: true, restoreFocus: false });
    const previousFocus = document.activeElement;
    let isClosing = false;
    let isSaving = false;
    let focusTimer = null;

    const initialTags = projectTags(project);
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
            <input type="text" class="project-tags-input" id="modal-tag-input" aria-label="新增自訂標籤" placeholder="新增自訂標籤（例如：商業廣告、短影音）" maxlength="24" />
            <button type="button" class="btn btn-secondary project-tags-add-btn" id="modal-tag-add-btn">新增</button>
          </div>
          <div class="project-tags-section project-tags-suggestions-section">
            <span class="project-tags-section-label">常用推薦標籤</span>
            <div class="project-tags-suggestions-wrap" id="modal-suggestions-wrap"></div>
          </div>
        </div>
        <p class="project-tags-empty-hint" id="modal-tags-status" role="status" aria-live="polite" hidden></p>
        <div class="project-tags-modal-footer">
          <button type="button" class="btn btn-ghost project-tags-cancel-btn" id="modal-cancel-btn">取消</button>
          <button type="button" class="btn btn-primary project-tags-save-btn" id="modal-save-btn">儲存標籤</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const panel = overlay.querySelector('.project-tags-modal-panel');
    ModalAnimation.open(overlay, panel, { blur: 'var(--dialog-backdrop-blur, 50px)', backdropBg: 'rgba(15, 23, 42, 0.45)' });

    const chipsWrap = overlay.querySelector('#modal-chips-wrap');
    const suggestionsWrap = overlay.querySelector('#modal-suggestions-wrap');
    const tagsCountEl = overlay.querySelector('#modal-tags-count');
    const inputEl = overlay.querySelector('#modal-tag-input');
    const addBtn = overlay.querySelector('#modal-tag-add-btn');
    const saveBtn = overlay.querySelector('#modal-save-btn');
    const cancelBtn = overlay.querySelector('#modal-cancel-btn');
    const closeBtn = overlay.querySelector('.project-tags-modal-close');
    const backdrop = overlay.querySelector('.project-tags-modal-backdrop');
    const statusEl = overlay.querySelector('#modal-tags-status');

    function showStatus(message) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.hidden = !message;
    }

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
              if (isSaving) return;
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
          if (isSaving) return;
          localTags.add(t);
          renderModalChips();
          renderModalSuggestions();
        });
        suggestionsWrap.appendChild(btn);
      });
    }

    function addTagFromInput() {
      if (!inputEl || isSaving) return;
      const val = inputEl.value.trim();
      if (!val) return;
      localTags.add(val.slice(0, 24));
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

    function destroyModal(options = {}) {
      if (isClosing) return;
      isClosing = true;
      if (focusTimer) clearTimeout(focusTimer);
      if (activeTagModal === modal) activeTagModal = null;

      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('keydown', onKeyDown);
      }
      const finishClose = () => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (options.restoreFocus !== false && previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus();
      };
      if (options.immediate) {
        finishClose();
        return;
      }
      ModalAnimation.close(overlay, panel, {
        duration: 400,
        onComplete: finishClose
      });
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault?.();
        destroyModal();
      } else if (e.key === 'Tab') {
        const focusable = Array.from(overlay.querySelectorAll('button, input')).filter(el => !el.disabled && !el.hidden);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
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
        if (isSaving || isClosing) return;
        addTagFromInput();
        isSaving = true;
        saveBtn.disabled = true;
        saveBtn.textContent = '儲存中...';
        overlay.setAttribute('aria-busy', 'true');
        if (inputEl) inputEl.disabled = true;
        if (addBtn) addBtn.disabled = true;
        showStatus('');
        try {
          if (typeof onSave === 'function') {
            const result = await onSave(Array.from(localTags));
            if (result === false) throw new Error('標籤尚未儲存，請稍後重試。');
          }
          if (!isClosing) destroyModal();
        } catch (error) {
          if (!isClosing) showStatus(error.message || '標籤尚未儲存，請稍後重試。');
        } finally {
          isSaving = false;
          if (!isClosing) {
            saveBtn.disabled = false;
            saveBtn.textContent = '儲存標籤';
            overlay.setAttribute('aria-busy', 'false');
            if (inputEl) inputEl.disabled = false;
            if (addBtn) addBtn.disabled = false;
          }
        }
      });
    }

    renderModalChips();
    renderModalSuggestions();
    if (inputEl && typeof inputEl.focus === 'function') {
      focusTimer = setTimeout(() => { if (!isClosing) inputEl.focus(); }, 50);
    }

    const modal = { close: destroyModal };
    activeTagModal = modal;
    return modal;
  }

  // 掛載到全域供 Option Morph 等外部模組調用
  if (typeof global !== 'undefined') {
    global.openProjectTagModal = openProjectTagModal;
  }

  async function mount(context = {}) {
    const { root, signal } = context;
    let isMounted = true;
    let selectedTags = new Set();
    let query = '', sort = 'updated', direction = 'desc';
    let sortSequence = 0;
    let animations = [];
    let searchTimer = null;
    let tagMenu = null, sortMenu = null;
    const find = selector => root?.querySelector(selector) || document.querySelector(selector);
    const tagsTrigger = find('#projects-tags-trigger');
    const sortTrigger = find('#projects-sort-trigger');
    const search = find('#projects-search');
    const tagsLabel = find('#projects-tags-label');
    const handlers = [];
    const listen = (element, type, handler) => {
      element?.addEventListener(type, handler); handlers.push(() => element?.removeEventListener(type, handler));
    };
    function clearFilters() { selectedTags.clear(); query = ''; if (search) search.value = ''; updateView(); }
    function renderTagOptions(container, list, total) {
      if (!container) return;
      const {allTags, counts} = extractTagsWithCounts(list);
      const focused = document.activeElement?.getAttribute?.('data-tag');
      container.innerHTML = '';
      const choices = [['__ALL__', '全部標籤', total], ...allTags.map(tag => [tag, tag, counts[tag]])];
      for (const [tag, label, count] of choices) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'project-filter-pill morph-item';
        const active = tag === '__ALL__' ? selectedTags.size === 0 : selectedTags.has(tag);
        button.classList.toggle('is-active', active);
        button.setAttribute('data-tag', tag); button.setAttribute('aria-pressed', String(active));
        button.setAttribute('role','menuitemcheckbox'); button.setAttribute('aria-checked',String(active));
        button.innerHTML = `<span>${escapeHtml(label)}</span><span class="filter-count">${count}</span>`;
        button.addEventListener('click', () => {
          if (tag === '__ALL__') selectedTags.clear();
          else if (selectedTags.has(tag)) selectedTags.delete(tag); else selectedTags.add(tag);
          updateView();
        });
        container.appendChild(button);
      }
      if (focused) [...container.children].find(button => button.getAttribute('data-tag') === focused)?.focus?.({preventScroll:true});
    }
    function openMenu(trigger, content, label, onClose) {
      global.ProjectOptionMorph?.openSurface(trigger, {content,width:240,label,align:trigger === tagsTrigger ? 'start' : 'end',
        onClose: reason => { onClose(); if (!['navigation','unmount','destroy','modal','focus_out','tab','replaced'].includes(reason) && isMounted && trigger.isConnected && !global.ProjectOptionMorph.isOpen()) trigger.focus({preventScroll:true}); }});
    }
    listen(tagsTrigger, 'click', () => {
      tagMenu = document.createElement('div'); tagMenu.className = 'projects-dropdown-options';
      renderTagOptions(tagMenu, global.ProjectStore?.getProjects() || [], getFilteredAndSortedProjects(global.ProjectStore?.getProjects() || []).length);
      openMenu(tagsTrigger, tagMenu, '標籤篩選', () => { tagMenu = null; });
    });
    function renderSortOptions() {
      if (!sortMenu) return;
      const focused = document.activeElement?.getAttribute?.('data-sort') || document.activeElement?.getAttribute?.('data-direction');
      sortMenu.innerHTML = '';
      const choices = [['updated','修改時間'],['created','建立時間'],['name','專案名稱'],['shots','分鏡數量']];
      for (const [key,label] of choices) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'morph-item';
        button.setAttribute('data-sort', key); button.setAttribute('role','menuitemradio'); button.setAttribute('aria-checked',String(sort === key));
        button.textContent = `${sort === key ? '✓ ' : ''}${label}`;
        button.addEventListener('click', () => { sort = key; renderSortOptions(); sortCards(); }); sortMenu.appendChild(button);
      }
      const directions = document.createElement('div'); directions.className = 'projects-sort-directions';
      for (const [value,label] of [['asc','遞增 ↑'],['desc','遞減 ↓']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'morph-item';
        button.setAttribute('data-direction',value); button.setAttribute('aria-pressed', String(direction === value)); button.textContent = label;
        button.addEventListener('click', () => { direction = value; renderSortOptions(); sortCards(); }); directions.appendChild(button);
      }
      sortMenu.appendChild(directions);
      if (focused) [...sortMenu.querySelectorAll('button')].find(button => button.getAttribute('data-sort') === focused || button.getAttribute('data-direction') === focused)?.focus?.({preventScroll:true});
    }
    listen(sortTrigger, 'click', () => {
      sortMenu = document.createElement('div'); sortMenu.className = 'projects-dropdown-options'; renderSortOptions();
      openMenu(sortTrigger, sortMenu, '排序分鏡', () => { sortMenu = null; });
    });
    listen(search, 'input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { query = search.value; updateView(); }, 100);
    });
    function cancelSort() { sortSequence++; animations.forEach(animation => animation.cancel()); animations = []; }
    async function sortCards() {
      const current = new Map(animations.map(animation => {const card=animation.effect.target;return [card,global.getComputedStyle(card).transform];}));
      cancelSort(); const sequence = sortSequence;
      if (global.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !projectsGrid.animate) { updateView(); return; }
      const viewport = projectsGrid.parentElement.getBoundingClientRect();
      const cards = [...projectsGrid.querySelectorAll('.project-card')].filter(card => { const r = card.getBoundingClientRect(); return r.bottom > viewport.top && r.top < viewport.bottom; });
      const rects = new Map(cards.map(card => [card,card.getBoundingClientRect()]));
      const centerX = (viewport.left + viewport.right) / 2;
      const centerY = cards.length ? (Math.max(viewport.top,Math.min(...cards.map(card=>rects.get(card).top))) + Math.min(viewport.bottom,Math.max(...cards.map(card=>rects.get(card).bottom))))/2 : viewport.top;
      const gatherScale = .72;
      const transforms = new Map(cards.map(card => {const r=rects.get(card);return [card,{x:centerX-r.left-r.width/2,y:centerY-r.top-r.height/2}];}));
      const gather = cards.map(card => {const {x,y}=transforms.get(card);return card.animate([{transform:!current.get(card) || current.get(card) === 'none' ? 'translate(0,0) scale(1)' : current.get(card)},{transform:`translate(${x}px,${y}px) scale(${gatherScale})`}],{duration:240,easing:'cubic-bezier(.4,0,.2,1)',fill:'forwards'});});
      animations = gather;
      await Promise.allSettled(gather.map(animation => animation.finished));
      // Briefly hold the fully overlapping stack before redistributing it.
      await new Promise(resolve => setTimeout(resolve,40));
      if (!isMounted || sequence !== sortSequence) return;
      const gathered = new Map(cards.map(card => [card,card.getBoundingClientRect()]));
      gather.forEach(animation => animation.cancel());
      updateView(true);
      const targets = new Map(cards.map(card => [card,card.getBoundingClientRect()]));
      animations = cards.map(card => {
        const from=gathered.get(card),to=targets.get(card);
        const x=from.left-to.left-to.width*(1-gatherScale)/2;
        const y=from.top-to.top-to.height*(1-gatherScale)/2;
        return card.animate([{transform:`translate(${x}px,${y}px) scale(${gatherScale})`},{transform:'translate(0,0) scale(1)'}],{duration:400,easing:'cubic-bezier(.2,.85,.25,1.15)',fill:'none'});
      });
      await Promise.allSettled(animations.map(animation => animation.finished));
      if (sequence === sortSequence) animations = [];
    }


    const onCardTagClick = (clickedTag) => {
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
    global.onProjectCardTagClick = onCardTagClick;

    const projectsToolbar = (root ? root.querySelector('#projects-toolbar') : null) || document.getElementById('projects-toolbar');
    const tagsScroll = (root ? root.querySelector('#projects-tags-scroll') : null) || document.getElementById('projects-tags-scroll');
    const clearFilterBtn = (root ? root.querySelector('#projects-clear-filter-btn') : null) || document.getElementById('projects-clear-filter-btn');
    const countBadge = (root ? root.querySelector('#projects-count-badge') : null) || document.getElementById('projects-count-badge');

    function updateView(fromSort = false) {
      if (!isMounted) return;
      if (!fromSort) cancelSort();
      const list = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
        ? global.ProjectStore.getProjects()
        : null;

      if (!list) {
        projectsGrid.innerHTML = SKELETON_CARDS_HTML;
        return;
      }

      const allActive = getFilteredAndSortedProjects(list, null);
      const totalCount = allActive.length;

      const filteredProjects = getFilteredAndSortedProjects(list, selectedTags, {query,sort,direction});
      const filteredCount = filteredProjects.length;

      if (tagsScroll) renderTagOptions(tagsScroll, list, totalCount);
      if (tagMenu) renderTagOptions(tagMenu, list, totalCount);
      if (tagsLabel) tagsLabel.textContent = selectedTags.size === 0 ? '全部標籤' : selectedTags.size === 1 ? [...selectedTags][0] : `${selectedTags.size} 個標籤`;

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
        if (selectedTags.size > 0 || query.trim()) {
          countBadge.textContent = `${filteredCount} / ${totalCount}`;
        } else {
          countBadge.textContent = `${totalCount}`;
        }
      }

      // 4. 渲染分鏡清單
      const isFiltered = selectedTags.size > 0 || !!query.trim();
      renderProjectsList(
        projectsGrid,
        filteredProjects,
        () => {
          updateView();
          if (typeof global.updateSidebarProjects === 'function') {
            global.updateSidebarProjects();
          }
        },
        onCardTagClick,
        isFiltered,
        clearFilters
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
      clearTimeout(searchTimer); cancelSort();
      handlers.forEach(cleanup => cleanup());
      if (tagMenu || sortMenu) global.ProjectOptionMorph?.close('unmount');
      const state = cardStates.get(projectsGrid);
      state?.forEach(entry => global.ProjectCardInteractions?.unbind?.(entry.card));
      cardStates.delete(projectsGrid);
      closeTagModal({ immediate: true, restoreFocus: false });
      cleanupCards(projectsGrid);
      if (clearFilterBtn) clearFilterBtn.onclick = null;
      if (global.onProjectCardTagClick === onCardTagClick) {
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
    openProjectTagModal,
    closeTagModal
  };

  if (typeof global !== 'undefined') {
    global.ProjectsPage = ProjectsPage;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectsPage;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
