const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Set up mock DOM environment
function createMockElement(tagName = 'div', id = '', className = '') {
  const children = [];
  const eventListeners = {};
  const dataset = {};
  const classListSet = new Set(className ? className.split(' ').filter(Boolean) : []);
  const style = {
    display: '',
    width: '',
    setProperty: (k, v) => { style[k] = v; },
    removeProperty: (k) => { delete style[k]; }
  };

  const el = {
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    id,
    dataset,
    style,
    children,
    textContent: '',
    value: '',
    checked: false,
    attributes: {},
    setAttribute: (k, v) => { el.attributes[k] = v; },
    getAttribute: (k) => el.attributes[k] || (k === 'href' ? el.href : null),
    hasAttribute: (k) => k in el.attributes,
    removeAttribute: (k) => { delete el.attributes[k]; },
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
      this._rebuildChildrenFromHTML(val);
    },
    _rebuildChildrenFromHTML(html) {
      this.children.length = 0;
      if (!html) return;
      const tagRegex = /<([a-z0-9\-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-z0-9\-]+)([^>]*)\/>/gi;
      let m;
      while ((m = tagRegex.exec(html)) !== null) {
        const tag = m[1] || m[4];
        const attrs = m[2] || m[5] || '';
        const inner = m[3] || '';
        const idMatch = attrs.match(/id="([^"]+)"/);
        const classMatch = attrs.match(/class="([^"]+)"/);
        const hrefMatch = attrs.match(/href="([^"]+)"/);
        const dataIdMatch = attrs.match(/data-id="([^"]+)"/);
        const srcMatch = attrs.match(/src="([^"]+)"/);
        const child = createMockElement(tag, idMatch ? idMatch[1] : '', classMatch ? classMatch[1] : '');
        if (hrefMatch) child.href = hrefMatch[1];
        if (srcMatch) child.src = srcMatch[1];
        if (dataIdMatch) child.dataset.id = dataIdMatch[1];
        child.parentElement = this;
        child.textContent = inner.replace(/<[^>]+>/g, '').trim();
        if (inner.includes('<')) {
          child.innerHTML = inner;
        }
        this.appendChild(child);
      }
    },
    appendChild(child) {
      children.push(child);
      child.parentElement = this;
      return child;
    },
    prepend(child) {
      children.unshift(child);
      child.parentElement = this;
      return child;
    },
    remove() {
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx !== -1) this.parentElement.children.splice(idx, 1);
        this.parentElement = null;
      }
    },
    contains(child) {
      if (!child || typeof child !== 'object' || typeof child.nodeType !== 'number') {
        throw new TypeError("Failed to execute 'contains' on 'Node': parameter 1 is not of type 'Node'.");
      }
      let curr = child;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentElement;
      }
      return false;
    },
    closest(sel) {
      let curr = this;
      while (curr) {
        if (sel.startsWith('#') && curr.id === sel.slice(1)) return curr;
        if (sel.startsWith('.') && curr.classList?.contains(sel.slice(1))) return curr;
        if (curr.tagName?.toLowerCase() === sel.toLowerCase()) return curr;
        curr = curr.parentElement;
      }
      return null;
    },
    cloneNode(deep = true) {
      const clone = createMockElement(this.tagName.toLowerCase(), this.id, this.className);
      clone.innerHTML = this.innerHTML;
      if (deep) {
        this.children.forEach(c => clone.appendChild(c.cloneNode(true)));
      }
      return clone;
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const results = [];
      function traverse(node) {
        for (const child of node.children) {
          let match = false;
          if (sel.startsWith('#')) {
            if (child.id === sel.slice(1)) match = true;
          } else if (sel.includes('.')) {
            const parts = sel.split('.');
            const tagPart = parts[0];
            const clsPart = parts[1];
            if ((!tagPart || child.tagName.toLowerCase() === tagPart.toLowerCase()) && child.classList.contains(clsPart)) {
              match = true;
            }
          } else if (sel === 'a[href]') {
            if (child.tagName === 'A' && (child.href || child.hasAttribute('href'))) match = true;
          } else if (sel.includes('[data-id=')) {
            const dataIdMatch = sel.match(/\[data-id="([^"]+)"\]/);
            if (dataIdMatch && child.dataset?.id === dataIdMatch[1]) match = true;
          } else if (child.tagName.toLowerCase() === sel.toLowerCase()) {
            match = true;
          }

          if (match) results.push(child);
          traverse(child);
        }
      }
      traverse(this);
      return results;
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
      const fns = eventListeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 260, height: 60, bottom: 60, right: 260 };
    }
  };

  return el;
}

