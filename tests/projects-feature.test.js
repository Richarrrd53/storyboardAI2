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
