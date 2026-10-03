/**
 * StoryboardAI — Project Detail Page Module
 *
 * 負責單一分鏡專案 (Project Detail) 頁面組裝、SWR 資料載入、骨架屏、
 * 視圖模式 (表格/膠捲) DOM 渲染、動態漸層遮罩、封面銜接 (Cover Transition) 目標辨識，
 * 以及與 ProjectDetailController 的生命週期協調。
 * 遵循統一 Page Lifecycle 契約：mount() 回傳 { unmount() }
 */

(function (global) {
  'use strict';

  function renderProjectSkeleton(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="project-workspace loading-skeleton">
        <div class="content-header project-workspace-header">
          <div class="project-workspace-header-top">
            <div class="project-workspace-title-area">
              <button class="project-back-btn" style="pointer-events:none;opacity:0.6;">← 所有專案</button>
              <div class="project-workspace-title-box">
                <div class="skeleton-pulse" style="width: 240px; height: 26px; border-radius: 6px; background:#e2e8f0;"></div>
                <div class="skeleton-pulse" style="width: 140px; height: 14px; border-radius: 4px; background:#f1f5f9; margin-top: 6px;"></div>
              </div>
            </div>
            <div class="project-workspace-actions" style="opacity: 0.5; pointer-events: none;">
              <div class="project-workspace-toggle-bar">
                <button class="project-workspace-toggle-btn active">載入中...</button>
              </div>
            </div>
          </div>
          <div class="project-workspace-header-sub">
            <div class="project-workspace-attrs">
              <span class="project-attr-badge skeleton-pulse" style="width: 80px; height: 22px; background:#f1f5f9;"></span>
              <span class="project-attr-badge skeleton-pulse" style="width: 80px; height: 22px; background:#f1f5f9;"></span>
              <span class="project-attr-badge skeleton-pulse" style="width: 60px; height: 22px; background:#f1f5f9;"></span>
            </div>
          </div>
        </div>

        <div class="content-body project-workspace-content" data-dynamic-mask data-mask-direction="vertical" data-mask-size="36">
          <div class="project-table-container">
            <table class="project-table">
              <thead>
                <tr>
                  <th class="col-th-num">鏡頭</th>
                  <th class="col-th-img">畫面</th>
                  <th class="col-th-story">故事內容 / 鏡頭語言</th>
                  <th class="col-th-time">時長</th>
                  <th class="col-th-note">情緒 / 備註</th>
                  <th class="col-th-action">操作</th>
                </tr>
              </thead>
              <tbody>
                ${[1, 2, 3, 4].map(idx => `
                  <tr>
                    <td class="shot-cell-num">${String(idx).padStart(2, '0')}</td>
                    <td><div class="shot-cell-thumb-wrap skeleton-pulse" style="aspect-ratio:16/9;background:#e2e8f0;"></div></td>
                    <td>
                      <div class="skeleton-pulse" style="width:75%;height:16px;background:#e2e8f0;border-radius:4px;margin-bottom:6px;"></div>
                      <div class="skeleton-pulse" style="width:40%;height:14px;background:#f1f5f9;border-radius:4px;"></div>
                    </td>
                    <td class="shot-cell-time"><div class="skeleton-pulse" style="width:36px;height:16px;background:#f1f5f9;border-radius:4px;margin:auto;"></div></td>
                    <td><div class="skeleton-pulse" style="width:60px;height:14px;background:#f1f5f9;border-radius:4px;"></div></td>
                    <td style="text-align:right;"><div class="skeleton-pulse" style="width:60px;height:24px;background:#f1f5f9;border-radius:6px;margin-left:auto;"></div></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function getActiveTransition(projectId) {
    const active = global._activeProjectTransition || global.currentCoverTransition;
    if (active && (!projectId || String(active.projectId) === String(projectId))) {
      return active;
    }
    return null;
  }

  async function mount(context = {}) {
    const root = context.root || (typeof document !== 'undefined' ? (document.getElementById('page-main') || document.querySelector('.spa-project-wrap')) : null);
    const signal = context.signal || null;
    const navFn = context.navigate || global.spaNavigate;

    // 解析 projectId
    let projectId = context.id || context.opts?.id || null;
    if (!projectId && typeof context === 'string') {
      projectId = context;
    }
    if (!projectId && typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      const match = hash.match(/^#\/project\/(.+)$/);
      if (match) {
        projectId = decodeURIComponent(match[1]);
      }
    }

    if (root) {
      root.className = 'page-shell page-project-detail spa-project-wrap project-workspace';
    }

    if (!projectId) {
      if (root) {
        root.innerHTML = '<div class="projects-empty"><h3>找不到分鏡 ID</h3></div>';
      }
      return { unmount() {} };
    }

    let isMounted = true;
    let contentBodyEl = null;
    let unsubscribeStore = null;
    let hasRenderedWorkspace = false;

    // ── 生命週期卸載契約 (Unmount Contract) ───────────────────
    function unmount() {
      if (!isMounted) return;
      isMounted = false;

      if (signal) {
        signal.removeEventListener('abort', unmount);
      }

      if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
      }

      // 清理子模組 ProjectDetailController
      if (global.ProjectDetailController && typeof global.ProjectDetailController.destroy === 'function') {
        global.ProjectDetailController.destroy();
      }

      // 若導航中途跳出且過渡尚未完成，安全取消過渡
      const activeTrans = getActiveTransition(projectId);
      if (activeTrans && activeTrans.state !== 'complete') {
        activeTrans.cancel?.();
      }

      // 清理動態遮罩
      if (contentBodyEl && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.detach === 'function') {
        global.DynamicMaskSystem.detach(contentBodyEl);
        contentBodyEl = null;
      }
    }

    // ── 渲染分鏡工作區 DOM ──
    async function renderWorkspace(p) {
      if (!isMounted || !root) return;

      const shots = Array.isArray(p.shots) ? p.shots : (p.shots ? [p.shots] : []);
      const safeTranslate = typeof global.translatePromptText === 'function'
        ? global.translatePromptText
        : async v => String(v || '');

      const safeFormat = typeof global.formatPromptText === 'function'
        ? global.formatPromptText
        : async v => String(v || '');

      const processedShots = await Promise.all(shots.map(async (s, index) => {
        const payload = s.payload || {};
        const shotPrompt = await safeTranslate(payload.shotPrompt || payload.prompt || '');
        const formattedShotPrompt = await safeFormat(shotPrompt);
        const emotion = payload.emotion || s.emotion || '';
        const imageUrl = payload.image || '';
        const order = s.order ?? (index + 1);
        return {
          id: s.id,
          order,
          title: s.title || '未命名鏡頭',
          camera: s.camera || '未設定',
          duration: s.duration || '0s',
          emotion,
          imageUrl,
          formattedShotPrompt
        };
      }));

      if (!isMounted || signal?.aborted) return;

      // 依序排列鏡頭
      processedShots.sort((a, b) => a.order - b.order);

      const ratioMatch = p.ratio ? p.ratio.match(/\d+[:/]\d+/) : null;
      const cleanRatio = ratioMatch ? ratioMatch[0] : '16:9';
      const aspectRatio = cleanRatio.replace(':', ' / ');

      // 檢查是否處於封面過渡期間
      const activeTrans = getActiveTransition(projectId);
      const isTransitionActive = Boolean(activeTrans);

      // ── Table Rows ──────────────────────────────────────────
      let tableRowsHtml = '';
      processedShots.forEach((s, idx) => {
        const isTarget = isTransitionActive && idx === 0 && Boolean(s.imageUrl);
        const targetClass = isTarget ? ' is-transition-target' : '';
        const thumbHtml = s.imageUrl
          ? `<div class="shot-cell-thumb-wrap${targetClass}" style="aspect-ratio:${aspectRatio};" data-src="${s.imageUrl}"><div class="project-shot-thumb-skeleton" style="width:140px;aspect-ratio:${aspectRatio};"></div></div>`
          : `<div class="shot-cell-thumb-wrap" style="aspect-ratio:${aspectRatio};background:#e2e8f0;width:140px;"></div>`;
        tableRowsHtml += `
          <tr class="project-shot-row" data-shot-id="${s.id}">
            <td class="shot-cell-num">${String(s.order).padStart(2, '0')}</td>
            <td>${thumbHtml}</td>
            <td>
              <div class="shot-cell-story-box">
                <div class="shot-cell-story-title">${s.title}</div>
                <div class="shot-cell-camera-tags">
                  <span class="shot-pill-tag">${s.camera}</span>
                </div>
              </div>
            </td>
            <td class="shot-cell-time">${s.duration}</td>
            <td>
              <div class="shot-cell-note-text">${s.emotion || '—'}</div>
            </td>
            <td style="text-align:right;">
              <button class="shot-cell-edit-btn" data-shot-id="${s.id}">✏️ 編輯</button>
            </td>
          </tr>
        `;
      });

      // ── Film Frames ─────────────────────────────────────────
      const holeCount = Math.max(processedShots.length * 3, 24);
      let railHolesHtml = '';
      for (let i = 0; i < holeCount; i++) {
        railHolesHtml += '<div class="project-rail-hole"></div>';
      }

      let filmFramesHtml = '';
      processedShots.forEach(s => {
        const imgHtml = s.imageUrl
          ? `<img src="${s.imageUrl}" alt="Shot ${s.order}" loading="lazy">`
          : `<div style="width:100%;aspect-ratio:${aspectRatio};background:#1c1917;"></div>`;
        filmFramesHtml += `
          <div class="project-film-frame" data-shot-id="${s.id}">
            <div class="film-sprocket-header">
              <div class="film-sprocket-dot"></div>
              <div class="film-sprocket-dot"></div>
              <div class="film-sprocket-dot"></div>
              <span class="film-frame-number">SHOT ${String(s.order).padStart(2, '0')}</span>
            </div>
            <div class="film-media-wrap" style="aspect-ratio:${aspectRatio};">${imgHtml}</div>
            <div class="film-info-caption">
              <div class="film-caption-story">${s.title}</div>
              <div class="film-caption-meta">
                <span class="film-cam-badge">${s.camera}</span>
                <span class="film-time-badge">${s.duration}</span>
              </div>
            </div>
            <div class="film-sprocket-header">
              <div class="film-sprocket-dot"></div>
              <div class="film-sprocket-dot"></div>
              <div class="film-sprocket-dot"></div>
            </div>
          </div>
        `;
      });

      // ── Compute total duration ──────────────────────────────
      let totalSeconds = 0;
      processedShots.forEach(s => {
        const match = (s.duration || '').match(/(\d+(\.\d+)?)/);
        if (match) totalSeconds += parseFloat(match[1]);
      });

      // ── Full workspace HTML ─────────────────────────────────
      // 銷毀前一次的子控制器與動態遮罩，確保不殘留孤兒 DOM 或重複監聽 (僅在非初次渲染時執行)
      if (hasRenderedWorkspace) {
        if (global.ProjectDetailController && typeof global.ProjectDetailController.destroy === 'function') {
          global.ProjectDetailController.destroy();
        }
        if (contentBodyEl && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.detach === 'function') {
          global.DynamicMaskSystem.detach(contentBodyEl);
          contentBodyEl = null;
        }
      }
      hasRenderedWorkspace = true;

      root.innerHTML = `
        <div class="project-workspace">
          <div class="content-header project-workspace-header">
            <div class="project-workspace-header-top">
              <div class="project-workspace-title-area">
                <button class="project-back-btn" id="pd-back-btn">
                  <span>←</span>
                  <span>所有專案</span>
                </button>
                <div class="project-workspace-title-box">
                  <h2 class="project-workspace-title">${p.title}</h2>
                  <div class="project-workspace-meta" id="pd-updated-at">最後編輯：${p.updatedAt ? new Date(p.updatedAt).toLocaleString('zh-TW') : (p.createAt ? new Date(p.createAt).toLocaleString('zh-TW') : '')}</div>
                </div>
              </div>
              <div class="project-workspace-actions">
                <button class="project-workspace-btn" id="pd-export-json-btn">
                  <span>📥</span>
                  <span>匯出分鏡 JSON</span>
                </button>
                <div class="project-workspace-toggle-bar">
                  <button id="pd-view-list" class="project-workspace-toggle-btn active">表格模式</button>
                  <button id="pd-view-film" class="project-workspace-toggle-btn">膠捲模式</button>
                </div>
              </div>
            </div>

            <div class="project-workspace-header-sub">
              <div class="project-workspace-attrs">
                <span class="project-attr-badge">風格：${p.style || '未指定'}</span>
                <span class="project-attr-badge">比例：${p.ratio || '16:9'}</span>
                <span class="project-attr-badge highlight" id="pd-shot-count">${processedShots.length} 鏡頭</span>
                <span class="project-attr-badge highlight" id="pd-total-duration">總長 ${totalSeconds.toFixed(1).replace(/\.0$/, '')}s</span>
              </div>
            </div>
          </div>

          <div class="content-body project-workspace-content" data-dynamic-mask data-mask-direction="vertical" data-mask-size="36">
            <!-- 表格模式 -->
            <div id="pd-table-view" class="project-table-container">
              <table class="project-table">
                <thead>
                  <tr>
                    <th class="col-th-num">鏡頭</th>
                    <th class="col-th-img">畫面</th>
                    <th class="col-th-story">故事內容 / 鏡頭語言</th>
                    <th class="col-th-time">時長</th>
                    <th class="col-th-note">情緒 / 備註</th>
                    <th class="col-th-action">操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRowsHtml || '<tr><td colspan="6" style="text-align:center;padding:32px;color:#a8a29e;">尚無鏡頭資料</td></tr>'}
                </tbody>
              </table>
            </div>

            <!-- 膠捲模式 -->
            <div id="pd-film-view" class="project-film-container" style="display:none;">
              <div class="project-filmstrip-rail">${railHolesHtml}</div>
              <div class="project-filmstrip-scroll">
                <div class="project-filmstrip-track">
                  ${filmFramesHtml || '<div style="padding:32px;color:#71717a;">尚無鏡頭資料</div>'}
                </div>
              </div>
              <div class="project-filmstrip-rail">${railHolesHtml}</div>
            </div>
          </div>
        </div>
      `;

      // ── Lazy load thumbnails & Transition Handoff ───────────
      root.querySelectorAll('.shot-cell-thumb-wrap[data-src]').forEach(wrap => {
        const src = wrap.dataset.src;
        if (!src) return;
        const isTarget = wrap.classList.contains('is-transition-target');
        const img = typeof Image !== 'undefined' ? new Image() : (typeof document !== 'undefined' ? document.createElement('img') : null);
        if (!img) return;

        let handled = false;
        const handleSuccess = async () => {
          if (handled || !isMounted) return;
          handled = true;
          if (img.decode) {
            try { await img.decode(); } catch (e) {}
          }
          if (!isMounted) return;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
          img.alt = 'Shot';
          wrap.innerHTML = '';
          wrap.appendChild(img);

          const currentTrans = getActiveTransition(projectId);
          if (isTarget && currentTrans) {
            currentTrans.onFirstShotReady(wrap, img);
          } else {
            img.style.opacity = '0';
            img.style.transition = 'opacity .35s';
            if (typeof requestAnimationFrame === 'function') {
              requestAnimationFrame(() => { img.style.opacity = '1'; });
            } else {
              img.style.opacity = '1';
            }
          }
        };

        const handleFailure = () => {
          if (handled || !isMounted) return;
          handled = true;
          wrap.innerHTML = '<div style="width:100%;height:100%;background:#e2e8f0;"></div>';
          const currentTrans = getActiveTransition(projectId);
          if (isTarget && currentTrans) {
            currentTrans.fallbackDismiss?.();
          }
        };

        // 事件監聽必須在指定 src 前綁定
        img.onload = handleSuccess;
        img.onerror = handleFailure;
        img.src = src;

        // Browser Cache 支援：若瀏覽器已快取圖片完成，立即呼叫 handleSuccess
        if (img.complete) {
          if (img.naturalWidth > 0) {
            handleSuccess();
          } else if (img.naturalWidth === 0 && img.naturalHeight === 0 && img.src) {
            if (typeof img.decode === 'function') {
              img.decode().then(handleSuccess).catch(handleFailure);
            }
          }
        }
      });

      // 封面過渡保護：若處於過渡中但第 1 鏡無圖（或無鏡頭），立即 fallback 結束過渡，不可永久停留在 waiting-project
      const hasTargetShot = isTransitionActive && processedShots[0] && Boolean(processedShots[0].imageUrl);
      if (isTransitionActive && !hasTargetShot) {
        const currentTrans = getActiveTransition(projectId);
        if (currentTrans) currentTrans.fallbackDismiss?.();
      }

      // ── Dynamic Gradient Mask ───────────────────────────────
      contentBodyEl = root.querySelector('.project-workspace-content') || root.querySelector('.content-body');
      if (contentBodyEl && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.attach === 'function') {
        global.DynamicMaskSystem.attach(contentBodyEl, { maskSize: 36, direction: 'vertical' });
      }

      // ── Initialise Child Controller (project-detail.js) ─────
      if (global.ProjectDetailController && typeof global.ProjectDetailController.init === 'function') {
        global.ProjectDetailController.init({ root, projectId, project: p });
      }
    }

    // ── SWR 資料取得策略 ──────────────────────────────────────
    const cachedDetail = global.ProjectStore && typeof global.ProjectStore.getProjectDetail === 'function'
      ? global.ProjectStore.getProjectDetail(projectId)
      : null;

    if (cachedDetail) {
      await renderWorkspace(cachedDetail);
      // 背景重新整理
      if (global.ProjectStore && typeof global.ProjectStore.fetchProjectDetail === 'function') {
        global.ProjectStore.fetchProjectDetail(projectId, { signal, force: true })
          .then(fresh => {
            if (!isMounted || signal?.aborted || !fresh) return;
            const currentJSON = JSON.stringify(cachedDetail);
            const freshJSON = JSON.stringify(fresh);
            if (currentJSON !== freshJSON) {
              renderWorkspace(fresh);
            }
          })
          .catch(() => {});
      }
    } else {
      renderProjectSkeleton(root);
      try {
        if (global.ProjectStore && typeof global.ProjectStore.fetchProjectDetail === 'function') {
          const p = await global.ProjectStore.fetchProjectDetail(projectId, { signal });
          if (!isMounted || signal?.aborted) return { unmount };

          if (!p) {
            if (root) {
              root.innerHTML = '<div class="projects-empty"><h3>無法取得分鏡</h3></div>';
            }
            const activeTrans = getActiveTransition(projectId);
            if (activeTrans) activeTrans.cancel?.();
            return { unmount };
          }

          await renderWorkspace(p);
        }
      } catch (err) {
        if (!isMounted || signal?.aborted || err.name === 'AbortError') return { unmount };
        console.error('[ProjectDetailPage] fetch error:', err);
        if (root) {
          root.innerHTML = `<div class="projects-empty"><h3>讀取分鏡發生錯誤</h3><p>${err.message || '未知錯誤'}</p></div>`;
        }
        const activeTrans = getActiveTransition(projectId);
        if (activeTrans) activeTrans.cancel?.();
      }
    }

    // ── 訂閱 ProjectStore 狀態變更 ────────────────────────────
    if (global.ProjectStore && typeof global.ProjectStore.subscribe === 'function') {
      unsubscribeStore = global.ProjectStore.subscribe((projects, event) => {
        if (!isMounted) return;
        if (event && (event.type === 'detail_loaded' || event.type === 'detail_seed') && event.id === projectId && event.project) {
          renderWorkspace(event.project);
        }
      });
    }

    if (signal) {
      if (signal.aborted) {
        unmount();
        return { unmount };
      }
      signal.addEventListener('abort', unmount, { once: true });
    }

    return {
      unmount
    };
  }

  const ProjectDetailPage = {
    mount,
    renderProjectSkeleton,
    getActiveTransition
  };

  if (typeof global !== 'undefined') {
    global.ProjectDetailPage = ProjectDetailPage;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectDetailPage;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
