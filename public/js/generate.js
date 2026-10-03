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
  let pageController = null;
  let unsubscribeTask = null;
  let pageTimers = new Set();
  let boundNodes = new Set();
  let routeCleanup = null;
  let lastErrorTaskId = null;

  function pageTimeout(callback, ms) {
      const controller = pageController;
      const timer = setTimeout(() => {
          pageTimers.delete(timer);
          if (controller && pageController === controller && !controller.signal.aborted) callback();
      }, ms);
      pageTimers.add(timer);
      return timer;
  }

  function bindPageEvent(node, type, callback) {
      node.removeAttribute('on' + type); // Avoid running both HTML inline and mounted handlers.
      boundNodes.add(node);
      node.addEventListener(type, callback, { signal: pageController.signal });
  }

  function unmountGeneratePage() {
      routeCleanup?.();
      routeCleanup = null;
      pageController?.abort();
      pageController = null;
      unsubscribeTask?.();
      unsubscribeTask = null;
      pageTimers.forEach(clearTimeout);
      pageTimers.clear();
      if (typewriterTimer) clearTimeout(typewriterTimer);
      typewriterTimer = null;
      boundNodes.forEach(node => { delete node.dataset.bound; });
      boundNodes.clear();
      const container = document.getElementById('template-cards-container');
      window.DynamicMaskSystem?.detach?.(container);
      isTransitioningPhase = false;
  }
  let typewriterTimer = null;

  // ════════════════════════════════════════════════════════════
  // 2. Persistent Creation Surface Phase Transition Engine
  // ════════════════════════════════════════════════════════════
  async function switchPhase(targetPhase, animate = true) {
      if (isTransitioningPhase && animate) return;
      const mount = pageController;
      if (!mount || mount.signal.aborted) return;
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

          await new Promise(resolve => {
              const finish = () => {
                  mount.signal.removeEventListener('abort', finish);
                  resolve();
              };
              pageTimeout(finish, 220);
              mount.signal.addEventListener('abort', finish, { once: true });
          });
          if (pageController !== mount || mount.signal.aborted) return;

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

          pageTimeout(() => {
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
              pageTimeout(() => input.focus(), 150);
          }
      } else if (targetPhase === 2) {
          buildStyleCards();
          syncRatioChips();
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
              typewriterTimer = pageTimeout(tick, 22 + Math.random() * 15);
          } else {
              typewriterTimer = pageTimeout(() => {
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
          bindPageEvent(card, 'click', () => selectStyleCard(idx));
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
      const mount = pageController;
      try {
          const res = await fetch('/api/get-templates', { signal: mount?.signal });
          if (res.ok) {
              const templates = await res.json();
              if (pageController !== mount || mount?.signal.aborted) return TEMPLATES;
              TEMPLATES = templates;
          }
      } catch (err) {
          if (err.name === 'AbortError' || pageController !== mount || mount?.signal.aborted) return TEMPLATES;
          console.error("Failed to load templates:", err);
          TEMPLATES = [];
      }
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
          const storyName = CreationSessionStore.story ? `「${CreationSessionStore.story.slice(0, 14)}...」` : '你的故事';
          recBarText.textContent = `AI 已為${storyName}配對最佳剪輯序列`;
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
                  <button type="button" class="tpl-cat-chip ${isActive ? 'active' : ''}" data-cat="${item.id}">
                      ${item.label} <span class="count">(${catCounts[item.id] || 0})</span>
                  </button>
              `;
          }).join('');

          catsEl.querySelectorAll('.tpl-cat-chip').forEach(btn => {
              btn.onclick = () => {
                  catsEl.querySelectorAll('.tpl-cat-chip').forEach(x => x.classList.remove('active'));
                  btn.classList.add('active');
                  currentTemplateCategory = btn.dataset.cat;
                  renderFilteredTemplates(getTemplatesForCategory(currentTemplateCategory));
              };
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
      if (!templates || templates.length === 0) {
          containerEl.innerHTML = '<div class="tpl-empty-hint" style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; color: var(--gen-text-mid); font-size: 0.95rem;">此分類下目前無可用模板</div>';
          if (window.DynamicMaskSystem) {
              const maskInst = window.DynamicMaskSystem.get(containerEl);
              if (maskInst) maskInst.scheduleUpdate();
          }
          return;
      }

      templates.forEach(t => {
          const isSelected = CreationSessionStore.selectedTemplate?.id === t.id;
          const shotCount = t.shotsCount || (t.structure ? t.structure.length : 0);
          const tags = Array.isArray(t.tags) ? t.tags.slice(0, 3).map(tag => `<span>${tag}</span>`).join(' ') : '';
          const platforms = Array.isArray(t.platform) ? t.platform.map(p => `<span class="platform-badge">${p}</span>`).join('') : '<span class="platform-badge">shorts</span>';
          
          let duration = '0s';
          if (t.structure && t.structure.length) {
              const sumSec = t.structure.map(s => parseInt(s.duration) || 0).reduce((a, b) => a + b, 0);
              duration = `${sumSec}s`;
          }

          const totalSeconds = parseInt(duration) || Math.max(shotCount * 3, 15);
          const sourceUrl = t.videoUrl || t.source?.url || '';
          const youtubeMatch = sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);
          const sourceVideoId = t.source?.videoId || t.videoId || youtubeMatch?.[1] || '';
          const thumbnail = t.thumbnail || t.cover || t.source?.thumbnail || (sourceVideoId ? `https://i.ytimg.com/vi/${encodeURIComponent(sourceVideoId)}/hqdefault.jpg` : '');
          const paceLabel = totalSeconds <= 25 ? '快節奏' : totalSeconds <= 50 ? '中快節奏' : '敘事節奏';
          const statusLabel = t.category === 'custom' ? '團隊草稿' : '已驗證結構';
          const statusClass = t.category === 'custom' ? 'is-draft' : 'is-ready';

          const card = document.createElement('article');
          card.className = `template-card ${isSelected ? 'selected' : ''}`;
          card.id = `tpl-card-${t.id}`;
          card.dataset.id = t.id;
          card.tabIndex = 0;
          card.setAttribute('role', 'button');
          card.setAttribute('aria-label', `選擇 ${t.name || t.title || '無標題'} 模板`);

          card.innerHTML = `
            <div class="template-card-header">
              <div class="template-card-kicker">
                <span class="template-card-cat">${CAT_MAP[t.category] || t.category || '未分類'}</span>
                <span class="workflow-status ${statusClass}"><i></i>${statusLabel}</span>
              </div>
              <span class="template-selected-badge" style="${isSelected ? '' : 'display: none;'}">✓ 已選擇</span>
            </div>
            <div class="template-video-cover ${thumbnail ? '' : 'no-cover'}" aria-label="來源影片封面">
              ${thumbnail ? `<img src="${thumbnail}" alt="${t.source?.title || t.name || '來源影片'}封面" loading="lazy" onerror="this.parentElement.classList.add('no-cover');this.remove()">` : ''}
              <span class="cover-source">${sourceVideoId ? 'YOUTUBE' : 'SOURCE VIDEO'}</span>
              <span class="cover-duration">${duration}</span>
              <span class="cover-play" aria-hidden="true">▶</span>
            </div>
            <div class="template-card-body">
              <h4>${t.name || t.title || '無標題'}</h4>
              <p>${t.description || '精準結構爆點範本'}</p>
              <div class="template-card-tags">
                ${tags}
              </div>
            </div>
            <div class="template-specs" aria-label="剪輯規格">
              <span><b>${duration}</b> 長度</span>
              <span><b>${shotCount}</b> 鏡頭</span>
              <span><b>${paceLabel}</b> 節奏</span>
            </div>
            <div class="template-card-footer">
              <div class="platform-badges" aria-label="適用平台">
                ${platforms}<span class="aspect-badge">9:16</span>
              </div>
              <div class="card-actions">
                <button type="button" class="card-apply-btn ${isSelected ? 'is-selected' : ''}" data-action="apply" aria-label="選擇 ${t.name || t.title || '模板'}">${isSelected ? '✓ 已選中' : '選擇模板'}</button>
              </div>
            </div>
          `;

          bindPageEvent(card, 'click', () => {
              selectTemplateCard(t);
          });

          bindPageEvent(card, 'keydown', (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectTemplateCard(t);
              }
          });

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
      CreationSessionStore.selectedTemplate = tpl;
      document.querySelectorAll('#template-cards-container .template-card').forEach(c => {
          const isThis = c.dataset.id === tpl.id;
          c.classList.toggle('selected', isThis);
          const badge = c.querySelector('.template-selected-badge');
          if (badge) badge.style.display = isThis ? '' : 'none';
          const btn = c.querySelector('.card-apply-btn');
          if (btn) {
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
      switchPhase(4);
  }
  window.skipTemplateAndGenerate = skipTemplateAndGenerate;

  function applySelectedTemplateAndGenerate() {
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


  }

  function startGenerationWorkflow() {
      const task = window.GenerationTask.getState();
      if (task.status === 'generating' || task.status === 'completed') {
          presentTask(task);
          return;
      }
      if (!CreationSessionStore.story) return;
      return window.GenerationTask.start({
          story: CreationSessionStore.story,
          style: STYLES[CreationSessionStore.styleIndex] || STYLES[0],
          ratio: CreationSessionStore.ratio,
          selectedTemplate: CreationSessionStore.selectedTemplate
      });
  }

  function renderResults(task = window.GenerationTask.getState()) {
      const result = task.result;
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
      const count = result.generatedImgs.length;
      const stName = task.input.style.name;
      const r = task.input.ratio;
      if (metaEl) {
          metaEl.textContent = `${count} 個鏡頭 · ${stName} · ${r}`;
      }

      // Render Shots Grid
      const grid = document.getElementById('storyboard-grid');
      if (grid) {
          grid.innerHTML = '';
          result.generatedImgs.forEach((imgSrc, i) => {
              const card = document.createElement('div');
              card.className = 'shot-card';
              card.innerHTML = `
                  <div class="shot-card-thumb">
                      <img src="${imgSrc}" alt="Shot ${i + 1}">
                      <span class="shot-num-badge">#${i + 1}</span>
                  </div>
                  <div class="shot-card-meta">
                      <div class="shot-title">${result.generatedStoryTitles[i] || `鏡頭 ${i + 1}`}</div>
                      <div class="shot-cam">${result.generatedStoryCams[i] || '一般鏡頭'}</div>
                  </div>
              `;
              grid.appendChild(card);
          });
      }
  }

  function abortGeneration() {
      if (!window.GenerationTask.cancel()) switchPhase(2, false);
  }
  window.abortGeneration = abortGeneration;

  function resetCreationWorkflow() {
      window.GenerationTask.reset();
      CreationSessionStore.targetPhase = 1;
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
  function exportStoryboardJson() {
      const task = window.GenerationTask.getState();
      if (!task.input) return;
      const result = task.result;
      const exportData = {
          story: task.input.story,
          style: task.input.style.name,
          ratio: task.input.ratio,
          shots: result.generatedImgs.map((img, i) => ({
              shot: i + 1,
              title: result.generatedStoryTitles[i] || '',
              camera: result.generatedStoryCams[i] || '',
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
  function presentTask(task) {
      if (!pageController || pageController.signal.aborted) return;
      if (task.status === 'idle') return;
      updateGenProgress(task.progress.pct, task.progress.statusText, task.progress.activeStepId);
      if (task.status === 'completed' && CreationSessionStore.currentPhase === 4) {
          renderResults(task);
      } else if (task.status === 'generating') {
          const progress = document.getElementById('generation-progress-wrap');
          const result = document.getElementById('generation-result-wrap');
          if (progress) progress.style.display = 'flex';
          if (result) result.style.display = 'none';
      } else if (task.status === 'error') {
          if (lastErrorTaskId !== task.taskId) {
              lastErrorTaskId = task.taskId;
              alert('生成發生異常：' + task.error.message);
          }
          switchPhase(2, false);
      } else if (task.status === 'cancelled') {
          switchPhase(2, false);
      }
  }

  function initGeneratePage(options = {}) {
      unmountGeneratePage();
      if (options.signal?.aborted) return null;
      pageController = new AbortController();
      const mount = pageController;
      const unmount = () => { if (pageController === mount) unmountGeneratePage(); };
      options.signal?.addEventListener('abort', unmount, { once: true });
      routeCleanup = () => options.signal?.removeEventListener('abort', unmount);
      const input = document.getElementById('story-input');
      if (input && !input.dataset.bound) {
          input.dataset.bound = 'true';
          bindPageEvent(input, 'keydown', e => {
              if (e.key === 'Enter' && !e.shiftKey) {
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
      const targetPhase = ['generating', 'completed'].includes(task.status)
          ? 4 : (['error', 'cancelled'].includes(task.status) ? 2
              : (CreationSessionStore.targetPhase || (story ? 2 : 1)));

      if (story) {
          CreationSessionStore.story = story;
          if (input) input.value = story;
      }

      // If preselected template
      if (window.preselectedTemplateId) {
          ensureTemplatesLoaded().then(tpls => {
              if (pageController !== mount || mount.signal.aborted) return;
              const t = tpls.find(x => x.id === window.preselectedTemplateId);
              if (t) CreationSessionStore.selectedTemplate = t;
          });
      }

      unsubscribeTask = window.GenerationTask.subscribe(presentTask);
      switchPhase(targetPhase, false);
      return { unmount: () => {
          options.signal?.removeEventListener('abort', unmount);
          unmount();
      } };
  }
  window.initGeneratePage = initGeneratePage;

})();