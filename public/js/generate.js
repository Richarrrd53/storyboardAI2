/* ============================================
   STORYBOARD AI — Merged Generate (v3)
   Pipeline A: story → (no template) → storyboard JSON → images
   Pipeline B: story → template select → resolve vars → optimise prompts → images
   ============================================ */

// ── DOM refs ──
const storyInput = document.getElementById('story-input');
const inputArea = document.getElementById('compose-input-area');

// ── 1. State ──
const state = {
    story: '',
    styleIndex: 0,
    ratio: '橫向16:9',
    useTemplate: false,
    selectedTemplate: null,
    resolvedVariables: {},
    finalPrompts: []
};

// ── 2. Templates ──
let TEMPLATES = [
    {
        "id": "hugosum_teaser_67IVz",
        "name": "【茶山少女崩潰實錄：最苦與最甜的距離🍃】",
        "category": "hook",
        "tags": [
            "#美食",
            "#開箱",
            "#茶文化",
            "#旅遊",
            "#和菓森林"
        ],
        "description": "針對和菓森林紅茶莊園長片打造的引流短片，透過吃茶果實的反差 Hook 吸引觀眾觀看正片。",
        "narrative": {
            "type": "montage",
            "structure": "Hook (崩潰反應) -> Highlights (視覺補償與產品展示) -> Cliffhanger (懸念留白與行動導向)",
            "tone": "humor",
            "summary": "從女孩吃下苦澀果實的崩潰反應開場，接續茶園美景與紅茶美食的高密度快剪，最後以關於阿嬤的茶葉秘密作為懸念收尾。"
        },
        "hook": {
            "type": "shock",
            "position": "start",
            "description": "成員吃下紅茶果實後，五官扭曲、差點吐出來的崩潰特寫（慢動作 0.5x）。"
        },
        "marketing": {
            "isImplicit": true,
            "exposureType": "product",
            "brandRole": "active",
            "integrationMethod": "plot",
            "revealTiming": "middle",
            "persuasionStyle": "emotional",
            "targetEmotion": [
                "curiosity",
                "relatability",
                "desire"
            ]
        },
        "structure": [
            {
                "shot": 1,
                "duration": "5s",
                "camera": "close-up",
                "angle": "eye-level",
                "action": "成員吃下苦澀果實後表情扭曲崩潰，畫面使用 0.5x 慢動作。",
                "emotion": "shock",
                "purpose": "建立負面反差 Hook，吸引視覺停留。"
            },
            {
                "shot": 2,
                "duration": "4s",
                "camera": "wide",
                "angle": "low-angle",
                "action": "女孩們戴斗笠在絕美翠綠茶園奔跑大笑。",
                "emotion": "joy",
                "purpose": "提供視覺補償，呈現景點美感。"
            },
            {
                "shot": 3,
                "duration": "4s",
                "camera": "close-up",
                "angle": "eye-level",
                "action": "紅玉紅茶倒入玻璃杯，寶石紅液體流動特寫。",
                "emotion": "curiosity",
                "purpose": "產品質感展示。"
            },
            {
                "shot": 4,
                "duration": "7s",
                "camera": "handheld",
                "angle": "eye-level",
                "action": "咬下滷豆乾的斷面（爆汁效果）與紅茶冰淇淋被挖起的畫面快剪。",
                "emotion": "desire",
                "purpose": "利用食物吸引力誘發購買欲。"
            },
            {
                "shot": 5,
                "duration": "10s",
                "camera": "static",
                "angle": "eye-level",
                "action": "Kimo 坐在茶園旁真誠分享，色調轉暖，出現指向留言區的 UI 按鈕動畫。",
                "emotion": "trust",
                "purpose": "情感連結與強效引流。"
            }
        ],
        "visualFlow": {
            "pace": "fast",
            "rhythmPattern": "高潮段落每 0.8 秒一剪，開場與結尾則放慢速度強化情緒。",
            "transitionStyle": "whip"
        },
        "promptTemplate": {
            "base": "High-quality VLOG style, vivid colors, cinematic lighting, {style} including forest green and ruby red colors.",
            "perShot": [
                "{character} with {emotion} expression after eating bitter {product} in {scene}, extreme close-up, slow motion.",
                "{character} wearing tea-picker hats, laughing and running in {scene}, {emotion} mood, sunny day.",
                "Macro shot of pouring {product} into glass, ruby red tea liquid flowing, sparkling, {style}.",
                "Close-up of {character} eating {product} with {emotion} face, steam rising, {style}.",
                "{character} sitting in {scene}, {emotion} and sincere expression, warm sunset lighting, film grain, {style}."
            ]
        },
        "variables": [
            "character",
            "scene",
            "emotion",
            "style",
            "product"
        ],
        "controls": {
            "pace": [
                "fast",
                "medium"
            ],
            "cameraIntensity": [
                "medium"
            ],
            "emotionIntensity": [
                "high"
            ]
        },
        "useCase": "YouTube Shorts 預告/正片精華引流",
        "platform": [
            "shorts",
            "reels",
            "tiktok"
        ],
        "shotsCount": 5,
        "source": {
            "videoId": "67IVz-jBGmE",
            "title": "《山城觀察局》 EP3 | 採茶姑娘出發！從一片葉開始🍃帶你認識山城的味道｜📍HUGOSUM和菓森林紅茶莊園",
            "channel": "山城觀察局",
            "views": 467
        },
        "analysis": {
            "whyItWorks": "利用極致的味覺崩潰作為開場，與隨後的精緻產品及深情故事形成強烈張力，成功轉化好奇心為觀看點擊。",
            "targetAudience": "喜愛旅遊、美食開箱及具備情感共鳴的年輕族群。",
            "replicableElements": [
                "負面 Hook 開場",
                "高頻節奏蒙太奇",
                "情感懸念留白"
            ]
        },
        "confidence": 0.95,
        "version": "2.0"
    }
    ,
    {
        "id": "PeanutSprout_Hero_Short_01",
        "name": "地底的白象牙：這群大學生竟然在種這個？",
        "category": "product",
        "tags": ["#大學生創業", "#花生芽", "#健康飲食", "#開箱", "#創意行銷"],
        "description": "3秒抓住視覺的長壽芽體驗短片，展示從居家培育到清脆入口的感官驚喜。",
        "narrative": { "type": "montage", "structure": "起（視覺誘惑鉤子）、承（居家種植快剪）、轉（驚喜味覺反饋）、合（品牌揭露）", "tone": "energetic", "summary": "以極致特寫的花生芽破土鏡頭開場，快速穿插大學生在居家空間手忙腳亂又認真的種植紀錄，最後以清脆的試吃聲與驚艷表情收尾。" },
        "hook": { "type": "curiosity", "position": "start", "description": "「這是花生還是外星生物？」搭配花生芽如象牙般潔白肥碩的破土慢動作與重低音效。" },
        "marketing": { "isImplicit": false, "exposureType": "product", "brandRole": "active", "integrationMethod": "plot", "revealTiming": "late", "persuasionStyle": "subtle", "targetEmotion": ["curiosity", "amazement", "trust"] },
        "structure": [
            { "shot": 1, "duration": "3s", "camera": "extreme-close-up", "angle": "eye-level", "action": "潔白肥碩的花生芽緩緩從土中鑽出，在微距鏡頭下展現出如玉石般的剔透質感與水分。", "emotion": "amazement", "purpose": "利用罕見的微距畫面作為 Hook，建立強烈的視覺好奇心。" },
            { "shot": 2, "duration": "2s", "camera": "close-up", "angle": "high-angle", "action": "大學生手指笨拙但細心地撥開培育盤，選出一顆長勢完美的「長壽芽」。", "emotion": "hopeful", "purpose": "展示產品原材料的純淨與大學生親自參與的真實感。" },
            { "shot": 3, "duration": "2s", "camera": "tracking", "angle": "eye-level", "action": "鏡頭快速滑過居家客廳，展現大學生拿著噴霧器、量尺記錄數據的忙碌與趣味碰撞。", "emotion": "excited", "purpose": "建立「呆萌大學生」的人設，增加畫面動能與創業溫度。" },
            { "shot": 4, "duration": "2s", "camera": "close-up", "angle": "low-angle", "action": "採收後的鮮甜花生芽在水中快速洗淨，細節處水珠四濺，質感晶瑩。", "emotion": "fascinated", "purpose": "展示產品最終新鮮型態，營造潔淨、可信賴的印象。" },
            { "shot": 5, "duration": "3s", "camera": "close-up", "angle": "eye-level", "action": "大學生咬下一口花生芽，發出清脆的「咔嚓」聲，眼神從懷疑瞬間轉為閃閃發光的驚喜。", "emotion": "delight", "purpose": "透過真實的聲音與表情反饋，建立產品「好吃的驚奇感」。" },
            { "shot": 6, "duration": "3s", "camera": "static", "angle": "eye-level", "action": "畫面定格在大學生與花生芽的合影，側邊浮現品牌標誌與「追蹤看更多呆萌創業」文字。", "emotion": "peaceful", "purpose": "品牌收尾，強化受眾追蹤與轉化動力。" }
        ],
        "visualFlow": { "pace": "fast", "rhythmPattern": "快-慢-快 的變速處理，開場微距 Hook 慢動作，中段居家種植快剪，收尾驚喜表情停留。", "transitionStyle": "match-cut" },
        "promptTemplate": {
            "base": "Modern lifestyle photography style, natural window lighting, high contrast, sharp focus, 8k resolution, cinematic color grading.",
            "perShot": [
                "Extreme macro shot of a plump white {product} emerging from dark soil, water droplets glittering, cinematic soft lighting.",
                "Close-up of {student}'s hands picking fresh {product} from a planting tray in a bright {scene}.",
                "Dynamic tracking shot of {student} in a messy but cozy {scene}, holding a mist sprayer, motion blur.",
                "Detailed macro shot of fresh {product} being rinsed with water, droplets flying, {style} details.",
                "{student} taking a big bite of crunchy {product} with a shocked and {emotion} expression in the {scene}.",
                "Static layout of {product} with the team logo, students laughing in the background of a sunny {scene}."
            ]
        },
        "variables": ["student", "scene", "emotion", "style", "product"],
        "controls": { "pace": ["fast", "medium", "slow"], "cameraIntensity": ["medium", "high"], "emotionIntensity": ["high"] },
        "useCase": "農業創業故事、居家種植開箱、健康食材推廣短影音。",
        "platform": ["instagram", "reels", "tiktok"],
        "shotsCount": 6,
        "analysis": { "whyItWorks": "利用「花生芽」罕見的潔白外觀引發獵奇心理，再透過「呆萌大學生」的創業反差建立情感連結，最後以具體的清脆聲響完成轉化。", "targetAudience": "喜愛觀察大學生生活、注重健康飲食、追求生活新奇感的 18-35 歲受眾。", "replicableElements": ["微距視覺 Hook", "反差感的人設呈現", "感官刺激（脆度音效）"] },
        "confidence": 0.98, "version": "1.0"
    },
    {
        "id": "67IVz-jBGmE_Short",
        "name": "魚池紅寶石：隱藏在山城裡的味覺奇蹟",
        "category": "product",
        "tags": ["#美食", "#南投", "#紅茶", "#開箱", "#旅遊"],
        "description": "3秒抓住感官的紅茶體驗短片，展示從採摘到品茗的極致感官誘惑。",
        "narrative": { "type": "montage", "structure": "起（視覺誘惑鉤子）、承（製茶工序快剪）、轉（驚喜味覺反饋）、合（品牌揭露）", "tone": "emotional", "summary": "以高品質的茶湯流動鏡頭作為開場，快速穿插茶園採摘與製茶機具動態，最後以主持人驚艷的表情連結品牌與產品。" },
        "hook": { "type": "curiosity", "position": "start", "description": "「這真的不是紅寶石嗎？」搭配茶湯如寶石般透亮的倒水慢動作與清脆聲響。" },
        "marketing": { "isImplicit": false, "exposureType": "product", "brandRole": "active", "integrationMethod": "plot", "revealTiming": "late", "persuasionStyle": "subtle", "targetEmotion": ["curiosity", "desire", "trust"] },
        "structure": [
            { "shot": 1, "duration": "3s", "camera": "close-up", "angle": "eye-level", "action": "琥珀色的紅茶液體緩緩注入玻璃杯，呈現如寶石般的光澤與流動感。", "emotion": "amazement", "purpose": "利用感官衝擊作為 Hook，建立視覺渴望。" },
            { "shot": 2, "duration": "2s", "camera": "close-up", "angle": "low-angle", "action": "指尖輕柔採下帶著紅色的「一心二葉」茶菁。", "emotion": "hopeful", "purpose": "展示產品原材料的高品質與獨特性。" },
            { "shot": 3, "duration": "2s", "camera": "tracking", "angle": "eye-level", "action": "鏡頭快速滑過製茶工廠，展現茶葉在揉捻機中轉動的動態節奏。", "emotion": "excited", "purpose": "增加畫面動能，體現職人工藝過程。" },
            { "shot": 4, "duration": "2s", "camera": "close-up", "angle": "high-angle", "action": "乾茶葉在簸箕中散開，細節紋理清晰可見。", "emotion": "fascinated", "purpose": "展示產品最終型態與專業質感。" },
            { "shot": 5, "duration": "3s", "camera": "close-up", "angle": "eye-level", "action": "主持人喝下一口茶，眼神閃爍並驚訝地看向鏡頭。", "emotion": "delight", "purpose": "以人物情緒反饋建立產品可信度與吸引力。" },
            { "shot": 6, "duration": "3s", "camera": "static", "angle": "eye-level", "action": "畫面定格在品牌標誌與產品包裝，搭配茶園背景。", "emotion": "peaceful", "purpose": "品牌收尾，強化目標受眾的購買欲與記憶。" }
        ],
        "visualFlow": { "pace": "fast", "rhythmPattern": "快-慢-快 的變速處理，開場慢動作 Hook，中段工序快剪，收尾穩定情緒。", "transitionStyle": "match-cut" },
        "promptTemplate": {
            "base": "Professional food photography style, natural soft lighting, high saturation, sharp focus, 4k resolution.",
            "perShot": [
                "Extremely close-up shot of golden amber {product} liquid being poured into a transparent glass, glittering under {style} lighting.",
                "Close-up of {character}'s fingers picking fresh {product} tea leaves in the lush green {scene}, {style} photography.",
                "Dynamic tracking shot of {product} inside a rotating machine in a professional {scene}, high motion blur.",
                "Detailed macro shot of dried {product} leaves on a wooden tray in {scene} with {style} details.",
                "{character} tasting a cup of {product} with a {emotion} expression in the quiet {scene}.",
                "Static product layout of {product} with the brand logo in front of a misty {scene}, {style} cinematic style."
            ]
        },
        "variables": ["character", "scene", "emotion", "style", "product"],
        "controls": { "pace": ["fast", "medium", "slow"], "cameraIntensity": ["low", "medium", "high"], "emotionIntensity": ["low", "medium", "high"] },
        "useCase": "茶飲品牌推廣、南投深度旅遊開箱、在地職人故事短影音。",
        "platform": ["tiktok", "reels", "shorts"],
        "shotsCount": 6,
        "analysis": { "whyItWorks": "利用極致的微距畫面勾起食慾與好奇心，並將繁瑣的製茶過程節奏化，最後透過強烈的情緒反應完成轉化。", "targetAudience": "喜愛茶文化、注重生活美學、計畫南投旅遊的 20-45 歲受眾。", "replicableElements": ["感官極限勾子", "製茶工序動態蒙太奇", "真實反應的情緒價值"] },
        "confidence": 0.95, "version": "2.0"
    },
    {
        "id": "Ybzls4DtR0",
        "name": "好無聊的休假 - 雅方國際 茱莉",
        "category": "lifestyle",
        "tags": ["#Vlog", "#生活感", "#產品植入", "#日常", "#開箱"],
        "description": "以假日賴床為開端，透過第一人稱 Vlog 形式巧妙植入多款食品，展現產品在家庭日常中的應用場景。",
        "narrative": { "type": "montage", "structure": "賴床共鳴(起) -> 居家餵食(承) -> 賣場巡視(轉) -> 社群互動(合)", "tone": "casual", "summary": "描述現代女性輕鬆的假日生活，將早餐準備、外出採購與粉絲互動串聯成流暢的宣傳敘事。" },
        "hook": { "type": "curiosity", "position": "start", "description": "展示 9:00 賴床的特寫畫面，利用假日鬆弛感引發受眾生活共鳴。" },
        "marketing": { "isImplicit": false, "exposureType": "product", "brandRole": "active", "integrationMethod": "plot", "revealTiming": "early", "persuasionStyle": "subtle", "targetEmotion": ["relatability", "curiosity", "desire"] },
        "structure": [
            { "shot": 1, "duration": "5s", "camera": "close-up", "angle": "eye-level", "action": "主角在床上賴床並對鏡頭自述", "emotion": "relaxed", "purpose": "建立人物人設與生活化鉤子" },
            { "shot": 2, "duration": "2s", "camera": "wide", "angle": "eye-level", "action": "主角走出房門開啟一天", "emotion": "casual", "purpose": "空間轉換，推動敘事時間軸" },
            { "shot": 3, "duration": "5s", "camera": "handheld", "angle": "low-angle", "action": "與小孩互動並展示即將微波的產品包裝", "emotion": "warm", "purpose": "第一階段產品展示，連結家庭育兒場景" },
            { "shot": 4, "duration": "1s", "camera": "static", "angle": "eye-level", "action": "展示微波爐運作過程", "emotion": "neutral", "purpose": "展示產品便利性" },
            { "shot": 5, "duration": "3s", "camera": "close-up", "angle": "eye-level", "action": "在車內自拍講述下午行程", "emotion": "active", "purpose": "地點場景轉換" },
            { "shot": 6, "duration": "13s", "camera": "tracking", "angle": "eye-level", "action": "在賣場冰櫃前手持並介紹多款產品", "emotion": "professional", "purpose": "核心行銷環節，深入解析產品特點" },
            { "shot": 7, "duration": "6s", "camera": "close-up", "angle": "eye-level", "action": "在樓梯或酒櫃前分享心情", "emotion": "casual", "purpose": "維持Vlog生活節奏，避免過度廣告感" },
            { "shot": 8, "duration": "7s", "camera": "medium", "angle": "eye-level", "action": "沙發上使用搞怪濾鏡看手機", "emotion": "humor", "purpose": "製造情緒記憶點，強化趣味性" },
            { "shot": 9, "duration": "8s", "camera": "medium", "angle": "eye-level", "action": "展示手機網友訊息並呼籲互動", "emotion": "relatability", "purpose": "Call-to-action，建立社群連結" }
        ],
        "visualFlow": { "pace": "fast", "rhythmPattern": "快剪帶入，中段放緩展示產品，結尾呼籲互動。", "transitionStyle": "cut" },
        "promptTemplate": {
            "base": "Lifestyle vlog photography, natural indoor lighting, handheld camera feel, authentic and warm tones.",
            "perShot": [
                "{character} lying in bed looking at camera with a sleepy {emotion} expression, cozy bedroom morning light.",
                "{character} walking out of bedroom door into a bright {scene}, casual morning energy.",
                "{character} interacting warmly with a child, showing a food product package in a {scene} kitchen.",
                "Close-up of a microwave running with {product} inside, bright kitchen, clean {style} look.",
                "{character} in a car, selfie angle, {emotion} expression, city view through window.",
                "{character} standing at a supermarket refrigerator aisle, holding and explaining {product}, {style} lighting.",
                "{character} sitting on stairs sharing thoughts, {emotion} casual expression, {scene} background.",
                "{character} on a sofa using a phone with a fun filter, {emotion} humor, {scene} living room.",
                "{character} showing phone screen with fan messages, {emotion} warm smile, interactive {scene}."
            ]
        },
        "variables": ["character", "scene", "emotion", "style", "product"],
        "controls": { "pace": ["fast", "medium"], "cameraIntensity": ["low", "medium"], "emotionIntensity": ["medium", "high"] },
        "useCase": "品牌生活化行銷、產品開箱、日常紀錄型短片",
        "platform": ["tiktok", "reels", "shorts"],
        "shotsCount": 9,
        "analysis": { "whyItWorks": "利用 Vlog 的真實感降低廣告抵觸，並透過小孩、賣場等具體場景增加產品可信度與應用聯想。", "targetAudience": "追求生活品質的女性、家庭主婦、年輕上班族", "replicableElements": ["時間標籤導引", "生活共鳴鉤子", "高頻快節奏剪輯", "趣味濾鏡互動"] },
        "confidence": 0.95, "version": "2.0"
    }
];