function setupMockEnvironment() {
  const elements = {};
  const body = createMockElement('body');
  const burger = createMockElement('input', 'burger');
  burger.type = 'checkbox';
  body.appendChild(burger);
  elements['burger'] = burger;

  const documentMock = {
    nodeType: 9,
    body,
    createElement: (tag) => createMockElement(tag),
    getElementById: (id) => {
      if (elements[id]) return elements[id];
      if (body.id === id) return body;
      return body.querySelector('#' + id);
    },
    querySelector: (sel) => body.querySelector(sel),
    querySelectorAll: (sel) => body.querySelectorAll(sel),
    addEventListener: (evt, fn) => body.addEventListener(evt, fn),
    removeEventListener: (evt, fn) => body.removeEventListener(evt, fn),
    dispatchEvent: (evt) => body.dispatchEvent(evt)
  };

  const storage = {};
  const localStorageMock = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
    clear: () => { for (const k in storage) delete storage[k]; }
  };

  const windowListeners = {};
  const windowMock = {
    document: documentMock,
    localStorage: localStorageMock,
    matchMedia: () => ({ matches: false }),
    addEventListener: (evt, fn) => {
      if (!windowListeners[evt]) windowListeners[evt] = [];
      windowListeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (!windowListeners[evt]) return;
      windowListeners[evt] = windowListeners[evt].filter(f => f !== fn);
    },
    dispatchEvent: (evt) => {
      const fns = windowListeners[evt.type] || [];
      fns.forEach(fn => fn(evt));
    },
    windowListeners,
    location: { hash: '#/dashboard', pathname: '/dashboard' },
    innerWidth: 1200,
    innerHeight: 800,
    getComputedStyle: () => ({ getPropertyValue: () => '64' })
  };

  global.window = windowMock;
  global.document = documentMock;
  global.localStorage = localStorageMock;
  global.getComputedStyle = windowMock.getComputedStyle;
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);

  return { elements, body, documentMock, windowMock, localStorageMock, windowListeners };
}

// Load AppShell code
function loadAppShell() {
  const code = fs.readFileSync(path.resolve('public/js/shell/app-shell.js'), 'utf8');
  // Evaluate in global context
  const fn = new Function(code);
  fn();
  return window.AppShell;
}

test('AppShell: Module interface and compatibility bridges', () => {
  setupMockEnvironment();
  const AppShell = loadAppShell();

  assert.ok(AppShell, 'window.AppShell should exist');
  assert.strictEqual(typeof AppShell.init, 'function');
  assert.strictEqual(typeof AppShell.updateRoute, 'function');
  assert.strictEqual(typeof AppShell.expandSidebar, 'function');
  assert.strictEqual(typeof AppShell.updateSidebarProjects, 'function');
  assert.strictEqual(typeof AppShell.toggleUserPanel, 'function');
  assert.strictEqual(typeof AppShell.collapseProjectsGroup, 'function');
  assert.strictEqual(typeof AppShell.updateRailHoles, 'function');
  assert.strictEqual(typeof AppShell.updateMobileBottomNavActive, 'function');
  assert.strictEqual(typeof AppShell.syncUserProfile, 'function');
  assert.strictEqual(typeof AppShell.destroy, 'function');

  // Verify backward compatibility bridges on window
  assert.strictEqual(typeof window.updateSidebarProjects, 'function');
  assert.strictEqual(typeof window.toggleUserPanel, 'function');
  assert.strictEqual(typeof window.expandSidebar, 'function');
  assert.strictEqual(typeof window.updateMobileBottomNavActive, 'function');
});

