(function (root) {
  'use strict';
  const styleIds = ['natural', 'cinematic', 'anime', 'cyberpunk', 'photographic', 'retro', 'watercolor', 'minimal'];
  const fields = ['subject', 'purpose', 'direction', 'audience', 'tone', 'baseStyle', 'visualStyle', 'styleNotes', 'avoid', 'constraints', 'duration', 'ratio', 'settingsReason', 'visualKeywords'];
  const types = ['single_choice', 'multi_choice', 'proposal_choice', 'free_text'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const text = (value, max = 2000) => typeof value === 'string' && value.length <= max;
  function patch(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('創作摘要格式無效');
    const out = {};
    for (const key of fields) {
      if (value[key] == null) continue;
      const v = value[key];
      if (key === 'baseStyle') {
        if (!styleIds.includes(v)) throw new Error('基礎風格無效');
      } else if (key === 'visualKeywords') {
        if (!Array.isArray(v) || v.length > 10 || v.some(s => !text(s, 12) || s.trim().length < 2)) throw new Error('視覺關鍵詞無效');
      } else if (['avoid', 'constraints'].includes(key)) {
        if (!Array.isArray(v) || v.length > 16 || v.some(s => !text(s, 500))) throw new Error('創作限制格式無效');
      } else if (key === 'duration') {
        if (![15, 30, 45, 60].includes(v)) throw new Error('時長必須是 15、30、45 或 60 秒');
      } else if (key === 'ratio') {
        if (!['16:9', '9:16', '3:2', '2:3', '1:1'].includes(v)) throw new Error('畫面比例無效');
      } else if (!text(v)) throw new Error('創作欄位格式無效');
      out[key] = clone(v);
    }
    return out;
  }
  function validateResponse(data) {
    if (!data || !['ask', 'propose', 'ready'].includes(data.action) || !text(data.message, 5000) || !data.message.trim()) throw new Error('AI 回應格式無效，請重試');
    const result = { action: data.action, message: data.message, briefPatch: patch(data.briefPatch || {}), form: null };
    if (data.action === 'ready') return result;
    const form = data.form;
    if (!form || !text(form.title, 200) || !Array.isArray(form.questions) || form.questions.length < 1 || form.questions.length > 2) throw new Error('AI 問題格式無效');
    const ids = new Set();
    const questions = form.questions.map(q => {
      if (!q || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(q.id) || ids.has(q.id) || !types.includes(q.type) || !text(q.label, 500) || !q.label.trim()) throw new Error('AI 問題類型或 ID 無效');
      ids.add(q.id);
      const out = { id: q.id, type: q.type, label: q.label, description: text(q.description, 1000) ? q.description : '', required: q.required === true, allowOther: q.type === 'multi_choice' ? q.allowOther !== false : true };
      if (q.type !== 'free_text') {
        const max = q.type === 'multi_choice' ? 6 : 3;
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > max) throw new Error('AI 選項數量無效');
        const values = new Set();
        out.options = q.options.map(o => {
          if (!o || !text(o.value, 100) || !o.value || values.has(o.value) || !text(o.label, 300) || !o.label.trim() || (o.description != null && !text(o.description, 1500))) throw new Error('AI 選項格式無效');
          values.add(o.value); return { value: o.value, label: o.label, description: o.description || '' };
        });
        if (q.recommended != null && !values.has(q.recommended)) throw new Error('AI 推薦選項無效');
        out.recommended = q.recommended || null;
        if (q.type === 'multi_choice') {
          out.min = q.min ?? 0; out.max = q.max ?? out.options.length;
          if (!Number.isInteger(out.min) || !Number.isInteger(out.max) || out.min < 0 || out.max < Math.max(1, out.min) || out.max > out.options.length) throw new Error('多選限制無效');
        }
      }
      return out;
    });
    result.form = { title: form.title, questions }; return result;
  }
  function create(story = '') {
    const confirmed = explicitSettings(story);
    return { originalStory: story, confirmed, sources: Object.fromEntries(Object.keys(confirmed).map(k => [k, 'user'])), suggestions: {}, answers: [], requirements: [], revision: 0 };
  }
  function explicitSettings(message) {
    const out = {};
    for (const match of message.matchAll(/(16\s*[:：]\s*9|9\s*[:：]\s*16|3\s*[:：]\s*2|2\s*[:：]\s*3|1\s*[:：]\s*1)|(15|30|45|60)\s*(?:秒|seconds?\b|s\b)/gi)) {
      if (/不要|不用|不是|避免/.test(message.slice(Math.max(0, match.index - 5), match.index))) continue;
      if (match[1]) out.ratio = match[1].replace(/\s/g, '').replace('：', ':');
      else out.duration = Number(match[2]);
    }
    return out;
  }
  function suggest(brief, changes) {
    const safe = patch(changes);
    // Model output is a proposal. Only a user's explicit confirmation promotes it.
    brief.suggestions = { ...brief.suggestions, ...safe }; brief.revision++;
  }
  function confirm(brief) {
    brief.sources ||= {};
    for (const [key, value] of Object.entries(brief.suggestions)) {
      if (!Object.hasOwn(brief.confirmed, key) || brief.sources[key] === 'ai') {
        brief.confirmed[key] = clone(value); brief.sources[key] = 'ai';
      }
    }
    brief.suggestions = {}; brief.revision++;
  }
  function edit(brief, changes) {
    Object.assign(brief.confirmed, patch(changes));
    brief.sources ||= {};
    for (const key of fields.filter(k => Object.hasOwn(changes, k))) {
      delete brief.suggestions[key];
      brief.sources[key] = 'user';
      if (changes[key] === null) delete brief.confirmed[key];
    }
    brief.revision++;
  }
  function answers(form, values = {}) {
    return (form?.questions || []).flatMap(q => {
      const entry = values[q.id] || {}, chosen = Array.isArray(entry.values) ? entry.values : [];
      const other = entry.otherActive === false ? '' : typeof entry.other === 'string' ? entry.other.trim() : '';
      if (!text(other)) throw new Error('補充內容過長');
      const options = (q.options || []).filter(o => chosen.includes(o.value));
      if (chosen.length !== new Set(chosen).size || chosen.length !== options.length || (q.type !== 'multi_choice' && chosen.length > 1) || (other && q.type !== 'free_text' && !q.allowOther)) throw new Error('選擇的答案無效');
      if (q.type !== 'multi_choice' && chosen.length && other) throw new Error('單選答案不能同時選擇其他');
      if (entry.otherActive && !other) throw new Error('請填寫自行描述的內容');
      if (q.required && !chosen.length && !other) throw new Error('請回答「' + q.label + '」或選擇略過');
      if (q.type === 'multi_choice' && !other && ((chosen.length > 0 || q.required) && chosen.length < q.min || chosen.length > q.max)) throw new Error('請依多選數量限制作答');
      return chosen.length || other ? [{ id: q.id, question: q.label, values: options.map(o => ({ value: o.value, label: o.label, description: o.description })), other }] : [];
    });
  }
  function commit(brief, entries, message = '') {
    entries.forEach(entry => { brief.answers = brief.answers.filter(a => a.id !== entry.id); brief.answers.push(clone(entry)); });
    if (message.trim()) brief.requirements.push(message.trim());
    if (entries.length || message.trim()) {
      delete brief.suggestions.visualKeywords; delete brief.confirmed.visualKeywords;
      edit(brief, explicitSettings(message));
    }
    brief.requirements = brief.requirements.slice(-20); brief.revision++;
  }
  function snapshot(brief) {
    if (!brief) return null;
    return clone({ originalStory: brief.originalStory, confirmed: brief.confirmed, answers: brief.answers, requirements: brief.requirements, revision: brief.revision });
  }
  const api = { fields, styleIds, types, patch, validateResponse, create, explicitSettings, suggest, confirm, edit, answers, commit, snapshot };
  root.CreativeBrief = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
