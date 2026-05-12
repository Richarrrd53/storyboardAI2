import gsap from "https://cdn.skypack.dev/gsap";
import ScrollTrigger from "https://cdn.skypack.dev/gsap/ScrollTrigger";
import ScrollToPlugin from "https://cdn.skypack.dev/gsap/ScrollToPlugin";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

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
                scrollTo: {
                    y: target,
                    autoKill: true,
                    offsetY: 0
                },
                ease: "expo.out"
            });
        }
    });
});

document.addEventListener("DOMContentLoaded", function() {
    gsap.fromTo(".hero-inner", {
        scale: '1',
    }, {
        scale: '1.2',
        scrollTrigger: {
            trigger: "#heroSection",
            start: "top",
            end: "bottom",
            scrub: true,
        }
    });

    gsap.fromTo(".hero-inner", {
        opacity: 1,
        filter: "blur(0px)",
        x: '0%',
    }, {
        opacity: 0,
        filter: "blur(20px)",
        x: '-100%',
        scrollTrigger: {
            trigger: "#end-1",
            start: "top",
            end: "bottom",
            scrub: true,
        }
    });

    const maskConfigs = [
        { trigger: "#end-1", endTrigger: "#end-1-2" },
        { trigger: "#end-2", endTrigger: "#end-2-2" }
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
            trigger: "#vv",
            start: "top",
            endTrigger: "#end-2",
            end: "bottom",
            scrub: true,
        }
    });

    videoTl
        .to("#videos", { x: "0%" }, 0)
        .to("#videos", { x: "-100%"}, ">");

    gsap.fromTo("#videos", {
        x: "100%",
    }, {
        x: "0%",
        scrollTrigger: {
            trigger: "#end-1-2",
            start: "top",
            end: "bottom",
            scrub: true,
        }
    });
});

