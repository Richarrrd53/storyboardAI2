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
})();