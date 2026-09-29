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

function mountSharedPlayer(template) {
  const sourceUrl = template.videoUrl || template.source?.url || '';
  const youtubeMatch = sourceUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);
  const sourceVideoId = template.source?.videoId || template.videoId || youtubeMatch?.[1] || '';
  const sourceCover = template.thumbnail || template.cover || template.source?.thumbnail ||
    (sourceVideoId ? `https://i.ytimg.com/vi/${encodeURIComponent(sourceVideoId)}/hqdefault.jpg` : '');
  const sourceTitle = template.source?.title || template.name || template.title || '來源影片';

  const programMonitorEl = document.getElementById('detail-program-monitor');
  if (!programMonitorEl) return;

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
    player.controls = false;
    player.playsInline = true;
    currentSourcePlayer = player;
    currentSourcePlayerType = 'html5';

    player.addEventListener('play', () => {
      updatePlayPauseButtonUI(true);
      startPlayerSync();
    });
    player.addEventListener('pause', () => {
      updatePlayPauseButtonUI(false);
      stopPlayerSync();
    });
    player.addEventListener('timeupdate', () => {
      window.seekTimeline(player.currentTime, { fromPlayer: true });
    });
    player.addEventListener('seeking', () => {
      window.seekTimeline(player.currentTime, { fromPlayer: true });
    });
    programMonitorEl.prepend(player);
    if (fallback) fallback.hidden = true;
  } else if (sourceCover) {
    const image = document.createElement('img');
    image.className = 'nle-monitor-image';
    image.src = sourceCover;
    image.alt = `${sourceTitle}影片封面`;
    image.onerror = () => image.remove();
    programMonitorEl.prepend(image);
    currentSourcePlayer = null;
    currentSourcePlayerType = 'none';
    if (fallback) fallback.hidden = true;
  } else if (fallback) {
    currentSourcePlayer = null;
    currentSourcePlayerType = 'none';
    fallback.hidden = false;
  }

  // Setup play/pause button listener
  const playPauseBtn = document.getElementById('btn-player-playpause');
  if (playPauseBtn) {
    playPauseBtn.onclick = togglePlayPause;
  }

  // Setup Scrubber interaction
  const scrubberTrack = document.getElementById('player-scrubber-track');
  if (scrubberTrack) {
    const seekFromScrubber = e => {
      const rect = scrubberTrack.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const targetSec = (clickX / rect.width) * (timelineDuration || 1);
      window.seekTimeline(targetSec);
    };

    scrubberTrack.onpointerdown = e => {
      scrubberTrack.setPointerCapture?.(e.pointerId);
      seekFromScrubber(e);
      scrubberTrack.onpointermove = moveEvt => {
        if (moveEvt.buttons === 1) seekFromScrubber(moveEvt);
      };
      scrubberTrack.onpointerup = () => {
        scrubberTrack.onpointermove = null;
      };
    };
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
  currentViewMode = 'story';

  // Toggle store view vs detail immersive container
  const storeView = document.getElementById('template-store-view');
  const detailImmersive = document.getElementById('template-detail-immersive');
  if (storeView) storeView.style.display = 'none';
  if (detailImmersive) detailImmersive.style.display = 'flex';

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Calculate total duration from shots
  const shots = Array.isArray(template.structure) ? template.structure : [];
  let totalSec = 0;
  shots.forEach(s => {
    const sec = parseInt(s.duration) || 3;
    totalSec += sec;
  });
  timelineDuration = totalSec || 15;

  // 1. Render Template Header & Metadata
  renderTemplateHeader(template, shots.length);

  // 2. Mount Shared Video Player
  mountSharedPlayer(template);

  // 3. Render Story View (Default Mode)
  renderStoryView(template, shots);

  // 4. Render Professional View (Timeline & Track Filters)
  renderProfessionalView(template, shots);

  // 5. Initialize Mode Switcher
  window.switchDetailViewMode('story');

  // 6. Reset Playhead & Timeline to 0s
  window.seekTimeline(0);
};

/* ==========================================================================
   TEMPLATE HEADER RENDERING
   ========================================================================== */

