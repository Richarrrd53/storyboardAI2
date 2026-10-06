/**
 * Storyboard AI — Template Detail & Timeline Controller (v0.1)
 * Supports Dual View Mode:
 *   - Story View: High-level narrative flow, shot cards, secondary nodes, and detail card.
 *   - Professional View: Multi-track timeline, track filtering, and inspector drawer.
 * Shared:
 *   - Video Player anchor with synchronized playback, scrubber, and timecode.
 */

// Category mapping helper
const CAT_MAP = {
  'product': '商品廣告',
  'story': '敘事紀實',
  'twist': '高留存節奏',
  'custom': '團隊資產',
  '未分類': '未分類'
};

const TIMELINE_FPS = 30;

// Shared State
let currentTemplate = null;
let timelineDuration = 0; // Total duration in seconds
let currentTime = 0; // Current playback time
let currentViewMode = 'story'; // 'story' | 'professional'
let selectedItemId = null; // e.g. 'shot_0', 'hook', 'narrative'
let activeShotIndex = 0;
let isPlaying = false;

// Player references
let currentSourcePlayer = null;
let currentSourcePlayerType = null; // 'youtube' | 'html5' | 'none'
let playerSyncFrame = null;

// Track Filters configuration
const TRACKS_CONFIG = [
  { id: 'video', label: '主畫面', default: true },
  { id: 'narrative', label: '敘事節奏', default: true },
  { id: 'hook', label: '開場鉤子', default: true },
  { id: 'emotion', label: '情緒律動', default: true },
  { id: 'qa', label: '藏鏡互動', default: false },
  { id: 'conflict', label: '注意力重置', default: false },
  { id: 'outro', label: '品牌／CTA', default: false }
];

let visibleTracks = {
  video: true,
  narrative: true,
  hook: true,
  emotion: true,
  qa: false,
  conflict: false,
  outro: false
};

/* ==========================================================================
   TIME FORMATTING HELPERS
   ========================================================================== */

function formatEditorTimecode(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const wholeSeconds = Math.floor(safeSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const secs = wholeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatShortSeconds(seconds) {
  const s = Math.round(Number(seconds) || 0);
  return `${s}s`;
}

/* ==========================================================================
   PLAYER SYNCHRONIZATION LOOP
   ========================================================================== */

function stopPlayerSync() {
  if (playerSyncFrame) {
    cancelAnimationFrame(playerSyncFrame);
    playerSyncFrame = null;
  }
}

function startPlayerSync() {
  stopPlayerSync();
  const update = () => {
    if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.getCurrentTime) {
      const time = currentSourcePlayer.getCurrentTime();
      if (Number.isFinite(time)) {
        window.seekTimeline(time, { fromPlayer: true });
      }
      if (currentSourcePlayer.getPlayerState?.() === window.YT?.PlayerState?.PLAYING) {
        playerSyncFrame = requestAnimationFrame(update);
      }
    } else if (currentSourcePlayerType === 'html5' && currentSourcePlayer) {
      const time = currentSourcePlayer.currentTime;
      if (Number.isFinite(time)) {
        window.seekTimeline(time, { fromPlayer: true });
      }
      if (!currentSourcePlayer.paused && !currentSourcePlayer.ended) {
        playerSyncFrame = requestAnimationFrame(update);
      }
    }
  };
  playerSyncFrame = requestAnimationFrame(update);
}

function updatePlayPauseButtonUI(playing) {
  isPlaying = !!playing;
  const btn = document.getElementById('btn-player-playpause');
  if (!btn) return;
  const playIcon = btn.querySelector('.play-icon');
  const pauseIcon = btn.querySelector('.pause-icon');
  if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
  if (pauseIcon) pauseIcon.style.display = isPlaying ? 'block' : 'none';
}

function togglePlayPause() {
  if (currentSourcePlayerType === 'youtube' && currentSourcePlayer) {
    if (isPlaying) {
      currentSourcePlayer.pauseVideo?.();
    } else {
      currentSourcePlayer.playVideo?.();
    }
  } else if (currentSourcePlayerType === 'html5' && currentSourcePlayer) {
    if (currentSourcePlayer.paused) {
      currentSourcePlayer.play();
    } else {
      currentSourcePlayer.pause();
    }
  }
}

/* ==========================================================================
   YOUTUBE & HTML5 PLAYER MOUNTING
   ========================================================================== */

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
      playerVars: { rel: 0, playsinline: 1, modestbranding: 1, controls: 0 },
      events: {
        onReady: event => {
          event.target.getIframe().setAttribute('title', `${title} 原始影片播放器`);
        },
        onStateChange: event => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            updatePlayPauseButtonUI(true);
            startPlayerSync();
          } else {
            updatePlayPauseButtonUI(false);
            stopPlayerSync();
            const time = event.target.getCurrentTime?.();
            if (Number.isFinite(time)) {
              window.seekTimeline(time, { fromPlayer: true });
            }
          }
        }
      }
    });
  } catch (error) {
    console.warn('YouTube 播放器初始化失敗', error);
  }
}

/* ==========================================================================
   MAIN ENTRANCE: RENDER TEMPLATE DETAIL
   ========================================================================== */

