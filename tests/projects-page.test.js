const test = require('node:test');
const assert = require('node:assert/strict');

// Set up mock DOM environment
function matchesSelector(node, sel) {
  if (!node || !sel) return false;
  if (sel.startsWith('#')) return node.id === sel.slice(1);
  if (sel.startsWith('.')) return Boolean(node.className && node.className.includes(sel.slice(1)));
  if (sel.startsWith('[')) {
    const match = sel.match(/\[([a-zA-Z0-9_-]+)(?:=["']?([^"']*)["']?)?\]/);
    if (match) {
      const attr = match[1];
      const val = match[2];
      const actual = node.getAttribute ? node.getAttribute(attr) : node[attr];
      return val !== undefined ? actual === val : Boolean(actual);
    }
  }
  return node.tagName === sel.toUpperCase();
}

function findDescendant(node, sel) {
  if (!node || !node.children) return null;
  for (const child of node.children) {
    if (matchesSelector(child, sel)) return child;
    const found = findDescendant(child, sel);
    if (found) return found;
  }
  return null;
}

function findAllDescendants(node, sel, results = []) {
  if (!node || !node.children) return results;
  for (const child of node.children) {
    if (matchesSelector(child, sel)) results.push(child);
    findAllDescendants(child, sel, results);
  }
  return results;
}

function createMockElement(tagName = 'div') {
  const children = [];
  const eventListeners = {};
  const dataset = {};
  const attributes = {};
  const style = {
    setProperty: (k, v) => { style[k] = v; }
  };

  const classList = {
    add: (...cls) => {
      const current = elem.className ? elem.className.split(/\s+/).filter(Boolean) : [];
      cls.forEach(c => { if (!current.includes(c)) current.push(c); });
      elem.className = current.join(' ');
    },
    remove: (...cls) => {
      const current = elem.className ? elem.className.split(/\s+/).filter(Boolean) : [];
      elem.className = current.filter(c => !cls.includes(c)).join(' ');
    },
    contains: (c) => Boolean(elem.className && elem.className.split(/\s+/).includes(c)),
    toggle: (c, force) => {
      if (force === true) classList.add(c);
      else if (force === false) classList.remove(c);
      else if (classList.contains(c)) classList.remove(c);
      else classList.add(c);
    }
  };

  const elem = {
    tagName: tagName.toUpperCase(),
    dataset,
    style,
    className: '',
    classList,
    children,
    parentNode: null,
    getAttribute(k) { return attributes[k] !== undefined ? attributes[k] : (dataset[k] || null); },
    setAttribute(k, v) { attributes[k] = String(v); },
    removeAttribute(k) { delete attributes[k]; },
    get innerHTML() {
      if (this._innerHTML) {
        return this._innerHTML;
      }
      if (this.children.length > 0) {
        return this.children.map(c => c.innerHTML || c._innerHTML || '').join('');
      }
      return '';
    },
    set innerHTML(val) {
      this._innerHTML = val;
      this.children.length = 0;
      if (typeof val === 'string' && val.includes('<')) {
        const tagRegex = /<([a-zA-Z0-9_-]+)([^>]*)>/g;
        let match;
        while ((match = tagRegex.exec(val)) !== null) {
          const tag = match[1];
          if (tag.startsWith('/')) continue;
          const attrsStr = match[2];
          const child = createMockElement(tag);
          const idMatch = attrsStr.match(/id=["']([^"']+)["']/);
          if (idMatch) child.id = idMatch[1];
          const classMatch = attrsStr.match(/class=["']([^"']+)["']/);
          if (classMatch) child.className = classMatch[1];
          const typeMatch = attrsStr.match(/type=["']([^"']+)["']/);
          if (typeMatch) child.type = typeMatch[1];
          const dataTagMatch = attrsStr.match(/data-tag=["']([^"']+)["']/);
          if (dataTagMatch) child.setAttribute('data-tag', dataTagMatch[1]);
          this.appendChild(child);
        }
      }
    },
    appendChild(child) {
      children.push(child);
      child.parentNode = elem;
      if (this._innerHTML && (child.innerHTML || child._innerHTML)) {
        this._innerHTML += (child.innerHTML || child._innerHTML);
      }
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      child.parentNode = null;
      if (this._innerHTML && (child.innerHTML || child._innerHTML)) {
        this._innerHTML = this._innerHTML.replace(child.innerHTML || child._innerHTML, '');
      }
      return child;
    },
    querySelector(sel) {
      if (matchesSelector(elem, sel)) return elem;
      return findDescendant(elem, sel);
    },
    querySelectorAll(sel) {
      return findAllDescendants(elem, sel, []);
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
      const evtType = typeof evt === 'string' ? evt : (evt && evt.type ? evt.type : 'click');
      const fns = eventListeners[evtType] || [];
      const evObj = typeof evt === 'string' ? { type: evt, target: elem, stopPropagation() {} } : { stopPropagation() {}, target: elem, ...evt };
      fns.forEach(f => f(evObj));
    },
    click() {
      if (typeof this.onclick === 'function') this.onclick({ type: 'click', target: this, stopPropagation() {} });
      this.dispatchEvent({ type: 'click', stopPropagation() {} });
    }
  };
  return elem;
}

