/**
 * StoryboardAI — Unified Storyboard Export Service (Export System V2)
 *
 * Single source of truth for all export entry points:
 * 1. Project list folder Option Menu
 * 2. Project Detail page export button
 * 3. Generation Result page export button
 *
 * Handles:
 * - Fresh API fetching (`GET /api/projects/:id`) with zero silent fallback to summary data
 * - Session/account epoch guard and route-change cancellation
 * - Duplicate export prevention & active job cancellation
 * - Unsaved editor warning on Project Detail
 * - Unsaved GenerationTask handling (text JSON without Base64; temporary images for PDF)
 * - Lazy loading of PDF engine & fonts
 */
(function (root) {
  'use strict';

  const activeJobs = new Map(); // key -> { controller, format, startedAt }
  let pdfModulesPromise = null;

  function getSerializer() {
    if (root.StoryboardProjectSerializer) return root.StoryboardProjectSerializer;
    if (typeof require === 'function') return require('./project-serializer.js');
    throw new Error('StoryboardProjectSerializer 尚未載入');
  }

  function getJsonExporter() {
    if (root.StoryboardJsonExporter) return root.StoryboardJsonExporter;
    if (typeof require === 'function') return require('./json-exporter.js');
    throw new Error('StoryboardJsonExporter 尚未載入');
  }

  function getAuthToken() {
    if (root.ProjectsApi && typeof root.ProjectsApi.getAuthToken === 'function') {
      return root.ProjectsApi.getAuthToken();
    }
    if (root.spaAuth && typeof root.spaAuth.getToken === 'function') {
      return root.spaAuth.getToken() || '';
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('spa_auth_token') || '';
    }
    return '';
  }

  function getStoreEpoch() {
    return root.ProjectStore ? root.ProjectStore.resetEpoch : 0;
  }

  function showToast(message, duration = 3500) {
    if (typeof root.showSpaToast === 'function') {
      root.showSpaToast(message, null, duration);
    } else if (root.ProjectDetailController && typeof root.ProjectDetailController._toast === 'function') {
      root.ProjectDetailController._toast(message, 'default');
    }
  }

  async function showAlert(title, description) {
    if (root.DialogService && typeof root.DialogService.alert === 'function') {
      await root.DialogService.alert({ title, description, confirmText: '知道了' });
      return;
    }
    if (typeof root.alert === 'function') {
      root.alert(description ? `${title}\n${description}` : title);
    }
  }

  async function showConfirm(options) {
    if (root.DialogService && typeof root.DialogService.confirm === 'function') {
      const res = await root.DialogService.confirm(options);
      return Boolean(res?.confirmed);
    }
    if (typeof root.confirm === 'function') {
      return Boolean(await root.confirm(options.title, options.description, 'default', options.confirmText || '繼續'));
    }
    return true;
  }

  /**
   * Fetch latest full project detail from GET /api/projects/:id.
   * Never silently falls back to list summary.
   */
  async function fetchFreshProject(projectId, { signal, fetchFn } = {}) {
    const token = getAuthToken();
    if (!token) {
      const err = new Error('請先登入後再匯出此專案。');
      err.code = 'EXPORT_UNAUTHORIZED';
      throw err;
    }

    const doFetch = fetchFn || root.fetch?.bind(root);
    if (typeof doFetch !== 'function') {
      throw new Error('環境不支援網路請求，無法取得完整專案資料。');
    }

    const res = await doFetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      signal,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const msg = res.status === 401 || res.status === 403
        ? '沒有權限存取此專案，請重新登入後再試。'
        : res.status === 404
          ? '找不到此專案或專案已被移除。'
          : (errData.error || '無法取得完整專案資料，請稍後重試。');
      const err = new Error(msg);
      err.status = res.status;
      err.code = 'EXPORT_FETCH_FAILED';
      throw err;
    }

    const data = await res.json().catch(() => null);
    if (!data || !data.project || !Array.isArray(data.project.shots)) {
      const err = new Error('伺服器回傳的專案資料不完整，無法匯出，請稍後重試。');
      err.code = 'EXPORT_INCOMPLETE_PROJECT';
      throw err;
    }

    return data.project;
  }

  /**
   * Check whether the Project Detail editor has unsaved changes for this project.
   */
  async function checkUnsavedEditorChanges(projectId) {
    const ctrl = root.ProjectDetailController;
    if (!ctrl || !ctrl._editorDirty) return true;
    if (projectId && ctrl._projectId && String(ctrl._projectId) !== String(projectId)) return true;

    return await showConfirm({
      title: '尚有未儲存的鏡頭編輯',
      description: '目前編輯器中有尚未儲存的修改。匯出將使用伺服器上最後一次已儲存的版本；建議先儲存變更後再匯出。',
      confirmText: '仍要匯出已儲存版本',
      cancelText: '返回儲存'
    });
  }

  /**
   * Resolve and serialize the source into a verified Export V2 bundle.
   *
   * @param {Object} source - { projectId?, project?, generationTask? }
   * @param {Object} options - { signal?, fetchFn?, skipDirtyCheck?, onStage? }
   */
  async function resolveExportBundle(source, options = {}) {
    const serializer = getSerializer();
    const { signal, fetchFn, onStage } = options;

    const initialEpoch = getStoreEpoch();
    const initialToken = getAuthToken();

    const assertSessionStable = () => {
      if (signal?.aborted) {
        const err = new Error('匯出已取消');
        err.name = 'AbortError';
        throw err;
      }
      if (getStoreEpoch() !== initialEpoch || getAuthToken() !== initialToken) {
        const err = new Error('帳號或工作階段已變更，已中止匯出。');
        err.code = 'EXPORT_SESSION_CHANGED';
        throw err;
      }
    };

    // Case 1: Generation Task source
    if (source?.generationTask) {
      const task = source.generationTask;
      const isSavedProject = Boolean(task.projectId && task.save?.status === 'saved');

      if (isSavedProject) {
        onStage?.('正在整理分鏡資料…');
        const freshProject = await fetchFreshProject(task.projectId, { signal, fetchFn });
        assertSessionStable();
        return serializer.serializeProject(freshProject);
      }

      // Unsaved generation result
      onStage?.('正在整理尚未儲存的分鏡資料…');
      const normalized = serializer.normalizeGenerationTask(task);
      if (!normalized || !Array.isArray(normalized.shots) || normalized.shots.length === 0) {
        const err = new Error('目前沒有可匯出的分鏡資料。');
        err.code = 'EXPORT_EMPTY';
        throw err;
      }
      assertSessionStable();
      return serializer.serializeProject(normalized);
    }

    // Case 2: Saved Project source (Project List or Project Detail)
    const projectId = source?.projectId || source?.project?.id;
    if (!projectId) {
      const err = new Error('缺少專案識別碼，無法匯出。');
      err.code = 'EXPORT_MISSING_ID';
      throw err;
    }

    if (!options.skipDirtyCheck) {
      const proceed = await checkUnsavedEditorChanges(projectId);
      if (!proceed) {
        const err = new Error('已取消匯出');
        err.name = 'AbortError';
        throw err;
      }
      assertSessionStable();
    }

    onStage?.('正在整理分鏡資料…');
    const freshProject = await fetchFreshProject(projectId, { signal, fetchFn });
    assertSessionStable();

    onStage?.('正在準備圖片連結…');
    const bundle = serializer.serializeProject(freshProject);
    assertSessionStable();
    return bundle;
  }

  function getJobKey(source, format) {
    if (source?.generationTask) {
      return `${format}:task:${source.generationTask.taskId || 'current'}`;
    }
    const id = source?.projectId || source?.project?.id || 'unknown';
    return `${format}:project:${id}`;
  }

  function isExporting(source, format) {
    if (!source) return activeJobs.size > 0;
    if (format) return activeJobs.has(getJobKey(source, format));
    const keySuffix = source?.generationTask
      ? `:task:${source.generationTask.taskId || 'current'}`
      : `:project:${source?.projectId || source?.project?.id || 'unknown'}`;
    for (const k of activeJobs.keys()) {
      if (k.endsWith(keySuffix)) return true;
    }
    return false;
  }

  function cancelAllExports() {
    for (const job of activeJobs.values()) {
      try { job.controller.abort(); } catch (_) {}
    }
    activeJobs.clear();
  }

  /**
   * Export Project as StoryboardAI JSON V2.
   */
  async function exportJson(source, options = {}) {
    const jobKey = getJobKey(source, 'json');
    if (activeJobs.has(jobKey)) {
      showToast('正在匯出中，請稍候…', 2000);
      return { ok: false, duplicate: true };
    }

    const controller = new AbortController();
    const externalSignal = options.signal;
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    activeJobs.set(jobKey, { controller, format: 'json', startedAt: Date.now() });

    const onStage = (msg) => {
      if (typeof options.onStage === 'function') options.onStage(msg);
      else if (!options.silent) showToast(msg, 4000);
    };

    try {
      const bundle = await resolveExportBundle(source, {
        ...options,
        signal: controller.signal,
        onStage
      });

      const jsonExporter = getJsonExporter();
      const result = jsonExporter.exportJsonDocument(bundle, {
        filename: options.filename,
        download: options.download !== false
      });

      if (!options.silent) {
        if (bundle.meta.isUnsaved && bundle.meta.hasUnsavedImages) {
          showToast('JSON 已成功匯出（僅含文字分鏡；圖片尚未儲存至雲端）。', 5000);
        } else if (bundle.meta.hasSignedUrls) {
          showToast('JSON 已成功匯出。提醒：檔案內含具時效性的圖片連結，分享時請注意存取權限。', 5500);
        } else {
          showToast('JSON 已成功匯出。', 3000);
        }
      }

      return { ok: true, ...result, meta: bundle.meta };
    } catch (err) {
      if (err?.name === 'AbortError') {
        return { ok: false, aborted: true };
      }
      console.error('[StoryboardExport] JSON export failed:', err);
      if (!options.silent) {
        await showAlert('JSON 匯出失敗', err?.message || '無法取得完整專案資料，請稍後重試。');
      }
      return { ok: false, error: err?.message || 'JSON 匯出失敗', code: err?.code };
    } finally {
      externalSignal?.removeEventListener('abort', onExternalAbort);
      if (activeJobs.get(jobKey)?.controller === controller) {
        activeJobs.delete(jobKey);
      }
    }
  }

  /**
   * Lazy-load PDF export modules (pdf-assets, pdf-layout, pdf-exporter) on demand.
   */
  async function ensurePdfModules() {
    if (root.StoryboardPdfExporter && root.StoryboardPdfLayout && root.StoryboardPdfAssets) {
      return {
        exporter: root.StoryboardPdfExporter,
        layout: root.StoryboardPdfLayout,
        assets: root.StoryboardPdfAssets
      };
    }

    if (typeof require === 'function' && typeof document === 'undefined') {
      return {
        assets: require('./pdf-assets.js'),
        layout: require('./pdf-layout.js'),
        exporter: require('./pdf-exporter.js')
      };
    }

    if (!pdfModulesPromise) {
      const scripts = [
        '/js/features/export/pdf-assets.js',
        '/js/features/export/pdf-layout.js',
        '/js/features/export/pdf-exporter.js'
      ];
      pdfModulesPromise = (async () => {
        if (root.PageAssetLoader && typeof root.PageAssetLoader.injectScripts === 'function') {
          await root.PageAssetLoader.injectScripts(scripts);
        } else {
          for (const src of scripts) {
            await new Promise((resolve, reject) => {
              const s = document.createElement('script');
              s.src = src;
              s.async = false;
              s.onload = () => resolve();
              s.onerror = () => reject(new Error(`無法載入匯出模組：${src}`));
              document.body.appendChild(s);
            });
          }
        }
        if (!root.StoryboardPdfExporter) {
          throw new Error('PDF 匯出模組載入失敗，請重新整理後再試。');
        }
        return {
          exporter: root.StoryboardPdfExporter,
          layout: root.StoryboardPdfLayout,
          assets: root.StoryboardPdfAssets
        };
      })().catch(err => {
        pdfModulesPromise = null;
        throw err;
      });
    }
    return pdfModulesPromise;
  }

  /**
   * Export Project as StoryboardAI PDF Brief.
   */
  async function exportPdf(source, pdfOptions = {}, callbacks = {}) {
    const jobKey = getJobKey(source, 'pdf');
    if (activeJobs.has(jobKey)) {
      showToast('正在生成 PDF，請稍候…', 2000);
      return { ok: false, duplicate: true };
    }

    const controller = new AbortController();
    const externalSignal = callbacks.signal;
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    activeJobs.set(jobKey, { controller, format: 'pdf', startedAt: Date.now() });

    const onProgress = (info) => {
      if (typeof callbacks.onProgress === 'function') callbacks.onProgress(info);
    };

    try {
      onProgress({ stage: 'prepare', message: '正在整理企劃與分鏡內容…' });
      const bundle = await resolveExportBundle(source, {
        signal: controller.signal,
        fetchFn: callbacks.fetchFn,
        skipDirtyCheck: callbacks.skipDirtyCheck,
        onStage: (msg) => onProgress({ stage: 'prepare', message: msg })
      });

      const { exporter } = await ensurePdfModules();
      const result = await exporter.exportPdfDocument(bundle, pdfOptions, {
        signal: controller.signal,
        authToken: getAuthToken(),
        onProgress,
        onImageFailures: callbacks.onImageFailures || (async (failureInfo) => {
          const confirmed = await showConfirm({
            title: `有 ${failureInfo.failedCount} 張分鏡圖片無法載入`,
            description: `鏡頭 ${failureInfo.failedOrders.join('、')} 的圖片無法下載（可能是連結已過期或網路中斷）。您可以選擇重新嘗試，或以缺失圖片提示繼續匯出 PDF。`,
            confirmText: '仍要匯出',
            cancelText: '取消匯出'
          });
          return confirmed ? 'continue' : 'cancel';
        })
      });

      if (result?.aborted) {
        return { ok: false, aborted: true };
      }

      if (!callbacks.silent) {
        if (result.failedImageCount > 0) {
          showToast(`分鏡企劃書已匯出（其中 ${result.failedImageCount} 張圖片無法載入）。`, 5000);
        } else if (bundle.meta.isUnsaved) {
          showToast('分鏡企劃書已成功匯出（目前為尚未儲存版本）。', 4500);
        } else {
          showToast('分鏡企劃書已成功匯出。', 3500);
        }
      }

      return { ok: true, ...result };
    } catch (err) {
      if (err?.name === 'AbortError') {
        return { ok: false, aborted: true };
      }
      console.error('[StoryboardExport] PDF export failed:', err);
      if (!callbacks.silent) {
        await showAlert('PDF 匯出失敗', err?.message || 'PDF 生成失敗，請重試。');
      }
      return { ok: false, error: err?.message || 'PDF 生成失敗，請重試。', code: err?.code };
    } finally {
      externalSignal?.removeEventListener('abort', onExternalAbort);
      if (activeJobs.get(jobKey)?.controller === controller) {
        activeJobs.delete(jobKey);
      }
    }
  }

  /**
   * Open the unified export format menu (Morph menu) or PDF settings dialog.
   */
  function openExportMenu(trigger, source, options = {}) {
    if (root.StoryboardExportDialog && typeof root.StoryboardExportDialog.openFormatMenu === 'function') {
      return root.StoryboardExportDialog.openFormatMenu(trigger, source, options);
    }
    // Fallback if UI module is not loaded
    return exportJson(source, options);
  }

  function openPdfSettings(source, options = {}) {
    if (root.StoryboardExportDialog && typeof root.StoryboardExportDialog.openPdfDialog === 'function') {
      return root.StoryboardExportDialog.openPdfDialog(source, options);
    }
    return exportPdf(source, {}, options);
  }

  // Cancel in-flight exports if user logs out / ProjectStore resets
  if (root.ProjectStore && typeof root.ProjectStore.subscribe === 'function') {
    root.ProjectStore.subscribe((_projects, event) => {
      if (event?.type === 'reset') {
        cancelAllExports();
      }
    });
  }

  const api = {
    resolveExportBundle,
    fetchFreshProject,
    exportJson,
    exportPdf,
    openExportMenu,
    openPdfSettings,
    isExporting,
    cancelAllExports,
    ensurePdfModules
  };

  if (typeof root !== 'undefined') {
    root.StoryboardExport = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
