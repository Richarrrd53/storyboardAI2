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

  function arraysShallowEqual(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function diffProjectSummary(prev, next) {
    if (prev === next) return { changed: false, changedFields: [] };
    if (!prev || !next) return { changed: true, changedFields: ['*'] };
    const changedFields = [];
    if (String(prev.id) !== String(next.id)) changedFields.push('id');
    if ((prev.title || '') !== (next.title || '')) changedFields.push('title');
    if ((prev.ratio || '') !== (next.ratio || '')) changedFields.push('ratio');
    if ((prev.style || '') !== (next.style || '')) changedFields.push('style');
    if (Boolean(prev.is_deleted) !== Boolean(next.is_deleted)) changedFields.push('is_deleted');
    if ((prev.deletedAt || null) !== (next.deletedAt || null)) changedFields.push('deletedAt');
    if ((prev.cover || '') !== (next.cover || '')) changedFields.push('cover');
    const prevShotsCount = Number(prev.shotCount ?? prev.shotsCount ?? (Array.isArray(prev.shots) ? prev.shots.length : 0)) || 0;
    const nextShotsCount = Number(next.shotCount ?? next.shotsCount ?? (Array.isArray(next.shots) ? next.shots.length : 0)) || 0;
    if (prevShotsCount !== nextShotsCount) changedFields.push('shotCount');
    if ((prev.updateAt || prev.updatedAt || '') !== (next.updateAt || next.updatedAt || '')) changedFields.push('updateAt');
    if (!arraysShallowEqual(getProjectTags(prev), getProjectTags(next))) changedFields.push('tags');
    const prevPreview = Array.isArray(prev.previewImages) ? prev.previewImages[0] || '' : '';
    const nextPreview = Array.isArray(next.previewImages) ? next.previewImages[0] || '' : '';
    if (prevPreview !== nextPreview) changedFields.push('previewImages');
    const prevRet = prev.retention;
    const nextRet = next.retention;
    if (Boolean(prevRet?.isExpired) !== Boolean(nextRet?.isExpired) ||
        Boolean(prevRet?.pendingCleanup) !== Boolean(nextRet?.pendingCleanup) ||
        (prevRet?.remainingMs ?? null) !== (nextRet?.remainingMs ?? null)) {
      changedFields.push('retention');
    }
    return { changed: changedFields.length > 0, changedFields };
  }

  function diffProjectList(prevList, nextList) {
    if (prevList === nextList) {
      return { changed: false, addedIds: [], removedIds: [], updatedIds: [], reordered: false };
    }
    if (!Array.isArray(prevList) || !Array.isArray(nextList)) {
      return {
        changed: prevList !== nextList,
        addedIds: Array.isArray(nextList) ? nextList.map(p => String(p.id)) : [],
        removedIds: Array.isArray(prevList) ? prevList.map(p => String(p.id)) : [],
        updatedIds: [],
        reordered: false
      };
    }
    const prevMap = new Map();
    const prevOrder = [];
    for (let i = 0; i < prevList.length; i++) {
      const id = String(prevList[i].id);
      prevMap.set(id, prevList[i]);
      prevOrder.push(id);
    }
    const addedIds = [];
    const updatedIds = [];
    const nextIds = new Set();
    let reordered = false;
    let prevOrderIdx = 0;
    for (let i = 0; i < nextList.length; i++) {
      const p = nextList[i];
      const id = String(p.id);
      nextIds.add(id);
      const oldP = prevMap.get(id);
      if (!oldP) {
        addedIds.push(id);
      } else {
        if (diffProjectSummary(oldP, p).changed) {
          updatedIds.push(id);
        }
        while (prevOrderIdx < prevOrder.length && !nextIds.has(prevOrder[prevOrderIdx]) && !nextList.some(x => String(x.id) === prevOrder[prevOrderIdx])) {
          prevOrderIdx++;
        }
        if (prevOrder[prevOrderIdx] === id) {
          prevOrderIdx++;
        } else {
          reordered = true;
        }
      }
    }
    const removedIds = [];
    for (const id of prevMap.keys()) {
      if (!nextIds.has(id)) removedIds.push(id);
    }
    const changed = addedIds.length > 0 || removedIds.length > 0 || updatedIds.length > 0 || reordered;
    return { changed, addedIds, removedIds, updatedIds, reordered };
  }

  function isShotEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (String(a.id) !== String(b.id)) return false;
    if ((a.order ?? null) !== (b.order ?? null)) return false;
    if ((a.title || '') !== (b.title || '')) return false;
    if ((a.camera || '') !== (b.camera || '')) return false;
    if ((a.duration || '') !== (b.duration || '')) return false;
    if ((a.emotion || '') !== (b.emotion || '')) return false;
    const pa = a.payload || {};
    const pb = b.payload || {};
    if ((pa.image || '') !== (pb.image || '')) return false;
    if ((pa.imageRef || '') !== (pb.imageRef || '')) return false;
    if ((pa.emotion || '') !== (pb.emotion || '')) return false;
    if ((pa.shotPrompt || '') !== (pb.shotPrompt || '')) return false;
    if ((pa.prompt || '') !== (pb.prompt || '')) return false;
    if ((pa.finalPrompt || '') !== (pb.finalPrompt || '')) return false;
    const ca = pa.cameraDetails || {};
    const cb = pb.cameraDetails || {};
    if ((ca.size || '') !== (cb.size || '') || (ca.angle || '') !== (cb.angle || '') || (ca.movement || '') !== (cb.movement || '')) {
      return false;
    }
    const ha = Array.isArray(pa.imageHistory) ? pa.imageHistory : [];
    const hb = Array.isArray(pb.imageHistory) ? pb.imageHistory : [];
    if (ha.length !== hb.length) return false;
    for (let i = 0; i < ha.length; i++) {
      if ((ha[i]?.image || '') !== (hb[i]?.image || '') || (ha[i]?.imageRef || '') !== (hb[i]?.imageRef || '')) {
        return false;
      }
    }
    return true;
  }

  function diffProjectDetail(prev, next) {
    if (prev === next) {
      return {
        changed: false,
        changedFields: [],
        headerChanged: false,
        shotsChanged: false,
        addedShotIds: [],
        removedShotIds: [],
        updatedShotIds: [],
        reordered: false
      };
    }
    if (!prev || !next) {
      const nextShots = Array.isArray(next?.shots) ? next.shots : [];
      return {
        changed: true,
        changedFields: ['*'],
        headerChanged: true,
        shotsChanged: true,
        addedShotIds: nextShots.map(s => String(s.id)),
        removedShotIds: [],
        updatedShotIds: [],
        reordered: false
      };
    }

    const changedFields = [];
    if ((prev.title || '') !== (next.title || '')) changedFields.push('title');
    if ((prev.ratio || '') !== (next.ratio || '')) changedFields.push('ratio');
    if ((prev.style || '') !== (next.style || '')) changedFields.push('style');
    if ((prev.updatedAt || prev.updateAt || '') !== (next.updatedAt || next.updateAt || '')) changedFields.push('updatedAt');
    if ((prev.cover || '') !== (next.cover || '')) changedFields.push('cover');
    if (Boolean(prev.is_deleted) !== Boolean(next.is_deleted)) changedFields.push('is_deleted');
    if (!arraysShallowEqual(getProjectTags(prev), getProjectTags(next))) changedFields.push('tags');
    const headerChanged = changedFields.length > 0;

    const prevShots = Array.isArray(prev.shots) ? prev.shots : [];
    const nextShots = Array.isArray(next.shots) ? next.shots : [];
    const prevShotMap = new Map();
    for (let i = 0; i < prevShots.length; i++) {
      prevShotMap.set(String(prevShots[i].id), { shot: prevShots[i], index: i });
    }
    const addedShotIds = [];
    const updatedShotIds = [];
    const nextShotIds = new Set();
    let reordered = false;
    let lastPrevIndex = -1;

    for (let i = 0; i < nextShots.length; i++) {
      const s = nextShots[i];
      const id = String(s.id);
      nextShotIds.add(id);
      const prevEntry = prevShotMap.get(id);
      if (!prevEntry) {
        addedShotIds.push(id);
      } else {
        if (!isShotEqual(prevEntry.shot, s)) {
          updatedShotIds.push(id);
        }
        if (prevEntry.index < lastPrevIndex) {
          reordered = true;
        }
        lastPrevIndex = prevEntry.index;
      }
    }
    const removedShotIds = [];
    for (const id of prevShotMap.keys()) {
      if (!nextShotIds.has(id)) removedShotIds.push(id);
    }

    const shotsChanged = addedShotIds.length > 0 || removedShotIds.length > 0 || updatedShotIds.length > 0 || reordered;
    if (shotsChanged) changedFields.push('shots');
    return {
      changed: headerChanged || shotsChanged,
      changedFields,
      headerChanged,
      shotsChanged,
      addedShotIds,
      removedShotIds,
      updatedShotIds,
      reordered
    };
  }

  function estimateProjectBytes(project) {
    if (!project || typeof project !== 'object') return 0;
    let bytes = 512 + (project.title ? project.title.length * 2 : 0) + (project.cover ? project.cover.length * 2 : 0);
    const shots = Array.isArray(project.shots) ? project.shots : [];
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      if (!s) continue;
      bytes += 256 + (s.title ? s.title.length * 2 : 0);
      const p = s.payload;
      if (p) {
        if (typeof p.image === 'string') bytes += p.image.length * 2;
        if (typeof p.shotPrompt === 'string') bytes += p.shotPrompt.length * 2;
        if (typeof p.finalPrompt === 'string') bytes += p.finalPrompt.length * 2;
        if (Array.isArray(p.imageHistory)) {
          for (let j = 0; j < p.imageHistory.length; j++) {
            const h = p.imageHistory[j];
            bytes += 128 + (h?.image ? h.image.length * 2 : 0) + (h?.prompt ? h.prompt.length * 2 : 0);
          }
        }
      }
    }
    return bytes;
  }

  const DETAIL_EVENT_TYPES = new Set([
    'detail_loaded',
    'detail_seed',
    'detail_prefetched',
    'invalidate_detail',
    'evict_detail'
  ]);

  function resolveEventScope(event) {
    if (event?.scope) return event.scope;
    const type = event?.type || '';
    if (type === 'reset') return 'session';
    if (DETAIL_EVENT_TYPES.has(type)) return 'detail';
    return 'list';
  }

  function waitForConsumer(promise, signal, abortValue) {
    if (!signal) return promise;
    if (signal.aborted) return Promise.resolve(abortValue);
    return new Promise((resolve, reject) => {
      const onAbort = () => resolve(abortValue);
      signal.addEventListener('abort', onAbort, { once: true });
      promise.then(resolve, reject).finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    });
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

    async permanentDeleteProject(projectId) {
      const token = this.getAuthToken();
      try {
        const res = await fetch(`/api/projects/${projectId}/permanent`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async batchTrashProjects(projectIds) {
      const token = this.getAuthToken();
      try {
        const res = await fetch('/api/projects/batch/trash', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ projectIds })
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async batchRestoreProjects(projectIds, options = {}) {
      const token = this.getAuthToken();
      try {
        const res = await fetch('/api/projects/batch/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(options.all ? { all: true } : { projectIds })
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async batchPermanentDeleteProjects(projectIds) {
      const token = this.getAuthToken();
      try {
        const res = await fetch('/api/projects/batch/permanent-delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ projectIds })
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },

    async emptyTrash() {
      const token = this.getAuthToken();
      try {
        const res = await fetch('/api/projects/trash/empty', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ confirm: true })
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
      if (typeof global !== 'undefined' && global.StoryboardExport && typeof global.StoryboardExport.exportJson === 'function') {
        const res = await global.StoryboardExport.exportJson({ projectId: project.id, project }, { silent: true });
        if (!res.ok && !res.aborted) {
          throw new Error(res.error || '無法取得完整專案資料，請稍後重試。');
        }
        return Boolean(res.ok);
      }

      const token = this.getAuthToken();
      if (!token) throw new Error('請先登入後再匯出此專案。');

      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        cache: 'no-store',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('無法取得完整專案資料，請稍後重試。');
      }
      const data = await res.json().catch(() => null);
      if (!data?.project || !Array.isArray(data.project.shots)) {
        throw new Error('伺服器回傳的專案資料不完整，無法匯出。');
      }

      if (typeof document === 'undefined') return true;

      const jsonStr = JSON.stringify(data.project, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safeTitle = (data.project.title || 'storyboard').replace(/[\\/:*?"<>|]/g, '_');
      a.href = url;
      a.download = `${safeTitle}_storyboard.json`;
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
  // 3. ProjectStore — 專案唯一資料中心與快取 (Bounded LRU + Scoped Events)
  // ══════════════════════════════════════════════════════════════
  const ProjectStore = {
    projects: null,
    projectDetails: {},
    listeners: new Set(),
    _listenerOptions: new WeakMap(),
    inFlightProjectsPromise: null,
    inFlightDetailsPromises: {},
    _inFlightDetailMeta: {},
    resetEpoch: 0,
    projectsGeneration: 0,
    detailGenerations: {},
    listRevision: 0,
    detailRevisions: {},
    detailCacheMaxEntries: 8,
    detailCacheMaxBytes: 24 * 1024 * 1024,
    prefetchTtlMs: 90 * 1000,
    _detailMeta: new Map(), // id -> { fetchedAt, lastAccessedAt, estimatedBytes, source, revision }
    _pinnedDetails: new Map(), // id -> refCount
    _cacheStats: { hits: 0, misses: 0, evictions: 0, notifyCount: 0 },
    get generation() {
      return this.resetEpoch + this.projectsGeneration;
    },
    abortController: null,

    _getSessionSignal() {
      if (!this.abortController) {
        this.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      }
      return this.abortController ? this.abortController.signal : null;
    },

    _createScopedSignal(callerSignal) {
      const sessionSignal = this._getSessionSignal();
      if (!callerSignal) return sessionSignal;
      if (!sessionSignal) return callerSignal;
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        return AbortSignal.any([callerSignal, sessionSignal]);
      }
      const combined = new AbortController();
      if (callerSignal.aborted) combined.abort(callerSignal.reason);
      else if (sessionSignal.aborted) combined.abort(sessionSignal.reason);
      else {
        const onCallerAbort = () => combined.abort(callerSignal.reason);
        const onStoreAbort = () => combined.abort(sessionSignal.reason);
        callerSignal.addEventListener('abort', onCallerAbort, { once: true });
        sessionSignal.addEventListener('abort', onStoreAbort, { once: true });
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
      if (!id) return null;
      const detail = this.projectDetails[id] || null;
      if (detail) {
        this._touchDetail(id);
      }
      return detail;
    },

    isDetailPinned(id) {
      return Boolean(id && (this._pinnedDetails.get(String(id)) || 0) > 0);
    },

    pinProjectDetail(id) {
      if (!id) return () => {};
      const key = String(id);
      this._pinnedDetails.set(key, (this._pinnedDetails.get(key) || 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.unpinProjectDetail(key);
      };
    },

    unpinProjectDetail(id) {
      if (!id) return;
      const key = String(id);
      const count = (this._pinnedDetails.get(key) || 0) - 1;
      if (count <= 0) {
        this._pinnedDetails.delete(key);
        this._evictDetailsIfNeeded();
      } else {
        this._pinnedDetails.set(key, count);
      }
    },

    _touchDetail(id) {
      const key = String(id);
      const meta = this._detailMeta.get(key);
      if (meta) {
        meta.lastAccessedAt = Date.now();
        // Refresh insertion order for O(1) LRU iteration
        this._detailMeta.delete(key);
        this._detailMeta.set(key, meta);
      }
    },

    _recordDetail(id, project, source = 'fetch') {
      const key = String(id);
      const now = Date.now();
      const revision = (this.detailRevisions[key] || 0) + 1;
      this.detailRevisions[key] = revision;
      this.projectDetails[key] = project;
      const estimatedBytes = estimateProjectBytes(project);
      this._detailMeta.delete(key);
      this._detailMeta.set(key, {
        fetchedAt: now,
        lastAccessedAt: now,
        estimatedBytes,
        source,
        revision
      });
      this._evictDetailsIfNeeded(key);
      return revision;
    },

    _getEstimatedDetailBytes() {
      let total = 0;
      for (const meta of this._detailMeta.values()) {
        total += meta.estimatedBytes || 0;
      }
      return total;
    },

    _evictDetailsIfNeeded(excludeId = null) {
      const excludeKey = excludeId ? String(excludeId) : null;
      const now = Date.now();

      // Pass 1: Evict expired prefetch-only entries first if over budget
      const overBudget = () =>
        this._detailMeta.size > this.detailCacheMaxEntries ||
        this._getEstimatedDetailBytes() > this.detailCacheMaxBytes;

      if (!overBudget()) return;

      for (const [key, meta] of Array.from(this._detailMeta.entries())) {
        if (!overBudget()) break;
        if (key === excludeKey || this.isDetailPinned(key)) continue;
        if (meta.source === 'prefetch' && (now - meta.fetchedAt) >= this.prefetchTtlMs) {
          this._evictDetailKey(key);
        }
      }

      // Pass 2: Evict least-recently-used unpinned entries
      for (const key of Array.from(this._detailMeta.keys())) {
        if (!overBudget()) break;
        if (key === excludeKey || this.isDetailPinned(key)) continue;
        this._evictDetailKey(key);
      }
    },

    _evictDetailKey(key) {
      if (!Object.prototype.hasOwnProperty.call(this.projectDetails, key)) {
        this._detailMeta.delete(key);
        return;
      }
      delete this.projectDetails[key];
      this._detailMeta.delete(key);
      this._cacheStats.evictions++;
      this.notify({
        type: 'evict_detail',
        scope: 'detail',
        id: key,
        projectId: key,
        source: 'cache',
        changed: false
      });
    },

    getCacheStats() {
      return {
        listCount: Array.isArray(this.projects) ? this.projects.length : 0,
        detailCount: Object.keys(this.projectDetails).length,
        maxDetailEntries: this.detailCacheMaxEntries,
        estimatedBytes: this._getEstimatedDetailBytes(),
        maxBytes: this.detailCacheMaxBytes,
        pinnedIds: Array.from(this._pinnedDetails.keys()),
        hits: this._cacheStats.hits,
        misses: this._cacheStats.misses,
        evictions: this._cacheStats.evictions,
        notifyCount: this._cacheStats.notifyCount,
        listenerCount: this.listeners.size
      };
    },

    subscribe(fn, options = null) {
      if (typeof fn !== 'function') return () => {};
      this.listeners.add(fn);
      if (options && typeof options === 'object') {
        this._listenerOptions.set(fn, options);
      } else {
        this._listenerOptions.delete(fn);
      }
      return () => {
        this.listeners.delete(fn);
        this._listenerOptions.delete(fn);
      };
    },

    notify(event = {}) {
      const scope = resolveEventScope(event);
      const projectId = event.projectId ?? event.id ?? event.project?.id ?? event.data?.id ?? null;
      const project = event.project ?? event.data ?? null;
      const normalized = {
        ...event,
        scope,
        id: event.id ?? projectId,
        projectId,
        project,
        data: event.data ?? project,
        changed: event.changed !== undefined ? Boolean(event.changed) : true,
        changedFields: Array.isArray(event.changedFields) ? event.changedFields : [],
        source: event.source || 'mutation',
        revision: event.revision ?? (scope === 'detail' && projectId ? (this.detailRevisions[String(projectId)] || 0) : this.listRevision)
      };

      this._cacheStats.notifyCount++;

      for (const fn of this.listeners) {
        const opts = this._listenerOptions.get(fn);
        if (opts) {
          if (Array.isArray(opts.scopes) && !opts.scopes.includes(normalized.scope)) continue;
          if (opts.projectId && normalized.scope === 'detail' && String(normalized.projectId) !== String(opts.projectId)) continue;
          if (opts.ignorePrefetch && (normalized.type === 'detail_prefetched' || normalized.source === 'prefetch')) continue;
          if (opts.ignoreEviction && normalized.type === 'evict_detail') continue;
          if (opts.ignoreUnchanged && normalized.changed === false && normalized.type !== 'reset' && normalized.type !== 'invalidate_list' && normalized.type !== 'invalidate_detail') continue;
        }
        try { fn(this.projects, normalized); } catch (e) { console.error('ProjectStore listener error', e); }
      }
    },

    setProjects(projectsList) {
      const prev = this.projects;
      if (Array.isArray(projectsList)) {
        projectsList.forEach(p => {
          p.tags = getProjectTags(p);
        });
        this.projects = projectsList;
      } else {
        this.projects = null;
      }
      const diff = diffProjectList(prev, this.projects);
      if (diff.changed) this.listRevision++;
      this.notify({
        type: 'set',
        scope: 'list',
        projects: this.projects,
        changed: diff.changed,
        diff,
        source: 'seed',
        revision: this.listRevision
      });
    },

    upsertProject(project, options = {}) {
      if (!project || !project.id) return null;
      project.tags = getProjectTags(project);
      if (!Array.isArray(this.projects)) {
        this.projects = [project];
        this.listRevision++;
        this.notify({
          type: 'project_upserted',
          scope: 'list',
          id: project.id,
          projectId: project.id,
          project,
          changed: true,
          source: options.source || 'mutation',
          revision: this.listRevision
        });
        return project;
      }
      const idx = this.projects.findIndex(item => String(item.id) === String(project.id));
      let changed = true;
      let changedFields = ['*'];
      if (idx !== -1) {
        const diff = diffProjectSummary(this.projects[idx], project);
        changed = diff.changed;
        changedFields = diff.changedFields;
        this.projects[idx] = { ...this.projects[idx], ...project, tags: project.tags };
      } else {
        this.projects.unshift(project);
      }
      if (changed) this.listRevision++;
      if (!options.silent) {
        this.notify({
          type: 'project_upserted',
          scope: 'list',
          id: project.id,
          projectId: project.id,
          project: idx !== -1 ? this.projects[idx] : project,
          changed,
          changedFields,
          source: options.source || 'mutation',
          revision: this.listRevision
        });
      }
      return idx !== -1 ? this.projects[idx] : project;
    },

    seedProjectDetail(id, data, options = {}) {
      if (id && data) {
        const key = String(id);
        const prev = this.projectDetails[key] || null;
        const diff = diffProjectDetail(prev, data);
        const source = options.source || 'seed';
        const revision = this._recordDetail(key, data, source);
        this.notify({
          type: 'detail_seed',
          scope: 'detail',
          id: key,
          projectId: key,
          data,
          project: data,
          changed: diff.changed,
          changedFields: diff.changedFields,
          diff,
          source,
          revision
        });
      }
    },

    invalidateProjects() {
      this.projectsGeneration++;
      this.listRevision++;
      this.projects = null;
      this.notify({
        type: 'invalidate_list',
        scope: 'list',
        source: 'cache',
        changed: true,
        revision: this.listRevision
      });
    },

    invalidateProjectDetail(id) {
      if (id) {
        const key = String(id);
        this.detailGenerations[key] = (this.detailGenerations[key] || 0) + 1;
        delete this.projectDetails[key];
        this._detailMeta.delete(key);
        delete this.inFlightDetailsPromises[key];
        delete this._inFlightDetailMeta[key];
        this.notify({
          type: 'invalidate_detail',
          scope: 'detail',
          id: key,
          projectId: key,
          source: 'cache',
          changed: true
        });
      }
    },

    reset() {
      this.resetEpoch++;
      this.projectsGeneration++;
      this.listRevision++;
      this.detailGenerations = {};
      this.detailRevisions = {};
      if (this.abortController) {
        try { this.abortController.abort(); } catch (e) {}
      }
      this.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      this.projects = null;
      this.projectDetails = {};
      this._detailMeta.clear();
      this._pinnedDetails.clear();
      this.inFlightProjectsPromise = null;
      this.inFlightDetailsPromises = {};
      this._inFlightDetailMeta = {};
      ProjectDeleteQueue.clear();
      this.notify({ type: 'reset', scope: 'session', source: 'reset', changed: true });
    },

    fetchProjects(options = {}) {
      const { signal, force = false, source = 'fetch' } = options;
      if (!force && this.projects && !this.inFlightProjectsPromise) {
        this._cacheStats.hits++;
        return Promise.resolve(this.projects);
      }
      if (this.inFlightProjectsPromise) {
        return waitForConsumer(this.inFlightProjectsPromise, signal, this.projects || []);
      }

      this._cacheStats.misses++;
      const reqEpoch = this.resetEpoch;
      const reqProjectsGen = this.projectsGeneration;
      const isStale = () => (reqEpoch !== this.resetEpoch || reqProjectsGen !== this.projectsGeneration);
      const sessionSignal = this._getSessionSignal();

      const promise = (async () => {
        try {
          const res = await ProjectsApi.fetchProjects({ signal: sessionSignal, includeDeleted: true });

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

          const prev = this.projects;
          const diff = diffProjectList(prev, list);
          this.projects = list;
          if (diff.changed || !prev) this.listRevision++;
          this.notify({
            type: 'loaded',
            scope: 'list',
            projects: this.projects,
            changed: diff.changed || !prev,
            diff,
            source,
            revision: this.listRevision
          });
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
      return waitForConsumer(promise, signal, this.projects || []);
    },

    fetchProjectDetail(projectId, options = {}) {
      if (!projectId) return Promise.resolve(null);
      const key = String(projectId);
      const { signal, force = false, prefetch = false, source = prefetch ? 'prefetch' : 'fetch' } = options;
      if (!force && this.projectDetails[key]) {
        this._cacheStats.hits++;
        this._touchDetail(key);
        return Promise.resolve(this.projectDetails[key]);
      }
      if (this.inFlightDetailsPromises[key]) {
        // Promote an in-flight prefetch to a normal fetch when a real consumer awaits it
        if (!prefetch && this._inFlightDetailMeta[key]?.prefetch) {
          this._inFlightDetailMeta[key].prefetch = false;
          this._inFlightDetailMeta[key].source = source || 'fetch';
        }
        return waitForConsumer(this.inFlightDetailsPromises[key], signal, this.projectDetails[key] || null);
      }

      this._cacheStats.misses++;
      const reqEpoch = this.resetEpoch;
      const reqDetailGen = this.detailGenerations[key] || 0;
      const isStale = () => (reqEpoch !== this.resetEpoch || reqDetailGen !== (this.detailGenerations[key] || 0));
      const sessionSignal = this._getSessionSignal();
      const flightMeta = { prefetch: Boolean(prefetch), source };
      this._inFlightDetailMeta[key] = flightMeta;

      const promise = (async () => {
        try {
          const res = await ProjectsApi.fetchProjectDetail(key, { signal: sessionSignal });

          // Stale response guard
          if (isStale()) {
            return null;
          }

          if (res.ok && res.project) {
            if (isStale()) return null;
            const prev = this.projectDetails[key] || null;
            const diff = diffProjectDetail(prev, res.project);
            const effectiveSource = flightMeta.prefetch ? 'prefetch' : (prev && force ? 'swr' : flightMeta.source);
            const revision = this._recordDetail(key, res.project, effectiveSource);
            const eventType = flightMeta.prefetch ? 'detail_prefetched' : 'detail_loaded';
            this.notify({
              type: eventType,
              scope: 'detail',
              id: key,
              projectId: key,
              project: res.project,
              data: res.project,
              changed: diff.changed,
              changedFields: diff.changedFields,
              diff,
              source: effectiveSource,
              revision
            });
            return res.project;
          }
          return null;
        } catch (err) {
          if (isStale()) return null;
          if (err.name === 'AbortError') return this.projectDetails[key] || null;
          console.error('ProjectStore.fetchProjectDetail error:', err);
          return null;
        } finally {
          if (this.inFlightDetailsPromises[key] === promise) {
            delete this.inFlightDetailsPromises[key];
            delete this._inFlightDetailMeta[key];
          }
        }
      })();

      this.inFlightDetailsPromises[key] = promise;
      return waitForConsumer(promise, signal, this.projectDetails[key] || null);
    }
  };


  // ══════════════════════════════════════════════════════════════
  // 4. ProjectActions — 使用者操作協調與回滾
  // ══════════════════════════════════════════════════════════════
  const restoreOperations = new Map();
  const renameOperations = new Map();
  const ProjectActions = {
    async deleteProject(p, card, refreshCallback) {
      if (!p) return false;
      const requestEpoch = ProjectStore.resetEpoch;
      const confirmFn = typeof global !== 'undefined' && typeof global.confirm === 'function' ? global.confirm : async () => true;
      const isConfirmed = await confirmFn(
        '是否刪除此分鏡？',
        `「${p.title}」將從此頁面上刪除，刪除後的分鏡將會移至「資源回收桶」，您可以在「資源回收桶」復原`,
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

    restoreProject(p, card, refreshCallback) {
      if (!p) return Promise.resolve(false);
      const key = `${ProjectStore.resetEpoch}:${p.id}`;
      if (restoreOperations.has(key)) return restoreOperations.get(key);
      const task = (async () => {
        const requestEpoch = ProjectStore.resetEpoch;
        const confirmFn = typeof global !== 'undefined' && typeof global.confirm === 'function' ? global.confirm : async () => false;
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
      })();
      restoreOperations.set(key, task);
      const cleanup = () => { if (restoreOperations.get(key) === task) restoreOperations.delete(key); };
      task.then(cleanup, cleanup);
      return task;
    },

    renameProject(p, card, refreshCallback) {
      if (!p) return Promise.resolve(false);
      const key = `${ProjectStore.resetEpoch}:${p.id}`;
      if (renameOperations.has(key)) return renameOperations.get(key);
      const task = (async () => {
        const requestEpoch = ProjectStore.resetEpoch;
        const service = global.DialogService || await global.ensureDialogService?.();
        if (!service) throw new Error('Dialog Service is unavailable');
        const oldTitle = p.title;
        let changed = false;
        const result = await service.prompt({
          title: '重新命名分鏡',
          description: '為這份分鏡取一個清楚、好辨識的名稱。',
          label: '分鏡名稱',
          value: p.title || '',
          confirmText: '儲存名稱',
          returnFocus: card?.querySelector?.('.project-option-btn'),
          validate: value => value.trim() ? '' : '分鏡名稱不能為空',
          onSubmit: async value => {
            if (requestEpoch !== ProjectStore.resetEpoch) throw new Error('工作階段已變更，請重新開啟專案');
            const trimmed = value.trim();
            if (trimmed === p.title) return;
            const res = await ProjectsApi.renameProject(p.id, trimmed);
            if (requestEpoch !== ProjectStore.resetEpoch) throw new Error('工作階段已變更，請重新開啟專案');
            if (!res.ok) throw new Error(res.data?.error || res.error || '重新命名失敗，請稍後再試');
            p.title = trimmed;
            await ProjectStore.fetchProjects({ force: true });
            if (requestEpoch !== ProjectStore.resetEpoch) return;
            changed = true;
            if (typeof refreshCallback === 'function') refreshCallback();
            ProjectStore.notify({ type: 'renamed', project: p, oldTitle, newTitle: trimmed });
          }
        });
        if (!result.confirmed || !changed || requestEpoch !== ProjectStore.resetEpoch) return false;
        global.showSpaToast?.(`分鏡已更名為「${p.title}」。`);
        return true;
      })().catch(err => { console.error('Failed to rename project', err); return false; });
      renameOperations.set(key, task);
      const cleanup = () => { if (renameOperations.get(key) === task) renameOperations.delete(key); };
      task.then(cleanup, cleanup);
      return task;
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

    async exportProject(p, options = {}) {
      if (!p) return false;
      if (typeof global !== 'undefined' && global.StoryboardExport) {
        if (options?.format === 'pdf' && typeof global.StoryboardExport.openPdfSettings === 'function') {
          return global.StoryboardExport.openPdfSettings({ projectId: p.id, project: p }, options);
        }
        if (options?.trigger && typeof global.StoryboardExport.openExportMenu === 'function') {
          return global.StoryboardExport.openExportMenu(options.trigger, { projectId: p.id, project: p }, options);
        }
        if (typeof global.StoryboardExport.exportJson === 'function') {
          const res = await global.StoryboardExport.exportJson({ projectId: p.id, project: p });
          return Boolean(res?.ok);
        }
      }

      const requestEpoch = ProjectStore.resetEpoch;
      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function'
        ? global.showSpaToast
        : () => {};
      toastFn(`正在整理分鏡資料…`);
      try {
        await ProjectsApi.exportProject(p);
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        toastFn(`JSON 已成功匯出。`);
        return true;
      } catch (err) {
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        console.error('Failed to export project', err);
        if (typeof global !== 'undefined' && typeof global.alert === 'function') {
          global.alert(err?.message || '無法取得完整專案資料，請稍後重試。');
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
    },

    async batchUpdateProjectTags(projectIds, newTags, refreshCallback) {
      const ids = Array.isArray(projectIds) ? projectIds.filter(Boolean) : [];
      if (!ids.length) return false;
      const requestEpoch = ProjectStore.resetEpoch;
      const normalized = Array.isArray(newTags)
        ? Array.from(new Set(newTags.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean)))
        : [];
      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function' ? global.showSpaToast : () => {};

      const results = await Promise.allSettled(ids.map(id => ProjectsApi.updateProjectTags(id, normalized)));
      if (requestEpoch !== ProjectStore.resetEpoch) return false;

      let succeeded = 0;
      let failed = 0;
      const currentList = ProjectStore.getProjects() || [];

      results.forEach((entry, idx) => {
        if (entry.status === 'fulfilled' && entry.value?.ok) {
          succeeded++;
          const id = ids[idx];
          const updatedProject = entry.value.data?.project;
          if (updatedProject) {
            ProjectStore.upsertProject(updatedProject, { silent: true });
          } else {
            const existing = currentList.find(item => String(item.id) === String(id));
            if (existing) {
              ProjectStore.upsertProject({
                ...existing,
                tags: normalized,
                metadata: { ...(existing.metadata || {}), tags: normalized }
              }, { silent: true });
            }
          }
        } else {
          failed++;
        }
      });

      if (succeeded > 0) {
        ProjectStore.notify({
          type: 'tags_updated',
          scope: 'list',
          changedFields: ['tags'],
          changed: true,
          source: 'mutation'
        });
        if (typeof refreshCallback === 'function') refreshCallback();
        if (typeof global.updateSidebarProjects === 'function') global.updateSidebarProjects();
        toastFn(failed > 0 ? `已更新 ${succeeded} 個專案的標籤，${failed} 個失敗。` : `已更新 ${succeeded} 個專案的標籤。`);
        return true;
      }
      toastFn('批次更新標籤失敗，請稍後再試');
      return false;
    },

    async permanentDeleteProject(p, card, refreshCallback) {
      if (!p || !p.id) return false;
      const requestEpoch = ProjectStore.resetEpoch;
      const confirmFn = typeof global !== 'undefined' && typeof global.confirm === 'function' ? global.confirm : async () => false;
      const isConfirmed = await confirmFn(
        '永久刪除此分鏡？',
        `「${p.title || '未命名分鏡'}」及其所有分鏡圖片將永久刪除，無法再復原。`,
        'delete',
        '永久刪除',
        null
      );
      if (!isConfirmed || requestEpoch !== ProjectStore.resetEpoch) return false;

      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function'
        ? global.showSpaToast
        : () => {};

      toastFn(`正在永久刪除「${p.title || '未命名分鏡'}」...`, null, 15000);

      try {
        const res = await ProjectsApi.permanentDeleteProject(p.id);
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        if (!res.ok) {
          const msg = res.data?.error || res.error || '永久刪除失敗，請稍後重試';
          if (typeof global !== 'undefined' && typeof global.alert === 'function') global.alert(msg);
          return false;
        }
        ProjectStore.invalidateProjectDetail(p.id);
        await ProjectStore.fetchProjects({ force: true });
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        if (typeof refreshCallback === 'function') refreshCallback();
        if (typeof global.updateSidebarProjects === 'function') global.updateSidebarProjects();
        toastFn(`分鏡「${p.title || '未命名分鏡'}」已永久刪除。`);
        ProjectStore.notify({ type: 'permanent_deleted', id: p.id, project: p });
        return true;
      } catch (err) {
        if (requestEpoch !== ProjectStore.resetEpoch) return false;
        console.error('Failed to permanently delete project', err);
        if (typeof global !== 'undefined' && typeof global.alert === 'function') {
          global.alert('永久刪除失敗，請稍後再試');
        }
        return false;
      }
    },

    async batchTrashProjects(projectIds, refreshCallback) {
      const ids = Array.isArray(projectIds) ? projectIds.filter(Boolean) : [];
      if (!ids.length) return { ok: false, summary: { succeeded: 0, failed: 0, skipped: 0 } };
      const requestEpoch = ProjectStore.resetEpoch;
      const confirmFn = typeof global !== 'undefined' && typeof global.confirm === 'function' ? global.confirm : async () => false;
      const isConfirmed = await confirmFn(
        `將 ${ids.length} 個分鏡移至資源回收桶？`,
        '移至資源回收桶的專案將保留 30 天，您可以在資源回收桶中還原。',
        'delete',
        '移至回收桶',
        null
      );
      if (!isConfirmed || requestEpoch !== ProjectStore.resetEpoch) return { ok: false, cancelled: true };

      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function' ? global.showSpaToast : () => {};
      const res = await ProjectsApi.batchTrashProjects(ids);
      if (requestEpoch !== ProjectStore.resetEpoch) return { ok: false };
      if (!res.ok) {
        toastFn(res.data?.error || '批次移入回收桶失敗');
        return res;
      }
      await ProjectStore.fetchProjects({ force: true });
      if (requestEpoch !== ProjectStore.resetEpoch) return { ok: false };
      if (typeof refreshCallback === 'function') refreshCallback();
      if (typeof global.updateSidebarProjects === 'function') global.updateSidebarProjects();
      const s = res.data?.summary || { succeeded: ids.length, failed: 0 };
      toastFn(s.failed > 0 ? `已移入回收桶 ${s.succeeded} 個分鏡，${s.failed} 個失敗。` : `已將 ${s.succeeded} 個分鏡移至資源回收桶。`);
      return res;
    },

    async batchRestoreProjects(projectIds, refreshCallback, options = {}) {
      const ids = Array.isArray(projectIds) ? projectIds.filter(Boolean) : [];
      if (!options.all && !ids.length) return { ok: false };
      const requestEpoch = ProjectStore.resetEpoch;
      const confirmFn = typeof global !== 'undefined' && typeof global.confirm === 'function' ? global.confirm : async () => false;
      const title = options.all ? '還原回收桶中全部專案？' : `還原所選的 ${ids.length} 個分鏡？`;
      const desc = options.all ? '資源回收桶中的所有分鏡都將還原至「我的分鏡」。' : '所選分鏡將還原至「我的分鏡」。';
      const isConfirmed = await confirmFn(title, desc, 'default', '確認還原', null);
      if (!isConfirmed || requestEpoch !== ProjectStore.resetEpoch) return { ok: false, cancelled: true };

      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function' ? global.showSpaToast : () => {};
      const res = await ProjectsApi.batchRestoreProjects(ids, options);
      if (requestEpoch !== ProjectStore.resetEpoch) return { ok: false };
      if (!res.ok) {
        toastFn(res.data?.error || '批次還原失敗');
        return res;
      }
      await ProjectStore.fetchProjects({ force: true });
      if (requestEpoch !== ProjectStore.resetEpoch) return { ok: false };
      if (typeof refreshCallback === 'function') refreshCallback();
      if (typeof global.updateSidebarProjects === 'function') global.updateSidebarProjects();
      const s = res.data?.summary || { succeeded: ids.length, failed: 0 };
      toastFn(s.failed > 0 ? `已還原 ${s.succeeded} 個分鏡，${s.failed} 個失敗。` : `已成功還原 ${s.succeeded} 個分鏡。`);
      return res;
    },

    async batchPermanentDeleteProjects(projectIds, refreshCallback) {
      const ids = Array.isArray(projectIds) ? projectIds.filter(Boolean) : [];
      if (!ids.length) return { ok: false };
      const requestEpoch = ProjectStore.resetEpoch;
      const confirmFn = typeof global !== 'undefined' && typeof global.confirm === 'function' ? global.confirm : async () => false;
      const isConfirmed = await confirmFn(
        `永久刪除所選的 ${ids.length} 個分鏡？`,
        '所選專案及其分鏡圖片將永久清除且無法復原，確定要繼續嗎？',
        'delete',
        '永久刪除',
        null
      );
      if (!isConfirmed || requestEpoch !== ProjectStore.resetEpoch) return { ok: false, cancelled: true };

      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function' ? global.showSpaToast : () => {};
      toastFn(`正在永久刪除所選的 ${ids.length} 個分鏡...`, null, 15000);
      const res = await ProjectsApi.batchPermanentDeleteProjects(ids);
      if (requestEpoch !== ProjectStore.resetEpoch) return { ok: false };
      if (!res.ok) {
        toastFn(res.data?.error || '批次永久刪除失敗');
        return res;
      }
      ids.forEach(id => ProjectStore.invalidateProjectDetail(id));
      await ProjectStore.fetchProjects({ force: true });
      if (requestEpoch !== ProjectStore.resetEpoch) return { ok: false };
      if (typeof refreshCallback === 'function') refreshCallback();
      if (typeof global.updateSidebarProjects === 'function') global.updateSidebarProjects();
      const s = res.data?.summary || { succeeded: ids.length, failed: 0 };
      toastFn(s.failed > 0 ? `已永久刪除 ${s.succeeded} 個分鏡，${s.failed} 個失敗。` : `已永久刪除 ${s.succeeded} 個分鏡。`);
      return res;
    },

    async emptyTrash(refreshCallback) {
      const requestEpoch = ProjectStore.resetEpoch;
      const confirmFn = typeof global !== 'undefined' && typeof global.confirm === 'function' ? global.confirm : async () => false;
      const firstConfirm = await confirmFn(
        '清空資源回收桶？',
        '這將永久刪除資源回收桶中的所有分鏡與圖片，且無法復原。',
        'delete',
        '繼續清空',
        null
      );
      if (!firstConfirm || requestEpoch !== ProjectStore.resetEpoch) return { ok: false, cancelled: true };

      const secondConfirm = await confirmFn(
        '再次確認：永久清空所有專案',
        '此動作無法撤銷，所有已刪除分鏡及圖片資產將立即從伺服器移除。',
        'delete',
        '確定永久清空',
        null
      );
      if (!secondConfirm || requestEpoch !== ProjectStore.resetEpoch) return { ok: false, cancelled: true };

      const toastFn = typeof global !== 'undefined' && typeof global.showSpaToast === 'function' ? global.showSpaToast : () => {};
      toastFn('正在清空資源回收桶...', null, 15000);
      const res = await ProjectsApi.emptyTrash();
      if (requestEpoch !== ProjectStore.resetEpoch) return { ok: false };
      if (!res.ok) {
        toastFn(res.data?.error || '清空資源回收桶失敗');
        return res;
      }
      await ProjectStore.fetchProjects({ force: true });
      if (requestEpoch !== ProjectStore.resetEpoch) return { ok: false };
      if (typeof refreshCallback === 'function') refreshCallback();
      if (typeof global.updateSidebarProjects === 'function') global.updateSidebarProjects();
      const s = res.data?.summary || { succeeded: 0, failed: 0 };
      toastFn(s.failed > 0 ? `已永久清除 ${s.succeeded} 個分鏡，${s.failed} 個清理失敗。` : `資源回收桶已清空（共移除 ${s.succeeded} 個分鏡）。`);
      return res;
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
    diffProjectSummary,
    diffProjectList,
    diffProjectDetail,
    estimateProjectBytes,
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