window.renderTemplateDetailTimeline = function(template, detailContainer) {
  stopPlayerSync();
  if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.destroy) {
    try { currentSourcePlayer.destroy(); } catch (_) {}
  }
  currentSourcePlayer = null;
  currentSourcePlayerType = null;
  currentTemplate = template;
  currentTime = 0;
  isPlaying = false;
  selectedItemId = null;
  currentViewMode = 'professional';

  // Toggle store view vs detail immersive container
  const storeView = document.getElementById('template-store-view');
  const detailImmersive = document.getElementById('template-detail-immersive');
  if (storeView) storeView.style.display = 'none';
  if (detailImmersive) detailImmersive.style.display = 'flex';
  const pageMain = document.getElementById('page-main');
  pageMain?.classList.add('is-template-detail-mode');
  if (pageMain) pageMain.scrollTop = 0;
  updatePlayPauseButtonUI(false);
  window.closeInspectorDrawer();

  const title = template.name || template.title || '無標題';
  ['detail-template-title', 'nav-template-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = title;
  });
  const description = document.getElementById('detail-template-desc');
  if (description) description.textContent = template.description || '尚未提供模板描述';
  mountSourcePreview(template);

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Calculate total duration from shots
  const shots = Array.isArray(template.structure) ? template.structure : [];
  let totalSec = 0;
  shots.forEach(s => {
    const sec = shotSeconds(s);
    totalSec += sec;
  });
  timelineDuration = totalSec || 15; // default 15s if no shots

  const durationTimecodeEl = document.getElementById('detail-monitor-duration');
  if (durationTimecodeEl) durationTimecodeEl.textContent = formatEditorTimecode(timelineDuration);

  // Update badges
  document.getElementById('detail-category-badge').textContent = CAT_MAP[template.category] || template.category || '未分類';
  document.getElementById('detail-shots-count-badge').textContent = `${template.shotsCount || shots.length} 鏡頭`;
  document.getElementById('detail-duration-badge').textContent = `${timelineDuration}s`;

  renderAnalysisOverview(template, shots);

  // Update apply button click behavior
  ['btn-apply-template-main', 'btn-apply-template-bottom'].forEach(id => {
    const applyBtn = document.getElementById(id);
    if (applyBtn) applyBtn.onclick = () => {
      window.spaNavigate('generate', { templateId: template.id });
    };
  });

  // 3. Render side overview panel (Right side)
  renderSideMetadata(template);

  // 4. Render Professional View (Timeline & Track Filters)
  renderProfessionalView(template, shots);
  window.TemplateEditor?.mount(template, {
    seconds: shotSeconds, escape: escapeTemplateText, videoId: sourceVideoId,
    emotion: translateEmotion, seek: window.seekTimeline, inspect: showShotInspector
  });

  // 5. Initialize Mode Switcher
  window.switchDetailViewMode('professional');

  // 6. Reset Playhead & Timeline to 0s
  window.seekTimeline(0);

  // 6. Highlight first section (Hook) by default in inspector
  if (shots.length) showShotInspector(shots[0], 0, 0);
};

