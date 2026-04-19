// Generate Page JS
// Manages the 4-step flow: Splash → Story → Style → Ratio → Generate → Result

// ── State ──
const state = {
    story: '',
    style: '預設風格',
    styleIndex: 1,
    ratio: '1:1',
    rotated: false
};

// ── Style Data ──
const styles = [
    {
        name: '預設風格',
        emoji: '🐕',
        bg: 'linear-gradient(135deg, #7fba7a 0%, #4a8a45 60%, #2a5a25 100%)',
        desc: '自然清新，適合一般廣告與介紹影片'
    },
    {
        name: '電影風格',
        emoji: '🎬',
        bg: 'linear-gradient(135deg, #1a1a1a 0%, #3a2a1a 60%, #5a4a2a 100%)',
        desc: '戲劇性光影，適合品牌形象與情境影片'
    },
    {
        name: '日系動漫',
        emoji: '🌸',
        bg: 'linear-gradient(135deg, #ffc5e8 0%, #ffaad4 50%, #ff88c0 100%)',
        desc: '清新可愛，適合年輕族群與日系品牌'
    },
    {
        name: 'Cyberpunk',
        emoji: '⚡',
        bg: 'linear-gradient(135deg, #0a0a2a 0%, #1a0a3a 40%, #2a0a5a 100%)',
        desc: '霓虹未來感，適合科技與遊戲主題'
    },
    {
        name: '美式寫實',
        emoji: '🌄',
        bg: 'linear-gradient(135deg, #8b6914 0%, #c49a2a 50%, #e8c060 100%)',
        desc: '溫暖金調，適合旅遊與生活風格'
    },
    {
        name: '水彩插畫',
        emoji: '🎨',
        bg: 'linear-gradient(135deg, #b8d4ff 0%, #d4b8ff 50%, #ffb8d4 100%)',
        desc: '柔和藝術感，適合手作與文創品牌'
    }
];

// ── Storyboard content templates ──
const storyboardTemplates = [
    {
        label: '開場 HOOK',
        desc: '特寫鏡頭：產品近景，打光強調質感。前三秒抓住觀眾注意力。',
        tags: ['特寫', 'Hook'],
        bg: 'linear-gradient(135deg, #1a1a2e, #2d2d4e)'
    },
    {
        label: '場景建立',
        desc: '廣角鏡頭：呈現場景全貌，建立故事氛圍與環境感。',
        tags: ['廣角', '建立'],
        bg: 'linear-gradient(135deg, #1a3a1a, #2d5a2d)'
    },
    {
        label: '情感高峰',
        desc: '中景鏡頭：角色表情，展現情緒轉折與關鍵時刻。',
        tags: ['中景', '情感'],
        bg: 'linear-gradient(135deg, #3a1a1a, #5a2a2a)'
    },
    {
        label: '產品展示',
        desc: '旋轉鏡頭：360度展示產品，搭配BGM節奏卡點。',
        tags: ['旋轉', 'BGM'],
        bg: 'linear-gradient(135deg, #1a1a3a, #2a2a5a)'
    },
    {
        label: '行動呼籲',
        desc: '定格鏡頭：品牌標誌出現，文字疊加傳遞核心訊息。',
        tags: ['CTA', '品牌'],
        bg: 'linear-gradient(135deg, #2a1a3a, #4a2a5a)'
    },
    {
        label: '結尾收束',
        desc: '淡出鏡頭：畫面漸暗，留下餘韻與品牌印象。',
        tags: ['淡出', '收尾'],
        bg: 'linear-gradient(135deg, #1a1a1a, #2d2d2d)'
    }
];

// ── Screen Management ──
function showScreen(id) {
    document.querySelectorAll('.gen-screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(id);
    screen.classList.add('active');
    // Reset animation
    screen.style.animation = 'none';
    screen.offsetHeight;
    screen.style.animation = '';
}

function goToStep(step) {
    switch (step) {
        case 1: showScreen('screen-step1'); break;
        case 2:
            buildStyleCarousel();
            showScreen('screen-step2');
            break;
        case 3:
            updateRatioFrame();
            showScreen('screen-step3');
            break;
    }
}

// ── Step 1: Story ──
const textarea = document.getElementById('story-input');
const charCount = document.getElementById('char-count');

if (textarea) {
    textarea.addEventListener('input', () => {
        const len = textarea.value.length;
        charCount.textContent = `${len} / 500`;
        state.story = textarea.value;
    });

    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitStory();
        }
    });
}

