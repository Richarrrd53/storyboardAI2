/**
 * Storyboard AI — Template Timeline Controller
 * Handles rendering the interactive video editing timeline and inspector.
 */

// Category mapping helper
const CAT_MAP = {
  'product': '商品廣告',
  'story': '敘事紀實',
  'twist': '高留存節奏',
  'custom': '團隊資產',
  '未分類': '未分類'
};

let currentTemplate = null;
let timelineDuration = 0; // Total duration in seconds
let currentSourcePlayer = null;
let currentSourcePlayerType = null;
let playerSyncFrame = null;
const TIMELINE_FPS = 30;

function formatEditorTimecode(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const wholeSeconds = Math.floor(safeSeconds);
  const frames = Math.min(TIMELINE_FPS - 1, Math.floor((safeSeconds - wholeSeconds) * TIMELINE_FPS));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;
  return [hours, minutes, secs, frames].map(value => String(value).padStart(2, '0')).join(':');
}

function stopPlayerTimelineSync() {
  if (playerSyncFrame) cancelAnimationFrame(playerSyncFrame);
  playerSyncFrame = null;
}

function syncTimelineFromPlayer() {
  stopPlayerTimelineSync();
  const update = () => {
    if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.getCurrentTime) {
      const time = currentSourcePlayer.getCurrentTime();
      if (Number.isFinite(time)) window.seekTimeline(time, { fromPlayer: true });
      if (currentSourcePlayer.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) playerSyncFrame = requestAnimationFrame(update);
    }
  };
  playerSyncFrame = requestAnimationFrame(update);
}

function loadYouTubePlayerApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (window.templateYouTubeApiPromise) return window.templateYouTubeApiPromise;
  window.templateYouTubeApiPromise = new Promise(resolve => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady();
      resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });
  return window.templateYouTubeApiPromise;
}

async function mountYouTubePlayer(videoId, title, templateId) {
  const mount = document.getElementById('detail-source-player');
  if (!mount) return;
  try {
    await loadYouTubePlayerApi();
    if (!document.getElementById('detail-source-player') || currentTemplate?.id !== templateId) return;
    currentSourcePlayerType = 'youtube';
    currentSourcePlayer = new window.YT.Player('detail-source-player', {
      videoId,
      playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
      events: {
        onReady: event => event.target.getIframe().setAttribute('title', `${title}原始影片播放器`),
        onStateChange: event => {
          if (event.data === window.YT.PlayerState.PLAYING) syncTimelineFromPlayer();
          else {
            stopPlayerTimelineSync();
            const time = event.target.getCurrentTime?.();
            if (Number.isFinite(time)) window.seekTimeline(time, { fromPlayer: true });
          }
        }
      }
    });
  } catch (error) {
    console.warn('YouTube 播放器初始化失敗', error);
  }
}

/**
 * Main entrance to render a template detail
 */
