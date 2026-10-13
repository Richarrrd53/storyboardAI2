/** Production iframe entrypoint + real DOM at desktop/tablet/mobile sizes.
 * API, covers and remote player use deterministic local fixtures; no paid calls.
 * Run with STORYBOARD_PLAYWRIGHT_PATH pointing to the bundled Playwright package.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.STORYBOARD_PLAYWRIGHT_PATH || 'playwright');
const publicRoot = path.resolve(__dirname, '../public');
const output = path.resolve(__dirname, '../.codex-backup/ui-validation/site');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp4': 'video/mp4' };
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const entry = pathname === '/' || /^\/(dashboard|projects|history|generate|template(?:\/[^/]+)?|project\/[^/]+|discovery|login|register)\/?$/.test(pathname);
  const file = path.resolve(publicRoot, '.' + (entry ? '/main.html' : pathname));
  if (!file.startsWith(publicRoot + path.sep)) return res.writeHead(403).end();
  try { res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
const projects = [
  { id: 'coffee', title: '晨光咖啡：城市裡的一杯日常', tags: ['品牌企劃', '美食'], is_deleted: false },
  { id: 'travel', title: '週末山城散步與在地故事', tags: ['旅行'], is_deleted: false },
  { id: 'long-title', title: '一起把漫長的故事變成清楚的鏡頭：從第一個想法到最後一幕的城市日常觀察與人物訪談企劃', tags: ['品牌企劃', '訪談'], is_deleted: false },
  { id: 'archived', title: '已刪除的舊版咖啡提案', tags: [], is_deleted: true }
].map(project => ({ ...project, ratio: '16:9', style: 'cinematic', updateAt: '2026-10-13T03:00:00Z', updatedAt: '2026-10-13T03:00:00Z', createAt: '2026-10-01T03:00:00Z', shotsCount: 3, previewImages: ['/fixture-cover.svg'], shots: [1, 2, 3].map(order => ({ id: project.id + '-' + order, order, title: ['窗邊晨光灑落在咖啡杯上', '手沖咖啡的細節', '和朋友分享片刻日常'][order - 1], duration: '3s', camera: '中景', payload: { image: '/fixture-cover.svg', emotion: '溫暖', shotPrompt: 'Morning coffee by the window' } })) }));

(async () => {
  let browser;
  const manifest = [];
  try {
    await fs.mkdir(output, { recursive: true });
    const template = JSON.parse(await fs.readFile(path.resolve(__dirname, '../analysis/templates/gemini_outputs/GiZBQzIH6zA.json'), 'utf8'));
    const templates = Array.from({ length: 8 }, (_, index) => ({ ...template, id: index ? 'fixture-' + index : template.id, name: index ? '咖啡品牌的日常敘事 ' + index : template.name, category: index % 2 ? 'product' : 'story', tags: ['日常', '品牌'], thumbnail: '/fixture-cover.svg' }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }].filter(v => !process.env.STORYBOARD_QA_WIDTH || String(v.width) === process.env.STORYBOARD_QA_WIDTH)) {
      const projectFixture = JSON.parse(JSON.stringify(projects));
      let failTagSave = false;
      let tagSaveRequests = 0;
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', hasTouch: viewport.width === 390 });
      await context.addInitScript(() => {
        localStorage.setItem('spa_auth_token', 'fixture-token');
        window.YT = { PlayerState: { PLAYING: 1 }, Player: function (id) {
          this.destroy = this.pauseVideo = this.playVideo = this.seekTo = () => {};
          const iframe = document.createElement('iframe'); iframe.id = id; iframe.title = 'Local player fixture'; document.getElementById(id).replaceWith(iframe);
        } };
      });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/fixture-cover.svg' || /^\/api\/projects\/[^/]+\/cover$/.test(url.pathname)) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#292524"/><rect x="55" y="30" width="225" height="200" rx="6" fill="#a3b8c7"/><path d="M168 32v195M58 125h220" stroke="#f5f5f4" stroke-width="8"/><ellipse cx="440" cy="295" rx="115" ry="20" fill="#a8a29e"/><path d="M367 182h143v92q-72 52-143 0z" fill="#f5f5f4"/><path d="M510 197q70 0 55 53q-15 27-55 8" stroke="#f5f5f4" fill="none" stroke-width="18"/><ellipse cx="439" cy="182" rx="72" ry="14" fill="#57534e"/></svg>' });
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname === '/api/auth/me') return reply({ user: { id: 'fixture', name: '創作者', email: 'creator@example.test', plan: 'free' } });
        if (url.pathname === '/api/projects') return reply({ projects: projectFixture });
        if (url.pathname.startsWith('/api/projects/')) {
          const project = projectFixture.find(p => p.id === url.pathname.split('/')[3]) || projectFixture[0];
          if (route.request().method() === 'PATCH') {
            tagSaveRequests++;
            if (failTagSave) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '測試暫時無法儲存' }) });
            const body = route.request().postDataJSON();
            project.tags = body.tags;
            project.metadata = { ...(project.metadata || {}), tags: body.tags };
            project.updateAt = '2026-10-14T00:00:00Z';
          }
          return reply({ project });
        }
        if (url.pathname === '/api/get-templates') return reply(templates);
        if (url.pathname === '/api/discovery/skills') return reply({ configured: true, skills: [{ id: 'short-video-template-lab', name: '短影音結構分析' }] });
        if (url.pathname === '/api/discovery/settings') return reply({ configured: true, youtube: { configured: true, source: 'server' }, gemini: { configured: true, source: 'server', mode: 'vertex' } });
        return reply({});
      });
      const page = await context.newPage(); page.setDefaultTimeout(12000);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', dialog => dialog.dismiss());
      await page.goto(origin + '/dashboard');
      const app = page.frameLocator('#ifm');
      const getFrame = async () => (await page.locator('#ifm').elementHandle()).contentFrame();
      const settle = async () => (await getFrame()).waitForFunction(() => window.spaNavigate && !document.body.classList.contains('is-navigating') && (!document.getElementById('transition-loader-overlay') || getComputedStyle(document.getElementById('transition-loader-overlay')).opacity === '0'));
      const capture = async name => {
        await settle();
        const metrics = await (await getFrame()).evaluate(() => {
          const main = document.getElementById('page-main');
          const content = document.getElementById('page-content');
          const rect = el => el ? { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height } : null;
          const capsule = document.getElementById('global-create-capsule');
          const nav = document.getElementById('spa-mobile-nav');
          return { main: rect(main), content: rect(content), mainOverflow: main.scrollWidth > main.clientWidth + 1, canvas: getComputedStyle(main).backgroundColor, shellCount: document.querySelectorAll('#page-main .page-shell').length, capsule: capsule && getComputedStyle(capsule).display !== 'none' ? rect(capsule) : null, nav: nav && getComputedStyle(nav).display !== 'none' ? rect(nav) : null };
        });
        manifest.push({ page: name, width: viewport.width, ...metrics });
        await page.screenshot({ path: path.join(output, name + '-' + viewport.width + '.png') });
        assert.equal(metrics.mainOverflow, false, name + ' must have no outer horizontal overflow');
      };
      await app.locator('#home-greeting-text').waitFor(); await capture('dashboard');
      for (const [target, ready] of [['projects', '#projects-grid .project-card'], ['history', '#projects-grid .project-card'], ['project', '.project-workspace-title'], ['discovery', '#discovery-form'], ['template', '#template-grid .template-card'], ['generate', '#story-input']]) {
        await (await getFrame()).evaluate(target => window.spaNavigate(target, target === 'project' ? { id: 'coffee' } : {}), target);
        await app.locator(ready).first().waitFor({ state: 'attached' }); await capture(target);
        if (!(await app.locator(ready).first().isVisible())) {
          console.log('Hidden page diagnostics', target, await (await getFrame()).evaluate(selector => {
            const result = []; let el = document.querySelector(selector);
            while (el) { const cs = getComputedStyle(el); result.push({ tag: el.tagName, id: el.id, class: el.className, display: cs.display, visibility: cs.visibility, width: el.clientWidth, height: el.clientHeight }); el = el.parentElement; }
            return result;
          }, ready));
          throw new Error(target + ' primary content is hidden');
        }
        if (target === 'project') {
          await app.locator('#pd-view-film').click(); await capture('project-film');
        }
        if (target === 'projects') {
          const filters = app.locator('#projects-tags-scroll');
          await filters.locator('[data-tag="品牌企劃"]').click();
          assert.equal(await app.locator('#projects-grid .project-card').count(), 2);
          await filters.locator('[data-tag="旅行"]').click();
          assert.equal(await app.locator('#projects-grid .project-card').count(), 3, 'Tag filters combine with OR');
          assert.equal(await app.locator('#projects-count-badge').textContent(), '3 / 3');
          await capture('projects-or-filters');
          await app.locator('#projects-clear-filter-btn').click();

          // Enter the real animated option menu; catches unbound ProjectActions callbacks.
          await app.locator('#projects-grid .project-card[data-id="coffee"] .project-option-btn').click();
          await app.locator('.morph-item[data-action="tags"]').click();
          const modal = app.locator('.project-tags-modal-overlay');
          await modal.waitFor({ state: 'visible' });
          await app.locator('#modal-tag-input').fill('測試持久標籤');
          failTagSave = true;
          await app.locator('#modal-save-btn').click();
          await app.locator('#modal-tags-status').waitFor({ state: 'visible' });
          assert.equal(await modal.count(), 1, 'Failed save preserves the dialog');
          assert.ok((await app.locator('#modal-chips-wrap').textContent()).includes('測試持久標籤'));
          assert.equal(await app.locator('#modal-save-btn').isEnabled(), true);
          await capture('projects-tags-retry');
          failTagSave = false;
          await app.locator('#modal-save-btn').click();
          await modal.waitFor({ state: 'detached' });
          assert.equal(tagSaveRequests, 2, 'One failure and one retry reach PATCH');
          assert.ok(projectFixture[0].metadata.tags.includes('測試持久標籤'));
          await page.reload();
          await app.locator('#projects-grid .project-card[data-id="coffee"] [data-tag="測試持久標籤"]').waitFor();
          await capture('projects-tags-saved');
          assert.ok((await filters.locator('[data-tag="測試持久標籤"]').textContent()).includes('1'));
          await app.locator('#projects-grid .project-card[data-id="coffee"] [data-tag="測試持久標籤"]').click();
          assert.equal(await app.locator('#projects-grid .project-card').count(), 1, 'Card tags delegate to page filters');
          await app.locator('#projects-clear-filter-btn').click();
        }
      }
      // The actual keyboard-driven four-step form, without triggering generation.
      await app.locator('#story-input').fill('為晨光咖啡寫一段城市裡的日常故事。');
      await app.locator('#composer-submit-btn').click(); await app.locator('#phase-panel-2').waitFor({ state: 'visible' }); await capture('generate-direction');
      await app.locator('#btn-direction-next').click(); await app.locator('#phase-panel-3').waitFor({ state: 'visible' }); await capture('generate-templates');
      await (await getFrame()).evaluate(() => window.spaNavigate('template', { templateId: window.cacheTemplatesList?.[0]?.id || 'GiZBQzIH6zA' }));
      await app.locator('#template-detail-immersive').waitFor({ state: 'visible' }); await capture('template-detail');
      assert.deepEqual(errors, [], 'production iframe pages have no uncaught errors');
      await page.goto(origin + '/html/discovery-settings.html');
      await page.locator('#settings-status.is-ready').waitFor();
      await page.screenshot({ path: path.join(output, 'discovery-settings-' + viewport.width + '.png') });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.goto(origin + '/');
      await page.frameLocator('#ifm').locator('.hero-title').waitFor();
      await page.screenshot({ path: path.join(output, 'landing-' + viewport.width + '.png') });
      await (await getFrame()).evaluate(() => window.spaNavigate('login'));
      await page.frameLocator('#ifm').locator('#login-email').waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(output, 'login-' + viewport.width + '.png') });
      await (await getFrame()).evaluate(() => window.spaNavigate('register'));
      await page.frameLocator('#ifm').locator('#register-email').waitFor({ state: 'visible' });
      await page.screenshot({ path: path.join(output, 'register-' + viewport.width + '.png') });
      assert.deepEqual(errors, [], 'public and settings pages have no uncaught errors');
      console.log('PASS full site: ' + viewport.width + 'px, production iframe, 15 screens, real page scripts, no horizontal main overflow or uncaught errors');
      await context.close();
    }
  } finally {
    await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
