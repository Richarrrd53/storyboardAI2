const test = require('node:test');
const assert = require('node:assert/strict');

// Set up mock DOM environment
function createMockElement(tagName = 'div') {
  const children = [];
  const eventListeners = {};
  const dataset = {};
  const style = {
    setProperty: (k, v) => { style[k] = v; }
  };

  const elem = {
    tagName: tagName.toUpperCase(),
    dataset,
    style,
    className: '',
    children,
    get innerHTML() {
      return this._innerHTML || '';
    },
    set innerHTML(val) {
      this._innerHTML = val;
      this.children.length = 0;
    },
    get textContent() {
      return this._textContent || '';
    },
    set textContent(val) {
      this._textContent = val;
    },
    appendChild(child) {
      children.push(child);
      return child;
    },
    querySelector(sel) {
      if (sel === '#recent-projects-grid' || sel === '.home-recent-grid') {
        return children.find(c => c.id === 'recent-projects-grid') || (this.id === 'recent-projects-grid' ? this : null);
      }
      if (sel === '.home-body' || sel === '.content-body') {
        return children.find(c => c.className?.includes('home-body')) || (this.className?.includes('home-body') ? this : null);
      }
      if (sel === '#home-recent-viewport' || sel === '.home-recent-viewport') {
        return children.find(c => c.id === 'home-recent-viewport') || (this.id === 'home-recent-viewport' ? this : null);
      }
      if (sel === '#home-greeting-text') {
        return children.find(c => c.id === 'home-greeting-text') || (this.id === 'home-greeting-text' ? this : null);
      }
      if (sel === '#home-user-name') {
        return children.find(c => c.id === 'home-user-name') || (this.id === 'home-user-name' ? this : null);
      }
      if (sel === '#home-empty-create-btn') {
        return children.find(c => c.id === 'home-empty-create-btn') || (this.id === 'home-empty-create-btn' ? this : null);
      }
      return children.find(c => (sel.startsWith('#') && c.id === sel.slice(1)) || (sel.startsWith('.') && c.className?.includes(sel.slice(1)))) || null;
    },
    querySelectorAll(sel) {
      return [];
    },
    addEventListener(evt, fn) {
      if (!eventListeners[evt]) eventListeners[evt] = [];
      eventListeners[evt].push(fn);
    },
    removeEventListener(evt, fn) {
      if (!eventListeners[evt]) return;
      eventListeners[evt] = eventListeners[evt].filter(f => f !== fn);
    },
    dispatchEvent(evt) {
      const fns = eventListeners[evt] || [];
      fns.forEach(f => f({ type: evt }));
    }
  };

  return elem;
}

// Minimal mock document and window
const mockDocument = {
  getElementById(id) {
    if (global._mockElements && global._mockElements[id]) {
      return global._mockElements[id];
    }
    return null;
  },
  querySelector(sel) {
    if (global._mockRoot) {
      return global._mockRoot.querySelector(sel);
    }
    return null;
  },
  createElement(tag) {
    return createMockElement(tag);
  }
};

global.document = mockDocument;
global.window = global;

// Mock DynamicMaskSystem
let dynamicMaskAttached = [];
let dynamicMaskDetached = [];
global.DynamicMaskSystem = {
  attach(el, opts) {
    dynamicMaskAttached.push(el);
    return { destroy: () => { dynamicMaskDetached.push(el); } };
  },
  detach(el) {
    dynamicMaskDetached.push(el);
  }
};

// Mock ProjectCard
const ProjectCard = require('../public/js/components/project-card');
global.ProjectCard = ProjectCard;

// Mock Features
const ProjectsFeature = require('../public/js/features/projects');
const { store: ProjectStore, deleteQueue: ProjectDeleteQueue } = ProjectsFeature;
global.ProjectStore = ProjectStore;
global.ProjectDeleteQueue = ProjectDeleteQueue;

// Load DashboardPage
const DashboardPage = require('../public/js/pages/dashboard');
global.DashboardPage = DashboardPage;

