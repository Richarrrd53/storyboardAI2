const $ = (id) => document.getElementById(id);

const filmView = $('film-view');
const tableView = $('table-view');
const tbody = $('tbody');
const dropzone = $('dropzone');
const emptyState = $('empty-state');
const toast = $('toast');
const viewToggle = $('view-toggle');

let currentData = null;
let currentView = 'film'; // default

// ── helpers ──────────────────────────────────────────
function showToast(msg, type = '') {
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 2600);
}

function escapeHTML(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function pick(obj, keys, fallback = '') {
    if (!obj) return fallback;
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
    }
    return fallback;
}

function formatDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function splitCamera(s) {
    if (!s) return ['', ''];
    const m = String(s).match(/^([^，,]+)[，,]\s*(.+)$/);
    if (m) return [m[1].trim(), m[2].trim()];
    return [String(s).trim(), ''];
}

// ── View switching ────────────────────────────────────
function switchView(mode) {
    currentView = mode;

    const filmBtn = $('vbtn-film');
    const tableBtn = $('vbtn-table');

    if (mode === 'film') {
        filmBtn.classList.add('active');
        tableBtn.classList.remove('active');
        filmView.classList.add('visible');
        filmView.classList.add('fade-in-view');
        tableView.classList.remove('visible');
    } else {
        tableBtn.classList.add('active');
        filmBtn.classList.remove('active');
        tableView.classList.add('visible');
        tableView.classList.add('fade-in-view');
        filmView.classList.remove('visible');
    }

    // Remove animation class after it plays so re-toggling works
    setTimeout(() => {
        filmView.classList.remove('fade-in-view');
        tableView.classList.remove('fade-in-view');
    }, 400);
}

// ── Render film strip ─────────────────────────────────
function buildSprockets(count) {
    let html = '<div class="filmstrip-rail">';
    for (let i = 0; i < count; i++) html += '<div class="rail-hole"></div>';
    html += '</div>';
    return html;
}

function renderFilmView(scenes) {
    const holeCount = Math.max(scenes.length * 3, 20);
    let html = buildSprockets(holeCount);

    html += '<div class="filmstrip-container"><div class="filmstrip">';

    scenes.forEach((scene, idx) => {
        const id = pick(scene, ['id', 'index', 'no'], idx + 1);
        const image = pick(scene, ['image', 'img', 'imageUrl', 'thumbnail', 'src'], '');
        const title = pick(scene, ['title', 'description', 'desc', 'scene'], '');

        let camType = pick(scene, ['cameraType', 'shot', 'shotType'], '');
        let camDetail = pick(scene, ['cameraDetail', 'cameraNote', 'note', 'lens'], '');
        if (!camType && !camDetail) {
            const combined = pick(scene, ['camera'], '');
            [camType, camDetail] = splitCamera(combined);
        } else if (!camType) {
            camType = pick(scene, ['camera'], '');
        }

        const imgHTML = image
            ? `<img src="${escapeHTML(image)}" alt="" loading="lazy"
             onerror="this.outerHTML='<div class=\\'film-placeholder\\'>NO IMAGE</div>'">`
            : `<div class="film-placeholder">NO IMAGE</div>`;

        const camHTML = camType
            ? `<span class="film-badge">${escapeHTML(camType)}</span>
         ${camDetail ? `<div class="film-cam-detail">${escapeHTML(camDetail)}</div>` : ''}`
            : (camDetail ? `<div class="film-cam-detail">${escapeHTML(camDetail)}</div>` : '');

        html += `
      <div class="film-frame">
        <div class="sprocket-row">
          <div class="sprocket"></div><div class="sprocket"></div><div class="sprocket"></div>
          <span class="frame-num">${String(id).padStart(2, '0')}</span>
        </div>
        <div class="film-img-wrap">${imgHTML}</div>
        <div class="film-caption">
          <div class="film-caption-title">${escapeHTML(title)}</div>
          <div class="film-camera">${camHTML}</div>
        </div>
        <div class="sprocket-row bottom">
          <div class="sprocket"></div><div class="sprocket"></div><div class="sprocket"></div>
        </div>
      </div>`;
    });

    html += '</div></div>'; // filmstrip + filmstrip-container
    html += buildSprockets(holeCount); // bottom rail

    filmView.innerHTML = html;

    // ── Wheel → horizontal scroll ──────────────────────
    const container = filmView.querySelector('.filmstrip-container');
    if (container) {
        container.addEventListener('wheel', (e) => {
            if (e.deltaX !== 0) return; // let native trackpad horizontal swipe pass
            e.preventDefault();

            // Accumulate target and animate with rAF for momentum feel
            container._wheelTarget = (container._wheelTarget ?? container.scrollLeft) + e.deltaY * 2;
            if (!container._wheelRaf) {
                container._wheelRaf = requestAnimationFrame(function step() {
                    const diff = container._wheelTarget - container.scrollLeft;
                    if (Math.abs(diff) < 0.5) {
                        container.scrollLeft = container._wheelTarget;
                        container._wheelRaf = null;
                    } else {
                        container.scrollLeft += diff * 0.3;
                        container._wheelRaf = requestAnimationFrame(step);
                    }
                });
            }
        }, { passive: false });

        // ── Pointer drag to scroll ─────────────────────────
        let isDragging = false, startX = 0, startScroll = 0;

        container.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            startX = e.clientX;
            startScroll = container.scrollLeft;
            container._wheelTarget = container.scrollLeft;
            container.classList.add('is-dragging');
            container.setPointerCapture(e.pointerId);
        });

        container.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            container.scrollLeft = startScroll - dx;
            container._wheelTarget = container.scrollLeft;
        });

        const stopDrag = () => {
            isDragging = false;
            container.classList.remove('is-dragging');
        };
        container.addEventListener('pointerup', stopDrag);
        container.addEventListener('pointercancel', stopDrag);
    }
}
function updateData(idx, field, value) {
    const scenes = currentData.scenes || currentData.frames || currentData.shots || [];
    if (scenes[idx]) {
        scenes[idx][field] = value;
        // 同步更新電影膠捲視圖（可選，若需要即時連動）
        renderFilmView(scenes);
    }
}

