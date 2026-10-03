/**
 * Real Chrome DOM/SPA integration with local deterministic API fixtures.
 * Run: node tests/generation-browser.js
 * Set STORYBOARD_PLAYWRIGHT_PATH to a bundled Playwright package when not installed locally.
 * Set STORYBOARD_CHROME_PATH if Chrome is installed elsewhere.
 * Set STORYBOARD_BROWSER_MOBILE=1 for the touch/mobile regression matrix.
 * No production server, credentials, database, or live generation API is used.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.STORYBOARD_PLAYWRIGHT_PATH || 'playwright');
const publicRoot = path.resolve(__dirname, '../public');
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const storyboard = { meta: { title: 'Browser journey' }, characters: {}, shots: [1, 2].map(id => ({ id, story: `Scene ${id}`, camera: 'wide', duration: '3s', shotPrompt: `scene ${id}` })) };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer(async (request, res) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(publicRoot, pathname === '/' ? 'html/index.html' : '.' + pathname);
  if (!file.startsWith(publicRoot + path.sep)) { res.writeHead(403).end(); return; }
  try { const data = await fs.readFile(file); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data); }
  catch { res.writeHead(404).end(); }
});
async function until(predicate, label) {
  for (let i = 0; i < 400; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 25)); }
  throw new Error(`Timeout: ${label}`);
}
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const mobile = process.env.STORYBOARD_BROWSER_MOBILE === '1';
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 960 }, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce' });
    console.log('RUN:', mobile ? 'touch mobile' : 'desktop');
    await context.addInitScript(() => localStorage.setItem('spa_auth_token', 'fixture-token'));
    const held = [], calls = [], saved = [], errors = [];
    let failStory = false;
    let invalidateAuth = false;
    let holdTemplates = false;
    const templateRequests = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { await route.abort(); return; }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
      calls.push({ path: url.pathname, body });
      const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.pathname === '/api/auth/me' && invalidateAuth) return fulfill({ error: 'expired' }, 401);
      if (url.pathname === '/api/auth/me') return fulfill({ user: { id: 'fixture-user', name: 'Creator', email: 'fixture@example.test', plan: 'free' } });
      if (url.pathname === '/api/auth/logout') return fulfill({ ok: true });
      if (url.pathname === '/api/projects') {
        if (body) { saved.push(body); return fulfill({ project: { id: 'browser-project' } }); }
        return fulfill({ projects: [] });
      }
      if (url.pathname === '/api/get-templates' && holdTemplates) { templateRequests.push(route); return; }
      if (url.pathname === '/api/get-templates') return fulfill([{ id: 'browser-template', name: 'Browser template', category: 'story', description: 'Fixture', structure: [{ action: 'Open', camera: 'close' }] }]);
      if (url.pathname === '/api/ask-gemini') {
        if (body.type === 'story') return failStory ? fulfill({ error: 'fixture error' }, 503) : fulfill({ response: JSON.stringify(storyboard) });
        held.push(route); return;
      }
      return fulfill({});
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    const press = selector => mobile ? page.locator(selector).tap() : page.locator(selector).click();
    const phase = n => page.waitForFunction(n => document.getElementById('creation-surface')?.dataset.phase === String(n), n);
    const taskStatus = status => page.waitForFunction(status => window.GenerationTask?.getState().status === status, status);
    const navigate = async target => { await page.evaluate(target => window.spaNavigate(target), target); };
    const release = async () => { const route = held.shift(); assert.ok(route, 'expected pending image request'); await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ image: [image] }) }).catch(() => {}); };
    const startFree = async story => {
      await phase(1); await page.locator('#story-input').fill(story); await page.locator('#composer-submit-btn').click();
      await phase(2); await page.locator('#btn-direction-next').click(); await phase(3);
      await page.locator('#btn-skip-template').click(); await phase(4);
      await until(() => held.length === 1, 'first image request');
    };

    // First-ever SPA entry must load the page code before mount and bind actual listeners.
    await page.goto(origin + '/#/generate'); await phase(1);
    assert.equal(await page.evaluate(() => GenerationTask.getState().status), 'idle');
    const controller = await page.evaluate(() => { window.__creationIdentity = CreationController; return true; }); assert.ok(controller);
    await startFree('Real DOM journey');
    const taskId = await page.evaluate(() => GenerationTask.getState().taskId);
    await page.evaluate(() => { window.__oldStoryInput = document.getElementById('story-input'); });
    await navigate('dashboard');
    assert.equal(await page.locator('#creation-surface').count(), 0);
    assert.equal(await page.evaluate(() => GenerationTask.getState().status), 'generating');
    await page.evaluate(() => { __oldStoryInput.value = 'detached draft'; __oldStoryInput.dispatchEvent(new Event('input')); });
    await page.evaluate(() => { clearSpaCache(); QuickCompose.destroy(); QuickCompose.mount(); QuickCompose.mount(); });
    assert.equal(await page.evaluate(() => GenerationTask.getState().taskId), taskId);
    assert.equal(await page.evaluate(() => CreationSessionStore.story), 'Real DOM journey');
    assert.notEqual(await page.evaluate(() => CreationSessionStore.draft.story), 'detached draft');
    await release(); await until(() => held.length === 1, 'second image while page is absent');
    assert.ok(await page.evaluate(() => GenerationTask.getState().progress.pct > 50));
    await page.goBack(); await phase(4);
    assert.equal(await page.evaluate(() => GenerationTask.getState().taskId), taskId);
    await page.goForward();
    await page.waitForFunction(() => !document.getElementById('creation-surface'));
    assert.equal(await page.evaluate(() => GenerationTask.getState().status), 'generating');
    await navigate('generate'); await phase(4);
    assert.equal(await page.evaluate(() => GenerationTask.getState().taskId), taskId);
    assert.equal(await page.evaluate(() => CreationController === __creationIdentity), true, 'route must not re-execute creation module');
    assert.equal(await page.locator('#gen-status-pct').textContent(), '71%');
    assert.equal(calls.filter(c => c.body?.type === 'story').length, 1);
    await release(); await taskStatus('completed');
    await page.locator('#generation-result-wrap').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#storyboard-grid .shot-card').count(), 2);
    assert.equal(await page.evaluate(() => GenerationTask.getState().projectId), 'browser-project');
    assert.equal(await page.evaluate(() => CreationSessionStore.story), 'Real DOM journey', 'save invalidation must preserve creation session');
    assert.equal(saved[0].metadata.originalStory, 'Real DOM journey');
    await navigate('dashboard'); await navigate('generate'); await phase(4);
    assert.equal(await page.locator('#storyboard-grid .shot-card').count(), 2);
    assert.equal(calls.filter(c => c.body?.type === 'story').length, 1);
    await page.locator('.result-actions button').last().click(); await phase(1); await taskStatus('idle');
    assert.equal(await page.locator('#story-input').inputValue(), '');
    assert.equal(await page.locator('#creation-surface [onclick], #creation-surface [oninput]').count(), 0, 'mounted page must not retain duplicate inline handlers');
    console.log('PASS: first SPA entry, start, leave, cache invalidation, QC destroy/remount, Back/Forward, off-page progress, return, completed restore, reset, listener cleanup');

    // Error keeps original phase/error behavior; UI retry and cancel use current mounted listeners.
    failStory = true;
    await page.locator('#story-input').fill('Failure and retry'); await page.locator('#story-input').press('Enter'); await phase(2);
    await page.locator('#btn-direction-next').click(); await phase(3); await page.locator('#btn-skip-template').click();
    await taskStatus('error'); await phase(2);
    await page.locator('.sys-btn').click();
    failStory = false;
    await page.locator('#btn-direction-next').click(); await phase(3); await page.locator('#btn-skip-template').click(); await phase(4);
    await until(() => held.length === 1, 'retry image');
    await page.locator('#btn-abort-generation').click(); await taskStatus('cancelled'); await phase(2);
    await release(); await page.evaluate(() => resetCreationWorkflow()); await phase(1);
    console.log('PASS: error presentation, retry via existing phase flow, actual cancel listener');

    // Mount twice on identical DOM, then unmount old instance: new handlers stay alive.
    await page.evaluate(() => { const old = initGeneratePage(); window.__currentMount = initGeneratePage(); old.unmount(); });
    await page.locator('#story-input').fill('Remounted'); await page.locator('#composer-submit-btn').click(); await phase(2);
    await page.evaluate(() => resetCreationWorkflow());
    await navigate('dashboard');
    await page.evaluate(() => {
      const oldCapsule = document.getElementById('global-create-capsule');
      QuickCompose.destroy(); oldCapsule.dispatchEvent(new MouseEvent('click')); // Isolate QC's listener from the live parent mobile-nav handler.
      if (QuickCompose.state !== 'closed') throw new Error('destroy left an active capsule listener');
      QuickCompose.mount(); QuickCompose.mount();
    });
    await press('#global-create-capsule');
    await page.locator('#qc-story-input').fill('Draft to reset');
    assert.equal(await page.evaluate(() => CreationController.getState().surfaceState), 'quick-compose');
    await page.evaluate(() => CreationController.reset());
    assert.equal(await page.locator('#qc-story-input').inputValue(), '');
    assert.equal(await page.locator('#qc-send-btn').isDisabled(), true);
    assert.equal(await page.evaluate(() => QuickCompose.state), 'closed');
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('ai-quick-compose-locked')), false);
    await press('#global-create-capsule');
    await page.locator('#qc-story-input').waitFor({ state: 'visible' });
    await page.waitForFunction(() => Date.now() - QuickCompose.lastOpenTime >= 300);
    await press('#qc-close-btn');
    await page.waitForFunction(() => QuickCompose.state === 'closed');
    await press('#global-create-capsule');
    await page.locator('#qc-story-input').fill('QuickCompose real handoff'); await press('#qc-send-btn'); await phase(2);
    assert.equal(await page.evaluate(() => CreationSessionStore.story), 'QuickCompose real handoff');
    assert.equal(await page.evaluate(() => CreationController === __creationIdentity), true);
    console.log('PASS: same-DOM remount, QC UI reset, destroy/remount, Capsule/Close/Send and session handoff');

    // Logout must stop task before waiting for auth response or leaving the route.
    await page.locator('#btn-direction-next').click(); await phase(3); await page.locator('#btn-skip-template').click(); await phase(4);
    await until(() => held.length === 1, 'logout image');
    const saveCount = saved.length;
    await page.evaluate(() => spaAuth.logout()); await taskStatus('idle');
    assert.equal(await page.evaluate(() => CreationSessionStore.story), '');
    assert.equal(await page.evaluate(() => localStorage.getItem('spa_auth_token')), null);
    await release(); assert.equal(saved.length, saveCount);
    console.log('PASS: logout cleans up task/session and suppresses late save');

    // Standalone Generate HTML uses the authoritative session and task as well.
    const standalone = await context.newPage();
    standalone.on('pageerror', error => errors.push(error.message));
    await standalone.goto(origin + '/html/generate.html');
    await standalone.waitForFunction(() => document.getElementById('creation-surface')?.dataset.phase === '1');
    await standalone.locator('#story-input').fill('Standalone draft'); await standalone.locator('#story-input').press('Enter');
    await standalone.waitForFunction(() => CreationSessionStore.currentPhase === 2);
    assert.equal(await standalone.evaluate(() => GenerationTask.getState().status), 'idle');
    assert.equal(await standalone.evaluate(() => typeof CreationSessionStore.reset), 'function');
    console.log('PASS: direct standalone Generate entry and real Enter handler');

    // Normal-motion transitions must not finish against a replaced route DOM.
    const normal = await context.newPage();
    normal.on('pageerror', error => errors.push(error.message));
    await normal.emulateMedia({ reducedMotion: 'no-preference' });
    await normal.goto(origin + '/#/generate');
    await normal.waitForFunction(() => document.getElementById('creation-surface')?.dataset.phase === '1');
    await normal.locator('#story-input').fill('Interrupted transition');
    await normal.locator('#composer-submit-btn').click();
    await normal.evaluate(() => spaNavigate('dashboard'));
    await normal.evaluate(() => spaNavigate('generate'));
    await normal.waitForFunction(() => document.getElementById('creation-surface')?.dataset.phase === '1');
    // Drive the same DOM after the old 220ms/360ms transition would have fired.
    await normal.locator('#composer-submit-btn').click();
    await normal.waitForFunction(() => document.getElementById('phase-panel-2')?.classList.contains('active') && !document.querySelector('.phase-entering,.phase-leaving'));
    await normal.evaluate(() => { window.__oldStyleCard = document.querySelector('.style-card[data-index="1"]'); });
    holdTemplates = true;
    await normal.locator('#btn-direction-next').click();
    await until(() => templateRequests.length === 1, 'page-only template fetch');
    let templateAborted = false;
    normal.on('requestfailed', request => { if (request.url().includes('/api/get-templates')) templateAborted = true; });
    const styleIndex = await normal.evaluate(() => CreationSessionStore.styleIndex);
    await normal.evaluate(() => spaNavigate('dashboard'));
    await until(() => templateAborted, 'unmount aborts page-only template request');
    await normal.evaluate(() => __oldStyleCard.dispatchEvent(new MouseEvent('click')));
    assert.equal(await normal.evaluate(() => CreationSessionStore.styleIndex), styleIndex, 'detached dynamic card handler must be removed');
    await templateRequests.shift().fulfill({ contentType: 'application/json', body: '[]' }).catch(() => {});
    holdTemplates = false;
    await normal.evaluate(() => spaNavigate('generate'));
    await normal.waitForFunction(() => document.getElementById('creation-surface')?.dataset.phase === '1');
    await normal.locator('#composer-submit-btn').click();
    await normal.waitForFunction(() => document.getElementById('phase-panel-2')?.classList.contains('active') && !document.querySelector('.phase-entering,.phase-leaving'));
    await normal.locator('#btn-direction-next').click();
    await normal.waitForFunction(() => document.getElementById('phase-panel-3')?.classList.contains('active') && !document.querySelector('.phase-entering,.phase-leaving'));
    await normal.locator('#tpl-card-browser-template').click();
    await normal.evaluate(() => { window.__resets = 0; const original = GenerationTask.reset; GenerationTask.reset = () => { __resets++; return original(); }; });
    await normal.locator('#btn-template-confirm').click();
    assert.equal(await normal.evaluate(() => __resets), 1, 'one click must run one handler');
    await until(() => held.length === 1, 'normal-motion template generation');
    await release();
    await normal.waitForFunction(() => GenerationTask.getState().status === 'completed');
    assert.equal(await normal.locator('#storyboard-grid .shot-card').count(), 1);
    assert.equal(await normal.evaluate(() => GenerationTask.getState().input.selectedTemplate.id), 'browser-template');
    console.log('PASS: normal-motion interrupted transition, template fetch cancellation, dynamic listener cleanup, template phase flow');

    // A reset must invalidate both pending handoff RAFs and late navigation completion.
    await normal.evaluate(() => spaNavigate('dashboard'));
    await normal.evaluate(async () => {
      let finish;
      const pending = CreationController.submitFromQuickCompose('Stale handoff', { navigate: () => new Promise(resolve => { finish = resolve; }) });
      CreationController.reset(); finish();
      if (await pending !== false) throw new Error('reset did not cancel pending handoff');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (document.getElementById('qc-transition-proxy') || document.body.classList.contains('ai-quick-compose-closing')) throw new Error('stale RAF mutated reset UI');
      if (CreationSessionStore.story || QuickCompose.state !== 'closed') throw new Error('handoff revived reset state');
    });
    // Expired auth has the same one-reset contract as explicit logout.
    await normal.evaluate(input => { GenerationTask.start(input); }, { story: 'Auth expiry', style: { name: '預設風格', prompt: 'natural light' }, ratio: '橫向16:9', selectedTemplate: null }).catch(() => {});
    await until(() => held.length === 1, 'auth expiry image');
    const beforeExpiry = saved.length;
    await normal.evaluate(() => { window.__idleNotifications = 0; window.__leave = GenerationTask.subscribe(state => { if (state.status === 'idle') __idleNotifications++; }); });
    invalidateAuth = true;
    const auth = await normal.evaluate(() => spaAuth.fetchUser());
    assert.equal(auth.valid, false); assert.equal(await normal.evaluate(() => GenerationTask.getState().status), 'idle');
    assert.equal(await normal.evaluate(() => __idleNotifications), 1, 'auth boundary should not double-reset task');
    assert.equal(await normal.evaluate(() => CreationSessionStore.story), '');
    assert.equal(await normal.evaluate(() => QuickCompose.state), 'closed');
    await normal.evaluate(() => __leave()); await release(); assert.equal(saved.length, beforeExpiry);
    console.log('PASS: reset invalidates pending handoff/RAF; auth expiry resets task/session/UI exactly once');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    console.log('PASS: no uncaught browser errors; all API calls used local fixtures');
  } finally {
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