window.renderTemplateDetailTimeline = function(template, detailContainer) {
  stopPlayerTimelineSync();
  if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.destroy) {
    try { currentSourcePlayer.destroy(); } catch (_) {}
  }
  currentSourcePlayer = null;
  currentSourcePlayerType = null;
  currentTemplate = template;
  console.log("Rendering immersive timeline for template:", template);

  // 1. Toggle views
  const storeView = document.getElementById('template-store-view');
  const detailImmersive = document.getElementById('template-detail-immersive');
  if (storeView) storeView.style.display = 'none';
  if (detailImmersive) detailImmersive.style.display = 'flex';

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 2. Populate metadata headers
  document.getElementById('nav-template-name').textContent = template.name || template.title || '無標題';
  document.getElementById('detail-template-title').textContent = template.name || template.title || '無標題';
  document.getElementById('detail-template-desc').textContent = template.description || '無描述';

  // Populate source-video surfaces. YouTube templates derive their actual cover
  // directly from the source video ID; uploaded/custom templates use the stored poster.
  const sourceUrl = template.videoUrl || template.source?.url || '';
  const youtubeMatch = sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);
  const sourceVideoId = template.source?.videoId || template.videoId || youtubeMatch?.[1] || '';
  const sourceCover = template.thumbnail || template.cover || template.source?.thumbnail ||
    (sourceVideoId ? `https://i.ytimg.com/vi/${encodeURIComponent(sourceVideoId)}/hqdefault.jpg` : '');
  const sourceTitle = template.source?.title || template.name || template.title || '來源影片';
  const sourceChannel = template.source?.channel || (sourceVideoId ? 'YouTube 原始素材' : '自訂素材');
  const sourceThumbEl = document.getElementById('detail-source-thumb');
  const programMonitorEl = document.getElementById('detail-program-monitor');
  if (sourceThumbEl) sourceThumbEl.innerHTML = sourceCover ? `<img src="${sourceCover}" alt="${sourceTitle}封面">` : '<span>NO MEDIA</span>';
  if (programMonitorEl) {
    const fallback = programMonitorEl.querySelector('.nle-monitor-fallback');
    programMonitorEl.querySelectorAll('.nle-monitor-image, .nle-source-player').forEach(el => el.remove());
    if (sourceVideoId) {
      const playerMount = document.createElement('div');
      playerMount.id = 'detail-source-player';
      playerMount.className = 'nle-source-player';
      programMonitorEl.prepend(playerMount);
      mountYouTubePlayer(sourceVideoId, sourceTitle, template.id);
      if (fallback) fallback.hidden = true;
    } else if (sourceUrl && /\.(?:mp4|webm|ogg)(?:[?#]|$)/i.test(sourceUrl)) {
      const player = document.createElement('video');
      player.id = 'detail-source-player';
      player.className = 'nle-source-player';
      player.src = sourceUrl;
      player.poster = sourceCover;
      player.controls = true;
      player.playsInline = true;
      currentSourcePlayer = player;
      currentSourcePlayerType = 'html5';
      player.addEventListener('timeupdate', () => window.seekTimeline(player.currentTime, { fromPlayer: true }));
      player.addEventListener('seeking', () => window.seekTimeline(player.currentTime, { fromPlayer: true }));
      programMonitorEl.prepend(player);
      if (fallback) fallback.hidden = true;
    } else if (sourceCover) {
      const image = document.createElement('img');
      image.className = 'nle-monitor-image';
      image.src = sourceCover;
      image.alt = `${sourceTitle}影片封面`;
      image.onerror = () => image.remove();
      programMonitorEl.prepend(image);
      if (fallback) fallback.hidden = true;
    } else if (fallback) {
      fallback.hidden = false;
    }
  }
  const sourceTitleEl = document.getElementById('detail-source-title');
  const sourceChannelEl = document.getElementById('detail-source-channel');
  if (sourceTitleEl) sourceTitleEl.textContent = sourceTitle;
  if (sourceChannelEl) sourceChannelEl.textContent = sourceChannel;
  const sequenceNameEl = document.getElementById('detail-sequence-name');
  if (sequenceNameEl) sequenceNameEl.textContent = `${(template.name || 'SEQUENCE').slice(0, 22).toUpperCase()} · 9:16`;

  // Calculate total duration from shots
  const shots = Array.isArray(template.structure) ? template.structure : [];
  let totalSec = 0;
  shots.forEach(s => {
    const sec = parseInt(s.duration) || 3; // fallback 3s
    totalSec += sec;
  });
  timelineDuration = totalSec || 15; // default 15s if no shots

  const durationTimecodeEl = document.getElementById('detail-monitor-duration');
  if (durationTimecodeEl) durationTimecodeEl.textContent = formatEditorTimecode(timelineDuration);

  // Update badges
  document.getElementById('detail-category-badge').textContent = CAT_MAP[template.category] || template.category || '未分類';
  document.getElementById('detail-shots-count-badge').textContent = `${template.shotsCount || shots.length} 鏡頭`;
  document.getElementById('detail-duration-badge').textContent = `${timelineDuration}s`;

  // Update apply button click behavior
  const applyBtn = document.getElementById('btn-apply-template-main');
  if (applyBtn) {
    applyBtn.onclick = () => {
      window.spaNavigate('generate', { templateId: template.id });
    };
  }

  // 3. Render side overview panel (Right side)
  renderSideMetadata(template);

  // 4. Render timeline tracks (Ruler, Shots, AI Tracks)
  renderTimelineWidget(template);

  // 5. Initialize playhead position (Set to 0s)
  window.seekTimeline(0);

  // 6. Highlight first section (Hook) by default in inspector
  showHookInspector();
};

/**
 * Switch back to browse store grid
 */
window.backToStoreBrowse = function() {
  stopPlayerTimelineSync();
  if (currentSourcePlayerType === 'youtube') currentSourcePlayer?.pauseVideo?.();
  if (currentSourcePlayerType === 'html5') currentSourcePlayer?.pause?.();
  const storeView = document.getElementById('template-store-view');
  const detailImmersive = document.getElementById('template-detail-immersive');
  if (storeView) storeView.style.display = 'flex';
  if (detailImmersive) detailImmersive.style.display = 'none';

  // Trigger search refilter just in case
  if (window.filterStoreTemplates) {
    window.filterStoreTemplates();
  }
};

/**
 * Handle direct template click from spotlight or external calls
 */
window.triggerTemplateDetail = async function(templateId) {
  // If cache exists in spa-router, we find it. Else fetch it.
  let templates = [];
  if (window.cacheTemplatesList) {
    templates = window.cacheTemplatesList;
  } else {
    try {
      const res = await fetch('/api/get-templates');
      if (res.ok) {
        templates = await res.json();
        window.cacheTemplatesList = templates;
      }
    } catch (e) {
      console.error(e);
    }
  }

  const t = templates.find(x => x.id === templateId);
  if (t) {
    window.renderTemplateDetailTimeline(t, document.getElementById('template-detail-immersive'));
  } else {
    alert('找不到對應的模板！');
  }
};

/**
 * Helper to render side metadata panels
 */
function renderSideMetadata(t) {
  const varsList = Array.isArray(t.variables) ? t.variables : [];
  const platforms = Array.isArray(t.platform) ? t.platform.join(', ') : (t.platform || '無限制');
  const setText = (id, value, fallback = '—') => {
    const el = document.getElementById(id);
    if (el) el.textContent = value === undefined || value === null || value === '' ? fallback : value;
  };
  const setChips = (id, values) => {
    const el = document.getElementById(id);
    if (!el) return;
    const list = Array.isArray(values) ? values : (values ? [values] : []);
    el.replaceChildren(...(list.length ? list : ['—']).map(value => {
      const span = document.createElement('span');
      span.textContent = value;
      return span;
    }));
  };

  setText('detail-source-views', `觀看次數：${Number(t.source?.views || 0).toLocaleString('zh-TW')}`);
  setText('detail-template-version', `分析版本：v${t.version || '—'}`);
  setText('detail-confidence', `信心指數：${Number.isFinite(Number(t.confidence)) ? Math.round(Number(t.confidence) * 100) + '%' : '—'}`);
  setText('detail-bin-count', String((Array.isArray(t.structure) ? t.structure.length : 0) + 1));
  setChips('detail-variable-chips', varsList.map(v => `{${v}}`));
  setChips('detail-target-emotions', t.marketing?.targetEmotion);
  setChips('detail-platform-chips', Array.isArray(t.platform) ? t.platform.map(p => String(p).toUpperCase()) : t.platform);

  setText('detail-narrative-type', t.narrative?.type);
  setText('detail-narrative-tone', translateTone(t.narrative?.tone));
  setText('detail-pace', t.visualFlow?.pace);
  setText('detail-transition', t.visualFlow?.transitionStyle);
  setText('detail-narrative-structure', t.narrative?.structure);
  setText('detail-hook-type', `${t.hook?.type || '—'} · ${t.hook?.position || '—'}`);
  setText('detail-hook-description', t.hook?.description);
  setText('detail-marketing-method', t.marketing?.integrationMethod);
  setText('detail-brand-role', t.marketing?.brandRole);
  setText('detail-reveal-timing', t.marketing?.revealTiming);
  setText('detail-persuasion', t.marketing?.persuasionStyle);

  const promptList = document.getElementById('detail-prompt-list');
  if (promptList) {
    const prompts = Array.isArray(t.promptTemplate?.perShot) ? t.promptTemplate.perShot : [];
    promptList.replaceChildren(...(prompts.length ? prompts : ['尚無分鏡提示詞']).map((prompt, index) => {
      const item = document.createElement('div');
      item.innerHTML = `<b>${prompts.length ? `S${String(index + 1).padStart(2, '0')}` : '—'}</b><span></span>`;
      item.querySelector('span').textContent = prompt;
      return item;
    }));
  }

  document.querySelectorAll('.nle-bin-tabs [data-bin-tab]').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('.nle-bin-tabs [data-bin-tab]').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('[data-bin-page]').forEach(page => { page.hidden = page.dataset.binPage !== button.dataset.binTab; });
    };
  });

  document.querySelectorAll('.nle-inspector-tabs [data-inspector-tab]').forEach(button => {
    button.onclick = () => {
      document.querySelectorAll('.nle-inspector-tabs [data-inspector-tab]').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('.nle-inspector-page').forEach(page => page.classList.toggle('active', page.dataset.inspectorPage === button.dataset.inspectorTab));
    };
  });

  const storyboardBody = document.getElementById('template-storyboard-body');
  if (storyboardBody) {
    storyboardBody.innerHTML = '';
    const sourceId = t.source?.videoId || t.videoId || '';
    const cover = t.thumbnail || t.cover || t.source?.thumbnail || (sourceId ? `https://i.ytimg.com/vi/${encodeURIComponent(sourceId)}/hqdefault.jpg` : '');
    let startTime = 0;
    (Array.isArray(t.structure) ? t.structure : []).forEach((shot, index) => {
      const row = document.createElement('tr');
      const shotStart = startTime;
      const duration = parseInt(shot.duration) || 3;
      row.innerHTML = `
        <td class="script-shot-number">${String(shot.shot || index + 1).padStart(2, '0')}</td>
        <td class="script-preview-cell">${cover ? `<img src="${cover}" alt="鏡頭 ${index + 1} 來源畫面">` : '<span>NO IMAGE</span>'}</td>
        <td class="script-action-cell"><strong>${shot.action || '未提供畫面動作'}</strong><small>${t.promptTemplate?.perShot?.[index] || ''}</small></td>
        <td><span class="script-tech-label">${shot.camera || '—'}</span><small>${shot.angle || '—'}</small></td>
        <td class="script-duration-cell">${shot.duration || `${duration}s`}</td>
        <td class="script-purpose-cell"><strong>${translateEmotion(shot.emotion)}</strong><small>${shot.purpose || '—'}</small></td>`;
      row.onclick = () => {
        window.seekTimeline(shotStart);
        showShotInspector(shot, index, shotStart);
      };
      storyboardBody.appendChild(row);
      startTime += duration;
    });
    if (!storyboardBody.children.length) storyboardBody.innerHTML = '<tr><td colspan="6" class="script-empty">此模板尚無分鏡資料</td></tr>';
  }

  const timelineView = document.querySelector('.timeline-scroll-container');
  const scriptView = document.getElementById('storyboard-script-panel');
  document.querySelectorAll('[data-editor-view]').forEach(button => {
    button.onclick = () => {
      const isTimeline = button.dataset.editorView === 'timeline';
      document.querySelectorAll('[data-editor-view]').forEach(item => item.classList.toggle('active', item === button));
      if (timelineView) timelineView.hidden = !isTimeline;
      if (scriptView) scriptView.hidden = isTimeline;
    };
  });
  
  document.getElementById('meta-usecase').textContent = t.useCase || '短影音宣傳、生活/產品Vlog';
  document.getElementById('meta-platforms').textContent = platforms.toUpperCase();
  document.getElementById('meta-audience').textContent = t.analysis?.targetAudience || '大眾社群用戶';
  document.getElementById('meta-shotscount').textContent = `${t.shotsCount || (t.structure ? t.structure.length : 0)} 鏡`;
  document.getElementById('meta-duration').textContent = `${timelineDuration} 秒`;
  document.getElementById('meta-variables').textContent = varsList.length ? varsList.map(v => `{${v}}`).join(' · ') : '無變數';
  setText('meta-prompt-base', t.promptTemplate?.base);
  setText('meta-rhythm-pattern', t.visualFlow?.rhythmPattern);
  setText('meta-camera-control', Array.isArray(t.controls?.cameraIntensity) ? t.controls.cameraIntensity.join(' / ') : t.controls?.cameraIntensity);
  setText('meta-emotion-control', Array.isArray(t.controls?.emotionIntensity) ? t.controls.emotionIntensity.join(' / ') : t.controls?.emotionIntensity);

  document.getElementById('meta-why-it-works').innerHTML = formatTextWithLinks(t.analysis?.whyItWorks || '利用快節奏剪輯與大眾共鳴點開場，輔以視覺細節特寫，加深信任感與轉換效果。');

  const replicableUl = document.getElementById('meta-replicable-elements');
  replicableUl.innerHTML = '';
  const elements = Array.isArray(t.analysis?.replicableElements) ? t.analysis.replicableElements : ['前置懸念開場', '快節奏畫切換', '價格標註/結尾行動指引'];
  elements.forEach(el => {
    const li = document.createElement('li');
    li.innerHTML = formatTextWithLinks(el);
    replicableUl.appendChild(li);
  });
}

