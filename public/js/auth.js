// Auth Page JS

// Check if hash is #register on load
window.addEventListener('DOMContentLoaded', () => {
  if (window.location.hash === '#register') {
    switchTab('register');
  }
});

function switchTab(tab) {
  const tabs = document.querySelectorAll('.auth-tab');
  const loginPanel = document.getElementById('panel-login');
  const registerPanel = document.getElementById('panel-register');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginPanel.style.display = 'block';
    registerPanel.style.display = 'none';
  } else {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerPanel.style.display = 'block';
    loginPanel.style.display = 'none';
  }
}

function togglePwd(id, btn) {
  const input = document.getElementById(id);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁';
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

function handleLogin() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  if (!email || !password) {
    showToast('請填寫電子信箱和密碼');
    return;
  }
  showToast('登入中…');
  setTimeout(() => {
    window.location.href = 'dashboard.html';
  }, 1000);
}

function handleRegister() {
  showToast('建立帳號中…');
  setTimeout(() => {
    window.location.href = 'dashboard.html';
  }, 1200);
}

function handleSocialLogin(provider) {
  showToast(`使用 ${provider} 登入中…`);
  setTimeout(() => {
    window.location.href = 'dashboard.html';
  }, 1200);
}
