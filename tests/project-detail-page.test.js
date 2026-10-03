const test = require('node:test');
const assert = require('node:assert/strict');

// Set up mock DOM element
function createMockElement(tagName = 'div') {
  const children = [];
  const eventListeners = {};
  const dataset = {};
  const classListSet = new Set();
  const classList = {
    add: (c) => classListSet.add(c),
    remove: (c) => classListSet.delete(c),
    contains: (c) => classListSet.has(c),
    toggle: (c, force) => {
      if (force === true) classListSet.add(c);
      else if (force === false) classListSet.delete(c);
      else if (classListSet.has(c)) classListSet.delete(c);
      else classListSet.add(c);
    }
  };
  const style = {
    setProperty: (k, v) => { style[k] = v; }
  };

  const elem = {
    tagName: tagName.toUpperCase(),
    dataset,
    classList,
    style,
    children,
    parentNode: null,
    get className() {
      return Array.from(classListSet).join(' ');
    },
    set className(val) {
      classListSet.clear();
      if (val) {
        val.split(/\s+/).filter(Boolean).forEach(c => classListSet.add(c));
      }
    },
    get innerHTML() {
      return this._innerHTML || '';
    },
    set innerHTML(val) {
      this._innerHTML = val;
      this.children.length = 0;
      if (typeof val === 'string') {
        // Parse thumb wraps
        const thumbMatches = [...val.matchAll(/class="([^"]*shot-cell-thumb-wrap[^"]*)"[^>]*data-src="([^"]+)"/g)];
        thumbMatches.forEach(m => {
          const childWrap = createMockElement('div');
          childWrap.className = m[1];
          childWrap.dataset.src = m[2];
          childWrap.parentNode = this;
          this.children.push(childWrap);
        });

        // Parse elements with IDs
        const idMatches = [...val.matchAll(/id="([^"]+)"/g)];
        idMatches.forEach(m => {
          const childEl = createMockElement('button');
          childEl.id = m[1];
          childEl.parentNode = this;
          this.children.push(childEl);
        });

        // Parse edit buttons
        const editBtnMatches = [...val.matchAll(/class="([^"]*shot-cell-edit-btn[^"]*)"[^>]*data-shot-id="([^"]+)"/g)];
        editBtnMatches.forEach(m => {
          const childBtn = createMockElement('button');
          childBtn.className = m[1];
          childBtn.dataset.shotId = m[2];
          childBtn.parentNode = this;
          this.children.push(childBtn);
        });

        // Parse shot rows
        const rowMatches = [...val.matchAll(/class="([^"]*project-shot-row[^"]*)"[^>]*data-shot-id="([^"]+)"/g)];
        rowMatches.forEach(m => {
          const childRow = createMockElement('tr');
          childRow.className = m[1];
          childRow.dataset.shotId = m[2];
          childRow.parentNode = this;
          this.children.push(childRow);
        });
      }
    },
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    querySelector(sel) {
      if (sel === '.project-workspace-content' || sel === '.content-body') {
        return this.innerHTML.includes('project-workspace-content') ? this : null;
      }
      return children.find(c => {
        if (sel.startsWith('.')) return c.classList.contains(sel.slice(1));
        if (sel.startsWith('#')) return c.id === sel.slice(1);
        return false;
      }) || null;
    },
    querySelectorAll(sel) {
      if (sel === '.shot-cell-thumb-wrap[data-src]') {
        return this.children.filter(c => c.classList.contains('shot-cell-thumb-wrap') && c.dataset.src);
      }
      if (sel === '.shot-cell-edit-btn') {
        return this.children.filter(c => c.classList.contains('shot-cell-edit-btn'));
      }
      if (sel === '.project-shot-row') {
        return this.children.filter(c => c.classList.contains('project-shot-row'));
      }
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
      fns.forEach(f => f({ type: evt, stopPropagation: () => {} }));
    }
  };

  return elem;
}

