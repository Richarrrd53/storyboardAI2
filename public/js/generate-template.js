/* ============================================
   STORYBOARD AI — Template Generate v1
   Pipeline: story → 選/推薦模板 → 套用模板 → optimizePrompt → image
   ============================================ */

// ── 1. Embedded Templates (2.json) ──
const TEMPLATES = [
    {
        "id": "GiZBQzIH6zA",
        "name": "在新竹吃一天要花多少錢",
        "category": "story",
        "tags": ["#美食","#新竹美食","#開箱","#在地人推薦","#Vlog"],
        "description": "跟著在地人挑戰在城市吃一整天，從在地名店到手工甜點，並揭曉總花費。",
        "narrative": {
            "type": "montage",
            "structure": "起：花費懸念與社群互動截圖；承：連續開箱在地名店；轉：高節奏展示美食斷面與進食特寫；合：結尾總結並引導互動。",
            "tone": "casual",
            "summary": "透過快節奏剪輯開箱在地小吃，結合價格透明化與真實食評，帶動觀眾對在地美食的興趣。"
        },
        "hook": {
            "type": "curiosity",
            "position": "start",
            "description": "標題直切痛點「在XX吃一天要花多少錢」，搭配社群留言截圖建立真實感。"
        },
        "marketing": {
            "isImplicit": true, "exposureType": "product", "brandRole": "active",
            "integrationMethod": "plot", "revealTiming": "early",
            "persuasionStyle": "subtle",
            "targetEmotion": ["trust","curiosity","desire","relatability"]
        },
        "structure": [
            { "shot": 1, "duration": "4s", "camera": "static", "angle": "eye-level", "action": "主角在街道背景下展示推薦清單截圖", "emotion": "excited", "purpose": "建立主題懸念與可信度" },
            { "shot": 2, "duration": "2s", "camera": "close-up", "angle": "high-angle", "action": "廚師在碗中鋪滿主食食材與淋醬", "emotion": "anticipation", "purpose": "感官刺激與產品展示" },
            { "shot": 3, "duration": "5s", "camera": "static", "angle": "eye-level", "action": "主角大口吃招牌料理，露出滿足神情", "emotion": "satisfied", "purpose": "引發食慾共鳴" },
            { "shot": 4, "duration": "3s", "camera": "tracking", "angle": "low-angle", "action": "主角走向下一家店招牌並指著招牌", "emotion": "energetic", "purpose": "場景轉場與店家引導" },
            { "shot": 5, "duration": "5s", "camera": "close-up", "angle": "eye-level", "action": "大火翻炒特色料理與食材夾起特寫", "emotion": "hungry", "purpose": "強調食物新鮮度與鍋氣" },
            { "shot": 6, "duration": "7s", "camera": "close-up", "angle": "eye-level", "action": "切開脆皮食物發出清脆聲響與斷面展示", "emotion": "shock", "purpose": "ASMR聽覺爆點與質地展示" },
            { "shot": 7, "duration": "8s", "camera": "close-up", "angle": "eye-level", "action": "咬開食物展示飽滿內餡細節", "emotion": "curiosity", "purpose": "產品細節解構" },
            { "shot": 8, "duration": "12s", "camera": "handheld", "angle": "high-angle", "action": "甜點製作過程與主角咬開展示綿密感", "emotion": "satisfied", "purpose": "結尾甜點療癒與口感強調" }
        ],
        "visualFlow": { "pace": "fast", "rhythmPattern": "每3-5秒切換一個店家，食物特寫與吃播畫面1:1交叉。", "transitionStyle": "cut" },
        "promptTemplate": {
            "base": "High-quality lifestyle vlog, cinematic lighting, 4k resolution, {style} style.",
            "perShot": [
                "{character} stands in {scene} with {emotion} expression, digital UI overlay on screen showing food list.",
                "Close-up of {product} being prepared in {scene}, steam rising, {style} style.",
                "{character} is eating {product} in {scene} with {emotion} expression, satisfying look.",
                "Tracking shot of {character} walking toward a neon sign in {scene}, {style} style.",
                "Close-up of stir-frying {product} in a busy {scene}, high heat, motion blur.",
                "Macro shot of slicing {product} showing crispy texture and cross-section, {style} style.",
                "Extreme close-up of {product} being bitten into, revealing detailed ingredients in {scene}.",
                "Handheld shot of {character} enjoying {product} dessert in {scene} with {emotion} expression."
            ]
        },
        "variables": ["character","scene","emotion","style","product"],
        "controls": { "pace": ["fast"], "cameraIntensity": ["medium"], "emotionIntensity": ["high"] },
        "useCase": "美食旅遊宣傳、在地店家合輯、CP值挑戰系列",
        "platform": ["tiktok","reels","shorts"],
        "shotsCount": 8,
        "source": { "videoId": "GiZBQzIH6zA", "title": "在新竹吃一天要花多少錢", "channel": "智明", "views": 50000 },
        "analysis": {
            "whyItWorks": "利用具體的金錢懸念作為鉤子，結合高品質的食物特寫（斷面、ASMR聲），加上在地人的真實人設降低廣告感。",
            "targetAudience": "喜愛尋找台灣在地美食、學生、小資旅遊族群。",
            "replicableElements": ["螢幕標註即時價格","大口進食的特寫畫面","美食切開的清脆聲響","社群留言截圖作為內容來源"]
        },
        "confidence": 0.95,
        "version": "2.0"
    }
];

