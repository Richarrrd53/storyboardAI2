import gsap from "https://cdn.skypack.dev/gsap";
import ScrollTrigger from "https://cdn.skypack.dev/gsap/ScrollTrigger";
import ScrollToPlugin from "https://cdn.skypack.dev/gsap/ScrollToPlugin";

// 頂層只註冊一次 Plugin
gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

window.initLandingPage = () => {
    // 1. 每次進入 Landing，重新抓取當前最新的 DOM 節點
    const featureContainer = document.getElementById("feature-container");
    const dragHint = document.getElementById("drag-hint");
    const feature3d = document.getElementById("feature-3d");
    const featureCards = featureContainer ? featureContainer.children : [];
    const totalCards = featureCards.length;

    // 2. 重設這頁動畫需要的狀態變數
    let radius, currentAngle, xDeg, opacity, blur;
    let userDragAngle = 0;
    let isDragabled = false;
    let userDraging = false;
    let lastX = 0;

    const vh = (v) => (window.innerHeight < window.innerWidth) ? window.innerHeight * (v / 100): window.innerWidth * 1.5 * (v / 100);

    // 3. 錨點平滑滾動
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                const targetPos = target.getBoundingClientRect().top + window.pageYOffset;
                const startPos = window.pageYOffset;
                const distance = Math.abs(targetPos - startPos);
                const speed = 1080; 
                let dynamicDuration = distance / speed;
                dynamicDuration = Math.max(0.5, Math.min(dynamicDuration, 3));
                gsap.to(window, {
                    duration: dynamicDuration,
                    scrollTo: { y: target, autoKill: true, offsetY: 0 },
                    ease: "expo.out"
                });
            }
        });
    });

    // 4. 各個 Section 的 GSAP 動態綁定
    gsap.fromTo(".hero-inner", { scale: '1' }, {
        scale: '1.2',
        scrollTrigger: {
            trigger: "#heroSection",
            start: "top",
            end: "bottom",
            scrub: true,
        }
    });

    gsap.fromTo(".hero-inner", { opacity: 1, filter: "blur(0px)", x: '0%' }, {
        opacity: 0,
        filter: "blur(20px)",
        x: '-100%',
        scrollTrigger: {
            trigger: "#end-1",
            start: "bottom",
            end: "bottom",
            scrub: true,
        }
    });

    const maskConfigs = [
        { trigger: "#end-1", endTrigger: "#end-1-2" },
        { trigger: "#end-2", endTrigger: "#end-2-2" },
        { trigger: "#end-3-2", endTrigger: "#end-3-3" },
        { trigger: "#end-4", endTrigger: "#end-4-2" },
        { trigger: "#end-5", endTrigger: "#end-5-2" },
    ];

    maskConfigs.forEach(config => {
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: config.trigger,
                start: "top",
                endTrigger: config.endTrigger,
                end: "bottom",
                scrub: true,
            }
        });
        tl.to("#black-mask-top", { top: "0" }, 0)
          .to("#black-mask-bottom", { bottom: "0" }, 0)
          .to("#black-mask-top", { top: "-50%" }, ">")
          .to("#black-mask-bottom", { bottom: "-50%" }, "<");
    });

    const videoTl = gsap.timeline({
        scrollTrigger: {
            trigger: "#end-2",
            start: "bottom",
            endTrigger: "#end-2",
            end: "bottom",
            scrub: true,
        }
    });

    videoTl
        .to("#videos", { display: 'flex' }, 0)
        .to("#videos", { display: 'none'}, ">");

    gsap.fromTo("#videos", { x: "100vw" }, {
        x: "0",
        scrollTrigger: {
            trigger: "#end-1-2",
            start: "top",
            end: "top",
            scrub: true,
        }
    });

    // 5. 3D 卡片輪播滾動更新
    if (feature3d) {
        gsap.to({}, {
            scrollTrigger: {
                trigger: "#start-3",
                start: "top",
                end: "bottom",
                scrub: true,
                onUpdate: (self) => {
                    const progress = self.progress;
                    if (progress < 0.225) {
                        const p = progress / 0.225;
                        opacity = p; blur = 60 - (p * 60); radius = vh(200) - p * vh(100); currentAngle = 270 - p * 90; xDeg = -90 + p * 45;
                    } else if (progress < 0.525) {
                        const p = (progress - 0.225) / 0.3;
                        opacity = 1; blur = 0; radius = vh(100) - p * vh(35); currentAngle = 180 - p * 180; xDeg = -45 + p * 45;
                    } else if (progress < 0.75) {
                        const p = (progress - 0.525) / 0.225;
                        radius = vh(65) + p * vh(15); currentAngle = 0 - p * 150; xDeg = 0; opacity = 1; blur = 0;
                    } else {
                        const p = (progress - 0.75) / 0.25;
                        radius = vh(80); currentAngle = -150 - (p * 180); xDeg = 0;
                    }
                    if (progress >= 0.75){
                        isDragabled = true; feature3d.style.cursor = "grab";
                        if (dragHint) dragHint.classList.add("active");
                        feature3d.classList.add("is-dragabled");
                    } else {
                        isDragabled = false; feature3d.style.cursor = "";
                        if (dragHint) dragHint.classList.remove("active");
                        feature3d.classList.remove("is-dragabled");
                    }
                    
                    for (let i = 0; i < totalCards; i++) {
                        const card = featureCards[i]; if (!card) continue;
                        const angle = (-360 / totalCards) * i + currentAngle + userDragAngle + 90;
                        const radian = angle * Math.PI / 180;
                        const x = radius * Math.cos(radian);
                        const yMultiplier = progress < 0.75 ? (1 - progress / 0.75) : 0;
                        const y = (radius * yMultiplier) * Math.sin(radian);
                        const z = vh(-75) + radius * Math.sin(radian);
                        card.style.opacity = opacity;
                        card.style.filter = `blur(${blur}px)`;
                        card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateX(${xDeg}deg) rotateY(${-angle + 90}deg)`;
                    }
                }
            }
        });
    }

    gsap.fromTo("#features", { display: 'none' }, {
        display: 'block',
        scrollTrigger: { trigger: "#end-2-2", start: "top", end: "top", scrub: true }
    });

    gsap.fromTo("#feature-title",{ y: "45vh", filter: "blur(40px)", opacity: 0 },{
        y: "20vh", filter: "blur(0px)", opacity: 1,
        scrollTrigger: { trigger: "#start-3-2", start: "top", end: "bottom", scrub: true }
    });

    gsap.fromTo("#feature-3d",{ y: "0vh" },{
        y: "10vh",
        scrollTrigger: { trigger: "#start-3-2", start: "top", end: "bottom", scrub: true }
    });

    const featureTl = gsap.timeline({
        scrollTrigger: { trigger: "#end-3-2", start: "bottom", endTrigger: "#end-3-2", end: "bottom", scrub: true }
    });
    featureTl.to("#features", { display: 'flex'}, 0).to("#features", { display: 'none'}, ">");

    gsap.fromTo("#how", { display: 'none' }, {
        display: 'flex',
        scrollTrigger: { trigger: "#end-3-3", start: "top", end: "top", scrub: true }
    });

    const howTl = gsap.timeline({
        scrollTrigger: { trigger: "#end-4", start: "bottom", endTrigger: "#end-4", end: "bottom", scrub: true }
    });
    howTl.to("#how", { display: 'flex'}, 0).to("#how", { display: 'none'}, ">");
        
    gsap.fromTo("#pricing", { display: 'none' }, {
        display: 'flex',
        scrollTrigger: { trigger: "#end-4-2", start: "top", end: "top", scrub: true }
    });

    const pricingTl = gsap.timeline({
        scrollTrigger: { trigger: "#end-5", start: "bottom", endTrigger: "#end-5", end: "bottom", scrub: true }
    });
    pricingTl.to("#pricing", { display: 'flex'}, 0).to("#pricing", { display: 'none'}, ">");

    gsap.fromTo("#cta", { display: 'none' }, {
        display: 'flex',
        scrollTrigger: { trigger: "#end-5-2", start: "top", end: "top", scrub: true }
    });

    // 6. 拖拽核心邏輯
    const handleStart = (clientX) => {
        if (!isDragabled) return;
        userDraging = true;
        lastX = clientX;
        if (feature3d) feature3d.classList.add("is-dragging");
    };

    const handleMove = (clientX) => {
        if (!userDraging) return;
        const deltaX = clientX - lastX;
        userDragAngle -= deltaX * 0.5;
        lastX = clientX;
        if (isDragabled && dragHint) dragHint.classList.remove("active");
        
        for (let i = 0; i < totalCards; i++) {
            const card = featureCards[i]; if (!card) continue;
            const angle = (-360 / totalCards) * i + currentAngle + userDragAngle + 90;
            const radian = angle * Math.PI / 180;
            const x = radius * Math.cos(radian);
            const y = 0;
            const z = vh(-75) + radius * Math.sin(radian);
            card.style.opacity = opacity;
            card.style.filter = `blur(${blur}px)`;
            card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateX(${xDeg}deg) rotateY(${-angle + 90}deg)`;
        }
    };

    const handleEnd = () => {
        userDraging = false;
        if (feature3d) feature3d.classList.remove("is-dragging");
        if (isDragabled && dragHint) dragHint.classList.add("active");
    };

    // ── 💡 建立具名處理器，以便後續 removeEventListener 清理 ──
    const onMouseMove = (e) => handleMove(e.clientX);
    const onMouseUp = handleEnd;
    const onTouchMove = (e) => {
        if (!userDraging) return;
        if (e.cancelable) e.preventDefault(); 
        handleMove(e.touches[0].clientX);
    };
    const onTouchEnd = handleEnd;

    if (feature3d) {
        feature3d.addEventListener("mousedown", (e) => handleStart(e.clientX));
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        feature3d.addEventListener("touchstart", (e) => handleStart(e.touches[0].clientX), { passive: true });
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("touchend", onTouchEnd);
    }

    setTimeout(() => ScrollTrigger.refresh(), 100);

    // 7. ── 💡 頁面銷毀清理機制（擴充：連同 window 上的事件一起拔除） ──
    const oldKill = window._landingKill;
    window._landingKill = () => {
        if (typeof oldKill === 'function') oldKill();
        
        // 清理 GSAP 與 ScrollTrigger
        ScrollTrigger.getAll().forEach(st => st.kill());
        gsap.killTweensOf("*");
        
        // 拔除全域監聽器，防止全域記憶體洩漏與跨頁面錯誤觸發
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
    };
};