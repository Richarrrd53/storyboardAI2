/** Geometry-only trash narrative. The feature retains all delete / Undo timing. */
(function(root) {
  'use strict';
  const clamp = n => Math.max(0, Math.min(1,n));
  function sample(geometry, progress) {
    const t=clamp(progress), f=clamp(t/.75), q=1-f;
    const x=2*q*f*geometry.dx*.45+f*f*geometry.dx;
    const y=2*q*f*(-geometry.lift)+f*f*geometry.dy;
    const scale=1/(1+(1/geometry.endScale-1)*f);
    const rotate=360*f;
    return {x,y,scale,rotate,
      zIndex:rotate<90?4:1,
      opacity:f>=1?0:1-clamp((f-.75)/.25),blur:0,
      bin:Math.min(1,t/.22),lid:34*Math.sin(Math.PI*clamp((t-.05)/.9))};
  }
  function measure(preview, bin) {
    const card=root.ProjectCard?.captureGeometry(preview);
    const a=preview.getBoundingClientRect();
    bin.style.transform='translateX(-50%) scale(1)';
    const lidEl=bin.querySelector('.sys-delete-trashbin-top');
    const bodyEl=bin.querySelector('.sys-delete-trashbin-bottom');
    const mouth=lidEl.getBoundingClientRect();
    const body=bodyEl?.getBoundingClientRect?.()||mouth;
    bin.style.transform='translateX(-50%) scale(0)';
    const parentScale=a.width/(preview.clientWidth||a.width)||1;
    const targetY=bodyEl&&bodyEl!==lidEl?body.top+body.height*.28:mouth.top+mouth.height/2;
    return {snapshot:card,dx:(mouth.left+mouth.width/2-a.left-a.width/2)/parentScale,
      dy:Math.max(24,(targetY-a.top-a.height/2)/parentScale),
      lift:Math.max(72,(a.height/parentScale)*.68),endScale:Math.max(.04,Math.min(.14,mouth.width/Math.max(1,a.width)*.14))};
  }
  function animate({preview,bin,signal,duration=1000}) {
    const geometry=measure(preview,bin),lid=bin.querySelector('.sys-delete-trashbin-top');
    const motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame=null,started=root.performance?.now?.() ?? null,done=false,resolve;
    const finished=new Promise(complete=>{resolve=complete;});
    preview.style.transformOrigin='50% 50%';preview.style.willChange='transform,opacity';
    function finish(cancelled=false) {
      if(done)return;done=true;if(frame!==null)root.cancelAnimationFrame(frame);
      preview.style.willChange='auto';signal?.removeEventListener('abort',cancel);motion?.removeEventListener?.('change',onMotion);
      resolve({cancelled,geometry});
    }
    function paint(t) {
      const p=sample(geometry,t);
      preview.style.zIndex=String(p.zIndex);
      preview.style.transform=`translate3d(${p.x}px,${p.y}px,0) rotateX(${p.rotate}deg) scale(${p.scale})`;
      preview.style.opacity=String(p.opacity);
      bin.style.transform=`translateX(-50%) scale(${p.bin})`;
      lid.style.transform=`rotate(${p.lid}deg)`;
    }
    function tick(time) {
      if(done)return;
      if(preview.isConnected===false){finish(true);return;}
      if(started===null)started=time;
      const t=clamp((time-started)/duration);paint(t);
      if(t===1)finish();else frame=root.requestAnimationFrame(tick);
    }
    function cancel(){finish(true);}
    function complete(){if(!done){paint(1);finish();}}
    function onMotion(){if(motion.matches){paint(1);finish();}}
    signal?.addEventListener('abort',cancel,{once:true});motion?.addEventListener?.('change',onMotion);
    if(signal?.aborted)finish(true);
    else if(motion?.matches){paint(1);finish();}
    else frame=root.requestAnimationFrame(tick);
    return {finished,cancel,complete,geometry};
  }
  const api={sample,measure,animate};root.ProjectTrashMotion=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
