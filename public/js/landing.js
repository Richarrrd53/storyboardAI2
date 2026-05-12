// document.querySelectorAll('a[href^="#"]').forEach(anchor => {
//     anchor.addEventListener('click', function (e) {
//         const href = this.getAttribute('href');
//         if (href === '#') return;
//         const target = document.querySelector(href);
//         if (target) {
//             e.preventDefault();
//             target.scrollIntoView({ behavior: 'smooth' });
//         }
//     });
// });

// Intersection Observer for section animations
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            if (entry.target.id == "intro_video") {

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

window.addEventListener('resize', () => {
    BG.style.width = window.innerWidth + "px";
    BG.style.height = window.innerHeight + "px";
});

document.addEventListener('DOMContentLoaded', () => {
    const railBottom = document.getElementById("rail-bottom");
    const railTop = document.getElementById("rail-top");
    const nums = window.innerWidth / 28;
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
    
});