// ── 2. State ──
const state = {
    story: '',
    styleIndex: 0,
    ratio: '橫向16:9',
    selectedTemplate: null,
    resolvedVariables: {},
    finalPrompts: []
};

// ── 3. Data Sets ──
const STYLES = [
    { name: '預設風格',      dot: '#7fba7a', desc: '自然清新',   prompt: "natural lighting, high resolution, clean composition, soft focus background" },
    { name: '電影風格',      dot: '#2a2a3a', desc: '戲劇光影',   prompt: "anamorphic lens, cinematic lighting, 8k resolution, deep shadows, professional color grading" },
    { name: '二次元風格',    dot: '#ffc5e8', desc: '熱門手遊感', prompt: "anime style, cel-shaded, vibrant colors, expressive lighting, high-quality illustration" },
    { name: 'Cyberpunk風格', dot: '#6200ea', desc: '霓虹未來',   prompt: "neon palette, high contrast, futuristic street, volumetric fog, cyberpunk aesthetic" },
    { name: '美式寫實風格',  dot: '#c49a2a', desc: '溫暖金調',   prompt: "professional photography, golden hour, shallow depth of field, Kodak Portra 400 look" },
    { name: '90s 復古風格',  dot: '#f44336', desc: '懷舊膠卷',   prompt: "VHS aesthetic, vintage film grain, light leaks, chromatic aberration, retro colors" },
    { name: '水彩插畫風格',  dot: '#b8d4ff', desc: '柔和藝術',   prompt: "delicate watercolor painting, ink wash, dreamy atmosphere, paper texture, hand-drawn" },
    { name: '極簡室內風格',  dot: '#eceff1', desc: '侘寂高級感', prompt: "minimalist aesthetic, soft natural light, Wabi-sabi style, neutral tones" }
];

const LOADING_STEPS = [
    { title: '正在套用模板結構…(1/5)',   sub: '解析故事變數，對應分鏡模板',        pct: 0 },
    { title: '正在填入變數…(2/5)',        sub: '將故事元素代入 perShot 模板',       pct: 15 },
    { title: '正在優化提示詞…(3/5)',      sub: '針對風格與比例強化每個分鏡提示詞', pct: 30 },
    { title: '正在同步繪製分鏡…(4/5)',    sub: '渲染畫面，組合成完整分鏡',         pct: 50 },
    { title: '最終檢查與優化…(5/5)',      sub: '確保節奏連貫，HOOK 設計到位',      pct: 100 }
];

// ── 4. Phase management ──
function showPhase(id) {
    document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) { el.style.animation = 'none'; el.offsetHeight; el.style.animation = ''; el.classList.add('active'); }
}

// ── 5. Compose ──
const storyInput = document.getElementById('story-input');
const inputArea  = document.getElementById('compose-input-area');

