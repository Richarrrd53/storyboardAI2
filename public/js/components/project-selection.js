/**
 * StoryboardAI — Shared Project Selection Controller
 *
 * 支援 /projects 與 /history 的專案資料夾多選互動：
 * - 桌面版：長按進入選取、Ctrl/Cmd 單選增減、Shift 區間選取、空白處滑鼠框選（含邊界自動捲動）、Escape 退出
 * - 手機版：長按進入選取、按住滑動連續選取（同次拖曳不重複切換）、不干擾正常上下捲動
 * - 狀態以 Project ID 為準，不依賴 DOM 順序；完整清理事件與暫存狀態
 */
(function (global) {
  'use strict';

  const LONG_PRESS_MS = 450;
  const DESKTOP_MOVE_TOLERANCE = 8;
  const TOUCH_MOVE_TOLERANCE = 10;
  const MARQUEE_THRESHOLD = 6;
  const AUTO_SCROLL_EDGE = 44;
  const AUTO_SCROLL_SPEED = 12;

  function rectsIntersect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function isInteractiveTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(target.closest(
      'button, a, input, textarea, select, label, .project-option-btn, .project-tag-pill, .surface-morph-surface, .projects-selection-bar, .projects-toolbar'
    ));
  }

  function create(options = {}) {
    const {
      container,
      scrollContainer = container?.parentElement || container,
      getOrderedIds = () => {
        if (!container?.querySelectorAll) return [];
        return Array.from(container.querySelectorAll('.project-card[data-id]'))
          .map(el => String(el.dataset.id))
          .filter(Boolean);
      },
      onChange = () => {}
    } = options;

    if (!container) {
      return {
        isActive: () => false,
        isSelected: () => false,
        getSelectedIds: () => [],
        select() {},
        deselect() {},
        toggle() {},
        selectAll() {},
        selectRange() {},
        clear() {},
        syncItems() {},
        shouldSuppressCardClick: () => false,
        handleCardClick: () => false,
        destroy() {}
      };
    }

    const doc = container.ownerDocument || global.document;
    const win = doc?.defaultView || global;

    const selected = new Set();
    let active = false;
    let anchorId = null;
    let suppressClickUntil = 0;
    let destroyed = false;

    // Long-press & touch slide-select state
    let pressTimer = null;
    let pressPointerId = null;
    let pressStart = null;
    let pressCardId = null;
    let pressPointerType = 'mouse';
    let longPressTriggered = false;
    let touchDragSelecting = false;
    let dragVisited = new Set();

    // Desktop marquee box selection state
    let marqueeState = null;
    let marqueeEl = null;
    let autoScrollRaf = null;

    function notify() {
      syncDomClasses();
      try {
        onChange({
          active,
          selectedIds: Array.from(selected),
          count: selected.size
        });
      } catch (err) {
        console.error('[ProjectSelectionController] onChange error:', err);
      }
    }

    function syncDomClasses() {
      if (!container?.classList) return;
      container.classList.toggle('is-selection-mode', active);
      const cards = container.querySelectorAll ? container.querySelectorAll('.project-card[data-id]') : [];
      cards.forEach(card => {
        const id = String(card.dataset.id || '');
        const isSel = selected.has(id);
        card.classList.toggle('is-selected', isSel);
        card.setAttribute('aria-selected', isSel ? 'true' : 'false');
      });
    }

    function enterSelectionMode() {
      if (!active) {
        active = true;
      }
    }

    function select(id, { updateAnchor = true } = {}) {
      if (!id) return;
      const key = String(id);
      enterSelectionMode();
      selected.add(key);
      if (updateAnchor) anchorId = key;
      notify();
    }

    function deselect(id) {
      if (!id) return;
      const key = String(id);
      selected.delete(key);
      if (selected.size === 0) {
        active = false;
        anchorId = null;
      }
      notify();
    }

    function toggle(id, { updateAnchor = true } = {}) {
      if (!id) return;
      const key = String(id);
      if (selected.has(key)) {
        deselect(key);
      } else {
        select(key, { updateAnchor });
      }
    }

    function selectAll() {
      const ids = getOrderedIds().map(String).filter(Boolean);
      if (ids.length === 0) return;
      enterSelectionMode();
      ids.forEach(id => selected.add(id));
      anchorId = ids[ids.length - 1];
      notify();
    }

    function selectRange(toId) {
      const targetKey = String(toId || '');
      const ordered = getOrderedIds().map(String).filter(Boolean);
      const targetIdx = ordered.indexOf(targetKey);
      if (targetIdx === -1) return;

      enterSelectionMode();
      const anchorIdx = anchorId ? ordered.indexOf(String(anchorId)) : -1;
      if (anchorIdx === -1) {
        selected.add(targetKey);
        anchorId = targetKey;
        notify();
        return;
      }

      const start = Math.min(anchorIdx, targetIdx);
      const end = Math.max(anchorIdx, targetIdx);
      for (let i = start; i <= end; i++) {
        selected.add(ordered[i]);
      }
      notify();
    }

    function clear() {
      if (!active && selected.size === 0) return;
      selected.clear();
      active = false;
      anchorId = null;
      notify();
    }

    function syncItems(validIds) {
      const validSet = new Set((validIds || getOrderedIds()).map(String));
      let changed = false;
      for (const id of Array.from(selected)) {
        if (!validSet.has(id)) {
          selected.delete(id);
          changed = true;
        }
      }
      if (anchorId && !validSet.has(String(anchorId))) {
        anchorId = selected.size > 0 ? Array.from(selected)[selected.size - 1] : null;
      }
      if (active && selected.size === 0 && changed) {
        active = false;
      }
      syncDomClasses();
      if (changed) {
        try {
          onChange({
            active,
            selectedIds: Array.from(selected),
            count: selected.size
          });
        } catch (err) {
          console.error('[ProjectSelectionController] syncItems onChange error:', err);
        }
      }
    }

    function suppressNextClick(ms = 360) {
      suppressClickUntil = Date.now() + ms;
    }

    function shouldSuppressCardClick() {
      return Date.now() < suppressClickUntil;
    }

    function handleCardClick(id, event) {
      if (!id) return false;
      const key = String(id);
      if (shouldSuppressCardClick()) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
      }

      const isMetaOrCtrl = Boolean(event?.ctrlKey || event?.metaKey);
      const isShift = Boolean(event?.shiftKey);

      if (isShift) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        selectRange(key);
        return true;
      }

      if (isMetaOrCtrl) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        toggle(key);
        return true;
      }

      if (active) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        toggle(key);
        return true;
      }

      return false;
    }

    // ── Long-press & Touch Slide-Select ──
    function clearPressState() {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
      pressPointerId = null;
      pressStart = null;
      pressCardId = null;
      longPressTriggered = false;
      touchDragSelecting = false;
      dragVisited.clear();
    }

    function onCardPointerDown(event) {
      if (destroyed) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!active && isInteractiveTarget(event.target)) return;

      const card = event.target?.closest?.('.project-card[data-id]');
      if (!card || !container.contains(card)) return;
      const cardId = String(card.dataset.id || '');
      if (!cardId) return;

      // Do not start long-press if user is already using modifier keys (handled by click)
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;

      clearPressState();
      pressPointerId = event.pointerId;
      pressPointerType = event.pointerType || 'mouse';
      pressStart = { x: event.clientX, y: event.clientY };
      pressCardId = cardId;

      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (destroyed || !pressCardId) return;
        longPressTriggered = true;
        // Close any open Morph Menu before entering selection mode
        global.ProjectOptionMorph?.close?.('selection');

        enterSelectionMode();
        selected.add(pressCardId);
        anchorId = pressCardId;
        dragVisited = new Set([pressCardId]);
        if (pressPointerType === 'touch') {
          touchDragSelecting = true;
          try { global.navigator?.vibrate?.(12); } catch (_) {}
        }
        suppressNextClick(500);
        notify();
      }, LONG_PRESS_MS);
    }

    function onGlobalPointerMove(event) {
      if (destroyed) return;

      // 1. Touch slide-select active after long press
      if (touchDragSelecting && event.pointerId === pressPointerId) {
        if (doc?.elementFromPoint) {
          const hit = doc.elementFromPoint(event.clientX, event.clientY);
          const card = hit?.closest?.('.project-card[data-id]');
          if (card && container.contains(card)) {
            const id = String(card.dataset.id || '');
            if (id && !dragVisited.has(id)) {
              dragVisited.add(id);
              selected.add(id);
              anchorId = id;
              notify();
            }
          }
        }
        return;
      }

      // 2. When already in selection mode, sliding finger across cards immediately starts continuous slide-select;
      //    outside selection mode, moving finger/mouse cancels pending long-press so normal scrolling works.
      if (pressTimer && event.pointerId === pressPointerId && pressStart) {
        const tolerance = pressPointerType === 'touch' ? TOUCH_MOVE_TOLERANCE : DESKTOP_MOVE_TOLERANCE;
        const dx = Math.abs(event.clientX - pressStart.x);
        const dy = Math.abs(event.clientY - pressStart.y);
        if (dx > tolerance || dy > tolerance) {
          if (active && pressPointerType === 'touch' && pressCardId) {
            clearTimeout(pressTimer);
            pressTimer = null;
            touchDragSelecting = true;
            dragVisited = new Set([pressCardId]);
            if (!selected.has(pressCardId)) {
              selected.add(pressCardId);
              anchorId = pressCardId;
              notify();
            }
            if (doc?.elementFromPoint) {
              const hit = doc.elementFromPoint(event.clientX, event.clientY);
              const card = hit?.closest?.('.project-card[data-id]');
              if (card && container.contains(card)) {
                const id = String(card.dataset.id || '');
                if (id && !dragVisited.has(id)) {
                  dragVisited.add(id);
                  selected.add(id);
                  anchorId = id;
                  notify();
                }
              }
            }
          } else {
            clearPressState();
          }
        }
      }

      // 3. Desktop marquee box selection
      if (marqueeState && event.pointerId === marqueeState.pointerId) {
        marqueeState.currentClientX = event.clientX;
        marqueeState.currentClientY = event.clientY;
        const dx = Math.abs(event.clientX - marqueeState.startClientX);
        const dy = Math.abs(event.clientY - marqueeState.startClientY);
        if (!marqueeState.started && (dx >= MARQUEE_THRESHOLD || dy >= MARQUEE_THRESHOLD)) {
          marqueeState.started = true;
          global.ProjectOptionMorph?.close?.('selection');
          enterSelectionMode();
          ensureMarqueeElement();
          startAutoScrollLoop();
        }
        if (marqueeState.started) {
          updateMarqueeSelection();
        }
      }
    }

    function onTouchMoveGuard(event) {
      // Only block scrolling while actively slide-selecting after a confirmed long press
      if (touchDragSelecting && event.cancelable) {
        event.preventDefault();
      }
    }

    function onGlobalPointerUpOrCancel(event) {
      if (pressPointerId !== null && event.pointerId === pressPointerId) {
        if (longPressTriggered || touchDragSelecting) {
          suppressNextClick(500);
        }
        clearPressState();
      }

      if (marqueeState && event.pointerId === marqueeState.pointerId) {
        const wasStarted = marqueeState.started;
        finishMarquee();
        if (wasStarted) {
          suppressNextClick(350);
        }
      }
    }

    // ── Desktop Marquee Box Selection ──
    function ensureMarqueeElement() {
      if (marqueeEl || !doc?.body) return;
      marqueeEl = doc.createElement('div');
      marqueeEl.className = 'project-selection-marquee';
      marqueeEl.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(marqueeEl);
    }

    function removeMarqueeElement() {
      if (marqueeEl?.parentNode) {
        marqueeEl.parentNode.removeChild(marqueeEl);
      }
      marqueeEl = null;
    }

    function stopAutoScrollLoop() {
      if (autoScrollRaf !== null && typeof win.cancelAnimationFrame === 'function') {
        win.cancelAnimationFrame(autoScrollRaf);
      }
      autoScrollRaf = null;
    }

    function startAutoScrollLoop() {
      if (!scrollContainer || typeof win.requestAnimationFrame !== 'function') return;
      const tick = () => {
        if (!marqueeState || !marqueeState.started || destroyed) {
          autoScrollRaf = null;
          return;
        }
        const hostRect = scrollContainer.getBoundingClientRect();
        const y = marqueeState.currentClientY;
        let deltaY = 0;
        if (y < hostRect.top + AUTO_SCROLL_EDGE) {
          deltaY = -AUTO_SCROLL_SPEED;
        } else if (y > hostRect.bottom - AUTO_SCROLL_EDGE) {
          deltaY = AUTO_SCROLL_SPEED;
        }
        if (deltaY !== 0) {
          const before = scrollContainer.scrollTop;
          scrollContainer.scrollTop += deltaY;
          if (scrollContainer.scrollTop !== before) {
            updateMarqueeSelection();
          }
        }
        autoScrollRaf = win.requestAnimationFrame(tick);
      };
      autoScrollRaf = win.requestAnimationFrame(tick);
    }

    function getMarqueeViewportRect() {
      if (!marqueeState) return null;
      const scrollDeltaX = (scrollContainer?.scrollLeft || 0) - marqueeState.startScrollLeft;
      const scrollDeltaY = (scrollContainer?.scrollTop || 0) - marqueeState.startScrollTop;
      const originX = marqueeState.startClientX - scrollDeltaX;
      const originY = marqueeState.startClientY - scrollDeltaY;
      const curX = marqueeState.currentClientX;
      const curY = marqueeState.currentClientY;

      const left = Math.min(originX, curX);
      const right = Math.max(originX, curX);
      const top = Math.min(originY, curY);
      const bottom = Math.max(originY, curY);
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    }

    function updateMarqueeSelection() {
      const box = getMarqueeViewportRect();
      if (!box) return;

      if (marqueeEl) {
        marqueeEl.style.left = `${Math.round(box.left)}px`;
        marqueeEl.style.top = `${Math.round(box.top)}px`;
        marqueeEl.style.width = `${Math.round(box.width)}px`;
        marqueeEl.style.height = `${Math.round(box.height)}px`;
      }

      const nextSet = new Set(marqueeState.additive ? marqueeState.initialSelected : []);
      const cards = container.querySelectorAll ? container.querySelectorAll('.project-card[data-id]') : [];
      cards.forEach(card => {
        const id = String(card.dataset.id || '');
        if (!id || !card.getBoundingClientRect) return;
        const rect = card.getBoundingClientRect();
        if (rectsIntersect(box, rect)) {
          nextSet.add(id);
        }
      });

      selected.clear();
      nextSet.forEach(id => selected.add(id));
      active = selected.size > 0 || marqueeState.started;
      if (selected.size > 0) {
        anchorId = Array.from(selected)[selected.size - 1];
      }
      notify();
    }

    function finishMarquee() {
      stopAutoScrollLoop();
      removeMarqueeElement();
      const pointerId = marqueeState?.pointerId;
      marqueeState = null;
      if (pointerId !== undefined && scrollContainer?.hasPointerCapture?.(pointerId)) {
        try { scrollContainer.releasePointerCapture(pointerId); } catch (_) {}
      }
      if (selected.size === 0) {
        active = false;
        anchorId = null;
        notify();
      }
    }

    function onBlankAreaPointerDown(event) {
      if (destroyed) return;
      if (event.pointerType === 'touch') return;
      if (event.button !== 0) return;
      if (isInteractiveTarget(event.target)) return;
      if (event.target?.closest?.('.project-card')) return;

      marqueeState = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
        startScrollLeft: scrollContainer?.scrollLeft || 0,
        startScrollTop: scrollContainer?.scrollTop || 0,
        additive: Boolean(event.ctrlKey || event.metaKey || event.shiftKey),
        initialSelected: new Set(selected),
        started: false
      };

      try {
        scrollContainer?.setPointerCapture?.(event.pointerId);
      } catch (_) {}
    }

    function onKeyDown(event) {
      if (destroyed) return;
      if (event.key === 'Escape' && active) {
        event.preventDefault?.();
        clear();
      }
    }

    function onContextMenu(event) {
      if (touchDragSelecting || shouldSuppressCardClick()) {
        event.preventDefault?.();
      }
    }

    // Bind listeners
    container.addEventListener('pointerdown', onCardPointerDown);
    container.addEventListener('contextmenu', onContextMenu);
    if (scrollContainer) {
      scrollContainer.addEventListener('pointerdown', onBlankAreaPointerDown);
    }
    win.addEventListener('pointermove', onGlobalPointerMove);
    win.addEventListener('pointerup', onGlobalPointerUpOrCancel);
    win.addEventListener('pointercancel', onGlobalPointerUpOrCancel);
    win.addEventListener('keydown', onKeyDown);
    if (doc?.addEventListener) {
      doc.addEventListener('touchmove', onTouchMoveGuard, { passive: false });
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      clearPressState();
      stopAutoScrollLoop();
      removeMarqueeElement();
      marqueeState = null;
      selected.clear();
      active = false;
      anchorId = null;

      container.classList?.remove('is-selection-mode');
      container.removeEventListener('pointerdown', onCardPointerDown);
      container.removeEventListener('contextmenu', onContextMenu);
      if (scrollContainer) {
        scrollContainer.removeEventListener('pointerdown', onBlankAreaPointerDown);
      }
      win.removeEventListener('pointermove', onGlobalPointerMove);
      win.removeEventListener('pointerup', onGlobalPointerUpOrCancel);
      win.removeEventListener('pointercancel', onGlobalPointerUpOrCancel);
      win.removeEventListener('keydown', onKeyDown);
      if (doc?.removeEventListener) {
        doc.removeEventListener('touchmove', onTouchMoveGuard);
      }
    }

    return {
      isActive: () => active,
      isSelected: (id) => selected.has(String(id)),
      getSelectedIds: () => Array.from(selected),
      getCount: () => selected.size,
      select,
      deselect,
      toggle,
      selectAll,
      selectRange,
      clear,
      syncItems,
      shouldSuppressCardClick,
      handleCardClick,
      destroy
    };
  }

  const ProjectSelectionController = {
    create,
    rectsIntersect,
    LONG_PRESS_MS
  };

  if (typeof global !== 'undefined') {
    global.ProjectSelectionController = ProjectSelectionController;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectSelectionController;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
