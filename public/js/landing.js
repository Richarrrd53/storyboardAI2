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

    const railBottom = document.getElementById("rail-bottom");
    const railTop = document.getElementById("rail-top");
    if (railBottom && railTop) {
        const nums = window.innerWidth / 20;
        for (let i = 0; i < nums; i++) {
            const railHole = document.createElement('div');
            railHole.classList.add('rail-hole');
            railBottom.appendChild(railHole);
        }
        for (let i = 0; i < nums; i++) {
            const railHole = document.createElement('div');
            railHole.classList.add('rail-hole');
            railTop.appendChild(railHole);
        }
    }

    const oldKill = window._landingKill;
    window._landingKill = () => {
        if (typeof oldKill === 'function') oldKill();
        window.removeEventListener('resize', handleResize);
        observer.disconnect();
    };
})();