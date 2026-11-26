/** Shared liquid Surface Morph: temp/morph.html & temp/morph with 2nd menu.html SDF geometry, spring and session. */
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
  const immediateReasons = new Set(['navigation','unmount','destroy','immediate','resize','modal','trigger_removed','tab']);

  const triggerSelector='[data-morph-trigger], [data-morph-align]';
  const itemSelector='button, a[href], .up-btn, [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';
  const holdDelay=300, holdSlop=10, hoverIconDelay=60, hoverHysteresis=3;
  let gesture=null, clickBlock=null, allowGestureClick=false;
  const later=(fn,delay=holdDelay)=>(root.setTimeout||setTimeout)(fn,delay);
  const clearLater=id=>(root.clearTimeout||clearTimeout)(id);
  function consume(event) {event.preventDefault?.();event.stopImmediatePropagation?.();event.stopPropagation?.();}
  function blockRelease(event) {clickBlock={id:event.pointerId,until:Infinity};}
  function clearHover(g,reverseIcon=true) {
    if(!g)return;
    clearLater(g.hoverTimer);g.hoverTimer=null;
    if(g.hovered){
      g.hovered.classList.remove('is-gesture-hover');
      if(reverseIcon)root.IconMotion?.reverse?.(g.hovered);
    }
    g.hovered=null;g.hoverPlayedItem=null;
  }
  function endGesture(keepIcon=false) {
    const g=gesture;if(!g)return null;
    gesture=null;clearLater(g.timer);clearHover(g,!keepIcon);doc.body.classList.remove('is-morph-holding');
    if(g.active||g.ownsTouch)clickBlock={id:g.id,until:now()+1500};
    if(g.active) {
      g.session?.menu.classList.remove('is-gesture-tracking');
      g.session?.sub?.layer?.classList?.remove('is-gesture-tracking');
      try {if(g.trigger.hasPointerCapture?.(g.id))g.trigger.releasePointerCapture(g.id);}catch(_){}
    }
    return g;
  }
  function cancelGesture(dismiss=true) {
    const g=endGesture();if(dismiss&&g?.active&&current===g.session)close('gesture_cancel');
  }
  function isSubActive(s) {
    return Boolean(s?.sub && (s.subTargetP > 0.5 || s.subP > 0.25));
  }
  function isValidItem(s,item) {
    const container=isSubActive(s)?s.sub.layer:s.menu;
    return !(!item||!container?.contains?.(item)||item.disabled||item.hidden||item.getAttribute?.('aria-disabled')==='true'||item.closest?.('[hidden], [inert]'));
  }
  function gestureItemRaw(g) {
    const s=g.session;
    if(current!==s||s.disposed||s.phase==='closing')return null;
    if(isSubActive(s)){if(!s.subInteractive)return null;}
    else if(!s.interactive)return null;
    const target=doc.elementFromPoint?.(g.x,g.y),item=target?.closest?.(itemSelector);
    return isValidItem(s,item)?item:null;
  }
  function gestureItem(g) {
    const raw=gestureItemRaw(g);
    const s=g.session;
    if(raw&&g.hovered&&g.hovered!==raw&&isValidItem(s,g.hovered)) {
      const rect=g.hovered.getBoundingClientRect?.();
      if(rect&&g.x>=rect.left&&g.x<=rect.right&&g.y>=rect.top-hoverHysteresis&&g.y<=rect.bottom+hoverHysteresis) {
        return g.hovered;
      }
    }
    return raw;
  }
  function updateGestureHover() {
    const g=gesture;if(!g?.active)return;
    const item=gestureItem(g);
    if(g.hovered===item)return;
    clearHover(g,true);
    g.hovered=item;
    if(!item)return;
    item.classList.add('is-gesture-hover');
    if(root.IconMotion&&item.querySelector?.('svg[data-im-icon]'))g.hoverTimer=later(()=>{
      if(gesture!==g||!g.active||g.hovered!==item||current!==g.session||g.session.disposed||g.session.phase==='closing')return;
      if(isSubActive(g.session)?!g.session.subInteractive:!g.session.interactive)return;
      g.hoverPlayedItem=item;
      root.IconMotion?.play?.(item);
    },hoverIconDelay);
  }
  function trackGesture(g,session,haptic=false) {
    g.active=true;g.session=session;g.startX=g.x;g.startY=g.y;
    session.menu.classList.add('is-gesture-tracking');
    session.sub?.layer?.classList?.add('is-gesture-tracking');
    const selection=doc.getSelection?.();
    if(selection&&(g.trigger.contains?.(selection.anchorNode)||session.overlay.contains?.(selection.anchorNode)))selection.removeAllRanges();
    if(haptic)try {root.navigator?.vibrate?.(12);}catch(_){}
    // Capture can move from an SVG/span to its control. Document/Touch tracking
    // continues through the old target's lostpointercapture event.
    try {g.trigger.setPointerCapture?.(g.id);}catch(_){}
    updateGestureHover();
  }
  function onPointerDown(event) {
    // The document capture handler also protects controls above the backdrop's
    // stacking context and absorbs the complete dismissal transaction.
    if(!gesture)clickBlock=null;
    const s=current;
    const inSub=Boolean(s?.sub?.layer?.contains?.(event.target)||event.target?.closest?.('.export-submorph-panel'));
    const inMenu=Boolean(s?.menu.contains?.(event.target));
    if(s&&(s.phase==='closing'||(!inMenu&&!inSub))) {
      consume(event);blockRelease(event);cancelGesture(false);close('outside_click');return;
    }
    if(isSubActive(s)&&inMenu&&!inSub) {
      consume(event);blockRelease(event);cancelGesture(false);closeSubmenu();return;
    }
    if(gesture) {cancelGesture();return;}
    if(event.pointerType!=='touch'||event.isPrimary===false||event.button>0)return;
    if(event.target?.closest?.('input, textarea, select, [contenteditable="true"]'))return;
    // An already-open menu starts the same slide-to-select gesture immediately;
    // only its opener requires the hold timer.
    const scrollable=s?.interactive?event.target?.closest?.('.template-tag-grid'):null;
    if(scrollable&&scrollable.scrollHeight>scrollable.clientHeight+1)return;
    const activeContainer=isSubActive(s)?(s.subInteractive?s.sub.layer:null):(s?.interactive?s.menu:null);
    const item=activeContainer?event.target?.closest?.(itemSelector):null;
    const trigger=item&&activeContainer.contains(item)?item:event.target?.closest?.(triggerSelector);
    if(!trigger||trigger.disabled||trigger.getAttribute?.('aria-disabled')==='true')return;
    const g={id:event.pointerId,trigger,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,active:false,moved:false};
    consume(event);gesture=g;doc.body.classList.add('is-morph-holding');
    if(item&&trigger===item){trackGesture(g,s);return;}
    g.timer=later(()=>{
      if(gesture!==g||trigger.isConnected===false||root.OverlayManager?.isModalActive?.()){endGesture();return;}
      // Invoke the same adapter used by a normal tap; never duplicate actions or data.
      allowGestureClick=true;
      try {trigger.click?.();}finally {allowGestureClick=false;}
      if(gesture!==g)return;
      if(!current||current.trigger!==trigger){endGesture();return;}
      trackGesture(g,current,true);
    });
  }
  function onPointerMove(event) {
    const g=gesture;if(!g||event.pointerId!==g.id)return;
    g.x=event.clientX;g.y=event.clientY;
    const moved=Math.hypot(g.x-g.startX,g.y-g.startY)>holdSlop;
    if(!g.active){if(moved)endGesture();return;}
    consume(event);g.moved ||= moved;updateGestureHover();
  }
  function onPointerUp(event) {
    if(clickBlock?.id===event.pointerId)clickBlock.until=now()+1500;
    const g=gesture;if(!g||event.pointerId!==g.id)return;
    if(!g.active){
      endGesture();
      if(g.ownsTouch) {
        // Canceling touchstart prevents native selection and its emulated click.
        // Restore a short tap through the same adapter, exactly once.
        consume(event);allowGestureClick=true;
        try {g.trigger.click?.();}finally {allowGestureClick=false;}
      }
      return;
    }
    consume(event);g.x=event.clientX;g.y=event.clientY;
    g.moved ||= Math.hypot(g.x-g.startX,g.y-g.startY)>holdSlop;
    const item=gestureItemRaw(g);
    const alreadyPlayed=!!(item&&g.hoverPlayedItem===item);
    const s=g.session;
    endGesture(!!item);
    if(item) {
      if(!alreadyPlayed)root.IconMotion?.play?.(item);
      if(item.dataset)item.dataset.imGesturePlayed='true';
      allowGestureClick=true;
      try {item.click?.();}finally {allowGestureClick=false;}
    } else if(g.moved&&current===s) {
      const ptTarget=doc.elementFromPoint?.(g.x,g.y);
      if(isSubActive(s)&&s.menu.contains?.(ptTarget))closeSubmenu();
      else close('gesture_cancel');
    }
  }
  function onPointerCancel(event) {
    if(clickBlock?.id===event.pointerId)clickBlock.until=now()+1500;
    if(gesture?.id===event.pointerId) {
      // If a native long-press cancels Pointer Events, keep an owned Touch
      // stream tracking move/end. Otherwise drop tracking and leave the menu open.
      if(gesture.ownsTouch)return;
      const g=endGesture();if(g?.active)clickBlock.until=Infinity;
    }
  }
  function onClick(event) {
    if(allowGestureClick)return;
    const blocked=clickBlock&&now()<=clickBlock.until&&(event.pointerId===clickBlock.id||event.detail>0||event.pointerType==='touch');
    if(gesture?.active||blocked){consume(event);clickBlock=null;return;}
    const s=current;
    const inSub=Boolean(s?.sub?.layer?.contains?.(event.target)||event.target?.closest?.('.export-submorph-panel'));
    const inMenu=Boolean(s?.menu.contains?.(event.target));
    if(s&&(s.phase==='closing'||(!inMenu&&!inSub))){consume(event);close('outside_click');return;}
    if(isSubActive(s)&&inMenu&&!inSub){consume(event);closeSubmenu();}
  }
  // Delegation handles freshly rendered cards without per-card timers/listeners.
  // Mark any additional opener with data-morph-trigger (data-morph-align also opts in).
  doc.addEventListener?.('pointerdown',onPointerDown,true);
  doc.addEventListener?.('pointermove',onPointerMove,{capture:true,passive:false});
  doc.addEventListener?.('pointerup',onPointerUp,true);
  doc.addEventListener?.('pointercancel',onPointerCancel,true);
  doc.addEventListener?.('click',onClick,true);
  const touchPoint=(event,g)=>Array.from(event.changedTouches||[]).find(touch=>touch.identifier===g.touchId);
  const touchPointer=(event,touch,g)=>({pointerId:g.id,clientX:touch.clientX,clientY:touch.clientY,
    preventDefault:()=>event.preventDefault?.(),stopImmediatePropagation:()=>event.stopImmediatePropagation?.(),stopPropagation:()=>event.stopPropagation?.()});
  doc.addEventListener?.('touchstart',event=>{
    const g=gesture;if(!g)return;
    if(event.touches?.length>1){cancelGesture();return;}
    if(!g.trigger.contains?.(event.target))return;
    const touch=event.changedTouches?.[0];if(!touch)return;
    g.touchId=touch.identifier;g.ownsTouch=true;
    // Must cancel the initial native touch, before its selection/callout starts.
    consume(event);
  },{capture:true,passive:false});
  doc.addEventListener?.('touchmove',event=>{
    const g=gesture;if(!g?.ownsTouch)return;
    const touch=touchPoint(event,g);if(touch)onPointerMove(touchPointer(event,touch,g));
    if(gesture===g)event.preventDefault?.();
  },{capture:true,passive:false});
  doc.addEventListener?.('touchend',event=>{
    const g=gesture,touch=g?.ownsTouch?touchPoint(event,g):null;
    if(touch)onPointerUp(touchPointer(event,touch,g));
    if(!event.touches?.length&&clickBlock)clickBlock.until=now()+1500;
  },{capture:true,passive:false});
  doc.addEventListener?.('touchcancel',event=>{
    if(gesture?.ownsTouch&&touchPoint(event,gesture))cancelGesture(false);
    if(!event.touches?.length&&clickBlock)clickBlock.until=now()+1500;
  },true);
  const preventSelection=event=>{
    if(gesture||event.target?.closest?.(triggerSelector))consume(event);
  };
  doc.addEventListener?.('selectstart',preventSelection,true);
  doc.addEventListener?.('dragstart',preventSelection,true);
  doc.addEventListener?.('contextmenu',event=>{
    const holding=gesture&&(gesture.trigger.contains?.(event.target)||gesture.active&&gesture.session.overlay.contains?.(event.target));
    const interrupted=clickBlock&&now()<=clickBlock.until&&current?.overlay.contains?.(event.target);
    if(holding||interrupted)consume(event);
  },true);
  root.addEventListener?.('pagehide',()=>cancelGesture(false));

  function readRect(trigger) {
    const rect = trigger.getBoundingClientRect?.() || {};
    const left = Number(rect.left) || 0, top = Number(rect.top) || 0;
    const width = Math.max(1, Number(rect.width) || 48), height = Math.max(1, Number(rect.height) || 36);
    return {left,top,width,height,right:rect.right ?? left+width,bottom:rect.bottom ?? top+height};
  }
  function viewport() {
    const v=root.visualViewport;
    const width=Math.max(doc.documentElement?.clientWidth||0,root.innerWidth||0)||v?.width||1200;
    const height=Math.max(doc.documentElement?.clientHeight||0,root.innerHeight||0)||v?.height||800;
    return {left:0,top:0,width,height};
  }
  function copyTrigger(trigger, icon, preserveLayout=false) {
    icon.innerHTML=''; icon.classList.add('morph-icon--trigger'); icon.setAttribute('aria-hidden','true'); icon.inert=true;
    for (const child of Array.from(trigger.childNodes || trigger.children || [])) {
      const clone=child.cloneNode(true); clone.removeAttribute?.('id');
      if(preserveLayout && child.nodeType===1) {
        const computed=root.getComputedStyle?.(child);
        for(const key of ['display','flex','alignItems']) if(computed?.[key]) clone.style[key]=computed[key];
      }
      clone.querySelectorAll?.('[id]').forEach(node=>node.removeAttribute('id')); icon.appendChild(clone);
    }
    const style=root.getComputedStyle?.(trigger);
    if(style) for(const key of ['font','color','padding','gap','justifyContent']) icon.style[key]=style[key];
  }
  // Geometry and spring constants ported from temp/morph.html & temp/morph with 2nd menu.html.
  const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const easeOutCubic=x=>1-Math.pow(1-clamp(x,0,1),3);
  function computeMorphPrimitives(prog, g, dirMix, subP=0, recedeShiftY=10) {
    const btnW = g.btnW;
    const btnH = g.btnH;
    const widthRatio = btnW / Math.max(1, btnH);

    const minDropW = g.minDropletW;
    const minDropH = btnH * (0.52 + 0.10 * Math.tanh((widthRatio - 1.0) * 0.42));

    // =========================================================================
    // 1. Blob B (Level-1 Menu Body)
    // =========================================================================
    const emergeB = smoothstep(0.08, 0.18, prog);
    const expandRaw = clamp((prog - 0.18) / 0.82, 0.0, 1.0);

    const openCurveY = 1.0 - Math.pow(1.0 - expandRaw, 2.25);
    const openCurveX = 1.0 - Math.pow(1.0 - expandRaw, 1.85);

    const closeCurveY = smoothstep(0.0, 1.0, Math.pow(expandRaw, 1.30));
    const closeCurveX = smoothstep(0.0, 1.0, Math.pow(expandRaw, 1.40));

    const progY = lerp(closeCurveY, openCurveY, dirMix);
    const progX = lerp(closeCurveX, openCurveX, dirMix);

    const seedW = minDropW * 0.88;
    const seedH = minDropH * 0.88;

    const wBBase = lerp(seedW, g.menuW, progX) * emergeB;
    const hBBase = lerp(seedH, g.menuH, progY) * emergeB;

    const startBy = g.btnCy + btnH * 0.16;
    const topEdgeBBase = lerp(startBy - seedH * 0.5, g.menuTop, progY);
    const cyBBase = topEdgeBBase + hBBase * 0.5;
    const cxBBase = lerp(g.btnCx, g.menuCx, progX);
    const rBBase = lerp(Math.min(wBBase, hBBase) * 0.5, g.menuR, smoothstep(0.28, 0.90, prog));

    // Level-2 submenu recede: scale down to 0.925 & shift up smoothly
    const subAmt = clamp(subP, 0.0, 1.0);
    const recedeScale = lerp(1.0, 0.925, subAmt);
    const wB = wBBase * recedeScale;
    const hB = hBBase * recedeScale;
    const topEdgeB = topEdgeBBase - recedeShiftY * subAmt * smoothstep(0.5, 1.0, prog);
    const cyB = topEdgeB + hB * 0.5;
    const cxB = cxBBase;
    const rB = rBBase * recedeScale;

    const vTaperB = Math.sin(expandRaw * Math.PI) * (1.0 - smoothstep(0.65, 0.96, prog)) * 0.16;
    const hTaperB = 0.0;

    // =========================================================================
    // 2. Blob A (Trigger Capsule Droplet)
    // =========================================================================
    const tShrinkX = easeOutCubic(clamp(prog / 0.21, 0.0, 1.0));
    const tShrinkY = smoothstep(0.0, 0.22, prog);
    const vanishScaleA = 1.0 - smoothstep(0.20, 0.35, prog);

    const wA = lerp(btnW, minDropW, tShrinkX) * vanishScaleA;
    const hA = lerp(btnH, minDropH, tShrinkY) * vanishScaleA;
    const cxA = lerp(g.btnCx, cxB, smoothstep(0.14, 0.28, prog));
    const cyA = lerp(g.btnCy, topEdgeB + Math.min(14.0, hB * 0.28), smoothstep(0.08, 0.34, prog));
    const rA = Math.min(wA, hA) * 0.5;
    const vTaperA = -Math.sin(clamp(prog / 0.32, 0.0, 1.0) * Math.PI) * 0.14;
    const hTaperA = 0.0;

    // =========================================================================
    // 3. Blob M (Neck Bridge Droplet)
    // =========================================================================
    const emergeM = smoothstep(0.02, 0.12, prog);
    const vanishM = 1.0 - smoothstep(0.18, 0.275, prog);
    const scaleM = emergeM * vanishM;

    const tDropMove = smoothstep(0.04, 0.27, prog);
    const rawWM = minDropW * 0.86 * scaleM;
    const rawHM = lerp(minDropH * 0.78, btnH * 0.76, smoothstep(0.05, 0.18, prog)) * scaleM;
    const cxM = lerp(cxA, cxB, tDropMove);

    const bridgeTop = (hA > 1.0) ? Math.min(cyA - hA * 0.42, topEdgeB + 2.0) : (topEdgeB + 2.0);
    const bridgeBot = Math.max(cyA + hA * 0.42, topEdgeB + hB * 0.75);
    const maxAllowedHM = Math.max(0.0, bridgeBot - bridgeTop);
    const hM = Math.min(rawHM, maxAllowedHM);
    const wM = Math.min(rawWM, Math.max(wA, wB) * 0.92);
    const unclampedCyM = lerp(cyA + btnH * 0.06, topEdgeB + Math.min(20.0, hB * 0.35), tDropMove);
    const cyM = clamp(unclampedCyM, bridgeTop + hM * 0.5, bridgeBot - hM * 0.5);
    const rM = Math.min(wM, hM) * 0.5;
    const vTaperM = Math.sin(clamp((prog - 0.03) / 0.24, 0.0, 1.0) * Math.PI) * 0.16;

    // =========================================================================
    // 4. Dynamic Smooth-Min Radius k
    // =========================================================================
    const kBase = btnH * (0.35 + 0.10 * Math.tanh((widthRatio - 1.0) * 0.45));
    const envAM = smoothstep(0.02, 0.10, prog) * (1.0 - smoothstep(0.18, 0.27, prog));
    const envMB = smoothstep(0.06, 0.15, prog) * (1.0 - smoothstep(0.20, 0.29, prog));

    const kAM = kBase * envAM;
    const kMB = kBase * 1.12 * envMB;

    return {
      blobA: { x: cxA, y: cyA, w: wA, h: hA, r: rA, vTaper: vTaperA, hTaper: hTaperA },
      blobM: { x: cxM, y: cyM, w: wM, h: hM, r: rM, vTaper: vTaperM },
      blobB: { x: cxB, y: cyB, w: wB, h: hB, r: rB, vTaper: vTaperB, hTaper: hTaperB },
      blobBBase: { x: cxBBase, y: cyBBase, w: wBBase, h: hBBase, top: topEdgeBBase },
      kAM: kAM,
      kMB: kMB
    };
  }

  function geometry(s) {
    const o=s.origin,b=s.bounds,ratio=o.width/Math.max(1,o.height);
    return {btnW:o.width,btnH:o.height,btnCx:o.left+o.width/2,btnCy:o.top+o.height/2,
      anchorX:o.left+o.width/2,menuW:b.width,menuH:b.height,menuCx:b.left+b.width/2,
      menuTop:b.top,menuR:s.radius,minDropletW:o.height*(.50+.12*Math.tanh((ratio-1)*.42))};
  }

  const SDF_VS_SOURCE = `
    attribute vec2 a_pos;
    void main() {
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `;

  const SDF_FS_SOURCE = `
    precision highp float;
    uniform vec2 u_res;
    uniform vec2 u_offset;
    uniform float u_dpr;
    uniform float u_active;
    uniform float u_lightTheme;
    uniform float u_shadowPresence;
    uniform vec4 u_color;
    uniform vec4 u_borderColor;
    uniform float u_borderWidth;
    uniform float u_borderPresence;

    uniform vec4 u_blobA;
    uniform vec3 u_blobAExtra;

    uniform vec4 u_blobM;
    uniform vec2 u_blobMExtra;

    uniform vec4 u_blobB;
    uniform vec3 u_blobBExtra;

    uniform float u_kAM;
    uniform float u_kMB;
    uniform float u_dimB;

    float sdTaperedBox(vec2 p, vec2 c, vec2 b, float r, float vTaper, float hTaper) {
      vec2 lp = p - c;
      float ny = clamp(lp.y / max(b.y, 1.0), -1.0, 1.0);
      float nx = clamp(lp.x / max(b.x, 1.0), -1.0, 1.0);
      float halfW = max(2.0, b.x * (1.0 + vTaper * ny));
      float halfH = max(2.0, b.y * (1.0 + hTaper * nx));
      float rad = min(r, min(halfW, halfH));
      vec2 q = abs(lp) - vec2(halfW, halfH) + vec2(rad);
      return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - rad;
    }

    float sminQuad(float a, float b, float k) {
      if (k <= 0.001) return min(a, b);
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }

    float evalSceneSDF(vec2 pos) {
      float dA = 1000.0;
      if (u_blobA.z > 0.5 && u_blobA.w > 0.5) {
        dA = sdTaperedBox(pos, u_blobA.xy, u_blobA.zw * 0.5, u_blobAExtra.x, u_blobAExtra.y, u_blobAExtra.z);
      }
      float dM = 1000.0;
      if (u_blobM.z > 0.5 && u_blobM.w > 0.5) {
        dM = sdTaperedBox(pos, u_blobM.xy, u_blobM.zw * 0.5, u_blobMExtra.x, u_blobMExtra.y, 0.0);
      }
      float dB = 1000.0;
      if (u_blobB.z > 0.5 && u_blobB.w > 0.5) {
        dB = sdTaperedBox(pos, u_blobB.xy, u_blobB.zw * 0.5, u_blobBExtra.x, u_blobBExtra.y, u_blobBExtra.z);
      }
      float dAM = sminQuad(dA, dM, u_kAM);
      return sminQuad(dAM, dB, u_kMB);
    }

    void main() {
      if (u_active < 0.5) {
        gl_FragColor = vec4(0.0);
        return;
      }
      vec2 pos = u_offset + vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;
      float d = evalSceneSDF(pos);

      float dShadow = evalSceneSDF(pos - vec2(0.0, 8.0));
      float shadowAlpha = (1.0 - smoothstep(-2.0, 26.0, dShadow)) * (u_lightTheme > 0.5 ? 0.13 : 0.34) * u_shadowPresence * u_color.a;

      float aa = 0.85 / u_dpr;
      float shapeAlpha = 1.0 - smoothstep(-aa, aa, d);

      float dim = clamp(u_dimB, 0.0, 1.0);
      vec3 baseRgb = mix(u_color.rgb, u_color.rgb * vec3(0.935, 0.945, 0.965), dim);
      float cardAlpha = shapeAlpha * u_color.a * mix(1.0, 0.94, dim);

      vec4 shadowCol = vec4(0.03, 0.05, 0.10, 1.0) * shadowAlpha * mix(1.0, 0.65, dim);
      vec4 surfaceCol = vec4(baseRgb * cardAlpha, cardAlpha);

      vec4 surfaceAndShadow = surfaceCol + shadowCol * (1.0 - shapeAlpha);
      float innerAlpha = 1.0 - smoothstep(-aa, aa, d + u_borderWidth);
      float borderAlpha = max(0.0, shapeAlpha - innerAlpha) * u_borderColor.a * u_borderPresence;
      vec4 borderCol = vec4(u_borderColor.rgb * borderAlpha, borderAlpha);
      gl_FragColor = borderCol + surfaceAndShadow * (1.0 - borderAlpha);
    }
  `;

  const SDF_UNIFORM_NAMES = [
    'u_res','u_offset','u_dpr','u_active','u_lightTheme','u_shadowPresence',
    'u_color','u_borderColor','u_borderWidth','u_borderPresence',
    'u_blobA','u_blobAExtra','u_blobM','u_blobMExtra','u_blobB','u_blobBExtra',
    'u_kAM','u_kMB','u_dimB'
  ];

  // Persistent shared WebGL renderer pool (singleton across all Morph invocations)
  let sharedGL = null;

  function initSharedWebGLProgram(state) {
    const gl = state.gl;
    if (!gl || state.lost) return false;
    const shaders = [];
    let program = null;
    let buffer = null;
    try {
      const compile = (type, source) => {
        const sh = gl.createShader(type);
        shaders.push(sh);
        gl.shaderSource(sh, source);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('SDF shader');
        return sh;
      };
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, SDF_VS_SOURCE));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, SDF_FS_SOURCE));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('SDF program');
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
      const pos = gl.getAttribLocation(program, 'a_pos');
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
      const u = Object.fromEntries(SDF_UNIFORM_NAMES.map(n => [n, gl.getUniformLocation(program, n)]));
      state.program = program;
      state.buffer = buffer;
      state.shaders = shaders;
      state.u = u;
      state.ready = true;
      return true;
    } catch (_) {
      if (buffer) try { gl.deleteBuffer(buffer); } catch {}
      if (program) try { gl.deleteProgram(program); } catch {}
      shaders.forEach(sh => { try { gl.deleteShader(sh); } catch {} });
      state.ready = false;
      return false;
    }
  }

  function acquireSharedWebGL() {
    if (sharedGL && sharedGL.ready && !sharedGL.lost && !sharedGL.gl?.isContextLost?.()) {
      return sharedGL;
    }
    if (sharedGL && sharedGL.failed) return null;
    const canvas = doc.createElement('canvas');
    canvas.className = 'surface-morph-sdf';
    canvas.setAttribute('aria-hidden', 'true');
    let gl = null;
    try {
      gl = canvas.getContext?.('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
    } catch (_) {}
    if (!gl) {
      sharedGL = { failed: true };
      return null;
    }
    const state = { canvas, gl, program: null, buffer: null, shaders: [], u: null, ready: false, lost: false, failed: false };
    canvas.addEventListener?.('webglcontextlost', (e) => {
      e.preventDefault?.();
      state.lost = true;
      state.ready = false;
    });
    canvas.addEventListener?.('webglcontextrestored', () => {
      state.lost = false;
      initSharedWebGLProgram(state);
    });
    if (!initSharedWebGLProgram(state)) {
      sharedGL = { failed: true };
      return null;
    }
    sharedGL = state;
    return sharedGL;
  }

  // Idle prewarm so the very first Morph open pays zero shader-compile cost
  if (typeof root.requestIdleCallback === 'function') {
    root.requestIdleCallback(() => {
      if (!sharedGL && doc.body) {
        try { acquireSharedWebGL(); } catch (_) {}
      }
    }, { timeout: 2500 });
  } else if (typeof root.setTimeout === 'function' && doc?.createElement) {
    root.setTimeout(() => {
      if (!sharedGL && doc.body) {
        try { acquireSharedWebGL(); } catch (_) {}
      }
    }, 1200);
  }

  function computeLocalRegion(s, vp) {
    const o = s.origin, b = s.bounds;
    const pad = 72;
    const vpLeft = vp.left || 0, vpTop = vp.top || 0;
    const vpRight = vpLeft + (vp.width || 0), vpBottom = vpTop + (vp.height || 0);
    const left = Math.max(Math.floor(vpLeft), Math.floor(Math.min(o.left, b.left) - pad));
    const top = Math.max(Math.floor(vpTop), Math.floor(Math.min(o.top, b.top) - pad));
    const right = Math.min(Math.ceil(vpRight), Math.ceil(Math.max(o.right, b.left + b.width) + pad));
    const bottom = Math.min(Math.ceil(vpBottom), Math.ceil(Math.max(o.bottom, b.top + b.height) + pad + 24));
    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  }

  function createRenderer(s) {
    const dpr = Math.min(root.devicePixelRatio || 1, 2), v = s.viewport;
    const parseColor = (value, fallback) => {
      const values = (value || '').match(/[\d.]+/g)?.map(Number);
      return values?.length >= 3 ? [...values.slice(0, 3), clamp(values[3] ?? 1, 0, 1)] : fallback;
    };
    const readColor = (node, fallback) => parseColor(root.getComputedStyle?.(node)?.backgroundColor, fallback);
    const triggerStyle = root.getComputedStyle?.(s.trigger);
    const borderStyle = triggerStyle?.borderTopStyle || triggerStyle?.borderStyle || 'none';
    const borderWidth = ['none', 'hidden'].includes(borderStyle) ? 0 : Math.max(0, parseFloat(triggerStyle?.borderTopWidth || triggerStyle?.borderWidth) || 0);
    const borderColor = parseColor(triggerStyle?.borderTopColor || triggerStyle?.borderColor || triggerStyle?.color, [0, 0, 0, 0]);
    const target = readColor(s.menu, [255, 255, 255, 1]);
    const morphWhite = [255, 255, 255, 1];
    const finalStyle = root.getComputedStyle?.(s.menu);
    const finalBorder = Math.max(0, parseFloat(finalStyle?.borderTopWidth || finalStyle?.borderWidth) || 0);
    s.menu.style.setProperty('--morph-material-border-width', `${finalBorder}px`);

    let lastCanvasOpacity = '';
    const fadeCanvas = (node) => {
      const mix = smoothstep(.72, 1, s.p);
      const raw = (1 - mix) / Math.max(.001, 1 - target[3] * mix);
      const op = raw <= 0.0005 ? '0' : raw.toFixed(4);
      if (op !== lastCanvasOpacity) {
        lastCanvasOpacity = op;
        node.style.opacity = op;
      }
    };
    const origin = s.opts.transparentTrigger ? readColor(s.trigger, [255, 255, 255, 0]) : morphWhite;
    const materialOut = [255, 255, 255, 1];
    const material = (presence) => {
      if (!s.opts.transparentTrigger) return morphWhite;
      const alpha = lerp(origin[3], morphWhite[3], presence);
      for (let i = 0; i < 3; i++) {
        materialOut[i] = alpha ? lerp(origin[i] * origin[3], morphWhite[i] * morphWhite[3], presence) / alpha : morphWhite[i];
      }
      materialOut[3] = alpha;
      return materialOut;
    };

    const positionCanvas = (node, reg, scale) => {
      const targetW = Math.max(1, Math.ceil(reg.width * scale));
      const targetH = Math.max(1, Math.ceil(reg.height * scale));
      if (node.width !== targetW) node.width = targetW;
      if (node.height !== targetH) node.height = targetH;
      // Clear shorthand inset FIRST so subsequent left/top/width/height are never overwritten.
      node.style.inset = 'auto';
      node.style.right = 'auto';
      node.style.bottom = 'auto';
      node.style.position = 'fixed';
      node.style.left = reg.left + 'px';
      node.style.top = reg.top + 'px';
      node.style.width = (targetW / scale) + 'px';
      node.style.height = (targetH / scale) + 'px';
    };

    const shared = acquireSharedWebGL();
    if (shared && shared.ready && !shared.lost) {
      const { canvas, gl, program, u } = shared;
      shared.owner = s;
      let region = computeLocalRegion(s, v);
      s.overlay.appendChild(canvas);
      canvas.style.opacity = '1';
      lastCanvasOpacity = '1';

      const updateViewport = (vp) => {
        if (shared.owner !== s || shared.lost || gl.isContextLost?.()) return;
        region = computeLocalRegion(s, vp);
        positionCanvas(canvas, region, dpr);
        gl.disable(gl.SCISSOR_TEST);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);
        gl.uniform2f(u.u_res, canvas.width, canvas.height);
        gl.uniform2f(u.u_offset, region.left, region.top);
      };
      updateViewport(v);
      gl.uniform1f(u.u_dpr, dpr);
      gl.uniform1f(u.u_active, 1);
      gl.uniform1f(u.u_lightTheme, morphWhite[0] + morphWhite[1] + morphWhite[2] > 400 ? 1 : 0);
      gl.uniform1f(u.u_borderWidth, borderWidth);
      gl.uniform4f(u.u_borderColor, borderColor[0] / 255, borderColor[1] / 255, borderColor[2] / 255, borderColor[3]);
      gl.uniform1f(u.u_dimB, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return {
        resize: updateViewport,
        draw(prims, shadowPresence, borderPresence, dimB = 0) {
          if (shared.owner !== s || shared.lost || gl.isContextLost?.()) return;
          fadeCanvas(canvas);
          gl.useProgram(program);
          gl.uniform1f(u.u_shadowPresence, shadowPresence);
          gl.uniform1f(u.u_borderPresence, borderPresence);
          gl.uniform1f(u.u_dimB, clamp(dimB, 0, 1));
          const fill = material(shadowPresence);
          gl.uniform4f(u.u_color, fill[0] / 255, fill[1] / 255, fill[2] / 255, fill[3]);
          const bA = prims.blobA, bM = prims.blobM, bB = prims.blobB;
          gl.uniform4f(u.u_blobA, bA.x, bA.y, bA.w, bA.h);
          gl.uniform3f(u.u_blobAExtra, bA.r, bA.vTaper, bA.hTaper);
          gl.uniform4f(u.u_blobM, bM.x, bM.y, bM.w, bM.h);
          gl.uniform2f(u.u_blobMExtra, bM.r, bM.vTaper);
          gl.uniform4f(u.u_blobB, bB.x, bB.y, bB.w, bB.h);
          gl.uniform3f(u.u_blobBExtra, bB.r, bB.vTaper, bB.hTaper);
          gl.uniform1f(u.u_kAM, prims.kAM);
          gl.uniform1f(u.u_kMB, prims.kMB);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        },
        dispose() {
          // Only release shared GPU surface if this session still owns it
          if (shared.owner !== s) return;
          shared.owner = null;
          if (!shared.lost && !gl.isContextLost?.()) {
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
          }
          canvas.style.opacity = '0';
          if (canvas.parentNode === s.overlay) {
            canvas.remove?.();
            if (canvas.parentNode?.removeChild) canvas.parentNode.removeChild(canvas);
          }
        }
      };
    }

    // Optimized Canvas 2D Fallback: localized region + 0.5x scale + reusable ImageData buffer
    const fallback = doc.createElement('canvas');
    fallback.className = 'surface-morph-sdf';
    fallback.setAttribute('aria-hidden', 'true');
    s.overlay.appendChild(fallback);
    const fbScale = 0.5;
    let region = computeLocalRegion(s, v);
    positionCanvas(fallback, region, fbScale);
    const ctx = fallback.getContext?.('2d');
    let reusableImg = null;
    const ensureImageData = (w, h) => {
      if (!ctx || w <= 0 || h <= 0) return null;
      if (!reusableImg || reusableImg.width !== w || reusableImg.height !== h) {
        reusableImg = ctx.createImageData(w, h);
      }
      return reusableImg;
    };

    function distance(b, x, y) {
      if (b.w <= .5 || b.h <= .5) return 1000;
      const dx = x - b.x, dy = y - b.y;
      const hw = Math.max(2, b.w * .5 * (1 + b.vTaper * clamp(dy / Math.max(b.h * .5, 1), -1, 1)));
      const hh = Math.max(2, b.h * .5 * (1 + (b.hTaper || 0) * clamp(dx / Math.max(b.w * .5, 1), -1, 1)));
      const r = Math.min(b.r, hw, hh), qx = Math.abs(dx) - hw + r, qy = Math.abs(dy) - hh + r;
      return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
    }
    const union = (a, b, k) => { if (k <= .001) return Math.min(a, b); const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
    const isLight = morphWhite[0] + morphWhite[1] + morphWhite[2] > 400;
    const shadowMulBase = isLight ? .13 : .34;

    return {
      resize(vp) {
        region = computeLocalRegion(s, vp);
        positionCanvas(fallback, region, fbScale);
        reusableImg = null;
      },
      draw(prims, shadowPresence, borderPresence, dimB = 0) {
        fadeCanvas(fallback);
        if (!ctx) return;
        const bA = prims.blobA, bM = prims.blobM, bB = prims.blobB;
        const blobs = [];
        if (bA.w > .5 && bA.h > .5) blobs.push(bA);
        if (bM.w > .5 && bM.h > .5) blobs.push(bM);
        if (bB.w > .5 && bB.h > .5) blobs.push(bB);
        ctx.clearRect(0, 0, fallback.width, fallback.height);
        if (!blobs.length) return;

        const pad = 32 + Math.max(prims.kAM, prims.kMB);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < blobs.length; i++) {
          const bl = blobs[i];
          if (bl.x - bl.w * .6 < minX) minX = bl.x - bl.w * .6;
          if (bl.y - bl.h * .6 < minY) minY = bl.y - bl.h * .6;
          if (bl.x + bl.w * .6 > maxX) maxX = bl.x + bl.w * .6;
          if (bl.y + bl.h * .6 > maxY) maxY = bl.y + bl.h * .6;
        }
        const left = Math.max(0, Math.floor((minX - pad - region.left) * fbScale));
        const top = Math.max(0, Math.floor((minY - pad - region.top) * fbScale));
        const right = Math.min(fallback.width, Math.ceil((maxX + pad - region.left) * fbScale));
        const bottom = Math.min(fallback.height, Math.ceil((maxY + pad + 8 - region.top) * fbScale));
        const rw = right - left, rh = bottom - top;
        if (rw <= 0 || rh <= 0) return;

        const img = ensureImageData(rw, rh);
        if (!img) return;
        const data = img.data;
        const fill = material(shadowPresence), dim = clamp(dimB, 0, 1);
        const f0 = fill[0] * lerp(1, .935, dim), f1 = fill[1] * lerp(1, .945, dim), f2 = fill[2] * lerp(1, .965, dim), f3 = fill[3] * lerp(1, .94, dim);
        const shadowMul = shadowMulBase * shadowPresence * f3 * lerp(1, .65, dim);
        const invScale = 1 / fbScale;
        const kAM = prims.kAM, kMB = prims.kMB;

        for (let y = 0; y < rh; y++) {
          const wy = region.top + (top + y + .5) * invScale;
          const wyShadow = wy - 8;
          for (let x = 0; x < rw; x++) {
            const wx = region.left + (left + x + .5) * invScale;
            const d = union(union(distance(bA, wx, wy), distance(bM, wx, wy), kAM), distance(bB, wx, wy), kMB);
            const coverage = 1 - smoothstep(-1.2, 1.2, d);
            const a = coverage * f3;
            const inner = 1 - smoothstep(-1.2, 1.2, d + borderWidth);
            const edge = Math.max(0, coverage - inner) * borderColor[3] * borderPresence;
            const dS = union(union(distance(bA, wx, wyShadow), distance(bM, wx, wyShadow), kAM), distance(bB, wx, wyShadow), kMB);
            const shadow = (1 - smoothstep(-2, 26, dS)) * shadowMul;
            const invCov = 1 - coverage, invEdge = 1 - edge;
            const alpha = edge + (a + shadow * invCov) * invEdge;
            const idx = (y * rw + x) * 4;
            if (alpha > 0.001) {
              const invA = 1 / alpha;
              data[idx] = (borderColor[0] * edge + (f0 * a + 7.65 * shadow * invCov) * invEdge) * invA;
              data[idx + 1] = (borderColor[1] * edge + (f1 * a + 12.75 * shadow * invCov) * invEdge) * invA;
              data[idx + 2] = (borderColor[2] * edge + (f2 * a + 25.5 * shadow * invCov) * invEdge) * invA;
              data[idx + 3] = alpha * 255;
            } else {
              data[idx] = data[idx + 1] = data[idx + 2] = data[idx + 3] = 0;
            }
          }
        }
        ctx.putImageData(img, left, top);
      },
      dispose() {
        reusableImg = null;
        fallback.remove?.();
      }
    };
  }

  function applyStaticMenuBox(s) {
    const menu = s.menu, bounds = s.bounds;
    menu.style.width = bounds.width + 'px';
    menu.style.height = bounds.height + 'px';
    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.style.borderRadius = s.radius + 'px';
  }

  function frame(s) {
    const p=s.p,g=s.geometry,bounds=s.bounds,subAmt=clamp(s.subP||0,0,1);
    const recedeShiftY=s.sub?.geom?.recedeShiftY??10;
    const prims=computeMorphPrimitives(p,g,s.dirMix,subAmt,recedeShiftY),b=prims.blobB;
    s.primitives=prims;
    const menu=s.menu,icon=s.icon;
    const fc=s._frameCache||(s._frameCache={});

    const sx=b.w/bounds.width,sy=b.h/bounds.height;
    menu.style.transform=`translate3d(${(b.x-b.w*.5).toFixed(2)}px, ${(b.y-b.h*.5).toFixed(2)}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    const contentRadius=`${(b.r/Math.max(.01,sx)).toFixed(2)}px / ${(b.r/Math.max(.01,sy)).toFixed(2)}px`;
    if(fc.contentRadius!==contentRadius){fc.contentRadius=contentRadius;s.content.style.borderRadius=contentRadius;}

    const menuAlpha=smoothstep(.24,.54,p);
    const menuAlphaStr=menuAlpha.toFixed(4);
    if(fc.menuAlpha!==menuAlphaStr){fc.menuAlpha=menuAlphaStr;menu.style.opacity=menuAlphaStr;}

    const presenceStr=p.toFixed(4);
    if(fc.presence!==presenceStr){fc.presence=presenceStr;menu.style.setProperty('--morph-surface-presence',presenceStr);}
    const termMatStr=smoothstep(.72,1,p).toFixed(4);
    if(fc.termMat!==termMatStr){fc.termMat=termMatStr;menu.style.setProperty('--morph-terminal-material',termMatStr);}
    const subDimStr=subAmt.toFixed(4);
    if(fc.subDim!==subDimStr){fc.subDim=subDimStr;menu.style.setProperty('--morph-sub-dim',subDimStr);}

    const termBlur=p>=.72;
    if(fc.termBlur!==termBlur){fc.termBlur=termBlur;menu.classList.toggle('is-terminal-blur',termBlur);}
    const isSubVisible=Boolean(s.sub&&s.subP>0.0005);
    if(fc.isSubVisible!==isSubVisible){fc.isSubVisible=isSubVisible;menu.classList.toggle('is-submorph-receded',isSubVisible);}

    const iconAlpha=1-smoothstep(.02,.20,p);
    if(iconAlpha>0.001||fc.iconHidden!==true){
      if(iconAlpha<=0.001){
        fc.iconHidden=true;
        icon.style.opacity='0';
        icon.style.filter='none';
      }else{
        fc.iconHidden=false;
        const phase=clamp(p/.21,0,1),scale=lerp(1,.44,easeOutCubic(phase));
        icon.style.transform=`translate3d(${((prims.blobA.x-g.btnCx)*.85).toFixed(2)}px, ${((prims.blobA.y-g.btnCy)*.92).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
        icon.style.opacity=iconAlpha.toFixed(4);
        const iconBlur=9.5*Math.pow(phase,.85);
        icon.style.filter=iconBlur>0.12?`blur(${iconBlur.toFixed(2)}px)`:'none';
        for(let i=0;i<s.slots.length;i++){
          const {node,position}=s.slots[i];
          const offset=(position-.5)*g.btnW;
          const local=clamp(p/Math.max(.09,.21-Math.abs(offset)/Math.max(1,g.btnW)*.07),0,1);
          node.style.transform=`translate3d(${(-offset*easeOutCubic(local)*.55).toFixed(2)}px, 0, 0)`;
        }
      }
    }

    const rowCache=fc.rows||(fc.rows=new Array(s.rows.length));
    const maxStagger=s.rows.length>7?.27:0;
    for(let idx=0;idx<s.rows.length;idx++){
      const row=s.rows[idx];
      const isTopSearch=row.classList?.contains('template-tag-search');
      const stagger=maxStagger?(idx/(s.rows.length-1))*maxStagger:idx*.045;
      const start=isTopSearch?.48:.28+stagger;
      const span=isTopSearch?.42:Math.max(.01,.56-stagger*.4);
      const progress=clamp((p-start)/span,0,1);
      const ease=easeOutCubic(progress);
      const alpha=smoothstep(0,.68,progress)*lerp(1,0.46,subAmt);
      const isOriginHidden=isSubVisible&&s.sub.triggerRow===row;
      const vis=isOriginHidden?'hidden':'visible';
      const opStr=isOriginHidden?'0':alpha.toFixed(3);
      // Skip expensive blur filter when row is completely invisible (alpha === 0)
      const blurPx=(!isOriginHidden&&alpha>0.005)?((1-ease)*11+subAmt*0.6):0;
      const filterStr=blurPx>.15?`blur(${blurPx.toFixed(2)}px)`:'none';
      const ty=((1-ease)*-8).toFixed(2);
      const tfStr=`translate3d(0, ${ty}px, 0)`;
      const prev=rowCache[idx];
      if(!prev||prev.vis!==vis||prev.op!==opStr||prev.filter!==filterStr||prev.tf!==tfStr){
        if(!prev||prev.vis!==vis) row.style.visibility=vis;
        if(!prev||prev.op!==opStr) row.style.opacity=opStr;
        if(!prev||prev.filter!==filterStr) row.style.filter=filterStr;
        if(!prev||prev.tf!==tfStr) row.style.transform=tfStr;
        rowCache[idx]={vis,op:opStr,filter:filterStr,tf:tfStr};
      }
    }

    if(s.sub){
      const sub=s.sub,sg=sub.geom;
      if(isSubVisible){
        const t=subAmt;
        const curLeft=lerp(sg.startLeft,sg.endLeft,t);
        const curTop=lerp(sg.startTop,sg.endTop,t);
        const curW=lerp(sg.startW,sg.endW,t);
        const curH=lerp(sg.startH,sg.endH,t);
        const curR=lerp(22.0,s.radius,t);
        const padX=sg.padLeft*t;
        const padY=sg.padTop*t;
        const baseB=prims.blobBBase;
        const baseLeft=baseB.x-baseB.w*0.5;
        const baseScaleX=baseB.w/Math.max(1,bounds.width);
        const baseScaleY=baseB.h/Math.max(1,bounds.height);
        const screenX=baseLeft+(curLeft-bounds.left)*baseScaleX;
        const screenY=baseB.top+(curTop-bounds.top)*baseScaleY;
        const shadowStrength=smoothstep(0.0,0.42,t)*menuAlpha;

        if(sub.layer.style.display!=='block') sub.layer.style.display='block';
        sub.layer.style.opacity=menuAlpha.toFixed(3);
        sub.layer.style.width=curW.toFixed(2)+'px';
        sub.layer.style.height=curH.toFixed(2)+'px';
        sub.layer.style.borderRadius=curR.toFixed(2)+'px';
        sub.layer.style.transform=`translate3d(${screenX.toFixed(2)}px, ${screenY.toFixed(2)}px, 0) scale(${baseScaleX.toFixed(4)}, ${baseScaleY.toFixed(4)})`;
        sub.layer.style.setProperty('--submorph-shadow-strength',shadowStrength.toFixed(3));
        if(sub.inner) sub.inner.style.transform=`translate3d(${padX.toFixed(2)}px, ${padY.toFixed(2)}px, 0)`;

        if(sub.headerChevron){
          const rCol=Math.round(lerp(148,37,t));
          const gCol=Math.round(lerp(160,99,t));
          const bCol=Math.round(lerp(184,235,t));
          const colStr=`rgb(${rCol},${gCol},${bCol})`;
          if(sub._lastChevronCol!==colStr){
            sub._lastChevronCol=colStr;
            sub.headerChevron.style.color=colStr;
            if(sub.headerChevronSvg) sub.headerChevronSvg.style.stroke=colStr;
          }
        }

        const subRowCache=sub._rowCache||(sub._rowCache=new Array(sub.optionNodes.length));
        for(let sIdx=0;sIdx<sub.optionNodes.length;sIdx++){
          const sRow=sub.optionNodes[sIdx];
          const sStagger=sIdx*0.07;
          const sProg=clamp((t-(0.08+sStagger))/(0.62-sStagger*0.3),0,1);
          const sEase=easeOutCubic(sProg);
          const sAlpha=smoothstep(0,0.72,sProg);
          const sBlur=sAlpha>0.005?(1-sEase)*5.5:0;
          const sSlideY=(1-sEase)*-10.0;
          const sOpStr=sAlpha.toFixed(3);
          const sFilterStr=sBlur>0.12?`blur(${sBlur.toFixed(2)}px)`:'none';
          const sTfStr=`translate3d(0, ${sSlideY.toFixed(2)}px, 0)`;
          const prev=subRowCache[sIdx];
          if(!prev||prev.op!==sOpStr||prev.filter!==sFilterStr||prev.tf!==sTfStr){
            if(!prev||prev.op!==sOpStr) sRow.style.opacity=sOpStr;
            if(!prev||prev.filter!==sFilterStr) sRow.style.filter=sFilterStr;
            if(!prev||prev.tf!==sTfStr) sRow.style.transform=sTfStr;
            subRowCache[sIdx]={op:sOpStr,filter:sFilterStr,tf:sTfStr};
          }
        }

        const canInteract=t>0.55&&s.subTargetP>0.5&&p>0.85&&s.phase!=='closing';
        if(sub._lastCanInteract!==canInteract){
          sub._lastCanInteract=canInteract;
          sub.layer.classList.toggle('interactive',canInteract);
          sub.layer.inert=!canInteract;
        }
        if(canInteract&&!s.subInteractive){
          s.subInteractive=true;
          activateSubmenu(s);
        }else if(!canInteract){
          s.subInteractive=false;
        }
      }else{
        if(sub.layer.style.display!=='none'){
          sub.layer.style.display='none';
          sub.layer.classList.remove('interactive');
          sub.layer.inert=true;
          sub._lastCanInteract=false;
        }
        s.subInteractive=false;
      }
    }

    s.renderer?.draw(prims,smoothstep(0,1,p),1-smoothstep(0,.32,p),subAmt);
    if(s.phase==='opening'&&p>.68)activate(s);
    if(gesture?.session===s)updateGestureHover();
  }

  function run(s) {
    if(s.raf)cancel(s.raf);
    let last=now();const runId=s.runId=(s.runId||0)+1;
    const tick=time=>{
      s.raf=null;
      if(current!==s||s.disposed||s.runId!==runId)return;
      if(s.trigger.isConnected===false){finish(s,'trigger_removed',false);return;}
      const dt=clamp(((typeof time==='number'?time:now())-last)/1000,0,.05);last=typeof time==='number'?time:now();
      const target=s.phase==='closing'?0:1;
      s.dirMix+=(target-s.dirMix)*(1-Math.exp(-dt*18));
      if(reduced()){
        s.p=target;s.velocity=0;
        if(s.sub||s.subP>0){s.subP=s.subTargetP;s.subVelocity=0;}
      }else {
        const stiffness=target?195:235,damping=target?24.5:27.5;
        for(let i=0;i<4;i++){s.velocity+=(-stiffness*(s.p-target)-damping*s.velocity)*(dt/4);s.p+=s.velocity*(dt/4);}
        if(Math.abs(s.p-target)<.0006&&Math.abs(s.velocity)<.004){s.p=target;s.velocity=0;}
        s.p=clamp(s.p,0,1);

        if(s.sub||s.subP>0){
          const isClosingAll=target<0.5&&s.subP>0.001;
          const subStiffness=isClosingAll?340.0:(s.subTargetP>0.5?250.0:285.0);
          const subDamping=isClosingAll?33.0:(s.subTargetP>0.5?27.5:30.0);
          for(let i=0;i<4;i++){
            s.subVelocity+=(-subStiffness*(s.subP-s.subTargetP)-subDamping*s.subVelocity)*(dt/4);
            s.subP+=s.subVelocity*(dt/4);
          }
          if(Math.abs(s.subP-s.subTargetP)<.0006&&Math.abs(s.subVelocity)<.004){
            s.subP=s.subTargetP;s.subVelocity=0;
          }
          s.subP=clamp(s.subP,0,1);
        }
      }
      frame(s);
      if(current!==s||s.disposed||s.runId!==runId)return;
      if(s.sub&&s.subP===0&&s.subTargetP===0&&s.subVelocity===0){
        cleanupSubmenu(s,s.phase!=='closing');
      }
      const primaryDone=s.p===target&&s.velocity===0;
      const subDone=!s.sub||(s.subP===s.subTargetP&&s.subVelocity===0);
      if(primaryDone&&subDone){
        if(target)settle(s);
        else finish(s,s.closeReason,s.closeReason!=='focus_out');
      }else{
        s.raf=raf(tick);
      }
    };
    if(reduced())tick(last);else s.raf=raf(tick);
  }
  function focusItems(container) {
    return Array.from((container||current?.menu)?.querySelectorAll?.('button, a[href], input, select, textarea, [tabindex]')||[]).filter(el=>!el.disabled&&el.getAttribute?.('aria-disabled')!=='true'&&!el.hidden);
  }
  function activate(s) {
    if(s.interactive)return;
    s.interactive=true;s.menu.inert=false;s.menu.classList.add('is-content-visible');
    const items=focusItems(s.menu); if(s.opts.keyboard!=='content') items.forEach((el,index)=>{el.tabIndex=index? -1:0;});
    if(!isSubActive(s)){
      const first=(s.opts.autoFocus===false||items[0]?.matches?.('input,textarea,select'))?s.menu:(items[0]||s.menu);
      first.focus?.({preventScroll:true});
    }
  }
  function activateSubmenu(s) {
    const sub=s.sub;if(!sub)return;
    const items=focusItems(sub.layer);
    items.forEach((el,index)=>{el.tabIndex=index===0?0:-1;});
    const firstOpt=sub.optionNodes.find(n=>n.matches?.('button, a[href], [role="menuitem"]'));
    (firstOpt||items[0]||sub.layer).focus?.({preventScroll:true});
  }
  function beginMorphMotion(s) {
    if (s._motionHandle) return;
    if (root.MotionCoordinator) {
      s._motionHandle = root.MotionCoordinator.begin('morph', { maskMode: 'defer', pauseDecor: true });
    } else {
      root.DynamicMaskSystem?.setMotionMode?.('defer');
    }
  }
  function endMorphMotion(s) {
    if (s._motionHandle) {
      s._motionHandle.end();
      s._motionHandle = null;
    } else {
      root.DynamicMaskSystem?.setMotionMode?.('normal');
    }
  }
  function settle(s) {
    if(s.phase!=='open'){
      s.phase='open';activate(s);s.menu.classList.add('is-settled');s.menu.style.willChange='auto';s.content.style.borderRadius='';
      if(s.opts.keepTrigger) s.trigger.classList.remove('is-hidden-for-morph','surface-morph-trigger-hidden');
      endMorphMotion(s);
      s.opts.onOpened?.(s.menu);
    }
  }
  function computeSubmenuGeometry(s, triggerRow, layer, inner) {
    const bounds=s.bounds,vp=s.viewport;
    const innerStyle=inner&&root.getComputedStyle?root.getComputedStyle(inner):null;
    const layerStyle=root.getComputedStyle?root.getComputedStyle(layer):null;
    const contentStyle=root.getComputedStyle?root.getComputedStyle(s.content):null;
    const padLeft=parseFloat(innerStyle?.paddingLeft)||parseFloat(contentStyle?.paddingLeft)||7;
    const padRight=parseFloat(innerStyle?.paddingRight)||parseFloat(contentStyle?.paddingRight)||7;
    const padTop=parseFloat(innerStyle?.paddingTop)||parseFloat(contentStyle?.paddingTop)||7;
    const padBottom=parseFloat(innerStyle?.paddingBottom)||parseFloat(contentStyle?.paddingBottom)||7;
    const borderLeft=parseFloat(layerStyle?.borderLeftWidth)||0;
    const borderRight=parseFloat(layerStyle?.borderRightWidth)||0;
    const borderTop=parseFloat(layerStyle?.borderTopWidth)||0;
    const borderBottom=parseFloat(layerStyle?.borderBottomWidth)||0;

    const rowRect=triggerRow.getBoundingClientRect?.();
    const hasOffset=Number.isFinite(triggerRow.offsetTop)&&triggerRow.offsetWidth>0;
    const startW=hasOffset?triggerRow.offsetWidth:(rowRect?.width||Math.max(1,bounds.width-padLeft-padRight));
    const startH=hasOffset?triggerRow.offsetHeight:(rowRect?.height||44);
    const startLeft=hasOffset?(bounds.left+triggerRow.offsetLeft):(rowRect?.left??bounds.left+padLeft);
    const startTop=hasOffset?(bounds.top+triggerRow.offsetTop):(rowRect?.top??bounds.top+padTop);

    const endW=Math.min(Math.max(bounds.width,Math.round(startW+padLeft+padRight+borderLeft+borderRight)),Math.max(1,vp.width-28));
    if(inner)inner.style.width=`${Math.max(1,endW-padLeft-padRight-borderLeft-borderRight)}px`;

    const prevDisplay=layer.style.display,prevVis=layer.style.visibility;
    layer.style.width=`${endW}px`;layer.style.height='auto';layer.style.visibility='hidden';layer.style.display='block';
    if(!layer.parentNode)s.overlay.appendChild(layer);
    const measuredInnerH=Math.ceil(inner?.getBoundingClientRect?.().height||layer.getBoundingClientRect?.().height||0);
    const measuredH=measuredInnerH>0?(measuredInnerH+padTop+padBottom+borderTop+borderBottom):165;
    const endH=Math.min(measuredH,Math.max(1,vp.height-28));
    layer.style.visibility=prevVis;layer.style.display=prevDisplay||'none';

    let idealEndTop=startTop-padTop-borderTop;
    const maxBottom=vp.top+vp.height-14;
    const maxPeekingOffset=136;
    if(idealEndTop>bounds.top+maxPeekingOffset)idealEndTop=bounds.top+maxPeekingOffset;
    if(idealEndTop+endH>maxBottom)idealEndTop=maxBottom-endH;

    const isFirstRow=(startTop-bounds.top)<=(padTop+4);
    const minTop=!isFirstRow?(bounds.top+36):Math.max(vp.top+14,bounds.top);
    const endTop=clamp(idealEndTop,minTop,Math.max(minTop,maxBottom-endH));
    const endLeft=clamp(bounds.left,vp.left+14,Math.max(vp.left+14,vp.left+vp.width-endW-14));
    const recedeShiftY=isFirstRow?14:10;

    return {startLeft,startTop,startW,startH,endLeft,endTop,endW,endH,padLeft,padRight,padTop,padBottom,borderLeft,borderRight,borderTop,borderBottom,recedeShiftY};
  }
  function cleanupSubmenu(s, restoreFocus=false) {
    const sub=s?.sub;if(!sub)return;
    s.sub=null;s.subInteractive=false;s.subP=0;s.subVelocity=0;s.subTargetP=0;
    s.menu.classList.remove('is-submorph-receded');
    s.menu.style.setProperty('--morph-sub-dim','0');
    if(s.phase==='open')s.menu.style.willChange='auto';
    const row=sub.triggerRow;
    if(row){
      row.style.visibility='';row.style.opacity='1';
      row.classList.remove('is-submorph-origin-hidden');
    }
    sub.layer.remove?.();
    if(sub.layer.parentNode?.removeChild)sub.layer.parentNode.removeChild(sub.layer);
    sub.onRetract?.();
    if(restoreFocus&&s.phase!=='closing'&&!s.disposed&&row?.isConnected&&!row.closest?.('[inert]')){
      row.focus?.({preventScroll:true});
    }
  }
  function openSubmenu(triggerRow, subOpts={}) {
    const s=current;
    if(!s||s.disposed||s.phase==='closing'||!triggerRow||!s.menu.contains(triggerRow))return false;
    if(s.sub&&s.sub.triggerRow===triggerRow){
      if(subOpts.onRetract)s.sub.onRetract=subOpts.onRetract;
      s.subTargetP=1;
      if(reduced()){s.subP=1;s.subVelocity=0;frame(s);}else run(s);
      return true;
    }
    if(s.sub)cleanupSubmenu(s,false);
    const layer=subOpts.layer||doc.createElement('div');
    if(!subOpts.layer&&subOpts.content)layer.appendChild(subOpts.content);
    layer.classList.add('surface-morph-submenu','export-submorph-panel');
    if(!layer.getAttribute('role'))layer.setAttribute('role','menu');
    layer.style.position='fixed';layer.style.left='0px';layer.style.top='0px';layer.style.transformOrigin='0 0';
    layer.inert=true;
    const inner=layer.querySelector?.('.export-submorph-inner, .submenu-inner')||layer.firstElementChild;
    const headerRow=layer.querySelector?.('.export-submorph-header, .submenu-header-row');
    const headerChevron=headerRow?.querySelector?.('.morph-item-chevron, .submenu-chevron')||null;
    const headerChevronSvg=headerChevron?.querySelector?.('svg')||null;
    const optionNodes=Array.from(layer.querySelectorAll?.('.export-submorph-option, .export-submorph-divider, .submenu-option')||[]);
    const geom=computeSubmenuGeometry(s,triggerRow,layer,inner);
    if(!layer.parentNode)s.overlay.appendChild(layer);
    layer.addEventListener?.('keydown',event=>{
      const items=focusItems(layer),index=items.indexOf(doc.activeElement);
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&items.length){
        event.preventDefault();event.stopPropagation();
        const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
        items.forEach((el,i)=>{el.tabIndex=i===next?0:-1;});items[next].focus?.();
      }else if(event.key==='Tab'){
        event.preventDefault();event.stopPropagation();
        if(items.length){const next=(index+(event.shiftKey?-1:1)+items.length)%items.length;items.forEach((el,i)=>{el.tabIndex=i===next?0:-1;});items[next].focus?.();}
      }
    });
    s.sub={triggerRow,layer,inner,headerRow,headerChevron,headerChevronSvg,optionNodes,geom,onRetract:subOpts.onRetract};
    s.menu.style.willChange='transform,opacity';
    s.subP=0;s.subVelocity=0;s.subTargetP=1;s.subInteractive=false;
    if(reduced()){s.subP=1;s.subVelocity=0;frame(s);}
    else{frame(s);run(s);}
    return true;
  }
  function closeSubmenu(immediate=false) {
    const s=current;if(!s||!s.sub)return;
    s.subTargetP=0;
    if(immediate||reduced()){s.subP=0;s.subVelocity=0;frame(s);cleanupSubmenu(s,s.phase!=='closing');}
    else run(s);
  }
  function finish(s,reason,restore=true) {
    if(!s||s.disposed) return;
    if(gesture?.session===s)endGesture();
    if(s.sub)cleanupSubmenu(s,false);
    root.IconMotion?.cleanup?.(s.menu);
    s.disposed=true;s.renderer?.dispose(); for(const row of s.rows||[]) {const original=s.rowStyles.get(row);for(const key of ['opacity','filter','transform'])row.style[key]=original[key];} if(s.raf) cancel(s.raf);s.lease?.release(); s.motion?.removeEventListener?.('change',s.onMotion);s.stopResize?.();
    s.trigger.classList?.remove('is-hidden-for-morph','surface-morph-trigger-hidden');s.trigger.setAttribute?.('aria-expanded','false');
    s.menu.style.willChange='auto';s.content.style.willChange='auto';s.icon.style.willChange='auto';s.overlay.remove?.();
    if(s.overlay.parentNode?.removeChild) s.overlay.parentNode.removeChild(s.overlay);
    if(current===s) { current=null; endMorphMotion(s); }
    s.opts.onClose?.(reason);
    if(restore&&s.opts.returnFocus!==false&&s.trigger.isConnected!==false&&!s.trigger.closest?.('[inert]')) s.trigger.focus?.({preventScroll:true});
    s.resolve({reason});
    const callbacks=s.callbacks.splice(0); if(!['navigation','unmount','destroy','trigger_removed','modal'].includes(reason)) callbacks.forEach(fn=>fn());
  }
  function close(reason,complete) {
    if(typeof reason==='function') {complete=reason;reason=null;}
    const s=current; if(!s) {complete?.();return;}
    if(complete) s.callbacks.push(complete);
    if(s.phase==='closing'&&['scroll','focus_out','tab'].includes(reason)) return;
    if(immediateReasons.has(reason)||reduced()) {finish(s,reason||'close',!['navigation','unmount','destroy','modal','focus_out','trigger_removed'].includes(reason));return;}
    if(s.phase==='closing') return;
    if(gesture?.session===s)endGesture();
    s.trigger.classList.add('is-hidden-for-morph','surface-morph-trigger-hidden');
    s.phase='closing';s.closeReason=reason||'close';
    beginMorphMotion(s);
    if(s.sub)s.subTargetP=0;
    s.trigger.setAttribute?.('aria-expanded','false');s.menu.inert=true;s.interactive=false;s.menu.classList.remove('is-settled','is-content-visible');
    if(s.sub)s.sub.layer.inert=true;
    s.opts.onClosing?.(s.closeReason);
    run(s);
  }

  function open(trigger,opts={}) {
    if(!trigger||!opts.content||opts.signal?.aborted) return null;
    if(!root.OverlayManager?.acquirePopover) throw new Error('SurfaceMorph requires OverlayManager');
    if(current?.trigger===trigger) {
      const s=current;
      if(s.phase!=='closing') {close('toggle');return s.handle;}
      if(s.closeReason==='action') {finish(s,'action');} else {
        s.phase='opening';s.callbacks.length=0;
        s.trigger.setAttribute?.('aria-expanded','true');
        run(s);return s.handle;
      }
    }
    if(current) finish(current,current.closeReason==='action'?'action':'replaced',false);
    const origin=readRect(trigger),v=viewport(),overlay=doc.createElement('div'),menu=doc.createElement('div');
    overlay.className='surface-morph-overlay project-option-overlay is-active';menu.className='surface-morph-surface global-project-option-menu morph-dropdown-surface'+(opts.className?' '+opts.className:'')+(opts.transparentTrigger?' surface-morph-transparent-trigger':'');
    menu.id=opts.id||`surface-morph-${++sequence}`;menu.tabIndex=-1;menu.setAttribute('role',opts.role||'menu');menu.setAttribute('aria-label',opts.label||'選單');
    if(opts.role==='dialog') menu.setAttribute('aria-modal','false');
    const icon=doc.createElement('span');icon.className='morph-icon';icon.setAttribute('aria-hidden','true');icon.inert=true;
    if(opts.triggerIconHTML) icon.innerHTML=opts.triggerIconHTML;else copyTrigger(trigger,icon,true);
    const content=doc.createElement('div');content.className='morph-menu-content';content.appendChild(opts.content);menu.appendChild(content);overlay.appendChild(menu);overlay.appendChild(icon);
    const width=Math.max(1,Math.min(Number(opts.width)||240,Math.max(1,v.width-28)));
    let height=Number(opts.height)||240;
    try {
      const measure=doc.createElement('div');measure.className=menu.className;measure.style.cssText=`position:fixed;left:-9999px;top:0;width:${width}px;height:auto;visibility:hidden;pointer-events:none;`;
      const clone=content.cloneNode(true);clone.querySelectorAll?.('[id]').forEach(node=>node.removeAttribute('id'));clone.style.position='static';clone.style.opacity='1';measure.appendChild(clone);doc.body.appendChild(measure);
      const measured=measure.getBoundingClientRect?.().height;if(measured>0) height=Math.ceil(measured);
      measure.remove?.();if(measure.parentNode?.removeChild) measure.parentNode.removeChild(measure);
    } catch(_) {}
    height=Math.max(1,Math.min(height,Math.max(1,v.height-28)));
    const alignment={start:0,center:.5,end:1}[opts.align??trigger.dataset?.morphAlign]??.5;
    const computeBounds=(orig,vp)=>{const left=orig.left+(orig.width-width)*alignment;let top=orig.bottom+10;if(top+height>vp.top+vp.height-14)top=orig.top-height-10;return {left:clamp(left,vp.left+14,Math.max(vp.left+14,vp.left+vp.width-width-14)),top:clamp(top,vp.top+14,Math.max(vp.top+14,vp.top+vp.height-height-14)),width,height};};

    const bounds=computeBounds(origin,v);
    let resolve;const closed=new Promise(done=>{resolve=done;});
    const radius=Number.isFinite(Number(opts.radius))?Math.max(0,Number(opts.radius)):24;
    const s={trigger,opts,origin,bounds,viewport:v,radius,overlay,menu,content,icon,resolve,callbacks:[],phase:'opening',disposed:false,raf:null,interactive:false,sub:null,subP:0,subVelocity:0,subTargetP:0,subInteractive:false};
    s.handle={closed,close:reason=>{if(current===s)close(reason);},get phase(){return s.phase;},menu};current=s;
    s.p=0;s.velocity=0;s.dirMix=1;s.geometry=geometry(s);
    s.rows=Array.from(content.querySelectorAll('.morph-item, .template-tag-search, .up-btn, .up-header, .up-settings-head'));
    s.slots=Array.from(opts.triggerIconHTML?[]:icon.children||[]).map((node,i)=>{
      const rect=trigger.children?.[i]?.getBoundingClientRect?.();
      return {node,position:rect?(rect.left+rect.width/2-origin.left)/origin.width:.5};
    });
    s.rowStyles=new Map(s.rows.map(row=>[row,Object.fromEntries(['opacity','filter','transform'].map(key=>[key,row.style[key]||'']))]));
    Object.assign(icon.style,{position:'fixed',left:origin.left+'px',top:origin.top+'px',width:origin.width+'px',height:origin.height+'px'});
    applyStaticMenuBox(s);
    menu.inert=true;doc.body.appendChild(overlay);
    beginMorphMotion(s);
    s.renderer=createRenderer(s);
    menu.classList.add('surface-morph-liquid');frame(s);
    trigger.setAttribute?.('data-morph-trigger','');
    trigger.classList?.add('is-hidden-for-morph','surface-morph-trigger-hidden');trigger.setAttribute?.('aria-expanded','true');trigger.setAttribute?.('aria-controls',menu.id);trigger.setAttribute?.('aria-haspopup',opts.role==='dialog'?'dialog':'menu');
    content.style.width='100%';content.style.maxHeight='100%';content.style.overflowY='auto';menu.style.willChange='transform,opacity';
    s.lease=root.OverlayManager.acquirePopover({panel:menu,trigger,signal:opts.signal,watchTriggerResize:opts.watchTriggerResize??opts.role==='dialog',
      isInside:target=>menu.contains?.(target)||Boolean(s.sub?.layer?.contains?.(target)||target?.closest?.('.export-submorph-panel')),
      onDismiss:reason=>{
        if(current!==s)return;
        if(reason==='escape'&&isSubActive(s)){closeSubmenu();return;}
        close(reason);
      }
    });
    const onViewportResize=()=>{if(current!==s||s.disposed)return;const vp=viewport();s.viewport=vp;s.origin=readRect(s.trigger);s.bounds=computeBounds(s.origin,vp);s.geometry=geometry(s);applyStaticMenuBox(s);if(s.sub){s.sub.geom=computeSubmenuGeometry(s,s.sub.triggerRow,s.sub.layer,s.sub.inner);}Object.assign(s.icon.style,{left:s.origin.left+'px',top:s.origin.top+'px',width:s.origin.width+'px',height:s.origin.height+'px'});s.renderer?.resize?.(vp);frame(s);};
    root.addEventListener?.('resize',onViewportResize,{passive:true});root.visualViewport?.addEventListener?.('resize',onViewportResize,{passive:true});
    s.stopResize=()=>{root.removeEventListener?.('resize',onViewportResize);root.visualViewport?.removeEventListener?.('resize',onViewportResize);};
    s.motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');s.onMotion=()=>{if(!s.motion.matches||current!==s)return;if(s.phase==='closing'){if(s.sub)s.subP=0;finish(s,s.closeReason);}else {if(s.raf)cancel(s.raf);s.p=1;s.velocity=0;if(s.sub){s.subP=s.subTargetP;s.subVelocity=0;}frame(s);settle(s);}};s.motion?.addEventListener?.('change',s.onMotion);
    overlay.addEventListener('pointerdown',event=>{
      const inSub=Boolean(s.sub?.layer?.contains?.(event.target)||event.target?.closest?.('.export-submorph-panel'));
      if(!menu.contains?.(event.target)&&!inSub){consume(event);blockRelease(event);close('outside_click');}
    });
    overlay.addEventListener('click',event=>{
      const inSub=Boolean(s.sub?.layer?.contains?.(event.target)||event.target?.closest?.('.export-submorph-panel'));
      if(s.phase==='closing'||(!menu.contains?.(event.target)&&!inSub)){consume(event);close('outside_click');}
    });
    menu.addEventListener('keydown',event=>{
      const items=focusItems(menu),index=items.indexOf(doc.activeElement);
      if(opts.keyboard!=='content'&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&items.length){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((el,i)=>{el.tabIndex=i===next?0:-1;});items[next].focus?.();}
      else if(event.key==='Tab'&&(opts.keyboard!=='content'||(event.shiftKey?index<=0:index===items.length-1)))close('tab');
    });
    run(s);
    return s.handle;
  }
  const api={open,close,openSubmenu,closeSubmenu,isOpen:()=>!!current&&current.phase!=='closing',isSubmenuOpen:()=>Boolean(current?.sub&&current.subTargetP>0.5),getState:()=>current?{phase:current.phase,trigger:current.trigger,role:current.opts.role||'menu'}:null,destroy:()=>{cancelGesture(false);close('destroy');}};
  root.SurfaceMorph=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