function renderTemplateHeader(t, shotCount) {
  // Title & Navigation
  const title = t.name || t.title || '無標題';
  const navName = document.getElementById('nav-template-name');
  const headerTitle = document.getElementById('detail-template-title');
  if (navName) navName.textContent = title;
  if (headerTitle) headerTitle.textContent = title;

  // Summary (Priority: narrative.summary -> description)
  const summaryText = t.narrative?.summary || t.description || '無描述';
  const summaryEl = document.getElementById('detail-template-desc');
  if (summaryEl) summaryEl.textContent = summaryText;

  // Badges
  const catEl = document.getElementById('detail-category-badge');
  const shotsEl = document.getElementById('detail-shots-count-badge');
  const durEl = document.getElementById('detail-duration-badge');
  const toneEl = document.getElementById('detail-tone-badge');

  if (catEl) catEl.textContent = CAT_MAP[t.category] || t.category || '未分類';
  if (shotsEl) shotsEl.textContent = `${shotCount} 鏡頭`;
  if (durEl) durEl.textContent = `${timelineDuration} 秒`;
  if (toneEl) {
    if (t.narrative?.tone) {
      toneEl.textContent = translateTone(t.narrative.tone);
      toneEl.style.display = 'inline-block';
    } else {
      toneEl.style.display = 'none';
    }
  }

  // Collapsible Secondary Metadata
  const setText = (id, val, fallback = '—') => {
    const el = document.getElementById(id);
    if (el) el.textContent = (val === undefined || val === null || val === '') ? fallback : val;
  };

  setText('meta-usecase', t.useCase || '短影音宣傳、生活/產品Vlog');
  setText('meta-platforms', Array.isArray(t.platform) ? t.platform.join(', ').toUpperCase() : (t.platform ? String(t.platform).toUpperCase() : '無限制'));
  setText('meta-audience', t.analysis?.targetAudience || '大眾社群用戶');
  setText('meta-pace', t.visualFlow?.pace ? `${t.visualFlow.pace} · ${t.visualFlow?.rhythmPattern || ''}` : '標準節奏');

  // AI Success elements
  const whyItWorks = t.analysis?.whyItWorks;
  const replicableList = Array.isArray(t.analysis?.replicableElements) ? t.analysis.replicableElements : [];
  const colWhyItWorks = document.getElementById('col-why-it-works');

  if (!whyItWorks && replicableList.length === 0) {
    if (colWhyItWorks) colWhyItWorks.style.display = 'none';
  } else {
    if (colWhyItWorks) colWhyItWorks.style.display = 'block';
    setText('meta-why-it-works', whyItWorks || '利用快節奏剪輯與大眾共鳴點開場，輔以視覺細節特寫，加深信任感與轉換效果。');
    const replicableUl = document.getElementById('meta-replicable-elements');
    if (replicableUl) {
      replicableUl.innerHTML = '';
      replicableList.forEach(el => {
        const li = document.createElement('li');
        li.textContent = el;
        replicableUl.appendChild(li);
      });
    }
  }

  // Hook apply buttons
  const applyMainBtn = document.getElementById('btn-apply-template-main');
  const applyBottomBtn = document.getElementById('btn-apply-template-bottom');
  const onApply = () => {
    if (window.spaNavigate) {
      window.spaNavigate('generate', { templateId: t.id });
    } else {
      window.location.href = `generate-template.html?templateId=${encodeURIComponent(t.id)}`;
    }
  };
  if (applyMainBtn) applyMainBtn.onclick = onApply;
  if (applyBottomBtn) applyBottomBtn.onclick = onApply;
}

window.toggleMoreTemplateInfo = function() {
  const panel = document.getElementById('detail-more-info-panel');
  const btn = document.getElementById('btn-toggle-more-info');
  if (!panel || !btn) return;
  const isHidden = panel.hidden;
  panel.hidden = !isHidden;
  btn.classList.toggle('is-open', isHidden);
};

/* ==========================================================================
   VIEW MODE TOGGLE: STORY VIEW vs PROFESSIONAL VIEW
   ========================================================================== */