test('AppShell: init() creates and binds shell layout elements', async () => {
  const { elements, body } = setupMockEnvironment();

  // Create mock sidebar in doc
  const mockDoc = createMockElement('html');
  const sidebar = createMockElement('aside', 'dash-sidebar', 'sidebar');
  const topbar = createMockElement('header', 'spa-topbar', 'topbar');
  mockDoc.appendChild(sidebar);
  mockDoc.appendChild(topbar);

  let fetchedUser = null;
  const mockSpaAuth = {
    fetchUser: async () => ({
      valid: true,
      user: {
        name: 'Test Creator',
        email: 'creator@test.com',
        plan: 'pro'
      }
    })
  };

  const AppShell = loadAppShell();
  await AppShell.init({
    spaAuth: mockSpaAuth,
    fetchDoc: async () => mockDoc
  });

  const domSidebar = document.getElementById('dash-sidebar');
  const domTopbar = document.getElementById('spa-topbar');
  const domUserPanel = document.getElementById('spa-user-panel');
  const domBackdrop = document.getElementById('spa-user-panel-backdrop');
  const domMobileNav = document.getElementById('spa-mobile-nav');

  assert.ok(domSidebar, 'Sidebar element should be attached to DOM');
  assert.ok(domTopbar, 'Topbar element should be attached to DOM');
  assert.ok(domUserPanel, 'User panel should be created');
  assert.ok(domBackdrop, 'Backdrop should be created');
  assert.ok(domMobileNav, 'Mobile bottom nav should be created');

  // Check user profile synchronization
  const upName = domUserPanel.querySelector('.up-name');
  const upEmail = domUserPanel.querySelector('.up-email');
  assert.strictEqual(upName?.textContent, 'Test Creator');
  assert.strictEqual(upEmail?.textContent, 'creator@test.com');

  AppShell.destroy();
});

test('AppShell: updateRoute() controls shell visibility (dashboard vs landing/auth)', async () => {
  const { body } = setupMockEnvironment();
  const AppShell = loadAppShell();
  await AppShell.init({});

  const domSidebar = document.getElementById('dash-sidebar');
  const domTopbar = document.getElementById('spa-topbar');
  const domMobileNav = document.getElementById('spa-mobile-nav');
  const domUserPanel = document.getElementById('spa-user-panel');

  // Test dashboard route
  AppShell.updateRoute('dashboard');
  assert.strictEqual(domSidebar.style.display, '');
  assert.strictEqual(domTopbar.style.display, '');
  assert.strictEqual(domMobileNav.style.display, '');
  assert.strictEqual(domUserPanel.style.display, '');

  // Test landing route
  AppShell.updateRoute('landing');
  assert.strictEqual(domSidebar.style.display, 'none');
  assert.strictEqual(domTopbar.style.display, 'none');
  assert.strictEqual(domMobileNav.style.display, 'none');
  assert.strictEqual(domUserPanel.style.display, 'none');

  // Test login route
  AppShell.updateRoute('login');
  assert.strictEqual(domSidebar.style.display, 'none');

  // Test return to projects route
  AppShell.updateRoute('projects');
  assert.strictEqual(domSidebar.style.display, '');
  assert.strictEqual(domTopbar.style.display, '');

  AppShell.destroy();
});

test('AppShell: expandSidebar() controls sidebar width and body class', async () => {
  setupMockEnvironment();
  const AppShell = loadAppShell();
  await AppShell.init({});

  const domSidebar = document.getElementById('dash-sidebar');

  // Expand
  AppShell.expandSidebar(true);
  assert.strictEqual(domSidebar.style.width, '260px');
  assert.ok(document.body.classList.contains('sidebar-open'));

  // Collapse
  AppShell.expandSidebar(false);
  assert.strictEqual(domSidebar.style.width, '60px');
  assert.strictEqual(document.body.classList.contains('sidebar-open'), false);

  AppShell.destroy();
});

