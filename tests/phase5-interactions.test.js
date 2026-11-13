const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function node(){const handlers={},attributes={};return {style:{},dataset:{},scrollLeft:100,offsetHeight:500,isConnected:true,classList:{add(){},remove(){}},setAttribute(k,v){attributes[k]=v},getAttribute:k=>attributes[k],contains(target){return target?.panel===this},focus(){},addEventListener(k,fn){(handlers[k]??=new Set()).add(fn)},removeEventListener(k,fn){handlers[k]?.delete(fn)},emit(k,e={}){for(const fn of handlers[k]||[])fn({preventDefault(){},...e})}};}
test('filmstrip captures only a real drag, preserves clicks and keyboard after drag, cleans up',()=>{
 const slider=node(),frame=node();frame.dataset.shotId='one';const captures=[],releases=[],opened=[];
 slider.setPointerCapture=id=>captures.push(id);slider.releasePointerCapture=id=>releases.push(id);
 const root={querySelector:()=>slider,querySelectorAll:sel=>sel==='.project-film-frame'?[frame]:[]};
 const ctx={window:{},document:{},console,cancelAnimationFrame(){},requestAnimationFrame(){return 1},clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/js/project-detail.js','utf8'),ctx);
 const controller=ctx.window.ProjectDetailController;controller._root=root;controller.openEditor=id=>opened.push(id);controller._bindFilmstripScroll();controller._bindShotSelection();
 for(const dx of [0,4,6]) {
  slider.emit('pointerdown',{pointerId:1,button:0,clientX:20,target:{closest:()=>null}});assert.equal(captures.length,0);
  slider.emit('pointermove',{pointerId:1,clientX:20+dx});slider.emit('pointerup',{pointerId:1});
  assert.equal(slider._didDrag(),dx>5);
  frame.emit('click');
 }
 assert.equal(captures.length,1);assert.deepEqual(releases,[1]);assert.deepEqual(opened,['one','one']);
 frame.emit('keydown',{key:'Enter'});assert.deepEqual(opened,['one','one','one']);
 slider.emit('pointerdown',{pointerId:2,button:0,pointerType:'touch',clientX:0});slider.emit('pointermove',{pointerId:2,clientX:60});assert.equal(captures.length,1);
 slider.emit('pointerdown',{pointerId:3,button:0,clientX:0,target:{closest:()=>null}});slider.emit('pointermove',{pointerId:3,clientX:6});slider.emit('pointercancel',{pointerId:3});
 controller._filmstripCleanup();assert.deepEqual(releases,[1,3]);
 slider.emit('pointerdown',{pointerId:4,button:0,clientX:0});slider.emit('pointermove',{pointerId:4,clientX:6});assert.equal(captures.length,2);
});
function auth(){const ids=Object.fromEntries(['panel-login','panel-register','auth-inner','tab-login','tab-register','login-password','inputShow12','inputShowMask12','showBtn1'].map(id=>[id,node()]));
 ids['login-password'].type='password';const document={getElementById:id=>ids[id],activeElement:null};
 const root={isConnected:true,querySelector:sel=>ids[sel.slice(1)],querySelectorAll:sel=>sel==='.auth-panel'?[ids['panel-login'],ids['panel-register']]:[]};
 let sequence=0;const timers=new Map(),ctx={document,console,setTimeout(fn){timers.set(++sequence,fn);return sequence},clearTimeout:id=>timers.delete(id)};ctx.window=ctx;ctx.AuthEffects={mount:()=>()=>{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('public/js/pages/auth-page.js','utf8'),ctx);
 return {ctx,ids,document,root,flush(){for(const fn of timers.values())fn();timers.clear()}};
}
test('Auth exposes only the active face, persistent labels and password-control state',()=>{
 const e=auth(),instance=e.ctx.AuthPage.mount({root:e.root,navigate(){}});
 assert.equal(e.ids['panel-login'].inert,false);assert.equal(e.ids['panel-register'].inert,true);
 e.ctx.switchTab('register');assert.equal(e.ids['panel-login'].getAttribute('aria-hidden'),'true');assert.equal(e.ids['panel-register'].inert,false);
 e.ctx.switchTab('login');e.ctx.togglePwd('login-password',1);e.flush();assert.equal(e.ids['login-password'].type,'text');assert.equal(e.ids.showBtn1.getAttribute('aria-label'),'隱藏密碼');
 e.ctx.togglePwd('login-password',1);instance.unmount();e.flush();assert.equal(e.ids['login-password'].type,'text');assert.equal(e.ctx.switchTab,undefined);
 const html=fs.readFileSync('public/html/login.html','utf8');for(const id of ['login-email','login-password','register-username','register-email','register-password','register-password-2'])assert.ok(html.includes('<label for="'+id+'">'));
});
