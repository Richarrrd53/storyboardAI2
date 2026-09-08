const ifm = document.createElement("iframe");
ifm.id = "ifm";

// Parse parent URL to determine initial SPA route inside iframe
let route = window.location.pathname.replace(/^\/|\/$/g, '');
if (route === 'html' || route === 'index.html') route = '';

ifm.src = `./html/index.html` + (route ? `#/${route}` : '') + window.location.search;

// --- 更改部分 1: 讓 iframe 徹底填滿視窗，不鎖死比例並支援動態 Viewport (dvh) ---
ifm.style.position = "fixed";
ifm.style.top = "0";
ifm.style.left = "0";
ifm.style.width = "100%";
ifm.style.height = "100%";
ifm.style.height = "100dvh";
ifm.style.border = "none";  // 移除邊框
ifm.style.margin = "0";
ifm.style.padding = "0";
ifm.style.overflow = "hidden";

document.body.appendChild(ifm);
document.body.style.margin = "0";
document.body.style.padding = "0";
document.body.style.overflow = "hidden";
document.body.style.height = "100dvh";

function syncIframeViewport() {
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    ifm.style.height = `${vh}px`;
    ifm.style.width = "100%";
}
window.addEventListener('resize', syncIframeViewport);
window.addEventListener('orientationchange', syncIframeViewport);
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncIframeViewport);
    window.visualViewport.addEventListener('scroll', syncIframeViewport);
}
syncIframeViewport();

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