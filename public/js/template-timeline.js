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
let currentNormalizedSegments = [];
let currentActiveSegmentId = null;
let narrativeCardAnimTimer = null;

// Player references
let currentSourcePlayer = null;
let currentSourcePlayerType = null; // 'youtube' | 'html5' | 'none'
let playerSyncFrame = null;
let playerRevision = 0;

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
  if (btn) {
    const playIcon = btn.querySelector('.play-icon');
    const pauseIcon = btn.querySelector('.pause-icon');
    if (playIcon) playIcon.style.display = isPlaying ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = isPlaying ? 'block' : 'none';
  }
  const studioBtn = document.getElementById('btn-studio-playpause');
  if (studioBtn) {
    const label = studioBtn.querySelector('.studio-play-label');
    if (label) label.textContent = isPlaying ? '⏸ 暫停' : '▶ 播放';
  }
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
  const revision = playerRevision;
  const mount = document.getElementById('detail-source-player');
  if (!mount) return;
  try {
    await loadYouTubePlayerApi();
    if (revision !== playerRevision || !document.getElementById('detail-source-player') || currentTemplate?.id !== templateId) return;
    currentSourcePlayerType = 'youtube';
    currentSourcePlayer = new window.YT.Player('detail-source-player', {
      videoId,
      playerVars: { rel: 0, playsinline: 1, modestbranding: 1, controls: 0 },
      events: {
        onReady: event => {
          if (revision !== playerRevision) return;
          event.target.getIframe?.()?.setAttribute('title', `${title} 原始影片播放器`);
        },
        onStateChange: event => {
          if (revision !== playerRevision) return;
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
/* ==========================================================================
   DICTIONARIES & PURPOSE MAPPINGS
   ========================================================================== */

const PURPOSE_MAP = {
  hook: '開場吸引注意',
  first_recommendation: '首發推薦',
  flavor_description: '風味描述',
  sensory_highlight: '感官重點',
  complementary_food: '補充介紹',
  dessert_climax: '甜點高潮',
  call_to_action: '行動指引',
  introduction: '主題介紹',
  demonstration: '示範使用',
  climax: '高潮亮點',
  conclusion: '總結收尾',
  product_showcase: '商品展示',
  storytelling: '故事推進',
  narrative: '鋪陳推進',
  payoff: '高潮轉折'
};

function describePurpose(purpose) {
  return PURPOSE_MAP[purpose] || purpose || '畫面呈現';
}

const CAMERA_MAP = {
  wide: '廣角全景', medium: '中景', 'close-up': '特寫', 'extreme-close-up': '大特寫',
  static: '固定鏡頭', handheld: '手持拍攝', tracking: '跟拍', pan: '橫向移動', tilt: '俯仰移動', zoom: '變焦'
};

function describeCamera(cam) {
  return CAMERA_MAP[cam] || cam || '未標註';
}

const ANGLE_MAP = {
  'eye-level': '平視', 'high-angle': '俯拍', 'low-angle': '仰拍', 'top-down': '正上方俯拍'
};

function describeAngle(angle) {
  return ANGLE_MAP[angle] || angle || '平視';
}

function extractCleanTitleAndTags(rawName, existingTags) {
  const name = String(rawName || '');
  const extracted = [];
  const cleanTitle = name.replace(/[#＃]([^\s#＃]+)/g, (_, tag) => {
    const trimmed = tag.trim();
    if (trimmed) extracted.push(trimmed);
    return '';
  }).trim().replace(/\s{2,}/g, ' ');

  const seen = new Set();
  const allTags = [];
  (Array.isArray(existingTags) ? existingTags : []).concat(extracted).forEach(t => {
    const clean = String(t || '').replace(/^[#＃]/, '').trim();
    if (clean && !seen.has(clean.toLowerCase())) {
      seen.add(clean.toLowerCase());
      allTags.push(clean);
    }
  });

  return {
    cleanTitle: cleanTitle || name || '無標題',
    tags: allTags
  };
}

function getTemplateSummary(template) {
  const trueSummary = template.summary || template.narrative?.summary;
  if (trueSummary) {
    return {
      text: trueSummary,
      fullText: trueSummary,
      isLong: trueSummary.length > 110
    };
  }
  const desc = template.description || '尚未提供模板描述。';
  return {
    text: desc.length > 110 ? desc.slice(0, 105) + '…' : desc,
    fullText: desc,
    isLong: desc.length > 110
  };
}

function buildNormalizedSegments(template, shots, totalSec) {
  if (Array.isArray(template.segments) && template.segments.length > 0) {
    return template.segments.map((seg, idx) => ({
      id: seg.id || `segment-${idx + 1}`,
      type: seg.type || 'build',
      label: seg.label || (seg.type === 'hook' ? 'HOOK · 開場鉤子' : seg.type === 'payoff' ? 'PAYOFF · 轉折高潮' : seg.type === 'close' ? 'OUTRO · 收束行動' : 'NARRATIVE · 鋪陳推進'),
      start: Number(seg.start) || 0,
      end: Number(seg.end) || totalSec,
      title: seg.title || seg.label || '敘事階段',
      summary: seg.summary || '透過鏡頭節奏呈現影片內容',
      provenance: 'explicit'
    }));
  }

  if (!shots || shots.length === 0) {
    return [{
      id: 'segment-1',
      type: 'hook',
      label: 'HOOK · 開場鉤子',
      start: 0,
      end: totalSec || 15,
      title: template.name || '影片開場',
      summary: template.description || '吸引觀眾注意力',
      provenance: 'inferred'
    }];
  }

  let cursor = 0;
  const shotTimes = shots.map((s, idx) => {
    const dur = shotSeconds(s);
    const start = cursor;
    cursor += dur;
    return { index: idx, shot: s, start, end: cursor, dur };
  });

  function classifyShotPurpose(purpose, idx, total) {
    const p = String(purpose || '').toLowerCase();
    if (p.includes('hook') || (idx === 0 && (p.includes('intro') || p === ''))) return 'hook';
    if (p.includes('climax') || p.includes('sensory') || p.includes('payoff') || p.includes('dessert')) return 'payoff';
    if (p.includes('action') || p.includes('cta') || p.includes('conclusion') || p.includes('outro') || (idx === total - 1 && total > 2)) return 'close';
    return 'build';
  }

  function getPhaseMeta(type, t, shot) {
    if (type === 'hook') {
      return {
        label: 'HOOK · 開場鉤子',
        title: t.hook?.description || '吸引觀眾注意',
        summary: t.hook?.description
          ? (t.hook.description.length > 50 ? t.hook.description.slice(0, 48) + '…' : t.hook.description)
          : '利用黃金前 3 秒迅速建立懸念或共鳴，留住觀眾繼續觀看。'
      };
    }
    if (type === 'payoff') {
      return {
        label: 'PAYOFF · 轉折高潮',
        title: describePurpose(shot?.purpose) || '視覺震撼與亮點爆發',
        summary: '全片最具記憶點的核心高潮，運用強烈感官細節引發情緒共振。'
      };
    }
    if (type === 'close') {
      return {
        label: 'OUTRO · 收束行動',
        title: '總結與互動指引',
        summary: '總結核心重點，以明確的行動指引（CTA）促成留言轉發或品牌記憶。'
      };
    }
    return {
      label: 'NARRATIVE · 鋪陳推進',
      title: describePurpose(shot?.purpose) || '主體內容展開',
      summary: '依照故事節奏逐步推進，保持資訊密度與觀眾好奇心。'
    };
  }

  const segments = [];
  let current = null;

  shotTimes.forEach(({ index, shot, start, end }) => {
    const type = classifyShotPurpose(shot.purpose, index, shots.length);
    if (!current || current.type !== type) {
      if (current) segments.push(current);
      const meta = getPhaseMeta(type, template, shot);
      current = {
        id: `segment-${segments.length + 1}`,
        type,
        label: meta.label,
        start,
        end,
        title: meta.title,
        summary: meta.summary,
        shotIndices: [index],
        provenance: 'inferred'
      };
    } else {
      current.end = end;
      current.shotIndices.push(index);
    }
  });
  if (current) segments.push(current);

  return segments;
}

/* ==========================================================================
   MAIN ENTRANCE: RENDER TEMPLATE DETAIL
   ========================================================================== */

window.renderTemplateDetailTimeline = function(template, detailContainer) {
  window.destroyTemplateTimeline();
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
  const detailBody = document.getElementById('template-detail-body') || detailImmersive?.querySelector?.('.template-detail-body');
  if (detailBody) {
    detailBody.scrollTop = 0;
    if (window.DynamicMaskSystem && typeof window.DynamicMaskSystem.attach === 'function') {
      window.DynamicMaskSystem.attach(detailBody, { maskSize: 36, direction: 'vertical' });
    }
  }
  updatePlayPauseButtonUI(false);
  window.closeInspectorDrawer();

  // Extract clean title and tags
  const { cleanTitle, tags } = extractCleanTitleAndTags(template.name || template.title || '無標題', template.tags);

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

  // Build decoupled normalized segments
  currentNormalizedSegments = buildNormalizedSegments(template, shots, timelineDuration);
  currentActiveSegmentId = null;

  // 1. Render Hero Left (L1 Metadata)
  renderHeroLeft(template, shots, timelineDuration, cleanTitle, tags);

  // 2. Mount source video preview in Hero right column
  mountSourcePreview(template);

  // 2b. Render Hero Scrubber Segments (YouTube-style chapters)
  renderHeroScrubberSegments(currentNormalizedSegments, timelineDuration);

  // 2c. Initialize Pro Studio Monitor Transport Controls
  initStudioTransportControls();

  // 3. Render Overview Section (L2 Highlights & Narrative Structure)
  renderOverviewSection(template, shots, currentNormalizedSegments);

  // 4. Render Shot Breakdown Section (L2/L3 Cards)
  renderShotBreakdownSection(template, shots);

  // 5. Initialize Dynamic Narrative Card with the first segment
  if (currentNormalizedSegments.length > 0) {
    currentActiveSegmentId = currentNormalizedSegments[0].id;
    updateDynamicNarrativeCard(currentNormalizedSegments[0], 0, true);
  }

  // 6. Initialize Advanced Workspace Toggle, Source Info Modal, and Sticky Header Scroll
  initAdvancedWorkspaceToggle();
  initSourceInfoModal(template);
  initStickyHeaderTransition();

  // 7. Render System & Analysis KPIs in Advanced workspace (L4)
  renderAnalysisOverview(template, shots);

  // 8. Bind apply button click behavior
  ['btn-apply-template-main', 'btn-apply-template-bottom'].forEach(id => {
    const applyBtn = document.getElementById(id);
    if (applyBtn) applyBtn.onclick = () => {
      window.spaNavigate('generate', { templateId: template.id });
    };
  });

  // 9. Render side overview panel (Media bin, inspector)
  renderSideMetadata(template);

  // 10. Render Professional View (Timeline & Track Filters)
  renderProfessionalView(template, shots);
  window.TemplateEditor?.mount(template, {
    seconds: shotSeconds, escape: escapeTemplateText, videoId: sourceVideoId,
    emotion: translateEmotion, seek: window.seekTimeline, inspect: showShotInspector
  });

  // 11. Initialize Mode Switcher
  window.switchDetailViewMode('professional');

  // 12. Reset Playhead & Timeline to 0s
  window.seekTimeline(0, { instant: true });

  // 13. Highlight first section (Hook) by default in inspector
  if (shots.length) showShotInspector(shots[0], 0, 0);
};

function renderHeroLeft(template, shots, totalSec, cleanTitle, tags) {
  // 1. Badges row
  const catBadge = document.getElementById('detail-category-badge');
  if (catBadge) catBadge.textContent = CAT_MAP[template.category] || template.category || '未分類';
  const shotsBadge = document.getElementById('detail-shots-count-badge');
  if (shotsBadge) shotsBadge.textContent = `${template.shotsCount || shots.length} 鏡頭`;
  const durBadge = document.getElementById('detail-duration-badge');
  if (durBadge) durBadge.textContent = totalSec > 0 ? `${totalSec}s` : '未提供時長';

  // 2. Title
  const titleEl = document.getElementById('detail-template-title');
  if (titleEl) titleEl.textContent = cleanTitle;
  const navTitle = document.getElementById('nav-template-name');
  if (navTitle) navTitle.textContent = cleanTitle;

  // 3. Summary & Expand toggle (超過兩行自動截斷，點擊切換展開/收合)
  const summaryInfo = getTemplateSummary(template);
  const descEl = document.getElementById('detail-template-desc');
  const expandBtn = document.getElementById('btn-desc-expand');
  if (descEl) {
    descEl.textContent = summaryInfo.fullText || summaryInfo.text;
    descEl.classList.remove('is-expanded');
  }
  if (expandBtn) {
    const isLongText = (summaryInfo.fullText || '').length > 60;
    expandBtn.hidden = !isLongText;
    let expanded = false;
    expandBtn.textContent = '閱讀全文';
    expandBtn.onclick = () => {
      expanded = !expanded;
      descEl?.classList.toggle('is-expanded', expanded);
      expandBtn.textContent = expanded ? '收合內容' : '閱讀全文';
    };
  }

  // 4. Hashtags (超過一行自動截斷，點擊切換展開/收合)
  const hashWrap = document.getElementById('detail-hashtags-wrapper');
  const hashContainer = document.getElementById('detail-hashtags-container');
  const hashExpand = document.getElementById('btn-hashtags-expand');
  if (hashWrap && hashContainer) {
    if (tags.length > 0) {
      hashWrap.hidden = false;
      hashContainer.classList.remove('is-expanded');
      hashContainer.innerHTML = tags.map(tag => `<span class="hashtag-pill">#${escapeTemplateText(tag)}</span>`).join('');
      const mayWrap = tags.length > 3 || tags.join('').length > 18;
      if (mayWrap && hashExpand) {
        hashExpand.hidden = false;
        let tagsExpanded = false;
        hashExpand.textContent = '展開全部';
        hashExpand.onclick = () => {
          tagsExpanded = !tagsExpanded;
          hashContainer.classList.toggle('is-expanded', tagsExpanded);
          hashExpand.textContent = tagsExpanded ? '收合標籤' : '展開全部';
        };
      } else if (hashExpand) {
        hashExpand.hidden = true;
      }
    } else {
      hashWrap.hidden = true;
    }
  }

  // 5. Use Case
  const useCaseItem = document.getElementById('hero-spec-usecase');
  const useCaseVal = document.getElementById('detail-usecase');
  if (useCaseItem && useCaseVal) {
    if (template.useCase) {
      useCaseItem.hidden = false;
      useCaseVal.textContent = template.useCase;
    } else {
      useCaseItem.hidden = true;
    }
  }

  // 6. Platform
  const platItem = document.getElementById('hero-spec-platform');
  const platContainer = document.getElementById('detail-platforms');
  if (platItem && platContainer) {
    const platforms = Array.isArray(template.platform) ? template.platform : (template.platform ? [template.platform] : []);
    if (platforms.length > 0) {
      platItem.hidden = false;
      platContainer.innerHTML = platforms.map(p => {
        const pLabel = p === 'reels' ? 'Instagram Reels' : p === 'tiktok' ? 'TikTok' : p === 'shorts' || p === 'youtube' ? 'YouTube Shorts' : p;
        return `<span class="spec-pill">${escapeTemplateText(pLabel)}</span>`;
      }).join('');
    } else {
      platItem.hidden = true;
    }
  }

  // 7. Creator Info
  const creatorVal = document.getElementById('detail-source-creator');
  if (creatorVal) {
    creatorVal.textContent = template.source?.channel || '未提供頻道';
  }

  // 8. Source video link in hero
  const srcLink = document.getElementById('detail-source-link');
  if (srcLink) {
    const videoId = sourceVideoId(template);
    const url = template.source?.url || template.videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '');
    if (url) {
      srcLink.hidden = false;
      srcLink.href = url;
    } else {
      srcLink.hidden = true;
    }
  }
}

function updateDynamicNarrativeCard(segment, shotIdx, isInstant) {
  const card = document.getElementById('detail-dynamic-narrative-card');
  if (!card || !segment) return;

  const phaseBadge = document.getElementById('dyn-phase-badge');
  const timeBadge = document.getElementById('dyn-time-badge');
  const phaseTitle = document.getElementById('dyn-phase-title');
  const phaseSummary = document.getElementById('dyn-phase-summary');
  const shotBadge = document.getElementById('dyn-shot-badge');

  const updateDOM = () => {
    if (phaseBadge) {
      phaseBadge.textContent = segment.label || '敘事階段';
      phaseBadge.className = `narrative-phase-badge is-${segment.type || 'build'}`;
    }
    if (timeBadge) {
      timeBadge.textContent = `${formatEditorTimecode(segment.start)}–${formatEditorTimecode(segment.end)}`;
    }
    if (phaseTitle) phaseTitle.textContent = segment.title || '吸引觀眾注意';
    if (phaseSummary) phaseSummary.textContent = segment.summary || '';
    if (shotBadge) shotBadge.textContent = `S${String(shotIdx + 1).padStart(2, '0')}`;
  };

  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isInstant || prefersReducedMotion) {
    updateDOM();
    return;
  }

  if (narrativeCardAnimTimer) clearTimeout(narrativeCardAnimTimer);
  card.classList.add('is-transitioning');
  narrativeCardAnimTimer = setTimeout(() => {
    updateDOM();
    card.classList.remove('is-transitioning');
    card.classList.add('is-entering');
    narrativeCardAnimTimer = setTimeout(() => {
      card.classList.remove('is-entering');
      narrativeCardAnimTimer = null;
    }, 220);
  }, 130);
}

function renderOverviewSection(template, shots, segments) {
  // 1. Key Insight
  const insight = template.analysis?.whyItWorks || template.narrative?.summary || template.description || '尚未提供核心洞察。';
  const insightEl = document.getElementById('analysis-key-insight');
  if (insightEl) insightEl.textContent = insight;

  // 2. Target Audience & Tone
  const audWrapper = document.getElementById('overview-target-audience');
  const audVal = document.getElementById('val-target-audience');
  if (audWrapper && audVal) {
    if (template.analysis?.targetAudience) {
      audWrapper.hidden = false;
      audVal.textContent = template.analysis.targetAudience;
    } else {
      audWrapper.hidden = true;
    }
  }

  const toneWrapper = document.getElementById('overview-tone');
  const toneVal = document.getElementById('val-tone');
  if (toneWrapper && toneVal) {
    if (template.narrative?.tone) {
      toneWrapper.hidden = false;
      toneVal.textContent = translateTone(template.narrative.tone);
    } else {
      toneWrapper.hidden = true;
    }
  }

  // 3. Replicable Elements
  const tagsEl = document.getElementById('analysis-insight-tags');
  if (tagsEl) {
    const replicable = Array.isArray(template.analysis?.replicableElements)
      ? template.analysis.replicableElements.slice(0, 4)
      : [];
    if (replicable.length > 0) {
      tagsEl.innerHTML = replicable.map((item, idx) => `
        <div class="replicable-item">
          <span class="rep-num">${String(idx + 1).padStart(2, '0')}</span>
          <span class="rep-text">${escapeTemplateText(item)}</span>
        </div>
      `).join('');
    } else {
      tagsEl.innerHTML = `<p class="overview-empty-hint">此模板未提供可複製手法分析。</p>`;
    }
  }

  // 4. Rhythm Track
  const rhythmTrack = document.getElementById('analysis-rhythm-track');
  if (rhythmTrack) {
    rhythmTrack.replaceChildren();
    if (segments && segments.length > 0) {
      segments.forEach(seg => {
        const segDur = Math.max(1, seg.end - seg.start);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `analysis-rhythm-segment is-${seg.type || 'build'}`;
        btn.style.flexGrow = String(segDur);
        btn.setAttribute('aria-label', `${seg.label}，${segDur} 秒，${seg.title}`);
        btn.title = `${seg.label} · ${segDur}s · ${seg.title}`;
        btn.innerHTML = `<b>${escapeTemplateText(seg.type.toUpperCase())}</b><span>${segDur}s</span>`;
        btn.onclick = () => {
          window.seekTimeline(seg.start);
        };
        rhythmTrack.appendChild(btn);
      });
    } else {
      const empty = document.createElement('span');
      empty.className = 'analysis-rhythm-empty';
      empty.textContent = '尚無節奏資料';
      rhythmTrack.appendChild(empty);
    }
  }
  const rhythmMid = document.getElementById('analysis-rhythm-mid');
  const rhythmEnd = document.getElementById('analysis-rhythm-end');
  if (rhythmMid) rhythmMid.textContent = formatEditorTimecode(timelineDuration / 2);
  if (rhythmEnd) rhythmEnd.textContent = formatEditorTimecode(timelineDuration);
}

function renderShotBreakdownSection(template, shots) {
  const container = document.getElementById('detail-shots-breakdown-list');
  if (!container) return;

  if (!shots || shots.length === 0) {
    container.innerHTML = `<div class="shots-empty-state"><p>此模板尚無鏡頭拆解資料。</p></div>`;
    return;
  }

  const sourceCover = template.thumbnail || template.cover || template.source?.thumbnail || (sourceVideoId(template) ? `https://i.ytimg.com/vi/${encodeURIComponent(sourceVideoId(template))}/hqdefault.jpg` : '');
  const prompts = Array.isArray(template.promptTemplate?.perShot) ? template.promptTemplate.perShot : [];

  let cursor = 0;
  container.innerHTML = shots.map((shot, index) => {
    const dur = shotSeconds(shot);
    const start = cursor;
    cursor += dur;
    const end = cursor;
    const frame = shot.thumbnail || shot.frameUrl || shot.imageUrl || '';
    const cover = frame || sourceCover;
    const dialogueVal = shot.dialogue ?? shot.dialogueInfo ?? shot.voiceover ?? shot.narration;
    const dialogueText = typeof dialogueVal === 'string' ? dialogueVal : Array.isArray(dialogueVal) ? dialogueVal.join('\n') : '';
    const prompt = prompts[index] || '';

    return `
      <article class="shot-breakdown-card${index === activeShotIndex ? ' is-active' : ''}" data-shot-index="${index}">
        <div class="shot-card-header">
          <div class="shot-card-meta">
            <span class="shot-number-badge">S${String(index + 1).padStart(2, '0')}</span>
            <span class="shot-time-range">${formatEditorTimecode(start)}–${formatEditorTimecode(end)}</span>
            <span class="shot-duration-badge">${dur}s</span>
          </div>
          <span class="shot-purpose-badge">${escapeTemplateText(describePurpose(shot.purpose))}</span>
        </div>
        <div class="shot-card-body">
          <div class="shot-thumb-wrapper">
            ${cover ? `<img src="${escapeTemplateText(cover)}" alt="鏡頭 ${index + 1} 參考畫面" loading="lazy">` : `<div class="shot-thumb-placeholder">S${index + 1}</div>`}
            <div class="shot-thumb-play-overlay" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            </div>
          </div>
          <div class="shot-action-content">
            <p class="shot-action-text">${escapeTemplateText(shot.action || '未提供畫面描述')}</p>
          </div>
        </div>
        <button type="button" class="btn-shot-expand" aria-expanded="false" data-shot-expand="${index}">
          <span class="expand-label-text">展開詳情</span>
          <svg class="chevron-sm" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div class="shot-card-expanded-content" id="shot-detail-${index}" hidden>
          ${dialogueText ? `
            <div class="shot-expanded-row">
              <span class="expanded-label">對白／旁白</span>
              <blockquote class="shot-dialogue-quote">${escapeTemplateText(dialogueText)}</blockquote>
            </div>
          ` : ''}
          <div class="shot-expanded-tags">
            <span class="exp-tag"><b>運鏡：</b>${escapeTemplateText(describeCamera(shot.camera))}</span>
            <span class="exp-tag"><b>視角：</b>${escapeTemplateText(describeAngle(shot.angle))}</span>
            <span class="exp-tag"><b>情緒：</b>${escapeTemplateText(translateEmotion(shot.emotion))}</span>
          </div>
          ${prompt ? `
            <div class="shot-expanded-row">
              <span class="expanded-label">製作提示詞</span>
              <div class="shot-prompt-code">${escapeTemplateText(prompt)}</div>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  }).join('');

  // Attach click listeners
  container.querySelectorAll('.shot-breakdown-card').forEach(card => {
    const idx = Number(card.dataset.shotIndex);
    const shot = shots[idx];
    const starts = shots.slice(0, idx).reduce((sum, s) => sum + shotSeconds(s), 0);

    card.onclick = event => {
      const expandBtn = event.target.closest('.btn-shot-expand');
      if (expandBtn) {
        event.stopPropagation();
        const detail = card.querySelector('.shot-card-expanded-content');
        if (detail) {
          const isExpanded = expandBtn.getAttribute('aria-expanded') === 'true';
          const nextState = !isExpanded;
          expandBtn.setAttribute('aria-expanded', String(nextState));
          detail.hidden = !nextState;
          const labelSpan = expandBtn.querySelector('.expand-label-text');
          if (labelSpan) labelSpan.textContent = nextState ? '收合詳情' : '展開詳情';
          expandBtn.classList.toggle('is-open', nextState);
        }
        return;
      }
      window.seekTimeline(starts);
      showShotInspector(shot, idx, starts);
    };
  });
}

function initAdvancedWorkspaceToggle() {
  const btn = document.getElementById('btn-toggle-advanced');
  const content = document.getElementById('advanced-workspace-content');
  const label = document.getElementById('toggle-advanced-label');
  if (!btn || !content) return;

  btn.onclick = () => {
    const isExpanded = btn.getAttribute('aria-expanded') === 'true';
    const next = !isExpanded;
    btn.setAttribute('aria-expanded', String(next));
    content.hidden = !next;
    if (label) label.textContent = next ? '收合分析' : '展開分析';
    btn.classList.toggle('is-expanded', next);
  };
}

function initSourceInfoModal(template) {
  const modal = document.getElementById('source-detail-modal');
  const openBtn = document.getElementById('btn-open-source-modal');
  const closeBtn = document.getElementById('btn-close-source-modal');
  if (!modal) return;

  const titleEl = document.getElementById('src-modal-title');
  const channelEl = document.getElementById('src-modal-channel');
  const viewsEl = document.getElementById('src-modal-views');
  const descEl = document.getElementById('src-modal-desc');
  const linkEl = document.getElementById('src-modal-link');

  const srcTitle = template.source?.title || template.name || '來源影片';
  const srcChannel = template.source?.channel || '未提供頻道';
  const srcViews = template.source?.views != null ? Number(template.source.views).toLocaleString('zh-TW') + ' 次觀看' : '—';
  const srcDesc = template.source?.description || template.description || '未提供原始說明';
  const videoId = sourceVideoId(template);
  const srcUrl = template.source?.url || template.videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : '#');

  if (titleEl) titleEl.textContent = srcTitle;
  if (channelEl) channelEl.textContent = srcChannel;
  if (viewsEl) viewsEl.textContent = srcViews;
  if (descEl) descEl.textContent = srcDesc;
  if (linkEl) {
    linkEl.href = srcUrl;
    linkEl.style.display = srcUrl === '#' ? 'none' : 'inline-flex';
  }

  const openModal = () => {
    modal.hidden = false;
    closeBtn?.focus();
  };
  const closeModal = () => {
    modal.hidden = true;
    openBtn?.focus();
  };

  if (openBtn) openBtn.onclick = openModal;
  if (closeBtn) closeBtn.onclick = closeModal;
  modal.onclick = event => {
    if (event.target === modal) closeModal();
  };
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) closeModal();
  });
}

function initStickyHeaderTransition() {
  const detailBody = document.getElementById('template-detail-body');
  const container = document.getElementById('template-detail-immersive');
  const heroTitle = document.getElementById('detail-template-title');
  const dockTitle = document.getElementById('floating-dock-title');
  const navTitle = document.getElementById('nav-template-name');
  const menubar = document.getElementById('template-detail-menubar');
  if (!detailBody || !container || !heroTitle || !dockTitle || !navTitle || !menubar) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let cachedMenubarHeight = 56;
  let cachedTargetRect = null;
  let cachedHeroOffsetTop = 0;
  let cachedHeroRect = null;
  let startDock = 40;
  const dockRange = 75; // Smooth 75px scroll distance for docking FLIP

  const updateMeasurements = () => {
    const mbRect = menubar.getBoundingClientRect();
    cachedMenubarHeight = mbRect.height || 56;
    cachedTargetRect = navTitle.getBoundingClientRect();
    cachedHeroOffsetTop = heroTitle.offsetTop;
    cachedHeroRect = heroTitle.getBoundingClientRect();
    startDock = Math.max(10, cachedHeroOffsetTop - cachedMenubarHeight - 16);
    dockTitle.textContent = heroTitle.textContent || '';
  };

  updateMeasurements();
  window.addEventListener('resize', updateMeasurements, { passive: true });

  let ticking = false;
  const onScroll = () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const top = detailBody.scrollTop;
        const endDock = startDock + dockRange;

        if (prefersReducedMotion) {
          const isScrolled = top > startDock;
          container.classList.toggle('is-scrolled', isScrolled);
          navTitle.style.opacity = isScrolled ? '1' : '0';
          heroTitle.style.opacity = isScrolled ? '0' : '1';
          dockTitle.style.display = 'none';
          ticking = false;
          return;
        }

        if (top < startDock) {
          // Resting in Hero
          dockTitle.style.display = 'none';
          heroTitle.style.opacity = '1';
          navTitle.style.opacity = '0';
          container.classList.remove('is-scrolled');
        } else if (top >= startDock && top <= endDock) {
          // In transition: glide towards header center
          container.classList.add('is-scrolled');
          const rawProgress = (top - startDock) / dockRange;
          const progress = Math.min(1, Math.max(0, rawProgress));
          const ease = progress * (2 - progress); // Ease out quad

          // Viewport position of hero title during scroll
          const heroCurrentTop = cachedHeroOffsetTop - top + cachedMenubarHeight;
          const targetTop = cachedTargetRect?.top || 14;
          const targetLeft = cachedTargetRect?.left || (window.innerWidth / 2 - 120);
          const targetWidth = cachedTargetRect?.width || 240;

          const startX = cachedHeroRect?.left || 24;
          const startY = heroCurrentTop;
          const curX = startX + (targetLeft - startX) * ease;
          const curY = startY + (targetTop - startY) * ease;
          const curScale = 1.0 - (1.0 - (15 / 30)) * ease;

          dockTitle.style.display = 'block';
          dockTitle.style.left = `${curX}px`;
          dockTitle.style.top = `${curY}px`;
          dockTitle.style.fontSize = `${30 * curScale}px`;
          dockTitle.style.maxWidth = ease > 0.5 ? `${targetWidth}px` : 'none';
          dockTitle.style.opacity = '1';

          heroTitle.style.opacity = String(Math.max(0, 1 - progress * 1.5));
          navTitle.style.opacity = '0';
        } else {
          // Fully docked in header center
          dockTitle.style.display = 'none';
          heroTitle.style.opacity = '0';
          navTitle.style.opacity = '1';
          container.classList.add('is-scrolled');
        }

        ticking = false;
      });
      ticking = true;
    }
  };
  detailBody.addEventListener('scroll', onScroll, { passive: true });
}

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
  if (durationEl) durationEl.textContent = shotCount ? `${timelineDuration}s` : '—';
  if (shotsEl) shotsEl.textContent = String(shotCount);
  if (averageEl) averageEl.textContent = shotCount ? `${average.toFixed(1)}s` : '—';
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
    scrubber.onkeydown = event => {
      const positions = { ArrowLeft: currentTime - 1, ArrowRight: currentTime + 1, Home: 0, End: timelineDuration };
      if (!(event.key in positions)) return;
      event.preventDefault();
      window.seekTimeline(positions[event.key]);
    };
  }
}