function setupDashboardDOM() {
  const root = createMockElement('div');
  const greeting = createMockElement('h1');
  greeting.id = 'home-greeting-text';
  root.appendChild(greeting);

  const userName = createMockElement('span');
  userName.id = 'home-user-name';
  root.appendChild(userName);

  const homeBody = createMockElement('div');
  homeBody.className = 'content-body home-body';
  root.appendChild(homeBody);

  const recentViewport = createMockElement('div');
  recentViewport.id = 'home-recent-viewport';
  root.appendChild(recentViewport);

  const recentGrid = createMockElement('div');
  recentGrid.id = 'recent-projects-grid';
  recentViewport.appendChild(recentGrid);
  root.appendChild(recentGrid);

  const heroExplore = createMockElement('button');
  heroExplore.id = 'hero-explore-btn';
  root.appendChild(heroExplore);

  const qaScript = createMockElement('div');
  qaScript.id = 'qa-script-analysis';
  root.appendChild(qaScript);

  const qaTemplate = createMockElement('div');
  qaTemplate.id = 'qa-template-hook';
  root.appendChild(qaTemplate);

  const qaDiscovery = createMockElement('div');
  qaDiscovery.id = 'qa-discovery-search';
  root.appendChild(qaDiscovery);

  const mobScript = createMockElement('div');
  mobScript.id = 'mob-shortcut-script';
  root.appendChild(mobScript);

  const mobCreate = createMockElement('div');
  mobCreate.id = 'mob-shortcut-create';
  root.appendChild(mobCreate);

  const mobTemplate = createMockElement('div');
  mobTemplate.id = 'mob-shortcut-template';
  root.appendChild(mobTemplate);

  const mobDiscovery = createMockElement('div');
  mobDiscovery.id = 'mob-shortcut-discovery';
  root.appendChild(mobDiscovery);

  const homeAvatar = createMockElement('div');
  homeAvatar.id = 'home-top-avatar';
  root.appendChild(homeAvatar);

  global._mockRoot = root;
  global._mockElements = {
    'home-greeting-text': greeting,
    'home-user-name': userName,
    'home-recent-viewport': recentViewport,
    'recent-projects-grid': recentGrid,
    'hero-explore-btn': heroExplore,
    'qa-script-analysis': qaScript,
    'qa-template-hook': qaTemplate,
    'qa-discovery-search': qaDiscovery,
    'mob-shortcut-script': mobScript,
    'mob-shortcut-create': mobCreate,
    'mob-shortcut-template': mobTemplate,
    'mob-shortcut-discovery': mobDiscovery,
    'home-top-avatar': homeAvatar
  };

  return { root, greeting, userName, homeBody, recentViewport, recentGrid };
}

test('DashboardPage: getRecentProjects filters deleted/pending, sorts desc, and takes at most 4', () => {
  ProjectStore.reset();
  const list = [
    { id: 'p1', title: 'P1', is_deleted: false, updateAt: '2026-01-01' },
    { id: 'p2', title: 'P2', is_deleted: false, updateAt: '2026-01-05' },
    { id: 'p3', title: 'P3', is_deleted: true, updateAt: '2026-01-06' },
    { id: 'p4', title: 'P4', is_deleted: false, updateAt: '2026-01-03' },
    { id: 'p5', title: 'P5', is_deleted: false, updateAt: '2026-01-04' },
    { id: 'p6', title: 'P6', is_deleted: false, updateAt: '2026-01-02' }
  ];

  const recent = DashboardPage.getRecentProjects(list);
  assert.equal(recent.length, 4, 'Should cap at 4 recent projects');
  assert.equal(recent[0].id, 'p2'); // 2026-01-05
  assert.equal(recent[1].id, 'p5'); // 2026-01-04
  assert.equal(recent[2].id, 'p4'); // 2026-01-03
  assert.equal(recent[3].id, 'p6'); // 2026-01-02
});

test('DashboardPage: Page Lifecycle Contract - mount() returns { unmount() }', async () => {
  const { root } = setupDashboardDOM();
  const instance = await DashboardPage.mount({ root });

  assert.ok(instance);
  assert.equal(typeof instance.unmount, 'function');
  instance.unmount();
});

test('DashboardPage: dynamic greeting and user info presentation', async () => {
  const { root, greeting, userName } = setupDashboardDOM();

  global.spaAuth = {
    isLoggedIn: () => true,
    fetchUser: async () => ({ user: { name: '測試創作者' } })
  };

  const instance = await DashboardPage.mount({ root });

  assert.ok(greeting.textContent.includes('今天想繼續哪個創作？'));
  // Allow promise to resolve
  await new Promise(r => setTimeout(r, 10));
  assert.equal(userName.textContent, '測試創作者');

  instance.unmount();
});

test('DashboardPage: renders empty state when no recent projects exist', async () => {
  ProjectStore.reset();
  ProjectStore.setProjects([]);

  const { root, recentGrid } = setupDashboardDOM();
  const instance = await DashboardPage.mount({ root });

  assert.ok(recentGrid.innerHTML.includes('尚無最近編輯的分鏡'));
  assert.ok(recentGrid.innerHTML.includes('home-empty-recent-card'));

  instance.unmount();
});