// ── Render table view ─────────────────────────────────
function renderTableView(scenes) {
    tbody.innerHTML = '';
    scenes.forEach((scene, idx) => {
        // 資料對應
        const camera = pick(scene, ['id'], '未設定鏡頭');
        const image = pick(scene, ['image', 'img', 'imageUrl'], '');
        const action = pick(scene, ['title', 'description', 'action'], '');
        const time = pick(scene, ['duration', 'time', 'length'], '0s');
        const note = pick(scene, ['emotion', 'note', 'memo'], '—');

        const tr = document.createElement('tr');
        tr.innerHTML = `
                    <td class="camera-cell">
                        <div class="editable-cell" contenteditable="true" onblur="updateData(${idx}, 'camera', this.innerText)">${escapeHTML(camera)}</div>
                    </td>
                    <td class="img-cell">
                        ${image ? `<img src="${escapeHTML(image)}" onerror="this.outerHTML='<div class=\\'placeholder\\'>IMAGE FAILED</div>'">` : `<div class="placeholder">NO IMAGE</div>`}
                    </td>
                    <td class="title-cell">
                        <div class="editable-cell" contenteditable="true" onblur="updateData(${idx}, 'title', this.innerText)">${escapeHTML(action)}</div>
                    </td>
                    <td class="time-cell">
                        <div class="editable-cell" contenteditable="true" onblur="updateData(${idx}, 'duration', this.innerText)">${escapeHTML(time)}</div>
                    </td>
                    <td class="note-cell">
                        <div class="editable-cell" contenteditable="true" onblur="updateData(${idx}, 'emotion', this.innerText)">${escapeHTML(note)}</div>
                    </td>
                `;
        tbody.appendChild(tr);
    });
}

