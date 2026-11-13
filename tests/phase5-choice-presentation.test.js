const test=require('node:test');
const assert=require('node:assert/strict');
const Choice=require('../public/js/components/choice-group.js');
const Presentation=require('../public/js/components/template-presentation.js');
function fixture(){
 const listeners=new Set(), group={setAttribute(){},querySelectorAll(){return items;},addEventListener(type,fn){listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}};
 const items=Array.from({length:4},(_,index)=>({attrs:{'aria-checked':String(index===0)},disabled:false,hidden:false,clicks:0,
 setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]??null;},removeAttribute(k){delete this.attrs[k];},
 closest(selector){return selector==='[data-choice-option]'?this:this.fieldsetDisabled?{}:null;},
 focus(){group.focused=this;},click(){this.clicks++;Choice.sync(group,this);}}));
 const key=(key,target=group.focused||items[0],extra={})=>{const event={key,target,preventDefault(){this.prevented=true;},...extra};for(const fn of listeners)fn(event);return event;};
 return {group,items,listeners,key};
}
test('choice group has one selected radio and a single tab stop, without legacy pressed semantics',()=>{
 const f=fixture();f.items[0].attrs['aria-pressed']='true';Choice.mount(f.group);
 assert.deepEqual(f.items.map(i=>i.tabIndex),[0,-1,-1,-1]);assert.equal(f.items[0].attrs['aria-pressed'],undefined);
 f.key('ArrowRight');assert.equal(f.group.focused,f.items[1]);assert.equal(f.items[1].clicks,1);
 assert.deepEqual(f.items.map(i=>i.attrs['aria-checked']),['false','true','false','false']);
 f.key('End');assert.equal(f.group.focused,f.items[3]);f.key('ArrowRight');assert.equal(f.group.focused,f.items[0]);
 f.key('Home',f.items[2]);assert.equal(f.group.focused,f.items[0]);
});
test('choice group skips native, aria and fieldset disabled options and hidden options',()=>{
 const f=fixture();Choice.mount(f.group);f.items[1].disabled=true;f.items[2].attrs['aria-disabled']='true';
 f.key('ArrowDown');assert.equal(f.group.focused,f.items[3]);
 f.items[1].disabled=false;f.items[1].fieldsetDisabled=true;f.items[2].attrs['aria-disabled']='false';f.items[2].hidden=true;
 f.key('ArrowUp');assert.equal(f.group.focused,f.items[0]);
 assert.equal(f.items[1].clicks+f.items[2].clicks,0);
});
test('choice remount and abort have one keyboard owner and release listeners',()=>{
 const f=fixture(),controller=new AbortController();Choice.mount(f.group);Choice.mount(f.group,{signal:controller.signal});
 assert.equal(f.listeners.size,1);f.key('ArrowRight');assert.equal(f.items[1].clicks,1);
 controller.abort();assert.equal(f.listeners.size,0);f.key('ArrowRight');assert.equal(f.items[2].clicks,0);
 Choice.mount(f.group,{signal:controller.signal});assert.equal(f.listeners.size,0);
});
test('choice retains native Enter/Space and modified arrows, supports RTL and no selection',()=>{
 const f=fixture();for(const item of f.items)item.attrs['aria-checked']='false';Choice.mount(f.group);
 assert.equal(f.items[0].tabIndex,0);assert.ok(f.items.every(i=>i.attrs['aria-checked']==='false'));
 for(const key of ['Enter',' ','Tab'])assert.equal(f.key(key).prevented,undefined);
 assert.equal(f.key('ArrowRight',f.items[0],{ctrlKey:true}).prevented,undefined);
 const prior=global.getComputedStyle;global.getComputedStyle=()=>({direction:'rtl'});
 try{f.key('ArrowLeft');assert.equal(f.group.focused,f.items[1]);f.key('ArrowRight');assert.equal(f.group.focused,f.items[0]);}finally{global.getComputedStyle=prior;}
});
test('display excerpts remove source promotion links and hashtags while preserving frozen source verbatim',()=>{
 const template=Object.freeze({name:'咖啡片頭 #品牌 https://example.test/promo',tags:Object.freeze(['品牌','Brand','brand']),source:Object.freeze({title:'  原始名稱 #品牌\n',description:'  晨光、咖啡與工作桌。\nhttps://example.test/sale #咖啡  '})});
 const p=Presentation.present(template);assert.equal(p.title,'咖啡片頭');assert.equal(p.summary,'晨光、咖啡與工作桌。');
 assert.equal(p.rawTitle,template.source.title);assert.equal(p.rawDescription,template.source.description);
 assert.equal(p.summaryLabel,'來源說明摘錄');assert.deepEqual(p.tags,['品牌','Brand']);
});
test('explicit editorial copy is respected and long summaries keep full content separately',()=>{
 const summary='🎬 創作 #保留 https://example.test/reference '+ '鏡頭'.repeat(200);
 const p=Presentation.present({displayTitle:'有意義的 #創作名稱',displaySummary:summary});
 assert.equal(p.title,'有意義的 #創作名稱');assert.equal(p.summaryFull,summary);assert.equal(p.summaryLabel,'內容摘要');
 assert.equal(Array.from(p.summary).length,240);assert.ok(p.summary.endsWith('…'));
});
test('unknown source metadata is explicit, durations only derive from fully known shots',()=>{
 assert.equal(Presentation.durationOf({}),null);assert.equal(Presentation.shotCountOf({}),null);
 assert.equal(Presentation.durationOf({structure:[{duration:'2.5s'},{duration:'3 秒'}]}),5.5);
 assert.equal(Presentation.durationOf({structure:[{duration:'2.5s'},{}]}),null);
 assert.equal(Presentation.durationOf({duration:'15junk'}),null);assert.equal(Presentation.durationOf({duration:0}),null);
 assert.equal(Presentation.shotCountOf({structure:[]}),0);assert.equal(Presentation.shotCountOf({shotsCount:-2}),null);
 assert.equal(Presentation.externalUrl('javascript:alert(1)'), '');assert.equal(Presentation.externalUrl('data:text/html,bad'), '');
 assert.equal(Presentation.externalUrl('https://example.test/watch'),'https://example.test/watch');
 assert.equal(Presentation.present({}).summaryLabel,'內容說明');
});

