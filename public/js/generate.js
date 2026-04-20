/* ============================================
   STORYBOARD AI — Integrated Version (v1 + v2)
   ============================================ */

// ── 1. State ──
const state = {
    story: '',
    styleIndex: 0, 
    ratio: '1:1',
    rotated: false 
};

// ── 2. Data Sets ──
const STYLES = [
    { name: '預設風格', dot: '#7fba7a', desc: '自然清新', prompt: "" },
    { name: '電影風格', dot: '#2a2a3a', desc: '戲劇光影', prompt: "cinematic, dramatic lighting, film grain, widescreen, lens flare, professional color grading" },
    { name: '日系動漫', dot: '#ffc5e8', desc: '清新可愛', prompt: "cartoon style, vibrant colors, 2D animation look, clean lines" },
    { name: 'Cyberpunk', dot: '#6200ea', desc: '霓虹未來', prompt: "neon lights, futuristic, cyberpunk aesthetic, high contrast" },
    { name: '美式寫實', dot: '#c49a2a', desc: '溫暖金調', prompt: "photorealistic, hyperdetailed, natural lighting, realistic textures, professional photography" },
    { name: '水彩插畫', dot: '#b8d4ff', desc: '柔和藝術', prompt: "watercolor style, soft edges, artistic, hand-drawn look" }
];

const LOADING_STEPS = [
    { title: '正在規劃腳本結構…(1/5)', sub: '分析故事語意，拆解場景節奏', pct: 0 },
    { title: '正在提取分鏡細節…(2/5)', sub: '識別人物、場景與情感節點', pct: 10 },
    { title: '正在優化視覺連貫性…(3/5)', sub: '配對構圖與運鏡建議', pct: 20 },
    { title: '正在同步繪製分鏡…(4/5)', sub: '渲染畫面，組合成完整腳本', pct: 50 },
    { title: '最終檢查與優化…(5/5)', sub: '確保節奏連貫，HOOK 設計到位', pct: 100 },
];

// ── 3. Phase Management (包含你消失的 Function) ──

/** 進入輸入模式 (Splash -> Compose) **/
function enterCompose() {
    showPhase('phase-compose');
    setTimeout(() => {
        const ta = document.getElementById('story-input');
        if (ta) ta.focus();
    }, 400); // 留一點點時間給過場動畫
}

/** 切換階段 **/
function showPhase(id) {
    document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
        el.style.animation = 'none';
        el.offsetHeight; // Trigger reflow
        el.style.animation = '';
        el.classList.add('active');
    }
}

// ── 4. Prompt Templates (保持原樣) ──
function getScriptPrompt() {
    const styleName = STYLES[state.styleIndex].name;
    const styleDetail = STYLES[state.styleIndex].prompt;
    return `假設你是一個專業的影像工作者，擅長創作影像分鏡。您具備細緻的觀察與分析能力，能夠解析短影音中的各項元素、捕捉該短影音背後的行銷手段，並將相關分鏡透過文字呈現。
    任務目標
    根據使用者提供的故事描述或參考圖，整理一份短影音的文字分鏡稿，此文字分鏡稿故事須具備連貫性，詳細描寫鏡頭語言（進警、遠景、仰角、大光圈等）與光影描述。
    
    短影音故事描述為：
    ${state.story}
    
    分鏡稿規範：
    一、分鏡故事摘要：
    將每一個分鏡所表達的意象或故事摘要成一至三句話。同時保持連貫性與邏輯暢通。

    二、風格與標註：
    畫風：採用${styleName}(${styleDetail})，主體清晰，光影關係合理。
    鏡頭語言：採用${state.ratio}比例，搭配個分鏡所需的鏡頭語言。

    三：產出格式：
    將所有分鏡輸出為以下格式：
    1. 分鏡編號：將每個分鏡依照編號排序
    2. 分鏡故事：將整理好的故事內容對應至各個分鏡中
    3. 分鏡圖示Prompt：將該分鏡之故事轉換為生圖提示詞(英文)，方便生成對應圖片以解釋該分鏡。須注意故事練慣性與主體一致性。
    4. 鏡頭語言：標示出該分鏡需要的鏡頭語言。

    重要：請不要使用 Markdown 格式，只需要純文字，並依照產出格式產出內容，不要生成圖片。`;
}

function extractPrompt(req, type) {
    return `${req}
    
    將上述文字中各個分鏡的"${type}"提取出來，並依照其"分鏡編號"排序，嚴格按照以下輸出格式回覆：
    1. XXXXX
    2. OOOOO
    重要：請不要使用 Markdown 格式，只需要純文字，只輸出提取出的結果即可，不需要前言與總結。`;
}

