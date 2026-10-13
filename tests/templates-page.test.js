const test = require('node:test');
const assert = require('node:assert/strict');

// Set up mock DOM environment
function createMockElement(tagName = 'div', id = '', className = '') {
  const children = [];
  const eventListeners = {};
  const dataset = {};
  const classListSet = new Set(className ? className.split(' ').filter(Boolean) : []);
  const style = {
    display: '',
    setProperty: (k, v) => { style[k] = v; }
  };

  const el = {
    tagName: tagName.toUpperCase(),
    id,
    dataset,
    style,
    children,
    textContent: '',
    value: '',
    classList: {
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls),
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classListSet.has(cls)) classListSet.delete(cls);
          else classListSet.add(cls);
        } else if (force) {
          classListSet.add(cls);
        } else {
          classListSet.delete(cls);
        }
      },
      contains: (cls) => classListSet.has(cls)
    },
    get className() {
      return Array.from(classListSet).join(' ');
    },
    set className(val) {
      classListSet.clear();
      (val || '').split(' ').filter(Boolean).forEach(c => classListSet.add(c));
    },
    get innerHTML() {
      return this._innerHTML || '';
    },
    set innerHTML(val) {
      this._innerHTML = val;
      // Synthesize children for querySelector/querySelectorAll when innerHTML is assigned
      this._rebuildChildrenFromHTML(val);
    },
    _rebuildChildrenFromHTML(html) {
      this.children.length = 0;
      if (!html) return;
      // Match template-cards
      const cardRegex = /<article[^>]*class="([^"]*template-card[^"]*)"[^>]*data-id="([^"]*)"[^>]*>([\s\S]*?)<\/article>/g;
      let m;
      while ((m = cardRegex.exec(html)) !== null) {
        const cardEl = createMockElement('article', '', m[1]);
        cardEl.dataset.id = m[2];
        const innerContent = m[3];

        // Synthesize card action buttons inside
        if (innerContent.includes('data-action="preview"')) {
          const prevBtn = createMockElement('button', '', 'card-preview-btn');
          prevBtn.dataset.action = 'preview';
          prevBtn.parentElement = cardEl;
          cardEl.appendChild(prevBtn);
        }
        if (innerContent.includes('data-action="apply"')) {
          const applyBtn = createMockElement('button', '', 'card-apply-btn');
          applyBtn.dataset.action = 'apply';
          applyBtn.parentElement = cardEl;
          cardEl.appendChild(applyBtn);
        }
        cardEl.parentElement = this;
        this.appendChild(cardEl);
      }
    },
    appendChild(child) {
      child.parentElement = this;
      children.push(child);
      return child;
    },
    querySelector(sel) {
      if (sel.startsWith('#')) {
        const targetId = sel.slice(1);
        return findById(this, targetId);
      }
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        return findByClass(this, cls);
      }
      return null;
    },
    querySelectorAll(sel) {
      const results = [];
      if (sel.startsWith('.')) {
        const cls = sel.slice(1);
        findAllByClass(this, cls, results);
      }
      return results;
    },
    _eventListeners: eventListeners,
    addEventListener(evt, fn) {
      if (!eventListeners[evt]) eventListeners[evt] = [];
      eventListeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (!eventListeners[evt]) return;
      eventListeners[evt] = eventListeners[evt].filter(f => f !== fn);
    },
    dispatchEvent(evt) {
      const eventObj = typeof evt === 'string' ? { type: evt, target: this } : evt;
      if (!eventObj.target) eventObj.target = this;
      if (!eventObj.stopPropagation) {
        eventObj.stopPropagation = () => { eventObj._stopped = true; };
      }
      let curr = this;
      while (curr) {
        const listeners = (curr._eventListeners && curr._eventListeners[eventObj.type]) || [];
        listeners.forEach(f => f(eventObj));
        if (eventObj._stopped) break;
        curr = curr.parentElement;
      }
    },
    closest(sel) {
      if (sel === '[data-action]') {
        if (this.dataset?.action) return this;
        return this.parentElement?.closest ? this.parentElement.closest(sel) : null;
      }
      return null;
    }
  };

  return el;
}

