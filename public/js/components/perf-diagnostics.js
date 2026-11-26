/**
 * StoryboardAI — Development-Only Performance Diagnostics (Phase 13)
 *
 * Zero-cost in production: disabled by default unless enabled via:
 * - URL query `?perfDebug=1`
 * - `localStorage.setItem('storyboard_perf_debug', '1')`
 * - `window.PerfDiagnostics.enable()`
 *
 * Strictly on-demand snapshot (no continuous RAF, no DOM scanning, no unbounded logs).
 */
(function (root) {
  'use strict';
  if (root.PerfDiagnostics) return;

  function isEnabled() {
    try {
      if (root.location?.search && root.location.search.includes('perfDebug=1')) return true;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('storyboard_perf_debug') === '1') return true;
    } catch (_) {}
    return Boolean(manualEnabled);
  }

  let manualEnabled = false;

  function getSnapshot() {
    const storeStats = root.ProjectStore?.getCacheStats?.() || null;
    const prefetchStats = root.PageAssetLoader?.getPrefetchStats?.() || null;
    const motionSummary = root.MotionCoordinator?.getActiveSummary?.() || null;
    const navTimings = Array.isArray(root.spaRouter?.navigationTimings)
      ? root.spaRouter.navigationTimings.slice(-10)
      : [];
    const mem = root.performance?.memory
      ? {
          usedJSHeapMB: Math.round((root.performance.memory.usedJSHeapSize / (1024 * 1024)) * 100) / 100,
          totalJSHeapMB: Math.round((root.performance.memory.totalJSHeapSize / (1024 * 1024)) * 100) / 100
        }
      : null;

    return {
      enabled: isEnabled(),
      timestamp: Date.now(),
      route: {
        currentPage: root.spaRouter?.currentPage || null,
        recentNavigations: navTimings
      },
      cache: storeStats,
      prefetch: prefetchStats,
      runtime: {
        motion: motionSummary,
        deferredMotionTasks: root.MotionCoordinator?.getDeferredCount?.() ?? 0,
        modalActive: Boolean(root.OverlayManager?.isModalActive?.()),
        memory: mem
      }
    };
  }

  const PerfDiagnostics = {
    isEnabled,
    enable() {
      manualEnabled = true;
      try { localStorage.setItem('storyboard_perf_debug', '1'); } catch (_) {}
      return getSnapshot();
    },
    disable() {
      manualEnabled = false;
      try { localStorage.removeItem('storyboard_perf_debug'); } catch (_) {}
    },
    getSnapshot,
    print() {
      const snap = getSnapshot();
      if (typeof console !== 'undefined' && typeof console.table === 'function') {
        console.log('[StoryboardAI PerfDiagnostics]', snap);
      }
      return snap;
    }
  };

  root.PerfDiagnostics = PerfDiagnostics;
  if (typeof module !== 'undefined' && module.exports) module.exports = PerfDiagnostics;
})(typeof window !== 'undefined' ? window : globalThis);
