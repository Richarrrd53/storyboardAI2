/**
 * StoryboardAI — ProjectCard Component & Geometry Module
 * 
 * 負責專案卡片 (Project Folder Card) 的 HTML 結構渲染、比例正規化、
 * 時間格式化、固定 16:9 外框幾何運算與轉場尺寸計算。
 * 
 * 符合 StoryboardAI Design System:
 * - 實體文件夾隱喻 (Project Folder Card)
 * - 固定 16:9 封面外框 (Adaptive Cover Frame)
 * - 懸浮物理抬升 (Hover Lift / Rotate)
 * - 首鏡跨頁轉場幾何 (Transition Target Size & Contained Rect)
 */

(function (global) {
  'use strict';

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, function (m) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[m];
    });
  }

  function formatRatioBadge(ratio) {
    if (!ratio) return '16:9';
    return ratio;
  }

  function normalizeRatio(ratio) {
    if (!ratio) return '16:9';
    const str = String(ratio).trim();
    if (str.includes('9:16') || str.includes('9/16')) return '9:16';
    if (str.includes('2:3') || str.includes('2/3')) return '2:3';
    if (str.includes('1:1') || str.includes('1/1')) return '1:1';
    if (str.includes('4:3') || str.includes('4/3')) return '4:3';
    if (str.includes('3:2') || str.includes('3/2')) return '3:2';
    if (str.includes('21:9') || str.includes('21/9')) return '21:9';
    if (str.includes('16:9') || str.includes('16/9')) return '16:9';
    const match = str.match(/\d+[:/]\d+/);
    return match ? match[0].replace('/', ':') : '16:9';
  }

  function parseAspectRatio(ratioInput, width, height) {
    if (width > 0 && height > 0) {
      const r = width / height;
      if (isFinite(r) && r > 0) return r;
    }
    if (typeof ratioInput === 'number' && ratioInput > 0 && isFinite(ratioInput)) {
      return ratioInput;
    }
    const str = String(ratioInput || '').trim();
    if (!str) return 16 / 9;

    const match = str.match(/(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const w = parseFloat(match[1]);
      const h = parseFloat(match[2]);
      if (w > 0 && h > 0) return w / h;
    }

    const floatVal = parseFloat(str);
    if (!isNaN(floatVal) && floatVal > 0) {
      return floatVal;
    }

    if (str.includes('直向')) return 9 / 16;
    if (str.includes('方形')) return 1;
    if (str.includes('超寬')) return 21 / 9;
    return 16 / 9;
  }

  function calculateProjectCoverGeometry(options = {}) {
    const {
      aspectRatio = 16 / 9,
      variant = 'default',
      isMobile = false
    } = options;

    let r = Number(aspectRatio) || (16 / 9);
    if (r <= 0 || !isFinite(r)) r = 16 / 9;

    // Spec Section 1: Fixed 16:9 Cover Frame
    // Folder inner width ~92% ~ 95%
    // Default: 282px, Compact: 254px, Mobile: 248px
    let frameW = 282;
    let frameH = 158.6;
    let insertDepth = 46;
    let hoverLift = 16;
    let hoverRotate = -4.5;

    if (variant === 'compact') {
      frameW = 254;
      frameH = 142.9;
      insertDepth = 42;
      hoverLift = 14;
      hoverRotate = -4.5;
    }

    if (isMobile) {
      frameW = 248;
      frameH = 139.5;
      insertDepth = 40;
      hoverLift = 14;
      hoverRotate = -3.5;
    }

    return {
      frame: {
        width: frameW,
        height: frameH,
        insertDepth,
        aspectRatio: 16 / 9
      },
      // Collapsed and Expanded keep identical 16:9 frame dimensions
      // Spec Section 6: Hover does NOT change ratio, only translateY/rotate/shadow
      collapsed: {
        width: frameW,
        height: frameH,
        insertDepth,
        aspectRatio: 16 / 9
      },
      expanded: {
        width: frameW,
        height: frameH,
        insertDepth,
        x: 0,
        hoverLift,
        hoverRotate,
        aspectRatio: 16 / 9
      },
      width: frameW,
      height: frameH,
      insertDepth,
      trueRatio: r,
      hoverLift,
      hoverRotate
    };
  }

  function calculateTransitionTargetSize(options = {}) {
    const {
      aspectRatio = 16 / 9,
      viewportWidth = (typeof window !== 'undefined' ? window.innerWidth : 1200),
      viewportHeight = (typeof window !== 'undefined' ? window.innerHeight : 800)
    } = options;

    let r = Number(aspectRatio) || (16 / 9);
    if (r <= 0 || !isFinite(r)) r = 16 / 9;

    const vw = viewportWidth;
    const vh = viewportHeight;
    const isMob = vw < 768;

    // Spec limits:
    // max-width: 45% ~ 60% of viewport
    // max-height: 60% ~ 72% of viewport
    const maxW = isMob ? Math.min(vw * 0.88, 520) : Math.min(vw * 0.58, 860);
    const maxH = Math.min(vh * 0.68, 640);

    let targetW, targetH;

    if (r < 0.8) {
      // Portrait (e.g. 9:16, 2:3, 3:4)
      targetH = Math.min(maxH, isMob ? vh * 0.62 : 620);
      targetW = targetH * r;
      if (targetW > maxW) {
        targetW = maxW;
        targetH = targetW / r;
      }
    } else if (r <= 1.15) {
      // Square-ish (e.g. 1:1)
      const side = Math.min(maxW, maxH, isMob ? 360 : 500);
      targetW = side;
      targetH = targetW / r;
    } else {
      // Landscape (e.g. 4:3, 16:9, 21:9)
      targetW = Math.min(maxW, r >= 2.0 ? 840 : 760);
      targetH = targetW / r;
      if (targetH > maxH) {
        targetH = maxH;
        targetW = targetH * r;
      }
    }

    targetW = Math.round(targetW * 10) / 10;
    targetH = Math.round(targetH * 10) / 10;

    const targetLeft = Math.round((vw - targetW) / 2);
    const targetTop = Math.round((vh - targetH) / 2);

    return {
      width: targetW,
      height: targetH,
      left: targetLeft,
      top: targetTop,
      aspectRatio: r
    };
  }

  function getContainedImageRect(img) {
    if (!img) return null;
    const box = img.getBoundingClientRect ? img.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
    if (box.width <= 0 || box.height <= 0) return box;

    const naturalWidth = img.naturalWidth || box.width;
    const naturalHeight = img.naturalHeight || box.height;

    if (!naturalWidth || !naturalHeight) return box;

    const imageRatio = naturalWidth / naturalHeight;
    const boxRatio = box.width / box.height;

    let width;
    let height;
    let left;
    let top;

    if (imageRatio > boxRatio) {
      width = box.width;
      height = width / imageRatio;
      left = box.left;
      top = box.top + (box.height - height) / 2;
    } else {
      height = box.height;
      width = height * imageRatio;
      left = box.left + (box.width - width) / 2;
      top = box.top;
    }

    return {
      left: Math.round(left * 10) / 10,
      top: Math.round(top * 10) / 10,
      width: Math.round(width * 10) / 10,
      height: Math.round(height * 10) / 10
    };
  }

  function calculateBalancedPreviewSize(options = {}) {
    return calculateProjectCoverGeometry(options);
  }

  function formatRatioText(ratio) {
    const clean = normalizeRatio(ratio);
    if (clean === '16:9') return '橫向 16:9';
    if (clean === '9:16') return '直向 9:16';
    if (clean === '1:1') return '方形 1:1';
    if (clean === '4:3') return '橫向 4:3';
    if (clean === '3:2') return '橫向 3:2';
    if (clean === '2:3') return '直向 2:3';
    if (clean === '21:9') return '超寬 21:9';
    return ratio || '橫向 16:9';
  }

  function formatRelativeTime(dateInput) {
    if (!dateInput) return '剛剛編輯';
    const now = Date.now();
    const time = new Date(dateInput).getTime();
    if (isNaN(time)) return '剛剛編輯';
    const diffSec = Math.max(0, Math.floor((now - time) / 1000));
    
    if (diffSec < 60) return '剛剛編輯';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} 分鐘前編輯`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小時前編輯`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) return `${diffDay} 天前編輯`;
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth} 個月前編輯`;
    const diffYear = Math.floor(diffDay / 365);
    return `${diffYear} 年前編輯`;
  }

  function renderProjectCard(p, options = {}) {
    if (!p) return '';
    const variant = options.variant || (options.isCompact ? 'compact' : 'default');
    const isHistory = options.isHistory || false;
    const shotsCount = p.shotCount || (Array.isArray(p.shots) ? p.shots.length : 0);
    const cleanRatio = normalizeRatio(p.ratio);
    const ratioText = formatRatioText(p.ratio);
    const relativeTime = formatRelativeTime(p.updateAt || p.createAt);
    const titleEsc = escapeHtml(p.title || '未命名分鏡');

    const numericRatio = parseAspectRatio(p.ratio, p.width, p.height);
    const isMob = typeof options.isMobile === 'boolean'
      ? options.isMobile
      : (typeof global !== 'undefined' && typeof global.isMobileView === 'function'
          ? global.isMobileView()
          : false);
    const geom = calculateProjectCoverGeometry({
      aspectRatio: numericRatio,
      variant,
      isMobile: isMob
    });

    const hasSecondary = shotsCount > 1;

    return `
      <div class="project-preview-zone project-folder-preview-stack" data-ratio="${cleanRatio}">
        ${hasSecondary ? `
          <div class="project-preview-secondary" aria-hidden="true"></div>
        ` : ''}
        <div class="project-preview-primary project-cover-frame project-thumb loading"
             data-ratio="${cleanRatio}"
             data-true-ratio="${numericRatio}"
             data-collapsed-w="${geom.collapsed.width}"
             data-collapsed-h="${geom.collapsed.height}"
             data-expanded-w="${geom.expanded.width}"
             data-expanded-h="${geom.expanded.height}"
             data-expanded-x="0"
             data-expanded-depth="${geom.collapsed.insertDepth}"
             data-hover-lift="${geom.hoverLift}"
             style="--cover-width: ${geom.frame.width}px; --cover-height: ${geom.frame.height}px; --insert-depth: ${geom.frame.insertDepth}px; --collapsed-width: ${geom.collapsed.width}px; --collapsed-height: ${geom.collapsed.height}px; --collapsed-insert-depth: ${geom.collapsed.insertDepth}px; --expanded-width: ${geom.expanded.width}px; --expanded-height: ${geom.expanded.height}px; --expanded-insert-depth: ${geom.collapsed.insertDepth}px; --expanded-x: 0px; --hover-lift: ${geom.hoverLift}px; --hover-rotate: ${geom.hoverRotate}deg;"
             data-src="/api/projects/${p.id}/cover">
          <div class="thumb-fallback">
            <div class="fallback-frame">
              <span class="fallback-clapper">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8H4Z"/><path d="m4 11 2.3-4.6A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.8 1.4L20 11H4Z"/><path d="m6.5 5 2 6"/><path d="m11.5 5 2 6"/><path d="m16.5 5 2 6"/></svg>
              </span>
              <span class="fallback-status">草稿分鏡</span>
              <span class="fallback-sub">尚未生成封面</span>
            </div>
          </div>
        </div>
      </div>
      <div class="project-folder-shell">
        <div class="project-folder-header-row">
          <div class="project-folder-tab">
            <span class="project-folder-tab-dot"></span>
          </div>
          <div class="project-folder-notch-wrap">
            <div class="project-option-slot">
              <button class="project-option-btn" type="button" title="更多選項" aria-label="更多選項">
                <span class="option-icon">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="5" r="1.5" />
                    <circle cx="8" cy="11" r="1.5" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
        <div class="project-folder-content">
          <div class="project-updated">${relativeTime}</div>
          <div class="project-title-wrapper">
            <div class="project-title" title="${titleEsc}">${titleEsc}</div>
          </div>
          <div class="project-meta">
            <span class="project-meta-pill project-meta-shot">${shotsCount} 鏡頭</span>
            <span class="project-meta-pill project-meta-ratio">${ratioText}</span>
            ${(isHistory || p.is_deleted) ? `<span class="project-meta-pill project-restore-badge">已刪除</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function buildLightFilmCardHTML(p, isHistory = false) {
    return renderProjectCard(p, { variant: 'default', isHistory });
  }

  function buildHomeRecentCardHTML(p) {
    return renderProjectCard(p, { variant: 'compact' });
  }

  const ProjectCard = {
    escapeHtml,
    formatRatioBadge,
    normalizeRatio,
    parseAspectRatio,
    calculateProjectCoverGeometry,
    calculateTransitionTargetSize,
    getContainedImageRect,
    calculateBalancedPreviewSize,
    formatRatioText,
    formatRelativeTime,
    renderProjectCard,
    buildLightFilmCardHTML,
    buildHomeRecentCardHTML
  };

  // Mount on global window
  if (typeof global !== 'undefined') {
    global.ProjectCard = ProjectCard;
    // Top-level compatibility aliases
    global.calculateProjectCoverGeometry = calculateProjectCoverGeometry;
    global.calculateBalancedPreviewSize = calculateBalancedPreviewSize;
    global.calculateTransitionTargetSize = calculateTransitionTargetSize;
    global.getContainedImageRect = getContainedImageRect;
    global.parseAspectRatio = parseAspectRatio;
    global.normalizeRatio = normalizeRatio;
    global.formatRatioBadge = formatRatioBadge;
    global.formatRatioText = formatRatioText;
    global.formatRelativeTime = formatRelativeTime;
    global.renderProjectCard = renderProjectCard;
    global.buildLightFilmCardHTML = buildLightFilmCardHTML;
    global.buildHomeRecentCardHTML = buildHomeRecentCardHTML;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectCard;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