function findById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children || []) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}

function findByClass(node, cls) {
  if (node.classList?.contains(cls)) return node;
  for (const child of node.children || []) {
    const found = findByClass(child, cls);
    if (found) return found;
  }
  return null;
}

function findAllByClass(node, cls, acc) {
  if (node.classList?.contains(cls)) acc.push(node);
  for (const child of node.children || []) {
    findAllByClass(child, cls, acc);
  }
}

// Setup full DOM mocks
const elementsById = {};
function registerEl(el) {
  if (el.id) elementsById[el.id] = el;
  return el;
}

const mockDoc = {
  getElementById(id) {
    return elementsById[id] || null;
  },
  createElement(tag) {
    return createMockElement(tag);
  }
};

global.document = mockDoc;
global.window = {
  document: mockDoc,
  cacheTemplatesList: null,
  renderTemplateDetailTimeline: null,
  destroyTemplateTimeline: null,
  initTemplatePage: null,
  backToStoreBrowse: null,
  triggerTemplateDetail: null,
  filterStoreTemplates: null
};

// Require the modules
const TemplatesPage = require('../public/js/pages/templates.js');
const timelineModule = require('../public/js/template-timeline.js');

const sampleTemplates = [
  {
    id: 'tpl-1',
    name: '美食探店開箱',
    category: 'product',
    description: '3秒鉤子開箱誘惑',
    tags: ['美食', '探店', '開箱'],
    shotsCount: 6,
    videoUrl: 'https://youtube.com/watch?v=11111111111'
  },
  {
    id: 'tpl-2',
    name: '品牌情感故事',
    category: 'story',
    description: '人物情感起承轉合',
    tags: ['故事', '情感'],
    shotsCount: 8,
    videoUrl: 'https://youtube.com/watch?v=22222222222'
  },
  {
    id: 'tpl-3',
    name: '高留存快節奏反轉',
    category: 'twist',
    description: '快速卡點與結尾神反轉',
    tags: ['反轉', '節奏'],
    shotsCount: 10,
    videoUrl: 'https://youtube.com/watch?v=33333333333'
  },
  {
    id: 'tpl-4',
    name: '自訂團隊模板',
    category: 'custom',
    description: '團隊自建內部資產',
    tags: ['團隊'],
    shotsCount: 4,
    videoUrl: 'https://youtube.com/watch?v=44444444444'
  }
];

function setupDOMStructure() {
  for (const k in elementsById) delete elementsById[k];

  const pageMain = registerEl(createMockElement('main', 'page-main'));
  const storeView = registerEl(createMockElement('section', 'template-store-view'));
  const detailImmersive = registerEl(createMockElement('section', 'template-detail-immersive'));
  const categoriesGrid = registerEl(createMockElement('div', 'store-categories'));
  const templateGrid = registerEl(createMockElement('div', 'template-grid'));
  const tagInput = registerEl(createMockElement('select', 'store-tag-filter'));
  const sortInput = registerEl(createMockElement('select', 'store-sort'));
  const clearButton = registerEl(createMockElement('button', 'store-clear-filters'));
  const recovery = registerEl(createMockElement('section', 'template-recovery'));
  const resultCount = registerEl(createMockElement('span', 'template-result-count'));
  const searchInput = registerEl(createMockElement('input', 'store-search-input'));

  const countAll = registerEl(createMockElement('span', 'count-all'));
  const countProd = registerEl(createMockElement('span', 'count-product'));
  const countStory = registerEl(createMockElement('span', 'count-story'));
  const countTwist = registerEl(createMockElement('span', 'count-twist'));
  const countCustom = registerEl(createMockElement('span', 'count-custom'));

  const currentCatTitle = registerEl(createMockElement('h3', 'current-category-title'));
  const currentCatDesc = registerEl(createMockElement('p', 'current-category-desc'));

  // Category cards
  ['全部', 'product', 'story', 'twist', 'custom'].forEach(catId => {
    const card = createMockElement('div', '', `category-card cat-${catId} ${catId === '全部' ? 'active' : ''}`);
    card.dataset.catId = catId;
    categoriesGrid.appendChild(card);
  });

  pageMain.appendChild(storeView);
  pageMain.appendChild(detailImmersive);
  storeView.appendChild(categoriesGrid);
  storeView.appendChild(templateGrid);
  storeView.appendChild(searchInput);

  return {
    pageMain,
    storeView,
    detailImmersive,
    categoriesGrid,
    templateGrid,
    searchInput,
    tagInput, sortInput, clearButton, recovery, resultCount,
    countAll,
    countProd,
    countStory,
    countTwist,
    countCustom,
    currentCatTitle,
    currentCatDesc
  };
}