function renderHeroScrubberSegments(segments, totalDuration) {
  const container = document.getElementById('player-scrubber-segments');
  if (!container) return;
  container.replaceChildren();

  const safeDuration = totalDuration || 15;
  const segList = Array.isArray(segments) && segments.length > 0
    ? segments
    : [{ id: 'seg-1', label: '片段', start: 0, end: safeDuration }];

  segList.forEach(seg => {
    const segDur = Math.max(0.5, seg.end - seg.start);
    const segEl = document.createElement('div');
    segEl.className = 'player-scrubber-segment';
    segEl.style.flex = String(segDur);
    segEl.setAttribute('data-seg-id', seg.id);
    segEl.title = `${seg.label || '片段'} (${formatEditorTimecode(seg.start)} - ${formatEditorTimecode(seg.end)})`;
    segEl.innerHTML = '<div class="player-scrubber-segment-fill" style="width: 0%;"></div>';

    segEl.onclick = (e) => {
      e.stopPropagation();
      const rect = segEl.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / (rect.width || 1)));
      const targetSec = seg.start + ratio * segDur;
      window.seekTimeline(targetSec);
    };

    container.appendChild(segEl);
  });
}

function getShotStartTime(shotIndex) {
  const shots = Array.isArray(currentTemplate?.structure) ? currentTemplate.structure : [];
  let accum = 0;
  for (let i = 0; i < shotIndex && i < shots.length; i++) {
    accum += shotSeconds(shots[i]);
  }
  return accum;
}

