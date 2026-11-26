/**
 * App-level generation task. Survives page unmount; never owns page DOM.
 * OpenAI images use bounded parallel requests; Gemini images remain sequential.
 * Persistence here means SPA route lifetime, not reload/server job resumption.
 */
(function (root) {
  'use strict';
  if (root.GenerationTask) return;

  const listeners = new Set();
  const imageRetries = new WeakMap();
  const runOwners = new WeakMap();
  let sequence = 0;
  let currentController = null;
  let activePromise = null;
  const freeform = root.FreeformStoryboard;
  const clone = value => JSON.parse(JSON.stringify(value));
  function initialState() {
    return {
      taskId: null, provider: 'gemini', projectId: null, projectShotIds: {}, uploadedImages: {}, status: 'idle', input: null, error: null, planDirty: false, retry: null, stage: 'planning', activity: { phase: 'requesting', thoughtSummaries: [] },
      save: { status: 'idle', error: null },
      progress: { pct: 0, statusText: '', activeStepId: null },
      result: { storyboardData: null, generatedImgs: [], generatedStoryTitles: [],
        generatedStoryCams: [], generatedPrompts: [], generatedShotData: [], failedShotIndexes: [] }
    };
  }
  let state = initialState();
  function getState() { return clone(state); }
  function notify() {
    if (typeof root.updateGlobalPillProgress === 'function') {
      root.updateGlobalPillProgress(state.progress.pct, state.status === 'generating');
    }
    listeners.forEach(listener => {
      try { listener(getState()); } catch (error) { console.error('[GenerationTask] subscriber:', error); }
    });
  }
  function subscribe(listener) {
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }
  function start(options) {
    if (state.status === 'generating') return activePromise;
    if (state.status === 'awaiting_confirmation') return Promise.resolve(getState());
    if (savePromise) return savePromise;
    if (!options?.story) return Promise.resolve(getState());
    if (!options.style) throw new Error('GenerationTask requires a style snapshot');
    const controller = new AbortController();
    currentController = controller;
    const run = initialState();
    runOwners.set(run, root.spaAuth?.getToken?.());
    run.taskId = `generation-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2, 10)}`;
    run.provider = options.provider || root.spaAuth?.getAiProvider?.() || 'gemini';
    run.status = 'generating';
    run.input = clone(options);
    {
      run.input.duration = freeform.duration(options.duration);
      run.input.ratio ||= '直向9:16';
    }
    run.progress = { pct: 0, statusText: '正在規劃分鏡…', activeStepId: 'step-analyze' };
    state = run;
    activePromise = Promise.resolve().then(() => execute(run, controller));
    notify();
    return activePromise;
  }
  function cancel() {
    if (!['generating', 'awaiting_confirmation'].includes(state.status)) return false;
    const controller = currentController;
    currentController = null;
    state.status = 'cancelled';
    state.retry = null;
    state.progress = { ...state.progress, statusText: '生成已中斷', activeStepId: null };
    controller?.abort();
    notify();
    return true;
  }
  function reset() {
    const controller = currentController;
    currentController = null;
    controller?.abort();
    activePromise = null;
    savePromise = null;
    state = initialState();
    notify();
  }
  function retry() {
    if (state.status === 'generating') return activePromise;
    if (state.stage === 'images' && state.result.failedShotIndexes.length && state.result.generatedShotData.length === state.result.storyboardData?.shots.length && Array.from(state.result.generatedShotData).every(shot => ['succeeded', 'failed'].includes(shot?.payload.imageStatus))) return retryFailedImages();
    if (state.result.storyboardData && ['error', 'cancelled'].includes(state.status)) {
      if (state.input.confirmBeforeImages) {
        state.status = 'awaiting_confirmation'; state.error = null; notify();
        return Promise.resolve(getState());
      }
      const run = state, controller = new AbortController();
      currentController = controller; run.status = 'generating'; run.error = null;
      activePromise = execute(run, controller, true);
      notify(); return activePromise;
    }
    if (state.input && ['error', 'cancelled'].includes(state.status)) {
      const run = state, controller = new AbortController();
      currentController = controller; run.status = 'generating'; run.error = null; run.retry = null;
      activePromise = execute(run, controller); notify(); return activePromise;
    }
    return Promise.resolve(getState());
  }
  function updatePlan(data) {
    if (state.status !== 'awaiting_confirmation') return false;
    const before = state.result.storyboardData;
    // Text/camera edits need fresh English prompts. Reordering and timing do not.
    state.planDirty ||= data.shots.some(shot => {
      const original = before.shots.find(item => item.id === shot.id);
      return !original || original.story !== shot.story || original.camera !== shot.camera || original.emotion !== shot.emotion;
    });
    if (state.result.generatedShotData.length) {
      const previous = state.result;
      const kept = data.shots.map(shot => {
        const index = before.shots.findIndex(item => item.id === shot.id && item.story === shot.story && item.camera === shot.camera && item.emotion === shot.emotion && item.shotPrompt === shot.shotPrompt);
        return index < 0 ? null : previous.generatedShotData[index];
      });
      previous.generatedShotData = kept.map((shot, index) => shot ? {
        ...shot, order: index + 1, duration: data.shots[index].duration,
        payload: { ...shot.payload, emotion: data.shots[index].emotion, purpose: data.shots[index].purpose, dialogue: data.shots[index].dialogue || '' }
      } : null);
      previous.generatedImgs = kept.map(shot => shot?.payload.image || '../icon/error.jpg');
      previous.failedShotIndexes = kept.flatMap((shot, i) => shot?.payload.imageStatus === 'failed' ? [i] : []);
    }
    state.result.storyboardData = clone(data);
    state.error = null;
    notify();
    return true;
  }
  function confirmPlan() {
    if (state.status === 'generating') return activePromise;
    if (state.status !== 'awaiting_confirmation') return Promise.resolve(getState());
    try { freeform.validate(state.result.storyboardData, state.input.duration, state.input.selectedTemplate); }
    catch (error) { state.error = { message: error.message }; notify(); return Promise.resolve(getState()); }
    const run = state, controller = new AbortController();
    currentController = controller; run.status = 'generating'; run.error = null;
    activePromise = Promise.resolve().then(() => execute(run, controller, true));
    notify(); return activePromise;
  }
  function positiveSeconds(value) {
    const seconds = parseFloat(value);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 3;
  }
  function validateStoryboard(data) {
    if (!data || !Array.isArray(data.shots) || !data.shots.length || data.shots.some(shot => !shot || typeof shot.story !== 'string' || !shot.story.trim() || typeof shot.shotPrompt !== 'string' || !shot.shotPrompt.trim())) {
      throw new Error('無法解析有效的分鏡腳本，請重試。');
    }
    if (!data.characters || typeof data.characters !== 'object' || Array.isArray(data.characters)) data.characters = {};
    data.shots.forEach(shot => { if (!Array.isArray(shot.characters)) shot.characters = []; });
    return data;
  }
  function assertRun(run, controller) {
    if (state !== run || controller.signal.aborted || root.spaAuth?.getToken?.() !== runOwners.get(run)) {
      const error = new Error('Generation cancelled'); error.name = 'AbortError'; throw error;
    }
  }
  async function requestJSON(run, controller, url, options) {
    assertRun(run, controller);
    const token = runOwners.get(run);
    const response = await fetch(url, { ...options, headers: { ...options?.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: controller.signal });
    assertRun(run, controller);
    const data = await response.json();
    assertRun(run, controller);
    if (!response.ok) {
      const error = new Error(data.details || data.error || '服務暫時無法處理，請稍後再試');
      error.status = response.status; error.code = data.code;
      const retryAfter = response.headers?.get?.('retry-after');
      if (retryAfter) {
        const seconds = Number(retryAfter);
        error.retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retryAfter) - Date.now());
      }
      throw error;
    }
    return data;
  }
  function waitForImageRetry(run, controller, milliseconds) {
    return new Promise((resolve, reject) => {
      const stop = () => {
        clearTimeout(timer); controller.signal.removeEventListener('abort', stop);
        const error = new Error('Generation cancelled'); error.name = 'AbortError'; reject(error);
      };
      const timer = setTimeout(() => {
        controller.signal.removeEventListener('abort', stop);
        try { assertRun(run, controller); resolve(); } catch (error) { reject(error); }
      }, milliseconds);
      controller.signal.addEventListener('abort', stop, { once: true });
      if (controller.signal.aborted) stop();
    });
  }
  function verifyImage(run, controller, source) {
    if (typeof source !== 'string' || !source.trim() || source === '../icon/error.jpg') return Promise.reject(new Error('圖片回應無效'));
    // Browser decoding checks that a nonempty response is actually a readable image.
    if (!root.Image) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const image = new root.Image();
      const finish = error => {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', cancel);
        image.onload = image.onerror = null;
        if (error) { image.src = ''; reject(error); } else resolve();
      };
      const cancel = () => finish(Object.assign(new Error('Generation cancelled'), { name: 'AbortError' }));
      const timer = setTimeout(() => finish(new Error('圖片驗證逾時')), 15000);
      image.onload = () => {
        try {
          assertRun(run, controller);
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('圖片尺寸無效');
          finish();
        } catch (error) { finish(error); }
      };
      image.onerror = () => finish(new Error('圖片無法讀取'));
      controller.signal.addEventListener('abort', cancel, { once: true });
      if (controller.signal.aborted) cancel(); else image.src = source;
    });
  }
  function requireCompleteImages(run) {
    const shots = run.result.generatedShotData;
    if (run.result.failedShotIndexes.length || shots.length !== run.result.storyboardData.shots.length || Array.from(shots).some(shot => shot?.payload.imageStatus !== 'succeeded')) {
      throw Object.assign(new Error('伺服器繁忙，部分圖片仍未生成成功；已成功的圖片已保留，請繼續重試。'), { code: 'AI_IMAGES_INCOMPLETE' });
    }
  }
  async function requestImage(run, controller, question, shotIndex) {
    let retries = imageRetries.get(controller);
    if (!retries) { retries = new Map(); imageRetries.set(controller, retries); }
    function updateRetry(value) {
      if (value) retries.set(shotIndex, value); else retries.delete(shotIndex);
      if (state === run && currentController === controller) {
        run.retry = [...retries.values()].sort((a, b) => a.retryAt - b.retryAt)[0] || null;
      }
    }
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        assertRun(run, controller);
        updateRetry(null);
        if (attempt) { run.progress = imageProgress(run, `正在重新生成第 ${shotIndex + 1} 個分鏡…`); notify(); }
        try {
          const data = await requestJSON(run, controller, '/api/ask-gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, type: 'image', ratio: run.input.ratio, requestId: run.taskId, provider: run.provider }) });
          if (!data.image?.[0]) throw Object.assign(new Error('圖片回應為空'), { code: 'AI_EMPTY_CONTENT', status: 502 });
          await verifyImage(run, controller, data.image[0]);
          return data;
        } catch (error) {
          assertRun(run, controller);
          if (error.name === 'AbortError') throw error;
          const retryable = !error.status || [408, 429, 500, 502, 503, 504].includes(error.status);
          const permanent = ['AI_AUTH_PERMISSION', 'AI_API_DISABLED', 'AI_MODEL_UNAVAILABLE', 'AI_SCHEMA_ERROR', 'AI_INVALID_REQUEST'].includes(error.code);
          if (!retryable || permanent || attempt === 2 || error.retryAfterMs > 60000) {
            error.message = retryable && !permanent ? '伺服器繁忙，圖片暫時無法生成，請稍後重試。' : '圖片服務暫時無法使用，請稍後重試。';
            throw error;
          }
          const delay = Math.max(10000 * 2 ** attempt, error.retryAfterMs || 0);
          updateRetry({ retryAt: Date.now() + delay, shotIndex, attempt: attempt + 1, maxAttempts: 3 });
          run.progress = imageProgress(run, `伺服器繁忙中，將在 ${Math.ceil(delay / 1000)} 秒後自動重試`); notify();
          await waitForImageRetry(run, controller, delay);
        }
      }
    } finally { updateRetry(null); }
  }
  async function forEachImage(run, controller, indexes, generate) {
    let next = 0;
    const workers = Array.from({ length: Math.min(run.provider === 'openai' ? 3 : 1, indexes.length) }, async () => {
      while (next < indexes.length) {
        assertRun(run, controller);
        await generate(indexes[next++]);
      }
    });
    // Drain every worker before saving or letting a cancelled run settle.
    const results = await Promise.allSettled(workers);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
  }
  async function persistResult(run, controller) {
    assertRun(run, controller);
    if (!root.spaAuth?.isLoggedIn()) {
      run.save = { status: 'local', error: '尚未登入，分鏡保留在目前頁面，可先匯出。' }; notify(); return;
    }
    run.retry = null;
    run.save = { status: 'saving', error: null }; notify();
    const input = run.input, result = run.result;
    assertRun(run, controller);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${runOwners.get(run)}` };
    try {
      if (run.projectId) {
        if (result.generatedShotData.some(shot => !run.projectShotIds[shot.order])) {
          const detail = await requestJSON(run, controller, '/api/projects/' + encodeURIComponent(run.projectId), { headers });
          for (const shot of detail.project?.shots || []) run.projectShotIds[shot.order] = shot.id;
        }
        const uploadFailures = [];
        for (const shot of result.generatedShotData) {
          const shotId = run.projectShotIds[shot.order];
          if (!shotId) throw new Error('無法取得已儲存的鏡頭編號，請稍後重試儲存。');
          let imageRef = shot.payload.imageRef || shot.payload.image;
          if (imageRef?.startsWith('data:')) {
            const cached = run.uploadedImages[shot.order];
            if (cached?.source === imageRef && cached?.storageRef) {
              imageRef = cached.storageRef;
            } else {
              const match = /^data:(image\/(?:png|jpe?g|webp));base64,([\s\S]+)$/i.exec(imageRef);
              if (!match) {
                shot.payload.uploadStatus = 'pending_retry';
                shot.payload.uploadError = '不支援的圖片格式，無法儲存。';
                uploadFailures.push(shot.order);
                continue;
              }
              const contentType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
              try {
                const upload = await requestJSON(run, controller, `/api/projects/${encodeURIComponent(run.projectId)}/shots/${encodeURIComponent(shotId)}/image-upload`, {
                  method: 'POST', headers, body: JSON.stringify({ contentType })
                });
                const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
                const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, body: bytes, signal: controller.signal });
                assertRun(run, controller);
                if (!response.ok) throw new Error('圖片上傳至儲存空間失敗，請重試儲存。');
                const permanentRef = upload.storageRef || upload.publicUrl;
                run.uploadedImages[shot.order] = { source: imageRef, storageRef: permanentRef, url: upload.publicUrl };
                shot.payload.uploadStatus = 'uploaded';
                shot.payload.uploadError = null;
                imageRef = permanentRef;
              } catch (uploadError) {
                assertRun(run, controller);
                if (uploadError.name === 'AbortError') throw uploadError;
                // Strictly forbid Base64 fallback: mark shot pending retry while preserving other succeeded shots.
                shot.payload.uploadStatus = 'pending_retry';
                shot.payload.uploadError = uploadError.message || '圖片上傳失敗，等待重試';
                uploadFailures.push(shot.order);
                continue;
              }
            }
          }
          await requestJSON(run, controller, `/api/projects/${encodeURIComponent(run.projectId)}/shots/${encodeURIComponent(shotId)}`, {
            method: 'PATCH', headers, body: JSON.stringify({
              title: shot.title,
              camera: shot.camera,
              duration: shot.duration,
              payloadPatch: { ...shot.payload, image: imageRef, ...(imageRef?.startsWith('storage://') ? { imageRef } : {}) }
            })
          });
        }
        if (uploadFailures.length > 0) {
          throw new Error(`第 ${uploadFailures.join('、')} 鏡圖片上傳至儲存空間失敗，已保留其他完成的鏡頭，請點擊重試儲存。`);
        }
      } else {
        const metadata = {
          originalStory: input.story, generationMode: input.selectedTemplate ? 'template' : 'freeform',
          templateId: input.selectedTemplate?.id || null, templateValues: input.templateValues || {}, generationTaskId: run.taskId,
          templateSnapshot: input.selectedTemplate || null,
          targetDuration: input.duration, creativeBrief: input.creativeBrief || null
        };
        // Keep the create request free of Base64: images are uploaded to Supabase Storage per shot.
        const imagesToSave = result.generatedShotData.filter(shot => shot.payload.image?.startsWith('data:'));
        const initialShots = result.generatedShotData.map(shot => imagesToSave.includes(shot)
          ? { ...shot, payload: { ...shot.payload, image: null, imageStatus: 'pending' } } : shot);
        const data = await requestJSON(run, controller, '/api/projects', {
          method: 'POST', headers, body: JSON.stringify({
            title: result.storyboardData?.meta?.title || input.story.slice(0, 32), style: input.style.name, ratio: input.ratio,
            cover: null,
            shots: initialShots, characters: result.storyboardData?.characters || {}, metadata
          })
        });
        if (!data.project?.id) throw new Error('儲存服務未回傳專案編號，請重試儲存。');
        run.projectId = data.project.id;
        for (const shot of data.project.shots || []) run.projectShotIds[shot.order] = shot.id;
        if (data.reused || imagesToSave.length) { await persistResult(run, controller); return; }
      }
      run.save = { status: 'saved', error: null };
      root.ProjectStore?.invalidateProjects?.();
      root.ProjectStore?.invalidateProjectDetail?.(run.projectId);
      if (typeof root.clearSpaCache === 'function') root.clearSpaCache();
    } catch (error) {
      assertRun(run, controller);
      if (error.name === 'AbortError') throw error;
      run.save = { status: 'failed', error: error.message || '儲存失敗，請重試。' };
    }
    notify();
  }
  let savePromise = null;
  function retrySave() {
    if (savePromise) return savePromise;
    if (state.status !== 'completed' || !state.result.generatedShotData.length) return Promise.resolve(getState());
    const run = state, controller = new AbortController();
    currentController = controller;
    savePromise = persistResult(run, controller).then(getState).catch(error => {
      if (error.name !== 'AbortError') throw error;
      return getState();
    }).finally(() => { if (currentController === controller) currentController = null; if (state === run) savePromise = null; });
    return savePromise;
  }
  function retryFailedImages(shotIndex) {
    if (state.status === 'generating') return activePromise;
    if (savePromise || !['completed', 'error', 'cancelled'].includes(state.status) || !state.result.failedShotIndexes.length) return Promise.resolve(getState());
    const run = state, controller = new AbortController();
    currentController = controller; run.status = 'generating'; run.error = null;
    activePromise = (async () => {
      const failures = Number.isInteger(shotIndex) ? run.result.failedShotIndexes.filter(i => i === shotIndex) : [...run.result.failedShotIndexes];
      await forEachImage(run, controller, failures, async i => {
        assertRun(run, controller);
        run.progress = imageProgress(run, `重試鏡頭 ${i + 1}`); notify();
        try {
          const response = await requestImage(run, controller, run.result.generatedPrompts[i], i);
          run.result.generatedImgs[i] = response.image[0];
          Object.assign(run.result.generatedShotData[i].payload, { image: response.image[0], imageStatus: 'succeeded', imageError: '' });
          run.result.failedShotIndexes = run.result.failedShotIndexes.filter(value => value !== i);
        } catch (error) {
          assertRun(run, controller);
          run.result.generatedShotData[i].payload.imageError = error.message;
        }
        run.progress = imageProgress(run); notify();
      });
      await persistResult(run, controller);
      assertRun(run, controller);
      requireCompleteImages(run);
      run.status = 'completed'; run.progress = imageProgress(run, '圖片重試完成'); notify(); return getState();
    })().catch(error => {
      if (state === run && !controller.signal.aborted) { run.status = 'error'; run.error = { message: error.message, code: error.code }; notify(); }
      return getState();
    }).finally(() => { if (currentController === controller) currentController = null; });
    return activePromise;
  }
  function imageProgress(run, prefix = '正在生成畫面') {
    const total = run.result.storyboardData.shots.length;
    const completed = run.result.generatedShotData.filter(shot => shot?.payload.imageStatus === 'succeeded').length;
    const processed = run.result.generatedShotData.filter(shot => ['succeeded', 'failed'].includes(shot?.payload.imageStatus)).length;
    const failed = run.result.failedShotIndexes.length;
    return { pct: completed / total * 100, completed, processed, total, failed, statusText: `${prefix}，${completed} / ${total} 已完成${failed ? `，${failed} 張可重試` : ''}`, activeStepId: 'step-render' };
  }
  async function execute(run, controller, confirmed = false) {
    const input = run.input;
    const result = run.result;
    function assertActive() {
      assertRun(run, controller);
      if (controller.signal.aborted || state !== run || currentController !== controller) {
        const error = new Error('Generation cancelled');
        error.name = 'AbortError';
        throw error;
      }
    }
    function updateGenProgress(pct, statusText, activeStepId) {
      assertActive();
      run.progress = { pct, statusText, activeStepId };
      notify();
    }
    function getStoryboardPrompt() {
        const styleDetail = input.style.prompt;
        return `你是一個專業的短影音分鏡設計系統。
請分析使用者的故事描述，並為其設計一個包含分鏡鏡頭與角色設定的完整分鏡腳本。

使用者故事："""${input.story}"""
影片風格：${input.style.name} (${styleDetail})

請嚴格輸出符合以下 JSON 格式的內容，不要包含任何 markdown 外框或額外的說明文字：
{
  "meta": {
    "title": "影片標題（簡短有吸引力）"
  },
  "characters": {
    "char_1": {
      "appearance": "主角外貌特徵（英文描述，例如: young Asian woman, long black hair）",
      "outfit": "主角服裝（英文描述，例如: white t-shirt, blue jeans）",
      "personality": "性格或神情（英文描述，例如: smiling, energetic）"
    }
  },
  "shots": [
    {
      "id": 1,
      "story": "分鏡畫面發生的情節與動作描述（中文，用於畫面標題）",
      "camera": "鏡頭與運鏡方式（例如: close-up, medium shot, tracking shot）",
      "duration": "鏡頭時長（例如: 3s, 4s）",
      "emotion": "此鏡頭的情緒（例如: excited, satisfied, neutral）",
      "shotPrompt": "此鏡頭畫面的英文提示詞描述（例如: a close up of a young woman smiling in a bright kitchen）",
      "characters": ["char_1"]
    }
  ]
}
注意：
1. "shots" 中的 "characters" 必須關聯到 "characters" 物件中的 key（例如 "char_1"）。
2. 所有提示詞、角色外觀及服飾描述必須使用英文，以方便圖像生成。`;
    }

    function getRatioPrompt() {
        return {
            '橫向16:9': 'horizontal 16:9 aspect ratio, wide landscape composition',
            '直向9:16': 'vertical 9:16 aspect ratio, portrait composition, tall frame',
            '1:1': 'square 1:1 aspect ratio',
            '橫向3:2': 'horizontal 3:2 aspect ratio, landscape composition',
            '直向2:3': 'vertical 2:3 aspect ratio, portrait composition',
        }[input.ratio] || 'composition';
    }

    async function buildFinalPrompt(shot) {
        // Reviewed freeform shotPrompt already includes the user's visual constraints.
        const styleDetail = !input.selectedTemplate && input.creativeBrief ? '' : input.style.prompt;
        const rPrompt = getRatioPrompt();
        const characterData = (shot.characters || [])
            .map(id => result.storyboardData?.characters?.[id])
            .filter(Boolean);
        const shotPromptRaw = shot.shotPrompt || shot.prompt || '';

        if (characterData.length === 0) {
            return `${shotPromptRaw}, ${styleDetail}, ${rPrompt}, high quality`;
        }

        const characterPromptArray = characterData.map(char => {
            const a = char.appearance || '';
            const o = char.outfit || '';
            const p = char.personality || '';
            return [a, o, p].filter(Boolean).join(', ');
        });
      
        const characterPrompt = characterPromptArray.join(', ');
        return `${characterPrompt}, ${shotPromptRaw}, ${styleDetail}, ${rPrompt}, high quality, consistent character design`;
    }

    async function runFreeformGeneration() {
      let question = freeform.prompt(input);
      // At most one repair. Invalid scripts are never trimmed or sent to image generation.
      for (let attempt = 0; attempt < 2; attempt++) {
        run.activity.phase = attempt ? 'repairing' : 'requesting';
        run.progress.statusText = attempt ? '正在修復分鏡資料…' : '正在規劃文字分鏡…'; notify();
        const response = await askGemini(question, 'story');
        run.activity.phase = 'validating'; run.progress.statusText = '正在驗證角色、鏡頭與時長…'; notify();
        try {
          result.storyboardData = freeform.validate(safeParseJson(response.response), input.duration, input.selectedTemplate);
          if (input.confirmBeforeImages) {
            run.status = 'awaiting_confirmation';
            run.progress = { pct: 0, statusText: '分鏡企劃已就緒，確認後才會生成圖片', activeStepId: null };
            notify();
          }
          return;
        } catch (error) {
          if (attempt === 1) throw error;
          question = `${freeform.prompt(input)}\n上一份輸出未通過驗證：${error.message}\n請修正並重新輸出完整 JSON，不可截斷鏡頭。上一份輸出：${String(response.response).slice(0, 45000)}`;
          updateGenProgress(0, '正在修正分鏡規劃…', 'step-analyze');
        }
      }
    }

    async function renderShots() {
      assertActive();
      const shots = result.storyboardData.shots;
      const total = shots.length;
      run.stage = 'images';
      if (!result.generatedImgs.length) result.generatedImgs = Array(total).fill('../icon/error.jpg');
      result.generatedStoryTitles = shots.map(shot => shot.story);
      result.generatedStoryCams = shots.map(shot => shot.camera || 'medium shot');
      run.progress = imageProgress(run); notify();
      const pending = shots.map((_, i) => i).filter(i => result.generatedShotData[i]?.payload.imageStatus !== 'succeeded');
      await forEachImage(run, controller, pending, async i => {
        const shot = shots[i];
        run.progress = imageProgress(run, `正在生成第 ${i + 1} / ${total} 張畫面`); notify();
        const finalPrompt = await buildFinalPrompt(shot);
        assertActive();
        shot.finalPrompt = finalPrompt;
        result.generatedPrompts[i] = finalPrompt;
        result.generatedShotData[i] = {
          order: i + 1, title: shot.story, camera: shot.camera || 'medium shot', duration: `${positiveSeconds(shot.duration)}s`,
          payload: {
            image: '../icon/error.jpg', imageStatus: 'pending', emotion: shot.emotion || '', note: '',
            shotPrompt: shot.shotPrompt, finalPrompt, characters: shot.characters || [],
            dialogue: shot.dialogue || '', purpose: shot.purpose || '', angle: shot.angle || '', sourceStructureId: shot.sourceStructureId || null, sourceShot: shot.sourceShot || null
          }
        };
        try {
          const response = await requestImage(run, controller, finalPrompt, i);
          result.generatedImgs[i] = response.image[0];
          result.generatedShotData[i].payload.image = response.image[0];
          result.generatedShotData[i].payload.imageStatus = 'succeeded';
        } catch (error) {
          assertActive();
          if (error.name === 'AbortError') throw error;
          if (!result.failedShotIndexes.includes(i)) result.failedShotIndexes.push(i);
          result.generatedShotData[i].payload.imageStatus = 'failed';
          result.generatedShotData[i].payload.imageError = error.message;
        }
        run.progress = imageProgress(run); notify();
      });
      run.progress = imageProgress(run, '正在儲存分鏡'); notify();
      await persistResult(run, controller);
      assertActive();
      requireCompleteImages(run);
      run.progress = imageProgress(run, '分鏡生成完成'); notify();
    }

    async function askGemini(question, type) {
        assertActive();
        const res = await fetch('/api/ask-gemini', {
            signal: controller.signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(runOwners.get(run) ? { Authorization: `Bearer ${runOwners.get(run)}` } : {}) },
            body: JSON.stringify({ question, type, ratio: input.ratio, requestId: run.taskId, provider: run.provider,
                ...(type === 'story' ? { contract: 'freeform-v2', duration: input.duration, templateId: input.selectedTemplate?.id || null, includeThoughts: true } : {}) })
        });
        assertActive();
        const data = await res.json();
        assertActive();
        if (!res.ok) {
            const err = new Error(data.details || data.error || '請求異常');
            err.status = res.status;
            err.code = data.code;
            err.requestId = data.diagnostics?.requestId;
            throw err;
        }
        if (type === 'story') {
          run.activity.thoughtSummaries = Array.isArray(data.thoughtSummaries) ? data.thoughtSummaries.filter(s => typeof s === 'string').slice(0, 8).map(s => s.slice(0, 12000)) : [];
        }
        return data;
    }

    function stripNulls(value) {
        if (typeof value === 'string') return value.replace(/\u0000/g, '');
        if (Array.isArray(value)) return value.map(stripNulls);
        if (value && typeof value === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(value)) out[k] = stripNulls(v);
            return out;
        }
        return value;
    }

    function safeParseJson(text) {
        try {
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const s = cleaned.indexOf('{');
            const e = cleaned.lastIndexOf('}');
            if (s === -1 || e === -1) return null;
            return stripNulls(JSON.parse(cleaned.slice(s, e + 1)));
        } catch (e) {
            return null;
        }
    }

    try {
      assertActive();
      if (confirmed) {
        if (run.planDirty) {
          run.progress = { pct: 0, statusText: '正在同步修改後的英文圖片提示詞…', activeStepId: 'step-prompt' }; notify();
          const response = await askGemini(`依以下已確認分鏡，只更新每鏡 shotPrompt 為反映 story 與 camera 的具體英文圖片提示詞。保留並遵守原 shotPrompt 已指定的視覺風格與限制，不可套用與使用者限制衝突的預設光線。不得修改任何其他欄位，不得新增角色或改變順序。輸出完整 JSON：${JSON.stringify(result.storyboardData)}`, 'story');
          const revised = safeParseJson(response.response);
          if (!Array.isArray(revised?.shots) || revised.shots.length !== result.storyboardData.shots.length || revised.shots.some((shot, i) => shot.id !== result.storyboardData.shots[i].id)) throw new Error('提示詞同步結果不完整，請重試確認。');
          const merged = clone(result.storyboardData);
          merged.shots.forEach((shot, i) => { shot.shotPrompt = revised.shots[i].shotPrompt; });
          freeform.validate(merged, input.duration, input.selectedTemplate);
          result.storyboardData = merged; run.planDirty = false;
        }
        freeform.validate(result.storyboardData, input.duration, input.selectedTemplate);
        result.failedShotIndexes = [];
        await renderShots();
      } else {
        await runFreeformGeneration();
        if (input.confirmBeforeImages) return getState();
        assertActive();
        await renderShots();
      }
      assertActive();
      run.status = 'completed';
      notify();
    } catch (error) {
      // An obsolete run must never publish over a new task/reset/logout.
      if (state !== run || controller.signal.aborted) return getState();
      run.retry = null;
      run.status = confirmed && input.confirmBeforeImages && run.stage !== 'images' ? 'awaiting_confirmation' : 'error';
      run.error = { message: error.message || '請稍後再試', status: error.status || null,
        ...(error.code ? { code: error.code } : {}), ...(error.requestId ? { requestId: error.requestId } : {}) };
      run.progress = error.code === 'AI_IMAGES_INCOMPLETE' ? imageProgress(run, '伺服器繁忙，圖片尚未全部完成') : { pct: 0, statusText: '生成發生錯誤，請重試', activeStepId: null };
      notify();
    } finally {
      if (currentController === controller) currentController = null;
    }
    return getState();
  }
  function retryStatus(task = state, now = Date.now()) {
    if (!task.retry || task.status !== 'generating') return task.progress.statusText;
    const seconds = Math.max(0, Math.ceil((task.retry.retryAt - now) / 1000));
    return seconds ? `伺服器繁忙中，將在 ${seconds} 秒後自動重試` : `正在重新生成第 ${task.retry.shotIndex + 1} 個分鏡…`;
  }
  root.GenerationTask = { retryStatus, start, retry, retrySave, retryFailedImages, updatePlan, confirmPlan, cancel, reset, cleanup: reset, getState, subscribe };
})(typeof window !== 'undefined' ? window : globalThis);