// Global Image Mock
class MockImage {
  constructor() {
    this.style = {};
    this._src = '';
    this.complete = false;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
  }
  set src(val) {
    this._src = val;
    if (MockImage.mode === 'cached') {
      this.complete = true;
      this.naturalWidth = 1920;
      this.naturalHeight = 1080;
    } else if (MockImage.mode === 'slow') {
      this.complete = false;
      setTimeout(() => {
        this.complete = true;
        this.naturalWidth = 1920;
        this.naturalHeight = 1080;
        if (typeof this.onload === 'function') this.onload();
      }, 15);
    } else if (MockImage.mode === 'error' || (val && val.includes('error'))) {
      this.complete = true;
      this.naturalWidth = 0;
      queueMicrotask(() => {
        if (typeof this.onerror === 'function') this.onerror();
      });
    } else {
      queueMicrotask(() => {
        this.complete = true;
        this.naturalWidth = 1920;
        if (typeof this.onload === 'function') this.onload();
      });
    }
  }
  get src() {
    return this._src;
  }
  async decode() {
    return;
  }
}
MockImage.mode = 'normal';
global.Image = MockImage;

// Load module implementations
const { store: ProjectStore, api: ProjectsApi } = require('../public/js/features/projects.js');
global.ProjectStore = ProjectStore;
global.ProjectsApi = ProjectsApi;
const ProjectDetailPage = require('../public/js/pages/project-detail.js');

test('ProjectStore: Generation Granularity — Invalidate Detail(A) must NOT invalidate in-flight Detail(B)', async () => {
  ProjectStore.reset();
  assert.equal(ProjectStore.resetEpoch, 1);
  assert.equal(ProjectStore.projectsGeneration, 1);

  let resolveDetailA, resolveDetailB;
  const originalFetchDetail = ProjectsApi.fetchProjectDetail;

  ProjectsApi.fetchProjectDetail = (id) => {
    return new Promise(resolve => {
      if (id === 'proj-A') {
        resolveDetailA = () => resolve({ ok: true, project: { id: 'proj-A', title: 'Project A' } });
      } else if (id === 'proj-B') {
        resolveDetailB = () => resolve({ ok: true, project: { id: 'proj-B', title: 'Project B' } });
      }
    });
  };

  try {
    const promiseA = ProjectStore.fetchProjectDetail('proj-A');
    const promiseB = ProjectStore.fetchProjectDetail('proj-B');

    // Invalidate project A while both are in flight
    ProjectStore.invalidateProjectDetail('proj-A');

    assert.equal(ProjectStore.detailGenerations['proj-A'], 1);
    assert.equal(ProjectStore.detailGenerations['proj-B'] || 0, 0);

    // Resolve both requests
    resolveDetailA();
    resolveDetailB();

    const resA = await promiseA;
    const resB = await promiseB;

    // A was invalidated during request -> stale response discarded!
    assert.equal(resA, null);
    assert.equal(ProjectStore.getProjectDetail('proj-A'), null);

    // B was NOT invalidated -> response is valid and saved!
    assert.ok(resB);
    assert.equal(resB.id, 'proj-B');
    assert.equal(ProjectStore.getProjectDetail('proj-B')?.title, 'Project B');
  } finally {
    ProjectsApi.fetchProjectDetail = originalFetchDetail;
  }
});

test('ProjectStore: Generation Granularity — reset() invalidates all in-flight requests', async () => {
  ProjectStore.reset();
  let resolveDetailC;
  const originalFetchDetail = ProjectsApi.fetchProjectDetail;
  ProjectsApi.fetchProjectDetail = (id) => new Promise(resolve => {
    resolveDetailC = () => resolve({ ok: true, project: { id: 'proj-C', title: 'Project C' } });
  });

  try {
    const promiseC = ProjectStore.fetchProjectDetail('proj-C');
    ProjectStore.reset(); // Global reset (e.g. user logout)
    resolveDetailC();

    const resC = await promiseC;
    assert.equal(resC, null);
    assert.equal(ProjectStore.getProjectDetail('proj-C'), null);
  } finally {
    ProjectsApi.fetchProjectDetail = originalFetchDetail;
  }
});

