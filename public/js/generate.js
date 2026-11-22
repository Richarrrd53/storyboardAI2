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
      const hasTemplate = !!CreationSessionStore.selectedTemplate;
      for (const id of ['change-selected-template', 'remove-selected-template']) { const button = document.getElementById(id); if (button) button.hidden = !hasTemplate; }
      const mode = document.getElementById('use-template-generation'); if (mode) mode.checked = CreationSessionStore.generationMode === 'template';
      onStoryInput();
      window.CreativeCopilot?.render();
  }
  async function loadRequestedTemplate() {
      templateLoading = true; templateError = null; renderTemplateSelection();
      const mount = pageController, sessionId = CreationSessionStore.sessionId;
      try {
          const response = await fetch('/api/templates/' + encodeURIComponent(requestedTemplateId), { signal: mount?.signal });
          const template = await response.json();
          if (!response.ok) throw new Error(template.error || '無法載入此模板');
          if (mount !== pageController || mount?.signal.aborted || sessionId !== CreationSessionStore.sessionId) return;
          window.CreationController.selectTemplate(template);
      } catch (error) { if (!mount?.signal.aborted) templateError = error.message; }
      finally { if (mount === pageController) { templateLoading = false; renderTemplateSelection(); } }
  }
  let pageController = null;
  let unsubscribeTask = null;
  let retryDisplayTimer = null;
  let boundNodes = new Set();
  let routeCleanup = null;
  let mathLoader = null;
  let inspirationField = null;

  const assistantCopy = {
      received: '收到！我先把你的想法整理成故事，接著再想辦法讓畫面活起來。',
      planning: '故事有雛形了，讓我想想每個鏡頭該怎麼安排……',
      planned: '劇本準備好了！接下來，就讓這些文字變成真正的畫面。',
      images: '正在努力把想像畫出來，這部分需要一點魔法……還有運算。',
      completed: '完成！你的故事現在有畫面了，來看看是不是你想像中的模樣吧。',
      waiting: [
          '這個鏡頭好像還能更有戲一點……',
          '導演請稍候，攝影棚正在準備中。',
          '畫面正在成形，希望這次光影能漂亮一點。',
          '再給我一點時間，好畫面值得多花點心思。'
      ]
  };
  let assistantStage = null, assistantTimer = null, assistantAnimation = null, assistantLastLine = -1;
  function stopAssistant() {
      clearTimeout(assistantTimer); assistantTimer = null;
      assistantAnimation?.cancel(); assistantAnimation = null;
      assistantStage = null; assistantLastLine = -1;
  }
  function showAssistantLine(message, immediate = false) {
      const node = document.getElementById('generation-assistant-message');
      if (!node) return;
      assistantAnimation?.cancel(); assistantAnimation = null;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (immediate || reduced || !node.textContent || !node.animate) {
          node.textContent = message;
          if (!reduced && node.animate) assistantAnimation = node.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
          return;
      }
      const stage = assistantStage;
      assistantAnimation = node.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
      assistantAnimation.onfinish = () => {
          if (stage !== assistantStage || !pageController || pageController.signal.aborted) return;
          node.textContent = message;
          assistantAnimation = node.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' });
      };
  }
  function syncAssistant(task) {
      if (task.status !== 'generating') { stopAssistant(); return; }
      const stage = task.stage === 'images' ? 'images' : task.progress.statusText === '正在規劃分鏡…' ? 'received' : 'planning';
      const key = `${task.taskId}:${stage}`;
      if (assistantStage === key) return;
      stopAssistant(); assistantStage = key;
      showAssistantLine(assistantCopy[stage], true);
      const rotate = () => {
          if (assistantStage !== key || !pageController || pageController.signal.aborted) return;
          const choices = assistantCopy.waiting.map((_, i) => i).filter(i => i !== assistantLastLine);
          assistantLastLine = choices[Math.floor(Math.random() * choices.length)];
          showAssistantLine(assistantCopy.waiting[assistantLastLine]);
          assistantTimer = setTimeout(rotate, 7000);
      };
      if (stage !== 'received') assistantTimer = setTimeout(rotate, 10000);
  }

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
              signal: pageController?.signal, story: task.input?.story, storyboard: task.result.storyboardData, brief: task.input?.creativeBrief
          }) || null;
          inspirationField?.update(task.input?.story, task.result.storyboardData, task.input?.creativeBrief);
      }
  }

  function bindPageEvent(node, type, callback) {
      if (!node) return;
      node.removeAttribute('on' + type); // Avoid running both HTML inline and mounted handlers.
      if (node.dataset.bound) boundNodes.add(node);
      node.addEventListener(type, callback, { signal: pageController.signal });
  }

  function unmountGeneratePage() {
      if (window.GenerationTask?.getState().status === 'idle' && !CreationSessionStore.creativeBrief) {
          CreationSessionStore.targetPhase = 1;
          CreationSessionStore.currentPhase = 1;
      }
      clearInterval(retryDisplayTimer); retryDisplayTimer = null;
      stopAssistant();
      if (pageController) window.CreationController.cleanupTransition();
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
      const stackHost = document.getElementById('creation-discussion-stack');
      const sharedStack = !!CreationSessionStore.story && [1, 2].includes(targetPhase);
      if (sharedStack && targetPhase === 2) {
          const discussion = window.CreativeCopilot?.prepare(CreationSessionStore.story);
          if (discussion) { discussion.active = true; window.CreativeCopilot.render(); }
      }
      if (stackHost) stackHost.hidden = !sharedStack || !CreationSessionStore.copilot?.active;
      const continuous = sharedStack && !!CreationSessionStore.copilot?.active &&
          ['phase-panel-1', 'phase-panel-2'].includes(current?.id) && current !== next;
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
          const outgoing = layer.animate([{ opacity: 1, filter: 'blur(0)', transform: 'translateY(0) scale(1)' }, { opacity: 0, filter: continuous ? 'blur(3px)' : 'blur(10px)', transform: continuous ? 'translateY(-3px)' : 'translateY(-5px) scale(.985)' }], { duration: continuous ? 200 : exitDuration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
          outgoing.finished.then(() => layer.remove()).catch(() => layer.remove());
          phaseAnimations.push(outgoing);
      }
      CreationSessionStore.currentStep = ({ 1: CreationSessionStore.copilot?.active ? (CreationSessionStore.discussionStage === 'template' ? 'template-discussion' : 'story-discussion') : 'idea', 2: 'direction', 3: 'template-selection', 4: 'generation', 5: 'planning' })[targetPhase];
      CreationSessionStore.currentPhase = targetPhase;
      CreationSessionStore.targetPhase = targetPhase;
      window.CreationController.publish();
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
      if (motion && continuous) {
          phaseAnimations.push(next.animate([
              { opacity: 0, filter: 'blur(3px)', transform: 'translateY(4px)' },
              { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' }
          ], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' }));
      } else if (motion) {
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
      if (changed && !continuous) {
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
          window.CreativeCopilot?.render();
          const input = document.getElementById('story-input');
          if (input) {
              if (CreationSessionStore.story && !input.value) {
                  input.value = CreationSessionStore.story;
              }
              onStoryInput();
              if (!CreationSessionStore.copilot?.active) input.focus({ preventScroll: true });
          }
      } else if (targetPhase === 2) {
          buildStyleCards();
          syncRatioChips();
          syncDuration();
          for (const group of document.querySelectorAll('[data-choice-kind]')) window.ChoiceGroup.mount(group, {signal:pageController.signal});
          const templateMode = !!CreationSessionStore.selectedTemplate;
          document.getElementById("section-duration").hidden = false;
          renderTemplateSelection();
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
      const template = CreationSessionStore.generationMode === 'template';
      const position = template ? phase === 3 ? 2 : phase === 2 ? 3 : phase === 5 ? 4 : phase === 4 ? 5 : CreationSessionStore.discussionStage === 'template' ? 2 : 1
          : phase === 5 ? 3 : phase === 4 ? (task.status === 'completed' ? 5 : task.stage === 'images' ? 4 : 3) : phase;
      const labels = template ? ['故事討論', CreationSessionStore.selectedTemplate ? '模板討論' : '選擇模板', '創作設定', '分鏡企劃', task.status === 'completed' ? '完成' : '生成畫面'] : ['構思', '創作設定', '分鏡企劃', '生成畫面', '完成'];
      [1,2,3,4,5].forEach(p => {
          const el = document.getElementById('step-nav-' + p);
          if (!el) return;
          el.textContent = labels[p - 1];
          el.classList.toggle('active', p === position);
          el.classList.toggle('completed', p < position);
          if (p === position) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
      });
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

      if (phase === 1 || (phase === 2 && !CreationSessionStore.selectedTemplate && CreationSessionStore.copilot?.active)) {
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
      if (window.CreativeCopilot?.editStory) window.CreativeCopilot.editStory();
      else switchPhase(1);
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
      window.CreationController.checkpoint();
      if (val !== CreationSessionStore.story && CreationSessionStore.copilot?.busy) window.CreativeCopilot?.cancel();
      input.style.height = 'auto';
      const maxHeight = parseFloat(getComputedStyle(input).maxHeight) || 132;
      input.style.height = `${Math.max(40, Math.min(input.scrollHeight, maxHeight))}px`;
      const hasVal = val.length > 0;
      btn.disabled = !hasVal || templateLoading;
      btn.setAttribute('data-active', hasVal ? 'true' : 'false');
      CreationSessionStore.draft.story = CreationSessionStore.submitted && input.value.trim() === CreationSessionStore.story ? '' : input.value;
      const skip = document.getElementById('btn-skip-copilot');
      if (skip) { skip.disabled = !hasVal || templateLoading; skip.hidden = !!CreationSessionStore.selectedTemplate; }
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

  function submitPhase1Story(skipDiscussion = false) {
      const input = document.getElementById('story-input');
      const story = (input ? input.value.trim() : '') || CreationSessionStore.draft.story;
      if (!story || templateLoading) return;

      if (window.GenerationTask.getState().status === 'generating' || window.GenerationTask.getState().save.status === 'saving') { presentTask(window.GenerationTask.getState()); return; }
      if (story !== CreationSessionStore.story && window.GenerationTask.getState().status !== 'idle') window.GenerationTask.reset();
      CreationSessionStore.story = story;
      CreationSessionStore.submitted = true;
      CreationSessionStore.draft.story = '';
      window.CreationController.publish();
      if (skipDiscussion) {
          window.CreativeCopilot?.cancel();
          window.CreativeCopilot?.prepare(story);
          finishDiscussion();
      } else {
          const c = window.CreativeCopilot?.prepare(story);
          if (c) {
              c.active = true;
              if (!c.response && !c.busy && !c.error) window.CreativeCopilot.request('start');
              else {
                  window.CreativeCopilot.render();
                  document.getElementById('creative-copilot')?.scrollIntoView({ block: 'start', behavior: 'auto' });
              }
          } else switchPhase(2);
      }
  }
  window.submitPhase1Story = submitPhase1Story;

  // ════════════════════════════════════════════════════════════
  // 4. Phase 2 — Creative Direction
  // ════════════════════════════════════════════════════════════
  function triggerDirectionAiText() {
      const text = document.getElementById('direction-ai-text');
      const s = CreationSessionStore, b = s.creativeBrief?.confirmed;
      if (text) text.textContent = s.copilot?.lastInsight || '接下來選好影像語言，先預覽完整文字分鏡。';
      const reason = document.getElementById('direction-settings-reason');
      if (reason) { reason.textContent = b?.settingsReason || ''; reason.hidden = !reason.textContent; }
      const summary = document.getElementById('direction-thought-summary');
      if (summary) summary.innerHTML = window.AIActivity?.summaryMarkup(s.copilot?.response?.thoughtSummaries) || '';
      const notes = document.getElementById('direction-style-notes'), avoid = document.getElementById('direction-avoid');
      if (notes) notes.value = b?.styleNotes || '';
      if (avoid) avoid.value = b?.avoid?.join('、') || '';
      syncPersonalConditionSummaries();
      document.querySelectorAll('.direction-condition').forEach(details => { details.open = false; });
      const extra = document.getElementById('section-personal-style'); if (extra) extra.hidden = false;
      const discuss = document.getElementById('btn-direction-discuss'); if (discuss) discuss.hidden = false;
      const cursor = document.getElementById('direction-ai-cursor');
      if (cursor) cursor.hidden = true;
  }

  function syncPersonalConditionSummaries() {
      const notes = document.getElementById('direction-style-notes'), avoid = document.getElementById('direction-avoid');
      const notesSummary = document.getElementById('direction-style-notes-summary'), avoidSummary = document.getElementById('direction-avoid-summary');
      if (notesSummary) notesSummary.textContent = notes?.value.trim() || '沿用目前選擇的視覺風格';
      if (avoidSummary) avoidSummary.textContent = avoid?.value.trim() || '尚未指定避免元素';
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

      const suggestedStyle = CreationSessionStore.creativeBrief?.confirmed.baseStyle;
      const suggestedIndex = suggestedStyle ? window.CreativeBrief.styleIds.indexOf(suggestedStyle) : -1;
      const recs = suggestedIndex >= 0 && CreationSessionStore.creativeBrief?.sources?.baseStyle === 'ai' ? [suggestedIndex] : [];
      const savedStyleIndex = CreationSessionStore.styleIndex;
      const numericStyleIndex = typeof savedStyleIndex === 'number' || /^\d+$/.test(String(savedStyleIndex)) ? Number(savedStyleIndex) : NaN;
      if (Number.isInteger(numericStyleIndex) && STYLES[numericStyleIndex]) {
          CreationSessionStore.styleIndex = numericStyleIndex;
      } else {
          CreationSessionStore.styleIndex = recs[0] ?? 0;
      }

      STYLES.forEach((s, idx) => {
          const isRec = recs.includes(idx);
          const isSelected = idx === CreationSessionStore.styleIndex;

      const card = document.createElement('button');
          card.type = 'button';
          card.className = `style-card ${isSelected ? 'active' : ''} ${isRec ? 'is-recommended' : ''}`;
          card.dataset.index = idx;card.dataset.choiceOption = '';
          card.setAttribute('role','radio');card.setAttribute('aria-checked',String(isSelected));card.tabIndex=isSelected?0:-1;
          card.innerHTML = `<span class="style-card-info"><span class="style-card-name">${s.name}${isRec ? '<small class="copilot-recommend">推薦</small>' : ''}</span><span class="style-card-desc">${s.desc}</span></span><span class="style-card-check" aria-hidden="true">${isSelected ? '✓' : ''}</span>`;
          bindPageEvent(card, 'click', () => { if (!card.disabled && card.getAttribute('aria-disabled') !== 'true') selectStyleCard(idx); });
          grid.appendChild(card);
      });
  }

  function selectStyleCard(index) {
      if (!Number.isInteger(index) || !STYLES[index]) return;
      CreationSessionStore.styleIndex = index;
      if (CreationSessionStore.creativeBrief) window.CreativeBrief.edit(CreationSessionStore.creativeBrief, { baseStyle: window.CreativeBrief.styleIds[index], visualStyle: STYLES[index].name });
      document.querySelectorAll('.style-card').forEach(c => {
          const isTarget = Number(c.dataset.index) === index;
          c.classList.toggle('active', isTarget);
          c.setAttribute('aria-checked', String(isTarget));c.tabIndex=isTarget?0:-1;
          const check = c.querySelector('.style-card-check');
          if (check) check.textContent = isTarget ? '✓' : '';
      });
      window.ChoiceGroup.sync(document.getElementById('style-cards-grid'),document.querySelector('.style-card.active'));
      syncDirectionAction();
  }

  function syncRatioChips() {
      const ratio = CreationSessionStore.ratio || (CreationSessionStore.selectedTemplate ? '橫向16:9' : '直向9:16');
      document.querySelectorAll('.ratio-chip').forEach(c => {
          const selected = c.dataset.ratio === ratio;
          c.classList.toggle('active', selected);
          c.setAttribute('aria-checked', String(selected));c.tabIndex=selected?0:-1;
      });
      window.ChoiceGroup.sync(document.getElementById('ratio-chips-grid'),document.querySelector('.ratio-chip.active'));
      syncDirectionAction();
  }

  function selectRatioOption(btn) {
      if (!btn || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      const ratio = btn.dataset.ratio;
      CreationSessionStore.ratio = ratio;
      if (CreationSessionStore.creativeBrief) window.CreativeBrief.edit(CreationSessionStore.creativeBrief, { ratio: ratio.replace(/橫向|直向/g, '') });
      syncRatioChips();
  }
  window.selectRatioOption = selectRatioOption;

  function confirmDirectionAndAdvance() {
      if (CreationSessionStore.generationMode === 'template' && !CreationSessionStore.selectedTemplate) { switchPhase(3); return; }
      for (const [name, value] of Object.entries(CreationSessionStore.templateSuggestions || {})) if (!Object.hasOwn(CreationSessionStore.templateValues, name)) CreationSessionStore.templateValues[name] = value;
      CreationSessionStore.templateSuggestions = {};
      if (currentPlanMatches()) switchPhase(5);
      else { if (window.GenerationTask.getState().status !== 'generating') window.GenerationTask.reset(); switchPhase(4); }
  }
  window.confirmDirectionAndAdvance = confirmDirectionAndAdvance;

  // ════════════════════════════════════════════════════════════
  // 5. Phase 3 — Template Browser
  // ════════════════════════════════════════════════════════════
  let catalogTotal = 0, catalogRequest = 0, recommendationRequest = 0, recommendationPending = null;
  const browserState = () => CreationSessionStore.templateSelectionState;
  const CAT_MAP = { product: '商品廣告', story: '敘事紀實', twist: '高留存節奏', custom: '團隊資產' };
  async function ensureTemplatesLoaded(append = false) {
      const mount = pageController, ticket = ++catalogRequest;
      templateLoading = true; renderTemplateBrowser();
      try {
          const query = new URLSearchParams({ view: 'index', ...browserState(), offset: append ? TEMPLATES.length : 0, limit: 50 });
          const res = await fetch('/api/get-templates?' + query, { signal: mount?.signal });
          if (!res.ok) throw new Error('模板載入失敗，請重試。');
          const data = await res.json();
          if (pageController !== mount || mount?.signal.aborted || ticket !== catalogRequest) return TEMPLATES;
          TEMPLATES = append ? [...TEMPLATES, ...data.items] : data.items;
          catalogTotal = data.total; templateError = null;
      } catch (error) {
          if (error.name !== 'AbortError' && ticket === catalogRequest) templateError = error.message;
      } finally {
          if (ticket === catalogRequest && pageController === mount) { templateLoading = false; renderTemplateBrowser(); }
      }
      return TEMPLATES;
  }
  async function recommendTemplates() {
      const s = CreationSessionStore;
      const key = JSON.stringify({ story: s.story, brief: window.CreativeBrief?.snapshot(s.creativeBrief), provider: window.spaAuth?.getAiProvider?.() || 'gemini' });
      if (recommendationPending === key || s.templateRecommendation?.key === key) return;
      recommendationPending = key;
      const ticket = ++recommendationRequest, mount = pageController, sessionId = s.sessionId;
      const label = document.getElementById('template-rec-text');
      if (label) label.textContent = '正在尋找適合故事的模板，你可以先手動選擇。';
      try {
          const response = await fetch('/api/templates/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(window.spaAuth?.getToken?.() ? { Authorization: `Bearer ${window.spaAuth.getToken()}` } : {}) }, body: key, signal: mount.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          if (ticket !== recommendationRequest || s.sessionId !== sessionId || mount.signal.aborted) return;
          s.templateRecommendation = { key, items: data.recommendations || [] };
          renderTemplateBrowser();
      } catch (error) {
          if (!mount.signal.aborted && ticket === recommendationRequest && label) label.textContent = '暫時無法推薦，仍可手動搜尋與選擇模板。';
      } finally { if (ticket === recommendationRequest) recommendationPending = null; }
  }
  function renderTemplateBrowser() {
      const categories = document.getElementById('template-category-chips'), state = browserState();
      if (!document.getElementById('template-cards-container')) return;
      if (categories) {
          categories.innerHTML = [['全部', '全部模板'], ...Object.entries(CAT_MAP)].map(([id, label]) => `<button type="button" class="tpl-cat-chip ${state.category === id ? 'active' : ''}" aria-pressed="${state.category === id}" data-cat="${id}">${label}</button>`).join('');
          categories.querySelectorAll('button').forEach(button => bindPageEvent(button, 'click', () => { state.category = button.dataset.cat; state.scrollTop = 0; ensureTemplatesLoaded(); }));
      }
      const recommendations = CreationSessionStore.templateRecommendation?.items || [];
      let list = TEMPLATES;
      if (state.category === '全部' && !state.query && !state.tag && state.sort === 'catalog') {
          const recommended = recommendations.map(item => item.template).filter(Boolean);
          list = [...new Map([...recommended, ...TEMPLATES].map(item => [item.id, item])).values()];
      }
      renderFilteredTemplates(list);
      const text = document.getElementById('template-rec-text');
      if (text && recommendations.length) text.textContent = '推薦僅供參考，請自行選擇適合的敘事結構。';
      const more = document.getElementById('template-load-more');
      if (more) { more.hidden = TEMPLATES.length >= catalogTotal; more.disabled = templateLoading; }
      const tag = document.getElementById('template-tag-filter');
      if (tag && !tag.value) tag.placeholder = '篩選標籤';
  }
  function previewTemplate(id) {
      const container = document.getElementById('template-cards-container');
      browserState().scrollTop = container?.scrollTop || 0;
      CreationSessionStore.currentStep = 'template-selection';
      window.CreationController.checkpoint();
      window.spaNavigate('template', { templateId: id, creationPreview: true });
  }
  function renderFilteredTemplates(templates) {
      const container = document.getElementById('template-cards-container');
      if (!container) return;
      const escape = escapePlan;
      const recommendations = CreationSessionStore.templateRecommendation?.items || [];
      container.setAttribute('aria-busy', String(templateLoading));
      container.classList.add('template-selection-rows');
      container.innerHTML = templates.map(template => {
          const presentation = window.TemplatePresentation.present(template), selected = CreationSessionStore.selectedTemplate?.id === template.id;
          const recommendation = recommendations.find(item => item.id === template.id);
          const videoId = template.source?.videoId;
          const thumbnail = window.TemplatePresentation.externalUrl(template.thumbnail || (videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : ''));
          return `<article class="template-selection-row ${selected ? 'selected' : ''}" data-id="${escape(template.id)}">
              <div class="template-row-thumbnail">${thumbnail ? `<img loading="lazy" src="${escape(thumbnail)}" alt="" width="320" height="180">` : '<span>尚無封面</span>'}</div>
              <div class="template-row-info"><h3>${escape(presentation.title)}${recommendation ? '<small class="copilot-recommend">推薦</small>' : ''}</h3><p>${escape(presentation.summary)}</p>
              <span>${escape(CAT_MAP[template.category] || '團隊資產')} · ${Number(template.structureCount ?? template.structure?.length ?? 0)} 個敘事節點</span>
              <div class="template-card-tags">${presentation.tags.slice(0, 3).map(tag => `<span>${escape(tag)}</span>`).join('')}</div>
              <small>${escape(template.source?.channel || template.source?.title || '未提供來源影片資訊')}</small>${recommendation ? `<p class="section-hint">${escape(recommendation.reason)}</p>` : ''}</div>
              <div class="template-row-actions"><button type="button" data-preview="${escape(template.id)}" class="template-circle-btn" aria-label="預覽 ${escape(presentation.title)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button>
              <button type="button" data-select="${escape(template.id)}" class="template-circle-btn ${selected ? 'is-selected' : ''}" aria-pressed="${selected}" aria-label="${selected ? '取消選擇' : '選擇'} ${escape(presentation.title)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button></div></article>`;
      }).join('') || `<p class="tpl-empty-hint" role="status">${escape(templateError || (templateLoading ? '正在載入模板…' : '沒有符合條件的模板，請調整篩選。'))}</p>`;
      container.querySelectorAll('[data-preview]').forEach(button => bindPageEvent(button, 'click', () => previewTemplate(button.dataset.preview)));
      container.querySelectorAll('[data-select]').forEach(button => bindPageEvent(button, 'click', () => selectTemplateCard({ id: button.dataset.select })));
      container.querySelectorAll('img').forEach(img => bindPageEvent(img, 'error', () => { img.hidden = true; }));
      container.scrollTop = browserState().scrollTop || 0;
      window.DynamicMaskSystem?.attach?.(container, { maskSize: 36, direction: 'vertical' });
      window.DynamicMaskSystem?.update?.(container);
      const confirm = document.getElementById('btn-template-confirm');
      if (confirm) { confirm.disabled = !CreationSessionStore.selectedTemplate || templateLoading; confirm.textContent = '確認模板，繼續討論'; }
  }
  async function selectTemplateCard(template) {
      if (CreationSessionStore.selectedTemplate?.id === template.id) {
          window.CreationController.selectTemplate(null); renderTemplateSelection(); renderTemplateBrowser(); return;
      }
      const mount = pageController, sessionId = CreationSessionStore.sessionId;
      const ticket = ++templateSelectionRequest;
      templateLoading = true; renderTemplateBrowser();
      try {
          const response = await fetch('/api/templates/' + encodeURIComponent(template.id), { signal: mount.signal });
          const full = await response.json();
          if (!response.ok) throw new Error(full.error || '模板載入失敗');
          if (pageController !== mount || mount.signal.aborted || sessionId !== CreationSessionStore.sessionId || ticket !== templateSelectionRequest) return;
          window.CreationController.selectTemplate(full);
          templateError = null;
      } catch (error) { if (!mount.signal.aborted && ticket === templateSelectionRequest) templateError = error.message; }
      finally { if (pageController === mount && ticket === templateSelectionRequest) { templateLoading = false; renderTemplateSelection(); renderTemplateBrowser(); } }
  }
  let templateSelectionRequest = 0;
  function finishDiscussion() {
      const s = CreationSessionStore;
      if (s.generationMode === 'template' && !s.selectedTemplate) { switchPhase(3); recommendTemplates(); return; }
      if (s.selectedTemplate && s.discussionStage === 'story' && window.FreeformStoryboard.variables(s.selectedTemplate).length) {
          switchPhase(1); window.CreativeCopilot.startTemplateDiscussion(); return;
      }
      s.discussionStage = s.selectedTemplate ? 'complete' : 'story';
      switchPhase(2); renderTemplateSelection();
  }
  function skipTemplateAndGenerate() {
      window.CreationController.setTemplateMode(false);
      templateError = null; renderTemplateSelection(); switchPhase(2);
  }
  window.skipTemplateAndGenerate = skipTemplateAndGenerate;
  function applySelectedTemplateAndGenerate() {
      if (!CreationSessionStore.selectedTemplate?.structure?.length) { templateError = '請選擇含有敘事結構的模板。'; renderTemplateBrowser(); return; }
      switchPhase(1);
      window.CreativeCopilot.startTemplateDiscussion();
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
          confirmBeforeImages: CreationSessionStore.confirmBeforeImages,
          creativeBrief: window.CreativeBrief?.snapshot(CreationSessionStore.creativeBrief),
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
          const entering = resultWrap.style.display !== 'flex';
          resultWrap.style.display = 'flex';
          if (entering && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
              phaseAnimations.push(resultWrap.animate([{ opacity: 0, filter: 'blur(5px)', transform: 'translateY(8px)' }, { opacity: 1, filter: 'blur(0)', transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.4,0,.2,1)' }));
          }
      }

      const assistantResult = document.getElementById('result-assistant-message');
      if (assistantResult) assistantResult.textContent = task.status === 'completed' && !task.result.failedShotIndexes.length ? assistantCopy.completed : '';
      window.TemplateWorkflow.results(task);
  }

  function abortGeneration() {
      if (!window.GenerationTask.cancel()) switchPhase(2, false);
  }
  window.abortGeneration = abortGeneration;

  function clearGenerateWorkspaceUI() {
      renderedPlan = ''; requestedTemplateId = null; templateLoading = false;
      const resultWrap = document.getElementById('generation-result-wrap');
      if (resultWrap) resultWrap.style.display = 'none';
      const progressWrap = document.getElementById('generation-progress-wrap');
      if (progressWrap) progressWrap.style.display = 'none';
      for (const id of ['storyboard-grid', 'generated-storyboard-body', 'plan-shots']) document.getElementById(id)?.replaceChildren();
      const confirmation = document.getElementById('confirm-before-images');
      if (confirmation) confirmation.checked = false;
      const grid = document.getElementById('storyboard-grid');
      if (grid) grid.hidden = false;
      const table = document.getElementById('generated-storyboard-table');
      if (table) table.hidden = true;
      window.CreativeCopilot?.render();
      const errorBanner = document.getElementById('generation-error-banner');
      if (errorBanner) errorBanner.hidden = true;
      const recovery = document.getElementById('creation-recovery-notice');
      if (recovery) { recovery.textContent = ''; recovery.hidden = true; }
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
      window.QuickCompose?.updateProgress?.();
      switchPhase(1);
  }

  async function resetCreationWorkflow() {
      if (!await window.CreationController.newCreation()) return;
      clearGenerateWorkspaceUI();
  }
  window.resetCreationWorkflow = resetCreationWorkflow;

  async function startNewGenerationSession() {
      const confirmed = window.DialogService?.confirm
          ? (await window.DialogService.confirm({
              title: '是否結束目前的工作階段',
              description: '結束後生成階段會回歸到初始狀態並重新開始，不會保留紀錄。',
              confirmText: '結束並重新開始',
              cancelText: '取消',
              danger: true
          }))?.confirmed === true
          : (window.confirm?.('是否結束目前的工作階段\n結束後生成階段會回歸到初始狀態並重新開始，不會保留紀錄。') ?? false);
      if (!confirmed) return;
      const returnContext = CreationSessionStore.returnContext;
      const prevRoute = window.CreationController?.previousRoute;
      const targetPage = (returnContext?.page && returnContext.page !== 'generate')
          ? returnContext.page
          : (prevRoute && prevRoute !== 'generate' ? prevRoute : 'dashboard');
      const isMobile = window.AppShell?.isMobileView?.()
          || Boolean(window.matchMedia?.('(max-width: 768px), (max-width: 767px) and (orientation: portrait), (max-width: 480px)').matches);
      window.CreationController.reset({ preserveSurface: true });
      if (isMobile && window.spaNavigate && (window.QuickCompose?.open || window.CreationController?.openQuickCompose)) {
          window.QuickCompose?.updateProgress?.();
          await window.spaNavigate(targetPage, { ...(returnContext?.templateId ? { templateId: returnContext.templateId } : {}), skipLeaveGuard: true });
          if (window.QuickCompose?.open) window.QuickCompose.open();
          else window.CreationController?.openQuickCompose?.();
          return;
      }
      clearGenerateWorkspaceUI();
  }
  window.startNewGenerationSession = startNewGenerationSession;

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
      return task.status === 'awaiting_confirmation' && task.input.selectedTemplate?.id === session.selectedTemplate?.id && JSON.stringify(task.input.templateValues || {}) === JSON.stringify(session.templateValues || {}) &&
          task.input.story === session.story && task.input.style.name === STYLES[session.styleIndex || 0].name &&
          task.input.ratio === session.ratio && task.input.duration === (session.duration || 30) &&
          JSON.stringify(task.input.creativeBrief || null) === JSON.stringify(window.CreativeBrief?.snapshot(session.creativeBrief) || null);
  }
  function syncDirectionAction() {
      const button = document.getElementById('btn-direction-next');
      if (button) button.textContent = currentPlanMatches() ? '返回分鏡企劃' : CreationSessionStore.confirmBeforeImages ? '規劃文字分鏡' : '開始生成分鏡';
  }
  function syncDuration() {
      document.querySelectorAll('[data-duration]').forEach(button => {
          const selected = Number(button.dataset.duration) === (CreationSessionStore.duration || 30);
          button.setAttribute('aria-checked',String(selected));button.tabIndex=selected?0:-1;
      });
      window.ChoiceGroup.sync(document.querySelector('.duration-options'),document.querySelector('[data-duration][aria-checked="true"]'));
      const current = document.getElementById('duration-current');
      if (current) { const custom = ![15,30,45,60].includes(CreationSessionStore.duration || 30);current.hidden = !custom;current.textContent = custom ? `目前設定：${CreationSessionStore.duration} 秒` : ''; }
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
      clearInterval(retryDisplayTimer); retryDisplayTimer = null;
      if (task.retry && task.status === 'generating') {
          retryDisplayTimer = setInterval(() => {
              const current = window.GenerationTask.getState();
              const caption = document.getElementById('gen-status-text');
              if (caption) caption.textContent = window.GenerationTask.retryStatus(current);
          }, 250);
      }
      syncMathLoader(task);
      syncAssistant(task);
      const edit = document.getElementById('context-edit-btn');
      if (edit) edit.disabled = task.status === 'generating';
      if (task.status === 'idle') return;
      updateTopNav(CreationSessionStore.currentPhase);
      if (task.status === 'awaiting_confirmation') {
          if (CreationSessionStore.currentPhase !== 5) switchPhase(5);
          renderPlan(task);
          const planMessage = document.getElementById('plan-assistant-message');
          if (planMessage) planMessage.textContent = assistantCopy.planned;
          const summary = document.getElementById('plan-thought-summary');
          if (summary) summary.innerHTML = window.AIActivity?.summaryMarkup(task.activity?.thoughtSummaries) || '';
          return;
      }
      updateGenProgress(task.progress.pct, window.GenerationTask.retryStatus(task), task.progress.activeStepId);
      const track = document.getElementById('gen-progress-track');
      const count = document.getElementById('gen-status-pct');
      if (track) track.hidden = !task.progress.total;
      if (count) count.textContent = task.progress.total ? task.progress.completed + ' / ' + task.progress.total : '';
      const summary = document.getElementById('planning-thought-summary');
      if (summary) summary.innerHTML = task.stage === 'images' ? '' : window.AIActivity?.summaryMarkup(task.activity?.thoughtSummaries) || '';
      if (task.status === 'completed' && CreationSessionStore.currentPhase === 4) {
          if (task.save.status === 'saved' && task.projectId && typeof window.navigate === 'function') {
              window.navigate('project', { id: task.projectId });
              return;
          }
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
          if (CreationSessionStore.currentPhase !== 4) switchPhase(4, false);
          const title = document.querySelector('.generation-phase-title');
          if (title) title.textContent = task.stage === 'images' ? '圖片生成已中斷' : '分鏡規劃需要調整';
          document.getElementById('generation-progress-wrap').style.display = 'none';
          document.getElementById('generation-result-wrap').style.display = 'none';
      }
  }

  function initGeneratePage(options = {}) {
      if (options.sessionId && options.sessionId !== CreationSessionStore.sessionId) return null;
      unmountGeneratePage();
      if (options.signal?.aborted) return null;
      pageController = new AbortController();
      document.title = '生成分鏡 — Storyboard AI';
      const recovery = document.getElementById('creation-recovery-notice');
      if (recovery) { recovery.textContent = CreationSessionStore.recoveryNotice; recovery.hidden = !recovery.textContent; }
      window.CreativeCopilot?.mount(pageController.signal, action => {
          if (action === 'advance' || action === 'ready') finishDiscussion();
          if (action === 'discuss') switchPhase(1);
          if (action === 'edit-story') switchPhase(1);
      });
      const mode = document.getElementById('use-template-generation');
      if (mode) mode.checked = CreationSessionStore.generationMode === 'template';
      bindPageEvent(mode, 'change', () => { window.CreationController.setTemplateMode(mode.checked); renderTemplateSelection(); });
      bindPageEvent(document.getElementById('browse-template-library'), 'click', () => { window.CreationController.checkpoint(); window.spaNavigate('template'); });
      bindPageEvent(document.getElementById('remove-selected-template'), 'click', () => { window.CreationController.setTemplateMode(false); if (mode) mode.checked = false; renderTemplateSelection(); });
      bindPageEvent(document.getElementById('change-selected-template'), 'click', () => { window.CreationController.setTemplateMode(true); switchPhase(3); });
      bindPageEvent(document.getElementById('btn-new-creation-session'), 'click', () => {
          startNewGenerationSession();
      });
      bindPageEvent(document.getElementById('btn-workspace-back'), 'click', () => {
          const phase = CreationSessionStore.currentPhase;
          if (phase === 5) { switchPhase(2); return; }
          if (phase === 2 || phase === 3) { switchPhase(1); return; }
          const context = CreationSessionStore.returnContext || { page: window.CreationController.previousRoute || 'dashboard' };
          window.spaNavigate(context.page || 'dashboard', { templateId: context.templateId });
      });
      let searchTimer;
      pageController.signal.addEventListener('abort', () => clearTimeout(searchTimer), { once: true });
      for (const [id, key] of [['template-search', 'query'], ['template-tag-filter', 'tag'], ['template-sort', 'sort']]) {
          const control = document.getElementById(id);
          if (control) control.value = browserState()[key];
          bindPageEvent(control, key === 'sort' ? 'change' : 'input', () => {
              browserState()[key] = control.value; browserState().scrollTop = 0;
              window.CreationController.checkpoint(); clearTimeout(searchTimer);
              searchTimer = setTimeout(() => ensureTemplatesLoaded(), key === 'sort' ? 0 : 180);
          });
      }
      bindPageEvent(document.getElementById('template-sort-direction'), 'click', () => { browserState().direction = browserState().direction === 'asc' ? 'desc' : 'asc'; ensureTemplatesLoaded(); });
      bindPageEvent(document.getElementById('template-load-more'), 'click', () => ensureTemplatesLoaded(true));
      bindPageEvent(document.getElementById('template-cards-container'), 'scroll', event => { browserState().scrollTop = event.target.scrollTop; });
      bindPageEvent(document.getElementById('btn-direction-discuss'), 'click', () => window.CreativeCopilot?.discuss());
      const updateStyleConditions = () => {
          window.CreativeCopilot?.prepare(CreationSessionStore.story);
          window.CreativeBrief.edit(CreationSessionStore.creativeBrief, {
              styleNotes: document.getElementById('direction-style-notes').value.trim(),
              avoid: document.getElementById('direction-avoid').value.split('、').map(t => t.trim()).filter(Boolean)
          });
          syncPersonalConditionSummaries();
          syncDirectionAction();
      };
      bindPageEvent(document.getElementById('direction-style-notes'), 'input', updateStyleConditions);
      bindPageEvent(document.getElementById('direction-avoid'), 'input', updateStyleConditions);
      document.querySelectorAll('.direction-condition').forEach(details => bindPageEvent(details, 'toggle', () => {
          details.querySelector('summary small').textContent = details.open ? '收合' : '修改';
      }));
      const confirmPlanOption = document.getElementById('confirm-before-images');
      if (confirmPlanOption) confirmPlanOption.checked = CreationSessionStore.confirmBeforeImages;
      bindPageEvent(confirmPlanOption, 'change', () => { CreationSessionStore.confirmBeforeImages = confirmPlanOption.checked; syncDirectionAction(); });
      bindPageEvent(document.getElementById('btn-skip-copilot'), 'click', () => submitPhase1Story(true));
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
      renderedPlan = ''; requestedTemplateId = null; templateLoading = false;
      document.querySelectorAll('[data-duration]').forEach(button => bindPageEvent(button, 'click', () => {
          if (button.disabled || button.getAttribute('aria-disabled') === 'true') return;
          CreationSessionStore.duration = Number(button.dataset.duration);
          if (CreationSessionStore.creativeBrief) window.CreativeBrief.edit(CreationSessionStore.creativeBrief, { duration: CreationSessionStore.duration });
          syncDuration();
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
      requestedTemplateId = options.templateId || window.preselectedTemplateId || (!CreationSessionStore.selectedTemplate && CreationSessionStore.selectedTemplateId) || null;
      window.preselectedTemplateId = null;
      templateLoading = false; templateError = null;
      if (requestedTemplateId && window.GenerationTask.getState().status === 'idle') {
          CreationSessionStore.ratio = '直向9:16';
      }
      bindPageEvent(document.getElementById('btn-reload-template'), 'click', () => requestedTemplateId ? loadRequestedTemplate() : ensureTemplatesLoaded().then(() => { renderTemplateBrowser(); renderTemplateSelection(); }));
      bindPageEvent(document.getElementById('btn-retry-generation'), 'click', () => { window.GenerationTask.retry(); switchPhase(4, false); });
      bindPageEvent(document.getElementById('btn-edit-generation-brief'), 'click', () => { document.getElementById('generation-error-banner').hidden = true; switchPhase(1); });
      const input = document.getElementById('story-input');
      if (input && !input.dataset.bound) {
          window.addEventListener('resize', onStoryInput, { signal: pageController.signal });
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
              switchPhase(1);
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
      const task = window.GenerationTask.getState();
      const targetPhase = task.status === 'awaiting_confirmation' ? 5 : ['generating', 'completed'].includes(task.status)
          ? 4 : (['error', 'cancelled'].includes(task.status) ? 4
              : (options.creationIntent === 'new' && !CreationSessionStore.selectedTemplate ? 1 : options.targetPhase || CreationSessionStore.targetPhase || 1));

      if (story) {
          if (input) input.value = CreationSessionStore.draft.story || story;
      }

      const templateLoad = (requestedTemplateId && task.status !== 'generating' && requestedTemplateId !== CreationSessionStore.selectedTemplate?.id)
          ? loadRequestedTemplate()
          : (renderTemplateSelection(), null);

      unsubscribeTask = window.GenerationTask.subscribe(presentTask);
      switchPhase(targetPhase, false);
      const c = CreationSessionStore.copilot;
      const pendingQC = CreationSessionStore.entryMode === 'quick' && CreationSessionStore.submitted && !c?.active && !c?.retry && !c?.response && !c?.error;
      if (((options.creationIntent === 'new' && options.fromQC) || pendingQC) && task.status === 'idle' && story) {
          const startPendingQC = () => {
              if (pageController?.signal.aborted) return;
              if (CreationSessionStore.copilot) CreationSessionStore.copilot.stackEntered = true;
              submitPhase1Story();
          };
          if (templateLoad) templateLoad.then(startPendingQC);
          else startPendingQC();
      }
      return { unmount: () => {
          options.signal?.removeEventListener('abort', unmount);
          unmount();
      } };
  }
  window.initGeneratePage = initGeneratePage;

})();
