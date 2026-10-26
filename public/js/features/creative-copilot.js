(function (root) {
  'use strict';
  const B = root.CreativeBrief;
  let controller = null, version = 0, notify = () => {};
  const session = () => root.CreationSessionStore;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const labels = { subject: '創作主題', purpose: '影片目的', direction: '敘事方向', audience: '目標觀眾', tone: '敘事調性', visualStyle: '視覺風格', styleNotes: '風格補充', avoid: '避免元素', constraints: '角色與場景限制', duration: '影片秒數', ratio: '畫面比例' };
  function cancel() {
    version++; controller?.abort(); controller = null;
    const c = session().copilot;
    if (c?.busy) c.error = '討論已中斷；內容已保留，可重試或直接創作。';
    if (c) c.busy = false;
  }
  function prepare(story) {
    const s = session();
    if (!s.creativeBrief) s.creativeBrief = B.create(story);
    if (!s.copilot) s.copilot = { active: false, busy: false, response: null, history: [], drafts: {}, message: '', error: '', rounds: 0, retry: null };
    if (story !== s.creativeBrief.originalStory && story !== s.copilot.latestStory) {
      cancel(); B.commit(s.creativeBrief, [], story); s.copilot.latestStory = story;
      s.copilot.response = null; s.copilot.drafts = {}; s.creativeBrief.suggestions = {};
    }
    return s.copilot;
  }
  function dirty() { if (root.GenerationTask?.getState().status !== 'idle') root.GenerationTask?.reset(); }
  function captureStory() {
    const s = session(), input = document.getElementById('story-input');
    const story = input?.value.trim();
    if (story && story !== s.story) { s.story = story; s.draft.story = story; prepare(story); dirty(); }
  }
  function render() {
    const el = document.getElementById('creative-copilot'), s = session(), c = s.copilot;
    if (!el) return;
    el.hidden = !c?.active || !!s.selectedTemplate;
    el.closest('.phase-panel')?.classList.toggle('is-discussing', !el.hidden);
    if (el.hidden) return;
    const b = s.creativeBrief, r = c.response;
    const questions = r?.form?.questions || [];
    el.innerHTML = `<div class="copilot-main"><div class="copilot-heading"><span class="copilot-eyebrow">AI CREATIVE COPILOT</span><h2 tabindex="-1">一起找到故事的切入點</h2><p class="copilot-message" role="status" aria-live="polite">${esc(c.busy ? '正在整理想法與創作建議…' : r?.message || '從你的想法出發，補足真正影響故事的細節。')}</p></div>
      ${c.error ? `<div class="plan-error" role="alert">${esc(c.error)}<button type="button" class="btn btn-ghost" data-copilot="retry">重試</button></div>` : ''}
      <form id="copilot-answer-form"><fieldset ${c.busy ? 'disabled' : ''}><legend class="section-label">${esc(r?.form?.title || (r?.action === 'ready' ? '企劃已可進入創作設定' : '補充你的想法'))}</legend>
      ${questions.map(q => {
        const d = Object.hasOwn(c.drafts, q.id) ? c.drafts[q.id] : { values: [], other: '' };
        return `<fieldset class="copilot-question"><legend>${esc(q.label)}${q.required ? '（必填）' : ''}</legend><p class="section-hint">${esc(q.description)}</p>${q.type === 'multi_choice' ? `<p class="section-hint">可選 ${q.min}–${q.max} 項</p>` : ''}<div class="copilot-options" data-question="${esc(q.id)}">${(q.options || []).map((o, i) => `<label class="copilot-option ${d.values.includes(o.value) ? 'is-selected' : ''}"><input type="${q.type === 'multi_choice' ? 'checkbox' : 'radio'}" name="${esc(q.id)}" value="${i}" ${d.values.includes(o.value) ? 'checked' : ''}><span><strong>${esc(o.label)}</strong>${o.value === q.recommended ? '<small class="copilot-recommend">AI 建議</small>' : ''}<span>${esc(o.description)}</span></span></label>`).join('')}</div>${q.type === 'free_text' || q.allowOther ? `<label class="copilot-other">${q.type === 'free_text' ? '你的回答' : '其他／自行描述（可取代選項）'}<textarea data-other="${esc(q.id)}" maxlength="2000" rows="2">${esc(d.other)}</textarea></label>` : ''}</fieldset>`;
      }).join('')}
      <label class="copilot-other" for="copilot-message">補充、修改要求或提問<textarea id="copilot-message" maxlength="2000" rows="2" placeholder="還有哪些想法？也可以直接提出疑問。">${esc(c.message)}</textarea></label>
      <p class="section-hint">選項先保留為草稿，按下確認後才會加入企劃。</p>
      <div class="copilot-actions"><button class="btn btn-primary" type="submit">${r?.action === 'ready' ? '繼續討論' : '確認回答'}</button><button class="btn btn-ghost" type="button" data-copilot="delegate">交給 AI 決定</button>${r?.action !== 'ready' ? '<button class="btn btn-ghost" type="button" data-copilot="continue">繼續討論</button>' : ''}</div></fieldset></form>
      <div class="copilot-actions"><button type="button" class="btn btn-primary" data-copilot="advance">${r?.action === 'ready' ? '確認企劃，進入創作設定' : '直接規劃分鏡'}</button><button type="button" class="btn btn-ghost" data-copilot="edit-story">返回修改原始想法</button></div>
      <details class="copilot-history"><summary>討論歷史與修改答案（${c.history.length}）</summary>${c.history.map(m => `<p><strong>${m.role === 'user' ? '你' : 'AI'}：</strong>${esc(m.text)}</p>`).join('')}${b.answers.map((a, i) => `<div class="copilot-answer-edit"><label>${esc(a.question)}<textarea data-edit-answer="${i}" maxlength="2000">${esc([...a.values.map(v => v.label + (v.description ? '：' + v.description : '')), a.other].filter(Boolean).join('；'))}</textarea></label><button type="button" class="btn btn-ghost" data-save-answer="${i}">確認修改答案</button></div>`).join('')}</details></div>
      <details class="copilot-brief" open><summary>Creative Brief <span>創作摘要</span></summary><p class="section-hint">已確認的內容會進入分鏡。AI 建議可先修改，再確認企劃。</p><dl>${B.fields.filter(k => b.confirmed[k] != null).map(k => `<dt>${labels[k]}</dt><dd>${esc(Array.isArray(b.confirmed[k]) ? b.confirmed[k].join('、') : b.confirmed[k])}</dd>`).join('')}${b.answers.map(a => `<dt>${esc(a.question)}</dt><dd>${esc([...a.values.map(v => v.label), a.other].filter(Boolean).join('、'))}</dd>`).join('')}</dl>${b.requirements.length ? `<h3>最新補充要求</h3><p>${esc(b.requirements.join('\n'))}</p>` : ''}<details><summary>修改摘要欄位</summary><form id="copilot-edit-brief">${B.fields.map(k => `<label>${labels[k]}<input name="${k}" value="${esc(Array.isArray(b.confirmed[k]) ? b.confirmed[k].join('、') : b.confirmed[k] ?? '')}" maxlength="2000"></label>`).join('')}<p class="section-hint">時長：15 / 30 / 45 / 60；比例：16:9 / 9:16 / 3:2 / 2:3 / 1:1。限制以「、」分隔。</p><button class="btn btn-ghost">確認修改摘要</button></form></details>${Object.keys(b.suggestions).length ? `<h3>待確認的 AI 建議</h3><dl>${Object.entries(b.suggestions).map(([k,v]) => `<dt>${labels[k]}</dt><dd>${esc(Array.isArray(v) ? v.join('、') : v)}${Object.hasOwn(b.confirmed, k) ? '（保留原設定；如要採用請修改摘要）' : ''}</dd>`).join('')}</dl>` : '<p class="section-hint">尚未指定的細節可以交給 AI。</p>'}</details>`;
  }
  function syncSettings() {
    const s = session(), b = s.creativeBrief?.confirmed;
    if (b?.duration) s.duration = b.duration;
    if (b?.ratio) s.ratio = ({ '16:9': '橫向16:9', '9:16': '直向9:16', '3:2': '橫向3:2', '2:3': '直向2:3', '1:1': '1:1' })[b.ratio];
  }
  async function request(intent = 'start', retry = false) {
    captureStory();
    const s = session(), c = prepare(s.story);
    if (c.busy || s.selectedTemplate) return;
    c.active = true; c.error = '';
    let payload;
    try {
      if (retry && c.retry && c.retry.revision === s.creativeBrief.revision) payload = c.retry;
      else {
        const entries = intent === 'delegate' ? [] : B.answers(c.response?.form, c.drafts);
        if (intent === 'continue' && !c.message.trim() && !entries.length) throw new Error('請先補充想法或提出問題。');
        if (entries.length || c.message.trim()) {
          B.commit(s.creativeBrief, entries, c.message); dirty();
          c.history.push({ role: 'user', text: [...entries.map(a => a.question + '：' + [...a.values.map(v => v.label), a.other].filter(Boolean).join('、')), c.message].filter(Boolean).join('\n').slice(0, 5000) });
        }
        payload = { story: s.story, brief: JSON.parse(JSON.stringify(s.creativeBrief)), history: c.history.slice(-12), message: c.message,
          intent, autoRounds: c.rounds, requestId: 'copilot-' + Date.now() + '-' + Math.random().toString(36).slice(2), revision: s.creativeBrief.revision };
        c.retry = payload; c.message = ''; c.drafts = {};
      }
    } catch (e) { c.error = e.message; render(); return; }
    cancel(); const ticket = version; controller = new AbortController(); const signal = controller.signal;
    c.response = null; c.busy = true; render();
    try {
      const token = root.spaAuth?.getToken?.();
      const response = await fetch('/api/creation/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(payload), signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI 暫時無法回應，請重試或直接創作。');
      if (ticket !== version || signal.aborted || s.copilot !== c || s.creativeBrief.revision !== payload.revision) return;
      if (data.requestId !== payload.requestId || data.revision !== payload.revision) throw new Error('AI 回應版本不符，請重試。');
      c.response = B.validateResponse(data); B.suggest(s.creativeBrief, c.response.briefPatch);
      c.history.push({ role: 'assistant', text: c.response.message }); c.history = c.history.slice(-24);
      c.rounds = c.response.action === 'ready' ? 0 : c.rounds + 1; c.retry = null;
    } catch (e) { if (ticket === version && e.name !== 'AbortError') c.error = e.message; }
    finally { if (ticket === version) { c.busy = false; controller = null; render(); } }
  }
  function advance() {
    captureStory(); cancel(); const s = session();
    if (s.copilot?.response?.action === 'ready') { B.confirm(s.creativeBrief); syncSettings(); dirty(); }
    notify('advance');
  }
  function mount(signal, onAction) {
    notify = onAction;
    const el = document.getElementById('creative-copilot');
    if (!el) return;
    signal.addEventListener('abort', cancel, { once: true });
    el.addEventListener('change', event => {
      const input = event.target, c = session().copilot;
      const group = input.closest('[data-question]'); if (!group || !c) return;
      const q = c.response.form.questions.find(q => q.id === group.dataset.question);
      const values = [...group.querySelectorAll('input:checked')].map(n => q.options[Number(n.value)].value);
      if (q.type === 'multi_choice' && values.length > q.max) { input.checked = false; return; }
      c.drafts[q.id] = { values, other: '' };
      const other = el.querySelector(`[data-other="${q.id}"]`); if (other) other.value = '';
      group.querySelectorAll('.copilot-option').forEach(label => label.classList.toggle('is-selected', label.querySelector('input').checked));
    }, { signal });
    el.addEventListener('input', event => {
      const input = event.target, c = session().copilot; if (!c) return;
      if (input.id === 'copilot-message') c.message = input.value;
      if (input.dataset.other) {
        c.drafts[input.dataset.other] = { values: [], other: input.value };
        el.querySelectorAll(`[data-question="${input.dataset.other}"] input`).forEach(n => { n.checked = false; n.closest('label').classList.remove('is-selected'); });
      }
    }, { signal });
    el.addEventListener('submit', event => {
      event.preventDefault();
      if (event.target.id === 'copilot-edit-brief') {
        try {
          const changes = {};
          for (const [k, v] of new FormData(event.target)) {
            if (v.trim()) changes[k] = ['avoid', 'constraints'].includes(k) ? v.split('、').map(s => s.trim()).filter(Boolean) : k === 'duration' ? Number(v) : v;
            else if (Object.hasOwn(session().creativeBrief.confirmed, k)) changes[k] = null;
          }
          cancel(); session().copilot.retry = null; B.edit(session().creativeBrief, changes); syncSettings(); dirty(); render();
        } catch(e) { session().copilot.error = e.message; render(); }
      } else request(session().copilot.response?.action === 'ready' ? 'continue' : 'answer');
    }, { signal });
    el.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.saveAnswer != null) {
        const index = Number(button.dataset.saveAnswer), b = session().creativeBrief, old = b.answers[index];
        const value = el.querySelector(`[data-edit-answer="${index}"]`).value.trim();
        if (!value) return;
        cancel(); session().copilot.retry = null; B.commit(b, [{ ...old, values: [], other: value }]); dirty(); render(); return;
      }
      const action = button.dataset.copilot;
      if (action === 'advance') advance();
      else if (action === 'retry') request('start', true);
      else if (action === 'delegate') request('delegate');
      else if (action === 'continue') request('continue');
      else if (action === 'edit-story') { cancel(); session().copilot.active = false; render(); document.getElementById('story-input')?.focus(); }
    }, { signal });
    render();
  }
  root.CreativeCopilot = { prepare, render, request, cancel, mount, advance, syncSettings };
})(typeof window !== 'undefined' ? window : globalThis);
