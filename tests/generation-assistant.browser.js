const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.STORYBOARD_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '../public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const file = path.resolve(root, new URL(req.url, 'http://localhost').pathname === '/' ? 'html/index.html' : '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try { const data = await fs.readFile(file); res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data); } catch { if (!res.headersSent) res.writeHead(404).end(); }
});
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
const storyboard = { meta: { title: '瀏覽器測試' }, characters: {}, shots: Array.from({length:8}, (_, i) => ({ id:i+1, story: '鏡頭 '+(i+1), camera: 'wide', duration: '3.75s', emotion: 'calm', purpose: '故事推進', characters: [], shotPrompt: 'A cup of coffee in warm morning light number '+(i+1) })) };
(async () => {
 let browser;
 try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const mobile of [false, true]) {
   const context = await browser.newContext({ viewport: mobile ? {width:390,height:844} : {width:1366,height:960}, isMobile:mobile, hasTouch:mobile });
   await context.addInitScript(() => localStorage.setItem('spa_auth_token','fixture-token'));
   let storyRoute, images = [], failStory = false; const errors = [];
   await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    const send = (data, status = 200) => route.fulfill({status, json:data}).catch(() => {});
    if (url.pathname === '/api/auth/me') return send({user:{id:'fixture',name:'Creator',plan:'free'}});
    if (url.pathname === '/api/get-templates') return send([]);
    if (url.pathname === '/api/projects') return body ? send({error:'fixture save unavailable'}, 503) : send({projects:[]});
    if (url.pathname === '/api/ask-gemini') {
      if (body.type === 'story') { if (failStory) return send({error:'fixture error'},503); storyRoute = route; return; }
      images.push(route); return;
    }
    return send({});
   });
   const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(15000);
   const phase = n => page.waitForFunction(n => document.getElementById('creation-surface')?.dataset.phase === String(n), n);
   const status = v => page.waitForFunction(v => GenerationTask.getState().status === v, v);
   const waitFor = async pred => { for (let i=0;i<400 && !pred();i++) await new Promise(r=>setTimeout(r,25)); assert.ok(pred()); };
   const message = page.locator('#generation-assistant-message');
   const start = async () => { await phase(1); await page.locator('#story-input').fill('清晨的咖啡店故事'); await page.locator('#btn-skip-copilot').click(); await phase(2); await page.locator('#btn-direction-next').click(); };
   await page.goto(origin+'/#/generate'); await page.waitForFunction(()=>document.getElementById('story-input')?.dataset.bound === 'true'); await page.waitForTimeout(1000); await start(); await phase(4); await waitFor(()=>!!storyRoute);
   assert.match(await message.textContent(), /故事有雛形/);
   const initialHeight = await message.evaluate(e=>e.getBoundingClientRect().height);
   await page.waitForTimeout(10200);
   const first = await message.textContent(); assert.notEqual(first,'故事有雛形了，讓我想想每個鏡頭該怎麼安排……');
   await page.waitForTimeout(7000); assert.notEqual(await message.textContent(), first);
   await storyRoute.fulfill({json:{response:JSON.stringify(storyboard)}}); storyRoute = null; await waitFor(()=>images.length>0);
   await page.waitForFunction(()=>document.querySelector('#generation-assistant-message')?.textContent.includes('正在努力'));
   const metrics = await message.evaluate(e=>({rect:e.getBoundingClientRect().toJSON(), scroll:e.scrollWidth, client:e.clientWidth, overflow:document.documentElement.scrollWidth>innerWidth, animation:e.getAnimations().some(a=>a.effect.getTiming().duration===220)}));
   assert.equal(metrics.overflow,false); assert.ok(metrics.scroll<=metrics.client+1); assert.ok(Math.abs(metrics.rect.height-initialHeight)<35); assert.ok(metrics.animation);
   await page.evaluate(()=>window.spaNavigate('dashboard')); await page.waitForFunction(()=>!document.getElementById('generation-assistant-message'));
   await page.evaluate(()=>window.spaNavigate('generate')); await phase(4); assert.match(await message.textContent(),/正在努力/);
   while (true) { await waitFor(()=>images.length>0 || false); const route=images.shift(); await route.fulfill({json:{image:[image]}}).catch(()=>{}); if ((await page.evaluate(()=>GenerationTask.getState().status))==='completed') break; if (images.length===0) { await page.waitForTimeout(100); if ((await page.evaluate(()=>GenerationTask.getState().status))==='completed') break; } }
   await status('completed'); await page.locator('#generation-result-wrap').waitFor({state:'visible'}); assert.match(await page.locator('#result-assistant-message').textContent(),/完成！/);
   await page.evaluate(()=>{GenerationTask.reset(); CreationController.reset(); switchPhase(1, false);}); await phase(1);
   failStory=true; await start(); await status('error'); assert.equal(await page.locator('#generation-error-banner').isVisible(),true); await page.waitForTimeout(300); assert.equal(await page.locator('#generation-progress-wrap').isVisible(),false);
   failStory=false; await page.locator('#btn-retry-generation').click(); await phase(4); await waitFor(()=>!!storyRoute); await page.locator('#btn-abort-generation').click(); await status('cancelled'); assert.equal(await page.locator('#generation-progress-wrap').isVisible(),false);
   storyRoute = null; await page.waitForTimeout(300); assert.equal(await page.evaluate(()=>GenerationTask.getState().status),'cancelled');
   await page.emulateMedia({reducedMotion:'reduce'}); await page.evaluate(()=>{GenerationTask.reset(); CreationController.reset(); switchPhase(1, false);}); await phase(1); await page.waitForTimeout(1000); await start(); await phase(4); await waitFor(()=>!!storyRoute); assert.equal(await message.evaluate(e=>e.getAnimations().length),0);
   assert.deepEqual(errors,[]); console.log(`PASS ${mobile?'mobile':'desktop'}: normal, 17s rotation, animation, layout, navigation, failure, retry, cancel, reduced motion`);
   await context.unrouteAll({behavior:'ignoreErrors'}); await context.close();
  }
 } catch (error) { console.error('TEST ERROR', error); throw error; } finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{ console.error(e); process.exitCode=1; });







