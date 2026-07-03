let templateSelectedVideo = {
    type: 'url',
    url: '',
    file: null
};

function initTemplatePage() {
    const tabs = document.querySelectorAll('.video-source-tab');
    const fileInput = document.getElementById('video-file-input');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const source = tab.dataset.source;
            selectVideoSource(source);
        });
    });

    if (fileInput) {
        fileInput.addEventListener('change', handleVideoFileChange);
    }
}

function openNewTemplateModal() {
    const modal = document.getElementById('template-modal');
    if (!modal) return;
    modal.classList.add('active');
    resetNewTemplateModal();
}

function closeNewTemplateModal() {
    const modal = document.getElementById('template-modal');
    if (!modal) return;
    modal.classList.remove('active');
}

function selectVideoSource(source) {
    const tabs = document.querySelectorAll('.video-source-tab');
    const panels = document.querySelectorAll('.video-source-panel');

    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.source === source));
    panels.forEach(panel => panel.classList.toggle('active', panel.dataset.target === source));

    templateSelectedVideo.type = source;
    templateSelectedVideo.url = '';
    templateSelectedVideo.file = null;

    const urlInput = document.getElementById('video-url-input');
    const fileName = document.getElementById('video-file-name');
    if (urlInput) urlInput.value = '';
    if (fileName) fileName.textContent = '目前尚未選擇檔案';
}

function handleVideoFileChange(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    const fileNameEl = document.getElementById('video-file-name');

    if (file) {
        templateSelectedVideo.type = 'file';
        templateSelectedVideo.file = file;
        if (fileNameEl) fileNameEl.textContent = `已選擇：${file.name}`;
    } else {
        templateSelectedVideo.file = null;
        if (fileNameEl) fileNameEl.textContent = '目前尚未選擇檔案';
    }
}

function resetNewTemplateModal() {
    const urlInput = document.getElementById('video-url-input');
    const fileInput = document.getElementById('video-file-input');
    const fileNameEl = document.getElementById('video-file-name');
    const nameInput = document.getElementById('template-name-input');
    const descInput = document.getElementById('template-description-input');

    selectVideoSource('url');
    templateSelectedVideo = { type: 'url', url: '', file: null };

    if (urlInput) urlInput.value = '';
    if (fileInput) fileInput.value = '';
    if (fileNameEl) fileNameEl.textContent = '目前尚未選擇檔案';
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
}

async function submitNewTemplate() {
    const nameInput = document.getElementById('template-name-input');
    const descInput = document.getElementById('template-description-input');
    const urlInput = document.getElementById('video-url-input');

    const templateName = nameInput?.value.trim();
    const templateDesc = descInput?.value.trim();
    const videoUrl = urlInput?.value.trim();
    const videoFile = templateSelectedVideo.file;

    if (!templateName) {
        alert('請輸入模板名稱');
        return;
    }

    if (templateSelectedVideo.type === 'url') {
        if (!videoUrl) {
            alert('請輸入影片網址，或選擇上傳影片檔案');
            return;
        }
        if (!/^https?:\/\/.+/.test(videoUrl)) {
            alert('請輸入有效的影片網址，例如 https://');
            return;
        }
        templateSelectedVideo.url = videoUrl;
    } else if (templateSelectedVideo.type === 'file') {
        if (!videoFile) {
            alert('請選擇要上傳的影片檔案');
            return;
        }
    }

    const templateId = 'tpl_' + Math.random().toString(36).substr(2, 9);
    const payload = {
        id: templateId,
        name: templateName,
        category: 'custom',
        tags: ['#自訂模板'],
        description: templateDesc,
        narrative: {
            type: 'dialogue',
            structure: '起承轉合',
            tone: 'casual',
            summary: templateDesc
        },
        visualFlow: {
            pace: 'medium',
            transitionStyle: 'cut'
        },
        promptTemplate: {
            base: 'High-quality video shot, {style} style.',
            perShot: [
                '{character} in {scene} with {emotion} expression, {style} style.'
            ]
        },
        variables: ['character', 'scene', 'emotion'],
        platform: ['shorts'],
        shotsCount: 1,
        structure: [
            {
                shot: 1,
                duration: '5s',
                camera: 'static',
                angle: 'eye-level',
                action: '主角在畫面中展示產品',
                emotion: 'satisfaction',
                purpose: '產品展示'
            }
        ]
    };

    try {
        const res = await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            alert(`已成功建立並儲存模板到資料庫！\n名稱：${templateName}`);
            closeNewTemplateModal();
            // Trigger refresh of the SPA template page
            if (typeof window.location.reload === 'function') {
                // We are in an iframe, we can re-render via SPA navigate
                if (window.spaNavigate) {
                    window.spaNavigate('template', { force: true });
                } else {
                    window.location.reload();
                }
            }
        } else {
            const err = await res.json();
            alert('儲存模板失敗: ' + (err.error || '未知錯誤'));
        }
    } catch (e) {
        console.error(e);
        alert('儲存模板失敗: ' + e.message);
    }
}
