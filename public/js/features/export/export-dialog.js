/**
 * StoryboardAI — Export Format Morph Menu & PDF Settings Dialog (Export System V2)
 *
 * Reuses:
 * - SurfaceMorph (shared liquid morph menu engine)
 * - OverlayManager & ModalAnimation (shared dialog focus/escape/animation system)
 * - Design System tokens & .sb-dialog / .sys-btn / .sb-dialog-checkbox primitives
 */
(function (root) {
  'use strict';

  const ICONS = {
    download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    json: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"></path><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"></path></svg>',
    pdf: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></svg>',
    back: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14"></path></svg>'
  };

  let activePdfDialog = null;
  let activeSubMorph = null;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveProjectTitle(source) {
    if (source?.project?.title) return source.project.title;
    if (source?.generationTask?.result?.storyboardData?.meta?.title) {
      return source.generationTask.result.storyboardData.meta.title;
    }
    if (source?.generationTask?.input?.story) {
      return source.generationTask.input.story.slice(0, 36);
    }
    return '未命名分鏡';
  }

  function buildFormatItemsHtml(includeBack = false) {
    return `
      ${includeBack ? `
        <button class="morph-item export-format-back" type="button" data-export-action="back" role="menuitem">
          <span class="morph-item-icon">${ICONS.back}</span>
          <span>返回選單</span>
        </button>
        <div class="morph-divider"></div>
      ` : ''}
      <button class="morph-item export-format-item" type="button" data-export-action="json" role="menuitem">
        <span class="morph-item-icon">${ICONS.json}</span>
        <span class="export-format-text">
          <span class="export-format-title">JSON 專案資料</span>
        </span>
      </button>
      <button class="morph-item export-format-item" type="button" data-export-action="pdf" role="menuitem">
        <span class="morph-item-icon">${ICONS.pdf}</span>
        <span class="export-format-text">
          <span class="export-format-title">PDF 分鏡企劃書</span>
        </span>
      </button>
    `;
  }

  function bindFormatMenuActions(container, source, { onClose, onBack, returnFocus } = {}) {
    container.querySelectorAll('[data-export-action]').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const action = btn.dataset.exportAction;
        if (action === 'back') {
          onBack?.();
          return;
        }
        const runAction = () => {
          if (action === 'json') {
            root.StoryboardExport?.exportJson(source);
          } else if (action === 'pdf') {
            openPdfDialog(source, { returnFocus });
          }
        };
        if (typeof onClose === 'function') {
          onClose(runAction);
        } else if (root.SurfaceMorph?.isOpen?.()) {
          root.SurfaceMorph.close('action', runAction);
        } else {
          runAction();
        }
      });
    });
  }

  /**
   * Open the Morph export format menu anchored to a trigger button (Project Detail / Generation Result).
   */
  function openFormatMenu(trigger, source, options = {}) {
    if (!trigger || !source) return null;

    if (!root.SurfaceMorph || typeof root.SurfaceMorph.open !== 'function') {
      return openPdfDialog(source, { returnFocus: trigger });
    }

    const menuContent = document.createElement('div');
    menuContent.className = 'project-actions-content export-format-menu';
    menuContent.innerHTML = buildFormatItemsHtml(false);

    bindFormatMenuActions(menuContent, source, {
      returnFocus: trigger,
      onClose: (done) => root.SurfaceMorph.close('action', done)
    });

    return root.SurfaceMorph.open(trigger, {
      ...options,
      content: menuContent,
      width: options.width || 196,
      height: options.height || 86,
      placement: options.placement || 'below',
      align: options.align || 'right',
      label: '匯出分鏡格式'
    });
  }

  /**
   * Level-2 Submenu Morph from the "匯出分鏡" button inside ProjectOptionMorph:
   * Delegated to SurfaceMorph.openSubmenu / closeSubmenu (matching temp/morph with 2nd menu.html).
   */
  function closeSubMorph(immediate = false, closeOpts = {}) {
    if (closeOpts?.dismissAll) return;
    if (root.SurfaceMorph?.closeSubmenu) {
      root.SurfaceMorph.closeSubmenu(immediate);
    } else if (activeSubMorph) {
      activeSubMorph.close(immediate);
    }
  }

  function openExportSubMorph(triggerBtn, menuContent, source, options = {}) {
    if (!triggerBtn || !menuContent || !source || typeof document === 'undefined') return false;
    if (!root.SurfaceMorph?.openSubmenu) return false;

    const primarySurface = triggerBtn.closest?.('.surface-morph-surface') || menuContent.closest?.('.surface-morph-surface');
    const panel = document.createElement('div');
    panel.className = 'export-submorph-panel';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', '匯出分鏡格式');

    const iconHtml = triggerBtn.querySelector?.('.morph-item-icon')?.innerHTML || ICONS.download;
    const labelText = triggerBtn.querySelector?.('.morph-item-label, span:not(.morph-item-icon):not(.morph-item-chevron)')?.textContent?.trim() || '匯出分鏡';
    const chevronHtml = triggerBtn.querySelector?.('.morph-item-chevron')?.innerHTML || `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="m7 15 5 5 5-5"></path>
        <path d="m7 9 5-5 5 5"></path>
      </svg>
    `;

    panel.innerHTML = `
      <div class="export-submorph-inner">
        <button class="morph-item export-submorph-header" type="button" data-export-action="retract" aria-label="收合匯出分鏡選單" role="menuitem">
          <span class="morph-item-icon">${iconHtml}</span>
          <span class="morph-item-label">${escapeHtml(labelText)}</span>
          <span class="morph-item-chevron" aria-hidden="true">${chevronHtml}</span>
        </button>
        <div class="morph-divider export-submorph-divider"></div>
        <button class="morph-item export-format-item export-submorph-option" type="button" data-export-action="json" role="menuitem">
          <span class="morph-item-icon">${ICONS.json}</span>
          <span class="export-format-text"><span class="export-format-title">JSON 專案資料</span></span>
        </button>
        <button class="morph-item export-format-item export-submorph-option" type="button" data-export-action="pdf" role="menuitem">
          <span class="morph-item-icon">${ICONS.pdf}</span>
          <span class="export-format-text"><span class="export-format-title">PDF 分鏡企劃書</span></span>
        </button>
      </div>
    `;

    const disposeHover = root.IconMotion?.bindHoverContainer?.(panel, {
      itemSelector: '.morph-item',
      canAnimate: () => panel.classList.contains('interactive') && !panel.inert
    });

    panel.querySelectorAll('[data-export-action]').forEach(btn => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const action = btn.dataset.exportAction;
        if (btn.dataset?.imGesturePlayed === 'true') {
          delete btn.dataset.imGesturePlayed;
        } else {
          root.IconMotion?.play?.(btn);
        }
        if (action === 'retract') {
          root.SurfaceMorph.closeSubmenu(false);
          return;
        }
        const runAction = () => {
          if (action === 'json') {
            root.StoryboardExport?.exportJson(source);
          } else if (action === 'pdf') {
            openPdfDialog(source, { returnFocus: primarySurface });
          }
        };
        if (typeof options.onClose === 'function') {
          options.onClose(runAction);
        } else if (root.SurfaceMorph?.isOpen?.()) {
          root.SurfaceMorph.close('action', runAction);
        } else {
          runAction();
        }
      });
    });

    const close = (immediate = false) => root.SurfaceMorph.closeSubmenu(immediate);
    const cleanup = () => {
      disposeHover?.();
      root.IconMotion?.cleanup?.(panel);
      if (activeSubMorph?.panel === panel) activeSubMorph = null;
    };
    activeSubMorph = { panel, close, cleanup };

    return root.SurfaceMorph.openSubmenu(triggerBtn, {
      layer: panel,
      onRetract: cleanup
    });
  }

  /**
   * Backwards-compatible alias for openExportSubMorph.
   */
  function switchMenuToExportFormat(menuContent, source, options = {}) {
    const triggerBtn = menuContent?.querySelector?.('[data-action="export"]');
    if (triggerBtn) {
      return openExportSubMorph(triggerBtn, menuContent, source, options);
    }
    return false;
  }

  /**
   * Open the PDF Brief export settings dialog (reusing .sb-dialog / OverlayManager / ModalAnimation).
   */
  function openPdfDialog(source, options = {}) {
    if (!source || typeof document === 'undefined') return Promise.resolve({ exported: false });
    if (activePdfDialog) {
      return activePdfDialog.promise;
    }

    root.ProjectOptionMorph?.close?.('immediate');
    root.SurfaceMorph?.close?.('immediate');

    let resolvePromise;
    const promise = new Promise(resolve => { resolvePromise = resolve; });

    const titleText = resolveProjectTitle(source);
    const motion = root.matchMedia?.('(prefers-reduced-motion: reduce)');
    const tokens = root.getComputedStyle?.(document.documentElement);
    const durationToken = tokens?.getPropertyValue('--dialog-duration')?.trim() || '360ms';
    const duration = parseFloat(durationToken) * (durationToken.endsWith('ms') ? 1 : 1000);

    const overlay = document.createElement('div');
    overlay.className = 'sb-dialog-overlay sb-export-dialog-overlay';

    const panel = document.createElement('section');
    panel.className = 'sb-dialog sb-export-dialog';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'sb-export-pdf-title');
    panel.tabIndex = -1;

    if (!motion?.matches) {
      panel.style.scale = '0';
    }

    panel.innerHTML = `
      <div class="sb-export-dialog-header">
        <span class="sb-dialog-mark" aria-hidden="true">${ICONS.pdf}</span>
        <div class="sb-export-dialog-titles">
          <h2 class="sb-dialog-title" id="sb-export-pdf-title">匯出分鏡企劃書</h2>
          <p class="sb-export-project-name" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</p>
        </div>
      </div>

      <form class="sb-export-form" id="sb-export-pdf-form" novalidate>
        <div class="sb-export-scroll-body">
          <div class="sb-export-section">
            <span class="sb-export-section-label" id="sb-export-orient-lbl">紙張方向</span>
            <div class="sb-export-segmented" role="radiogroup" aria-labelledby="sb-export-orient-lbl">
              <button type="button" class="sb-export-seg-btn active" role="radio" aria-checked="true" data-setting="orientation" data-value="portrait">A4 直向</button>
              <button type="button" class="sb-export-seg-btn" role="radio" aria-checked="false" data-setting="orientation" data-value="landscape">A4 橫向</button>
            </div>
          </div>

          <div class="sb-export-section">
            <span class="sb-export-section-label">包含內容</span>
            <div class="sb-export-checklist">
              <label class="sb-dialog-checkbox sb-export-check">
                <input type="checkbox" class="sb-dialog-checkbox-input" name="includeOverview" checked>
                <span class="checkbox-wrapper" aria-hidden="true"><span class="checkbox-bg"></span><svg class="checkbox-icon" viewBox="0 0 24 24" fill="none"><path class="check-path" d="M4 12L10 18L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
                <span>專案概覽</span>
              </label>
              <label class="sb-dialog-checkbox sb-export-check">
                <input type="checkbox" class="sb-dialog-checkbox-input" name="includeBriefAndTemplate" checked>
                <span class="checkbox-wrapper" aria-hidden="true"><span class="checkbox-bg"></span><svg class="checkbox-icon" viewBox="0 0 24 24" fill="none"><path class="check-path" d="M4 12L10 18L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
                <span>創作企劃與模板資訊</span>
              </label>
              <label class="sb-dialog-checkbox sb-export-check">
                <input type="checkbox" class="sb-dialog-checkbox-input" name="includeCharacters" checked>
                <span class="checkbox-wrapper" aria-hidden="true"><span class="checkbox-bg"></span><svg class="checkbox-icon" viewBox="0 0 24 24" fill="none"><path class="check-path" d="M4 12L10 18L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
                <span>角色設定</span>
              </label>
              <label class="sb-dialog-checkbox sb-export-check is-locked">
                <input type="checkbox" class="sb-dialog-checkbox-input" name="includeStoryboard" checked disabled>
                <span class="checkbox-wrapper" aria-hidden="true"><span class="checkbox-bg"></span><svg class="checkbox-icon" viewBox="0 0 24 24" fill="none"><path class="check-path" d="M4 12L10 18L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
                <span>完整分鏡 <small class="sb-export-required-tag">必要</small></span>
              </label>
              <label class="sb-dialog-checkbox sb-export-check">
                <input type="checkbox" class="sb-dialog-checkbox-input" name="includePrompts">
                <span class="checkbox-wrapper" aria-hidden="true"><span class="checkbox-bg"></span><svg class="checkbox-icon" viewBox="0 0 24 24" fill="none"><path class="check-path" d="M4 12L10 18L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
                <span>AI 圖片生成提示詞</span>
              </label>
            </div>
          </div>

          <div class="sb-export-section">
            <span class="sb-export-section-label" id="sb-export-quality-lbl">圖片品質</span>
            <div class="sb-export-segmented" role="radiogroup" aria-labelledby="sb-export-quality-lbl">
              <button type="button" class="sb-export-seg-btn active" role="radio" aria-checked="true" data-setting="quality" data-value="standard">標準品質</button>
              <button type="button" class="sb-export-seg-btn" role="radio" aria-checked="false" data-setting="quality" data-value="high">高畫質</button>
            </div>
            <p class="sb-export-hint" id="sb-export-quality-hint">適合螢幕閱讀與線上分享，兼顧清晰度與檔案大小。</p>
          </div>

          <div class="sb-export-progress" id="sb-export-progress" hidden aria-live="polite">
            <p class="sb-export-progress-text" id="sb-export-progress-text">正在準備匯出…</p>
            <div class="sb-export-progress-track">
              <div class="sb-export-progress-bar" id="sb-export-progress-bar"></div>
            </div>
          </div>

          <div class="sb-export-failure-box" id="sb-export-failure-box" hidden role="alert">
            <p class="sb-export-failure-title" id="sb-export-failure-title"></p>
            <p class="sb-export-failure-desc" id="sb-export-failure-desc"></p>
            <div class="sb-export-failure-actions">
              <button type="button" class="sys-btn secondary sb-export-mini-btn" id="sb-export-retry-img">重試圖片</button>
              <button type="button" class="sys-btn primary sb-export-mini-btn" id="sb-export-continue-img">仍要匯出</button>
            </div>
          </div>

          <p class="sb-dialog-error" id="sb-export-error" aria-live="polite"></p>
        </div>

        <div class="sb-dialog-actions sb-export-actions">
          <button type="button" class="sb-dialog-button sb-dialog-cancel sys-btn secondary" id="sb-export-cancel">取消</button>
          <button type="submit" class="sb-dialog-button sb-dialog-submit sys-btn primary" id="sb-export-submit">匯出 PDF</button>
        </div>
      </form>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const state = {
      orientation: 'portrait',
      quality: 'standard',
      exporting: false,
      settled: false,
      abortController: null,
      pendingFailureResolver: null
    };

    const form = panel.querySelector('#sb-export-pdf-form');
    const cancelBtn = panel.querySelector('#sb-export-cancel');
    const submitBtn = panel.querySelector('#sb-export-submit');
    const progressWrap = panel.querySelector('#sb-export-progress');
    const progressText = panel.querySelector('#sb-export-progress-text');
    const progressBar = panel.querySelector('#sb-export-progress-bar');
    const failureBox = panel.querySelector('#sb-export-failure-box');
    const failureTitle = panel.querySelector('#sb-export-failure-title');
    const failureDesc = panel.querySelector('#sb-export-failure-desc');
    const retryImgBtn = panel.querySelector('#sb-export-retry-img');
    const continueImgBtn = panel.querySelector('#sb-export-continue-img');
    const errorEl = panel.querySelector('#sb-export-error');
    const qualityHint = panel.querySelector('#sb-export-quality-hint');

    const modalMotion = root.ModalAnimation;
    const lease = root.OverlayManager?.acquire?.({
      overlay,
      panel,
      returnFocus: options.returnFocus || document.activeElement,
      initialFocus: submitBtn,
      onEscape: () => closeDialog({ exported: false, reason: 'escape' })
    });

    function dispose(result) {
      if (state.abortController) {
        try { state.abortController.abort(); } catch (_) {}
        state.abortController = null;
      }
      if (state.pendingFailureResolver) {
        state.pendingFailureResolver('cancel');
        state.pendingFailureResolver = null;
      }
      modalMotion?.cancel?.(overlay);
      overlay.remove();
      lease?.release?.({ restoreFocus: result.reason !== 'abort' });
      if (activePdfDialog?.overlay === overlay) activePdfDialog = null;
      resolvePromise(result);
    }

    function closeDialog(result, immediate = false) {
      if (state.settled) return;
      state.settled = true;
      if (state.abortController) {
        try { state.abortController.abort(); } catch (_) {}
      }
      if (state.pendingFailureResolver) {
        state.pendingFailureResolver('cancel');
        state.pendingFailureResolver = null;
      }
      if (immediate || motion?.matches) {
        dispose(result);
        return;
      }
      if (modalMotion && typeof modalMotion.close === 'function') {
        modalMotion.close(overlay, panel, { duration, onComplete: () => dispose(result) });
        return;
      }
      dispose(result);
    }

    // Segmented controls
    panel.querySelectorAll('.sb-export-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.exporting) return;
        const setting = btn.dataset.setting;
        const value = btn.dataset.value;
        state[setting] = value;
        const group = btn.closest('.sb-export-segmented');
        group?.querySelectorAll('.sb-export-seg-btn').forEach(b => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-checked', String(active));
        });
        if (setting === 'quality' && qualityHint) {
          qualityHint.textContent = value === 'high'
            ? '保留較高圖片解析度，適合正式列印與提案交付（檔案較大）。'
            : '適合螢幕閱讀與線上分享，兼顧清晰度與檔案大小。';
        }
      });
    });

    cancelBtn.addEventListener('click', () => closeDialog({ exported: false, reason: 'cancel' }));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !state.exporting) {
        closeDialog({ exported: false, reason: 'backdrop' });
      }
    });

    retryImgBtn.addEventListener('click', () => {
      failureBox.hidden = true;
      state.pendingFailureResolver?.('retry');
      state.pendingFailureResolver = null;
    });
    continueImgBtn.addEventListener('click', () => {
      failureBox.hidden = true;
      state.pendingFailureResolver?.('continue');
      state.pendingFailureResolver = null;
    });

    function setControlsDisabled(disabled) {
      panel.querySelectorAll('input[type="checkbox"]:not([name="includeStoryboard"]), .sb-export-seg-btn').forEach(el => {
        el.disabled = disabled;
      });
      submitBtn.disabled = disabled;
      cancelBtn.textContent = disabled ? '取消匯出' : '取消';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (state.exporting || state.settled) return;

      state.exporting = true;
      state.abortController = new AbortController();
      errorEl.textContent = '';
      failureBox.hidden = true;
      progressWrap.hidden = false;
      progressText.textContent = '正在整理企劃與分鏡內容…';
      progressBar.classList.add('is-indeterminate');
      progressBar.style.width = '';
      setControlsDisabled(true);
      submitBtn.textContent = '匯出中…';

      const pdfOptions = {
        orientation: state.orientation,
        quality: state.quality,
        includeOverview: Boolean(form.elements.includeOverview?.checked),
        includeBriefAndTemplate: Boolean(form.elements.includeBriefAndTemplate?.checked),
        includeCharacters: Boolean(form.elements.includeCharacters?.checked),
        includePrompts: Boolean(form.elements.includePrompts?.checked)
      };

      try {
        const res = await root.StoryboardExport.exportPdf(source, pdfOptions, {
          signal: state.abortController.signal,
          onProgress: (info) => {
            if (state.settled) return;
            if (info.message) progressText.textContent = info.message;
            if (info.stage === 'images' && Number.isFinite(info.total) && info.total > 0) {
              progressBar.classList.remove('is-indeterminate');
              const pct = Math.min(100, Math.max(0, Math.round((info.completed / info.total) * 100)));
              progressBar.style.width = `${pct}%`;
            } else {
              progressBar.classList.add('is-indeterminate');
              progressBar.style.width = '';
            }
          },
          onImageFailures: (failureInfo) => {
            if (state.settled) return Promise.resolve('cancel');
            failureTitle.textContent = `有 ${failureInfo.failedCount} 張分鏡圖片無法載入`;
            failureDesc.textContent = `鏡頭 ${failureInfo.failedOrders.join('、')} 的圖片下載失敗。您可以重試載入，或以缺失提示繼續匯出。`;
            failureBox.hidden = false;
            return new Promise(resolve => {
              state.pendingFailureResolver = resolve;
            });
          }
        });

        if (state.settled) return;
        if (res?.ok) {
          closeDialog({ exported: true, result: res });
        } else if (res?.aborted) {
          closeDialog({ exported: false, reason: 'cancel' });
        } else {
          throw new Error(res?.error || 'PDF 生成失敗，請重試。');
        }
      } catch (err) {
        if (state.settled) return;
        if (err?.name === 'AbortError') {
          closeDialog({ exported: false, reason: 'cancel' });
          return;
        }
        errorEl.textContent = err?.message || 'PDF 生成失敗，請重試。';
        progressWrap.hidden = true;
        state.exporting = false;
        state.abortController = null;
        setControlsDisabled(false);
        submitBtn.textContent = '匯出 PDF';
      }
    });

    activePdfDialog = { overlay, close: closeDialog, promise };

    if (!motion?.matches && modalMotion && typeof modalMotion.open === 'function') {
      modalMotion.open(overlay, panel, {
        duration,
        backdropBg: 'var(--dialog-backdrop-bg)'
      });
    } else {
      panel.style.scale = '1';
      overlay.style.background = 'var(--dialog-backdrop-bg)';
    }

    return promise;
  }

  function askImageFailureDecision(failureInfo) {
    if (typeof document === 'undefined' || !document.body) {
      return Promise.resolve('cancel');
    }
    const orders = (failureInfo?.failedOrders || []).map(o => `#${o}`).join('、');
    const count = failureInfo?.failedCount || 0;

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sb-dialog-overlay sb-dialog-overlay-open';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', '圖片載入失敗處理');
      overlay.style.zIndex = '10020';

      const panel = document.createElement('div');
      panel.className = 'sb-dialog sb-dialog-compact';
      panel.innerHTML = `
        <div class="sb-dialog-header">
          <h3 class="sb-dialog-title">有 ${count} 張分鏡圖片無法載入</h3>
        </div>
        <div class="sb-dialog-body">
          <p class="sb-dialog-desc">鏡頭 ${escapeHtml(orders)} 的圖片無法下載或解碼。您可以重試下載失敗圖片、略過並以「圖片無法載入」標記繼續匯出，或取消匯出。</p>
        </div>
        <div class="sb-dialog-actions">
          <button type="button" class="sys-btn sys-btn-ghost" data-decision="cancel">取消匯出</button>
          <button type="button" class="sys-btn sys-btn-secondary" data-decision="continue">略過失敗圖片並繼續</button>
          <button type="button" class="sys-btn sys-btn-primary" data-decision="retry">重試失敗圖片</button>
        </div>
      `;

      const cleanup = (decision) => {
        document.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        resolve(decision);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanup('cancel');
        }
      };

      panel.querySelectorAll('[data-decision]').forEach(btn => {
        btn.addEventListener('click', () => cleanup(btn.dataset.decision || 'cancel'));
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup('cancel');
      });

      document.addEventListener('keydown', onKeyDown, true);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);
      panel.querySelector('[data-decision="retry"]')?.focus();
    });
  }

  function closeAll() {
    closeSubMorph(true);
    root.SurfaceMorph?.close?.('immediate');
    activePdfDialog?.close?.({ exported: false, reason: 'abort' }, true);
  }

  root.addEventListener?.('hashchange', () => closeAll());

  const api = {
    openFormatMenu,
    openExportSubMorph,
    closeSubMorph,
    switchMenuToExportFormat,
    openPdfDialog,
    askImageFailureDecision,
    closeAll
  };

  if (typeof root !== 'undefined') {
    root.StoryboardExportDialog = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
