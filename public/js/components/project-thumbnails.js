(function () {
  'use strict';
  const pending = new WeakMap();
  function lazyLoadProjectThumbs(container) {
    if (!container) return;
    const thumbs = container.querySelectorAll('.project-thumb.loading');
    thumbs.forEach(thumb => {
      const src = thumb.dataset.src;
      if (!src || thumb.querySelector('.lazy-thumb')) return;
      if (pending.get(thumb)?.src === src) return;
      const ticket = { src };
      pending.set(thumb, ticket);
      const valid = () => thumb.isConnected && container.contains(thumb) && thumb.dataset.src === src && pending.get(thumb) === ticket;

      const img = new Image();
      img.onload = () => {
        if (!valid()) { if (pending.get(thumb) === ticket) pending.delete(thumb); return; }
        const fallback = thumb.querySelector('.thumb-fallback');
        if (fallback) fallback.style.display = 'none';

        // Maintain project's configured aspect ratio (from data-ratio or p.ratio)
        const projectRatioAttr = thumb.dataset.trueRatio || thumb.dataset.ratio || thumb.closest('.project-folder-preview-stack')?.dataset.ratio;
        const targetRatio = projectRatioAttr ? window.ProjectCard.parseAspectRatio(projectRatioAttr) : (img.naturalWidth && img.naturalHeight ? (img.naturalWidth / img.naturalHeight) : (16 / 9));

        thumb.dataset.trueRatio = targetRatio;

        const isCompact = !!thumb.closest('.variant-compact');
        const isMob = window.AppShell.isMobileView();
        const geom = window.ProjectCard.calculateProjectCoverGeometry({
          aspectRatio: targetRatio,
          variant: isCompact ? 'compact' : 'default',
          isMobile: isMob
        });

        thumb.style.setProperty('--cover-width', `${geom.frame.width}px`);
        thumb.style.setProperty('--cover-height', `${geom.frame.height}px`);
        thumb.style.setProperty('--insert-depth', `${geom.frame.insertDepth}px`);
        thumb.style.setProperty('--collapsed-width', `${geom.collapsed.width}px`);
        thumb.style.setProperty('--collapsed-height', `${geom.collapsed.height}px`);
        thumb.style.setProperty('--collapsed-insert-depth', `${geom.collapsed.insertDepth}px`);
        thumb.style.setProperty('--expanded-width', `${geom.expanded.width}px`);
        thumb.style.setProperty('--expanded-height', `${geom.expanded.height}px`);
        thumb.style.setProperty('--expanded-insert-depth', `${geom.collapsed.insertDepth}px`);
        thumb.style.setProperty('--expanded-x', '0px');
        thumb.style.setProperty('--hover-lift', `${geom.hoverLift}px`);
        thumb.style.setProperty('--hover-rotate', `${geom.hoverRotate}deg`);

        thumb.dataset.collapsedW = geom.collapsed.width;
        thumb.dataset.collapsedH = geom.collapsed.height;
        thumb.dataset.expandedW = geom.expanded.width;
        thumb.dataset.expandedH = geom.expanded.height;
        thumb.dataset.expandedX = 0;
        thumb.dataset.expandedDepth = geom.collapsed.insertDepth;
        thumb.dataset.hoverLift = geom.hoverLift;

        const isFolderPrimary = thumb.classList.contains('project-preview-primary');
        const badges = thumb.querySelector('.thumb-overlay-badges');

        if (isFolderPrimary) {
          // Spec Section 3 & 4:
          // Fixed 16:9 Frame.
          // If targetRatio < 16/9: fit = contain, with blurred background layer!
          // If targetRatio >= 16/9: fit = cover.
          const isContain = targetRatio < (16 / 9) - 0.01;
          let bgImg = null;

          if (isContain) {
            thumb.classList.add('has-contain-preview');
            bgImg = new Image();
            bgImg.className = 'project-preview-primary-bg cover-background';
            bgImg.alt = '';
            bgImg.src = img.src;
            bgImg.style.opacity = '0';
            if (badges) {
              thumb.insertBefore(bgImg, badges);
            } else {
              thumb.appendChild(bgImg);
            }
          } else {
            thumb.classList.remove('has-contain-preview');
          }

          img.className = `lazy-thumb project-preview-primary-image cover-main ${isContain ? 'fit-contain' : 'fit-cover'}`;
          img.alt = 'Cover';
          img.style.opacity = '0';
          if (badges) {
            thumb.insertBefore(img, badges);
          } else {
            thumb.appendChild(img);
          }

          requestAnimationFrame(() => {
            if (!valid()) return;
            if (bgImg) bgImg.style.opacity = '';
            img.style.opacity = '1';
            thumb.classList.remove('loading');
          });
        } else {
          // Legacy non-folder card
          img.className = 'lazy-thumb';
          img.alt = 'Cover';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          img.style.opacity = '0';
          img.style.transition = 'opacity 0.45s ease-in-out, transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
          if (badges) {
            thumb.insertBefore(img, badges);
          } else {
            thumb.appendChild(img);
          }

          requestAnimationFrame(() => {
            if (!valid()) return;
            img.style.opacity = '1';
            thumb.classList.remove('loading');
          });
        }
      };
      img.onerror = () => {
        if (!valid()) { if (pending.get(thumb) === ticket) pending.delete(thumb); return; }
        thumb.classList.remove('loading');
      };
      img.src = src.startsWith('/api/') ? src : `/api/projects/${src}/cover`;
    });
  }

  window.lazyLoadProjectThumbs = lazyLoadProjectThumbs;
})();
