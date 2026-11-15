/** Shared liquid Surface Morph: temp/morph.html SDF geometry, spring and session. */
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
      try {if(g.trigger.hasPointerCapture?.(g.id))g.trigger.releasePointerCapture(g.id);}catch(_){}
    }
    return g;
  }
  function cancelGesture(dismiss=true) {
    const g=endGesture();if(dismiss&&g?.active&&current===g.session)close('gesture_cancel');
  }
  function isValidItem(s,item) {
    return !(!item||!s.menu.contains(item)||item.disabled||item.hidden||item.getAttribute?.('aria-disabled')==='true'||item.closest?.('[hidden], [inert]'));
  }
  function gestureItemRaw(g) {
    const s=g.session;
    if(current!==s||s.disposed||s.phase==='closing'||!s.interactive)return null;
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
      if(gesture!==g||!g.active||g.hovered!==item||current!==g.session||g.session.disposed||g.session.phase==='closing'||!g.session.interactive)return;
      g.hoverPlayedItem=item;
      root.IconMotion?.play?.(item);
    },hoverIconDelay);
  }
  function trackGesture(g,session,haptic=false) {
    g.active=true;g.session=session;g.startX=g.x;g.startY=g.y;
    session.menu.classList.add('is-gesture-tracking');
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
    if(s&&(s.phase==='closing'||!s.menu.contains?.(event.target))) {
      consume(event);blockRelease(event);cancelGesture(false);close('outside_click');return;
    }
    if(gesture) {cancelGesture();return;}
    if(event.pointerType!=='touch'||event.isPrimary===false||event.button>0)return;
    if(event.target?.closest?.('input, textarea, select, [contenteditable="true"]'))return;
    // An already-open menu starts the same slide-to-select gesture immediately;
    // only its opener requires the hold timer.
    const scrollable=s?.interactive?event.target?.closest?.('.template-tag-grid'):null;
    if(scrollable&&scrollable.scrollHeight>scrollable.clientHeight+1)return;
    const item=s?.interactive?event.target?.closest?.(itemSelector):null;
    const trigger=item&&s.menu.contains(item)?item:event.target?.closest?.(triggerSelector);
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
    endGesture(!!item);
    if(item) {
      if(!alreadyPlayed)root.IconMotion?.play?.(item);
      if(item.dataset)item.dataset.imGesturePlayed='true';
      allowGestureClick=true;
      try {item.click?.();}finally {allowGestureClick=false;}
    } else if(g.moved&&current===g.session)close('gesture_cancel');
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
    if(current&&(current.phase==='closing'||!current.menu.contains?.(event.target))){consume(event);close('outside_click');}
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
  // Geometry and spring constants ported from temp/morph.html. One progress value
  // drives all three SDF blobs, trigger artwork, menu scale and staggered rows.
  const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const easeOutCubic=x=>1-Math.pow(1-clamp(x,0,1),3);
  function computeMorphPrimitives(prog, g, dirMix) {
    const btnW = g.btnW;
    const btnH = g.btnH;
    const widthRatio = btnW / Math.max(1, btnH);

    const minDropW = g.minDropletW;
    const minDropH = btnH * (0.52 + 0.10 * Math.tanh((widthRatio - 1.0) * 0.42));

    // =========================================================================
    // 1. 先計算 Blob B (展開選單主體) 的同軸曲線，讓開合位移與寬度變化 100% 同步
    // =========================================================================
    const emergeB = smoothstep(0.08, 0.18, prog);
    const expandRaw = clamp((prog - 0.18) / 0.82, 0.0, 1.0);

    // 縱向與橫向展開保持協調同軸比例，避免單邊過長形成倒 L 型
    const openCurveY = 1.0 - Math.pow(1.0 - expandRaw, 2.25);
    const openCurveX = 1.0 - Math.pow(1.0 - expandRaw, 1.85);

    const closeCurveY = smoothstep(0.0, 1.0, Math.pow(expandRaw, 1.30));
    const closeCurveX = smoothstep(0.0, 1.0, Math.pow(expandRaw, 1.40));

    const progY = lerp(closeCurveY, openCurveY, dirMix);
    const progX = lerp(closeCurveX, openCurveX, dirMix);

    const seedW = minDropW * 0.88;
    const seedH = minDropH * 0.88;

    const wB = lerp(seedW, g.menuW, progX) * emergeB;
    const hB = lerp(seedH, g.menuH, progY) * emergeB;

    const startBy = g.btnCy + btnH * 0.16;
    const topEdgeB = lerp(startBy - seedH * 0.5, g.menuTop, progY);
    const cyB = topEdgeB + hB * 0.5;

    // 關鍵修復：讓 cxB 與寬度曲線 progX 同步插值，收合縮小至水滴時剛好回到按鈕中心正下方
    const cxB = lerp(g.btnCx, g.menuCx, progX);

    const rB = lerp(Math.min(wB, hB) * 0.5, g.menuR, smoothstep(0.28, 0.90, prog));

    // 水滴下墜時的自然上窄下寬錐度，展開完成後平滑歸零
    const vTaperB = Math.sin(expandRaw * Math.PI) * (1.0 - smoothstep(0.65, 0.96, prog)) * 0.16;
    const hTaperB = 0.0;

    // =========================================================================
    // 2. Blob A (上方膠囊按鈕)：向中心對稱收縮成小水滴，並與 cxB 同軸銜接不外偏
    // =========================================================================
    const tShrinkX = easeOutCubic(clamp(prog / 0.21, 0.0, 1.0));
    const tShrinkY = smoothstep(0.0, 0.22, prog);
    // 在 p = 0.20 -> 0.35 期間完全收縮至 0，徹底消除展開後殘留的白色圓點
    const vanishScaleA = 1.0 - smoothstep(0.20, 0.35, prog);

    const wA = lerp(btnW, minDropW, tShrinkX) * vanishScaleA;
    const hA = lerp(btnH, minDropH, tShrinkY) * vanishScaleA;
    // 在 p <= 0.14 時維持在按鈕中心對稱收縮；進入融合區段時精準對齊 cxB，收合時不再從外側飛入
    const cxA = lerp(g.btnCx, cxB, smoothstep(0.14, 0.28, prog));
    const cyA = lerp(g.btnCy, topEdgeB + Math.min(14.0, hB * 0.28), smoothstep(0.08, 0.34, prog));
    const rA = Math.min(wA, hA) * 0.5;
    const vTaperA = -Math.sin(clamp(prog / 0.32, 0.0, 1.0) * Math.PI) * 0.14;
    const hTaperA = 0.0;

    // =========================================================================
    // 3. Blob M (中軸過渡液滴)：嚴格約束於 Blob A 與 Blob B 連通包絡線內
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
    // 4. 動態融球平滑半徑 k：在分離拉絲階段開啟，展開後完全歸零
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

  function createRenderer(s) {
    const canvas=doc.createElement('canvas');canvas.className='surface-morph-sdf';
    canvas.setAttribute('aria-hidden','true');s.overlay.appendChild(canvas);
    const dpr=Math.min(root.devicePixelRatio||1,2),v=s.viewport;
    const sizeCanvas=(node,vp,scale)=>{node.width=Math.ceil((vp.left+vp.width)*scale);node.height=Math.ceil((vp.top+vp.height)*scale);node.style.width=Math.ceil(vp.left+vp.width)+'px';node.style.height=Math.ceil(vp.top+vp.height)+'px';};
    sizeCanvas(canvas,v,dpr);
    const parseColor=(value,fallback)=>{
      const values=(value||'').match(/[\d.]+/g)?.map(Number);
      return values?.length>=3?[...values.slice(0,3),clamp(values[3]??1,0,1)]:fallback;
    };
    const readColor=(node,fallback)=>parseColor(root.getComputedStyle?.(node)?.backgroundColor,fallback);
    const triggerStyle=root.getComputedStyle?.(s.trigger);
    const borderStyle=triggerStyle?.borderTopStyle||triggerStyle?.borderStyle||'none';
    const borderWidth=['none','hidden'].includes(borderStyle)?0:Math.max(0,parseFloat(triggerStyle?.borderTopWidth||triggerStyle?.borderWidth)||0);
    const borderColor=parseColor(triggerStyle?.borderTopColor||triggerStyle?.borderColor||triggerStyle?.color,[0,0,0,0]);
    const target=readColor(s.menu,[255,255,255,1]);
    const morphWhite=[255,255,255,1];
    const finalStyle=root.getComputedStyle?.(s.menu);
    const finalBorder=Math.max(0,parseFloat(finalStyle?.borderTopWidth||finalStyle?.borderWidth)||0);
    s.menu.style.setProperty('--morph-material-border-width',`${finalBorder}px`);
    // Hand the almost-expanded liquid back to the actual CSS glass material.
    // Compensate layer opacity to avoid a transparency dip during the crossfade.
    const fadeCanvas=node=>{
      const mix=smoothstep(.72,1,s.p);
      node.style.opacity=String((1-mix)/Math.max(.001,1-target[3]*mix));
    };
    const origin=s.opts.transparentTrigger?readColor(s.trigger,[255,255,255,0]):morphWhite;
    // Interpolate premultiplied colors so transparent black does not become a
    // gray/white flash. A transparent opener gains the panel material gradually.
    const material=presence=>{
      if(!s.opts.transparentTrigger)return morphWhite;
      const alpha=lerp(origin[3],morphWhite[3],presence);
      return [...morphWhite.slice(0,3).map((channel,i)=>alpha?lerp(origin[i]*origin[3],channel*morphWhite[3],presence)/alpha:channel),alpha];
    };
    let gl=null,program=null,buffer=null,shaders=[];
    try {gl=canvas.getContext?.('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});}catch(_){}
    const vsSource = `
      attribute vec2 a_pos;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;
      uniform vec2 u_res;
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
        vec2 pos = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;
        float d = evalSceneSDF(pos);

        float dShadow = evalSceneSDF(pos - vec2(0.0, 8.0));
        float shadowAlpha = (1.0 - smoothstep(-2.0, 26.0, dShadow)) * (u_lightTheme > 0.5 ? 0.13 : 0.34) * u_shadowPresence * u_color.a;

        float aa = 0.85 / u_dpr;
        float shapeAlpha = 1.0 - smoothstep(-aa, aa, d);

        vec4 shadowCol = vec4(0.03, 0.05, 0.10, 1.0) * shadowAlpha;
        vec4 surfaceCol = vec4(u_color.rgb * u_color.a, u_color.a) * shapeAlpha;

        vec4 surfaceAndShadow = surfaceCol + shadowCol * (1.0 - shapeAlpha);
        float innerAlpha = 1.0 - smoothstep(-aa, aa, d + u_borderWidth);
        float borderAlpha = max(0.0, shapeAlpha - innerAlpha) * u_borderColor.a * u_borderPresence;
        vec4 borderCol = vec4(u_borderColor.rgb * borderAlpha, borderAlpha);
        gl_FragColor = borderCol + surfaceAndShadow * (1.0 - borderAlpha);
      }
    `;

    if(gl) {
      try {
        const compile=(type,source)=>{const sh=gl.createShader(type);shaders.push(sh);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error('SDF shader');return sh;};
        program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vsSource));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fsSource));gl.linkProgram(program);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('SDF program');
        gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
        const pos=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
        const names=['u_res','u_dpr','u_active','u_lightTheme','u_shadowPresence','u_color','u_borderColor','u_borderWidth','u_borderPresence','u_blobA','u_blobAExtra','u_blobM','u_blobMExtra','u_blobB','u_blobBExtra','u_kAM','u_kMB'];
        const u=Object.fromEntries(names.map(n=>[n,gl.getUniformLocation(program,n)]));
        // Only shade the union's travel envelope on large desktop viewports.
        const updateViewport=(vp)=>{sizeCanvas(canvas,vp,dpr);const o=s.origin,b=s.bounds,pad=48,left=Math.max(0,Math.floor((Math.min(o.left,b.left)-pad)*dpr)),top=Math.max(0,Math.floor((Math.min(o.top,b.top)-pad)*dpr)),right=Math.min(canvas.width,Math.ceil((Math.max(o.right,b.left+b.width)+pad)*dpr)),bottom=Math.min(canvas.height,Math.ceil((Math.max(o.bottom,b.top+b.height)+pad)*dpr));gl.enable(gl.SCISSOR_TEST);gl.scissor(left,canvas.height-bottom,Math.max(0,right-left),Math.max(0,bottom-top));gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);gl.uniform2f(u.u_res,canvas.width,canvas.height);};
        updateViewport(v);gl.uniform1f(u.u_dpr,dpr);
        gl.uniform1f(u.u_active,1);gl.uniform1f(u.u_lightTheme,morphWhite[0]+morphWhite[1]+morphWhite[2]>400?1:0);
        gl.uniform1f(u.u_borderWidth,borderWidth);gl.uniform4f(u.u_borderColor,...borderColor.slice(0,3).map(c=>c/255),borderColor[3]);
        return {resize:updateViewport,draw(prims,shadowPresence,borderPresence){

          fadeCanvas(canvas);gl.useProgram(program);gl.uniform1f(u.u_shadowPresence,shadowPresence);gl.uniform1f(u.u_borderPresence,borderPresence);
          const fill=material(shadowPresence);gl.uniform4f(u.u_color,...fill.slice(0,3).map(c=>c/255),fill[3]);
          for(const name of ['A','M','B']) {const b=prims['blob'+name];gl.uniform4f(u['u_blob'+name],b.x,b.y,b.w,b.h);
            if(name==='M')gl.uniform2f(u.u_blobMExtra,b.r,b.vTaper);else gl.uniform3f(u['u_blob'+name+'Extra'],b.r,b.vTaper,b.hTaper);}
          gl.uniform1f(u.u_kAM,prims.kAM);gl.uniform1f(u.u_kMB,prims.kMB);
          gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,6);
        },dispose(){gl.deleteBuffer(buffer);gl.deleteProgram(program);shaders.forEach(sh=>gl.deleteShader(sh));gl.getExtension('WEBGL_lose_context')?.loseContext();}};
      } catch(_) {if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);shaders.forEach(sh=>gl.deleteShader(sh));canvas.remove?.();}
    }
    // Software fallback evaluates the same tapered-box SDF and quadratic smooth union.
    // A replacement canvas is needed after a WebGL context has been allocated.
    const fallback=gl?doc.createElement('canvas'):canvas;
    if(gl){fallback.className='surface-morph-sdf';fallback.setAttribute('aria-hidden','true');s.overlay.appendChild(fallback);}
    sizeCanvas(fallback,v,1);
    const ctx=fallback.getContext?.('2d');
    function distance(b,x,y) {
      if(b.w<=.5||b.h<=.5)return 1000;
      const dx=x-b.x,dy=y-b.y;
      const hw=Math.max(2,b.w*.5*(1+b.vTaper*clamp(dy/Math.max(b.h*.5,1),-1,1)));
      const hh=Math.max(2,b.h*.5*(1+(b.hTaper||0)*clamp(dx/Math.max(b.w*.5,1),-1,1)));
      const r=Math.min(b.r,hw,hh),qx=Math.abs(dx)-hw+r,qy=Math.abs(dy)-hh+r;
      return Math.min(Math.max(qx,qy),0)+Math.hypot(Math.max(qx,0),Math.max(qy,0))-r;
    }
    const union=(a,b,k)=>{if(k<=.001)return Math.min(a,b);const h=clamp(.5+.5*(b-a)/k,0,1);return lerp(b,a,h)-k*h*(1-h);};
    return {resize(vp){sizeCanvas(fallback,vp,1);},draw(prims,shadowPresence,borderPresence){
      fadeCanvas(fallback);if(!ctx)return;
      const blobs=[prims.blobA,prims.blobM,prims.blobB].filter(b=>b.w>.5&&b.h>.5);
      const pad=32+Math.max(prims.kAM,prims.kMB);
      const left=Math.max(0,Math.floor(Math.min(...blobs.map(b=>b.x-b.w*.6))-pad));
      const top=Math.max(0,Math.floor(Math.min(...blobs.map(b=>b.y-b.h*.6))-pad));
      const right=Math.min(fallback.width,Math.ceil(Math.max(...blobs.map(b=>b.x+b.w*.6))+pad));
      const bottom=Math.min(fallback.height,Math.ceil(Math.max(...blobs.map(b=>b.y+b.h*.6))+pad+8));
      ctx.clearRect(0,0,fallback.width,fallback.height);if(right<=left||bottom<=top)return;
      const img=ctx.createImageData(right-left,bottom-top),data=img.data,fill=material(shadowPresence);
      const sdf=(x,y)=>union(union(distance(prims.blobA,x,y),distance(prims.blobM,x,y),prims.kAM),distance(prims.blobB,x,y),prims.kMB);
      for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){
        const d=sdf(left+x+.5,top+y+.5);
        const coverage=1-smoothstep(-.85,.85,d),a=coverage*fill[3];
        const inner=1-smoothstep(-.85,.85,d+borderWidth);
        const edge=Math.max(0,coverage-inner)*borderColor[3]*borderPresence;
        const shadow=(1-smoothstep(-2,26,sdf(left+x+.5,top+y-7.5)))*(morphWhite[0]+morphWhite[1]+morphWhite[2]>400?.13:.34)*shadowPresence*fill[3];
        const alpha=edge+(a+shadow*(1-coverage))*(1-edge),i=(y*img.width+x)*4;
        for(let c=0;c<3;c++)data[i+c]=alpha?(borderColor[c]*edge+(fill[c]*a+[7.65,12.75,25.5][c]*shadow*(1-coverage))*(1-edge))/alpha:0;
        data[i+3]=alpha*255;
      }
      ctx.putImageData(img,left,top);
    },dispose(){fallback.remove?.();}};
  }

  function frame(s) {
    const p=s.p,g=s.geometry,bounds=s.bounds,prims=computeMorphPrimitives(p,g,s.dirMix),b=prims.blobB;
    s.primitives=prims;
    const menu=s.menu,icon=s.icon;
    menu.style.width=bounds.width+'px';menu.style.height=bounds.height+'px';menu.style.left='0px';menu.style.top='0px';
    menu.style.borderRadius=s.radius+'px';
    const sx=b.w/bounds.width,sy=b.h/bounds.height;
    menu.style.transform=`translate3d(${b.x-b.w*.5}px, ${b.y-b.h*.5}px, 0) scale(${sx}, ${sy})`;
    s.content.style.borderRadius=`${b.r/Math.max(.01,sx)}px / ${b.r/Math.max(.01,sy)}px`;
    menu.style.opacity=String(smoothstep(.24,.54,p));
    menu.style.setProperty('--morph-surface-presence',String(p));
    menu.style.setProperty('--morph-terminal-material',String(smoothstep(.72,1,p)));menu.classList.toggle('is-terminal-blur',p>=.72);
    const phase=clamp(p/.21,0,1),scale=lerp(1,.44,easeOutCubic(phase));
    icon.style.transform=`translate3d(${(prims.blobA.x-g.btnCx)*.85}px, ${(prims.blobA.y-g.btnCy)*.92}px, 0) scale(${scale})`;
    icon.style.opacity=String(1-smoothstep(.02,.20,p));icon.style.filter=`blur(${9.5*Math.pow(phase,.85)}px)`;
    for(const {node,position} of s.slots) {
      const offset=(position-.5)*g.btnW;
      const local=clamp(p/Math.max(.09,.21-Math.abs(offset)/Math.max(1,g.btnW)*.07),0,1);
      node.style.transform=`translate3d(${-offset*easeOutCubic(local)*.55}px, 0, 0)`;
    }
    const maxStagger=s.rows.length>7?.27:0;for(const [idx,row] of s.rows.entries()) {
      const isTopSearch=row.classList?.contains('template-tag-search');
      const stagger=maxStagger?(idx/(s.rows.length-1))*maxStagger:idx*.045,start=isTopSearch?.48:.28+stagger,span=isTopSearch?.42:Math.max(.01,.56-stagger*.4),progress=clamp((p-start)/span,0,1),ease=easeOutCubic(progress);
      row.style.opacity=String(smoothstep(0,.68,progress));row.style.filter=(1-ease)*11>.15?`blur(${(1-ease)*11}px)`:'none';
      row.style.transform=`translate3d(0, ${(1-ease)*-8}px, 0)`;
    }
    // Fade only the shadow with the same reversible progress as the liquid.
    // No CSS shadow handoff or phase reset when opening reverses into closing.
    // Reproduce the trigger's physical border only near departure/return.
    // The shared progress makes this fade continuous even on a reversal.
    s.renderer?.draw(prims,smoothstep(0,1,p),1-smoothstep(0,.32,p));
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
      if(reduced()){s.p=target;s.velocity=0;}else {
        const stiffness=target?195:235,damping=target?24.5:27.5;
        for(let i=0;i<4;i++){s.velocity+=(-stiffness*(s.p-target)-damping*s.velocity)*(dt/4);s.p+=s.velocity*(dt/4);}
        if(Math.abs(s.p-target)<.0006&&Math.abs(s.velocity)<.004){s.p=target;s.velocity=0;}
        s.p=clamp(s.p,0,1);
      }
      frame(s);
      if(current!==s||s.disposed||s.runId!==runId)return;
      if(s.p===target&&s.velocity===0){if(target)settle(s);else finish(s,s.closeReason,s.closeReason!=='focus_out');}
      else s.raf=raf(tick);
    };
    if(reduced())tick(last);else s.raf=raf(tick);
  }
  function focusItems(s) {
    return Array.from(s.menu.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')).filter(el=>!el.disabled&&el.getAttribute?.('aria-disabled')!=='true'&&!el.hidden);
  }
  function activate(s) {
    if(s.interactive)return;
    s.interactive=true;s.menu.inert=false;s.menu.classList.add('is-content-visible');
    const items=focusItems(s); if(s.opts.keyboard!=='content') items.forEach((el,index)=>{el.tabIndex=index? -1:0;});
    const first=(s.opts.autoFocus===false||items[0]?.matches?.('input,textarea,select'))?s.menu:(items[0]||s.menu);
    first.focus?.({preventScroll:true});
  }
  function settle(s) {
    s.phase='open';activate(s);s.menu.classList.add('is-settled');s.menu.style.willChange='auto';s.content.style.borderRadius='';
    if(s.opts.keepTrigger) s.trigger.classList.remove('is-hidden-for-morph','surface-morph-trigger-hidden');
    s.opts.onOpened?.(s.menu);
  }
  function finish(s,reason,restore=true) {
    if(!s||s.disposed) return;
    if(gesture?.session===s)endGesture();
    root.IconMotion?.cleanup?.(s.menu);
    s.disposed=true;s.renderer?.dispose(); for(const row of s.rows||[]) {const original=s.rowStyles.get(row);for(const key of ['opacity','filter','transform'])row.style[key]=original[key];} if(s.raf) cancel(s.raf);s.lease?.release(); s.motion?.removeEventListener?.('change',s.onMotion);s.stopResize?.();
    s.trigger.classList?.remove('is-hidden-for-morph','surface-morph-trigger-hidden');s.trigger.setAttribute?.('aria-expanded','false');
    s.menu.style.willChange='auto';s.content.style.willChange='auto';s.icon.style.willChange='auto';s.overlay.remove?.();
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
    // Focus/scroll notifications emitted by inert changes must not cut off a return flight.
    // A real resize invalidates the cached geometry and must still clean up immediately.
    if(s.phase==='closing'&&['scroll','focus_out','tab'].includes(reason)) return;
    if(immediateReasons.has(reason)||reduced()) {finish(s,reason||'close',!['navigation','unmount','destroy','modal','focus_out','trigger_removed'].includes(reason));return;}
    if(s.phase==='closing') return;
    if(gesture?.session===s)endGesture();
    s.trigger.classList.add('is-hidden-for-morph','surface-morph-trigger-hidden');
    s.phase='closing';s.closeReason=reason||'close';
    s.trigger.setAttribute?.('aria-expanded','false');s.menu.inert=true;s.interactive=false;s.menu.classList.remove('is-settled','is-content-visible');
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
    // Alignment is supplied by the caller or trigger markup, independent of menu type.
    // start/center/end align the corresponding trigger and menu edges before clamping.
    const alignment={start:0,center:.5,end:1}[opts.align??trigger.dataset?.morphAlign]??.5;
    const computeBounds=(orig,vp)=>{const left=orig.left+(orig.width-width)*alignment;let top=orig.bottom+10;if(top+height>vp.top+vp.height-14)top=orig.top-height-10;return {left:clamp(left,vp.left+14,Math.max(vp.left+14,vp.left+vp.width-width-14)),top:clamp(top,vp.top+14,Math.max(vp.top+14,vp.top+vp.height-height-14)),width,height};};
    // Flip above only when the viewport cannot accommodate the downward expansion.


    const bounds=computeBounds(origin,v);
    let resolve;const closed=new Promise(done=>{resolve=done;});
    const radius=Number.isFinite(Number(opts.radius))?Math.max(0,Number(opts.radius)):24;
    const s={trigger,opts,origin,bounds,viewport:v,radius,overlay,menu,content,icon,resolve,callbacks:[],phase:'opening',disposed:false,raf:null,interactive:false};
    s.handle={closed,close:reason=>{if(current===s)close(reason);},get phase(){return s.phase;},menu};current=s;
    s.p=0;s.velocity=0;s.dirMix=1;s.geometry=geometry(s);
    s.rows=Array.from(content.querySelectorAll('.morph-item, .template-tag-search, .up-btn, .up-header, .up-settings-head'));
    s.slots=Array.from(opts.triggerIconHTML?[]:icon.children||[]).map((node,i)=>{
      const rect=trigger.children?.[i]?.getBoundingClientRect?.();
      return {node,position:rect?(rect.left+rect.width/2-origin.left)/origin.width:.5};
    });
    s.rowStyles=new Map(s.rows.map(row=>[row,Object.fromEntries(['opacity','filter','transform'].map(key=>[key,row.style[key]||'']))]));
    Object.assign(icon.style,{position:'fixed',left:origin.left+'px',top:origin.top+'px',width:origin.width+'px',height:origin.height+'px'});
    menu.inert=true;doc.body.appendChild(overlay);s.renderer=createRenderer(s);
    menu.classList.add('surface-morph-liquid');frame(s);
    trigger.setAttribute?.('data-morph-trigger','');
    trigger.classList?.add('is-hidden-for-morph','surface-morph-trigger-hidden');trigger.setAttribute?.('aria-expanded','true');trigger.setAttribute?.('aria-controls',menu.id);trigger.setAttribute?.('aria-haspopup',opts.role==='dialog'?'dialog':'menu');
    content.style.width='100%';content.style.maxHeight='100%';content.style.overflowY='auto';menu.style.willChange='transform,opacity';
    s.lease=root.OverlayManager.acquirePopover({panel:menu,trigger,signal:opts.signal,watchTriggerResize:opts.watchTriggerResize??opts.role==='dialog',onDismiss:reason=>{if(current===s)close(reason);}});
    const onViewportResize=()=>{if(current!==s||s.disposed)return;const vp=viewport();s.viewport=vp;s.origin=readRect(s.trigger);s.bounds=computeBounds(s.origin,vp);s.geometry=geometry(s);Object.assign(s.icon.style,{left:s.origin.left+'px',top:s.origin.top+'px',width:s.origin.width+'px',height:s.origin.height+'px'});s.renderer?.resize?.(vp);frame(s);};
    root.addEventListener?.('resize',onViewportResize,{passive:true});root.visualViewport?.addEventListener?.('resize',onViewportResize,{passive:true});
    s.stopResize=()=>{root.removeEventListener?.('resize',onViewportResize);root.visualViewport?.removeEventListener?.('resize',onViewportResize);};
    s.motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');s.onMotion=()=>{if(!s.motion.matches||current!==s)return;if(s.phase==='closing')finish(s,s.closeReason);else {if(s.raf)cancel(s.raf);s.p=1;s.velocity=0;frame(s);settle(s);}};s.motion?.addEventListener?.('change',s.onMotion);
    overlay.addEventListener('pointerdown',event=>{if(!menu.contains?.(event.target)){consume(event);blockRelease(event);close('outside_click');}});
    overlay.addEventListener('click',event=>{if(s.phase==='closing'||!menu.contains?.(event.target)){consume(event);close('outside_click');}});
    menu.addEventListener('keydown',event=>{
      const items=focusItems(s),index=items.indexOf(doc.activeElement);
      if(opts.keyboard!=='content'&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&items.length){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((el,i)=>{el.tabIndex=i===next?0:-1;});items[next].focus?.();}
      else if(event.key==='Tab'&&(opts.keyboard!=='content'||(event.shiftKey?index<=0:index===items.length-1)))close('tab');
    });
    run(s);
    return s.handle;
  }
  const api={open,close,isOpen:()=>!!current&&current.phase!=='closing',getState:()=>current?{phase:current.phase,trigger:current.trigger,role:current.opts.role||'menu'}:null,destroy:()=>{cancelGesture(false);close('destroy');}};
  root.SurfaceMorph=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
