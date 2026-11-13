const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { server } = require('../analysis/ui-audit/phase1/mock-server.cjs');

test('isolated UI harness has a discoverable entry, dependency loading, safe errors and repeatable API fixtures', async t => {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base, { redirect: 'manual' }); assert.equal(home.status, 302); assert.equal(home.headers.get('location'), '/phase1-harness');
  const health = await fetch(base + '/audit-health').then(r => r.json()); assert.equal(health.isolated, true);
  for (const path of ['/phase1-harness', '/phase2-harness', '/phase1-harness.js', '/phase2-visual', '/js/sys.js', '/js/components/dialog-service.js', '/js/components/overlay-manager.js', '/css/style.css']) {
    const response = await fetch(base + path); assert.equal(response.status, 200, path); assert.match(response.headers.get('cache-control'), /no-store/);
  }
  const bad = await fetch(base + '/phase1-control', { method: 'POST', body: 'invalid' }); assert.equal(bad.status, 400);
  const nullConfig = await fetch(base + '/phase1-control', { method: 'POST', body: 'null' }); assert.equal(nullConfig.status, 400);
  await fetch(base + '/phase1-control', { method: 'POST', body: JSON.stringify({ deleted: true, failRename: true }) });
  let response = await fetch(base + '/api/projects/audit-folder', { method: 'PATCH', body: JSON.stringify({ title: 'renamed' }) }); assert.equal(response.status, 503);
  response = await fetch(base + '/api/projects/audit-folder', { method: 'PATCH', body: JSON.stringify({ title: 'renamed' }) }); assert.equal(response.status, 200);
  response = await fetch(base + '/api/projects/audit-folder/restore', { method: 'POST' }); assert.equal(response.status, 200);
  const { projects } = await fetch(base + '/api/projects').then(r => r.json()); assert.equal(projects[0].is_deleted, false); assert.equal(projects[0].title, 'renamed');
});
