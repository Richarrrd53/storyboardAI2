/**
 * StoryboardAI - Templates Page Controller (P3-5)
 * Manages template catalog rendering, category filtering, search,
 * and coordinates with template-timeline.js / template.js child modules.
 */
(function () {
  'use strict';

  const CAT_MAP = {
    'product': '商品廣告',
    'story': '敘事紀實',
    'twist': '高留存節奏',
    'custom': '團隊資產',
    '未分類': '未分類'
  };

  function getCatCounts(templates) {
    const catCounts = { '全部': templates.length, 'product': 0, 'story': 0, 'twist': 0, 'custom': 0 };
    templates.forEach(t => {
      const cat = t.category || t.type;
      const key = (cat === 'custom' || cat === 'product' || cat === 'story' || cat === 'twist') ? cat : 'custom';
      catCounts[key]++;
    });
    return catCounts;
  }

  function renderCard(t) {
    const shotCount = t.shotsCount || (t.structure ? t.structure.length : 0);
    const tags = Array.isArray(t.tags) ? t.tags.slice(0, 3).map(tag => `<span>${tag}</span>`).join(' ') : '';
    const platforms = Array.isArray(t.platform) ? t.platform.map(p => `<span class="platform-badge">${p}</span>`).join('') : '<span class="platform-badge">shorts</span>';
    
    let duration = '0s';
    if (t.structure && t.structure.length) {
      const sumSec = t.structure.map(s => parseInt(s.duration) || 0).reduce((a, b) => a + b, 0);
      duration = `${sumSec}s`;
    }

    const totalSeconds = parseInt(duration) || Math.max(shotCount * 3, 15);
    const sourceUrl = t.videoUrl || t.source?.url || '';
    const youtubeMatch = sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);
    const sourceVideoId = t.source?.videoId || t.videoId || youtubeMatch?.[1] || '';
    const thumbnail = t.thumbnail || t.cover || t.source?.thumbnail || (sourceVideoId ? `https://i.ytimg.com/vi/${encodeURIComponent(sourceVideoId)}/hqdefault.jpg` : '');
    const paceLabel = totalSeconds <= 25 ? '快節奏' : totalSeconds <= 50 ? '中快節奏' : '敘事節奏';
    const statusLabel = t.category === 'custom' ? '團隊草稿' : '已驗證結構';
    const statusClass = t.category === 'custom' ? 'is-draft' : 'is-ready';

    return `
      <article class="template-card" data-id="${t.id}" tabindex="0" aria-label="預覽 ${t.name || t.title || '無標題'}">
        <div class="template-card-header">
          <div class="template-card-kicker">
            <span class="template-card-cat">${CAT_MAP[t.category] || t.category || '未分類'}</span>
            <span class="workflow-status ${statusClass}"><i></i>${statusLabel}</span>
          </div>
        </div>
        <div class="template-video-cover ${thumbnail ? '' : 'no-cover'}" aria-label="來源影片封面">
          ${thumbnail ? `<img src="${thumbnail}" alt="${t.source?.title || t.name || '來源影片'}封面" loading="lazy" onerror="this.parentElement.classList.add('no-cover');this.remove()">` : ''}
          <span class="cover-source">${sourceVideoId ? 'YOUTUBE' : 'SOURCE VIDEO'}</span>
          <span class="cover-duration">${duration}</span>
          <span class="cover-play" aria-hidden="true">▶</span>
        </div>
        <div class="template-card-body">
          <h4>${t.name || t.title || '無標題'}</h4>
          <p>${t.description || '無描述'}</p>
          <div class="template-card-tags">
            ${tags}
          </div>
        </div>
        <div class="template-specs" aria-label="剪輯規格">
          <span><b>${duration}</b> 長度</span>
          <span><b>${shotCount}</b> 鏡頭</span>
          <span><b>${paceLabel}</b> 節奏</span>
        </div>
        <div class="template-card-footer">
          <div class="platform-badges" aria-label="適用平台">
            ${platforms}<span class="aspect-badge">9:16</span>
          </div>
          <div class="card-actions">
            <button type="button" class="card-preview-btn" data-action="preview">查看時間軸</button>
            <button type="button" class="card-apply-btn" data-action="apply" aria-label="套用 ${t.name || t.title || '模板'}">套用</button>
          </div>
        </div>
      </article>
    `;
  }

  async function mount(context = {}) {
    const {
      root = document.getElementById('page-main'),
      signal,
      navigate = (page, params) => window.spaNavigate?.(page, params)
    } = context;

    if (signal?.aborted) return { unmount() {} };

    const getEl = id => (root && root.querySelector ? root.querySelector(`#${id}`) : null) || document.getElementById(id);
    const categoriesEl = getEl('store-categories');
    const gridEl = getEl('template-grid');
    const detailImmersiveEl = getEl('template-detail-immersive');

    if (!categoriesEl || !gridEl || !detailImmersiveEl) {
      return { unmount() {} };
    }

    gridEl.innerHTML = '<div style="color:var(--text-mid); text-align:center; padding: 40px; grid-column: 1/-1;">載入中...</div>';

    let templates = [];
    try {
      if (Array.isArray(window.cacheTemplatesList) && window.cacheTemplatesList.length > 0) {
        templates = window.cacheTemplatesList;
      } else {
        const res = await fetch('/api/get-templates', { signal });
        if (res.ok) {
          templates = await res.json();
          window.cacheTemplatesList = templates;
        }
      }
    } catch (e) {
      if (e.name === 'AbortError' || signal?.aborted) return { unmount() {} };
      templates = [];
    }

    if (signal?.aborted) return { unmount() {} };

    if (!templates || templates.length === 0) {
      gridEl.innerHTML = `
        <div class="projects-empty">
          <h3>目前尚無模板</h3>
          <p>已同步的爆點模板尚未產生，請稍後再試或上傳模板。</p>
        </div>
      `;
      return {
        unmount() {
          if (typeof window.destroyTemplateTimeline === 'function') {
            window.destroyTemplateTimeline();
          }
        }
      };
    }

    // Update counts
    const catCounts = getCatCounts(templates);
    const countAllEl = getEl('count-all');
    if (countAllEl) countAllEl.textContent = `${catCounts['全部']} 模板`;
    const countProdEl = getEl('count-product');
    if (countProdEl) countProdEl.textContent = `${catCounts['product']} 模板`;
    const countStoryEl = getEl('count-story');
    if (countStoryEl) countStoryEl.textContent = `${catCounts['story']} 模板`;
    const countTwistEl = getEl('count-twist');
    if (countTwistEl) countTwistEl.textContent = `${catCounts['twist']} 模板`;
    const countCustomEl = getEl('count-custom');
    if (countCustomEl) countCustomEl.textContent = `${catCounts['custom']} 模板`;

    let currentCategory = '全部';
    let searchQuery = '';

    function filterAndDisplay() {
      let filtered = templates;
      if (currentCategory !== '全部') {
        filtered = templates.filter(t => {
          const c = t.category || t.type;
          if (currentCategory === 'custom') {
            return c !== 'product' && c !== 'story' && c !== 'twist';
          }
          return c === currentCategory;
        });
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(t => {
          const nameMatch = (t.name || t.title || '').toLowerCase().includes(query);
          const descMatch = (t.description || '').toLowerCase().includes(query);
          const tagMatch = Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase().includes(query));
          return nameMatch || descMatch || tagMatch;
        });
      }

      if (filtered.length === 0) {
        gridEl.innerHTML = `
          <div style="color:var(--text-mid); text-align:center; padding: 60px; grid-column: 1/-1; font-size:1.05rem; font-weight:700;">
            沒有找到符合條件的模板
            <p style="font-size:0.9rem; color:#8b87a8; font-weight:normal; margin-top:8px;">試試其他關鍵字，或是點選其他分類瀏覽。</p>
          </div>
        `;
        return;
      }

      gridEl.innerHTML = filtered.map(renderCard).join('');

      // Add click listeners to template cards
      gridEl.querySelectorAll('.template-card').forEach(el => {
        const openPreview = () => {
          const id = el.dataset.id;
          const template = templates.find(x => x.id === id);
          if (template && window.renderTemplateDetailTimeline) {
            window.renderTemplateDetailTimeline(template, detailImmersiveEl);
          }
        };
        el.addEventListener('click', (event) => {
          const action = event.target.closest('[data-action]')?.dataset.action;
          if (action === 'apply') {
            event.stopPropagation();
            navigate('generate', { templateId: el.dataset.id });
            return;
          }
          openPreview();
        });
        el.addEventListener('keydown', (event) => {
          if ((event.key === 'Enter' || event.key === ' ') && event.target === el) {
            event.preventDefault();
            openPreview();
          }
        });
      });
    }

    // Set category card click listeners
    const catCards = categoriesEl.querySelectorAll('.category-card');
    const catClickHandlers = [];
    catCards.forEach(card => {
      const handler = () => {
        catCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        currentCategory = card.dataset.catId;

        const catTitleEl = getEl('current-category-title');
        const catDescEl = getEl('current-category-desc');

        if (currentCategory === '全部') {
          if (catTitleEl) catTitleEl.textContent = '推薦剪輯序列';
          if (catDescEl) catDescEl.textContent = '先比較節奏與規格，再進入時間軸查看每個剪輯決策。';
        } else {
          if (catTitleEl) catTitleEl.textContent = `${CAT_MAP[currentCategory] || currentCategory} 序列`;
          if (catDescEl) catDescEl.textContent = `針對 ${CAT_MAP[currentCategory] || currentCategory} 工作流整理的剪輯結構與製作規格。`;
        }

        filterAndDisplay();
      };
      card.addEventListener('click', handler);
      catClickHandlers.push({ card, handler });
    });

    // Set search listener
    const searchInput = getEl('store-search-input');
    let searchHandler = null;
    if (searchInput) {
      searchHandler = (e) => {
        searchQuery = e.target.value;
        filterAndDisplay();
      };
      searchInput.addEventListener('input', searchHandler);
    }

    // Expose filterStoreTemplates for external / child module refilter calls
    window.filterStoreTemplates = filterAndDisplay;

    // Initial display
    filterAndDisplay();

    // Child module initialization (modal and form handlers)
    if (typeof window.initTemplatePage === 'function') {
      window.initTemplatePage();
    }

    function showDetail(template) {
      if (!template) return;
      if (typeof window.renderTemplateDetailTimeline === 'function') {
        window.renderTemplateDetailTimeline(template, detailImmersiveEl);
      }
    }

    function showBrowse() {
      if (typeof window.backToStoreBrowse === 'function') {
        window.backToStoreBrowse();
      }
    }

    return {
      showBrowse,
      showDetail,
      unmount() {
        if (typeof window.destroyTemplateTimeline === 'function') {
          window.destroyTemplateTimeline();
        }
        catClickHandlers.forEach(({ card, handler }) => {
          card.removeEventListener('click', handler);
        });
        if (searchInput && searchHandler) {
          searchInput.removeEventListener('input', searchHandler);
        }
        if (window.filterStoreTemplates === filterAndDisplay) {
          delete window.filterStoreTemplates;
        }
        const pageMain = document.getElementById('page-main');
        if (pageMain) {
          pageMain.classList.remove('is-template-detail-mode');
        }
      }
    };
  }

  const TemplatesPage = {
    mount,
    getCatCounts,
    CAT_MAP
  };

  window.TemplatesPage = TemplatesPage;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TemplatesPage;
  }
})();
