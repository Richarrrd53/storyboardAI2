// Current source UI with isolated local QA data. No backend credentials or writes.
const fs = require('node:fs');
const path = require('node:path');
(async () => {
 const {default: puppeteer} = await import(require('node:url').pathToFileURL(path.resolve('temp/landing-qa/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).href);
 const browser = await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--no-sandbox'],userDataDir:path.resolve('temp/product-round2-profile')});
 try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => localStorage.setItem('spa_auth_token','local-ui-preview'));
  await page.setRequestInterception(true);
  page.on('request', request => {
   const url = new URL(request.url());
   if (url.protocol.startsWith('http') && url.hostname !== 'localhost') return request.abort();
   if (!url.pathname.startsWith('/api/')) return request.continue();
   let data = {projects:[]};
   if (url.pathname === '/api/auth/me') data = {user:{id:'local-preview',name:'創作者',plan:'free'}};
   if (url.pathname.includes('templates')) data = [];
   return request.respond({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  for (const width of [1440,390]) {
   await page.setViewport({width,height:width===390?844:900,isMobile:width===390,hasTouch:width===390});
   for (const route of ['dashboard','projects','generate']) {
    await page.goto('http://localhost:3000/'+route,{waitUntil:'domcontentloaded'});
    await page.waitForFrame(f=>f.url().includes('/html/index.html'));
    const frame = page.frames().find(f=>f.url().includes('/html/index.html'));
    await frame.waitForFunction(()=>document.body.classList.contains('dashboard-layout'));
    await new Promise(r=>setTimeout(r,2500));
    await page.screenshot({path:`public/screenshot/current/${route}-${width}.png`});
    console.log(route,width,await page.frames().find(f=>f.url().includes('/html/index.html'))?.evaluate(()=>({route:document.body.className,text:document.querySelector('#page-main')?.innerText.slice(0,160)})));
   }
  }
  fs.writeFileSync('public/screenshot/current/PROVENANCE.md','# Product UI captures\n\nCaptured 2026-11-11 from the current local source at localhost:3000 by analysis/landing-round2/capture-product.cjs. Actual product HTML/CSS/JS, unmodified. Isolated browser-only QA auth response and empty project/template lists; no production login, customer data, generated content or backend writes. These show the current empty workspace and initial composer, not a live account or successful AI generation.\n');
 } finally { await browser.close(); }
})();
