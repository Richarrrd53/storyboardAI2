/** Geometry-only trash narrative. The feature retains all delete / Undo timing. */
(function(root) {
  'use strict';
  const clamp = n => Math.max(0, Math.min(1,n));
  function sample(geometry, progress) {
    const t=clamp(progress), q=1-t;
    const x=2*q*t*geometry.dx*.45+t*t*geometry.dx;
    const y=2*q*t*(-geometry.lift)+t*t*geometry.dy;
    const shrink=clamp((t-.15)/.85);
    return {x,y,scale:1+(geometry.endScale-1)*shrink,rotate:135*t,
      opacity:1-clamp((t-.82)/.18),blur:Math.max(0,(t-.65)*6),
      bin:Math.min(1,t/.18),lid:30*Math.sin(Math.PI*clamp((t-.08)/.84))};
  }
  function measure(preview, bin) {
    const card=root.ProjectCard?.captureGeometry(preview);
    const a=preview.getBoundingClientRect();
    bin.style.transform='translateX(-50%) scale(1)';
    const mouth=bin.querySelector('.sys-delete-trashbin-top').getBoundingClientRect();
    bin.style.transform='translateX(-50%) scale(0)';
    const parentScale=a.width/(preview.clientWidth||a.width)||1;
    return {snapshot:card,dx:(mouth.left+mouth.width/2-a.left-a.width/2)/parentScale,
      dy:(mouth.top+mouth.height/2-a.top-a.height/2)/parentScale,
      lift:Math.max(48,(a.height/parentScale)*.45),endScale:Math.max(.08,Math.min(.35,mouth.width/Math.max(1,a.width)*.65))};
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
      preview.style.transform=`translate3d(${p.x}px,${p.y}px,0) rotateX(${p.rotate}deg) scale(${p.scale})`;
      preview.style.opacity=String(p.opacity);preview.style.filter=`blur(${p.blur}px)`;
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