window.switchDetailViewMode = function(mode) {
  currentViewMode = mode === 'professional' ? 'professional' : 'story';

  const btnStory = document.getElementById('btn-mode-story');
  const btnPro = document.getElementById('btn-mode-professional');
  const panelStory = document.getElementById('view-mode-story');
  const panelPro = document.getElementById('view-mode-professional');

  if (btnStory) {
    btnStory.classList.toggle('active', currentViewMode === 'story');
    btnStory.setAttribute('aria-selected', currentViewMode === 'story');
  }
  if (btnPro) {
    btnPro.classList.toggle('active', currentViewMode === 'professional');
    btnPro.setAttribute('aria-selected', currentViewMode === 'professional');
  }

  if (panelStory && panelPro) {
    if (currentViewMode === 'story') {
      panelStory.style.display = 'flex';
      panelPro.style.display = 'none';
      highlightActiveStoryNode();
    } else {
      panelStory.style.display = 'none';
      panelPro.style.display = 'flex';
      syncProfessionalPlayhead();
    }
  }
};

/* ==========================================================================
   STORY VIEW: NARRATIVE CANVAS (v0.2)
   ========================================================================== */

const BEGINNER_PURPOSE_LABELS = {
  'hook': '抓住注意',
  'setup': '建立情境',
  'problem': '指出問題',
  'conflict': '提出問題',
  'development': '故事發展',
  'reveal': '揭露答案',
  'payoff': '給出結論',
  'twist': '出現反轉',
  'call_to_action': '引導行動',
  'cta': '引導行動',
  'outro': '尾段收尾',
  'sensory_highlight': '感官亮點',
  'first_recommendation': '首波推薦',
  'flavor_description': '細節鋪陳',
  'complementary_food': '延伸介紹',
  'dessert_climax': '精彩高潮'
};

function translateBeginnerPurpose(purpose) {
  if (!purpose) return '情境展開';
  const key = String(purpose).toLowerCase().trim();
  if (BEGINNER_PURPOSE_LABELS[key]) return BEGINNER_PURPOSE_LABELS[key];
  if (key.includes('hook') || key.includes('開場') || key.includes('注意')) return '抓住注意';
  if (key.includes('conflict') || key.includes('問題') || key.includes('痛點')) return '提出問題';
  if (key.includes('reveal') || key.includes('答案') || key.includes('揭曉')) return '揭露答案';
  if (key.includes('twist') || key.includes('反轉') || key.includes('高潮')) return '精彩高潮';
  if (key.includes('cta') || key.includes('行動') || key.includes('結尾') || key.includes('outro')) return '引導行動';
  return purpose;
}

function translateCamera(cam) {
  if (!cam) return '固定鏡頭';
  const map = {
    'static': '固定鏡頭',
    'pan': '平移運鏡',
    'tilt': '上下搖鏡',
    'zoom-in': '推鏡頭',
    'zoom-out': '拉鏡頭',
    'tracking': '跟隨運鏡',
    'handheld': '手持運鏡',
    'close-up': '細節特寫',
    'extreme-close-up': '極特寫',
    'drone': '空拍航拍'
  };
  return map[String(cam).toLowerCase()] || cam;
}

function translateHook(type) {
  if (!type) return '開場亮點';
  const map = {
    'curiosity': '製造好奇',
    'shock': '視覺震撼',
    'question': '引導提問',
    'action': '動作開場',
    'problem': '痛點共鳴',
    'statement': '直接觀點'
  };
  return map[String(type).toLowerCase()] || type;
}

