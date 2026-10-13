/** Actual SPA/Chrome regression. Local fixtures only; no database or live APIs. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.STORYBOARD_PLAYWRIGHT_PATH || 'playwright');
const publicRoot = path.resolve(__dirname, '../public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const file = path.resolve(publicRoot, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/html/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(publicRoot + path.sep)) return res.writeHead(403).end();
  try { res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  let browser;
  try {
    const template = JSON.parse(await fs.readFile(path.resolve(__dirname, '../analysis/templates/gemini_outputs/GiZBQzIH6zA.json'), 'utf8'));
    // Include fractional durations and a sparse second record to catch stale detail content.
    template.structure[0].duration = '2.5s';
    template.structure[0].dialogue = '今天的企劃：吃一天要花多少錢？';
    const templates = [template, { id: 'sparse', name: '空白模板', category: 'custom', structure: [], confidence: null }];
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }].filter(viewport => !process.env.STORYBOARD_QA_WIDTH || String(viewport.width) === process.env.STORYBOARD_QA_WIDTH)) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        localStorage.setItem('spa_auth_token', 'fixture-token');
        // Stub only the remote player SDK; rendering and SPA scripts remain real.
        window.YT = { PlayerState: { PLAYING: 1 }, Player: function (id, opts) {
          this.destroy = () => {};
          this.pauseVideo = () => {};
          this.seekTo = value => { window.__playerSeek = value; };
          this.playVideo = () => { window.__playerPlayed = true; };
          window.__playerVideoId = opts.videoId;
          const iframe = document.createElement('iframe'); iframe.id = id;
          document.getElementById(id).replaceWith(iframe);
        } };
      });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const data = url.pathname === '/api/get-templates' ? templates : url.pathname === '/api/auth/me' ? { user: { id: 'fixture', name: 'Creator', plan: 'free' } } : { projects: [] };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/#/template');
      await page.locator('.template-card').first().waitFor();
      await page.locator(`#template-grid .template-card[data-id="${template.id}"]`).click();
      await page.locator('#page-main.is-template-detail-mode').waitFor();
      assert.equal(await page.locator('#detail-template-title').textContent(), template.name);
      assert.equal(await page.locator('#editor-shot-list .editor-shot-item').count(), template.structure.length);
      assert.equal(await page.locator('#template-storyboard-body tr[data-editor-shot]').count(), template.structure.length);
      assert.equal(await page.locator('#track-shots-container .shot-block').count(), template.structure.length);
      assert.ok((await page.locator('#template-information').textContent()).includes(template.promptTemplate.base));
      assert.ok((await page.locator('#local-inspector-body').textContent()).includes(template.structure[0].action));
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.nle-media-bin')).display), 'flex');
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('page-main')).overflowY), 'auto');
      const total = template.structure.reduce((sum, shot) => sum + parseFloat(shot.duration), 0);
      assert.equal(await page.locator('#analysis-kpi-duration').textContent(), `${total}s`);
      await page.locator('#editor-shot-list .editor-shot-item').nth(1).click();
      assert.equal(await page.evaluate(() => window.__playerSeek), 2.5);
      await page.locator('#player-scrubber-track').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#player-scrubber-track').getAttribute('aria-valuenow'), '3.5');
      await page.keyboard.press('ArrowLeft');
      await page.locator('#btn-mode-story').click();
      assert.equal(await page.locator('#view-mode-story').isVisible(), true);
      assert.equal(await page.locator('#view-mode-professional').isVisible(), false);
      assert.ok((await page.locator('#template-storyboard-body').textContent()).includes(template.structure[0].dialogue));
      const firstRow = page.locator('#template-storyboard-body tr[data-editor-shot]').first();
      await firstRow.locator('.editor-shot-select').click();
      assert.equal(await page.evaluate(() => window.__playerSeek), 0);
      assert.ok((await page.locator('#local-inspector-title').textContent()).includes('鏡頭 01'));
      const secondRow = page.locator('#template-storyboard-body tr[data-editor-shot]').nth(1);
      await secondRow.locator('.editor-shot-select').click();
      assert.equal(await page.evaluate(() => window.__playerSeek), 2.5);
      assert.ok((await page.locator('#local-inspector-body').textContent()).includes(template.structure[1].action));
      assert.equal(await secondRow.getAttribute('class'), 'is-active');
      await firstRow.locator('summary').click();
      assert.ok(await firstRow.locator('details').evaluate(el => el.open));
      const downloadEvent = page.waitForEvent('download');
      await page.locator('#editor-export-storyboard').click();
      const download = await downloadEvent;
      const csv = await fs.readFile(await download.path(), 'utf8');
      assert.ok(csv.includes('"00:00","00:02.5","2.5"'));
      assert.ok(csv.includes(template.structure[0].dialogue));
      assert.ok(csv.includes(template.promptTemplate.perShot[0]));
      assert.ok(download.suggestedFilename().endsWith('-分鏡表.csv'));
      await page.locator('#btn-mode-professional').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#btn-mode-story').getAttribute('aria-selected'), 'true');
      await page.locator('#btn-mode-professional').click();
      assert.equal(await page.locator('#view-mode-professional').isVisible(), true);
      assert.equal(await page.evaluate(() => window.__playerSeek), 2.5, 'switching views retains playback position');
      await page.locator('#editor-timeline-zoom').fill('180');
      assert.equal(await page.locator('#editor-zoom-value').textContent(), '180%');
      const qa = page.locator('.track-filter-pill', { hasText: '藏鏡互動' });
      await qa.click();
      assert.equal(await page.locator('[data-track="qa"]').isVisible(), true);
      await qa.click();
      assert.equal(await page.locator('[data-track="qa"]').isVisible(), false);
      await page.locator('#track-shots-container .shot-block').first().click();
      assert.equal(await page.locator('#timeline-local-inspector').isVisible(), true);
      assert.ok((await page.locator('#local-inspector-title').textContent()).includes('鏡頭 01'));
      await page.locator('#editor-template-tab').click();
      assert.equal(await page.locator('#template-information').isVisible(), true);
      await page.locator('#editor-shot-tab').click();
      assert.equal(await page.locator('#timeline-local-inspector').isVisible(), true);
      await page.locator('#editor-prompts-tab').click();
      assert.equal(await page.locator('#editor-prompts-page').isVisible(), true);
      assert.ok((await page.locator('#editor-base-prompt').textContent()).includes(template.promptTemplate.base));
      await page.locator('#editor-variables-tab').click();
      assert.ok((await page.locator('#editor-variable-list').textContent()).includes(template.variables[0]));
      await page.locator('#editor-media-tab').click();
      await page.locator('#btn-mode-story').click();
      await page.locator('#btn-apply-template-bottom').scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.getElementById('page-main').scrollTop > 0));
      assert.ok(await page.evaluate(() => document.getElementById('page-main').scrollWidth <= document.getElementById('page-main').clientWidth + 1));
      const output = path.resolve(__dirname, '../.codex-backup/ui-validation');
      await fs.mkdir(output, { recursive: true });
      await page.evaluate(() => { document.getElementById('page-main').scrollTop = 0; });
      await page.screenshot({ path: path.join(output, `template-${viewport.width}.png`), fullPage: true });
      await page.locator('#btn-mode-professional').click();
      await page.evaluate(() => { const root = document.getElementById('page-main'); root.scrollTop = document.getElementById('template-editor-studio').offsetTop - 70; });
      await page.screenshot({ path: path.join(output, `editor-${viewport.width}.png`) });
      await page.locator('#btn-mode-story').click();
      await page.locator('.editor-board-intro').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `storyboard-${viewport.width}.png`) });
      await page.locator('.btn-back-to-store').click();
      await page.locator('#template-grid .template-card[data-id="sparse"]').click();
      assert.equal(await page.locator('#analysis-score-value').textContent(), '—');
      assert.equal(await page.locator('#editor-shot-list .editor-shot-item').count(), 0);
      assert.equal(await page.locator('#editor-export-storyboard').isDisabled(), true);
      assert.ok((await page.locator('#local-inspector-body').textContent()).includes('尚無鏡頭資料'));
      assert.equal(await page.locator('#detail-template-title').textContent(), '空白模板');
      assert.ok(!(await page.locator('#template-information').textContent()).includes(template.promptTemplate.base));
      await page.locator('#btn-apply-template-bottom').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `sparse-${viewport.width}.png`) });
      await page.locator('#btn-apply-template-bottom').click();
      await page.waitForFunction(() => location.hash.includes('generate'));
      await page.evaluate(() => window.spaNavigate('template'));
      await page.locator('.template-card').first().waitFor();
      assert.equal(await page.locator('#template-detail-immersive').isVisible(), false);
      assert.deepEqual(errors, []);
      console.log(`PASS templates: ${viewport.width}px, editor panels, storyboard/CSV, synchronized selection, keyboard tabs, zoom, full/sparse data, apply and SPA revisit`);
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
