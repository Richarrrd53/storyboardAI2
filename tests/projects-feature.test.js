const test = require('node:test');
const assert = require('node:assert/strict');
const ProjectsFeature = require('../public/js/features/projects');
const { api: ProjectsApi, store: ProjectStore, deleteQueue: ProjectDeleteQueue, actions: ProjectActions } = ProjectsFeature;

test('ProjectStore: stores, filters active/history projects and supports subscriptions', () => {
  ProjectStore.reset();
  const mockProjects = [
    { id: 'p1', title: '專案 1', is_deleted: false },
    { id: 'p2', title: '專案 2', is_deleted: true },
    { id: 'p3', title: '專案 3', is_deleted: false }
  ];

  let notified = 0;
  const unsubscribe = ProjectStore.subscribe((projects, event) => {
    notified++;
  });

  ProjectStore.setProjects(mockProjects);
  assert.equal(ProjectStore.getProjects().length, 3);
  assert.equal(ProjectStore.getActiveProjects().length, 2);
  assert.equal(ProjectStore.getHistoryProjects().length, 1);
  assert.ok(notified > 0);

  unsubscribe();
});

test('ProjectDeleteQueue: optimistic enqueue, undo restoration and status tracking', () => {
  ProjectStore.reset();
  const project = { id: 'p-test', title: '測試分鏡', is_deleted: false };
  ProjectStore.setProjects([project]);

  // Enqueue project for deletion
  let transitioned = false;
  const entry = ProjectDeleteQueue.enqueue(project, {
    transitionDelay: 10,
    onTransition: () => { transitioned = true; }
  });

  assert.equal(ProjectDeleteQueue.isPending('p-test'), true);
  // While pending, getActiveProjects should exclude it
  assert.equal(ProjectStore.getActiveProjects().length, 0);

  // Undo deletion before commit
  let undone = false;
  const undoResult = ProjectDeleteQueue.undo('p-test', {
    onUndo: (p) => { undone = true; }
  });

  assert.equal(undoResult, true);
  assert.equal(ProjectDeleteQueue.isPending('p-test'), false);
  assert.equal(project.is_deleted, false);
  assert.equal(undone, true);
  assert.equal(ProjectStore.getActiveProjects().length, 1);
});

test('ProjectDeleteQueue: flushAll commits pending items without duplicate calls', () => {
  ProjectStore.reset();
  const project1 = { id: 'p-flush-1', title: '待刪除 1', is_deleted: false };
  const project2 = { id: 'p-flush-2', title: '待刪除 2', is_deleted: false };

  ProjectDeleteQueue.enqueue(project1, { delay: 10000 });
  ProjectDeleteQueue.enqueue(project2, { delay: 10000 });

  assert.equal(ProjectDeleteQueue.isPending('p-flush-1'), true);
  assert.equal(ProjectDeleteQueue.isPending('p-flush-2'), true);

  // Simulate navigation flush
  ProjectDeleteQueue.flushAll();

  assert.equal(ProjectDeleteQueue.isPending('p-flush-1'), false);
  assert.equal(ProjectDeleteQueue.isPending('p-flush-2'), false);
  assert.equal(project1.is_deleted, true);
  assert.equal(project2.is_deleted, true);

  // Flush again should be a safe no-op
  ProjectDeleteQueue.flushAll();
});

test('ProjectStore: seedProjectDetail and invalidate detail', () => {
  ProjectStore.reset();
  ProjectStore.seedProjectDetail('p-detail', { id: 'p-detail', title: '詳情分鏡', shots: [] });

  assert.ok(ProjectStore.getProjectDetail('p-detail'));
  assert.equal(ProjectStore.getProjectDetail('p-detail').title, '詳情分鏡');

  ProjectStore.invalidateProjectDetail('p-detail');
  assert.equal(ProjectStore.getProjectDetail('p-detail'), null);
});

test('ProjectActions: rename validation rejects empty titles without modifying project', async () => {
  const project = { id: 'p-ren', title: '原標題' };
  
  // Custom prompt returning empty
  const mockPrompt = () => '   ';
  const oldPrompt = global.prompt;
  global.prompt = mockPrompt;
  
  const result = await ProjectActions.renameProject(project, null, null);
  assert.equal(result, false);
  assert.equal(project.title, '原標題');
  
  global.prompt = oldPrompt;
});

test('ProjectStore: reset clears all caches and timers for clean logout', () => {
  ProjectStore.setProjects([{ id: 'p-logout', title: '登出測試' }]);
  ProjectStore.seedProjectDetail('p-logout', { id: 'p-logout' });
  ProjectDeleteQueue.enqueue({ id: 'p-pending' }, { delay: 10000 });

  ProjectStore.reset();

  assert.equal(ProjectStore.getProjects(), null);
  assert.equal(ProjectStore.getProjectDetail('p-logout'), null);
  assert.equal(ProjectDeleteQueue.isPending('p-pending'), false);
});