function renderStoryView(template, shots) {
  const stage = document.getElementById('narrative-canvas-stage');
  const stageLabelsLayer = document.getElementById('canvas-stage-labels-layer');
  const axisDots = document.getElementById('canvas-axis-dots');
  const nodesLayer = document.getElementById('canvas-nodes-layer');
  const expansionLayer = document.getElementById('canvas-expansion-layer');

  if (!stage || !nodesLayer) return;

  // Clear previous layers
  if (stageLabelsLayer) stageLabelsLayer.innerHTML = '';
  if (axisDots) axisDots.innerHTML = '';
  nodesLayer.innerHTML = '';
  if (expansionLayer) expansionLayer.innerHTML = '';

  // Dynamic min-width to ensure breathing space and horizontal scrolling if needed
  const dynamicMinWidth = Math.max(960, shots.length * 210);
  stage.style.minWidth = `${dynamicMinWidth}px`;

  let accumulatedSec = 0;
  let prevPurposeLabel = '';

  shots.forEach((shot, index) => {
    const dur = parseInt(shot.duration) || 3;
    const startSec = accumulatedSec;
    const endSec = startSec + dur;
    const shotNum = String(shot.shot || index + 1).padStart(2, '0');

    // Horizontal position on true time timeline (5% to 95%)
    const leftPct = 5 + (startSec / (timelineDuration || 1)) * 90;
    const purposeLabel = translateBeginnerPurpose(shot.purpose);

    // 1. Stage Label (Top Layer)
    if (stageLabelsLayer && (purposeLabel !== prevPurposeLabel || index === 0 || index === shots.length - 1)) {
      const labelEl = document.createElement('div');
      labelEl.className = 'canvas-stage-label';
      labelEl.style.left = `${leftPct}%`;
      labelEl.innerHTML = `<span>${purposeLabel}</span>`;
      stageLabelsLayer.appendChild(labelEl);
      prevPurposeLabel = purposeLabel;
    }

    // 2. Axis Anchor Dot (Center Line Layer)
    if (axisDots) {
      const dotEl = document.createElement('div');
      dotEl.className = 'axis-anchor-dot';
      dotEl.id = `axis-dot-${index}`;
      dotEl.style.left = `${leftPct}%`;
      dotEl.setAttribute('data-shot-index', index);
      dotEl.title = `Shot ${shotNum} (${formatEditorTimecode(startSec)})`;
      dotEl.innerHTML = `<span class="dot-timestamp">${formatEditorTimecode(startSec)}</span>`;

      dotEl.onclick = (e) => {
        e.stopPropagation();
        window.seekTimeline(startSec);
        window.openExpansionBubble(shot, index, startSec, endSec, leftPct);
      };
      axisDots.appendChild(dotEl);
    }

    // 3. Primary Shot Node (Cards Layer)
    const nodeEl = document.createElement('div');
    nodeEl.className = 'canvas-shot-node';
    nodeEl.id = `canvas-shot-${index}`;
    nodeEl.style.left = `${leftPct}%`;
    nodeEl.setAttribute('data-shot-index', index);
    nodeEl.setAttribute('data-start', startSec);
    nodeEl.setAttribute('data-end', endSec);

    // Micro branches (Secondary nodes: hook, emotion, camera)
    const branches = [];
    if (index === 0 && template.hook?.type) {
      branches.push(`<span class="canvas-sec-node branch-hook"><span class="sec-dot"></span>${translateHook(template.hook.type)}</span>`);
    }
    if (shot.emotion && shot.emotion !== 'none') {
      branches.push(`<span class="canvas-sec-node branch-emotion"><span class="sec-dot"></span>${translateEmotion(shot.emotion)}</span>`);
    }
    if (shot.camera) {
      branches.push(`<span class="canvas-sec-node branch-camera"><span class="sec-dot"></span>${translateCamera(shot.camera)}</span>`);
    }

    const branchesHtml = branches.length > 0 ? `<div class="shot-node-branches">${branches.join('')}</div>` : '';

    nodeEl.innerHTML = `
      <div class="shot-node-header">
        <span class="shot-node-title">Shot ${shotNum}</span>
        <span class="shot-node-dur">${dur}s</span>
      </div>
      <div class="shot-node-purpose-tag">${purposeLabel}</div>
      <div class="shot-node-action-text">${shot.action || '主角展示畫面與內容'}</div>
      ${branchesHtml}
    `;

    nodeEl.onclick = (e) => {
      e.stopPropagation();
      window.seekTimeline(startSec);
      window.openExpansionBubble(shot, index, startSec, endSec, leftPct);
    };

    nodesLayer.appendChild(nodeEl);
    accumulatedSec += dur;
  });

  // Click outside bubble closes expansion
  stage.onclick = (e) => {
    if (!e.target.closest('.canvas-shot-node') && !e.target.closest('.axis-anchor-dot') && !e.target.closest('.canvas-expansion-bubble')) {
      window.closeExpandedBubble();
    }
  };
}

