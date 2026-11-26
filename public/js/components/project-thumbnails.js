(function () {
  'use strict';
  const pending = new WeakMap();
  const containerObservers = new WeakMap();
  const MAX_CONCURRENT_LOADS = 4;
  let activeLoads = 0;
  const loadQueue = [];
  let motionHooked = false;

  function ensureMotionHook() {
    if (motionHooked || !window.MotionCoordinator?.subscribe) return;
    motionHooked = true;
    window.MotionCoordinator.subscribe((summary) => {
      if (summary && summary.count === 0 && loadQueue.length > 0) {
        drainQueue();
      }
    });
  }

  function drainQueue() {
    ensureMotionHook();
    while (activeLoads < MAX_CONCURRENT_LOADS && loadQueue.length > 0) {
      if (window.MotionCoordinator?.isActive?.() && activeLoads > 0) break;
      const task = loadQueue.shift();
      if (!task.valid()) continue;
      activeLoads++;
      task.start(() => {
        activeLoads = Math.max(0, activeLoads - 1);
        drainQueue();
      });
    }
  }

  function loadThumbElement(thumb, container) {
    const src = thumb.dataset?.src;
    if (!src || thumb.querySelector('.lazy-thumb')) return;
    if (pending.get(thumb)?.src === src) return;
    const ticket = { src };
    pending.set(thumb, ticket);
    const valid = () => thumb.isConnected && container.contains(thumb) && thumb.dataset.src === src && pending.get(thumb) === ticket;

    loadQueue.push({
      valid,
      start(done) {
        if (!valid()) {
          if (pending.get(thumb) === ticket) pending.delete(thumb);
          done();
          return;
        }
        const img = new Image();
        img.decoding = 'async';
        let settled = false;
        const finishLoad = () => {
          if (settled) return;
          settled = true;
          done();
        };

        img.onload = async () => {
          if (!valid()) {
            if (pending.get(thumb) === ticket) pending.delete(thumb);
            finishLoad();
            return;
          }
          if (typeof img.decode === 'function') {
            try { await img.decode(); } catch (_) {}
          }
          if (!valid()) {
            if (pending.get(thumb) === ticket) pending.delete(thumb);
            finishLoad();
            return;
          }
          const fallback = thumb.querySelector('.thumb-fallback');
          if (fallback) fallback.style.display = 'none';

          const projectRatioAttr = thumb.dataset.trueRatio || thumb.dataset.ratio || thumb.closest('.project-folder-preview-stack')?.dataset.ratio;
          const targetRatio = projectRatioAttr
            ? window.ProjectCard.parseAspectRatio(projectRatioAttr)
            : (img.naturalWidth && img.naturalHeight ? (img.naturalWidth / img.naturalHeight) : (16 / 9));

          thumb.dataset.trueRatio = targetRatio;

          const isFolderPrimary = thumb.classList.contains('project-preview-primary');
          const badges = thumb.querySelector('.thumb-overlay-badges');

          if (isFolderPrimary) {
            const isContain = targetRatio < (16 / 9) - 0.01;
            let bgImg = null;

            if (isContain) {
              thumb.classList.add('has-contain-preview');
              bgImg = new Image();
              bgImg.decoding = 'async';
              bgImg.className = 'project-preview-primary-bg cover-background';
              bgImg.alt = '';
              bgImg.src = img.src;
              bgImg.style.opacity = '0';
              if (badges) thumb.insertBefore(bgImg, badges);
              else thumb.appendChild(bgImg);
            } else {
              thumb.classList.remove('has-contain-preview');
            }

            img.className = `lazy-thumb project-preview-primary-image cover-main ${isContain ? 'fit-contain' : 'fit-cover'}`;
            img.alt = 'Cover';
            img.style.opacity = '0';
            if (badges) thumb.insertBefore(img, badges);
            else thumb.appendChild(img);

            requestAnimationFrame(() => {
              if (!valid()) return;
              if (bgImg) bgImg.style.opacity = '';
              img.style.opacity = '1';
              thumb.classList.remove('loading');
            });
          } else {
            img.className = 'lazy-thumb';
            img.alt = 'Cover';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.opacity = '0';
            img.style.transition = 'opacity 0.45s ease-in-out, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
            if (badges) thumb.insertBefore(img, badges);
            else thumb.appendChild(img);

            requestAnimationFrame(() => {
              if (!valid()) return;
              img.style.opacity = '1';
              thumb.classList.remove('loading');
            });
          }
          finishLoad();
        };

        img.onerror = () => {
          if (!valid()) {
            if (pending.get(thumb) === ticket) pending.delete(thumb);
            finishLoad();
            return;
          }
          thumb.classList.remove('loading');
          finishLoad();
        };

        img.src = src.startsWith('/api/') ? src : `/api/projects/${src}/cover`;
      }
    });
    drainQueue();
  }

  function lazyLoadProjectThumbs(container) {
    if (!container) return;
    const thumbs = container.querySelectorAll('.project-thumb.loading');
    if (!thumbs || !thumbs.length) return;

    if (typeof window.IntersectionObserver === 'function' && container.isConnected) {
      let io = containerObservers.get(container);
      if (!io) {
        io = new window.IntersectionObserver((entries) => {
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            if (entry.isIntersecting) {
              io.unobserve(entry.target);
              loadThumbElement(entry.target, container);
            }
          }
        }, { rootMargin: '240px 0px' });
        containerObservers.set(container, io);
      }
      thumbs.forEach(thumb => {
        if (!thumb.dataset?.src || thumb.querySelector('.lazy-thumb')) return;
        io.observe(thumb);
      });
    } else {
      thumbs.forEach(thumb => loadThumbElement(thumb, container));
    }
  }

  window.lazyLoadProjectThumbs = lazyLoadProjectThumbs;
})();