// ── 3. Data Sets ──
const STYLES = [
    { name: '預設風格', dot: '#7fba7a', desc: '自然清新', prompt: "natural lighting, high resolution, clean composition, soft focus background" },
    { name: '電影風格', dot: '#2a2a3a', desc: '戲劇光影', prompt: "anamorphic lens, cinematic lighting, 8k resolution, deep shadows, professional color grading, film noir vibes" },
    { name: '二次元風格', dot: '#ffc5e8', desc: '熱門手遊感', prompt: "mihoyo style, genshin impact aesthetic, cel-shaded, vibrant anime colors, expressive lighting, high-quality 3D render look" },
    { name: 'Cyberpunk風格', dot: '#6200ea', desc: '霓虹未來', prompt: "neon palette, high contrast, futuristic street, rain-slicked pavement, volumetric fog, cyberpunk 2077 aesthetic" },
    { name: '美式寫實風格', dot: '#c49a2a', desc: '溫暖金調', prompt: "professional photography, golden hour, sun-drenched, shallow depth of field, sharp details, Kodak Portra 400 look" },
    { name: '90s 復古風格', dot: '#f44336', desc: '懷舊膠卷', prompt: "90s VHS aesthetic, vintage film grain, light leaks, chromatic aberration, retro colors, nostalgic atmosphere" },
    { name: '水彩插畫風格', dot: '#b8d4ff', desc: '柔和藝術', prompt: "delicate watercolor painting, ink wash, dreamy atmosphere, paper texture, hand-drawn illustration" },
    { name: '極簡室內風格', dot: '#eceff1', desc: '侘寂高級感', prompt: "minimalist aesthetic, soft natural light, Wabi-sabi style, high-end interior design photography, neutral tones" }
];

