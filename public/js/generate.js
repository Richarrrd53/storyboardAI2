(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════
  // 1. Creation Session Store & Decoupled State Architecture
  // ════════════════════════════════════════════════════════════
  // Creation owns the session; GenerationTask owns the long-running work.
  const CreationSessionStore = window.CreationSessionStore;

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
  let templateLoading = false, templateError = null, requestedTemplateId = null;
  function renderTemplateSelection() {
      window.TemplateWorkflow?.selection(CreationSessionStore, { loading: templateLoading, error: templateError }, pageController?.signal);
      onStoryInput();
  }
  async function loadRequestedTemplate() {
      templateLoading = true; templateError = null; renderTemplateSelection();
      const mount = pageController;
      const templates = await ensureTemplatesLoaded();
      if (mount !== pageController || mount?.signal.aborted) return;
      templateLoading = false;
      const template = templates.find(t => t.id === requestedTemplateId);
      if (template) selectTemplateCard(template);
      else { templateError ||= '無法載入此模板，請重試或選擇其他模板。'; renderTemplateSelection(); }
  }
  let pageController = null;
  let unsubscribeTask = null;
  let boundNodes = new Set();
  let routeCleanup = null;
  let mathLoader = null;
  let inspirationField = null;

  function syncMathLoader(task = window.GenerationTask.getState()) {
      const visible = CreationSessionStore.currentPhase === 4 && task.status === 'generating';
      if (!visible) {
          mathLoader?.stop();
          mathLoader = null;
          inspirationField?.stop(); inspirationField = null;
      } else {
          if (!mathLoader) mathLoader = window.initMathCurveLoader?.({
              root: document.getElementById('generation-progress-wrap'),
              signal: pageController?.signal
          }) || null;
          if (!inspirationField) inspirationField = window.InspirationField?.mount({
              root: document.querySelector('#generation-progress-wrap .math-loader-box'),
              signal: pageController?.signal, story: task.input?.story, storyboard: task.result.storyboardData
          }) || null;
          inspirationField?.update(task.input?.story, task.result.storyboardData);
      }
  }

  function bindPageEvent(node, type, callback) {
      if (!node) return;
      node.removeAttribute('on' + type); // Avoid running both HTML inline and mounted handlers.
      if (node.dataset.bound) boundNodes.add(node);
      node.addEventListener(type, callback, { signal: pageController.signal });
  }

  function unmountGeneratePage() {
      if (window.GenerationTask?.getState().status === 'idle') {
          CreationSessionStore.targetPhase = 1;
          CreationSessionStore.currentPhase = 1;
      }
      mathLoader?.stop();
      mathLoader = null;
      inspirationField?.stop(); inspirationField = null;
      routeCleanup?.();
      routeCleanup = null;
      pageController?.abort();
      pageController = null;
      unsubscribeTask?.();
      unsubscribeTask = null;
      phaseAnimations.forEach(animation => animation.cancel());
      phaseAnimations = [];
      exitLayer?.remove(); exitLayer = null;
      boundNodes.forEach(node => { delete node.dataset.bound; });
      boundNodes.clear();
      const container = document.getElementById('template-cards-container');
      window.DynamicMaskSystem?.detach?.(container);
  }

  // ════════════════════════════════════════════════════════════
  // 2. Persistent Creation Surface Phase Transition Engine
  // ════════════════════════════════════════════════════════════
  // Panel 3 keeps the existing template hooks; panel 5 hosts the freeform plan.
  let phaseAnimations = [];
  let exitLayer = null;
  function switchPhase(targetPhase, animate = true) {
      if (![1, 2, 3, 4, 5].includes(targetPhase) || !pageController || pageController.signal.aborted) return;
      const current = document.querySelector('.phase-panel.active');
      const next = document.getElementById('phase-panel-' + targetPhase);
      if (!next) return;
      const changed = current !== next;
      const surface = document.getElementById('creation-surface');
      const before = surface.getBoundingClientRect();
      const skinTransform = getComputedStyle(surface, '::before').transform;
      const skinMatrix = skinTransform !== 'none' && typeof DOMMatrixReadOnly !== 'undefined' ? new DOMMatrixReadOnly(skinTransform) : null;
      const previousHeight = before.height * (skinMatrix?.d || 1);
      phaseAnimations.forEach(animation => animation.cancel());
      phaseAnimations = [];
      exitLayer?.remove(); exitLayer = null;
      const motion = changed && animate && !matchMedia('(prefers-reduced-motion: reduce)').matches;
      const motionTokens = getComputedStyle(document.documentElement);
      const swapDuration = parseFloat(motionTokens.getPropertyValue('--creation-swap')) || 520;
      const exitDuration = parseFloat(motionTokens.getPropertyValue('--creation-exit')) || 320;
      const morphDuration = parseFloat(motionTokens.getPropertyValue('--creation-morph')) || 500;
      const morphEase = motionTokens.getPropertyValue('--creation-morph-ease').trim() || 'cubic-bezier(.4,0,.2,1)';
      if (motion && current) {
          const surface = document.getElementById('creation-surface');
          const bounds = current.getBoundingClientRect(), parent = surface.getBoundingClientRect();
          const layer = current.cloneNode(true);
          layer.removeAttribute('id');
          layer.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
          layer.className = 'phase-exit-layer';
          layer.inert = true; layer.setAttribute('aria-hidden', 'true');
          Object.assign(layer.style, { top: `${bounds.top - parent.top}px`, left: `${bounds.left - parent.left}px`, width: `${bounds.width}px` });
          surface.appendChild(layer); exitLayer = layer;
          const outgoing = layer.animate([{ opacity: 1, filter: 'blur(0)', transform: 'translateY(0) scale(1)' }, { opacity: 0, filter: 'blur(10px)', transform: 'translateY(-5px) scale(.985)' }], { duration: exitDuration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
          outgoing.finished.then(() => layer.remove()).catch(() => layer.remove());
          phaseAnimations.push(outgoing);
      }
      CreationSessionStore.currentPhase = targetPhase;
      CreationSessionStore.targetPhase = targetPhase;
      document.getElementById('creation-surface').dataset.phase = String(targetPhase);
      document.querySelectorAll('.phase-panel').forEach(panel => {
          const selected = panel === next;
          panel.classList.toggle('active', selected);
          panel.hidden = !selected;
          panel.inert = !selected;
          panel.setAttribute('aria-hidden', String(!selected));
          panel.style.removeProperty('display');
      });
      updateTopNav(targetPhase);
      updateContextHeader(targetPhase);
      initPhaseFeatures(targetPhase);
      if (CreationSessionStore.currentPhase !== targetPhase) return;
      if (motion) {
          const after = surface.getBoundingClientRect();
          // Morph the surface skin, keeping editable controls unscaled in normal flow.
          // Long scripts use the visible height envelope instead of a many-screen scale.
          const envelope = Math.max(240, window.innerHeight - Math.max(0, after.top));
          const from = Math.min(previousHeight, envelope) / Math.min(after.height, envelope);
          phaseAnimations.push(surface.animate([
              { transform: `scaleY(${from})` },
              { transform: 'scaleY(1)' }
          ], { duration: morphDuration, easing: morphEase, pseudoElement: '::before' }));
          const blocks = [...next.children];
          blocks.forEach((block, i) => {
              phaseAnimations.push(block.animate([{ opacity: 0, filter: 'blur(12px)', transform: 'translateY(9px) scale(.99)' }, { opacity: 1, filter: 'blur(0)', transform: 'translateY(0) scale(1)' }], {
                  duration: swapDuration, delay: 80 + Math.min(i * 32, 96), easing: 'cubic-bezier(.4,0,.2,1)', fill: 'backwards'
              }));
          });
      }
      if (changed) {
          const scroller = next.closest('.spa-gen-wrap');
          if (scroller) scroller.scrollTop = 0;
          else window.scrollTo(0, 0);
          if (animate) next.querySelector('[data-phase-heading]')?.focus({ preventScroll: true });
      }
      syncMathLoader();
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
              input.focus({ preventScroll: true });
          }
      } else if (targetPhase === 2) {
          buildStyleCards();
          syncRatioChips();
          syncDuration();
          const templateMode = !!CreationSessionStore.selectedTemplate;
          document.getElementById("section-duration").hidden = templateMode;
          syncDirectionAction();
          triggerDirectionAiText();
      } else if (targetPhase === 3) {
          const mount = pageController;
          ensureTemplatesLoaded().then(() => {
              if (pageController !== mount || mount.signal.aborted) return;
              renderTemplateBrowser();
              if (window.DynamicMaskSystem) {
                  const tplContainer = document.getElementById('template-cards-container');
                  if (tplContainer) {
                      window.DynamicMaskSystem.attach(tplContainer, { maskSize: 36, direction: 'vertical' });
                      const maskInst = window.DynamicMaskSystem.get(tplContainer);
                      if (maskInst) maskInst.scheduleUpdate();
                  }
              }
          });
      } else if (targetPhase === 5) {
          renderPlan(window.GenerationTask.getState());
      } else if (targetPhase === 4) {
          startGenerationWorkflow();
      }
  }

  function updateTopNav(phase) {
      const task = window.GenerationTask.getState();
      const template = !!CreationSessionStore.selectedTemplate;
      const position = phase === 5 ? 3 : phase === 4 ? (task.status === 'completed' ? 5 : task.stage === 'images' ? 4 : 3) : phase;
      [1,2,3,4,5].forEach(p => {
          const el = document.getElementById('step-nav-' + p);
          if (!el) return;
          el.classList.toggle('active', p === position);
          el.classList.toggle('completed', p < position);
          if (p === position) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
      });
      document.getElementById('step-nav-3').textContent = template ? '模板' : '分鏡企劃';
      document.getElementById('phase-count-badge').textContent = position + ' / 5';
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
              metaText.textContent = `${st.name} / ${r}`;
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
      input.style.height = 'auto';
      const maxHeight = parseFloat(getComputedStyle(input).maxHeight) || 132;
      input.style.height = `${Math.max(40, Math.min(input.scrollHeight, maxHeight))}px`;
      const hasVal = val.length > 0;
      btn.disabled = !hasVal || templateLoading;
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
      if (!story || templateLoading) return;

      if (story !== CreationSessionStore.story && window.GenerationTask.getState().status !== 'idle') window.GenerationTask.reset();
      CreationSessionStore.story = story;
      CreationSessionStore.draft.story = story;
      switchPhase(2);
  }
  window.submitPhase1Story = submitPhase1Story;

  // ════════════════════════════════════════════════════════════
  // 4. Phase 2 — Creative Direction
  // ════════════════════════════════════════════════════════════
  function triggerDirectionAiText() {
      const text = document.getElementById('direction-ai-text');
      if (text) text.textContent = '選好影像語言後，先預覽完整文字分鏡。';
      const cursor = document.getElementById('direction-ai-cursor');
      if (cursor) cursor.hidden = true;
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

      const card = document.createElement('button');
          card.type = 'button';
          card.className = `style-card ${isSelected ? 'active' : ''} ${isRec ? 'is-recommended' : ''}`;
          card.dataset.index = idx;
          card.setAttribute('aria-pressed', String(isSelected));
          card.innerHTML = `<span class="style-card-info"><span class="style-card-name">${s.name}</span><span class="style-card-desc">${s.desc}</span></span><span class="style-card-check" aria-hidden="true">${isSelected ? '✓' : ''}</span>`;
          bindPageEvent(card, 'click', () => selectStyleCard(idx));
          grid.appendChild(card);
      });
  }

  function selectStyleCard(index) {
      CreationSessionStore.styleIndex = index;
      document.querySelectorAll('.style-card').forEach(c => {
          const isTarget = Number(c.dataset.index) === index;
          c.classList.toggle('active', isTarget);
          c.setAttribute('aria-pressed', String(isTarget));
          const check = c.querySelector('.style-card-check');
          if (check) check.textContent = isTarget ? '✓' : '';
      });
      syncDirectionAction();
  }

  function syncRatioChips() {
      const ratio = CreationSessionStore.ratio || '橫向16:9';
      document.querySelectorAll('.ratio-chip').forEach(c => {
          const selected = c.dataset.ratio === ratio;
          c.classList.toggle('active', selected);
          c.setAttribute('aria-pressed', String(selected));
      });
      syncDirectionAction();
  }

  function selectRatioOption(btn) {
      if (!btn) return;
      const ratio = btn.dataset.ratio;
      CreationSessionStore.ratio = ratio;
      syncRatioChips();
  }
  window.selectRatioOption = selectRatioOption;

  function confirmDirectionAndAdvance() {
      if (CreationSessionStore.selectedTemplate) switchPhase(3);
      else if (currentPlanMatches()) switchPhase(5);
      else skipTemplateAndGenerate();
  }
  window.confirmDirectionAndAdvance = confirmDirectionAndAdvance;

  // ════════════════════════════════════════════════════════════
  // 5. Phase 3 — Template Browser
  // ════════════════════════════════════════════════════════════
  async function ensureTemplatesLoaded() {
      if (TEMPLATES && TEMPLATES.length > 0) return TEMPLATES;
      const mount = pageController;
      templateLoading = true;
      renderTemplateBrowser();
      try {
          const res = await fetch('/api/get-templates', { signal: mount?.signal });
          if (!res.ok) throw new Error('模板載入失敗，請重試。');
          if (res.ok) {
              const templates = await res.json();
              if (pageController !== mount || mount?.signal.aborted) return TEMPLATES;
              TEMPLATES = Array.isArray(templates) ? templates : [];
              templateError = null;
          }
      } catch (err) {
          if (err.name === 'AbortError' || pageController !== mount || mount?.signal.aborted) return TEMPLATES;
          console.error("Failed to load templates:", err);
          TEMPLATES = [];
          templateError = err.message;
          renderTemplateSelection();
      }
      if (pageController === mount && !mount?.signal.aborted) templateLoading = false;
      return TEMPLATES;
  }

  const CAT_MAP = {
      'product': '商品廣告',
      'story': '敘事紀實',
      'twist': '高留存節奏',
      'custom': '團隊資產',
      '未分類': '未分類'
  };

  const CATEGORY_ITEMS = [
      { id: '全部', label: '全部序列' },
      { id: 'product', label: '商品廣告' },
      { id: 'story', label: '敘事紀實' },
      { id: 'twist', label: '高留存節奏' },
      { id: 'custom', label: '團隊資產' }
  ];

  let currentTemplateCategory = '全部';

  function getTemplatesForCategory(catId) {
      if (catId === '全部') return TEMPLATES;
      if (catId === 'custom') {
          return TEMPLATES.filter(t => {
              const c = t.category || t.type;
              return c !== 'product' && c !== 'story' && c !== 'twist';
          });
      }
      return TEMPLATES.filter(t => (t.category || t.type) === catId);
  }

  function renderTemplateBrowser() {
      const catsEl = document.getElementById('template-category-chips');
      const containerEl = document.getElementById('template-cards-container');
      const confirmBtn = document.getElementById('btn-template-confirm');
      const recBarText = document.getElementById('template-rec-text');
      if (!containerEl) return;

      if (recBarText) {
          recBarText.textContent = '選擇適合故事的鏡頭結構，也可以使用自由結構生成。';
      }

      // Calculate count per category
      const catCounts = { '全部': TEMPLATES.length, 'product': 0, 'story': 0, 'twist': 0, 'custom': 0 };
      TEMPLATES.forEach(t => {
          const cat = t.category || t.type;
          const key = (cat === 'custom' || cat === 'product' || cat === 'story' || cat === 'twist') ? cat : 'custom';
          catCounts[key]++;
      });

      // Render Categories
      if (catsEl) {
          catsEl.innerHTML = CATEGORY_ITEMS.map((item, i) => {
              const isActive = item.id === currentTemplateCategory;
              return `
                  <button type="button" class="tpl-cat-chip ${isActive ? 'active' : ''}" data-cat="${item.id}" aria-pressed="${isActive}">
                      ${item.label} <span class="count">(${catCounts[item.id] || 0})</span>
                  </button>
              `;
          }).join('');

          catsEl.querySelectorAll('.tpl-cat-chip').forEach(btn => {
              bindPageEvent(btn, 'click', () => {
                  catsEl.querySelectorAll('.tpl-cat-chip').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
                  btn.classList.add('active');
                  btn.setAttribute('aria-pressed', 'true');
                  currentTemplateCategory = btn.dataset.cat;
                  renderFilteredTemplates(getTemplatesForCategory(currentTemplateCategory));
              });
          });
      }

      renderFilteredTemplates(getTemplatesForCategory(currentTemplateCategory));
  }

  function renderFilteredTemplates(templates) {
      const containerEl = document.getElementById('template-cards-container');
      const confirmBtn = document.getElementById('btn-template-confirm');
      if (!containerEl) return;

      containerEl.scrollTop = 0;
      containerEl.innerHTML = '';
      containerEl.setAttribute('aria-busy', String(templateLoading));
      if (templateLoading || templateError) {
          const state = document.createElement('div');
          state.className = 'tpl-empty-hint';
          state.setAttribute('role', 'status');
          state.textContent = templateLoading ? '正在載入模板…' : templateError;
          if (templateError && !templateLoading) {
              const retry = document.createElement('button');
              retry.type = 'button'; retry.className = 'btn btn-outline'; retry.textContent = '重試載入模板';
              bindPageEvent(retry, 'click', () => ensureTemplatesLoaded().then(() => { renderTemplateBrowser(); renderTemplateSelection(); }));
              state.appendChild(retry);
          }
          containerEl.appendChild(state);
          return;
      }
      if (!templates || templates.length === 0) {
          containerEl.innerHTML = '<div class="tpl-empty-hint" role="status">此分類下目前無可用模板，可切換分類或使用自由結構生成。</div>';
          if (window.DynamicMaskSystem) {
              const maskInst = window.DynamicMaskSystem.get(containerEl);
              if (maskInst) maskInst.scheduleUpdate();
          }
          return;
      }

      templates.forEach(t => {
          const isSelected = CreationSessionStore.selectedTemplate?.id === t.id;
          const shotCount = t.shotsCount || (t.structure ? t.structure.length : 0);
          const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
          const tags = Array.isArray(t.tags) ? t.tags.slice(0, 3).map(tag => `<span>${escape(tag)}</span>`).join(' ') : '';
          const platforms = Array.isArray(t.platform) ? t.platform.map(p => `<span class="platform-badge">${escape(p)}</span>`).join('') : '';
          
          let duration = '';
          if (t.structure && t.structure.length) {
              const sumSec = t.structure.map(s => parseFloat(s.duration) || 0).reduce((a, b) => a + b, 0);
              if (sumSec > 0) duration = `${sumSec}s`;
          }

          const totalSeconds = parseInt(duration) || Math.max(shotCount * 3, 15);
          const sourceUrl = t.videoUrl || t.source?.url || '';
          const youtubeMatch = sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);
          const sourceVideoId = t.source?.videoId || t.videoId || youtubeMatch?.[1] || '';
          const rawThumbnail = t.thumbnail || t.cover || t.source?.thumbnail || (sourceVideoId ? `https://i.ytimg.com/vi/${encodeURIComponent(sourceVideoId)}/hqdefault.jpg` : '');
          const thumbnail = /^(https?:\/\/|\/(?!\/))/.test(rawThumbnail) ? rawThumbnail : '';

          const card = document.createElement('article');
          card.className = `template-card ${isSelected ? 'selected' : ''}`;
          card.id = `tpl-card-${t.id}`;
          card.dataset.id = t.id;

          card.innerHTML = `
            <div class="template-card-header">
              <div class="template-card-kicker">
                <span class="template-card-cat">${escape(CAT_MAP[t.category] || t.category || '未分類')}</span>
              </div>
              <span class="template-selected-badge" style="${isSelected ? '' : 'display: none;'}">✓ 已選擇</span>
            </div>
            <div class="template-video-cover ${thumbnail ? '' : 'no-cover'}" aria-label="來源影片封面">
              ${thumbnail ? `<img src="${escape(thumbnail)}" alt="${escape(t.source?.title || t.name || '來源影片')}封面" loading="lazy">` : ''}
              ${sourceVideoId ? '<span class="cover-source">YOUTUBE</span>' : ''}
              ${duration ? `<span class="cover-duration">${duration}</span>` : ''}
              <span class="cover-play" aria-hidden="true">▶</span>
            </div>
            <div class="template-card-body">
              <h3>${escape(t.name || t.title || '無標題')}</h3>
              <p>${escape(t.description || '依照這個模板的鏡頭結構改寫你的故事。')}</p>
              <div class="template-card-tags">
                ${tags}
              </div>
            </div>
            <div class="template-specs" aria-label="剪輯規格">
              ${duration ? `<span><b>${duration}</b> 長度</span>` : ''}
              ${shotCount ? `<span><b>${shotCount}</b> 鏡頭</span>` : ''}
            </div>
            <div class="template-card-footer">
              <div class="platform-badges" aria-label="適用平台">
                ${platforms}${t.ratio ? `<span class="aspect-badge">${escape(t.ratio)}</span>` : ''}
              </div>
              <div class="card-actions">
                <button type="button" class="card-apply-btn ${isSelected ? 'is-selected' : ''}" data-action="apply" aria-label="選擇 ${escape(t.name || t.title || '模板')}" aria-pressed="${isSelected}">${isSelected ? '✓ 已選中' : '選擇模板'}</button>
              </div>
            </div>
          `;

          bindPageEvent(card, 'click', () => {
              selectTemplateCard(t);
          });

          const image = card.querySelector('img');
          if (image) bindPageEvent(image, 'error', () => { image.parentElement.classList.add('no-cover'); image.remove(); });

          containerEl.appendChild(card);
      });

      if (confirmBtn) {
          confirmBtn.disabled = !CreationSessionStore.selectedTemplate;
          if (CreationSessionStore.selectedTemplate) {
              confirmBtn.textContent = `✦ 套用「${CreationSessionStore.selectedTemplate.name || '模板'}」並開始生成 →`;
          } else {
              confirmBtn.textContent = '✦ 套用模板並開始生成 →';
          }
      }

      if (window.DynamicMaskSystem) {
          window.DynamicMaskSystem.attach(containerEl, { maskSize: 36, direction: 'vertical' });
          const maskInst = window.DynamicMaskSystem.get(containerEl);
          if (maskInst) maskInst.scheduleUpdate();
      }
  }

  function selectTemplateCard(tpl) {
      if (CreationSessionStore.selectedTemplate?.id !== tpl.id) CreationSessionStore.templateValues = {};
      CreationSessionStore.selectedTemplate = tpl;
      templateError = null;
      renderTemplateSelection();
      document.querySelectorAll('#template-cards-container .template-card').forEach(c => {
          const isThis = c.dataset.id === tpl.id;
          c.classList.toggle('selected', isThis);
          const badge = c.querySelector('.template-selected-badge');
          if (badge) badge.style.display = isThis ? '' : 'none';
          const btn = c.querySelector('.card-apply-btn');
          if (btn) {
              btn.setAttribute('aria-pressed', String(isThis));
              btn.classList.toggle('is-selected', isThis);
              btn.textContent = isThis ? '✓ 已選中' : '選擇模板';
          }
      });
      const confirmBtn = document.getElementById('btn-template-confirm');
      if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = `✦ 套用「${tpl.name}」並開始生成 →`;
      }
  }

  function skipTemplateAndGenerate() {
      if (window.GenerationTask.getState().status !== 'generating') window.GenerationTask.reset();
      CreationSessionStore.selectedTemplate = null;
      CreationSessionStore.templateValues = {};
      templateError = null; renderTemplateSelection();
      switchPhase(4);
  }
  window.skipTemplateAndGenerate = skipTemplateAndGenerate;

  function applySelectedTemplateAndGenerate() {
      if (!CreationSessionStore.selectedTemplate?.structure?.length) {
          templateError = '請選擇含有鏡頭結構的模板。'; renderTemplateSelection(); return;
      }
      if (window.GenerationTask.getState().status !== 'generating') window.GenerationTask.reset();
      switchPhase(4);
  }
  window.applySelectedTemplateAndGenerate = applySelectedTemplateAndGenerate;

  // ════════════════════════════════════════════════════════════
  // 6. Phase 4 — Generation Task Presentation
  // ════════════════════════════════════════════════════════════
  function updateGenProgress(pct, statusText, activeStepId) {
      const barEl = document.getElementById('gen-progress-fill');
      const pctEl = document.getElementById('gen-status-pct');
      const statusEl = document.getElementById('gen-status-text');

      if (barEl) barEl.style.transform = `scaleX(${Math.min(100, Math.max(0, pct)) / 100})`;
      if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
      if (statusEl && statusText) statusEl.textContent = statusText;
      const track = document.getElementById('gen-progress-track');
      if (track) {
          track.setAttribute('aria-valuenow', String(Math.round(Math.min(100, Math.max(0, pct)))));
          track.setAttribute('aria-valuetext', `${statusText || '生成進度'}，${Math.round(pct)}%`);
      }

      if (activeStepId) {
          const steps = ['step-analyze', 'step-structure', 'step-prompt', 'step-render'];
          const targetIdx = steps.indexOf(activeStepId);
          steps.forEach((sId, idx) => {
              const el = document.getElementById(sId);
              if (!el) return;
              if (idx < targetIdx) el.dataset.status = 'success';
              else if (idx === targetIdx) el.dataset.status = 'active';
              else el.dataset.status = 'pending';
              if (idx === targetIdx) el.setAttribute('aria-current', 'step');
              else el.removeAttribute('aria-current');
          });
      }


  }

  function startGenerationWorkflow() {
      const task = window.GenerationTask.getState();
      if (['generating', 'completed', 'awaiting_confirmation', 'error', 'cancelled'].includes(task.status)) {
          presentTask(task);
          return;
      }
      if (!CreationSessionStore.story) return;
      return window.GenerationTask.start({
          story: CreationSessionStore.story,
          style: STYLES[CreationSessionStore.styleIndex] || STYLES[0],
          ratio: CreationSessionStore.ratio,
          duration: CreationSessionStore.duration || 30,
          selectedTemplate: CreationSessionStore.selectedTemplate,
          templateValues: { ...CreationSessionStore.templateValues }
      });
  }

  function renderResults(task = window.GenerationTask.getState()) {
      const result = task.result;
      const progressWrap = document.getElementById('generation-progress-wrap');
      const resultWrap = document.getElementById('generation-result-wrap');
      const phaseTitle = document.querySelector('.generation-phase-title');
      if (phaseTitle) phaseTitle.style.display = 'none';
      if (progressWrap) progressWrap.style.display = 'none';
      if (resultWrap) {
          resultWrap.style.display = 'flex';
      }

      window.TemplateWorkflow.results(task);
  }

  function abortGeneration() {
      if (!window.GenerationTask.cancel()) switchPhase(2, false);
  }
  window.abortGeneration = abortGeneration;

  function resetCreationWorkflow() {
      window.GenerationTask.reset();
      document.getElementById('generation-error-banner').hidden = true;
      const phaseTitle = document.querySelector('.generation-phase-title');
      if (phaseTitle) phaseTitle.style.display = '';
      CreationSessionStore.targetPhase = 1;
      CreationSessionStore.story = '';
      CreationSessionStore.selectedTemplate = null;
      CreationSessionStore.templateValues = {};
      templateError = null; renderTemplateSelection();
      CreationSessionStore.draft.story = '';
      const input = document.getElementById('story-input');
      if (input) input.value = '';
      switchPhase(1);
  }
  window.resetCreationWorkflow = resetCreationWorkflow;

  // ════════════════════════════════════════════════════════════
  // 7. Helpers & API Connections
  // ════════════════════════════════════════════════════════════
  function exportStoryboardJson() {
      const task = window.GenerationTask.getState();
      if (!task.input) return;
      window.TemplateWorkflow.exportJSON(task);
  }
  window.exportStoryboardJson = exportStoryboardJson;

  // ════════════════════════════════════════════════════════════
  // 8. Page Initialization & Shared Handoff Receptor
  // ════════════════════════════════════════════════════════════
  const escapePlan = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  let renderedPlan = '';
  function currentPlanMatches() {
      const task = window.GenerationTask.getState(), session = CreationSessionStore;
      return task.status === 'awaiting_confirmation' && !task.input.selectedTemplate &&
          task.input.story === session.story && task.input.style.name === STYLES[session.styleIndex || 0].name &&
          task.input.ratio === session.ratio && task.input.duration === (session.duration || 30);
  }
  function syncDirectionAction() {
      const button = document.getElementById('btn-direction-next');
      if (button) button.textContent = CreationSessionStore.selectedTemplate ? '下一步：模板設定' : currentPlanMatches() ? '返回分鏡企劃' : '規劃文字分鏡';
  }
  function syncDuration() {
      document.querySelectorAll('[data-duration]').forEach(button => {
          button.setAttribute('aria-pressed', String(Number(button.dataset.duration) === (CreationSessionStore.duration || 30)));
      });
      syncDirectionAction();
  }
  function renderPlan(task) {
      const data = task.result.storyboardData;
      if (!data) return;
      const total = data.shots.reduce((sum, shot) => sum + (window.FreeformStoryboard.seconds(shot.duration) || 0), 0);
      document.getElementById('plan-summary').textContent = `${data.shots.length} 個鏡頭 / 預估 ${Number(total.toFixed(2))} 秒 / 目標 ${task.input.duration} 秒`;
      const error = document.getElementById('plan-error');
      error.hidden = !task.error;
      error.textContent = task.error?.message || '';
      const signature = JSON.stringify(data);
      const title = document.getElementById('plan-title');
      const list = document.getElementById('plan-shots');
      if (document.activeElement !== title) title.value = data.meta.title;
      if (signature === renderedPlan && list.children.length) return;
      renderedPlan = signature;
      if (list.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
      const field = (shot, key, label, index, multiline = false) => `<label for="plan-${index}-${key}"><span>${label}</span>${multiline
          ? `<textarea id="plan-${index}-${key}" data-field="${key}" rows="2">${escapePlan(shot[key])}</textarea>`
          : `<input id="plan-${index}-${key}" data-field="${key}" value="${escapePlan(shot[key])}">`}</label>`;
      list.innerHTML = data.shots.map((shot, index) => `<article class="plan-shot" data-shot-index="${index}" aria-label="鏡頭 ${index + 1}">
          <div class="plan-shot-order"><h3>鏡頭 ${index + 1}</h3><div class="plan-order-actions"><button type="button" data-move="-1" ${index === 0 ? 'disabled' : ''} aria-label="鏡頭 ${index + 1} 上移">上移</button><button type="button" data-move="1" ${index === data.shots.length - 1 ? 'disabled' : ''} aria-label="鏡頭 ${index + 1} 下移">下移</button></div></div>
          <div class="plan-shot-fields">${field(shot, 'story', '畫面內容與動作', index, true)}
          <div class="plan-tech-fields">${field({ duration: window.FreeformStoryboard.seconds(shot.duration) }, 'duration', '時長（秒）', index)}${field(shot, 'camera', '拍攝方式', index)}</div>
          <div class="plan-tech-fields">${field(shot, 'emotion', '情緒', index)}${field(shot, 'purpose', '敘事目的', index)}</div>
          ${field(shot, 'dialogue', '對白／旁白（選填）', index)}
          <details><summary>英文圖片提示詞</summary>${field(shot, 'shotPrompt', '圖片提示詞', index, true)}</details></div></article>`).join('');
      list.querySelectorAll('[data-field="duration"]').forEach(input => { input.type = 'number'; input.min = '0.1'; input.step = '0.1'; });
  }
  function savePlanFromUI() {
      const data = window.GenerationTask.getState().result.storyboardData;
      if (!data) return;
      data.meta.title = document.getElementById('plan-title').value;
      document.querySelectorAll('#plan-shots [data-shot-index]').forEach(row => {
          const shot = data.shots[Number(row.dataset.shotIndex)];
          row.querySelectorAll('[data-field]').forEach(input => {
              shot[input.dataset.field] = input.dataset.field === 'duration' ? `${input.value}s` : input.value;
          });
      });
      window.GenerationTask.updatePlan(data);
  }
  function presentTask(task) {
      if (!pageController || pageController.signal.aborted) return;
      syncMathLoader(task);
      const edit = document.getElementById('context-edit-btn');
      if (edit) edit.disabled = task.status === 'generating';
      if (task.status === 'idle') return;
      updateTopNav(CreationSessionStore.currentPhase);
      if (task.status === 'awaiting_confirmation') {
          if (CreationSessionStore.currentPhase !== 5) switchPhase(5);
          renderPlan(task);
          return;
      }
      updateGenProgress(task.progress.pct, task.progress.statusText, task.progress.activeStepId);
      const track = document.getElementById('gen-progress-track');
      const count = document.getElementById('gen-status-pct');
      if (track) track.hidden = !task.progress.total;
      if (count) count.textContent = task.progress.total ? task.progress.completed + ' / ' + task.progress.total : '';
      if (task.status === 'completed' && CreationSessionStore.currentPhase === 4) {
          renderResults(task);
      } else if (task.status === 'generating') {
          document.getElementById('generation-error-banner').hidden = true;
          document.getElementById('generation-progress-wrap').style.display = 'flex';
          document.getElementById('generation-result-wrap').style.display = 'none';
          const title = document.querySelector('.generation-phase-title');
          title.style.display = '';
          title.textContent = task.stage === 'images' ? '逐鏡生成畫面' : '正在規劃分鏡';
      } else if (['error', 'cancelled'].includes(task.status)) {
          document.getElementById('generation-error-banner').hidden = false;
          document.getElementById('generation-error-message').textContent = task.error?.message || '生成已取消，已完成的鏡頭保留。可繼續這次生成或修改企劃。';
          switchPhase(2, false);
      }
  }

  function initGeneratePage(options = {}) {
      unmountGeneratePage();
      if (options.signal?.aborted) return null;
      pageController = new AbortController();
      document.getElementById('generate-workspace').dataset.ready = 'true';
      matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
          mathLoader?.stop(); mathLoader = null; syncMathLoader();
          if (!event.matches) return;
          phaseAnimations.forEach(animation => animation.cancel());
          phaseAnimations = [];
          exitLayer?.remove(); exitLayer = null;
      }, { signal: pageController.signal });
      const mount = pageController;
      const unmount = () => { if (pageController === mount) unmountGeneratePage(); };
      renderedPlan = '';
      document.querySelectorAll('[data-duration]').forEach(button => bindPageEvent(button, 'click', () => {
          CreationSessionStore.duration = Number(button.dataset.duration); syncDuration();
      }));
      bindPageEvent(document.getElementById('plan-title'), 'input', savePlanFromUI);
      bindPageEvent(document.getElementById('plan-shots'), 'input', savePlanFromUI);
      bindPageEvent(document.getElementById('plan-shots'), 'click', event => {
          const button = event.target.closest('[data-move]');
          if (!button) return;
          const index = Number(button.closest('[data-shot-index]').dataset.shotIndex);
          const next = index + Number(button.dataset.move);
          const data = window.GenerationTask.getState().result.storyboardData;
          if (next < 0 || next >= data.shots.length) return;
          [data.shots[index], data.shots[next]] = [data.shots[next], data.shots[index]];
          renderedPlan = ''; window.GenerationTask.updatePlan(data);
          const row = document.querySelector(`#plan-shots [data-shot-index="${next}"]`);
          const preferred = row?.querySelector(`[data-move="${button.dataset.move}"]`);
          (preferred && !preferred.disabled ? preferred : row?.querySelector('button:not(:disabled)'))?.focus();
      });
      bindPageEvent(document.getElementById('btn-plan-back'), 'click', () => switchPhase(2));
      bindPageEvent(document.getElementById('btn-confirm-plan'), 'click', () => {
          savePlanFromUI();
          window.GenerationTask.confirmPlan();
          if (window.GenerationTask.getState().status === 'generating') switchPhase(4);
      });

      options.signal?.addEventListener('abort', unmount, { once: true });
      routeCleanup = () => options.signal?.removeEventListener('abort', unmount);
      requestedTemplateId = options.templateId || window.preselectedTemplateId || null;
      window.preselectedTemplateId = null;
      templateLoading = false; templateError = null;
      if (requestedTemplateId && window.GenerationTask.getState().status !== 'generating') {
          CreationSessionStore.reset();
          CreationSessionStore.ratio = '直向9:16';
      }
      bindPageEvent(document.getElementById('btn-reload-template'), 'click', () => requestedTemplateId ? loadRequestedTemplate() : ensureTemplatesLoaded().then(() => { renderTemplateBrowser(); renderTemplateSelection(); }));
      bindPageEvent(document.getElementById('btn-retry-generation'), 'click', () => { window.GenerationTask.retry(); switchPhase(4, false); });
      bindPageEvent(document.getElementById('btn-edit-generation-brief'), 'click', () => { document.getElementById('generation-error-banner').hidden = true; switchPhase(1); });
      const input = document.getElementById('story-input');
      if (input && !input.dataset.bound) {
          input.dataset.bound = 'true';
          bindPageEvent(input, 'keydown', e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
                  e.preventDefault();
                  submitPhase1Story();
              }
          });
          bindPageEvent(input, 'input', onStoryInput);
      }

      const submitBtn = document.getElementById('composer-submit-btn');
      if (submitBtn && !submitBtn.dataset.bound) {
          submitBtn.dataset.bound = 'true';
          bindPageEvent(submitBtn, 'click', (e) => {
              e.preventDefault();
              submitPhase1Story();
          });
      }

      document.querySelectorAll('#phase1-suggestions .sugg-chip').forEach(chip => {
          if (!chip.dataset.bound) {
              chip.dataset.bound = 'true';
              bindPageEvent(chip, 'click', (e) => {
                  e.preventDefault();
                  fillPhase1Sugg(chip);
              });
          }
      });

      const editBtn = document.getElementById('context-edit-btn');
      if (editBtn && !editBtn.dataset.bound) {
          editBtn.dataset.bound = 'true';
          bindPageEvent(editBtn, 'click', (e) => {
              e.preventDefault();
              editStoryFromHeader();
          });
      }

      const dirBack = document.getElementById('btn-direction-back');
      if (dirBack && !dirBack.dataset.bound) {
          dirBack.dataset.bound = 'true';
          bindPageEvent(dirBack, 'click', (e) => {
              e.preventDefault();
              switchPhase(1);
          });
      }

      const dirNext = document.getElementById('btn-direction-next');
      if (dirNext && !dirNext.dataset.bound) {
          dirNext.dataset.bound = 'true';
          bindPageEvent(dirNext, 'click', (e) => {
              e.preventDefault();
              confirmDirectionAndAdvance();
          });
      }

      const skipTpl = document.getElementById('btn-skip-template');
      if (skipTpl && !skipTpl.dataset.bound) {
          skipTpl.dataset.bound = 'true';
          bindPageEvent(skipTpl, 'click', (e) => {
              e.preventDefault();
              skipTemplateAndGenerate();
          });
      }

      const tplBack = document.getElementById('btn-template-back');
      if (tplBack && !tplBack.dataset.bound) {
          tplBack.dataset.bound = 'true';
          bindPageEvent(tplBack, 'click', (e) => {
              e.preventDefault();
              switchPhase(2);
          });
      }

      const tplConfirm = document.getElementById('btn-template-confirm');
      if (tplConfirm && !tplConfirm.dataset.bound) {
          tplConfirm.dataset.bound = 'true';
          bindPageEvent(tplConfirm, 'click', (e) => {
              e.preventDefault();
              applySelectedTemplateAndGenerate();
          });
      }

      const abortBtn = document.getElementById('btn-abort-generation');
      if (abortBtn && !abortBtn.dataset.bound) {
          abortBtn.dataset.bound = 'true';
          bindPageEvent(abortBtn, 'click', (e) => {
              e.preventDefault();
              abortGeneration();
          });
      }

      document.querySelectorAll('.ratio-chip').forEach(chip => {
          bindPageEvent(chip, 'click', () => selectRatioOption(chip));
      });
      document.querySelectorAll('#generation-result-wrap .result-actions .btn-outline').forEach(button => {
          bindPageEvent(button, 'click', exportStoryboardJson);
      });
      document.querySelectorAll('#generation-result-wrap .result-actions .btn-primary').forEach(button => {
          bindPageEvent(button, 'click', resetCreationWorkflow);
      });

      // Check if session already has a story (e.g. from QC Shared Handoff)
      const story = CreationSessionStore.story || CreationSessionStore.draft?.story || '';
      if (options.fromQC && window.GenerationTask.getState().status !== 'generating') {
          window.GenerationTask.reset();
      }
      const task = window.GenerationTask.getState();
      const targetPhase = task.status === 'awaiting_confirmation' ? 5 : ['generating', 'completed'].includes(task.status)
          ? 4 : (['error', 'cancelled'].includes(task.status) ? 2
              : (options.targetPhase || CreationSessionStore.targetPhase || 1));

      if (story) {
          CreationSessionStore.story = story;
          if (input) input.value = story;
      }

      if (requestedTemplateId && task.status !== 'generating') loadRequestedTemplate();
      else renderTemplateSelection();

      unsubscribeTask = window.GenerationTask.subscribe(presentTask);
      switchPhase(targetPhase, false);
      return { unmount: () => {
          options.signal?.removeEventListener('abort', unmount);
          unmount();
      } };
  }
  window.initGeneratePage = initGeneratePage;

})();
