(function () {
  'use strict';
  let session = 0;
  function resetCreationState() {
    window.CreationController.reset();
  }
  function clearSpaCache() {
    window.ProjectStore.reset();
    window.PageAssetLoader.clearMemoryCache();
  }
  function establishSession(token) {
    if (!token) throw new Error('伺服器未回傳登入憑證');
    session++;
    resetCreationState();
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    clearSpaCache();
  }
  function endSession() {
    session++;
    resetCreationState();
    localStorage.removeItem(AUTH_TOKEN_KEY);
    clearSpaCache();
  }
  window.clearSpaCache = clearSpaCache;
  window.spaSeedProjectCache = (id, data) => window.ProjectStore.seedProjectDetail(id, data);
  window.spaInvalidateProjectCache = id => {
    window.ProjectStore.invalidateProjectDetail(id);
    window.ProjectStore.invalidateProjects();
  };
  const AUTH_TOKEN_KEY = 'spa_auth_token';

  window.spaAuth = {
    isLoggedIn: () => !!localStorage.getItem(AUTH_TOKEN_KEY),
    getToken: () => localStorage.getItem(AUTH_TOKEN_KEY),
    login: async (email, password) => {
      if (!email || !password) throw new Error('電子信箱和密碼不可為空！');
      const requestSession = session;
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        let errorMsg = '登入失敗';
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = `伺服器回應異常 (${res.status} ${res.statusText})`;
        }
        throw new Error(errorMsg);
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('伺服器回傳非預期的資料格式，請稍後再試');
      }
      if (requestSession !== session) throw new Error("登入已取消，請重新登入");
      establishSession(data.token);
      return data;
    },
    register: async (name, email, pass) => {
      const requestSession = session;
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password: pass })
      });
      if (!res.ok) {
        let errorMsg = '註冊失敗';
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = `伺服器回應異常 (${res.status} ${res.statusText})`;
        }
        throw new Error(errorMsg);
      }
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('伺服器回傳非預期的資料格式，請稍後再試');
      }
      if (requestSession !== session) throw new Error('註冊已取消，請重新登入');
      establishSession(data.token);
      return data;
    },
    logout: async () => {
      endSession();
      const logoutSession = session;
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) { }
      if (logoutSession !== session) return;
      window.location.hash = '';
      if (window.parent && window.parent !== window) {
        window.parent.history.replaceState(null, '', '/');
      }
      const capsule = document.getElementById('global-create-capsule');
      if (capsule) capsule.remove();
      const layer = document.getElementById('ai-creation-layer');
      if (layer) layer.remove();
      document.body.classList.remove('dashboard-layout');
      return window.spaNavigate('landing', { force: true });
    },
    fetchUser: async (signal) => {
      const requestSession = session;
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return null;

      try {
        const res = await fetch('/api/auth/me', {
          signal,
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (requestSession !== session || token !== localStorage.getItem(AUTH_TOKEN_KEY)) return { valid: false, stale: true };
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            endSession();
            return { valid: false };
          }
          return { valid: true, error: true };
        }

        try {
          const data = await res.json();
          if (requestSession !== session) return { valid: false, stale: true };
          return { valid: true, user: data.user };
        } catch {
          return { valid: true, error: true };
        }
      } catch (e) {
        if (e.name === 'AbortError') return { valid: true, aborted: true };
        return { valid: true, error: true };
      }
    },
    fetchProjects: async (signal) => {
      if (window.ProjectStore) {
        const list = await window.ProjectStore.fetchProjects({ signal });
        return list;
      }
      return [];
    }
  };

})();