test('ProjectStore: in-flight request resolving after reset() must NOT overwrite store or notify', async () => {
  ProjectStore.reset();

  // Mock a slow API request
  const originalFetchProjects = ProjectsApi.fetchProjects;
  const originalFetchDetail = ProjectsApi.fetchProjectDetail;

  let resolveProjects;
  const slowProjectsPromise = new Promise(resolve => {
    resolveProjects = resolve;
  });

  ProjectsApi.fetchProjects = () => slowProjectsPromise;

  // 1. Start fetching projects while authenticated as User A
  const inFlightPromise = ProjectStore.fetchProjects({ force: true });

  // 2. User logs out or resets session before request resolves
  let dataMutationNotified = 0;
  ProjectStore.reset();
  const unsubscribe = ProjectStore.subscribe((projects, event) => {
    if (event && (event.type === 'loaded' || event.type === 'detail_loaded' || event.type === 'set')) {
      dataMutationNotified++;
    }
  });

  assert.equal(ProjectStore.getProjects(), null);

  // 3. Old request resolves after reset
  resolveProjects({
    ok: true,
    status: 200,
    projects: [{ id: 'old-user-project', title: '舊使用者分鏡' }]
  });

  await inFlightPromise;

  // 4. Assert: old response was discarded, store was NOT overwritten, no data notifications fired
  assert.equal(ProjectStore.getProjects(), null);
  assert.equal(dataMutationNotified, 0);

  // 5. Test the same stale guard for fetchProjectDetail
  let resolveDetail;
  const slowDetailPromise = new Promise(resolve => {
    resolveDetail = resolve;
  });
  ProjectsApi.fetchProjectDetail = () => slowDetailPromise;

  const inFlightDetail = ProjectStore.fetchProjectDetail('old-detail-id');
  ProjectStore.reset();

  resolveDetail({
    ok: true,
    status: 200,
    project: { id: 'old-detail-id', title: '舊使用者詳情' }
  });

  await inFlightDetail;
  assert.equal(ProjectStore.getProjectDetail('old-detail-id'), null);
  assert.equal(dataMutationNotified, 0);

  // Restore mocks
  ProjectsApi.fetchProjects = originalFetchProjects;
  ProjectsApi.fetchProjectDetail = originalFetchDetail;
  unsubscribe();
});

test('ProjectStore: normalizes tags from metadata and defaults to empty array', () => {
  ProjectStore.reset();
  const p1 = { id: 'p1', title: '有標籤', metadata: { tags: ['商業廣告', '短影音'] } };
  const p2 = { id: 'p2', title: '無標籤', metadata: null };
  const p3 = { id: 'p3', title: '已有 tags 陣列', tags: ['個人創作'] };

  ProjectStore.setProjects([p1, p2, p3]);
  const list = ProjectStore.getProjects();

  assert.deepEqual(list[0].tags, ['商業廣告', '短影音']);
  assert.deepEqual(list[1].tags, []);
  assert.deepEqual(list[2].tags, ['個人創作']);
});

