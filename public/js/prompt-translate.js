(function () {
    'use strict';

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 核心優化：改成 async 函數，實現自動化線上翻譯
    async function translatePromptText(value) {
        if (value == null) return '';
        let text = String(value).trim();
        if (!/[A-Za-z]/.test(text)) return text;

        // 1. 保護 {placeholders} 占位符（避免被翻譯軟體誤翻）
        const placeholders = [];
        text = text.replace(/\{([^}]+)\}/g, function (_, name) {
            const token = `__PROMPT_PLACEHOLDER_${placeholders.length}__`;
            placeholders.push({ token, value: `{${name}}` });
            return token;
        });

        // 2. 自動化翻譯核心：調用免金鑰的 Google 翻譯 API
        try {
            // sl=auto (自動偵測來源語言), tl=zh-TW (翻譯成繁體中文)
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error('網路請求失敗');
            
            const result = await response.json();
            
            // Google 翻譯返回的結構是多維陣列，需要將可能拆碎的句子重新拼接
            if (result && result[0]) {
                text = result[0].map(item => item[0]).join('');
            }
        } catch (error) {
            console.error('自動翻譯出錯，降級使用原文字：', error);
            // 如果斷網或 API 失效，至少還能返回原文，不至於讓程式崩潰
        }

        // 3. 中文標點符號標準化（自動修復翻譯後的排版）
        text = text
            .replace(/,\s*/g, '，')
            .replace(/\.\s*/g, '。')
            .replace(/:\s*/g, '：')
            .replace(/;\s*/g, '；')
            .replace(/\?\s*/g, '？')
            .replace(/!\s*/g, '！')
            .replace(/\s+/g, ' ') 
            .trim();

        text = text
            .replace(/。+/g, '。')
            .replace(/，+/g, '，')
            .replace(/：+/g, '：');

        // 4. 還原被保護的占位符
        placeholders.forEach(function (item) {
            text = text.replace(new RegExp(item.token, 'g'), item.value);
        });

        return text;
    }

    // 因為內部呼叫了 async 函數，這裡也必須是 async
    async function formatPromptText(value) {
        const translated = await translatePromptText(value);
        return escapeHtml(translated).replace(/\n/g, '<br>');
    }

    // 掛載到全域視窗
    window.translatePromptText = translatePromptText;
    window.formatPromptText = formatPromptText;
})();(function () {
    'use strict';

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // 自動化線上翻譯核心（非同步函數）
    async function translatePromptText(value) {
        if (value == null) return '';
        let text = String(value).trim();
        if (!/[A-Za-z]/.test(text)) return text;

        // 1. 保護 {placeholders} 占位符
        const placeholders = [];
        text = text.replace(/\{([^}]+)\}/g, function (_, name) {
            const token = `__PROMPT_PLACEHOLDER_${placeholders.length}__`;
            placeholders.push({ token, value: `{${name}}` });
            return token;
        });

        // 2. 免金鑰調用 Google 翻譯 API
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('網路請求失敗');
            
            const result = await response.json();
            if (result && result[0]) {
                text = result[0].map(item => item[0]).join('');
            }
        } catch (error) {
            console.error('自動翻譯出錯，降級使用原文字：', error);
        }

        // 3. 中文標點符號標準化
        text = text
            .replace(/,\s*/g, '，')
            .replace(/\.\s*/g, '。')
            .replace(/:\s*/g, '：')
            .replace(/;\s*/g, '；')
            .replace(/\?\s*/g, '？')
            .replace(/!\s*/g, '！')
            .replace(/\s+/g, ' ') 
            .trim();

        text = text
            .replace(/。+/g, '。')
            .replace(/，+/g, '，')
            .replace(/：+/g, '：');

        // 4. 還原被保護的占位符
        placeholders.forEach(function (item) {
            text = text.replace(new RegExp(item.token, 'g'), item.value);
        });

        return text;
    }

    // 格式化輸出（同樣必須是非同步函數）
    async function formatPromptText(value) {
        const translated = await translatePromptText(value);
        return escapeHtml(translated).replace(/\n/g, '<br>');
    }

    // 掛載到全域視窗
    window.translatePromptText = translatePromptText;
    window.formatPromptText = formatPromptText;
})();