const test = require('node:test');
const assert = require('node:assert/strict');
const ProjectsFeature = require('../public/js/features/projects');
const MotionCoordinator = require('../public/js/components/motion-coordinator');

const { store: ProjectStore, api: ProjectsApi, diffProjectDetail, diffProjectList } = ProjectsFeature;

test('ProjectStore: scoped subscriptions isolate detail prefetches from list subscribers', async () => {
  ProjectStore.reset();
  const origFetchDetail = ProjectsApi.fetchProjectDetail;
  ProjectsApi.fetchProjectDetail = async (id) => ({
    ok: true,
    status: 200,
    project: { id, title: `Project ${id}`, shots: [{ id: `${id}-s1`, order: 1, title: 'Shot 1' }] }
  });

  let listEvents = [];
  let detailEvents = [];
  const unsubList = ProjectStore.subscribe((_, ev) => listEvents.push(ev), { scopes: ['list', 'session'], ignorePrefetch: true });
  const unsubDetail = ProjectStore.subscribe((_, ev) => detailEvents.push(ev), { scopes: ['detail'], projectId: 'p-1' });

  try {
    await ProjectStore.fetchProjectDetail('p-1', { prefetch: true, source: 'prefetch' });
    assert.equal(listEvents.length, 0, 'List subscriber must NOT fire on detail prefetch');
    assert.equal(detailEvents.length, 1);
    assert.equal(detailEvents[0].type, 'detail_prefetched');
    assert.equal(detailEvents[0].scope, 'detail');
    assert.equal(detailEvents[0].project.id, 'p-1');

    // Detail prefetch for another project must NOT notify p-1 subscriber
    await ProjectStore.fetchProjectDetail('p-2', { prefetch: true, source: 'prefetch' });
    assert.equal(detailEvents.length, 1);
  } finally {
    unsubList();
    unsubDetail();
    ProjectsApi.fetchProjectDetail = origFetchDetail;
  }
});

test('ProjectStore: identical SWR fetchProjectDetail sets changed=false without redundant diff', async () => {
  ProjectStore.reset();
  const origFetchDetail = ProjectsApi.fetchProjectDetail;
  const payload = {
    id: 'p-swr',
    title: 'Stable Title',
    ratio: '16:9',
    style: 'cinematic',
    updatedAt: '2026-11-26T00:00:00Z',
    shots: [
      { id: 's1', order: 1, title: 'S1', camera: '中景', duration: '3s', payload: { image: '/img/1.png', emotion: '平靜' } }
    ]
  };
  ProjectsApi.fetchProjectDetail = async () => ({ ok: true, status: 200, project: JSON.parse(JSON.stringify(payload)) });

  const events = [];
  const unsub = ProjectStore.subscribe((_, ev) => events.push(ev), { scopes: ['detail'], projectId: 'p-swr' });

  try {
    await ProjectStore.fetchProjectDetail('p-swr');
    assert.equal(events.length, 1);
    assert.equal(events[0].changed, true);

    // Force SWR with identical data
    await ProjectStore.fetchProjectDetail('p-swr', { force: true, source: 'swr' });
    assert.equal(events.length, 2);
    assert.equal(events[1].changed, false);
    assert.equal(events[1].source, 'swr');
  } finally {
    unsub();
    ProjectsApi.fetchProjectDetail = origFetchDetail;
  }
});

test('ProjectStore: bounded LRU cache evicts oldest unpinned entries and protects pinned entries', () => {
  ProjectStore.reset();
  const prevMax = ProjectStore.detailCacheMaxEntries;
  ProjectStore.detailCacheMaxEntries = 3;

  try {
    ProjectStore.seedProjectDetail('p1', { id: 'p1', title: 'P1', shots: [] });
    const unpinP1 = ProjectStore.pinProjectDetail('p1');
    ProjectStore.seedProjectDetail('p2', { id: 'p2', title: 'P2', shots: [] });
    ProjectStore.seedProjectDetail('p3', { id: 'p3', title: 'P3', shots: [] });

    // Adding p4 should evict p2 (oldest unpinned), NOT p1 (pinned!)
    ProjectStore.seedProjectDetail('p4', { id: 'p4', title: 'P4', shots: [] });
    assert.ok(ProjectStore.getProjectDetail('p1'), 'Pinned project p1 must NOT be evicted');
    assert.equal(ProjectStore.getProjectDetail('p2'), null, 'Oldest unpinned project p2 should be evicted');
    assert.ok(ProjectStore.getProjectDetail('p3'));
    assert.ok(ProjectStore.getProjectDetail('p4'));

    const stats = ProjectStore.getCacheStats();
    assert.equal(stats.detailCount, 3);
    assert.ok(stats.pinnedIds.includes('p1'));

    unpinP1();
    assert.equal(ProjectStore.isDetailPinned('p1'), false);
  } finally {
    ProjectStore.detailCacheMaxEntries = prevMax;
  }
});

test('diffProjectDetail & diffProjectList accurately detect field-level and shot-level changes', () => {
  const base = {
    id: 'p1',
    title: 'Original',
    ratio: '16:9',
    shots: [
      { id: 's1', order: 1, title: 'One', camera: 'Wide', duration: '3s', payload: { image: '/1.png' } },
      { id: 's2', order: 2, title: 'Two', camera: 'Close', duration: '2s', payload: { image: '/2.png' } }
    ]
  };
  const identical = JSON.parse(JSON.stringify(base));
  assert.equal(diffProjectDetail(base, identical).changed, false);

  const modified = JSON.parse(JSON.stringify(base));
  modified.shots[1].title = 'Two Updated';
  modified.shots.push({ id: 's3', order: 3, title: 'Three', camera: 'Medium', duration: '4s', payload: {} });
  const d = diffProjectDetail(base, modified);
  assert.equal(d.changed, true);
  assert.equal(d.headerChanged, false);
  assert.equal(d.shotsChanged, true);
  assert.deepEqual(d.updatedShotIds, ['s2']);
  assert.deepEqual(d.addedShotIds, ['s3']);
  assert.deepEqual(d.removedShotIds, []);

  const listA = [{ id: '1', title: 'A', tags: ['x'] }, { id: '2', title: 'B', tags: [] }];
  const listB = [{ id: '1', title: 'A', tags: ['x'] }, { id: '2', title: 'B2', tags: [] }];
  const ld = diffProjectList(listA, listB);
  assert.equal(ld.changed, true);
  assert.deepEqual(ld.updatedIds, ['2']);
  assert.deepEqual(ld.addedIds, []);
  assert.deepEqual(ld.removedIds, []);
});

test('MotionCoordinator: deferDuringMotion coalesces by key and flushes after motion ends', async () => {
  let runs = [];
  const handle = MotionCoordinator.begin('morph');
  MotionCoordinator.deferDuringMotion('bg-sync', () => runs.push('first'));
  MotionCoordinator.deferDuringMotion('bg-sync', () => runs.push('latest'));
  assert.equal(runs.length, 0, 'Work must stay deferred while motion is active');
  assert.equal(MotionCoordinator.getDeferredCount(), 1, 'Duplicate keys must coalesce');

  handle.end();
  await new Promise(r => setTimeout(r, 40));
  assert.deepEqual(runs, ['latest'], 'Only latest coalesced task should run after motion ends');
});
