/* The router caches this module. Every visit owns a fresh, scoped session. */
const { gsap, ScrollTrigger } = window;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
let activeLanding = null;

window.initLandingPage = () => {
    activeLanding?.destroy();
    const root = document.querySelector('#page-main .landing-story');
    if (!root) return;
    const abort = new AbortController();
    const { signal } = abort;
    let alive = true;
    let refreshTimer;
    let media;
    const refresh = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
            if (alive && root.isConnected) ScrollTrigger?.refresh();
        }, 100);
    };
    const destroy = () => {
        if (!alive) return;
        alive = false;
        abort.abort();
        clearTimeout(refreshTimer);
        media?.revert();
        window.destroyLandingLogic?.();
        activeLanding = null;
    };
    activeLanding = { destroy };
    window._landingKill = destroy;
    window.initLandingLogic?.();

    // Base CSS is the complete composition, including when GSAP fails to load.
    if (gsap && ScrollTrigger) {
        media = gsap.matchMedia();
        media.add({ desktop: '(min-width: 900px)', mobile: '(max-width: 899px)', reduce: '(prefers-reduced-motion: reduce)' }, context => {
            if (context.conditions.reduce) return;
            const desktop = context.conditions.desktop;
            const select = gsap.utils.selector(root);
            const stage = select('.lp-cinema-stage')[0];
            const workflow = select('.lp-workflow-layout')[0];
            stage.classList.add('is-cinematic');
            workflow.classList.add('is-workflow-motion');
            const hero = select('.lp-hero');
            const film = select('.lp-film');
            const product = select('.lp-product');
            // One camera move owns A + B. The generated pin space is viewport-relative.
            // Transform children, never the pinned stage or the document dimensions.
            gsap.set(product, {autoAlpha: 0});
            gsap.set(select('.lp-stage-depth'), {opacity: 0});
            gsap.set(film, {transformPerspective: desktop ? 1000 : 750, rotationY: desktop ? -38 : -16,
                rotationX: desktop ? 12 : 3, rotationZ: desktop ? -13 : -7, z: desktop ? -120 : 0});
            const opening = gsap.timeline({defaults: {ease: 'none'}, scrollTrigger: {
                id: 'landing-opening', trigger: stage, start: 'top top',
                end: () => '+=' + Math.round(innerHeight * (desktop ? 2.8 : 1.65)),
                pin: true, scrub: desktop ? 0.5 : 0.22, anticipatePin: 1, invalidateOnRefresh: true
            }});
            opening.addLabel('expand', 0)
                .to(select('.lp-hero-light'), {scaleX: 1.2, scaleY: 1.4, borderRadius: 0, duration: 0.8}, 0)
                .to(select('.lp-hero-copy, .lp-hero-note'), {autoAlpha: 0, y: -45, duration: 0.55}, 0.15)
                .to(select('.lp-stage-depth'), {opacity: 1, duration: 0.8}, 0.45)
                .addLabel('approach', 0.3)
                .to(film, {xPercent: desktop ? -30 : -20, y: desktop ? -25 : -55,
                    rotationY: 0, rotationX: 0, rotationZ: 0, z: desktop ? 350 : 0,
                    scale: desktop ? 1.25 : 1.65, duration: 1}, 'approach')
                .addLabel('crossLens', 1.3)
                .to(film, {xPercent: desktop ? -60 : -65, z: desktop ? 720 : 0,
                    scale: desktop ? 2.8 : 4.2, rotationZ: desktop ? 6 : 3, duration: 0.75}, 'crossLens')
                .to(select('.lp-hero-light'), {opacity: 0, duration: 0.5}, 1.1)
                .to(hero, {autoAlpha: 0, duration: 0.3}, 1.9)
                .addLabel('workspace', 1.65)
                .to(product, {autoAlpha: 1, duration: 0.3}, 'workspace')
                .fromTo(select('.lp-product-image'),
                    {scale: desktop ? 0.38 : 0.62, rotationX: desktop ? 24 : 0, y: desktop ? 120 : 65,
                        clipPath: desktop ? 'inset(12% 23% 12% 23% round 48px)' : 'inset(12% 8% 12% 8% round 32px)'},
                    {scale: 1, rotationX: 0, y: 0, clipPath: 'inset(0% 0% 0% 0% round 24px)', duration: 1.1}, 'workspace')
                .fromTo(select('.lp-product .lp-section-head'), {opacity: 0, y: 35}, {opacity: 1, y: 0, duration: 0.5}, 2.4)
                .fromTo(select('.lp-reveal-tool'), {opacity: 0, y: 30, scale: 0.8}, {opacity: 1, y: 0, scale: 1, duration: 0.4}, 2.65)
                .to({}, {duration: 0.35});

            // Workflow states are a single reversible sequence, including the shot edit.
            const steps = select('.lp-workflow-steps > li');
            gsap.set(steps.slice(1), {autoAlpha: 0, y: 60});
            const sheet = gsap.timeline({defaults: {ease: 'none'}, scrollTrigger: {
                id: 'landing-workflow', trigger: workflow, start: desktop ? 'top 100px' : 'top 82px',
                end: () => '+=' + Math.round(innerHeight * (desktop ? 2.5 : 1.85)),
                pin: true, scrub: 0.25, anticipatePin: 1, invalidateOnRefresh: true
            }});
            steps.forEach((step, index) => {
                sheet.addLabel(['story','discussion','shots','editing'][index], index);
                if (index) {
                    sheet.to(steps[index-1], {autoAlpha: 0, y: -45, duration: 0.25}, index - 0.3)
                        .to(step, {autoAlpha: 1, y: 0, duration: 0.35}, index - 0.12);
                }
            });
            sheet.fromTo(select('.lp-workflow-shots figure'),
                {y: 0, rotation: i => (i-1)*8, scale: 0.8},
                {y: 0, rotation: 0, scale: 1, stagger: 0.13, duration: 0.45}, 1.88)
                .fromTo(select('.lp-workflow-edit'), {scale: 0.75, y: 45}, {scale: 1, y: 0, duration: 0.5}, 2.9)
                .fromTo(select('.lp-edit-toolbar'), {y: 20, opacity: 0}, {y: 0, opacity: 1, duration: 0.3}, 3.25)
                .fromTo(select('.lp-workflow-progress span'), {scaleX: 0}, {scaleX: 1, duration: 3.8}, 0);
            // class mutations are owned by the same media session as the pin spacers.
            return () => {
                stage.classList.remove('is-cinematic');
                workflow.classList.remove('is-workflow-motion');
            };
        }, root);
    }
    root.querySelectorAll('img, video').forEach(asset => {
        asset.addEventListener(asset.tagName === 'VIDEO' ? 'loadedmetadata' : 'load', refresh, { signal });
        asset.addEventListener('error', refresh, { signal });
    });
    root.querySelectorAll('details').forEach(details => {
        details.addEventListener('toggle', refresh, { signal });
    });
    window.addEventListener('pageshow', refresh, { signal });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }, { signal });
    document.fonts?.ready.then(() => { if (alive) refresh(); });
    // ScrollTrigger owns debounced resize; matchMedia reverts at breakpoints.
    refresh();
};
