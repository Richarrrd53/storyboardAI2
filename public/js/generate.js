(function () {
  'use strict';

  async function performPageContentTransition(action) {
      const contentEl = document.getElementById('page-content') || document.getElementById('page-main');
      if (contentEl) {
          contentEl.style.transition = 'opacity 0.3s ease, filter 0.3s ease';
          contentEl.style.opacity = '0';
          contentEl.style.filter = 'blur(15px)';
          await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      action();
      
      if (contentEl) {
          contentEl.style.opacity = '1';
          contentEl.style.filter = 'blur(0px)';
          await new Promise(resolve => setTimeout(resolve, 300));
          contentEl.style.removeProperty('filter');
          contentEl.style.removeProperty('transition');
      }
  }

  // ── DOM refs (改成 let，允許動態刷新) ──
  let storyInput = null;
  let inputArea = null;

  // ── 1. State ──
  const state = {
      story: '',
      styleIndex: 0,
      ratio: '橫向16:9',
      useTemplate: false,
      selectedTemplate: null,
      resolvedVariables: {},
      finalPrompts: []
  };

  let TEMPLATES = [];
  async function getTemplates() {
      try{
          const res = await fetch('/api/get-templates');
          if (!res.ok) throw new Error('連線異常');
          const templates = await res.json();
          return templates;
      }
      catch (err){
          console.error('抓取模板失敗', err);
          return [];
      }
  }

  async function initTemplates() {
      TEMPLATES = await getTemplates();
      if(TEMPLATES.length == 0){
          console.warn("無可用模板")
      } else {
          if (window.preselectedTemplateId) {
              const tpl = TEMPLATES.find(t => t.id === window.preselectedTemplateId);
              if (tpl) {
                  state.selectedTemplate = tpl;
                  state.useTemplate = true;
                  updatePreselectedTemplateUI();
                  if (typeof window.showSpaToast === 'function') {
                      window.showSpaToast(`已選用模板：${tpl.name}`);
                  }
              }
          }
      }
  }

  const STYLES = [
      { name: '預設風格', dot: '#7fba7a', desc: '自然清新', prompt: "natural lighting, high resolution, clean composition, soft focus background" },
      { name: '電影風格', dot: '#2a2a3a', desc: '戲劇光影', prompt: "anamorphic lens, cinematic lighting, 8k resolution, deep shadows, professional color grading, film noir vibes" },
      { name: '二次元風格', dot: '#ffc5e8', desc: '熱門手遊感', prompt: "mihoyo style, genshin impact aesthetic, cel-shaded, vibrant anime colors, expressive lighting, high-quality 3D render look" },
      { name: 'Cyberpunk風格', dot: '#6200ea', desc: '霓虹未來', prompt: "neon palette, high contrast, futuristic street, rain-slicked pavement, volumetric fog, cyberpunk 2077 aesthetic" },
      { name: '美式寫實風格', dot: '#c49a2a', desc: '溫暖金調', prompt: "professional photography, golden hour, sun-drenched, shallow depth of field, sharp details, Kodak Portra 400 look" },
      { name: '90s 復古風格', dot: '#f44336', desc: '懷舊膠卷', prompt: "90s VHS aesthetic, vintage film grain, light leaks, chromatic aberration, retro colors, nostalgic atmosphere" },
      { name: '水彩插畫風格', dot: '#b8d4ff', desc: '柔和藝術', prompt: "delicate watercolor painting, ink wash, dreamy atmosphere, paper texture, hand-drawn illustration" },
      { name: '極簡室內風格', dot: '#eceff1', desc: '侘寂高級感', prompt: "minimalist aesthetic, soft natural light, Wabi-sabi style, high-end interior design photography, neutral tones" }
  ];

  const LOADING_STEPS_FREE = [
      { pct: 0, messages: ['正在努力讀懂你的精彩故事喔 ✨', '拼命拆解場景節奏中... 🏄', '悄悄思考故事的最強結構... 💭'] },
      { pct: 10, messages: ['努力捕捉最有張力的畫面！📸', '偵測故事的情緒波動中... 💓', '挖出所有隱藏的視覺小細節 ✨'] },
      { pct: 20, messages: ['正在幫你排排站設計鏡頭順序 🎬', '想像每個轉場的絲滑感覺～ ✨', '精心調整構圖的黃金比例中 📐'] },
      { pct: 50, messages: ['正在著色並渲染第 {n} 張畫面囉！🎨', '再等一下下... 美麗的畫面快生出來了 ✦', '畫筆飛速揮舞中，正在為您著色... 🖌️'] },
      { pct: 100, messages: ['偷偷檢查鏡頭節奏有沒有完美... 🔍', '最後整理收尾中，請準備好驚嘆！🎉', '叮咚！快完成了，精彩分鏡即將登場 ✦'] },
  ];

  const LOADING_STEPS_TPL = [
      { pct: 0, messages: ['套用精美的模板結構中 📐', '解析故事的奇妙變數 ✨', '把你的創意對應到分鏡模板上 🎯'] },
      { pct: 15, messages: ['把熱騰騰的故事填進模板中 📝', '代入場景與角色，讓他們動起來 🎬', '整理最關鍵的畫面元素中... 💡'] },
      { pct: 30, messages: ['優化每個分鏡的魔法提示詞 🪄', '調整畫面風格與溫暖語氣 ✨', '細細雕琢每一幀的畫面描述 🖌'] },
      { pct: 50, messages: ['正在著色並渲染第 {n} 張畫面囉！🎨', '再等一下下... 美麗的畫面快生出來了 ✦', '畫筆飛速揮舞中，正在為您著色... 🖌️'] },
      { pct: 100, messages: ['確保節奏連貫又迷人～ ✨', '亮點 HOOK 設計已到位！🔥', '叮咚！快完成了，精彩分鏡即將登場 ✦'] },
  ];

  let _loadingTickerTimer = null;
  let _loadingTickerIdx = 0;
  let activeGenController = null;

  function startLoadingTicker(stepMessages, completedCount) {
      stopLoadingTicker();
      const titleEl = document.getElementById('loading-title');
      _loadingTickerIdx = 0;

      const tick = () => {
          const raw = stepMessages[_loadingTickerIdx % stepMessages.length];
          const msg = raw.replace('{n}', completedCount + 1);
          if (titleEl) titleEl.textContent = msg;
          _loadingTickerIdx++;
          _loadingTickerTimer = setTimeout(tick, 2600 + Math.random() * 800);
      };
      tick();
  }

  function stopLoadingTicker() {
      if (_loadingTickerTimer) { clearTimeout(_loadingTickerTimer); _loadingTickerTimer = null; }
  }

  function updateGenStep(stepId, status) {
      const el = document.getElementById(stepId);
      if (!el) return;
      el.dataset.status = status;
      if (stepId === 'step-prompt' && (status === 'success' || status === 'pending')) {
          const titleEl = el.querySelector('.step-title');
          if (titleEl) titleEl.textContent = '繪製分鏡草稿...';
      }
      if (status === 'active') {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
  }

  function updatePromptStepProgress(completedCount, total) {
      const el = document.getElementById('step-prompt');
      if (!el) return;
      const titleEl = el.querySelector('.step-title');
      if (titleEl) {
          titleEl.textContent = `繪製分鏡草稿 (${completedCount}/${total})...`;
      }
  }

  function updateLoadingUI(stepIdx, steps, completedCount = 0, total = 0) {
      const s = steps[stepIdx];
      const subEl = document.getElementById('loading-sub');
      const barEl = document.getElementById('gen-progress');
      const pctEl = document.getElementById('gen-progress-text');
      
      let pct = s.pct;
      if (stepIdx === 3 && total > 0) {
          pct = Math.floor(50 + (completedCount / total) * 45);
      }
      
      if (barEl) barEl.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
      const subMessages = {
          0: '分析故事語意，拆解場景節奏',
          1: '識別人物、場景與情感節點',
          2: '配對構圖與運鏡建議',
          3: '渲染畫面，組合成完整分鏡',
          4: '確保節奏連貫，HOOK 設計到位',
      };
      if (subEl) subEl.textContent = subMessages[stepIdx] || '';
      startLoadingTicker(s.messages, completedCount);
  }

  function showPhase(id) {
      document.querySelectorAll('.phase').forEach(p => p.classList.remove('active'));
      const el = document.getElementById(id);
      if (el) {
          el.style.animation = 'none';
          el.offsetHeight;
          el.style.animation = '';
          el.classList.add('active');
      }

      const pageMain = document.getElementById('page-main');
      if (pageMain) {
          if (id === 'phase-generating') {
              pageMain.classList.add('is-generating');
          } else {
              pageMain.classList.remove('is-generating');
          }
      }
  }

  function onStoryInput() {
      const val = storyInput.value.trim();
      const btn = document.getElementById('compose-send');
      const hasText = val.length > 0;
      btn.setAttribute('data-active', hasText ? 'true' : 'false');
      btn.disabled = !hasText;
      state.story = val;
      resetHeight();
      adjustHeight();
  }

  function fillSugg(btn) {
      storyInput.value = btn.textContent;
      onStoryInput();
      storyInput.focus();
  }

  const AI_RESPONSE_TEMPLATES = [
      story => `收到！幫你規劃一支關於「${story}」的分鏡 ✦`,
      story => `了解，「${story}」，我來幫你把它變成畫面 ✦`,
      story => `好主意！讓我為「${story}」設計分鏡結構 ✦`,
  ];

  function getAiResponseText(story) {
      const short = story.length > 20 ? story.slice(0, 20) + '…' : story;
      const idx = Math.floor(Math.random() * AI_RESPONSE_TEMPLATES.length);
      return AI_RESPONSE_TEMPLATES[idx](short);
  }

  function typewriterEffect(el, text, cursorEl, onDone) {
      let i = 0;
      el.textContent = '';
      if (cursorEl) cursorEl.style.opacity = '1';
      const tick = () => {
          if (i < text.length) {
              el.textContent += text[i++];
              setTimeout(tick, 28 + Math.random() * 18);
          } else {
              setTimeout(() => {
                  if (cursorEl) cursorEl.style.opacity = '0';
                  if (onDone) onDone();
              }, 500);
          }
      };
      tick();
  }

  const STYLE_KEYWORD_MAP = [
      { keywords: ['食物', '餐廳', '美食', '咖啡', '飲料', '甜點', '料理', '吃'], styles: [0, 4] },
      { keywords: ['旅遊', '旅行', '風景', '自然', '戶外', '山', '海', '森林'], styles: [0, 6] },
      { keywords: ['科技', '未來', 'AI', '機器人', '賽博', '電子', '數位'], styles: [3, 1] },
      { keywords: ['遊戲', '動漫', '角色', '二次元', '動畫', '漫畫'], styles: [2] },
      { keywords: ['懷舊', '復古', '老', 'vintage', '經典', '老舊'], styles: [5] },
      { keywords: ['品牌', '商業', '極簡', '高端', '奢華', '精品', '設計'], styles: [7, 4] },
      { keywords: ['運動', '健身', '跑步', '瑜珈', '球', '競技'], styles: [1, 4] },
      { keywords: ['廣告', '行銷', '產品', '開箱', '推廣'], styles: [4, 0] },
  ];

  function detectRecommendedStyles(story) {
      const lower = story.toLowerCase();
      for (const rule of STYLE_KEYWORD_MAP) {
          if (rule.keywords.some(kw => lower.includes(kw))) {
              return rule.styles;
          }
      }
      return [0];
  }

  let _allStylesVisible = false;

  function buildStyleChips() {
      const row = document.getElementById('style-chips-row');
      const showAllBtn = document.getElementById('style-show-all-btn');
      const recTag = document.getElementById('style-rec-tag');
      if (row.childElementCount > 0) return;

      const recIndices = detectRecommendedStyles(state.story);
      state.styleIndex = recIndices[0];

      STYLES.forEach((s, i) => {
          const btn = document.createElement('button');
          const isRec = recIndices.includes(i);
          btn.className = 'opt-chip style-chip' + (i === state.styleIndex ? ' active' : '');
          btn.dataset.styleIndex = i;
          btn.innerHTML = `<span class="style-chip-dot" style="background:${s.dot}"></span>${s.name}${isRec && i === recIndices[0] ? ' <span class="chip-rec-badge">推薦</span>' : ''}`;
          btn.onclick = () => {
              state.styleIndex = i;
              document.querySelectorAll('.style-chip').forEach(c => c.classList.remove('active'));
              btn.classList.add('active');
          };
          if (!isRec) btn.style.display = 'none';
          row.appendChild(btn);
      });

      if (recIndices.length < STYLES.length) {
          showAllBtn.style.display = 'inline-flex';
          recTag.style.display = 'inline';
      }
      _allStylesVisible = false;
  }

  function showAllStyles() {
      _allStylesVisible = true;
      document.querySelectorAll('.style-chip').forEach(btn => { btn.style.display = 'inline-flex'; });
      const showAllBtn = document.getElementById('style-show-all-btn');
      if (showAllBtn) showAllBtn.style.display = 'none';
  }

  function submitStory() {
      const story = storyInput.value.trim();
      if (!story) return;
      state.story = story;

      const echoEl = document.getElementById('options-echo');
      const hintEl = document.getElementById('options-hint');
      const labelEl = document.getElementById('options-story-label');
      const responseText = document.getElementById('ai-response-text');
      const responseLine = document.getElementById('ai-response-line');
      const cursorEl = document.getElementById('ai-response-cursor');

      echoEl.textContent = story.length > 40 ? story.slice(0, 40) + '…' : story;
      echoEl.style.opacity = '0';
      hintEl.style.opacity = '0';
      labelEl.style.opacity = '0';

      storyInput.classList.add('locked');
      document.getElementById('compose-card').classList.add('expanded');
      document.getElementById('compose-options').classList.add('open');
      document.getElementById('compose-input-area').classList.add('hidden');
      document.getElementById('suggestion-row').classList.add('hidden');
      resetHeight();

      const aiText = getAiResponseText(story);
      buildStyleChips();
      setTimeout(() => {
          typewriterEffect(responseText, aiText, cursorEl, () => {
              hintEl.style.transition = 'opacity 0.5s';
              labelEl.style.transition = 'opacity 0.5s';
              echoEl.style.transition = 'opacity 0.5s';
              setTimeout(() => {
                  hintEl.style.opacity = '1';
                  labelEl.style.opacity = '1';
                  echoEl.style.opacity = '1';
              }, 200);
          });
      }, 320);
  }

  function selectRatioOpt(btn) {
      state.ratio = btn.dataset.ratio;
      document.querySelectorAll('.ratio-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
  }

  function resetCompose() {
      document.getElementById('compose-card').classList.remove('expanded');
      document.getElementById('compose-options').classList.remove('open');
      document.getElementById('suggestion-row').classList.remove('hidden');
      document.getElementById('compose-input-area').classList.remove('hidden');
      storyInput.classList.remove('locked');
      adjustHeight();
  }

  let isHorizon = (window.innerWidth < window.innerHeight);

  function resetAll() {
      state.story = '';
      state.styleIndex = 0;
      state.ratio = '橫向16:9';
      state.useTemplate = false;
      state.selectedTemplate = null;
      state.resolvedVariables = {};
      state.finalPrompts = [];
      window.storyboardData = null;
      window.generatedImgs = [];
      window.generatedStoryTitles = [];
      window.generatedStoryCams = [];
      window.generatedPrompts = [];

      storyInput.value = '';
      storyInput.classList.remove('locked');
      document.getElementById('compose-card').classList.remove('expanded');
      document.getElementById('compose-options').classList.remove('open');
      document.getElementById('compose-input-area').classList.remove('hidden');
      document.getElementById('suggestion-row').classList.remove('hidden');
      document.getElementById('style-chips-row').innerHTML = '';
      document.querySelectorAll('.ratio-chip').forEach((c, i) => c.classList.toggle('active', i === 0));
      document.getElementById('result-template-badge').style.display = 'none';

      const banner = document.getElementById('template-preselect-banner');
      if (banner) banner.style.display = 'none';
      document.getElementById('storyboard-grid').innerHTML = '';
      const rtEl = document.getElementById('ai-response-text');
      const rcEl = document.getElementById('ai-response-cursor');
      const hintEl = document.getElementById('options-hint');
      const labelEl = document.getElementById('options-story-label');
      const echoEl = document.getElementById('options-echo');
      if (rtEl) rtEl.textContent = '';
      if (rcEl) rcEl.style.opacity = '0';
      if (hintEl) hintEl.style.opacity = '0';
      if (labelEl) labelEl.style.opacity = '0';
      if (echoEl) echoEl.style.opacity = '0';
      const showAllBtn = document.getElementById('style-show-all-btn');
      const recTag = document.getElementById('style-rec-tag');
      if (showAllBtn) showAllBtn.style.display = 'none';
      if (recTag) recTag.style.display = 'none';
      _allStylesVisible = false;
      onStoryInput();
      resetHeight();
      initTemplates();
      showPhase('phase-compose');
  }

  async function proceedToTemplate() {
      if (state.selectedTemplate) {
          enterVariablesPhase();
      } else {
          showPhase('phase-template');
          renderTemplateGrid();
      }
  }

  function backToCompose() {
      showPhase('phase-compose');
  }

  const CAT_MAP = {
      'product': '商品焦點',
      'story': '品牌故事',
      'twist': '反轉爆點',
      'custom': '自訂模板',
      '未分類': '未分類'
  };

  function renderTemplateGridFiltered(filteredTemplates) {
      const grid = document.getElementById('template-grid');
      grid.innerHTML = '';
      if (filteredTemplates.length === 0) {
          grid.innerHTML = '<div style="color:var(--text-mid); text-align:center; padding: 40px; grid-column: 1/-1;">此分類下目前無可用模板</div>';
          return;
      }
      filteredTemplates.forEach(tpl => {
          const card = document.createElement('div');
          card.className = 'template-card';
          card.id = `tpl-card-${tpl.id}`;
          if (state.selectedTemplate && state.selectedTemplate.id === tpl.id) {
              card.classList.add('selected');
          }
          card.innerHTML = `
              <div class="template-thumb">${tpl.thumbnail ? `<img src="${tpl.thumbnail}" alt="${tpl.name}">` : '📄'}</div>
              <div class="template-info">
                  <div class="template-title">${tpl.name}</div>
              </div>
              <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #f6f6f6; padding-top: 8px;">
                  <span style="font-size: 0.75rem; color: var(--text-light); font-weight: 700; background: var(--primary-soft); color: var(--primary); padding: 2px 8px; border-radius: 4px;">${CAT_MAP[tpl.category] || tpl.category || '未分類'}</span>
                  <button class="tc-preview-btn" onclick="openPreview('${tpl.id}', event)" style="background: none; border: none; color: var(--primary); font-size: 0.8rem; font-weight: 800; cursor: pointer; padding: 2px 6px;">預覽 ➔</button>
              </div>
          `;
          card.onclick = () => selectTemplate(tpl.id);
          grid.appendChild(card);
      });
  }

  function renderTemplateGrid() {
      // 1. Group templates by category using translated Chinese keys
      const groups = { '全部': TEMPLATES };
      TEMPLATES.forEach(t => {
          const dbCat = t.category || '未分類';
          const k = CAT_MAP[dbCat] || dbCat;
          if (!groups[k]) groups[k] = [];
          groups[k].push(t);
      });

      const categories = ['全部', ...Object.keys(groups).filter(k => k !== '全部')];

      // 2. Render category list
      const catsEl = document.getElementById('generate-template-cats');
      if (catsEl) {
          catsEl.innerHTML = `
              <div class="template-cat-header">
                  <h2>模板分類</h2>
                  <p>選擇最符合故事結構的爆點模式。</p>
              </div>
              ` + categories.map((c, i) => `
                  <button class="tpl-cat ${i === 0 ? 'active' : ''}" data-cat="${c}">
                      ${c} <span class="count">(${groups[c].length})</span>
                  </button>
              `).join('');

          // 3. Bind click events to category buttons
          catsEl.querySelectorAll('.tpl-cat').forEach(btn => {
              btn.onclick = () => {
                  catsEl.querySelectorAll('.tpl-cat').forEach(x => x.classList.remove('active'));
                  btn.classList.add('active');
                  renderTemplateGridFiltered(groups[btn.dataset.cat] || []);
              };
          });
      }

      // 4. Default to render "全部" category
      renderTemplateGridFiltered(TEMPLATES);
  }

  function selectTemplate(id) {
      state.selectedTemplate = TEMPLATES.find(t => t.id === id) || null;
      document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
      const card = document.getElementById(`tpl-card-${id}`);
      if (card) card.classList.add('selected');

      const hint = document.getElementById('taf-hint');
      const btn = document.getElementById('taf-apply-btn');
      if (state.selectedTemplate) {
          hint.textContent = `已選擇：${state.selectedTemplate.name}`;
          btn.disabled = false;
          btn.textContent = '✦ 下一步 (自訂變數)';
      }
  }

  function openPreview(id, e) {
      if (e) e.stopPropagation();
      const tpl = TEMPLATES.find(t => t.id === id);
      if (!tpl) return;
      selectTemplate(id);
      document.getElementById('preview-title').textContent = tpl.name;
      document.getElementById('preview-body').innerHTML = buildPreviewHTML(tpl);
      document.getElementById('template-preview-drawer').classList.add('open');
  }

  function _pvPaceLabel(pace) {
      return { fast: '⚡ 快節奏', medium: '🎯 中節奏', slow: '🌊 慢節奏' }[pace] || pace;
  }
  function _pvToneEmoji(tone) {
      const map = { energetic:'⚡', emotional:'💛', casual:'😊', humor:'😂', situational:'🎭', dramatic:'🎬', trust:'🤝', curiosity:'🔍' };
      return map[tone] || '✦';
  }
  function _pvArcSteps(structure) {
      const generic = [
          { icon: '👀', label: '勾起注意' },
          { icon: '✨', label: '展示亮點' },
          { icon: '🔥', label: '情緒高點' },
          { icon: '🛒', label: '行動呼籲' }
      ];
      return generic;
  }
  function _pvSuitability(tpl) {
      const good = [];
      const warn = [];
      const t = (tpl.tags || []).join(' ') + ' ' + (tpl.useCase || '') + ' ' + tpl.category;
      if (/產品|開箱|商品/.test(t)) good.push('有實體產品展示');
      if (/食物|美食|餐廳/.test(t)) good.push('餐飲、食物類內容');
      if (/旅遊|生活|vlog/.test(t)) good.push('生活紀錄、旅遊 vlog');
      if (/社恐|幽默|搞笑|humor/.test(t)) good.push('輕鬆搞笑、人設鮮明');
      if (/品牌|行銷|廣告/.test(t)) good.push('品牌推廣、商業行銷');
      if (good.length === 0) good.push('符合「' + tpl.category + '」類型的內容');
      if (/product|lifestyle/.test(tpl.category)) warn.push('純文字資訊類效果較差');
      else warn.push('需要強烈視覺感的場景');
      return { good, warn };
  }
  function _pvShotHint(s) {
      const camMap = { 'extreme-close-up':'🔍 極近特寫', 'close-up':'🎯 近景特寫', 'medium-close':'👤 中近景', 'medium':'🧍 中景', 'wide':'🌅 廣角', 'extreme-wide':'🗺️ 超廣角', 'handheld':'✋ 手持晃動感', 'static':'📐 固定鏡頭', 'overhead':'👆 俯拍', 'low-angle':'⬆️ 仰角' };
      const emoMap = { 'amazement':'驚喜感', 'curiosity':'好奇感', 'satisfaction':'滿足感', 'desire':'渴望感', 'trust':'信任感', 'excitement':'興奮感', 'tension':'緊張感', 'relatability':'共鳴感', 'joy':'喜悅感', 'surprise':'驚訝感' };
      return { camLabel: camMap[s.camera] || s.camera, emoLabel: emoMap[s.emotion] || s.emotion };
  }

  function buildPreviewHTML(tpl) {
      const arcSteps = _pvArcSteps(tpl.narrative.structure);
      const suitability = _pvSuitability(tpl);
      const toneEmoji = _pvToneEmoji(tpl.narrative.tone);
      const paceLabel = _pvPaceLabel(tpl.visualFlow?.pace);
      const platforms = (tpl.platform || []).join(' · ');

      const heroHTML = `
          <div class="pv-hero">
              <div class="pv-hero-desc">${tpl.description}</div>
              <div class="pv-hero-chips">
                  <span class="pv-hero-chip">${paceLabel}</span>
                  ${platforms ? `<span class="pv-hero-chip pv-chip-platform">📱 ${platforms}</span>` : ''}
                  <span class="pv-hero-chip pv-chip-shots">🎬 ${tpl.shotsCount} 個鏡頭</span>
                  <span class="pv-hero-chip">${toneEmoji} ${tpl.narrative.tone}</span>
              </div>
          </div>`;

      const arcHTML = `
          <div class="pv-section">
              <p class="pv-section-label">故事怎麼走</p>
              <div class="pv-arc">
                  ${arcSteps.map((step, i) => `
                      <div class="pv-arc-step">
                          <div class="pv-arc-icon">${step.icon}</div>
                          <div class="pv-arc-label">${step.label}</div>
                      </div>
                      ${i < arcSteps.length - 1 ? '<div class="pv-arc-arrow">→</div>' : ''}
                  `).join('')}
              </div>
              <div class="pv-narrative-detail">${tpl.narrative.structure}</div>
          </div>`;

      const suitHTML = `
          <div class="pv-section">
              <p class="pv-section-label">這模板適合我嗎？</p>
              <div class="pv-suit-list">
                  ${suitability.good.map(s => `<div class="pv-suit-row pv-suit-good">✅ ${s}</div>`).join('')}
                  ${suitability.warn.map(s => `<div class="pv-suit-row pv-suit-warn">⚠️ ${s}</div>`).join('')}
              </div>
          </div>`;

      const shotsHTML = `
          <div class="pv-section">
              <p class="pv-section-label">${tpl.shotsCount} 個畫面長這樣</p>
              <div class="pv-shots-new">
                  ${tpl.structure.map((s, i) => {
                      const { camLabel, emoLabel } = _pvShotHint(s);
                      return `
                      <div class="pv-shot-new" data-shot="${i}">
                          <div class="pv-shot-new-num">${s.shot}</div>
                          <div class="pv-shot-new-body">
                              <p class="pv-shot-new-action">${s.action}</p>
                              <p class="pv-shot-new-hint">${s.purpose} · ${s.duration}</p>
                              <div class="pv-shot-new-tags">
                                  <span class="pv-shot-tag">${camLabel}</span>
                                  <span class="pv-shot-tag pv-shot-tag-emo">${emoLabel}</span>
                              </div>
                          </div>
                      </div>`;
                  }).join('')}
              </div>
          </div>`;

      const varsHTML = `
          <div class="pv-section pv-section-magic">
              <p class="pv-section-label">AI 會從你的故事自動抓取 🪄</p>
              <div class="pv-vars-new">
                  ${tpl.variables.map(v => {
                      const labelMap = { character:'主角外觀', student:'學生外觀', scene:'場景地點', emotion:'情緒氛圍', style:'視覺風格', product:'產品名稱', subject:'受訪對象' };
                      return `<span class="pv-var-new">${labelMap[v] || v}</span>`;
                  }).join('')}
              </div>
              <p class="pv-magic-hint">你只需要描述故事，AI 自動填入這些細節</p>
          </div>`;

      const whyHTML = `
          <div class="pv-section pv-section-why">
              <p class="pv-section-label">為什麼這個結構有效？</p>
              <p class="pv-why-text">${tpl.analysis.whyItWorks}</p>
              <div class="pv-elements">
                  ${tpl.analysis.replicableElements.map(e => `<span class="pv-element-chip">✦ ${e}</span>`).join('')}
              </div>
          </div>`;

      return heroHTML + arcHTML + suitHTML + shotsHTML + varsHTML + whyHTML;
  }

  function closePreview() {
      document.getElementById('template-preview-drawer').classList.remove('open');
  }

  async function applyTemplateAndGenerate() {
      closePreview();
      if (!state.selectedTemplate) { await alert('請先選擇一個模板！'); return; }
      state.useTemplate = true;
      enterVariablesPhase();
  }

  window.storyboardData = null;
  window.generatedImgs = [];
  window.generatedStoryTitles = [];
  window.generatedStoryCams = [];
  window.generatedPrompts = [];

  function getStoryboardPrompt() {
      const styleDetail = STYLES[state.styleIndex].prompt;
      return `你是一個專業的短影音分鏡設計系統。
請分析使用者的故事描述，並為其設計一個包含分鏡鏡頭與角色設定的完整分鏡腳本。

使用者故事："""${state.story}"""
影片風格：${STYLES[state.styleIndex].name} (${styleDetail})

請嚴格輸出符合以下 JSON 格式的內容，不要包含任何 markdown 外框或額外的說明文字：
{
  "meta": {
    "title": "影片標題（簡短有吸引力）"
  },
  "characters": {
    "char_1": {
      "appearance": "主角外貌特徵（英文描述，例如: young Asian woman, long black hair）",
      "outfit": "主角服裝（英文描述，例如: white t-shirt, blue jeans）",
      "personality": "性格或神情（英文描述，例如: smiling, energetic）"
    }
  },
  "shots": [
    {
      "id": 1,
      "story": "分鏡畫面發生的情節與動作描述（中文，用於畫面標題）",
      "camera": "鏡頭與運鏡方式（例如: close-up, medium shot, tracking shot）",
      "duration": "鏡頭時長（例如: 3s, 4s）",
      "emotion": "此鏡頭的情緒（例如: excited, satisfied, neutral）",
      "shotPrompt": "此鏡頭畫面的英文提示詞描述（例如: a close up of a young woman smiling in a bright kitchen）",
      "characters": ["char_1"]
    }
  ]
}
注意：
1. "shots" 中的 "characters" 必須關聯到 "characters" 物件中的 key（例如 "char_1"）。
2. 所有提示詞、角色外觀及服飾描述必須使用英文，以方便圖像生成。`;
  }

  function getRatioPrompt() {
      return {
          '橫向16:9': 'horizontal 16:9 aspect ratio, wide landscape composition',
          '直向9:16': 'vertical 9:16 aspect ratio, portrait composition, tall frame',
          '1:1': 'square 1:1 aspect ratio',
          '橫向3:2': 'horizontal 3:2 aspect ratio, landscape composition',
          '直向2:3': 'vertical 2:3 aspect ratio, portrait composition',
      }[state.ratio] || 'composition';
  }

  async function buildFinalPrompt(shot) {
      const styleDetail = STYLES[state.styleIndex].prompt;
      const rPrompt = getRatioPrompt();
      const characterData = (shot.characters || [])
          .map(id => window.storyboardData.characters[id])
          .filter(Boolean);
      const shotPromptRaw = shot.shotPrompt || shot.prompt || '';

      if (characterData.length === 0) {
          return `${shotPromptRaw}, ${styleDetail}, ${rPrompt}, high quality`;
      }

      const characterPromptArray = characterData.map(char => {
          const a = char.appearance || '';
          const o = char.outfit || '';
          const p = char.personality || '';
          return [a, o, p].filter(Boolean).join(', ');
      });
      
      const characterPrompt = characterPromptArray.join(', ');

      return `${characterPrompt}, ${shotPromptRaw}, ${styleDetail}, ${rPrompt}, high quality, consistent character design`;
  }

  async function startGenerate() {
      if (!state.story) return;
      state.useTemplate = false;

      activeGenController = new AbortController();
      window.isGeneratingStoryboard = true;
      window.abortStoryboardGeneration = () => {
          if (activeGenController) activeGenController.abort();
      };

      await performPageContentTransition(() => {
          showPhase('phase-generating');
      });
      const allSteps = ['step-analyze', 'step-structure', 'step-prompt', 'step-render'];
      allSteps.forEach(id => updateGenStep(id, 'pending'));

      updateGenStep('step-analyze', 'active');
      const barEl = document.getElementById('gen-progress');
      const pctEl = document.getElementById('gen-progress-text');

      window.generatedImgs = [];
      window.generatedStoryTitles = [];
      window.generatedStoryCams = [];

      try {
          updateLoadingUI(0, LOADING_STEPS_FREE);
          const storyboardRes = await askGemini(getStoryboardPrompt(), 'story');
          window.storyboardData = safeParseJson(storyboardRes.response);
          if (!window.storyboardData) return;
          window.storyboardData = normalizeStoryboard(window.storyboardData);
          try { validateStoryboard(window.storyboardData); }
          catch (err) { console.error(err); await alert('Storyboard 結構錯誤：\n' + err.message); return; }

          updateGenStep('step-analyze', 'success');
          updateGenStep('step-structure', 'active');
          updateLoadingUI(3, LOADING_STEPS_FREE);
          let completedCount = 0;
          const shots = window.storyboardData.shots;
          const total = shots.length;
          const retryQueue = []; // [{ index, prompt, shot }]

          // Initialize with placeholder images and empty arrays to preserve indices
          window.generatedImgs = Array(total).fill('../icon/error.jpg');
          window.generatedStoryTitles = Array(total).fill('');
          window.generatedStoryCams = Array(total).fill('');

          updateGenStep('step-structure', 'success');
          updateGenStep('step-prompt', 'active');
          updatePromptStepProgress(0, total);
          for (let i = 0; i < total; i++) {
              const shot = shots[i];
              window.generatedStoryTitles[i] = shot.story;
              window.generatedStoryCams[i] = shot.camera;

              try {
                  updateLoadingUI(3, LOADING_STEPS_FREE, completedCount, total);
                  const finalPrompt = await buildFinalPrompt(shot);
                  shot.finalPrompt = finalPrompt;
                  
                  const res = await askGemini(finalPrompt, 'image');
                  if (res?.image?.length > 0) {
                      window.generatedImgs[i] = res.image[0];
                      completedCount++;
                      updatePromptStepProgress(completedCount, total);
                  }
                  
                  const progress = 50 + (completedCount / total) * 45;
                  barEl.style.width = `${progress}%`;
                  pctEl.innerText = `${Math.floor(progress)}%`;
                  
                  if (i < total - 1) await delay(30000);
              } catch (err) {
                  console.error(`第 ${i+1} 張圖片生成失敗:`, err);
                  const is429 = err.status === 429 || 
                                (err.status === 500 && (
                                    String(err.details).includes('429') || 
                                    String(err.details).toLowerCase().includes('too many requests') ||
                                    String(err.details).toLowerCase().includes('resource has been exhausted') ||
                                    String(err.details).includes('RESOURCE_EXHAUSTED')
                                ));
                  
                  if (is429) {
                      console.warn(`偵測到 429 錯誤（頻率限制），已將第 ${i+1} 張圖片加入延遲重試佇列。`);
                      retryQueue.push({ index: i, prompt: shot.finalPrompt || '', shot: shot });
                  }
              }
          }

          // Process retry queue for 429 failures in freeform generation
          if (retryQueue.length > 0) {
              console.log(`🎬 開始重試生成自由格式佇列中的 ${retryQueue.length} 張失敗圖片...`);
              // Wait 20 seconds before starting retries to let rate limit window clear
              await delay(20000);
              
              for (let k = 0; k < retryQueue.length; k++) {
                  const item = retryQueue[k];
                  const i = item.index;
                  const finalPrompt = item.prompt;
                  
                  try {
                      console.log(`🔄 正在重新嘗試生成第 ${i + 1} 張圖片...`);
                      const res = await askGemini(finalPrompt, 'image');
                      
                      if (res?.image?.length > 0) {
                          window.generatedImgs[i] = res.image[0];
                          console.log(`✅ 第 ${i + 1} 張圖片重新生成成功並插入原位置！`);
                          completedCount++;
                          updatePromptStepProgress(completedCount, total);
                      }
                      
                      const progress = 50 + (completedCount / total) * 45;
                      barEl.style.width = `${Math.min(99, progress)}%`;
                      pctEl.innerText = `${Math.min(99, Math.floor(progress))}%`;
                      
                      if (k < retryQueue.length - 1) await delay(30000);
                  } catch (retryErr) {
                      console.error(`❌ 第 ${i + 1} 張圖片重新生成依然失敗:`, retryErr);
                  }
              }
          }

          updateGenStep('step-prompt', 'success');
          updateGenStep('step-render', 'active');
          updateLoadingUI(4, LOADING_STEPS_FREE);
          stopLoadingTicker();
          const titleEl = document.getElementById('loading-title');
          const subEl = document.getElementById('loading-sub');
          if (titleEl) titleEl.textContent = '正在沖洗底片並儲存至資料庫...請稍後 ✦';
          if (subEl) subEl.textContent = '正在備份到雲端，請勿關閉網頁';

          if (barEl) barEl.style.width = '95%';
          if (pctEl) pctEl.innerText = '95%';

          const projectId = await saveProjectToDatabase();

          if (barEl) barEl.style.width = '100%';
          if (pctEl) pctEl.innerText = '100%';
          if (titleEl) titleEl.textContent = '備份至雲端，分鏡建立完成！';
          if (subEl) subEl.textContent = '準備跳轉至分鏡檢視頁面';

          updateGenStep('step-render', 'success');
          setTimeout(() => {
              if (projectId && window.spaNavigate) {
                  window.spaNavigate('project', { id: projectId });
              } else {
                  renderResults();
                  onGenerateDone();
              }
          }, 800);

      } catch (e) {
          if (e.name === 'AbortError') {
              console.log('生成程序已被使用者手動打斷中斷。');
              return;
          }
          console.error(e);
          stopLoadingTicker();
          // 修正點 1：加上 await
          await alert('生成失敗：' + e.message); 
          showPhase('phase-compose');
      } finally {
          window.isGeneratingStoryboard = false;
          window.abortStoryboardGeneration = null;
          activeGenController = null;
      }
  }

  async function startTemplateGenerate() {
      activeGenController = new AbortController();
      window.isGeneratingStoryboard = true;
      window.abortStoryboardGeneration = () => {
          if (activeGenController) activeGenController.abort();
      };

      await performPageContentTransition(() => {
          showPhase('phase-generating');
      });
      const allSteps = ['step-analyze', 'step-structure', 'step-prompt', 'step-render'];
      allSteps.forEach(id => updateGenStep(id, 'pending'));

      updateGenStep('step-analyze', 'active');
      const barEl = document.getElementById('gen-progress');
      const pctEl = document.getElementById('gen-progress-text');

      window.generatedImgs = []; window.generatedStoryTitles = []; window.generatedStoryCams = []; window.generatedPrompts = [];

      try {
          updateLoadingUI(0, LOADING_STEPS_TPL);
          const tpl = state.selectedTemplate;
          const resolvedVars = state.resolvedVariables;

          updateGenStep('step-analyze', 'success');
          updateGenStep('step-structure', 'active');
          updateLoadingUI(1, LOADING_STEPS_TPL);
          const rawPrompts = tpl.promptTemplate.perShot.map(t => fillVariables(t, resolvedVars));
          window.generatedStoryTitles = tpl.structure.map(s => s.action);
          window.generatedStoryCams = tpl.structure.map(s => `${s.camera} · ${s.angle}`);

          updateLoadingUI(2, LOADING_STEPS_TPL);
          const styleDetail = STYLES[state.styleIndex].prompt;
          const styleName = STYLES[state.styleIndex].name;
          const basePrompt = fillVariables(tpl.promptTemplate.base, { ...resolvedVars, style: styleDetail });

          const optimizeReq = `你是一個專業的分鏡提示詞優化專家。請將使用者的短影音故事與所選模板的分鏡提示詞相結合，並以使用者輸入的故事為核心主體。

使用者輸入的故事：
"""${state.story}"""

模板基底風格：
"""${basePrompt}"""

模板原始分鏡提示詞（僅供結構、鏡頭參考，請根據使用者故事內容重寫與細化）：
${rawPrompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}

優化指導原則：
1. 必須以「使用者輸入的故事」內容作為主體，確保每一幕畫面展現故事的具體情節、人物動作與細節。
2. 保持模板原始分鏡的鏡頭感、視角與節奏（如特寫、空鏡、追隨鏡頭等）。
3. 融入自訂變數設定（${JSON.stringify(resolvedVars)}）。
4. 優化後的提示詞必須為英文，適合 Stable Diffusion 等圖像生成模型，多使用具體的視覺描述，避開抽象詞彙。
5. 保持分鏡間角色外觀、服裝與場景的一致性。

請嚴格按照以下格式回覆（每行以數字. 開頭，只輸出英文提示詞，不要有任何中文或解釋文字）：
${rawPrompts.map((_, i) => `${i + 1}. [Optimized English prompt for shot ${i + 1}]`).join('\n')}`;

          const optimizeRes = await askGemini(optimizeReq, 'story');
          window.generatedPrompts = parseNumberedList(optimizeRes.response);
          if (window.generatedPrompts.length < rawPrompts.length) window.generatedPrompts = rawPrompts;
          state.finalPrompts = window.generatedPrompts;

          updateGenStep('step-structure', 'success');
          updateGenStep('step-prompt', 'active');
          updatePromptStepProgress(0, total);
          updateLoadingUI(3, LOADING_STEPS_TPL);
          let completedCount = 0;
          const total = window.generatedPrompts.length;
          const retryQueue = []; // [{ index, prompt }]

          // Initialize with placeholder images
          window.generatedImgs = Array(total).fill('../icon/error.jpg');

          for (let i = 0; i < total; i++) {
              const prompt = window.generatedPrompts[i];
              try {
                  updateLoadingUI(3, LOADING_STEPS_TPL, completedCount, total);
                  
                  // Use English prompt directly without translation!
                  const imagePrompt = prompt + ', ' + styleDetail;
                  const res = await askGemini(imagePrompt, 'image');
                  
                  if (res?.image?.length > 0) {
                      window.generatedImgs[i] = res.image[0];
                      completedCount++;
                      updatePromptStepProgress(completedCount, total);
                  }
                  
                  const progress = 50 + (completedCount / total) * 45;
                  barEl.style.width = `${progress}%`;
                  pctEl.innerText = `${Math.floor(progress)}%`;
                  
                  if (i < total - 1) await delay(30000);
              } catch (err) {
                  console.error(`第 ${i+1} 張圖片生成失敗:`, err);
                  const is429 = err.status === 429 || 
                                (err.status === 500 && (
                                    String(err.details).includes('429') || 
                                    String(err.details).toLowerCase().includes('too many requests') ||
                                    String(err.details).toLowerCase().includes('resource has been exhausted') ||
                                    String(err.details).includes('RESOURCE_EXHAUSTED')
                                ));
                  
                  if (is429) {
                      console.warn(`偵測到 429 錯誤（頻率限制），已將第 ${i+1} 張圖片加入延遲重試佇列。`);
                      retryQueue.push({ index: i, prompt: prompt });
                  }
              }
          }

          // Process retry queue for 429 failures
          if (retryQueue.length > 0) {
              console.log(`🎬 開始重試生成佇列中的 ${retryQueue.length} 張失敗圖片...`);
              // Wait 20 seconds before starting retries to let rate limit window clear
              await delay(20000);
              
              for (let k = 0; k < retryQueue.length; k++) {
                  const item = retryQueue[k];
                  const i = item.index;
                  const prompt = item.prompt;
                  
                  try {
                      console.log(`🔄 正在重新嘗試生成第 ${i + 1} 張圖片...`);
                      const imagePrompt = prompt + ', ' + styleDetail;
                      const res = await askGemini(imagePrompt, 'image');
                      
                      if (res?.image?.length > 0) {
                          window.generatedImgs[i] = res.image[0];
                          console.log(`✅ 第 ${i + 1} 張圖片重新生成成功並插入原位置！`);
                          completedCount++;
                          updatePromptStepProgress(completedCount, total);
                      }
                      
                      const progress = 50 + (completedCount / total) * 45;
                      barEl.style.width = `${Math.min(99, progress)}%`;
                      pctEl.innerText = `${Math.min(99, Math.floor(progress))}%`;
                      
                      if (k < retryQueue.length - 1) await delay(30000);
                  } catch (retryErr) {
                      console.error(`❌ 第 ${i + 1} 張圖片重新生成依然失敗:`, retryErr);
                  }
              }
          }

          updateGenStep('step-prompt', 'success');
          updateGenStep('step-render', 'active');
          updateLoadingUI(4, LOADING_STEPS_TPL);
          stopLoadingTicker();
          const titleEl = document.getElementById('loading-title');
          const subEl = document.getElementById('loading-sub');
          if (titleEl) titleEl.textContent = '正在沖洗底片並儲存至資料庫...請稍後 ✦';
          if (subEl) subEl.textContent = '正在備份到雲端，請勿關閉網頁';

          if (barEl) barEl.style.width = '95%';
          if (pctEl) pctEl.innerText = '95%';

          const projectId = await saveProjectToDatabase();

          if (barEl) barEl.style.width = '100%';
          if (pctEl) pctEl.innerText = '100%';
          if (titleEl) titleEl.textContent = '備份至雲端，分鏡建立完成！';
          if (subEl) subEl.textContent = '準備跳轉至分鏡檢視頁面';

          updateGenStep('step-render', 'success');
          setTimeout(() => {
              if (projectId && window.spaNavigate) {
                  window.spaNavigate('project', { id: projectId });
              } else {
                  renderResults();
                  onGenerateDone();
              }
          }, 800);

      } catch (e) {
          if (e.name === 'AbortError') {
              console.log('生成程序已被使用者手動打斷中斷。');
              return;
          }
          console.error(e);
          stopLoadingTicker();
          // ✅ 修正點 2：加上 await
          await alert('生成失敗：' + e.message); 
          showPhase('phase-template');
      } finally {
          window.isGeneratingStoryboard = false;
          window.abortStoryboardGeneration = null;
          activeGenController = null;
      }
  }

  async function resolveVariablesFromStory(tpl) {
      const vars = tpl.variables;
      const styleName = STYLES[state.styleIndex].name;
      const prompt = `根據以下短影音故事描述，提取對應的變數值（繁體中文或英文皆可，以英文為佳，適合圖像生成）：

故事描述：
"${state.story}"

需要提取的變數：
${vars.map(v => `- ${v}: ${getVariableHint(v)}`).join('\n')}

風格偏好：${styleName}

請嚴格按照以下格式輸出（每行一個變數，格式：變數名稱: 值）：
${vars.map(v => `${v}: <值>`).join('\n')}

重要：只輸出變數清單，不要有其他說明文字。`;

      try {
          const res = await askGemini(prompt, 'flash');
          const text = res.response || '';
          const resolved = { style: STYLES[state.styleIndex].prompt };
          vars.forEach(v => {
              const m = text.match(new RegExp(`${v}:\\s*(.+)`, 'i'));
              resolved[v] = m ? m[1].trim().replace(/<[^>]+>/g, '').trim() : getVariableFallback(v);
          });
          return resolved;
      } catch (e) {
          const resolved = { style: STYLES[state.styleIndex].prompt };
          vars.forEach(v => { resolved[v] = getVariableFallback(v); });
          return resolved;
      }
  }

  function getVariableHint(varName) {
      const hints = { character: '主角描述', student: '學生外觀描述', scene: '場景描述', emotion: '主要情緒', style: '視覺風格', product: '產品或食物名稱' };
      return hints[varName] || '根據故事推斷';
  }

  function getVariableFallback(varName) {
      const fallbacks = { character: 'young Asian person, casual outfit', student: 'young college student, casual clothes', scene: 'busy street food market, Taiwan', emotion: 'excited and curious', style: STYLES[state.styleIndex].prompt, product: 'local street food dish' };
      return fallbacks[varName] || varName;
  }

  function fillVariables(template, vars) {
      return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || `[${key}]`);
  }

  function parseNumberedList(text) {
      if (!text) return [];
      return text.split('\n').map(l => l.trim()).filter(l => l.match(/^\d+[\.\:]/)).map(l => l.replace(/^\d+[\.\:]\s*/, '').trim());
  }

  function renderResults() {
      showPhase('phase-result');
      const container = document.getElementById('storyboard-grid');
      container.innerHTML = `
          <div class="view-control-bar" style="margin-bottom:24px;display:flex;justify-content:flex-end;">
              <div class="view-toggle-wrap">
                  <button class="view-btn active" id="vbtn-film" onclick="toggleResultView('film')">電影膠捲</button>
                  <button class="view-btn" id="vbtn-table" onclick="toggleResultView('table')">表格模式</button>
              </div>
          </div>
          <div id="view-film-content" class="result-view-part"></div>
          <div id="view-table-content" class="result-view-part" style="display:none;"></div>
      `;
      buildFilmView();
      buildTableView();
  }

  function toggleResultView(mode) {
      const fv = document.getElementById('view-film-content');
      const tv = document.getElementById('view-table-content');
      const fb = document.getElementById('vbtn-film');
      const tb = document.getElementById('vbtn-table');
      if (mode === 'film') {
          fv.style.display = 'block'; tv.style.display = 'none';
          fb.classList.add('active'); tb.classList.remove('active');
      } else {
          fv.style.display = 'none'; tv.style.display = 'block';
          tb.classList.add('active'); fb.classList.remove('active');
      }
  }

  function buildFilmView() {
      const target = document.getElementById('view-film-content');
      const ratioMap = { '16:9': 16 / 9, '橫向16:9': 16 / 9, '9:16': 9 / 16, '直向9:16': 9 / 16, '3:2': 3 / 2, '橫向3:2': 3 / 2, '2:3': 2 / 3, '直向2:3': 2 / 3, '1:1': 1 };
      const currentRatio = ratioMap[state.ratio] || 1;
      const baseHeight = 400;
      const frameWidth = baseHeight * currentRatio;

      const titles = window.generatedStoryTitles.length ? window.generatedStoryTitles : (window.storyboardData ? window.storyboardData.shots.map(s => s.story) : []);
      const cams = window.generatedStoryCams.length ? window.generatedStoryCams : (window.storyboardData ? window.storyboardData.shots.map(s => s.camera) : []);

      let html = `<div class="film-container" id="film-scroll-area"><div style="display:flex;">`;
      window.generatedImgs.forEach((img, i) => {
          html += `
              <div class="film-frame" style="width:${frameWidth}px;">
                  <div class="sprocket-row">
                      <div class="sprocket"></div><div class="sprocket"></div><div class="sprocket"></div>
                      <span style="margin-left:auto;color:#333;font-family:'DM Mono';font-size:9px;">FRAME_${String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <div class="frame-image-container" style="height:${baseHeight}px;">
                      <img src="${img}" style="width:100%;height:100%;object-fit:contain;">
                      <div class="frame-overlay">
                          <div class="overlay-story">${titles[i] || ''}</div>
                          <div class="overlay-camera">${cams[i] || ''}</div>
                      </div>
                  </div>
                  <div class="sprocket-row">
                      <div class="sprocket"></div><div class="sprocket"></div><div class="sprocket"></div>
                  </div>
              </div>`;
      });
      html += `</div></div>`;
      target.innerHTML = html;
      initDragScroll(document.getElementById('film-scroll-area'));
  }

  function buildTableView() {
      const target = document.getElementById('view-table-content');
      const titles = window.generatedStoryTitles.length ? window.generatedStoryTitles : (window.storyboardData ? window.storyboardData.shots.map(s => s.story) : []);
      const cams = window.generatedStoryCams.length ? window.generatedStoryCams : (window.storyboardData ? window.storyboardData.shots.map(s => s.camera) : []);

      let html = `<div class="table-view-wrap"><table><thead><tr><th style="width:60px;">#</th><th style="width:240px;">畫面回傳</th><th>腳本敘述 / 鏡頭語言</th></tr></thead><tbody>`;
      window.generatedImgs.forEach((img, i) => {
          html += `<tr><td style="font-family:'DM Mono';color:var(--text-muted);">${i + 1}</td><td><img src="${img}" style="width:100%;border-radius:4px;border:1px solid var(--border-warm);"></td><td><div style="font-weight:500;margin-bottom:8px;">${titles[i] || ''}</div><div style="font-family:'DM Mono';font-size:11px;color:var(--accent-gold);">${cams[i] || ''}</div></td></tr>`;
      });
      html += `</tbody></table></div>`;
      target.innerHTML = html;
  }

  async function saveProjectToDatabase() {
          console.log("ℹ️ 使用者未登入，跳過自動儲存分鏡至資料庫。");
          return;
      }

      try {
          console.log("⏳ 正在自動將產生的分鏡儲存至資料庫...");
          let title = '';
          if (state.useTemplate && state.selectedTemplate) {
              title = state.selectedTemplate.name;
          } else if (window.storyboardData?.meta?.title) {
              title = window.storyboardData.meta.title;
          } else {
              title = state.story.length > 25 ? state.story.slice(0, 25) + '...' : state.story;
          }

          const style = STYLES[state.styleIndex].name;
          const ratio = state.ratio;
          const cover = window.generatedImgs[0] || null;

          const metadata = state.useTemplate 
              ? { useTemplate: true, templateId: state.selectedTemplate?.id, resolvedVariables: state.resolvedVariables }
              : (window.storyboardData?.meta || {});

          const characters = state.useTemplate 
              ? {} 
              : (window.storyboardData?.characters || {});

          const shots = window.generatedImgs.map((img, i) => {
              let shotPrompt = '';
              let finalPrompt = '';
              let emotion = '';
              let duration = '3s';

              if (state.useTemplate && state.selectedTemplate) {
                  const tplShot = state.selectedTemplate.structure[i] || {};
                  shotPrompt = state.finalPrompts[i] || '';
                  finalPrompt = state.finalPrompts[i] || '';
                  emotion = tplShot.emotion || '';
                  duration = tplShot.duration || '3s';
              } else if (window.storyboardData && window.storyboardData.shots) {
                  const normalShot = window.storyboardData.shots[i] || {};
                  shotPrompt = normalShot.shotPrompt || normalShot.prompt || '';
                  finalPrompt = normalShot.finalPrompt || '';
                  emotion = normalShot.emotion || '';
                  duration = normalShot.duration || '3s';
              }

              return {
                  order: i + 1,
                  title: window.generatedStoryTitles[i] || '',
                  camera: window.generatedStoryCams[i] || '',
                  duration: duration,
                  payload: {
                      image: img,
                      emotion: emotion,
                      shotPrompt: shotPrompt,
                      finalPrompt: finalPrompt
                  }
              };
          });

          const token = window.spaAuth.getToken();
          const res = await fetch('/api/projects', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                  title,
                  style,
                  ratio,
                  cover,
                  metadata,
                  characters,
                  shots
              })
          });

          if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || '儲存分鏡失敗');
          }

          const result = await res.json();
          console.log("✅ 分鏡自動儲存資料庫成功，ID:", result.project?.id);
          
          if (result.project && typeof window.spaSeedProjectCache === 'function') {
              window.spaSeedProjectCache(result.project.id, result.project);
          }

          if (typeof window.clearSpaCache === 'function') {
              window.clearSpaCache();
          }
          return result.project?.id;
      } catch (error) {
          console.error("❌ 分鏡自動儲存至資料庫時出錯:", error);
          return null;
      }
  }

  function onGenerateDone() {
      const meta = document.getElementById('result-meta');
      const shotCount = window.generatedImgs.length;
      const styleName = STYLES[state.styleIndex].name;
      const ratio = state.ratio;
      let titlePart = '';
      if (state.useTemplate && state.selectedTemplate) {
          const tplName = state.selectedTemplate.name;
          titlePart = tplName.length > 16 ? tplName.slice(0, 16) + '…' : tplName;
      } else if (window.storyboardData?.meta?.title) {
          titlePart = window.storyboardData.meta.title;
      } else {
          titlePart = state.story.length > 20 ? state.story.slice(0, 20) + '…' : state.story;
      }
      if (meta) meta.textContent = `${titlePart} · ${shotCount} 鏡 · ${styleName} · ${ratio}`;

      const badge = document.getElementById('result-template-badge');
      if (badge) {
          if (state.useTemplate && state.selectedTemplate) {
              badge.style.display = 'flex';
              document.getElementById('badge-template-name').textContent = state.selectedTemplate.name;
              const vars = Object.entries(state.resolvedVariables).filter(([k]) => k !== 'style').map(([k, v]) => `${k}: ${String(v).slice(0, 20)}`).join(' · ');
              document.getElementById('badge-vars').textContent = vars;
          } else {
              badge.style.display = 'none';
          }
      }

  }

  function initDragScroll(el) {
      let isDown = false, startX, startY, scrollLeft, scrollTop;
      const getPos = e => { const t = e.touches ? e.touches[0] : e; return { x: t.pageX, y: t.pageY }; };
      const start = e => {
          isDown = true; el.style.cursor = 'grabbing'; el.style.scrollBehavior = 'auto';
          const pos = getPos(e);
          if (el.classList.contains('mobile')) { startY = pos.y - el.offsetTop; scrollTop = el.scrollTop; }
          else { startX = pos.x - el.offsetLeft; scrollLeft = el.scrollLeft; }
      };
      const end = () => { isDown = false; el.style.cursor = 'grab'; };
      const move = e => {
          if (!isDown) return;
          const pos = getPos(e);
          if (el.classList.contains('mobile')) el.scrollTop = scrollTop - (pos.y - el.offsetTop - startY) * 2;
          else el.scrollLeft = scrollLeft - (pos.x - el.offsetLeft - startX) * 2;
      };
      el.addEventListener('mousedown', start);
      el.addEventListener('touchstart', start, { passive: true });
      el.addEventListener('mouseleave', end);
      el.addEventListener('mouseup', end);
      el.addEventListener('touchend', end);
      el.addEventListener('mousemove', e => { if (isDown) e.preventDefault(); move(e); });
      el.addEventListener('touchmove', move, { passive: true });
  }

  function exportStoryboardJson() {
      const exportData = state.useTemplate ? { metadata: {}, frames: [] } : { metadata: {}, shots: [] };
      const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Storyboard_${Date.now()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
  }

  function safeParseJson(text) {
      try {
          const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const jsonStart = cleaned.indexOf('{');
          const jsonEnd = cleaned.lastIndexOf('}');
          if (jsonStart === -1 || jsonEnd === -1) throw new Error('找不到 JSON');
          return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      } catch (e) {
          return null;
      }
  }

  function validateStoryboard(data) { return true; }
  function normalizeStoryboard(data) { return data; }
  async function askGemini(question, type) {
      const res = await fetch('/api/ask-gemini', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ question, type, ratio: state.ratio }) 
      });
      const data = await res.json();
      if (!res.ok) {
          const err = new Error(data.error || '請求失敗');
          err.status = res.status;
          err.details = data.details || '';
          err.data = data;
          throw err;
      }
      return data;
  }
  function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function adjustHeight() {
      if (!storyInput) return; // 安全檢查
      if (storyInput.style.height <= storyInput.scrollHeight) {
          storyInput.style.height = '79px';
          inputArea.style.height = '119px';
      } else {
          storyInput.style.height = 'auto';
          storyInput.style.height = Math.min(storyInput.scrollHeight, 686) + 'px';
          inputArea.style.height = Math.min(storyInput.scrollHeight + 40, 726) + 'px';
      }
  }

  function resetHeight() {
      if (!storyInput || !inputArea) return; // 安全檢查
      storyInput.style.height = '127px';
      inputArea.style.height = '127px';
  }

  document.addEventListener('DOMContentLoaded', () => {
      const ta = document.getElementById('story-input');
      if (ta) {
          ta.addEventListener('keydown', e => {
              if (e.key === 'Enter' && !e.shiftKey && !ta.classList.contains('locked')) {
                  e.preventDefault(); submitStory(); ta.blur();
              }
          });
          ta.addEventListener('input', () => { resetHeight(); adjustHeight(); });
      }
  });

  function initGeneratePage() {
      // 1. 每次進頁面，重新抓取當前最新的 DOM 節點
      storyInput = document.getElementById('story-input');
      inputArea = document.getElementById('compose-input-area');

      // 2. 重新為新節點綁定監聽器（因為舊的已經隨 DOM 銷毀了）
      if (storyInput) {
          storyInput.addEventListener('keydown', e => {
              if (e.key === 'Enter' && !e.shiftKey && !storyInput.classList.contains('locked')) {
                  e.preventDefault();
                  submitStory();
                  storyInput.blur();
              }
          });
          storyInput.addEventListener('input', () => { resetHeight(); adjustHeight(); });
      }

      // 3. 重設頁面狀態與載入模板
      resetAll();

      // 4. 重新初始化數學曲線載入器（處理 SPA 頁面切換腳本快取）
      if (typeof window.initMathCurveLoader === 'function') {
          window.initMathCurveLoader();
      }
   }

  function updateComposeButtonText() {
      const genBtn = document.querySelector('.options-gen-btn');
      if (!genBtn) return;
      if (state.selectedTemplate) {
          genBtn.textContent = '✦ 下一步 (自訂變數)';
      } else {
          genBtn.textContent = '✦ 選擇模板';
      }
  }

  function updatePreselectedTemplateUI() {
      const banner = document.getElementById('template-preselect-banner');
      const nameSpan = document.getElementById('preselected-template-name');
      const skipBtn = document.querySelector('.options-skip-btn');
      
      if (state.selectedTemplate) {
          if (banner) banner.style.display = 'flex';
          if (nameSpan) nameSpan.textContent = state.selectedTemplate.name;
          if (skipBtn) skipBtn.style.display = 'none';
          state.useTemplate = true;
      } else {
          if (banner) banner.style.display = 'none';
          if (skipBtn) skipBtn.style.display = '';
          state.useTemplate = false;
      }
      updateComposeButtonText();
  }

  function clearSelectedTemplate() {
      state.selectedTemplate = null;
      window.preselectedTemplateId = null;
      updatePreselectedTemplateUI();
  }

  async function enterVariablesPhase() {
      showPhase('phase-variables');
      
      const loader = document.getElementById('variables-loading-container');
      const formContainer = document.getElementById('variables-form-container');
      const footer = document.getElementById('variables-footer');
      const form = document.getElementById('variables-form');

      if (!loader || !formContainer || !footer || !form) {
          console.warn('⚠️ 偵測到瀏覽器快取舊版 HTML 結構，正在強制清理快取並重載頁面...');
          for (let i = localStorage.length - 1; i >= 0; i--) {
              const key = localStorage.key(i);
              if (key && key.startsWith('spa_page_cache_')) {
                  localStorage.removeItem(key);
              }
          }
          window.location.reload();
          return;
      }

      loader.style.display = 'flex';
      if (typeof window.initMathCurveLoader === 'function') {
          window.initMathCurveLoader();
      }
      formContainer.style.display = 'none';
      footer.style.display = 'none';
      form.innerHTML = '';

      try {
          const tpl = state.selectedTemplate;
          const resolvedVars = await resolveVariablesFromStory(tpl);
          state.resolvedVariables = resolvedVars;

          const vars = tpl.variables || [];
          vars.forEach(v => {
              const value = resolvedVars[v] || '';
              const hint = getVariableHint(v);
              
              const group = document.createElement('div');
              group.className = 'var-input-group';
              group.innerHTML = `
                  <label class="var-label">${v} <span class="hint">(${hint})</span></label>
                  <input type="text" class="var-input" data-var="${v}" value="${value.replace(/"/g, '&quot;')}">
              `;
              form.appendChild(group);
          });

          loader.style.display = 'none';
          formContainer.style.display = 'block';
          footer.style.display = 'flex';
      } catch (err) {
          console.error(err);
          alert('分析變數失敗：' + err.message);
          backToTemplateOrCompose();
      }
  }

  function confirmVariablesAndGenerate() {
      const inputs = document.querySelectorAll('.var-input');
      const resolved = { style: STYLES[state.styleIndex].prompt };
      
      inputs.forEach(input => {
          const v = input.dataset.var;
          resolved[v] = input.value.trim();
      });

      state.resolvedVariables = resolved;
      startTemplateGenerate();
  }

  function backToTemplateOrCompose() {
      if (window.preselectedTemplateId) {
          showPhase('phase-compose');
      } else {
          showPhase('phase-template');
      }
  }

  window.initGeneratePage = initGeneratePage;
  window.fillSugg = fillSugg;
  window.submitStory = submitStory;
  window.selectRatioOpt = selectRatioOpt;
  window.resetCompose = resetCompose;
  window.resetAll = resetAll;
  window.proceedToTemplate = proceedToTemplate;
  window.backToCompose = backToCompose;
  window.openPreview = openPreview;
  window.closePreview = closePreview;
  window.applyTemplateAndGenerate = applyTemplateAndGenerate;
  window.toggleResultView = toggleResultView;
  window.exportStoryboardJson = exportStoryboardJson;
  window.showAllStyles = showAllStyles;
  window.onStoryInput = onStoryInput;
  window.startGenerate = startGenerate;
  window.clearSelectedTemplate = clearSelectedTemplate;
  window.backToTemplateOrCompose = backToTemplateOrCompose;
  window.confirmVariablesAndGenerate = confirmVariablesAndGenerate;

})();