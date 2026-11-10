(function () {
    'use strict';
    let cleanup;
    window.destroyLandingLogic = () => { cleanup?.(); cleanup = null; };
    window.initLandingLogic = () => {
        window.destroyLandingLogic();
        const root = document.querySelector('#page-main .landing-story');
        if (!root) return;
        const abort = new AbortController();
        const { signal } = abort;
        const nav = document.getElementById('nav');
        const updateNav = () => nav?.classList.toggle('scrolled', window.scrollY > 20);
        window.addEventListener('scroll', updateNav, { signal, passive: true });
        updateNav();
        document.addEventListener('click', event => {
            const link = event.target.closest('a[href^="#"]:not([data-navigate])');
            if (!link || !(root.contains(link) || nav?.contains(link))) return;
            const id = link.getAttribute('href').slice(1);
            if (!id) return;
            const target = root.querySelector(`[id="${CSS.escape(id)}"]`);
            if (!target) return;
            event.preventDefault();
            target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
            target.focus({ preventScroll: true });
        }, { signal });
        const video = root.querySelector('video');
        const observer = video && new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting) video.pause();
        }, { threshold: 0 });
        if (video) observer.observe(video);
        document.addEventListener('visibilitychange', () => { if (document.hidden) video?.pause(); }, { signal });
        cleanup = () => { abort.abort(); observer?.disconnect(); video?.pause(); nav?.classList.remove('scrolled'); };
    };
})();
