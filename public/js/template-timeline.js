/**
 * Storyboard AI — Template Timeline Controller
 * Handles rendering the interactive video editing timeline and inspector.
 */

// Category mapping helper
const CAT_MAP = {
  'product': '商品焦點',
  'story': '品牌故事',
  'twist': '反轉爆點',
  'custom': '自訂模板',
  '未分類': '未分類'
};

let currentTemplate = null;
let timelineDuration = 0; // Total duration in seconds

/**
 * Main entrance to render a template detail
 */
window.renderTemplateDetailTimeline = function(template, detailContainer) {
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

  // Calculate total duration from shots
  const shots = Array.isArray(template.structure) ? template.structure : [];
  let totalSec = 0;
  shots.forEach(s => {
    const sec = parseInt(s.duration) || 3; // fallback 3s
    totalSec += sec;
  });
  timelineDuration = totalSec || 15; // default 15s if no shots

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
  
  document.getElementById('meta-usecase').textContent = t.useCase || '短影音宣傳、生活/產品Vlog';
  document.getElementById('meta-platforms').textContent = platforms.toUpperCase();
  document.getElementById('meta-audience').textContent = t.analysis?.targetAudience || '大眾社群用戶';
  document.getElementById('meta-shotscount').textContent = `${t.shotsCount || (t.structure ? t.structure.length : 0)} 鏡`;
  document.getElementById('meta-duration').textContent = `${timelineDuration} 秒`;
  document.getElementById('meta-variables').innerHTML = varsList.map(v => `<code style="background:#f0f0f5; color:#5d3a9b; padding:2px 6px; border-radius:4px; margin-right:4px; font-size:0.8rem;">${v}</code>`).join('') || '無變數';

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

  // Setup click handler on time ruler for seek playhead
  rulerTicks.onclick = function(e) {
    const rect = rulerTicks.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPercent = clickX / rect.width;
    const targetSeconds = clickPercent * timelineDuration;
    window.seekTimeline(targetSeconds);
  };

  // Add click handler to tracks cells too so clicking aligns playhead
  const contentCells = [shotsContainer, hookContainer, narrativeContainer, emotionContainer, qaContainer, conflictContainer, outroContainer];
  contentCells.forEach(cell => {
    cell.onclick = function(e) {
      // Ignore if clicking on a block itself
      if (e.target !== cell) return;
      const rect = cell.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickPercent = clickX / rect.width;
      const targetSeconds = clickPercent * timelineDuration;
      window.seekTimeline(targetSeconds);
    };
  });

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
    const blockWidth = (dur / timelineDuration) * 100;
    const blockLeft = (accumulatedTime / timelineDuration) * 100;

    const block = document.createElement('div');
    block.className = 'timeline-block shot-block';
    block.style.left = `${blockLeft}%`;
    block.style.width = `${blockWidth}%`;
    block.setAttribute('data-start', accumulatedTime);
    block.setAttribute('data-end', accumulatedTime + dur);
    block.setAttribute('data-shot-index', index);

    block.innerHTML = `<div>🎬 鏡頭 ${shot.shot} (${dur}s) | ${shot.camera || 'static'}</div>`;

    block.onclick = (e) => {
      e.stopPropagation();
      window.seekTimeline(parseFloat(block.getAttribute('data-start')));
      highlightTimelineBlock(block);
      showShotInspector(shot, index, accumulatedTime);
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
  hookBlock.innerHTML = `🎯 Hook 搶眼開場 (0-${hookDur}s)`;
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
  narrBlock.innerHTML = `🎬 中段敘事結構 (${narrStart}-${narrEnd}s)`;
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
  outroBlock.innerHTML = `🏆 尾段品牌印象與 CTA (${outroStart}-${timelineDuration}s)`;
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
      emoBlock.innerHTML = `🌊 ${translateEmotion(shot.emotion)}`;
      
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
      qaBlock.innerHTML = `🗣️ 互動提問鏡頭`;
      
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
    qaBlock.innerHTML = `🗣️ 建議互動提問點`;
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
      confBlock.innerHTML = `⚡ 視覺/聽覺干擾`;

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
    confBlock.innerHTML = `⚡ 視覺波動點`;
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
window.seekTimeline = function(seconds) {
  if (seconds < 0) seconds = 0;
  if (seconds > timelineDuration) seconds = timelineDuration;

  const playhead = document.getElementById('timeline-playhead');
  if (!playhead) return;

  const pct = (seconds / timelineDuration) * 100;
  playhead.style.left = `${pct}%`;

  // Format time e.g., 00:03
  const roundedSec = Math.round(seconds);
  const playheadHead = playhead.querySelector('.playhead-head');
  if (playheadHead) {
    playheadHead.textContent = `00:${roundedSec < 10 ? '0' + roundedSec : roundedSec}`;
  }

  // Auto scroll timeline container to keep playhead in view
  const timelineBody = document.getElementById('timeline-editor-body');
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