const LOADING_STEPS_FREE = [
    { pct: 0, messages: ['正在讀懂你的故事…', '拆解場景節奏中…', '思考故事結構…'] },
    { pct: 10, messages: ['找出最有張力的畫面…', '識別情緒節點…', '挖掘視覺細節…'] },
    { pct: 20, messages: ['幫你設計鏡頭順序…', '想像每個轉場的感覺…', '調整構圖節奏…'] },
    { pct: 50, messages: ['渲染第 {n} 張畫面…', '快好了，稍等一下 ✦', '正在上色…'] },
    { pct: 100, messages: ['檢查節奏有沒有問題…', '收尾中…', '快完成了 ✦'] },
];

const LOADING_STEPS_TPL = [
    { pct: 0, messages: ['套用模板結構中…', '解析故事變數…', '對應分鏡模板…'] },
    { pct: 15, messages: ['把故事填進模板…', '代入場景與角色…', '整理關鍵元素…'] },
    { pct: 30, messages: ['優化每個分鏡提示詞…', '調整風格語氣…', '細修畫面描述…'] },
    { pct: 50, messages: ['渲染第 {n} 張畫面…', '快好了，稍等一下 ✦', '正在上色…'] },
    { pct: 100, messages: ['確保節奏連貫…', 'HOOK 設計到位…', '快完成了 ✦'] },
];

