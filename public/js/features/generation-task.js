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
  const clone = value => JSON.parse(JSON.stringify(value));
  function initialState() {
    return {
      taskId: null, projectId: null, status: 'idle', input: null, error: null,
      progress: { pct: 0, statusText: '', activeStepId: null },
      result: { storyboardData: null, generatedImgs: [], generatedStoryTitles: [],
        generatedStoryCams: [], generatedPrompts: [], generatedShotData: [] }
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
    if (!options?.story) return Promise.resolve(getState());
    if (!options.style) throw new Error('GenerationTask requires a style snapshot');
    const controller = new AbortController();
    currentController = controller;
    const run = initialState();
    run.taskId = `generation-${Date.now()}-${++sequence}`;
    run.status = 'generating';
    run.input = clone(options);
    run.progress = { pct: 5, statusText: '解析故事靈感與結構...', activeStepId: 'step-analyze' };
    state = run;
    activePromise = Promise.resolve().then(() => execute(run, controller));
    notify();
    return activePromise;
  }
  function cancel() {
    if (state.status !== 'generating') return false;
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
    state = initialState();
    notify();
  }
  function retry() {
    if (state.status === 'generating') return activePromise;
    return state.input ? start(state.input) : Promise.resolve(getState());
  }
  async function execute(run, controller) {
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
    function delay(ms) {
      assertActive();
      return new Promise((resolve, reject) => {
        const finish = () => {
          controller.signal.removeEventListener('abort', abort);
          try { assertActive(); resolve(); } catch (error) { reject(error); }
        };
        const timer = setTimeout(finish, ms);
        const abort = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener('abort', abort);
          const error = new Error('Generation cancelled');
          error.name = 'AbortError';
          reject(error);
        };
        controller.signal.addEventListener('abort', abort, { once: true });
      });
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
        const styleDetail = input.style.prompt;
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
        const prompt = getStoryboardPrompt();
        const storyboardRes = await askGemini(prompt, 'story');
        assertActive();
        result.storyboardData = safeParseJson(storyboardRes.response);
        if (!result.storyboardData) throw new Error('無法解析故事結構 JSON');

        updateGenProgress(30, '編排鏡頭敘事結構與視角...', 'step-structure');
        await delay(600);

        const shots = result.storyboardData.shots || [];
        const total = shots.length;
        result.generatedImgs = Array(total).fill('../icon/error.jpg');
        result.generatedStoryTitles = Array(total).fill('');
        result.generatedStoryCams = Array(total).fill('');

        updateGenProgress(50, '繪製分鏡草稿提示詞...', 'step-prompt');

        let completedCount = 0;
        for (let i = 0; i < total; i++) {
            const shot = shots[i];
            result.generatedStoryTitles[i] = shot.story;
            result.generatedStoryCams[i] = shot.camera;

            const finalPrompt = await buildFinalPrompt(shot);
            assertActive();
            shot.finalPrompt = finalPrompt;
            result.generatedPrompts[i] = finalPrompt;

            try {
                const res = await askGemini(finalPrompt, 'image');
                const imgSrc = (res?.image?.length > 0) ? res.image[0] : '../icon/error.jpg';
                result.generatedImgs[i] = imgSrc;
                if (res?.image?.length > 0) completedCount++;
                // 寫入 normalized shot data
                result.generatedShotData[i] = {
                    order: i + 1,
                    title: shot.story || `鏡頭 ${i + 1}`,
                    camera: shot.camera || '',
                    duration: shot.duration || '3s',
                    payload: {
                        image: imgSrc,
                        emotion: shot.emotion || '',
                        note: '',
                        shotPrompt: shot.shotPrompt || '',
                        finalPrompt: finalPrompt,
                        characters: shot.characters || []
                    }
                };
            } catch (e) {
                assertActive();
                if (e.name === 'AbortError') throw e;
                console.error(`Image generation failed for shot ${i + 1}`, e);
                result.generatedShotData[i] = {
                    order: i + 1,
                    title: shot.story || `鏡頭 ${i + 1}`,
                    camera: shot.camera || '',
                    duration: shot.duration || '3s',
                    payload: {
                        image: '../icon/error.jpg',
                        emotion: shot.emotion || '',
                        note: '',
                        shotPrompt: shot.shotPrompt || '',
                        finalPrompt: finalPrompt,
                        characters: shot.characters || []
                    }
                };
            }

            const progress = 50 + (completedCount / total) * 42;
            updateGenProgress(progress, `正在沖洗第 ${i + 1} / ${total} 張分鏡底片...`, 'step-render');
            if (i < total - 1) await delay(800);
        }

        updateGenProgress(95, '正在將分鏡儲存至資料庫...', 'step-render');
        run.projectId = await saveProjectToDatabase();

        updateGenProgress(100, '分鏡草稿沖洗完成！', 'step-render');
        await delay(500);


    }

    async function runTemplateGeneration() {
        const tpl = input.selectedTemplate;
        const total = tpl.shotsCount || (tpl.structure ? tpl.structure.length : 4);
        result.generatedImgs = Array(total).fill('../icon/error.jpg');
        result.generatedStoryTitles = Array(total).fill('');
        result.generatedStoryCams = Array(total).fill('');

        updateGenProgress(25, `正在套用「${tpl.name}」爆點結構...`, 'step-structure');
        await delay(500);

        updateGenProgress(50, '正在優化每個鏡頭的提示詞...', 'step-prompt');
        await delay(500);

        const styleDetail = input.style.prompt;
        for (let i = 0; i < total; i++) {
            const shot = tpl.structure?.[i] || {};
            result.generatedStoryTitles[i] = shot.action || `鏡頭 ${i + 1}`;
            result.generatedStoryCams[i] = shot.camera || 'medium shot';

            const imagePrompt = `${shot.action || ''}, ${input.story}, ${styleDetail}, ${getRatioPrompt()}`;
            result.generatedPrompts[i] = imagePrompt;
            try {
                const res = await askGemini(imagePrompt, 'image');
                const imgSrc = (res?.image?.length > 0) ? res.image[0] : '../icon/error.jpg';
                result.generatedImgs[i] = imgSrc;
                // 寫入 normalized shot data
                result.generatedShotData[i] = {
                    order: i + 1,
                    title: shot.action || `鏡頭 ${i + 1}`,
                    camera: shot.camera || 'medium shot',
                    duration: shot.duration || '3s',
                    payload: {
                        image: imgSrc,
                        emotion: '',
                        note: '',
                        shotPrompt: imagePrompt,
                        finalPrompt: imagePrompt,
                        characters: []
                    }
                };
            } catch (e) {
                assertActive();
                if (e.name === 'AbortError') throw e;
                console.error(`Template image ${i + 1} failed`, e);
                result.generatedShotData[i] = {
                    order: i + 1,
                    title: shot.action || `鏡頭 ${i + 1}`,
                    camera: shot.camera || 'medium shot',
                    duration: shot.duration || '3s',
                    payload: {
                        image: '../icon/error.jpg',
                        emotion: '',
                        note: '',
                        shotPrompt: imagePrompt,
                        finalPrompt: imagePrompt,
                        characters: []
                    }
                };
            }

            const progress = 50 + ((i + 1) / total) * 42;
            updateGenProgress(progress, `正在著色第 ${i + 1} / ${total} 張模板分鏡...`, 'step-render');
            if (i < total - 1) await delay(800);
        }

        updateGenProgress(95, '備份至雲端資料庫...', 'step-render');
        run.projectId = await saveProjectToDatabase();

        updateGenProgress(100, '模板分鏡生成完成！', 'step-render');
        await delay(500);


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

    async function saveProjectToDatabase() {
        if (!root.spaAuth || !root.spaAuth.isLoggedIn()) return null;
        try {
            const title = input.selectedTemplate?.name 
                || result.storyboardData?.meta?.title 
                || (input.story.slice(0, 24) + '...');
            const style = input.style.name;
            const ratio = input.ratio;
            const cover = result.generatedImgs[0] || null;

            // 使用 normalized generatedShotData，若尚未建立則 fallback 舊邏輯
            const shots = (result.generatedShotData && result.generatedShotData.length > 0)
                ? result.generatedShotData
                : result.generatedImgs.map((img, i) => ({
                    order: i + 1,
                    title: result.generatedStoryTitles[i] || '',
                    camera: result.generatedStoryCams[i] || '',
                    duration: '3s',
                    payload: { image: img }
                }));

            const characters = result.storyboardData?.characters || {};
            const metadata = {
                originalStory: input.story || '',
                generationMode: input.selectedTemplate ? 'template' : 'freeform',
                templateId: input.selectedTemplate?.id || null
            };

            const token = root.spaAuth.getToken();
            const res = await fetch('/api/projects', {
                signal: controller.signal,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title, style, ratio, cover, shots, characters, metadata })
            });
            assertActive();
            if (!res.ok) return null;
            const json = await res.json();
            assertActive();
            if (typeof root.clearSpaCache === 'function') root.clearSpaCache();
            return json.project?.id;
        } catch (e) {
            assertActive();
            if (e.name === 'AbortError') throw e;
            console.error("Failed to auto-save project:", e);
            return null;
        }
    }


    try {
      assertActive();
      if (input.selectedTemplate) await runTemplateGeneration();
      else await runFreeformGeneration();
      assertActive();
      run.status = 'completed';
      notify();
    } catch (error) {
      // An obsolete run must never publish over a new task/reset/logout.
      if (state !== run || controller.signal.aborted) return getState();
      run.status = 'error';
      run.error = { message: error.message || '請稍後再試', status: error.status || null };
      run.progress = { pct: 0, statusText: '生成發生錯誤，請重試', activeStepId: null };
      notify();
    } finally {
      if (currentController === controller) currentController = null;
    }
    return getState();
  }
  root.GenerationTask = { start, retry, cancel, reset, cleanup: reset, getState, subscribe };
})(typeof window !== 'undefined' ? window : globalThis);