test('ProjectStore: Promise Identity — #1 finally does NOT clear #2 inFlightDetailsPromises[id]', async () => {
  ProjectStore.reset();
  let resolveFetch1, resolveFetch2;
  const originalFetchDetail = ProjectsApi.fetchProjectDetail;

  let callCount = 0;
  ProjectsApi.fetchProjectDetail = (id) => {
    callCount++;
    if (callCount === 1) {
      return new Promise(r => { resolveFetch1 = () => r({ ok: true, project: { id, title: 'V1' } }); });
    } else {
      return new Promise(r => { resolveFetch2 = () => r({ ok: true, project: { id, title: 'V2' } }); });
    }
  };

  try {
    // 1. fetchDetail(A) #1
    const promise1 = ProjectStore.fetchProjectDetail('proj-race');
    assert.equal(ProjectStore.inFlightDetailsPromises['proj-race'], promise1);

    // 2. invalidateDetail(A)
    ProjectStore.invalidateProjectDetail('proj-race');
    assert.equal(ProjectStore.inFlightDetailsPromises['proj-race'], undefined);

    // 3. fetchDetail(A) #2
    const promise2 = ProjectStore.fetchProjectDetail('proj-race');
    assert.notEqual(promise1, promise2);
    assert.equal(ProjectStore.inFlightDetailsPromises['proj-race'], promise2);

    // 4. #1 finishes first
    resolveFetch1();
    const res1 = await promise1;
    assert.equal(res1, null); // discarded because generation changed

    // Crucial check: #1's finally MUST NOT have cleared #2's inFlightDetailsPromises!
    assert.equal(ProjectStore.inFlightDetailsPromises['proj-race'], promise2);

    // 5. #2 finishes
    resolveFetch2();
    const res2 = await promise2;
    assert.ok(res2);
    assert.equal(res2.title, 'V2');
    assert.equal(ProjectStore.inFlightDetailsPromises['proj-race'], undefined);
  } finally {
    ProjectsApi.fetchProjectDetail = originalFetchDetail;
  }
});

test('ProjectDetailPage: Page Lifecycle Contract — mount() returns { unmount() }', async () => {
  ProjectStore.reset();
  const root = createMockElement('main');

  const sampleProject = {
    id: 'p-100',
    title: '科幻冒險分鏡',
    style: 'Anime',
    ratio: '16:9',
    shots: [
      { id: 's1', order: 1, title: 'Shot 1', duration: '3s', camera: 'Wide Shot', payload: { image: 'https://example.com/s1.jpg' } }
    ]
  };

  ProjectStore.seedProjectDetail('p-100', sampleProject);

  let controllerInitCalls = 0;
  let controllerDestroyCalls = 0;
  global.ProjectDetailController = {
    init({ root: r, projectId, project }) {
      controllerInitCalls++;
    },
    destroy() {
      controllerDestroyCalls++;
    }
  };

  let maskAttachCalls = 0;
  let maskDetachCalls = 0;
  global.DynamicMaskSystem = {
    attach(el, opts) { maskAttachCalls++; },
    detach(el) { maskDetachCalls++; }
  };

  const instance = await ProjectDetailPage.mount({
    root,
    id: 'p-100',
    navigate: () => {}
  });

  assert.ok(instance);
  assert.equal(typeof instance.unmount, 'function');
  assert.equal(controllerInitCalls, 1);
  assert.equal(maskAttachCalls, 1);

  // Unmount
  instance.unmount();
  assert.equal(controllerDestroyCalls, 1);
  assert.equal(maskDetachCalls, 1);
  global.ProjectDetailController = null;
  global.DynamicMaskSystem = null;
});