// ── Master render ─────────────────────────────────────
function render(data) {
    currentData = data;

    const meta = data.metadata || data;
    $('sb-title').textContent = pick(meta, ['title', 'originalStory', 'name', 'subject'], '未命名分鏡');
    $('sb-style').textContent = pick(meta, ['style', 'mood'], '—');
    $('sb-ratio').textContent = pick(meta, ['ratio', 'aspectRatio', 'aspect'], '—');
    $('sb-date').textContent = formatDate(pick(meta, ['exportDate', 'exportTime', 'date', 'createdAt'], ''));

    const scenes = data.scenes || data.frames || data.shots || data.rows || [];
    $('sb-count').textContent = scenes.length;

    if (!scenes.length) {
        emptyState.style.display = 'block';
        dropzone.style.display = 'block';
        filmView.classList.remove('visible');
        tableView.classList.remove('visible');
        viewToggle.style.display = 'none';
        $('btn-export').style.display = 'none';
        $('btn-pdf').style.display = 'none';
        $('btn-clear').style.display = 'none';
        return;
    }

    // Build both views
    renderFilmView(scenes);
    renderTableView(scenes);

    // Show UI chrome
    emptyState.style.display = 'none';
    dropzone.style.display = 'none';
    viewToggle.style.display = 'inline-flex';
    $('btn-export').style.display = 'inline-flex';
    $('btn-pdf').style.display = 'inline-flex';
    $('btn-clear').style.display = 'inline-flex';

    // Apply the currently active view (default: film)
    switchView(currentView);
}

// ── File handling ─────────────────────────────────────
function handleFile(file) {
    if (!file) return;
    if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
        showToast('請選擇 .json 檔案', 'error'); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const normalized = Array.isArray(data) ? { scenes: data } : data;
            render(normalized);
            showToast(`已匯入 ${file.name}`, 'success');
        } catch (err) {
            console.error(err);
            showToast('JSON 解析失敗：' + err.message, 'error');
        }
    };
    reader.onerror = () => showToast('讀取檔案失敗', 'error');
    reader.readAsText(file);
}

// ── Sample data ───────────────────────────────────────
const SAMPLE = {
    title: "一隻狗狗在草地上奔跑",
    style: "電影風格",
    ratio: "橫向16:9",
    exportDate: "2026-04-20",
    scenes: [
        {
            id: 1,
            image: "",
            title: "在寂靜的清晨，一隻黃金獵犬伏在翠綠的草地上，目光專注地凝視遠方。側向而來的金色光線勾勒出牠細膩的毛髮紋理，空氣中漂浮著微小的塵埃，預示著奔跑前的寧靜。",
            cameraType: "特寫鏡頭",
            cameraDetail: "大光圈淺景深，低角度。",
            prompt: "close-up of a golden retriever lying on dewy green grass at dawn, side-lit by warm golden light"
        },
        {
            id: 2,
            image: "",
            title: "狗狗猛然發力，四肢蹬開泥土奔向前方。廣闊的草原在廣角鏡頭下顯得無邊無際，長長的黑影隨其動作律動，展現出強烈的視覺衝擊力。",
            cameraType: "遠景",
            cameraDetail: "廣角鏡頭，仰角拍攝。",
            prompt: "wide-angle low-angle shot of a golden retriever sprinting across a vast endless prairie"
        },
        {
            id: 3,
            image: "",
            title: "鏡頭貼近地面快速移動，捕捉狗狗肉掌踩踏草地的力量感。飛濺的草葉與露珠在深色陰影中閃爍，呈現出如同電影動作片般的感官體驗。",
            cameraType: "追蹤鏡頭",
            cameraDetail: "極低角度，動態模糊。",
            prompt: "tracking shot at extreme low angle following a dog's paws pounding the grass, motion blur"
        },
        {
            id: 4,
            image: "",
            title: "奔跑中的狗狗側臉特寫，長耳隨風劇烈擺動，眼神充滿純粹的快樂。背景是虛化的森林邊緣，強烈的逆光形成耀眼的邊緣光效，主體極其清晰。",
            cameraType: "中景",
            cameraDetail: "跟隨拍攝，逆光。",
            prompt: "medium tracking shot of a running dog's profile, ears flapping in wind, joyful eyes, blurred forest"
        },
        {
            id: 5,
            image: "",
            title: "狗狗奔向地平線，身形在落日餘暉中化為一道充滿力量的剪影。畫面逐漸變暗，強調光影的極致對比，留給觀眾無限的自由想像空間。",
            cameraType: "全景鏡頭",
            cameraDetail: "剪影效果，固定鏡頭。",
            prompt: "wide static shot of a dog running toward the horizon, powerful silhouette against a setting sun"
        }
    ]
};