let _loadingTickerTimer = null;
let _loadingTickerIdx = 0;

function startLoadingTicker(stepMessages, completedCount) {
    stopLoadingTicker();
    const titleEl = document.getElementById('loading-title');
    _loadingTickerIdx = 0;

    const tick = () => {
        const raw = stepMessages[_loadingTickerIdx % stepMessages.length];
        const msg = raw.replace('{n}', completedCount + 1);
        if (titleEl) titleEl.textContent = msg;
        _loadingTickerIdx++;
        _loadingTickerTimer = setTimeout(tick, 2600 + Math.random() * 800);
    };
    tick();
}

function stopLoadingTicker() {
    if (_loadingTickerTimer) { clearTimeout(_loadingTickerTimer); _loadingTickerTimer = null; }
}

function updateLoadingUI(stepIdx, steps, completedCount = 0) {
    const s = steps[stepIdx];
    const subEl = document.getElementById('loading-sub');
    const barEl = document.getElementById('gen-progress');
    const pctEl = document.getElementById('gen-progress-text');
    if (barEl) barEl.style.width = s.pct + '%';
    if (pctEl) pctEl.textContent = s.pct + '%';
    // sub stays fixed per stage; title rotates
    const subMessages = {
        0: '分析故事語意，拆解場景節奏',
        1: '識別人物、場景與情感節點',
        2: '配對構圖與運鏡建議',
        3: '渲染畫面，組合成完整分鏡',
        4: '確保節奏連貫，HOOK 設計到位',
    };
    if (subEl) subEl.textContent = subMessages[stepIdx] || '';
    startLoadingTicker(s.messages, completedCount);
}

// ── 4. Phase Management ──
function showPhase(id) {
    document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
        el.style.animation = 'none';
        el.offsetHeight;
        el.style.animation = '';
        el.classList.add('active');
    }
}

// ── 5. Compose UI ──
function onStoryInput() {
    const val = storyInput.value.trim();
    const btn = document.getElementById('compose-send');
    const hasText = val.length > 0;
    btn.setAttribute('data-active', hasText ? 'true' : 'false');
    btn.disabled = !hasText;
    state.story = val;
    resetHeight();
    adjustHeight();
}

function fillSugg(btn) {
    storyInput.value = btn.textContent;
    onStoryInput();
    storyInput.focus();
}

// ── AI typewriter response ──
const AI_RESPONSE_TEMPLATES = [
    story => `收到！幫你規劃一支關於「${story}」的分鏡 ✦`,
    story => `了解，「${story}」，我來幫你把它變成畫面 ✦`,
    story => `好主意！讓我為「${story}」設計分鏡結構 ✦`,
];

function getAiResponseText(story) {
    const short = story.length > 20 ? story.slice(0, 20) + '…' : story;
    const idx = Math.floor(Math.random() * AI_RESPONSE_TEMPLATES.length);
    return AI_RESPONSE_TEMPLATES[idx](short);
}

function typewriterEffect(el, text, cursorEl, onDone) {
    let i = 0;
    el.textContent = '';
    if (cursorEl) cursorEl.style.opacity = '1';
    const tick = () => {
        if (i < text.length) {
            el.textContent += text[i++];
            setTimeout(tick, 28 + Math.random() * 18);
        } else {
            // blink cursor then fade
            setTimeout(() => {
                if (cursorEl) cursorEl.style.opacity = '0';
                if (onDone) onDone();
            }, 500);
        }
    };
    tick();
}

// ── Keyword → style mapping ──
const STYLE_KEYWORD_MAP = [
    { keywords: ['食物', '餐廳', '美食', '咖啡', '飲料', '甜點', '料理', '吃'], styles: [0, 4] },  // 預設 / 美式寫實
    { keywords: ['旅遊', '旅行', '風景', '自然', '戶外', '山', '海', '森林'], styles: [0, 6] },     // 預設 / 水彩插畫
    { keywords: ['科技', '未來', 'AI', '機器人', '賽博', '電子', '數位'], styles: [3, 1] },         // Cyberpunk / 電影
    { keywords: ['遊戲', '動漫', '角色', '二次元', '動畫', '漫畫'], styles: [2] },                 // 二次元
    { keywords: ['懷舊', '復古', '老', 'vintage', '經典', '老舊'], styles: [5] },                 // 90s 復古
    { keywords: ['品牌', '商業', '極簡', '高端', '奢華', '精品', '設計'], styles: [7, 4] },         // 極簡 / 美式寫實
    { keywords: ['運動', '健身', '跑步', '瑜珈', '球', '競技'], styles: [1, 4] },                 // 電影 / 美式寫實
    { keywords: ['廣告', '行銷', '產品', '開箱', '推廣'], styles: [4, 0] },                      // 美式寫實 / 預設
];

function detectRecommendedStyles(story) {
    const lower = story.toLowerCase();
    for (const rule of STYLE_KEYWORD_MAP) {
        if (rule.keywords.some(kw => lower.includes(kw))) {
            return rule.styles; // [primary, secondary?]
        }
    }
    return [0]; // 預設風格 fallback
}

let _allStylesVisible = false;

function buildStyleChips() {
    const row = document.getElementById('style-chips-row');
    const showAllBtn = document.getElementById('style-show-all-btn');
    const recTag = document.getElementById('style-rec-tag');
    if (row.childElementCount > 0) return;

    const recIndices = detectRecommendedStyles(state.story);
    state.styleIndex = recIndices[0]; // auto-select the primary recommendation

    STYLES.forEach((s, i) => {
        const btn = document.createElement('button');
        const isRec = recIndices.includes(i);
        btn.className = 'opt-chip style-chip' + (i === state.styleIndex ? ' active' : '');
        btn.dataset.styleIndex = i;
        btn.innerHTML = `<span class="style-chip-dot" style="background:${s.dot}"></span>${s.name}${isRec && i === recIndices[0] ? ' <span class="chip-rec-badge">推薦</span>' : ''}`;
        btn.onclick = () => {
            state.styleIndex = i;
            document.querySelectorAll('.style-chip').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
        };
        // Hide non-recommended chips initially
        if (!isRec) btn.style.display = 'none';
        row.appendChild(btn);
    });

    // Show "查看全部" button if there are hidden chips
    if (recIndices.length < STYLES.length) {
        showAllBtn.style.display = 'inline-flex';
        recTag.style.display = 'inline';
    }
    _allStylesVisible = false;
}