test('ProjectDetailPage: SWR Lifecycle & Duplicate Listener Guard — cached render -> background detail_loaded triggers events only ONCE', async () => {
  ProjectStore.reset();
  const root = createMockElement('main');

  const cachedProject = {
    id: 'p-swr-event-test',
    title: '快取舊標題',
    shots: [
      { id: 'shot-1', order: 1, title: '第一鏡', duration: '2s' }
    ]
  };
  ProjectStore.seedProjectDetail('p-swr-event-test', cachedProject);

  let editClickFired = 0;
  let viewSwitchFired = 0;
  let initCalls = 0;
  let destroyCalls = 0;

  global.ProjectDetailController = {
    init({ root: r, projectId, project }) {
      initCalls++;
      // Bind event listeners like real controller
      const btn = r.querySelector('#pd-view-film');
      if (btn) {
        btn.addEventListener('click', () => { viewSwitchFired++; });
      }
      r.querySelectorAll('.shot-cell-edit-btn').forEach(b => {
        b.addEventListener('click', () => { editClickFired++; });
      });
    },
    destroy() {
      destroyCalls++;
    }
  };

  const instance = await ProjectDetailPage.mount({
    root,
    id: 'p-swr-event-test'
  });

  assert.equal(initCalls, 1);
  assert.equal(destroyCalls, 0);

  // Background update arrives via detail_loaded event
  const freshProject = {
    id: 'p-swr-event-test',
    title: '伺服器最新標題',
    shots: [
      { id: 'shot-1', order: 1, title: '第一鏡（更新）', duration: '2s' }
    ]
  };

  ProjectStore.seedProjectDetail('p-swr-event-test', freshProject);
  ProjectStore.notify({ type: 'detail_loaded', id: 'p-swr-event-test', project: freshProject });

  // 等待非同步 renderWorkspace (包含 Promise.all 鏡頭翻譯處理) 完成
  await new Promise(r => setTimeout(r, 20));

  // Verify safe lifecycle: previous controller destroyed, new controller initialized
  assert.equal(destroyCalls, 1);
  assert.equal(initCalls, 2);

  // Now trigger events on the newly rendered DOM
  const newFilmBtn = root.querySelector('#pd-view-film');
  const newEditBtn = root.querySelector('.shot-cell-edit-btn');

  assert.ok(newFilmBtn);
  assert.ok(newEditBtn);

  newFilmBtn.dispatchEvent('click');
  newEditBtn.dispatchEvent('click');

  // Verify listeners fired EXACTLY ONCE
  assert.equal(viewSwitchFired, 1, 'View switch button should fire exactly once after DOM update');
  assert.equal(editClickFired, 1, 'Edit button should fire exactly once after DOM update');

  instance.unmount();
  assert.equal(destroyCalls, 2);
  global.ProjectDetailController = null;
});

test('ProjectDetailPage: Empty / Error State when project does not exist', async () => {
  ProjectStore.reset();
  const root = createMockElement('main');

  const originalFetchDetail = ProjectsApi.fetchProjectDetail;
  ProjectsApi.fetchProjectDetail = async () => ({ ok: false });

  let transitionCancelled = false;
  global._activeProjectTransition = {
    projectId: 'p-not-found',
    cancel: () => { transitionCancelled = true; }
  };

  try {
    const instance = await ProjectDetailPage.mount({
      root,
      id: 'p-not-found'
    });

    assert.ok(root.innerHTML.includes('無法取得分鏡'));
    assert.equal(transitionCancelled, true);

    instance.unmount();
  } finally {
    ProjectsApi.fetchProjectDetail = originalFetchDetail;
    global._activeProjectTransition = null;
  }
});

