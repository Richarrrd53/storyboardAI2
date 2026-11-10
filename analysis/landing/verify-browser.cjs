const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
const {default:puppeteer}=await import(require('node:url').pathToFileURL(process.env.PUPPETEER_MODULE || path.resolve('temp/landing-qa/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).href);
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox'],userDataDir:path.resolve('temp/landing-regression-profile')});
const report={sizes:process.argv.includes('--routes-only')?JSON.parse(fs.readFileSync('analysis/landing/qa-results.json')).sizes:[],regressions:[],errors:[],consoleErrors:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const page=await browser.newPage();
page.on('pageerror',e=>report.errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text())});
try {
for(const width of (process.argv.includes('--routes-only')?[]:[1440,1024,768,390,375])){
 await page.setViewport({width,height:width<600?844:900,hasTouch:width<900,isMobile:width<600});
 await page.goto('http://localhost:3000/',{waitUntil:'domcontentloaded'});
 const frame=await waitFrame();
 await frame.waitForFunction(()=>window.ScrollTrigger?.getAll().length===3);
 await pause(600);
 await frame.evaluate(()=>window.scrollTo(0,0));
 await page.screenshot({path:`analysis/landing/hero-${width}.png`});
 const state=await frame.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,triggers:ScrollTrigger.getAll().length,images:[...document.querySelectorAll('.landing-story img')].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src),headingBounds:[...document.querySelectorAll('.landing-story h1,.landing-story h2,.landing-story h3')].map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,scroll:e.scrollWidth})),cta:document.querySelector('.lp-hero .lp-button').getBoundingClientRect().bottom}));
 assert(state.scrollWidth<=width,`overflow at ${width}: ${state.scrollWidth}`);
 assert.equal(state.images.length,0,'broken assets');
 assert(state.headingBounds.every(h=>h.scroll<=h.width+1),`heading overflow at ${width}`);
 report.sizes.push({width,overflow:false,triggers:state.triggers,heroActionBottom:state.cta,imagesLoaded:true});
 for(const [name,selector] of [['product','.lp-product'],['workflow','.lp-workflow'],['editing','.lp-capabilities'],['cta','.lp-cta']]){
   await frame.evaluate(s=>window.scrollTo(0,document.querySelector(s).getBoundingClientRect().top+scrollY-100),selector);
   await pause(550);
   await page.screenshot({path:`analysis/landing/${name}-${width}.png`});
 }
 // Sample all three timelines forward then backward, including fast jumps.
 const animation=await frame.evaluate(async()=>{
  const wait=()=>new Promise(r=>setTimeout(r,500));const result=[];
  for(const id of ['landing-opening','landing-product','landing-sheet']){
   const trigger=ScrollTrigger.getById(id); const samples=[];
   for(const fraction of [0,0.5,1,0]){
    scrollTo(0,Math.max(0,trigger.start+(trigger.end-trigger.start)*fraction)); await wait();
    samples.push({fraction,progress:trigger.animation.progress()});
   }
   result.push({id,samples});
  }
  for(const y of [2500,0,4000,300,1800,0])scrollTo(0,y);
  await wait();return result;
 });
 assert(animation.every(t=>Math.abs(t.samples[0].progress-t.samples[3].progress)<0.03),'reverse drift');
 fs.writeFileSync(`analysis/landing/motion-${width}.json`,JSON.stringify(animation,null,2));
}
report.regressions.push('five widths, all scenes and reversible scene timelines; rapid scroll');
await page.setViewport({width:1440,height:900});
await page.goto('http://localhost:3000/',{waitUntil:'domcontentloaded'});
let frame=await waitFrame();await frame.waitForFunction(()=>window.ScrollTrigger?.getAll().length===3);
await frame.waitForFunction(()=>getComputedStyle(document.querySelector('#black-mask-top')).pointerEvents==='none');
// Real CTA click, parent-owned history back, and repeated router round trips.
await frame.click('.lp-hero [data-navigate="login"]');
await frame.waitForFunction(()=>document.body.classList.contains('auth-layout'));
await page.waitForFunction(()=>['/login','/register'].includes(location.pathname));
assert.equal(await frame.evaluate(()=>ScrollTrigger.getAll().filter(t=>String(t.vars.id).startsWith('landing-')).length),0);
report.regressions.push('hero login CTA and landing teardown');
await page.goBack({waitUntil:'domcontentloaded'}).catch(()=>{}); frame=await waitFrame();
await frame.waitForFunction(()=>!!document.querySelector('.landing-story')&&ScrollTrigger.getAll().length===3); await page.waitForFunction(()=>location.pathname==='/');
report.regressions.push('browser back returns to landing');
for(let i=0;i<3;i++){
 await frame.evaluate(()=>window.navigate('login'));
 await frame.waitForFunction(()=>document.body.classList.contains('auth-layout'));
await page.waitForFunction(()=>['/login','/register'].includes(location.pathname));
 await frame.evaluate(()=>window.navigate('landing'));
 await frame.waitForFunction(()=>!!document.querySelector('.landing-story')&&ScrollTrigger.getAll().length===3); await page.waitForFunction(()=>location.pathname==='/');
}
report.regressions.push('three login / landing round trips');
await frame.click('.lp-nav [data-navigate="register"]');
await frame.waitForFunction(()=>document.body.classList.contains('auth-layout'));
await page.waitForFunction(()=>['/login','/register'].includes(location.pathname));
assert(await frame.evaluate(()=>window.spaRouter.currentPage==='register'));
await frame.evaluate(()=>window.navigate('landing'));
await frame.waitForFunction(()=>!!document.querySelector('.landing-story'));
report.regressions.push('register CTA');
const ownership=await frame.evaluate(()=>{
 const foreign=ScrollTrigger.create({id:'qa-other-page',trigger:document.body,start:0,end:100});
 for(let i=0;i<5;i++)initLandingPage();
 const count=ScrollTrigger.getAll().length;
 _landingKill(); const survived=!!ScrollTrigger.getById('qa-other-page'); const after=ScrollTrigger.getAll().length;
 foreign.kill();initLandingPage();return{count,survived,after};
});
assert.deepEqual(ownership,{count:4,survived:true,after:1});
report.regressions.push('five repeated initializations; foreign ScrollTrigger preserved');
await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await pause(350);
assert.equal(await frame.evaluate(()=>ScrollTrigger.getAll().length),0);
await frame.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'analysis/landing/reduced-motion.png'});
await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);await pause(350);
assert.equal(await frame.evaluate(()=>ScrollTrigger.getAll().length),3);
report.regressions.push('live reduced-motion changes revert and rebuild');
await page.setViewport({width:390,height:844,hasTouch:true,isMobile:true}); frame=await waitFrame();await frame.waitForFunction(()=>window.ScrollTrigger?.getAll().length===3);await frame.waitForFunction(()=>getComputedStyle(document.querySelector('#black-mask-top')).pointerEvents==='none');await pause(500);
assert.equal(await frame.evaluate(()=>ScrollTrigger.getAll().length),3);
await frame.evaluate(()=>window.scrollTo(0,0));
await page.touchscreen.touchStart(190,650);for(let y=620;y>=250;y-=30){await page.touchscreen.touchMove(190,y);await pause(25);}await page.touchscreen.touchEnd();
await pause(500);
report.touchScrollY=await frame.evaluate(()=>scrollY);
assert(report.touchScrollY>0,'touch scroll failed');
await frame.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.dispatchEvent(new Event('resize'));});await pause(400);
report.regressions.push('desktop to phone resize, touch scroll, pageshow refresh event');
// Reload and no-animation / no-script fallbacks use the directly served child document.
await page.reload({waitUntil:'domcontentloaded'}); frame=await waitFrame();await frame.waitForFunction(()=>window.ScrollTrigger?.getAll().length===3);
report.regressions.push('reload');
const fallback=await browser.newPage();
await fallback.setRequestInterception(true);
fallback.on('request',r=>r.url().includes('/js/vendor/')?r.abort():r.continue());
await fallback.goto('http://localhost:3000/html/index.html',{waitUntil:'domcontentloaded'});await pause(500);
assert(await fallback.$('.lp-hero .lp-button'));
assert.equal(await fallback.$eval('.lp-product',e=>getComputedStyle(e).display),'block');
report.regressions.push('GSAP unavailable: content and links stay visible');
await fallback.close();
const nojs=await browser.newPage();await nojs.setJavaScriptEnabled(false);await nojs.setViewport({width:390,height:844});
await nojs.goto('http://localhost:3000/html/index.html',{waitUntil:'domcontentloaded'});
assert(await nojs.$('.lp-hero .lp-button'));await nojs.screenshot({path:'analysis/landing/no-js.png'});await nojs.close();
report.regressions.push('direct landing HTML with scripts disabled');
} catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{fs.writeFileSync('analysis/landing/qa-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
async function waitFrame(){await page.waitForSelector('#ifm');let f;for(let i=0;i<50;i++){f=page.frames().find(f=>f.url().includes('/html/index.html'));if(f&&await f.$('.landing-story'))return f;await pause(100);}throw Error('landing frame unavailable');}
})();


