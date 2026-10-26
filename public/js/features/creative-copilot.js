(function (root) {
  'use strict';
  const B = root.CreativeBrief;
  let controller = null, version = 0, notify = () => {}, activity = null;
  let introAnimations = [], archiveFlight = null;
  const visualAnimations = new Set();
  const reduced = () => root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const motion = (token, fallback) => typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token)) || fallback : fallback;
  function animate(node, frames, options, done = () => {}) {
    if (!node?.animate || reduced()) { done(); return null; }
    const animation = node.animate(frames, options);
    visualAnimations.add(animation);
    animation.finished.then(() => { visualAnimations.delete(animation); done(); }, () => { visualAnimations.delete(animation); done(); });
    return animation;
  }
  function finishArchive() {
    const flight = archiveFlight; archiveFlight = null;
    if (!flight) return;
    flight.target.style.visibility = '';
    flight.overlay.remove(); flight.animations.forEach(animation => animation?.cancel());
    delete flight.target.dataset.archiving;
  }
  function stopVisuals() {
    activity?.stop(); activity = null;
    finishArchive();
    visualAnimations.forEach(animation => animation.cancel()); visualAnimations.clear();
  }
  const session = () => root.CreationSessionStore;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const labels = { subject: '創作主題', purpose: '影片目的', direction: '敘事方向', audience: '目標觀眾', tone: '敘事調性', baseStyle: '基礎風格', visualStyle: '視覺風格', styleNotes: '視覺條件', avoid: '避免元素', constraints: '角色與場景限制', duration: '影片秒數', ratio: '畫面比例', settingsReason: '設定建議', visualKeywords: '視覺元素' };
  const summaryMarkup = summaries => Array.isArray(summaries) && summaries.length ? `<details class="ai-thought-summary"><summary>思考摘要</summary>${summaries.map(t => `<p>${esc(t)}</p>`).join('')}</details>` : '';
  function requestError(data) {
    const message = data.error || 'AI 暫時無法回應，請重試或略過討論。';
    // Provider diagnostics stay in the backend; do not expose them through an error banner.
    if (!/gemini|google|vertex/i.test(message)) return message;
    return ({ AI_RATE_LIMIT: 'AI 請求過多，請稍後重試。', AI_AUTH_PERMISSION: 'AI 服務的連線驗證暫時無法完成，請稍後再試。',
      AI_API_DISABLED: 'AI 服務尚未完成設定，請稍後再試。', AI_SCHEMA_ERROR: 'AI 服務設定暫時無法使用，請稍後再試。',
      AI_MODEL_UNAVAILABLE: 'AI 服務目前無法使用，請稍後再試。' })[data.code] || 'AI 暫時無法回應，請重試或略過討論。';
  }
  // Presentation wrapper only. The shared initMathCurveLoader owns the original SVG algorithm.
  const loaderMarkup = `<svg class="loader math-loader-svg" viewBox="0 0 100 100" fill="none" aria-hidden="true"><g class="math-loader-group"><path class="math-loader-path" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" opacity="0.1"></path></g><g class="math-loader-sucked"></g></svg>`;
  root.AIActivity = { loaderMarkup, summaryMarkup };
  const compactLoaderMarkup = loaderMarkup.replace('math-loader-svg', 'math-loader-svg math-loader-svg--compact').replace('<g class="math-loader-sucked"></g>', '');
  const statusLines = ['已收到你的創作想法…', '正在幫你規劃故事細節…', '正在尋找適合的敘事方向…', '正在整理創作建議…'];
  function startThinking(panel, signal, initial) {
    const loader = root.initMathCurveLoader?.({ root: panel, signal, compact: true });
    const caption = panel.querySelector('.ai-thinking-caption');
    const lines = initial ? statusLines : statusLines.slice(1);
    let index = 0, timer = null, stopped = false;
    const animations = new Set();
    caption.firstElementChild.textContent = lines[0];
    const duration = motion('--motion-duration-base', 300), interval = motion('--motion-duration-medium', 500) * 7;
    function rotate() {
      if (stopped || !panel.isConnected || ++index >= lines.length) return;
      const old = caption.firstElementChild, next = document.createElement('span');
      next.textContent = lines[index]; caption.appendChild(next);
      const outgoing = animate(old, [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(4px)' }], { duration, easing: 'ease-in' }, () => old.remove());
      const incoming = animate(next, [{ opacity: 0, filter: 'blur(4px)' }, { opacity: 1, filter: 'blur(0)' }], { duration, easing: 'ease-out' });
      for (const animation of [outgoing, incoming]) if (animation) { animations.add(animation); animation.finished.then(() => animations.delete(animation), () => animations.delete(animation)); }
      if (index < lines.length - 1) timer = setTimeout(rotate, interval);
    }
    function stop() {
      if (stopped) return;
      stopped = true; clearTimeout(timer); loader?.stop();
      animations.forEach(animation => animation.cancel()); animations.clear();
      signal?.removeEventListener('abort', stop);
    }
    signal?.addEventListener('abort', stop, { once: true });
    if (!reduced()) timer = setTimeout(rotate, interval);
    return { stop };
  }
  function cancel({ preserveIntro = false } = {}) {
    version++; controller?.abort(); controller = null; stopVisuals();
    const c = session().copilot;
    if (c?.busy) { c.error = '討論已中斷；內容已保留，可重試或略過討論。'; c.phase = 'responded'; }
    if (c) c.busy = false;
    if (!preserveIntro) {
      introAnimations.forEach(animation => animation.cancel()); introAnimations = [];
    }
  }
  function prepare(story) {
    const s = session();
    if (!s.creativeBrief) { s.creativeBrief = B.create(story); syncSettings(); }
    if (!s.copilot) s.copilot = { active: false, busy: false, phase: 'responded', response: null, history: [], drafts: {}, message: '', error: '', rounds: 0, retry: null, continuing: false };
    s.copilot.stackRounds ||= [];
    s.copilot.discussionLog ||= s.copilot.history.map(message => ({ ...message }));
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
    return `<details class="copilot-brief" open><summary>Creative Brief <span>創作摘要</span></summary><dl>${present.map(k => `<dt>${labels[k]}</dt><dd>${esc(Array.isArray(b.confirmed[k]) ? b.confirmed[k].join('、') : b.confirmed[k])}</dd>`).join('')}${b.answers.map(a => `<dt>${esc(a.question)}</dt><dd class="copilot-brief-answer">${esc([...a.values.map(v => v.label), a.other].filter(Boolean).join('、'))}</dd>`).join('')}</dl>
      ${b.requirements.length ? `<h3>補充要求</h3><p class="copilot-brief-requirements">${esc(b.requirements.join('\n'))}</p>` : ''}
      ${editable.length ? `<details><summary>修改已確認設定</summary><form id="copilot-edit-brief">${editable.map(k => `<label>${labels[k]}<input name="${k}" value="${esc(Array.isArray(b.confirmed[k]) ? b.confirmed[k].join('、') : b.confirmed[k])}" maxlength="2000"></label>`).join('')}<button class="btn btn-ghost">儲存修改</button></form></details>` : ''}
      ${Object.keys(b.suggestions).length ? `<h3>討論中的建議</h3><dl>${Object.entries(b.suggestions).filter(([k]) => k !== 'visualKeywords').map(([k, v]) => `<dt>${labels[k]}</dt><dd>${esc(Array.isArray(v) ? v.join('、') : v)}</dd>`).join('')}</dl>` : '<p class="section-hint">未指定的細節可以一起討論。</p>'}</details>`;
  }
  // Presentation records reference authoritative answers; edits update every visible summary.
  function roundText(round, b) {
    return [...round.answerIds.flatMap(id => {
      const answer = b.answers.find(answer => answer.id === id);
      return answer ? [...answer.values.map(value => value.label), answer.other].filter(Boolean) : [];
    }), round.message].filter(Boolean).join('、');
  }
  function captureArchive() {
    const el = document.getElementById('creative-copilot');
    const source = el?.querySelector('#copilot-message') || el?.querySelector('.copilot-other:not([hidden]) textarea:not(:disabled)') || el?.querySelector('.copilot-option.is-selected');
    if (!source || reduced()) return null;
    const rect = source.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { rect, node: source.cloneNode(true) };
  }
  function archiveCard(origin, target) {
    if (!origin || !target || reduced()) return;
    finishArchive();
    const to = target.getBoundingClientRect(), from = origin.rect, stack = target.closest('.copilot-stack'), bounds = stack.getBoundingClientRect();
    const overlay = document.createElement('div');
    overlay.className = 'copilot-stack-card copilot-archive-flight';
    overlay.setAttribute('aria-hidden', 'true'); overlay.inert = true;
    Object.assign(overlay.style, { width: to.width + 'px', height: to.height + 'px' });
    overlay.style.setProperty('--stack-depth', target.style.getPropertyValue('--stack-depth'));
    overlay.style.setProperty('--stack-scale', target.style.getPropertyValue('--stack-scale'));
    const preview = document.createElement('div'); preview.className = 'copilot-flight-summary'; preview.innerHTML = target.innerHTML;
    const original = origin.node; original.classList.add('copilot-flight-original');
    original.removeAttribute('id'); original.querySelectorAll?.('[id]').forEach(node => node.removeAttribute('id'));
    // The original text starts at its original scale while the outer surface morphs to the stack.
    Object.assign(original.style, { width: from.width + 'px', height: from.height + 'px', transform: 'scale(' + to.width / from.width + ',' + to.height / from.height + ')' });
    original.querySelectorAll?.('input,button').forEach(node => node.remove());
    if (original.tagName === 'TEXTAREA') original.textContent = original.value;
    // Share the stack's coordinate system and stacking context for the entire flight.
    // The main card (4) and earlier rounds always occlude this card at its final depth.
    overlay.append(preview, original); stack.appendChild(overlay);
    target.style.visibility = 'hidden'; target.dataset.archiving = 'true';
    const flight = { target, overlay, animations: [] }; archiveFlight = flight;
    const duration = motion('--motion-duration-medium', 500);
    const fromTransform = 'translate(' + (from.left - bounds.left) + 'px,' + (from.top - bounds.top) + 'px) scale(' + from.width / to.width + ',' + from.height / to.height + ')';
    flight.animations.push(animate(overlay, [
      { transform: fromTransform, boxShadow: '0 0 0 2px var(--color-brand-primary)' },
      { transform: fromTransform, boxShadow: '0 0 0 2px var(--color-brand-primary)', offset: .12 },
      { transform: 'translate(' + (to.left - bounds.left) + 'px,' + (to.top - bounds.top) + 'px) scale(1)', boxShadow: '0 2px 8px rgba(15,23,42,.04)' }
    ], { duration, easing: 'cubic-bezier(.22,1,.36,1)' }, () => { if (archiveFlight === flight) finishArchive(); }));
    flight.animations.push(animate(original, [{ opacity: 1 }, { opacity: 1, offset: .12 }, { opacity: 0, offset: .4 }, { opacity: 0 }], { duration, fill: 'forwards' }));
    flight.animations.push(animate(preview, [{ opacity: 0 }, { opacity: 0, offset: .4 }, { opacity: 1 }], { duration, fill: 'forwards' }));
  }
  function renderStack(stack, c, b, story) {
    const message = stack.querySelector('.copilot-user-message');
    if (message.querySelector('p').textContent !== story) message.querySelector('p').textContent = story;
    const list = stack.querySelector('.copilot-stack-supplements'), visible = c.stackRounds.slice(-3);
    const ids = new Set(visible.map(round => round.id));
    for (const card of [...list.children]) if (!ids.has(card.dataset.round)) card.remove();
    visible.forEach((round, index) => {
      let card = [...list.children].find(node => node.dataset.round === round.id);
      if (!card) {
        card = document.createElement('div'); card.className = 'copilot-stack-card'; card.dataset.round = round.id;
        card.innerHTML = '<strong></strong><span></span>'; list.appendChild(card);
      }
      card.style.setProperty('--stack-depth', index);
      card.style.setProperty('--stack-scale', Math.pow(.94, index));
      card.querySelector('strong').textContent = '討論 ' + (c.stackRounds.indexOf(round) + 1) + '：';
      card.querySelector('span').textContent = roundText(round, b);
    });
    const more = stack.querySelector('[data-copilot=history]');
    more.hidden = c.stackRounds.length <= 3;
    more.textContent = '查看完整討論（' + c.stackRounds.length + '）';
  }
  function historyMarkup(c, b) {
    return '<summary>查看完整討論與修改答案（' + c.discussionLog.length + '）</summary>' + c.discussionLog.map(m => '<p><strong>' + (m.role === 'user' ? '你' : '創作助手') + '：</strong>' + esc(m.text) + '</p>').join('') + b.answers.map((a, i) => '<div class="copilot-answer-edit"><label>' + esc(a.question) + '<textarea data-edit-answer="' + i + '" maxlength="2000">' + esc([...a.values.map(v => v.label), a.other].filter(Boolean).join('；')) + '</textarea></label><button type="button" class="btn btn-ghost" data-save-answer="' + i + '">儲存答案修改</button></div>').join('');
  }
  function responseMarkup(c) {
    const r = c.response, questions = r?.form?.questions || [];
    return '<div class="copilot-response"><div class="copilot-heading"><h2 tabindex="-1">創作助手</h2>' + (r ? '<p class="copilot-message">' + esc(r.message) + '</p>' + summaryMarkup(r.thoughtSummaries) : '') + '</div>' +
      (c.error ? '<div class="plan-error" role="alert">' + esc(c.error) + '<button type="button" class="btn btn-ghost" data-copilot="retry">重試</button></div>' : '') +
      (questions.length || c.continuing ? '<form id="copilot-answer-form"><fieldset><legend class="section-label">' + esc(c.continuing ? '還有哪個地方想調整？你可以直接告訴我。' : r.form.title) + '</legend>' +
        (c.continuing ? '<label class="copilot-other" for="copilot-message">補充或調整<textarea id="copilot-message" maxlength="2000" rows="3">' + esc(c.message) + '</textarea></label>' : questions.map(q => questionMarkup(q, c.drafts)).join('')) +
        '<div class="copilot-actions"><button class="btn btn-primary" type="submit">' + (c.continuing ? '送出調整' : '確認這個方向') + '</button>' + (!c.continuing ? '<button class="btn btn-ghost" type="button" data-copilot="delegate">交給 AI 決定</button>' : '<button class="copilot-text-action" type="button" data-copilot="close-adjust">收合</button>') + '</div></fieldset></form>' : '') +
      '<div class="copilot-secondary-actions">' + (!c.continuing ? '<button type="button" class="copilot-text-action" data-copilot="continue">繼續調整</button>' : '') + '<button type="button" class="copilot-text-action" data-copilot="advance">略過討論</button></div></div>';
  }
  function render({ archive } = {}) {
    const el = document.getElementById('creative-copilot'), s = session(), c = s.copilot;
    if (!el) return;
    const stackHost = document.getElementById('creation-discussion-stack');
    const entering = c?.active && !s.selectedTemplate && !c.stackEntered;
    const inputBounds = entering ? document.getElementById('phase1-composer')?.getBoundingClientRect() : null;
    el.hidden = !c?.active || !!s.selectedTemplate;
    el.closest('.phase-panel')?.classList.toggle('is-discussing', !el.hidden);
    if (el.hidden) { if (stackHost) stackHost.hidden = true; stopVisuals(); return; }
    if (el.copilotSession !== c) {
      stopVisuals();
      el.innerHTML = '<div class="copilot-stack" aria-label="你的創作紀錄"><div class="copilot-user-message"><div><span>你的想法</span><p></p></div><button type="button" data-copilot="edit-story" class="copilot-text-action" aria-label="修改原始想法">修改原始想法</button></div><div class="copilot-stack-supplements"></div><button type="button" class="copilot-text-action stack-history-link" data-copilot="history" hidden></button></div><div class="copilot-body"><div class="copilot-main"></div><div class="copilot-brief-slot" hidden></div></div><details class="copilot-history" hidden></details>';
      el.copilotSession = c;
      if (stackHost) stackHost.replaceChildren(el.querySelector('.copilot-stack'));
    }
    if (stackHost) stackHost.hidden = ![1, 2].includes(s.currentPhase);
    const b = s.creativeBrief, stack = (stackHost || el).querySelector('.copilot-stack'), main = el.querySelector('.copilot-main');
    renderStack(stack, c, b, s.story);
    el.dataset.activity = c.phase || 'responded';
    const hasReply = c.discussionLog.some(message => message.role === 'assistant');
    const body = el.querySelector('.copilot-body'), briefSlot = el.querySelector('.copilot-brief-slot');
    // Brief remains authoritative data, but neither discussion nor settings exposes a sidebar.
    body.classList.remove('has-brief'); briefSlot.hidden = true;
    const history = el.querySelector('.copilot-history'); history.hidden = !hasReply;
    const historyHTML = hasReply ? historyMarkup(c, b) : '';
    if (history.historyHTML !== historyHTML) { history.innerHTML = historyHTML; history.historyHTML = historyHTML; }
    // Repeated busy renders preserve both the loader and its single caption timer.
    if (!(c.busy && main.dataset.busy === 'true' && activity)) {
      const old = main.firstElementChild;
      const outgoing = old?.getBoundingClientRect();
      activity?.stop(); activity = null;
      if (c.busy) {
        if (old && outgoing?.width && !reduced()) {
          const ghost = old.cloneNode(true); ghost.classList.add('copilot-response-exit'); ghost.inert = true; ghost.setAttribute('aria-hidden', 'true');
          if (archive) ghost.querySelectorAll('.copilot-option.is-selected, .copilot-other').forEach(node => { node.style.visibility = 'hidden'; });
          ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
          ghost.removeAttribute('id');
          for (const node of [ghost, ...ghost.querySelectorAll('*')]) for (const attribute of [...node.attributes]) if (attribute.name.startsWith('data-')) node.removeAttribute(attribute.name);
          Object.assign(ghost.style, { left: outgoing.left + 'px', top: outgoing.top + 'px', width: outgoing.width + 'px' });
          document.body.appendChild(ghost);
          animate(ghost, [{ opacity: .6, transform: 'scaleY(1)' }, { opacity: 0, transform: 'scaleY(.96)' }], { duration: motion('--motion-duration-fast', 200), easing: 'ease-out' }, () => ghost.remove());
        }
        main.innerHTML = '<div class="ai-activity-panel ai-activity-panel--compact" role="status" aria-label="正在思考你的創作需求"><div class="math-loader-box">' + compactLoaderMarkup + '</div><div class="ai-thinking-caption" aria-hidden="true" data-caption-source="system"><span></span></div><button type="button" class="copilot-text-action" data-copilot="advance">略過討論</button></div>';
        activity = startThinking(main.querySelector('.ai-activity-panel'), controller?.signal, !hasReply);
      } else {
        if (old?.classList.contains('ai-activity-panel') && outgoing?.width && !reduced()) {
          const ghost = old.cloneNode(true); ghost.classList.add('copilot-response-exit'); ghost.inert = true; ghost.setAttribute('aria-hidden', 'true'); ghost.removeAttribute('role');
          Object.assign(ghost.style, { left: outgoing.left + 'px', top: outgoing.top + 'px', width: outgoing.width + 'px' });
          document.body.appendChild(ghost);
          animate(ghost, [{ opacity: 1 }, { opacity: 0, filter: 'blur(3px)' }], { duration: motion('--motion-duration-fast', 200), easing: 'ease-out' }, () => ghost.remove());
        }
        main.innerHTML = responseMarkup(c);
        if (c.phase === 'revealing' && main.revealedResponse !== c.response) {
          main.revealedResponse = c.response;
          animate(main.querySelector('.copilot-response'), [{ opacity: 0, filter: 'blur(3px)', transform: 'translateY(5px)' }, { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' }], { duration: motion('--motion-duration-base', 300), easing: 'ease-out' }, () => {
            if (s.copilot === c && !c.busy) { c.phase = 'responded'; el.dataset.activity = 'responded'; }
          });
        }
      }
      main.dataset.busy = String(c.busy);
    }
    if (entering) {
      c.stackEntered = true;
      const message = stack.querySelector('.copilot-user-message'), to = message.getBoundingClientRect();
      if (inputBounds?.width && to.width && !reduced()) introAnimations.push(message.animate([
        { transform: 'translate(' + (inputBounds.left - to.left) + 'px,' + (inputBounds.top - to.top) + 'px) scale(' + inputBounds.width / to.width + ',' + inputBounds.height / to.height + ')', borderRadius: '24px' },
        { transform: 'translate(0,0) scale(1)', borderRadius: '16px' }
      ], { duration: motion('--motion-duration-medium', 500), easing: 'cubic-bezier(.22,1,.36,1)' }));
    }
    if (archive) archiveCard(archive.origin, [...stack.querySelectorAll('[data-round]')].find(card => card.dataset.round === archive.id));
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
    let payload, archive;
    try {
      if (retry && c.retry) {
        payload = c.retry.revision === s.creativeBrief.revision ? c.retry : { ...c.retry,
          brief: JSON.parse(JSON.stringify(s.creativeBrief)), revision: s.creativeBrief.revision,
          requestId: 'copilot-' + Date.now() + '-' + Math.random().toString(36).slice(2) };
        c.retry = payload;
      }
      else {
        const entries = ['delegate', 'continue'].includes(intent) ? [] : B.answers(c.response?.form, c.drafts);
        if (intent === 'continue' && !c.message.trim()) throw new Error('請先輸入想調整的地方。');
        if (intent === 'answer' && !entries.length && !c.message.trim()) throw new Error('請先選擇方向，或交給 AI 決定。');
        if (entries.length || c.message.trim()) {
          const origin = captureArchive();
          B.commit(s.creativeBrief, entries, c.message); dirty(); syncSettings();
          c.history.push({ role: 'user', text: [...entries.map(a => a.question + '：' + [...a.values.map(v => v.label), a.other].filter(Boolean).join('、')), c.message].filter(Boolean).join('\n').slice(0, 5000) });
          c.discussionLog.push({ ...c.history.at(-1) });
          const round = { id: 'discussion-' + (c.stackRounds.length + 1), answerIds: entries.map(answer => answer.id), message: c.message.trim() };
          c.stackRounds.push(round); archive = { id: round.id, origin };
        }
        payload = { story: s.story, brief: JSON.parse(JSON.stringify(s.creativeBrief)), history: c.history.slice(-12), message: c.message,
          intent, autoRounds: c.rounds, requestId: 'copilot-' + Date.now() + '-' + Math.random().toString(36).slice(2), revision: s.creativeBrief.revision };
        c.retry = payload; c.message = ''; c.drafts = {};
      }
    } catch (e) { c.error = e.message; render(); return; }
    cancel({ preserveIntro: true }); const ticket = version; controller = new AbortController(); const signal = controller.signal;
    c.response = null; c.busy = true; c.phase = 'thinking'; c.continuing = false; render({ archive });
    try {
      const token = root.spaAuth?.getToken?.();
      const response = await fetch('/api/creation/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(payload), signal });
      const data = await response.json();
      if (!response.ok) throw new Error(requestError(data));
      if (ticket !== version || signal.aborted || s.copilot !== c || s.creativeBrief.revision !== payload.revision) return;
      if (data.requestId !== payload.requestId || data.revision !== payload.revision) throw new Error('AI 回應版本不符，請重試。');
      c.response = B.validateResponse(data);
      c.response.thoughtSummaries = Array.isArray(data.thoughtSummaries) ? data.thoughtSummaries.filter(t => typeof t === 'string').slice(0, 8).map(t => t.slice(0, 12000)) : [];
      B.suggest(s.creativeBrief, c.response.briefPatch);
      c.history.push({ role: 'assistant', text: c.response.message }); c.history = c.history.slice(-24);
      c.discussionLog.push({ role: 'assistant', text: c.response.message });
      c.rounds = c.response.action === 'ready' ? 0 : c.rounds + 1; c.retry = null; c.phase = 'revealing';
    } catch (e) { if (ticket === version && !signal.aborted) {
      c.error = e.name === 'AbortError' ? '連線已中斷；你的選擇已保留，可以重試。' : e.message; c.phase = 'responded';
    } }
    finally {
      if (ticket === version) {
        c.busy = false; controller = null; render();
        if (c.phase !== 'revealing') c.phase = 'responded';
        if (c.response?.action === 'ready' && !c.error) {
          stopVisuals();
          B.confirm(s.creativeBrief); syncSettings(); dirty(); c.lastInsight = c.response.message;
          notify('ready');
        }
      }
    }
  }
  function advance() { captureStory(); cancel(); syncSettings(); notify('advance'); }
  function discuss() { const c = prepare(session().story); c.active = true; c.continuing = true; notify('discuss'); render(); document.getElementById('copilot-message')?.focus(); }
  function editStory() { cancel(); const c = session().copilot; if (c) { c.active = false; c.stackEntered = false; } render(); notify('edit-story'); const input = document.getElementById('story-input'); if (input) { input.value = session().story; input.focus({ preventScroll: true }); } }
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
    const onClick = event => {
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
      else if (action === 'history') {
        if (session().currentPhase !== 1) notify('discuss');
        const history = el.querySelector('.copilot-history');
        if (history) { history.open = true; history.querySelector('summary')?.focus({ preventScroll: true }); }
      }
    };
    el.addEventListener('click', onClick, { signal });
    document.getElementById('creation-discussion-stack')?.addEventListener('click', onClick, { signal });
    render();
  }
  root.CreativeCopilot = { prepare, render, request, cancel, mount, advance, syncSettings, discuss, editStory };
  root.AskGeminiConversation = root.CreativeCopilot; // Existing pages retain their compatible entry point.
})(typeof window !== 'undefined' ? window : globalThis);
