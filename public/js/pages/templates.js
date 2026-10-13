/** Template marketplace. The router owns URLs; this page owns catalog/view state. */
(function () {
  'use strict';
  const CAT_MAP = { product: '商品廣告', story: '敘事紀實', twist: '高留存節奏', custom: '團隊資產', '未分類': '未分類' };
  let browseMemory = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const categoryOf = t => ['product', 'story', 'twist'].includes(t.category || t.type) ? (t.category || t.type) : 'custom';
  const tagsOf = t => Array.isArray(t.tags) ? t.tags.filter(tag => typeof tag === 'string' && tag.trim()) : [];
  function getCatCounts(templates) {
    const counts = { '全部': templates.length, product: 0, story: 0, twist: 0, custom: 0 };
    templates.forEach(t => counts[categoryOf(t)]++);
    return counts;
  }
  function durationOf(t) {
    const explicit = parseFloat(t.duration);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    if (!Array.isArray(t.structure) || !t.structure.length) return null;
    const values = t.structure.map(shot => parseFloat(shot.duration));
    return values.every(value => Number.isFinite(value) && value > 0) ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : null;
  }
  function safeMediaUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value, document.baseURI || window.location?.href || 'http://localhost/');
      return ['http:', 'https:'].includes(url.protocol) ? value : '';
    } catch (_) { return ''; }
  }
  function renderCard(t, featured = false) {
    const name = t.name || t.title || '未命名模板';
    const duration = durationOf(t);
    const shotCount = Number.isFinite(Number(t.shotsCount)) && t.shotsCount != null ? Number(t.shotsCount) : (Array.isArray(t.structure) ? t.structure.length : null);
    const source = t.videoUrl || t.source?.url;
    const sourceUrl = typeof source === 'string' ? source : '';
    const videoId = t.source?.videoId || t.videoId || sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/)?.[1];
    const thumbnail = safeMediaUrl(t.thumbnail || t.cover || t.source?.thumbnail || (videoId ? 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg' : ''));
    const specs = [duration !== null ? duration + ' 秒' : '', shotCount !== null ? shotCount + ' 鏡頭' : '', ...(Array.isArray(t.platform) ? t.platform.filter(p => typeof p === 'string').slice(0, 2) : [])].filter(Boolean);
    return '<article class="template-card' + (featured ? ' template-card-featured' : '') + '" data-id="' + escape(t.id) + '">' +
      '<a class="template-video-cover' + (thumbnail ? '' : ' no-cover') + '" href="/template/' + encodeURIComponent(t.id) + '" data-action="preview" aria-label="預覽 ' + escape(name) + '">' +
      (thumbnail ? '<img src="' + escape(thumbnail) + '" alt="" width="640" height="360" loading="' + (featured ? 'eager' : 'lazy') + '">' : '<span class="cover-placeholder">尚無封面</span>') +
      '<span class="cover-play" aria-hidden="true">▶</span></a><div class="template-card-body">' +
      '<span class="template-card-cat">' + escape(t.categoryLabel || CAT_MAP[categoryOf(t)]) + '</span>' +
      '<h3 class="text-card-title"><a href="/template/' + encodeURIComponent(t.id) + '" data-action="preview">' + escape(name) + '</a></h3>' +
      '<p>' + escape(t.description || '查看模板結構，確認是否適合你的創作方向。') + '</p>' +
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
    const detailEl = getEl('template-detail-immersive');
    const recoveryEl = getEl('template-recovery');
    const featuredEl = getEl('template-featured-grid');
    const featuredSection = getEl('template-featured');
    const searchInput = getEl('store-search-input');
    const tagInput = getEl('store-tag-filter');
    const sortInput = getEl('store-sort');
    const clearButton = getEl('store-clear-filters');
    if (!categoriesEl || !gridEl || !detailEl) return { unmount() {} };
    const pageMain = document.getElementById('page-main');
    let state = { category: '全部', query: '', tag: '', sort: 'catalog', scrollTop: 0, ...browseMemory, ...route.browseState };
    let currentRoute = route;
    let activeId = null;
    let templates = [];
    let loadError = false;
    let disposed = false;
    let loading = false;
    let lastPreviewId = null;
    const listeners = [];
    const on = (el, event, handler) => {
      if (!el) return;
      el.addEventListener(event, handler);
      listeners.push(() => el.removeEventListener(event, handler));
    };
    const isFiltered = () => state.category !== '全部' || !!state.query.trim() || !!state.tag;
    function snapshot() {
      if (!activeId) state.scrollTop = storeView?.scrollTop || 0;
      return { ...state };
    }
    function syncControls() {
      if (searchInput) searchInput.value = state.query;
      if (tagInput) tagInput.value = state.tag;
      if (sortInput) sortInput.value = state.sort;
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
            navigate('generate', { templateId: card.dataset.id });
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
    function filterAndDisplay() {
      syncControls();
      let filtered = templates.filter(t => (state.category === '全部' || categoryOf(t) === state.category) && (!state.tag || tagsOf(t).includes(state.tag)));
      const query = state.query.trim().toLocaleLowerCase();
      if (query) filtered = filtered.filter(t => [t.name, t.title, t.description, t.categoryLabel, CAT_MAP[categoryOf(t)], ...tagsOf(t), ...(Array.isArray(t.platform) ? t.platform : [])].some(value => String(value || '').toLocaleLowerCase().includes(query)));
      if (state.sort === 'name') filtered = [...filtered].sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || '', 'zh-Hant'));
      if (state.sort === 'duration') filtered = [...filtered].sort((a, b) => (durationOf(a) ?? Infinity) - (durationOf(b) ?? Infinity));
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
      if (storeView) storeView.scrollTop = state.scrollTop;
      document.title = '模板庫 — Storyboard AI';
      const focusLink = Array.from(gridEl.querySelectorAll('.template-card')).find(card => card.dataset.id === lastPreviewId)?.querySelector('.card-preview-btn');
      focusLink?.focus?.({ preventScroll: true });
    }
    function updateRoute(opts = {}) {
      if (disposed) return;
      if (!activeId) snapshot();
      currentRoute = opts;
      if (opts.browseState) { state = { ...state, ...opts.browseState }; filterAndDisplay(); }
      if (!opts.templateId) { showBrowse(); return; }
      if (activeId === opts.templateId && !loadError) return;
      window.destroyTemplateTimeline?.();
      activeId = opts.templateId;
      const template = templates.find(t => String(t.id) === String(opts.templateId));
      if (template && window.renderTemplateDetailTimeline) {
        if (recoveryEl) recoveryEl.hidden = true;
        window.renderTemplateDetailTimeline(template, detailEl);
        document.title = (template.name || template.title || '模板詳情') + ' — Storyboard AI';
        getEl('detail-template-title')?.focus?.({ preventScroll: true });
      } else {
        if (storeView) storeView.style.display = 'none';
        detailEl.style.display = 'none';
        pageMain?.classList.add('is-template-detail-mode');
        if (pageMain) pageMain.scrollTop = 0;
        if (recoveryEl) {
          recoveryEl.hidden = false;
          recoveryEl.innerHTML = '<h1 class="text-section-title" tabindex="-1">' + (loadError ? '模板載入失敗' : '找不到這個模板') + '</h1><p>' + (loadError ? '請檢查連線後再試一次。' : '模板可能已移除，或連結中的 ID 不正確。') + '</p>' + (loadError ? '<button type="button" class="card-preview-btn" data-catalog-action="retry">重新載入</button>' : '') + '<button type="button" class="card-apply-btn" data-catalog-action="browse">返回模板庫</button>';
          recoveryEl.querySelector('h1')?.focus?.();
        }
        document.title = (loadError ? '模板載入失敗' : '找不到模板') + ' — Storyboard AI';
      }
    }
    function back() {
      const historyHost = window.parent && window.parent !== window ? window.parent : window;
      if (historyHost.history?.state?.templateFromBrowse) historyHost.history.back();
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
    on(tagInput, 'change', event => { state.tag = event.target.value; filterAndDisplay(); });
    on(sortInput, 'change', event => { state.sort = event.target.value; filterAndDisplay(); });
    on(clearButton, 'click', clearFilters);
    on(getEl('new-template-button'), 'click', () => window.openNewTemplateModal?.());
    async function loadCatalog() {
      if (loading || disposed) return;
      loading = true;
      loadError = false;
      gridEl.setAttribute?.('aria-busy', 'true');
      gridEl.innerHTML = '<div class="template-skeleton" aria-hidden="true"></div>'.repeat(5) + '<span class="template-sr-only" role="status">正在載入模板…</span>';
      try {
        if (Array.isArray(window.cacheTemplatesList)) templates = window.cacheTemplatesList;
        else {
          const response = await fetch('/api/get-templates', { signal });
          if (!response.ok) throw new Error('Catalog request failed');
          const data = await response.json();
          if (!Array.isArray(data)) throw new Error('Invalid catalog response');
          templates = data;
          window.cacheTemplatesList = data;
        }
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
      if (tagInput) {
        const tags = [...new Set(templates.flatMap(tagsOf))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
        tagInput.innerHTML = '<option value="">所有標籤</option>' + tags.map(tag => '<option value="' + escape(tag) + '">' + escape(tag) + '</option>').join('');
        if (!tags.includes(state.tag)) state.tag = '';
      }
      if (featuredEl) {
        // Represent distinct content directions; no invented popularity or ranking.
        const featured = templates.filter((t, i, list) => list.findIndex(item => categoryOf(item) === categoryOf(t)) === i).slice(0, 2);
        featuredEl.innerHTML = featured.map(t => renderCard(t, true)).join('');
        bindCards(featuredEl);
      }
      filterAndDisplay();
      if (storeView) storeView.scrollTop = state.scrollTop;
      activeId = null;
      updateRoute(currentRoute);
    }
    window.filterStoreTemplates = filterAndDisplay;
    window.initTemplatePage?.();
    await loadCatalog();
    return {
      updateRoute, showBrowse, showDetail: template => navigation.preview(template.id), getHistoryState: snapshot,
      unmount() {
        browseMemory = snapshot();
        disposed = true;
        window.destroyTemplateTimeline?.();
        window.destroyTemplatePage?.();
        listeners.forEach(off => off());
        if (window.filterStoreTemplates === filterAndDisplay) delete window.filterStoreTemplates;
        if (window.templatePageNavigation === navigation) delete window.templatePageNavigation;
        pageMain?.classList.remove('is-template-detail-mode');
      }
    };
  }
  const TemplatesPage = { mount, getCatCounts, CAT_MAP, durationOf, renderCard };
  window.TemplatesPage = TemplatesPage;
  if (typeof module !== 'undefined' && module.exports) module.exports = TemplatesPage;
})();
