(function () {
  'use strict';

  const passwordIds = ["login-password", "register-password", "register-password-2"];

  for (let i = 0; i < passwordIds.length; i++) {
    const input = document.getElementById(passwordIds[i]);
    const showBtn = document.getElementById("showBtn" + (i + 1));

    if (!input || !showBtn) continue;

    showBtn.style.marginLeft = (input.value === "") ? "44dvh" : "36.8dvh";
    input.addEventListener("input", () => {
      showBtn.style.marginLeft = (input.value === "") ? "44dvh" : "36.8dvh";
    });
  }
  const authContent1 = document.getElementById("auth-content-1");
  const authContent2 = document.getElementById("auth-content-2");
  const maxContentHeight = authContent1.offsetHeight;
  authContent2.style.height = maxContentHeight + "px";
})();