test('AppShell: ProjectStore subscription reactively updates sidebar projects', async () => {
  setupMockEnvironment();

  let storeSubscriber = null;
  const mockProjects = [
    { id: 'p1', title: 'First Project', is_deleted: false },
    { id: 'p2', title: 'Second Project', is_deleted: false },
    { id: 'p3', title: 'Deleted Project', is_deleted: true }
  ];

  window.ProjectStore = {
    subscribe: (fn) => {
      storeSubscriber = fn;
      return () => { storeSubscriber = null; };
    },
    getProjects: () => mockProjects
  };

  const AppShell = loadAppShell();
  await AppShell.init({});

  const sidebar = document.getElementById('dash-sidebar');
  const subList = sidebar.querySelector('#sidebar-projects-list');
  assert.ok(subList, 'Projects sub-list container should exist in sidebar');

  // Initial projects should be rendered (active projects only: p1, p2)
  const renderedLinks = subList.children;
  assert.strictEqual(renderedLinks.length, 2, 'Should only render non-deleted projects');
  assert.strictEqual(renderedLinks[0].dataset.id, 'p1');
  assert.strictEqual(renderedLinks[1].dataset.id, 'p2');

  // Reactively add a new project
  mockProjects.push({ id: 'p4', title: 'Third Project', is_deleted: false });
  assert.ok(storeSubscriber, 'ProjectStore subscriber should be registered');
  
  // Publish store event
  storeSubscriber({ type: 'project_created', project: mockProjects[3] });

  // Sidebar projects should automatically update without manual call
  assert.strictEqual(subList.children.length, 3, 'Should reactively update to 3 projects');
  assert.strictEqual(subList.children[2].dataset.id, 'p4');

  // Destroy AppShell
  AppShell.destroy();
  assert.strictEqual(storeSubscriber, null, 'Unsubscribe should be called on destroy');

  // Subsequent event should have no effect
  mockProjects.push({ id: 'p5', title: 'Fourth Project', is_deleted: false });
  assert.strictEqual(subList.children.length, 3, 'No updates after destroy');
});

test('AppShell: toggleUserPanel() toggles active class', async () => {
  setupMockEnvironment();
  const AppShell = loadAppShell();
  await AppShell.init({});

  const userPanel = document.getElementById('spa-user-panel');

  assert.strictEqual(userPanel.classList.contains('active'), false);

  AppShell.toggleUserPanel(true);
  assert.strictEqual(userPanel.classList.contains('active'), true);

  // Advance time beyond debounce/dismiss guard (380ms)
  await new Promise(r => setTimeout(r, 420));

  AppShell.toggleUserPanel(false);
  assert.strictEqual(userPanel.classList.contains('active'), false);

  AppShell.destroy();
});

test('AppShell: collapseProjectsGroup() collapses project sub-list and saves localStorage', async () => {
  setupMockEnvironment();
  const AppShell = loadAppShell();
  await AppShell.init({});

  localStorage.setItem('sidebar_projects_expanded', 'true');
  const sidebar = document.getElementById('dash-sidebar');
  const subList = sidebar.querySelector('#sidebar-projects-list');
  const navProjectsGroup = sidebar.querySelector('#nav-projects-group');
  subList.classList.add('expanded');
  navProjectsGroup.classList.add('expanded');

  AppShell.collapseProjectsGroup();

  assert.strictEqual(localStorage.getItem('sidebar_projects_expanded'), 'false');
  assert.strictEqual(subList.classList.contains('expanded'), false);
  assert.strictEqual(navProjectsGroup.classList.contains('expanded'), false);

  AppShell.destroy();
});

