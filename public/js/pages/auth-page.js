(function () {
  'use strict';
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

    window.switchTab = function (tab) {
      const lp = document.getElementById('panel-login');
      const rp = document.getElementById('panel-register');
      const inner = document.getElementById("auth-inner");
      const tl = document.getElementById('tab-login');
      const tr = document.getElementById('tab-register');
      if (!lp || !rp) return;
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
    if (showRegister) later(() => window.switchTab('register'), 50);

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
        }, 300);
        slash.style.transform = "translateY(-36px)";
        mask.style.transform = "translate(54px, -36px) rotate(45deg)";
      }
      else {
        inp.style.filter = "blur(3px)";
        later(() => {
          inp.style.filter = "blur(0px)";

          inp.type = 'password';
        }, 300);
        slash.style.transform = "translateY(0px)";
        mask.style.transform = "translate(18px, 0px) rotate(45deg)";
      }
    };

    function showToast(msg, duration = 2800) {
      if (window.GlobalToast?.showToast) {
        return window.GlobalToast.showToast(msg, duration);
      }
    }

    window.handleLogin = async function () {
      const email = document.getElementById('login-email')?.value;
      const pass = document.getElementById('login-password')?.value;
      if (!email || !pass) { showToast('電子信箱和密碼不可為空！'); return; }
      showToast('正在驗證中...', 99999);
      try {
        await window.spaAuth.login(email, pass);
        if (!isActive()) return;
        const t = document.getElementById('toast');
        if (t) t.classList.remove('show');
        navigate('dashboard');
      } catch (error) {
        if (isActive()) showToast(error.message);
      }
    };

    window.handleRegister = async function () {
      const name = document.getElementById('register-username')?.value?.trim();
      const email = document.getElementById('register-email')?.value?.trim();
      const pass = document.getElementById('register-password')?.value;
      const pass2 = document.getElementById('register-password-2')?.value;

      if (!name || !email || !pass || !pass2) {
        showToast('所有欄位皆不可為空！');
        return;
      }
      if (pass !== pass2) {
        showToast('兩次輸入的密碼不一致！');
        return;
      }
      if (pass.length < 8) {
        showToast('密碼長度至少需 8 個字元！');
        return;
      }

      showToast('正在註冊中...', 99999);
      try {
        await window.spaAuth.register(name, email, pass);
        if (!isActive()) return;
        showToast('註冊成功！已為您自動登入。');
        navigate('dashboard');
      } catch (error) {
        if (isActive()) showToast(error.message);
      }
    };

    window.handleSocialLogin = function () {
      showToast('第三方登入尚未開放，請使用電子信箱登入。');
    };
    const handlers = ['switchTab', 'togglePwd', 'handleLogin', 'handleRegister', 'handleSocialLogin'];
    const installed = Object.fromEntries(handlers.map(key => [key, window[key]]));
    function unmount() {
      if (disposed) return;
      disposed = true;
      listeners.forEach(off => off());
      timers.forEach(clearTimeout);
      timers.clear();
      releaseEffects();
      handlers.forEach(key => { if (window[key] === installed[key]) delete window[key]; });
      signal?.removeEventListener('abort', unmount);
    }
    signal?.addEventListener('abort', unmount, { once: true });
    return { unmount };
  }
  window.AuthPage = { mount };
})();
