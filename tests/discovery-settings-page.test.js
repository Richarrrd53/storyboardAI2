const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const status=(configured=false,savedAt=1)=>({configured,savedAt,youtube:{configured,source:configured?'browser':null},gemini:{configured,source:configured?'browser':null,mode:'developer'}});
const response=(data,ok=true)=>({ok,json:async()=>data});
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function node(){const events={},attrs={},classes=new Set();return {value:'',type:'password',textContent:'',dataset:{},disabled:true,hidden:false,focusCount:0,
 classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
 setAttribute(k,v){attrs[k]=String(v)},getAttribute:k=>attrs[k],focus(){this.focusCount++},
 addEventListener(k,fn){(events[k]??=new Set()).add(fn)},removeEventListener(k,fn){events[k]?.delete(fn)},
 async emit(type,event={}){const e={target:this,preventDefault(){this.defaultPrevented=true},...event};await Promise.all([...(events[type]||[])].map(fn=>fn(e)));},
 listenerCount(){return Object.values(events).reduce((sum,set)=>sum+set.size,0)},querySelectorAll(){return []}};}
function fixture(responses=[response(status())]){
 const ids=Object.fromEntries(['api-settings-form','key-fields','save-settings','settings-message','settings-status','return-search','retry-settings','youtube-key','gemini-key','youtube-status','gemini-status','gemini-hint'].map(id=>[id,node()]));
 const form=ids['api-settings-form'],fields=ids['key-fields'];const toggles=['youtube-key','gemini-key'].map(id=>{const n=node();n.dataset.toggle=id;n.closest=()=>n;return n;});
 form.querySelectorAll=selector=>selector==='[data-toggle]'?toggles:[];form.checkValidity=()=>true;fields.querySelectorAll=()=>[ids['youtube-key'],ids['gemini-key']];
 const root={querySelector:selector=>ids[selector.slice(1)]};const calls=[],pending=[...responses],document={readyState:'complete',getElementById:id=>ids[id]};
 const ctx={document,console,AbortController,AbortSignal,DOMException,FormData:class{constructor(){this.entries=[['youtubeApiKey',ids['youtube-key'].value],['geminiApiKey',ids['gemini-key'].value]];}[Symbol.iterator](){return this.entries[Symbol.iterator]();}},
 fetch(url,options){calls.push({url,...options});const next=pending.shift();if(!next)throw new Error('unexpected request');return typeof next==='function'?next(options):Promise.resolve(next);}};
 ctx.window=ctx;ctx.PageHost={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/js/discovery-settings.js','utf8'),ctx);
 const signal=new AbortController();const owner=ctx.initDiscoverySettingsPage({root,signal:signal.signal});
 return {ctx,root,ids,form,fields,toggles,calls,pending,signal,owner};
}
test('Settings mounts once, reads status only and exposes no persisted keys',async()=>{
 const f=fixture([response(status(true))]);assert.equal(f.fields.disabled,true);await tick();
 assert.equal(f.fields.disabled,false);assert.equal(f.ids['save-settings'].disabled,false);assert.equal(f.ids['youtube-key'].value,'');assert.equal(f.ids['youtube-key'].required,false);
 assert.equal(f.ctx.initDiscoverySettingsPage({root:f.root}),f.owner);assert.equal(f.calls.length,1);
 await f.form.emit('click',{target:f.toggles[0]});assert.equal(f.ids['youtube-key'].type,'text');assert.equal(f.toggles[0].getAttribute('aria-pressed'),'true');
 f.ids['youtube-key'].value='fixture-only';f.owner.unmount();assert.equal(f.ids['youtube-key'].value,'');assert.equal(f.ids['youtube-key'].type,'password');assert.equal(f.form.listenerCount(),0);assert.equal(f.calls[0].signal.aborted,true);
});
test('Settings load failure keeps save disabled and retry recovers without a page reload',async()=>{
 const f=fixture([response({error:'offline'},false),response(status())]);
 await f.form.emit('input');await tick();assert.equal(f.ids['retry-settings'].hidden,false);assert.equal(f.fields.disabled,true);assert.equal(f.ids['save-settings'].disabled,true);
 await f.ids['retry-settings'].emit('click');assert.equal(f.calls.length,2);assert.equal(f.fields.disabled,false);assert.equal(f.ids['youtube-key'].required,true);f.owner.unmount();
});
test('Settings single submit verifies persistence, clears inputs and focuses the return link',async()=>{
 let release;const f=fixture([response(status()),()=>new Promise(resolve=>{release=resolve}),response(status(true,5))]);await tick();
 f.ids['youtube-key'].value='fixture-youtube';f.ids['gemini-key'].value='fixture-gemini';
 const saved=f.form.emit('submit');await tick();await f.form.emit('submit');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);assert.equal(f.ids['save-settings'].disabled,true);
 release(response(status(true,5)));await saved;assert.equal(f.calls.length,3);assert.equal(f.ids['youtube-key'].value,'');assert.equal(f.ids['return-search'].hidden,false);assert.equal(f.ids['return-search'].focusCount,1);
 assert.equal(f.ids['settings-message'].classList.contains('is-success'),true);assert.equal(f.fields.disabled,false);f.owner.unmount();
});
test('Settings failed save and persistence mismatch preserve retryable input and hide success',async()=>{
 for(const responses of [[response({error:'provider failed'},false)],[response(status(true,5)),response(status(false,4))]]){
  const f=fixture([response(status()),...responses]);await tick();f.ids['youtube-key'].value='fixture-youtube';f.ids['gemini-key'].value='fixture-gemini';
  await f.form.emit('submit');assert.equal(f.ids['youtube-key'].value,'fixture-youtube');assert.equal(f.ids['return-search'].hidden,true);assert.equal(f.ids['settings-message'].classList.contains('is-success'),false);assert.equal(f.ids['save-settings'].disabled,false);f.owner.unmount();
 }
});
test('Settings late read or save cannot update detached UI or start a verification request',async()=>{
 for(const phase of ['load','save']){
  let release;const deferred=()=>new Promise(resolve=>{release=resolve});const f=fixture(phase==='load'?[deferred]:[response(status()),deferred]);await tick();
  let work;if(phase==='save'){f.ids['youtube-key'].value='fixture-only';work=f.form.emit('submit');await tick();}
  const before=f.ids['settings-status'].textContent;f.signal.abort();release(response(status(true,3)));if(work)await work;await tick();
  assert.equal(f.ids['settings-status'].textContent,before);assert.equal(f.calls.length,phase==='load'?1:2);assert.ok(f.calls.every(call=>call.signal.aborted));assert.equal(f.ids['return-search'].focusCount,0);assert.equal(f.ids['youtube-key'].value,'');
 }
});