function optimizePrompt(req) {
    const styleName = STYLES[state.styleIndex].name;
    const styleDetail = STYLES[state.styleIndex].prompt;
    return `${req}
    
    優化上述文字中告個分鏡的"分鏡圖示Prompt"，嚴格依照"${state.ratio}"比例(嚴格注意方向為直向或橫向)與"${styleName}"(${styleDetail})，同時須具備劇情連貫性與主體一致性。
    並將每個Prompt提取出來，並依照其"分鏡編號"排序，嚴格按照以下輸出格式回覆：
    1. XXXXX
    2. OOOOO
    重要：請不要使用 Markdown 格式，只需要純文字，並依照產出格式產出內容，不要生成圖片，只輸出提取出的Prompt即可，並附上分鏡編號(分鏡編號僅用數字表示，正確格式：1. XXX 2. XXX，錯誤格式：分鏡編號01：XXX 分鏡編號02：XXX)，不需要前言與總結。`;
}

// ── 5. Core Pipeline (API 串接) ──
let generatedImgs = [];
let generatedStoryTitles = [];
let generatedStoryCams = [];
let generatedPrompts = [];

async function startGenerate() {
    if (!state.story) return;

    showPhase('phase-generating');
    const titleEl = document.getElementById('loading-title');
    const subEl = document.getElementById('loading-sub');
    const barEl = document.getElementById('gen-progress');
    const pctEl = document.getElementById('gen-progress-text');

    generatedImgs = []; generatedStoryTitles = []; generatedStoryCams = []; generatedPrompts = [];

    try {
        updateLoadingUI(0);
        const scriptRes = await askGemini(getScriptPrompt(), 'story');
        const fullScript = scriptRes.response;

        updateLoadingUI(1);
        const [titlesRes, camsRes] = await Promise.all([
            askGemini(extractPrompt(fullScript, '分鏡故事'), 'flash'),
            askGemini(extractPrompt(fullScript, '鏡頭語言'), 'flash')
        ]);
        generatedStoryTitles = parseNumberedList(titlesRes.response);
        generatedStoryCams = parseNumberedList(camsRes.response);

        updateLoadingUI(2);
        const promptsRes = await askGemini(optimizePrompt(fullScript), 'flash');
        generatedPrompts = parseNumberedList(promptsRes.response);

        updateLoadingUI(3);
        const styleDetail = STYLES[state.styleIndex].prompt;
        let completedCount = 0;
        const totalSteps = generatedPrompts.length;
        subEl.innerText = `渲染畫面，組合成完整腳本 (${completedCount+1}/${totalSteps})`

        const imageTasks = generatedPrompts.map(async (prompt) => {
            try {
                const res = await askGemini(prompt + ", " + styleDetail, 'image');
                return res;
            } finally {
                completedCount++;
                const progress = 50 + (completedCount / totalSteps) * 45;
                barEl.style.width = `${progress}%`;
                subEl.innerText = `渲染畫面，組合成完整腳本 (${completedCount+1}/${totalSteps})`
                pctEl.innerText = `${Math.floor(progress)}%`;
            }
        });

        const results = await Promise.all(imageTasks);
        generatedImgs = results.filter(res => res && res.image !== undefined).map(res => res.image[0]);

        updateLoadingUI(4);
        setTimeout(() => {
            renderFilmStrip();
            onGenerateDone();
        }, 800);

    } catch (e) {
        console.error(e);
        alert("生成失敗：" + e.message);
        showPhase('phase-compose');
    }

    function updateLoadingUI(stepIdx) {
        const s = LOADING_STEPS[stepIdx];
        if(titleEl) titleEl.textContent = s.title;
        if(subEl) subEl.textContent = s.sub;
        if(barEl) barEl.style.width = s.pct + '%';
        if(pctEl) pctEl.textContent = s.pct + '%';
    }
}

// ── 6. UI Interaction (Compose 階段) ──

function onStoryInput() {
    const val = document.getElementById('story-input').value.trim();
    const btn = document.getElementById('compose-send');
    const hasText = val.length > 0;
    btn.setAttribute('data-active', hasText ? 'true' : 'false');
    btn.disabled = !hasText;
    state.story = val;
}

function fillSugg(btn) {
    const ta = document.getElementById('story-input');
    ta.value = btn.textContent;
    onStoryInput();
    ta.focus();
}

