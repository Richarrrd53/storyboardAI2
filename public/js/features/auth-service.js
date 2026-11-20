(function () {
  'use strict';
  let session = 0;
  const userTTL = 15000;
  let userRevision = 0;
  let cachedUser = null;
  let pendingUser = null;
  function validationExpiry(token) {
    let expires = Date.now() + userTTL;
    try {
      const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (Number.isFinite(claims.exp)) expires = Math.min(expires, claims.exp * 1000);
    } catch (_) { /* Opaque tokens still use the short server-validation TTL. */ }
    return expires;
  }
  function invalidateUser() { userRevision++; cachedUser = null; pendingUser = null; cachedCapabilities = null; pendingCapabilities = null; }
  function consumeUser(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.resolve({ valid: true, aborted: true });
    return new Promise(resolve => {
      const abort = () => resolve({ valid: true, aborted: true });
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve).finally(() => signal.removeEventListener('abort', abort));
    });
  }
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
    invalidateUser();
    resetCreationState();
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    clearSpaCache();
  }
  function endSession() {
    session++;
    invalidateUser();
    resetCreationState();
    localStorage.removeItem(AUTH_TOKEN_KEY);
    clearSpaCache();
  }
  window.addEventListener?.('storage', event => { if (event.key === AUTH_TOKEN_KEY || event.key === null) { session++; invalidateUser(); clearSpaCache(); } });
  window.clearSpaCache = clearSpaCache;
  window.spaSeedProjectCache = (id, data) => window.ProjectStore.seedProjectDetail(id, data);
  window.spaInvalidateProjectCache = id => {
    window.ProjectStore.invalidateProjectDetail(id);
    window.ProjectStore.invalidateProjects();
  };
  const AUTH_TOKEN_KEY = 'spa_auth_token';
  const AI_PROVIDER_KEY = 'spa_ai_provider';
  let cachedCapabilities = null;
  let pendingCapabilities = null;

  function normalizeProvider(value) {
    return value === 'openai' ? 'openai' : 'gemini';
  }

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
    invalidateUser,
    fetchUser: (signal, { force = false } = {}) => {
      if (signal?.aborted) return Promise.resolve({ valid: true, aborted: true });
      const requestSession = session;
      const revision = userRevision;
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) { invalidateUser(); return Promise.resolve(null); }
      if (!force && cachedUser?.token === token && cachedUser.session === session && Date.now() < cachedUser.expires) {
        return consumeUser(Promise.resolve(cachedUser.result), signal);
      }
      if (!pendingUser || pendingUser.token !== token || pendingUser.session !== session) {
        const request = { token, session: requestSession };
        // The request belongs to the session, not an individual navigation consumer.
        request.promise = (async () => {
          const stale = () => revision !== userRevision || requestSession !== session || token !== localStorage.getItem(AUTH_TOKEN_KEY);
          try {
            const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
            if (stale()) return { valid: false, stale: true };
            if (!res.ok) {
              cachedUser = null;
              if ([401, 403, 404].includes(res.status)) { endSession(); return { valid: false }; }
              return { valid: true, error: true };
            }
            const data = await res.json();
            if (stale()) return { valid: false, stale: true };
            if (!data.user) return { valid: true, error: true };
            const result = { valid: true, user: data.user };
            if (data.user.aiProvider) {
              try { localStorage.setItem(AI_PROVIDER_KEY, normalizeProvider(data.user.aiProvider)); } catch (_) {}
            }
            cachedUser = { token, session, result, expires: validationExpiry(token) };
            return result;
          } catch (_) { if (stale()) return { valid: false, stale: true }; cachedUser = null; return { valid: true, error: true }; }
          finally { if (pendingUser === request) pendingUser = null; }
        })();
        pendingUser = request;
      }
      return consumeUser(pendingUser.promise, signal);
    },
    fetchProjects: async (signal) => {
      if (window.ProjectStore) {
        const list = await window.ProjectStore.fetchProjects({ signal });
        return list;
      }
      return [];
    },
    getAiProvider: () => {
      const userProvider = cachedUser?.result?.user?.aiProvider;
      if (userProvider === 'gemini' || userProvider === 'openai') return userProvider;
      try {
        return normalizeProvider(localStorage.getItem(AI_PROVIDER_KEY));
      } catch (_) {
        return 'gemini';
      }
    },
    syncAiProviderLocal: (provider) => {
      const next = normalizeProvider(provider);
      if (cachedUser?.result?.user) cachedUser.result.user.aiProvider = next;
      try { localStorage.setItem(AI_PROVIDER_KEY, next); } catch (_) {}
      return next;
    },
    fetchAiCapabilities: async ({ force = false } = {}) => {
      if (!force && cachedCapabilities) return cachedCapabilities;
      if (!pendingCapabilities || force) {
        const token = localStorage.getItem(AUTH_TOKEN_KEY), requestSession = session;
        const pending = fetch('/api/ai/providers', { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} })
          .then(res => res.ok ? res.json() : null)
          .then(data => { if (requestSession !== session || token !== localStorage.getItem(AUTH_TOKEN_KEY)) return null; if (data?.providers) cachedCapabilities = data; return cachedCapabilities; })
          .catch(() => requestSession === session ? cachedCapabilities : null)
          .finally(() => { if (pendingCapabilities === pending) pendingCapabilities = null; });
        pendingCapabilities = pending;
      }
      return pendingCapabilities;
    },
    setAiProvider: async (provider) => {
      const next = normalizeProvider(provider);
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (token) {
        const res = await fetch('/api/user/ai-provider', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ provider: next })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '無法更新 AI 模型設定');
        const saved = normalizeProvider(data.aiProvider || next);
        if (cachedUser?.result?.user) cachedUser.result.user.aiProvider = saved;
        try { localStorage.setItem(AI_PROVIDER_KEY, saved); } catch (_) {}
        return saved;
      }
      try { localStorage.setItem(AI_PROVIDER_KEY, next); } catch (_) {}
      return next;
    }
  };

})();
