/**
 * StoryboardAI — Projects Feature Module
 * 
 * 包含四個核心領域模組：
 * 1. ProjectsApi: 負責專案網路與 REST 端點通訊 (CRUD / Restore / Export / Duplicate)
 * 2. ProjectDeleteQueue: 負責可撤銷刪除佇列 (Optimistic soft-delete, 5s undo timer, flush on navigation)
 * 3. ProjectStore: 唯一專案資料狀態中心與訂閱通知 (Cached list, details, in-flight dedup, subscriptions)
 * 4. ProjectActions: 使用者操作流程協調器 (UI confirm, optimistic updates, rollback on error)
 */

(function (global) {
  'use strict';

  function normalizeTags(tags) {
    return Array.isArray(tags)
      ? Array.from(new Set(tags.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean)))
      : [];
  }

  function getProjectTags(project) {
    return normalizeTags(project && (Array.isArray(project.tags) ? project.tags : project.metadata?.tags));
  }

  // ══════════════════════════════════════════════════════════════
  // 1. ProjectsApi — 網路與資料傳輸層
  // ══════════════════════════════════════════════════════════════
  const ProjectsApi = {
    getAuthToken() {
      if (typeof global !== 'undefined' && global.spaAuth && typeof global.spaAuth.getToken === 'function') {
        const token = global.spaAuth.getToken();
        if (token) return token;
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('spa_auth_token') || '';
      }
      return '';
    },

    async fetchProjects(options = {}) {
      const { signal, includeDeleted = true } = options;
      const token = this.getAuthToken();
      if (!token) {
        return { ok: false, status: 401, error: 'Unauthorized', projects: [] };
      }

      const url = `/api/projects${includeDeleted ? '?include_deleted=true' : ''}`;
      try {
        const res = await fetch(url, {
          signal,
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          return { ok: false, status: res.status, error: `HTTP ${res.status}`, projects: [] };
        }

        const data = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, projects: Array.isArray(data.projects) ? data.projects : [] };
      } catch (err) {
        if (err.name === 'AbortError') {
          return { ok: false, aborted: true, projects: [] };
        }
        return { ok: false, error: err.message, projects: [] };
      }
    },

    async fetchProjectDetail(projectId, options = {}) {
      const { signal } = options;
      const token = this.getAuthToken();
      if (!token) {
        return { ok: false, status: 401, error: 'Unauthorized', project: null };
      }

      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          signal,
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
          return { ok: false, status: res.status, error: `HTTP ${res.status}`, project: null };
        }

        const data = await res.json().catch(() => ({}));
        return { ok: true, status: res.status, project: data.project || null };
      } catch (err) {
        if (err.name === 'AbortError') {
          return { ok: false, aborted: true, project: null };
        }
        return { ok: false, error: err.message, project: null };
      }
    },

    async deleteProject(projectId) {
      const token = this.getAuthToken();
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async restoreProject(projectId) {
      const token = this.getAuthToken();
      try {
        const res = await fetch(`/api/projects/${projectId}/restore`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async renameProject(projectId, title) {
      const token = this.getAuthToken();
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ title })
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async updateProjectTags(projectId, tags) {
      const token = this.getAuthToken();
      const normalizedTags = normalizeTags(tags);
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ tags: normalizedTags })
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, tags: normalizedTags, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async duplicateProject(projectId) {
      const token = this.getAuthToken();
      try {
        const res = await fetch(`/api/projects/${projectId}/duplicate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, project: data.project, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async exportProject(project) {
      if (!project || !project.id) return false;
      const token = this.getAuthToken();
      let projectData = project;

      try {
        const res = await fetch(`/api/projects/${project.id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.project) projectData = data.project;
        }
      } catch (e) {
        // Fallback to project passed in memory
      }

      if (typeof document === 'undefined') return true;

      const jsonStr = JSON.stringify(projectData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeTitle = (project.title || 'storyboard').replace(/[\\/:*?"<>|]/g, '_');
      a.href = url;
      a.download = `${safeTitle}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    }
  };


  // ══════════════════════════════════════════════════════════════
  // 2. ProjectDeleteQueue — 撤銷刪除佇列與計時管理
  // ══════════════════════════════════════════════════════════════
  const ProjectDeleteQueue = {
    epoch: 0,
    pending: new Map(), // projectId -> { id, project, deleteTimer, transitionTimer, status }
    recentlyDeleted: new Set(),
    recentlyRestored: new Set(),
    listeners: new Set(),

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },

    notify(event = {}) {
      for (const fn of this.listeners) {
        try { fn(event); } catch (e) { console.error('DeleteQueue listener error', e); }
      }
    },

    isPending(id) {
      return this.pending.has(id);
    },

    getPending(id) {
      return this.pending.get(id);
    },

    enqueue(project, options = {}) {
      if (!project || !project.id) return null;
      const id = project.id;
      const {
        onTransition,
        onCommit,
        onUndo,
        delay = 5000,
        transitionDelay = 400
      } = options;

      // If already pending, clear old timers first
      if (this.pending.has(id)) {
        const old = this.pending.get(id);
        clearTimeout(old.deleteTimer);
        clearTimeout(old.transitionTimer);
      }

      const entry = {
        epoch: this.epoch,
        id,
        project,
        status: 'pending',
        deleteTimer: null,
        transitionTimer: null,
        onUndo
      };

      if (transitionDelay > 0 && typeof onTransition === 'function') {
        entry.transitionTimer = setTimeout(() => {
          if (entry.status === 'pending') {
            onTransition();
          }
        }, transitionDelay);
      }

      entry.deleteTimer = setTimeout(async () => {
        if (entry.status !== 'pending') return;
        entry.status = 'committing';
        this.pending.delete(id);

        try {
          const res = await ProjectsApi.deleteProject(id);
          if (entry.epoch !== this.epoch) return;
          if (res.ok) {
            entry.status = 'committed';
            project.is_deleted = true;
            this.recentlyDeleted.add(id);
            this.recentlyRestored.delete(id);
            if (typeof onCommit === 'function') onCommit(res);
            this.notify({ type: 'committed', id, project });
          } else {
            entry.status = 'failed';
            console.error('DeleteQueue commit failed:', res.error);
          }
        } catch (err) {
          if (entry.epoch !== this.epoch) return;
          entry.status = 'failed';
          console.error('DeleteQueue commit error:', err);
        }
      }, delay);

      this.pending.set(id, entry);
      this.notify({ type: 'enqueued', id, project });
      return entry;
    },

    undo(id, options = {}) {
      const entry = this.pending.get(id);
      if (!entry) return false;
      if (entry.status !== 'pending') return false;

      entry.status = 'cancelled';
      clearTimeout(entry.deleteTimer);
      clearTimeout(entry.transitionTimer);
      this.pending.delete(id);

      entry.project.is_deleted = false;
      this.recentlyDeleted.delete(id);
      this.recentlyRestored.add(id);

      const onUndo = options.onUndo || entry.onUndo;
      if (typeof onUndo === 'function') onUndo(entry.project);

      this.notify({ type: 'undone', id, project: entry.project });
      return true;
    },

    flushAll() {
      // 導航時觸發：立即取消計時器並提交待刪除操作
      const entries = Array.from(this.pending.values());
      for (const entry of entries) {
        if (entry.status !== 'pending') continue;
        entry.status = 'committing';
        clearTimeout(entry.deleteTimer);
        clearTimeout(entry.transitionTimer);
        this.pending.delete(entry.id);

        entry.project.is_deleted = true;
        this.recentlyDeleted.add(entry.id);
        this.recentlyRestored.delete(entry.id);

        ProjectsApi.deleteProject(entry.id)
          .then(res => {
            if (res.ok) {
              entry.status = 'committed';
            } else {
              console.error('Immediate delete failed on flush:', res.error);
            }
          })
          .catch(err => console.error('Immediate delete failed on flush:', err));
      }
      this.notify({ type: 'flushed' });
    },

    clear() {
      this.epoch++;
      // 登出或重置時：取消所有計時器，不送出 DELETE
      for (const entry of this.pending.values()) {
        clearTimeout(entry.deleteTimer);
        clearTimeout(entry.transitionTimer);
      }
      this.pending.clear();
      this.recentlyDeleted.clear();
      this.recentlyRestored.clear();
      this.notify({ type: 'cleared' });
    }
  };


  // ══════════════════════════════════════════════════════════════
  // 3. ProjectStore — 專案唯一資料中心與快取
  // ══════════════════════════════════════════════════════════════
  const ProjectStore = {
    projects: null,
    projectDetails: {},
    listeners: new Set(),
    inFlightProjectsPromise: null,
    inFlightDetailsPromises: {},
    resetEpoch: 0,
    projectsGeneration: 0,
    detailGenerations: {},
    get generation() {
      return this.resetEpoch + this.projectsGeneration;
    },
    abortController: null,

    _createScopedSignal(callerSignal) {
      if (!this.abortController) {
        this.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      }
      if (!callerSignal) return this.abortController ? this.abortController.signal : null;
      if (!this.abortController) return callerSignal;
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        return AbortSignal.any([callerSignal, this.abortController.signal]);
      }
      const combined = new AbortController();
      if (callerSignal.aborted) combined.abort(callerSignal.reason);
      else if (this.abortController.signal.aborted) combined.abort(this.abortController.signal.reason);
      else {
        const onCallerAbort = () => combined.abort(callerSignal.reason);
        const onStoreAbort = () => combined.abort(this.abortController.signal.reason);
        callerSignal.addEventListener('abort', onCallerAbort, { once: true });
        this.abortController.signal.addEventListener('abort', onStoreAbort, { once: true });
      }
      return combined.signal;
    },

    getProjects() {
      return this.projects;
    },

    getActiveProjects() {
      if (!this.projects) return [];
      return this.projects.filter(p => !p.is_deleted && !ProjectDeleteQueue.isPending(p.id));
    },

    getHistoryProjects() {
      if (!this.projects) return [];
      return this.projects.filter(p => p.is_deleted && !ProjectDeleteQueue.isPending(p.id));
    },

    getProjectDetail(id) {
      return this.projectDetails[id] || null;
    },

    subscribe(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    },

    notify(event = {}) {
      for (const fn of this.listeners) {
        try { fn(this.projects, event); } catch (e) { console.error('ProjectStore listener error', e); }
      }
    },

    setProjects(projectsList) {
      if (Array.isArray(projectsList)) {
        projectsList.forEach(p => {
          p.tags = getProjectTags(p);
        });
        this.projects = projectsList;
      } else {
        this.projects = null;
      }
      this.notify({ type: 'set', projects: this.projects });
    },

    seedProjectDetail(id, data) {
      if (id && data) {
        this.projectDetails[id] = data;
        this.notify({ type: 'detail_seed', id, data });
      }
    },

    invalidateProjects() {
      this.projectsGeneration++;
      this.projects = null;
      this.notify({ type: 'invalidate_list' });
    },

    invalidateProjectDetail(id) {
      if (id) {
        this.detailGenerations[id] = (this.detailGenerations[id] || 0) + 1;
        delete this.projectDetails[id];
        delete this.inFlightDetailsPromises[id];
        this.notify({ type: 'invalidate_detail', id });
      }
    },

    reset() {
      this.resetEpoch++;
      this.projectsGeneration++;
      this.detailGenerations = {};
      if (this.abortController) {
        try { this.abortController.abort(); } catch (e) {}
      }
      this.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      this.projects = null;
      this.projectDetails = {};
      this.inFlightProjectsPromise = null;
      this.inFlightDetailsPromises = {};
      ProjectDeleteQueue.clear();
      this.notify({ type: 'reset' });
    },

    fetchProjects(options = {}) {
      const { signal, force = false } = options;
      if (!force && this.projects && !this.inFlightProjectsPromise) {
        return Promise.resolve(this.projects);
      }
      if (this.inFlightProjectsPromise) {
        return this.inFlightProjectsPromise;
      }

      const reqEpoch = this.resetEpoch;
      const reqProjectsGen = this.projectsGeneration;
      const isStale = () => (reqEpoch !== this.resetEpoch || reqProjectsGen !== this.projectsGeneration);
      const effectiveSignal = this._createScopedSignal(signal);

      const promise = (async () => {
        try {
          const res = await ProjectsApi.fetchProjects({ signal: effectiveSignal, includeDeleted: true });

          // Stale response guard: if reset() or invalidateProjects() happened while request was in-flight, discard!
          if (isStale()) {
            return this.projects || [];
          }

          if (!res.ok) {
            // 保留既有快取，不因單次網路錯誤或 abort 覆寫為空
            return this.projects || [];
          }

          const list = res.projects;
          // 比對最近刪除與還原狀態並正規化標籤
          list.forEach(p => {
            p.tags = getProjectTags(p);
            if (ProjectDeleteQueue.recentlyDeleted.has(p.id)) {
              p.is_deleted = true;
            }
            if (ProjectDeleteQueue.recentlyRestored.has(p.id)) {
              p.is_deleted = false;
            }
          });

          // 伺服器狀態吻合後清除追蹤集合
          list.forEach(p => {
            if (p.is_deleted && ProjectDeleteQueue.recentlyDeleted.has(p.id)) {
              ProjectDeleteQueue.recentlyDeleted.delete(p.id);
            }
            if (!p.is_deleted && ProjectDeleteQueue.recentlyRestored.has(p.id)) {
              ProjectDeleteQueue.recentlyRestored.delete(p.id);
            }
          });

          // Stale response check before mutating store
          if (isStale()) {
            return this.projects || [];
          }

          this.projects = list;
          this.notify({ type: 'loaded', projects: this.projects });
          return this.projects;
        } catch (err) {
          if (isStale()) return this.projects || [];
          if (err.name === 'AbortError') return this.projects || [];
          console.error('ProjectStore.fetchProjects error:', err);
          return this.projects || [];
        } finally {
          if (this.inFlightProjectsPromise === promise) {
            this.inFlightProjectsPromise = null;
          }
        }
      })();

      this.inFlightProjectsPromise = promise;
      return promise;
    },

    fetchProjectDetail(projectId, options = {}) {
      const { signal, force = false } = options;
      if (!force && this.projectDetails[projectId]) {
        return Promise.resolve(this.projectDetails[projectId]);
      }
      if (this.inFlightDetailsPromises[projectId]) {
        return this.inFlightDetailsPromises[projectId];
      }

      const reqEpoch = this.resetEpoch;
      const reqDetailGen = this.detailGenerations[projectId] || 0;
      const isStale = () => (reqEpoch !== this.resetEpoch || reqDetailGen !== (this.detailGenerations[projectId] || 0));
      const effectiveSignal = this._createScopedSignal(signal);

      const promise = (async () => {
        try {
          const res = await ProjectsApi.fetchProjectDetail(projectId, { signal: effectiveSignal });

          // Stale response guard
          if (isStale()) {
            return null;
          }

          if (res.ok && res.project) {
            if (isStale()) return null;
            this.projectDetails[projectId] = res.project;
            this.notify({ type: 'detail_loaded', id: projectId, project: res.project });
            return res.project;
          }
          return null;
        } catch (err) {
          if (isStale()) return null;
          if (err.name === 'AbortError') return this.projectDetails[projectId] || null;
          console.error('ProjectStore.fetchProjectDetail error:', err);
          return null;
        } finally {
          if (this.inFlightDetailsPromises[projectId] === promise) {
            delete this.inFlightDetailsPromises[projectId];
          }
        }
      })();

      this.inFlightDetailsPromises[projectId] = promise;
      return promise;
    }
  };


  // ══════════════════════════════════════════════════════════════
  // 4. ProjectActions — 使用者操作協調與回滾
  // ══════════════════════════════════════════════════════════════
  const ProjectActions = {
    async deleteProject(p, card, refreshCallback) {
      if (!p) return false;
      const requestEpoch = ProjectStore.resetEpoch;
      const confirmFn = typeof global !== 'undefined' && typeof global.confirm === 'function' ? global.confirm : async () => true;
      const isConfirmed = await confirmFn(
        '是否刪除此分鏡？',
        `「${p.title}」將從此頁面上刪除，刪除後的分鏡將會移至「資源回收桶」，您可以在「歷史分鏡」復原`,
        'delete',
        '刪除',
        card
      );
      if (!isConfirmed || requestEpoch !== ProjectStore.resetEpoch) return false;

      if (card && card.style) {
        card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9) translateY(20px)';
      }

      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function'
        ? global.showSpaToast
        : () => {};

      ProjectDeleteQueue.enqueue(p, {
        onTransition: () => {
          if (typeof refreshCallback === 'function') refreshCallback();
          ProjectStore.notify({ type: 'delete_transition', project: p });
        },
        onCommit: async () => {
          await ProjectStore.fetchProjects({ force: true });
          if (requestEpoch !== ProjectStore.resetEpoch) return false;
          toastFn(`分鏡「${p.title}」已移至資源回收桶。`);
          if (typeof refreshCallback === 'function') refreshCallback();
          ProjectStore.notify({ type: 'delete_commit', project: p });
        },
        delay: 5000,
        transitionDelay: 400
      });

      toastFn(`分鏡「${p.title}」已移至資源回收桶。`, () => {
        ProjectDeleteQueue.undo(p.id, {
          onUndo: () => {
            toastFn("分鏡已復原。");
            if (typeof refreshCallback === 'function') refreshCallback();
            ProjectStore.notify({ type: 'undo', project: p });
          }
        });
      }, 5000);

      return true;
    },

    async restoreProject(p, card, refreshCallback) {
      if (!p) return false;
      const requestEpoch = ProjectStore.resetEpoch;
      const confirmFn = typeof global !== 'undefined' && typeof global.confirm === 'function' ? global.confirm : async () => true;
      const isConfirmed = await confirmFn('是否還原此分鏡？', '', 'default', '還原', null);
      if (!isConfirmed || requestEpoch !== ProjectStore.resetEpoch) return false;

      // 樂觀更新
      p.is_deleted = false;
      ProjectDeleteQueue.recentlyRestored.add(p.id);
      ProjectDeleteQueue.recentlyDeleted.delete(p.id);
      if (typeof refreshCallback === 'function') refreshCallback();
      ProjectStore.notify({ type: 'restore_optimistic', project: p });

      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function'
        ? global.showSpaToast
        : () => {};
      toastFn(`分鏡「${p.title}」已還原。`);

      try {
        const res = await ProjectsApi.restoreProject(p.id);
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        if (res.ok) {
          await ProjectStore.fetchProjects({ force: true });
          if (requestEpoch !== ProjectStore.resetEpoch) return false;
          if (typeof refreshCallback === 'function') refreshCallback();
          ProjectStore.notify({ type: 'restore_commit', project: p });
          return true;
        } else {
          throw new Error(res.error || '還原失敗');
        }
      } catch (err) {
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        console.error('Failed to restore project on server', err);
        // 失敗回滾
        p.is_deleted = true;
        ProjectDeleteQueue.recentlyRestored.delete(p.id);
        ProjectDeleteQueue.recentlyDeleted.add(p.id);
        if (typeof refreshCallback === 'function') refreshCallback();
        ProjectStore.notify({ type: 'restore_rollback', project: p });
        if (typeof global !== 'undefined' && typeof global.alert === 'function') {
          global.alert('還原失敗，伺服器出錯');
        }
        return false;
      }
    },

    async renameProject(p, card, refreshCallback) {
      if (!p) return false;
      const requestEpoch = ProjectStore.resetEpoch;
      const promptFn = typeof global !== 'undefined' && typeof global.prompt === 'function'
        ? global.prompt
        : (msg, def) => def;
      const newTitle = promptFn('請輸入新的分鏡名稱：', p.title || '');
      if (newTitle === null) return false;
      const trimmed = newTitle.trim();
      if (!trimmed) {
        if (typeof global !== 'undefined' && typeof global.alert === 'function') {
          global.alert('分鏡名稱不能為空');
        }
        return false;
      }
      if (trimmed === p.title) return false;

      const oldTitle = p.title;
      try {
        const res = await ProjectsApi.renameProject(p.id, trimmed);
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        if (res.ok) {
          p.title = trimmed;
          const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function'
            ? global.showSpaToast
            : () => {};
          toastFn(`分鏡已更名為「${trimmed}」。`);
          await ProjectStore.fetchProjects({ force: true });
          if (requestEpoch !== ProjectStore.resetEpoch) return false;
          if (typeof refreshCallback === 'function') refreshCallback();
          ProjectStore.notify({ type: 'renamed', project: p, oldTitle, newTitle: trimmed });
          return true;
        } else {
          const msg = res.data?.error || '重新命名失敗';
          if (typeof global !== 'undefined' && typeof global.alert === 'function') {
            global.alert(msg);
          }
          return false;
        }
      } catch (err) {
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        console.error('Failed to rename project', err);
        if (typeof global !== 'undefined' && typeof global.alert === 'function') {
          global.alert('重新命名失敗，請稍後再試');
        }
        return false;
      }
    },

    async duplicateProject(p, card, refreshCallback) {
      if (!p) return false;
      const requestEpoch = ProjectStore.resetEpoch;
      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function'
        ? global.showSpaToast
        : () => {};
      toastFn(`正在複製分鏡「${p.title}」...`);

      try {
        const res = await ProjectsApi.duplicateProject(p.id);
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        if (res.ok) {
          await ProjectStore.fetchProjects({ force: true });
          if (requestEpoch !== ProjectStore.resetEpoch) return false;
          if (typeof refreshCallback === 'function') refreshCallback();
          const newTitle = res.project?.title || (p.title + ' (副本)');
          toastFn(`已成功建立「${newTitle}」！`);
          ProjectStore.notify({ type: 'duplicated', original: p, project: res.project });
          return true;
        } else {
          const msg = res.data?.error || '複製分鏡失敗';
          if (typeof global !== 'undefined' && typeof global.alert === 'function') {
            global.alert(msg);
          }
          return false;
        }
      } catch (err) {
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        console.error('Failed to duplicate project', err);
        if (typeof global !== 'undefined' && typeof global.alert === 'function') {
          global.alert('複製分鏡失敗，請稍後再試');
        }
        return false;
      }
    },

    async exportProject(p) {
      if (!p) return false;
      const requestEpoch = ProjectStore.resetEpoch;
      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function'
        ? global.showSpaToast
        : () => {};
      toastFn(`正在準備匯出分鏡「${p.title}」...`);
      try {
        await ProjectsApi.exportProject(p);
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        toastFn(`分鏡「${p.title}」已匯出為 JSON 檔。`);
        return true;
      } catch (err) {
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        console.error('Failed to export project', err);
        if (typeof global !== 'undefined' && typeof global.alert === 'function') {
          global.alert('匯出失敗，請稍後再試');
        }
        return false;
      }
    },

    async updateProjectTags(p, tags, refreshCallback, options = {}) {
      if (!p || !p.id) return false;
      const normalized = normalizeTags(tags);
      const oldTags = getProjectTags(p);
      const requestEpoch = ProjectStore.resetEpoch;
      // Card、清單與詳情快取可能持有不同物件，需一併更新及回滾。
      const targets = Array.from(new Set([
        p,
        ...(ProjectStore.getProjects() || []).filter(project => project.id === p.id),
        ProjectStore.getProjectDetail(p.id)
      ].filter(Boolean)));
      const snapshots = targets.map(project => ({
        project, tags: project.tags, hadTags: Object.prototype.hasOwnProperty.call(project, 'tags'),
        metadata: project.metadata, hadMetadata: Object.prototype.hasOwnProperty.call(project, 'metadata')
      }));
      function applyTags(project, nextTags, serverProject) {
        project.tags = [...nextTags];
        const metadata = project.metadata && typeof project.metadata === 'object' && !Array.isArray(project.metadata)
          ? project.metadata : {};
        project.metadata = { ...metadata, tags: [...nextTags] };
        if (serverProject?.updateAt) project.updateAt = serverProject.updateAt;
      }

      // 讓儲存前已出發的舊清單／詳情請求無法覆蓋這次修改。
      ProjectStore.projectsGeneration++;
      ProjectStore.detailGenerations[p.id] = (ProjectStore.detailGenerations[p.id] || 0) + 1;
      delete ProjectStore.inFlightDetailsPromises[p.id];
      targets.forEach(project => applyTags(project, normalized));

      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function'
        ? global.showSpaToast
        : () => {};

      if (typeof refreshCallback === 'function') refreshCallback();
      ProjectStore.notify({ type: 'tags_updated_optimistic', project: p, tags: normalized, oldTags });

      try {
        const res = await ProjectsApi.updateProjectTags(p.id, normalized);
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        if (res.ok) {
          const serverProject = res.data?.project;
          const savedTags = serverProject && (Array.isArray(serverProject.tags) || Array.isArray(serverProject.metadata?.tags))
            ? getProjectTags(serverProject) : normalized;
          targets.forEach(project => applyTags(project, savedTags, serverProject));
          // 若頁面在儲存期間重新抓取清單，也要更新其目前物件。
          (ProjectStore.getProjects() || []).filter(project => project.id === p.id)
            .forEach(project => applyTags(project, savedTags, serverProject));
          toastFn(`分鏡「${p.title}」標籤已更新。`);
          if (typeof refreshCallback === 'function') refreshCallback();
          ProjectStore.notify({ type: 'tags_updated', project: p, tags: savedTags });
          return true;
        } else {
          throw new Error(res.data?.error || res.error || '更新標籤失敗');
        }
      } catch (err) {
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        console.error('Failed to update project tags on server', err);
        // 失敗回滾
        snapshots.forEach(({ project, tags: previousTags, hadTags, metadata, hadMetadata }) => {
          if (hadTags) project.tags = previousTags;
          else delete project.tags;
          if (hadMetadata) project.metadata = metadata;
          else delete project.metadata;
        });
        if (typeof refreshCallback === 'function') refreshCallback();
        ProjectStore.notify({ type: 'tags_update_rollback', project: p, tags: oldTags });
        if (!options.inlineErrors && typeof global !== 'undefined' && typeof global.alert === 'function') {
          global.alert(err.message || '更新標籤失敗，請稍後再試');
        }
        return false;
      }
    },

    editProjectTags(p, card, refreshCallback) {
      if (!p) return false;
      if (typeof global !== 'undefined' && typeof global.openProjectTagModal === 'function') {
        global.openProjectTagModal(p, async (newTags) => {
          return await ProjectActions.updateProjectTags(p, newTags, refreshCallback, { inlineErrors: true });
        });
        return true;
      }
      return false;
    }
  };


  // ══════════════════════════════════════════════════════════════
  // 5. 連動掛載與導出
  // ══════════════════════════════════════════════════════════════
  // 當刪除佇列狀態變更時，自動通知 ProjectStore
  ProjectDeleteQueue.subscribe(event => {
    ProjectStore.notify({ type: `queue_${event.type}`, ...event });
  });

  const ProjectsFeature = {
    normalizeTags,
    getProjectTags,
    api: ProjectsApi,
    store: ProjectStore,
    deleteQueue: ProjectDeleteQueue,
    actions: ProjectActions
  };

  if (typeof global !== 'undefined') {
    global.ProjectsFeature = ProjectsFeature;
    global.ProjectsApi = ProjectsApi;
    global.ProjectStore = ProjectStore;
    global.ProjectDeleteQueue = ProjectDeleteQueue;
    global.ProjectActions = ProjectActions;
    global.restoreProject = (project, card, refresh) => ProjectActions.restoreProject(project, card, refresh);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectsFeature;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