function showAllStyles() {
    _allStylesVisible = true;
    document.querySelectorAll('.style-chip').forEach(btn => { btn.style.display = 'inline-flex'; });
    const showAllBtn = document.getElementById('style-show-all-btn');
    if (showAllBtn) showAllBtn.style.display = 'none';
}

function submitStory() {
    const story = storyInput.value.trim();
    if (!story) return;
    state.story = story;

    const echoEl = document.getElementById('options-echo');
    const hintEl = document.getElementById('options-hint');
    const labelEl = document.getElementById('options-story-label');
    const responseText = document.getElementById('ai-response-text');
    const responseLine = document.getElementById('ai-response-line');
    const cursorEl = document.getElementById('ai-response-cursor');

    echoEl.textContent = story.length > 40 ? story.slice(0, 40) + '…' : story;
    echoEl.style.opacity = '0';
    hintEl.style.opacity = '0';
    labelEl.style.opacity = '0';

    storyInput.classList.add('locked');
    document.getElementById('compose-card').classList.add('expanded');
    document.getElementById('compose-options').classList.add('open');
    document.getElementById('compose-input-area').classList.add('hidden');
    document.getElementById('suggestion-row').classList.add('hidden');
    resetHeight();

    // Typewriter AI response, then fade in the rest
    const aiText = getAiResponseText(story);
    setTimeout(() => {
        typewriterEffect(responseText, aiText, cursorEl, () => {
            // Fade in hint + echo + label
            hintEl.style.transition = 'opacity 0.5s';
            labelEl.style.transition = 'opacity 0.5s';
            echoEl.style.transition = 'opacity 0.5s';
            setTimeout(() => {
                hintEl.style.opacity = '1';
                labelEl.style.opacity = '1';
                echoEl.style.opacity = '1';
                buildStyleChips();
            }, 200);
        });
    }, 320); // slight delay after panel opens
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
    document.getElementById('compose-input-area').classList.remove('hidden');
    storyInput.classList.remove('locked');
    adjustHeight();
}

let isHorizon = (window.innerWidth < window.innerHeight);

function resetAll() {
    state.story = '';
    state.styleIndex = 0;
    state.ratio = '橫向16:9';
    state.useTemplate = false;
    state.selectedTemplate = null;
    state.resolvedVariables = {};
    state.finalPrompts = [];
    storyboardData = null;
    generatedImgs = [];
    generatedStoryTitles = [];
    generatedStoryCams = [];
    generatedPrompts = [];

    storyInput.value = '';
    storyInput.classList.remove('locked');
    document.getElementById('compose-card').classList.remove('expanded');
    document.getElementById('compose-options').classList.remove('open');
    document.getElementById('compose-input-area').classList.remove('hidden');
    document.getElementById('suggestion-row').classList.remove('hidden');
    document.getElementById('style-chips-row').innerHTML = '';
    document.querySelectorAll('.ratio-chip').forEach((c, i) => c.classList.toggle('active', i === 0));
    document.getElementById('result-template-badge').style.display = 'none';
    document.getElementById('storyboard-grid').innerHTML = '';
    // Reset typewriter UI
    const rtEl = document.getElementById('ai-response-text');
    const rcEl = document.getElementById('ai-response-cursor');
    const hintEl = document.getElementById('options-hint');
    const labelEl = document.getElementById('options-story-label');
    const echoEl = document.getElementById('options-echo');
    if (rtEl) rtEl.textContent = '';
    if (rcEl) rcEl.style.opacity = '0';
    if (hintEl) hintEl.style.opacity = '0';
    if (labelEl) labelEl.style.opacity = '0';
    if (echoEl) echoEl.style.opacity = '0';
    // Reset show-all styles button
    const showAllBtn = document.getElementById('style-show-all-btn');
    const recTag = document.getElementById('style-rec-tag');
    if (showAllBtn) showAllBtn.style.display = 'none';
    if (recTag) recTag.style.display = 'none';
    _allStylesVisible = false;
    onStoryInput();
    resetHeight();
    showPhase('phase-compose');
}

// ── 6. Template Selection Phase ──
async function proceedToTemplate() {
    showPhase('phase-template');
    renderTemplateGrid();
    // await aiRecommendTemplate();
}

function backToCompose() {
    showPhase('phase-compose');
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
            <div class="tc-tags">${tpl.tags.slice(0, 4).map(t => `<span class="tc-tag">${t}</span>`).join('')}</div>
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
    const loadEl = document.getElementById('ai-rec-loading');

    loadEl.style.display = 'block';
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
            const recId = idMatch[1].trim();
            const tplCard = document.getElementById(`tpl-card-${recId}`);
            if (tplCard) {
                tplCard.classList.add('ai-recommended');
                selectTemplate(recId);
            }
        }
        descEl.textContent = reasonMatch ? reasonMatch[1].trim() : '已根據故事類型推薦最匹配的模板。';
    } catch (e) {
        descEl.textContent = '無法取得 AI 推薦，請手動選擇模板。';
        console.error(e);
    } finally {
        loadEl.style.display = 'none';
    }
}

