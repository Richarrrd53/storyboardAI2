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
const writeArtifacts = process.env.STORYBOARD_QA_ARTIFACTS !== '0';
const output = path.resolve(process.env.STORYBOARD_QA_OUTPUT || path.join(require('node:os').tmpdir(), 'storyboard-ui-qa', 'site'));
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
].map(project => ({ ...project, ratio: '16:9', style: 'cinematic', updateAt: '2026-10-13T03:00:00Z', updatedAt: '2026-10-13T03:00:00Z', createAt: '2026-10-01T03:00:00Z', shotsCount: 3, previewImages: ['/fixture-cover.svg'], shots: [1, 2, 3].map(order => ({ id: project.id + '-' + order, order, title: ['窗邊晨光灑落在咖啡杯上', '手沖咖啡的細節', '和朋友分享片刻日常'][order - 1], duration: '3s', camera: '中景', payload: { image: '/fixture-cover.svg', imageHistory: [{image:'/fixture-cover.svg',prompt:'Current image prompt'},{image:'/fixture-cover.svg?version=previous',prompt:'Earlier image prompt'}], emotion: '溫暖', shotPrompt: 'Morning coffee by the window' } })) }));

(async () => {
  let browser;
  const manifest = [];
  try {
    if (writeArtifacts) await fs.mkdir(output, { recursive: true });
    const template = JSON.parse(await fs.readFile(path.resolve(__dirname, '../analysis/templates/gemini_outputs/GiZBQzIH6zA.json'), 'utf8'));
    const templates = Array.from({ length: 8 }, (_, index) => ({ ...template, id: index ? 'fixture-' + index : template.id, name: index ? '咖啡品牌的日常敘事 ' + index : template.name, category: index % 2 ? 'product' : 'story', tags: ['日常', '品牌'], thumbnail: '/fixture-cover.svg' }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
    for (const viewport of [[320,700],[740,390],[360,800],[375,812],[390,844],[414,896],[430,932],[768,1024],[1024,768],[1280,800],[1440,900],[1920,1080]].map(([width,height]) => ({width,height})).filter(v => !process.env.STORYBOARD_QA_WIDTH || String(v.width) === process.env.STORYBOARD_QA_WIDTH)) {
      let stage = 'initial load';
      const watchdog = setTimeout(() => { console.error('Browser test stalled:', viewport.width, stage); void browser.close(); }, process.env.STORYBOARD_QA_MOTION === '1' ? 180000 : 90000);
      const projectFixture = JSON.parse(JSON.stringify(projects));
      let authCalls = 0, authDelay = 0, authStatus = 200;
      let failTagSave = false;
      let tagSaveRequests = 0;
      let failShotSave = false, shotSaveRequests = 0;
      const context = await browser.newContext({ viewport, reducedMotion: process.env.STORYBOARD_QA_MOTION === '1' ? 'no-preference' : 'reduce', hasTouch: viewport.width <= 768 });
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
        if (url.pathname === '/api/auth/login' || url.pathname === '/api/auth/register') return reply({ token: 'fixture-session', user: { name: '創作者' } });
        if (url.pathname === '/api/auth/me') { authCalls++; if (authDelay) await new Promise(resolve => setTimeout(resolve, authDelay)); if(authStatus !== 200) return route.fulfill({status:authStatus,json:{error:'fixture auth error'}}); return reply({ user: { id: 'fixture', name: '創作者', email: 'creator@example.test', plan: 'free' } }); }
        if (url.pathname === '/api/projects') return reply({ projects: projectFixture });
        const shotRoute = url.pathname.match(/^\/api\/projects\/([^/]+)\/shots\/([^/]+)(?:\/(optimize-prompt|regenerate))?$/);
        if (shotRoute) {
          const project = projectFixture.find(p=>p.id===shotRoute[1]);
          const shot = project?.shots.find(s=>s.id===shotRoute[2]);
          if(shotRoute[3] === 'optimize-prompt') return reply({prompt:'A precise cinematic morning coffee shot'});
          if(route.request().method()==='PATCH') {
            shotSaveRequests++;
            if(failShotSave) return route.fulfill({status:503,json:{error:'暫時無法儲存，請重試'}});
            const data=route.request().postDataJSON(); Object.assign(shot,{title:data.title,camera:data.camera,duration:data.duration,payload:{...shot.payload,...data.payloadPatch}});
          }
          return reply({shot});
        }
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
        if (url.pathname === '/api/creation/copilot') { const body=route.request().postDataJSON(); return reply({action:'ready',message:'以晨光和手部動作串起咖啡故事。',briefPatch:{baseStyle:'cinematic',ratio:'9:16',duration:30},requestId:body.requestId,revision:body.revision}); }
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
        stage = 'capture ' + name;
        if(process.env.STORYBOARD_QA_DEBUG) console.log(viewport.width + ': ' + stage);
        await settle();
        await (await getFrame()).evaluate(() => Promise.race([Promise.all(document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))), new Promise(resolve => setTimeout(resolve, 700))]));
        const metrics = await (await getFrame()).evaluate(() => {
          const main = document.getElementById('page-main');
          const content = document.getElementById('page-content');
          const rect = el => el ? { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height } : null;
          const capsule = document.getElementById('global-create-capsule');
          const nav = document.getElementById('spa-mobile-nav');
          return { main: rect(main), content: rect(content), mainOverflow: main.scrollWidth > main.clientWidth + 1, canvas: getComputedStyle(main).backgroundColor, shellCount: document.querySelectorAll('#page-main .page-shell').length, capsule: capsule && getComputedStyle(capsule).display !== 'none' ? rect(capsule) : null, nav: nav && getComputedStyle(nav).display !== 'none' ? rect(nav) : null };
        });
        manifest.push({ page: name, width: viewport.width, ...metrics });
        if (writeArtifacts) await page.screenshot({ path: path.join(output, name + '-' + viewport.width + '.png') });
        assert.equal(metrics.mainOverflow, false, name + ' must have no outer horizontal overflow');
        if (['dashboard','projects','history','project','discovery','template'].includes(name)) {
          const scrolled = await (await getFrame()).evaluate(async () => {
            const body = [...document.querySelectorAll('.content-body, .page-scroll')].find(el => el.clientHeight > 0);
            if(!body) return null;
            const header = body.parentElement.querySelector(':scope > .content-header, :scope > .editor-menubar');
            const padding = parseFloat(getComputedStyle(body).paddingTop);
            for(let i=0;i<3;i++) { DynamicMaskSystem?.refresh(); await new Promise(r=>requestAnimationFrame(r)); }
            const stablePadding = parseFloat(getComputedStyle(body).paddingTop);
            body.scrollTop = 220;
            await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            return {top:body.scrollTop, scrolled:header?.classList.contains('is-content-scrolled'), header:!!header, compact:document.body.classList.contains('mobile-nav-compact'), padding, stablePadding,
              cardOverflow: [...body.querySelectorAll('.projects-grid > .project-card')].some(el => el.getBoundingClientRect().right > body.getBoundingClientRect().right + 1)};
          });
          if(scrolled) {
            assert.ok(Math.abs(scrolled.stablePadding - scrolled.padding) <= 1, name + ' header compensation stays stable');
            assert.equal(scrolled.cardOverflow, false, name + ' cards stay inside the scroll viewport');
            if(scrolled.top > 0 && scrolled.header) assert.equal(scrolled.scrolled, true, name + ' header compacts');
            if(scrolled.top > 0 && viewport.width <= 768) assert.equal(scrolled.compact, true, name + ' bottom nav compacts');
            if(writeArtifacts && ['template','project'].includes(name)) await page.screenshot({path:path.join(output,name+'-scrolled-'+viewport.width+'.png')});
            await (await getFrame()).evaluate(async () => {
              const body=[...document.querySelectorAll('.content-body, .page-scroll')].find(el=>el.clientHeight>0); body.scrollTop=0;
              await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            });
            if(viewport.width <= 768) assert.equal(await (await getFrame()).evaluate(()=>document.body.classList.contains('mobile-nav-compact')), false);
          }
        }
      };
      await app.locator('#home-greeting-text').waitFor(); await capture('dashboard');
      if (process.env.STORYBOARD_QA_EDGES === '1') {
        await (await getFrame()).evaluate(() => spaNavigate('projects'));
        await settle();
        const edgeChecks = await (await getFrame()).evaluate(async () => {
          const tick = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const body = document.querySelector('.content-body');
          const filler = document.createElement('div'); filler.style.height = '2400px'; filler.style.flexShrink = '0'; body.appendChild(filler);
          DynamicMaskSystem.refresh(); await tick();
          await new Promise(resolve => setTimeout(resolve, 700));
          const instance = DynamicMaskSystem.get(body), header = instance.header;
          const startRect = body.getBoundingClientRect().toJSON();
          const state = () => ({ anchor: body.firstElementChild.getBoundingClientRect().top + body.scrollTop, visibility: instance.headerVisibility, hidden: instance.hiddenDistance,
            topExtent: instance.edges.get('top')?.[0].getBoundingClientRect().height || 0,
            bottomExtent: instance.edges.get('bottom')?.[0].getBoundingClientRect().height || 0,
            compact: header.classList.contains('is-content-scrolled'), navigation: [header, instance.headerToolbar].filter(Boolean).map(el => ({bottom:el.getBoundingClientRect().bottom,translate:getComputedStyle(el).translate,offset:el.style.getPropertyValue('--navigation-offset')})), rect: body.getBoundingClientRect().toJSON() });
          const scroll = async top => { body.scrollTop = top; await tick(); return state(); };
          const expanded = await scroll(0);
          const compact = await scroll(32);
          await scroll(70);
          const savedIsolation = instance.headerHost.style.isolation;
          instance.headerHost.style.isolation = 'isolate';
          const topLayers = instance.edges.get('top');
          topLayers.forEach(layer => layer.style.pointerEvents = 'auto');
          const headerRect = header.getBoundingClientRect();
          const topElement = document.elementFromPoint(headerRect.left + headerRect.width / 2, headerRect.top + headerRect.height / 2);
          const headerAboveBlur = header.contains(topElement) && topLayers.every(layer => layer.parentElement === header.parentElement);
          topLayers.forEach(layer => layer.style.pointerEvents = 'none');
          instance.headerHost.style.isolation = savedIsolation;
          const partial = await scroll(130);
          const reversed = await scroll(106);
          const hidden = await scroll(650);
          const jitter = await scroll(644);
          const revealed = await scroll(540);
          const top = await scroll(0);
          let navigationExtents = null;
          if (innerWidth <= 768) {
            AppShell.updateRoute('project');
            await new Promise(resolve => setTimeout(resolve, 550));
            const hiddenExtent = state().bottomExtent;
            AppShell.updateRoute('projects');
            await new Promise(resolve => setTimeout(resolve, 550));
            navigationExtents = {hidden:hiddenExtent, shown:state().bottomExtent};
          }
          const noMask = getComputedStyle(body).maskImage === 'none';
          const stable = Math.abs(body.getBoundingClientRect().height - startRect.height) < 1;
          const systemAlias = ProgressiveEdgeBlurSystem === DynamicMaskSystem;
          // Horizontal edges and no-overflow containers use the same renderer.
          const box = document.createElement('div');
          box.style.cssText = 'position:fixed;left:20px;top:200px;width:140px;height:60px;overflow:auto;white-space:nowrap;z-index:30';
          const wide = document.createElement('div'); wide.style.cssText = 'width:600px;height:30px'; box.appendChild(wide); document.body.appendChild(box);
          const horizontal = DynamicMaskSystem.attach(box, {direction:'horizontal',maskSize:28});
          box.scrollLeft = 70; await tick();
          const horizontalBoth = horizontal.edges.get('left')?.[0].style.visibility === 'visible' && horizontal.edges.get('right')?.[0].style.visibility === 'visible';
          wide.style.width = '20px'; await tick(); horizontal.update();
          const noOverflow = [...horizontal.edges.values()].every(layers => layers[0].style.visibility === 'hidden');
          DynamicMaskSystem.detach(box); box.remove();
          filler.remove(); body.scrollTop = 0; await tick();
          return { expanded,compact,partial,reversed,hidden,jitter,revealed,top,noMask,stable,systemAlias,horizontalBoth,noOverflow,navigationExtents,headerAboveBlur };
        });
        assert.equal(edgeChecks.expanded.visibility, 1);
        assert.equal(edgeChecks.compact.compact, true);
        assert.equal(edgeChecks.compact.visibility, 1);
        assert.ok(edgeChecks.partial.visibility > 0 && edgeChecks.partial.visibility < 1);
        assert.ok(edgeChecks.reversed.visibility > edgeChecks.partial.visibility, 'partial hiding reverses with the finger');
        assert.equal(edgeChecks.hidden.visibility, 0);
        assert.equal(edgeChecks.jitter.visibility, 0, 'tiny reverse scroll stays hidden');
        assert.ok(edgeChecks.revealed.visibility > 0, 'intentional reverse scroll restores navigation');
        assert.ok(Math.abs(edgeChecks.hidden.topExtent - 96) < 1, 'hidden header retains 96px baseline blur: ' + JSON.stringify(edgeChecks.hidden));
        assert.equal(edgeChecks.top.compact, false);
        assert.ok(Math.abs(edgeChecks.expanded.anchor - edgeChecks.hidden.anchor) < 1, 'reading content does not shift when navigation hides');
        if (edgeChecks.navigationExtents) { assert.ok(Math.abs(edgeChecks.navigationExtents.hidden - 176) < 1); assert.ok(edgeChecks.navigationExtents.shown >= Math.min(240,viewport.height/2) - 1); }
        for (const key of ['noMask','stable','systemAlias','horizontalBoth','noOverflow','headerAboveBlur']) assert.equal(edgeChecks[key], true, key);
        if (viewport.width <= 768) {
          const gesture = await (await getFrame()).evaluate(async () => {
            const nav = document.getElementById('spa-mobile-nav');
            const item = document.getElementById('mob-nav-template');
            const r = item.getBoundingClientRect();
            const before = spaRouter.currentPage;
            item.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,isPrimary:true,pointerId:71,pointerType:'touch',button:0,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
            window.dispatchEvent(new PointerEvent('pointercancel', {pointerId:71,pointerType:'touch'}));
            item.click();
            await new Promise(resolve => setTimeout(resolve, 350));
            return { cancelled:spaRouter.currentPage === before, resting:!nav.classList.contains('is-interacting'), pressed:nav.querySelector('.mobile-nav__indicator').classList.contains('is-pressed') };
          });
          assert.equal(gesture.cancelled, true); assert.equal(gesture.resting, true); assert.equal(gesture.pressed, false);
        }
        if (viewport.width <= 768) {
          const sync = await (await getFrame()).evaluate(async () => {
            const nav = document.getElementById('spa-mobile-nav');
            const indicator = nav.querySelector('.mobile-nav__indicator');
            const focus = nav.querySelector('.mobile-nav__track--focus');
            let error = 0;
            AppShell.updateMobileBottomNavActive('dashboard');
            await new Promise(resolve => setTimeout(resolve, 260));
            AppShell.updateMobileBottomNavActive('template');
            for (let index = 0; index < 18; index++) {
              await new Promise(requestAnimationFrame);
              const clip = getComputedStyle(focus).clipPath.match(/inset\(([-.\d]+)px ([-.\d]+)px ([-.\d]+)px ([-.\d]+)px/);
              if (clip) {
                const transform = new DOMMatrixReadOnly(getComputedStyle(indicator).transform);
                const center = transform.m41 + parseFloat(getComputedStyle(indicator).width) / 2;
                const clipCenter = (+clip[4] + nav.clientWidth - +clip[2]) / 2;
                error = Math.max(error, Math.abs(center - clipCenter));
              }
            }
            AppShell.updateMobileBottomNavActive('projects');
            return error;
          });
          assert.ok(sync < 1, 'selector and focus clipping share every animation frame: ' + sync);
        }
        if (writeArtifacts) {
          await (await getFrame()).evaluate(async () => {
            const filler = document.createElement('div'); filler.id = 'edge-visual-fixture'; filler.style.height = '2400px';
            document.querySelector('.content-body').appendChild(filler);
            document.querySelector('.content-body').scrollTop = 70;
            await new Promise(resolve => setTimeout(resolve, 400));
          });
          await page.screenshot({path:path.join(output, 'header-above-blur-' + viewport.width + '.png')});
          await (await getFrame()).evaluate(() => { document.getElementById('edge-visual-fixture').remove(); document.querySelector('.content-body').scrollTop = 0; });
        }
        console.log('PASS progressive edges and directional header: ' + viewport.width);
        await (await getFrame()).evaluate(() => spaNavigate('dashboard')); await settle();
      }
      if (process.env.STORYBOARD_QA_INTERACTIONS === '1') {
        await app.locator(viewport.width<=768 ? '#mob-nav-generate' : '#global-create-trigger').click();
        await (await getFrame()).waitForFunction(()=>document.body.classList.contains('ai-quick-compose-active'));
        await app.locator('#qc-story-input').fill('一段晨光咖啡與朋友聚會的故事');
        if(writeArtifacts) await page.screenshot({path:path.join(output,'quick-compose-'+viewport.width+'.png')});
        await app.locator('#qc-send-btn').click();
        await app.locator('#generate-workspace[data-ready="true"]').waitFor(); await settle();
        await (await getFrame()).waitForFunction(()=>!document.querySelector('#qc-transition-proxy,.qc-workspace-morph,.qc-story-flight'));
        assert.equal(await app.locator('#page-content').getAttribute('inert'),null);
        await (await getFrame()).evaluate(async()=>{CreationController.reset();await spaNavigate('dashboard');});
      }
      if ([390,1440].includes(viewport.width)) {
        const frame = await getFrame();
        const before = authCalls;
        await frame.evaluate(() => spaNavigate('projects'));
        await frame.evaluate(() => spaNavigate('dashboard'));
        assert.equal(authCalls, before, 'warm navigation reuses validated user');
        authDelay = 600;
        await frame.evaluate(() => spaAuth.invalidateUser());
        const cold = await frame.evaluate(async () => {
          const started = performance.now();
          const pending = spaNavigate('projects');
          const immediate = document.getElementById('mob-nav-projects').getAttribute('aria-selected');
          const nextFrame = await new Promise(resolve => requestAnimationFrame(() => resolve(performance.now()-started)));
          await pending;
          return { immediate, nextFrame, trace: spaRouter.navigationTimings.at(-1) };
        });
        assert.equal(cold.immediate, 'true');
        assert.equal(authCalls, before + 1, 'cold navigation and shell share one validation');
        assert.ok(cold.nextFrame < 150, 'network never delays first visual feedback');
        console.log('PERF ' + viewport.width + ' ' + JSON.stringify(cold));
        authStatus = 503;
        await frame.evaluate(() => spaAuth.invalidateUser());
        await frame.evaluate(() => spaNavigate('discovery'));
        assert.equal(await frame.evaluate(() => spaRouter.currentPage), 'projects');
        assert.equal(await app.locator('link[data-spa-sheet][href="/css/discovery.css"]').count(),0, 'failed validation removes destination-only styles');
        assert.equal(await app.locator('#page-content').getAttribute('inert'), null);
        await app.locator('#global-toast').evaluate(el => Promise.allSettled(el.getAnimations().map(animation => animation.finished)));
        if(viewport.width<=768) assert.ok(await frame.evaluate(()=>document.getElementById('global-toast').getBoundingClientRect().bottom < document.getElementById('spa-mobile-nav').getBoundingClientRect().top),'toast stays above mobile navigation');
        authStatus = 200; authDelay = 0;
        await frame.evaluate(() => spaNavigate('dashboard'));
      }
      for (const [target, ready] of [['projects', '#projects-grid .project-card'], ['history', '#projects-grid .project-card'], ['project', '.project-workspace-title'], ['discovery', '#discovery-form'], ['template', '#template-grid .template-card'], ['generate', '#story-input']]) {
        await (await getFrame()).evaluate(target => window.spaNavigate(target, target === 'project' ? { id: 'coffee' } : {}), target);
        await app.locator(ready).first().waitFor({ state: 'attached' }); await capture(target);
        if (target === 'discovery') assert.equal(await app.locator('#discovery-form').evaluate(el=>getComputedStyle(el).display), 'grid', 'discovery CSS survives unavailable imported fonts');
        if (!(await app.locator(ready).first().isVisible())) {
          console.log('Hidden page diagnostics', target, await (await getFrame()).evaluate(selector => {
            const result = []; let el = document.querySelector(selector);
            while (el) { const cs = getComputedStyle(el); result.push({ tag: el.tagName, id: el.id, class: el.className, display: cs.display, visibility: cs.visibility, width: el.clientWidth, height: el.clientHeight }); el = el.parentElement; }
            return result;
          }, ready));
          throw new Error(target + ' primary content is hidden');
        }
        if (target === 'project') {
          assert.equal(await app.locator('#pd-export-json-btn svg').count(), 1);
          if ([390,1024,1440].includes(viewport.width) && process.env.STORYBOARD_QA_LAYOUT_ONLY !== '1') {
            const downloadEvent=page.waitForEvent('download'); await app.locator('#pd-export-json-btn').click();
            const download=await downloadEvent; const exported=JSON.parse(await fs.readFile(await download.path(),'utf8')); assert.ok(exported.shots.length===3);
            const edit=app.locator('.shot-cell-edit-btn').first(); await edit.click();
            await app.locator('.project-shot-editor.open').waitFor();
            assert.equal(await app.locator('.project-shot-editor').getAttribute('aria-modal'),'true');
            assert.equal(await app.locator('#page-main').getAttribute('inert'),'');
            assert.ok(await app.locator('.project-shot-editor-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'editor fields do not overflow');
            assert.ok(await app.locator('.editor-preview-card').evaluate(el=>el.getBoundingClientRect().height>100),'editor preview has a visible frame');
            if(writeArtifacts) await page.screenshot({path:path.join(output,'project-editor-'+viewport.width+'.png')});
            await app.locator('.editor-version-item').nth(1).focus(); await page.keyboard.press('Enter');
            assert.equal(await app.locator('.editor-version-item').nth(1).getAttribute('aria-pressed'),'true');
            await app.locator('#pd-btn-optimize-prompt').click();
            await (await getFrame()).waitForFunction(()=>document.getElementById('pd-f-prompt').value==='A precise cinematic morning coffee shot');
            await app.locator('#pd-btn-regenerate').click();
            await (await getFrame()).waitForFunction(()=>!ProjectDetailController._isRegeneratingImage);
            await app.locator('#pd-f-title').fill('更新後的晨光鏡頭');
            failShotSave=true; await app.locator('#pd-editor-save').click(); await app.locator('#pd-editor-status[role="alert"]').waitFor({state:'visible'});
            assert.ok(await app.locator('.project-shot-editor.open').isVisible());
            failShotSave=false; await app.locator('#pd-editor-save').click(); await app.locator('.project-shot-editor').waitFor({state:'detached'});
            assert.equal(shotSaveRequests,2); assert.ok((await app.locator('.shot-cell-story-title').first().textContent()).includes('更新後的晨光鏡頭'));
            await edit.click(); await app.locator('.project-shot-editor.open').waitFor();
            if(viewport.width<=768) {
              const handle=app.locator('.project-editor-grab'); const box=await handle.boundingBox();
              await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
              await page.mouse.move(box.x+box.width/2,box.y+box.height/2+25,{steps:5}); await page.mouse.up();
              assert.ok(await app.locator('.project-shot-editor.open').isVisible(),'short drag springs back');
              await page.waitForTimeout(320);
              const start=await handle.boundingBox(); await page.mouse.move(start.x+start.width/2,start.y+start.height/2); await page.mouse.down();
              await page.mouse.move(start.x+start.width/2,start.y+start.height/2+350,{steps:12});
              assert.ok(await app.locator('.project-shot-editor').evaluate(el=>el.getBoundingClientRect().top>200),'sheet follows the pointer');
              await page.mouse.up(); await app.locator('.project-shot-editor').waitFor({state:'detached'});
              assert.equal(await app.locator('#page-main').getAttribute('inert'),null);
              await edit.click(); await app.locator('.project-shot-editor.open').waitFor();
            }
            await page.keyboard.press('Escape'); await app.locator('.project-shot-editor').waitFor({state:'detached'});
            await edit.click(); await app.locator('.project-shot-editor.open').waitFor();
            await (await getFrame()).evaluate(()=>spaNavigate('projects')); await settle();
            assert.equal(await app.locator('.project-shot-editor').count(),0);
            assert.equal(await (await getFrame()).evaluate(()=>document.body.classList.contains('project-editor-open')),false);
            await (await getFrame()).evaluate(()=>spaNavigate('project',{id:'coffee'})); await settle();
          }
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
      if (process.env.STORYBOARD_QA_LAYOUT_ONLY === '1') {
        console.log('PASS layout and scroll: ' + viewport.width);
        clearTimeout(watchdog); await context.close(); continue;
      }
      // Exercise retained catalog state, real History, re-entry and navigation cancellation.
      await (await getFrame()).evaluate(() => window.spaNavigate('template'));
      await settle();
      await (await getFrame()).evaluate(() => { window.__catalog = document.getElementById('template-grid'); });
      await (await getFrame()).evaluate(() => window.spaNavigate('template', { templateId: 'GiZBQzIH6zA' }));
      await app.locator('#template-detail-immersive').waitFor({ state: 'visible' });
      await page.goBack(); await app.locator('#template-grid').waitFor({ state: 'visible' }); await settle();
      assert.equal(await (await getFrame()).evaluate(() => __catalog === document.getElementById('template-grid')), true);
      await page.goForward(); await app.locator('#template-detail-immersive').waitFor({ state: 'visible' }); await settle();
      await (await getFrame()).evaluate(() => Promise.all(['projects', 'history', 'discovery', 'projects'].map(page => window.spaNavigate(page))));
      await settle(); await app.locator('#projects-grid').waitFor({ state: 'visible' });
      await (await getFrame()).evaluate(async () => { await spaNavigate('discovery'); await spaNavigate('dashboard'); await spaNavigate('discovery'); });
      assert.equal(await app.locator('#discovery-form').getAttribute('data-discovery-initialized'), 'true');
      if (viewport.width === 390) {
        await app.locator('#mob-nav-projects').click(); await app.locator('#projects-grid').waitFor({ state: 'visible' }); await settle();
        await app.locator('#mob-nav-template').click(); await app.locator('#template-grid').waitFor({ state: 'visible' }); await settle();
      }
      await (await getFrame()).evaluate(() => window.spaNavigate('generate'));
      await app.locator('#story-input').waitFor({ state: 'visible' }); await settle();
      // Exercise the current direction flow; inspect the template chooser without a paid preview request.
      await app.locator('#story-input').fill('為晨光咖啡寫一段城市裡的日常故事。');
      await app.locator('#btn-skip-copilot').click(); await app.locator('#phase-panel-2').waitFor({ state: 'visible' }); await capture('generate-direction');
      await (await getFrame()).evaluate(() => switchPhase(3)); await app.locator('#phase-panel-3').waitFor({ state: 'visible' }); await capture('generate-templates');
      assert.equal(await app.locator('.template-cards-container').evaluate(el=>getComputedStyle(el).display), 'grid');
      await (await getFrame()).evaluate(() => window.spaNavigate('template', { templateId: window.cacheTemplatesList?.[0]?.id || 'GiZBQzIH6zA' }));
      await app.locator('#template-detail-immersive').waitFor({ state: 'visible' }); await capture('template-detail');
      if (viewport.width <= 768) {
        assert.equal(await app.locator('#spa-mobile-nav').getAttribute('aria-hidden'), 'true');
        assert.ok(await app.locator('#spa-mobile-nav').evaluate(el => el.getBoundingClientRect().top >= innerHeight));
        await (await getFrame()).evaluate(() => spaNavigate('template'));
        assert.equal(await app.locator('#spa-mobile-nav').getAttribute('aria-hidden'), 'false');
        assert.ok(await app.locator('#spa-mobile-nav').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight));
        await (await getFrame()).evaluate(() => spaNavigate('generate'));
        assert.equal(await app.locator('#spa-mobile-nav').getAttribute('aria-hidden'), 'true');
      }
      assert.deepEqual(errors, [], 'production iframe pages have no uncaught errors');
      stage='settings and auth forms';
      await page.goto(origin + '/html/discovery-settings.html');
      await page.locator('#settings-status.is-ready').waitFor();
      if (writeArtifacts) await page.screenshot({ path: path.join(output, 'discovery-settings-' + viewport.width + '.png') });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.goto(origin + '/');
      await page.frameLocator('#ifm').locator('.hero-title').waitFor();
      if (writeArtifacts) await page.screenshot({ path: path.join(output, 'landing-' + viewport.width + '.png') });
      await (await getFrame()).evaluate(() => window.spaNavigate('login'));
      await page.frameLocator('#ifm').locator('#login-email').waitFor({ state: 'visible' });
      await (await getFrame()).evaluate(() => GlobalToast.showToast('登入狀態暫時無法驗證，請檢查網路連線後再試一次。'.repeat(3), 10000));
      assert.ok(await app.locator('#toast').evaluate(el => {const r=el.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.height<innerHeight;}), 'long auth toast stays inside viewport');
      if (writeArtifacts) await page.screenshot({ path: path.join(output, 'login-' + viewport.width + '.png') });
      await (await getFrame()).evaluate(() => window.spaNavigate('register'));
      await page.frameLocator('#ifm').locator('#register-email').waitFor({ state: 'visible' });
      await app.locator('#tab-register.active').waitFor();
      await (await getFrame()).evaluate(() => Promise.all(document.getElementById('auth-inner').getAnimations().map(a=>a.finished.catch(()=>{}))));
      if (writeArtifacts) await page.screenshot({ path: path.join(output, 'register-' + viewport.width + '.png') });
      // Inline auth handlers must bind again on every mount and invalidate session caches.
      await app.locator('#register-username').fill('測試創作者');
      await app.locator('#register-email').fill('creator@example.test');
      await app.locator('#register-password').fill('password123');
      await app.locator('#register-password-2').fill('password123');
      await app.locator('[onclick="handleRegister()"]').click();
      await app.locator('#home-greeting-text').waitFor({ state: 'visible' }); await settle();
      await (await getFrame()).evaluate(() => window.spaAuth.logout());
      await app.locator('.hero-title').waitFor({ state: 'visible' }); await settle();
      await (await getFrame()).evaluate(() => window.spaNavigate('login'));
      await app.locator('#login-email').fill('creator@example.test');
      await app.locator('#login-password').fill('password123');
      await app.locator('#showBtn1').click();
      await app.locator('#login-password[type="text"]').waitFor();
      await app.locator('[onclick="handleLogin()"]').click();
      await app.locator('#home-greeting-text').waitFor({ state: 'visible' }); await settle();
      // Cover loading is deduplicated even while images are still pending.
      await (await getFrame()).evaluate(() => { lazyLoadProjectThumbs(document); lazyLoadProjectThumbs(document); });
      assert.equal(await (await getFrame()).evaluate(() => [...document.querySelectorAll('.project-thumb')].every(thumb => thumb.querySelectorAll('img.cover-main').length <= 1)), true);
      await (await getFrame()).evaluate(() => window.spaNavigate('projects'));
      await app.locator('#projects-grid .project-card[data-id="coffee"] img.cover-main').waitFor(); await settle();
      await app.locator('#projects-grid .project-card[data-id="coffee"] .project-title').click();
      await app.locator('.project-workspace-title').waitFor({ state: 'visible' }); await settle();
      await (await getFrame()).waitForFunction(() => !window.ProjectCoverTransition.getActiveTransition());
      for (const [url, selector] of [['/template/GiZBQzIH6zA', '#template-detail-immersive'], ['/project/coffee', '.project-workspace-title']]) {
        await page.goto(origin + url); await app.locator(selector).waitFor({ state: 'visible' }); await settle();
      }
      assert.deepEqual(errors, [], 'public and settings pages have no uncaught errors');
      console.log('PASS full site: ' + viewport.width + 'px, production iframe, auth forms/logout, route races, Back/Forward, deep links, covers, real page scripts, no main overflow or uncaught errors');
      clearTimeout(watchdog);
      await context.close();
    }
  } finally {
    if (writeArtifacts) await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
