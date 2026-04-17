const ifm = document.createElement("iframe");
ifm.id = "ifm";
ifm.src = "./html/index.html";

// --- 更改部分 1: 讓 iframe 徹底填滿視窗，不鎖死比例 ---
ifm.style.position = "fixed";
ifm.style.top = "0";
ifm.style.left = "0";
ifm.style.width = "100vw";  // 佔滿 100% 視窗寬度
ifm.style.height = "100vh"; // 佔滿 100% 視窗高度
ifm.style.border = "none";  // 移除邊框
ifm.style.margin = "0";
ifm.style.padding = "0";
ifm.style.overflow = "hidden";

document.body.appendChild(ifm);
document.body.style.margin = "0"; // 確保 body 沒有預設間距

// --- 更改部分 2: 移除所有複雜的 scale 計算 ---
// 因為我們使用了 100vw/vh，瀏覽器會自動處理解析度，不再需要手動縮放
function adjustScale() {
    // 這裡留空，或者可以直接刪除此函數
    // 讓內部的 html/index.html 透過 CSS 自行適應寬度
}

window.addEventListener('resize', () => {
    // 視窗變動時，100vw/vh 會自動調整，不需要額外計算
});

// 保留你原本的全螢幕功能
function fullScreenBtnClick(x) {
    fullscreen();
    x.style.display = 'none';
}

function fullscreen() {
    if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
        if (document.body.requestFullscreen) {
            document.body.requestFullscreen();
        } else if (document.body.webkitRequestFullscreen) {
            document.body.webkitRequestFullscreen();
        }
    }
}