(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════
  // 1. Creation Session Store & Decoupled State Architecture
  // ════════════════════════════════════════════════════════════
  const CreationSessionStore = {
      entryMode: 'full', // 'quick' | 'full'
      story: '',
      styleIndex: 0,
      ratio: '橫向16:9',
      selectedTemplate: null,
      currentPhase: 1,
      generationStatus: 'idle', // 'idle' | 'generating' | 'completed' | 'error'
      resolvedVariables: {},
      finalPrompts: [],
      storyboardData: null,
      error: null,
      draft: {
          story: '',
          styleIndex: 0,
          ratio: '橫向16:9',
          selectedTemplate: null
      }
  };
  window.CreationSessionStore = CreationSessionStore;

  const STYLES = [
      { name: '預設風格', dot: '#7fba7a', desc: '自然清新', gradient: 'linear-gradient(135deg, #a8ff78, #78ffd6)', icon: '🍃', prompt: "natural lighting, high resolution, clean composition, soft focus background" },
      { name: '電影風格', dot: '#2a2a3a', desc: '戲劇光影', gradient: 'linear-gradient(135deg, #232526, #414345)', icon: '🎬', prompt: "anamorphic lens, cinematic lighting, 8k resolution, deep shadows, professional color grading, film noir vibes" },
      { name: '二次元風格', dot: '#ffc5e8', desc: '熱門手遊感', gradient: 'linear-gradient(135deg, #ff9a9e, #fecfef)', icon: '✨', prompt: "mihoyo style, genshin impact aesthetic, cel-shaded, vibrant anime colors, expressive lighting, high-quality 3D render look" },
      { name: 'Cyberpunk風格', dot: '#6200ea', desc: '霓虹未來', gradient: 'linear-gradient(135deg, #654ea3, #eaafc8)', icon: '⚡', prompt: "neon palette, high contrast, futuristic street, rain-slicked pavement, volumetric fog, cyberpunk 2077 aesthetic" },
      { name: '美式寫實風格', dot: '#c49a2a', desc: '溫暖金調', gradient: 'linear-gradient(135deg, #f7971e, #ffd200)', icon: '🌅', prompt: "professional photography, golden hour, sun-drenched, shallow depth of field, sharp details, Kodak Portra 400 look" },
      { name: '90s 復古風格', dot: '#f44336', desc: '懷舊膠卷', gradient: 'linear-gradient(135deg, #cb2d3e, #ef473a)', icon: '📼', prompt: "90s VHS aesthetic, vintage film grain, light leaks, chromatic aberration, retro colors, nostalgic atmosphere" },
      { name: '水彩插畫風格', dot: '#b8d4ff', desc: '柔和藝術', gradient: 'linear-gradient(135deg, #89f7fe, #66a6ff)', icon: '🎨', prompt: "delicate watercolor painting, ink wash, dreamy atmosphere, paper texture, hand-drawn illustration" },
      { name: '極簡室內風格', dot: '#eceff1', desc: '侘寂高級感', gradient: 'linear-gradient(135deg, #e0eafc, #cfdef3)', icon: '🏛️', prompt: "minimalist aesthetic, soft natural light, Wabi-sabi style, high-end interior design photography, neutral tones" }
  ];
  window.GEN_STYLES = STYLES;

  const AI_RESPONSE_TEMPLATES = [
      s => `為「${s}」鎖定最佳敘事視覺：建議以寫實生活感搭配黃金視角，引導情緒轉折。`,
      s => `這是一段極具吸引力的創作！為「${s}」量身推薦高張力視覺調性與電影感畫幅。`,
      s => `「${s}」非常適合短影音節奏傳播，已規劃開場吸睛 HOOK 與轉場視覺。`,
      s => `針對「${s}」的核心元素，建議強化光影對比與人物情感共鳴。`
  ];

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

  let TEMPLATES = [];
  let isTransitioningPhase = false;
  let activeGenController = null;
  let typewriterTimer = null;

  // ════════════════════════════════════════════════════════════
  // 2. Persistent Creation Surface Phase Transition Engine
  // ════════════════════════════════════════════════════════════
  async function switchPhase(targetPhase, animate = true) {
      if (isTransitioningPhase) return;
      const currentPhase = CreationSessionStore.currentPhase || 1;
      if (animate && targetPhase === currentPhase && document.getElementById(`phase-panel-${targetPhase}`)?.classList.contains('active')) {
          return;
      }

      const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const shouldAnimate = animate && !isReducedMotion;

      isTransitioningPhase = true;
      CreationSessionStore.currentPhase = targetPhase;

      const surface = document.getElementById('creation-surface');
      if (surface) {
          surface.setAttribute('data-phase', String(targetPhase));
      }

      // 1. Update Top Bar Nav
      updateTopNav(targetPhase);

      // 2. Update Persistent Story Context Header
      updateContextHeader(targetPhase);

      // 3. Morph between panels
      const currentPanel = document.getElementById(`phase-panel-${currentPhase}`);
      const nextPanel = document.getElementById(`phase-panel-${targetPhase}`);

      if (shouldAnimate && currentPanel && nextPanel && currentPanel !== nextPanel) {
          // Outgoing panel collapse / fade
          currentPanel.classList.add('phase-leaving');
          currentPanel.style.transition = 'opacity 220ms ease, transform 220ms ease';
          currentPanel.style.opacity = '0';
          currentPanel.style.transform = 'translateY(-12px)';

          await new Promise(r => setTimeout(r, 220));

          currentPanel.classList.remove('active', 'phase-leaving');
          currentPanel.style.display = 'none';
          currentPanel.style.opacity = '';
          currentPanel.style.transform = '';

          // Incoming panel reveal
          nextPanel.style.display = 'flex';
          nextPanel.classList.add('phase-entering');
          nextPanel.style.opacity = '0';
          nextPanel.style.transform = 'translateY(16px)';
          void nextPanel.offsetHeight; // reflow

          nextPanel.classList.add('active');
          nextPanel.style.transition = 'opacity 340ms cubic-bezier(0.16, 1, 0.3, 1), transform 340ms cubic-bezier(0.16, 1, 0.3, 1)';
          nextPanel.style.opacity = '1';
          nextPanel.style.transform = 'translateY(0)';

          setTimeout(() => {
              nextPanel.classList.remove('phase-entering');
              nextPanel.style.transition = '';
              nextPanel.style.opacity = '';
              nextPanel.style.transform = '';
              isTransitioningPhase = false;
          }, 360);
      } else {
          document.querySelectorAll('.phase-panel').forEach(p => {
              p.classList.remove('active');
              p.style.display = 'none';
          });
          if (nextPanel) {
              nextPanel.style.display = 'flex';
              nextPanel.classList.add('active');
          }
          isTransitioningPhase = false;
      }

      // 4. Initialize target phase features
      initPhaseFeatures(targetPhase);
  }
  window.switchPhase = switchPhase;

  function initPhaseFeatures(targetPhase) {
      if (targetPhase === 1) {
          const input = document.getElementById('story-input');
          if (input) {
              if (CreationSessionStore.story && !input.value) {
                  input.value = CreationSessionStore.story;
              }
              onStoryInput();
              setTimeout(() => input.focus(), 150);
          }
      } else if (targetPhase === 2) {
          buildStyleCards();
          syncRatioChips();
          triggerDirectionAiText();
      } else if (targetPhase === 3) {
          ensureTemplatesLoaded().then(() => {
              renderTemplateBrowser();
          });
      } else if (targetPhase === 4) {
          startGenerationWorkflow();
      }
  }

  function updateTopNav(phase) {
      const steps = [1, 2, 3, 4];
      steps.forEach(p => {
          const navEl = document.getElementById(`step-nav-${p}`);
          if (navEl) {
              navEl.classList.toggle('active', p === phase);
              navEl.classList.toggle('completed', p < phase);
          }
      });
      const badge = document.getElementById('phase-count-badge');
      if (badge) {
          badge.textContent = `${phase} / 4`;
      }
  }

  function updateContextHeader(phase) {
      const header = document.getElementById('story-context-header');
      const storyPill = document.getElementById('context-story-pill');
      const storyText = document.getElementById('context-story-text');
      const metaPill = document.getElementById('context-meta-pill');
      const metaText = document.getElementById('context-meta-text');
      const tplPill = document.getElementById('context-template-pill');
      const tplText = document.getElementById('context-template-text');

      if (!header) return;

      if (phase === 1) {
          header.style.display = 'none';
          header.classList.remove('active');
          return;
      }

      header.style.display = 'flex';
      header.classList.add('active');

      // Story Text
      if (storyText) {
          const s = CreationSessionStore.story || '';
          storyText.textContent = s.length > 32 ? s.slice(0, 32) + '…' : s;
      }

      // Meta (Style + Ratio) from Phase 3 onwards
      if (phase >= 3) {
          if (metaPill) metaPill.style.display = 'inline-flex';
          if (metaText) {
              const st = STYLES[CreationSessionStore.styleIndex] || STYLES[0];
              const r = (CreationSessionStore.ratio || '16:9').replace('橫向', '').replace('直向', '');
              metaText.textContent = `${st.name} · ${r}`;
          }
      } else {
          if (metaPill) metaPill.style.display = 'none';
      }

      // Template from Phase 4 onwards
      if (phase >= 4) {
          if (tplPill) tplPill.style.display = 'inline-flex';
          if (tplText) {
              tplText.textContent = CreationSessionStore.selectedTemplate 
                  ? CreationSessionStore.selectedTemplate.name 
                  : '自由結構';
          }
      } else {
          if (tplPill) tplPill.style.display = 'none';
      }
  }

  function editStoryFromHeader() {
      switchPhase(1);
  }
  window.editStoryFromHeader = editStoryFromHeader;

  // ════════════════════════════════════════════════════════════
  // 3. Phase 1 — Idea
  // ════════════════════════════════════════════════════════════
  function onStoryInput() {
      const input = document.getElementById('story-input');
      const btn = document.getElementById('composer-submit-btn');
      if (!input || !btn) return;

      const val = input.value.trim();
      const hasVal = val.length > 0;
      btn.disabled = !hasVal;
      btn.setAttribute('data-active', hasVal ? 'true' : 'false');
      CreationSessionStore.draft.story = input.value;
  }
  window.onStoryInput = onStoryInput;

  function fillPhase1Sugg(chip) {
      if (!chip) return;
      const text = chip.textContent.trim();
      const input = document.getElementById('story-input');
      if (input) {
          input.value = text;
          onStoryInput();
          input.focus();
      }
  }
  window.fillPhase1Sugg = fillPhase1Sugg;

  function submitPhase1Story() {
      const input = document.getElementById('story-input');
      const story = (input ? input.value.trim() : '') || CreationSessionStore.draft.story;
      if (!story) return;

      CreationSessionStore.story = story;
      CreationSessionStore.draft.story = story;
      switchPhase(2);
  }
  window.submitPhase1Story = submitPhase1Story;

  // ════════════════════════════════════════════════════════════
  // 4. Phase 2 — Creative Direction
  // ════════════════════════════════════════════════════════════
  function triggerDirectionAiText() {
      const textEl = document.getElementById('direction-ai-text');
      const cursorEl = document.getElementById('direction-ai-cursor');
      if (!textEl) return;

      if (typewriterTimer) {
          clearTimeout(typewriterTimer);
          typewriterTimer = null;
      }

      const short = CreationSessionStore.story.length > 20 
          ? CreationSessionStore.story.slice(0, 20) + '…' 
          : CreationSessionStore.story;
      const templateFn = AI_RESPONSE_TEMPLATES[Math.floor(Math.random() * AI_RESPONSE_TEMPLATES.length)];
      const targetText = templateFn(short);

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          textEl.textContent = targetText;
          if (cursorEl) cursorEl.style.display = 'none';
          return;
      }

      textEl.textContent = '';
      if (cursorEl) {
          cursorEl.style.display = 'inline';
          cursorEl.style.opacity = '1';
      }

      let i = 0;
      const tick = () => {
          if (i < targetText.length) {
              textEl.textContent += targetText[i++];
              typewriterTimer = setTimeout(tick, 22 + Math.random() * 15);
          } else {
              typewriterTimer = setTimeout(() => {
                  if (cursorEl) cursorEl.style.opacity = '0';
              }, 600);
          }
      };
      tick();
  }

  function detectRecommendedStyles(story) {
      const lower = (story || '').toLowerCase();
      for (const rule of STYLE_KEYWORD_MAP) {
          if (rule.keywords.some(kw => lower.includes(kw))) {
              return rule.styles;
          }
      }
      return [0];
  }

  function buildStyleCards() {
      const grid = document.getElementById('style-cards-grid');
      if (!grid) return;
      grid.innerHTML = '';

      const recs = detectRecommendedStyles(CreationSessionStore.story);
      if (CreationSessionStore.styleIndex === undefined) {
          CreationSessionStore.styleIndex = recs[0];
      }

      STYLES.forEach((s, idx) => {
          const isRec = recs.includes(idx);
          const isSelected = idx === CreationSessionStore.styleIndex;

          const card = document.createElement('div');
          card.className = `style-card ${isSelected ? 'active' : ''} ${isRec ? 'is-recommended' : ''}`;
          card.dataset.index = idx;
          card.innerHTML = `
              <div class="style-card-thumb" style="background: ${s.gradient};">
                  <span class="style-card-icon">${s.icon}</span>
                  ${isRec ? '<span class="style-card-rec-pill">✦ AI 推薦</span>' : ''}
                  <span class="style-card-check">✓</span>
              </div>
              <div class="style-card-info">
                  <div class="style-card-name">${s.name}</div>
                  <div class="style-card-desc">${s.desc}</div>
              </div>
          `;
          card.onclick = () => selectStyleCard(idx);
          grid.appendChild(card);
      });
  }

  function selectStyleCard(index) {
      CreationSessionStore.styleIndex = index;
      document.querySelectorAll('.style-card').forEach(c => {
          const isTarget = Number(c.dataset.index) === index;
          c.classList.toggle('active', isTarget);
      });
  }

  function syncRatioChips() {
      const ratio = CreationSessionStore.ratio || '橫向16:9';
      document.querySelectorAll('.ratio-chip').forEach(c => {
          c.classList.toggle('active', c.dataset.ratio === ratio);
      });
  }

  function selectRatioOption(btn) {
      if (!btn) return;
      const ratio = btn.dataset.ratio;
      CreationSessionStore.ratio = ratio;
      document.querySelectorAll('.ratio-chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
  }
  window.selectRatioOption = selectRatioOption;

  function confirmDirectionAndAdvance() {
      switchPhase(3);
  }
  window.confirmDirectionAndAdvance = confirmDirectionAndAdvance;

  // ════════════════════════════════════════════════════════════
  // 5. Phase 3 — Template Browser
  // ════════════════════════════════════════════════════════════
  async function ensureTemplatesLoaded() {
      if (TEMPLATES && TEMPLATES.length > 0) return TEMPLATES;
      try {
          const res = await fetch('/api/get-templates');
          if (res.ok) {
              TEMPLATES = await res.json();
          }
      } catch (err) {
          console.error("Failed to load templates:", err);
          TEMPLATES = [];
      }
      return TEMPLATES;
  }

  const CAT_MAP = {
      'product': '商品焦點',
      'story': '品牌故事',
      'twist': '反轉爆點',
      'custom': '自訂模板',
      '未分類': '未分類'
  };

  function renderTemplateBrowser() {
      const catsEl = document.getElementById('template-category-chips');
      const containerEl = document.getElementById('template-cards-container');
      const confirmBtn = document.getElementById('btn-template-confirm');
      if (!containerEl) return;

      const groups = { '全部': TEMPLATES };
      TEMPLATES.forEach(t => {
          const dbCat = t.category || '未分類';
          const k = CAT_MAP[dbCat] || dbCat;
          if (!groups[k]) groups[k] = [];
          groups[k].push(t);
      });

      const categories = ['全部', ...Object.keys(groups).filter(k => k !== '全部')];

      // Render Categories
      if (catsEl) {
          catsEl.innerHTML = categories.map((c, i) => `
              <button type="button" class="tpl-cat-chip ${i === 0 ? 'active' : ''}" data-cat="${c}">
                  ${c} <span class="count">(${groups[c].length})</span>
              </button>
          `).join('');

          catsEl.querySelectorAll('.tpl-cat-chip').forEach(btn => {
              btn.onclick = () => {
                  catsEl.querySelectorAll('.tpl-cat-chip').forEach(x => x.classList.remove('active'));
                  btn.classList.add('active');
                  renderFilteredTemplates(groups[btn.dataset.cat] || []);
              };
          });
      }

      renderFilteredTemplates(TEMPLATES);
  }

  function renderFilteredTemplates(templates) {
      const containerEl = document.getElementById('template-cards-container');
      const confirmBtn = document.getElementById('btn-template-confirm');
      if (!containerEl) return;

      containerEl.innerHTML = '';
      if (templates.length === 0) {
          containerEl.innerHTML = '<div class="tpl-empty-hint">此分類下目前無可用模板</div>';
          return;
      }

      templates.forEach(tpl => {
          const isSelected = CreationSessionStore.selectedTemplate?.id === tpl.id;
          const card = document.createElement('div');
          card.className = `tpl-browser-card ${isSelected ? 'selected' : ''}`;
          card.id = `tpl-card-${tpl.id}`;
          card.innerHTML = `
              <div class="tpl-card-thumb">
                  ${tpl.thumbnail ? `<img src="${tpl.thumbnail}" alt="${tpl.name}">` : '<div class="tpl-placeholder-icon">🎬</div>'}
                  <span class="tpl-shot-badge">${tpl.shotsCount || (tpl.structure ? tpl.structure.length : 4)} 鏡頭</span>
                  <span class="tpl-check-badge">✓</span>
              </div>
              <div class="tpl-card-content">
                  <h4 class="tpl-card-title">${tpl.name}</h4>
                  <p class="tpl-card-desc">${tpl.description || '精準結構爆點範本'}</p>
                  <div class="tpl-card-tags">
                      <span class="tpl-cat-tag">${CAT_MAP[tpl.category] || tpl.category || '未分類'}</span>
                      ${tpl.narrative?.tone ? `<span class="tpl-tone-tag">${tpl.narrative.tone}</span>` : ''}
                  </div>
              </div>
          `;
          card.onclick = () => selectTemplateCard(tpl);
          containerEl.appendChild(card);
      });

      if (confirmBtn) {
          confirmBtn.disabled = !CreationSessionStore.selectedTemplate;
      }
  }

  function selectTemplateCard(tpl) {
      CreationSessionStore.selectedTemplate = tpl;
      document.querySelectorAll('.tpl-browser-card').forEach(c => {
          c.classList.toggle('selected', c.id === `tpl-card-${tpl.id}`);
      });
      const confirmBtn = document.getElementById('btn-template-confirm');
      if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = `✦ 套用「${tpl.name}」並開始生成 →`;
      }
  }

  function skipTemplateAndGenerate() {
      CreationSessionStore.selectedTemplate = null;
      switchPhase(4);
  }
  window.skipTemplateAndGenerate = skipTemplateAndGenerate;

  function applySelectedTemplateAndGenerate() {
      switchPhase(4);
  }
  window.applySelectedTemplateAndGenerate = applySelectedTemplateAndGenerate;

  // ════════════════════════════════════════════════════════════
  // 6. Phase 4 — AI Generation Engine
  // ════════════════════════════════════════════════════════════
  const LOADING_STEPS_FREE = [
      { pct: 0, msg: '正在分析故事語意與敘事動機... ✦' },
      { pct: 20, msg: '正在編排最佳鏡位與時間軸節奏... 🎬' },
      { pct: 50, msg: '正在為每個鏡頭注入視覺風格與調性... 🖌️' },
      { pct: 85, msg: '正在沖洗底片並渲染分鏡畫面... 🎨' },
      { pct: 100, msg: '精彩分鏡已就緒！🎉' }
  ];

  function updateGenProgress(pct, statusText, activeStepId) {
      const barEl = document.getElementById('gen-progress-fill');
      const pctEl = document.getElementById('gen-status-pct');
      const statusEl = document.getElementById('gen-status-text');

      if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
      if (statusEl && statusText) statusEl.textContent = statusText;

      if (activeStepId) {
          const steps = ['step-analyze', 'step-structure', 'step-prompt', 'step-render'];
          const targetIdx = steps.indexOf(activeStepId);
          steps.forEach((sId, idx) => {
              const el = document.getElementById(sId);
              if (!el) return;
              if (idx < targetIdx) el.dataset.status = 'success';
              else if (idx === targetIdx) el.dataset.status = 'active';
              else el.dataset.status = 'pending';
          });
      }

      if (typeof window.updateGlobalPillProgress === 'function') {
          window.updateGlobalPillProgress(pct, pct < 100);
      }
  }

  function getStoryboardPrompt() {
      const styleDetail = STYLES[CreationSessionStore.styleIndex].prompt;
      return `你是一個專業的短影音分鏡設計系統。
請分析使用者的故事描述，並為其設計一個包含分鏡鏡頭與角色設定的完整分鏡腳本。

使用者故事："""${CreationSessionStore.story}"""
影片風格：${STYLES[CreationSessionStore.styleIndex].name} (${styleDetail})

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
      }[CreationSessionStore.ratio] || 'composition';
  }

  async function buildFinalPrompt(shot) {
      const styleDetail = STYLES[CreationSessionStore.styleIndex].prompt;
      const rPrompt = getRatioPrompt();
      const characterData = (shot.characters || [])
          .map(id => window.storyboardData?.characters?.[id])
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

  async function startGenerationWorkflow() {
      if (!CreationSessionStore.story) return;

      activeGenController = new AbortController();
      window.isGeneratingStoryboard = true;

      // Show Progress View, hide Result View
      const progressWrap = document.getElementById('generation-progress-wrap');
      const resultWrap = document.getElementById('generation-result-wrap');
      if (progressWrap) progressWrap.style.display = 'flex';
      if (resultWrap) resultWrap.style.display = 'none';

      updateGenProgress(5, '解析故事靈感與結構...', 'step-analyze');

      window.generatedImgs = [];
      window.generatedStoryTitles = [];
      window.generatedStoryCams = [];
      window.generatedPrompts = [];

      try {
          if (CreationSessionStore.selectedTemplate) {
              await runTemplateGeneration();
          } else {
              await runFreeformGeneration();
          }
      } catch (err) {
          if (err.name === 'AbortError') {
              console.log("Generation aborted by user");
              return;
          }
          console.error("Generation error:", err);
          updateGenProgress(0, '生成發生錯誤，請重試', null);
          alert('生成發生異常：' + (err.message || '請稍後再試'));
          switchPhase(2);
      } finally {
          window.isGeneratingStoryboard = false;
          activeGenController = null;
      }
  }

  async function runFreeformGeneration() {
      const prompt = getStoryboardPrompt();
      const storyboardRes = await askGemini(prompt, 'story');
      window.storyboardData = safeParseJson(storyboardRes.response);
      if (!window.storyboardData) throw new Error('無法解析故事結構 JSON');

      updateGenProgress(30, '編排鏡頭敘事結構與視角...', 'step-structure');
      await delay(600);

      const shots = window.storyboardData.shots || [];
      const total = shots.length;
      window.generatedImgs = Array(total).fill('../icon/error.jpg');
      window.generatedStoryTitles = Array(total).fill('');
      window.generatedStoryCams = Array(total).fill('');

      updateGenProgress(50, '繪製分鏡草稿提示詞...', 'step-prompt');

      let completedCount = 0;
      for (let i = 0; i < total; i++) {
          const shot = shots[i];
          window.generatedStoryTitles[i] = shot.story;
          window.generatedStoryCams[i] = shot.camera;

          const finalPrompt = await buildFinalPrompt(shot);
          shot.finalPrompt = finalPrompt;

          try {
              const res = await askGemini(finalPrompt, 'image');
              if (res?.image?.length > 0) {
                  window.generatedImgs[i] = res.image[0];
                  completedCount++;
              }
          } catch (e) {
              console.error(`Image generation failed for shot ${i + 1}`, e);
          }

          const progress = 50 + (completedCount / total) * 42;
          updateGenProgress(progress, `正在沖洗第 ${i + 1} / ${total} 張分鏡底片...`, 'step-render');
          if (i < total - 1) await delay(800);
      }

      updateGenProgress(95, '正在將分鏡儲存至資料庫...', 'step-render');
      await saveProjectToDatabase();

      updateGenProgress(100, '分鏡草稿沖洗完成！', 'step-render');
      await delay(500);

      renderResults();
  }

  async function runTemplateGeneration() {
      const tpl = CreationSessionStore.selectedTemplate;
      const total = tpl.shotsCount || (tpl.structure ? tpl.structure.length : 4);
      window.generatedImgs = Array(total).fill('../icon/error.jpg');
      window.generatedStoryTitles = Array(total).fill('');
      window.generatedStoryCams = Array(total).fill('');

      updateGenProgress(25, `正在套用「${tpl.name}」爆點結構...`, 'step-structure');
      await delay(500);

      updateGenProgress(50, '正在優化每個鏡頭的提示詞...', 'step-prompt');
      await delay(500);

      const styleDetail = STYLES[CreationSessionStore.styleIndex].prompt;
      for (let i = 0; i < total; i++) {
          const shot = tpl.structure?.[i] || {};
          window.generatedStoryTitles[i] = shot.action || `鏡頭 ${i + 1}`;
          window.generatedStoryCams[i] = shot.camera || 'medium shot';

          const imagePrompt = `${shot.action || ''}, ${CreationSessionStore.story}, ${styleDetail}, ${getRatioPrompt()}`;
          try {
              const res = await askGemini(imagePrompt, 'image');
              if (res?.image?.length > 0) {
                  window.generatedImgs[i] = res.image[0];
              }
          } catch (e) {
              console.error(`Template image ${i + 1} failed`, e);
          }

          const progress = 50 + ((i + 1) / total) * 42;
          updateGenProgress(progress, `正在著色第 ${i + 1} / ${total} 張模板分鏡...`, 'step-render');
          if (i < total - 1) await delay(800);
      }

      updateGenProgress(95, '備份至雲端資料庫...', 'step-render');
      await saveProjectToDatabase();

      updateGenProgress(100, '模板分鏡生成完成！', 'step-render');
      await delay(500);

      renderResults();
  }

  function renderResults() {
      const progressWrap = document.getElementById('generation-progress-wrap');
      const resultWrap = document.getElementById('generation-result-wrap');
      if (progressWrap) progressWrap.style.display = 'none';
      if (resultWrap) {
          resultWrap.style.display = 'flex';
          resultWrap.style.opacity = '0';
          void resultWrap.offsetHeight;
          resultWrap.style.transition = 'opacity 400ms ease';
          resultWrap.style.opacity = '1';
      }

      // Metadata summary
      const metaEl = document.getElementById('result-meta-info');
      const count = window.generatedImgs.length;
      const stName = STYLES[CreationSessionStore.styleIndex].name;
      const r = CreationSessionStore.ratio;
      if (metaEl) {
          metaEl.textContent = `${count} 個鏡頭 · ${stName} · ${r}`;
      }

      // Render Shots Grid
      const grid = document.getElementById('storyboard-grid');
      if (grid) {
          grid.innerHTML = '';
          window.generatedImgs.forEach((imgSrc, i) => {
              const card = document.createElement('div');
              card.className = 'shot-card';
              card.innerHTML = `
                  <div class="shot-card-thumb">
                      <img src="${imgSrc}" alt="Shot ${i + 1}">
                      <span class="shot-num-badge">#${i + 1}</span>
                  </div>
                  <div class="shot-card-meta">
                      <div class="shot-title">${window.generatedStoryTitles[i] || `鏡頭 ${i + 1}`}</div>
                      <div class="shot-cam">${window.generatedStoryCams[i] || '一般鏡頭'}</div>
                  </div>
              `;
              grid.appendChild(card);
          });
      }
  }

  function abortGeneration() {
      if (activeGenController) {
          activeGenController.abort();
      }
      updateGenProgress(0, '生成已中斷', null);
      switchPhase(2);
  }
  window.abortGeneration = abortGeneration;

  function resetCreationWorkflow() {
      CreationSessionStore.story = '';
      CreationSessionStore.selectedTemplate = null;
      CreationSessionStore.draft.story = '';
      CreationSessionStore.currentPhase = 1;
      const input = document.getElementById('story-input');
      if (input) input.value = '';
      switchPhase(1);
  }
  window.resetCreationWorkflow = resetCreationWorkflow;

  // ════════════════════════════════════════════════════════════
  // 7. Helpers & API Connections
  // ════════════════════════════════════════════════════════════
  function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function askGemini(question, type) {
      const res = await fetch('/api/ask-gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, type, ratio: CreationSessionStore.ratio })
      });
      const data = await res.json();
      if (!res.ok) {
          const err = new Error(data.error || '請求異常');
          err.status = res.status;
          throw err;
      }
      return data;
  }

  function safeParseJson(text) {
      try {
          const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
          const s = cleaned.indexOf('{');
          const e = cleaned.lastIndexOf('}');
          if (s === -1 || e === -1) return null;
          return JSON.parse(cleaned.slice(s, e + 1));
      } catch (e) {
          return null;
      }
  }

  async function saveProjectToDatabase() {
      if (!window.spaAuth || !window.spaAuth.isLoggedIn()) return null;
      try {
          const title = CreationSessionStore.selectedTemplate?.name 
              || window.storyboardData?.meta?.title 
              || (CreationSessionStore.story.slice(0, 24) + '...');
          const style = STYLES[CreationSessionStore.styleIndex].name;
          const ratio = CreationSessionStore.ratio;
          const cover = window.generatedImgs[0] || null;

          const shots = window.generatedImgs.map((img, i) => ({
              order: i + 1,
              title: window.generatedStoryTitles[i] || '',
              camera: window.generatedStoryCams[i] || '',
              duration: '3s',
              payload: { image: img }
          }));

          const token = window.spaAuth.getToken();
          const res = await fetch('/api/projects', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ title, style, ratio, cover, shots, characters: {}, metadata: {} })
          });
          if (!res.ok) return null;
          const json = await res.json();
          if (typeof window.clearSpaCache === 'function') window.clearSpaCache();
          return json.project?.id;
      } catch (e) {
          console.error("Failed to auto-save project:", e);
          return null;
      }
  }

  function exportStoryboardJson() {
      const exportData = {
          story: CreationSessionStore.story,
          style: STYLES[CreationSessionStore.styleIndex].name,
          ratio: CreationSessionStore.ratio,
          shots: window.generatedImgs.map((img, i) => ({
              shot: i + 1,
              title: window.generatedStoryTitles[i] || '',
              camera: window.generatedStoryCams[i] || '',
              image: img
          }))
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `storyboard_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
  }
  window.exportStoryboardJson = exportStoryboardJson;

  // ════════════════════════════════════════════════════════════
  // 8. Page Initialization & Shared Handoff Receptor
  // ════════════════════════════════════════════════════════════
  function initGeneratePage() {
      const input = document.getElementById('story-input');
      if (input && !input.dataset.bound) {
          input.dataset.bound = 'true';
          input.addEventListener('keydown', e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submitPhase1Story();
              }
          });
          input.addEventListener('input', onStoryInput);
      }

      const submitBtn = document.getElementById('composer-submit-btn');
      if (submitBtn && !submitBtn.dataset.bound) {
          submitBtn.dataset.bound = 'true';
          submitBtn.addEventListener('click', (e) => {
              e.preventDefault();
              submitPhase1Story();
          });
      }

      document.querySelectorAll('#phase1-suggestions .sugg-chip').forEach(chip => {
          if (!chip.dataset.bound) {
              chip.dataset.bound = 'true';
              chip.addEventListener('click', (e) => {
                  e.preventDefault();
                  fillPhase1Sugg(chip);
              });
          }
      });

      const editBtn = document.getElementById('context-edit-btn');
      if (editBtn && !editBtn.dataset.bound) {
          editBtn.dataset.bound = 'true';
          editBtn.addEventListener('click', (e) => {
              e.preventDefault();
              editStoryFromHeader();
          });
      }

      const dirBack = document.getElementById('btn-direction-back');
      if (dirBack && !dirBack.dataset.bound) {
          dirBack.dataset.bound = 'true';
          dirBack.addEventListener('click', (e) => {
              e.preventDefault();
              switchPhase(1);
          });
      }

      const dirNext = document.getElementById('btn-direction-next');
      if (dirNext && !dirNext.dataset.bound) {
          dirNext.dataset.bound = 'true';
          dirNext.addEventListener('click', (e) => {
              e.preventDefault();
              confirmDirectionAndAdvance();
          });
      }

      const skipTpl = document.getElementById('btn-skip-template');
      if (skipTpl && !skipTpl.dataset.bound) {
          skipTpl.dataset.bound = 'true';
          skipTpl.addEventListener('click', (e) => {
              e.preventDefault();
              skipTemplateAndGenerate();
          });
      }

      const tplBack = document.getElementById('btn-template-back');
      if (tplBack && !tplBack.dataset.bound) {
          tplBack.dataset.bound = 'true';
          tplBack.addEventListener('click', (e) => {
              e.preventDefault();
              switchPhase(2);
          });
      }

      const tplConfirm = document.getElementById('btn-template-confirm');
      if (tplConfirm && !tplConfirm.dataset.bound) {
          tplConfirm.dataset.bound = 'true';
          tplConfirm.addEventListener('click', (e) => {
              e.preventDefault();
              applySelectedTemplateAndGenerate();
          });
      }

      const abortBtn = document.getElementById('btn-abort-generation');
      if (abortBtn && !abortBtn.dataset.bound) {
          abortBtn.dataset.bound = 'true';
          abortBtn.addEventListener('click', (e) => {
              e.preventDefault();
              abortGeneration();
          });
      }

      // Check if session already has a story (e.g. from QC Shared Handoff)
      const story = CreationSessionStore.story || CreationSessionStore.draft?.story || '';
      const targetPhase = CreationSessionStore.targetPhase || (story ? 2 : 1);

      if (story) {
          CreationSessionStore.story = story;
          if (input) input.value = story;
      }

      // If preselected template
      if (window.preselectedTemplateId) {
          ensureTemplatesLoaded().then(tpls => {
              const t = tpls.find(x => x.id === window.preselectedTemplateId);
              if (t) CreationSessionStore.selectedTemplate = t;
          });
      }

      switchPhase(targetPhase, false);
  }
  window.initGeneratePage = initGeneratePage;

})();