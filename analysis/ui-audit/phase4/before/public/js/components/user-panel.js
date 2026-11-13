/** Account surface adapter: one content DOM, desktop Morph and mobile modal sheet. */
(function(root) {
  'use strict';
  function create(options) {
    const { panel, backdrop, isMobile, onStateChange, onDepth, animateDepth }=options;
    const doc=root.document||document;
    let phase='closed', mode=null, desired=false, handle=null, host=null, sheet=null, lease=null;
    let timer=null, signal=null, disposed=false, opener=null, pointer=null;
    const animations=[], listeners=[];
    const motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');
    const listen=(target,name,fn,opts)=>{if(!target?.addEventListener)return;target.addEventListener(name,fn,opts);listeners.push(()=>target.removeEventListener(name,fn,opts));};
    const reduced=()=>!!motion?.matches;
    const trigger=()=>doc.getElementById(isMobile()?'mob-nav-profile':'top-avatar')||doc.getElementById('top-avatar');
    function publish(open) {
      panel.classList.toggle('active',open);
      for(const id of ['top-avatar','mob-nav-profile']) {const node=doc.getElementById(id);node?.setAttribute('aria-expanded',String(open));node?.setAttribute('aria-controls','spa-user-panel-surface');}
      onStateChange?.(open);
    }
    function stopMotion() {clearTimeout(timer);timer=null;animations.splice(0).forEach(animation=>animation.cancel());}
    function animate(element,frames,duration,easing='cubic-bezier(.16,1,.3,1)') {
      if(!reduced()&&element?.animate) animations.push(element.animate(frames,{duration,easing,fill:'both'}));
    }
    function park() {
      panel.hidden=true;panel.style.display='none';doc.body.appendChild(panel);
      backdrop?.classList.remove('active');if(backdrop)backdrop.hidden=true;
    }
    function cleanupSheet(reason) {
      stopMotion();endPointer();
      if(host) {park();host.remove?.();host=null;sheet=null;}
      lease?.release({restoreFocus:!['navigation','destroy','breakpoint','modal'].includes(reason)});lease=null;
      onDepth?.(0);phase='closed';mode=null;publish(false);
    }
    function desktop() {
      phase='opening';mode='desktop';panel.hidden=false;panel.style.display='';publish(true);
      handle=root.SurfaceMorph.open(opener,{
        content:panel,id:'spa-user-panel-surface',className:'surface-morph-account',role:'dialog',keyboard:'content',
        label:'帳戶與設定',width:320,height:400,placement:'inline-end',signal,keepTrigger:true,
        onOpened:()=>{phase='open';},
        onClose:reason=>{park();phase='closed';mode=null;handle=null;desired=false;publish(false);}
      });
    }
    function mobile() {
      phase='opening';mode='mobile';panel.hidden=false;panel.style.display='';
      host=doc.createElement('div');host.className='account-sheet-overlay';
      sheet=doc.createElement('section');sheet.className='account-sheet';sheet.id='spa-user-panel-surface';sheet.tabIndex=-1;
      sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','帳戶與設定');
      sheet.appendChild(panel);host.appendChild(sheet);doc.body.appendChild(host);publish(true);
      lease=root.OverlayManager.acquire({overlay:host,panel:sheet,initialFocus:panel.querySelector('.account-panel-close')||sheet,returnFocus:opener,onEscape:()=>close('escape')});
      const settle=()=>{phase='open';stopMotion();if(sheet)sheet.style.transform='translate3d(0,0,0)';};
      animate(sheet,[{transform:'translate3d(0,100%,0)'},{transform:'translate3d(0,0,0)'}],350);
      animate(host,[{backgroundColor:'transparent'},{backgroundColor:'var(--color-surface-overlay)'}],280);
      animateDepth?.(true,reduced()?0:.35);
      if(reduced())settle();else timer=setTimeout(settle,350);
      host.onpointerdown=event=>{if(event.target===host)close('outside_click');};
    }
    function open() {
      if(disposed||signal?.aborted) return;
      desired=true;
      if(phase==='open'||phase==='opening')return;
      opener=trigger();
      if(phase==='closing'&&mode==='desktop') {phase='opening';root.SurfaceMorph.open(opener,{content:panel});return;}
      if(phase==='closing'&&mode==='mobile') {
        // Preserve the same sheet/lease during a reversal instead of removing/recreating it.
        const from=root.getComputedStyle?.(sheet)?.transform||sheet.style.transform||'translate3d(0,0,0)';stopMotion();
        phase='opening';publish(true);animate(sheet,[{transform:from},{transform:'translate3d(0,0,0)'}],280);
        animateDepth?.(true,reduced()?0:.28);
        if(reduced()){phase='open';sheet.style.transform='translate3d(0,0,0)';}
        else timer=setTimeout(()=>{stopMotion();phase='open';sheet.style.transform='translate3d(0,0,0)';},280);
        return;
      }
      if(isMobile())mobile();else desktop();
    }
    function close(reason='close',immediate=false) {
      desired=false;
      if(phase==='closed')return;
      if(mode==='desktop') {phase='closing';handle?.close(immediate?'navigation':reason);return;}
      if(immediate||reduced()){cleanupSheet(reason);return;}
      if(phase==='closing')return;
      const from=root.getComputedStyle?.(sheet)?.transform||sheet.style.transform||'translate3d(0,0,0)';stopMotion();endPointer();phase='closing';
      animate(sheet,[{transform:from},{transform:'translate3d(0,100%,0)'}],260);
      animate(host,[{backgroundColor:'var(--color-surface-overlay)'},{backgroundColor:'transparent'}],260);
      animateDepth?.(false,.26);timer=setTimeout(()=>cleanupSheet(reason),260);
    }
    function endPointer() {
      if(!pointer)return;
      try {panel.releasePointerCapture?.(pointer.id);}catch(_){}
      root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',release);root.removeEventListener('pointercancel',cancelPointer);pointer=null;
    }
    function down(event) {
      if(mode!=='mobile'||phase==='closing'||phase==='closed'||event.button>0)return;
      const target=event.target;
      if(!target?.closest?.('.user-panel-handle')&&(!target?.closest?.('.up-header')||target.closest('a,button,input,select,textarea')))return;
      const transform=root.getComputedStyle?.(sheet)?.transform||'';
      const match=transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)\)/);
      const offset=match?Math.max(0,Number(match[1])):0;stopMotion();
      pointer={id:event.pointerId,start:event.clientY,last:event.clientY,time:Date.now(),dy:offset,offset,velocity:0,height:sheet.getBoundingClientRect().height||360,moved:false};
      root.addEventListener('pointermove',move,{passive:false});root.addEventListener('pointerup',release);root.addEventListener('pointercancel',cancelPointer);
    }
    function move(event) {
      if(!pointer||event.pointerId!==pointer.id)return;
      const delta=event.clientY-pointer.start;if(!pointer.moved&&Math.abs(delta)<6)return;
      if(!pointer.moved){pointer.moved=true;try{panel.setPointerCapture?.(pointer.id);}catch(_){}}
      event.preventDefault?.();const stamp=Date.now();pointer.velocity=(event.clientY-pointer.last)/Math.max(1,stamp-pointer.time);pointer.last=event.clientY;pointer.time=stamp;
      pointer.dy=Math.max(0,pointer.offset+delta);sheet.style.transform=`translate3d(0,${pointer.dy}px,0)`;
      const progress=Math.max(0,1-pointer.dy/pointer.height);host.style.backgroundColor=`rgba(15,23,42,${.45*progress})`;onDepth?.(progress);
    }
    function snapBack() {
      if(!sheet)return;
      const from=sheet.style.transform||'translate3d(0,0,0)';stopMotion();phase='opening';
      animate(sheet,[{transform:from},{transform:'translate3d(0,0,0)'}],260);host.style.backgroundColor='';animateDepth?.(true,reduced()?0:.26);
      if(reduced()){phase='open';sheet.style.transform='translate3d(0,0,0)';}
      else timer=setTimeout(()=>{stopMotion();phase='open';sheet.style.transform='translate3d(0,0,0)';},260);
    }
    function release(event) {
      if(!pointer||event.pointerId!==pointer.id)return;
      const dismiss=pointer.moved&&(pointer.dy/pointer.height>=.30||pointer.velocity>.38);endPointer();
      if(dismiss)close('drag');else snapBack();
    }
    function cancelPointer(event) {if(!pointer||event.pointerId!==pointer.id)return;endPointer();snapBack();}
    function resize() {
      if(phase==='closed')return;
      if((mode==='mobile')===isMobile()){if(pointer){endPointer();snapBack();}return;}
      // Close across presentation modes; the next activation uses the new viewport.
      // Reopening during window/visualViewport resize races their separate notifications.
      close('breakpoint',true);onDepth?.(0);trigger()?.focus?.({preventScroll:true});
    }
    const abort=()=>close('navigation',true);
    listen(root,'resize',resize,{passive:true});listen(root,'orientationchange',resize,{passive:true});
    listen(panel,'pointerdown',down);listen(panel.querySelector('.account-panel-close'),'click',()=>close('close_button'));
    listen(motion,'change',()=>{if(!motion.matches||mode!=='mobile')return;if(phase==='closing')cleanupSheet('close');else if(mode==='mobile'){stopMotion();endPointer();phase='open';sheet.style.transform='translate3d(0,0,0)';}});
    park();panel.setAttribute('role','group');panel.setAttribute('aria-label','帳戶資訊與操作');
    return {open,close,toggle(force){if(typeof force==='boolean'){if(force)open();else close();}else if(desired)close();else open();},
      get phase(){return phase;},get modal(){return mode==='mobile'&&phase!=='closed';},get trigger(){return opener||trigger();},
      bindPage(next){signal?.removeEventListener('abort',abort);signal=next;signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();},
      destroy(){disposed=true;close('destroy',true);signal?.removeEventListener('abort',abort);listeners.splice(0).forEach(remove=>remove());stopMotion();endPointer();park();}
    };
  }
  root.UserPanelController={create};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.UserPanelController;
})(typeof window!=='undefined'?window:globalThis);
