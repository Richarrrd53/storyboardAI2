(function (root) {
  'use strict';
  const B = root.CreativeBrief;
  let controller = null, version = 0, notify = () => {}, activity = null, reveal = null, exitAnimation = null;
  let introAnimations = [], composerEcho = null;
  const session = () => root.CreationSessionStore;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const labels = { subject: '創作主題', purpose: '影片目的', direction: '敘事方向', audience: '目標觀眾', tone: '敘事調性', baseStyle: '基礎風格', visualStyle: '視覺風格', styleNotes: '視覺條件', avoid: '避免元素', constraints: '角色與場景限制', duration: '影片秒數', ratio: '畫面比例', settingsReason: '設定建議', visualKeywords: '視覺元素' };
  const summaryMarkup = summaries => Array.isArray(summaries) && summaries.length ? `<details class="ai-thought-summary"><summary>AI 思考摘要</summary>${summaries.map(t => `<p>${esc(t)}</p>`).join('')}</details>` : '';
  // Presentation wrapper only. The shared initMathCurveLoader owns the original SVG algorithm.
  const loaderMarkup = `<svg class="loader math-loader-svg" viewBox="0 0 100 100" fill="none" aria-hidden="true"><g class="math-loader-group"><path class="math-loader-path" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" opacity="0.1"></path></g><g class="math-loader-sucked"></g></svg>`;
  root.AIActivity = { loaderMarkup, summaryMarkup };
  function cancel({ preserveIntro = false } = {}) {
    version++; controller?.abort(); controller = null; activity?.stop(); activity = null; reveal?.cancel(); reveal = null; exitAnimation?.cancel(); exitAnimation = null;
    const c = session().copilot;
    if (c?.busy) { c.error = '討論已中斷；內容已保留，可重試或略過討論。'; c.phase = 'responded'; }
    if (c) c.busy = false;
    if (!preserveIntro) {
      introAnimations.forEach(animation => animation.cancel()); introAnimations = [];
      composerEcho?.remove(); composerEcho = null;
    }
  }
  function prepare(story) {
    const s = session();
    if (!s.creativeBrief) { s.creativeBrief = B.create(story); syncSettings(); }
    if (!s.copilot) s.copilot = { active: false, busy: false, phase: 'responded', response: null, history: [], drafts: {}, message: '', error: '', rounds: 0, retry: null, continuing: false };
    if (story !== s.creativeBrief.originalStory && story !== s.copilot.latestStory) {
      cancel(); B.commit(s.creativeBrief, [], story); s.copilot.latestStory = story;
      s.copilot.response = null; s.copilot.lastInsight = ''; s.copilot.retry = null; s.copilot.error = ''; s.copilot.drafts = {}; s.creativeBrief.suggestions = {}; syncSettings();
    }
    return s.copilot;
  }
  function dirty() { if (root.GenerationTask?.getState().status !== 'idle') root.GenerationTask?.reset(); }
  function captureStory() {
    const s = session(), input = document.getElementById('story-input');
    const story = input?.value.trim();
    if (story && story !== s.story) { s.story = story; s.draft.story = story; prepare(story); dirty(); }
  }
  function questionMarkup(q, drafts) {
    const d = Object.hasOwn(drafts, q.id) ? drafts[q.id] : { values: [], other: '', otherActive: false };
    const multi = q.type === 'multi_choice', free = q.type === 'free_text';
    const otherActive = free || d.otherActive === true;
    return `<fieldset class="copilot-question"><legend>${esc(q.label)}${q.required ? '（必填）' : ''}</legend><p class="section-hint">${esc(q.description)}</p>${multi ? `<p class="section-hint">既有選項可選 ${q.min}–${q.max} 項，另可自行補充。</p>` : ''}
      <div class="copilot-options" data-question="${esc(q.id)}">${(q.options || []).map((o, i) => `<label class="copilot-option ${d.values.includes(o.value) ? 'is-selected' : ''}"><input type="${multi ? 'checkbox' : 'radio'}" name="${esc(q.id)}" value="${i}" ${d.values.includes(o.value) ? 'checked' : ''}><span><strong>${esc(o.label)}</strong>${o.value === q.recommended ? '<small class="copilot-recommend">AI 建議</small>' : ''}<span>${esc(o.description)}</span></span></label>`).join('')}
      ${!free && q.allowOther ? `<label class="copilot-option ${otherActive ? 'is-selected' : ''}"><input type="${multi ? 'checkbox' : 'radio'}" name="${esc(q.id)}" value="other" ${otherActive ? 'checked' : ''}><span><strong>其他／自行描述</strong><span>用自己的方式描述${multi ? '補充元素' : '故事方向'}。</span></span></label>` : ''}</div>
      <label class="copilot-other" data-other-wrap="${esc(q.id)}" ${otherActive ? '' : 'hidden'}>${free ? '你的回答' : '描述你的方向'}<textarea data-other="${esc(q.id)}" maxlength="2000" rows="2" ${otherActive ? '' : 'disabled'}>${esc(d.other)}</textarea></label></fieldset>`;
  }
  function briefMarkup(b) {
    const present = B.fields.filter(k => b.confirmed[k] != null), editable = present.filter(k => !['visualKeywords', 'baseStyle', 'settingsReason'].includes(k));
    return `<details class="copilot-brief" open><summary>Creative Brief <span>創作摘要</span></summary><dl>${present.map(k => `<dt>${labels[k]}</dt><dd>${esc(Array.isArray(b.confirmed[k]) ? b.confirmed[k].join('、') : b.confirmed[k])}</dd>`).join('')}${b.answers.map(a => `<dt>${esc(a.question)}</dt><dd>${esc([...a.values.map(v => v.label), a.other].filter(Boolean).join('、'))}</dd>`).join('')}</dl>
      ${b.requirements.length ? `<h3>補充要求</h3><p>${esc(b.requirements.join('\n'))}</p>` : ''}
      ${editable.length ? `<details><summary>修改已確認設定</summary><form id="copilot-edit-brief">${editable.map(k => `<label>${labels[k]}<input name="${k}" value="${esc(Array.isArray(b.confirmed[k]) ? b.confirmed[k].join('、') : b.confirmed[k])}" maxlength="2000"></label>`).join('')}<button class="btn btn-ghost">儲存修改</button></form></details>` : ''}
      ${Object.keys(b.suggestions).length ? `<h3>討論中的建議</h3><dl>${Object.entries(b.suggestions).filter(([k]) => k !== 'visualKeywords').map(([k, v]) => `<dt>${labels[k]}</dt><dd>${esc(Array.isArray(v) ? v.join('、') : v)}</dd>`).join('')}</dl>` : '<p class="section-hint">未指定的細節可以一起討論。</p>'}</details>`;
  }
  function render() {
    const el = document.getElementById('creative-copilot'), s = session(), c = s.copilot;
    if (!el) return;
    const panel = el.closest('.phase-panel');
    const entering = c?.active && !s.selectedTemplate && !panel.classList.contains('is-discussing');
    const composer = entering ? document.getElementById('phase1-composer') : null;
    const inputBounds = composer?.getBoundingClientRect();
    const oldMessage = el.querySelector('.copilot-user-message');
    const keepMessage = !entering && oldMessage?.querySelector('p')?.textContent === s.story ? oldMessage : null;
    keepMessage?.remove();
    const leaving = c?.phase === 'revealing' && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? el.querySelector('.ai-activity-panel') : null;
    const oldBounds = leaving?.getBoundingClientRect(), origin = leaving ? el.getBoundingClientRect() : null;
    const outgoing = leaving?.cloneNode(true);
    activity?.stop(); activity = null;
    el.hidden = !c?.active || !!s.selectedTemplate;
    el.closest('.phase-panel')?.classList.toggle('is-discussing', !el.hidden);
    if (el.hidden) return;
    el.dataset.activity = c.phase || 'responded';
    const b = s.creativeBrief, r = c.response, questions = r?.form?.questions || [];
    el.innerHTML = `<div class="copilot-user-message"><div><span>你的想法</span><p>${esc(s.story)}</p></div><button type="button" data-copilot="edit-story" class="copilot-text-action">修改</button></div>
      <div class="copilot-main">${c.busy ? `<div class="ai-activity-panel" role="status" aria-live="polite"><div class="math-loader-box">${loaderMarkup}</div><p>正在思考…</p></div>` : `<div class="copilot-response"><div class="copilot-heading"><h2 tabindex="-1">一起找到故事的切入點</h2>${r ? `<p class="copilot-message">${esc(r.message)}</p>${summaryMarkup(r.thoughtSummaries)}` : ''}</div>
      ${c.error ? `<div class="plan-error" role="alert">${esc(c.error)}<button type="button" class="btn btn-ghost" data-copilot="retry">重試</button></div>` : ''}
      ${questions.length || c.continuing ? `<form id="copilot-answer-form"><fieldset><legend class="section-label">${esc(c.continuing ? '還有哪個地方想調整？你可以直接告訴我。' : r.form.title)}</legend>
      ${c.continuing ? '' : questions.map(q => questionMarkup(q, c.drafts)).join('')}
      ${c.continuing ? `<label class="copilot-other" for="copilot-message">補充或調整<textarea id="copilot-message" maxlength="2000" rows="3">${esc(c.message)}</textarea></label>` : ''}
      <div class="copilot-actions"><button class="btn btn-primary" type="submit">${c.continuing ? '送出調整' : '確認這個方向'}</button>${!c.continuing ? '<button class="btn btn-ghost" type="button" data-copilot="delegate">交給 AI 決定</button>' : '<button class="copilot-text-action" type="button" data-copilot="close-adjust">收合</button>'}</div></fieldset></form>` : ''}
      <div class="copilot-secondary-actions">${!c.continuing ? '<button type="button" class="copilot-text-action" data-copilot="continue">繼續調整</button>' : ''}<button type="button" class="copilot-text-action" data-copilot="advance">略過討論</button></div></div>`}
      ${c.busy ? '<div class="copilot-secondary-actions"><button type="button" class="copilot-text-action" data-copilot="advance">略過討論</button></div>' : ''}
      <details class="copilot-history"><summary>討論歷史與修改答案（${c.history.length}）</summary>${c.history.map(m => `<p><strong>${m.role === 'user' ? '你' : 'AI'}：</strong>${esc(m.text)}</p>`).join('')}${b.answers.map((a, i) => `<div class="copilot-answer-edit"><label>${esc(a.question)}<textarea data-edit-answer="${i}" maxlength="2000">${esc([...a.values.map(v => v.label), a.other].filter(Boolean).join('；'))}</textarea></label><button type="button" class="btn btn-ghost" data-save-answer="${i}">儲存答案修改</button></div>`).join('')}</details></div>${briefMarkup(b)}`;
    if (keepMessage) el.querySelector('.copilot-user-message').replaceWith(keepMessage);
    if (entering && inputBounds?.width && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const message = el.querySelector('.copilot-user-message'), to = message.getBoundingClientRect();
      const surface = document.getElementById('creation-surface'), bounds = surface.getBoundingClientRect();
      const echo = document.createElement('div'); composerEcho = echo;
      echo.className = 'composer-container composer-send-echo'; echo.textContent = s.story;
      echo.inert = true; echo.setAttribute('aria-hidden', 'true');
      Object.assign(echo.style, { top: `${inputBounds.top - bounds.top}px`, left: `${inputBounds.left - bounds.left}px`, width: `${inputBounds.width}px`, height: `${inputBounds.height}px` });
      surface.appendChild(echo);
      const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-duration-medium')) || 500;
      const leave = echo.animate([{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(8px)', transform: 'translateY(-6px)' }], { duration: duration * .55, easing: 'ease-out' });
      introAnimations.push(leave, message.animate([
        { opacity: 0, filter: 'blur(6px)', transform: `translate(${inputBounds.left - to.left}px, ${inputBounds.top - to.top}px)` },
        { opacity: 1, filter: 'blur(0)', transform: 'translate(0,0)' }
      ], { duration, easing: 'cubic-bezier(.22,1,.36,1)' }));
      leave.finished.then(() => echo.remove()).catch(() => echo.remove());
    }
    if (c.busy) activity = root.initMathCurveLoader?.({ root: el.querySelector('.ai-activity-panel'), signal: controller?.signal });
    if (outgoing?.animate) {
      outgoing.inert = true; outgoing.setAttribute('aria-hidden', 'true'); outgoing.classList.add('ai-activity-exit');
      Object.assign(outgoing.style, { top: `${oldBounds.top - origin.top}px`, left: `${oldBounds.left - origin.left}px`, width: `${oldBounds.width}px`, height: `${oldBounds.height}px` });
      el.appendChild(outgoing);
      exitAnimation = outgoing.animate([{ opacity: 1, transform: 'translateY(0) scaleY(1)' }, { opacity: 0, filter: 'blur(3px)', transform: 'translateY(-4px) scaleY(.96)' }], { duration: 280, easing: 'ease-out' });
      exitAnimation.finished.then(() => outgoing.remove()).catch(() => outgoing.remove());
    }
  }
  function syncSettings() {
    const s = session(), b = s.creativeBrief?.confirmed;
    if (!b || s.selectedTemplate) return;
    if (b.duration) s.duration = b.duration;
    if (b.ratio) s.ratio = ({ '16:9': '橫向16:9', '9:16': '直向9:16', '3:2': '橫向3:2', '2:3': '直向2:3', '1:1': '1:1' })[b.ratio];
    if (b.baseStyle) s.styleIndex = B.styleIds.indexOf(b.baseStyle);
    else if (b.visualStyle && s.styleIndex === 0 && /電影/.test(b.visualStyle)) s.styleIndex = 1;
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
        const entries = ['delegate', 'continue'].includes(intent) ? [] : B.answers(c.response?.form, c.drafts);
        if (intent === 'continue' && !c.message.trim()) throw new Error('請先輸入想調整的地方。');
        if (intent === 'answer' && !entries.length && !c.message.trim()) throw new Error('請先選擇方向，或交給 AI 決定。');
        if (entries.length || c.message.trim()) {
          B.commit(s.creativeBrief, entries, c.message); dirty(); syncSettings();
          c.history.push({ role: 'user', text: [...entries.map(a => a.question + '：' + [...a.values.map(v => v.label), a.other].filter(Boolean).join('、')), c.message].filter(Boolean).join('\n').slice(0, 5000) });
        }
        payload = { story: s.story, brief: JSON.parse(JSON.stringify(s.creativeBrief)), history: c.history.slice(-12), message: c.message,
          intent, autoRounds: c.rounds, requestId: 'copilot-' + Date.now() + '-' + Math.random().toString(36).slice(2), revision: s.creativeBrief.revision };
        c.retry = payload; c.message = ''; c.drafts = {};
      }
    } catch (e) { c.error = e.message; render(); return; }
    cancel({ preserveIntro: true }); const ticket = version; controller = new AbortController(); const signal = controller.signal;
    c.response = null; c.busy = true; c.phase = 'thinking'; c.continuing = false; render();
    try {
      const token = root.spaAuth?.getToken?.();
      const response = await fetch('/api/creation/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(payload), signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI 暫時無法回應，請重試或略過討論。');
      if (ticket !== version || signal.aborted || s.copilot !== c || s.creativeBrief.revision !== payload.revision) return;
      if (data.requestId !== payload.requestId || data.revision !== payload.revision) throw new Error('AI 回應版本不符，請重試。');
      c.response = B.validateResponse(data);
      c.response.thoughtSummaries = Array.isArray(data.thoughtSummaries) ? data.thoughtSummaries.filter(t => typeof t === 'string').slice(0, 8).map(t => t.slice(0, 12000)) : [];
      B.suggest(s.creativeBrief, c.response.briefPatch);
      c.history.push({ role: 'assistant', text: c.response.message }); c.history = c.history.slice(-24);
      c.rounds = c.response.action === 'ready' ? 0 : c.rounds + 1; c.retry = null; c.phase = 'revealing';
    } catch (e) { if (ticket === version && e.name !== 'AbortError') { c.error = e.message; c.phase = 'responded'; } }
    finally {
      if (ticket === version) {
        c.busy = false; controller = null; render();
        const target = document.getElementById('creative-copilot')?.querySelector('.copilot-response');
        if (c.phase === 'revealing' && target?.animate && !root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          reveal = target.animate([{ opacity: 0, filter: 'blur(3px)', transform: 'translateY(5px)' }, { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' }], { duration: 280, easing: 'ease-out' });
          reveal.finished.then(() => { if (ticket === version) { c.phase = 'responded'; target.closest('[data-activity]').dataset.activity = 'responded'; } }).catch(() => {});
        } else c.phase = 'responded';
        if (c.response?.action === 'ready' && !c.error) {
          B.confirm(s.creativeBrief); syncSettings(); dirty(); c.lastInsight = c.response.message;
          notify('ready');
        }
      }
    }
  }
  function advance() { captureStory(); cancel(); syncSettings(); notify('advance'); }
  function discuss() { const c = prepare(session().story); c.active = true; c.continuing = true; notify('discuss'); render(); document.getElementById('copilot-message')?.focus(); }
  function editStory() { cancel(); const c = session().copilot; if (c) c.active = false; render(); const input = document.getElementById('story-input'); if (input) { input.value = session().story; input.focus(); } }
  function mount(signal, onAction) {
    notify = onAction;
    const el = document.getElementById('creative-copilot'); if (!el) return;
    signal.addEventListener('abort', cancel, { once: true });
    el.addEventListener('change', event => {
      const group = event.target.closest('[data-question]'), c = session().copilot; if (!group || !c?.response?.form) return;
      const q = c.response.form.questions.find(q => q.id === group.dataset.question);
      const previous = Object.hasOwn(c.drafts, q.id) ? c.drafts[q.id] : { other: '' };
      const checked = [...group.querySelectorAll('input:checked')];
      const values = checked.filter(n => n.value !== 'other').map(n => q.options[Number(n.value)].value);
      if (q.type === 'multi_choice' && values.length > q.max) { event.target.checked = false; return; }
      const otherActive = checked.some(n => n.value === 'other');
      c.drafts[q.id] = { values, other: previous.other, otherActive };
      const wrap = el.querySelector(`[data-other-wrap="${q.id}"]`); if (wrap) { wrap.hidden = !otherActive; wrap.querySelector('textarea').disabled = !otherActive; }
      group.querySelectorAll('.copilot-option').forEach(label => label.classList.toggle('is-selected', label.querySelector('input').checked));
      if (otherActive && event.target.value === 'other') wrap?.querySelector('textarea').focus();
    }, { signal });
    el.addEventListener('input', event => {
      const input = event.target, c = session().copilot; if (!c) return;
      if (input.id === 'copilot-message') c.message = input.value;
      if (input.dataset.other) {
        const old = Object.hasOwn(c.drafts, input.dataset.other) ? c.drafts[input.dataset.other] : { values: [] };
        c.drafts[input.dataset.other] = { ...old, other: input.value, otherActive: true };
      }
    }, { signal });
    el.addEventListener('submit', event => {
      event.preventDefault();
      if (event.target.id === 'copilot-edit-brief') {
        try {
          const changes = {};
          for (const [k, v] of new FormData(event.target)) changes[k] = !v.trim() ? null : ['avoid', 'constraints'].includes(k) ? v.split('、').map(s => s.trim()).filter(Boolean) : k === 'duration' ? Number(v) : v;
          cancel(); session().copilot.retry = null; B.edit(session().creativeBrief, changes); syncSettings(); dirty(); render();
        } catch(e) { session().copilot.error = e.message; render(); }
      } else request(session().copilot.continuing ? 'continue' : 'answer');
    }, { signal });
    el.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button) return;
      if (button.dataset.saveAnswer != null) {
        const index = Number(button.dataset.saveAnswer), b = session().creativeBrief, old = b.answers[index];
        const value = el.querySelector(`[data-edit-answer="${index}"]`).value.trim(); if (!value) return;
        cancel(); session().copilot.retry = null; B.commit(b, [{ ...old, values: [], other: value }]); dirty(); render(); return;
      }
      const action = button.dataset.copilot;
      if (action === 'advance') advance();
      else if (action === 'retry') request('start', true);
      else if (action === 'delegate') request('delegate');
      else if (action === 'continue') discuss();
      else if (action === 'close-adjust') { session().copilot.continuing = false; render(); }
      else if (action === 'edit-story') editStory();
    }, { signal });
    render();
  }
  root.CreativeCopilot = { prepare, render, request, cancel, mount, advance, syncSettings, discuss, editStory };
})(typeof window !== 'undefined' ? window : globalThis);
