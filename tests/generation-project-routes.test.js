const test = require('node:test');
const assert = require('node:assert/strict');
test('project save retries deduplicate and repaired images retain storyboard fields', async () => {
  Object.assign(process.env, { NODE_ENV: 'production', JWT_SECRET: 'generation-route-fixture', GOOGLE_CLOUD_PROJECT_ID: 'fixture', GOOGLE_APPLICATION_CREDENTIALS: '', GCP_SERVICE_ACCOUNT_BASE64: '' });
  const projects = new Map(), shots = new Map(); let creates = 0;
  const prismaPath = require.resolve('@prisma/client'); require(prismaPath);
  const original = require.cache[prismaPath].exports;
  class FakePrisma {
    constructor() {
      this.project = {
        findUnique: async ({ where }) => projects.get(where.id) || null,
        create: async ({ data }) => {
          creates++; const entries = data.shots.create.map(s => ({ ...s, id: `shot-${creates}-${s.order}`, projectId: data.id }));
          entries.forEach(s => shots.set(s.id, s));
          const project = { ...data, shots: entries }; projects.set(data.id, project); return project;
        },
        update: async ({ where, data }) => Object.assign(projects.get(where.id), data)
      };
      this.shot = { findUnique: async ({ where }) => shots.get(where.id), update: async ({ where, data }) => Object.assign(shots.get(where.id), data) };
    }
  }
  require.cache[prismaPath].exports = { ...original, PrismaClient: FakePrisma };
  const app = require('../server'); const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const jwt = require('jsonwebtoken'); const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, body, author = 'author', method = 'POST') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign({ id: author }, process.env.JWT_SECRET)}` }, body: JSON.stringify(body) });
  try {
    const payload = { title: 'Coffee', metadata: { generationTaskId: 'task' }, shots: [{ order: 1, title: 'Open', payload: { image: 'old', imageStatus: 'failed', note: 'keep' } }] };
    const first = await request('/api/projects', payload); assert.equal(first.status, 200);
    const project = (await first.json()).project;
    const retry = await request('/api/projects', payload); assert.equal(retry.status, 200);
    const reused = await retry.json(); assert.equal(reused.reused, true); assert.equal(reused.project.id, project.id); assert.equal(creates, 1);
    const url = `/api/projects/${project.id}/shots/${project.shots[0].id}`;
    const update = { payloadPatch: { image: 'new', imageStatus: 'succeeded', imageError: null, dialogue: 'Hello', purpose: 'Hook', angle: 'eye level', characters: ['hero'], sourceShot: 1, disallowed: 'ignore' } };
    const rejected = await request(url, update, 'other', 'PATCH'); assert.equal(rejected.status, 403);
    const repair = await request(url, update, 'author', 'PATCH'); assert.equal(repair.status, 200);
    const shot = (await repair.json()).shot; assert.equal(shot.payload.dialogue, 'Hello'); assert.equal(shot.payload.note, 'keep'); assert.equal(shot.payload.imageStatus, 'succeeded'); assert.equal(shot.payload.disallowed, undefined);
    assert.equal(projects.get(project.id).cover, 'new');
    const other = await request('/api/projects', payload, 'other'); assert.equal(other.status, 200); assert.notEqual((await other.json()).project.id, project.id);
  } finally { require.cache[prismaPath].exports = original; await new Promise(resolve => server.close(resolve)); }
});