window.openExpansionBubble = function(shot, index, startSec, endSec, leftPct) {
  const expansionLayer = document.getElementById('canvas-expansion-layer');
  if (!expansionLayer) return;

  selectedItemId = `shot_${index}`;

  // Update selection & dimming states on nodes and dots
  const shotNodes = document.querySelectorAll('.canvas-shot-node');
  shotNodes.forEach((node, idx) => {
    const isSel = idx === index;
    node.classList.toggle('is-selected', isSel);
    node.classList.toggle('is-dimmed', !isSel);
  });

  const dots = document.querySelectorAll('.axis-anchor-dot');
  dots.forEach((dot, idx) => {
    dot.classList.toggle('is-selected', idx === index);
  });

  const dur = endSec - startSec;
  const shotNum = String(shot.shot || index + 1).padStart(2, '0');
  const purpose = translateBeginnerPurpose(shot.purpose);

  expansionLayer.innerHTML = `
    <div class="canvas-expansion-bubble" style="left: ${leftPct}%;">
      <div class="bubble-head">
        <div class="bubble-head-title">
          <strong>Shot ${shotNum}</strong>
          <span>${formatEditorTimecode(startSec)} – ${formatEditorTimecode(endSec)} (${dur}s)</span>
        </div>
        <button type="button" class="btn-close-bubble" onclick="closeExpandedBubble()" aria-label="關閉卡片">×</button>
      </div>
      <div class="bubble-body">
        <div class="bubble-field">
          <span class="bubble-field-label">分鏡作用 (Purpose)</span>
          <p class="bubble-field-val"><strong>${purpose}</strong> · ${formatTextWithLinks(shot.purpose || '推進故事與節奏')}</p>
        </div>
        <div class="bubble-field">
          <span class="bubble-field-label">畫面動作 (Action)</span>
          <p class="bubble-field-val">${formatTextWithLinks(shot.action || '畫面動作進行中')}</p>
        </div>
        <div class="bubble-field">
          <span class="bubble-field-label">拍攝規格 (Specs)</span>
          <p class="bubble-field-val">運鏡：<strong>${translateCamera(shot.camera)}</strong> · 視角：<strong>${shot.angle || '平視'}</strong> · 情緒：<strong>${translateEmotion(shot.emotion)}</strong></p>
        </div>
      </div>
      <div class="bubble-foot">
        <button type="button" class="btn-play-segment" onclick="window.playTemplateSegment(${startSec})">
          ▶ 播放這一段
        </button>
      </div>
    </div>
  `;
};

window.closeExpandedBubble = function() {
  selectedItemId = null;
  const expansionLayer = document.getElementById('canvas-expansion-layer');
  if (expansionLayer) expansionLayer.innerHTML = '';

  document.querySelectorAll('.canvas-shot-node').forEach(node => {
    node.classList.remove('is-selected', 'is-dimmed');
  });

  document.querySelectorAll('.axis-anchor-dot').forEach(dot => {
    dot.classList.remove('is-selected');
  });
};

window.playTemplateSegment = function(startSec) {
  window.seekTimeline(startSec);
  if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.playVideo) {
    currentSourcePlayer.playVideo();
  } else if (currentSourcePlayerType === 'html5' && currentSourcePlayer?.play) {
    currentSourcePlayer.play();
  }
};

/* ==========================================================================
   PROFESSIONAL VIEW: TRACK FILTERS & MULTI-TRACK TIMELINE
   ========================================================================== */

function renderProfessionalView(template, shots) {
  // 1. Render Track Filter Pills
  renderTrackFilters();

  // 2. Render Timeline Tracks
  renderTimelineWidget(template, shots);
}