test('AppShell: updateRoute() updates active sidebar link and swaps blur/focus icons', async () => {
  setupMockEnvironment();

  // Create mock sidebar with links and images
  const mockDoc = createMockElement('html');
  const sidebar = createMockElement('aside', 'dash-sidebar', 'sidebar');
  sidebar.innerHTML = `
    <a href="../dashboard" class="side-link" id="link-dashboard">
      <img src="../icon/dashboard-blur.svg" />
      <span>首頁</span>
    </a>
    <a href="../projects" class="side-link" id="link-projects">
      <img src="../icon/projects-blur.svg" />
      <span>分鏡</span>
    </a>
    <ul id="sidebar-projects-list"></ul>
    <div id="nav-projects-group"></div>
  `;
  mockDoc.appendChild(sidebar);

  const AppShell = loadAppShell();
  await AppShell.init({
    fetchDoc: async () => mockDoc
  });

  const linkDash = document.getElementById('link-dashboard');
  const linkProj = document.getElementById('link-projects');
  const imgDash = linkDash.querySelector('img');
  const imgProj = linkProj.querySelector('img');

  // Navigate to dashboard
  AppShell.updateRoute('dashboard');
  assert.ok(linkDash.classList.contains('active'), 'Dashboard link should be active');
  assert.strictEqual(linkProj.classList.contains('active'), false, 'Projects link should NOT be active');
  assert.ok(imgDash.src.includes('focus'), 'Dashboard icon should switch to focus');
  assert.ok(imgProj.src.includes('blur'), 'Projects icon should remain blur');

  // Navigate to projects
  AppShell.updateRoute('projects');
  assert.strictEqual(linkDash.classList.contains('active'), false, 'Dashboard link should NOT be active');
  assert.ok(linkProj.classList.contains('active'), 'Projects link should be active');
  assert.ok(imgDash.src.includes('blur'), 'Dashboard icon should switch back to blur');
  assert.ok(imgProj.src.includes('focus'), 'Projects icon should switch to focus');

  AppShell.destroy();
});

test('AppShell: Router Navigation Simulation: Direct Entry, Leave, Return, Back/Forward Lifecycle', async () => {
  setupMockEnvironment();

  const AppShell = loadAppShell();
  await AppShell.init({});

  const sidebar = document.getElementById('dash-sidebar');
  const topbar = document.getElementById('spa-topbar');
  const mobileNav = document.getElementById('spa-mobile-nav');
  const userPanel = document.getElementById('spa-user-panel');

  const historyStack = ['dashboard'];
  let historyIndex = 0;

  function simulateNavigate(page) {
    historyStack.splice(historyIndex + 1);
    historyStack.push(page);
    historyIndex = historyStack.length - 1;
    AppShell.updateRoute(page);
  }

  function simulateBack() {
    if (historyIndex > 0) {
      historyIndex--;
      AppShell.updateRoute(historyStack[historyIndex]);
    }
  }

  function simulateForward() {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      AppShell.updateRoute(historyStack[historyIndex]);
    }
  }

  // 1. Direct Entry to Dashboard
  AppShell.updateRoute('dashboard');
  assert.strictEqual(sidebar.style.display, '');
  assert.strictEqual(topbar.style.display, '');
  assert.strictEqual(mobileNav.style.display, '');

  // 2. Navigate to Projects
  simulateNavigate('projects');
  assert.strictEqual(sidebar.style.display, '');
  assert.strictEqual(topbar.style.display, '');

  // 3. Leave to Landing
  simulateNavigate('landing');
  assert.strictEqual(sidebar.style.display, 'none');
  assert.strictEqual(topbar.style.display, 'none');
  assert.strictEqual(mobileNav.style.display, 'none');
  assert.strictEqual(userPanel.style.display, 'none');

  // 4. Back to Projects
  simulateBack();
  assert.strictEqual(historyStack[historyIndex], 'projects');
  assert.strictEqual(sidebar.style.display, '');
  assert.strictEqual(topbar.style.display, '');
  assert.strictEqual(mobileNav.style.display, '');

  // 5. Back to Dashboard
  simulateBack();
  assert.strictEqual(historyStack[historyIndex], 'dashboard');
  assert.strictEqual(sidebar.style.display, '');
  assert.strictEqual(topbar.style.display, '');

  // 6. Forward to Projects
  simulateForward();
  assert.strictEqual(historyStack[historyIndex], 'projects');
  assert.strictEqual(sidebar.style.display, '');

  // 7. Forward to Landing
  simulateForward();
  assert.strictEqual(historyStack[historyIndex], 'landing');
  assert.strictEqual(sidebar.style.display, 'none');

  AppShell.destroy();
});

