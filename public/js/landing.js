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

    const BG = document.getElementById("BG");
    const handleResize = () => {
        if (BG) {
            BG.style.width = window.innerWidth + "px";
            BG.style.height = window.innerHeight + "px";
        }
    };
    window.addEventListener('resize', handleResize);

    const oldKill = window._landingKill;
    window._landingKill = () => {
        if (typeof oldKill === 'function') oldKill();
        window.removeEventListener('resize', handleResize);
        observer.disconnect();
    };
})();