function renderAnalysisOverview(template, shots) {
  const rawConfidence = template.confidence == null || template.confidence === '' ? NaN : Number(template.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.max(0, Math.min(100, rawConfidence <= 1 ? rawConfidence * 100 : rawConfidence))
    : null;
  const ring = document.getElementById('analysis-score-ring');
  if (ring) ring.style.setProperty('--score', String(confidence ?? 0));
  const scoreValue = document.getElementById('analysis-score-value');
  if (scoreValue) scoreValue.textContent = confidence === null ? '—' : `${Math.round(confidence)}%`;
  const scoreLabel = document.getElementById('analysis-score-label');
  if (scoreLabel) scoreLabel.textContent = confidence === null ? '未提供信心指數' : confidence >= 80 ? '高可信分析' : confidence >= 60 ? '建議人工複核' : '需要人工確認';

  const shotCount = shots.length;
  const average = shotCount ? timelineDuration / shotCount : 0;
  const durationEl = document.getElementById('analysis-kpi-duration');
  const shotsEl = document.getElementById('analysis-kpi-shots');
  const averageEl = document.getElementById('analysis-kpi-average');
  if (durationEl) durationEl.textContent = `${timelineDuration}s`;
  if (shotsEl) shotsEl.textContent = String(shotCount);
  if (averageEl) averageEl.textContent = shotCount ? `${average.toFixed(1)}s` : '—';

  const insight = template.analysis?.whyItWorks || template.narrative?.summary || template.description || '尚未提供核心洞察。';
  const insightEl = document.getElementById('analysis-key-insight');
  if (insightEl) insightEl.textContent = insight;
  const tagsEl = document.getElementById('analysis-insight-tags');
  if (tagsEl) {
    const tags = Array.isArray(template.analysis?.replicableElements) ? template.analysis.replicableElements.slice(0, 3) : [];
    tagsEl.replaceChildren(...tags.map((value, index) => {
      const chip = document.createElement('span');
      chip.textContent = `${String(index + 1).padStart(2, '0')} ${value}`;
      return chip;
    }));
  }

  const rhythmTrack = document.getElementById('analysis-rhythm-track');
  if (rhythmTrack) {
    rhythmTrack.replaceChildren();
    const phases = ['is-hook', 'is-build', 'is-payoff', 'is-close'];
    shots.forEach((shot, index) => {
      const duration = shotSeconds(shot);
      const segment = document.createElement('button');
      const phaseIndex = Math.min(3, Math.floor(index / Math.max(1, shots.length) * 4));
      segment.type = 'button';
      segment.className = `analysis-rhythm-segment ${phases[phaseIndex]}`;
      segment.style.flexGrow = String(duration);
      segment.setAttribute('aria-label', `鏡頭 ${index + 1}，${duration} 秒，${shot.purpose || shot.action || '未提供說明'}`);
      segment.title = `S${String(index + 1).padStart(2, '0')} · ${duration}s · ${shot.purpose || shot.action || '未提供說明'}`;
      segment.innerHTML = `<b>S${String(index + 1).padStart(2, '0')}</b><span>${duration}s</span>`;
      segment.onclick = () => {
        const start = shots.slice(0, index).reduce((sum, item) => sum + (shotSeconds(item)), 0);
        window.seekTimeline(start);
        showShotInspector(shot, index, start);
      };
      rhythmTrack.appendChild(segment);
    });
    if (!shots.length) {
      const empty = document.createElement('span');
      empty.className = 'analysis-rhythm-empty';
      empty.textContent = '尚無鏡頭節奏資料';
      rhythmTrack.appendChild(empty);
    }
  }
  const rhythmMid = document.getElementById('analysis-rhythm-mid');
  const rhythmEnd = document.getElementById('analysis-rhythm-end');
  if (rhythmMid) rhythmMid.textContent = formatEditorTimecode(timelineDuration / 2);
  if (rhythmEnd) rhythmEnd.textContent = formatEditorTimecode(timelineDuration);
}

/**
 * Helper to render side metadata panels
 */
function shotSeconds(shot) {
  const value = parseFloat(shot.duration);
  return Number.isFinite(value) && value > 0 ? value : 3;
}

function escapeTemplateText(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function sourceVideoId(t) {
  const url = t.videoUrl || t.source?.url || '';
  return t.source?.videoId || t.videoId || url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/)?.[1] || '';
}

function mountSourcePreview(t) {
  const monitor = document.getElementById('detail-program-monitor');
  if (!monitor) return;
  monitor.replaceChildren();
  const videoId = sourceVideoId(t);
  if (videoId) {
    const mount = document.createElement('div');
    mount.id = 'detail-source-player';
    monitor.appendChild(mount);
    mountYouTubePlayer(videoId, t.source?.title || t.name || '來源影片', t.id);
  } else if (t.videoUrl || t.source?.url) {
    const video = document.createElement('video');
    video.src = t.videoUrl || t.source.url;
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    monitor.appendChild(video);
    currentSourcePlayer = video;
    currentSourcePlayerType = 'html5';
    video.onplay = () => { updatePlayPauseButtonUI(true); startPlayerSync(); };
    video.onpause = video.onended = () => { updatePlayPauseButtonUI(false); stopPlayerSync(); };
    video.ontimeupdate = () => window.seekTimeline(video.currentTime, { fromPlayer: true });
  } else {
    const fallback = document.createElement('p');
    fallback.className = 'nle-monitor-fallback';
    fallback.textContent = '此模板未提供來源影片';
    monitor.appendChild(fallback);
  }
  const playBtn = document.getElementById('btn-player-playpause');
  if (playBtn) {
    playBtn.disabled = !videoId && !(t.videoUrl || t.source?.url);
    playBtn.onclick = togglePlayPause;
  }
  const scrubber = document.getElementById('player-scrubber-track');
  if (scrubber) {
    const seek = event => {
      const bounds = scrubber.getBoundingClientRect();
      if (bounds.width) window.seekTimeline((event.clientX - bounds.left) / bounds.width * timelineDuration);
    };
    scrubber.onpointerdown = event => { scrubber.setPointerCapture?.(event.pointerId); seek(event); };
    scrubber.onpointermove = event => { if (event.buttons === 1) seek(event); };
  }
}

// 顯示來源資料的所有欄位，避免改版後的舊 DOM 名稱中斷整頁渲染。
const TEMPLATE_FIELD_LABELS = {
  narrative: '敘事設計', hook: '開場鉤子', marketing: '行銷設計', visualFlow: '視覺節奏',
  controls: '生成控制', analysis: '分析結果', promptTemplate: '製作提示詞', variables: '可替換變數',
  source: '來源影片', tags: '標籤', platform: '適用平台', useCase: '使用情境', confidence: '分析信心',
  version: '分析版本', type: '類型', structure: '結構', tone: '語氣', summary: '摘要',
  description: '說明', position: '位置', isImplicit: '隱性置入', exposureType: '曝光方式',
  brandRole: '品牌角色', integrationMethod: '融合方式', revealTiming: '揭露時機',
  persuasionStyle: '說服風格', targetEmotion: '目標情緒', pace: '節奏', transitionStyle: '轉場方式',
  rhythmPattern: '節奏模式', cameraIntensity: '鏡頭強度', emotionIntensity: '情緒強度',
  whyItWorks: '成功原因', replicableElements: '可複製元素', targetAudience: '目標受眾',
  base: '基礎提示詞', perShot: '逐鏡提示詞', videoId: '影片編號', title: '影片標題',
  channel: '頻道', views: '觀看次數', url: '影片網址', thumbnail: '封面網址', analyzedAt: '分析時間',
  publishedAt: '發布時間', category: '分類', duration: '時長', name: '名稱', shotsCount: '鏡頭數',
  shot: '鏡頭編號', action: '畫面動作', camera: '鏡頭運動', angle: '拍攝角度', emotion: '情緒',
  purpose: '敘事目的', dialogue: '對白', dialogueInfo: '互動資訊', categoryLabel: '分類名稱'
};

function renderTemplateFields(value) {
  if (Array.isArray(value)) return value.length ? `<ol>${value.map(item => `<li>${renderTemplateFields(item)}</li>`).join('')}</ol>` : '—';
  if (value && typeof value === 'object') {
    return `<dl>${Object.entries(value).map(([key, item]) => `<div><dt>${escapeTemplateText(TEMPLATE_FIELD_LABELS[key] || key)}</dt><dd>${renderTemplateFields(item)}</dd></div>`).join('')}</dl>`;
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  return escapeTemplateText(value ?? '—');
}

function renderSideMetadata(t) {
  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
  };
  setText('detail-source-title', t.source?.title || t.name || t.title);
  setText('detail-source-channel', t.source?.channel || '未提供頻道');
  setText('detail-source-views', `觀看次數：${t.source?.views == null ? '—' : Number(t.source.views).toLocaleString('zh-TW')}`);
  setText('detail-template-version', `分析版本：${t.version ?? '—'}`);
  setText('detail-confidence', `信心指數：${document.getElementById('analysis-score-value')?.textContent || '—'}`);
  setText('detail-bin-count', String((t.structure || []).length + 1));
  setText('meta-usecase', t.useCase);
  setText('meta-platforms', Array.isArray(t.platform) ? t.platform.join(' / ') : t.platform);
  setText('meta-audience', t.analysis?.targetAudience);
  setText('meta-shotscount', `${(t.structure || []).length} 鏡`);
  setText('meta-duration', `${timelineDuration} 秒`);
  const cover = t.thumbnail || t.cover || t.source?.thumbnail || (sourceVideoId(t) ? `https://i.ytimg.com/vi/${encodeURIComponent(sourceVideoId(t))}/hqdefault.jpg` : '');
  const thumb = document.getElementById('detail-source-thumb');
  if (thumb) {
    thumb.replaceChildren();
    if (cover) { const image = document.createElement('img'); image.onerror = () => image.remove(); image.src = cover; image.alt = '來源影片封面'; thumb.appendChild(image); }
  }
  const info = document.getElementById('template-information');
  if (info) {
    const omitted = new Set(['id', 'name', 'title', 'description', 'structure', 'thumbnail', 'cover']);
    info.innerHTML = Object.entries(t).filter(([key]) => !omitted.has(key)).map(([key, value]) =>
      `<details${['narrative', 'hook'].includes(key) ? ' open' : ''} data-field="${escapeTemplateText(key)}"><summary>${escapeTemplateText(TEMPLATE_FIELD_LABELS[key] || key)}</summary>${renderTemplateFields(value)}</details>`).join('');
  }

}

function renderProfessionalView(t, shots) {
  const filters = document.getElementById('track-filter-pills');
  if (filters) {
    filters.replaceChildren(...TRACKS_CONFIG.map(track => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'track-filter-pill';
      button.textContent = track.label;
      const update = () => {
        button.classList.toggle('is-active', visibleTracks[track.id]);
        button.setAttribute('aria-pressed', String(visibleTracks[track.id]));
        const row = document.querySelector(`.timeline-track-row[data-track="${track.id}"]`);
        if (row) row.hidden = !visibleTracks[track.id];
      };
      button.onclick = () => { visibleTracks[track.id] = !visibleTracks[track.id]; update(); };
      update();
      return button;
    }));
  }
  renderTimelineWidget(t, shots);
}