function fillSuggestion(btn) {
    textarea.value = btn.textContent;
    state.story = btn.textContent;
    charCount.textContent = `${btn.textContent.length} / 500`;
    textarea.focus();
}

function submitStory() {
    const text = textarea.value.trim();
    if (!text) {
        textarea.placeholder = '請先描述你的故事或場景 …';
        textarea.focus();
        return;
    }
    state.story = text;
    goToStep(2);
}

// ── Step 2: Style ──
function buildStyleCarousel() {
    const carousel = document.getElementById('style-carousel');
    carousel.innerHTML = '';
    styles.forEach((style, i) => {
        const slide = document.createElement('div');
        slide.className = 'style-slide' + (i === state.styleIndex ? ' active' : '');
        slide.style.background = style.bg;
        slide.innerHTML = `
      <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:4rem;">${style.emoji}</div>
      <div class="style-slide-overlay">${style.name}</div>
    `;
        carousel.appendChild(slide);
    });
    updateStyleDisplay();
}

function updateStyleDisplay() {
    document.querySelectorAll('.style-slide').forEach((slide, i) => {
        slide.classList.toggle('active', i === state.styleIndex);
    });
    const nameEl = document.getElementById('style-name-display');
    if (nameEl) nameEl.textContent = styles[state.styleIndex].name;
    state.style = styles[state.styleIndex].name;
}

function prevStyle() {
    state.styleIndex = (state.styleIndex - 1 + styles.length) % styles.length;
    updateStyleDisplay();
}
function nextStyle() {
    state.styleIndex = (state.styleIndex + 1) % styles.length;
    updateStyleDisplay();
}

// ── Step 3: Ratio ──
const ratioClassMap = {
    '橫向3:2': 'r-3-2',
    '3:2': 'r-3-2',
    '直向2:3': 'r-2-3',
    '1:1': 'r-1-1',
    '橫向16:9': 'r-16-9',
    '16:9': 'r-16-9',
    '直向9:16': 'r-9-16'
};

const ratioMap = {
    '3:2': '橫向3:2',
    '1:1': '1:1',
    '16:9': '橫向16:9'
}

function updateRatioFrame() {
    const frame = document.getElementById('ratio-frame');
    if (!frame) return;
    frame.className = 'ratio-frame ' + (ratioClassMap[state.ratio] || 'r-1-1');
}

function selectRatio(ratio, btn) {
    state.ratio = ratio;
    document.querySelectorAll('.ratio-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    state.rotated = false;
    updateRatioFrame();
}

function rotateRatio() {
    const rotateMap = { '3:2': '直向2:3', '2:3': '橫向3:2', '16:9': '直向9:16', '9:16': '橫向16:9', '1:1': '1:1' };
    const rotateClassMap = { '3:2': 'r-3-2', '2:3': 'r-9-16', '16:9': 'r-16-9', '9:16': 'r-3-2', '1:1': 'r-1-1' };
    const newRatio = rotateMap[state.ratio] || state.ratio;
    state.ratio = newRatio;
    updateRatioFrame();
}

// ── Confirm Modal ──
function openConfirmModal() {
    document.getElementById('modal-story').textContent = state.story || '（未填寫）';
    document.getElementById('modal-style').textContent = state.style;
    document.getElementById('modal-ratio').textContent = state.ratio;

    const modal = document.getElementById('confirm-modal');
    modal.classList.add('active');
    modal.children[0].style.transition = 'all 0.5s cubic-bezier(0.33, 1.53, 0.69, .99)';
}
function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    document.getElementById('confirm-modal').children[0].style.transition = 'all 0.5s cubic-bezier(.31,.01,.66,-0.59)';
}

// Click outside to close
document.getElementById('confirm-modal').addEventListener('click', function (e) {
    if (e.target === this) closeConfirmModal();
});


const styleDescriptions = {
    "預設風格": "",
    "寫實風格": "photorealistic, hyperdetailed, natural lighting, realistic textures, professional photography",
    "電影風格": "cinematic, dramatic lighting, film grain, widescreen, lens flare, professional color grading",
    "卡通風格": "cartoon style, vibrant colors, 2D animation look, clean lines",
    "漫畫風格": "comic book style, strong black outlines, cel shading, action lines, manga aesthetic"
};

