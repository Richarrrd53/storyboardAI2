// End-to-end template adaptation uses local fixtures, never paid AI or a live database.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.STORYBOARD_PLAYWRIGHT_PATH || 'playwright');
const publicRoot = path.resolve(__dirname, '../public');
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const template = { id: 'fixture-template', name: '咖啡品牌模板', category: 'product', description: '品牌故事', variables: [{ name: 'product', label: '商品名稱' }], promptTemplate: { base: 'Feature {product}' }, structure: [{ action: '原商品開場', camera: 'close', duration: '1.5s', purpose: '吸引注意' }, { action: '產品展示', camera: 'wide', duration: '2s', purpose: '產品優勢' }] };
const storyboard = { meta: { title: '新咖啡企劃' }, characters: {}, shots: [1, 2].map(id => ({ story: `全新咖啡畫面 ${id}`, shotPrompt: `coffee scene ${id}`, dialogue: `新企劃旁白 ${id}`, emotion: '期待' })) };
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(publicRoot, pathname === '/' ? 'html/index.html' : '.' + pathname);
  if (!file.startsWith(publicRoot + path.sep)) return res.writeHead(403).end();
  try { const data = await fs.readFile(file); const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }; res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` }).end(data); } catch { res.writeHead(404).end(); }
});
(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    const mobile = process.env.STORYBOARD_BROWSER_MOBILE === '1';
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1366, height: 960 }, hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('spa_auth_token', 'fixture-token'));
    const calls = [], errors = []; let images = 0, saves = 0;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const body = route.request().postDataJSON(); calls.push({ path: url.pathname, body });
      const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.pathname === '/api/auth/me') return reply({ user: { id: 'user', name: 'Creator', plan: 'free' } });
      if (url.pathname === '/api/get-templates') return reply([template]);
      if (url.pathname === '/api/ask-gemini') {
        if (body.type === 'story') return reply({ response: JSON.stringify(storyboard) });
        return ++images === 1 ? reply({ error: '圖片暫時失敗' }, 503) : reply({ image: [image] });
      }
      if (url.pathname === '/api/projects') {
        if (!body) return reply({ projects: [] });
        if (++saves === 1) return reply({ error: '儲存暫時失敗' }, 503);
        return reply({ project: { id: 'project', shots: body.shots.map(s => ({ id: `shot-${s.order}`, order: s.order })) } });
      }
      return reply({});
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/#/generate');
    await page.waitForFunction(() => window.initGeneratePage && window.spaNavigate);
    await page.evaluate(() => spaNavigate('generate', { templateId: 'fixture-template' }));
    await page.waitForFunction(() => CreationSessionStore.selectedTemplate?.id === 'fixture-template');
    assert.match(await page.locator('#template-entry-title').textContent(), /咖啡品牌模板/);
    await page.locator('#story-input').fill('為新咖啡品牌製作廣告');
    await page.locator('#composer-submit-btn').click();
    // The outer workspace owns scrolling; the direction panel grows with content.
    await page.setViewportSize({ width: mobile ? 390 : 1366, height: 600 });
    const panel = page.locator('#phase-panel-2');
    const scroller = page.locator('#page-content.spa-gen-wrap');
    assert.equal(await panel.evaluate(el => el.scrollHeight > el.clientHeight + 2), false);
    assert.equal(await scroller.evaluate(el => el.scrollHeight > el.clientHeight), true);
    await scroller.evaluate(el => { el.scrollTop = 0; });
    await page.locator('.direction-header').scrollIntoViewIfNeeded();
    const header = await page.locator('.direction-header').boundingBox();
    const x = header.x + header.width - 25, y = header.y + Math.min(20, header.height / 2);
    if (mobile) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 15 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.getElementById('page-content').scrollTop > 0);
      await cdp.detach();
    } else {
      await page.mouse.move(x, y); await page.mouse.wheel(0, 300);
      await page.waitForFunction(() => document.getElementById('page-content').scrollTop > 0);
    }
    await page.locator('#btn-direction-next').scrollIntoViewIfNeeded();
    const next = await page.locator('#btn-direction-next').boundingBox();
    assert.ok(next.y >= 0 && next.y + next.height <= 600, 'confirm button stays accessible in short viewport');
    console.log('PASS: native workspace scrolling; direction has no nested scroller');
    await page.locator('#btn-direction-next').click();
    await page.setViewportSize({ width: mobile ? 390 : 1366, height: 960 });
    await page.locator('[data-template-variable="product"]').fill('晨光咖啡');
    await page.locator('#btn-template-confirm').click();
    await page.waitForFunction(() => GenerationTask.getState().status === 'completed');
    const task = await page.evaluate(() => GenerationTask.getState());
    assert.equal(task.input.templateValues.product, '晨光咖啡');
    assert.equal(task.save.status, 'failed'); assert.equal(task.result.failedShotIndexes.length, 1);
    assert.match(calls.find(c => c.body?.type === 'story').body.question, /Feature 晨光咖啡/);
    assert.equal(await page.locator('#storyboard-grid .shot-card').count(), 2);
    await page.locator('[data-result-view="table"]').click();
    assert.equal(await page.locator('#generated-storyboard-body tr').count(), 2);
    assert.match(await page.locator('#generated-storyboard-body').textContent(), /新企劃旁白/);
    await page.locator('#btn-retry-save').click();
    await page.waitForFunction(() => GenerationTask.getState().save.status === 'saved');
    assert.equal(images, 2); assert.equal(await page.locator('#btn-open-generated-project').isVisible(), true);
    await page.locator('#btn-retry-failed-images').click();
    await page.waitForFunction(() => GenerationTask.getState().status === 'completed' && !GenerationTask.getState().result.failedShotIndexes.length);
    assert.equal(images, 3); assert.equal(saves, 2);
    assert.equal(calls.filter(c => c.body?.type === 'story').length, 1);
    assert.equal(calls.filter(c => c.path.includes('/shots/')).length, 2);
    for (const selector of ['#btn-export-result-csv', '.result-actions .btn-outline']) {
      const downloadPromise = page.waitForEvent('download'); await page.locator(selector).click();
      const download = await downloadPromise; const text = await fs.readFile(await download.path(), 'utf8');
      assert.match(text, /新企劃旁白/); assert.match(text, /coffee scene/);
    }
    if (process.env.STORYBOARD_QA_OUTPUT) {
      await fs.mkdir(process.env.STORYBOARD_QA_OUTPUT, { recursive: true });
      await page.screenshot({ path: path.join(process.env.STORYBOARD_QA_OUTPUT, 'template-result-' + (mobile ? '390' : '1366') + '.png'), fullPage: true });
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'table scroll must stay inside its container');
    await page.evaluate(() => spaNavigate('dashboard')); await page.evaluate(() => spaNavigate('generate'));
    await page.waitForFunction(() => document.getElementById('result-heading')?.textContent === '分鏡生成完成');
    assert.equal(images, 3);
    assert.deepEqual(errors, []);
    console.log(`PASS: ${mobile ? 'mobile' : 'desktop'} apply → variables → adaptation → partial results → save retry → selective image retry → CSV/JSON → route restoration`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
