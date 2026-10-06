/** Template editor UI. Catalog data stays read-only; all views share the timeline clock. */
(function (root) {
  'use strict';
  let template = null;
  let helpers = null;
  let starts = [];
  let selectedIndex = 0;
  const $ = id => document.getElementById(id);
  const labels = {
    wide: '廣角全景', medium: '中景', 'close-up': '特寫', 'extreme-close-up': '大特寫',
    static: '固定鏡頭', handheld: '手持拍攝', tracking: '跟拍', pan: '橫向移動', tilt: '俯仰移動', zoom: '變焦',
    'eye-level': '平視', 'high-angle': '俯拍', 'low-angle': '仰拍', 'top-down': '正上方俯拍',
    hook: '開場吸引注意', first_recommendation: '介紹第一個推薦', flavor_description: '描述風味',
    sensory_highlight: '呈現感官重點', complementary_food: '補充介紹', dessert_climax: '甜點高潮',
    call_to_action: '引導觀眾行動', introduction: '介紹主題', demonstration: '示範使用',
    climax: '呈現高潮', conclusion: '總結收尾', product_showcase: '展示商品', storytelling: '推進故事'
  };
  const describe = value => labels[value] || value || '未提供';
  function timecode(seconds) {
    const tenths = Math.round(Math.max(0, seconds) * 10);
    const minutes = Math.floor(tenths / 600);
    const secondsPart = Math.floor(tenths % 600 / 10);
    return `${String(minutes).padStart(2, '0')}:${String(secondsPart).padStart(2, '0')}${tenths % 10 ? '.' + tenths % 10 : ''}`;
  }
  function dialogue(shot) {
    const value = shot.dialogue ?? shot.dialogueInfo ?? shot.voiceover ?? shot.narration;
    if (value == null || value === '') return '未提供對白／旁白';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : Object.values(item).join('：')).join('\n');
    return Object.entries(value).map(([key, text]) => `${key}：${text}`).join('\n');
  }
  function activateTab(buttons, target) {
    buttons.forEach(button => {
      const active = button === target;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      const panel = $(button.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
    });
  }
  function bindTabs(selector) {
    const buttons = [...document.querySelectorAll(selector)];
    buttons.forEach(button => {
      button.onclick = () => activateTab(buttons, button);
      button.onkeydown = event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const index = buttons.indexOf(button);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].click(); buttons[next].focus();
      };
    });
    if (buttons.length) activateTab(buttons, buttons[0]);
  }
  function select(index) {
    const shot = template?.structure?.[index];
    if (!shot) return;
    helpers.seek(starts[index]);
    helpers.inspect(shot, index, starts[index]);
    sync(index);
  }
  function sync(index) {
    const changed = selectedIndex !== index;
    selectedIndex = index;
    const shots = Array.isArray(template?.structure) ? template.structure : [];
    const shot = shots[index];
    document.querySelectorAll('[data-editor-shot]').forEach(el => {
      const active = Number(el.dataset.editorShot) === index;
      el.classList.toggle('is-active', active);
      if (el.tagName === 'BUTTON') {
        if (active) el.setAttribute('aria-current', 'true');
        else el.removeAttribute('aria-current');
      }
    });
    if ($('editor-current-shot')) $('editor-current-shot').textContent = shot ? `S${String(index + 1).padStart(2, '0')} / ${shots.length}` : '尚無鏡頭資料';
    if ($('editor-current-action')) $('editor-current-action').textContent = shot?.action || '未提供畫面內容';
    if ($('editor-prev-shot')) $('editor-prev-shot').disabled = !shot || index <= 0;
    if ($('editor-next-shot')) $('editor-next-shot').disabled = !shot || index >= shots.length - 1;
    if (changed && shot && document.querySelector('[data-inspector-tab="shot"]')?.getAttribute('aria-selected') === 'true') {
      helpers.inspect(shot, index, starts[index]);
    }
  }
  function showInspector() {
    const button = document.querySelector('[data-inspector-tab="shot"]');
    if (button) activateTab([...document.querySelectorAll('[data-inspector-tab]')], button);
  }
  function mount(data, utilities) {
    template = data;
    helpers = utilities;
    const escape = helpers.escape;
    const shots = Array.isArray(data.structure) ? data.structure : [];
    let cursor = 0;
    starts = shots.map(shot => { const start = cursor; cursor += helpers.seconds(shot); return start; });
    selectedIndex = 0;
    $('editor-sequence-count').textContent = `${shots.length} 鏡頭 · ${cursor}s`;
    $('editor-media-shot-count').textContent = String(shots.length);
    $('editor-footer-title').textContent = data.name || data.title || '無標題';
    $('editor-shot-list').innerHTML = shots.length ? shots.map((shot, index) => `<button type="button" class="editor-shot-item" data-editor-shot="${index}" aria-label="預覽鏡頭 ${index + 1}"><b>${String(index + 1).padStart(2, '0')}</b><span>${escape(shot.action || '未提供畫面')}</span><small>${helpers.seconds(shot)}s</small></button>`).join('') : '<p class="editor-help">尚無鏡頭資料</p>';
    $('editor-base-prompt').innerHTML = `<h4>模板基礎提示詞</h4><p>${escape(data.promptTemplate?.base || '尚未提供')}</p>`;
    const prompts = Array.isArray(data.promptTemplate?.perShot) ? data.promptTemplate.perShot : [];
    $('editor-prompt-list').innerHTML = prompts.map((prompt, index) => `<h4>鏡頭 ${index + 1}</h4><p>${escape(prompt)}</p>`).join('');
    const variables = Array.isArray(data.variables) ? data.variables : [];
    $('editor-variable-list').innerHTML = variables.length ? variables.map(value => `<div class="editor-variable">{${escape(value)}}</div>`).join('') : '<p class="editor-help">此模板未提供可替換變數。</p>';
    const sourceCover = data.thumbnail || data.cover || data.source?.thumbnail || (helpers.videoId(data) ? `https://i.ytimg.com/vi/${encodeURIComponent(helpers.videoId(data))}/hqdefault.jpg` : '');
    $('template-storyboard-body').innerHTML = shots.length ? shots.map((shot, index) => {
      const frame = shot.thumbnail || shot.frameUrl || shot.imageUrl || '';
      const cover = frame || sourceCover;
      const prompt = prompts[index];
      return `<tr data-editor-shot="${index}">
        <td data-label="鏡頭 / 時間"><button type="button" class="editor-shot-select" data-editor-select="${index}">S${String(index + 1).padStart(2, '0')} ↗</button><small>${timecode(starts[index])} — ${timecode(starts[index] + helpers.seconds(shot))}</small></td>
        <td data-label="參考畫面"><button type="button" class="editor-ref-preview" data-editor-select="${index}" aria-label="預覽鏡頭 ${index + 1}">${cover ? `<img src="${escape(cover)}" alt="${frame ? '鏡頭參考畫面' : '來源影片封面'}" loading="lazy">` : ''}<span>${String(index + 1).padStart(2, '0')}</span></button><small>${frame ? '鏡頭參考畫面' : cover ? '來源封面 · 點選預覽此鏡' : '點選預覽此鏡'}</small></td>
        <td data-label="畫面 / 對白"><strong>${escape(shot.action || '未提供畫面內容')}</strong><p class="editor-board-dialogue">${escape(dialogue(shot))}</p>${prompt ? `<details><summary>查看製作提示詞</summary><p>${escape(prompt)}</p></details>` : ''}</td>
        <td data-label="拍攝方式"><strong>${escape(describe(shot.camera))}</strong><small>${escape(describe(shot.angle))}</small></td>
        <td data-label="時長"><strong>${helpers.seconds(shot)} 秒</strong></td>
        <td data-label="情緒 / 目的"><strong>${escape(helpers.emotion(shot.emotion))}</strong><small>${escape(describe(shot.purpose))}</small></td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="editor-board-empty">此模板尚無分鏡資料。加入鏡頭後，即可在這裡查看拍攝內容。</td></tr>';
    document.querySelectorAll('#template-storyboard-body img').forEach(image => {
      image.onerror = () => {
        const caption = image.parentElement.nextElementSibling;
        if (caption) caption.textContent = '圖片未載入 · 點選預覽此鏡';
        image.remove();
      };
    });
    document.querySelectorAll('#editor-shot-list [data-editor-shot], [data-editor-select]').forEach(button => {
      button.onclick = () => select(Number(button.dataset.editorSelect ?? button.dataset.editorShot));
    });
    document.querySelectorAll('#template-storyboard-body tr[data-editor-shot]').forEach(row => {
      row.onclick = event => { if (!event.target.closest('button, details, a')) select(Number(row.dataset.editorShot)); };
    });
    bindTabs('[data-bin-tab]');
    bindTabs('[data-inspector-tab]');
    $('editor-prev-shot').onclick = () => select(Math.max(0, selectedIndex - 1));
    $('editor-next-shot').onclick = () => select(Math.min(shots.length - 1, selectedIndex + 1));
    $('editor-timeline-zoom').value = '100';
    $('editor-zoom-value').textContent = '100%';
    $('timeline-editor-body').style.width = '100%';
    $('editor-timeline-zoom').oninput = event => {
      $('timeline-editor-body').style.width = `${event.target.value}%`;
      $('editor-zoom-value').textContent = `${event.target.value}%`;
    };
    $('editor-export-storyboard').disabled = shots.length === 0;
    $('editor-export-storyboard').onclick = exportStoryboard;
    sync(0);
    if (shots.length) select(0);
    else {
      $('local-inspector-title').textContent = '尚未選擇鏡頭';
      $('local-inspector-badge').textContent = 'SHOT';
      $('local-inspector-body').innerHTML = '<p class="editor-help">此模板尚無鏡頭資料。可切換「模板資訊」查看已提供的分析內容。</p>';
    }
  }
  function exportStoryboard() {
    const rows = [['鏡頭', '開始時間', '結束時間', '時長（秒）', '畫面內容', '對白／旁白', '拍攝方式', '拍攝角度', '情緒', '目的', '製作提示詞']];
    template.structure.forEach((shot, index) => rows.push([index + 1, timecode(starts[index]), timecode(starts[index] + helpers.seconds(shot)), helpers.seconds(shot), shot.action || '', dialogue(shot), describe(shot.camera), describe(shot.angle), helpers.emotion(shot.emotion), describe(shot.purpose), template.promptTemplate?.perShot?.[index] || '']));
    const csv = '\ufeff' + rows.map(row => row.map(value => {
      let text = String(value);
      if (/^[=+\-@]/.test(text)) text = "'" + text;
      return `"${text.replace(/"/g, '""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `${template.name || '模板'}-分鏡表.csv`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  root.TemplateEditor = { mount, sync, showInspector, select, describe, dialogue, timecode, destroy() { template = helpers = null; starts = []; selectedIndex = 0; } };
})(window);