// Minimal mock document and window
const mockBody = createMockElement('body');
mockBody.className = 'projects-body';
global.mockBody = mockBody;

const mockDocument = {
  body: mockBody,
  getElementById(id) {
    if (id === 'projects-grid') return global.mockGrid || mockBody.querySelector('#projects-grid');
    return mockBody.querySelector(`#${id}`);
  },
  querySelector(sel) {
    if (sel === '.projects-body') return global.mockBody;
    return mockBody.querySelector(sel);
  },
  createElement(tag) {
    return createMockElement(tag);
  }
};

const windowListeners = {};
global.addEventListener = (evt, fn) => {
  if (!windowListeners[evt]) windowListeners[evt] = [];
  windowListeners[evt].push(fn);
};
global.removeEventListener = (evt, fn) => {
  if (!windowListeners[evt]) return;
  windowListeners[evt] = windowListeners[evt].filter(f => f !== fn);
};
global.dispatchEvent = (evt) => {
  const evtType = typeof evt === 'string' ? evt : (evt && evt.type ? evt.type : 'click');
  (windowListeners[evtType] || []).forEach(f => f(evt));
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

test('ProjectsPage: getFilteredAndSortedProjects supports OR logic with multiple tags and preserves sort', () => {
  const p1 = { id: 'p1', title: 'Commercial', tags: ['商業廣告'], updateAt: '2026-01-01' };
  const p2 = { id: 'p2', title: 'Short Video', tags: ['短影音'], updateAt: '2026-01-03' };
  const p3 = { id: 'p3', title: 'Personal', tags: ['個人創作'], updateAt: '2026-01-02' };
  const p4 = { id: 'p4', title: 'Graduation', tags: ['畢業專題'], updateAt: '2026-01-04' };

  // 1. Single tag filter
  const single = ProjectsPage.getFilteredAndSortedProjects([p1, p2, p3, p4], new Set(['短影音']));
  assert.equal(single.length, 1);
  assert.equal(single[0].id, 'p2');

  // 2. Multi-tag filter with OR logic
  const multi = ProjectsPage.getFilteredAndSortedProjects([p1, p2, p3, p4], new Set(['商業廣告', '畢業專題']));
  assert.equal(multi.length, 2);
  // Sorted desc by updateAt: p4 (2026-01-04) then p1 (2026-01-01)
  assert.equal(multi[0].id, 'p4');
  assert.equal(multi[1].id, 'p1');

  // 3. Filter with no match
  const none = ProjectsPage.getFilteredAndSortedProjects([p1, p2, p3, p4], new Set(['不存在的標籤']));
  assert.equal(none.length, 0);

  // 4. Empty set returns all active projects sorted
  const all = ProjectsPage.getFilteredAndSortedProjects([p1, p2, p3, p4], new Set());
  assert.equal(all.length, 4);
  assert.equal(all[0].id, 'p4');
});

test('ProjectsPage: extractTagsWithCounts gathers unique tags and correct project counts', () => {
  const projects = [
    { id: '1', tags: ['商業廣告', '短影音'], is_deleted: false },
    { id: '2', tags: ['商業廣告'], is_deleted: false },
    { id: '3', tags: ['個人創作'], is_deleted: false },
    { id: '4', tags: ['商業廣告'], is_deleted: true } // Deleted should be ignored
  ];

  const { allTags, counts } = ProjectsPage.extractTagsWithCounts(projects);
  assert.equal(counts['商業廣告'], 2);
  assert.equal(counts['短影音'], 1);
  assert.equal(counts['個人創作'], 1);
  assert.equal(counts['已刪除'], undefined);
  assert.ok(allTags.includes('商業廣告'));
  assert.ok(allTags.includes('短影音'));
});

test('ProjectsPage: tags count each project once and normalize legacy metadata without prototype collisions', () => {
  const projects = [
    { id: '1', metadata: { tags: [' __proto__ ', '__proto__', '短影音', ' 短影音 ', null] } },
    { id: '2', tags: ['constructor', '短影音'] }
  ];
  const { allTags, counts } = ProjectsPage.extractTagsWithCounts(projects);
  assert.equal(counts.__proto__, 1);
  assert.equal(counts.constructor, 1);
  assert.equal(counts['短影音'], 2);
  assert.ok(allTags.includes('__proto__'));
  assert.equal(ProjectsPage.getFilteredAndSortedProjects(projects, new Set(['__proto__'])).length, 1);
});

test('ProjectsPage: renderFilterEmptyState renders filter-specific empty state and binds clear callback', () => {
  const container = createMockElement('div');
  let cleared = false;
  ProjectsPage.renderFilterEmptyState(container, () => {
    cleared = true;
  });

  assert.ok(container.innerHTML.includes('無符合的分鏡'));
  assert.ok(container.innerHTML.includes('清除篩選'));
  assert.ok(!container.innerHTML.includes('尚未建立專案'));

  const btn = container.querySelector('#empty-clear-filters-btn');
  assert.ok(btn);
  btn.click();
  assert.equal(cleared, true);
});

test('ProjectsPage: mount toolbar renders tag filter pills, updates count badge, and toggles filters', async () => {
  ProjectStore.reset();
  const projects = [
    { id: 'p1', title: '廣告 A', tags: ['商業廣告'], updateAt: '2026-01-01', is_deleted: false },
    { id: 'p2', title: '短片 B', tags: ['短影音'], updateAt: '2026-01-02', is_deleted: false },
    { id: 'p3', title: '廣告 C', tags: ['商業廣告'], updateAt: '2026-01-03', is_deleted: false }
  ];
  ProjectStore.setProjects(projects);

  const root = createMockElement('div');
  const toolbar = createMockElement('div');
  toolbar.id = 'projects-toolbar';
  const tagsScroll = createMockElement('div');
  tagsScroll.id = 'projects-tags-scroll';
  const clearBtn = createMockElement('button');
  clearBtn.id = 'projects-clear-filter-btn';
  const countBadge = createMockElement('span');
  countBadge.id = 'projects-count-badge';
  const grid = createMockElement('div');
  grid.id = 'projects-grid';

  toolbar.appendChild(tagsScroll);
  toolbar.appendChild(clearBtn);
  root.appendChild(countBadge);
  root.appendChild(toolbar);
  root.appendChild(grid);

  const instance = await ProjectsPage.mount({ root });

  // Initial render: 3 cards, count badge = 3
  assert.equal(grid.children.length, 3);
  assert.equal(countBadge.textContent, '3');

  // Verify pills: "全部", "#商業廣告 (2)", "#短影音 (1)"
  const allPill = tagsScroll.querySelector('[data-tag="__ALL__"]');
  const commPill = tagsScroll.querySelector('[data-tag="商業廣告"]');
  const videoPill = tagsScroll.querySelector('[data-tag="短影音"]');
  assert.ok(allPill);
  assert.ok(commPill);
  assert.ok(videoPill);
  assert.ok(allPill.className.includes('is-active'));
  assert.equal(allPill.getAttribute('aria-pressed'), 'true');
  assert.equal(commPill.getAttribute('aria-pressed'), 'false');

  // Click "#短影音" filter pill
  commPill.click(); // toggle 商業廣告
  assert.equal(grid.children.length, 2);
  assert.equal(countBadge.textContent, '2 / 3');
  assert.equal(clearBtn.style.display, 'inline-flex');
  assert.equal(tagsScroll.querySelector('[data-tag="商業廣告"]').getAttribute('aria-pressed'), 'true');

  // Click clear filter button
  clearBtn.click();
  assert.equal(grid.children.length, 3);
  assert.equal(countBadge.textContent, '3');
  assert.equal(clearBtn.style.display, 'none');

  instance.unmount();
});

test('ProjectsPage: openProjectTagModal opens dialog, allows adding/removing tags, and saves via onSave', async () => {
  const project = {
    id: 'modal-proj',
    title: '標籤彈窗測試',
    tags: ['商業廣告']
  };

  let savedTags = null;
  const modal = ProjectsPage.openProjectTagModal(project, async (tags) => {
    savedTags = tags;
  });

  assert.ok(modal);
  const overlay = mockDocument.body.querySelector('.project-tags-modal-overlay');
  assert.ok(overlay, 'Modal overlay should be appended to document.body');

  // Wait 20ms for open timeout: backdrop blur and panel scale 1
  await new Promise(r => setTimeout(r, 20));
  const panel = overlay.querySelector('.project-tags-modal-panel');
  assert.ok(panel);
  assert.equal(panel.style.scale, '1');
  assert.equal(overlay.style.backdropFilter, 'blur(16px)');
  assert.ok(overlay.style.transition.includes('cubic-bezier(.4, 0, .2, 1)') || overlay.style.transition.includes('cubic-bezier(.4,0,.2,1)'));

  // Verify title
  assert.ok(overlay.innerHTML.includes('標籤彈窗測試'));

  // Verify current tags chips
  const chipsWrap = overlay.querySelector('#modal-chips-wrap');
  assert.ok(chipsWrap);
  assert.ok(chipsWrap.innerHTML.includes('#商業廣告'));

  // Add new tag from input
  const input = overlay.querySelector('#modal-tag-input');
  const addBtn = overlay.querySelector('#modal-tag-add-btn');
  input.value = '短影音';
  addBtn.click();

  assert.ok(chipsWrap.innerHTML.includes('#短影音'));

  // Remove original tag
  const removeBtn = chipsWrap.querySelector('[data-tag="商業廣告"]');
  assert.ok(removeBtn);
  removeBtn.click();

  assert.ok(!chipsWrap.innerHTML.includes('#商業廣告'));
  assert.ok(chipsWrap.innerHTML.includes('#短影音'));

  // Click save button
  const saveBtn = overlay.querySelector('#modal-save-btn');
  saveBtn.click();

  // Wait 20ms: verify close transition step (panel scale 0, blur 0, close easing)
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(savedTags, ['短影音']);
  assert.ok(panel.style.transition.includes('cubic-bezier(.31, .01, .66, -0.59)') || panel.style.transition.includes('cubic-bezier(.31,.01,.66,-0.59)'));
  assert.equal(panel.style.scale, '0');
  assert.equal(overlay.style.backdropFilter, 'blur(0px)');

  // Wait for complete close animation (duration + 50ms)
  await new Promise(r => setTimeout(r, 550));
  assert.equal(mockDocument.body.querySelector('.project-tags-modal-overlay'), null, 'Modal should be removed on save');
});

test('ProjectsPage: tag modal keeps draft on failed save, blocks duplicate saves, and retries', async () => {
  let attempts = 0;
  let release;
  const modal = ProjectsPage.openProjectTagModal({ id: 'retry-tags', tags: ['原標籤'] }, async tags => {
    attempts++;
    assert.deepEqual(tags, ['原標籤', '草稿標籤']);
    if (attempts === 1) return new Promise(resolve => { release = resolve; });
    return true;
  });
  const overlay = mockDocument.body.querySelector('.project-tags-modal-overlay');
  const input = overlay.querySelector('#modal-tag-input');
  input.value = '草稿標籤';
  const save = overlay.querySelector('#modal-save-btn');
  save.click();
  save.click();
  assert.equal(attempts, 1);
  assert.equal(save.disabled, true);
  release(false);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(mockDocument.body.querySelector('.project-tags-modal-overlay'), overlay);
  assert.ok(overlay.querySelector('#modal-chips-wrap').innerHTML.includes('草稿標籤'));
  assert.equal(save.disabled, false);
  assert.equal(overlay.querySelector('#modal-tags-status').hidden, false);
  save.click();
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(attempts, 2);
  assert.equal(mockDocument.body.querySelector('.project-tags-modal-overlay'), null);
  modal.close({ immediate: true });
});

test('ProjectsPage: singleton modal and route cleanup remove overlay and keyboard listener immediately', () => {
  const before = (windowListeners.keydown || []).length;
  ProjectsPage.openProjectTagModal({ id: 'first', tags: [] }, async () => true);
  ProjectsPage.openProjectTagModal({ id: 'second', tags: [] }, async () => true);
  assert.equal(mockDocument.body.querySelectorAll('.project-tags-modal-overlay').length, 1);
  assert.equal((windowListeners.keydown || []).length, before + 1);
  ProjectsPage.closeTagModal({ immediate: true, restoreFocus: false });
  assert.equal(mockDocument.body.querySelector('.project-tags-modal-overlay'), null);
  assert.equal((windowListeners.keydown || []).length, before);
});

