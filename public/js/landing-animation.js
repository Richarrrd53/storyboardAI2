import gsap from "https://cdn.skypack.dev/gsap";
import ScrollTrigger from "https://cdn.skypack.dev/gsap/ScrollTrigger";
import ScrollToPlugin from "https://cdn.skypack.dev/gsap/ScrollToPlugin";

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

let landingCtx;

window.initLandingPage = () => {
    if (landingCtx) {
        landingCtx.revert();
    }

    window.scrollTo(0, 0);
    if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.clearScrollMemory?.();
        ScrollTrigger.refresh();
    }

    const links = gsap.utils.toArray("a[href^='#']");
    links.forEach(link => {
        link.addEventListener("click", function(e) {
            e.preventDefault();
            const targetId = this.getAttribute("href");
            gsap.to(window, {
                duration: 1.2,
                scrollTo: {
                    y: targetId,
                    offsetY: 0
                },
                ease: "power2.inOut"
            });
        });
    });

    landingCtx = gsap.context(() => {
        gsap.fromTo('.hero-bg', {
            width: '90vw',
            height: '75vh',
        }, {
            width: '100vw',
            height: '100vh',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: '+=200',
                scrub: 1
            }
        });

        gsap.fromTo('.hero-footer', {
            height: '10vh',
        }, {
            height: '0vh',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: '+=200',
                scrub: 1
            }
        });

        gsap.fromTo('.perspective-container', {
            clipPath: 'inset(12.5vh 0vw 17.5vh 5vw round var(--radius-xl))',
        }, {
            clipPath: 'inset(0vh 0vw 0vh 0vw round var(--radius-xl))',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: '+=200',
                scrub: 1
            }
        });

        gsap.fromTo('.perspective-filmstrip', {
            transform: 'perspective(1000px) rotateY(-40deg) rotateX(15deg) rotateZ(-12deg) translateX(0) scale(1)',
            top: '90%',
        }, {
            transform: 'perspective(1000px) rotateY(0deg) rotateX(0deg) rotateZ(0deg) translate(-80%) scale(2)',
            top: '42.5%',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top top',
                end: '+=800',
                scrub: 1
            }
        });

        gsap.fromTo('.hero-bg', {
            opacity: 1,
            filter: 'blur(0px)',
        }, {
            opacity: 0,
            filter: 'blur(10px)',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top+=200 top',
                end: '+=200',
                scrub: 1
            }
        });

        gsap.fromTo('.perspective-container', {
            scale: 1,
        }, {
            scale: 4,
            scrollTrigger: {
                trigger: '.hero',
                start: 'top+=400 top',
                end: '+=500',
                scrub: 1
            }
        });

        gsap.fromTo('.perspective-filmstrip', {
            opacity: 1,
        }, {
            opacity: 0,
            scrollTrigger: {
                trigger: '.hero',
                start: 'top+=800 top',
                end: '+=100',
                scrub: 1
            }
        });

        gsap.to('#BG', {
            background: 'var(--primary)',
            scrollTrigger: {
                trigger: '.hero',
                start: 'top+=700 top',
                end: '+=200',
                scrub: 1
            }
        });

        gsap.fromTo('.video-container', {
            scale: 0.2,
        }, {
            scale: 1,
            scrollTrigger: {
                trigger: '.videos',
                start: 'top+200 bottom',
                end: 'top+=500 bottom',
                scrub: 1
            }
        });

        const t2 = gsap.timeline({
            scrollTrigger: {
                trigger: '.slogan',
                start: 'top bottom',
                end: 'top+=200',
                scrub: 1
            }
        });

        t2.fromTo('.slogan-film-strip.strip1', {
            xPercent: -100,
        }, {
            xPercent: 0,
        })
        .fromTo('.slogan-film-strip.strip2', {
            xPercent: 100,
        }, {
            xPercent: 0,
        })
        .fromTo('.slogan-title', {
            opacity: 0,
            filter: 'blur(20px)',
        }, {
            opacity: 1,
            filter: 'blur(0px)',
        })
        .fromTo('.slogan-content', {
            opacity: 0,
            filter: 'blur(20px)',
        }, {
            opacity: 1,
            filter: 'blur(0px)',
        }, "<")
        .to('#BG', {
            background: 'var(--off-white)',
        }, "<");
    });

    window._landingKill = () => {
        if (landingCtx) {
            landingCtx.revert();
            landingCtx = null;
        }
        const bg = document.getElementById('BG');
        if (bg) {
            bg.style.removeProperty('background');
        }
    };
};