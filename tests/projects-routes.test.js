const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

test('Projects Routes: GET, PATCH tags, 401/403 authorization, and duplicate preservation', async () => {
  Object.assign(process.env, {
    NODE_ENV: 'production',
    JWT_SECRET: 'test-projects-routes-fixture',
    GOOGLE_CLOUD_PROJECT_ID: 'fixture',
    GOOGLE_APPLICATION_CREDENTIALS: '',
    GCP_SERVICE_ACCOUNT_BASE64: ''
  });

  const projects = new Map();
  let projectIdSeq = 1;

  const prismaPath = require.resolve('@prisma/client');
  require(prismaPath);
  const original = require.cache[prismaPath].exports;

  class FakePrisma {
    constructor() {
      this.project = {
        findMany: async ({ where }) => {
          const authorId = where.authorId;
          const list = [];
          for (const p of projects.values()) {
            if (p.authorId === authorId) {
              if (where.is_deleted === false && p.is_deleted) continue;
              list.push({
                ...p,
                _count: { shots: (p.shots || []).length }
              });
            }
          }
          return list;
        },
        findUnique: async ({ where }) => {
          return projects.get(where.id) || null;
        },
        create: async ({ data }) => {
          const id = data.id || `proj-${projectIdSeq++}`;
          const shots = (data.shots && data.shots.create) ? data.shots.create.map((s, idx) => ({ ...s, id: `shot-${id}-${idx}` })) : [];
          const project = {
            id,
            ...data,
            shots,
            createAt: new Date(),
            updatedAt: new Date()
          };
          projects.set(id, project);
          return project;
        },
        update: async ({ where, data }) => {
          const current = projects.get(where.id);
          if (!current) throw new Error('Not found');
          const updated = {
            ...current,
            ...data,
            updatedAt: new Date()
          };
          projects.set(where.id, updated);
          return updated;
        }
      };
      this.shot = {
        findUnique: async () => null,
        update: async () => null
      };
    }
  }

  require.cache[prismaPath].exports = { ...original, PrismaClient: FakePrisma };

  // Require server
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const request = (url, body, author = 'user-1', method = 'POST') => {
    const headers = { 'Content-Type': 'application/json' };
    if (author) {
      headers['Authorization'] = `Bearer ${jwt.sign({ id: author }, process.env.JWT_SECRET)}`;
    }
    return fetch(base + url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  };

  try {
    // Seed initial project with metadata and tags
    const p1 = {
      id: 'p1',
      title: 'Commercial Project',
      authorId: 'user-1',
      metadata: { generationTaskId: 'task-123', tags: ['商業廣告', '品牌企劃'] },
      is_deleted: false,
      shots: []
    };
    const p2 = {
      id: 'p2',
      title: 'Legacy Project Without Tags',
      authorId: 'user-1',
      metadata: null,
      is_deleted: false,
      shots: []
    };
    const pOther = {
      id: 'p-other',
      title: 'Other User Project',
      authorId: 'user-2',
      metadata: { tags: ['機密'] },
      is_deleted: false,
      shots: []
    };

    projects.set('p1', p1);
    projects.set('p2', p2);
    projects.set('p-other', pOther);

    // 1. GET /api/projects returns formatted tags and shot counts
    const getRes = await request('/api/projects', undefined, 'user-1', 'GET');
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.ok(Array.isArray(getBody.projects));
    assert.equal(getBody.projects.length, 2);

    const retrievedP1 = getBody.projects.find(p => p.id === 'p1');
    assert.ok(retrievedP1);
    assert.deepEqual(retrievedP1.tags, ['商業廣告', '品牌企劃']);

    const retrievedP2 = getBody.projects.find(p => p.id === 'p2');
    assert.ok(retrievedP2);
    assert.deepEqual(retrievedP2.tags, []); // normalized to empty array

    // 2. PATCH /api/projects/:id - 401 unauthenticated
    const unauthRes = await request('/api/projects/p1', { tags: ['短影音'] }, null, 'PATCH');
    assert.equal(unauthRes.status, 401);

    // 3. PATCH /api/projects/:id - 403 forbidden for wrong author
    const forbidRes = await request('/api/projects/p-other', { tags: ['短影音'] }, 'user-1', 'PATCH');
    assert.equal(forbidRes.status, 403);

    // 4. PATCH /api/projects/:id - 400 validation: tags must be array
    const invalidRes = await request('/api/projects/p1', { tags: 'not-an-array' }, 'user-1', 'PATCH');
    assert.equal(invalidRes.status, 400);

    // 5. PATCH /api/projects/:id - successfully update tags, deduplicates, trims, preserves existing metadata
    const patchRes = await request('/api/projects/p1', { tags: ['  短影音  ', '商業廣告', '短影音', ''] }, 'user-1', 'PATCH');
    assert.equal(patchRes.status, 200);
    const patchBody = await patchRes.json();
    assert.deepEqual(patchBody.project.tags, ['短影音', '商業廣告']);

    // Verify stored metadata retains generationTaskId
    const updatedInDb = projects.get('p1');
    assert.equal(updatedInDb.metadata.generationTaskId, 'task-123');
    assert.deepEqual(updatedInDb.metadata.tags, ['短影音', '商業廣告']);

    // 6. PATCH /api/projects/:id - update tags on legacy project with null metadata
    const patchLegacyRes = await request('/api/projects/p2', { tags: ['個人創作'] }, 'user-1', 'PATCH');
    assert.equal(patchLegacyRes.status, 200);
    const patchLegacyBody = await patchLegacyRes.json();
    assert.deepEqual(patchLegacyBody.project.tags, ['個人創作']);

    // 7. POST /api/projects/:id/duplicate - preserves tags and metadata on cloned project
    const dupRes = await request('/api/projects/p1/duplicate', {}, 'user-1', 'POST');
    assert.equal(dupRes.status, 200);
    const dupBody = await dupRes.json();
    assert.equal(dupBody.project.title, 'Commercial Project (副本)');
    assert.deepEqual(dupBody.project.tags, ['短影音', '商業廣告']);
  } finally {
    require.cache[prismaPath].exports = original;
    await new Promise(resolve => server.close(resolve));
  }
});
