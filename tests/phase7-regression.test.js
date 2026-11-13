const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function clock(){
 let now=0,next=0;const timers=new Map();
 const setTimeout=(fn,ms=0)=>{const id=++next;timers.set(id,{fn,at:now+ms});return id;};
 const advance=async(ms)=>{const end=now+ms;while(true){const entries=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at);if(!entries.length)break;const[id,timer]=entries[0];timers.delete(id);now=timer.at;timer.fn();await Promise.resolve();await Promise.resolve();}now=end;};
 return{timers,setTimeout,clearTimeout:id=>timers.delete(id),advance};
}
function queueFixture(){
 const time=clock(),context={console:{error(){}},setTimeout:time.setTimeout,clearTimeout:time.clearTimeout,module:{exports:{}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('public/js/features/projects.js','utf8'),context);
 const feature=context.module.exports;let requests=0;feature.api.deleteProject=async()=>{requests++;return{ok:true};};
 return{time,...feature,requests:()=>requests};
}
test('Phase7 isolated Undo remains available at 4999ms and prevents every later DELETE',async()=>{
 const f=queueFixture(),project={id:'phase7-undo',is_deleted:true};const entry=f.deleteQueue.enqueue(project);
 await f.time.advance(4999);assert.equal(f.requests(),0);assert.equal(entry.status,'pending');assert.equal(f.deleteQueue.undo(project.id),true);
 await f.time.advance(20000);assert.equal(f.requests(),0);assert.equal(project.is_deleted,false);assert.equal(f.deleteQueue.pending.size,0);
});
test('Phase7 isolated default delete deadline submits once at 5000ms, not before',async()=>{
 const f=queueFixture(),project={id:'phase7-deadline',is_deleted:false};const entry=f.deleteQueue.enqueue(project);
 await f.time.advance(4999);assert.equal(f.requests(),0);await f.time.advance(1);assert.equal(f.requests(),1);assert.equal(entry.status,'committed');assert.equal(project.is_deleted,true);
 await f.time.advance(20000);assert.equal(f.requests(),1);assert.equal(f.deleteQueue.undo(project.id),false);
});
function modalFixture(reduced){
 const time=clock(),context={setTimeout:time.setTimeout,clearTimeout:time.clearTimeout,matchMedia:()=>({matches:reduced})};context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync('public/js/sys.js','utf8'),context);
 const element=()=>({style:{webkitBackdropFilter:''},classList:{add(){},remove(){}}});return{time,owner:context.ModalAnimation,overlay:element(),panel:element()};
}
test('Phase7 reduced modal close still completes exactly once and keeps backdrop alpha',async()=>{
 const f=modalFixture(true);let completed=0;f.owner.open(f.overlay,f.panel);const background=f.overlay.style.background;
 assert.equal(f.panel.style.scale,'1');f.owner.close(f.overlay,f.panel,{onComplete(){completed++;}});await f.time.advance(10);
 assert.equal(f.panel.style.scale,'0');assert.equal(f.overlay.style.webkitBackdropFilter,'blur(0px)');assert.equal(f.overlay.style.background,background);
 await f.time.advance(40);assert.equal(completed,1);assert.equal(f.overlay.style.display,'none');await f.time.advance(5000);assert.equal(completed,1);
});
test('Phase7 re-entry during close retires the old completion without hiding the successor',async()=>{
 const f=modalFixture(false);let stale=0;f.owner.open(f.overlay,f.panel);await f.time.advance(410);
 f.owner.close(f.overlay,f.panel,{onComplete(){stale++;}});await f.time.advance(200);f.owner.open(f.overlay,f.panel);await f.time.advance(1000);
 assert.equal(stale,0);assert.equal(f.overlay.style.display,'flex');assert.equal(f.panel.style.scale,'1');f.owner.cancel(f.overlay);
});
