/**
 * StoryboardAI — Dashboard Page Module
 * 
 * 負責首頁 Dashboard 頁面組裝、問候語/使用者資訊呈現、最近專案 (Recent Projects) 區塊渲染、
 * Quick Actions 導航事件與生命週期管理。
 * 遵循統一 Page Lifecycle 契約：mount() 回傳 { unmount() }
 */

(function (global) {
  'use strict';

  const SKELETON_RECENT_CARDS_HTML = Array.from({ length: 4 }).map(() => `
    <div class="project-card project-folder-card skeleton variant-compact">
      <div class="project-folder-preview-stack">
        <div class="project-preview-primary skeleton-pulse"></div>
      </div>
      <div class="project-folder-shell">
        <div class="project-folder-header-row">
          <div class="project-folder-tab"><span class="project-folder-tab-dot"></span></div>
          <div class="project-folder-notch-wrap">
            <div class="project-option-slot"><div class="project-option-btn skeleton-pulse"></div></div>
          </div>
        </div>
        <div class="project-folder-content">
          <div class="project-updated skeleton-pulse">&nbsp;</div>
          <div class="project-title-wrapper"><div class="project-title skeleton-pulse">&nbsp;</div></div>
          <div class="project-meta">
            <span class="project-meta-pill skeleton-pulse">&nbsp; &nbsp; &nbsp;</span>
            <span class="project-meta-pill skeleton-pulse">&nbsp; &nbsp; &nbsp;</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');

  function renderEmptyRecentState(container, onOpenQC) {
    if (!container) return;
    container.innerHTML = `
      <div class="home-empty-recent-card">
        <div class="home-empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary, #2563eb);"><path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8H4Z"/><path d="m4 11 2.3-4.6A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.8 1.4L20 11H4Z"/><path d="m6.5 5 2 6"/><path d="m11.5 5 2 6"/><path d="m16.5 5 2 6"/></svg>
        </div>
        <h3 class="home-empty-title">尚無最近編輯的分鏡</h3>
        <p class="home-empty-desc">點擊右下角 QC 創作按鈕，快速記錄你的第一個分鏡創意！</p>
        <button class="home-empty-qc-btn" type="button" id="home-empty-create-btn">
          <span>開啟 QC 創作</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
      </div>
    `;

    const emptyBtn = container.querySelector('#home-empty-create-btn');
    if (emptyBtn) {
      emptyBtn.onclick = () => {
        if (typeof onOpenQC === 'function') onOpenQC();
      };
    }
  }

  function getRecentProjects(projectsList) {
    if (!Array.isArray(projectsList)) return [];
    const isPendingDelete = (id) => {
      if (global.ProjectDeleteQueue && typeof global.ProjectDeleteQueue.isPending === 'function') {
        return global.ProjectDeleteQueue.isPending(id);
      }
      return false;
    };

    return projectsList
      .filter(p => !p.is_deleted && !isPendingDelete(p.id))
      .sort((a, b) => new Date(b.updateAt || b.createAt) - new Date(a.updateAt || a.createAt))
      .slice(0, 4);
  }

  const recentCardStates = new WeakMap();

  function getRecentCardSignature(p) {
    if (global.ProjectCard && typeof global.ProjectCard.getCardSignature === 'function') {
      return global.ProjectCard.getCardSignature(p, { variant: 'compact' });
    }
    const tags = Array.isArray(p?.tags) ? p.tags.join(',') : '';
    const shotsCount = p?.shotCount || p?.shotsCount || (Array.isArray(p?.shots) ? p.shots.length : 0);
    return `${p?.id}|${p?.title || ''}|${p?.ratio || ''}|${shotsCount}|${p?.updateAt || p?.updatedAt || ''}|${tags}|${p?.cover || ''}`;
  }

  function renderRecentProjectsList(recentGrid, recentProjects, onCardMutate) {
    if (!recentGrid) return;
    let state = recentCardStates.get(recentGrid);
    if (!state) {
      state = new Map();
      recentCardStates.set(recentGrid, state);
    }

    if (recentProjects.length === 0) {
      state.forEach(entry => global.ProjectCardInteractions?.unbind?.(entry.card));
      state.clear();
      recentGrid.innerHTML = '';
      renderEmptyRecentState(recentGrid, () => {
        if (global.AICreationController) {
          global.AICreationController.openQuickCompose();
        } else if (typeof global.spaNavigate === 'function') {
          global.spaNavigate('generate');
        }
      });
      return;
    }

    // Remove skeleton or empty placeholders if transitioning from skeleton/empty
    const hasSkeletonOrEmpty = recentGrid.querySelector?.('.skeleton, .home-empty-recent-card');
    if (hasSkeletonOrEmpty || (!state.size && recentGrid.children?.length > 0)) {
      if (state.size === 0) {
        recentGrid.innerHTML = '';
      } else {
        recentGrid.querySelectorAll?.('.skeleton, .home-empty-recent-card')?.forEach(el => el.remove?.());
      }
    }

    const retainedIds = new Set(recentProjects.map(p => String(p.id)));
    for (const [id, entry] of state.entries()) {
      if (!retainedIds.has(id)) {
        global.ProjectCardInteractions?.unbind?.(entry.card);
        if (entry.card.parentNode === recentGrid || typeof entry.card.remove === 'function') {
          entry.card.remove?.();
        }
        state.delete(id);
      }
    }

    let createdAny = false;
    recentProjects.forEach((p, idx) => {
      const id = String(p.id);
      const signature = getRecentCardSignature(p);
      let entry = state.get(id);

      if (!entry) {
        const card = document.createElement('div');
        if (global.ProjectCard && typeof global.ProjectCard.buildHomeRecentCardHTML === 'function') {
          card.innerHTML = global.ProjectCard.buildHomeRecentCardHTML(p);
        } else if (typeof global.buildHomeRecentCardHTML === 'function') {
          card.innerHTML = global.buildHomeRecentCardHTML(p);
        }
        card.dataset.variant = 'compact';
        if (typeof global.setupProjectCardEvents === 'function') {
          global.setupProjectCardEvents(card, p, false, () => {
            if (typeof onCardMutate === 'function') onCardMutate();
          });
        }
        entry = { card, signature };
        state.set(id, entry);
        createdAny = true;
      } else if (entry.signature !== signature) {
        const patched = global.ProjectCard?.patchCardElement?.(entry.card, p, { variant: 'compact' });
        if (!patched) {
          // Fallback only if mock DOM lacks querySelector support
          global.ProjectCardInteractions?.unbind?.(entry.card);
          if (global.ProjectCard && typeof global.ProjectCard.buildHomeRecentCardHTML === 'function') {
            entry.card.innerHTML = global.ProjectCard.buildHomeRecentCardHTML(p);
          } else if (typeof global.buildHomeRecentCardHTML === 'function') {
            entry.card.innerHTML = global.buildHomeRecentCardHTML(p);
          }
          if (typeof global.setupProjectCardEvents === 'function') {
            global.setupProjectCardEvents(entry.card, p, false, () => {
              if (typeof onCardMutate === 'function') onCardMutate();
            });
          }
          createdAny = true;
        }
        entry.signature = signature;
      } else {
        // Keep latest project reference without touching DOM
        global.ProjectCardInteractions?.updateProject?.(entry.card, p);
      }

      // Preserve exact DOM position without unnecessary detach/re-insert
      const currentAtIdx = recentGrid.children ? recentGrid.children[idx] : null;
      if (currentAtIdx !== entry.card) {
        if (currentAtIdx && typeof recentGrid.insertBefore === 'function') {
          recentGrid.insertBefore(entry.card, currentAtIdx);
        } else if (typeof recentGrid.insertBefore === 'function' || !Array.isArray(recentGrid.children) || !recentGrid.children.includes(entry.card)) {
          recentGrid.appendChild(entry.card);
        }
      }
    });

    if (createdAny && typeof global.lazyLoadProjectThumbs === 'function') {
      global.lazyLoadProjectThumbs(recentGrid);
    }
  }

  function buildHeroModel(projects, failed = false) {
    if (failed) return { state: 'error', title: '故事，從下一個鏡頭繼續。', context: '暫時無法載入最近創作，仍可先瀏覽敘事模板。', images: [] };
    if (!Array.isArray(projects)) return { state: 'loading', title: '故事，從下一個鏡頭繼續。', context: '正在載入最近創作…', images: [] };
    const project = getRecentProjects(projects)[0];
    if (!project) return { state: 'empty', title: '把故事，排成下一個鏡頭。', context: '用 QC 記下第一個想法，或先從敘事模板尋找節奏。', images: [] };
    const candidates = [...(Array.isArray(project.previewImages) ? project.previewImages : []), ...(Array.isArray(project.shots) ? project.shots : []).map(shot => shot.payload?.image)];
    const images = [...new Set(candidates.filter(url => typeof url === 'string' && /^(https?:\/\/|\/(?!\/)|\.{1,2}\/)/i.test(url)))].slice(0, 3);
    return { state: 'project', id: project.id, title: project.title || '未命名分鏡', context: '接續最近編輯的分鏡，讓畫面與節奏再往前一步。', images };
  }

  const TEMPLATE_CAT_MAP = { product: '商品廣告', story: '敘事紀實', twist: '高留存節奏', custom: '團隊資產', '未分類': '精選模板' };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  function safeMediaUrl(value) {
    if (typeof value !== 'string') return '';
    try {
      const url = new URL(value, document.baseURI || window.location?.href || 'http://localhost/');
      return ['http:', 'https:', 'data:'].includes(url.protocol) || value.startsWith('/') ? value : '';
    } catch (_) {
      return value.startsWith('/') ? value : '';
    }
  }

  function formatRelativeTime(dateInput) {
    if (!dateInput) return '剛剛';
    const ts = new Date(dateInput).getTime();
    if (!Number.isFinite(ts)) return '最近';
    const diffMin = Math.max(1, Math.floor((Date.now() - ts) / 60000));
    if (diffMin < 60) return `${diffMin} 分鐘前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} 小時前`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay} 天前`;
    return new Date(ts).toLocaleDateString('zh-TW');
  }

  function syncLandscapeHeroWidth(hero, frames) {
    if (!hero || !frames || !frames.classList?.contains('is-landscape')) return;
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      if (frames.style) frames.style.width = '';
      return;
    }
    const actions = hero.querySelector?.('.workspace-hero-actions');
    const cardInnerWidth = Math.max(0, (hero.clientWidth || 0) - 48);
    if (!cardInnerWidth) return;
    const minLeftWidth = Math.max(280, (actions?.scrollWidth || 240) + 20);
    const maxAllowed = Math.max(200, cardInnerWidth - 24 - minLeftWidth);
    const targetWidth = Math.min(Math.round(cardInnerWidth * 0.5), maxAllowed);
    if (frames.style) frames.style.width = `${targetWidth}px`;
  }

  function renderHero(root, projects, navigate, failed = false) {
    const find = id => root?.querySelector('#' + id) || document.getElementById(id);
    const hero = find('home-hero-card'), title = find('workspace-hero-title'), context = find('workspace-hero-context');
    if (!hero || !title || !context) return;
    const model = buildHeroModel(projects, failed);
    const recentProject = Array.isArray(projects) ? (getRecentProjects(projects)[0] || null) : null;
    const coverUrl = model.images[0] || (model.state === 'project' && model.id ? `/api/projects/${encodeURIComponent(model.id)}/cover` : '');
    const heroSignature = `${model.state}|${model.id || ''}|${model.title}|${coverUrl}|${recentProject?.ratio || ''}`;

    // Keep latest project ref for resume transition without rebuilding hero DOM
    hero._latestRecentProject = recentProject;
    if (hero._lastHeroSignature === heroSignature) {
      return;
    }
    hero._lastHeroSignature = heroSignature;

    hero.dataset.state = model.state;
    title.textContent = '靈感，一鍵轉換';
    context.textContent = '讓靈感成為看得見的故事，探索模板、案例與短影音創作靈感。';
    const resume = find('workspace-hero-resume');
    const resumeDock = find('workspace-hero-resume-dock');
    const frames = find('workspace-hero-frames');
    if (resumeDock) resumeDock.hidden = model.state !== 'project';
    if (resume) {
      resume.hidden = model.state !== 'project';
      resume.href = model.state === 'project' ? '/project/' + encodeURIComponent(model.id) : '/projects';
      resume.onclick = event => {
        if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        const latestProj = hero._latestRecentProject || recentProject;
        const coverFrame = frames?.querySelector?.('.workspace-frame-cover') || frames?.querySelector?.('.workspace-frame');
        const hasCoverImg = Boolean(coverFrame?.querySelector?.('img')?.src);
        if (global.ProjectCoverTransition && typeof global.ProjectCoverTransition.launch === 'function' && latestProj && coverFrame && hasCoverImg) {
          if (hero.classList?.contains('is-navigating')) return;
          const fadeTargets = [
            hero.querySelector?.('.workspace-hero-backdrop'),
            hero.querySelector?.('.workspace-hero-copy'),
            hero.querySelector?.('.workspace-hero-resume-dock')
          ].filter(Boolean);
          fadeTargets.forEach(el => {
            if (el.style) {
              el.style.transition = 'opacity 220ms ease, transform 280ms cubic-bezier(.4, 0, .2, 1)';
              el.style.opacity = '0';
            }
          });
          if (frames?.style) frames.style.opacity = '0';
          const restoreHero = () => {
            fadeTargets.forEach(el => {
              if (el.style) {
                el.style.opacity = '';
                el.style.transition = '';
              }
            });
            if (frames?.style) frames.style.opacity = '';
          };
          const proxyCard = {
            get isConnected() { return hero.isConnected; },
            classList: hero.classList,
            querySelector(sel) {
              if (sel === '.project-preview-primary') return coverFrame;
              if (sel === '.project-folder-shell') return hero.querySelector?.('.workspace-hero-backdrop') || null;
              return hero.querySelector?.(sel) || null;
            }
          };
          global.ProjectCoverTransition.launch(proxyCard, latestProj, { navigate, onCleanup: restoreHero });
          return;
        }
        navigate('project', { id: model.id });
      };
    }
    const bgImg = find('workspace-hero-bg-img');

    if (bgImg) {
      if (coverUrl) {
        bgImg.hidden = false;
        bgImg.onerror = () => {
          bgImg.hidden = true;
          bgImg.removeAttribute('src');
        };
        if (bgImg.getAttribute?.('src') !== coverUrl) {
          bgImg.src = coverUrl;
        }
      } else {
        bgImg.hidden = true;
        bgImg.removeAttribute('src');
      }
    }

    if (!frames) return;
    frames.textContent = '';
    frames.classList?.remove('is-tall', 'is-landscape');
    if (frames.style) frames.style.width = '';
    frames.dataset.count = coverUrl ? '1' : '0';
    frames.setAttribute('aria-label', coverUrl ? `${model.title} 專案封面` : '專案封面');
    const addEmpty = () => {
      const frame = document.createElement('div');
      frame.className = 'workspace-frame workspace-frame-empty';
      frame.setAttribute('aria-hidden', 'true');
      for (const text of ['畫面', '運鏡 / 秒數']) {
        const label = document.createElement('span');
        label.textContent = text;
        frame.appendChild(label);
      }
      frames.appendChild(frame);
    };
    if (!coverUrl) {
      addEmpty();
    } else {
      const frame = document.createElement('figure');
      frame.className = 'workspace-frame workspace-frame-cover';
      if (recentProject?.ratio) frame.dataset.ratio = recentProject.ratio;
      const image = document.createElement('img');
      image.src = coverUrl;
      image.alt = `${model.title} 封面`;
      image.decoding = 'async';
      image.onload = () => {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          const aspect = image.naturalWidth / image.naturalHeight;
          frame.dataset.trueRatio = String(aspect);
          if (aspect >= 1.2) {
            frames.classList?.add('is-landscape');
            syncLandscapeHeroWidth(hero, frames);
          } else if (aspect >= 0.9) {
            if (frames.style) frames.style.width = '260px';
          } else {
            frames.classList?.add('is-tall');
            if (frames.style) frames.style.width = '220px';
          }
        }
      };
      image.onerror = () => {
        frame.remove();
        frames.classList?.remove('is-tall', 'is-landscape');
        if (frames.style) frames.style.width = '';
        frames.dataset.count = '0';
        addEmpty();
      };
      frame.appendChild(image);
      frames.appendChild(frame);
    }
  }

  function buildMilestones(activeProjects, totalShots) {
    const milestones = [];
    if (!activeProjects.length) return milestones;

    const earliest = [...activeProjects].sort((a, b) => new Date(a.createAt || a.updateAt) - new Date(b.createAt || b.updateAt))[0];
    if (earliest) {
      milestones.push({
        icon: 'clapper',
        title: '第一次完成分鏡',
        meta: `「${earliest.title || '未命名分鏡'}」`
      });
    }

    const shotThreshold = [500, 300, 100, 50, 10].find(n => totalShots >= n);
    if (shotThreshold) {
      milestones.push({
        icon: 'layers',
        title: `累積 ${shotThreshold} 個鏡頭`,
        meta: `目前已累積 ${totalShots} 個分鏡鏡頭`
      });
    }

    const templateProject = activeProjects.find(p => Boolean(p.templateId || p.templateName || p.sourceTemplateId || p.fromTemplate));
    if (templateProject) {
      milestones.push({
        icon: 'flame',
        title: '使用模板完成創作',
        meta: `「${templateProject.title || '未命名分鏡'}」`
      });
    } else if (activeProjects.length >= 5) {
      const projectThreshold = activeProjects.length >= 10 ? 10 : 5;
      milestones.push({
        icon: 'folder',
        title: `累積 ${projectThreshold} 個分鏡專案`,
        meta: `持續創作中，共 ${activeProjects.length} 部作品`
      });
    }

    return milestones.slice(0, 3);
  }

  function milestoneIconSvg(kind) {
    if (kind === 'layers') {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>';
    }
    if (kind === 'flame') {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>';
    }
    if (kind === 'folder') {
      return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';
    }
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8H4Z"></path><path d="m4 11 2.3-4.6A2 2 0 0 1 8.1 5h7.8a2 2 0 0 1 1.8 1.4L20 11H4Z"></path></svg>';
  }

  function renderActivityRail(root, projects, navigate) {
    const find = id => root?.querySelector('#' + id) || document.getElementById(id);
    const statProjects = find('home-stat-projects');
    const statShots = find('home-stat-shots');
    const summaryEl = find('home-stats-summary');
    const listEl = find('home-activity-list');

    if (!Array.isArray(projects)) {
      if (summaryEl) summaryEl.textContent = '載入中';
      return;
    }

    const active = projects.filter(p => !p.is_deleted);
    const totalShots = active.reduce((sum, p) => sum + (Array.isArray(p.shots) ? p.shots.length : (Number(p.shotCount) || 0)), 0);

    if (statProjects) statProjects.textContent = String(active.length);
    if (statShots) statShots.textContent = String(totalShots);
    if (summaryEl) summaryEl.textContent = active.length ? `共 ${active.length} 個進行中` : '準備出發';

    if (!listEl) return;
    const milestones = buildMilestones(active, totalShots);
    const milestoneSig = milestones.map(m => `${m.icon}|${m.title}|${m.meta}`).join(';');
    if (listEl._lastMilestoneSig === milestoneSig) return;
    listEl._lastMilestoneSig = milestoneSig;

    if (!milestones.length) {
      listEl.innerHTML = `
        <div class="home-milestone-goal">
          <p class="home-milestone-goal-title">下一個目標：完成第一個分鏡</p>
          <p class="home-milestone-goal-desc">點擊「立刻創建分鏡」，寫下你的第一個故事鏡頭。</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = milestones.map(item => `
      <div class="home-milestone-item">
        <span class="home-milestone-icon">${milestoneIconSvg(item.icon)}</span>
        <div class="home-activity-info">
          <span class="home-activity-title">${escapeHtml(item.title)}</span>
          <span class="home-activity-meta">${escapeHtml(item.meta)}</span>
        </div>
      </div>
    `).join('');
  }

  function renderTopTemplates(root, templates, navigate, failed = false) {
    const grid = (root ? root.querySelector('#home-top-templates-grid') : null) || document.getElementById('home-top-templates-grid');
    if (!grid) return;

    if (failed) {
      grid.innerHTML = '<div class="home-templates-empty">暫時無法載入熱門模板，請稍後再試。</div>';
      return;
    }

    const list = Array.isArray(templates) ? templates.slice(0, 4) : [];
    if (!list.length) {
      grid.innerHTML = '<div class="home-templates-empty">目前尚無可顯示的模板。</div>';
      return;
    }

    grid.innerHTML = list.map(t => {
      const presented = global.TemplatePresentation?.present ? global.TemplatePresentation.present(t) : null;
      const title = presented?.title || t.name || t.title || '精選敘事模板';
      const catKey = ['product', 'story', 'twist'].includes(t.category || t.type) ? (t.category || t.type) : 'custom';
      const catLabel = t.categoryLabel || TEMPLATE_CAT_MAP[catKey] || '精選模板';
      const duration = global.TemplatePresentation?.durationOf ? global.TemplatePresentation.durationOf(t) : (t.duration || null);
      const shotCount = global.TemplatePresentation?.shotCountOf ? global.TemplatePresentation.shotCountOf(t) : (t.structureCount || (Array.isArray(t.structure) ? t.structure.length : null));
      const source = t.videoUrl || t.source?.url || '';
      const videoId = t.source?.videoId || t.videoId || (typeof source === 'string' ? source.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/)?.[1] : '');
      const thumb = safeMediaUrl(t.thumbnail || t.cover || t.source?.thumbnail || (videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : ''));
      const metaParts = [duration !== null ? `${duration} 秒` : '', shotCount !== null ? `${shotCount} 節點` : ''].filter(Boolean);

      return `
        <a class="home-template-card" href="/template/${encodeURIComponent(t.id)}" data-template-id="${escapeHtml(t.id)}">
          <div class="home-template-cover${thumb ? '' : ' no-cover'}">
            ${thumb ? `<img src="${escapeHtml(thumb)}" alt="${escapeHtml(title)}" loading="lazy">` : '<span class="home-template-placeholder">模板預覽</span>'}
            <span class="home-template-cat">${escapeHtml(catLabel)}</span>
          </div>
          <div class="home-template-body">
            <h3 class="home-template-title">${escapeHtml(title)}</h3>
            <p class="home-template-meta">${escapeHtml(metaParts.join(' · ') || '敘事結構模板')}</p>
          </div>
        </a>
      `;
    }).join('');

    grid.querySelectorAll('.home-template-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        const tid = card.dataset.templateId;
        if (tid) navigate('template', { templateId: tid });
      });
      const img = card.querySelector('img');
      if (img) {
        img.addEventListener('error', () => {
          img.parentElement?.classList.add('no-cover');
          img.replaceWith(Object.assign(document.createElement('span'), { className: 'home-template-placeholder', textContent: '模板預覽' }));
        }, { once: true });
      }
    });
  }

  function updateGreeting(root) {
    const greetingEl = (root ? root.querySelector('#home-greeting-text') : null) || document.getElementById('home-greeting-text');
    if (!greetingEl) return;
    const hour = new Date().getHours();
    let timeGreet = '晚上好';
    if (hour >= 5 && hour < 11) timeGreet = '早安';
    else if (hour >= 11 && hour < 14) timeGreet = '午安';
    else if (hour >= 14 && hour < 18) timeGreet = '下午好';
    greetingEl.textContent = `${timeGreet}，今天想繼續哪個創作？`;
  }

  function bindQuickActionEvents(root, navFn) {
    const el = (id) => (root ? root.querySelector(`#${id}`) : null) || document.getElementById(id);

    // Hero Create & Explore
    const createBtn = el('hero-create-btn');
    if (createBtn) {
      createBtn.onclick = (e) => {
        e.preventDefault();
        if (global.AICreationController) global.AICreationController.openQuickCompose();
        else navFn('generate');
      };
    }

    const exploreBtn = el('hero-explore-btn');
    if (exploreBtn) {
      exploreBtn.onclick = (e) => {
        e.preventDefault();
        navFn('discovery');
      };
    }

    // Section Header Links
    const viewAllProjects = el('home-view-all-projects');
    if (viewAllProjects) {
      viewAllProjects.onclick = (e) => {
        if (e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navFn('projects');
      };
    }

    const viewAllTemplates = el('home-view-all-templates');
    if (viewAllTemplates) {
      viewAllTemplates.onclick = (e) => {
        if (e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navFn('template');
      };
    }

    // Desktop Quick Actions (快速入口)
    const qaScript = el('qa-script-analysis');
    if (qaScript) {
      qaScript.onclick = (e) => {
        e.preventDefault();
        if (global.AICreationController) global.AICreationController.openQuickCompose();
        else navFn('generate', { targetPhase: 1 });
      };
    }

    const qaProjects = el('qa-projects');
    if (qaProjects) {
      qaProjects.onclick = (e) => {
        e.preventDefault();
        navFn('projects');
      };
    }

    const qaTemplate = el('qa-template-hook');
    if (qaTemplate) {
      qaTemplate.onclick = (e) => {
        e.preventDefault();
        navFn('template');
      };
    }

    const qaDiscovery = el('qa-discovery-search');
    if (qaDiscovery) {
      qaDiscovery.onclick = (e) => {
        e.preventDefault();
        navFn('discovery');
      };
    }

    const qaHistory = el('qa-history');
    if (qaHistory) {
      qaHistory.onclick = (e) => {
        e.preventDefault();
        navFn('history');
      };
    }

    const quickEntryContainer = (root ? root.querySelector('.home-quick-entry-buttons') : null) || document.querySelector('.home-quick-entry-buttons');
    if (quickEntryContainer && typeof quickEntryContainer.querySelectorAll === 'function') {
      quickEntryContainer.querySelectorAll('.quick-entry-btn').forEach(btn => {
        btn.onmouseenter = () => {
          const fillSvg = btn.querySelector?.('.quick-entry-icon-fill[data-im-icon]');
          if (fillSvg && global.IconMotion && typeof global.IconMotion.play === 'function') {
            global.IconMotion.play(fillSvg);
          }
        };
      });
    }

    // Mobile shortcut buttons (first 4 links matching 快速入口)
    const mobCreate = el('mob-shortcut-create');
    if (mobCreate) {
      mobCreate.onclick = (e) => {
        e.preventDefault();
        if (global.AICreationController) global.AICreationController.openQuickCompose();
        else navFn('generate');
      };
    }

    const mobProjects = el('mob-shortcut-projects');
    if (mobProjects) {
      mobProjects.onclick = (e) => {
        e.preventDefault();
        navFn('projects');
      };
    }

    const mobHistory = el('mob-shortcut-history');
    if (mobHistory) {
      mobHistory.onclick = (e) => {
        e.preventDefault();
        navFn('history');
      };
    }

    const mobTemplate = el('mob-shortcut-template');
    if (mobTemplate) {
      mobTemplate.onclick = (e) => {
        e.preventDefault();
        navFn('template');
      };
    }

    const mobShortcutContainer = (root ? root.querySelector('.mobile-quick-actions') : null) || document.querySelector('.mobile-quick-actions');
    if (mobShortcutContainer && typeof mobShortcutContainer.querySelectorAll === 'function') {
      mobShortcutContainer.querySelectorAll('.mob-shortcut-btn').forEach(btn => {
        let touchTimer = null;
        const triggerTouchMotion = () => {
          btn.classList?.add('is-touched');
          const fillSvg = btn.querySelector?.('.quick-entry-icon-fill[data-im-icon]');
          if (fillSvg && global.IconMotion && typeof global.IconMotion.play === 'function') {
            global.IconMotion.play(fillSvg);
          }
          if (touchTimer) clearTimeout(touchTimer);
          touchTimer = setTimeout(() => {
            btn.classList?.remove('is-touched');
          }, 520);
        };
        if (typeof btn.addEventListener === 'function') {
          btn.addEventListener('pointerdown', triggerTouchMotion, { passive: true });
          btn.addEventListener('touchstart', triggerTouchMotion, { passive: true });
        }
      });
    }

    // Notification & Avatar
    const notifyBtn = el('home-notify-btn');
    if (notifyBtn) {
      notifyBtn.onclick = () => {
        if (typeof global.showSpaToast === 'function') {
          global.showSpaToast('目前暫無新通知');
        }
      };
    }

    const homeAvatar = el('home-account-trigger');
    if (homeAvatar) {
      homeAvatar.onclick = (e) => {
        e.stopPropagation();
        if (typeof global.toggleUserPanel === 'function') {
          global.toggleUserPanel();
        }
      };
    }
  }

  async function mount(context = {}) {
    const { root, signal, navigate } = context;
    let isMounted = true;

    const navFn = typeof navigate === 'function' ? navigate : (p, o) => {
      if (typeof global.spaNavigate === 'function') global.spaNavigate(p, o);
    };

    // 1. 問候語與頁面特定事件綁定
    updateGreeting(root);
    bindQuickActionEvents(root, navFn);

    // 2. 使用者資訊資料來源呈現 (非阻塞)
    if (global.spaAuth && typeof global.spaAuth.isLoggedIn === 'function' && global.spaAuth.isLoggedIn()) {
      if (typeof global.spaAuth.fetchUser === 'function') {
        global.spaAuth.fetchUser(signal).then(result => {
          if (!isMounted) return;
          if (result && result.user) {
            const nameEl = (root ? root.querySelector('#home-user-name') : null) || document.getElementById('home-user-name');
            if (nameEl) nameEl.textContent = result.user.name || '創作者';
          }
        }).catch(() => {});
      }
    }

    // 3. 最近分鏡區塊 (Recent Projects) SWR 讀取 + 單一資料提交通道
    const recentProjectsGrid = (root ? root.querySelector('#recent-projects-grid') : null) || document.getElementById('recent-projects-grid');
    let hasCommittedProjects = false;

    function updateRecentView() {
      if (!isMounted || !recentProjectsGrid) return;
      const list = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
        ? global.ProjectStore.getProjects()
        : null;

      renderHero(root, list, navFn);
      renderActivityRail(root, list, navFn);
      if (!list) {
        const state = recentCardStates.get(recentProjectsGrid);
        if (state) {
          state.forEach(entry => global.ProjectCardInteractions?.unbind?.(entry.card));
          state.clear();
        }
        recentProjectsGrid.innerHTML = SKELETON_RECENT_CARDS_HTML;
        return;
      }

      hasCommittedProjects = true;
      const recentProjects = getRecentProjects(list);
      renderRecentProjectsList(recentProjectsGrid, recentProjects, () => {
        updateRecentView();
        if (typeof global.updateSidebarProjects === 'function') {
          global.updateSidebarProjects();
        }
      });
    }

    // 4. 先訂閱 ProjectStore (僅監聽 list 與 session 範圍，忽略無關的 detail prefetch/load)
    let unsubscribeStore = null;
    if (global.ProjectStore && typeof global.ProjectStore.subscribe === 'function') {
      unsubscribeStore = global.ProjectStore.subscribe((projects, event) => {
        if (!isMounted) return;
        if (event && event.scope === 'detail') return;
        if (event && event.type === 'detail_prefetched') return;
        if (event && event.changed === false && hasCommittedProjects) return;
        updateRecentView();
      }, { scopes: ['list', 'session'], ignorePrefetch: true });
    }

    if (recentProjectsGrid) {
      const cached = global.ProjectStore && typeof global.ProjectStore.getProjects === 'function'
        ? global.ProjectStore.getProjects()
        : null;

      if (cached) {
        updateRecentView();
        if (global.ProjectStore && typeof global.ProjectStore.fetchProjects === 'function') {
          global.ProjectStore.fetchProjects({ signal, force: false }).catch(() => {});
        }
      } else {
        renderHero(root, null, navFn);
        recentProjectsGrid.innerHTML = SKELETON_RECENT_CARDS_HTML;
        if (global.ProjectStore && typeof global.ProjectStore.fetchProjects === 'function') {
          global.ProjectStore.fetchProjects({ signal, force: false })
            .then((resolved) => {
              // 若 fetchProjects 期間 Store 已透過 subscription 提交則不重複渲染
              if (isMounted && !hasCommittedProjects && Array.isArray(resolved) && global.ProjectStore.getProjects()) {
                updateRecentView();
              }
            })
            .catch(() => {
              if (isMounted && !global.ProjectStore.getProjects()) {
                renderHero(root, null, navFn, true);
                renderEmptyRecentState(recentProjectsGrid, () => {
                  if (global.AICreationController) global.AICreationController.openQuickCompose();
                  else navFn('generate');
                });
                const title = recentProjectsGrid.querySelector('.home-empty-title');
                const description = recentProjectsGrid.querySelector('.home-empty-desc');
                if (title) title.textContent = '暫時無法載入最近分鏡';
                if (description) description.textContent = '請稍後再試。你仍可用 QC 記下創作想法。';
              }
            });
        }
      }
    }

    // 4.5 熱門模板 (Top Collection - Single Row)
    const templatesGrid = (root ? root.querySelector('#home-top-templates-grid') : null) || document.getElementById('home-top-templates-grid');
    if (templatesGrid) {
      const loadTemplates = global.PageAssetLoader?.fetchTemplateIndex || global.PageAssetLoader?.fetchTemplates;
      if (typeof loadTemplates === 'function') {
        loadTemplates(signal)
          .then(items => {
            if (isMounted) renderTopTemplates(root, items, navFn);
          })
          .catch(() => {
            if (isMounted) renderTopTemplates(root, [], navFn, true);
          });
      } else if (typeof fetch === 'function') {
        fetch('/api/get-templates?view=index&limit=4', { signal })
          .then(res => (res.ok ? res.json() : Promise.reject(new Error('Failed'))))
          .then(data => {
            const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
            if (isMounted) renderTopTemplates(root, items, navFn);
          })
          .catch(() => {
            if (isMounted) renderTopTemplates(root, [], navFn, true);
          });
      }
    }

    // 4.6 Hero 橫向封面與左側按鈕寬度自適應監聽
    let heroResizeObserver = null;
    const heroCardEl = (root ? root.querySelector('#home-hero-card') : null) || document.getElementById('home-hero-card');
    const heroFramesEl = (root ? root.querySelector('#workspace-hero-frames') : null) || document.getElementById('workspace-hero-frames');
    if (heroCardEl && heroFramesEl && typeof global.ResizeObserver === 'function') {
      heroResizeObserver = new global.ResizeObserver(() => {
        if (isMounted) syncLandscapeHeroWidth(heroCardEl, heroFramesEl);
      });
      heroResizeObserver.observe(heroCardEl);
    }

    // 5. 接入 Dynamic Gradient Mask (垂直內容身與水平最近專案 Viewport)
    const contentBody = (root ? root.querySelector('.home-body') : null) || document.querySelector('.home-body') || document.querySelector('.content-body');
    if (contentBody && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.attach === 'function') {
      global.DynamicMaskSystem.attach(contentBody, { maskSize: 36, direction: 'vertical' });
    }

    const recentViewport = (root ? root.querySelector('#home-recent-viewport') : null) || document.getElementById('home-recent-viewport');
    if (recentViewport && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.attach === 'function') {
      global.DynamicMaskSystem.attach(recentViewport, { maskSize: 28, direction: 'horizontal' });
    }

    // 6. 生命週期卸載契約 (Unmount Contract)
    function unmount() {
      if (!isMounted) return;
      isMounted = false;
      const resume = root?.querySelector('#workspace-hero-resume');
      if (resume) resume.onclick = null;
      if (signal) {
        signal.removeEventListener('abort', unmount);
      }
      if (heroResizeObserver) {
        heroResizeObserver.disconnect();
        heroResizeObserver = null;
      }
      if (unsubscribeStore) {
        unsubscribeStore();
        unsubscribeStore = null;
      }
      if (recentProjectsGrid) {
        const state = recentCardStates.get(recentProjectsGrid);
        if (state) {
          state.forEach(entry => global.ProjectCardInteractions?.unbind?.(entry.card));
          state.clear();
          recentCardStates.delete(recentProjectsGrid);
        }
        global.ProjectCardInteractions?.destroyWithin?.(recentProjectsGrid);
      }
      if (contentBody && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.detach === 'function') {
        global.DynamicMaskSystem.detach(contentBody);
      }
      if (recentViewport && global.DynamicMaskSystem && typeof global.DynamicMaskSystem.detach === 'function') {
        global.DynamicMaskSystem.detach(recentViewport);
      }
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

  const DashboardPage = {
    mount,
    getRecentProjects,
    buildHeroModel,
    renderRecentProjectsList,
    renderEmptyRecentState,
    updateGreeting
  };

  if (typeof global !== 'undefined') {
    global.DashboardPage = DashboardPage;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardPage;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
