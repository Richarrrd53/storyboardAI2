(function () {
  'use strict';
  const style = document.createElement('style');
  style.textContent = `
    #page-main {
      position: relative;
    }
    #page-content {
      transition: opacity 320ms cubic-bezier(.4,0,.2,1), filter 320ms cubic-bezier(.4,0,.2,1), transform 320ms cubic-bezier(.4,0,.2,1);
    }
    #page-inner-loader {
      position: absolute !important;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0);
      backdrop-filter: blur(0px) saturate(100%);
      -webkit-backdrop-filter: blur(0px) saturate(100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: var(--layer-transition) !important;
      opacity: 1;
      pointer-events: none;
      transition: background-color 0.35s cubic-bezier(.4,0,.2,1),
                  backdrop-filter 0.35s cubic-bezier(.4,0,.2,1),
                  -webkit-backdrop-filter 0.35s cubic-bezier(.4,0,.2,1);
    }
    #page-inner-loader.active {
      background: rgba(255, 255, 255, 0.45) !important;
      backdrop-filter: blur(16px) saturate(170%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(170%) !important;
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
  let nextMaskWhite = false;
  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  function setNextMaskWhite(flag = true) {
    nextMaskWhite = Boolean(flag);
  }

  function maskClose(valid = () => true) {
    const topTarget = nextMaskWhite ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.45)';
    const botTarget = nextMaskWhite ? 'rgba(255, 255, 255, 1)' : 'rgba(248, 250, 252, 0.2)';
    if (reduced()) {
      if (valid()) {
        if (maskTop()) Object.assign(maskTop().style, { transition: 'none', opacity: '1', backgroundColor: topTarget, pointerEvents: 'auto' });
        if (maskBot()) Object.assign(maskBot().style, { transition: 'none', opacity: '1', backgroundColor: botTarget, pointerEvents: 'auto' });
      }
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const easing = 'cubic-bezier(.4,0,.2,1)';
      requestAnimationFrame(() => {
        if (!valid() || !maskTop() || !maskBot()) { resolve(); return; }
        maskTop().style.transition = `background-color 0.4s ${easing}, backdrop-filter 0.4s ${easing}, -webkit-backdrop-filter 0.4s ${easing}`;
        maskBot().style.transition = `background-color 0.4s ${easing}`;

        maskTop().style.pointerEvents = 'auto';
        maskBot().style.pointerEvents = 'auto';

        maskTop().style.opacity = '1';
        maskTop().style.backgroundColor = topTarget;
        maskTop().style.backdropFilter = 'blur(24px) saturate(170%)';
        maskTop().style.webkitBackdropFilter = 'blur(24px) saturate(170%)';

        maskBot().style.opacity = '1';
        maskBot().style.backgroundColor = botTarget;
        rafDelay(400).then(resolve);
      });
    });
  }

  function maskOpen(valid = () => true) {
    nextMaskWhite = false;
    if (reduced()) {
      if (valid()) {
        if (maskTop()) Object.assign(maskTop().style, { transition: 'none', opacity: '1', backgroundColor: 'rgba(255, 255, 255, 0)', pointerEvents: 'none', backdropFilter: 'blur(0px) saturate(100%)', webkitBackdropFilter: 'blur(0px) saturate(100%)' });
        if (maskBot()) Object.assign(maskBot().style, { transition: 'none', opacity: '1', backgroundColor: 'rgba(248, 250, 252, 0)', pointerEvents: 'none' });
      }
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const easing = 'cubic-bezier(.4,0,.2,1)';
      requestAnimationFrame(() => {
        if (!valid() || !maskTop() || !maskBot()) { resolve(); return; }
        maskTop().style.transition = `background-color 0.4s ${easing}, backdrop-filter 0.4s ${easing}, -webkit-backdrop-filter 0.4s ${easing}`;
        maskBot().style.transition = `background-color 0.4s ${easing}`;

        maskTop().style.opacity = '1';
        maskTop().style.backgroundColor = 'rgba(255, 255, 255, 0)';
        maskTop().style.backdropFilter = 'blur(0px) saturate(100%)';
        maskTop().style.webkitBackdropFilter = 'blur(0px) saturate(100%)';

        maskBot().style.opacity = '1';
        maskBot().style.backgroundColor = 'rgba(248, 250, 252, 0)';

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
      nav.style.transition = reduced() ? 'none' : 'transform 0.45s cubic-bezier(0.76,0,0.24,1)';
      nav.style.transform = 'translateY(calc(-100% - 28px))';
    }
  }

  function showLandingNav() {
    const nav = landingNav();
    if (nav) {
      nav.style.transition = reduced() ? 'none' : 'transform 0.45s cubic-bezier(0.16,1,0.3,1)';
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
      maskTop().style.backgroundColor = 'rgba(255, 255, 255, 0.45)';
      maskTop().style.backdropFilter = 'blur(16px) saturate(170%)';
      maskTop().style.webkitBackdropFilter = 'blur(16px) saturate(170%)';
      maskBot().style.opacity = '1';
      maskBot().style.backgroundColor = 'rgba(248, 250, 252, 0.2)';
    }
  }
  function setLayout(page, dashboard, opts) {
    const isAuth = page === 'login' || page === 'register';
    document.body.classList.toggle('dashboard-layout', dashboard);
    document.body.classList.toggle('auth-layout', isAuth);
    window.AppShell.updateRoute(page, opts);
    if (dashboard || isAuth) showDashTopbar();
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
        content.inert = true;
        if (internal) {
          apply({ transition: reduced() ? 'none' : 'opacity 320ms cubic-bezier(.4,0,.2,1), filter 320ms cubic-bezier(.4,0,.2,1), transform 320ms cubic-bezier(.4,0,.2,1)', opacity: '0', filter: reduced() ? '' : 'blur(22px)', transform: reduced() || fromQC ? '' : 'scale(0.97)', visibility: fromQC ? 'hidden' : '' });
          loader.showInnerLoader();
          if (!fromQC && !reduced()) await rafDelay(240);
          if (!valid()) return;

        } else {
          const promise = maskClose(valid);
          loader.startLoaderTimer(false);
          await promise;
        }

      },
      prepared() { if (valid() && internal) loader.pausePending?.(); },
      mounting() {
        if (!valid()) return;
        if (internal) loader.showInnerLoader();
        else loader.startLoaderTimer(false);
      },
      async complete() {
        if (!valid()) return;
        loader.hideInnerLoader();
        if (!fromQC && !reduced()) apply({ transition: 'none', opacity: '0', filter: 'blur(22px)', transform: 'scale(0.98)' });
        if (!reduced() && !fromQC) await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!valid()) return;
        cleanLoaders();
        content.inert = false;
        apply({ transition: reduced() || fromQC ? 'none' : 'opacity 380ms cubic-bezier(.22,1,.36,1), filter 380ms cubic-bezier(.22,1,.36,1), transform 380ms cubic-bezier(.22,1,.36,1)', opacity: '1', visibility: fromQC ? 'visible' : '', filter: 'blur(0px)', transform: 'scale(1)' });
        if (!internal) await maskOpen(valid);
        if (!valid()) return;
        cleanupTimer = setTimeout(() => {
          if (valid() && content?.isConnected) {
            content.style.removeProperty('filter');
            content.style.removeProperty('transition');
            content.style.removeProperty('transform');
          }
        }, reduced() ? 0 : 300);
      },
      cleanup() {
        if (!valid()) return;
        cleanLoaders();
        content.inert = false;
        apply({ opacity: '1', visibility: '', filter: '', transform: '' });
      },
      cancel() {
        if (cancelled) return;
        if (active === session) {
          cleanLoaders();
          content.inert = false;
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
  window.NavigationTransition = { initialize, create, setLayout, leaveLanding, open: maskOpen, setNextMaskWhite };
  window.spaMaskClose = maskClose;
  window.spaMaskOpen = maskOpen;
})();
