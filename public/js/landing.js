(function () {
    'use strict';
    let observer;
    let handleResize;
    let handleScroll;

    window.initLandingLogic = () => {
        if (observer) {
            observer.disconnect();
        }
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (entry.target.id == "intro_video") {
                        entry.target.currentTime = 0;
                        entry.target.play().catch(e => console.log("Video auto play prevented", e));
                    }
                }
            });
        }, { threshold: 0.1 });

        document.querySelectorAll('.feature-card, .step-item, .pricing-card, .section-eyebrow, .section-title, .video-container').forEach(el => {
            observer.observe(el);
        });

        if (handleScroll) {
            window.removeEventListener('scroll', handleScroll);
        }
        handleScroll = () => {
            const navbar = document.getElementById('nav');
            if (navbar) {
                if (window.scrollY > 20) {
                    navbar.classList.add('scrolled');
                } else {
                    navbar.classList.remove('scrolled');
                }
            }
        };
        window.addEventListener('scroll', handleScroll);

        const BG = document.getElementById("BG");
        if (handleResize) {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('reset', handleResize);
        }
        handleResize = () => {
            if (BG) {
                BG.style.width = window.innerWidth + "px";
                BG.style.height = window.innerHeight + "px";
            }
        };
        window.addEventListener('resize', handleResize);
        window.addEventListener('reset', handleResize);

        handleResize();
        if (BG) {
            BG.style.background = 'var(--off-white)';
        }
    };

    // Auto-run on first script execution
    window.initLandingLogic();

    const oldKill = window._landingKill;
    window._landingKill = () => {
        if (typeof oldKill === 'function') oldKill();
        if (handleResize) {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('reset', handleResize);
        }
        if (handleScroll) {
            window.removeEventListener('scroll', handleScroll);
        }
        if (observer) {
            observer.disconnect();
        }
    };
    
})();