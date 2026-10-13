/** Real Chrome + production main.html/iframe entrypoint. APIs/media use local fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.STORYBOARD_PLAYWRIGHT_PATH || 'playwright');
const publicRoot = path.resolve(__dirname, '../public');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const entry = url.pathname === '/' || /^\/(?:template(?:\/[^/]+)?|project\/[^/]+|generate|dashboard)\/?$/.test(url.pathname);
  const file = path.resolve(publicRoot, '.' + (entry ? '/main.html' : url.pathname));
  if (!file.startsWith(publicRoot + path.sep)) return res.writeHead(403).end();
  try { res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  let browser;
  try {
    const source = JSON.parse(await fs.readFile(path.resolve(__dirname, '../analysis/templates/gemini_outputs/GiZBQzIH6zA.json'), 'utf8'));
    const templates = Array.from({ length: 18 }, (_, index) => ({ ...source, id: index ? 'fixture-' + index : source.id, category: index < 12 ? 'story' : 'product', tags: ['探店', index < 12 ? '美食' : '廣告'], thumbnail: '/fixture-cover.svg', name: source.name + (index ? ' ' + index : '') }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const output = path.resolve(__dirname, '../.codex-backup/ui-validation');
    await fs.mkdir(output, { recursive: true });
    browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }].filter(viewport => !process.env.STORYBOARD_QA_WIDTH || String(viewport.width) === process.env.STORYBOARD_QA_WIDTH)) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        localStorage.setItem('spa_auth_token', 'fixture-token');
        window.__playersDestroyed = 0;
        window.YT = { PlayerState: { PLAYING: 1 }, Player: function (id, opts) {
          this.destroy = () => { window.__playersDestroyed++; };
          this.pauseVideo = () => {};
          this.seekTo = value => { window.__seek = value; };
          const iframe = document.createElement('iframe'); iframe.id = id; iframe.title = 'Fixture player';
          document.getElementById(id).replaceWith(iframe);
          window.__playerVideoId = opts.videoId;
        } };
      });
      let requests = 0;
      let catalogMode = 'success';
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/fixture-cover.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#172554"/><circle cx="420" cy="180" r="110" fill="#1e40af"/><path d="M80 260L200 100L320 260" fill="none" stroke="#60a5fa" stroke-width="16"/><text x="36" y="320" fill="white" font-size="24">Local cover fixture</text></svg>' });
        if (!url.pathname.startsWith('/api/')) return route.continue();
        if (url.pathname === '/api/get-templates') {
          requests++;
          if (catalogMode === 'error') return route.fulfill({ status: 503, body: '{}' });
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalogMode === 'empty' ? [] : templates) });
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname === '/api/auth/me' ? { user: { id: 'fixture', name: 'Creator', plan: 'free' } } : { projects: [] }) });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const app = page.frameLocator('#ifm');
      const frame = async () => (await page.locator('#ifm').elementHandle()).contentFrame();
      await page.goto(origin + '/template');
      await app.locator('#template-grid .template-card').first().waitFor();
      await (await frame()).waitForFunction(() => !document.body.classList.contains('is-navigating') && getComputedStyle(document.getElementById('transition-loader-overlay')).opacity === '0');
      await page.screenshot({ path: path.join(output, 'marketplace-' + viewport.width + '.png') });
      const metrics = await (await frame()).evaluate(() => {
        const store = document.getElementById('template-store-view');
        return { overflow: store.scrollWidth > store.clientWidth + 1, scheme: getComputedStyle(document.documentElement).colorScheme,
          cards: Array.from(document.querySelectorAll('#template-grid .template-card')).slice(0, 3).map(el => el.getBoundingClientRect().height) };
      });
      assert.equal(metrics.overflow, false);
      assert.notEqual(metrics.scheme, 'dark');
      assert.ok(Math.max(...metrics.cards) - Math.min(...metrics.cards) < 2);
      assert.equal(await app.locator('#template-result-count').textContent(), '18 個模板');
      assert.equal(await app.locator('#store-clear-filters').isVisible(), false);
      await app.locator('[data-cat-id="story"]').focus();
      await page.keyboard.press('Space');
      await app.locator('#store-search-input').fill('新竹');
      await app.locator('#store-tag-filter').selectOption('探店');
      await app.locator('#store-sort').selectOption('duration');
      assert.equal(await app.locator('#template-grid .template-card').count(), 12);
      await (await frame()).evaluate(() => { window.__catalogGrid = document.getElementById('template-grid'); });
      const link = app.locator('#template-grid .template-card').nth(5).locator('.card-preview-btn');
      await link.scrollIntoViewIfNeeded();
      const savedScroll = await (await frame()).evaluate(() => document.getElementById('template-store-view').scrollTop);
      assert.ok(savedScroll > 0);
      const historyLength = await page.evaluate(() => history.length);
      const id = templates[5].id;
      await link.click();
      await app.locator('#page-main.is-template-detail-mode').waitFor();
      assert.equal(new URL(page.url()).pathname, '/template/' + id);
      assert.equal(await page.evaluate(() => history.length), historyLength + 1);
      await (await frame()).evaluate(id => window.spaNavigate('template', { templateId: id }), id);
      assert.equal(await page.evaluate(() => history.length), historyLength + 1, 'same ID creates no duplicate entry');
      await page.goBack();
      await app.locator('#template-store-view').waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).pathname, '/template');
      assert.equal(await app.locator('#store-search-input').inputValue(), '新竹');
      assert.equal(await app.locator('#store-tag-filter').inputValue(), '探店');
      assert.equal(await app.locator('#store-sort').inputValue(), 'duration');
      assert.ok(Math.abs((await (await frame()).evaluate(() => document.getElementById('template-store-view').scrollTop)) - savedScroll) < 2);
      await page.goForward();
      await app.locator('#template-detail-immersive').waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).pathname, '/template/' + id);
      const priorDestroy = await (await frame()).evaluate(() => window.__playersDestroyed);
      await app.locator('#editor-timeline-zoom').fill('180');
      await (await frame()).evaluate(() => window.spaNavigate('template', { templateId: 'fixture-6' }));
      assert.equal(new URL(page.url()).pathname, '/template/fixture-6');
      assert.equal(await app.locator('#editor-zoom-value').textContent(), '100%');
      assert.ok((await (await frame()).evaluate(() => window.__playersDestroyed)) > priorDestroy);
      assert.ok(await (await frame()).evaluate(() => window.__catalogGrid === document.getElementById('template-grid')));
      assert.equal(requests, 1, 'ID/history changes reuse the catalog');
      await page.goBack();
      await app.locator('#detail-template-title').filter({ hasText: templates[5].name }).waitFor();
      const generateCatalog = page.waitForResponse(response => new URL(response.url()).pathname === '/api/get-templates');
      await app.locator('#btn-apply-template-main').click();
      await app.locator('.generate-workspace').waitFor();
      await generateCatalog;
      const requestsAfterGenerate = requests;
      assert.equal(new URL(page.url()).pathname, '/generate');
      await page.goBack();
      await app.locator('#template-detail-immersive').waitFor({ state: 'visible' });
      assert.equal(new URL(page.url()).pathname, '/template/' + id);
      assert.equal(requests, requestsAfterGenerate, 'returning from Generate reuses its catalog cache');
      const beforeReloadLength = await page.evaluate(() => history.length);
      await page.reload();
      await app.locator('#template-grid, #template-detail-immersive, #template-recovery').first().waitFor({ state: 'attached' });
      try {
        await app.locator('#detail-template-title').filter({ hasText: templates[5].name }).waitFor();
      } catch (error) {
        console.error('Reload diagnostics', page.url(), page.frames().map(frame => frame.url()), await (await frame()).evaluate(() => ({ state: history.state, hash: location.hash, title: document.getElementById('detail-template-title')?.textContent, recovery: document.getElementById('template-recovery')?.textContent })));
        await page.screenshot({ path: path.join(output, 'reload-failure.png') });
        throw error;
      }
      assert.equal(new URL(page.url()).pathname, '/template/' + id);
      assert.equal(requests, requestsAfterGenerate + 1);
      assert.equal(await page.evaluate(() => history.length), beforeReloadLength, 'reload must not append an iframe history entry');
      await (await frame()).waitForFunction(() => !document.body.classList.contains('is-navigating') && getComputedStyle(document.getElementById('transition-loader-overlay')).opacity === '0');
      await page.screenshot({ path: path.join(output, 'marketplace-detail-' + viewport.width + '.png') });
      assert.equal(await page.locator('#ifm').count(), 1);
      assert.equal(await app.locator('#ifm').count(), 0, 'reload must not create a nested app shell');
      assert.ok(await (await frame()).evaluate(() => document.getElementById('page-main').scrollWidth <= document.getElementById('page-main').clientWidth + 1));
      await (await frame()).evaluate(() => window.spaNavigate('template', { templateId: 'missing' }));
      await app.locator('#template-recovery').waitFor({ state: 'visible' });
      assert.ok((await app.locator('#template-recovery').textContent()).includes('找不到這個模板'));
      await page.goBack();
      await app.locator('#template-detail-immersive').waitFor({ state: 'visible' });
      await app.locator('.btn-back-to-store').click();
      await app.locator('#template-store-view').waitFor({ state: 'visible' });
      await app.locator('#store-search-input').fill('沒有符合的結果');
      assert.ok((await app.locator('#template-grid').textContent()).includes('沒有找到符合條件'));
      await app.locator('#store-clear-filters').click();
      assert.equal(await app.locator('#template-grid .template-card').count(), 18);
      // Direct URL with a failing catalog distinguishes network failure from Not Found.
      catalogMode = 'error';
      await page.goto(origin + '/template/' + source.id);
      await app.locator('#template-recovery').waitFor({ state: 'visible' });
      assert.ok((await app.locator('#template-recovery').textContent()).includes('模板載入失敗'));
      catalogMode = 'success';
      await app.locator('#template-recovery [data-catalog-action="retry"]').click();
      await app.locator('#template-detail-immersive').waitFor({ state: 'visible' });
      catalogMode = 'empty';
      await page.goto(origin + '/template');
      await app.locator('#template-grid h3').waitFor();
      assert.ok((await app.locator('#template-grid').textContent()).includes('目前尚無模板'));
      catalogMode = 'success';
      await page.goto(origin + '/#/template/' + source.id);
      await app.locator('#detail-template-title').filter({ hasText: source.name }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/template/' + source.id, 'legacy root hash opens a canonical detail URL');
      assert.deepEqual(errors, []);
      console.log('PASS template history: ' + viewport.width + 'px, production iframe URL, back/forward, cache, scroll/filters, ID cleanup, apply, reload, Not Found/error/retry/empty');
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