function renderTimelineWidget(t, shots) {
  const rulerTicks = document.getElementById('ruler-ticks');
  const shotsContainer = document.getElementById('track-shots-container');
  const hookContainer = document.getElementById('track-hook-container');
  const narrativeContainer = document.getElementById('track-narrative-container');
  const emotionContainer = document.getElementById('track-emotion-container');
  const qaContainer = document.getElementById('track-qa-container');
  const conflictContainer = document.getElementById('track-conflict-container');
  const outroContainer = document.getElementById('track-outro-container');

  if (!rulerTicks || !shotsContainer) return;

  rulerTicks.innerHTML = '';
  shotsContainer.innerHTML = '';
  if (hookContainer) hookContainer.innerHTML = '';
  if (narrativeContainer) narrativeContainer.innerHTML = '';
  if (emotionContainer) emotionContainer.innerHTML = '';
  if (qaContainer) qaContainer.innerHTML = '';
  if (conflictContainer) conflictContainer.innerHTML = '';
  if (outroContainer) outroContainer.innerHTML = '';

  const seekFromPointer = (event, cell) => {
    const rect = cell.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    window.seekTimeline((clickX / rect.width) * timelineDuration);
  };

  rulerTicks.onpointerdown = event => {
    rulerTicks.setPointerCapture?.(event.pointerId);
    seekFromPointer(event, rulerTicks);
  };
  rulerTicks.onpointermove = event => {
    if (event.buttons === 1) seekFromPointer(event, rulerTicks);
  };

  // 1. Ruler Ticks
  for (let i = 0; i <= timelineDuration; i++) {
    const pct = (i / timelineDuration) * 100;
    const tick = document.createElement('div');
    tick.className = 'ruler-tick-mark';
    tick.style.left = `${pct}%`;
    if (i % 5 === 0 || i === timelineDuration) {
      tick.style.borderLeft = '2px solid rgba(255, 255, 255, 0.25)';
      tick.textContent = formatEditorTimecode(i);
    } else {
      tick.style.height = '40%';
      tick.style.borderLeft = '1px solid rgba(255, 255, 255, 0.08)';
    }
    rulerTicks.appendChild(tick);
  }

  // 2. Shots Track
  let accumulatedTime = 0;
  shots.forEach((shot, index) => {
    const dur = shotSeconds(shot);
    const shotStart = accumulatedTime;
    const blockWidth = (dur / timelineDuration) * 100;
    const blockLeft = (shotStart / timelineDuration) * 100;

    const block = document.createElement('div');
    block.className = 'timeline-block shot-block';
    block.id = `pro-clip-shot-${index}`;
    block.style.left = `${blockLeft}%`;
    block.style.width = `${blockWidth}%`;
    block.setAttribute('data-start', shotStart);
    block.setAttribute('data-end', shotStart + dur);
    block.setAttribute('data-shot-index', index);

    block.innerHTML = `<div>S${String(shot.shot || index + 1).padStart(2, '0')} · ${shot.action || shot.purpose || '未命名鏡頭'}</div>`;
    block.title = `S${index + 1} (${dur}s): ${shot.action || shot.purpose || ''}`;

    block.onclick = e => {
      e.stopPropagation();
      selectedItemId = `shot_${index}`;
      window.seekTimeline(shotStart);
      highlightTimelineBlock(block);
      showShotInspector(shot, index, shotStart);
    };

    shotsContainer.appendChild(block);
    accumulatedTime += dur;
  });

  // 3. Hook Track
  if (hookContainer) {
    const hookDur = Math.max(3, shots.length > 0 ? (parseInt(shots[0].duration) || 3) : 3);
    const hookWidth = (hookDur / timelineDuration) * 100;
    const hookBlock = document.createElement('div');
    hookBlock.className = 'timeline-block ai-block-hook';
    hookBlock.style.left = '0%';
    hookBlock.style.width = `${hookWidth}%`;
    hookBlock.innerHTML = `HOOK · ${t.hook?.type || 'curiosity'}｜${t.hook?.description || `0–${hookDur}s 開場`}`;
    hookBlock.onclick = e => {
      e.stopPropagation();
      selectedItemId = 'hook';
      window.seekTimeline(0);
      highlightTimelineBlock(hookBlock);
      showHookInspector();
    };
    hookContainer.appendChild(hookBlock);
  }

  // 4. Narrative Track
  if (narrativeContainer) {
    const hookDur = Math.max(3, shots.length > 0 ? (parseInt(shots[0].duration) || 3) : 3);
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
    narrBlock.onclick = e => {
      e.stopPropagation();
      selectedItemId = 'narrative';
      window.seekTimeline(narrStart);
      highlightTimelineBlock(narrBlock);
      showNarrativeInspector(narrStart, narrEnd);
    };
    narrativeContainer.appendChild(narrBlock);
  }

  // 5. Emotion Track
  if (emotionContainer) {
    let curTime = 0;
    shots.forEach((shot, index) => {
      const dur = shotSeconds(shot);
      if (shot.emotion && shot.emotion !== 'none') {
        const emoBlock = document.createElement('div');
        emoBlock.className = 'timeline-block ai-block-emotion';
        emoBlock.style.left = `${(curTime / timelineDuration) * 100}%`;
        emoBlock.style.width = `${(dur / timelineDuration) * 100}%`;
        emoBlock.innerHTML = `${translateEmotion(shot.emotion)} · S${String(index + 1).padStart(2, '0')}`;
        const shotStart = curTime;
        emoBlock.onclick = e => {
          e.stopPropagation();
          selectedItemId = `emotion_${index}`;
          window.seekTimeline(shotStart);
          highlightTimelineBlock(emoBlock);
          showEmotionInspector(shot.emotion, shotStart, index + 1);
        };
        emotionContainer.appendChild(emoBlock);
      }
      curTime += dur;
    });
  }

  // 6. Q&A / Interaction Track
  if (qaContainer) {
    let timePointer = 0;
    let qaCount = 0;
    shots.forEach((shot, index) => {
      const dur = shotSeconds(shot);
      const actionText = shot.action || '';
      const purposeText = shot.purpose || '';
      const isQA = actionText.includes('問') || actionText.includes('對話') || actionText.includes('藏鏡人') ||
                   purposeText.includes('問') || purposeText.includes('懸念') || purposeText.includes('互動');
      if (isQA) {
        const qaBlock = document.createElement('div');
        qaBlock.className = 'timeline-block ai-block-qa';
        qaBlock.style.left = `${(timePointer / timelineDuration) * 100}%`;
        qaBlock.style.width = `${(dur / timelineDuration) * 100}%`;
        qaBlock.innerHTML = `INTERACTION · S${String(index + 1).padStart(2, '0')}`;
        const shotStart = timePointer;
        qaBlock.onclick = e => {
          e.stopPropagation();
          window.seekTimeline(shotStart);
          highlightTimelineBlock(qaBlock);
          showQAInspector(actionText, shotStart, index + 1);
        };
        qaContainer.appendChild(qaBlock);
        qaCount++;
      }
      timePointer += dur;
    });

    if (qaCount === 0) {
      const midStart = Math.floor(timelineDuration * 0.4);
      const midDur = Math.min(4, Math.floor(timelineDuration * 0.15));
      const qaBlock = document.createElement('div');
      qaBlock.className = 'timeline-block ai-block-qa';
      qaBlock.style.left = `${(midStart / timelineDuration) * 100}%`;
      qaBlock.style.width = `${(midDur / timelineDuration) * 100}%`;
      qaBlock.innerHTML = `INTERACTION · 建議提問點`;
      qaBlock.onclick = e => {
        e.stopPropagation();
        window.seekTimeline(midStart);
        highlightTimelineBlock(qaBlock);
        showQAInspector('此模板適合在影片約 ' + midStart + 's 處由藏鏡人發出引導式提問。', midStart, '建議時機');
      };
      qaContainer.appendChild(qaBlock);
    }
  }

  // 7. Conflict Track
  if (conflictContainer) {
    let tPointer = 0;
    let conflictCount = 0;
    shots.forEach((shot, index) => {
      const dur = shotSeconds(shot);
      const cameraText = shot.camera || '';
      const actionText = shot.action || '';
      const angleText = shot.angle || '';
      const isConflict = cameraText.includes('close-up') || cameraText.includes('handheld') || cameraText.includes('tracking') ||
                         actionText.includes('特特寫') || actionText.includes('截圖') || actionText.includes('切') || 
                         actionText.includes('聲') || actionText.includes('ASMR') || angleText.includes('high') || angleText.includes('low');
      if (isConflict) {
        const confBlock = document.createElement('div');
        confBlock.className = 'timeline-block ai-block-conflict';
        confBlock.style.left = `${(tPointer / timelineDuration) * 100}%`;
        confBlock.style.width = `${(dur / timelineDuration) * 100}%`;
        confBlock.innerHTML = `ATTENTION RESET · ${cameraText || angleText || 'CUT'}`;
        const shotStart = tPointer;
        confBlock.onclick = e => {
          e.stopPropagation();
          window.seekTimeline(shotStart);
          highlightTimelineBlock(confBlock);
          showConflictInspector(cameraText, angleText, actionText, shotStart, index + 1);
        };
        conflictContainer.appendChild(confBlock);
        conflictCount++;
      }
      tPointer += dur;
    });

    if (conflictCount === 0) {
      const confStart = Math.floor(timelineDuration * 0.6);
      const confDur = 3;
      const confBlock = document.createElement('div');
      confBlock.className = 'timeline-block ai-block-conflict';
      confBlock.style.left = `${(confStart / timelineDuration) * 100}%`;
      confBlock.style.width = `${(confDur / timelineDuration) * 100}%`;
      confBlock.innerHTML = `ATTENTION RESET · 建議節奏點`;
      confBlock.onclick = e => {
        e.stopPropagation();
        window.seekTimeline(confStart);
        highlightTimelineBlock(confBlock);
        showConflictInspector('static/tracking', 'eye-level', '快速特寫或聲音切換', confStart, '建議時機');
      };
      conflictContainer.appendChild(confBlock);
    }
  }

  // 8. Outro / CTA Track
  if (outroContainer) {
    const outroDur = shots.length > 0 ? (parseInt(shots[shots.length - 1].duration) || 5) : 5;
    const outroStart = timelineDuration - outroDur;
    const outroBlock = document.createElement('div');
    outroBlock.className = 'timeline-block ai-block-outro';
    outroBlock.style.left = `${(outroStart / timelineDuration) * 100}%`;
    outroBlock.style.width = `${(outroDur / timelineDuration) * 100}%`;
    outroBlock.innerHTML = `CTA · ${t.marketing?.integrationMethod || 'organic'}｜${t.marketing?.persuasionStyle || 'subtle'}`;
    outroBlock.onclick = e => {
      e.stopPropagation();
      selectedItemId = 'outro';
      window.seekTimeline(outroStart);
      highlightTimelineBlock(outroBlock);
      showOutroInspector(outroStart);
    };
    outroContainer.appendChild(outroBlock);
  }
}

