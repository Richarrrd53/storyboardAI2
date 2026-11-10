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
            const opening = gsap.timeline({
                defaults: { ease: 'none' },
                scrollTrigger: {
                    id: 'landing-opening', trigger: select('.lp-hero')[0],
                    start: 'top top', end: 'bottom top', scrub: 0.35, invalidateOnRefresh: true
                }
            });
            opening.addLabel('filmPass').to(select('.lp-film'), {
                x: () => desktop ? -85 : -18, y: desktop ? -34 : -10, rotation: desktop ? -3 : 0
            }, 'filmPass');

            const reveal = gsap.timeline({
                defaults: { ease: 'none' },
                scrollTrigger: {
                    id: 'landing-product', trigger: select('.lp-product')[0],
                    start: 'top 90%', end: 'top 25%', scrub: 0.35, invalidateOnRefresh: true
                }
            });
            reveal.addLabel('editDesk').fromTo(select('.lp-product-image'),
                { y: desktop ? 54 : 18, scale: desktop ? 0.94 : 0.98 }, { y: 0, scale: 1 }, 'editDesk');

            const sheet = gsap.timeline({
                defaults: { ease: 'none' },
                scrollTrigger: {
                    id: 'landing-sheet', trigger: select('.lp-capabilities')[0],
                    start: 'top 90%', end: 'top 35%', scrub: 0.3, invalidateOnRefresh: true
                }
            });
            sheet.addLabel('onSet').fromTo(select('.lp-shot-sheet'),
                { rotation: desktop ? 3 : 0, y: desktop ? 40 : 12 }, { rotation: 0, y: 0 }, 'onSet');
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