/**
 * Render Timeline Ruler ticks and tracks blocks
 */
function renderTimelineWidget(t) {
  const rulerTicks = document.getElementById('ruler-ticks');
  const shotsContainer = document.getElementById('track-shots-container');
  const hookContainer = document.getElementById('track-hook-container');
  const narrativeContainer = document.getElementById('track-narrative-container');
  const emotionContainer = document.getElementById('track-emotion-container');
  const qaContainer = document.getElementById('track-qa-container');
  const conflictContainer = document.getElementById('track-conflict-container');
  const outroContainer = document.getElementById('track-outro-container');

  // Clear previous outputs
  rulerTicks.innerHTML = '';
  shotsContainer.innerHTML = '';
  hookContainer.innerHTML = '';
  narrativeContainer.innerHTML = '';
  emotionContainer.innerHTML = '';
  qaContainer.innerHTML = '';
  conflictContainer.innerHTML = '';
  outroContainer.innerHTML = '';

  const seekFromPointer = (event, cell) => {
    const rect = cell.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    window.seekTimeline((clickX / rect.width) * timelineDuration);
  };

  // Click and drag scrubbing for frame-accurate positioning.
  rulerTicks.onpointerdown = event => {
    rulerTicks.setPointerCapture?.(event.pointerId);
    seekFromPointer(event, rulerTicks);
  };
  rulerTicks.onpointermove = event => {
    if (event.buttons === 1) seekFromPointer(event, rulerTicks);
  };

  // Add click handler to tracks cells too so clicking aligns playhead
  const contentCells = [shotsContainer, hookContainer, narrativeContainer, emotionContainer, qaContainer, conflictContainer, outroContainer];
  contentCells.forEach(cell => {
    cell.onpointerdown = function(e) {
      // Ignore if clicking on a block itself
      if (e.target !== cell) return;
      seekFromPointer(e, cell);
    };
  });

  const timelineBody = document.getElementById('timeline-editor-body');
  if (timelineBody) {
    timelineBody.tabIndex = 0;
    timelineBody.setAttribute('aria-label', '剪輯時間軸；使用左右方向鍵逐格定位，Shift 加方向鍵移動一秒');
    timelineBody.onkeydown = event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const current = Number(timelineBody.dataset.currentTime || 0);
      const step = event.shiftKey ? 1 : 1 / TIMELINE_FPS;
      window.seekTimeline(current + (event.key === 'ArrowRight' ? step : -step));
    };
  }

  // 1. Render Ruler Ticks (Every 1 second, labels every 5 seconds)
  for (let i = 0; i <= timelineDuration; i++) {
    const pct = (i / timelineDuration) * 100;
    
    // Draw thick/label every 5s, thin mark every 1s
    if (i % 5 === 0 || i === timelineDuration) {
      const tick = document.createElement('div');
      tick.className = 'ruler-tick-mark';
      tick.style.left = `${pct}%`;
      tick.style.borderLeft = '2px solid rgba(255, 255, 255, 0.25)';
      tick.innerHTML = `00:${i < 10 ? '0' + i : i}`;
      rulerTicks.appendChild(tick);
    } else {
      const tick = document.createElement('div');
      tick.className = 'ruler-tick-mark';
      tick.style.left = `${pct}%`;
      tick.style.height = '40%';
      tick.style.borderLeft = '1px solid rgba(255, 255, 255, 0.08)';
      rulerTicks.appendChild(tick);
    }
  }

  // 2. Render Shots Blocks
  const shots = Array.isArray(t.structure) ? t.structure : [];
  let accumulatedTime = 0;

  shots.forEach((shot, index) => {
    const dur = parseInt(shot.duration) || 3;
    const shotStart = accumulatedTime;
    const blockWidth = (dur / timelineDuration) * 100;
    const blockLeft = (shotStart / timelineDuration) * 100;

    const block = document.createElement('div');
    block.className = 'timeline-block shot-block';
    block.style.left = `${blockLeft}%`;
    block.style.width = `${blockWidth}%`;
    block.setAttribute('data-start', shotStart);
    block.setAttribute('data-end', shotStart + dur);
    block.setAttribute('data-shot-index', index);

    block.innerHTML = `<div>S${String(shot.shot || index + 1).padStart(2, '0')} · ${shot.action || shot.purpose || '未命名鏡頭'}</div>`;
    block.title = `${shot.camera || 'static'} / ${shot.angle || 'eye-level'} / ${dur}s`;

    block.onclick = (e) => {
      e.stopPropagation();
      window.seekTimeline(parseFloat(block.getAttribute('data-start')));
      highlightTimelineBlock(block);
      showShotInspector(shot, index, shotStart);
    };

    shotsContainer.appendChild(block);
    accumulatedTime += dur;
  });

  // 3. Render Hook Track (Coral, 0-3s, or first shot duration)
  const hookDur = Math.max(3, shots.length > 0 ? (parseInt(shots[0].duration) || 3) : 3);
  const hookWidth = (hookDur / timelineDuration) * 100;
  const hookBlock = document.createElement('div');
  hookBlock.className = 'timeline-block ai-block-hook';
  hookBlock.style.left = '0%';
  hookBlock.style.width = `${hookWidth}%`;
  hookBlock.innerHTML = `HOOK · ${t.hook?.type || 'curiosity'}｜${t.hook?.description || `0–${hookDur}s 開場`}`;
  hookBlock.onclick = (e) => {
    e.stopPropagation();
    window.seekTimeline(0);
    highlightTimelineBlock(hookBlock);
    showHookInspector();
  };
  hookContainer.appendChild(hookBlock);

  // 4. Render Narrative Track (Purple, from hookDur to end - Outro duration)
  const outroDur = shots.length > 0 ? (parseInt(shots[shots.length - 1].duration) || 5) : 5;
  const narrStart = hookDur;
  const narrEnd = Math.max(narrStart + 2, timelineDuration - outroDur);
  const narrDur = narrEnd - narrStart;
  const narrWidth = (narrDur / timelineDuration) * 100;
  const narrLeft = (narrStart / timelineDuration) * 100;

  const narrBlock = document.createElement('div');
  narrBlock.className = 'timeline-block ai-block-narrative';
  narrBlock.style.left = `${narrLeft}%`;
  narrBlock.style.width = `${narrWidth}%`;
  narrBlock.innerHTML = `NARRATIVE · ${t.narrative?.type || 'story'}｜${t.narrative?.structure || `${narrStart}–${narrEnd}s`}`;
  narrBlock.onclick = (e) => {
    e.stopPropagation();
    window.seekTimeline(narrStart);
    highlightTimelineBlock(narrBlock);
    showNarrativeInspector(narrStart, narrEnd);
  };
  narrativeContainer.appendChild(narrBlock);

  // 5. Render Outro & Brand Track (Gold, end - outroDur to end)
  const outroStart = timelineDuration - outroDur;
  const outroWidth = (outroDur / timelineDuration) * 100;
  const outroLeft = (outroStart / timelineDuration) * 100;

  const outroBlock = document.createElement('div');
  outroBlock.className = 'timeline-block ai-block-outro';
  outroBlock.style.left = `${outroLeft}%`;
  outroBlock.style.width = `${outroWidth}%`;
  outroBlock.innerHTML = `CTA · ${t.marketing?.integrationMethod || 'organic'}｜${t.marketing?.persuasionStyle || 'subtle'}`;
  outroBlock.onclick = (e) => {
    e.stopPropagation();
    window.seekTimeline(outroStart);
    highlightTimelineBlock(outroBlock);
    showOutroInspector(outroStart);
  };
  outroContainer.appendChild(outroBlock);

  // 6. Render Emotion Track (Cyan, separate blocks based on shot emotions)
  let curTime = 0;
  shots.forEach((shot, index) => {
    const dur = parseInt(shot.duration) || 3;
    if (shot.emotion && shot.emotion !== 'none') {
      const blockWidth = (dur / timelineDuration) * 100;
      const blockLeft = (curTime / timelineDuration) * 100;

      const emoBlock = document.createElement('div');
      emoBlock.className = 'timeline-block ai-block-emotion';
      emoBlock.style.left = `${blockLeft}%`;
      emoBlock.style.width = `${blockWidth}%`;
      emoBlock.innerHTML = `${translateEmotion(shot.emotion)} · S${String(index + 1).padStart(2, '0')}`;
      
      const shotStart = curTime;
      emoBlock.onclick = (e) => {
        e.stopPropagation();
        window.seekTimeline(shotStart);
        highlightTimelineBlock(emoBlock);
        showEmotionInspector(shot.emotion, shotStart, index + 1);
      };
      emotionContainer.appendChild(emoBlock);
    }
    curTime += dur;
  });

  // 7. Render Q&A Track (Green, dialogue / questions beats)
  // Scan shots for Q&A indicators like "問", "對話", "藏鏡人", "旁白問"
  let timePointer = 0;
  let qaCount = 0;
  shots.forEach((shot, index) => {
    const dur = parseInt(shot.duration) || 3;
    const actionText = shot.action || '';
    const purposeText = shot.purpose || '';
    
    const isQA = actionText.includes('問') || actionText.includes('對話') || actionText.includes('藏鏡人') ||
                 purposeText.includes('問') || purposeText.includes('懸念') || purposeText.includes('互動');

    if (isQA) {
      const blockWidth = (dur / timelineDuration) * 100;
      const blockLeft = (timePointer / timelineDuration) * 100;

      const qaBlock = document.createElement('div');
      qaBlock.className = 'timeline-block ai-block-qa';
      qaBlock.style.left = `${blockLeft}%`;
      qaBlock.style.width = `${blockWidth}%`;
      qaBlock.innerHTML = `INTERACTION · S${String(index + 1).padStart(2, '0')}`;
      
      const shotStart = timePointer;
      const actCopy = actionText;
      qaBlock.onclick = (e) => {
        e.stopPropagation();
        window.seekTimeline(shotStart);
        highlightTimelineBlock(qaBlock);
        showQAInspector(actCopy, shotStart, index + 1);
      };
      qaContainer.appendChild(qaBlock);
      qaCount++;
    }
    timePointer += dur;
  });

  // If no Q&A indicators, render a default "🗣️ 互動提問時機" beat around middle
  if (qaCount === 0) {
    const midStart = Math.floor(timelineDuration * 0.4);
    const midDur = Math.min(4, Math.floor(timelineDuration * 0.15));
    const blockWidth = (midDur / timelineDuration) * 100;
    const blockLeft = (midStart / timelineDuration) * 100;

    const qaBlock = document.createElement('div');
    qaBlock.className = 'timeline-block ai-block-qa';
    qaBlock.style.left = `${blockLeft}%`;
    qaBlock.style.width = `${blockWidth}%`;
    qaBlock.innerHTML = `INTERACTION · 建議提問點`;
    qaBlock.onclick = (e) => {
      e.stopPropagation();
      window.seekTimeline(midStart);
      highlightTimelineBlock(qaBlock);
      showQAInspector('此模板適合在影片約 ' + midStart + 's 處由藏鏡人發出引導式提問。', midStart, '建議時機');
    };
    qaContainer.appendChild(qaBlock);
  }

  // 8. Render Visual Conflict Track (Orange, screen disruption / closeups / text overlays)
  let tPointer = 0;
  let conflictCount = 0;
  shots.forEach((shot, index) => {
    const dur = parseInt(shot.duration) || 3;
    const cameraText = shot.camera || '';
    const actionText = shot.action || '';
    const angleText = shot.angle || '';

    // Conflict criteria: close-up, extreme close-up, handheld, slice, asmr, text/ui overlay
    const isConflict = cameraText.includes('close-up') || cameraText.includes('handheld') || cameraText.includes('tracking') ||
                       actionText.includes('特特寫') || actionText.includes('截圖') || actionText.includes('切') || 
                       actionText.includes('聲') || actionText.includes('ASMR') || angleText.includes('high') || angleText.includes('low');

    if (isConflict) {
      const blockWidth = (dur / timelineDuration) * 100;
      const blockLeft = (tPointer / timelineDuration) * 100;

      const confBlock = document.createElement('div');
      confBlock.className = 'timeline-block ai-block-conflict';
      confBlock.style.left = `${blockLeft}%`;
      confBlock.style.width = `${blockWidth}%`;
      confBlock.innerHTML = `ATTENTION RESET · ${cameraText || angleText || 'CUT'}`;

      const shotStart = tPointer;
      const angle = angleText;
      const cam = cameraText;
      const act = actionText;
      confBlock.onclick = (e) => {
        e.stopPropagation();
        window.seekTimeline(shotStart);
        highlightTimelineBlock(confBlock);
        showConflictInspector(cam, angle, act, shotStart, index + 1);
      };
      conflictContainer.appendChild(confBlock);
      conflictCount++;
    }
    tPointer += dur;
  });

  // Default conflict timing if none identified
  if (conflictCount === 0) {
    const confStart = Math.floor(timelineDuration * 0.6);
    const confDur = 3;
    const blockWidth = (confDur / timelineDuration) * 100;
    const blockLeft = (confStart / timelineDuration) * 100;

    const confBlock = document.createElement('div');
    confBlock.className = 'timeline-block ai-block-conflict';
    confBlock.style.left = `${blockLeft}%`;
    confBlock.style.width = `${blockWidth}%`;
    confBlock.innerHTML = `ATTENTION RESET · 建議節奏點`;
    confBlock.onclick = (e) => {
      e.stopPropagation();
      window.seekTimeline(confStart);
      highlightTimelineBlock(confBlock);
      showConflictInspector('static/tracking', 'eye-level', '快速特寫或聲音切換', confStart, '建議時機');
    };
    conflictContainer.appendChild(confBlock);
  }
}