test('TemplatesPage: Category counts calculation (getCatCounts)', () => {
  const counts = TemplatesPage.getCatCounts(sampleTemplates);
  assert.equal(counts['全部'], 4);
  assert.equal(counts['product'], 1);
  assert.equal(counts['story'], 1);
  assert.equal(counts['twist'], 1);
  assert.equal(counts['custom'], 1);

  // Fallback category to custom
  const unknownList = [{ id: 'u1', category: 'special_format' }];
  const unknownCounts = TemplatesPage.getCatCounts(unknownList);
  assert.equal(unknownCounts['custom'], 1);
  assert.equal(unknownCounts['全部'], 1);
});

test('TemplatesPage: Page Lifecycle Contract - mount() returns { unmount() }', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = [...sampleTemplates];

  let navigatedTo = null;
  const navigate = (page, params) => {
    navigatedTo = { page, params };
  };

  const instance = await TemplatesPage.mount({
    route: { browseState: { category: '全部', query: '', tag: '', sort: 'catalog', scrollTop: 0 } },
    root: dom.pageMain,
    navigate
  });

  assert.ok(instance, 'mount must return an instance');
  assert.equal(typeof instance.unmount, 'function', 'instance must have unmount()');

  // Verify DOM updated
  assert.equal(dom.countAll.textContent, '4');
  assert.equal(dom.countProd.textContent, '1');
  assert.equal(dom.templateGrid.children.length, 4, '4 template cards rendered');

  // Calling unmount should be idempotent and not throw
  assert.doesNotThrow(() => {
    instance.unmount();
    instance.unmount();
  });
});

test('TemplatesPage: Data loading from API and caches in window.cacheTemplatesList', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = null;

  let fetchCalled = false;
  global.fetch = async (url) => {
    fetchCalled = true;
    assert.equal(url, '/api/get-templates');
    return {
      ok: true,
      json: async () => sampleTemplates
    };
  };

  const instance = await TemplatesPage.mount({
    route: { browseState: { category: '全部', query: '', tag: '', sort: 'catalog', scrollTop: 0 } },
    root: dom.pageMain
  });

  assert.ok(fetchCalled, 'fetch should be called when cache is null');
  assert.equal(window.cacheTemplatesList?.length, 4, 'templates should be cached');
  assert.equal(dom.templateGrid.children.length, 4);

  instance.unmount();
});

test('TemplatesPage: Empty state when no templates exist', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = [];
  global.fetch = async () => ({
    ok: true,
    json: async () => []
  });

  const instance = await TemplatesPage.mount({
    route: { browseState: { category: '全部', query: '', tag: '', sort: 'catalog', scrollTop: 0 } },
    root: dom.pageMain
  });

  assert.ok(dom.templateGrid.innerHTML.includes('目前尚無模板'), 'renders empty state message');

  assert.doesNotThrow(() => {
    instance.unmount();
  });
});

