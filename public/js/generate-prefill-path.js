// ── DASHBOARD PRE-FILL PATCH ──
// Add this to the TOP of your generate.js, or as a separate script block
// in generate.html BEFORE generate.js

(function applyDashboardPrefill() {
  const story    = sessionStorage.getItem('sb_story');
  const ratio    = sessionStorage.getItem('sb_ratio');
  const styleIdx = sessionStorage.getItem('sb_styleIdx');
  const skipTo   = sessionStorage.getItem('sb_skipToStep');

  if (!story) return; // No data from dashboard, show normal splash

  // Clear so refresh doesn't re-apply
  sessionStorage.removeItem('sb_story');
  sessionStorage.removeItem('sb_ratio');
  sessionStorage.removeItem('sb_styleIdx');
  sessionStorage.removeItem('sb_skipToStep');

  // Wait for DOM + generate.js state to be ready
  window.addEventListener('DOMContentLoaded', function() {
    // Set story
    if (typeof state !== 'undefined') {
      state.story = story;
      const ta = document.getElementById('story-input');
      if (ta) {
        ta.value = story;
        const cc = document.getElementById('char-count');
        if (cc) cc.textContent = story.length + ' / 500';
      }

      // Set ratio
      if (ratio) {
        state.ratio = ratio;
        // Update UI chip
        document.querySelectorAll('.ratio-chip').forEach(c => {
          c.classList.toggle('active', c.textContent.trim() === ratio);
        });
      }

      // Set style
      if (styleIdx !== null) {
        state.styleIndex = parseInt(styleIdx);
      }
    }

    // Skip directly to confirm modal (story + style + ratio already set from dashboard)
    if (skipTo === '3') {
      // Build style carousel first so state is valid
      if (typeof buildStyleCarousel === 'function') buildStyleCarousel();
      if (typeof updateRatioFrame === 'function') updateRatioFrame();
      // Go directly to confirm
      setTimeout(() => {
        if (typeof openConfirmModal === 'function') {
          showScreen('screen-step3');
          // Give user a moment to see their settings, then auto-open confirm
          setTimeout(() => openConfirmModal(), 400);
        }
      }, 100);
    }
  });
})();