/**
 * Highlight clicked block
 */
function highlightTimelineBlock(blockEl) {
  // Remove active from all timeline blocks
  document.querySelectorAll('.timeline-block').forEach(b => b.classList.remove('active'));
  blockEl.classList.add('active');
}

/**
 * Seek Playhead vertically
 */
window.seekTimeline = function(seconds, options = {}) {
  if (seconds < 0) seconds = 0;
  if (seconds > timelineDuration) seconds = timelineDuration;

  const playhead = document.getElementById('timeline-playhead');
  if (!playhead) return;

  const pct = (seconds / timelineDuration) * 100;
  playhead.style.left = `calc(126px + (100% - 126px) * ${pct / 100})`;
  const timelineBody = document.getElementById('timeline-editor-body');
  if (timelineBody) timelineBody.dataset.currentTime = String(seconds);

  if (!options.fromPlayer) {
    if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.seekTo) {
      currentSourcePlayer.seekTo(seconds, true);
    } else if (currentSourcePlayerType === 'html5' && currentSourcePlayer) {
      currentSourcePlayer.currentTime = seconds;
    }
  }

  // Format time e.g., 00:03
  const roundedSec = Math.floor(seconds);
  const playheadHead = playhead.querySelector('.playhead-head');
  if (playheadHead) {
    playheadHead.textContent = formatEditorTimecode(seconds).slice(3);
  }
  const monitorTimecode = document.getElementById('detail-monitor-timecode');
  if (monitorTimecode) monitorTimecode.textContent = formatEditorTimecode(seconds);

  // Auto scroll timeline container to keep playhead in view
  const scrollContainer = timelineBody?.parentElement;
  if (scrollContainer && timelineBody) {
    const playheadPx = (pct / 100) * timelineBody.clientWidth;
    const containerWidth = scrollContainer.clientWidth;
    const currentScroll = scrollContainer.scrollLeft;

    if (playheadPx > currentScroll + containerWidth - 100) {
      scrollContainer.scrollTo({ left: playheadPx - containerWidth + 150, behavior: 'smooth' });
    } else if (playheadPx < currentScroll + 100) {
      scrollContainer.scrollTo({ left: Math.max(0, playheadPx - 150), behavior: 'smooth' });
    }
  }

  // Update Inspector if playhead was clicked/scrolled directly (find corresponding shot)
  // We do not overwrite the inspector if it was triggered by a explicit block click
};

