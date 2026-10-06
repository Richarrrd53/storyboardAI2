(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const variableLabels = { character: '主角／角色', scene: '場景', product: '商品／主題', emotion: '情緒', style: '視覺風格', brand: '品牌', audience: '目標受眾', cta: '行動指引' };
  function definitions(template) {
    const explicit = (Array.isArray(template?.variables) ? template.variables : []).map(value => typeof value === 'string' ? { name: value } : value).filter(value => value && typeof value.name === 'string');
    const prompts = [template?.promptTemplate?.base, ...(Array.isArray(template?.promptTemplate?.perShot) ? template.promptTemplate.perShot : [])].filter(value => typeof value === 'string').join('\n');
    const found = [...prompts.matchAll(/\{([\w-]+)\}/g)].map(match => ({ name: match[1] }));
    return [...new Map([...found, ...explicit].map(value => [value.name, value])).values()];
  }
  function selection(session, state = {}, signal) {
    const template = session.selectedTemplate;
    const banner = $('template-entry-banner');
    if (banner) {
      banner.hidden = !template && !state.loading && !state.error;
      $('template-entry-title').textContent = state.loading ? '正在載入套用的模板…' : state.error || `已套用：${template?.name || template?.title || '模板'}`;
      $('template-entry-description').textContent = template ? `${template.structure?.length || 0} 個鏡頭 · 填寫你的企劃，AI 將保留節奏並改寫內容。` : state.error ? '可以重試載入，或返回模板庫選擇其他模板。' : '正在取得鏡頭結構與製作設定。';
      $('btn-reload-template').hidden = !state.error;
    }
    const section = $('template-customization');
    if (!section) return;
    section.hidden = !template;
    if (!template) return;
    $('template-customization-title').textContent = template.name || template.title || '模板客製';
    const seconds = (template.structure || []).reduce((sum, shot) => sum + (parseFloat(shot.duration) > 0 ? parseFloat(shot.duration) : 3), 0);
    $('template-customization-summary').textContent = `${template.structure?.length || 0} 鏡頭 · ${seconds} 秒 · 保留鏡頭順序、拍攝方式與敘事節奏`;
    const list = $('template-variable-fields');
    session.templateValues ||= {};
    list.innerHTML = definitions(template).map((value, index) => `<label class="template-variable-field" for="template-value-${index}"><span>${escape(value.label || variableLabels[value.name] || value.name)}</span><input id="template-value-${index}" data-template-variable="${escape(value.name)}" type="text" maxlength="500" value="${escape(session.templateValues[value.name] || '')}" placeholder="${escape(value.description || '選填，未填將依企劃自動規劃')}" autocomplete="off"></label>`).join('') || '<p>此模板沒有額外變數，AI 會依照你的企劃改寫鏡頭內容。</p>';
    list.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
      session.templateValues[input.dataset.templateVariable] = input.value;
    }, signal ? { signal } : undefined));
    $('template-reference-summary').innerHTML = `<ol>${(template.structure || []).map(shot => `<li><strong>${escape(shot.action || '未提供畫面描述')}</strong><span>${escape(shot.duration || '3s')} · ${escape(shot.camera || '未提供拍攝方式')}</span></li>`).join('')}</ol>`;
  }
  function download(text, filename, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a'); link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportJSON(task) {
    download(JSON.stringify({ title: task.result.storyboardData?.meta?.title, story: task.input.story, style: task.input.style.name, ratio: task.input.ratio, templateId: task.input.selectedTemplate?.id || null, templateValues: task.input.templateValues || {}, characters: task.result.storyboardData?.characters || {}, shots: task.result.generatedShotData.map(shot => ({ ...shot, shot: shot.order, image: shot.payload.image })) }, null, 2), `storyboard_${Date.now()}.json`, 'application/json');
  }
  function exportCSV(task) {
    const rows = [['鏡頭', '畫面內容', '拍攝方式', '時長', '拍攝角度', '情緒', '對白／旁白', '目的', '圖像狀態', '製作提示詞']];
    task.result.generatedShotData.forEach(shot => rows.push([shot.order, shot.title, shot.camera, shot.duration, shot.payload.angle, shot.payload.emotion, typeof shot.payload.dialogue === 'string' ? shot.payload.dialogue : JSON.stringify(shot.payload.dialogue), shot.payload.purpose, shot.payload.imageStatus === 'succeeded' ? '已完成' : '待重試', shot.payload.finalPrompt]));
    const csv = '\ufeff' + rows.map(row => row.map(value => {
      let text = String(value ?? ''); if (/^[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }).join(',')).join('\r\n');
    download(csv, `storyboard_${Date.now()}.csv`, 'text/csv;charset=utf-8');
  }
  function results(task) {
    const shots = task.result.generatedShotData;
    const failed = task.result.failedShotIndexes || [];
    const save = task.save || { status: task.projectId ? 'saved' : 'local' };
    $('result-heading').textContent = failed.length ? `腳本完成，${failed.length} 張圖片待重試` : '分鏡生成完成';
    $('result-save-status').textContent = save.status === 'saved' ? '已儲存至專案，可隨時回來編輯。' : save.status === 'saving' ? '正在儲存分鏡…' : save.error || '分鏡保留在目前頁面，尚未儲存至專案。';
    $('result-save-status').dataset.status = save.status;
    $('btn-retry-save').hidden = save.status === 'saved' || save.status === 'saving';
    $('btn-retry-save').textContent = root.spaAuth?.isLoggedIn() ? '重試儲存' : '登入後儲存';
    $('btn-retry-save').onclick = () => root.spaAuth?.isLoggedIn() ? root.GenerationTask.retrySave() : root.spaNavigate?.('login');
    $('btn-open-generated-project').hidden = !task.projectId || save.status !== 'saved';
    $('btn-open-generated-project').onclick = () => root.spaNavigate?.('project', { id: task.projectId });
    $('btn-retry-failed-images').hidden = !failed.length;
    $('btn-retry-failed-images').textContent = `重試失敗圖片（${failed.length}）`;
    $('btn-retry-failed-images').onclick = () => { root.GenerationTask.retryFailedImages(); root.switchPhase(4, false); };
    $('btn-export-result-csv').onclick = () => exportCSV(task);
    $('result-meta-info').textContent = `${shots.length} 個鏡頭 · 圖片 ${shots.length - failed.length}/${shots.length} 完成 · ${task.input.style.name} · ${task.input.ratio}`;
    $('storyboard-grid').innerHTML = shots.map(shot => `<article class="shot-card"><div class="shot-card-thumb">${shot.payload.imageStatus === 'succeeded' ? `<img src="${escape(shot.payload.image)}" alt="鏡頭 ${shot.order}：${escape(shot.title)}">` : '<div class="generation-image-failure"><strong>圖片尚未完成</strong><span>腳本已保留，可重試圖片生成。</span></div>'}<span class="shot-num-badge">#${shot.order}</span></div><div class="shot-card-meta"><div class="shot-title">${escape(shot.title)}</div><div class="shot-cam">${escape(shot.camera)} · ${escape(shot.duration)}</div><details><summary>查看分鏡資料</summary><p>${escape(shot.payload.dialogue || '未提供對白')}</p><p>情緒：${escape(shot.payload.emotion || '未提供')}</p><p>敘事目的：${escape(shot.payload.purpose || '未提供')}</p><p class="result-shot-prompt">${escape(shot.payload.finalPrompt)}</p></details></div></article>`).join('');
    $('generated-storyboard-body').innerHTML = shots.map(shot => `<tr><td>${shot.order}</td><td><strong>${escape(shot.title)}</strong><p>${escape(typeof shot.payload.dialogue === 'string' ? shot.payload.dialogue : JSON.stringify(shot.payload.dialogue))}</p><details><summary>製作提示詞</summary><p>${escape(shot.payload.finalPrompt)}</p></details></td><td>${escape(shot.camera)}<small>${escape(shot.payload.angle)}</small></td><td>${escape(shot.duration)}</td><td>${escape(shot.payload.emotion)}<small>${escape(shot.payload.purpose)}</small></td><td>${shot.payload.imageStatus === 'succeeded' ? '已完成' : '待重試'}</td></tr>`).join('');
    document.querySelectorAll('[data-result-view]').forEach(button => {
      button.onclick = () => {
        const table = button.dataset.resultView === 'table';
        $('storyboard-grid').hidden = table; $('generated-storyboard-table').hidden = !table;
        document.querySelectorAll('[data-result-view]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
      };
    });
  }
  root.TemplateWorkflow = { selection, results, exportJSON, exportCSV, definitions };
})(window);
