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
      if (sel === '.projects-body') {
        return children.find(c => c.className?.includes('projects-body')) || (this.className?.includes('projects-body') ? this : null);
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
    if (sel === '.projects-body') return global.mockBody;
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
const { store: ProjectStore, deleteQueue: ProjectDeleteQueue } = ProjectsFeature;
global.ProjectStore = ProjectStore;
global.ProjectDeleteQueue = ProjectDeleteQueue;

// Load ProjectsPage
const ProjectsPage = require('../public/js/pages/projects');
global.ProjectsPage = ProjectsPage;

test('ProjectsPage: getFilteredAndSortedProjects filters deleted/pending and sorts desc by updateAt', () => {
  ProjectDeleteQueue.clear?.() || ProjectStore.reset();
  
  const p1 = { id: 'p1', title: 'Older', is_deleted: false, updateAt: '2026-01-01T00:00:00Z' };
  const p2 = { id: 'p2', title: 'Newest', is_deleted: false, updateAt: '2026-01-05T00:00:00Z' };
  const p3 = { id: 'p3', title: 'Deleted', is_deleted: true, updateAt: '2026-01-06T00:00:00Z' };
  const p4 = { id: 'p4', title: 'Pending Delete', is_deleted: false, updateAt: '2026-01-04T00:00:00Z' };

  ProjectDeleteQueue.enqueue(p4, { transitionDelay: 99999 });

  const result = ProjectsPage.getFilteredAndSortedProjects([p1, p2, p3, p4]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'p2'); // Newest first
  assert.equal(result[1].id, 'p1');

  ProjectDeleteQueue.undo('p4');
});

test('ProjectsPage: Page Lifecycle Contract - mount() returns { unmount() }', async () => {
  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  root.appendChild(grid);

  const instance = await ProjectsPage.mount({ root });
  assert.ok(instance, 'mount should return an instance');
  assert.equal(typeof instance.unmount, 'function', 'instance must have unmount() method');

  instance.unmount();
});

test('ProjectsPage: renders empty state when no active projects exist', async () => {
  ProjectStore.reset();
  ProjectStore.setProjects([]);

  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  root.appendChild(grid);

  const instance = await ProjectsPage.mount({ root });
  assert.ok(grid.innerHTML.includes('尚無分鏡'));

  instance.unmount();
});

test('ProjectsPage: renders project cards and hooks lazyLoadProjectThumbs & card events', async () => {
  ProjectStore.reset();
  const projects = [
    { id: 'proj-1', title: '分鏡 1', is_deleted: false, updateAt: '2026-02-01' },
    { id: 'proj-2', title: '分鏡 2', is_deleted: false, updateAt: '2026-02-02' }
  ];
  ProjectStore.setProjects(projects);

  let setupEventsCount = 0;
  global.setupProjectCardEvents = (card, p, isHistory, cb) => {
    setupEventsCount++;
    assert.equal(isHistory, false);
    assert.ok(p.id.startsWith('proj-'));
  };

  let lazyLoadCalled = false;
  global.lazyLoadProjectThumbs = (container) => {
    lazyLoadCalled = true;
  };

  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  root.appendChild(grid);

  const instance = await ProjectsPage.mount({ root });

  assert.equal(grid.children.length, 2);
  assert.equal(setupEventsCount, 2);
  assert.equal(lazyLoadCalled, true);

  instance.unmount();
  global.setupProjectCardEvents = (card, p, isHistory, cb) => {};
  global.lazyLoadProjectThumbs = () => {};
});

test('ProjectsPage: reactive updates via ProjectStore subscription and unmount cleanup', async () => {
  ProjectStore.reset();
  ProjectStore.setProjects([
    { id: 'p1', title: '分鏡 A', is_deleted: false, updateAt: '2026-01-01' }
  ]);

  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  const body = createMockElement('div');
  body.className = 'projects-body';
  root.appendChild(body);
  root.appendChild(grid);

  dynamicMaskAttached = null;
  dynamicMaskDetached = null;

  const instance = await ProjectsPage.mount({ root });
  assert.equal(grid.children.length, 1);
  assert.equal(dynamicMaskAttached, body);

  // Update store -> automatically updates grid
  ProjectStore.setProjects([
    { id: 'p1', title: '分鏡 A', is_deleted: false, updateAt: '2026-01-01' },
    { id: 'p2', title: '分鏡 B', is_deleted: false, updateAt: '2026-01-02' }
  ]);
  assert.equal(grid.children.length, 2);

  // Unmount page
  instance.unmount();
  assert.equal(dynamicMaskDetached, body);

  // Subsequent store update should NOT affect unmounted grid
  ProjectStore.setProjects([
    { id: 'p3', title: '分鏡 C', is_deleted: false, updateAt: '2026-01-03' }
  ]);
  assert.equal(grid.children.length, 2, 'Unmounted grid must not receive store updates');
});

test('ProjectsPage: signal abort triggers immediate and safe unmount', async () => {
  ProjectStore.reset();
  const root = createMockElement('div');
  const grid = createMockElement('div');
  grid.id = 'projects-grid';
  const body = createMockElement('div');
  body.className = 'projects-body';
  root.appendChild(body);
  root.appendChild(grid);

  const controller = new AbortController();
  const instance = await ProjectsPage.mount({ root, signal: controller.signal });

  dynamicMaskDetached = null;
  // Abort navigation signal
  controller.abort();

  assert.equal(dynamicMaskDetached, body, 'Abort signal must trigger unmount cleanup');
});

test('Router Navigation Simulation: Direct Entry, Leave, Return, Back/Forward Lifecycle', async () => {
  // Simulate Router's activePageInstance management
  let activePageInstance = null;
  const navigateMock = async (targetRoute, signal) => {
    // 1. Unmount existing page
    if (activePageInstance) {
      activePageInstance.unmount?.();
      activePageInstance = null;
    }

    // 2. Mount new page
    if (targetRoute === 'projects') {
      const root = createMockElement('div');
      const grid = createMockElement('div');
      grid.id = 'projects-grid';
      root.appendChild(grid);
      activePageInstance = await ProjectsPage.mount({ root, signal });
    } else if (targetRoute === 'dashboard') {
      let isDashboardMounted = true;
      activePageInstance = {
        unmount() {
          isDashboardMounted = false;
        }
      };
    }
    return activePageInstance;
  };

  // Step 1: Direct Entry to 'projects'
  const inst1 = await navigateMock('projects');
  assert.ok(activePageInstance, 'Active instance should be tracked');

  // Step 2: Navigate away to 'dashboard'
  let inst1Unmounted = false;
  const origUnmount1 = inst1.unmount;
  inst1.unmount = () => {
    inst1Unmounted = true;
    origUnmount1();
  };

  await navigateMock('dashboard');
  assert.equal(inst1Unmounted, true, 'Projects page should unmount on navigation away');

  // Step 3: Return to 'projects'
  const inst2 = await navigateMock('projects');
  assert.ok(inst2 !== inst1, 'New page instance should be created on return');

  // Step 4: Simulate popstate (Back to Dashboard, Forward to Projects)
  await navigateMock('dashboard');
  const inst3 = await navigateMock('projects');
  assert.ok(inst3, 'Forward navigation to projects succeeds and establishes lifecycle');
  
  inst3.unmount();
});