function highlightTimelineBlock(blockEl) {
  document.querySelectorAll('.timeline-block').forEach(b => b.classList.remove('active'));
  blockEl.classList.add('active');
}

/* ==========================================================================
   TIME SYNC & SEEKING LOGIC
   ========================================================================== */

window.seekTimeline = function(seconds, options = {}) {
  if (seconds < 0) seconds = 0;
  if (seconds > timelineDuration) seconds = timelineDuration;
  currentTime = seconds;

  // 1. Update Player Scrubber UI
  const pct = (seconds / (timelineDuration || 1)) * 100;
  const progressEl = document.getElementById('player-scrubber-progress');
  const thumbEl = document.getElementById('player-scrubber-thumb');
  const timecodeEl = document.getElementById('detail-monitor-timecode');
  const durEl = document.getElementById('detail-monitor-duration');
  const proTimecodeEl = document.getElementById('pro-toolbar-timecode');

  if (progressEl) progressEl.style.width = `${pct}%`;
  if (thumbEl) thumbEl.style.left = `${pct}%`;
  if (timecodeEl) timecodeEl.textContent = formatEditorTimecode(seconds);
  if (durEl) durEl.textContent = formatEditorTimecode(timelineDuration);
  if (proTimecodeEl) proTimecodeEl.textContent = formatEditorTimecode(seconds);

  // 2. Command Player to seek if not triggered from player timeupdate
  if (!options.fromPlayer) {
    if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.seekTo) {
      currentSourcePlayer.seekTo(seconds, true);
    } else if (currentSourcePlayerType === 'html5' && currentSourcePlayer) {
      currentSourcePlayer.currentTime = seconds;
    }
  }

  // 3. Compute Active Shot Index
  const shots = Array.isArray(currentTemplate?.structure) ? currentTemplate.structure : [];
  let accum = 0;
  let foundIndex = 0;
  for (let i = 0; i < shots.length; i++) {
    const dur = shotSeconds(shots[i]);
    if (seconds >= accum && seconds < accum + dur) {
      foundIndex = i;
      break;
    }
    accum += dur;
    if (i === shots.length - 1 && seconds >= accum) {
      foundIndex = i;
    }
  }
  activeShotIndex = foundIndex;
  window.TemplateEditor?.sync(foundIndex);

  // 4. Update Story View Active Node & Canvas Axis Progress
  if (currentViewMode === 'story') {
    highlightActiveStoryNode();
  } else {
    syncProfessionalPlayhead();
  }
};