/**
 * Reset inspector styles
 */
function setInspectorTheme(themeClass) {
  const panel = document.getElementById('timeline-inspector');
  if (!panel) return;

  // Clear previous themes
  panel.className = 'inspector-panel';
  if (themeClass) {
    panel.classList.add(themeClass);
  }
  const clipTab = document.querySelector('[data-inspector-tab="clip"]');
  if (clipTab) clipTab.click();
}

/**
 * Hook Inspector (Coral)
 */
function showHookInspector() {
  setInspectorTheme('inspector-theme-coral');
  document.getElementById('inspector-badge').textContent = '🎯 開場 HOOK';
  document.getElementById('inspector-title').innerHTML = '前三秒 HOOK 搶眼設計';

  const hookInfo = currentTemplate.hook || {};
  const description = hookInfo.description || '標題直切大眾共鳴點/懸念，搭配第一鏡頭快速吸引注意力。';
  const type = hookInfo.type || '好奇懸念 (curiosity)';

  document.getElementById('inspector-body-content').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <strong style="color:var(--ai-coral);">開場策略：</strong>
        <span style="background:var(--ai-coral-soft); color:var(--ai-coral); padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700;">${type}</span>
      </div>
      <p style="font-size: 1rem; line-height: 1.8; color: #322e46; background: #fffafb; padding: 16px; border-radius: 12px; border: 1px solid rgba(255, 74, 107, 0.15);">
        ${formatTextWithLinks(description)}
      </p>
      <div style="border-top:1px solid #f1f0f5; padding-top:14px; font-size:0.88rem; color:#6b6481;">
        💡 <strong>黃金三秒法則：</strong> 在短影音中，前三秒決定了觀眾是否划走。此模板開場預留了 <a class="timeline-anchor-link" onclick="seekTimeline(0)">00:00</a> - <a class="timeline-anchor-link" onclick="seekTimeline(3)">00:03</a> 秒的搶眼區間，建議放入大字標題與衝突畫面。
      </div>
    </div>
  `;
}

/**
 * Narrative Inspector (Purple)
 */
function showNarrativeInspector(start, end) {
  setInspectorTheme('inspector-theme-purple');
  document.getElementById('inspector-badge').textContent = '🎬 中段敘事';
  document.getElementById('inspector-title').innerHTML = '中段敘事手法與起承轉合';

  const narr = currentTemplate.narrative || {};
  const summary = narr.summary || '中段快節奏剪輯展開，價格透明化與場景變換。';
  const structure = narr.structure || '起：懸念導入；承：快速開箱；轉：細節特寫；合：總結引導。';
  const tone = translateTone(narr.tone);

  document.getElementById('inspector-body-content').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <strong style="color:var(--ai-purple);">敘事結構風格：</strong>
        <span style="background:var(--ai-purple-soft); color:var(--ai-purple); padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700;">${narr.type || 'montage'}</span>
        <span style="background:#f1f0f5; color:#555273; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700; margin-left:6px;">語調：${tone}</span>
      </div>
      <div>
        <strong style="display:block; margin-bottom:6px; color:#21143f;">分鏡結構起承轉合：</strong>
        <div style="font-size: 0.95rem; line-height: 1.7; color: #322e46; background: #faf8ff; padding: 14px; border-radius: 12px; border: 1px solid rgba(124, 77, 255, 0.12);">
          ${formatTextWithLinks(structure)}
        </div>
      </div>
      <div>
        <strong style="display:block; margin-bottom:4px; color:#21143f;">核心策略總結：</strong>
        <p style="margin:0; font-size:0.92rem; color:#534f6d;">${formatTextWithLinks(summary)}</p>
      </div>
      <div style="border-top:1px solid #f1f0f5; padding-top:14px; font-size:0.88rem; color:#6b6481;">
        💡 <strong>中段留存策略：</strong> 位於影片 <a class="timeline-anchor-link" onclick="seekTimeline(start)">${start}s</a> 到 <a class="timeline-anchor-link" onclick="seekTimeline(end)">${end}s</a>，採用密集的信息量（小吃開箱/情境展現）來留住用戶，防止注意力消退。
      </div>
    </div>
  `;
}