test('ProjectsApi.updateProjectTags: normalizes tags array and invokes PATCH endpoint', async () => {
  const originalFetch = global.fetch;
  let requestedUrl = '';
  let requestedMethod = '';
  let requestedBody = null;

  global.fetch = async (url, options) => {
    requestedUrl = url;
    requestedMethod = options.method;
    requestedBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: '專案已成功更新', project: { id: 'proj-tag-1', tags: requestedBody.tags } })
    };
  };

  try {
    const result = await ProjectsApi.updateProjectTags('proj-tag-1', [' 商業廣告 ', '短影音', '商業廣告', '']);
    assert.equal(requestedUrl, '/api/projects/proj-tag-1');
    assert.equal(requestedMethod, 'PATCH');
    assert.deepEqual(requestedBody.tags, ['商業廣告', '短影音']);
    assert.equal(result.ok, true);
    assert.deepEqual(result.tags, ['商業廣告', '短影音']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('ProjectActions.updateProjectTags: optimistic update, store notification, and error rollback', async () => {
  ProjectStore.reset();
  const project = { id: 'p-opt', title: '測試分鏡', tags: ['舊標籤'] };
  ProjectStore.setProjects([project]);

  const originalUpdate = ProjectsApi.updateProjectTags;
  let shouldFail = false;
  ProjectsApi.updateProjectTags = async (id, tags) => {
    if (shouldFail) {
      return { ok: false, error: '伺服器網路錯誤' };
    }
    return { ok: true, tags };
  };

  let notifications = [];
  const unsubscribe = ProjectStore.subscribe((projects, event) => {
    notifications.push(event.type);
  });

  try {
    // 1. 成功更新流程
    let refreshed = false;
    const ok = await ProjectActions.updateProjectTags(project, ['商業廣告', '短影音'], () => {
      refreshed = true;
    });

    assert.equal(ok, true);
    assert.equal(refreshed, true);
    assert.deepEqual(project.tags, ['商業廣告', '短影音']);
    assert.deepEqual(project.metadata.tags, ['商業廣告', '短影音']);
    assert.ok(notifications.includes('tags_updated_optimistic'));
    assert.ok(notifications.includes('tags_updated'));

    // 2. 失敗回滾流程
    shouldFail = true;
    notifications = [];
    refreshed = false;
    const failed = await ProjectActions.updateProjectTags(project, ['將要失敗的標籤'], () => {
      refreshed = true;
    });

    assert.equal(failed, false);
    // 應回滾為先前的 ['商業廣告', '短影音']
    assert.deepEqual(project.tags, ['商業廣告', '短影音']);
    assert.deepEqual(project.metadata.tags, ['商業廣告', '短影音']);
    assert.ok(notifications.includes('tags_update_rollback'));
  } finally {
    ProjectsApi.updateProjectTags = originalUpdate;
    unsubscribe();
  }
});

test('ProjectActions.editProjectTags works when invoked as an unbound menu action', async () => {
  const originalModal = global.openProjectTagModal;
  const originalUpdate = ProjectsApi.updateProjectTags;
  let save;
  const project = { id: 'menu-tags', metadata: { generationTaskId: 'keep', tags: ['舊標籤'] } };
  ProjectStore.reset();
  ProjectStore.setProjects([project]);
  global.openProjectTagModal = (p, onSave) => { save = onSave; };
  ProjectsApi.updateProjectTags = async () => ({ ok: true, data: { project: { tags: ['新標籤'], updateAt: '2026-10-13T01:00:00Z' } } });
  try {
    const action = ProjectActions.editProjectTags;
    assert.equal(action(project, null, null), true);
    assert.equal(await save(['新標籤']), true);
    assert.deepEqual(project.tags, ['新標籤']);
    assert.equal(project.metadata.generationTaskId, 'keep');
    assert.equal(project.updateAt, '2026-10-13T01:00:00Z');
  } finally {
    global.openProjectTagModal = originalModal;
    ProjectsApi.updateProjectTags = originalUpdate;
  }
});

test('Tag saves preserve metadata and synchronize detail cache; failures restore legacy metadata', async () => {
  const originalUpdate = ProjectsApi.updateProjectTags;
  ProjectStore.reset();
  const project = { id: 'metadata-tags', title: 'Metadata', metadata: { generationTaskId: 'keep', tags: ['舊標籤'] } };
  const detail = { id: project.id, metadata: { generationTaskId: 'keep', tags: ['舊標籤'] } };
  ProjectStore.setProjects([project]);
  ProjectStore.seedProjectDetail(project.id, detail);
  ProjectsApi.updateProjectTags = async () => ({ ok: true });
  try {
    assert.equal(await ProjectActions.updateProjectTags(project, [' 新標籤 ', '新標籤']), true);
    assert.deepEqual(detail.tags, ['新標籤']);
    assert.deepEqual(detail.metadata, { generationTaskId: 'keep', tags: ['新標籤'] });
    const legacy = { id: 'legacy-tags', metadata: null };
    ProjectsApi.updateProjectTags = async () => ({ ok: false, status: 403 });
    assert.equal(await ProjectActions.updateProjectTags(legacy, ['失敗標籤']), false);
    assert.equal(legacy.metadata, null);
    assert.equal(Object.hasOwn(legacy, 'tags'), false);
    ProjectsApi.updateProjectTags = async () => ({ ok: false, status: 500 });
    assert.equal(await ProjectActions.updateProjectTags(project, []), false);
    assert.deepEqual(project.tags, ['新標籤']);
    assert.deepEqual(detail.tags, ['新標籤']);
    assert.equal(project.metadata.generationTaskId, 'keep');
  } finally {
    ProjectsApi.updateProjectTags = originalUpdate;
  }
});

test('Tag mutation rejects older in-flight list responses and late logout callbacks', async () => {
  ProjectStore.reset();
  const originalFetch = ProjectsApi.fetchProjects;
  const originalUpdate = ProjectsApi.updateProjectTags;
  const project = { id: 'stale-tags', tags: ['舊標籤'] };
  ProjectStore.setProjects([project]);
  let resolveList;
  let resolveSave;
  ProjectsApi.fetchProjects = () => new Promise(resolve => { resolveList = resolve; });
  ProjectsApi.updateProjectTags = async () => ({ ok: true });
  try {
    const loading = ProjectStore.fetchProjects({ force: true });
    await ProjectActions.updateProjectTags(project, ['已儲存']);
    resolveList({ ok: true, projects: [{ id: project.id, tags: ['舊標籤'] }] });
    await loading;
    assert.deepEqual(ProjectStore.getProjects()[0].tags, ['已儲存']);

    ProjectsApi.updateProjectTags = () => new Promise(resolve => { resolveSave = resolve; });
    let refreshCount = 0;
    const saving = ProjectActions.updateProjectTags(project, ['登出中'], () => { refreshCount++; });
    ProjectStore.reset();
    resolveSave({ ok: true });
    assert.equal(await saving, false);
    assert.equal(refreshCount, 1, 'Only optimistic update refreshes; late save must not touch logged-out UI');
    assert.equal(ProjectStore.getProjects(), null);
  } finally {
    ProjectsApi.fetchProjects = originalFetch;
    ProjectsApi.updateProjectTags = originalUpdate;
  }
});

