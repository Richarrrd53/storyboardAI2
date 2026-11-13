/**
 * project-detail.js
 * StoryboardAI — Storyboard Workspace (分鏡專案工作區 Controller)
 *
 * 核心工作流：
 * 1. 專案整體管理與即時總時長計算
 * 2. 點擊 Shot 列或膠捲影格開啟 Shot Inspector Drawer
 * 3. 故事敘述與鏡頭語言（景別/角度/運鏡/時長）拆解編輯
 * 4. 情緒目的與導演備註分離
 * 5. AI 優化提示詞 (Prompt Optimization)
 * 6. 單鏡頭圖片重新生成 (Image Regeneration)
 * 7. 歷史生成版本 (Version History A/B/C) 切換與復原
 * 8. 匯出分鏡 JSON
 */

(function () {
  'use strict';
  const icon = name => window.ProjectDetailIcons?.(name) || '';

  window.ProjectDetailController = {
    // ── 內部狀態 ──
    _root: null,
    _projectId: null,
    _project: null,

    _selectedShotId: null,
    _viewMode: 'table', // 'table' | 'film'

    _editorDirty: false,
    _saving: false,
    _isOptimizingPrompt: false,
    _isRegeneratingImage: false,

    _editorEl: null,
    _backdropEl: null,
    _toastTimer: null,

    // ── 初始化 ──
    init({ root, projectId, project }) {
      this._root = root;
      this._projectId = projectId;
      this._project = project;
      this._selectedShotId = null;
      this._viewMode = 'table';
      this._editorDirty = false;
      this._saving = false;

      this._bindNavigation();
      this._bindViewToggle();
      this._bindFilmstripScroll();
      this._bindShotSelection();
      this._bindKeyboard();
      this._updateProjectStats();
    },

    // ── 銷毀清理 ──
    destroy() {
      this.closeEditor(false);
      this._filmstripCleanup?.();this._filmstripCleanup = null;
      if (this._keyHandler && typeof document !== 'undefined') {
        document.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = null;
      }
      clearTimeout(this._toastTimer);
      if (typeof document !== 'undefined') document.getElementById('pd-toast')?.remove();
      this._root = null;
      this._project = null;
    },

    // ── 頂部按鈕：返回與匯出 JSON ──
    _bindNavigation() {
      const root = this._root;
      if (!root) return;

      // 返回按鈕
      const backBtn = root.querySelector('#pd-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (typeof window.spaNavigate === 'function') {
            window.spaNavigate('projects');
          } else {
            window.location.hash = '#/projects';
          }
        });
      }

      // 匯出 JSON 按鈕
      const exportBtn = root.querySelector('#pd-export-json-btn');
      if (exportBtn) {
        exportBtn.addEventListener('click', () => this._exportProjectJson());
      }
    },

    // ── 視圖切換 (表格 vs 膠捲) ──
    _bindViewToggle() {
      const root = this._root;
      if (!root) return;

      const btnTable = root.querySelector('#pd-view-list');
      const btnFilm = root.querySelector('#pd-view-film');
      const tableView = root.querySelector('#pd-table-view');
      const filmView = root.querySelector('#pd-film-view');

      if (!btnTable || !btnFilm) return;

      const switchView = (mode) => {
        if (this._viewMode === mode) return;

        // 捕捉切換前關注的 Shot ID (選取中的 shot 或視野中 shot)
        let targetShotId = this._selectedShotId;
        if (!targetShotId) {
          if (this._viewMode === 'table') {
            const firstRow = root.querySelector('.project-shot-row');
            if (firstRow) targetShotId = firstRow.dataset.shotId;
          } else {
            const firstFrame = root.querySelector('.project-film-frame');
            if (firstFrame) targetShotId = firstFrame.dataset.shotId;
          }
        }

        this._viewMode = mode;
        btnTable.setAttribute?.('aria-pressed', String(mode === 'table'));
        btnFilm.setAttribute?.('aria-pressed', String(mode === 'film'));
        if (mode === 'table') {
          btnTable.classList.add('active');
          btnFilm.classList.remove('active');
          if (tableView) tableView.style.display = 'block';
          if (filmView) filmView.style.display = 'none';

          const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => setTimeout(fn, 0);
          if (targetShotId) {
            raf(() => {
              const row = root.querySelector(`.project-shot-row[data-shot-id="${targetShotId}"]`);
              if (row && typeof row.scrollIntoView === 'function') {
                row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            });
          }
        } else {
          btnFilm.classList.add('active');
          btnTable.classList.remove('active');
          if (filmView) filmView.style.display = 'block';
          if (tableView) tableView.style.display = 'none';

          const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => setTimeout(fn, 0);
          if (targetShotId) {
            raf(() => {
              const frame = root.querySelector(`.project-film-frame[data-shot-id="${targetShotId}"]`);
              if (frame && typeof frame.scrollIntoView === 'function') {
                frame.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
              }
            });
          }
        }
      };

      btnTable.addEventListener('click', () => switchView('table'));
      btnFilm.addEventListener('click', () => switchView('film'));
    },

    // ── 膠捲滑動與拖曳 ──
    _bindFilmstripScroll() {
      const root = this._root;
      if (!root) return;
      const scrollContainer = root.querySelector('.project-filmstrip-scroll');
      if (!scrollContainer) return;

      // 滑鼠滾輪橫向滾動
      const wheel = (e) => {
        if (e.deltaX !== 0) return;
        e.preventDefault();
        scrollContainer._wheelTarget = (scrollContainer._wheelTarget ?? scrollContainer.scrollLeft) + e.deltaY * 2.2;
        if (!scrollContainer._wheelRaf) {
          scrollContainer._wheelRaf = requestAnimationFrame(function step() {
            const diff = scrollContainer._wheelTarget - scrollContainer.scrollLeft;
            if (Math.abs(diff) < 0.5) {
              scrollContainer.scrollLeft = scrollContainer._wheelTarget;
              scrollContainer._wheelRaf = null;
            } else {
              scrollContainer.scrollLeft += diff * 0.35;
              scrollContainer._wheelRaf = requestAnimationFrame(step);
            }
          });
        }
      };
      scrollContainer.addEventListener('wheel', wheel, { passive: false });

      // Keep ordinary clicks on the frame; capture only after the 5px mouse drag threshold.
      this._filmstripCleanup?.();
      let pointer = null, didDrag = false;
      const down = e => {
        if (e.button !== 0 || (e.isPrimary === false)) return;
        didDrag = false;
        if (e.pointerType === 'touch' || e.target?.closest?.('a, button, input, select, textarea')) return;
        pointer = { id:e.pointerId, x:e.clientX, scroll:scrollContainer.scrollLeft, captured:false };
        scrollContainer._wheelTarget = scrollContainer.scrollLeft;
      };
      const move = e => {
        if (!pointer || e.pointerId !== pointer.id) return;
        const dx = e.clientX - pointer.x;
        if (!didDrag && Math.abs(dx) <= 5) return;
        didDrag = true;
        if (!pointer.captured) { scrollContainer.setPointerCapture(e.pointerId);pointer.captured = true; }
        e.preventDefault?.();scrollContainer.scrollLeft = pointer.scroll - dx;
        scrollContainer._wheelTarget = scrollContainer.scrollLeft;
      };
      const stop = e => {
        if (!pointer || (e?.pointerId != null && e.pointerId !== pointer.id)) return;
        const previous = pointer;pointer = null;
        if (previous.captured) {try {scrollContainer.releasePointerCapture(previous.id);} catch (_) {}}
      };
      const bindings = [['pointerdown',down],['pointermove',move],['pointerup',stop],['pointercancel',stop],['lostpointercapture',stop]];
      bindings.forEach(([name,fn])=>scrollContainer.addEventListener(name,fn));
      scrollContainer._didDrag = () => didDrag;
      this._filmstripCleanup = () => {
        stop();scrollContainer.removeEventListener('wheel',wheel);bindings.forEach(([name,fn])=>scrollContainer.removeEventListener(name,fn));
        if (scrollContainer._wheelRaf) cancelAnimationFrame(scrollContainer._wheelRaf);
        scrollContainer._wheelRaf = null;
      };
    },

    // ── 鏡頭選取事件 (表格列與膠捲影格) ──
    _bindShotSelection() {
      const root = this._root;
      if (!root) return;

      // 表格列點擊
      root.querySelectorAll('.project-shot-row').forEach(row => {
        row.addEventListener('click', (e) => {
          const shotId = row.dataset.shotId;
          if (shotId) this.openEditor(shotId);
        });
      });

      // 表格內編輯按鈕
      root.querySelectorAll('.shot-cell-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const shotId = btn.dataset.shotId;
          if (shotId) this.openEditor(shotId);
        });
      });

      // 膠捲影格點擊
      const scrollContainer = root.querySelector('.project-filmstrip-scroll');
      root.querySelectorAll('.project-film-frame').forEach(frame => {
        frame.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (frame.dataset.shotId) this.openEditor(frame.dataset.shotId); }
        });
        frame.addEventListener('click', () => {
          if (scrollContainer && scrollContainer._didDrag && scrollContainer._didDrag()) return;
          const shotId = frame.dataset.shotId;
          if (shotId) this.openEditor(shotId);
        });
      });
    },

    // ── 鍵盤快捷鍵 (Escape 關閉抽屜) ──
    _bindKeyboard() {
      if (typeof document === 'undefined') return;
      if (this._keyHandler) {
        document.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = null;
      }
      this._keyHandler = (e) => {
        if (e.key === 'Tab' && this._editorEl) {
          const items = [...this._editorEl.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
          const first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
        if (e.key === 'Escape' && this._editorEl && this._editorEl.classList.contains('open')) {
          this.closeEditor();
        }
      };
      document.addEventListener('keydown', this._keyHandler);
    },

    // ── 即時重新計算專案總資訊 ──
    _updateProjectStats() {
      const root = this._root;
      if (!root) return;

      const shots = this._project?.shots || [];

      // 更新鏡頭總數標籤
      const countEl = root.querySelector('#pd-shot-count');
      if (countEl) countEl.textContent = `${shots.length} 鏡頭`;

      // 累加時長
      let totalSeconds = 0;
      shots.forEach(s => {
        const match = (s.duration || '').match(/(\d+(\.\d+)?)/);
        if (match) totalSeconds += parseFloat(match[1]);
      });

      const durEl = root.querySelector('#pd-total-duration');
      if (durEl) {
        durEl.textContent = `總長 ${totalSeconds.toFixed(1).replace(/\.0$/, '')}s`;
      }
    },

    // ── 打開 Shot Inspector 抽屜 ──
    openEditor(shotId) {
      const shots = this._project?.shots || [];
      const shot = shots.find(s => s.id === shotId);
      if (!shot) return;

      clearTimeout(this._editorRemoveTimer);
      this._pendingEditorRemoval?.();
      this._pendingEditorRemoval = null;
      this._editorEvents?.abort();
      this._editorEvents = new AbortController();
      this._saving = this._isOptimizingPrompt = this._isRegeneratingImage = false;
      this._returnFocus = document.activeElement;
      this._selectedShotId = shotId;
      this._editorDirty = false;

      // 高亮當前選取
      const root = this._root;
      if (root) {
        root.querySelectorAll('.project-shot-row.selected, .project-film-frame.selected')
          .forEach(el => el.classList.remove('selected'));
        const row = root.querySelector(`.project-shot-row[data-shot-id="${shotId}"]`);
        const frame = root.querySelector(`.project-film-frame[data-shot-id="${shotId}"]`);
        if (row) row.classList.add('selected');
        if (frame) frame.classList.add('selected');
      }

      // 建立 Backdrop 與 Editor Drawer
      if (!this._editorEl) {
        this._backdropEl = document.createElement('div');
        this._backdropEl.className = 'project-editor-backdrop';
        this._backdropEl.addEventListener('click', () => this.closeEditor());
        document.body.appendChild(this._backdropEl);

        this._editorEl = document.createElement('div');
        this._editorEl.className = 'project-shot-editor';
        this._editorEl.setAttribute('role', 'dialog');
        this._editorEl.setAttribute('aria-modal', 'true');
        this._editorEl.setAttribute('aria-labelledby', 'pd-editor-heading');
        document.body.appendChild(this._editorEl);
      }

      this._editorEl.innerHTML = this._buildEditorHTML(shot);

      const editor = this._editorEl;
      document.body.classList.add('project-editor-open');
      document.body.style.setProperty('--editor-depth-progress', '1');
      const page = document.getElementById('page-main');
      if (page) page.inert = true;
      requestAnimationFrame(() => {
        if (this._editorEl !== editor || this._editorEvents.signal.aborted) return;
        this._backdropEl.classList.add('visible');
        editor.classList.add('open');
        editor.querySelector('#pd-editor-close')?.focus({ preventScroll: true });
      });
      this._bindEditorEvents(shot);
      this._bindEditorGestures();
    },

    // ── 建構 Shot Inspector HTML ──
    _buildEditorHTML(shot) {
      const p = shot.payload || {};
      const orderStr = String(shot.order || '?').padStart(2, '0');
      const prompt = p.finalPrompt || p.shotPrompt || '';
      const imageUrl = p.image || '';

      // 解析鏡頭語言四維度 (景別、角度、運鏡、時長)
      const details = p.cameraDetails || {};
      const shotSize = details.size || shot.camera || 'Medium Shot';
      const shotAngle = details.angle || 'Eye Level';
      const shotMovement = details.movement || 'Static';
      const shotDuration = shot.duration || '3s';

      // 歷史版本清單
      const history = Array.isArray(p.imageHistory) ? p.imageHistory : [];
      let versionListHtml = '';
      if (history.length > 0) {
        versionListHtml = history.map((item, idx) => {
          const isCurrent = item.image === imageUrl;
          const vNum = history.length - idx;
          return `
            <button type="button" class="editor-version-item ${isCurrent ? 'active' : ''}" aria-pressed="${isCurrent}" data-version-img="${this._escHtml(item.image)}" data-version-prompt="${this._escHtml(item.prompt || '')}">
              <span class="version-radio-dot" aria-hidden="true"></span>
              <span class="version-label">Version ${vNum}</span>
              ${isCurrent ? '<span class="version-tag">目前使用</span>' : ''}
            </button>
          `;
        }).join('');
      } else {
        versionListHtml = `
          <button type="button" class="editor-version-item active" aria-pressed="true" disabled>
            <span class="version-radio-dot" aria-hidden="true"></span>
            <span class="version-label">Version 1</span>
            <span class="version-tag">目前使用</span>
          </button>
        `;
      }

      return `
        <button type="button" class="project-editor-grab" aria-label="向下拖曳或按下以關閉鏡頭編輯器"><span></span></button>
        <div class="project-shot-editor-header">
          <div class="project-shot-editor-title">
            ${icon('film')}
            <div><strong id="pd-editor-heading">鏡頭 ${orderStr}</strong><small>故事與影像設定</small></div>
          </div>
          <button class="project-shot-editor-close" id="pd-editor-close" aria-label="關閉分鏡編輯器" title="關閉 (Esc)">${icon('close')}</button>
        </div>

        <div class="project-shot-editor-body">
          <!-- 當前圖片大圖預覽 -->
          <div class="editor-preview-card" id="pd-preview-wrap">
            ${imageUrl ? `<img src="${this._escHtml(imageUrl)}" alt="Shot ${orderStr}" id="pd-preview-img">` : `<div style="width:100%;height:180px;background:#18181b;"></div>`}
          </div>

          <!-- 故事內容 / 動作 -->
          <div class="editor-field-group">
            <label class="editor-field-label" for="pd-f-title">故事內容 / 動作描述</label>
            <textarea class="editor-field-textarea" id="pd-f-title" rows="3" placeholder="例如：老闆拉開早餐店鐵門，晨光照入店內">${this._escHtml(shot.title || '')}</textarea>
          </div>

          <!-- 鏡頭語言拆解 (景別、角度、運鏡、時長) -->
          <div class="editor-field-group">
            <label class="editor-field-label">鏡頭語言 (Camera Language)</label>
            <div class="editor-camera-grid">
              <div class="editor-camera-item">
                <label for="pd-f-cam-size">景別 (Shot Size)</label>
                <input type="text" id="pd-f-cam-size" value="${this._escHtml(shotSize)}" placeholder="Wide Shot">
              </div>
              <div class="editor-camera-item">
                <label for="pd-f-cam-angle">視角 (Angle)</label>
                <input type="text" id="pd-f-cam-angle" value="${this._escHtml(shotAngle)}" placeholder="Eye Level">
              </div>
              <div class="editor-camera-item">
                <label for="pd-f-cam-move">運鏡 (Movement)</label>
                <input type="text" id="pd-f-cam-move" value="${this._escHtml(shotMovement)}" placeholder="Slow Dolly In">
              </div>
              <div class="editor-camera-item">
                <label for="pd-f-duration">時長 (Duration)</label>
                <input type="text" id="pd-f-duration" value="${this._escHtml(shotDuration)}" placeholder="3.5s">
              </div>
            </div>
          </div>

          <!-- 情緒 / 目的 -->
          <div class="editor-field-group">
            <label class="editor-field-label" for="pd-f-emotion">情緒 / 目的 (Emotion / Purpose)</label>
            <input class="editor-field-input" id="pd-f-emotion" type="text" value="${this._escHtml(p.emotion || '')}" placeholder="例如：建立溫暖、日常的開場氛圍">
          </div>

          <!-- 導演備註 -->
          <div class="editor-field-group">
            <label class="editor-field-label" for="pd-f-note">導演備註 / 拍攝註記 (Director's Note)</label>
            <textarea class="editor-field-textarea" id="pd-f-note" rows="2" placeholder="例如：演員這裡不要看鏡頭、現場注意暖色打光">${this._escHtml(p.note || '')}</textarea>
          </div>

          <!-- AI 圖像提示詞工作流 -->
          <div class="editor-prompt-card">
            <label class="editor-field-label" for="pd-f-prompt">
              <span>AI 圖像提示詞 (Image Prompt)</span>
            </label>
            <textarea class="editor-field-textarea" id="pd-f-prompt" rows="4">${this._escHtml(prompt)}</textarea>
            
            <div class="editor-prompt-actions">
              <button class="editor-ai-btn" id="pd-btn-optimize-prompt" title="根據故事內容與鏡頭語言，重新生成精確英文提示詞">
                ${icon('sparkle')}
                <span id="pd-lbl-optimize">AI 最佳化提示詞</span>
              </button>
              <button class="editor-ai-btn primary" id="pd-btn-regenerate" title="保持現有故事，只為此鏡頭重新產生新圖片">
                ${icon('image')}
                <span id="pd-lbl-regen">重新生成圖片</span>
              </button>
            </div>
          </div>

          <!-- 生成版本歷程 (Version History) -->
          <div class="editor-version-card">
            <label class="editor-field-label">生成版本 (Version History)</label>
            <div class="editor-version-list" id="pd-version-list">
              ${versionListHtml}
            </div>
          </div>
        </div>

        <p class="project-editor-status" id="pd-editor-status" role="status" aria-live="polite" hidden></p>
        <div class="project-shot-editor-footer">
          <button class="editor-btn-cancel" id="pd-editor-cancel">取消</button>
          <button class="editor-btn-save" id="pd-editor-save">
            ${icon('check')}<span id="pd-lbl-save">儲存變更</span>
          </button>
        </div>
      `;
    },

    // ── 綁定 Shot Inspector 事件 ──
    _bindEditorEvents(shot) {
      const el = this._editorEl;
      if (!el) return;

      // 關閉
      el.querySelector('#pd-editor-close')?.addEventListener('click', () => this.closeEditor());
      el.querySelector('#pd-editor-cancel')?.addEventListener('click', () => this.closeEditor());

      // Dirty 追蹤
      const fields = [
        '#pd-f-title', '#pd-f-cam-size', '#pd-f-cam-angle',
        '#pd-f-cam-move', '#pd-f-duration', '#pd-f-emotion',
        '#pd-f-note', '#pd-f-prompt'
      ];
      fields.forEach(sel => {
        el.querySelector(sel)?.addEventListener('input', () => {
          this._editorDirty = true;
          const lbl = el.querySelector('#pd-lbl-save');
          if (lbl) lbl.textContent = '儲存變更';
        });
      });

      // 儲存
      el.querySelector('#pd-editor-save')?.addEventListener('click', () => this._handleSave());

      // AI 最佳化提示詞
      el.querySelector('#pd-btn-optimize-prompt')?.addEventListener('click', () => this._handleOptimizePrompt());

      // 重新生成圖片
      el.querySelector('#pd-btn-regenerate')?.addEventListener('click', () => this._handleRegenerate());

      // 切換歷史版本
      el.querySelectorAll('.editor-version-item').forEach(item => {
        item.addEventListener('click', () => {
          const vImg = item.dataset.versionImg;
          const vPrompt = item.dataset.versionPrompt;
          if (!vImg) return;

          // 標記 active
          el.querySelectorAll('.editor-version-item').forEach(v => { v.classList.remove('active'); v.setAttribute('aria-pressed', 'false'); });
          item.classList.add('active');
          item.setAttribute('aria-pressed', 'true');

          // 切換當前大圖預覽
          const previewImg = el.querySelector('#pd-preview-img');
          if (previewImg) previewImg.src = vImg;

          // 若有對應的 prompt 亦同步載入
          if (vPrompt) {
            const promptInput = el.querySelector('#pd-f-prompt');
            if (promptInput) promptInput.value = vPrompt;
          }

          this._editorDirty = true;
          this._activeVersionImage = vImg;
          const lbl = el.querySelector('#pd-lbl-save');
          if (lbl) lbl.textContent = '儲存版本變更';
        });
      });
    },

    _bindEditorGestures() {
      const editor = this._editorEl, backdrop = this._backdropEl;
      const handle = editor.querySelector('.project-editor-grab');
      if (!handle) return;
      const signal = this._editorEvents.signal;
      const syncViewport = () => {
        editor.style.setProperty('--editor-viewport-height', `${window.visualViewport?.height || window.innerHeight}px`);
        editor.style.setProperty('--editor-viewport-top', `${window.visualViewport?.offsetTop || 0}px`);
      };
      syncViewport();
      window.visualViewport?.addEventListener('resize', syncViewport, { signal, passive: true });
      window.visualViewport?.addEventListener('scroll', syncViewport, { signal, passive: true });
      let drag = null, suppressClick = false;
      const settle = () => {
        editor.style.removeProperty('transform');
        editor.style.removeProperty('transition');
        backdrop.style.removeProperty('opacity');
        document.body.classList.remove('project-editor-dragging');
        document.body.style.setProperty('--editor-depth-progress', '1');
      };
      handle.addEventListener('pointerdown', event => {
        if (!window.matchMedia('(max-width: 768px)').matches || (event.button && event.pointerType === 'mouse')) return;
        event.preventDefault();
        drag = { id: event.pointerId, start: event.clientY, last: event.clientY, time: performance.now(), velocity: 0, dy: 0 };
        handle.setPointerCapture(event.pointerId);
        editor.style.transition = 'none';
        document.body.classList.add('project-editor-dragging');
      }, { signal });
      handle.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.id) return;
        const now = performance.now();
        drag.velocity = (event.clientY - drag.last) / Math.max(1, now - drag.time);
        drag.last = event.clientY; drag.time = now;
        drag.dy = Math.max(0, event.clientY - drag.start);
        if (drag.dy > 5) suppressClick = true;
        editor.style.transform = `translate3d(0, ${drag.dy}px, 0)`;
        const progress = Math.max(0, 1 - drag.dy / editor.clientHeight);
        backdrop.style.opacity = String(progress);
        document.body.style.setProperty('--editor-depth-progress', String(progress));
      }, { signal });
      const end = (event, cancelled = false) => {
        if (!drag || drag.id !== event.pointerId) return;
        const dismiss = !cancelled && (drag.dy > editor.clientHeight * .24 || (drag.dy > 40 && drag.velocity > .65));
        drag = null;
        if (dismiss) {
          document.body.classList.remove('project-editor-dragging');
          editor.style.removeProperty('transition');
          this.closeEditor();
        } else settle();
      };
      handle.addEventListener('pointerup', event => end(event), { signal });
      handle.addEventListener('pointercancel', event => end(event, true), { signal });
      handle.addEventListener('click', () => {
        if (suppressClick) { suppressClick = false; return; }
        this.closeEditor();
      }, { signal });
      signal.addEventListener('abort', () => { drag = null; document.body.classList.remove('project-editor-dragging'); }, { once: true });
    },

    // ── 關閉 Shot Inspector ──
    closeEditor(animate = true) {
      if (!animate) {
        clearTimeout(this._editorRemoveTimer);
        this._pendingEditorRemoval?.();
        this._pendingEditorRemoval = null;
      }
      this._editorEvents?.abort();
      if (typeof document !== 'undefined') {
        document.body.classList.remove('project-editor-open', 'project-editor-dragging');
        document.body.style.removeProperty('--editor-depth-progress');
      }
      const page = typeof document !== 'undefined' ? document.getElementById('page-main') : null;
      if (page) page.inert = false;
      if (this._editorEl) {
        this._editorEl.style.removeProperty('transform');
        this._editorEl.style.pointerEvents = 'none';
        this._editorEl.classList.remove('open');
        if (this._backdropEl) this._backdropEl.classList.remove('visible');

        const el = this._editorEl;
        const b = this._backdropEl;
        const remove = () => {
          if (el.parentNode) el.parentNode.removeChild(el);
          if (b && b.parentNode) b.parentNode.removeChild(b);
        };

        if (animate) {
          this._pendingEditorRemoval = remove;
          this._editorRemoveTimer = setTimeout(() => {
            remove();
            if (this._pendingEditorRemoval === remove) this._pendingEditorRemoval = null;
          }, 300);
        } else {
          remove();
        }

        this._editorEl = null;
        this._backdropEl = null;
        if (animate && this._returnFocus?.isConnected) this._returnFocus.focus?.({ preventScroll: true });
        this._returnFocus = null;
      }

      // 移除選取狀態
      if (this._root) {
        this._root.querySelectorAll('.project-shot-row.selected, .project-film-frame.selected')
          .forEach(el => el.classList.remove('selected'));
      }

      this._selectedShotId = null;
      this._editorDirty = false;
      this._activeVersionImage = null;
    },

    // ── 儲存變更 ──
    async _handleSave() {
      if (this._saving) return;
      const shotId = this._selectedShotId;
      const el = this._editorEl;
      if (!shotId || !el) return;

      const title = el.querySelector('#pd-f-title')?.value?.trim() || '';
      const size = el.querySelector('#pd-f-cam-size')?.value?.trim() || 'Medium Shot';
      const angle = el.querySelector('#pd-f-cam-angle')?.value?.trim() || 'Eye Level';
      const move = el.querySelector('#pd-f-cam-move')?.value?.trim() || 'Static';
      const duration = el.querySelector('#pd-f-duration')?.value?.trim() || '3s';
      const emotion = el.querySelector('#pd-f-emotion')?.value?.trim() || '';
      const note = el.querySelector('#pd-f-note')?.value?.trim() || '';
      const prompt = el.querySelector('#pd-f-prompt')?.value?.trim() || '';

      if (!title) {
        this._toast('故事描述不能為空', 'error');
        return;
      }

      this._saving = true;
      const status = el.querySelector('#pd-editor-status');
      if (status) status.hidden = true;
      const saveBtn = el.querySelector('#pd-editor-save');
      const saveLbl = el.querySelector('#pd-lbl-save');
      if (saveBtn) saveBtn.disabled = true;
      if (saveLbl) saveLbl.innerHTML = `<span class="project-spinner"></span> 儲存中...`;

      try {
        const payloadPatch = {
          emotion,
          note,
          finalPrompt: prompt,
          cameraDetails: { size, angle, movement: move }
        };

        // 如果切換了歷史版本
        if (this._activeVersionImage) {
          payloadPatch.image = this._activeVersionImage;
        }

        const token = window.spaAuth?.getToken();
        const res = await fetch(`/api/projects/${this._projectId}/shots/${shotId}`, {
          method: 'PATCH',
          signal: this._editorEvents?.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title,
            camera: size,
            duration,
            payloadPatch
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || '儲存失敗');
        }

        const data = await res.json();
        if (this._editorEl !== el || this._selectedShotId !== shotId) return;
        const updatedShot = data.shot;

        // 更新本機狀態
        this._updateLocalShot(updatedShot);

        // 同步刷新表格與膠捲列
        this._refreshTableAndFilm(updatedShot);

        // 重新計算專案總時長
        this._updateProjectStats();

        this._toast('鏡頭變更已儲存！', 'success');
        this.closeEditor();

        // 標記快取失效
        if (typeof window.spaInvalidateProjectCache === 'function') {
          window.spaInvalidateProjectCache(this._projectId);
        }
      } catch (err) {
        if (err.name === 'AbortError' || this._editorEl !== el) return;
        console.error('Save shot error:', err);
        this._toast(err.message || '儲存失敗，請重試', 'error');
        if (saveLbl) saveLbl.textContent = '儲存變更';
      } finally {
        if (this._editorEl === el) this._saving = false;
        if (saveBtn) saveBtn.disabled = false;
      }
    },

    // ── AI 最佳化提示詞 ──
    async _handleOptimizePrompt() {
      if (this._isOptimizingPrompt) return;
      const shotId = this._selectedShotId;
      const el = this._editorEl;
      if (!shotId || !el) return;

      const title = el.querySelector('#pd-f-title')?.value?.trim() || '';
      const size = el.querySelector('#pd-f-cam-size')?.value?.trim() || '';
      const angle = el.querySelector('#pd-f-cam-angle')?.value?.trim() || '';
      const move = el.querySelector('#pd-f-cam-move')?.value?.trim() || '';
      const emotion = el.querySelector('#pd-f-emotion')?.value?.trim() || '';

      this._isOptimizingPrompt = true;
      const optBtn = el.querySelector('#pd-btn-optimize-prompt');
      const optLbl = el.querySelector('#pd-lbl-optimize');
      if (optBtn) optBtn.disabled = true;
      if (optLbl) optLbl.innerHTML = `<span class="project-spinner" style="border-top-color:#1e293b;"></span> 優化中...`;

      try {
        const token = window.spaAuth?.getToken();
        const res = await fetch(`/api/projects/${this._projectId}/shots/${shotId}/optimize-prompt`, {
          method: 'POST',
          signal: this._editorEvents?.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title,
            camera: size,
            emotion,
            cameraDetails: { size, angle, movement: move }
          })
        });

        if (!res.ok) throw new Error('無法最佳化提示詞');
        const data = await res.json();
        if (this._editorEl !== el || this._selectedShotId !== shotId) return;
        if (data.prompt) {
          const promptInput = el.querySelector('#pd-f-prompt');
          if (promptInput) {
            promptInput.value = data.prompt;
            this._editorDirty = true;
            const saveLbl = el.querySelector('#pd-lbl-save');
            if (saveLbl) saveLbl.textContent = '儲存變更';
          }
          this._toast('Prompt 已最佳化！', 'success');
        }
      } catch (err) {
        if (err.name === 'AbortError' || this._editorEl !== el) return;
        console.error('Optimize prompt error:', err);
        this._toast('AI 優化提示詞失敗，請稍後再試', 'error');
      } finally {
        if (this._editorEl === el) this._isOptimizingPrompt = false;
        if (optBtn) optBtn.disabled = false;
        if (optLbl) optLbl.textContent = 'AI 最佳化提示詞';
      }
    },

    // ── 重新生成圖片 (保留故事只換圖) ──
    async _handleRegenerate() {
      if (this._isRegeneratingImage) return;
      const shotId = this._selectedShotId;
      const el = this._editorEl;
      if (!shotId || !el) return;

      const prompt = el.querySelector('#pd-f-prompt')?.value?.trim() || '';

      this._isRegeneratingImage = true;
      const regenBtn = el.querySelector('#pd-btn-regenerate');
      const regenLbl = el.querySelector('#pd-lbl-regen');
      if (regenBtn) regenBtn.disabled = true;
      if (regenLbl) regenLbl.innerHTML = `<span class="project-spinner"></span> 生圖中...`;

      // 預覽覆蓋層
      const wrap = el.querySelector('#pd-preview-wrap');
      let overlay = null;
      if (wrap) {
        overlay = document.createElement('div');
        overlay.className = 'editor-preview-overlay';
        overlay.innerHTML = `<span class="project-spinner" style="width:24px;height:24px;"></span><span>正在渲染新分鏡...</span>`;
        wrap.appendChild(overlay);
      }

      try {
        const token = window.spaAuth?.getToken();
        const res = await fetch(`/api/projects/${this._projectId}/shots/${shotId}/regenerate`, {
          method: 'POST',
          signal: this._editorEvents?.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ prompt })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || '重新生成失敗');
        }

        const data = await res.json();
        if (this._editorEl !== el || this._selectedShotId !== shotId) return;
        const updatedShot = data.shot;

        // 更新本機狀態
        this._updateLocalShot(updatedShot);

        // 更新大圖
        const previewImg = el.querySelector('#pd-preview-img');
        if (previewImg && updatedShot.payload?.image) {
          previewImg.src = updatedShot.payload.image;
        }

        // 重新繪製版本清單
        this._rebuildVersionList(updatedShot.payload?.imageHistory || [], updatedShot.payload?.image);

        // 同步更新表格與膠捲
        this._refreshTableAndFilm(updatedShot);

        this._toast('新分鏡圖片生成完成！', 'success');

        if (typeof window.spaInvalidateProjectCache === 'function') {
          window.spaInvalidateProjectCache(this._projectId);
        }
      } catch (err) {
        if (err.name === 'AbortError' || this._editorEl !== el) return;
        console.error('Regenerate image error:', err);
        this._toast(err.message || '生成失敗，請重試', 'error');
      } finally {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (this._editorEl === el) this._isRegeneratingImage = false;
        if (regenBtn) regenBtn.disabled = false;
        if (regenLbl) regenLbl.textContent = '重新生成圖片';
      }
    },

    // ── 重新構建 Version History 列表 ──
    _rebuildVersionList(history, activeImg) {
      const el = this._editorEl;
      if (!el) return;
      const listWrap = el.querySelector('#pd-version-list');
      if (!listWrap) return;

      if (!history || history.length === 0) return;

      listWrap.innerHTML = history.map((item, idx) => {
        const isCurrent = item.image === activeImg;
        const vNum = history.length - idx;
        return `
          <button type="button" class="editor-version-item ${isCurrent ? 'active' : ''}" aria-pressed="${isCurrent}" data-version-img="${this._escHtml(item.image)}" data-version-prompt="${this._escHtml(item.prompt || '')}">
            <span class="version-radio-dot" aria-hidden="true"></span>
            <span class="version-label">Version ${vNum}</span>
            ${isCurrent ? '<span class="version-tag">目前使用</span>' : ''}
          </button>
        `;
      }).join('');

      // 重新綁定切換事件
      listWrap.querySelectorAll('.editor-version-item').forEach(item => {
        item.addEventListener('click', () => {
          const vImg = item.dataset.versionImg;
          const vPrompt = item.dataset.versionPrompt;
          if (!vImg) return;

          listWrap.querySelectorAll('.editor-version-item').forEach(v => { v.classList.remove('active'); v.setAttribute('aria-pressed', 'false'); });
          item.classList.add('active');
          item.setAttribute('aria-pressed', 'true');

          const previewImg = el.querySelector('#pd-preview-img');
          if (previewImg) previewImg.src = vImg;

          if (vPrompt) {
            const promptInput = el.querySelector('#pd-f-prompt');
            if (promptInput) promptInput.value = vPrompt;
          }

          this._editorDirty = true;
          this._activeVersionImage = vImg;
          const saveLbl = el.querySelector('#pd-lbl-save');
          if (saveLbl) saveLbl.textContent = '儲存版本變更';
        });
      });
    },

    // ── 更新本機 project shots ──
    _updateLocalShot(updatedShot) {
      if (!this._project || !this._project.shots) return;
      const idx = this._project.shots.findIndex(s => s.id === updatedShot.id);
      if (idx !== -1) {
        this._project.shots[idx] = { ...this._project.shots[idx], ...updatedShot };
      }
      if (typeof window.spaSeedProjectCache === 'function') {
        window.spaSeedProjectCache(this._projectId, this._project);
      }
    },

    // ── 同步刷新表格與膠捲列 ──
    _refreshTableAndFilm(shot) {
      const root = this._root;
      if (!root) return;

      // 1. 表格模式行
      const row = root.querySelector(`.project-shot-row[data-shot-id="${shot.id}"]`);
      if (row) {
        // 畫面縮圖
        const img = row.querySelector('.shot-cell-thumb-wrap img');
        if (img && shot.payload?.image) {
          img.src = shot.payload.image;
        }
        // 標題
        const titleEl = row.querySelector('.shot-cell-story-title');
        if (titleEl) titleEl.textContent = shot.title;
        // 運鏡
        const camEl = row.querySelector('.shot-pill-tag');
        if (camEl) camEl.textContent = shot.camera;
        // 時長
        const timeEl = row.querySelector('.shot-cell-time');
        if (timeEl) timeEl.textContent = shot.duration;
        // 情緒
        const noteEl = row.querySelector('.shot-cell-note-text');
        if (noteEl) noteEl.textContent = shot.payload?.emotion || '—';
      }

      // 2. 膠捲模式格
      const frame = root.querySelector(`.project-film-frame[data-shot-id="${shot.id}"]`);
      if (frame) {
        const fImg = frame.querySelector('.film-media-wrap img');
        if (fImg && shot.payload?.image) {
          fImg.src = shot.payload.image;
        }
        const fStory = frame.querySelector('.film-caption-story');
        if (fStory) fStory.textContent = shot.title;
        const fCam = frame.querySelector('.film-cam-badge');
        if (fCam) fCam.textContent = shot.camera;
        const fTime = frame.querySelector('.film-time-badge');
        if (fTime) fTime.textContent = shot.duration;
      }

      // 3. 更新頂部最後編輯時間
      const updEl = root.querySelector('#pd-updated-at');
      if (updEl && shot.updateAt) {
        updEl.textContent = '最後編輯：' + new Date(shot.updateAt).toLocaleString('zh-TW');
      }
    },

    // ── 匯出分鏡 JSON ──
    _exportProjectJson() {
      if (!this._project) return;
      const exportData = {
        id: this._project.id,
        title: this._project.title,
        style: this._project.style,
        ratio: this._project.ratio,
        updatedAt: this._project.updatedAt || new Date().toISOString(),
        metadata: this._project.metadata || {},
        characters: this._project.characters || {},
        shots: (this._project.shots || []).map(s => ({
          order: s.order,
          title: s.title,
          camera: s.camera,
          cameraDetails: s.payload?.cameraDetails || {},
          duration: s.duration,
          emotion: s.payload?.emotion || '',
          note: s.payload?.note || '',
          shotPrompt: s.payload?.shotPrompt || '',
          finalPrompt: s.payload?.finalPrompt || '',
          image: s.payload?.image || ''
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this._project.title || 'storyboard'}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this._toast('分鏡 JSON 已成功匯出！', 'success');
    },

    // ── Toast 通知 ──
    _toast(msg, type = 'default') {
      const status = this._editorEl?.querySelector('#pd-editor-status');
      if (status && type === 'error') {
        status.textContent = msg;
        status.hidden = false;
        status.setAttribute('role', 'alert');
        return;
      }
      let toastEl = document.getElementById('pd-toast');
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'pd-toast';
        toastEl.className = 'project-toast';
        document.body.appendChild(toastEl);
      }

      toastEl.textContent = msg;
      toastEl.className = `project-toast ${type}`;

      clearTimeout(this._toastTimer);
      requestAnimationFrame(() => {
        toastEl.classList.add('visible');
        this._toastTimer = setTimeout(() => {
          toastEl.classList.remove('visible');
        }, 2600);
      });
    },

    // ── 輔助函式：HTML 跳脫 ──
    _escHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  };
})();