function highlightActiveStoryNode() {
  // 1. Update Axis Progress line
  const axisProgress = document.getElementById('canvas-axis-progress');
  if (axisProgress) {
    const axisPct = Math.min(100, Math.max(0, 5 + (currentTime / (timelineDuration || 1)) * 90));
    axisProgress.style.width = `${axisPct}%`;
  }

  // 2. Update Shot Nodes active state (playback indicator)
  const shotNodes = document.querySelectorAll('.canvas-shot-node');
  shotNodes.forEach((node, idx) => {
    node.classList.toggle('is-active', idx === activeShotIndex);
  });

  // 3. Update Anchor Dots active state
  const dots = document.querySelectorAll('.axis-anchor-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('is-active', idx === activeShotIndex);
  });
}

function syncProfessionalPlayhead() {
  const playhead = document.getElementById('timeline-playhead');
  if (!playhead) return;

  const pct = (currentTime / (timelineDuration || 1)) * 100;
  // Offset by track header cell width (155px desktop, or measured)
  const headerCell = document.querySelector('.track-header-cell');
  const headerWidth = headerCell ? headerCell.offsetWidth : 155;
  playhead.style.left = `calc(${headerWidth}px + (100% - ${headerWidth}px) * ${pct / 100})`;

  const headLabel = playhead.querySelector('.playhead-head');
  if (headLabel) {
    headLabel.textContent = formatEditorTimecode(currentTime);
  }

  const proTimecodeEl = document.getElementById('pro-toolbar-timecode');
  if (proTimecodeEl) {
    proTimecodeEl.textContent = formatEditorTimecode(currentTime);
  }

  // Highlight active shot block in shots track
  const shotsContainer = document.getElementById('track-shots-container');
  if (shotsContainer) {
    shotsContainer.querySelectorAll('.shot-block').forEach((b, idx) => {
      b.classList.toggle('active', idx === activeShotIndex);
    });
  }
}

/* ==========================================================================
   LOCAL FLOATING INSPECTOR (WORKSPACE EMBEDDED)
   ========================================================================== */