function selectTemplate(id) {
    state.selectedTemplate = TEMPLATES.find(t => t.id === id) || null;
    document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById(`tpl-card-${id}`);
    if (card) card.classList.add('selected');

    // update footer
    const hint = document.getElementById('taf-hint');
    const btn = document.getElementById('taf-apply-btn');
    if (state.selectedTemplate) {
        hint.textContent = `已選擇：${state.selectedTemplate.name}`;
        btn.disabled = false;
    }
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
        <div>
            <p class="pv-section-title">模板說明</p>
            <p class="pv-desc">${tpl.description}</p>
        </div>
        <div>
            <p class="pv-section-title">敘事結構</p>
            <div class="pv-narrative-box">
                <p class="pv-narrative-structure">${tpl.narrative.structure}</p>
                <span class="pv-tone-badge">${tpl.narrative.tone} · ${tpl.narrative.type}</span>
            </div>
        </div>
        <div>
            <p class="pv-section-title">標籤</p>
            <div class="pv-tags">${tpl.tags.map(t => `<span class="pv-tag">${t}</span>`).join('')}</div>
        </div>
        <div>
            <p class="pv-section-title">可替換變數 — AI 將自動從故事中提取並填入</p>
            <div class="pv-variables">
                ${tpl.variables.map(v => `<span class="pv-var"><span class="pv-var-icon">◆</span>{${v}}</span>`).join('')}
            </div>
        </div>
        <div>
            <p class="pv-section-title">基底提示詞</p>
            <div class="pv-prompt-base">${tpl.promptTemplate.base}</div>
        </div>
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
        <div>
            <p class="pv-section-title">成功要素分析</p>
            <p class="pv-desc">${tpl.analysis.whyItWorks}</p>
        </div>
        <div>
            <p class="pv-section-title">可複製爆款元素</p>
            <div class="pv-variables">
                ${tpl.analysis.replicableElements.map(e => `<span class="pv-var"><span class="pv-var-icon">✦</span>${e}</span>`).join('')}
            </div>
        </div>
    `;
}

function closePreview() {
    document.getElementById('template-preview-drawer').classList.remove('open');
}

async function applyTemplateAndGenerate() {
    closePreview();
    if (!state.selectedTemplate) { alert('請先選擇一個模板！'); return; }
    state.useTemplate = true;
    await startTemplateGenerate();
}

// ── 8. Pipeline A — Free generate (no template) ──
// Uses storyboard JSON → buildFinalPrompt for images
let storyboardData = null;
let generatedImgs = [];
let generatedStoryTitles = [];
let generatedStoryCams = [];
let generatedPrompts = [];

function getStoryboardPrompt() {
    const styleName = STYLES[state.styleIndex].name;
    const styleDetail = STYLES[state.styleIndex].prompt;
    return `
你是一個專業短影音分鏡系統。

請根據使用者故事生成 storyboard JSON。

使用者故事：
${state.story}

風格：
${styleName}
(${styleDetail})

比例：
${state.ratio}

輸出規則：

1. 只允許輸出 JSON
2. 禁止 markdown
3. 第一個字必須是 {
4. 最後一個字必須是 }

JSON 結構：

{
  "meta": {
    "title": "",
    "style": "",
    "ratio": ""
  },

  "characters": {
    "main_character": {
      "name": "",
      "appearance": "",
      "outfit": "",
      "personality": ""
    }
  },

  "shots": [
    {
      "id": 1,
      "story": "",
      "camera": "",
      "duration": "",
      "emotion": "",
      "characters": ["main_character"],
      "shotPrompt": ""
    }
  ]
}

重要規則：

1. shotPrompt 禁止重複描述角色外觀
2. characters 負責統一定義角色
3. shotPrompt 只描述：
   - 動作
   - 構圖
   - 場景
   - 光影
   - 表情

4. shots 必須具備故事連續性
5. 鏡頭語言需明確
`;
}

function buildFinalPrompt(shot) {
    const styleDetail = STYLES[state.styleIndex].prompt;
    const characterData = (shot.characters || [])
        .map(id => storyboardData.characters[id])
        .filter(Boolean);

    if (characterData.length === 0) {
        return `${shot.shotPrompt},\n\n${styleDetail},\n\n${state.ratio} composition,\nhigh quality`;
    }

    const characterPrompt = characterData
        .map(char => `${char.appearance},\n${char.outfit},\n${char.personality}`)
        .join(',');

    return `${characterPrompt},\n\n${shot.shotPrompt},\n\n${styleDetail},\n\n${state.ratio} composition,\nhigh quality,\nconsistent character design`;
}

async function startGenerate() {
    if (!state.story) return;
    state.useTemplate = false;

    showPhase('phase-generating');
    const subEl = document.getElementById('loading-sub');
    const barEl = document.getElementById('gen-progress');
    const pctEl = document.getElementById('gen-progress-text');

    generatedImgs = [];
    generatedStoryTitles = [];
    generatedStoryCams = [];

    try {
        updateLoadingUI(0, LOADING_STEPS_FREE);
        const storyboardRes = await askGemini(getStoryboardPrompt(), 'story');
        storyboardData = safeParseJson(storyboardRes.response);
        if (!storyboardData) return;
        storyboardData = normalizeStoryboard(storyboardData);
        try { validateStoryboard(storyboardData); }
        catch (err) { console.error(err); alert('Storyboard 結構錯誤：\n' + err.message); return; }

        updateLoadingUI(3, LOADING_STEPS_FREE);
        let completedCount = 0;
        const shots = storyboardData.shots;
        const total = shots.length;

        for (const shot of shots) {
            try {
                updateLoadingUI(3, LOADING_STEPS_FREE, completedCount);
                const finalPrompt = buildFinalPrompt(shot);
                const res = await askGemini(finalPrompt, 'image');
                generatedImgs.push(res?.image?.length > 0 ? res.image[0] : '../icon/error.jpg');
                generatedStoryTitles.push(shot.story);
                generatedStoryCams.push(shot.camera);
                completedCount++;
                const progress = 50 + (completedCount / total) * 45;
                barEl.style.width = `${progress}%`;
                pctEl.innerText = `${Math.floor(progress)}%`;
                if (completedCount < total) await delay(30000);
            } catch (err) {
                console.error('單張圖片生成失敗:', err);
                generatedImgs.push('../icon/error.jpg');
            }
        }

        updateLoadingUI(4, LOADING_STEPS_FREE);
        stopLoadingTicker();
        setTimeout(() => { renderResults(); onGenerateDone(); }, 800);

    } catch (e) {
        console.error(e);
        stopLoadingTicker();
        alert('生成失敗：' + e.message);
        showPhase('phase-compose');
    }
}

// ── 9. Pipeline B — Template generate ──
async function startTemplateGenerate() {
    showPhase('phase-generating');

    const barEl = document.getElementById('gen-progress');
    const pctEl = document.getElementById('gen-progress-text');

    generatedImgs = []; generatedStoryTitles = []; generatedStoryCams = []; generatedPrompts = [];

    try {
        // Step 1 — resolve variables
        updateLoadingUI(0, LOADING_STEPS_TPL);
        const tpl = state.selectedTemplate;
        const resolvedVars = await resolveVariablesFromStory(tpl);
        state.resolvedVariables = resolvedVars;

        // Step 2 — fill perShot templates
        updateLoadingUI(1, LOADING_STEPS_TPL);
        const rawPrompts = tpl.promptTemplate.perShot.map(t => fillVariables(t, resolvedVars));
        generatedStoryTitles = tpl.structure.map(s => s.action);
        generatedStoryCams = tpl.structure.map(s => `${s.camera} · ${s.angle}`);

        // Step 3 — optimise prompts
        updateLoadingUI(2, LOADING_STEPS_TPL);
        const styleDetail = STYLES[state.styleIndex].prompt;
        const styleName = STYLES[state.styleIndex].name;
        const basePrompt = fillVariables(tpl.promptTemplate.base, { ...resolvedVars, style: styleDetail });

        const optimizeReq = `以下是${rawPrompts.length}個分鏡的提示詞，請針對「${styleName}」風格（${styleDetail}）與「${state.ratio}」比例（注意畫面方向）進行優化，同時保持角色與場景的連貫性。
基底風格：${basePrompt}

分鏡提示詞：
${rawPrompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}

請嚴格按照以下格式回覆（每行以數字. 開頭，不要有多餘文字）：
1. optimized prompt in English
2. optimized prompt in English
...`;

        const optimizeRes = await askGemini(optimizeReq, 'flash');
        generatedPrompts = parseNumberedList(optimizeRes.response);
        if (generatedPrompts.length < rawPrompts.length) generatedPrompts = rawPrompts;
        state.finalPrompts = generatedPrompts;

        // Step 4 — generate images
        updateLoadingUI(3, LOADING_STEPS_TPL);
        let completedCount = 0;
        const total = generatedPrompts.length;
        for (const prompt of generatedPrompts) {
            try {
                updateLoadingUI(3, LOADING_STEPS_TPL, completedCount);
                const res = await askGemini(prompt + ', ' + styleDetail, 'image');
                generatedImgs.push(res?.image?.length > 0 ? res.image[0] : '../icon/error.jpg');
                completedCount++;
                const progress = 50 + (completedCount / total) * 45;
                barEl.style.width = `${progress}%`;
                pctEl.innerText = `${Math.floor(progress)}%`;
                if (completedCount < total) await delay(30000);
            } catch (err) {
                console.error('單張圖片生成失敗:', err);
                generatedImgs.push('../icon/error.jpg');
            }
        }

        // Step 5 — render
        updateLoadingUI(4, LOADING_STEPS_TPL);
        stopLoadingTicker();
        setTimeout(() => { renderResults(); onGenerateDone(); }, 800);

    } catch (e) {
        console.error(e);
        stopLoadingTicker();
        alert('生成失敗：' + e.message);
        showPhase('phase-template');
    }
}

// ── 10. Variable helpers (template pipeline) ──
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
            const m = text.match(new RegExp(`${v}:\\s*(.+)`, 'i'));
            resolved[v] = m ? m[1].trim().replace(/<[^>]+>/g, '').trim() : getVariableFallback(v);
        });
        return resolved;
    } catch (e) {
        const resolved = { style: STYLES[state.styleIndex].prompt };
        vars.forEach(v => { resolved[v] = getVariableFallback(v); });
        return resolved;
    }
}

function getVariableHint(varName) {
    const hints = {
        character: '主角描述（外觀、服裝、年齡）',
        student: '學生外觀描述',
        scene: '場景描述（地點、環境）',
        emotion: '主要情緒（excited, satisfied, curious等）',
        style: '視覺風格',
        product: '產品或食物名稱'
    };
    return hints[varName] || '根據故事推斷';
}

function getVariableFallback(varName) {
    const fallbacks = {
        character: 'young Asian person, casual outfit',
        student: 'young college student, casual clothes',
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

function parseNumberedList(text) {
    if (!text) return [];
    return text.split('\n')
        .map(l => l.trim())
        .filter(l => l.match(/^\d+[\.\:]/))
        .map(l => l.replace(/^\d+[\.\:]\s*/, '').trim());
}

// ── 11. Shared Result Rendering ──
function renderResults() {
    showPhase('phase-result');
    const container = document.getElementById('storyboard-grid');
    container.innerHTML = `
        <div class="view-control-bar" style="margin-bottom:24px;display:flex;justify-content:flex-end;">
            <div class="view-toggle-wrap">
                <button class="view-btn active" id="vbtn-film" onclick="toggleResultView('film')">電影膠捲</button>
                <button class="view-btn" id="vbtn-table" onclick="toggleResultView('table')">表格模式</button>
            </div>
        </div>
        <div id="view-film-content" class="result-view-part"></div>
        <div id="view-table-content" class="result-view-part" style="display:none;"></div>
    `;
    buildFilmView();
    buildTableView();
}

function toggleResultView(mode) {
    const fv = document.getElementById('view-film-content');
    const tv = document.getElementById('view-table-content');
    const fb = document.getElementById('vbtn-film');
    const tb = document.getElementById('vbtn-table');
    if (mode === 'film') {
        fv.style.display = 'block'; tv.style.display = 'none';
        fb.classList.add('active'); tb.classList.remove('active');
    } else {
        fv.style.display = 'none'; tv.style.display = 'block';
        tb.classList.add('active'); fb.classList.remove('active');
    }
}

function buildFilmView() {
    const target = document.getElementById('view-film-content');
    const ratioMap = {
        '16:9': 16 / 9, '橫向16:9': 16 / 9,
        '9:16': 9 / 16, '直向9:16': 9 / 16,
        '3:2': 3 / 2, '橫向3:2': 3 / 2,
        '2:3': 2 / 3, '直向2:3': 2 / 3,
        '1:1': 1
    };
    const currentRatio = ratioMap[state.ratio] || 1;
    const baseHeight = 400;
    const frameWidth = baseHeight * currentRatio;

    // Use template structure for titles/cams if template mode, else storyboardData
    const titles = generatedStoryTitles.length
        ? generatedStoryTitles
        : (storyboardData ? storyboardData.shots.map(s => s.story) : []);
    const cams = generatedStoryCams.length
        ? generatedStoryCams
        : (storyboardData ? storyboardData.shots.map(s => s.camera) : []);

    let html = `<div class="film-container" id="film-scroll-area"><div style="display:flex;">`;

    generatedImgs.forEach((img, i) => {
        html += `
            <div class="film-frame" style="width:${frameWidth}px;">
                <div class="sprocket-row">
                    <div class="sprocket"></div><div class="sprocket"></div><div class="sprocket"></div>
                    <span style="margin-left:auto;color:#333;font-family:'DM Mono';font-size:9px;">FRAME_${String(i + 1).padStart(2, '0')}</span>
                </div>
                <div class="frame-image-container" style="height:${baseHeight}px;">
                    <img src="${img}" style="width:100%;height:100%;object-fit:contain;">
                    <div class="frame-overlay">
                        <div class="overlay-story">${titles[i] || ''}</div>
                        <div class="overlay-camera">${cams[i] || ''}</div>
                    </div>
                </div>
                <div class="sprocket-row">
                    <div class="sprocket"></div><div class="sprocket"></div><div class="sprocket"></div>
                </div>
            </div>
        `;
    });

    html += `</div></div>`;
    target.innerHTML = html;
    initDragScroll(document.getElementById('film-scroll-area'));
}

function buildTableView() {
    const target = document.getElementById('view-table-content');
    const titles = generatedStoryTitles.length
        ? generatedStoryTitles
        : (storyboardData ? storyboardData.shots.map(s => s.story) : []);
    const cams = generatedStoryCams.length
        ? generatedStoryCams
        : (storyboardData ? storyboardData.shots.map(s => s.camera) : []);

    let html = `
        <div class="table-view-wrap">
            <table>
                <thead>
                    <tr>
                        <th style="width:60px;">#</th>
                        <th style="width:240px;">畫面回傳</th>
                        <th>腳本敘述 / 鏡頭語言</th>
                    </tr>
                </thead>
                <tbody>
    `;

    generatedImgs.forEach((img, i) => {
        html += `
            <tr>
                <td style="font-family:'DM Mono';color:var(--text-muted);">${i + 1}</td>
                <td><img src="${img}" style="width:100%;border-radius:4px;border:1px solid var(--border-warm);"></td>
                <td>
                    <div style="font-weight:500;margin-bottom:8px;">${titles[i] || ''}</div>
                    <div style="font-family:'DM Mono';font-size:11px;color:var(--accent-gold);">${cams[i] || ''}</div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    target.innerHTML = html;
}