test('AppShell: ProjectStore subscription event compatibility across all mutations (optimistic, commit, undo, rename, duplicated, reset)', async () => {
  setupMockEnvironment();

  let storeProjects = [
    { id: 'p1', title: 'Story One', is_deleted: false },
    { id: 'p2', title: 'Story Two', is_deleted: false }
  ];
  const pendingDeletes = new Set();
  const listeners = new Set();

  window.ProjectStore = {
    getProjects: () => storeProjects,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notify: (evt) => {
      listeners.forEach(fn => fn(storeProjects, evt));
    },
    reset: () => {
      storeProjects = null;
      listeners.forEach(fn => fn(null, { type: 'reset' }));
    }
  };

  window.ProjectDeleteQueue = {
    isPending: (id) => pendingDeletes.has(id)
  };

  const AppShell = loadAppShell();
  await AppShell.init({});

  const sidebarList = document.getElementById('sidebar-projects-list');
  assert.ok(sidebarList, 'sidebar list must exist');
  assert.strictEqual(sidebarList.children.length, 2);
  assert.strictEqual(sidebarList.children[0].querySelector('.sub-text').textContent, 'Story One');

  // 1. Rename event
  storeProjects[0].title = 'Story One Renamed';
  window.ProjectStore.notify({ type: 'renamed', id: 'p1', title: 'Story One Renamed' });
  assert.strictEqual(sidebarList.children[0].querySelector('.sub-text').textContent, 'Story One Renamed');

  // 2. Delete optimistic (transition)
  pendingDeletes.add('p2');
  window.ProjectStore.notify({ type: 'delete_transition', id: 'p2' });
  assert.strictEqual(sidebarList.children.length, 1);
  assert.strictEqual(sidebarList.children[0].dataset.id, 'p1');

  // 3. Undo
  pendingDeletes.delete('p2');
  window.ProjectStore.notify({ type: 'undo', id: 'p2' });
  assert.strictEqual(sidebarList.children.length, 2);

  // 4. Delete commit
  storeProjects[1].is_deleted = true;
  window.ProjectStore.notify({ type: 'delete_commit', id: 'p2' });
  assert.strictEqual(sidebarList.children.length, 1);

  // 5. Restore optimistic
  storeProjects[1].is_deleted = false;
  window.ProjectStore.notify({ type: 'restore_optimistic', id: 'p2' });
  assert.strictEqual(sidebarList.children.length, 2);

  // 6. Restore rollback
  storeProjects[1].is_deleted = true;
  window.ProjectStore.notify({ type: 'restore_rollback', id: 'p2' });
  assert.strictEqual(sidebarList.children.length, 1);

  // 7. Duplicate / Create
  const p3 = { id: 'p3', title: 'Story Three', is_deleted: false };
  storeProjects.push(p3);
  window.ProjectStore.notify({ type: 'duplicated', project: p3 });
  assert.strictEqual(sidebarList.children.length, 2);
  assert.strictEqual(sidebarList.children[1].querySelector('.sub-text').textContent, 'Story Three');

  // 8. Reset / Logout
  window.ProjectStore.reset();
  assert.strictEqual(sidebarList.children.length, 0);

  AppShell.destroy();
});

test('AppShell: Compatibility bridges this-context safety and destructuring', async () => {
  setupMockEnvironment();

  window.ProjectStore = {
    getProjects: () => [{ id: 'p1', title: 'Project 1', is_deleted: false }],
    subscribe: () => () => {}
  };

  const AppShell = loadAppShell();
  await AppShell.init({});

  // 1. Invocation with foreign this context
  assert.doesNotThrow(() => {
    window.updateSidebarProjects.call({ rogue: true });
  }, 'updateSidebarProjects should not throw when called with rogue this');

  assert.doesNotThrow(() => {
    window.toggleUserPanel.call(null, false);
  }, 'toggleUserPanel should not throw when called with null this');

  assert.doesNotThrow(() => {
    window.expandSidebar.call(undefined, false);
  }, 'expandSidebar should not throw when called with undefined this');

  assert.doesNotThrow(() => {
    window.updateMobileBottomNavActive.call('foreign_this', 'dashboard');
  }, 'updateMobileBottomNavActive should not throw when called with string this');

  // 2. Destructuring directly from window.AppShell
  const { updateSidebarProjects, toggleUserPanel, expandSidebar, updateMobileBottomNavActive } = window.AppShell;
  assert.doesNotThrow(() => {
    updateSidebarProjects();
    toggleUserPanel(false);
    expandSidebar(false);
    updateMobileBottomNavActive('dashboard');
  }, 'Destructured AppShell methods should execute safely');

  AppShell.destroy();
});

