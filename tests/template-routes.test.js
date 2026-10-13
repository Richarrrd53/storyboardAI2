const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Execute the router's pure helpers. Full navigation is exercised by the browser test.
const source = fs.readFileSync(require.resolve('../public/js/spa-router.js'), 'utf8');
const start = source.indexOf('  function getHashForPage(');
const end = source.indexOf('  function expandSidebar(', start);
const context = vm.createContext({ URLSearchParams, window: { location: { pathname: '/', search: '' } }, pageDefs: Object.fromEntries(['landing', 'template', 'project', 'generate', 'dashboard', 'projects', 'history', 'discovery'].map(page => [page, {}])) });
vm.runInContext(source.slice(start, end), context);
const plain = value => JSON.parse(JSON.stringify(value));

test('template pathname and legacy hash deep links restore the canonical ID', () => {
  for (const location of [
    { pathname: '/template/GiZBQzIH6zA', hash: '' },
    { pathname: '/html/index.html', hash: '#/template/GiZBQzIH6zA' },
    { pathname: '/', hash: '#/template?templateId=GiZBQzIH6zA' }
  ]) assert.deepEqual(plain(context.parseRouteFromLocation(location)), { page: 'template', opts: { templateId: 'GiZBQzIH6zA' } });
  assert.equal(context.getRouteUrl('template', { templateId: 'ID with 空白' }), '/template/ID%20with%20%E7%A9%BA%E7%99%BD');
  assert.equal(context.getRouteUrl('template'), '/template');
});

test('history serializes template ID and browse state rather than only the page', () => {
  const browse = { category: 'story', query: '美食', tag: '探店', sort: 'name', scrollTop: 512 };
  const state = plain(context.routeHistoryState('template', { templateId: 'second', templateFromBrowse: true }, browse));
  assert.equal(state.templateId, 'second');
  assert.deepEqual(state.templateBrowse, browse);
  assert.equal(state.templateFromBrowse, true);
  assert.equal(context.routeHistoryState('generate', { templateId: 'second' }).templateId, 'second');
});

test('project routes and generate template selection retain their existing behavior', () => {
  for (const location of [{ pathname: '/project/abc', hash: '' }, { pathname: '/', hash: '#/project/abc' }]) {
    assert.deepEqual(plain(context.parseRouteFromLocation(location)), { page: 'project', opts: { id: 'abc' } });
  }
  context.window.location.pathname = '/template/old';
  assert.equal(context.getRouteUrl('generate', { templateId: 'abc' }), '/#/generate?templateId=abc');
  assert.equal(context.getRouteUrl('project', { id: 'abc' }), '/#/project/abc');
});

test('malformed template encodings recover without crashing router initialization', () => {
  assert.equal(context.parseRouteFromLocation({ pathname: '/template/%E0%A4%A', hash: '' }).page, 'template');
});

test('embedded navigation uses the parent URL while leaving the iframe document untouched', () => {
  context.window.location.pathname = '/html/index.html';
  context.window.parent = {};
  assert.equal(context.getRouteUrl('template', { templateId: 'abc' }), '/template/abc');
  assert.equal(context.getRouteUrl('generate', { templateId: 'abc' }), '/generate?templateId=abc');
  assert.equal(context.window.location.pathname, '/html/index.html');
  delete context.window.parent;
});

test('production and development entrypoints both serve template deep links', () => {
  const config = JSON.parse(fs.readFileSync(require.resolve('../vercel.json'), 'utf8'));
  assert.equal(config.rewrites.find(rule => rule.source === '/(.*)').destination, '/main.html');
  assert.match(fs.readFileSync(require.resolve('../server.js'), 'utf8'), /'\/template\/:id'/);
});
