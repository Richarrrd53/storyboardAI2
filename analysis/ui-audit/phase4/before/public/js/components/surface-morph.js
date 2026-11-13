/** Shared Surface Morph: geometry/timeline/session only. No project or account data. */
(function(root) {
  'use strict';
  const doc = root.document || document;
  let current = null, sequence = 0;
  const now = () => root.performance?.now ? root.performance.now() : Date.now();
  const raf = callback => (root.requestAnimationFrame || requestAnimationFrame)(callback);
  const cancel = id => (root.cancelAnimationFrame || cancelAnimationFrame)(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a,b,t) => a + (b-a)*t;
  const reduced = () => !!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const immediateReasons = new Set(['navigation','unmount','destroy','immediate','resize','scroll','modal','trigger_removed','focus_out','tab']);
  function createCubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;

    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;

    function sampleCurveX(t) {
      return ((ax * t + bx) * t + cx) * t;
    }
    function sampleCurveY(t) {
      return ((ay * t + by) * t + cy) * t;
    }
    function sampleCurveDerivativeX(t) {
      return (3 * ax * t + 2 * bx) * t + cx;
    }

    function solveCurveX(x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) {
        const currentX = sampleCurveX(t) - x;
        if (Math.abs(currentX) < 1e-6) return t;
        const dX = sampleCurveDerivativeX(t);
        if (Math.abs(dX) < 1e-6) break;
        t -= currentX / dX;
      }
      let t0 = 0, t1 = 1;
      t = x;
      while (t0 < t1) {
        const currentX = sampleCurveX(t);
        if (Math.abs(currentX - x) < 1e-6) return t;
        if (x > currentX) t0 = t;
        else t1 = t;
        t = (t1 + t0) / 2;
      }
      return t;
    }

    return function (x) {
      return sampleCurveY(solveCurveX(x));
    };
  }

  const easeStandard = createCubicBezier(0.4, 0, 0.2, 1);

  function getQuadraticBezierPoint(p0, p1, p2, t) {
    const inv = 1 - t;
    return {
      x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
      y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y
    };
  }


  function readRect(trigger) {
    const rect = trigger.getBoundingClientRect?.() || {};
    const left = Number(rect.left) || 0, top = Number(rect.top) || 0;
    const width = Math.max(1, Number(rect.width) || 48), height = Math.max(1, Number(rect.height) || 36);
    return {left,top,width,height,right:rect.right ?? left+width,bottom:rect.bottom ?? top+height};
  }
  function viewport() {
    const v=root.visualViewport;
    return {left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||root.innerWidth||1200,height:v?.height||root.innerHeight||800};
  }
  function copyTrigger(trigger, icon) {
    icon.innerHTML=''; icon.classList.add('morph-icon--trigger'); icon.setAttribute('aria-hidden','true'); icon.inert=true;
    for (const child of Array.from(trigger.childNodes || trigger.children || [])) {
      const clone=child.cloneNode(true); clone.removeAttribute?.('id');
      clone.querySelectorAll?.('[id]').forEach(node=>node.removeAttribute('id')); icon.appendChild(clone);
    }
    const style=root.getComputedStyle?.(trigger);
    if(style) for(const key of ['font','color','padding','gap','justifyContent']) icon.style[key]=style[key];
  }
  function frame(session, geometry) {
    session.frame=geometry;
    const {w,h,x,y,r,scale=1,icon=0}=geometry, menu=session.menu;
    menu.style.width=`${w.toFixed(2)}px`; menu.style.height=`${h.toFixed(2)}px`;
    menu.style.left=`${(x-w/2).toFixed(2)}px`; menu.style.top=`${(y-h/2).toFixed(2)}px`;
    menu.style.borderRadius=`${Math.max(0,r).toFixed(2)}px`; menu.style.transform=`scale(${scale.toFixed(4)})`;
    session.icon.style.opacity=String(icon); session.icon.style.filter=`blur(${(4*(1-icon)).toFixed(2)}px)`;
    session.icon.style.transform=`scale(${(.7+.3*icon).toFixed(3)})`;
  }
  function openedFrame(s) { const b=s.bounds;return {w:b.width,h:b.height,x:b.left+b.width/2,y:b.top+b.height/2,r:s.radius,scale:1,icon:0}; }
  function triggerFrame(rect) {return {w:rect.width,h:rect.height,x:rect.left+rect.width/2,y:rect.top+rect.height/2,r:Math.min(rect.width,rect.height)/2,scale:1,icon:1};}
  // Original brand schedule: dissolve70; button->dot80; flight30..260; expand90..350; settle480.
  function opening(s,t) {
    const b=s.bounds, rect=s.origin, end=openedFrame(s);
    const flight=t<30?s.p0:t<=260?getQuadraticBezierPoint(s.p0,s.p1,s.p2,easeStandard((t-30)/230)):s.p2;
    let result;
    if(t<80) {const p=easeStandard(t/80);result={w:lerp(rect.width,20,p),h:lerp(rect.height,20,p),x:flight.x,y:flight.y,r:lerp(Math.min(rect.width,rect.height)/2,10,p)};}
    else if(t<90) result={w:20,h:20,x:flight.x,y:flight.y,r:10};
    else if(t<350) {const p=easeStandard((t-90)/260);result={w:lerp(20,b.width,p),h:lerp(20,b.height,p),x:flight.x+(end.x-s.p2.x)*p,y:flight.y+(end.y-s.p2.y)*p,r:lerp(10,s.radius,p)};}
    else result={...end};
    result.icon=t<=70?1-easeStandard(t/70):0;
    result.scale=t>=350&&t<480?1+.010*Math.sin((t-350)/130*Math.PI)*(1-.25*(t-350)/130):1;
    return result;
  }
  function closing(s,t,target) {
    const end=openedFrame(s), p0={x:target.x,y:target.y};
    const control={x:(p0.x+s.p2.x)/2,y:Math.min(p0.y,s.p2.y)-14};
    const flight=t<=30?s.p2:t<=230?getQuadraticBezierPoint(s.p2,control,p0,easeStandard((t-30)/200)):p0;
    if(t<40) return {...end};
    if(t<180) {const p=easeStandard((t-40)/140);return {w:lerp(end.w,20,p),h:lerp(end.h,20,p),x:flight.x+(end.x-s.p2.x)*(1-p),y:flight.y+(end.y-s.p2.y)*(1-p),r:lerp(s.radius,10,p),icon:0};}
    if(t<230) return {w:20,h:20,x:flight.x,y:flight.y,r:10,icon:0};
    if(t<440) {const p=easeStandard((t-230)/210);return {w:lerp(20,target.w,p),h:lerp(20,target.h,p),x:p0.x,y:p0.y,r:lerp(10,target.r,p),scale:1+.004*Math.sin(p*Math.PI)*(1-.5*p),icon:p<=.35?0:easeStandard((p-.35)/.65)};}
    return target;
  }
  function blend(from,to,p) {
    const result={}; for(const key of ['w','h','x','y','r','scale','icon']) result[key]=lerp(from[key]??(key==='scale'?1:0),to[key]??(key==='scale'?1:0),p);
    return result;
  }
  function run(s,duration,sample,done) {
    if(s.raf) cancel(s.raf); const started=now();
    const tick=time=>{
      if(current!==s||s.disposed) return;
      if(s.trigger.isConnected===false) {finish(s,'trigger_removed',false);return;}
      const elapsed=reduced()?duration:clamp((typeof time==='number'?time:now())-started,0,duration);
      frame(s,sample(elapsed));
      if(elapsed>=duration) {s.raf=null;done();} else s.raf=raf(tick);
    };
    if(reduced()) tick(started+duration); else s.raf=raf(tick);
  }
  function focusItems(s) {
    return Array.from(s.menu.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')).filter(el=>!el.disabled&&el.getAttribute?.('aria-disabled')!=='true'&&!el.hidden);
  }
  function settle(s) {
    s.phase='open'; s.menu.inert=false;s.menu.classList.add('is-settled','is-content-visible'); s.menu.style.willChange='auto';
    if(s.opts.keepTrigger) s.trigger.classList.remove('is-hidden-for-morph','surface-morph-trigger-hidden');
    const items=focusItems(s); if(s.opts.keyboard!=='content') items.forEach((el,index)=>{el.tabIndex=index? -1:0;});
    (items[0]||s.menu).focus?.({preventScroll:true}); s.opts.onOpened?.(s.menu);
  }
  function finish(s,reason,restore=true) {
    if(!s||s.disposed) return;
    s.disposed=true; if(s.raf) cancel(s.raf);s.lease?.release(); s.motion?.removeEventListener?.('change',s.onMotion);
    s.trigger.classList?.remove('is-hidden-for-morph','surface-morph-trigger-hidden');s.trigger.setAttribute?.('aria-expanded','false');
    s.menu.style.willChange='auto'; s.overlay.remove?.();
    if(s.overlay.parentNode?.removeChild) s.overlay.parentNode.removeChild(s.overlay);
    if(current===s) current=null;
    s.opts.onClose?.(reason);
    if(restore&&s.opts.returnFocus!==false&&s.trigger.isConnected!==false&&!s.trigger.closest?.('[inert]')) s.trigger.focus?.({preventScroll:true});
    s.resolve({reason});
    const callbacks=s.callbacks.splice(0); if(!['navigation','unmount','destroy','trigger_removed','modal'].includes(reason)) callbacks.forEach(fn=>fn());
  }
  function close(reason,complete) {
    if(typeof reason==='function') {complete=reason;reason=null;}
    const s=current; if(!s) {complete?.();return;}
    if(complete) s.callbacks.push(complete);
    if(immediateReasons.has(reason)||reduced()) {finish(s,reason||'close',!['navigation','unmount','destroy','modal','focus_out','trigger_removed'].includes(reason));return;}
    if(s.phase==='closing') return;
    s.trigger.classList.add('is-hidden-for-morph','surface-morph-trigger-hidden');
    const wasOpen=s.phase==='open', start={...s.frame};s.phase='closing';s.closeReason=reason||'close';
    s.trigger.setAttribute?.('aria-expanded','false');s.menu.inert=true;s.menu.classList.remove('is-settled','is-content-visible');s.menu.classList.add('is-items-collapsing');
    const target=triggerFrame(readRect(s.trigger));s.menu.style.willChange='width,height,left,top,border-radius,transform';
    // A reversal starts from the last rendered frame, never a reset to expanded bounds.
    run(s,440,t=>wasOpen?closing(s,t,target):blend(start,target,easeStandard(t/440)),()=>finish(s,s.closeReason));
  }
  function open(trigger,opts={}) {
    if(!trigger||!opts.content||opts.signal?.aborted) return null;
    if(!root.OverlayManager?.acquirePopover) throw new Error('SurfaceMorph requires OverlayManager');
    if(current?.trigger===trigger) {
      const s=current;
      if(s.phase!=='closing') {close('toggle');return s.handle;}
      if(s.closeReason==='action') {finish(s,'action');} else {
        const start={...s.frame};s.phase='opening';s.callbacks.length=0;
        s.trigger.setAttribute?.('aria-expanded','true');s.menu.inert=false;s.menu.classList.remove('is-items-collapsing');s.menu.classList.add('is-content-visible');
        run(s,480,t=>blend(start,openedFrame(s),easeStandard(t/480)),()=>settle(s));return s.handle;
      }
    }
    if(current) finish(current,current.closeReason==='action'?'action':'replaced',false);
    const origin=readRect(trigger),v=viewport(),overlay=doc.createElement('div'),menu=doc.createElement('div');
    overlay.className='surface-morph-overlay project-option-overlay is-active';menu.className='surface-morph-surface global-project-option-menu morph-dropdown-surface'+(opts.className?' '+opts.className:'');
    menu.id=opts.id||`surface-morph-${++sequence}`;menu.tabIndex=-1;menu.setAttribute('role',opts.role||'menu');menu.setAttribute('aria-label',opts.label||'選單');
    if(opts.role==='dialog') menu.setAttribute('aria-modal','false');
    const icon=doc.createElement('span');icon.className='morph-icon';icon.setAttribute('aria-hidden','true');icon.inert=true;
    if(opts.triggerIconHTML) icon.innerHTML=opts.triggerIconHTML;else copyTrigger(trigger,icon);
    const content=doc.createElement('div');content.className='morph-menu-content';content.appendChild(opts.content);menu.appendChild(icon);menu.appendChild(content);overlay.appendChild(menu);
    if(opts.role==='dialog') overlay.style.zIndex='var(--layer-popover)';
    const width=Math.max(1,Math.min(Number(opts.width)||240,v.width-24));
    let height=Number(opts.height)||240;
    try {
      const measure=doc.createElement('div');measure.className=menu.className;measure.style.cssText=`position:fixed;left:-9999px;top:0;width:${width}px;height:auto;visibility:hidden;pointer-events:none;`;
      const clone=content.cloneNode(true);clone.querySelectorAll?.('[id]').forEach(node=>node.removeAttribute('id'));clone.style.position='static';clone.style.opacity='1';measure.appendChild(clone);doc.body.appendChild(measure);
      const measured=measure.getBoundingClientRect?.().height;if(measured>0) height=Math.ceil(measured);
      measure.remove?.();if(measure.parentNode?.removeChild) measure.parentNode.removeChild(measure);
    } catch(_) {}
    height=Math.max(1,Math.min(height,v.height-24));
    let left=opts.placement==='inline-end'?origin.right+12:opts.align==='start'?origin.left:origin.right-width;
    let top=opts.placement==='inline-end'?origin.bottom-height:opts.placement==='overlap'?origin.top:origin.bottom+8;
    if(top+height>v.top+v.height-12) top=opts.placement==='overlap'?v.top+v.height-height-12:origin.top-height-8;
    const bounds={left:clamp(left,v.left+12,v.left+v.width-width-12),top:clamp(top,v.top+12,v.top+v.height-height-12),width,height};
    let resolve;const closed=new Promise(done=>{resolve=done;});
    const p0={x:origin.left+origin.width/2,y:origin.top+origin.height/2},p2={x:bounds.left+width*.60,y:bounds.top+height*.35};
    const s={trigger,opts,origin,bounds,p0,p2,p1:{x:(p0.x+p2.x)/2+2,y:(p0.y+p2.y)/2-4},radius:Number(opts.radius)||28,overlay,menu,content,icon,resolve,callbacks:[],phase:'opening',disposed:false,raf:null};
    s.handle={closed,close:reason=>{if(current===s)close(reason);},get phase(){return s.phase;},menu};current=s;
    frame(s,triggerFrame(origin));doc.body.appendChild(overlay);
    trigger.classList?.add('is-hidden-for-morph','surface-morph-trigger-hidden');trigger.setAttribute?.('aria-expanded','true');trigger.setAttribute?.('aria-controls',menu.id);trigger.setAttribute?.('aria-haspopup',opts.role==='dialog'?'dialog':'menu');
    content.style.maxHeight=`${height}px`;content.style.overflowY='auto';menu.style.willChange='width,height,left,top,border-radius,transform';
    s.lease=root.OverlayManager.acquirePopover({panel:menu,trigger,signal:opts.signal,watchTriggerResize:opts.watchTriggerResize??opts.role==='dialog',onDismiss:reason=>{if(current===s)close(reason);}});
    s.motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');s.onMotion=()=>{if(!s.motion.matches||current!==s)return;if(s.phase==='closing')finish(s,s.closeReason);else {if(s.raf)cancel(s.raf);frame(s,openedFrame(s));settle(s);}};s.motion?.addEventListener?.('change',s.onMotion);
    overlay.addEventListener('pointerdown',event=>{if(!menu.contains?.(event.target))close('outside_click');});
    menu.addEventListener('keydown',event=>{
      const items=focusItems(s),index=items.indexOf(doc.activeElement);
      if(opts.keyboard!=='content'&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&items.length){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((el,i)=>{el.tabIndex=i===next?0:-1;});items[next].focus?.();}
      else if(event.key==='Tab'&&(opts.keyboard!=='content'||(event.shiftKey?index<=0:index===items.length-1)))close('tab');
    });
    run(s,480,t=>{if(t>=290)menu.classList.add('is-content-visible');return opening(s,t);},()=>settle(s));
    return s.handle;
  }
  const api={open,close,isOpen:()=>!!current&&current.phase!=='closing',getState:()=>current?{phase:current.phase,trigger:current.trigger,role:current.opts.role||'menu'}:null,destroy:()=>close('destroy')};
  root.SurfaceMorph=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