/**
 * Outro Inspector (Gold)
 */
function showOutroInspector(start) {
  setInspectorTheme('inspector-theme-gold');
  document.getElementById('inspector-badge').textContent = '🏆 尾段收尾';
  document.getElementById('inspector-title').innerHTML = '結尾品牌印象與觀眾引導';

  const mkt = currentTemplate.marketing || {};
  const integrationMethod = mkt.integrationMethod || 'plot';
  const persuasionStyle = mkt.persuasionStyle || 'subtle';
  const emotions = Array.isArray(mkt.targetEmotion) ? mkt.targetEmotion.map(translateEmotion).join(', ') : '好奇、共鳴';

  document.getElementById('inspector-body-content').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <span style="background:var(--ai-gold-soft); color:#b88600; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700;">品牌融合：${integrationMethod === 'plot' ? '劇情嵌入' : '直接曝光'}</span>
        <span style="background:#f1f0f5; color:#555273; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700;">說服風格：${persuasionStyle === 'subtle' ? '潛移默化' : '強力催單'}</span>
        <span style="background:#fff9e6; color:#b88600; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700;">目標情緒：${emotions}</span>
      </div>
      <p style="font-size: 0.95rem; line-height: 1.8; color: #322e46; background: #fffdf5; padding: 16px; border-radius: 12px; border: 1px solid rgba(255, 202, 58, 0.35);">
        🏆 <strong>結尾轉化設計：</strong> 影片尾段於 <a class="timeline-anchor-link" onclick="seekTimeline(start)">${start}s</a> 開始，以行動指引（Call to Action）做收尾，引導觀眾留言互動、按讚訂閱或直接引流至品牌官網。
      </p>
      <div style="font-size:0.88rem; color:#6b6481;">
        📌 <strong>推薦手法：</strong> 秀出最終消費金額，或提出互動式問答（如「新竹真的有美食嗎？底下留言！」）拉高留言率，藉此觸發社群平台推薦演算法。
      </div>
    </div>
  `;
}

/**
 * Emotion Inspector (Cyan)
 */
function showEmotionInspector(emotion, start, shotNum) {
  setInspectorTheme('inspector-theme-cyan');
  document.getElementById('inspector-badge').textContent = '🌊 情緒律動';
  document.getElementById('inspector-title').innerHTML = `鏡頭 ${shotNum} 情緒：${translateEmotion(emotion)}`;

  document.getElementById('inspector-body-content').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <strong style="color:var(--ai-cyan);">情緒定位點：</strong>
        <span style="background:var(--ai-cyan-soft); color:var(--ai-cyan); padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700;">${translateEmotion(emotion)} (${emotion})</span>
      </div>
      <p style="font-size: 0.95rem; line-height: 1.8; color: #322e46; background: #f4fcff; padding: 16px; border-radius: 12px; border: 1px solid rgba(0, 180, 216, 0.25);">
        在第 <strong>${shotNum}</strong> 鏡頭（影片第 <a class="timeline-anchor-link" onclick="seekTimeline(start)">${start}s</a> 秒處），演員/主角需要流露出 <strong>${translateEmotion(emotion)}</strong> 的表情或表現。
      </p>
      <div style="border-top:1px solid #f1f0f5; padding-top:14px; font-size:0.88rem; color:#6b6481;">
        💡 <strong>情緒帶動作用：</strong> 短影音的核心是情緒價值。此時情緒的爆發（例如驚訝、極度滿足），能快速與螢幕前的觀眾產生情緒鏡像效應，促使其點讚或繼續觀看。
      </div>
    </div>
  `;
}

