(function () {
  'use strict';

  function mount(root = document) {
    const cleanup = [];
    const passwordIds = ["login-password", "register-password", "register-password-2"];

    for (let i = 0; i < passwordIds.length; i++) {
      const input = root.querySelector("#" + passwordIds[i]);
      const showBtn = root.querySelector("#" + "showBtn" + (i + 1));

      if (!input || !showBtn) continue;

      const updateBtnVisibility = () => {
        if (input.value === "") {
          showBtn.style.opacity = "0";
          showBtn.style.pointerEvents = "none";
          showBtn.style.transform = "translateY(-50%) scale(0.8)";
        } else {
          showBtn.style.opacity = "1";
          showBtn.style.pointerEvents = "auto";
          showBtn.style.transform = "translateY(-50%) scale(1)";
        }
      };
      updateBtnVisibility();
      input.addEventListener("input", updateBtnVisibility);
      cleanup.push(() => input.removeEventListener("input", updateBtnVisibility));
    }
    const authContent1 = root.querySelector("#" + "auth-content-1");
    const authContent2 = root.querySelector("#" + "auth-content-2");
    if (authContent1 && authContent2) {
      const syncHeights = () => {
        const h1 = authContent1.scrollHeight;
        const h2 = authContent2.scrollHeight;
        const maxH = Math.max(h1, h2);
        if (maxH > 0 && window.innerWidth > 640) {
          authContent1.style.minHeight = maxH + "px";
          authContent2.style.minHeight = maxH + "px";
        }
      };
      syncHeights();
      window.addEventListener('resize', syncHeights);
      cleanup.push(() => window.removeEventListener('resize', syncHeights));
    }
    const enterFlows = [
      {
        fields: ['#login-email', '#login-password'],
        submit: '#panel-login .btn-primary',
      },
      {
        fields: ['#register-username', '#register-email', '#register-password', '#register-password-2'],
        submit: '#panel-register .btn-primary',
      },
    ];

    enterFlows.forEach(({ fields, submit }) => {
      const inputs = fields.map((sel) => root.querySelector(sel));
      const submitBtn = root.querySelector(submit);
      inputs.forEach((input, idx) => {
        if (!input) return;
        const onKeyDown = (e) => {
          if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
          e.preventDefault();
          const next = inputs.slice(idx + 1).find((el) => el && !el.disabled);
          if (next) {
            next.focus();
          } else {
            submitBtn?.click();
          }
        };
        input.addEventListener('keydown', onKeyDown);
        cleanup.push(() => input.removeEventListener('keydown', onKeyDown));
      });
    });

    return () => cleanup.forEach(off => off());
  }
  window.AuthEffects = { mount };
  if (!window.PageAssetLoader && document.querySelector('#auth-inner')) mount();
})();