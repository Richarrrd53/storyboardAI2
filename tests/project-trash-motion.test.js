const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(reduced=false) {
  const raf=new Map(),listeners=new Set();let id=0;
  const motion={matches:reduced,addEventListener:(name,fn)=>listeners.add(fn),removeEventListener:(name,fn)=>listeners.delete(fn)};
  const lid={style:{},getBoundingClientRect:()=>({left:50,top:200,width:112,height:22})};
  const bin={style:{},querySelector:()=>lid};
  const preview={style:{},clientWidth:173,isConnected:true,getBoundingClientRect:()=>({left:20,top:20,width:173,height:206})};
  const root={performance:{now:()=>0},ProjectCard:{captureGeometry:()=>({width:173,shape:'folder'})},matchMedia:()=>motion,
    requestAnimationFrame:fn=>{raf.set(++id,fn);return id;},cancelAnimationFrame:key=>raf.delete(key)};
  vm.runInNewContext(fs.readFileSync('public/js/components/project-trash-motion.js','utf8'),{window:root});
  const step=time=>{const work=[...raf.values()];raf.clear();work.forEach(fn=>fn(time));};
  return {root,preview,bin,lid,raf,motion,listeners,step};
}
test('trash flight starts at the real preview and ends inside the measured mouth',()=>{
  const e=environment(),g=e.root.ProjectTrashMotion.measure(e.preview,e.bin);
  const start=e.root.ProjectTrashMotion.sample(g,0),end=e.root.ProjectTrashMotion.sample(g,1);
  assert.equal(start.scale,1);assert.ok(start.x===0);assert.ok(start.y===0);assert.equal(start.opacity,1);
  assert.equal(end.x,g.dx);assert.equal(end.y,g.dy);assert.equal(end.opacity,0);assert.ok(end.scale>0&&end.scale<=.35);
  assert.ok(e.root.ProjectTrashMotion.sample(g,.25).y<0);assert.equal(g.snapshot.shape,'folder');
});
test('trash flight has identical endpoints at 60Hz and 120Hz, with no per-frame layout reads',async()=>{
  const results=[];
  for(const hz of [60,120]) {
    const e=environment();let reads=0;const original=e.preview.getBoundingClientRect;
    e.preview.getBoundingClientRect=()=>{reads++;return original();};
    const run=e.root.ProjectTrashMotion.animate({preview:e.preview,bin:e.bin});
    const initialReads=reads;e.step(0);for(let n=1;n<hz;n++)e.step(n*1000/hz);e.step(1000);
    assert.equal((await run.finished).cancelled,false);assert.equal(reads,initialReads);assert.equal(e.raf.size,0);assert.equal(e.listeners.size,0);
    results.push(e.preview.style.transform);
  }
  assert.equal(results[0],results[1]);
});
test('abort / detached preview cancel RAF and cannot write a stale frame',async()=>{
  const e=environment(),abort=new AbortController();
  const run=e.root.ProjectTrashMotion.animate({preview:e.preview,bin:e.bin,signal:abort.signal});e.step(0);e.step(300);
  const before=e.preview.style.transform;abort.abort();e.step(900);
  assert.equal(e.preview.style.transform,before);assert.equal((await run.finished).cancelled,true);assert.equal(e.raf.size,0);assert.equal(e.listeners.size,0);
  const next=e.root.ProjectTrashMotion.animate({preview:e.preview,bin:e.bin});e.preview.isConnected=false;e.step(1000);assert.equal((await next.finished).cancelled,true);
});
test('reduced motion skips flight; preference change also releases the active timeline',async()=>{
  const e=environment(true);const run=e.root.ProjectTrashMotion.animate({preview:e.preview,bin:e.bin});
  assert.equal(e.raf.size,0);assert.equal(e.preview.style.opacity,'0');assert.equal((await run.finished).cancelled,false);
  e.motion.matches=false;const next=e.root.ProjectTrashMotion.animate({preview:e.preview,bin:e.bin});e.step(0);
  e.motion.matches=true;[...e.listeners].forEach(fn=>fn());assert.equal((await next.finished).cancelled,false);assert.equal(e.raf.size,0);
});

test('delayed first RAF uses intent time, and close can complete the narrative without another frame',async()=>{
 const e=environment();const run=e.root.ProjectTrashMotion.animate({preview:e.preview,bin:e.bin});e.step(850);
 const expected=e.root.ProjectTrashMotion.sample(run.geometry,.85);assert.equal(e.preview.style.opacity,String(expected.opacity));
 run.complete();assert.equal((await run.finished).cancelled,false);assert.equal(e.preview.style.opacity,'0');assert.equal(e.raf.size,0);
});