/**
 * Q&A Inspector (Green)
 */
function showQAInspector(dialogueInfo, start, shotNum) {
  setInspectorTheme('inspector-theme-green');
  document.getElementById('inspector-badge').textContent = '🗣️ 藏鏡人互動';
  document.getElementById('inspector-title').innerHTML = `互動提問機制 (鏡頭 ${shotNum})`;

  document.getElementById('inspector-body-content').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <strong style="color:var(--ai-green);">提問/互動對話設計：</strong>
      </div>
      <p style="font-size: 0.95rem; line-height: 1.8; color: #322e46; background: #f0fffb; padding: 16px; border-radius: 12px; border: 1px solid rgba(6, 214, 160, 0.25);">
        <strong>鏡頭 ${shotNum} 提問點：</strong><br>
        ${formatTextWithLinks(dialogueInfo)}
      </p>
      <div style="border-top:1px solid #f1f0f5; padding-top:14px; font-size:0.88rem; color:#6b6481;">
        💡 <strong>藏鏡人互動學：</strong> 在約 <a class="timeline-anchor-link" onclick="seekTimeline(start)">${start}s</a> 秒處，設計「藏鏡人（鏡頭外的發問者）」突然丟出一句大眾常見的心聲或質疑（如：「這真的好吃嗎？」或「你今天花了多少錢？」）。這能有效打破主角的單向陳述，製造雙向日常對話感，是提高停留的極佳利器。
      </div>
    </div>
  `;
}

/**
 * Conflict Inspector (Orange)
 */
function showConflictInspector(camera, angle, action, start, shotNum) {
  setInspectorTheme('inspector-theme-orange');
  document.getElementById('inspector-badge').textContent = '⚡ 視覺/聽覺干擾';
  document.getElementById('inspector-title').innerHTML = `視覺衝突與轉變 (鏡頭 ${shotNum})`;

  document.getElementById('inspector-body-content').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; gap:8px;">
        <span style="background:var(--ai-orange-soft); color:#d48400; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700;">運鏡：${camera}</span>
        <span style="background:#f1f0f5; color:#555273; padding:2px 8px; border-radius:4px; font-size:0.8rem; font-weight:700;">視角：${angle}</span>
      </div>
      <div style="font-size: 0.95rem; line-height: 1.8; color: #322e46; background: #fffdf2; padding: 16px; border-radius: 12px; border: 1px solid rgba(255, 183, 3, 0.25);">
        <strong>視覺干擾行為：</strong><br>
        ${formatTextWithLinks(action)}
      </div>
      <div style="border-top:1px solid #f1f0f5; padding-top:14px; font-size:0.88rem; color:#6b6481;">
        💡 <strong>視覺干擾/衝突理論：</strong> 發生於影片第 <a class="timeline-anchor-link" onclick="seekTimeline(start)">${start}s</a> 秒左右。短影音中長度超過 5 秒的靜止畫面容易引發疲勞划走。在此處切換為<strong>大特寫、手持運鏡、切開斷面 ASMR</strong>，或是突然彈出一個截圖 UI，能瞬間強行干擾大腦視覺適應，重置留存秒數。
      </div>
    </div>
  `;
}

