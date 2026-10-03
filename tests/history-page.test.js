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

  return {
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
    appendChild(child) {
      children.push(child);
      return child;
    },
    querySelector(sel) {
      if (sel === '#projects-grid' || sel === '.projects-grid') {
        return children.find(c => c.id === 'projects-grid') || (this.id === 'projects-grid' ? this : null);
      }
      if (sel === '.history-body') {
        return children.find(c => c.className?.includes('history-body')) || (this.className?.includes('history-body') ? this : null);
      }
      return null;
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
}

// Minimal mock document and window
const mockDocument = {
  getElementById(id) {
    if (id === 'projects-grid') return global.mockGrid;
    return null;
  },
  querySelector(sel) {
    if (sel === '.history-body') return global.mockBody;
    return null;
  },
  createElement(tag) {
    return createMockElement(tag);
  }
};

global.document = mockDocument;
global.window = global;

// Mock DynamicMaskSystem
let dynamicMaskAttached = null;
let dynamicMaskDetached = null;
global.DynamicMaskSystem = {
  attach(el, opts) {
    dynamicMaskAttached = el;
    return { destroy: () => { dynamicMaskDetached = el; } };
  },
  detach(el) {
    dynamicMaskDetached = el;
  }
};

// Mock ProjectCard
const ProjectCard = require('../public/js/components/project-card');
global.ProjectCard = ProjectCard;

// Mock Features
const ProjectsFeature = require('../public/js/features/projects');
const { store: ProjectStore, deleteQueue: ProjectDeleteQueue, actions: ProjectActions } = ProjectsFeature;
global.ProjectStore = ProjectStore;
global.ProjectDeleteQueue = ProjectDeleteQueue;
global.ProjectActions = ProjectActions;

// Load HistoryPage
const HistoryPage = require('../public/js/pages/history');
global.HistoryPage = HistoryPage;

test('HistoryPage: getDeletedProjects filters is_deleted: true, excludes pending delete and sorts desc by updateAt', () => {
  ProjectStore.reset();
  
  const p1 = { id: 'p1', title: 'Active', is_deleted: false, updateAt: '2026-01-01T00:00:00Z' };
  const p2 = { id: 'p2', title: 'Deleted Older', is_deleted: true, updateAt: '2026-01-02T00:00:00Z' };
  const p3 = { id: 'p3', title: 'Deleted Newer', is_deleted: true, updateAt: '2026-01-05T00:00:00Z' };
  const p4 = { id: 'p4', title: 'Pending Delete (not committed)', is_deleted: false, updateAt: '2026-01-06T00:00:00Z' };

  ProjectDeleteQueue.enqueue(p4, { transitionDelay: 99999 });

  const result = HistoryPage.getDeletedProjects([p1, p2, p3, p4]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'p3'); // Newer first
  assert.equal(result[1].id, 'p2');

  ProjectDeleteQueue.undo('p4');
});

test('HistoryPage: Page Lifecycle Contract - mount() returns { unmount() }', async () => {
  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  root.appendChild(grid);

  const instance = await HistoryPage.mount({ root });
  assert.ok(instance, 'mount should return an instance');
  assert.equal(typeof instance.unmount, 'function', 'instance must have unmount() method');

  instance.unmount();
});

test('HistoryPage: renders empty state when no deleted projects exist', async () => {
  ProjectStore.reset();
  ProjectStore.setProjects([
    { id: 'p-active', title: 'Active', is_deleted: false }
  ]);

  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  root.appendChild(grid);

  const instance = await HistoryPage.mount({ root });
  assert.ok(grid.innerHTML.includes('資源回收桶目前是空的'));
  assert.ok(grid.innerHTML.includes('刪除的分鏡將會暫時保留在此處'));

  instance.unmount();
});

test('HistoryPage: renders deleted project cards with isHistory = true and hooks setupProjectCardEvents', async () => {
  ProjectStore.reset();
  const deletedProjects = [
    { id: 'h-1', title: '已刪除 1', is_deleted: true, updateAt: '2026-02-01' },
    { id: 'h-2', title: '已刪除 2', is_deleted: true, updateAt: '2026-02-02' }
  ];
  ProjectStore.setProjects(deletedProjects);

  let setupEventsCount = 0;
  let receivedIsHistory = null;
  global.setupProjectCardEvents = (card, p, isHistory, cb) => {
    setupEventsCount++;
    receivedIsHistory = isHistory;
    assert.ok(p.id.startsWith('h-'));
  };

  let lazyLoadCalled = false;
  global.lazyLoadProjectThumbs = (container) => {
    lazyLoadCalled = true;
  };

  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  root.appendChild(grid);

  const instance = await HistoryPage.mount({ root });

  assert.equal(grid.children.length, 2);
  assert.equal(setupEventsCount, 2);
  assert.equal(receivedIsHistory, true, 'isHistory flag must be passed as true to setupProjectCardEvents');
  assert.equal(lazyLoadCalled, true);

  instance.unmount();
  global.setupProjectCardEvents = () => {};
  global.lazyLoadProjectThumbs = () => {};
});

test('HistoryPage: reactive updates via ProjectStore subscription and unmount cleanup', async () => {
  ProjectStore.reset();
  ProjectStore.setProjects([
    { id: 'del-1', title: '回收項目 1', is_deleted: true, updateAt: '2026-01-01' }
  ]);

  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  const body = createMockElement('div');
  body.className = 'history-body';
  root.appendChild(body);
  root.appendChild(grid);

  dynamicMaskAttached = null;
  dynamicMaskDetached = null;

  const instance = await HistoryPage.mount({ root });
  assert.equal(grid.children.length, 1);
  assert.equal(dynamicMaskAttached, body);

  // Update store with additional deleted item -> automatically updates grid
  ProjectStore.setProjects([
    { id: 'del-1', title: '回收項目 1', is_deleted: true, updateAt: '2026-01-01' },
    { id: 'del-2', title: '回收項目 2', is_deleted: true, updateAt: '2026-01-02' }
  ]);
  assert.equal(grid.children.length, 2);

  // Unmount page
  instance.unmount();
  assert.equal(dynamicMaskDetached, body);

  // Subsequent store update should NOT affect unmounted grid
  ProjectStore.setProjects([
    { id: 'del-3', title: '回收項目 3', is_deleted: true, updateAt: '2026-01-03' }
  ]);
  assert.equal(grid.children.length, 2, 'Unmounted grid must not receive store updates');
});

test('HistoryPage: signal abort triggers immediate and safe unmount', async () => {
  ProjectStore.reset();
  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  const body = createMockElement('div');
  body.className = 'history-body';
  root.appendChild(body);
  root.appendChild(grid);

  const controller = new AbortController();
  const instance = await HistoryPage.mount({ root, signal: controller.signal });

  dynamicMaskDetached = null;
  controller.abort();

  assert.equal(dynamicMaskDetached, body, 'Abort signal must trigger unmount cleanup');
});

test('HistoryPage: Restore synchronization between History, Projects, and Sidebar', async () => {
  ProjectStore.reset();
  const project = { id: 'p-to-restore', title: '要還原的分鏡', is_deleted: true, updateAt: '2026-01-01' };
  ProjectStore.setProjects([project]);

  // Mount History Page
  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  root.appendChild(grid);
  const historyInstance = await HistoryPage.mount({ root });

  // Grid should initially show the deleted project
  assert.equal(grid.children.length, 1);
  assert.equal(ProjectStore.getActiveProjects().length, 0);

  let sidebarUpdated = false;
  global.updateSidebarProjects = () => {
    sidebarUpdated = true;
  };

  // Simulate restore action
  project.is_deleted = false;
  ProjectStore.notify({ type: 'restore_optimistic', project });

  // 1. History Page grid automatically updates to empty state
  assert.equal(grid.children.length, 0);
  assert.ok(grid.innerHTML.includes('資源回收桶目前是空的'));

  // 2. ProjectStore authoritative active list now has the project
  assert.equal(ProjectStore.getActiveProjects().length, 1);
  assert.equal(ProjectStore.getActiveProjects()[0].id, 'p-to-restore');

  historyInstance.unmount();
});

test('Router Navigation Simulation: Direct Entry to History, Leave, Return, Back/Forward Lifecycle', async () => {
  let activePageInstance = null;
  const navigateMock = async (targetRoute, signal) => {
    if (activePageInstance) {
      activePageInstance.unmount?.();
      activePageInstance = null;
    }

    if (targetRoute === 'history') {
      const root = createMockElement('div');
      const grid = createMockElement('div');
      grid.id = 'projects-grid';
      root.appendChild(grid);
      activePageInstance = await HistoryPage.mount({ root, signal });
    } else if (targetRoute === 'projects') {
      activePageInstance = {
        unmount() {}
      };
    }
    return activePageInstance;
  };

  // Direct Entry
  const hInst1 = await navigateMock('history');
  assert.ok(activePageInstance);

  // Navigate away to projects
  let hInst1Unmounted = false;
  const origUnmount = hInst1.unmount;
  hInst1.unmount = () => {
    hInst1Unmounted = true;
    origUnmount();
  };

  await navigateMock('projects');
  assert.equal(hInst1Unmounted, true, 'History instance must unmount when navigating away');

  // Return to history
  const hInst2 = await navigateMock('history');
  assert.ok(hInst2 !== hInst1);

  // Back / Forward simulation
  await navigateMock('projects');
  const hInst3 = await navigateMock('history');
  assert.ok(hInst3);

  hInst3.unmount();
});
