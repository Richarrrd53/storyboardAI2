

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        const target = document.querySelector(href);
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Nav scroll effect
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
        nav.style.background = 'rgba(255,255,255,0.8)';
        nav.style.backdropFilter = 'blur(16px)';
        nav.style.borderBottom = '1px solid rgba(255,255,255,0.9)';
    } else {
        nav.style.background = '';
        nav.style.backdropFilter = '';
        nav.style.borderBottom = '';
    }
});

// Intersection Observer for section animations
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            if (entry.target.id == "intro_video"){

                entry.target.currentTime = 0;
                entry.target.play();
            }
        }
    });
},
    {
        threshold: 0.1
    });

document.querySelectorAll('.feature-card, .step-item, .pricing-card, .section-eyebrow, .section-title, .video-container').forEach(el => {
    observer.observe(el);
});




const BG = document.getElementById("BG");

document.addEventListener('DOMContentLoaded', () => {
    BG.style.width = window.innerWidth + "px";
    BG.style.height = window.innerHeight + "px";
    BG.style.position = "fixed";
    BG.style.left = "0";
    BG.style.top = "0";
    document.body.style.width = window.innerWidth + "px";
    document.body.style.height = window.innerHeight + "px";

    const bgDot1 = document.createElement('div');
    bgDot1.classList.add("bgDots");
    bgDot1.id = "bgDot1";
    BG.appendChild(bgDot1);
    bgDot1.style.backgroundColor = "#c9b1e9";
    bgDot1.style.width = "500px";
    bgDot1.style.height = "500px";
    bgDot1.style.left = (window.innerWidth - 500) / 2 + "px";
    bgDot1.style.top = (window.innerHeight - 500) / 2 + "px";
    bgDot1.style.scale = '0';

    const bgDot2 = document.createElement('div');
    bgDot2.classList.add("bgDots");
    bgDot2.id = "bgDot2";
    BG.appendChild(bgDot2);
    bgDot2.style.backgroundColor = "#ee6055";
    bgDot2.style.width = "500px";
    bgDot2.style.height = "500px";
    bgDot2.style.left = (window.innerWidth - 500) / 2 + "px";
    bgDot2.style.top = (window.innerHeight - 500) / 2 + "px";
    bgDot2.style.scale = '0';

    const bgDot3 = document.createElement('div');
    bgDot3.classList.add("bgDots");
    bgDot3.id = "bgDot3";
    BG.appendChild(bgDot3);
    bgDot3.style.backgroundColor = "#fee440";
    bgDot3.style.width = "480px";
    bgDot3.style.height = "480px";
    bgDot3.style.left = (window.innerWidth - 480) / 2 + "px";
    bgDot3.style.top = (window.innerHeight - 480) / 2 + "px";
    bgDot3.style.scale = '0';

    const bgDot4 = document.createElement('div');
    bgDot4.classList.add("bgDots");
    bgDot4.id = "bgDot4";
    BG.appendChild(bgDot4);
    bgDot4.style.backgroundColor = "#ffa962";
    bgDot4.style.width = "360px";
    bgDot4.style.height = "360px";
    bgDot4.style.left = (window.innerWidth - 360) / 2 + "px";
    bgDot4.style.top = (window.innerHeight - 360) / 2 + "px";
    bgDot4.style.scale = '0';

    const bgDot5 = document.createElement('div');
    bgDot5.classList.add("bgDots");
    bgDot5.id = "bgDot5";
    BG.appendChild(bgDot5);
    bgDot5.style.backgroundColor = "#c9b1e9";
    bgDot5.style.width = "250px";
    bgDot5.style.height = "250px";
    bgDot5.style.left = (window.innerWidth - 250) / 2 + "px";
    bgDot5.style.top = (window.innerHeight - 250) / 2 + "px";
    bgDot5.style.scale = '0';

    const bgMask = document.createElement('div');
    bgMask.id = "bgMask";
    BG.appendChild(bgMask);
    bgMask.style.width = window.innerWidth + "px";
    bgMask.style.height = window.innerHeight + "px";
    setTimeout(() => {
        setBG();
    }, 10);
});

function setBG() {
    const bgDot1 = document.getElementById("bgDot1");
    const bgDot2 = document.getElementById("bgDot2");
    const bgDot3 = document.getElementById("bgDot3");
    const bgDot4 = document.getElementById("bgDot4");
    const bgDot5 = document.getElementById("bgDot5");

    const previewCard1 = document.getElementById("preview-card-1");
    const previewCard2 = document.getElementById("preview-card-2");
    const previewCard3 = document.getElementById("preview-card-3");
    const previewCard4 = document.getElementById("preview-card-4");
    const previewCard5 = document.getElementById("preview-card-5");

    bgDot1.style.left = "400px";
    bgDot1.style.top = "-60px";
    bgDot1.style.scale = '1';

    bgDot2.style.left = "770px";
    bgDot2.style.top = "220px";
    bgDot2.style.scale = '1';

    bgDot3.style.left = "480px";
    bgDot3.style.top = "360px";
    bgDot3.style.scale = '1';

    bgDot4.style.left = "600px";
    bgDot4.style.top = "290px";
    bgDot4.style.scale = '1';

    bgDot5.style.left = "-120px";
    bgDot5.style.top = "800px";
    bgDot5.style.scale = '1';

    previewCard1.style.top = "320px";
    previewCard1.style.right = "5%";

    previewCard2.style.top = "220px";
    previewCard2.style.left = "15%";
    
    previewCard3.style.top = "180px";
    previewCard3.style.right = "30%";

    previewCard4.style.bottom = "120px";
    previewCard4.style.left = "20%";

    previewCard5.style.bottom = "180px";
    previewCard5.style.right = "25%";

    setTimeout(() => {
        bgDot1.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
        bgDot2.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
        bgDot3.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
        bgDot4.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
        bgDot5.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
        previewCard1.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
        previewCard2.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
        previewCard3.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
        previewCard4.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
        previewCard5.style.transition = "all 0s cubic-bezier(.4,0,.2,1)";
    }, 500);
}
