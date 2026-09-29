/**
 * StoryboardAI — 動態漸層遮罩系統 (Dynamic Gradient Mask System)
 * 
 * 核心原理：
 * 透過標準 CSS mask-image / -webkit-mask-image 透明度遮罩 (純透明度漸層，而非覆蓋漸層色塊)
 * 自動根據容器內部內容的滾動溢出狀況，精確動態計算遮罩邊緣：
 * 
 * 1. 滾動到最頂端時：若下方有溢出，只顯示下方遮罩；
 * 2. 滾動到最底端時：若上方有溢出，只顯示最頂遮罩；
 * 3. 滾動至中間時：若上下皆溢出，則上下皆呈現漸層遮罩；
 * 4. 溢出跟隨機制：若溢出高度 <= 遮罩設定高度 (M)，遮罩位移至與溢出齊平 (effectiveMask = min(M, overflow))；
 * 5. 支援垂直 (vertical) 與水平 (horizontal) 容器；
 * 6. 整合為全域系統，支援 data-dynamic-mask 自動綁定，或以 DynamicMaskSystem.attach(el, options) 手動接入。
 */

(function (window, document) {
  'use strict';

  const instances = new Map();

  class DynamicMask {
    constructor(element, options = {}) {
      this.element = element;
      this.options = Object.assign({
        maskSize: 36, // 遮罩預設高度/寬度 (px)
        direction: 'vertical', // 'vertical' | 'horizontal'
        scrollElement: null, // 自訂滾動元素 (若容器本身不滾動但內部滾動)
        fadeExponent: 1.0, // 漸層平滑曲線
        activeClass: 'has-dynamic-mask'
      }, options);

      // 支援從 HTML 屬性覆寫設定
      if (element.dataset) {
        if (element.dataset.maskSize) {
          const s = parseFloat(element.dataset.maskSize);
          if (!isNaN(s)) this.options.maskSize = s;
        }
        if (element.dataset.maskDirection) {
          this.options.direction = element.dataset.maskDirection;
        }
      }

      this.scrollElement = this.resolveScrollElement();
      this.rafId = null;
      this.isUpdating = false;

      this.onScroll = this.onScroll.bind(this);
      this.scheduleUpdate = this.scheduleUpdate.bind(this);

      this.init();
    }

    resolveScrollElement() {
      if (this.options.scrollElement) {
        if (typeof this.options.scrollElement === 'string') {
          return document.querySelector(this.options.scrollElement) || this.element;
        }
        return this.options.scrollElement;
      }
      return this.element;
    }

    init() {
      if (!this.element || !this.scrollElement) return;

      this.element.classList.add(this.options.activeClass);

      // 監聽滾動事件 (使用 passive 以保證最高幀率)
      this.scrollElement.addEventListener('scroll', this.onScroll, { passive: true });

      // 監聽視窗或內部尺寸變化
      if (window.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => {
          this.scheduleUpdate();
        });
        this.resizeObserver.observe(this.element);
        if (this.scrollElement !== this.element) {
          this.resizeObserver.observe(this.scrollElement);
        }
      }

      // 監聽內容變更
      if (window.MutationObserver) {
        this.mutationObserver = new MutationObserver(() => {
          this.scheduleUpdate();
        });
        this.mutationObserver.observe(this.scrollElement, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }

      // 初始立即運算
      this.update();
    }

    onScroll() {
      this.scheduleUpdate();
    }

    scheduleUpdate() {
      if (this.rafId) return;
      this.rafId = window.requestAnimationFrame(() => {
        this.rafId = null;
        this.update();
      });
    }

    update() {
      if (!this.element || !this.scrollElement) return;

      const isVertical = this.options.direction === 'vertical';
      const M = Math.max(1, this.options.maskSize);

      if (isVertical) {
        const scrollTop = this.scrollElement.scrollTop;
        const scrollHeight = this.scrollElement.scrollHeight;
        const clientHeight = this.scrollElement.clientHeight;
        const maxScroll = Math.max(0, scrollHeight - clientHeight);

        // 若無任何溢出 (或小於 1px 誤差)，取消遮罩
        if (maxScroll <= 1) {
          this.clearMask();
          return;
        }

        const overflowTop = Math.max(0, scrollTop);
        const overflowBottom = Math.max(0, maxScroll - scrollTop);

        this.applyVerticalMask(overflowTop, overflowBottom, M);
      } else {
        // 水平方向
        const scrollLeft = this.scrollElement.scrollLeft;
        const scrollWidth = this.scrollElement.scrollWidth;
        const clientWidth = this.scrollElement.clientWidth;
        const maxScrollX = Math.max(0, scrollWidth - clientWidth);

        if (maxScrollX <= 1) {
          this.clearMask();
          return;
        }

        const overflowLeft = Math.max(0, scrollLeft);
        const overflowRight = Math.max(0, maxScrollX - scrollLeft);

        this.applyHorizontalMask(overflowLeft, overflowRight, M);
      }
    }

    applyVerticalMask(overflowTop, overflowBottom, M) {
      const el = this.element;
      const hasTop = overflowTop > 0;
      const hasBottom = overflowBottom > 0;

      if (!hasTop && !hasBottom) {
        this.clearMask();
        return;
      }

      // 上方遮罩位移邏輯：
      // 遮罩高度 M (如 36px)。當上方溢出 0px -> 36px 時，遮罩位移 36px -> 0px。
      // 若溢出 10px，遮罩向上位移 26px，容器頂部 0px 處對應漸層位置 26px ((36-10)/36)。
      let topStops = '';
      let topShift = M;
      if (hasTop) {
        if (overflowTop < M) {
          const shift = M - overflowTop;
          topShift = shift;
          const startAlpha = (shift / M).toFixed(4);
          const hTop = Math.max(1, Math.round(overflowTop));
          topStops = `rgba(0, 0, 0, ${startAlpha}) 0px, black ${hTop}px`;
        } else {
          topShift = 0;
          topStops = `transparent 0px, black ${M}px`;
        }
      } else {
        topStops = 'black 0px';
      }

      // 下方遮罩位移邏輯：
      // 當下方溢出 0px -> 36px 時，遮罩位移 36px -> 0px。
      // 若下方溢出 10px，遮罩向下位移 26px，容器底部 100% 處對應漸層透明度 ((36-10)/36)。
      let bottomStops = '';
      let bottomShift = M;
      if (hasBottom) {
        if (overflowBottom < M) {
          const shift = M - overflowBottom;
          bottomShift = shift;
          const endAlpha = (shift / M).toFixed(4);
          const hBottom = Math.max(1, Math.round(overflowBottom));
          bottomStops = `black calc(100% - ${hBottom}px), rgba(0, 0, 0, ${endAlpha}) 100%`;
        } else {
          bottomShift = 0;
          bottomStops = `black calc(100% - ${M}px), transparent 100%`;
        }
      } else {
        bottomStops = 'black 100%';
      }

      const maskVal = `linear-gradient(to bottom, ${topStops}, ${bottomStops})`;
      el.style.setProperty('-webkit-mask-image', maskVal);
      el.style.setProperty('mask-image', maskVal);
      el.style.setProperty('--mask-top-shift', `${topShift}px`);
      el.style.setProperty('--mask-bottom-shift', `${bottomShift}px`);
    }

    applyHorizontalMask(overflowLeft, overflowRight, M) {
      const el = this.element;
      const hasLeft = overflowLeft > 0;
      const hasRight = overflowRight > 0;

      if (!hasLeft && !hasRight) {
        this.clearMask();
        return;
      }

      let leftStops = '';
      let leftShift = M;
      if (hasLeft) {
        if (overflowLeft < M) {
          const shift = M - overflowLeft;
          leftShift = shift;
          const startAlpha = (shift / M).toFixed(4);
          const wLeft = Math.max(1, Math.round(overflowLeft));
          leftStops = `rgba(0, 0, 0, ${startAlpha}) 0px, black ${wLeft}px`;
        } else {
          leftShift = 0;
          leftStops = `transparent 0px, black ${M}px`;
        }
      } else {
        leftStops = 'black 0px';
      }

      let rightStops = '';
      let rightShift = M;
      if (hasRight) {
        if (overflowRight < M) {
          const shift = M - overflowRight;
          rightShift = shift;
          const endAlpha = (shift / M).toFixed(4);
          const wRight = Math.max(1, Math.round(overflowRight));
          rightStops = `black calc(100% - ${wRight}px), rgba(0, 0, 0, ${endAlpha}) 100%`;
        } else {
          rightShift = 0;
          rightStops = `black calc(100% - ${M}px), transparent 100%`;
        }
      } else {
        rightStops = 'black 100%';
      }

      const maskVal = `linear-gradient(to right, ${leftStops}, ${rightStops})`;
      el.style.setProperty('-webkit-mask-image', maskVal);
      el.style.setProperty('mask-image', maskVal);
      el.style.setProperty('--mask-left-shift', `${leftShift}px`);
      el.style.setProperty('--mask-right-shift', `${rightShift}px`);
    }

    clearMask() {
      const el = this.element;
      el.style.removeProperty('-webkit-mask-image');
      el.style.removeProperty('mask-image');
      el.style.removeProperty('--mask-top-shift');
      el.style.removeProperty('--mask-bottom-shift');
      el.style.removeProperty('--mask-left-shift');
      el.style.removeProperty('--mask-right-shift');
    }

    destroy() {
      if (this.rafId) {
        window.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.scrollElement) {
        this.scrollElement.removeEventListener('scroll', this.onScroll);
      }
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
      this.clearMask();
      if (this.element) {
        this.element.classList.remove(this.options.activeClass);
      }
      instances.delete(this.element);
    }
  }

  // 全域管理器
  const DynamicMaskSystem = {
    attach(element, options = {}) {
      if (!element) return null;
      if (instances.has(element)) {
        const inst = instances.get(element);
        inst.update();
        return inst;
      }
      const instance = new DynamicMask(element, options);
      instances.set(element, instance);
      return instance;
    },

    detach(element) {
      if (!element) return;
      const instance = instances.get(element);
      if (instance) {
        instance.destroy();
      }
    },

    get(element) {
      return instances.get(element) || null;
    },

    update(element) {
      const inst = instances.get(element);
      if (inst) inst.update();
    },

    updateAll() {
      instances.forEach(inst => inst.update());
    },

    /**
     * 自動掃描綁定帶有 [data-dynamic-mask]、.dynamic-gradient-mask 或 .content-body 的容器
     */
    initAuto() {
      const targets = document.querySelectorAll('[data-dynamic-mask], .dynamic-gradient-mask, .content-body');
      targets.forEach(el => {
        if (!instances.has(el)) {
          DynamicMaskSystem.attach(el);
        }
      });
    },

    refresh(root = document) {
      const targets = root.querySelectorAll ? root.querySelectorAll('[data-dynamic-mask], .dynamic-gradient-mask, .content-body') : [];
      targets.forEach(el => {
        let inst = instances.get(el);
        if (!inst) {
          inst = DynamicMaskSystem.attach(el);
        } else {
          inst.scheduleUpdate();
        }
      });
    }
  };

  window.DynamicMaskSystem = DynamicMaskSystem;

  // 自動在 DOM 準備就緒時初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      DynamicMaskSystem.initAuto();
    });
  } else {
    setTimeout(() => {
      DynamicMaskSystem.initAuto();
    }, 10);
  }

  // 視窗 resize 時統一觸發微調
  window.addEventListener('resize', () => {
    DynamicMaskSystem.updateAll();
  }, { passive: true });

})(window, document);
