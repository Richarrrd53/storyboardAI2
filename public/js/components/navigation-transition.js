(function () {
  'use strict';
  const style = document.createElement('style');
  style.textContent = `
    #page-main {
      position: relative;
    }
    #page-content {
      transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), filter 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #page-inner-loader {
      position: absolute !important;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.55);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999 !important;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    #page-inner-loader.active {
      opacity: 1 !important;
      pointer-events: auto !important;
    }
  `;
  document.head.appendChild(style);

  function rafDelay(ms) {
    return new Promise(resolve => {
      let done = false;
      const start = performance.now();
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve();
        }
      }, ms + 50);
      function frame(now) {
        if (done) return;
        if (now - start >= ms) {
          done = true;
          clearTimeout(timer);
          resolve();
        } else {
          requestAnimationFrame(frame);
        }
      }
      requestAnimationFrame(frame);
    });
  }


  const maskTop = () => document.getElementById('black-mask-top');
  const maskBot = () => document.getElementById('black-mask-bottom');
  const landingNav = () => document.querySelector('.nav');
  const loader = window.TransitionLoader;
  let active = null;

  function maskClose(valid = () => true) {
    return new Promise(resolve => {
      const easing = 'cubic-bezier(.4,0,.2,1)';
      requestAnimationFrame(() => {
        if (!valid() || !maskTop() || !maskBot()) { resolve(); return; }
        maskTop().style.transition = `all 0.4s ${easing}`;
        maskBot().style.transition = `all 0.4s ${easing}`;

        maskTop().style.pointerEvents = 'auto';
        maskBot().style.pointerEvents = 'auto';

        maskTop().style.opacity = '1';
        maskTop().style.backdropFilter = 'blur(50px)';
        maskTop().style.webkitBackdropFilter = 'blur(50px)';

        maskBot().style.opacity = '1';
        rafDelay(400).then(resolve);
      });
    });
  }

  function maskOpen(valid = () => true) {
    return new Promise(resolve => {
      const easing = 'cubic-bezier(.4,0,.2,1)';
      requestAnimationFrame(() => {
        if (!valid() || !maskTop() || !maskBot()) { resolve(); return; }
        maskTop().style.transition = `all 0.4s ${easing}`;
        maskBot().style.transition = `all 0.4s ${easing}`;

        maskTop().style.opacity = '0';
        maskTop().style.backdropFilter = 'blur(0px)';
        maskTop().style.webkitBackdropFilter = 'blur(0px)';

        maskBot().style.opacity = '0';

        rafDelay(400).then(() => {
          if (!valid()) { resolve(); return; }
          maskTop().style.pointerEvents = 'none';
          maskBot().style.pointerEvents = 'none';
          resolve();
        });
      });
    });
  }

  function showDashTopbar() {
    const nav = landingNav();
    if (nav) {
      nav.style.transition = 'transform 0.45s cubic-bezier(0.76,0,0.24,1)';
      nav.style.transform = 'translateY(-100%)';
    }
  }

  function showLandingNav() {
    const nav = landingNav();
    if (nav) {
      nav.style.transition = 'transform 0.45s cubic-bezier(0.16,1,0.3,1)';
      nav.style.transform = 'translateY(0)';
    }
  }

  function initialize() {
    loader.initDashboardLoader();
    loader.initTransitionLoader();
    if (maskTop() && maskBot()) {
      maskTop().style.transition = 'none';
      maskBot().style.transition = 'none';
      maskTop().style.pointerEvents = 'auto';
      maskBot().style.pointerEvents = 'auto';
      maskTop().style.opacity = '1';
      maskTop().style.backdropFilter = 'blur(15px)';
      maskTop().style.webkitBackdropFilter = 'blur(15px)';
      maskBot().style.opacity = '1';
    }
  }
  function setLayout(page, dashboard, opts) {
    document.body.classList.toggle('dashboard-layout', dashboard);
    document.body.classList.toggle('auth-layout', page === 'login' || page === 'register');
    window.AppShell.updateRoute(page, opts);
    if (dashboard) showDashTopbar();
    else {
      const nav = document.getElementById('nav') || landingNav();
      if (nav) nav.style.display = '';
      document.getElementById('page-main').style.margin = '';
      showLandingNav();
    }
    window.QuickCompose.updateLayerState(page);
  }
  function leaveLanding() {
    window.PageHost.getContent().style.display = 'none';
    const nav = document.getElementById('nav') || landingNav();
    if (nav) nav.style.display = 'none';
  }
  function create({ signal, internal, fromQC = false, routeUpdate = false }) {
    if (active) active.cancel();
    const content = window.PageHost.getContent();
    let cancelled = false;
    let cleanupTimer = null;
    const valid = () => !cancelled && !signal.aborted && active === session;
    const apply = values => { if (valid() && content?.isConnected) Object.assign(content.style, values); };
    const cleanLoaders = () => { loader.hideInnerLoader(); loader.cleanup(); };
    const session = {
      async start() {
        if (!valid()) return;
        if (internal) {
          apply({ transition: 'opacity 180ms ease, filter 180ms ease', opacity: '0', filter: 'blur(12px)', visibility: fromQC ? 'hidden' : '' });
          if (routeUpdate) loader.startLoaderTimer(true);
          if (!fromQC) await rafDelay(routeUpdate ? 180 : 200);
          if (!valid()) return;
          if (!routeUpdate) loader.startLoaderTimer(true);
        } else {
          const promise = maskClose(valid);
          loader.startLoaderTimer(false);
          await promise;
        }
        if (valid() && !routeUpdate) loader.showInnerLoader();
      },
      async complete() {
        if (!valid()) return;
        loader.hideInnerLoader();
        if (!routeUpdate) await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!valid()) return;
        cleanLoaders();
        apply({ transition: internal ? (fromQC ? 'none' : `opacity ${routeUpdate ? 240 : 250}ms ease, filter ${routeUpdate ? 240 : 250}ms ease`) : '', opacity: '1', visibility: fromQC ? 'visible' : '', filter: fromQC ? '' : 'blur(0px)' });
        if (!internal) await maskOpen(valid);
        if (!valid()) return;
        cleanupTimer = setTimeout(() => {
          if (valid() && content?.isConnected) {
            content.style.removeProperty('filter');
            content.style.removeProperty('transition');
          }
        }, routeUpdate ? 260 : 280);
      },
      cleanup() {
        if (!valid()) return;
        cleanLoaders();
        apply({ opacity: '1', visibility: '', filter: '', transform: '' });
      },
      cancel() {
        if (cancelled) return;
        if (active === session) {
          cleanLoaders();
          if (content?.isConnected) Object.assign(content.style, { opacity: '1', visibility: '', filter: '', transform: '', transition: '' });
          // A cancelled full-screen transition must never block input on its successor.
          [maskTop(), maskBot()].forEach(mask => {
            if (mask) Object.assign(mask.style, { opacity: '0', pointerEvents: 'none', backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)' });
          });
        }
        cancelled = true;
        clearTimeout(cleanupTimer);
        signal.removeEventListener('abort', session.cancel);
      }
    };
    active = session;
    signal.addEventListener('abort', session.cancel, { once: true });
    return session;
  }
  window.NavigationTransition = { initialize, create, setLayout, leaveLanding, open: maskOpen };
  window.spaMaskClose = maskClose;
  window.spaMaskOpen = maskOpen;
})();
