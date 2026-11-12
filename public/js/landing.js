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
        let sceneScroll;
        const cancelSceneScroll = () => { sceneScroll?.kill(); sceneScroll = null; };
        // Native smooth scrolling can be interrupted by a pin refresh while images load.
        // Drive explicit chapter navigation with a short, cancellable owned tween instead.
        const scrollToScene = resolve => {
            cancelSceneScroll();
            if (!window.gsap || matchMedia('(prefers-reduced-motion: reduce)').matches) {
                window.scrollTo({top: resolve(), behavior: 'instant'});
                return;
            }
            const start = window.scrollY;
            const position = { progress: 0 };
            sceneScroll = window.gsap.to(position, {
                progress: 1, duration: 0.85, ease: 'power2.inOut',
                onUpdate: () => window.scrollTo({top: start + (resolve() - start) * position.progress, behavior: 'instant'}),
                onComplete: () => { sceneScroll = null; }
            });
        };
        window.addEventListener('wheel', cancelSceneScroll, {signal, passive: true});
        window.addEventListener('touchstart', cancelSceneScroll, {signal, passive: true});
        window.addEventListener('resize', cancelSceneScroll, {signal});
        matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', cancelSceneScroll, {signal});
        window.addEventListener('keydown', event => {
            if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) cancelSceneScroll();
        }, {signal});
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
            cancelSceneScroll();
            const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
            const opening = window.ScrollTrigger?.getById('landing-opening');
            const workflow = window.ScrollTrigger?.getById('landing-workflow');
            if (id === 'videos' && opening) {
                // The product is inside the pinned camera scene; its DOM offset is not its scroll position.
                scrollToScene(() => opening.end - 2);
            } else if (id === 'heroSection' && opening) {
                scrollToScene(() => opening.start);
            } else if (id === 'how' && workflow) {
                scrollToScene(() => workflow.start);
            } else target.scrollIntoView({ behavior });
            target.focus({ preventScroll: true });
        }, { signal });
        const video = root.querySelector('video');
        const observer = video && new IntersectionObserver(entries => {
            if (!entries[0].isIntersecting) video.pause();
        }, { threshold: 0 });
        if (video) observer.observe(video);
        document.addEventListener('visibilitychange', () => { if (document.hidden) video?.pause(); }, { signal });
        cleanup = () => { cancelSceneScroll(); abort.abort(); observer?.disconnect(); video?.pause(); nav?.classList.remove('scrolled'); };
    };
})();