test('TemplatesPage: Category filtering and search interaction', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = [...sampleTemplates];

  const instance = await TemplatesPage.mount({
    route: { browseState: { category: '全部', query: '', tag: '', sort: 'catalog', scrollTop: 0 } },
    root: dom.pageMain
  });

  assert.equal(dom.templateGrid.children.length, 4);

  // Click 'product' category card
  const prodCard = dom.categoriesGrid.children.find(c => c.dataset.catId === 'product');
  assert.ok(prodCard);
  prodCard.dispatchEvent({ type: 'click', target: prodCard });

  assert.equal(dom.templateGrid.children.length, 1);
  assert.equal(dom.templateGrid.children[0].dataset.id, 'tpl-1');
  assert.equal(dom.currentCatTitle.textContent, '商品廣告');

  // Search query within category
  dom.searchInput.value = '無相符關鍵字';
  dom.searchInput.dispatchEvent({ type: 'input', target: dom.searchInput });
  assert.equal(dom.templateGrid.children.length, 0);
  assert.ok(dom.templateGrid.innerHTML.includes('沒有找到符合條件的模板'));

  // Clear search and switch back to '全部'
  dom.searchInput.value = '';
  dom.searchInput.dispatchEvent({ type: 'input', target: dom.searchInput });
  const allCard = dom.categoriesGrid.children.find(c => c.dataset.catId === '全部');
  allCard.dispatchEvent({ type: 'click', target: allCard });
  assert.equal(dom.templateGrid.children.length, 4);

  instance.unmount();
});

test('TemplatesPage: Template card interactions (preview, apply) & back button', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = [...sampleTemplates];

  let previewedTemplate = null;
  window.renderTemplateDetailTimeline = (t) => {
    previewedTemplate = t;
    dom.pageMain.classList.add('is-template-detail-mode');
    dom.storeView.style.display = 'none';
    dom.detailImmersive.style.display = 'flex';
  };

  let navigatedTo = null;
  let instance;
  const navigate = (page, params) => {
    navigatedTo = { page, params };
    if (page === 'template') instance.updateRoute(params || {});
  };

  instance = await TemplatesPage.mount({
    route: { browseState: { category: '全部', query: '', tag: '', sort: 'catalog', scrollTop: 0 } },
    root: dom.pageMain,
    navigate
  });

  const firstCard = dom.templateGrid.children[0];
  const applyBtn = firstCard.querySelector('.card-apply-btn');
  const previewBtn = firstCard.querySelector('.card-preview-btn');

  // Click Apply
  applyBtn.dispatchEvent({
    type: 'click',
    target: applyBtn,
    stopPropagation: () => {}
  });
  assert.deepEqual(navigatedTo, { page: 'generate', params: { templateId: 'tpl-1' } });
  assert.equal(previewedTemplate, null, 'Apply click should not trigger preview');

  // Click Card / Preview
  firstCard.dispatchEvent({
    type: 'click',
    target: firstCard
  });
  assert.equal(previewedTemplate?.id, 'tpl-1', 'Card click triggers preview');
  assert.ok(dom.pageMain.classList.contains('is-template-detail-mode'));

  // Test backToStoreBrowse restores view and removes class
  window.backToStoreBrowse();
  assert.equal(dom.pageMain.classList.contains('is-template-detail-mode'), false);
  assert.equal(dom.storeView.style.display, 'flex');
  assert.equal(dom.detailImmersive.style.display, 'none');

  instance.unmount();
});