function onStoryInput() {
    const val = storyInput.value.trim();
    const btn = document.getElementById('compose-send');
    btn.disabled = !val;
    state.story = val;
    adjustHeight();
}

function fillSugg(btn) {
    storyInput.value = btn.textContent;
    onStoryInput();
    storyInput.focus();
}

function submitStory() {
    const story = storyInput.value.trim();
    if (!story) return;
    state.story = story;
    document.getElementById('options-echo').textContent = story.length > 40 ? story.slice(0, 40) + '…' : story;
    storyInput.classList.add('locked');
    document.getElementById('compose-card').classList.add('expanded');
    document.getElementById('compose-options').classList.add('open');
    document.getElementById('compose-input-area').classList.add('hidden');
    document.getElementById('suggestion-row').classList.add('hidden');
    buildStyleChips();
    resetHeight();
}

function buildStyleChips() {
    const row = document.getElementById('style-chips-row');
    if (row.childElementCount > 0) return;
    STYLES.forEach((s, i) => {
        const btn = document.createElement('button');
        btn.className = 'opt-chip' + (i === 0 ? ' active' : '');
        btn.innerHTML = `<span class="style-dot" style="background:${s.dot}"></span>${s.name}`;
        btn.onclick = () => {
            row.querySelectorAll('.opt-chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            state.styleIndex = i;
        };
        row.appendChild(btn);
    });
}

function selectRatioOpt(btn) {
    document.querySelectorAll('.ratio-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    state.ratio = btn.dataset.ratio;
}

function resetCompose() {
    storyInput.classList.remove('locked');
    document.getElementById('compose-card').classList.remove('expanded');
    document.getElementById('compose-options').classList.remove('open');
    document.getElementById('compose-input-area').classList.remove('hidden');
    document.getElementById('suggestion-row').classList.remove('hidden');
    resetHeight();
}

function adjustHeight() {
    storyInput.style.height = '79px';
    inputArea.style.height = '119px';
    if (storyInput.scrollHeight > 79) {
        storyInput.style.height = Math.min(storyInput.scrollHeight, 686) + 'px';
        inputArea.style.height = Math.min(storyInput.scrollHeight + 40, 726) + 'px';
    }
}

function resetHeight() {
    storyInput.style.height = '79px';
    inputArea.style.height = '79px';
}

// ── 6. Proceed to template selection ──
async function proceedToTemplate() {
    showPhase('phase-template');
    renderTemplateGrid();
    await aiRecommendTemplate();
}

function renderTemplateGrid() {
    const grid = document.getElementById('template-grid');
    grid.innerHTML = '';
    TEMPLATES.forEach(tpl => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.id = `tpl-card-${tpl.id}`;
        card.innerHTML = `
            <span class="tc-category">${tpl.category}</span>
            <h3 class="tc-name">${tpl.name}</h3>
            <p class="tc-desc">${tpl.description}</p>
            <div class="tc-tags">${tpl.tags.slice(0,4).map(t=>`<span class="tc-tag">${t}</span>`).join('')}</div>
            <div class="tc-meta">
                <span class="tc-meta-item"><span class="tc-meta-dot"></span>${tpl.narrative.tone}</span>
                <span class="tc-meta-item"><span class="tc-meta-dot"></span>${tpl.visualFlow.pace} 節奏</span>
                <span class="tc-meta-item"><span class="tc-meta-dot"></span>${tpl.platform.join(' / ')}</span>
            </div>
            <div class="tc-footer">
                <span class="tc-shots">${tpl.shotsCount} 個分鏡</span>
                <button class="tc-preview-btn" onclick="openPreview('${tpl.id}', event)">預覽模板 →</button>
            </div>
        `;
        card.onclick = () => selectTemplate(tpl.id);
        grid.appendChild(card);
    });
}

async function aiRecommendTemplate() {
    const banner = document.getElementById('ai-recommend-banner');
    const descEl = document.getElementById('ai-rec-desc');
    const loadingEl = document.getElementById('ai-rec-loading');

    loadingEl.style.display = 'block';
    descEl.textContent = '正在分析你的故事…';

    try {
        const prompt = `你是一個短影音腳本顧問。使用者的故事描述如下：
"${state.story}"

以下是可用的模板清單（以 id 區分）：
${TEMPLATES.map(t => `- id: ${t.id}, 名稱: ${t.name}, 類別: ${t.category}, 用途: ${t.useCase}`).join('\n')}

請從中選出最適合這個故事的模板 id，並用一句話說明原因（繁體中文）。
輸出格式（嚴格按照）：
RECOMMEND: <模板id>
REASON: <一句話說明>`;

        const res = await askGemini(prompt, 'flash');
        const text = res.response || '';
        const idMatch = text.match(/RECOMMEND:\s*(.+)/);
        const reasonMatch = text.match(/REASON:\s*(.+)/);

        if (idMatch) {
            const recommendedId = idMatch[1].trim();
            const tplCard = document.getElementById(`tpl-card-${recommendedId}`);
            if (tplCard) {
                tplCard.classList.add('ai-recommended');
                // auto-select
                selectTemplate(recommendedId);
            }
        }
        descEl.textContent = reasonMatch ? reasonMatch[1].trim() : '已根據故事類型推薦最匹配的模板。';
    } catch (e) {
        descEl.textContent = '無法取得 AI 推薦，請手動選擇模板。';
        console.error(e);
    } finally {
        loadingEl.style.display = 'none';
    }
}

function selectTemplate(id) {
    state.selectedTemplate = TEMPLATES.find(t => t.id === id) || null;
    document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById(`tpl-card-${id}`);
    if (card) card.classList.add('selected');
}

function backToCompose() {
    showPhase('phase-compose');
    resetCompose();
}

// ── 7. Template Preview Drawer ──
function openPreview(id, e) {
    if (e) e.stopPropagation();
    const tpl = TEMPLATES.find(t => t.id === id);
    if (!tpl) return;

    selectTemplate(id);
    document.getElementById('preview-title').textContent = tpl.name;
    document.getElementById('preview-body').innerHTML = buildPreviewHTML(tpl);
    document.getElementById('template-preview-drawer').classList.add('open');
}

function buildPreviewHTML(tpl) {
    return `
        <!-- Description -->
        <div>
            <p class="pv-section-title">模板說明</p>
            <p class="pv-desc">${tpl.description}</p>
        </div>

        <!-- Narrative -->
        <div>
            <p class="pv-section-title">敘事結構</p>
            <div class="pv-narrative-box">
                <p class="pv-narrative-structure">${tpl.narrative.structure}</p>
                <span class="pv-tone-badge">${tpl.narrative.tone} · ${tpl.narrative.type}</span>
            </div>
        </div>

        <!-- Tags -->
        <div>
            <p class="pv-section-title">標籤</p>
            <div class="pv-tags">${tpl.tags.map(t=>`<span class="pv-tag">${t}</span>`).join('')}</div>
        </div>

        <!-- Variables -->
        <div>
            <p class="pv-section-title">可替換變數 — AI 將自動從故事中提取並填入</p>
            <div class="pv-variables">
                ${tpl.variables.map(v=>`<span class="pv-var"><span class="pv-var-icon">◆</span>{${v}}</span>`).join('')}
            </div>
        </div>

        <!-- Base prompt -->
        <div>
            <p class="pv-section-title">基底提示詞</p>
            <div class="pv-prompt-base">${tpl.promptTemplate.base}</div>
        </div>

        <!-- Structure -->
        <div>
            <p class="pv-section-title">分鏡結構（${tpl.shotsCount} 鏡）</p>
            <div class="pv-structure">
                ${tpl.structure.map((s, i) => `
                    <div class="pv-shot">
                        <div class="pv-shot-num">${s.shot}</div>
                        <div class="pv-shot-content">
                            <p class="pv-shot-action">${s.action}</p>
                            <div class="pv-shot-meta">
                                <span class="pv-shot-chip">${s.duration}</span>
                                <span class="pv-shot-chip">${s.camera}</span>
                                <span class="pv-shot-chip">${s.angle}</span>
                                <span class="pv-shot-chip">情緒: ${s.emotion}</span>
                            </div>
                            <p style="font-size:0.72rem;color:#888;margin-top:5px;">${s.purpose}</p>
                            <p style="font-size:0.72rem;color:#aaa;margin-top:4px;font-family:monospace;">${tpl.promptTemplate.perShot[i] || ''}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <!-- Why it works -->
        <div>
            <p class="pv-section-title">成功要素分析</p>
            <p class="pv-desc">${tpl.analysis.whyItWorks}</p>
        </div>

        <!-- Replicable elements -->
        <div>
            <p class="pv-section-title">可複製爆款元素</p>
            <div class="pv-variables">
                ${tpl.analysis.replicableElements.map(e=>`<span class="pv-var"><span class="pv-var-icon">✦</span>${e}</span>`).join('')}
            </div>
        </div>
    `;
}

function closePreview() {
    document.getElementById('template-preview-drawer').classList.remove('open');
}

// ── 8. Apply Template & Generate Pipeline ──
async function applyTemplateAndGenerate() {
    closePreview();
    await startTemplateGenerate();
}

let generatedImgs = [];
let generatedStoryTitles = [];
let generatedStoryCams = [];
let generatedPrompts = [];

async function startTemplateGenerate() {
    if (!state.selectedTemplate) { alert('請先選擇一個模板！'); return; }
    showPhase('phase-generating');

    const titleEl = document.getElementById('loading-title');
    const subEl   = document.getElementById('loading-sub');
    const barEl   = document.getElementById('gen-progress');
    const pctEl   = document.getElementById('gen-progress-text');

    generatedImgs = []; generatedStoryTitles = []; generatedStoryCams = []; generatedPrompts = [];

    function updateUI(idx) {
        const s = LOADING_STEPS[idx];
        if (titleEl) titleEl.textContent = s.title;
        if (subEl)   subEl.textContent   = s.sub;
        if (barEl)   barEl.style.width   = s.pct + '%';
        if (pctEl)   pctEl.textContent   = s.pct + '%';
    }

    try {
        // ── Step 1: Extract variables from story via AI ──
        updateUI(0);
        const tpl = state.selectedTemplate;
        const resolvedVars = await resolveVariablesFromStory(tpl);
        state.resolvedVariables = resolvedVars;

        // ── Step 2: Fill variables into perShot templates ──
        updateUI(1);
        const rawPrompts = tpl.promptTemplate.perShot.map(template => fillVariables(template, resolvedVars));
        generatedStoryTitles = tpl.structure.map(s => s.action);
        generatedStoryCams   = tpl.structure.map(s => `${s.camera} · ${s.angle}`);

        // ── Step 3: Optimize prompts ──
        updateUI(2);
        const styleDetail = STYLES[state.styleIndex].prompt;
        const styleName   = STYLES[state.styleIndex].name;
        const basePrompt  = fillVariables(tpl.promptTemplate.base, { ...resolvedVars, style: styleDetail });

        const optimizeReq = `以下是${rawPrompts.length}個分鏡的提示詞，請針對「${styleName}」風格（${styleDetail}）與「${state.ratio}」比例（注意畫面方向為直向或橫向）進行優化，同時保持角色與場景的連貫性。
基底風格：${basePrompt}

分鏡提示詞：
${rawPrompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}

請嚴格按照以下格式回覆（每行以數字. 開頭，不要有多餘文字）：
1. optimized prompt in English
2. optimized prompt in English
...`;

        const optimizeRes = await askGemini(optimizeReq, 'flash');
        generatedPrompts = parseNumberedList(optimizeRes.response);

        // fallback: if AI didn't return correct count
        if (generatedPrompts.length < rawPrompts.length) {
            generatedPrompts = rawPrompts;
        }

        state.finalPrompts = generatedPrompts;

        // ── Step 4: Generate images ──
        updateUI(3);
        let completedCount = 0;
        const totalSteps = generatedPrompts.length;
        subEl.innerText = `渲染畫面，組合成完整分鏡 (1/${totalSteps})`;

        const imageTasks = generatedPrompts.map(async (prompt) => {
            try {
                return await askGemini(prompt + ', ' + styleDetail, 'image');
            } finally {
                completedCount++;
                const progress = 50 + (completedCount / totalSteps) * 45;
                if (barEl) barEl.style.width = `${progress}%`;
                if (pctEl) pctEl.textContent = `${Math.floor(progress)}%`;
                if (subEl) subEl.innerText = `渲染畫面，組合成完整分鏡 (${completedCount}/${totalSteps})`;
            }
        });

        const results = await Promise.all(imageTasks);
        generatedImgs = results.filter(r => r && r.image !== undefined).map(r => r.image[0]);

        // ── Step 5: Render ──
        updateUI(4);
        setTimeout(() => {
            renderFilmStrip();
            onGenerateDone();
        }, 800);

    } catch (e) {
        console.error(e);
        alert('生成失敗：' + e.message);
        showPhase('phase-template');
    }
}

// ── 9. Variable Resolution ──
async function resolveVariablesFromStory(tpl) {
    const vars = tpl.variables;
    const styleName = STYLES[state.styleIndex].name;

    const prompt = `根據以下短影音故事描述，提取對應的變數值（繁體中文或英文皆可，以英文為佳，適合圖像生成）：

故事描述：
"${state.story}"

需要提取的變數：
${vars.map(v => `- ${v}: ${getVariableHint(v)}`).join('\n')}

風格偏好：${styleName}

請嚴格按照以下格式輸出（每行一個變數，格式：變數名稱: 值）：
${vars.map(v => `${v}: <值>`).join('\n')}

重要：只輸出變數清單，不要有其他說明文字。`;

    try {
        const res = await askGemini(prompt, 'flash');
        const text = res.response || '';
        const resolved = { style: STYLES[state.styleIndex].prompt };

        vars.forEach(v => {
            const regex = new RegExp(`${v}:\\s*(.+)`, 'i');
            const match = text.match(regex);
            if (match) {
                resolved[v] = match[1].trim().replace(/<[^>]+>/g, '').trim();
            } else {
                resolved[v] = getVariableFallback(v, state.story);
            }
        });

        return resolved;
    } catch (e) {
        // fallback to simple defaults
        const resolved = { style: STYLES[state.styleIndex].prompt };
        vars.forEach(v => { resolved[v] = getVariableFallback(v, state.story); });
        return resolved;
    }
}

function getVariableHint(varName) {
    const hints = {
        character: '主角描述（外觀、服裝、年齡）',
        scene: '場景描述（地點、環境）',
        emotion: '主要情緒（excited, satisfied, curious等）',
        style: '視覺風格',
        product: '產品或食物名稱'
    };
    return hints[varName] || '根據故事推斷';
}

function getVariableFallback(varName, story) {
    const fallbacks = {
        character: 'young Asian person, casual outfit',
        scene: 'busy street food market, Taiwan',
        emotion: 'excited and curious',
        style: STYLES[state.styleIndex].prompt,
        product: 'local street food dish'
    };
    return fallbacks[varName] || varName;
}

function fillVariables(template, vars) {
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `[${key}]`);
}

// ── 10. Film Strip Rendering (from generate.js) ──
let isHorizon = false;

function renderFilmStrip() {
    const grid = document.getElementById('storyboard-grid');
    grid.innerHTML = '';

    const ratioKey = getRatioKey(state.ratio);
    const frameWidth = { '16-9': 1066, '9-16': 337.5, '3-2': 900, '2-3': 400, '1-1': 600 }[ratioKey] || 600;

    isHorizon = window.innerWidth < window.innerHeight;

    const controls = document.createElement('div');
    controls.className = 'film-strip-controls';
    controls.innerHTML = `
        <button class="film-strip-button" onclick="exportStoryboardJson()">↓ 匯出 JSON</button>
        <button class="film-strip-button" onclick="resetAll()">+ 新建分鏡</button>
    `;
    grid.appendChild(controls);

    const wrapper = document.createElement('div');
    wrapper.className = 'film-strip-container';
    wrapper.id = 'filmStripWrapper';
    if (isHorizon) wrapper.classList.add('mobile');
    grid.appendChild(wrapper);

    const filmStrip = document.createElement('div');
    filmStrip.className = 'film-strip';
    filmStrip.id = 'filmStrip';
    wrapper.appendChild(filmStrip);

    const count = Math.max(generatedImgs.length, generatedStoryTitles.length);

    for (let i = 0; i < count; i++) {
        const img = generatedImgs[i];
        const title = generatedStoryTitles[i] || `分鏡 ${i + 1}`;
        const cam   = generatedStoryCams[i] || '';

        const frame = document.createElement('div');
        frame.className = `film-frame ratio-${ratioKey}`;
        frame.innerHTML = `
            <div class="frame-number">#${String(i + 1).padStart(2, '0')}</div>
            <div class="frame-image-container ${img ? '' : 'failed-image'}">
                ${img
                    ? `<img class="frame-image" src="${img}" alt="分鏡 ${i + 1}" />`
                    : `<div class="error-message">⚠ 圖片生成失敗</div>`
                }
                <div class="frame-overlay">
                    <div class="frame-content">
                        <div class="frame-title">${title}</div>
                        <div class="frame-description">${cam}</div>
                        <div class="frame-actions">
                            <button class="frame-button">複製提示詞</button>
                            <button class="frame-button">重新生成</button>
                        </div>
                    </div>
                </div>
                ${!img ? `<button class="frame-button regenerate" onclick="">重新生成</button>` : ''}
            </div>
        `;
        filmStrip.appendChild(frame);
    }

    const totalWidth  = count * (frameWidth + 16);
    const totalHeight = count * (600 + 16);
    const edgeWidth   = window.innerWidth - 40;
    const mobileFrameH = getHeightFromRatio(edgeWidth - 110, ratioKey);
    const totalHeightMobile = count * (mobileFrameH + 16);

    if (isHorizon) {
        wrapper.style.setProperty('--film-strip-edge-width',  `${edgeWidth}px`);
        wrapper.style.setProperty('--film-strip-edge-height', `${totalHeightMobile}px`);
    } else {
        wrapper.style.setProperty('--film-strip-edge-width', `${totalWidth}px`);
    }

    initDragScroll(wrapper);
}

function getRatioKey(ratio) {
    const map = { '橫向16:9': '16-9', '直向9:16': '9-16', '橫向3:2': '3-2', '直向2:3': '2-3', '1:1': '1-1' };
    return map[ratio] || '16-9';
}

function getHeightFromRatio(width, ratio) {
    const parts = ratio.split('-');
    return width / parseInt(parts[0]) * parseInt(parts[1]);
}

function initDragScroll(el) {
    let isDown = false, startX, startY, scrollLeft, scrollTop;
    const getPos = e => { const t = e.touches ? e.touches[0] : e; return { x: t.pageX, y: t.pageY }; };
    const start = e => {
        isDown = true; el.style.cursor = 'grabbing'; el.style.scrollBehavior = 'auto';
        const pos = getPos(e);
        const isV = el.classList.contains('mobile');
        if (isV) { startY = pos.y - el.offsetTop; scrollTop  = el.scrollTop; }
        else     { startX = pos.x - el.offsetLeft; scrollLeft = el.scrollLeft; }
    };
    const end  = () => { isDown = false; el.style.cursor = 'grab'; };
    const move = e => {
        if (!isDown) return;
        const isV = el.classList.contains('mobile');
        const pos = getPos(e);
        if (isV) { el.scrollTop  = scrollTop  - (pos.y - el.offsetTop  - startY) * 2; }
        else     { el.scrollLeft = scrollLeft - (pos.x - el.offsetLeft - startX) * 2; }
    };
    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('mouseleave', end);
    el.addEventListener('mouseup', end);
    el.addEventListener('touchend', end);
    el.addEventListener('mousemove', e => { if (isDown) e.preventDefault(); move(e); });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('wheel', e => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            el.style.scrollBehavior = 'smooth';
            if (el.classList.contains('mobile')) el.scrollTop  += 5 * e.deltaY;
            else                                 el.scrollLeft += 5 * e.deltaY;
        }
    }, { passive: false });
}

window.addEventListener('resize', () => {
    const wrapper = document.getElementById('filmStripWrapper');
    if (!wrapper) return;
    const ratioKey = getRatioKey(state.ratio);
    const frameWidth = { '16-9': 1066, '9-16': 337.5, '3-2': 900, '2-3': 400, '1-1': 600 }[ratioKey] || 600;
    const count = Math.max(generatedImgs.length, generatedStoryTitles.length);
    isHorizon = window.innerWidth < window.innerHeight;
    const edgeWidth = window.innerWidth - 40;
    const mobileFrameH = getHeightFromRatio(edgeWidth - 110, ratioKey);
    const totalHeightMobile = count * (mobileFrameH + 16);
    if (isHorizon) {
        wrapper.classList.add('mobile');
        wrapper.style.setProperty('--film-strip-edge-width',  `${edgeWidth}px`);
        wrapper.style.setProperty('--film-strip-edge-height', `${totalHeightMobile}px`);
    } else {
        wrapper.classList.remove('mobile');
        wrapper.style.setProperty('--film-strip-edge-width', `${count * (frameWidth + 16)}px`);
    }
});

// ── 11. Result / Done ──
function onGenerateDone() {
    const tpl = state.selectedTemplate;
    const meta = document.getElementById('result-meta');
    if (meta) {
        meta.textContent = `${state.story.length > 30 ? state.story.slice(0, 30) + '…' : state.story} · ${STYLES[state.styleIndex].name} · ${state.ratio}`;
    }

    // Show template badge
    const badge = document.getElementById('result-template-badge');
    if (badge && tpl) {
        badge.style.display = 'flex';
        document.getElementById('badge-template-name').textContent = tpl.name;
        const vars = Object.entries(state.resolvedVariables)
            .filter(([k]) => k !== 'style')
            .map(([k, v]) => `${k}: ${String(v).slice(0, 20)}`)
            .join(' · ');
        document.getElementById('badge-vars').textContent = vars;
    }

    showPhase('phase-result');
}

// ── 12. Reset ──
function resetAll() {
    state.story = '';
    state.styleIndex = 0;
    state.ratio = '橫向16:9';
    state.selectedTemplate = null;
    state.resolvedVariables = {};
    state.finalPrompts = [];
    generatedImgs = []; generatedStoryTitles = []; generatedStoryCams = []; generatedPrompts = [];
    storyInput.value = '';
    storyInput.classList.remove('locked');
    document.getElementById('compose-card').classList.remove('expanded');
    document.getElementById('compose-options').classList.remove('open');
    document.getElementById('compose-input-area').classList.remove('hidden');
    document.getElementById('suggestion-row').classList.remove('hidden');
    document.getElementById('style-chips-row').innerHTML = '';
    document.querySelectorAll('.ratio-chip').forEach((c, i) => { c.classList.toggle('active', i === 0); });
    state.ratio = '橫向16:9';
    resetHeight();
    document.getElementById('result-template-badge').style.display = 'none';
    document.getElementById('storyboard-grid').innerHTML = '';
    showPhase('phase-compose');
}

// ── 13. Export ──
function exportStoryboardJson() {
    const tpl = state.selectedTemplate;
    const exportData = {
        metadata: {
            originalStory: state.story,
            template: tpl ? { id: tpl.id, name: tpl.name } : null,
            resolvedVariables: state.resolvedVariables,
            style: STYLES[state.styleIndex].name,
            ratio: state.ratio,
            exportTime: new Date().toISOString()
        },
        frames: generatedStoryTitles.map((title, i) => ({
            id: i + 1,
            title,
            camera: generatedStoryCams[i] || '',
            prompt: generatedPrompts[i] || '',
            image: generatedImgs[i] || ''
        }))
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 4));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `Storyboard_Template_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ── 14. Helpers ──
async function askGemini(question, type) {
    const res = await fetch('/api/ask-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, type })
    });
    return await res.json();
}

function parseNumberedList(text) {
    if (!text) return [];
    return text.split('\n')
        .map(line => line.trim())
        .filter(line => line.match(/^\d+[\.\:]/))
        .map(line => line.replace(/^\d+[\.\:]\s*/, '').trim());
}

// ── 15. Init ──
document.addEventListener('DOMContentLoaded', () => {
    storyInput.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey && !storyInput.classList.contains('locked')) {
            e.preventDefault();
            submitStory();
            storyInput.blur();
        }
    });
    storyInput.addEventListener('input', () => { resetHeight(); adjustHeight(); });
});