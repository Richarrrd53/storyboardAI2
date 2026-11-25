/**
 * StoryboardAI Motion Coordinator (Phase 6 & Phase 10 Foundation)
 *
 * Event-driven, zero-idle-RAF coordination layer for major UI animations.
 * Does NOT replace GSAP, WAAPI, SurfaceMorph, or CSS transitions.
 *
 * Responsibilities:
 * - Token/Handle lifecycle tracking for concurrent animations (begin / end / cancel)
 * - Priority resolution for DynamicMaskSystem motion modes ('defer' > 'coalesce' > 'normal')
 * - Pausing non-essential ambient decorative motion during major interactions
 * - On-demand Read/Write Frame Scheduler (event-driven, zero idle polling)
 * - Sample-based adaptive quality tier with hysteresis (no continuous FPS RAF)
 */
(function (root) {
  'use strict';
  if (root.MotionCoordinator) return;

  const MASK_PRIORITY = { normal: 0, coalesce: 1, defer: 2 };
  const DEFAULT_POLICY = {
    morph: { maskMode: 'defer', pauseDecor: true },
    dialog: { maskMode: 'defer', pauseDecor: true },
    cover: { maskMode: 'defer', pauseDecor: true },
    sidebar: { maskMode: 'coalesce', pauseDecor: true },
    navigation: { maskMode: 'defer', pauseDecor: true },
    'bottom-nav': { maskMode: 'coalesce', pauseDecor: false },
    header: { maskMode: 'normal', pauseDecor: false }
  };

  let tokenSeq = 0;
  const activeTokens = new Map();
  const subscribers = new Set();
  const participants = new Map();

  let currentMaskMode = 'normal';
  let currentPauseDecor = false;

  // On-demand Read/Write Frame Scheduler (strictly event-driven, no idle RAF)
  const readQueue = [];
  const writeQueue = [];
  let flushRafId = null;

  function flushFrame() {
    flushRafId = null;
    const reads = readQueue.splice(0);
    for (let i = 0; i < reads.length; i++) {
      try { reads[i](); } catch (_) {}
    }
    const writes = writeQueue.splice(0);
    for (let i = 0; i < writes.length; i++) {
      try { writes[i](); } catch (_) {}
    }
    if (readQueue.length || writeQueue.length) {
      scheduleFlush();
    }
  }

  function scheduleFlush() {
    if (flushRafId !== null || typeof root.requestAnimationFrame !== 'function') return;
    flushRafId = root.requestAnimationFrame(flushFrame);
  }

  // Adaptive quality state (sample-based with hysteresis; never switches mid-animation)
  let qualityTier = 'full'; // 'full' | 'balanced' | 'lightweight'
  const recentAvgFrameSamples = [];
  const MAX_SAMPLES = 6;
  let consecutiveSlowAnimations = 0;
  let consecutiveFastAnimations = 0;

  function reconcile() {
    let bestMode = 'normal';
    let bestPrio = 0;
    let pauseDecor = false;

    activeTokens.forEach((entry) => {
      const prio = MASK_PRIORITY[entry.maskMode] || 0;
      if (prio > bestPrio) {
        bestPrio = prio;
        bestMode = entry.maskMode;
      }
      if (entry.pauseDecor) pauseDecor = true;
    });

    const maskChanged = bestMode !== currentMaskMode;
    const decorChanged = pauseDecor !== currentPauseDecor;
    currentMaskMode = bestMode;
    currentPauseDecor = pauseDecor;

    if (maskChanged) {
      root.DynamicMaskSystem?.setMotionMode?.(currentMaskMode);
    }

    if (decorChanged && typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('motion-coordinating', currentPauseDecor);
    }

    if (maskChanged || decorChanged) {
      const snapshot = getActiveSummary();
      subscribers.forEach((fn) => {
        try { fn(snapshot); } catch (_) {}
      });
      participants.forEach((p) => {
        try { p.onStateChange?.(snapshot); } catch (_) {}
      });
    }
  }

  function endToken(token, reason = 'end') {
    const entry = activeTokens.get(token);
    if (!entry) return false;
    if (entry.timer !== null) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    activeTokens.delete(token);
    try { entry.onEnd?.(reason); } catch (_) {}
    reconcile();
    return true;
  }

  function begin(type, opts = {}) {
    const policy = DEFAULT_POLICY[type] || { maskMode: 'normal', pauseDecor: false };
    const token = `mc-${++tokenSeq}`;
    const maskMode = opts.maskMode || policy.maskMode;
    const pauseDecor = opts.pauseDecor !== undefined ? Boolean(opts.pauseDecor) : policy.pauseDecor;
    const entry = {
      token,
      type: String(type || 'generic'),
      maskMode,
      pauseDecor,
      startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      onEnd: typeof opts.onEnd === 'function' ? opts.onEnd : null,
      timer: null
    };

    if (opts.timeoutMs > 0) {
      entry.timer = setTimeout(() => endToken(token, 'timeout'), opts.timeoutMs);
    }

    activeTokens.set(token, entry);
    reconcile();

    return {
      token,
      type: entry.type,
      end: () => endToken(token, 'end'),
      cancel: (reason = 'cancel') => endToken(token, reason),
      isActive: () => activeTokens.has(token)
    };
  }

  function isActive(type) {
    if (!type) return activeTokens.size > 0;
    for (const entry of activeTokens.values()) {
      if (entry.type === type) return true;
    }
    return false;
  }

  function cancelCategory(type, reason = 'cancel') {
    const matching = [];
    activeTokens.forEach((entry, token) => {
      if (!type || entry.type === type) matching.push(token);
    });
    matching.forEach((token) => endToken(token, reason));
  }

  function getActiveSummary() {
    const types = [];
    activeTokens.forEach((entry) => types.push(entry.type));
    return {
      count: activeTokens.size,
      types,
      maskMode: currentMaskMode,
      pauseDecor: currentPauseDecor,
      qualityTier
    };
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  function registerParticipant(id, participant) {
    if (!id || !participant) return () => {};
    participants.set(id, participant);
    return () => release(id);
  }

  function release(id) {
    participants.delete(id);
  }

  function recordAnimationSample(avgFrameMs, isFirstInit = false) {
    if (isFirstInit || !Number.isFinite(avgFrameMs) || avgFrameMs <= 0) return qualityTier;
    recentAvgFrameSamples.push(avgFrameMs);
    if (recentAvgFrameSamples.length > MAX_SAMPLES) recentAvgFrameSamples.shift();

    if (avgFrameMs > 36) {
      consecutiveSlowAnimations++;
      consecutiveFastAnimations = 0;
    } else if (avgFrameMs < 20) {
      consecutiveFastAnimations++;
      consecutiveSlowAnimations = 0;
    } else {
      consecutiveSlowAnimations = 0;
      consecutiveFastAnimations = 0;
    }

    // Hysteresis: require 3 consecutive slow animations to step down, 4 consecutive fast to step up
    if (consecutiveSlowAnimations >= 3) {
      if (qualityTier === 'full') qualityTier = 'balanced';
      else if (qualityTier === 'balanced' && avgFrameMs > 55) qualityTier = 'lightweight';
      consecutiveSlowAnimations = 0;
    } else if (consecutiveFastAnimations >= 4) {
      if (qualityTier === 'lightweight') qualityTier = 'balanced';
      else if (qualityTier === 'balanced') qualityTier = 'full';
      consecutiveFastAnimations = 0;
    }
    return qualityTier;
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && activeTokens.size > 0) {
        cancelCategory(null, 'hidden');
      }
    });
  }

  const MotionCoordinator = {
    begin,
    end: (handleOrToken) => endToken(typeof handleOrToken === 'string' ? handleOrToken : handleOrToken?.token, 'end'),
    cancel: (handleOrToken, reason = 'cancel') => endToken(typeof handleOrToken === 'string' ? handleOrToken : handleOrToken?.token, reason),
    cancelCategory,
    isActive,
    getActiveSummary,
    subscribe,
    registerParticipant,
    release,
    scheduleRead(fn) {
      if (typeof fn !== 'function') return;
      readQueue.push(fn);
      scheduleFlush();
    },
    scheduleWrite(fn) {
      if (typeof fn !== 'function') return;
      writeQueue.push(fn);
      scheduleFlush();
    },
    recordAnimationSample,
    getQualityTier: () => qualityTier
  };

  root.MotionCoordinator = MotionCoordinator;
  if (typeof module !== 'undefined' && module.exports) module.exports = MotionCoordinator;
})(typeof window !== 'undefined' ? window : globalThis);