function onGenerateDone() {
    const meta = document.getElementById('result-meta');
    const shotCount = generatedImgs.length;
    const styleName = STYLES[state.styleIndex].name;
    const ratio = state.ratio;

    let titlePart = '';
    if (state.useTemplate && state.selectedTemplate) {
        // Template mode: use template name (trimmed)
        const tplName = state.selectedTemplate.name;
        titlePart = tplName.length > 16 ? tplName.slice(0, 16) + '…' : tplName;
    } else if (storyboardData?.meta?.title) {
        // Free mode: use AI-generated title from meta
        titlePart = storyboardData.meta.title;
    } else {
        titlePart = state.story.length > 20 ? state.story.slice(0, 20) + '…' : state.story;
    }

    if (meta) meta.textContent = `${titlePart} · ${shotCount} 鏡 · ${styleName} · ${ratio}`;

    // Template badge
    const badge = document.getElementById('result-template-badge');
    if (badge) {
        if (state.useTemplate && state.selectedTemplate) {
            badge.style.display = 'flex';
            document.getElementById('badge-template-name').textContent = state.selectedTemplate.name;
            const vars = Object.entries(state.resolvedVariables)
                .filter(([k]) => k !== 'style')
                .map(([k, v]) => `${k}: ${String(v).slice(0, 20)}`)
                .join(' · ');
            document.getElementById('badge-vars').textContent = vars;
        } else {
            badge.style.display = 'none';
        }
    }
}