function submitStory() {
    const story = document.getElementById('story-input').value.trim();
    if (!story) return;
    state.story = story;

    document.getElementById('options-echo').textContent = story.length > 40 ? story.slice(0, 40) + '…' : story;
    document.getElementById('story-input').classList.add('locked');
    document.getElementById('compose-card').classList.add('expanded');
    document.getElementById('compose-options').classList.add('open');
    document.getElementById('suggestion-row').classList.add('hidden');
    buildStyleChips();
}

function buildStyleChips() {
    const row = document.getElementById('style-chips-row');
    if (row.childElementCount > 0) return;
    STYLES.forEach((s, i) => {
        const btn = document.createElement('button');
        btn.className = 'opt-chip style-chip' + (i === state.styleIndex ? ' active' : '');
        btn.innerHTML = `<span class="style-chip-dot" style="background:${s.dot}"></span>${s.name}`;
        btn.onclick = () => {
            state.styleIndex = i;
            document.querySelectorAll('.style-chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
        };
        row.appendChild(btn);
    });
}

function selectRatioOpt(btn) {
    state.ratio = btn.dataset.ratio;
    document.querySelectorAll('.ratio-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
}

function resetCompose() {
    document.getElementById('compose-card').classList.remove('expanded');
    document.getElementById('compose-options').classList.remove('open');
    document.getElementById('suggestion-row').classList.remove('hidden');
    document.getElementById('story-input').classList.remove('locked');
}

let isHorizon = false;
isHorizon = (window.innerWidth < window.innerHeight) ? true : false;


function resetAll() {
    state.story = '';
    state.styleIndex = 0;
    state.ratio = '1:1';
    
    // 清空輸入框
    const ta = document.getElementById('story-input');
    if (ta) {
        ta.value = '';
        ta.classList.remove('locked');
    }
    
    // 重置選項 UI
    resetCompose();
    onStoryInput();
    // 退回最開始的 Splash 頁面
    showPhase('phase-compose');
}

// ── 7. Result Rendering ──
function renderFilmStrip() {
    showPhase('phase-result');
    const container = document.getElementById('storyboard-grid');
    
    container.innerHTML = `
        <div id="filmStripWrapper" class="film-strip-container" style="">
            <div id="filmStrip" class="film-strip" style=""></div>
        </div>
    `;

    const filmStrip = document.getElementById('filmStrip');
    const wrapper = document.getElementById('filmStripWrapper');
    
    const flimRatioClassMap = { 
        '16:9': '16-9', '9:16': '9-16', '3:2': '3-2', '2:3': '2-3', '1:1': '1-1',
        '橫向16:9': '16-9', '直向9:16': '9-16', '橫向3:2': '3-2', '直向2:3': '2-3'
    };
    const ratioKey = flimRatioClassMap[state.ratio] || '1-1';
    const flimWidthMap = { '16-9': 1066, '9-16': 337.5, '3-2': 900, '2-3': 400, '1-1': 600 };
    const frameWidth = flimWidthMap[ratioKey] || 600;

    generatedImgs.forEach((imgSrc, i) => {
        const frame = document.createElement('div');
        frame.className = `film-frame ratio-${ratioKey}`;
        frame.innerHTML = `
            <div class="frame-image-container">
                <div class="frame-number">#${i + 1}</div>
                <img src="${imgSrc}" class="frame-image">
                <div class="frame-overlay">
                    <div class="frame-content">
                        <div class="frame-title">${generatedStoryTitles[i] || '畫面'}</div>
                        <div class="frame-description">${generatedStoryCams[i] || '鏡頭'}</div>
                        <div class="frame-actions">
                             <button class="frame-button" onclick="alert('Prompt: ${generatedPrompts[i]}')">Prompt</button>
                             <button class="frame-button">重新生成</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        filmStrip.appendChild(frame);
    });

    const totalWidth = (generatedImgs.length * (frameWidth + 16));
    const totalHeight = (generatedImgs.length * (600 + 16));
    const totalHeightMobile = (generatedImgs.length * (getHeightFromRatio(window.innerWidth - 150, ratioKey) + 16));
    if (isHorizon){
        wrapper.classList.add('mobile');
        wrapper.style.setProperty('--film-strip-edge-width', `${window.innerWidth - 40}px`);
        wrapper.style.setProperty('--film-strip-edge-height', `${totalHeightMobile}px`);
    }
    else{
        wrapper.classList.remove('mobile');
        wrapper.style.setProperty('--film-strip-edge-width', `${totalWidth}px`);
    }

    initDragScroll(wrapper);
}

window.addEventListener('resize',() => {
    const flimRatioClassMap = { 
        '16:9': '16-9', '9:16': '9-16', '3:2': '3-2', '2:3': '2-3', '1:1': '1-1',
        '橫向16:9': '16-9', '直向9:16': '9-16', '橫向3:2': '3-2', '直向2:3': '2-3'
    };
    const ratioKey = flimRatioClassMap[state.ratio] || '1-1';
    const flimWidthMap = { '16-9': 1066, '9-16': 337.5, '3-2': 900, '2-3': 400, '1-1': 600 };
    const frameWidth = flimWidthMap[ratioKey] || 600;
    const totalWidth = (generatedImgs.length * (frameWidth + 16));
    const totalHeight = (generatedImgs.length * (600 + 16));
    const totalHeightMobile = (generatedImgs.length * (getHeightFromRatio(window.innerWidth - 150, ratioKey) + 16));
    const wrapper = document.getElementById('filmStripWrapper');
    isHorizon = (window.innerWidth < window.innerHeight) ? true : false;
    if (isHorizon){
        wrapper.classList.add('mobile');
        wrapper.style.setProperty('--film-strip-edge-width', `${window.innerWidth - 40}px`);
        wrapper.style.setProperty('--film-strip-edge-height', `${totalHeightMobile}px`);
    }
    else{
        wrapper.classList.remove('mobile');
        wrapper.style.setProperty('--film-strip-edge-width', `${totalWidth}px`);
    }
});

function getHeightFromRatio(height, ratio){
    const w = parseInt(ratio.split('-')[0])
    const h = parseInt(ratio.split('-')[1])
    return height / w * h
}

function initDragScroll(el) {
    let isDown = false;
    let startX, startY;
    let scrollLeft, scrollTop;

    const getPos = (e) => {
        const touch = e.touches ? e.touches[0] : e;
        return { x: touch.pageX, y: touch.pageY };
    };

    const start = (e) => {
        const isVertical = el.classList.contains('mobile');
        isDown = true;
        el.style.cursor = 'grabbing';
        el.style.scrollBehavior = 'auto';
        
        const pos = getPos(e);
        if (isVertical) {
            startY = pos.y - el.offsetTop;
            scrollTop = el.scrollTop;
        } else {
            startX = pos.x - el.offsetLeft;
            scrollLeft = el.scrollLeft;
        }
    };

    const end = () => {
        isDown = false;
        el.style.cursor = 'grab';
    };

    const move = (e) => {
        if (!isDown) return;
        const isVertical = el.classList.contains('mobile');
        const pos = getPos(e);

        if (isVertical) {
            const y = pos.y - el.offsetTop;
            const walk = (y - startY) * 2;
            el.scrollTop = scrollTop - walk;
        } else {
            const x = pos.x - el.offsetLeft;
            const walk = (x - startX) * 2;
            el.scrollLeft = scrollLeft - walk;
        }
    };

    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: true });

    el.addEventListener('mouseleave', end);
    el.addEventListener('mouseup', end);
    el.addEventListener('touchend', end);

    el.addEventListener('mousemove', (e) => {
        if (isDown) e.preventDefault();
        move(e);
    });

    el.addEventListener('touchmove', (e) => {
        move(e);
    }, { passive: true });

    el.addEventListener('wheel', (e) => {
        const isVertical = el.classList.contains('mobile');
        if (e.deltaY !== 0) {
            e.preventDefault();
            el.style.scrollBehavior = 'smooth';
            if (isVertical) {
                el.scrollTop += e.deltaY;
            } else {
                el.scrollLeft += e.deltaY;
            }
        }
    }, { passive: false });
}

// ── 8. Helpers ──
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
               .filter(line => line.match(/^\d+\./))
               .map(line => line.replace(/^\d+\.\s*/, '').trim());
}

function onGenerateDone() {
    const meta = document.getElementById('result-meta');
    if (meta) {
        meta.textContent = `${state.story.length > 30 ? state.story.slice(0,30)+'…' : state.story} · ${STYLES[state.styleIndex].name} · ${state.ratio}`;
    }
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    // 監聽 Enter 鍵提交
    const ta = document.getElementById('story-input');
    if (ta) {
        ta.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && !ta.classList.contains('locked')) {
                e.preventDefault();
                submitStory();
            }
        });
    }
});
resetAll()