test('Generate ratio selection updates the existing brief once and disabled choices never write',()=>{
 const fs=require('node:fs'),vm=require('node:vm');const writes=[];
 const state={ratio:'直向9:16',creativeBrief:{confirmed:{}},selectedTemplate:null};
 const choices=['直向9:16','橫向16:9'].map(ratio=>({dataset:{ratio},attrs:{},disabled:false,classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||null;}}));
 const group={setAttribute(){},querySelectorAll(){return choices;}};
 choices.forEach(c=>{c.closest=()=>null;c.removeAttribute=k=>delete c.attrs[k];});
 const document={getElementById:id=>id==='ratio-chips-grid'?group:null,querySelectorAll:selector=>selector==='.ratio-chip'?choices:[],querySelector:selector=>selector==='.ratio-chip.active'?choices.find(c=>c.attrs['aria-checked']==='true'):null};
 const window={CreationSessionStore:state,CreativeBrief:{edit(brief,patch){writes.push(patch);}},ChoiceGroup:Choice};
 vm.runInNewContext(fs.readFileSync('public/js/generate.js','utf8'),{window,document,console});
 window.selectRatioOption(choices[1]);assert.equal(state.ratio,'橫向16:9');assert.deepEqual(writes.map(p=>p.ratio),['16:9']);
 assert.deepEqual(choices.map(c=>c.attrs['aria-checked']),['false','true']);
 choices[0].disabled=true;window.selectRatioOption(choices[0]);choices[0].disabled=false;choices[0].attrs['aria-disabled']='true';window.selectRatioOption(choices[0]);
 assert.equal(state.ratio,'橫向16:9');assert.equal(writes.length,1);
 const html=fs.readFileSync('public/html/generate.html','utf8');assert.doesNotMatch(html,/onclick=["'][^"']*selectRatioOption/);
});