// ── 12. Drag Scroll ──
function initDragScroll(el) {
    let isDown = false, startX, startY, scrollLeft, scrollTop;
    const getPos = e => { const t = e.touches ? e.touches[0] : e; return { x: t.pageX, y: t.pageY }; };
    const start = e => {
        isDown = true; el.style.cursor = 'grabbing'; el.style.scrollBehavior = 'auto';
        const pos = getPos(e);
        const isV = el.classList.contains('mobile');
        if (isV) { startY = pos.y - el.offsetTop; scrollTop = el.scrollTop; }
        else { startX = pos.x - el.offsetLeft; scrollLeft = el.scrollLeft; }
    };
    const end = () => { isDown = false; el.style.cursor = 'grab'; };
    const move = e => {
        if (!isDown) return;
        const isV = el.classList.contains('mobile');
        const pos = getPos(e);
        if (isV) el.scrollTop = scrollTop - (pos.y - el.offsetTop - startY) * 2;
        else el.scrollLeft = scrollLeft - (pos.x - el.offsetLeft - startX) * 2;
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
            if (el.classList.contains('mobile')) el.scrollTop += 5 * e.deltaY;
            else el.scrollLeft += 5 * e.deltaY;
        }
    }, { passive: false });
}

// ── 13. Export ──
function exportStoryboardJson() {
    const exportData = state.useTemplate
        ? {
            metadata: {
                originalStory: state.story,
                template: state.selectedTemplate ? { id: state.selectedTemplate.id, name: state.selectedTemplate.name } : null,
                resolvedVariables: state.resolvedVariables,
                style: STYLES[state.styleIndex].name,
                ratio: state.ratio,
                exportTime: new Date().toISOString()
            },
            frames: generatedStoryTitles.map((title, i) => ({
                id: i + 1, title,
                camera: generatedStoryCams[i] || '',
                prompt: generatedPrompts[i] || '',
                image: generatedImgs[i] || ''
            }))
        }
        : {
            metadata: {
                originalStory: state.story,
                style: STYLES[state.styleIndex].name,
                stylePrompt: STYLES[state.styleIndex].prompt,
                ratio: state.ratio,
                exportTime: new Date().toISOString(),
                totalShots: storyboardData ? storyboardData.shots.length : 0
            },
            meta: storyboardData?.meta || {},
            characters: storyboardData?.characters || {},
            shots: storyboardData ? storyboardData.shots.map((shot, i) => ({
                id: shot.id || i + 1,
                story: shot.story || '',
                camera: shot.camera || '',
                duration: shot.duration || '',
                emotion: shot.emotion || '',
                characters: shot.characters || [],
                shotPrompt: shot.shotPrompt || '',
                finalPrompt: buildFinalPrompt(shot),
                image: generatedImgs[i] || ''
            })) : []
        };

    const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Storyboard_${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

// ── 14. Storyboard helpers (pipeline A) ──
function safeParseJson(text) {
    try {
        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) throw new Error('找不到 JSON');
        return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    } catch (e) {
        console.error('JSON Parse Error:', e);
        alert('AI JSON 格式錯誤');
        return null;
    }
}

function validateStoryboard(data) {
    if (!data || typeof data !== 'object') throw new Error('Storyboard 必須是 object');
    if (!data.meta || typeof data.meta !== 'object') throw new Error('缺少 meta');
    if (!data.characters || typeof data.characters !== 'object') throw new Error('缺少 characters');
    if (!Array.isArray(data.shots)) throw new Error('shots 必須是 array');
    if (data.shots.length === 0) throw new Error('shots 不可為空');
    data.shots.forEach((shot, idx) => {
        if (typeof shot !== 'object') throw new Error(`shot ${idx} 必須是 object`);
        if (typeof shot.id !== 'number') throw new Error(`shot ${idx} 缺少 id`);
        if (!shot.story || typeof shot.story !== 'string') throw new Error(`shot ${idx} 缺少 story`);
        if (!shot.camera || typeof shot.camera !== 'string') throw new Error(`shot ${idx} 缺少 camera`);
        if (!shot.duration || typeof shot.duration !== 'string') throw new Error(`shot ${idx} 缺少 duration`);
        if (!shot.emotion || typeof shot.emotion !== 'string') throw new Error(`shot ${idx} 缺少 emotion`);
        if (!Array.isArray(shot.characters)) throw new Error(`shot ${idx} characters 必須是 array`);
        if (!shot.shotPrompt || typeof shot.shotPrompt !== 'string') throw new Error(`shot ${idx} 缺少 shotPrompt`);
    });
    return true;
}

function normalizeStoryboard(data) {
    if (!data || typeof data !== 'object') return null;
    if (!data.meta || typeof data.meta !== 'object') data.meta = {};
    data.meta.title = data.meta.title || 'Untitled Storyboard';
    data.meta.style = data.meta.style || STYLES[state.styleIndex].name;
    data.meta.ratio = data.meta.ratio || state.ratio;
    if (!data.characters || typeof data.characters !== 'object') data.characters = {};
    Object.keys(data.characters).forEach(key => {
        const c = data.characters[key];
        data.characters[key] = { name: c?.name || key, appearance: c?.appearance || '', outfit: c?.outfit || '', personality: c?.personality || '' };
    });
    if (!Array.isArray(data.shots)) data.shots = [];
    data.shots = data.shots.map((shot, idx) => ({
        id: Number(shot.id) || idx + 1,
        story: (typeof shot.story === 'string' && shot.story) ? shot.story : `Shot ${idx + 1}`,
        camera: (typeof shot.camera === 'string' && shot.camera) ? shot.camera : 'medium shot',
        duration: (typeof shot.duration === 'string' && shot.duration) ? shot.duration : '3s',
        emotion: (typeof shot.emotion === 'string' && shot.emotion) ? shot.emotion : 'neutral',
        characters: Array.isArray(shot.characters) ? shot.characters : [],
        shotPrompt: (typeof shot.shotPrompt === 'string' && shot.shotPrompt) ? shot.shotPrompt : `cinematic scene, Shot ${idx + 1}, dramatic lighting`
    }));
    data.shots.forEach(shot => {
        shot.characters.forEach(charId => {
            if (!data.characters[charId]) data.characters[charId] = { name: charId, appearance: '', outfit: '', personality: '' };
        });
    });
    data.shots.sort((a, b) => a.id - b.id);
    return data;
}

// ── 15. API Helper ──
async function askGemini(question, type) {
    const res = await fetch('/api/ask-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, type })
    });
    return await res.json();
}

function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// ── 16. Height management ──
function adjustHeight() {
    if (storyInput.style.height <= storyInput.scrollHeight) {
        storyInput.style.height = '79px';
        inputArea.style.height = '119px';
    } else {
        storyInput.style.height = 'auto';
        storyInput.style.height = Math.min(storyInput.scrollHeight, 686) + 'px';
        inputArea.style.height = Math.min(storyInput.scrollHeight + 40, 726) + 'px';
    }
}

function resetHeight() {
    storyInput.style.height = '79px';
    inputArea.style.height = '79px';
}

// ── 17. Init ──
document.addEventListener('DOMContentLoaded', () => {
    const ta = document.getElementById('story-input');
    if (ta) {
        ta.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && !ta.classList.contains('locked')) {
                e.preventDefault();
                submitStory();
                ta.blur();
            }
        });
        ta.addEventListener('input', () => { resetHeight(); adjustHeight(); });
    }
});

resetAll();