/**
 * Shot Inspector (Shots Track click)
 */
function showShotInspector(shot, index, start) {
  setInspectorTheme('inspector-theme-shot');
  document.getElementById('inspector-badge').textContent = `🎥 鏡頭 ${shot.shot}`;
  document.getElementById('inspector-title').innerHTML = `鏡頭 ${shot.shot} 詳細分鏡描述`;

  document.getElementById('inspector-body-content').innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
        <div style="background:#f5f4fa; padding:8px 12px; border-radius:8px;">
          <span style="font-size:0.75rem; color:#928ebd; display:block;">運鏡方式</span>
          <strong style="color:#4f46e5; font-size:0.9rem;">🎥 ${shot.camera || 'static'}</strong>
        </div>
        <div style="background:#f5f4fa; padding:8px 12px; border-radius:8px;">
          <span style="font-size:0.75rem; color:#928ebd; display:block;">畫面視角</span>
          <strong style="color:#4f46e5; font-size:0.9rem;">📐 ${shot.angle || 'eye-level'}</strong>
        </div>
        <div style="background:#f5f4fa; padding:8px 12px; border-radius:8px;">
          <span style="font-size:0.75rem; color:#928ebd; display:block;">情緒要求</span>
          <strong style="color:#4f46e5; font-size:0.9rem;">🌊 ${translateEmotion(shot.emotion)}</strong>
        </div>
        <div style="background:#f5f4fa; padding:8px 12px; border-radius:8px;">
          <span style="font-size:0.75rem; color:#928ebd; display:block;">鏡頭長度</span>
          <strong style="color:#4f46e5; font-size:0.9rem;">⏱️ ${shot.duration || '3s'}</strong>
        </div>
      </div>
      <div>
        <strong style="display:block; margin-bottom:4px; color:#21143f;">畫面動作 (Action)：</strong>
        <p style="margin:0; font-size:0.95rem; line-height:1.7; color:#322e46; background:#f9f9fc; padding:12px; border-radius:8px; border:1px solid #eef0f6;">
          ${formatTextWithLinks(shot.action || '主角大口吃鴨香飯')}
        </p>
      </div>
      <div>
        <strong style="display:block; margin-bottom:4px; color:#21143f;">分鏡目的 (Purpose)：</strong>
        <p style="margin:0; font-size:0.92rem; color:#534f6d;">${formatTextWithLinks(shot.purpose || '建立共鳴')}</p>
      </div>
      <div style="border-top:1px solid #f1f0f5; padding-top:12px; font-size:0.85rem; color:#928ebd; display:flex; justify-content:space-between;">
        <span>開始時間：約第 ${start} 秒處</span>
        <a class="timeline-anchor-link" onclick="seekTimeline(${start})">定位此鏡頭</a>
      </div>
    </div>
  `;
}


/**
 * Helper to translate emotions to beautiful Traditional Chinese labels
 */
function translateEmotion(emotion) {
  if (!emotion) return '無';
  const emotions = {
    'excited': '興奮',
    'anticipation': '期待',
    'satisfied': '滿足',
    'surprised': '驚喜/驚訝',
    'shock': '震撼/震驚',
    'hungry': '渴望/飢餓',
    'curiosity': '好奇',
    'mysterious': '神秘/懸疑',
    'calm': '冷靜',
    'focused': '專注',
    'smug': '自豪/得意',
    'professional': '專業',
    'casual': '隨性',
    'sad': '難過',
    'fear': '恐懼'
  };
  return emotions[emotion.toLowerCase()] || emotion;
}

/**
 * Helper to translate tone
 */
function translateTone(tone) {
  if (!tone) return '一般';
  const tones = {
    'casual': '隨意親切',
    'humor': '幽默風趣',
    'energetic': '活力充沛',
    'serious': '嚴謹正式',
    'dramatic': '戲劇化'
  };
  return tones[tone.toLowerCase()] || tone;
}

/**
 * Utility to parse timestamps (e.g. 00:03, 00:30, or 3s, 12s) and format as hyperlinks
 */
function formatTextWithLinks(text) {
  if (typeof text !== 'string') return '';
  
  // Replace MM:SS style timestamp (e.g. 00:04)
  let formatted = text.replace(/(?:00:)?(\d{2}):(\d{2})/g, (match, min, sec) => {
    const totalSec = parseInt(min) * 60 + parseInt(sec);
    return `<a class="timeline-anchor-link" onclick="seekTimeline(${totalSec})">${match}</a>`;
  });

  // Replace single digit seconds (e.g. 3秒 or 3s or 12秒)
  formatted = formatted.replace(/第\s*(\d+)\s*(?:秒|s)/gi, (match, sec) => {
    const s = parseInt(sec);
    return `<a class="timeline-anchor-link" onclick="seekTimeline(${s})">第 ${s} 秒</a>`;
  });

  return formatted;
}
