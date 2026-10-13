/** Production iframe entry; APIs and media use local fixtures. No backend jobs are created. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.STORYBOARD_PLAYWRIGHT_PATH || 'playwright');
const publicRoot = path.resolve(__dirname, '../public');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const entry = /^\/(?:generate|dashboard)?\/?$/.test(url.pathname);
  const file = path.resolve(publicRoot, '.' + (entry ? '/main.html' : url.pathname));
  if (!file.startsWith(publicRoot + path.sep)) return res.writeHead(403).end();
  try { res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const output = path.resolve(__dirname, '../.codex-backup/ui-validation');
    await fs.mkdir(output, { recursive: true });
    browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }].filter(v => !process.env.STORYBOARD_QA_WIDTH || String(v.width) === process.env.STORYBOARD_QA_WIDTH)) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(() => localStorage.setItem('spa_auth_token', 'fixture-token'));
      let releaseStory, storyRequests = 0;
      const templates = [{ id: 'fixture', name: '一日旅遊紀錄', category: 'story', description: '以開場、探索與收尾安排故事', tags: ['旅行'], thumbnail: '/fixture.svg', structure: [{ duration: '3s', camera: 'wide shot' }, { duration: '4s', camera: 'close-up' }] }];
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/fixture.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#172554"/><circle cx="420" cy="170" r="110" fill="#2563eb"/><path d="M70 280L190 110L310 280" fill="none" stroke="#93c5fd" stroke-width="16"/></svg>' });
        if (url.pathname === '/api/get-templates') return route.fulfill({ json: templates });
        if (url.pathname === '/api/ask-gemini') {
          const body = route.request().postDataJSON();
          if (body.type === 'story') {
            storyRequests++;
            if (storyRequests === 1) await new Promise(resolve => { releaseStory = resolve; });
            return route.fulfill({ json: { response: JSON.stringify({ meta: { title: '城市晨光' }, characters: {}, shots: [
              { story: '晨光中的街道', camera: 'wide shot', duration: '3s', shotPrompt: 'city street in morning light', characters: [] },
              { story: '旅人尋找咖啡店', camera: 'close-up', duration: '4s', shotPrompt: 'traveler at cafe', characters: [] }
            ] }) } });
          }
          return route.fulfill({ json: { image: ['/fixture.svg'] } });
        }
        if (url.pathname.startsWith('/api/')) return route.fulfill({ json: url.pathname === '/api/auth/me' ? { user: { id: 'fixture', name: 'Creator', plan: 'free' } } : { projects: [] } });
        return route.continue();
      });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      const app = page.frameLocator('#ifm');
      const frame = async () => (await page.locator('#ifm').elementHandle()).contentFrame();
      const settled = async () => (await frame()).waitForFunction(() => !document.body.classList.contains('is-navigating') && !document.querySelector('.phase-entering, .phase-leaving'));
      const screenshot = async phase => { await settled(); await page.screenshot({ path: path.join(output, `generate-${phase}-${viewport.width}.png`) }); };
      const noOverflow = async () => {
        const result = await (await frame()).evaluate(() => {
          const wrap = document.querySelector('.spa-gen-wrap');
          return { classes: wrap.className, overflow: wrap.scrollWidth > wrap.clientWidth + 1, active: document.querySelectorAll('.phase-panel.active').length };
        });
        assert.equal(result.classes, 'spa-gen-wrap'); assert.equal(result.overflow, false); assert.equal(result.active, 1);
      };
      await page.goto(origin + '/generate');
      try { await app.locator('#story-input').waitFor(); }
      catch (error) { console.error('Generate entry diagnostics', page.url(), errors, await (await frame()).evaluate(() => ({ html: document.body.innerHTML.slice(-3000), hash: location.hash }))); throw error; }
      await screenshot('idea'); await noOverflow();
      await app.locator('#story-input').fill('旅人探索城市的晨光與咖啡店');
      await (await frame()).evaluate(() => document.getElementById('story-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })));
      assert.equal(await app.locator('#creation-surface').getAttribute('data-phase'), '1', 'IME confirms text without submitting');
      await app.locator('#composer-submit-btn').click();
      await app.locator('#phase-panel-2.active').waitFor(); await screenshot('direction'); await noOverflow();
      const style = app.locator('.style-card').nth(1); await style.focus(); await page.keyboard.press('Space');
      assert.equal(await style.getAttribute('aria-pressed'), 'true');
      await app.locator('.ratio-chip').first().click();
      assert.equal(await app.locator('.ratio-chip').first().getAttribute('aria-pressed'), 'true');
      await app.locator('#btn-direction-next').scrollIntoViewIfNeeded();
      await screenshot('direction-actions'); await app.locator('#btn-direction-next').click();
      await app.locator('#template-cards-container .template-card').waitFor(); await screenshot('template'); await noOverflow();
      const cardText = await app.locator('#template-cards-container').textContent();
      assert.ok(!cardText.includes('已驗證結構') && !cardText.includes('9:16') && !cardText.includes('shorts'));
      await app.locator('.card-apply-btn').focus(); await page.keyboard.press('Space');
      assert.equal(await app.locator('.card-apply-btn').getAttribute('aria-pressed'), 'true');
      await app.locator('#btn-template-confirm').click();
      await (await frame()).waitForFunction(() => window.GenerationTask.getState().status === 'generating');
      await app.locator('.math-loader-group circle').first().waitFor(); await screenshot('progress'); await noOverflow();
      assert.ok(Number(await app.locator('#gen-progress-track').getAttribute('aria-valuenow')) > 0);
      await (await frame()).evaluate(() => { window.__oldMathGroup = document.querySelector('.math-loader-group'); return window.spaNavigate('dashboard'); });
      await app.locator('.generate-workspace').waitFor({ state: 'detached' });
      assert.equal(await (await frame()).evaluate(() => window.__oldMathGroup.querySelectorAll('circle').length), 0, 'unmount removes curve particles');
      await (await frame()).evaluate(() => window.spaNavigate('generate'));
      await app.locator('.math-loader-group circle').first().waitFor();
      assert.equal(storyRequests, 1, 'return resumes the existing task');
      releaseStory();
      await app.locator('#generation-result-wrap').waitFor({ state: 'visible' }); await screenshot('result'); await noOverflow();
      assert.equal(await app.locator('.math-loader-group circle').count(), 0, 'completed task stops loader');
      assert.equal(await app.locator('.shot-card').count(), 2);
      await app.locator('[data-result-view="table"]').click();
      await app.locator('#generated-storyboard-table').waitFor({ state: 'visible' });
      await app.locator('#generation-result-wrap .result-actions .btn-primary').click();
      await app.locator('#phase-panel-1.active').waitFor(); await settled(); await noOverflow();
      assert.equal(await app.locator('#story-input').inputValue(), '');
      assert.deepEqual(errors, []);
      console.log(`Generate ${viewport.width}: 4 phases, keyboard/IME, task resume, loader cleanup, results/reset passed`);
      await context.close();
    }
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