function initStudioTransportControls() {
  const playBtn = document.getElementById('btn-studio-playpause');
  if (playBtn) {
    playBtn.onclick = togglePlayPause;
  }
  const prevBtn = document.getElementById('editor-prev-shot');
  if (prevBtn) {
    prevBtn.onclick = () => {
      const shots = Array.isArray(currentTemplate?.structure) ? currentTemplate.structure : [];
      if (!shots.length) return;
      const targetIdx = Math.max(0, activeShotIndex - 1);
      window.seekTimeline(getShotStartTime(targetIdx));
    };
  }
  const nextBtn = document.getElementById('editor-next-shot');
  if (nextBtn) {
    nextBtn.onclick = () => {
      const shots = Array.isArray(currentTemplate?.structure) ? currentTemplate.structure : [];
      if (!shots.length) return;
      const targetIdx = Math.min(shots.length - 1, activeShotIndex + 1);
      window.seekTimeline(getShotStartTime(targetIdx));
    };
  }
  const scrubber = document.getElementById('studio-scrubber-track');
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
  const scrubberEl = document.getElementById('player-scrubber-track');
  if (scrubberEl) {
    scrubberEl.setAttribute('aria-valuemax', String(timelineDuration));
    scrubberEl.setAttribute('aria-valuenow', String(Math.round(seconds * 10) / 10));
    scrubberEl.setAttribute('aria-valuetext', formatEditorTimecode(seconds));
  }

  if (progressEl) progressEl.style.width = `${pct}%`;
  if (thumbEl) thumbEl.style.left = `${pct}%`;
  if (timecodeEl) timecodeEl.textContent = formatEditorTimecode(seconds);
  if (durEl) durEl.textContent = formatEditorTimecode(timelineDuration);
  if (proTimecodeEl) proTimecodeEl.textContent = formatEditorTimecode(seconds);

  // 1b. Update Segmented Scrubber fills (YouTube-style chapters)
  const segEls = document.querySelectorAll('#player-scrubber-segments .player-scrubber-segment');
  if (currentNormalizedSegments && segEls.length === currentNormalizedSegments.length) {
    currentNormalizedSegments.forEach((seg, idx) => {
      const el = segEls[idx];
      const fillEl = el?.querySelector('.player-scrubber-segment-fill');
      if (fillEl) {
        if (seconds <= seg.start) {
          fillEl.style.width = '0%';
        } else if (seconds >= seg.end) {
          fillEl.style.width = '100%';
        } else {
          const segDur = Math.max(0.1, seg.end - seg.start);
          const segPct = Math.min(100, Math.max(0, ((seconds - seg.start) / segDur) * 100));
          fillEl.style.width = `${segPct}%`;
        }
      }
    });
  }

  // 1c. Update Studio Monitor & Controls (player-controls-background-container)
  const studioTc = document.getElementById('studio-monitor-timecode');
  if (studioTc) studioTc.textContent = `${formatEditorTimecode(seconds)} / ${formatEditorTimecode(timelineDuration)}`;
  const studioProg = document.getElementById('studio-scrubber-progress');
  const studioThumb = document.getElementById('studio-scrubber-thumb');
  if (studioProg) studioProg.style.width = `${pct}%`;
  if (studioThumb) studioThumb.style.left = `${pct}%`;

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

  // 3b. Update Studio Monitor Preview Image & Shot Action
  const curShotEl = document.getElementById('editor-current-shot');
  const curActEl = document.getElementById('editor-current-action');
  const curImgEl = document.getElementById('studio-shot-preview-img');
  const fallbackEl = document.getElementById('studio-monitor-fallback');
  const activeShot = shots[foundIndex];
  if (curShotEl) curShotEl.textContent = `S${String(foundIndex + 1).padStart(2, '0')}`;
  if (curActEl) {
    curActEl.textContent = activeShot ? (activeShot.description || activeShot.visual || activeShot.action || `鏡頭 ${foundIndex + 1}`) : '畫面預覽';
  }
  if (activeShot && (activeShot.previewUrl || activeShot.thumbnailUrl)) {
    if (curImgEl) {
      curImgEl.src = activeShot.previewUrl || activeShot.thumbnailUrl;
      curImgEl.style.display = 'block';
    }
    if (fallbackEl) fallbackEl.style.display = 'none';
  } else {
    if (curImgEl) curImgEl.style.display = 'none';
    if (fallbackEl) fallbackEl.style.display = 'flex';
  }

  // 4. Update Dynamic Narrative Card (L2 Synchronized Card)
  if (currentNormalizedSegments && currentNormalizedSegments.length > 0) {
    const matchingSeg = currentNormalizedSegments.find(seg => seconds >= seg.start && seconds < seg.end)
      || currentNormalizedSegments[currentNormalizedSegments.length - 1];
    if (matchingSeg && matchingSeg.id !== currentActiveSegmentId) {
      currentActiveSegmentId = matchingSeg.id;
      updateDynamicNarrativeCard(matchingSeg, foundIndex, options.instant);
    } else if (matchingSeg) {
      const shotBadge = document.getElementById('dyn-shot-badge');
      if (shotBadge) shotBadge.textContent = `S${String(foundIndex + 1).padStart(2, '0')}`;
    }

    // Highlight matching rhythm track segment
    const rhythmSegs = document.querySelectorAll('#analysis-rhythm-track .analysis-rhythm-segment');
    if (matchingSeg && rhythmSegs.length > 0) {
      currentNormalizedSegments.forEach((seg, sIdx) => {
        if (rhythmSegs[sIdx]) {
          rhythmSegs[sIdx].classList.toggle('is-active', seg.id === matchingSeg.id);
        }
      });
    }
  }

  // 5. Update Active Shot Breakdown Card (L2/L3 Cards)
  const shotCards = document.querySelectorAll('#detail-shots-breakdown-list .shot-breakdown-card');
  if (shotCards.length > 0) {
    shotCards.forEach((c, idx) => {
      c.classList.toggle('is-active', idx === foundIndex);
    });
  }

  // 6. Update Story View Active Node & Canvas Axis Progress
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
  if (window.templatePageNavigation) return window.templatePageNavigation.back();
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
  playerRevision++;
  stopPlayerSync();
  if (currentSourcePlayerType === 'youtube' && currentSourcePlayer?.destroy) {
    try { currentSourcePlayer.destroy(); } catch (_) {}
  } else if (currentSourcePlayerType === 'html5' && currentSourcePlayer?.pause) {
    currentSourcePlayer.onplay = currentSourcePlayer.onpause = currentSourcePlayer.onended = currentSourcePlayer.ontimeupdate = null;
    try { currentSourcePlayer.pause(); } catch (_) {}
  }
  currentSourcePlayer = null;
  currentSourcePlayerType = null;
  window.TemplateEditor?.destroy();
  currentTemplate = null;
  currentTime = 0;
  timelineDuration = 0;
  activeShotIndex = 0;
  visibleTracks = Object.fromEntries(TRACKS_CONFIG.map(track => [track.id, track.default]));
  isPlaying = false;
  selectedItemId = null;
  currentNormalizedSegments = [];
  currentActiveSegmentId = null;
  if (narrativeCardAnimTimer) {
    clearTimeout(narrativeCardAnimTimer);
    narrativeCardAnimTimer = null;
  }
  document.getElementById('template-detail-immersive')?.classList.remove('is-scrolled');
  const dockTitle = document.getElementById('floating-dock-title');
  if (dockTitle) dockTitle.style.display = 'none';
  const heroTitle = document.getElementById('detail-template-title');
  if (heroTitle) heroTitle.style.opacity = '1';
  const navTitle = document.getElementById('nav-template-name');
  if (navTitle) navTitle.style.opacity = '0';
  window.closeInspectorDrawer?.();
  const detailBody = document.getElementById('template-detail-body') || document.querySelector('.template-detail-body');
  if (detailBody && window.DynamicMaskSystem && typeof window.DynamicMaskSystem.detach === 'function') {
    window.DynamicMaskSystem.detach(detailBody);
  }
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
  if (window.templatePageNavigation) return window.templatePageNavigation.preview(templateId);
  if (window.spaNavigate) return window.spaNavigate('template', { templateId });
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