test('AppShell: init() idempotency and destroy() re-initialization lifecycle', async () => {
  const { windowListeners } = setupMockEnvironment();

  let storeProjects = [{ id: 'p1', title: 'Initial Project', is_deleted: false }];
  const storeSubscribers = new Set();
  let subscribeCallCount = 0;

  window.ProjectStore = {
    getProjects: () => storeProjects,
    subscribe: (fn) => {
      subscribeCallCount++;
      storeSubscribers.add(fn);
      return () => storeSubscribers.delete(fn);
    },
    notify: (evt) => {
      storeSubscribers.forEach(fn => fn(storeProjects, evt));
    }
  };

  const AppShell = loadAppShell();

  // First init
  await AppShell.init({});
  assert.strictEqual(subscribeCallCount, 1, 'ProjectStore should be subscribed once on 1st init');
  const resizeCount1 = windowListeners['resize']?.length || 0;
  assert.strictEqual(resizeCount1, 1, 'Resize listener should be registered once');

  // Second init without destroy (idempotent call)
  await AppShell.init({});
  assert.strictEqual(subscribeCallCount, 1, 'ProjectStore should NOT be re-subscribed on duplicate init');
  const resizeCount2 = windowListeners['resize']?.length || 0;
  assert.strictEqual(resizeCount2, 1, 'Resize listener should NOT be duplicated on 2nd init');

  // Verify ProjectStore notification only updates once
  const sidebarList = document.getElementById('sidebar-projects-list');
  assert.strictEqual(sidebarList.children.length, 1);

  storeProjects = [
    { id: 'p1', title: 'Initial Project', is_deleted: false },
    { id: 'p2', title: 'Added Project', is_deleted: false }
  ];
  window.ProjectStore.notify({ type: 'added' });
  assert.strictEqual(sidebarList.children.length, 2);

  // Destroy lifecycle
  AppShell.destroy();
  assert.strictEqual(storeSubscribers.size, 0, 'Store subscribers should be cleared on destroy');
  assert.strictEqual(windowListeners['resize']?.length || 0, 0, 'Window listeners should be cleared on destroy');

  // Re-initialization after destroy
  await AppShell.init({});
  assert.strictEqual(subscribeCallCount, 2, 'ProjectStore should be subscribed again on re-init');
  assert.strictEqual(storeSubscribers.size, 1, 'Store subscriber active after re-init');
  assert.strictEqual(windowListeners['resize']?.length || 0, 1, 'Window resize listener restored after re-init');

  // Verify re-initialized shell still responds to store events
  storeProjects = [{ id: 'p3', title: 'Re-init Project', is_deleted: false }];
  window.ProjectStore.notify({ type: 'set' });
  assert.strictEqual(sidebarList.children.length, 1);
  assert.strictEqual(sidebarList.children[0].querySelector('.sub-text').textContent, 'Re-init Project');

  AppShell.destroy();
});

