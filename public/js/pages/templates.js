/** Template marketplace. The router owns URLs; this page owns catalog/view state. */
(function () {
  'use strict';
  const CAT_MAP = { product: '商品廣告', story: '敘事紀實', twist: '高留存節奏', custom: '團隊資產', '未分類': '未分類' };
  let browseMemory = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const categoryOf = t => ['product', 'story', 'twist'].includes(t.category || t.type) ? (t.category || t.type) : 'custom';
  const tagsOf = t => window.TemplatePresentation.tagsOf(t);
  function getCatCounts(templates) {
    const counts = { '全部': templates.length, product: 0, story: 0, twist: 0, custom: 0 };
    templates.forEach(t => counts[categoryOf(t)]++);
    return counts;
  }
  const durationOf = t => window.TemplatePresentation.durationOf(t);
  function safeMediaUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value, document.baseURI || window.location?.href || 'http://localhost/');
      return ['http:', 'https:'].includes(url.protocol) ? value : '';
    } catch (_) { return ''; }
  }
  function renderCard(t, featured = false) {
    const presentation = window.TemplatePresentation.present(t);
    const name = presentation.title;
    const duration = durationOf(t);
    const shotCount = window.TemplatePresentation.shotCountOf(t);
    const source = t.videoUrl || t.source?.url;
    const sourceUrl = typeof source === 'string' ? source : '';
    const videoId = t.source?.videoId || t.videoId || sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/)?.[1];
    const thumbnail = safeMediaUrl(t.thumbnail || t.cover || t.source?.thumbnail || (videoId ? 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg' : ''));
    const specs = [duration !== null ? duration + ' 秒' : '', shotCount !== null ? shotCount + ' 個敘事節點' : '', ...(Array.isArray(t.platform) ? t.platform.filter(p => typeof p === 'string').slice(0, 2) : [])].filter(Boolean);
    return '<article class="template-card' + (featured ? ' template-card-featured' : '') + '" data-id="' + escape(t.id) + '">' +
      '<a class="template-video-cover' + (thumbnail ? '' : ' no-cover') + '" href="/template/' + encodeURIComponent(t.id) + '" data-action="preview" aria-label="預覽 ' + escape(name) + '">' +
      (thumbnail ? '<img src="' + escape(thumbnail) + '" alt="" width="640" height="360" loading="' + (featured ? 'eager' : 'lazy') + '">' : '<span class="cover-placeholder">尚無封面</span>') +
      '<span class="cover-play" aria-hidden="true">▶</span></a><div class="template-card-body">' +
      '<span class="template-card-cat">' + escape(t.categoryLabel || CAT_MAP[categoryOf(t)]) + '</span>' +
      '<h3 class="text-card-title"><a href="/template/' + encodeURIComponent(t.id) + '" data-action="preview">' + escape(name) + '</a></h3>' +
      '<p class="template-display-summary"><span class="template-summary-label">' + escape(presentation.summaryLabel) + '</span>' + escape(presentation.summary) + '</p>' +
      '<div class="template-card-tags">' + tagsOf(t).slice(0, 2).map(tag => '<span>' + escape(tag) + '</span>').join('') + '</div>' +
      '<div class="template-specs" aria-label="模板規格">' + specs.map(spec => '<span>' + escape(spec) + '</span>').join('') + '</div>' +
      '<div class="template-card-footer"><a class="card-preview-btn" href="/template/' + encodeURIComponent(t.id) + '" data-action="preview">預覽模板</a><button type="button" class="card-apply-btn" data-action="apply" aria-label="套用 ' + escape(name) + '">套用模板</button></div></div></article>';
  }

  async function mount(context = {}) {
    const { root = document.getElementById('page-main'), signal, navigate = (page, params) => window.spaNavigate?.(page, params), route = {} } = context;
    if (signal?.aborted) return { unmount() {} };
    const getEl = id => root?.querySelector?.('#' + id) || document.getElementById(id);
    const categoriesEl = getEl('store-categories');
    const gridEl = getEl('template-grid');
    const storeView = getEl('template-store-view');
    const storeBody = getEl('template-store-body') || storeView;
    const detailEl = getEl('template-detail-immersive');
    const recoveryEl = getEl('template-recovery');
    const featuredEl = getEl('template-featured-grid');
    const featuredSection = getEl('template-featured');
    const searchInput = getEl('store-search-input');
    const tagsTrigger = getEl('store-tags-trigger');const tagsLabel = getEl('store-tags-label');
    const sortTrigger = getEl('store-sort-trigger');
    const clearButton = getEl('store-clear-filters');
    if (!categoriesEl || !gridEl || !detailEl) return { unmount() {} };
    const pageMain = document.getElementById('page-main');
    let backPending = false;
    let state = { category: '全部', query: '', tag: '', sort: 'catalog', direction: 'asc', scrollTop: 0, ...browseMemory, ...route.browseState };
    let currentRoute = route;
    let activeId = null;
    let templates = [];
    let loadError = false;
    let disposed = false;
    let loading = false;
    let lastPreviewId = null, sortSequence = 0, animations = [], tagMenu = null, tagGrid = null, tagSearchQuery = '', sortMenu = null;
    const listeners = [];
    const on = (el, event, handler) => {
      if (!el) return;
      el.addEventListener(event, handler);
      listeners.push(() => el.removeEventListener(event, handler));
    };
    const isFiltered = () => state.category !== '全部' || !!state.query.trim() || !!state.tag;
    function snapshot() {
      if (!activeId) state.scrollTop = storeBody?.scrollTop || 0;
      return { ...state };
    }
    function syncControls() {
      if (searchInput) searchInput.value = state.query;
      if (tagsLabel) tagsLabel.textContent = state.tag || '所有標籤';

      categoriesEl.querySelectorAll('.category-card').forEach(button => {
        const selected = button.dataset.catId === state.category;
        button.classList.toggle('active', selected);
        button.setAttribute?.('aria-pressed', String(selected));
      });
    }
    function bindCards(container) {
      container?.querySelectorAll('.template-card').forEach(card => {
        card.addEventListener('click', event => {
          // Preserve native links for new tabs, modifier keys and assistive tools.
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
          event.preventDefault?.();
          const action = event.target.closest?.('[data-action]')?.dataset.action;
          if (action === 'apply') {
            event.stopPropagation();
            if (window.CreationController?.applyTemplateEntry) window.CreationController.applyTemplateEntry(templates.find(t => t.id === card.dataset.id) || { id: card.dataset.id }, { page: 'template' });
            else navigate('generate', { templateId: card.dataset.id });
          } else {
            lastPreviewId = card.dataset.id;
            navigate('template', { templateId: card.dataset.id });
          }
        });
        card.querySelector('img')?.addEventListener('error', event => {
          event.target.parentElement.classList.add('no-cover');
          event.target.replaceWith(Object.assign(document.createElement('span'), { className: 'cover-placeholder', textContent: '封面無法載入' }));
        }, { once: true });
      });
    }
    function cancelSort() { sortSequence++; animations.forEach(a => a.cancel()); animations = []; }
    function filterAndDisplay(fromSort = false) {
      if (!fromSort) cancelSort();
      if (tagGrid) renderTagOptions(tagGrid);
      syncControls();
      const filtered = window.TemplatePresentation.filter(templates, state);

      const title = getEl('current-category-title');
      if (title) title.textContent = state.category === '全部' ? '所有模板' : CAT_MAP[state.category];
      const count = getEl('template-result-count');
      if (count) count.textContent = filtered.length + ' 個模板';
      if (clearButton) clearButton.hidden = !isFiltered();
      if (featuredSection) featuredSection.hidden = isFiltered() || !templates.length || loadError;
      if (loadError) {
        gridEl.innerHTML = '<div class="template-state" role="alert"><h3>模板載入失敗</h3><p>請檢查連線後再試一次。</p><button type="button" class="card-preview-btn" data-catalog-action="retry">重新載入</button></div>';
      } else if (!templates.length) {
        gridEl.innerHTML = '<div class="template-state"><h3>目前尚無模板</h3><p>從影片建立第一個模板，或稍後再來瀏覽。</p><button type="button" class="card-apply-btn" data-catalog-action="create">建立模板</button></div>';
      } else if (!filtered.length) {
        gridEl.innerHTML = '<div class="template-state"><h3>沒有找到符合條件的模板</h3><p>試試其他關鍵字，或清除篩選重新瀏覽。</p><button type="button" class="card-preview-btn" data-catalog-action="clear">清除篩選</button></div>';
      } else {
        gridEl.innerHTML = filtered.map(t => renderCard(t)).join('');
        bindCards(gridEl);
      }
    }
    function clearFilters() {
      state = { ...state, category: '全部', query: '', tag: '', scrollTop: 0 };
      filterAndDisplay();
    }
    function showBrowse() {
      window.destroyTemplateTimeline?.();
      activeId = null;
      pageMain?.classList.remove('is-template-detail-mode');
      if (storeView) storeView.style.display = 'flex';
      detailEl.style.display = 'none';
      if (recoveryEl) recoveryEl.hidden = true;
      if (pageMain) pageMain.scrollTop = 0;
      const detailBody = getEl('template-detail-body');
      if (detailBody) detailBody.scrollTop = 0;
      if (storeBody) storeBody.scrollTop = state.scrollTop;
      window.DynamicMaskSystem?.refresh?.();
      document.title = '模板庫 — Storyboard AI';
      const focusLink = Array.from(gridEl.querySelectorAll('.template-card')).find(card => card.dataset.id === lastPreviewId)?.querySelector('.card-preview-btn');
      focusLink?.focus?.({ preventScroll: true });
    }
    async function updateRoute(opts = {}) {
      if (disposed) return;
      backPending = false;
      if (!activeId) snapshot();
      currentRoute = opts;
      if (opts.browseState) { state = { ...state, ...opts.browseState }; filterAndDisplay(); }
      if (!opts.templateId) { showBrowse(); return; }
      if (activeId === opts.templateId && !loadError) return;
      window.destroyTemplateTimeline?.();
      activeId = opts.templateId;
      const backButton = root?.querySelector?.('.btn-back-to-store');
      backButton?.setAttribute('aria-label', opts.creationPreview ? '返回創作' : '返回模板庫');
      let template = templates.find(t => String(t.id) === String(opts.templateId));
      if (window.PageAssetLoader.fetchTemplateDetail && templates.some(item => item.structureCount != null) && !loadError) {
        try {
          template = await window.PageAssetLoader.fetchTemplateDetail(opts.templateId, signal);
          if (disposed || signal?.aborted || activeId !== opts.templateId) return;
        } catch (error) {
          if (disposed || signal?.aborted || activeId !== opts.templateId) return;
          template = null;
        }
      }
      if (template && window.renderTemplateDetailTimeline) {
        if (recoveryEl) recoveryEl.hidden = true;
        window.renderTemplateDetailTimeline(template, detailEl);
        document.title = window.TemplatePresentation.present(template).title + ' — Storyboard AI';
        getEl('detail-template-title')?.focus?.({ preventScroll: true });
      } else {
        if (storeView) storeView.style.display = 'none';
        detailEl.style.display = 'none';
        pageMain?.classList.add('is-template-detail-mode');
        if (pageMain) pageMain.scrollTop = 0;
        const detailBody = getEl('template-detail-body');
        if (detailBody) detailBody.scrollTop = 0;
        if (recoveryEl) {
          recoveryEl.hidden = false;
          recoveryEl.innerHTML = '<h1 class="text-section-title" tabindex="-1">' + (loadError ? '模板載入失敗' : '找不到這個模板') + '</h1><p>' + (loadError ? '請檢查連線後再試一次。' : '模板可能已移除，或連結中的 ID 不正確。') + '</p>' + (loadError ? '<button type="button" class="card-preview-btn" data-catalog-action="retry">重新載入</button>' : '') + '<button type="button" class="card-apply-btn" data-catalog-action="browse">返回模板庫</button>';
          recoveryEl.querySelector('h1')?.focus?.();
        }
        document.title = (loadError ? '模板載入失敗' : '找不到模板') + ' — Storyboard AI';
      }
    }
    function back() {
      if (disposed || backPending || !activeId) return;
      backPending = true;
      const historyHost = window.parent && window.parent !== window ? window.parent : window;
      if (historyHost.history?.state?.creationPreview) { historyHost.history.back(); return; }
      if (historyHost.history?.state?.templateFromBrowse && typeof historyHost.history.back === 'function') historyHost.history.back();
      else navigate('template');
    }
    const navigation = { preview: id => navigate('template', { templateId: id }), back };
    window.templatePageNavigation = navigation;
    on(gridEl, 'click', handleAction);
    on(recoveryEl, 'click', handleAction);
    function handleAction(event) {
      const action = event.target.closest?.('[data-catalog-action]')?.dataset.catalogAction;
      if (action === 'clear') clearFilters();
      if (action === 'retry') loadCatalog();
      if (action === 'create') window.openNewTemplateModal?.();
      if (action === 'browse') back();
    }
    categoriesEl.querySelectorAll('.category-card').forEach(button => on(button, 'click', () => {
      state.category = button.dataset.catId;
      filterAndDisplay();
    }));
    on(searchInput, 'input', event => { state.query = event.target.value; filterAndDisplay(); });
    function extractTagsWithCounts(list) {
      const counts = Object.create(null);
      for (const item of list) for (const tag of new Set(tagsOf(item))) counts[tag] = (counts[tag] || 0) + 1;
      const allTags = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      return { allTags, counts };
    }
    function renderTagOptions(container) {
      if (!container) return;
      const { allTags, counts } = extractTagsWithCounts(templates);
      const q = tagSearchQuery.trim().toLocaleLowerCase();
      const matched = q ? allTags.filter(tag => tag.toLocaleLowerCase().includes(q)) : allTags;
      const focused = document.activeElement?.getAttribute?.('data-tag');
      container.innerHTML = '';
      const choices = [['__ALL__', '全部標籤', templates.length], ...matched.map(tag => [tag, tag, counts[tag]])];
      if (!matched.length && q) {
        const empty = document.createElement('p');
        empty.className = 'template-tag-empty';
        empty.textContent = '找不到符合的標籤';
        container.appendChild(empty);
        return;
      }
      for (const [tag, label, count] of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'project-filter-pill template-tag-pill morph-item';
        const active = tag === '__ALL__' ? !state.tag : state.tag === tag;
        button.classList.toggle('is-active', active);
        button.setAttribute('data-tag', tag);
        button.setAttribute('aria-pressed', String(active));
        button.setAttribute('role', 'menuitemcheckbox');
        button.setAttribute('aria-checked', String(active));
        button.innerHTML = `<span>${escape(label)}</span><span class="filter-count">${count}</span>`;
        button.addEventListener('click', () => {
          state.tag = tag === '__ALL__' ? '' : (state.tag === tag ? '' : tag);
          if (tagsLabel) tagsLabel.textContent = state.tag || '所有標籤';
          if (window.ProjectOptionMorph?.isOpen?.()) window.ProjectOptionMorph.close('action', () => filterAndDisplay());
          else filterAndDisplay();
        });
        container.appendChild(button);
      }
      if (focused) [...container.children].find(button => button.getAttribute('data-tag') === focused)?.focus?.({ preventScroll: true });
      window.DynamicMaskSystem?.refresh?.();
    }
    function openMenu(trigger, content, opts, onClose) {
      window.ProjectOptionMorph?.openSurface(trigger, {
        content, width: opts.width || 240, label: opts.label, role: opts.role, keyboard: opts.keyboard, align: trigger.dataset?.morphAlign,
        onClose: reason => { onClose(); if (!['navigation', 'unmount', 'destroy', 'modal', 'focus_out', 'tab', 'replaced'].includes(reason) && !disposed && trigger.isConnected && !window.ProjectOptionMorph.isOpen()) trigger.focus({ preventScroll: true }); }
      });
    }
    on(tagsTrigger, 'click', () => {
      tagSearchQuery = '';
      tagMenu = document.createElement('div');
      tagMenu.className = 'template-tag-panel';
      const searchBox = document.createElement('label');
      searchBox.className = 'template-tag-search';
      searchBox.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" placeholder="搜尋標籤…" aria-label="搜尋標籤" autocomplete="off">';
      const tagSearchInput = searchBox.querySelector('input');
      tagSearchInput.addEventListener('input', () => { tagSearchQuery = tagSearchInput.value; renderTagOptions(tagGrid); });
      tagGrid = document.createElement('div');
      tagGrid.className = 'template-tag-grid';
      renderTagOptions(tagGrid);
      tagMenu.appendChild(searchBox);
      tagMenu.appendChild(tagGrid);
      const gridRef = tagGrid;
      openMenu(tagsTrigger, tagMenu, { width: 380, label: '標籤篩選', role: 'dialog', keyboard: 'content' }, () => { window.DynamicMaskSystem?.detach?.(gridRef); tagMenu = null; tagGrid = null; tagSearchQuery = ''; });
      window.DynamicMaskSystem?.attach?.(gridRef, { maskSize: 28, direction: 'vertical' });
    });
    function renderSortOptions() {
      if (!sortMenu) return;
      const focused = document.activeElement?.getAttribute?.('data-sort') || document.activeElement?.getAttribute?.('data-direction');
      sortMenu.innerHTML = '';
      const choices = [['catalog', '預設順序'], ['name', '依名稱排序'], ['duration', '模板時長']];
      for (const [key, label] of choices) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'morph-item';
        button.setAttribute('data-sort', key); button.setAttribute('role', 'menuitemradio'); button.setAttribute('aria-checked', String(state.sort === key));
        button.textContent = label;
        if (state.sort === key) { const check = document.createElement('span'); check.className = 'projects-sort-check'; check.setAttribute('aria-hidden', 'true'); check.textContent = '✓'; button.appendChild(check); }
        button.addEventListener('click', () => { state.sort = key; renderSortOptions(); sortCards(); }); sortMenu.appendChild(button);
      }
      const directions = document.createElement('div'); directions.className = 'projects-sort-directions';
      for (const [value, label] of [['asc', '遞增 ↑'], ['desc', '遞減 ↓']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'morph-item';
        button.setAttribute('data-direction', value); button.setAttribute('aria-pressed', String(state.direction === value)); button.textContent = label;
        button.addEventListener('click', () => { state.direction = value; renderSortOptions(); sortCards(); }); directions.appendChild(button);
      }
      sortMenu.appendChild(directions);
      if (focused) [...sortMenu.querySelectorAll('button')].find(button => button.getAttribute('data-sort') === focused || button.getAttribute('data-direction') === focused)?.focus?.({ preventScroll: true });
    }
    on(sortTrigger, 'click', () => {
      sortMenu = document.createElement('div'); sortMenu.className = 'projects-dropdown-options'; renderSortOptions();
      openMenu(sortTrigger, sortMenu, { width: 240, label: '排序模板' }, () => { sortMenu = null; });
    });
    async function sortCards() {
      const current = new Map(animations.map(animation => { const card = animation.effect.target; return [card.dataset.id, window.getComputedStyle(card).transform]; }));
      cancelSort(); const sequence = sortSequence;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !gridEl.animate) { filterAndDisplay(); return; }
      const viewport = (storeBody || gridEl.parentElement).getBoundingClientRect();
      const cards = [...gridEl.querySelectorAll('.template-card')].filter(card => { const r = card.getBoundingClientRect(); return r.bottom > viewport.top && r.top < viewport.bottom; });
      if (!cards.length) { filterAndDisplay(); return; }
      const rects = new Map(cards.map(card => [card, card.getBoundingClientRect()]));
      const visibleLeft = Math.max(viewport.left, Math.min(...cards.map(card => rects.get(card).left)));
      const visibleRight = Math.min(viewport.right, Math.max(...cards.map(card => rects.get(card).right)));
      const visibleTop = Math.max(viewport.top, Math.min(...cards.map(card => rects.get(card).top)));
      const visibleBottom = Math.min(viewport.bottom, Math.max(...cards.map(card => rects.get(card).bottom)));
      const centerX = (visibleLeft + visibleRight) / 2;
      const centerY = (visibleTop + visibleBottom) / 2;
      const gatherScale = .72;
      const transforms = new Map(cards.map(card => { const r = rects.get(card); return [card, { x: centerX - r.left - r.width / 2, y: centerY - r.top - r.height / 2 }]; }));
      const gather = cards.map(card => { const { x, y } = transforms.get(card); return card.animate([{ transform: !current.get(card.dataset.id) || current.get(card.dataset.id) === 'none' ? 'translate(0,0) scale(1)' : current.get(card.dataset.id) }, { transform: `translate(${x}px,${y}px) scale(${gatherScale})` }], { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }); });
      animations = gather;
      await Promise.allSettled(gather.map(animation => animation.finished));
      await new Promise(resolve => setTimeout(resolve, 40));
      if (disposed || sequence !== sortSequence) return;
      const gathered = new Map(cards.map(card => [card.dataset.id, card.getBoundingClientRect()]));
      gather.forEach(animation => animation.cancel());
      filterAndDisplay(true);
      const nextCards = [...gridEl.querySelectorAll('.template-card')].filter(card => { const r = card.getBoundingClientRect(); return (r.bottom > viewport.top && r.top < viewport.bottom) || gathered.has(card.dataset.id); });
      animations = nextCards.map(card => {
        const to = card.getBoundingClientRect();
        const from = gathered.get(card.dataset.id) || { left: centerX - to.width * gatherScale / 2, top: centerY - to.height * gatherScale / 2 };
        const x = from.left - to.left - to.width * (1 - gatherScale) / 2;
        const y = from.top - to.top - to.height * (1 - gatherScale) / 2;
        return card.animate([{ transform: `translate(${x}px,${y}px) scale(${gatherScale})` }, { transform: 'translate(0,0) scale(1)' }], { duration: 400, easing: 'cubic-bezier(.2,.85,.25,1.15)', fill: 'none' });
      });
      await Promise.allSettled(animations.map(animation => animation.finished));
      if (sequence === sortSequence) animations = [];
    }

    on(clearButton, 'click', clearFilters);
    on(getEl('new-template-button'), 'click', () => window.openNewTemplateModal?.());
    async function loadCatalog() {
      if (loading || disposed) return;
      loading = true;
      loadError = false;
      gridEl.setAttribute?.('aria-busy', 'true');
      gridEl.innerHTML = '<div class="template-skeleton" aria-hidden="true"></div>'.repeat(5) + '<span class="template-sr-only" role="status">正在載入模板…</span>';
      try {
        templates = await (window.PageAssetLoader.fetchTemplateIndex || window.PageAssetLoader.fetchTemplates)(signal);
      } catch (error) {
        if (error.name === 'AbortError' || signal?.aborted || disposed) return;
        loadError = true;
      } finally { loading = false; }
      if (signal?.aborted || disposed) return;
      gridEl.setAttribute?.('aria-busy', 'false');
      const counts = getCatCounts(templates);
      Object.entries({ all: '全部', product: 'product', story: 'story', twist: 'twist', custom: 'custom' }).forEach(([id, cat]) => {
        const el = getEl('count-' + id);
        if (el) el.textContent = String(counts[cat]);
      });
      const tags = extractTagsWithCounts(templates).allTags;
      if (state.tag && !tags.includes(state.tag)) state.tag = '';
      if (featuredEl) {
        // Represent distinct content directions; no invented popularity or ranking.
        const featured = templates.filter((t, i, list) => list.findIndex(item => categoryOf(item) === categoryOf(t)) === i).slice(0, 2);
        featuredEl.innerHTML = featured.map(t => renderCard(t, true)).join('');
        bindCards(featuredEl);
      }
      filterAndDisplay();
      if (storeBody) storeBody.scrollTop = state.scrollTop;
      activeId = null;
      await updateRoute(currentRoute);
    }
    window.filterStoreTemplates = filterAndDisplay;
    window.initTemplatePage?.();
    await loadCatalog();
    return {
      updateRoute, showBrowse, showDetail: template => navigation.preview(template.id), getHistoryState: snapshot,
      unmount() {
        browseMemory = snapshot();
        disposed = true;
        cancelSort();
        if (tagMenu || sortMenu) window.ProjectOptionMorph?.close('unmount');
        window.destroyTemplateTimeline?.();
        window.destroyTemplatePage?.();
        listeners.forEach(off => off());
        if (window.filterStoreTemplates === filterAndDisplay) delete window.filterStoreTemplates;
        if (window.templatePageNavigation === navigation) delete window.templatePageNavigation;
        window.DynamicMaskSystem?.detach?.(storeBody);
        const detailBody = getEl('template-detail-body') || root?.querySelector?.('.template-detail-body');
        if (detailBody && window.DynamicMaskSystem && typeof window.DynamicMaskSystem.detach === 'function') {
          window.DynamicMaskSystem.detach(detailBody);
        }
        pageMain?.classList.remove('is-template-detail-mode');
      }
    };
  }
  const TemplatesPage = { mount, getCatCounts, CAT_MAP, durationOf, renderCard };
  window.TemplatesPage = TemplatesPage;
  if (typeof module !== 'undefined' && module.exports) module.exports = TemplatesPage;
})();