function renderTrackFilters() {
  const pillsContainer = document.getElementById('track-filter-pills');
  if (!pillsContainer) return;
  pillsContainer.innerHTML = '';

  TRACKS_CONFIG.forEach(track => {
    const pill = document.createElement('label');
    pill.className = `track-filter-pill ${visibleTracks[track.id] ? 'is-active' : ''}`;
    pill.innerHTML = `
      <span class="pill-dot"></span>
      <input type="checkbox" data-track-id="${track.id}" ${visibleTracks[track.id] ? 'checked' : ''}>
      ${track.label}
    `;

    pill.querySelector('input').onchange = e => {
      const isChecked = e.target.checked;
      visibleTracks[track.id] = isChecked;
      pill.classList.toggle('is-active', isChecked);
      const trackRow = document.querySelector(`.timeline-track-row[data-track="${track.id}"]`);
      if (trackRow) {
        trackRow.hidden = !isChecked;
      }
    };

    pillsContainer.appendChild(pill);
  });

  // Apply initial track visibility
  TRACKS_CONFIG.forEach(track => {
    const trackRow = document.querySelector(`.timeline-track-row[data-track="${track.id}"]`);
    if (trackRow) {
      trackRow.hidden = !visibleTracks[track.id];
    }
  });
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
      tick.innerHTML = `00:${i < 10 ? '0' + i : i}`;
    } else {
      tick.style.height = '40%';
      tick.style.borderLeft = '1px solid rgba(255, 255, 255, 0.08)';
    }
    rulerTicks.appendChild(tick);
  }

  // 2. Shots Track
  let accumulatedTime = 0;
  shots.forEach((shot, index) => {
    const dur = parseInt(shot.duration) || 3;
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
      const dur = parseInt(shot.duration) || 3;
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
      const dur = parseInt(shot.duration) || 3;
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
      const dur = parseInt(shot.duration) || 3;
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
    const dur = parseInt(shots[i].duration) || 3;
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

  if (titleEl) titleEl.innerHTML = title;
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
};

window.closeInspectorDrawer = function() {
  const inspector = document.getElementById('timeline-local-inspector');
  if (inspector) inspector.hidden = true;
};

/* ==========================================================================
   INSPECTOR DETAIL RENDERERS
   ========================================================================== */

function showShotInspector(shot, index, start) {
  const shotNum = String(shot.shot || index + 1).padStart(2, '0');
  const dur = parseInt(shot.duration) || 3;
  const content = `
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
      <div style="background:rgba(255,255,255,0.04); padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.07);">
        <span style="font-size:0.72rem; color:#94a3b8; display:block;">運鏡方式</span>
        <strong style="color:#60a5fa; font-size:0.88rem;">🎥 ${translateCamera(shot.camera)}</strong>
      </div>
      <div style="background:rgba(255,255,255,0.04); padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.07);">
        <span style="font-size:0.72rem; color:#94a3b8; display:block;">畫面視角</span>
        <strong style="color:#60a5fa; font-size:0.88rem;">📐 ${shot.angle || '平視 (eye-level)'}</strong>
      </div>
      <div style="background:rgba(255,255,255,0.04); padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.07);">
        <span style="font-size:0.72rem; color:#94a3b8; display:block;">情緒要求</span>
        <strong style="color:#60a5fa; font-size:0.88rem;">🌊 ${translateEmotion(shot.emotion)}</strong>
      </div>
      <div style="background:rgba(255,255,255,0.04); padding:10px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.07);">
        <span style="font-size:0.72rem; color:#94a3b8; display:block;">鏡頭長度</span>
        <strong style="color:#60a5fa; font-size:0.88rem;">⏱️ ${shot.duration || `${dur}s`}</strong>
      </div>
    </div>
    <div>
      <strong style="display:block; margin-bottom:6px; color:#f1f5f9; font-size:0.84rem;">畫面動作 (Action)：</strong>
      <p style="margin:0; font-size:0.88rem; line-height:1.6; color:#cbd5e1; background:rgba(255,255,255,0.03); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
        ${formatTextWithLinks(shot.action || '畫面動作')}
      </p>
    </div>
    <div>
      <strong style="display:block; margin-bottom:6px; color:#f1f5f9; font-size:0.84rem;">分鏡目的 (Purpose)：</strong>
      <p style="margin:0; font-size:0.88rem; color:#cbd5e1; background:rgba(255,255,255,0.03); padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
        ${formatTextWithLinks(shot.purpose || '推進故事')}
      </p>
    </div>
  `;
  window.openInspectorDrawer(`Shot ${shotNum} 詳細屬性`, 'SHOT', content, start);
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
  if (storeView) storeView.style.display = 'flex';
  if (detailImmersive) detailImmersive.style.display = 'none';

  if (window.filterStoreTemplates) {
    window.filterStoreTemplates();
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