// ── Button events ─────────────────────────────────────
$('btn-import').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => handleFile(e.target.files[0]));

$('btn-sample').addEventListener('click', () => {
    render(SAMPLE);
    showToast('已載入範例資料', 'success');
});

$('btn-template').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(SAMPLE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'storyboard_template.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('模板已下載', 'success');
});

$('btn-export').addEventListener('click', () => {
    if (!currentData) return;
    const blob = new Blob([JSON.stringify(currentData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (currentData.title || 'storyboard') + '.json'; a.click();
    URL.revokeObjectURL(url);
    showToast('JSON 已匯出', 'success');
});

$('btn-clear').addEventListener('click', () => {
    currentData = null;
    currentView = 'film'; // reset to default
    $('sb-title').textContent = '尚未匯入分鏡資料';
    $('sb-style').textContent = '—';
    $('sb-ratio').textContent = '—';
    $('sb-date').textContent = '—';
    $('sb-count').textContent = '0';
    tbody.innerHTML = '';
    filmView.innerHTML = '';
    filmView.classList.remove('visible');
    tableView.classList.remove('visible');
    viewToggle.style.display = 'none';
    emptyState.style.display = 'block';
    dropzone.style.display = 'block';
    $('btn-export').style.display = 'none';
    $('btn-clear').style.display = 'none';
    $('file-input').value = '';
    // Reset toggle button states
    $('vbtn-film').classList.add('active');
    $('vbtn-table').classList.remove('active');
});

// ── Drag & drop ───────────────────────────────────────
['dragenter', 'dragover'].forEach(ev =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); })
);
['dragleave', 'drop'].forEach(ev =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); })
);
dropzone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));
dropzone.addEventListener('click', () => $('file-input').click());

// ── Full-page drag overlay ────────────────────────────
const dragOverlay = $('drag-overlay');
let dragCounter = 0; // track nested dragenter/dragleave

window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dragCounter === 1) dragOverlay.classList.add('active');
});

window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        dragOverlay.classList.remove('active');
    }
});

window.addEventListener('dragover', (e) => e.preventDefault());

window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    dragOverlay.classList.remove('active');
    if (e.target.closest('.dropzone')) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});


$('btn-pdf').addEventListener('click', () => {
    if (!currentData) return;

    const element = document.querySelector('#table-view');
    const originalDisplay = element.style.display;

    // 1. 強制顯示
    element.style.display = 'block';
    element.classList.add('pdf-light-export');

    const opt = {
        margin: [5, 5], 
        filename: `${currentData.title || 'storyboard'}_print.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        html2canvas: {
            scale: 2, // 保持高解析度
            backgroundColor: '#ffffff',
            useCORS: true,
            scrollY: 0,
            scrollX: 0,
            // ── 核心修正：鎖定模擬視窗寬度，不隨瀏覽器縮放跑掉 ──
            windowWidth: 1200, 
            letterRendering: true,
            logging: false
        },
        jsPDF: { 
            unit: 'mm', 
            format: 'a4', 
            orientation: 'landscape',
            // 讓內容自動填滿 A4 寬度
            compress: true 
        }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        element.classList.remove('pdf-light-export');
        element.style.display = originalDisplay;
        showToast('比例已鎖定並成功匯出', 'success');
    });
});

const initResizers = () => {
    const resizers = document.querySelectorAll('.resizer');
    
    resizers.forEach(resizer => {
        let startX, startWidth;

        resizer.addEventListener('mousedown', (e) => {
            startX = e.pageX;
            const header = resizer.parentElement;
            startWidth = header.offsetWidth;

            resizer.classList.add('resizing');

            const onMouseMove = (e) => {
                const width = startWidth + (e.pageX - startX);
                if (width > 60) { // 設定最小寬度限制
                    header.style.width = `${width}px`;
                }
            };

            const onMouseUp = () => {
                resizer.classList.remove('resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
};

// 記得在渲染表格後呼叫它
const originalRenderTableView = renderTableView;
renderTableView = (scenes) => {
    originalRenderTableView(scenes);
    initResizers(); // 每次渲染後重新綁定事件
};