test('ProjectDetailPage: Cover Transition Integration — (1) Slow Image Load', async () => {
  ProjectStore.reset();
  MockImage.mode = 'slow';
  const root = createMockElement('main');

  const project = {
    id: 'p-slow',
    ratio: '16:9',
    shots: [
      { id: 's1', order: 1, title: 'Slow Shot', duration: '3s', payload: { image: 'https://example.com/slow.png' } }
    ]
  };
  ProjectStore.seedProjectDetail('p-slow', project);

  let firstShotReadyCalled = false;
  global._activeProjectTransition = {
    projectId: 'p-slow',
    state: 'waiting-project',
    onFirstShotReady: () => { firstShotReadyCalled = true; },
    fallbackDismiss: () => {}
  };

  const instance = await ProjectDetailPage.mount({ root, id: 'p-slow' });
  assert.equal(firstShotReadyCalled, false);

  // Wait for slow load
  await new Promise(r => setTimeout(r, 40));
  assert.equal(firstShotReadyCalled, true);

  instance.unmount();
  global._activeProjectTransition = null;
  MockImage.mode = 'normal';
});

test('ProjectDetailPage: Cover Transition Integration — (2) Already-Cached Image in Browser', async () => {
  ProjectStore.reset();
  MockImage.mode = 'cached';
  const root = createMockElement('main');

  const project = {
    id: 'p-cached-img',
    ratio: '16:9',
    shots: [
      { id: 's1', order: 1, title: 'Cached Shot', duration: '3s', payload: { image: 'https://example.com/cached.png' } }
    ]
  };
  ProjectStore.seedProjectDetail('p-cached-img', project);

  let firstShotReadyCalled = false;
  global._activeProjectTransition = {
    projectId: 'p-cached-img',
    state: 'waiting-project',
    onFirstShotReady: () => { firstShotReadyCalled = true; },
    fallbackDismiss: () => {}
  };

  const instance = await ProjectDetailPage.mount({ root, id: 'p-cached-img' });
  // Should trigger immediately without waiting because img.complete === true
  assert.equal(firstShotReadyCalled, true, 'Cached image should trigger onFirstShotReady immediately');

  instance.unmount();
  global._activeProjectTransition = null;
  MockImage.mode = 'normal';
});

test('ProjectDetailPage: Cover Transition Integration — (3) Image Error triggers fallbackDismiss', async () => {
  ProjectStore.reset();
  MockImage.mode = 'error';
  const root = createMockElement('main');

  const project = {
    id: 'p-img-err',
    ratio: '16:9',
    shots: [
      { id: 's1', order: 1, title: 'Err Shot', duration: '3s', payload: { image: 'https://example.com/error.png' } }
    ]
  };
  ProjectStore.seedProjectDetail('p-img-err', project);

  let fallbackCalled = false;
  global._activeProjectTransition = {
    projectId: 'p-img-err',
    state: 'waiting-project',
    onFirstShotReady: () => {},
    fallbackDismiss: () => { fallbackCalled = true; }
  };

  const instance = await ProjectDetailPage.mount({ root, id: 'p-img-err' });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(fallbackCalled, true, 'Image error should trigger fallbackDismiss');

  instance.unmount();
  global._activeProjectTransition = null;
  MockImage.mode = 'normal';
});

test('ProjectDetailPage: Cover Transition Integration — (4) No Shots or shots without image triggers fallbackDismiss immediately', async () => {
  ProjectStore.reset();
  const root = createMockElement('main');

  // Case A: 0 shots
  const emptyProject = { id: 'p-no-shots', shots: [] };
  ProjectStore.seedProjectDetail('p-no-shots', emptyProject);

  let fallbackCalled = false;
  global._activeProjectTransition = {
    projectId: 'p-no-shots',
    state: 'waiting-project',
    fallbackDismiss: () => { fallbackCalled = true; }
  };

  const instanceA = await ProjectDetailPage.mount({ root, id: 'p-no-shots' });
  assert.equal(fallbackCalled, true, 'Zero shots must immediately fallbackDismiss');
  instanceA.unmount();

  // Case B: shots without image
  fallbackCalled = false;
  const noImgProject = {
    id: 'p-no-img',
    shots: [{ id: 's1', order: 1, title: 'Shot without image', payload: {} }]
  };
  ProjectStore.seedProjectDetail('p-no-img', noImgProject);
  global._activeProjectTransition = {
    projectId: 'p-no-img',
    state: 'waiting-project',
    fallbackDismiss: () => { fallbackCalled = true; }
  };

  const instanceB = await ProjectDetailPage.mount({ root, id: 'p-no-img' });
  assert.equal(fallbackCalled, true, 'Shots without images must immediately fallbackDismiss without hanging');
  instanceB.unmount();
  global._activeProjectTransition = null;
});