document.addEventListener('scroll', function() {
    const featureContainer = document.getElementById("feature-container");
    const featureCards = featureContainer.children;
    const totalCards = featureCards.length;
    if(window.pageYOffset < 1620){
        for (let i = 0; i < totalCards; i++) {
            const card = featureCards[i];
            card.style.opacity = 0;
            card.style.filter = `blur(60px)`;
            card.style.position = "absolute";
            card.style.transform = `translate3d(0, 0, -800px) rotateY(0deg)`;
        }
    }
    if(window.pageYOffset > 2200){
        for (let i = 0; i < totalCards; i++) {
            const card = featureCards[i];
            card.style.opacity = 1;
            card.style.filter = `blur(00px)`;
        }
    }
    if (window.pageYOffset >= 1620 && window.pageYOffset <= 3240) {
        gsap.fromTo("#features", {
            top: "1080px",
        }, {
            top: "0px",
            scrollTrigger: {
                trigger: "body",
                start: "+1620px",
                end: "+=1080px",
                scrub: true,
            }
        });
        
        let radius = 2700 - (window.pageYOffset - 2160) / (3240 - 2160) * (2700 - 700);
        let currentAngle = 270 - (window.pageYOffset - 2160) / (3240 - 2160) * (270 - 0);


        for (let i = 0; i < totalCards; i++) {
            const card = featureCards[i];
            const angle = (-360 / totalCards) * i + currentAngle + 90;
            card.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
            const radian = angle * Math.PI / 180;
            if (window.pageYOffset >= 1620 && window.pageYOffset < 3240) {
                const opacity = (window.pageYOffset - 1620) / (2160 - 1620);
                const blur = 60 -(window.pageYOffset - 1620) / (2160 - 1620) * 60;
                card.style.opacity = opacity;
                card.style.filter = `blur(${blur}px)`;
                const x = radius * Math.cos(radian);
                const y = (radius - (window.pageYOffset - 2160) / (3240 - 2160) * (radius - 0)) * Math.sin(radian);
                const z = -800 + radius * Math.sin(radian);
                const xDeg = -90 - (window.pageYOffset - 2160) / (3240 - 2160) * (-90 - 0);
                card.style.position = "absolute";
                card.style.transform = `translate3d(${x}px, ${y}px, ${z}px) rotateX(${xDeg}deg) rotateY(${-angle + 90}deg)`;

            }
            else{
                card.style.opacity = 1;
                card.style.filter = `blur(0px)`;
                const x = radius * Math.cos(radian);
                const z = -800 + radius * Math.sin(radian);
                card.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${-angle + 90}deg)`;
            }
        }
    }
    if(window.pageYOffset > 3240 && window.pageYOffset <= 3780){
        gsap.fromTo("#feature-container", {
            transform: "translateY(-200px)",
        }, {
            transform: "translateY(0px)",
            scrollTrigger: {
                trigger: "body",
                start: "+3240px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#feature-title", {
            transform: "translateY(300px)",
            opacity: 0,
            filter: "blur(40px)",
        }, {
            transform: "translateY(150px)",
            opacity: 1,
            filter: "blur(0px)",
            scrollTrigger: {
                trigger: "body",
                start: "+3240px",
                end: "+=500px",
                scrub: true,
            }
        });
    }
    if(window.pageYOffset > 3780 && window.pageYOffset <= 4860){
        let radius = 700 - (window.pageYOffset - 3780) / (4860 - 3780) * (700 - 1000);
        let currentAngle = 0 - (window.pageYOffset - 3780) / (4860 - 3780) * (-150 - 0);
        for (let i = 0; i < totalCards; i++) {
            const card = featureCards[i];
            const angle = (-360 / totalCards) * i + currentAngle + 90;
            const radian = angle * Math.PI / 180;
            const x = radius * Math.cos(radian);
            const z = -800 + radius * Math.sin(radian);
            card.style.position = "absolute";
            card.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${-angle + 90}deg)`;
        }
    }
    if(window.pageYOffset > 4860 && window.pageYOffset <= 5940){
        let radius = 1000 - (window.pageYOffset - 4860) / (5400 - 4860) * (1000 - 1150);
        let currentAngle = -150 - (window.pageYOffset - 4860) / (5400 - 4860) * (-225 - 0);
        for (let i = 0; i < totalCards; i++) {
            const card = featureCards[i];
            const angle = (-360 / totalCards) * i + currentAngle + 90;
            const radian = angle * Math.PI / 180;
            const x = radius * Math.cos(radian);
            const z = -800 + radius * Math.sin(radian);
            card.style.position = "absolute";
            card.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${-angle + 90}deg)`;
        }
        gsap.fromTo("#features", {
            top : "0px",
            opacity: 1,
            filter: "blur(0px)",
        }, {
            top: "-1080px",
            opacity: 0,
            filter: "blur(40px)",
            scrollTrigger: {
                trigger: "body",
                start: "+4860px",
                end: "+=540px",
                scrub: true,
            }
        });
        gsap.fromTo("#how", {
            top: "1080px",
            opacity: 0,
            filter: "blur(40px)",
        }, {
            top: "0px",
            opacity: 1,
            filter: "blur(0px)",
            scrollTrigger: {
                trigger: "body",
                start: "+5400px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#how-title1", {
            transform: "translateX(-100%)",
        }, {
            transform: "translateX(0)",
            scrollTrigger: {
                trigger: "body",
                start: "+5400px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#how-title2", {
            transform: "translateX(100%)",
        }, {
            transform: "translateX(0)",
            scrollTrigger: {
                trigger: "body",
                start: "+5400px",
                end: "+=500px",
                scrub: true,
            }
        });
    }
    if(window.pageYOffset > 5940 && window.pageYOffset <= 6480){
        gsap.fromTo("#how", {
            top: "0px",
            opacity: 1,
            filter: "blur(0px)",
        }, {
            top: "-1080px",
            opacity: 0,
            filter: "blur(40px)",
            scrollTrigger: {
                trigger: "body",
                start: "+5940px",
                end: "+=500px",
                scrub: true,            
            }
        });
        gsap.fromTo("#how-title1", {
            transform: "translateX(0)",
        }, {
            transform: "translateX(100%)",
            scrollTrigger: {
                trigger: "body",
                start: "+5940px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#how-title2", {
            transform: "translateX(0)",
        }, {
            transform: "translateX(-100%)",
            scrollTrigger: {
                trigger: "body",
                start: "+5940px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#bgDot1", {
            backgroundColor: "#fcbed4",
            width: "500px",
            height: "500px",
            left: 300 + "px",
            top: 150 + "px",
        }, {
            backgroundColor: "#f55b8d",
            width: "600px",
            height: "600px",
            left: 1200 + "px",
            top: -150 + "px",
            scrollTrigger: {
                trigger: "body",
                start: "+5940px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#bgDot2", {
            backgroundColor: "#fb9fe2",
            width: "500px",
            height: "500px",
            left: 500 + "px",
            top: -250 + "px",
        }, {
            backgroundColor: "#f55b8d",
            width: "400px",
            height: "400px",
            left: 1000 + "px",
            top: 250 + "px",
            scrollTrigger: {
                trigger: "body",
                start: "+5940px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#bgDot3", {
            backgroundColor: "#b8f7d2",
            width: "500px",
            height: "500px",
            left: 100 + "px",
            top: 500 + "px",
        }, {
            backgroundColor: "#f55b8d",
            width: "500px",
            height: "500px",
            left: 1670 + "px",
            top: 250 + "px",
            scrollTrigger: {
                trigger: "body",
                start: "+5940px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#bgDot4", {
            backgroundColor: "#a5e0e3",
            width: "500px",
            height: "500px",
            left: -200 + "px",
            top: 700 + "px",
        }, {
            backgroundColor: "#905cff",
            width: "500px",
            height: "500px",
            left: 1420 + "px",
            top: 400 + "px",
            scrollTrigger: {
                trigger: "body",
                start: "+5940px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#bgDot5", {
            backgroundColor: "#d9b5ec",
            width: "500px",
            height: "500px",
            left: 1620 + "px",
            top: 500 + "px",
        }, {
            backgroundColor: "#905cff",
            width: "500px",
            height: "500px",
            left: -250 + "px",
            top: 830 + "px",
            scrollTrigger: {
                trigger: "body",
                start: "+5940px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#pricing", {
            top: "1080px",
            opacity: 0,
            filter: "blur(40px)",
        }, {
            top: "0px",
            opacity: 1,
            filter: "blur(0px)",
            scrollTrigger: {
                trigger: "body",
                start: "+5940px",
                end: "+=500px",
                scrub: true,
            }
        });
    }
    if (window.pageYOffset > 6480){
        gsap.fromTo("#pricing", {
            top: "0px",
            opacity: 1,
            filter: "blur(0px)",
        }, {
            top: "-1080px",
            opacity: 0,
            filter: "blur(40px)",
            scrollTrigger: {
                trigger: "body",
                start: "+6480px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo(".cta-section", {
            opacity: 0,
            filter: "blur(40px)",
        }, {
            opacity: 1,
            filter: "blur(0px)",
            scrollTrigger: {
                trigger: "body",
                start: "+6480px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo(".footer", {
            opacity: 0,
            filter: "blur(40px)",
        }, {
            opacity: 1,
            filter: "blur(0px)",
            scrollTrigger: {
                trigger: "body",
                start: "+6480px",
                end: "+=500px",
                scrub: true,
            }
        });

        gsap.fromTo("#bgDot1", {
            backgroundColor: "#f55b8d",
            width: "600px",
            height: "600px",
            left: 1200 + "px",
            top: -150 + "px",
        }, {
            backgroundColor: "#c9b1e9",
            width: "500px",
            height: "500px",
            left: "400px",
            top: "-60px",
            scrollTrigger: {
                trigger: "body",
                start: "+6480px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#bgDot2", {
            backgroundColor: "#f55b8d",
            width: "400px",
            height: "400px",
            left: 1000 + "px",
            top: 250 + "px",
        }, {
            backgroundColor: "#ee6055",
            left: "770px",
            top: "220px",
            scrollTrigger: {
                trigger: "body",
                start: "+6480px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#bgDot3", {
            backgroundColor: "#f55b8d",
            width: "500px",
            height: "500px",
            left: 1670 + "px",
            top: 250 + "px",
        }, {
            backgroundColor: "#fee440",
            width: "480px",
            height: "480px",
            left: (window.innerWidth - 480) / 2 + "px",
            top: (window.innerHeight - 480) / 2 + "px",
            scrollTrigger: {
                trigger: "body",
                start: "+6480px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#bgDot4", {
            backgroundColor: "#905cff",
            width: "500px",
            height: "500px",
            left: 1420 + "px",
            top: 400 + "px",
        }, {
            backgroundColor: "#ffa962",
            width: "360px",
            height: "360px",
            left: window.innerWidth - 180 + "px",
            top: "290px",
            scrollTrigger: {
                trigger: "body",
                start: "+6480px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#bgDot5", {
            backgroundColor: "#905cff",
            width: "500px",
            height: "500px",
            left: -250 + "px",
            top: 830 + "px",
        }, {
            backgroundColor: "#ffafcc",
            width: "1000px",
            height: "1000px",
            left: window.innerWidth - 500 + "px",
            top: window.innerHeight - 500 + "px",
            scrollTrigger: {
                trigger: "body",
                start: "+6480px",
                end: "+=500px",
                scrub: true,
            }
        });
        gsap.fromTo("#BG", {
            backgroundColor: "#fff",
        }, {
            backgroundColor: "#efefef",
            scrollTrigger: {
                trigger: "body",
                start: "+6480px",
                end: "+=500px",
                scrub: true,
            }
        });

    }
});