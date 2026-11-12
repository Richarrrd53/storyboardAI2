const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const {default:p}=await import(require('node:url').pathToFileURL(path.resolve('temp/landing-qa/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).href);
 const browser=await p.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox'],userDataDir:path.resolve('temp/round2-qa-profile')});
 const report={sizes:[],checks:[],errors:[]};
 const page=await browser.newPage();
 await page.setRequestInterception(true);
 page.on('request',r=>{const u=new URL(r.url());if(u.protocol.startsWith('http')&&u.hostname!=='localhost')r.abort();else r.continue();});
 page.on('pageerror',e=>report.errors.push(e.message));
 try {
  for(const width of JSON.parse(process.env.QA_WIDTHS || '[1440,1280,1024,768,390,375]')){
   const height=width===375?667:width===1280?800:width<600?844:900;
   await page.setViewport({width,height,isMobile:width<600,hasTouch:width<900});
   await page.goto('http://localhost:3000/html/index.html',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.ScrollTrigger?.getById('landing-workflow'));
   await pause(700);
   await page.evaluate(()=>scrollTo(0,0));await pause(700);
   await page.screenshot({path:`analysis/landing-round2/hero-${width}.png`});
   const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cta:document.querySelector('.lp-hero .lp-button').getBoundingClientRect().bottom,broken:[...document.querySelectorAll('.landing-story img')].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src),pins:document.querySelectorAll('.pin-spacer').length}));
   assert(state.scrollWidth<=width,'overflow '+width);assert(state.cta<height,'CTA below fold '+width);assert.equal(state.broken.length,0);assert.equal(state.pins,2);
   report.sizes.push({width,...state});
   for(const [name,id,progress] of [['film-start','landing-opening',.25],['film-cross','landing-opening',.52],['product-reveal','landing-opening',.67],['product','landing-opening',.94],['story','landing-workflow',.05],['discussion','landing-workflow',.34],['shots','landing-workflow',.61],['editing','landing-workflow',.94]]){
    await page.evaluate((id,p)=>{const t=ScrollTrigger.getById(id);scrollTo(0,t.start+(t.end-t.start)*p)},id,progress);await pause(850);
    if([1440,390,375].includes(width))await page.screenshot({path:`analysis/landing-round2/${name}-${width}.png`});
   }
   const reverse=await page.evaluate(async()=>{let results=[];for(const id of ['landing-opening','landing-workflow']){const t=ScrollTrigger.getById(id);for(const p of [0,.5,1,0]){scrollTo(0,Math.max(0,t.start+(t.end-t.start)*p));await new Promise(r=>setTimeout(r,900));results.push({id,requested:p,actual:t.animation.progress()})}}return results;});
   for(const r of reverse)assert(Math.abs(r.requested-r.actual)<.04,JSON.stringify(r));
   for(const y of [6000,0,1800,3400,30,0])await page.evaluate(y=>scrollTo(0,y),y);
   await pause(750);assert(await page.evaluate(()=>ScrollTrigger.getById('landing-opening').animation.progress()<.001));
   // Full static composition separately: a pinned stage cannot show all states in one still.
   await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await pause(350);
   assert.equal(await page.evaluate(()=>ScrollTrigger.getAll().length),0);
   if([1440,390].includes(width))await page.screenshot({path:`analysis/landing-round2/full-${width}.png`,fullPage:true});
   await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);await pause(350);
  }
  report.checks.push('six widths; hero CTA; assets; two scoped pins; all eight scene captures; forward/reverse progress; fast scroll; reduced motion/full composition');
  // Real iframe shell: repeated route teardown, history and mobile input.
  await page.setViewport({width:1440,height:900});await page.goto('http://localhost:3000/',{waitUntil:'domcontentloaded'});
  await page.waitForFrame(f=>f.url().includes('/html/index.html'));let frame=page.frames().find(f=>f.url().includes('/html/index.html'));
  await frame.waitForFunction(()=>window.ScrollTrigger?.getById('landing-workflow'));
  await frame.waitForFunction(()=>getComputedStyle(document.getElementById('black-mask-top')).pointerEvents==='none');
  report.anchorBefore=await frame.evaluate(()=>({y:scrollY,end:ScrollTrigger.getById('landing-opening').end,height:innerHeight}));
  await frame.click('a[href="#videos"]');
  await frame.waitForFunction(()=>ScrollTrigger.getById('landing-opening').progress>.95,{timeout:8000});
  for(let i=0;i<3;i++){
   await frame.evaluate(()=>window.navigate('login'));await frame.waitForFunction(()=>document.body.classList.contains('auth-layout'));
   assert.equal(await frame.evaluate(()=>ScrollTrigger.getAll().length),0);
   assert.equal(await frame.evaluate(()=>document.querySelectorAll('.pin-spacer').length),0);
   await frame.evaluate(()=>window.navigate('landing'));await frame.waitForFunction(()=>!!ScrollTrigger.getById('landing-workflow'));await pause(450);
   assert.equal(await frame.evaluate(()=>document.querySelectorAll('.pin-spacer').length),2);
  }
  const ownership=await frame.evaluate(()=>{const foreign=ScrollTrigger.create({id:'foreign-test',trigger:document.body,start:0,end:100});for(let i=0;i<5;i++)initLandingPage();_landingKill();const kept=!!ScrollTrigger.getById('foreign-test');foreign.kill();initLandingPage();return kept;});assert(ownership);
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await pause(600);frame=page.frames().find(f=>f.url().includes('/html/index.html'));await frame.waitForFunction(()=>!!window.ScrollTrigger?.getById('landing-workflow'));await frame.evaluate(()=>scrollTo(0,0));await pause(400);
  await page.touchscreen.touchStart(180,680);for(let y=650;y>260;y-=30){await page.touchscreen.touchMove(180,y);await pause(25)}await page.touchscreen.touchEnd();await pause(600);assert(await frame.evaluate(()=>scrollY>0));
  await frame.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));dispatchEvent(new Event('resize'))});await pause(400);
  report.checks.push('iframe SPA: product anchor, three login/landing round trips, zero leftover pins, five repeated init calls preserve foreign trigger, resize, real touch swipe, pageshow');
  await page.goto('http://localhost:3000/html/index.html',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.ScrollTrigger?.getById('landing-workflow'));await page.evaluate(()=>window._landingKill());
  assert.equal(await page.$eval('.lp-product',e=>getComputedStyle(e).position),'static');
  await page.setJavaScriptEnabled(false);await page.reload({waitUntil:'domcontentloaded'});assert(await page.$('.lp-hero .lp-button'));await page.screenshot({path:'analysis/landing-round2/no-js.png',fullPage:true});
  report.checks.push('no JS composition remains visible');
  assert.equal(report.errors.length,0,report.errors.join('\n'));
 }catch(e){report.failure=e.stack;report.debug=await Promise.all(page.frames().map(f=>f.evaluate(()=>({url:location.href,y:scrollY,body:document.body.className,progress:window.ScrollTrigger?.getById('landing-opening')?.progress,logic:!!window.initLandingLogic,point:document.elementFromPoint(700,40)?.outerHTML?.slice(0,200)})).catch(()=>null)));await page.screenshot({path:'analysis/landing-round2/failure.png'});process.exitCode=1;console.error(e)}finally{fs.writeFileSync('analysis/landing-round2/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close()}
})();