function getScriptPrompt() {
    return `假設你是一個專業的影像工作者，擅長創作影像分鏡。您具備細緻的觀察與分析能力，能夠解析短影音中的各項元素、捕捉該短影音背後的行銷手段，並將相關分鏡透過文字呈現。
    任務目標
    根據使用者提供的故事描述或參考圖，整理一份短影音的文字分鏡稿，此文字分鏡稿故事須具備連貫性，詳細描寫鏡頭語言（進警、遠景、仰角、大光圈等）與光影描述。
    
    短影音故事描述為：
    ${state.story}
    
    分鏡稿規範：
    一、分鏡故事摘要：
    將每一個分鏡所表達的意象或故事摘要成一至三句話。同時保持連貫性與邏輯暢通。

    二、風格與標註：
    畫風：採用${state.style}(${styleDescriptions[state.style]})，主體清晰，光影關係合理。
    鏡頭語言：採用${state.ratio}比例，搭配個分鏡所需的鏡頭語言。

    三：產出格式：
    將所有分鏡輸出為以下格式：
    1. 分鏡編號：將每個分鏡依照編號排序
    2. 分鏡故事：將整理好的故事內容對應至各個分鏡中
    3. 分鏡圖示Prompt：將該分鏡之故事轉換為生圖提示詞(英文)，方便生成對應圖片以解釋該分鏡。須注意故事練慣性與主體一致性。
    4. 鏡頭語言：標示出該分鏡需要的鏡頭語言。

    重要：請不要使用 Markdown 格式，只需要純文字，並依照產出格式產出內容，不要生成圖片。`;
}

let generatedImgs = [];
let generatedStoryTitles = [];
let generatedStoryCams = [];
let generatedPrompts = [];

function extractPrompt(req, type){
    return`${req}


    將上述文字中各個分鏡的"${type}"提取出來，並依照其"分鏡編號"排序，嚴格按照以下輸出格式回覆：
    1. XXXXX
    2. OOOOO
    重要：請不要使用 Markdown 格式，只需要純文字，只輸出提取出的結果即可，不需要前言與總結。
    `
}

function optimizePrompt(req){
    return`${req}


    優化上述文字中告個分鏡的"分鏡圖示Prompt"，嚴格依照"${state.ratio}"比例(嚴格注意方向為直向或橫向)與"${state.style}"(${styleDescriptions[state.style]})，同時須具備劇情連貫性與主體一致性。
    並將每個Prompt提取出來，並依照其"分鏡編號"排序，嚴格按照以下輸出格式回覆：
    1. XXXXX
    2. OOOOO
    重要：請不要使用 Markdown 格式，只需要純文字，並依照產出格式產出內容，不要生成圖片，只輸出提取出的Prompt即可，並附上分鏡編號(分鏡編號僅用數字表示，正確格式：1. XXX 2. XXX，錯誤格式：分鏡編號01：XXX 分鏡編號02：XXX)，不需要前言與總結。
    `
}

// ── Generate ──
async function startGenerate() {
    closeConfirmModal();
    showScreen('screen-generating');
    const loadingTitle = document.getElementById('loading-title');
    const progressBar = document.getElementById('gen-progress');
    const progressBarText = document.getElementById('gen-progress-text');

    generatedImgs = []; generatedStoryTitles = []; generatedStoryCams = []; generatedPrompts = [];

    try {
        loadingTitle.innerText = "正在規劃連貫腳本 (1/5)...";
        const scriptRes = await askGemini(getScriptPrompt(), 'story');
        const fullScript = scriptRes.response;
        progressBar.style.width = "10%";
        progressBarText.innerText = "10%";

        loadingTitle.innerText = "正在提取分鏡細節 (2/5)...";
        const titlesRes = await askGemini(extractPrompt(fullScript, '分鏡故事'), 'flash');
        generatedStoryTitles = parseNumberedList(titlesRes.response);
        progressBarText.innerText = "25%";
        progressBar.style.width = "25%";
        
        const camsRes = await askGemini(extractPrompt(fullScript, '鏡頭語言'), 'flash');
        generatedStoryCams = parseNumberedList(camsRes.response);
        progressBarText.innerText = "40%";
        progressBar.style.width = "40%";

        loadingTitle.innerText = "正在優化視覺連貫性 (3/5)...";
        const styleDetail = styleDescriptions[state.style] || "";
        const promptsRes = await askGemini(optimizePrompt(fullScript), 'flash');
        generatedPrompts = parseNumberedList(promptsRes.response);
        progressBarText.innerText = "50%";
        progressBar.style.width = "50%";

        loadingTitle.innerText = "正在同步繪製所有分鏡 (4/5)...";
        
        let completedCount = 0;
        const totalSteps = generatedPrompts.length;
        const baseProgress = 50; 
        const remainingProgress = 50; 

        const imageTasks = generatedPrompts.map(async (prompt) => {
            try {
                const res = await askGemini(prompt + ", " + styleDetail, 'image');
                return res;
            } finally {
                completedCount++;
                const currentProgress = baseProgress + (completedCount / totalSteps) * remainingProgress;
                progressBarText.innerText = `${Math.floor(currentProgress)}%`;
                progressBar.style.width = `${currentProgress}%`;
            }
        });

        const results = await Promise.all(imageTasks);

        generatedImgs = results
            .filter(res => res && res.image !== undefined)
            .map(res => res.image[0]);

        renderFilmStrip();
        progressBar.style.width = "100%";
        
    } catch (e) {
        console.error(e);
        progressBar.style.width = '0%';
        alert("生成失敗：" + e.message);
        setTimeout(() => goToStep(1), 1500);
    }
}

