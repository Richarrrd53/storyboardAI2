const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const frames=new Map(),events=new Map(),queries=new Map();let next=0;
 const listen=(map,key,fn)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(fn);};
 const unlisten=(map,key,fn)=>map.get(key)?.delete(fn);
 function element(classes=''){
  const props={},classNames=new Set(classes.split(' ').filter(Boolean)),handlers=new Map();
  const el={dataset:{},children:[],isConnected:true,parentElement:null,scrollTop:0,scrollLeft:0,scrollWidth:300,clientWidth:300,scrollHeight:1000,clientHeight:300,offsetWidth:300,offsetHeight:300,offsetTop:0,
   style:{setProperty(k,v){props[k]=v;},removeProperty(k){delete props[k];},getPropertyValue:k=>props[k]||''},
   classList:{add(...names){names.forEach(n=>classNames.add(n));},remove(...names){names.forEach(n=>classNames.delete(n));},contains:n=>classNames.has(n),toggle(n,value){if(value)classNames.add(n);else classNames.delete(n);}},
   matches:s=>s.split(',').some(c=>classNames.has(c.trim().slice(1))),
   contains(n){return n===this||this.children.some(c=>c.contains(n));},setAttribute(){},querySelector(){return null;},querySelectorAll(){return[];},getAnimations(){return[];},
   getBoundingClientRect(){return{left:0,top:0,right:300,bottom:300,width:300,height:300};},
   appendChild(c){c.parentElement=this;this.children.push(c);},remove(){this.isConnected=false;this.parentElement.children=this.parentElement.children.filter(c=>c!==this);},
   addEventListener(k,fn){listen(handlers,k,fn);},removeEventListener(k,fn){unlisten(handlers,k,fn);},fire(k){for(const fn of handlers.get(k)||[])fn({});},props,handlers};return el;
 }
 const body=element(),owner=element();body.appendChild(owner);const scroll=element();owner.appendChild(scroll);
 const document={body,documentElement:body,activeElement:null,hidden:false,readyState:'loading',querySelector(){return null;},querySelectorAll(){return[];},getElementById(){return null;},createElement(){return element();},addEventListener(k,fn){listen(events,k,fn);},removeEventListener(k,fn){unlisten(events,k,fn);}};
 const window={innerWidth:390,innerHeight:844,addEventListener(){},requestAnimationFrame(fn){const id=++next;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},getComputedStyle(){return{position:'static',overflowX:'visible',overflowY:'visible',paddingTop:'0'};},matchMedia(key){if(!queries.has(key))queries.set(key,{matches:false,callbacks:new Set(),addEventListener(k,fn){this.callbacks.add(fn);},removeEventListener(k,fn){this.callbacks.delete(fn);}});return queries.get(key);}};
 const context=vm.createContext({window,document,performance:{now:()=>10},setTimeout});vm.runInContext(fs.readFileSync('public/js/dynamic-mask.js','utf8'),context);
 const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());};
 const fire=k=>{for(const fn of events.get(k)||[])fn();};return{window,document,scroll,owner,element,frames,events,queries,flush,fire};
}
test('dynamic mask focus removes attenuation, focusout restores hint, end of scroll removes fade',()=>{
 const f=fixture(),inst=f.window.DynamicMaskSystem.attach(f.scroll);
 assert.match(f.scroll.props['mask-image'],/transparent/);
 const control=f.element();f.scroll.appendChild(control);f.document.activeElement=control;f.scroll.fire('focusin');f.flush();assert.equal(f.scroll.props['mask-image'],undefined);
 f.document.activeElement=null;f.scroll.fire('focusout');f.flush();assert.match(f.scroll.props['mask-image'],/transparent/);
 f.scroll.scrollTop=700;inst.update();assert.doesNotMatch(f.scroll.props['mask-image'],/transparent 100%/);inst.destroy();
});
test('dynamic mask coalesces events, suspends RAF while hidden and releases every local listener',()=>{
 const f=fixture(),inst=f.window.DynamicMaskSystem.attach(f.scroll);inst.scheduleUpdate();inst.scheduleUpdate();assert.equal(f.frames.size,1);
 f.document.hidden=true;f.fire('visibilitychange');assert.equal(f.frames.size,0);inst.scheduleUpdate();assert.equal(f.frames.size,0);
 f.document.hidden=false;f.fire('visibilitychange');assert.equal(f.frames.size,1);f.flush();
 const motion=f.queries.get('(prefers-reduced-motion: reduce)');motion.matches=true;for(const fn of motion.callbacks)fn();assert.equal(f.frames.size,1);
 inst.destroy();inst.destroy();assert.equal(f.frames.size,0);assert.equal(motion.callbacks.size,0);assert.equal(f.events.get('visibilitychange').size,0);assert.equal(f.scroll.handlers.get('focusin').size,0);
 inst.scheduleUpdate();assert.equal(f.frames.size,0);
});
test('dynamic mask header stays revealed for reduced motion without changing normal scroll thresholds',()=>{
 const f=fixture(),inst=f.window.DynamicMaskSystem.attach(f.scroll),header=f.element();
 inst.header=header;inst.headerHost=f.owner;inst.headerTravel=100;inst.lastTop=0;inst.lastTime=0;inst.setHeaderScrolled(400,700);
 assert.equal(inst.hiddenDistance,100);inst.motionQuery.matches=true;inst.setHeaderScrolled(500,700);assert.equal(inst.hiddenDistance,0);assert.equal(header.inert,false);assert.equal(inst.headerVisibility,1);assert.equal(inst.headerScrolled,false);inst.destroy();
});
test('navigation publication does not wake standalone horizontal masks',()=>{
 const f=fixture(),inst=f.window.DynamicMaskSystem.attach(f.scroll,{direction:'horizontal'});f.window.DynamicMaskSystem.setNavigation('bottom',{enabled:true,progress:1});assert.equal(f.frames.size,0);inst.destroy();
});