test('TemplatesPage: backToStoreBrowse() cleans the timeline while preserving the mounted catalog and listeners', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = [...sampleTemplates];

  let unmountedCalled = false;
  let timelineDestroyed = false;
  window.destroyTemplateTimeline = () => {
    timelineDestroyed = true;
  };

  let instance;
  instance = await TemplatesPage.mount({
    route: { browseState: { category: '全部', query: '', tag: '', sort: 'catalog', scrollTop: 0 } },
    root: dom.pageMain,
    navigate: (page, params) => instance.updateRoute(params || {})
  });

  const originalUnmount = instance.unmount;
  instance.unmount = () => {
    unmountedCalled = true;
    return originalUnmount();
  };

  // 1. Enter detail mode
  instance.showDetail(sampleTemplates[0]);
  dom.pageMain.classList.add('is-template-detail-mode');
  dom.storeView.style.display = 'none';
  dom.detailImmersive.style.display = 'flex';

  assert.equal(dom.pageMain.classList.contains('is-template-detail-mode'), true);

  // 2. User clicks "返回列表" -> triggers backToStoreBrowse()
  window.backToStoreBrowse();

  // Verify internal mode toggled back to store browse
  assert.equal(dom.pageMain.classList.contains('is-template-detail-mode'), false, 'detail mode class removed');
  assert.equal(dom.storeView.style.display, 'flex', 'store browse view visible');
  assert.equal(dom.detailImmersive.style.display, 'none', 'immersive detail hidden');

  // Verify TemplatesPage is NOT unmounted
  assert.equal(unmountedCalled, false, 'TemplatesPage.unmount() must NOT be called on backToStoreBrowse()');
  assert.equal(timelineDestroyed, true, 'destroyTemplateTimeline releases the player on backToStoreBrowse()');
  assert.equal(typeof window.filterStoreTemplates, 'function', 'filterStoreTemplates hook must remain active');

  // Verify page listeners and interactions are still 100% functional
  const storyCard = dom.categoriesGrid.children.find(c => c.dataset.catId === 'story');
  storyCard.dispatchEvent({ type: 'click', target: storyCard });
  assert.equal(dom.templateGrid.children.length, 1, 'category filter still active and functional');
  assert.equal(dom.templateGrid.children[0].dataset.id, 'tpl-2');

  // Search still functional
  dom.searchInput.value = '情感';
  dom.searchInput.dispatchEvent({ type: 'input', target: dom.searchInput });
  assert.equal(dom.templateGrid.children.length, 1);

  // 3. ONLY route leave triggers true unmount
  instance.unmount();
  assert.equal(unmountedCalled, true, 'True unmount executed on route leave');
  assert.equal(timelineDestroyed, true, 'destroyTemplateTimeline executed on true unmount');
  assert.equal(window.filterStoreTemplates, undefined, 'filterStoreTemplates cleared on true unmount');
});

test('TemplatesPage: Teardown on unmount() invokes destroyTemplateTimeline and clears state', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = [...sampleTemplates];

  let destroyed = false;
  window.destroyTemplateTimeline = () => {
    destroyed = true;
    dom.pageMain.classList.remove('is-template-detail-mode');
  };

  const instance = await TemplatesPage.mount({
    route: { browseState: { category: '全部', query: '', tag: '', sort: 'catalog', scrollTop: 0 } },
    root: dom.pageMain
  });

  dom.pageMain.classList.add('is-template-detail-mode');
  assert.equal(typeof window.filterStoreTemplates, 'function');

  instance.unmount();

  assert.ok(destroyed, 'destroyTemplateTimeline was called on unmount');
  assert.equal(dom.pageMain.classList.contains('is-template-detail-mode'), false);
  assert.equal(window.filterStoreTemplates, undefined, 'filterStoreTemplates reference removed');
});

test('Router Navigation Simulation: Direct Entry to Template, Leave to Dashboard, Return, Back/Forward Lifecycle', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = [...sampleTemplates];

  let activePageInstance = null;
  const navigatePage = async (pageName) => {
    if (activePageInstance) {
      activePageInstance.unmount?.();
      activePageInstance = null;
    }

    if (pageName === 'template') {
      activePageInstance = await TemplatesPage.mount({
    route: { browseState: { category: '全部', query: '', tag: '', sort: 'catalog', scrollTop: 0 } }, root: dom.pageMain });
    } else if (pageName === 'dashboard') {
      activePageInstance = {
        unmount() {
          dom.pageMain.innerHTML = '';
        }
      };
    }
  };

  // 1. Direct Entry to Template
  await navigatePage('template');
  assert.ok(activePageInstance, 'Template page mounted');
  assert.equal(dom.templateGrid.children.length, 4);

  // 2. Leave to Dashboard
  await navigatePage('dashboard');
  assert.ok(activePageInstance, 'Dashboard page mounted');
  assert.equal(dom.pageMain.classList.contains('is-template-detail-mode'), false);

  // 3. Return to Template
  setupDOMStructure(); // router re-clones template.html
  await navigatePage('template');
  assert.ok(activePageInstance, 'Template page remounted');
  assert.equal(dom.templateGrid.children.length, 4);

  // 4. Back / Forward Navigation simulation
  await navigatePage('dashboard');
  setupDOMStructure();
  await navigatePage('template');
  assert.equal(dom.templateGrid.children.length, 4);

  activePageInstance.unmount();
});