window.openInspectorDrawer = function(title, badge, bodyHtml, segmentStart = 0) {
  const inspector = document.getElementById('timeline-local-inspector');
  const titleEl = document.getElementById('local-inspector-title');
  const badgeEl = document.getElementById('local-inspector-badge');
  const bodyEl = document.getElementById('local-inspector-body');

  if (!inspector) return;

  if (titleEl) titleEl.textContent = title;
  if (badgeEl) badgeEl.textContent = badge;
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        ${bodyHtml}
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.08); display:flex; justify-content:flex-end;">
          <button type="button" class="btn-play-segment" onclick="window.playTemplateSegment(${segmentStart})">
            ▶ 播放這一段
          </button>
        </div>
      </div>
    `;
  }

  inspector.hidden = false;
  window.TemplateEditor?.showInspector();
};

window.closeInspectorDrawer = function() {
  const inspector = document.getElementById('timeline-local-inspector');
  if (inspector) inspector.hidden = true;
};

/* ==========================================================================
   INSPECTOR DETAIL RENDERERS
   ========================================================================== */

function translateCamera(camera) {
  const labels = { wide: '廣角', medium: '中景', 'close-up': '特寫', static: '固定鏡頭', handheld: '手持', tracking: '跟拍', pan: '橫移', tilt: '俯仰', zoom: '變焦' };
  return labels[camera] || camera || '未提供運鏡';
}

function showShotInspector(shot, index, start) {
  const shotNum = String(index + 1).padStart(2, '0');
  const description = window.TemplateEditor?.describe || (value => value || '未提供');
  const details = { ...shot, camera: description(shot.camera), angle: description(shot.angle), emotion: translateEmotion(shot.emotion), purpose: description(shot.purpose) };
  const prompt = currentTemplate?.promptTemplate?.perShot?.[index];
  const body = `${renderTemplateFields(details)}<h5>製作提示詞</h5><p>${escapeTemplateText(prompt || '此鏡頭未提供製作提示詞')}</p>`;
  window.openInspectorDrawer(`鏡頭 ${shotNum} · ${shotSeconds(shot)} 秒`, 'SHOT', body, start);
}

function showHookInspector() {
  const hookInfo = currentTemplate.hook || {};
  const description = hookInfo.description || '標題直切大眾共鳴點/懸念，搭配第一鏡頭快速吸引注意力。';
  const type = hookInfo.type || '好奇懸念 (curiosity)';
  const content = `
    <div>
      <strong style="color:var(--ai-coral);">開場策略：</strong>
      <span style="background:var(--ai-coral-soft); color:var(--ai-coral); padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700;">${type}</span>
    </div>
    <p style="font-size: 0.88rem; line-height: 1.7; color: #cbd5e1; background: rgba(255, 74, 107, 0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(255, 74, 107, 0.22); margin: 0;">
      ${formatTextWithLinks(description)}
    </p>
    <div style="font-size:0.82rem; color:#94a3b8; line-height:1.55;">
      💡 <strong>黃金三秒法則：</strong> 在短影音中，前三秒決定了觀眾是否划走。此模板開場預留了搶眼區間，建議放入大字標題與衝突畫面。
    </div>
  `;
  window.openInspectorDrawer('開場 HOOK 搶眼設計', 'HOOK', content, 0);
}

function showNarrativeInspector(start, end) {
  const narr = currentTemplate.narrative || {};
  const summary = narr.summary || '中段快節奏剪輯展開，透明化與場景變換。';
  const structure = narr.structure || '起：懸念導入；承：快速展開；轉：細節特寫；合：總結引導。';
  const tone = translateTone(narr.tone);
  const content = `
    <div>
      <strong style="color:var(--ai-purple);">敘事結構風格：</strong>
      <span style="background:var(--ai-purple-soft); color:var(--ai-purple); padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700;">${narr.type || 'montage'}</span>
      <span style="background:rgba(255,255,255,0.06); color:#cbd5e1; padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700; margin-left:6px;">語調：${tone}</span>
    </div>
    <div>
      <strong style="display:block; margin-bottom:6px; color:#f1f5f9; font-size:0.84rem;">分鏡結構起承轉合：</strong>
      <div style="font-size: 0.88rem; line-height: 1.6; color: #cbd5e1; background: rgba(124, 77, 255, 0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(124, 77, 255, 0.2);">
        ${formatTextWithLinks(structure)}
      </div>
    </div>
    <div>
      <strong style="display:block; margin-bottom:4px; color:#f1f5f9; font-size:0.84rem;">核心策略總結：</strong>
      <p style="margin:0; font-size:0.84rem; color:#94a3b8; line-height:1.5;">${formatTextWithLinks(summary)}</p>
    </div>
  `;
  window.openInspectorDrawer('中段敘事手法與起承轉合', 'NARRATIVE', content, start);
}

function showEmotionInspector(emotion, start, shotNum) {
  const content = `
    <div>
      <strong style="color:var(--ai-cyan);">情緒定位點：</strong>
      <span style="background:var(--ai-cyan-soft); color:var(--ai-cyan); padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700;">${translateEmotion(emotion)} (${emotion})</span>
    </div>
    <p style="font-size: 0.88rem; line-height: 1.7; color: #cbd5e1; background: rgba(0, 180, 216, 0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(0, 180, 216, 0.22); margin: 0;">
      在第 <strong>${shotNum}</strong> 鏡頭（影片第 ${start} 秒處），演員/主角需要流露出 <strong>${translateEmotion(emotion)}</strong> 的表情或表現。
    </p>
  `;
  window.openInspectorDrawer(`鏡頭 ${shotNum} 情緒：${translateEmotion(emotion)}`, 'EMOTION', content, start);
}

function showQAInspector(dialogueInfo, start, shotNum) {
  const content = `
    <p style="font-size: 0.88rem; line-height: 1.7; color: #cbd5e1; background: rgba(6, 214, 160, 0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(6, 214, 160, 0.22); margin: 0;">
      <strong style="color:#38ef7d; display:block; margin-bottom:4px;">鏡頭 ${shotNum} 提問點：</strong>
      ${formatTextWithLinks(dialogueInfo)}
    </p>
  `;
  window.openInspectorDrawer(`互動提問機制 (鏡頭 ${shotNum})`, 'QA', content, start);
}

function showConflictInspector(camera, angle, action, start, shotNum) {
  const content = `
    <div style="display:flex; gap:8px;">
      <span style="background:var(--ai-orange-soft); color:#ffc93c; padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700;">運鏡：${translateCamera(camera)}</span>
      <span style="background:rgba(255,255,255,0.06); color:#cbd5e1; padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700;">視角：${angle}</span>
    </div>
    <div style="font-size: 0.88rem; line-height: 1.7; color: #cbd5e1; background: rgba(255, 183, 3, 0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(255, 183, 3, 0.22);">
      <strong style="color:#ffc93c; display:block; margin-bottom:4px;">視覺干擾行為：</strong>
      ${formatTextWithLinks(action)}
    </div>
  `;
  window.openInspectorDrawer(`視覺衝突與轉變 (鏡頭 ${shotNum})`, 'CONFLICT', content, start);
}

function showOutroInspector(start) {
  const mkt = currentTemplate.marketing || {};
  const integrationMethod = mkt.integrationMethod || 'plot';
  const persuasionStyle = mkt.persuasionStyle || 'subtle';

  const content = `
    <div style="display:flex; gap:8px; flex-wrap:wrap;">
      <span style="background:var(--ai-gold-soft); color:#ffe066; padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700;">品牌融合：${integrationMethod === 'plot' ? '劇情嵌入' : '直接曝光'}</span>
      <span style="background:rgba(255,255,255,0.06); color:#cbd5e1; padding:2px 8px; border-radius:4px; font-size:0.78rem; font-weight:700;">說服風格：${persuasionStyle === 'subtle' ? '潛移默化' : '強力催單'}</span>
    </div>
    <p style="font-size: 0.88rem; line-height: 1.7; color: #cbd5e1; background: rgba(255, 202, 58, 0.08); padding: 12px; border-radius: 8px; border: 1px solid rgba(255, 202, 58, 0.22); margin: 0;">
      🏆 <strong>結尾轉化設計：</strong> 影片尾段以行動指引（Call to Action）做收尾，引導觀眾留言互動、按讚訂閱或直接引流至品牌官網。
    </p>
  `;
  window.openInspectorDrawer('尾段收尾與行動指引 (CTA)', 'OUTRO', content, start);
}

/* ==========================================================================
   NAVIGATION & BROWSE HELPERS
   ========================================================================== */

window.backToStoreBrowse = function() {
  stopPlayerSync();
  if (currentSourcePlayerType === 'youtube') currentSourcePlayer?.pauseVideo?.();
  if (currentSourcePlayerType === 'html5') currentSourcePlayer?.pause?.();
  const storeView = document.getElementById('template-store-view');
  const detailImmersive = document.getElementById('template-detail-immersive');
  document.getElementById('page-main')?.classList.remove('is-template-detail-mode');
  if (storeView) storeView.style.display = 'flex';
  if (detailImmersive) detailImmersive.style.display = 'none';

  if (window.filterStoreTemplates) {
    window.filterStoreTemplates();
  }
};

window.destroyTemplateTimeline = function() {
  stopPlayerSync();
  if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.destroy) {
    try { currentSourcePlayer.destroy(); } catch (_) {}
  } else if (currentSourcePlayerType === 'html5' && currentSourcePlayer?.pause) {
    try { currentSourcePlayer.pause(); } catch (_) {}
  }
  currentSourcePlayer = null;
  currentSourcePlayerType = null;
  window.TemplateEditor?.destroy();
  currentTemplate = null;
  currentTime = 0;
  isPlaying = false;
  selectedItemId = null;
  window.closeInspectorDrawer?.();
  document.getElementById('page-main')?.classList.remove('is-template-detail-mode');
};

window.switchDetailViewMode = function(mode) {
  currentViewMode = mode === 'professional' ? 'professional' : 'story';
  const tabs = [document.getElementById('btn-mode-professional'), document.getElementById('btn-mode-story')].filter(Boolean);
  tabs.forEach((button, index) => {
    const active = index === (currentViewMode === 'professional' ? 0 : 1);
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
    const panel = document.getElementById(button.getAttribute('aria-controls'));
    if (panel) { panel.hidden = !active; panel.style.display = active ? 'block' : 'none'; }
    button.onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(index + 1) % tabs.length];
      next.click(); next.focus();
    };
  });
  // 切換視圖只改顯示狀態，不重設播放位置、鏡頭與面板資料。
  syncProfessionalPlayhead();
};

window.playTemplateSegment = function(seconds) {
  window.seekTimeline(seconds);
  if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.playVideo) {
    currentSourcePlayer.playVideo();
  } else if (currentSourcePlayerType === 'html5' && currentSourcePlayer?.play) {
    currentSourcePlayer.play();
  }
};

window.triggerTemplateDetail = async function(templateId) {
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

/* ==========================================================================
   DICTIONARY TRANSLATIONS & ANCHOR PARSERS
   ========================================================================== */

function translateEmotion(emotion) {
  if (!emotion) return '一般';
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
    'fear': '恐懼',
    'joyful': '愉悅',
    'delight': '陶醉/高興',
    'friendly': '親切/自然',
    'energetic': '活力充沛'
  };
  return emotions[emotion.toLowerCase()] || emotion;
}

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

function formatTextWithLinks(text) {
  if (typeof text !== 'string') return '';
  let formatted = text.replace(/(?:00:)?(\d{2}):(\d{2})/g, (match, min, sec) => {
    const totalSec = parseInt(min) * 60 + parseInt(sec);
    return `<a class="timeline-anchor-link" onclick="seekTimeline(${totalSec})">${match}</a>`;
  });
  formatted = formatted.replace(/第\s*(\d+)\s*(?:秒|s)/gi, (match, sec) => {
    const s = parseInt(sec);
    return `<a class="timeline-anchor-link" onclick="seekTimeline(${s})">第 ${s} 秒</a>`;
  });
  return formatted;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderTemplateDetailTimeline: window.renderTemplateDetailTimeline,
    backToStoreBrowse: window.backToStoreBrowse,
    triggerTemplateDetail: window.triggerTemplateDetail,
    destroyTemplateTimeline: window.destroyTemplateTimeline,
    switchDetailViewMode: window.switchDetailViewMode,
    playTemplateSegment: window.playTemplateSegment
  };
}

