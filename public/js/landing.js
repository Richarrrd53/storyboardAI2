(function () {
    'use strict';
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (entry.target.id == "intro_video") {
                    entry.target.currentTime = 0;
                    entry.target.play();
                }
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.feature-card, .step-item, .pricing-card, .section-eyebrow, .section-title, .video-container').forEach(el => {
        observer.observe(el);
    });

    window.addEventListener('scroll', () => {
        const navbar = document.getElementById('nav');
        if (window.scrollY > 20) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });


    const BG = document.getElementById("BG");
    const handleResize = () => {
        if (BG) {
            BG.style.width = window.innerWidth + "px";
            BG.style.height = window.innerHeight + "px";
        }
    };
    window.addEventListener('resize', handleResize);

    window.addEventListener('load', () => {
        window.body,scrollTo({top:0,left:0});
        BG.style.background = 'var(--off-white)';
    });
    window.addEventListener('reset', handleResize);

    const oldKill = window._landingKill;
    window._landingKill = () => {
        if (typeof oldKill === 'function') oldKill();
        window.removeEventListener('resize', handleResize);
        observer.disconnect();
    };
    
})();