// 輔助函式：呼叫後端 API
async function askGemini(question, type) {
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
        abortController.abort()
    }, 6000);
    const res = await fetch('/api/ask-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, type })
    });
    const data = await res.json();
    if (data.usage && typeof updateTokenUsage === 'function') {
        updateTokenUsage(data.usage.totalTokenCount);
    }
    clearTimeout(timeout);
    return data;
}

function renderFilmStrip() {
    showScreen('screen-result');
    const container = document.getElementById('storyboard-grid');
    container.innerHTML = `
        <div class="film-strip-container" style="display: flex;">
            <div id="filmStrip" class="film-strip"></div>
        </div>
    `;

    const filmStrip = document.getElementById('filmStrip');
    const flimRatioClassMap = { '橫向16:9': '16-9', '16:9': '16-9', '直向9:16': '9-16', '9:16': '9-16', '橫向3:2': '3-2', '3:2': '3-2', '直向2:3': '2-3', '2:3': '2-3', '1:1': '1-1'}
    const ratioKey = flimRatioClassMap[state.ratio]

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
                            <button class="frame-button" onclick="alert('${generatedPrompts[i]}')">Prompt</button>
                            <button class="frame-button">重新生成</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        filmStrip.appendChild(frame);
    });
    const flimWidthMap = {'16-9': 1066, '9-16': 337.5, '3-2': 900, '2-3': 400, '1-1': 600}
    // 計算膠卷齒輪邊框寬度
    const totalWidth = (generatedImgs.length * (flimWidthMap[ratioKey] + 20)); // 粗略估算
    filmStrip.style.setProperty('--film-strip-edge-width', `${totalWidth}px`);

    // 綁定拖拽滾動
    initDragScroll(filmStrip);
}

function initDragScroll(el) {
    let isDown = false;
    let startX;
    let scrollLeft;

    el.addEventListener('mousedown', (e) => {
        isDown = true;
        el.style.cursor = 'grabbing';
        startX = e.pageX - el.offsetLeft;
        scrollLeft = el.scrollLeft;
    });
    el.addEventListener('mouseleave', () => { isDown = false; el.style.cursor = 'grab'; });
    el.addEventListener('mouseup', () => { isDown = false; el.style.cursor = 'grab'; });
    el.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - el.offsetLeft;
        const walk = (x - startX) * 2;
        el.scrollLeft = scrollLeft - walk;
    });
    el.addEventListener('wheel', (e) => {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
    });
}

// 輔助函式：解析 1. 2. 3. 列表
function parseNumberedList(text) {
    return text.split('\n')
               .filter(line => line.match(/^\d+\./))
               .map(line => line.replace(/^\d+\.\s*/, '').trim());
}


function resetAll() {
    state.story = '';
    state.styleIndex = 1;
    state.ratio = '1:1';
    if (textarea) { textarea.value = ''; charCount.textContent = '0 / 500'; }
    showScreen('screen-splash');
}

function downloadPDF() {
    alert('PDF 下載功能（專業方案），請升級以使用此功能。');
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    // Init ratio frame class
    updateRatioFrame();
});