test('Regression A: ProjectStore.notify() -> AppShell.updateSidebarProjects() never passes non-Node to Node.contains', async () => {
  const { documentMock: document, windowMock: window, body } = setupMockEnvironment();

  // Create full sidebar DOM structure
  const sidebar = createMockElement('aside', 'dash-sidebar', 'sidebar');
  const sidebarList = createMockElement('div', 'sidebar-projects-list');
  sidebar.appendChild(sidebarList);
  document.body.appendChild(sidebar);

  // Spying on sidebarList.contains: assert all parameters are strictly valid DOM Nodes
  let containsCallCount = 0;
  const originalContains = sidebarList.contains.bind(sidebarList);
  sidebarList.contains = (child) => {
    containsCallCount++;
    assert.ok(child, 'Parameter 1 to contains must not be null/undefined');
    assert.strictEqual(typeof child, 'object', 'Parameter 1 to contains must be an object');
    assert.strictEqual(typeof child.nodeType, 'number', 'Parameter 1 to contains must be a DOM Node with nodeType');
    return originalContains(child);
  };

  let storeProjects = [
    { id: 'p1', title: 'Project 1', is_deleted: false },
    { id: 'p2', title: 'Project 2', is_deleted: false }
  ];
  const subscribers = new Set();
  window.ProjectStore = {
    getProjects: () => storeProjects,
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    notify: (evt) => {
      subscribers.forEach(fn => fn(storeProjects, evt));
    }
  };

  const AppShell = loadAppShell();
  await AppShell.init({
    navigate: () => {}
  });

  // Verify initial render
  assert.strictEqual(sidebarList.children.length, 2);

  // Scenario 1: ProjectStore notify rename
  storeProjects = [
    { id: 'p1', title: 'Project 1 Renamed', is_deleted: false },
    { id: 'p2', title: 'Project 2', is_deleted: false }
  ];
  assert.doesNotThrow(() => {
    window.ProjectStore.notify({ type: 'rename', project: storeProjects[0] });
  }, 'Rename notify must not throw Node.contains TypeError');
  assert.strictEqual(sidebarList.children[0].querySelector('.sub-text').textContent, 'Project 1 Renamed');

  // Scenario 2: ProjectStore notify delete (optimistic)
  storeProjects = [
    { id: 'p2', title: 'Project 2', is_deleted: false }
  ];
  assert.doesNotThrow(() => {
    window.ProjectStore.notify({ type: 'delete', id: 'p1' });
  }, 'Delete notify must not throw Node.contains TypeError');
  assert.strictEqual(sidebarList.children.length, 1);

  // Scenario 3: ProjectStore notify undo / restore
  storeProjects = [
    { id: 'p1', title: 'Project 1 Restored', is_deleted: false },
    { id: 'p2', title: 'Project 2', is_deleted: false }
  ];
  assert.doesNotThrow(() => {
    window.ProjectStore.notify({ type: 'restore', id: 'p1' });
  }, 'Restore notify must not throw Node.contains TypeError');
  assert.strictEqual(sidebarList.children.length, 2);

  // Scenario 4: Route updates to project detail, dashboard, history
  assert.doesNotThrow(() => {
    AppShell.updateRoute('project', { id: 'p1' });
    AppShell.updateRoute('dashboard');
    AppShell.updateRoute('history');
    AppShell.updateRoute('projects');
  }, 'Route updates must not throw Node.contains TypeError');

  AppShell.destroy();
});

test('Regression B: spa-router.js does not contain dead reference to justHandledPointerNav', () => {
  const routerCode = fs.readFileSync(path.resolve('public/js/spa-router.js'), 'utf8');

  // Must not reference bare variable justHandledPointerNav
  const bareReferenceMatches = routerCode.match(/(?<![._a-zA-Z0-9$])justHandledPointerNav(?![_a-zA-Z0-9$])/g);
  assert.strictEqual(bareReferenceMatches, null, 'spa-router.js must not reference bare justHandledPointerNav');

  // Must not have let/var/const justHandledPointerNav workaround
  const declarationMatches = routerCode.match(/(?:let|var|const)\s+justHandledPointerNav\b/g);
  assert.strictEqual(declarationMatches, null, 'spa-router.js must not re-declare justHandledPointerNav');
});

test('Regression C: Repeated navigation and clicks do not duplicate document-level listeners', () => {
  const routerCode = fs.readFileSync(path.resolve('public/js/spa-router.js'), 'utf8');

  // spa-router.js should not attach duplicate document click listeners for user-panel or mob-nav-profile
  assert.strictEqual(routerCode.includes("profileBtn = e.target.closest('#mob-nav-profile')"), false,
    'spa-router.js should not duplicate mob-nav-profile click listener');
  assert.strictEqual(routerCode.includes("e.target.closest('#spa-mobile-nav, .mobile-bottom-nav')"), false,
    'spa-router.js should not duplicate mobile-nav outside-click listener');
});


