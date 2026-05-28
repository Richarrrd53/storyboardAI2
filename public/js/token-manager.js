const TOKEN_LIMIT = 1000000; // 假設上限 100 萬 (Gemini Flash 免費額度很高)

function initTokenDisplay() {
    const used = parseInt(localStorage.getItem('storyboard_used_tokens')) || 0;
    renderTokenUI(used);
}

function updateTokenUsage(amount) {
    let used = parseInt(localStorage.getItem('storyboard_used_tokens')) || 0;
    used += amount;
    localStorage.setItem('storyboard_used_tokens', used);
    renderTokenUI(used);
}

function renderTokenUI(used) {
    const countEl = document.getElementById('token-count');
    const remainEl = document.getElementById('token-remain');
    const barEl = document.getElementById('token-bar-fill');

    if (countEl) countEl.innerText = used.toLocaleString();
    if (remainEl) remainEl.innerText = (TOKEN_LIMIT - used).toLocaleString();
    
    if (barEl) {
        const percentage = (used / TOKEN_LIMIT) * 100;
        barEl.style.width = Math.min(percentage, 100) + '%';
        // 顏色警告
        if (percentage > 90) barEl.style.background = '#ff4f5b'; 
    }
}

// 頁面載入執行
document.addEventListener('DOMContentLoaded', initTokenDisplay);