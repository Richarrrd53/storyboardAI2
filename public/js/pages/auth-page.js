(function () {
  'use strict';
  function getPostLoginDestination() {
    let destination;
    try { destination = JSON.parse(window.sessionStorage?.getItem('spa_return_route') || 'null'); } catch (_) {}
    const allowed = ['dashboard','projects','history','template','project','generate','discovery','discovery-settings'];
    return {
      page: allowed.includes(destination?.page) ? destination.page : 'dashboard',
      opts: { id: destination?.opts?.id, templateId: destination?.opts?.templateId }
    };
  }

  function prefetchPostLoginDestination() {
    try {
      const { page, opts } = getPostLoginDestination();
      const prefetcher = window.PageAssetLoader?.prefetchPage || window.prefetchPage;
      if (typeof prefetcher === 'function') {
        Promise.resolve(prefetcher(page, opts)).catch(() => {});
      }
      if (page === 'dashboard' || page === 'project') {
        fetch('/css/dashboard.css').catch(() => {});
      }
    } catch (_) {}
  }

  function returnAfterLogin(navigate) {
    const { page, opts } = getPostLoginDestination();
    window.sessionStorage?.removeItem('spa_return_route');
    navigate(page, opts);
  }

  function mount({ root, signal, navigate, route = {} }) {
    const showRegister = route.showRegister;
    const timers = new Set();
    const listeners = [];
    let disposed = false;
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (!disposed && !signal?.aborted && root.isConnected) fn(); }, ms);
      timers.add(id);
    };
    const isActive = () => !disposed && !signal?.aborted && root.isConnected;
    const releaseEffects = window.AuthEffects.mount(root);
    let activeTab = showRegister ? 'register' : 'login';
    let hasMountedTab = false;
    let isSubmitting = false;
    let verifyRoseLoader = null;
    const syncPanelHeight = () => {
      if (!isActive()) return;
      const panel = root.querySelector('#panel-' + activeTab);
      const inner = root.querySelector('#auth-inner');
      if (inner && panel?.offsetHeight > 0) inner.style.height = panel.offsetHeight + 'px';
    };
    const panelObserver = window.ResizeObserver ? new window.ResizeObserver(syncPanelHeight) : null;
    root.querySelectorAll('.auth-panel').forEach(panel => panelObserver?.observe(panel));

    const backBtn = root.querySelector('#auth-back-btn');
    if (backBtn) {
      const onBack = (e) => {
        e.preventDefault();
        navigate('landing');
      };
      backBtn.addEventListener('click', onBack);
      listeners.push(() => backBtn.removeEventListener('click', onBack));
    }

    const brandLogos = root.querySelectorAll('.brand-logo, .logo');
    brandLogos.forEach(logo => {
      if (logo.dataset.spaLogoBound) return;
      logo.dataset.spaLogoBound = 'true';
      logo.style.cursor = 'pointer';
      const onClick = (e) => {
        e.preventDefault();
        navigate('landing');
      };
      logo.addEventListener('click', onClick);
      listeners.push(() => { logo.removeEventListener('click', onClick); delete logo.dataset.spaLogoBound; });
    });

    function syncVisualLottie(tab, animateSwitch) {
      const loginImg = document.getElementById('loginImg');
      const registerImg = document.getElementById('registerImg');
      if (!loginImg || !registerImg) return;
      if (typeof window !== 'undefined' && window.innerWidth <= 860) {
        loginImg.pause?.();
        registerImg.pause?.();
        return;
      }
      const nextImg = tab === 'login' ? loginImg : registerImg;
      const prevImg = tab === 'login' ? registerImg : loginImg;

      if (!animateSwitch) {
        prevImg.classList.remove('is-active', 'is-shrinking');
        prevImg.pause?.();
        nextImg.classList.remove('is-shrinking');
        nextImg.classList.add('is-active');
        nextImg.play?.();
        return;
      }

      if (prevImg.classList.contains('is-active')) {
        prevImg.classList.add('is-shrinking');
        later(() => {
          prevImg.classList.remove('is-active', 'is-shrinking');
          prevImg.pause?.();
          nextImg.classList.add('is-shrinking');
          nextImg.classList.add('is-active');
          void nextImg.offsetWidth;
          nextImg.classList.remove('is-shrinking');
          nextImg.play?.();
        }, 220);
      } else {
        nextImg.classList.remove('is-shrinking');
        nextImg.classList.add('is-active');
        nextImg.play?.();
      }
    }

    window.switchTab = function (tab) {
      const lp = document.getElementById('panel-login');
      const rp = document.getElementById('panel-register');
      const inner = document.getElementById("auth-inner");
      const tl = document.getElementById('tab-login');
      const tr = document.getElementById('tab-register');
      if (!lp || !rp) return;
      const changed = hasMountedTab && activeTab !== tab;
      hasMountedTab = true;
      activeTab = tab;
      const loginActive = tab === 'login';
      lp.inert = !loginActive;rp.inert = loginActive;
      lp.setAttribute('aria-hidden',String(!loginActive));rp.setAttribute('aria-hidden',String(loginActive));
      tl.setAttribute('aria-pressed',String(loginActive));tr.setAttribute('aria-pressed',String(!loginActive));
      const inactive = loginActive ? rp : lp;
      if (inactive.contains(document.activeElement)) (loginActive ? tl : tr).focus({preventScroll:true});
      syncPanelHeight();
      syncVisualLottie(tab, changed);
      if (tab === 'login') {
        tl.classList.add('active'); tr.classList.remove('active');
        inner.style.transform = "rotateY(0)";
        lp.style.pointerEvents = "auto";
        rp.style.pointerEvents = "none";
      } else {
        tr.classList.add('active'); tl.classList.remove('active');
        inner.style.transform = "rotateY(180deg)";
        lp.style.pointerEvents = "none";
        rp.style.pointerEvents = "auto";
      }
    };
    window.switchTab(showRegister ? 'register' : 'login');

    window.togglePwd = function (id, btnId) {
      const inp = document.getElementById(id);
      const slash = document.getElementById("inputShow"+btnId+"2");
      const mask = document.getElementById("inputShowMask"+btnId+"2");
      if (!inp) return;
      if (inp.type === 'password') {
        inp.style.filter = "blur(3px)";
        later(() => {
          inp.style.filter = "blur(0px)";

          inp.type = 'text';
          const button = document.getElementById('showBtn'+btnId);button?.setAttribute('aria-label','隱藏密碼');button?.setAttribute('aria-pressed','true');
        }, 300);
        slash.style.transform = "translateY(-36px)";
        mask.style.transform = "translate(54px, -36px) rotate(45deg)";
      }
      else {
        inp.style.filter = "blur(3px)";
        later(() => {
          inp.style.filter = "blur(0px)";

          inp.type = 'password';
          const button = document.getElementById('showBtn'+btnId);button?.setAttribute('aria-label','顯示密碼');button?.setAttribute('aria-pressed','false');
        }, 300);
        slash.style.transform = "translateY(0px)";
        mask.style.transform = "translate(18px, 0px) rotate(45deg)";
      }
    };

    function formatFriendlyAuthError(message) {
      const text = String(message || '驗證失敗').trim();
      if (!text) return '驗證失敗！請再試一次。';
      if (/請再試一次|請稍後再試|請重新輸入/.test(text)) return text;
      const normalized = text.replace(/[。！!]+$/, '');
      return `${normalized}！請再試一次。`;
    }

    function setInlineError(targetId, message) {
      const el = document.getElementById(targetId);
      if (!el) return;
      el.textContent = message ? formatFriendlyAuthError(message) : '';
      el.classList.toggle('is-visible', Boolean(message));
      syncPanelHeight();
    }

    function nextStage(from, to, bgW, bgH, toDisplay = 'flex') {
      const stageCard = document.getElementById('auth-stage-card');
      if (from) {
        from.style.opacity = '0';
        from.style.scale = '0';
        from.style.filter = 'blur(30px)';
      }
      if (to) {
        to.style.display = toDisplay;
        to.setAttribute('aria-hidden', 'false');
      }
      later(() => {
        if (to) {
          to.style.opacity = '1';
          to.style.scale = '1';
          to.style.filter = 'blur(0px)';
        }
        if (stageCard && bgW && bgH) {
          stageCard.style.width = bgW + 'px';
          stageCard.style.height = bgH + 'px';
        }
      }, 80);
      if (from) {
        later(() => {
          from.style.display = 'none';
          from.setAttribute('aria-hidden', 'true');
        }, 550);
      }
    }

    function ensureVerifyRose() {
      if (verifyRoseLoader) return verifyRoseLoader;
      const group = document.getElementById('auth-verify-rose-group');
      const path = document.getElementById('auth-verify-rose-path');
      if (group && path && window.TransitionLoader?.setupRoseAnimation) {
        verifyRoseLoader = window.TransitionLoader.setupRoseAnimation(group, path);
      }
      return verifyRoseLoader;
    }

    function spawnWhiteoutCurtain() {
      const curtain = document.createElement('div');
      curtain.className = 'auth-whiteout-curtain';
      document.body.appendChild(curtain);
      setTimeout(() => {
        curtain.classList.add('is-fading');
        setTimeout(() => curtain.remove(), 360);
      }, 280);
    }

    async function runVerificationFlow({ loadingMessage, successMessage, task }) {
      if (isSubmitting) return;
      isSubmitting = true;

      const stageCard = document.getElementById('auth-stage-card');
      const formStage = document.getElementById('auth-form-stage');
      const loadingFlex = document.getElementById('loadingFlex');
      const loadingText = document.getElementById('loadingText');
      const verifyStage = document.getElementById('verificationContainer');
      const errorIcon = document.getElementById('verificationContainerError');
      const checkPlayer = document.getElementById('verificationContainerCorrect');
      const errorText = document.getElementById('verificationContainerText1');
      const successText = document.getElementById('verificationContainerText2');

      const rect = stageCard?.getBoundingClientRect();
      const formW = rect?.width || 1140;
      const formH = rect?.height || 700;
      if (stageCard) {
        stageCard.style.width = formW + 'px';
        stageCard.style.height = formH + 'px';
        void stageCard.offsetWidth;
        stageCard.classList.add('is-verifying');
      }

      const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const loadingSize = Math.min(380, Math.max(260, vw - 32));
      const verifySize = Math.min(420, Math.max(280, vw - 32));

      if (loadingText) loadingText.textContent = loadingMessage;
      nextStage(formStage, loadingFlex, loadingSize, loadingSize, 'flex');
      ensureVerifyRose()?.start();

      const wait = (ms) => new Promise((resolve) => later(resolve, ms));
      const minLoaderDelay = wait(950);
      let taskError = null;
      try {
        await task();
      } catch (err) {
        taskError = err;
      }
      await minLoaderDelay;
      if (!isActive()) {
        verifyRoseLoader?.stop();
        isSubmitting = false;
        return;
      }

      verifyRoseLoader?.stop();

      if (!taskError) {
        prefetchPostLoginDestination();
        if (errorIcon) errorIcon.style.display = 'none';
        if (errorText) errorText.style.display = 'none';
        if (checkPlayer) checkPlayer.style.display = 'block';
        if (successText) {
          successText.style.display = 'block';
          successText.textContent = successMessage;
        }

        nextStage(loadingFlex, verifyStage, verifySize, verifySize, 'flex');
        await wait(260);
        if (!isActive()) { isSubmitting = false; return; }
        if (checkPlayer) {
          try {
            checkPlayer.seek?.(0);
            checkPlayer.play?.();
          } catch (_) {}
        }

        await wait(1600);
        if (!isActive()) { isSubmitting = false; return; }

        if (stageCard) {
          const flyRect = stageCard.getBoundingClientRect();
          stageCard.style.transition = 'none';
          stageCard.style.position = 'fixed';
          stageCard.style.left = flyRect.left + 'px';
          stageCard.style.top = flyRect.top + 'px';
          stageCard.style.right = 'auto';
          stageCard.style.bottom = 'auto';
          stageCard.style.margin = '0';
          stageCard.style.width = flyRect.width + 'px';
          stageCard.style.height = flyRect.height + 'px';
          stageCard.style.zIndex = 'var(--layer-modal, 950)';
          void stageCard.offsetWidth;
          stageCard.style.transition = '';
          stageCard.classList.add('is-flying-in');
        }
        await wait(500);
        if (!isActive()) { isSubmitting = false; return; }

        spawnWhiteoutCurtain();
        window.TransitionLoader?.setNextOverlayDelay?.(2500);
        window.NavigationTransition?.setNextMaskWhite?.(true);
        isSubmitting = false;
        returnAfterLogin(navigate);
      } else {
        if (errorIcon) errorIcon.style.display = 'block';
        if (checkPlayer) checkPlayer.style.display = 'none';
        if (successText) successText.style.display = 'none';
        if (errorText) {
          errorText.style.display = 'block';
          errorText.textContent = formatFriendlyAuthError(taskError.message);
        }

        nextStage(loadingFlex, verifyStage, verifySize, verifySize, 'flex');
        await wait(2400);
        if (!isActive()) { isSubmitting = false; return; }

        stageCard?.classList.remove('is-verifying');
        nextStage(verifyStage, formStage, formW, formH, 'grid');
        await wait(600);
        if (!isActive()) { isSubmitting = false; return; }

        if (stageCard) {
          stageCard.style.width = '';
          stageCard.style.height = '';
        }
        isSubmitting = false;
      }
    }

    window.handleLogin = async function () {
      const email = document.getElementById('login-email')?.value?.trim();
      const pass = document.getElementById('login-password')?.value;
      if (!email || !pass) {
        setInlineError('login-error-msg', '電子信箱和密碼不可為空！');
        return;
      }
      setInlineError('login-error-msg', '');
      await runVerificationFlow({
        loadingMessage: '正在檢查身分訊息...',
        successMessage: '登入成功！歡迎回來',
        task: () => window.spaAuth.login(email, pass)
      });
    };

    window.handleRegister = async function () {
      const name = document.getElementById('register-username')?.value?.trim();
      const email = document.getElementById('register-email')?.value?.trim();
      const pass = document.getElementById('register-password')?.value;
      const pass2 = document.getElementById('register-password-2')?.value;

      if (!name || !email || !pass || !pass2) {
        setInlineError('register-error-msg', '所有欄位皆不可為空！');
        return;
      }
      if (pass !== pass2) {
        setInlineError('register-error-msg', '兩次輸入的密碼不一致！');
        return;
      }
      if (pass.length < 8) {
        setInlineError('register-error-msg', '密碼長度至少需 8 個字元！');
        return;
      }
      setInlineError('register-error-msg', '');

      await runVerificationFlow({
        loadingMessage: '正在建立帳號...',
        successMessage: '註冊成功！已為您自動登入',
        task: () => window.spaAuth.register(name, email, pass)
      });
    };

    window.handleSocialLogin = function () {
      setInlineError('login-error-msg', '第三方登入尚未開放，請使用電子信箱登入。');
    };
    const handlers = ['switchTab', 'togglePwd', 'handleLogin', 'handleRegister', 'handleSocialLogin'];
    const installed = Object.fromEntries(handlers.map(key => [key, window[key]]));
    function unmount() {
      if (disposed) return;
      disposed = true;
      verifyRoseLoader?.stop();
      verifyRoseLoader = null;
      listeners.forEach(off => off());
      timers.forEach(clearTimeout);
      timers.clear();
      panelObserver?.disconnect();
      releaseEffects();
      handlers.forEach(key => { if (window[key] === installed[key]) delete window[key]; });
      signal?.removeEventListener('abort', unmount);
    }
    signal?.addEventListener('abort', unmount, { once: true });
    return { unmount };
  }
  window.AuthPage = { mount };
})();