test('DashboardPage: renders compact cards and binds setupProjectCardEvents with variant=compact', async () => {
  ProjectStore.reset();
  ProjectStore.setProjects([
    { id: 'rec-1', title: '最近分鏡 1', is_deleted: false, updateAt: '2026-01-01' }
  ]);

  let cardVariant = null;
  global.setupProjectCardEvents = (card, p, isHistory, cb) => {
    cardVariant = card.dataset.variant;
  };

  let lazyLoadCalled = false;
  global.lazyLoadProjectThumbs = () => {
    lazyLoadCalled = true;
  };

  const { root, recentGrid } = setupDashboardDOM();
  const instance = await DashboardPage.mount({ root });

  assert.equal(recentGrid.children.length, 1);
  assert.equal(cardVariant, 'compact', 'Dashboard recent cards must use compact variant');
  assert.equal(lazyLoadCalled, true);

  instance.unmount();
  global.setupProjectCardEvents = () => {};
  global.lazyLoadProjectThumbs = () => {};
});

test('DashboardPage: Quick Actions navigation events', async () => {
  const { root } = setupDashboardDOM();

  let navigatedTo = null;
  let qcOpened = false;

  const navigateMock = (page, opts) => {
    navigatedTo = page;
  };
  global.AICreationController = {
    openQuickCompose: () => { qcOpened = true; }
  };

  const instance = await DashboardPage.mount({ root, navigate: navigateMock });

  // Hero Explore
  global._mockElements['hero-explore-btn'].onclick({ preventDefault: () => {} });
  assert.equal(navigatedTo, 'template');

  // Script analysis -> Quick Compose
  qcOpened = false;
  global._mockElements['qa-script-analysis'].onclick({ preventDefault: () => {} });
  assert.equal(qcOpened, true);

  // Template Hook -> template
  global._mockElements['qa-template-hook'].onclick({ preventDefault: () => {} });
  assert.equal(navigatedTo, 'template');

  // Discovery -> discovery
  global._mockElements['qa-discovery-search'].onclick({ preventDefault: () => {} });
  assert.equal(navigatedTo, 'discovery');

  instance.unmount();
});

test('DashboardPage: reactive updates via ProjectStore subscription and mask lifecycle', async () => {
  ProjectStore.reset();
  ProjectStore.setProjects([
    { id: 'p1', title: '分鏡 1', is_deleted: false, updateAt: '2026-01-01' }
  ]);

  dynamicMaskAttached = [];
  dynamicMaskDetached = [];

  const { root, homeBody, recentViewport, recentGrid } = setupDashboardDOM();
  const instance = await DashboardPage.mount({ root });

  assert.equal(recentGrid.children.length, 1);
  assert.ok(dynamicMaskAttached.includes(homeBody));
  assert.ok(dynamicMaskAttached.includes(recentViewport));

  // Update store -> updates grid
  ProjectStore.setProjects([
    { id: 'p1', title: '分鏡 1', is_deleted: false, updateAt: '2026-01-01' },
    { id: 'p2', title: '分鏡 2', is_deleted: false, updateAt: '2026-01-02' }
  ]);
  assert.equal(recentGrid.children.length, 2);

  // Unmount
  instance.unmount();
  assert.ok(dynamicMaskDetached.includes(homeBody));
  assert.ok(dynamicMaskDetached.includes(recentViewport));

  // Subsequent store update should not affect unmounted grid
  ProjectStore.setProjects([
    { id: 'p3', title: '分鏡 3', is_deleted: false, updateAt: '2026-01-03' }
  ]);
  assert.equal(recentGrid.children.length, 2);
});

test('Router Navigation Simulation: Direct Entry to Dashboard, Leave, Return, Back/Forward Lifecycle', async () => {
  let activePageInstance = null;
  const navigateMock = async (targetRoute, signal) => {
    if (activePageInstance) {
      activePageInstance.unmount?.();
      activePageInstance = null;
    }

    if (targetRoute === 'dashboard') {
      const { root } = setupDashboardDOM();
      activePageInstance = await DashboardPage.mount({ root, signal });
    } else if (targetRoute === 'projects') {
      activePageInstance = { unmount() {} };
    }
    return activePageInstance;
  };

  const dInst1 = await navigateMock('dashboard');
  assert.ok(activePageInstance);

  let unmounted = false;
  const origUnmount = dInst1.unmount;
  dInst1.unmount = () => {
    unmounted = true;
    origUnmount();
  };

  await navigateMock('projects');
  assert.equal(unmounted, true, 'Dashboard must unmount when leaving');

  const dInst2 = await navigateMock('dashboard');
  assert.ok(dInst2 !== dInst1);

  await navigateMock('projects');
  const dInst3 = await navigateMock('dashboard');
  assert.ok(dInst3);

  dInst3.unmount();
});