test('marketplace search, category and tag filters combine and unknown durations sort last', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = [
    { id: 'short', name: '短廣告', category: 'product', tags: ['品牌'], structure: [{ duration: '2.5s' }] },
    { id: 'unknown', name: '長廣告', category: 'product', tags: ['品牌'] },
    { id: 'other', name: '故事', category: 'story', tags: ['品牌'], duration: 1 }
  ];
  const instance = await TemplatesPage.mount({ root: dom.pageMain, route: { browseState: { category: '全部', query: '', tag: '', sort: 'catalog' } } });
  dom.categoriesGrid.children.find(card => card.dataset.catId === 'product').dispatchEvent('click');
  dom.tagInput.value = '品牌'; dom.tagInput.dispatchEvent('change');
  dom.searchInput.value = '廣告'; dom.searchInput.dispatchEvent('input');
  dom.sortInput.value = 'duration'; dom.sortInput.dispatchEvent('change');
  assert.deepEqual(dom.templateGrid.children.map(card => card.dataset.id), ['short', 'unknown']);
  assert.equal(dom.resultCount.textContent, '2 個模板');
  assert.equal(TemplatesPage.durationOf(window.cacheTemplatesList[0]), 2.5);
  assert.equal(TemplatesPage.durationOf(window.cacheTemplatesList[1]), null);
  instance.unmount();
});

test('deep-linked IDs reuse the mounted catalog and unknown IDs have a recovery state', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = sampleTemplates;
  const rendered = [];
  window.renderTemplateDetailTimeline = template => rendered.push(template.id);
  let fetches = 0;
  global.fetch = async () => { fetches++; throw new Error('Unexpected download'); };
  const instance = await TemplatesPage.mount({ root: dom.pageMain, route: { templateId: 'tpl-1' } });
  instance.updateRoute({ templateId: 'tpl-2' });
  instance.updateRoute({ templateId: 'tpl-2' });
  assert.deepEqual(rendered, ['tpl-1', 'tpl-2']);
  assert.equal(fetches, 0);
  instance.updateRoute({ templateId: 'missing' });
  assert.equal(dom.recovery.hidden, false);
  assert.match(dom.recovery.innerHTML, /找不到這個模板/);
  instance.unmount();
});

test('catalog HTTP errors are distinct from an empty catalog', async () => {
  const dom = setupDOMStructure();
  window.cacheTemplatesList = null;
  global.fetch = async () => ({ ok: false, status: 503 });
  const instance = await TemplatesPage.mount({ root: dom.pageMain });
  assert.match(dom.templateGrid.innerHTML, /模板載入失敗/);
  assert.doesNotMatch(dom.templateGrid.innerHTML, /目前尚無模板/);
  instance.unmount();
});

test('template card text is escaped and missing specifications are not fabricated', () => {
  const html = TemplatesPage.renderCard({ id: 'safe', name: '<script>bad</script>', description: '"unsafe"', tags: ['<img>'], category: 'custom', thumbnail: 'javascript:bad' });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|src="javascript:|9:16|已驗證|0 秒|快節奏/);
});

test('template grid layout specifies 5 columns by default with compact card styles', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const css = fs.readFileSync(path.resolve('public/css/template.css'), 'utf8');

  // Verify 5 columns grid on desktop
  assert.match(css, /\.template-store-container\s+\.template-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  
  // Verify compact card rules exist for 5-column grid cards
  assert.match(css, /\.template-store-container\s+\.template-grid\s+\.template-card-body\s*\{/);
  assert.match(css, /\.template-store-container\s+\.template-grid\s+:is\(\.card-preview-btn,\s*\.card-apply-btn\)\s*\{/);
  assert.match(css, /\.template-store-container\s+\.template-grid\s+\.template-card\s+\.cover-play\s*\{/);

  // Verify responsive degradation breakpoints
  assert.match(css, /@media\s*\(max-width:\s*1200px\)[\s\S]*?repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*960px\)[\s\S]*?repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