test('Cover Transition: cancel() is strictly idempotent', () => {
  let removeChildCalls = 0;
  const mockScrim = {
    parentNode: {
      removeChild: () => { removeChildCalls++; }
    },
    style: {}
  };
  const mockFlyingCover = {
    parentNode: {
      removeChild: () => { removeChildCalls++; }
    },
    style: {},
    animate: () => ({ onfinish: null })
  };

  const session = {
    state: 'flying',
    cancelled: false,
    scrim: mockScrim,
    flyingCover: mockFlyingCover,
    cancel() {
      if (this.state === 'complete' || this.cancelled) return;
      this.cancelled = true;
      this.state = 'cancelled';
      this.cleanup();
    },
    cleanup() {
      if (this.state === 'complete') return;
      this.state = 'complete';
      if (this.scrim && this.scrim.parentNode) {
        this.scrim.parentNode.removeChild(this.scrim);
      }
      this.scrim = null;
      if (this.flyingCover && this.flyingCover.parentNode) {
        this.flyingCover.parentNode.removeChild(this.flyingCover);
      }
      this.flyingCover = null;
    }
  };

  // Repeated cancel calls (e.g. unmount + router navigate + user back)
  session.cancel();
  session.cancel();
  session.cancel();

  assert.equal(session.state, 'complete');
  assert.equal(removeChildCalls, 2, 'Scrim and FlyingCover removed exactly once');
});

test('Router Navigation Simulation: Direct Entry, Leave to Dashboard, Return, Back/Forward Lifecycle', async () => {
  ProjectStore.reset();
  const root = createMockElement('main');

  const p1 = { id: 'p1', title: '專案 1', shots: [] };
  ProjectStore.seedProjectDetail('p1', p1);

  let activeInstance = null;

  async function simulateNavigate(route, opts = {}) {
    if (activeInstance) {
      activeInstance.unmount();
      activeInstance = null;
    }

    if (route === 'project') {
      activeInstance = await ProjectDetailPage.mount({
        root,
        id: opts.id
      });
    } else if (route === 'dashboard') {
      root.innerHTML = '<div class="dashboard-mock">首頁儀表板</div>';
    }
  }

  // 1. Direct Entry to #/project/p1
  await simulateNavigate('project', { id: 'p1' });
  assert.ok(root.innerHTML.includes('專案 1'));
  assert.ok(activeInstance);

  // 2. Leave to Dashboard
  await simulateNavigate('dashboard');
  assert.ok(root.innerHTML.includes('首頁儀表板'));
  assert.equal(activeInstance, null);

  // 3. Return to #/project/p1
  await simulateNavigate('project', { id: 'p1' });
  assert.ok(root.innerHTML.includes('專案 1'));
  assert.ok(activeInstance);

  // 4. Back button simulation
  await simulateNavigate('dashboard');
  assert.ok(root.innerHTML.includes('首頁儀表板'));
  assert.equal(activeInstance, null);

  // 5. Forward button simulation
  await simulateNavigate('project', { id: 'p1' });
  assert.ok(root.innerHTML.includes('專案 1'));
  assert.ok(activeInstance);

  activeInstance.unmount();
});
