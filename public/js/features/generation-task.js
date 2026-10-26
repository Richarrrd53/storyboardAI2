/**
 * App-level generation task. Survives page unmount; never owns page DOM.
 * Existing API is sequential request/response (there is no backend polling endpoint).
 * Persistence here means SPA route lifetime, not reload/server job resumption.
 */
(function (root) {
  'use strict';
  if (root.GenerationTask) return;

  const listeners = new Set();
  let sequence = 0;
  let currentController = null;
  let activePromise = null;
  const freeform = root.FreeformStoryboard;
  const clone = value => JSON.parse(JSON.stringify(value));
  function initialState() {
    return {
      taskId: null, projectId: null, projectShotIds: {}, status: 'idle', input: null, error: null, planDirty: false, stage: 'planning',
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
    run.taskId = `generation-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2, 10)}`;
    run.status = 'generating';
    run.input = clone(options);
    if (!options.selectedTemplate) run.input.duration = freeform.duration(options.duration);
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
    state.progress = { pct: 0, statusText: '生成已中斷', activeStepId: null };
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
    if (!state.input?.selectedTemplate && state.result.storyboardData && ['error', 'cancelled'].includes(state.status)) {
      state.status = 'awaiting_confirmation'; state.error = null; notify();
      return Promise.resolve(getState());
    }
    return state.input ? start(state.input) : Promise.resolve(getState());
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
    try { freeform.validate(state.result.storyboardData, state.input.duration); }
    catch (error) { state.error = { message: error.message }; notify(); return Promise.resolve(getState()); }
    const run = state, controller = new AbortController();
    currentController = controller; run.status = 'generating'; run.stage = 'images'; run.error = null;
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
    if (state !== run || controller.signal.aborted) {
      const error = new Error('Generation cancelled'); error.name = 'AbortError'; throw error;
    }
  }
  async function requestJSON(run, controller, url, options) {
    const response = await fetch(url, { ...options, signal: controller.signal });
    assertRun(run, controller);
    const data = await response.json();
    assertRun(run, controller);
    if (!response.ok) { const error = new Error(data.error || '服務暫時無法處理，請稍後再試'); error.status = response.status; throw error; }
    return data;
  }
  async function persistResult(run, controller) {
    assertRun(run, controller);
    if (!root.spaAuth?.isLoggedIn()) {
      run.save = { status: 'local', error: '尚未登入，分鏡保留在目前頁面，可先匯出。' }; notify(); return;
    }
    run.save = { status: 'saving', error: null }; notify();
    const input = run.input, result = run.result;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${root.spaAuth.getToken()}` };
    try {
      if (run.projectId) {
        if (result.generatedShotData.some(shot => !run.projectShotIds[shot.order])) {
          const detail = await requestJSON(run, controller, '/api/projects/' + encodeURIComponent(run.projectId), { headers });
          for (const shot of detail.project?.shots || []) run.projectShotIds[shot.order] = shot.id;
        }
        for (const shot of result.generatedShotData) {
          const shotId = run.projectShotIds[shot.order];
          if (!shotId) throw new Error('無法取得已儲存的鏡頭編號，請稍後重試儲存。');
          await requestJSON(run, controller, `/api/projects/${encodeURIComponent(run.projectId)}/shots/${encodeURIComponent(shotId)}`, {
            method: 'PATCH', headers, body: JSON.stringify({ title: shot.title, camera: shot.camera, duration: shot.duration, payloadPatch: shot.payload })
          });
        }
      } else {
        const metadata = {
          originalStory: input.story, generationMode: input.selectedTemplate ? 'template' : 'freeform',
          templateId: input.selectedTemplate?.id || null, templateValues: input.templateValues || {}, generationTaskId: run.taskId,
          templateSnapshot: input.selectedTemplate || null,
          ...(!input.selectedTemplate ? { targetDuration: input.duration, creativeBrief: input.creativeBrief || null } : {})
        };
        const data = await requestJSON(run, controller, '/api/projects', {
          method: 'POST', headers, body: JSON.stringify({
            title: result.storyboardData?.meta?.title || input.story.slice(0, 32), style: input.style.name, ratio: input.ratio,
            cover: result.generatedShotData.find(shot => shot.payload.imageStatus === 'succeeded')?.payload.image || null,
            shots: result.generatedShotData, characters: result.storyboardData?.characters || {}, metadata
          })
        });
        if (!data.project?.id) throw new Error('儲存服務未回傳專案編號，請重試儲存。');
        run.projectId = data.project.id;
        for (const shot of data.project.shots || []) run.projectShotIds[shot.order] = shot.id;
        if (data.reused) { await persistResult(run, controller); return; }
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
    if (savePromise || state.status !== 'completed' || !state.result.failedShotIndexes.length) return Promise.resolve(getState());
    const run = state, controller = new AbortController();
    currentController = controller; run.status = 'generating'; run.error = null;
    activePromise = (async () => {
      const failures = Number.isInteger(shotIndex) ? run.result.failedShotIndexes.filter(i => i === shotIndex) : [...run.result.failedShotIndexes];
      for (let index = 0; index < failures.length; index++) {
        const i = failures[index];
        assertRun(run, controller);
        run.progress = imageProgress(run, `重試鏡頭 ${i + 1}`); notify();
        try {
          const response = await requestJSON(run, controller, '/api/ask-gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: run.result.generatedPrompts[i], type: 'image', ratio: run.input.ratio }) });
          if (!response.image?.[0]) throw new Error('圖像服務沒有回傳圖片');
          run.result.generatedImgs[i] = response.image[0];
          Object.assign(run.result.generatedShotData[i].payload, { image: response.image[0], imageStatus: 'succeeded', imageError: '' });
          run.result.failedShotIndexes = run.result.failedShotIndexes.filter(value => value !== i);
        } catch (error) {
          assertRun(run, controller);
          run.result.generatedShotData[i].payload.imageError = error.message;
        }
        run.progress = imageProgress(run); notify();
      }
      await persistResult(run, controller);
      assertRun(run, controller);
      run.status = 'completed'; run.progress = imageProgress(run, '圖片重試完成'); notify(); return getState();
    })().catch(error => {
      if (state === run && !controller.signal.aborted) { run.status = 'error'; run.error = { message: error.message }; notify(); }
      return getState();
    }).finally(() => { if (currentController === controller) currentController = null; });
    return activePromise;
  }
  function imageProgress(run, prefix = '正在生成畫面') {
    const total = run.result.storyboardData.shots.length;
    const completed = run.result.generatedShotData.filter(shot => shot?.payload.imageStatus === 'succeeded').length;
    const processed = run.result.generatedShotData.filter(shot => ['succeeded', 'failed'].includes(shot?.payload.imageStatus)).length;
    return { pct: completed / total * 100, completed, processed, total, statusText: `${prefix}，${completed} / ${total} 已完成`, activeStepId: 'step-render' };
  }
  async function execute(run, controller, confirmed = false) {
    const input = run.input;
    const result = run.result;
    function assertActive() {
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
        const response = await askGemini(question, 'story');
        try {
          result.storyboardData = freeform.validate(safeParseJson(response.response), input.duration);
          run.status = 'awaiting_confirmation';
          run.progress = { pct: 0, statusText: '分鏡企劃已就緒，確認後才會生成圖片', activeStepId: null };
          notify(); return;
        } catch (error) {
          if (attempt === 1) throw error;
          question = `${freeform.prompt(input)}\n上一份輸出未通過驗證：${error.message}\n請修正並重新輸出完整 JSON，不可截斷鏡頭。上一份輸出：${String(response.response).slice(0, 45000)}`;
          updateGenProgress(0, '正在修正分鏡規劃…', 'step-analyze');
        }
      }
    }

    async function runTemplateGeneration() {
      const tpl = input.selectedTemplate;
      if (!Array.isArray(tpl.structure) || !tpl.structure.length) throw new Error('此模板沒有分鏡結構，請選擇其他模板或使用自由生成。');
      const values = { style: input.style.name, ...(input.templateValues || {}) };
      const replace = text => String(text || '').replace(/\{([\w-]+)\}/g, (match, key) => String(values[key] ?? '').trim() || match);
      const reference = {
        name: tpl.name, narrative: tpl.narrative, hook: tpl.hook, marketing: tpl.marketing,
        visualFlow: tpl.visualFlow, controls: tpl.controls,
        basePrompt: replace(tpl.promptTemplate?.base),
        shots: tpl.structure.map((shot, index) => ({ ...shot, id: index + 1, referencePrompt: replace(tpl.promptTemplate?.perShot?.[index]) }))
      };
      updateGenProgress(15, '正在依照企劃改寫模板腳本與角色...', 'step-analyze');
      const prompt = getStoryboardPrompt() + `
請將參考模板改寫為上述使用者的新企劃，不要複製原影片的商品、場景或角色。
參考模板：${JSON.stringify(reference)}
使用者指定的可替換內容：${JSON.stringify(values)}
必須輸出剛好 ${tpl.structure.length} 個 shots，維持原鏡頭順序、敘事目的、時長、運鏡與角度。
每鏡 story 與 shotPrompt 必須依新企劃改寫，角色描述在所有鏡頭保持一致。
shots 可另外提供 angle、purpose、dialogue（中文對白或旁白）、emotion。
沒填寫的變數請依企劃合理規劃。英文 shotPrompt 不得留下 {variable} 佔位符。`;
      const response = await askGemini(prompt, 'story');
      const storyboard = validateStoryboard(safeParseJson(response.response));
      if (storyboard.shots.length !== tpl.structure.length) throw new Error('改寫鏡頭數與模板不一致，請重試生成。');
      storyboard.shots = storyboard.shots.map((shot, index) => ({
        ...shot, id: index + 1, duration: `${positiveSeconds(tpl.structure[index].duration)}s`,
        camera: tpl.structure[index].camera || shot.camera || 'medium shot',
        angle: tpl.structure[index].angle || shot.angle || '',
        purpose: tpl.structure[index].purpose || shot.purpose || '', sourceShot: index + 1
      }));
      if (storyboard.shots.some(shot => /\{[\w-]+\}/.test(shot.shotPrompt))) throw new Error('分鏡提示詞仍含未填寫的變數，請重試生成。');
      result.storyboardData = storyboard;
      await renderShots();
    }

    async function renderShots() {
      const shots = result.storyboardData.shots;
      const total = shots.length;
      run.stage = 'images';
      if (!result.generatedImgs.length) result.generatedImgs = Array(total).fill('../icon/error.jpg');
      result.generatedStoryTitles = shots.map(shot => shot.story);
      result.generatedStoryCams = shots.map(shot => shot.camera || 'medium shot');
      run.progress = imageProgress(run); notify();
      for (let i = 0; i < total; i++) {
        const shot = shots[i];
        if (result.generatedShotData[i]?.payload.imageStatus === 'succeeded') continue;
        const finalPrompt = await buildFinalPrompt(shot);
        assertActive();
        shot.finalPrompt = finalPrompt;
        result.generatedPrompts[i] = finalPrompt;
        result.generatedShotData[i] = {
          order: i + 1, title: shot.story, camera: shot.camera || 'medium shot', duration: `${positiveSeconds(shot.duration)}s`,
          payload: {
            image: '../icon/error.jpg', imageStatus: 'pending', emotion: shot.emotion || '', note: '',
            shotPrompt: shot.shotPrompt, finalPrompt, characters: shot.characters || [],
            dialogue: shot.dialogue || '', purpose: shot.purpose || '', angle: shot.angle || '', sourceShot: shot.sourceShot || null
          }
        };
        try {
          const response = await askGemini(finalPrompt, 'image');
          if (!response?.image?.[0]) throw new Error('圖像服務沒有回傳圖片');
          result.generatedImgs[i] = response.image[0];
          result.generatedShotData[i].payload.image = response.image[0];
          result.generatedShotData[i].payload.imageStatus = 'succeeded';
        } catch (error) {
          assertActive();
          if (error.name === 'AbortError') throw error;
          result.failedShotIndexes.push(i);
          result.generatedShotData[i].payload.imageStatus = 'failed';
          result.generatedShotData[i].payload.imageError = error.message;
        }
        run.progress = imageProgress(run); notify();
      }
      run.progress = imageProgress(run, '正在儲存分鏡'); notify();
      await persistResult(run, controller);
      run.progress = imageProgress(run, result.failedShotIndexes.length ? '部分圖片可重試' : '分鏡生成完成'); notify();
    }

    async function askGemini(question, type) {
        const res = await fetch('/api/ask-gemini', {
            signal: controller.signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question, type, ratio: input.ratio })
        });
        assertActive();
        const data = await res.json();
        assertActive();
        if (!res.ok) {
            const err = new Error(data.error || '請求異常');
            err.status = res.status;
            throw err;
        }
        return data;
    }

    function safeParseJson(text) {
        try {
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const s = cleaned.indexOf('{');
            const e = cleaned.lastIndexOf('}');
            if (s === -1 || e === -1) return null;
            return JSON.parse(cleaned.slice(s, e + 1));
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
          freeform.validate(merged, input.duration);
          result.storyboardData = merged; run.planDirty = false;
        }
        freeform.validate(result.storyboardData, input.duration);
        result.failedShotIndexes = [];
        await renderShots();
      } else if (input.selectedTemplate) await runTemplateGeneration();
      else { await runFreeformGeneration(); return getState(); }
      assertActive();
      run.status = 'completed';
      notify();
    } catch (error) {
      // An obsolete run must never publish over a new task/reset/logout.
      if (state !== run || controller.signal.aborted) return getState();
      run.status = confirmed ? 'awaiting_confirmation' : 'error';
      run.error = { message: error.message || '請稍後再試', status: error.status || null };
      run.progress = { pct: 0, statusText: '生成發生錯誤，請重試', activeStepId: null };
      notify();
    } finally {
      if (currentController === controller) currentController = null;
    }
    return getState();
  }
  root.GenerationTask = { start, retry, retrySave, retryFailedImages, updatePlan, confirmPlan, cancel, reset, cleanup: reset, getState, subscribe };
})(typeof window !== 'undefined' ? window : globalThis);
