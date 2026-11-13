const ModalAnimation = {
    sessions: new WeakMap(),
    EASING_BACKDROP: 'cubic-bezier(.4,0,.2,1)',
    EASING_CARD_ENTER: 'cubic-bezier(.33,1.53,.69,.99)', // Legacy delete signature.
    EASING_DIALOG_ENTER: 'cubic-bezier(.34,1.59,.69,.99)',
    EASING_BACKDROP_LEAVE: 'cubic-bezier(.8,0,.6,1)',
    EASING_CARD_LEAVE: 'cubic-bezier(.31, .01, .66, -0.59)',
    DURATION: 400,

    cancel(overlay) {
        const timers = this.sessions.get(overlay) || [];
        timers.forEach(clearTimeout);
        this.sessions.delete(overlay);
    },
    schedule(overlay, callback, delay) {
        const timers = this.sessions.get(overlay) || [];
        timers.push(setTimeout(callback, delay));
        this.sessions.set(overlay, timers);
    },

    open(overlay, panel, options = {}) {
        if (!overlay) return;
        this.cancel(overlay);
        const reduced = !options.legacyMotion && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const duration = reduced ? 0 : options.duration || this.DURATION;
        const blur = options.blur || '16px';
        const backdropBg = options.backdropBg || 'rgba(15, 23, 42, 0.45)';

        overlay.style.display = 'flex';
        overlay.style.pointerEvents = 'none';
        overlay.style.transition = `backdrop-filter ${duration}ms ${this.EASING_BACKDROP}, -webkit-backdrop-filter ${duration}ms ${this.EASING_BACKDROP}, background-color ${duration}ms ${this.EASING_BACKDROP}, opacity ${duration}ms ${this.EASING_BACKDROP}`;
        overlay.style.backdropFilter = 'blur(0px)';
        if (overlay.style.webkitBackdropFilter !== undefined) {
            overlay.style.webkitBackdropFilter = 'blur(0px)';
        }
        overlay.style.background = options.legacyMotion ? 'rgba(15, 23, 42, 0)' : backdropBg;
        overlay.style.opacity = options.legacyMotion ? '0' : '1';

        if (panel) {
            const enterEase = options.legacyMotion ? this.EASING_CARD_ENTER : this.EASING_DIALOG_ENTER;
            panel.style.transition = `scale ${duration}ms ${enterEase}${options.legacyMotion ? `, opacity ${duration}ms ${enterEase}` : ''}`;
            panel.style.scale = '0';
            panel.style.opacity = options.legacyMotion ? '0' : '1';
        }

        const reveal = () => {
            if (overlay.classList && typeof overlay.classList.add === 'function') {
                overlay.classList.add('active');
            }
            overlay.style.pointerEvents = 'auto';
            overlay.style.opacity = '1';
            overlay.style.background = backdropBg;
            overlay.style.backdropFilter = `blur(${blur})`;
            if (overlay.style.webkitBackdropFilter !== undefined) {
                overlay.style.webkitBackdropFilter = `blur(${blur})`;
            }
            if (panel) {
                panel.style.scale = '1';
                panel.style.opacity = '1';
            }
            if (typeof options.onOpened === 'function') options.onOpened();
        };
        if (reduced) reveal();
        else this.schedule(overlay, reveal, 10);
    },

    close(overlay, panel, options = {}) {
        if (!overlay) return;
        this.cancel(overlay);
        const reduced = !options.legacyMotion && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const duration = reduced ? 0 : options.duration || this.DURATION;
        const onComplete = typeof options === 'function' ? options : (options.onComplete || null);

        overlay.style.pointerEvents = 'none';

        if (panel) {
            panel.style.transition = `scale ${duration}ms ${this.EASING_CARD_LEAVE}${options.legacyMotion ? `, opacity ${duration}ms ${this.EASING_CARD_LEAVE}` : ''}`;
        }
        const backdropEase = options.legacyMotion ? this.EASING_BACKDROP : this.EASING_BACKDROP_LEAVE;
        overlay.style.transition = `backdrop-filter ${duration}ms ${backdropEase}, -webkit-backdrop-filter ${duration}ms ${backdropEase}${options.legacyMotion ? `, background-color ${duration}ms ${backdropEase}` : ''}`;

        this.schedule(overlay, () => {
            if (panel) {
                panel.style.scale = '0';
                panel.style.opacity = options.legacyMotion ? '0' : '1';
            }
            overlay.style.backdropFilter = 'blur(0px)';
            if (overlay.style.webkitBackdropFilter !== undefined) {
                overlay.style.webkitBackdropFilter = 'blur(0px)';
            }
            if (options.legacyMotion && options.fadeBackdrop === true) overlay.style.background = 'rgba(15, 23, 42, 0)';
            if (overlay.classList && typeof overlay.classList.remove === 'function') {
                overlay.classList.remove('active');
            }
        }, 10);

        this.schedule(overlay, () => {
            overlay.style.display = 'none';
            this.sessions.delete(overlay);
            if (typeof onComplete === 'function') {
                onComplete();
            }
        }, duration + 50);
    }
};

if (typeof window !== 'undefined') window.ModalAnimation = ModalAnimation;
if (typeof global !== 'undefined') global.ModalAnimation = ModalAnimation;

// Shared facade retains Promise<void>/Promise<boolean> for existing callers.
// Standalone HTML pages also load sys.js, so dependencies are loaded once on demand.
const sysScriptUrl = typeof document !== 'undefined' ? document.currentScript?.src : null;
let dialogDependencies = null;
function ensureDialogService() {
    const host = typeof window !== 'undefined' ? window : globalThis;
    if (host.DialogService && host.OverlayManager) return Promise.resolve(host.DialogService);
    if (!dialogDependencies) {
        dialogDependencies = (async () => {
            if (!sysScriptUrl) throw new Error('Dialog Service is unavailable');
            const base = new URL('.', sysScriptUrl);
            const load = name => new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = new URL('components/' + name + '.js', base).href;
                script.onload = resolve;
                script.onerror = () => { script.remove(); reject(new Error('Dialog Service could not load')); };
                document.head.appendChild(script);
            });
            if (!host.OverlayManager) await load('overlay-manager');
            if (!host.DialogService) await load('dialog-service');
            return host.DialogService;
        })().catch(error => { dialogDependencies = null; throw error; });
    }
    return dialogDependencies;
}
async function alert(message, options = {}) {
    const service = await ensureDialogService();
    await service.alert({ title: options?.title || '提示', description: message, confirmText: options?.btnText || '確定' });
}
async function confirm(message, description = '', type = 'default', btnText, projectEl) {
    const service = await ensureDialogService();
    if (type === 'delete') {
        return service.runLegacy({ run: signal => legacyDeleteConfirm(message, description, type, btnText, projectEl, signal) }).then(value => value === true);
    }
    const result = await service.confirm({ title: message, description, confirmText: btnText || '確定', danger: type === 'danger' });
    return result.confirmed === true;
}

function legacyDeleteConfirm(message, description, type = 'default', btnText, projectEl, signal) {
    let cancel;
    const task = new Promise((resolve) => {
        let completed = false, accepted = false, aborted = false, lease;
        let trashMotion = null;
        const timers = [];
        const settle = value => { if (!completed) { completed = true; resolve(value); } };
        const bg = document.createElement("div");
        bg.classList.add("sys-bg");
        
        const windowEl = document.createElement("div");
        windowEl.classList.add("sys-window");

        const title = document.createElement("h1");
        title.textContent = message;

        const messageEl = document.createElement("p");
        messageEl.textContent = description || '';

        const contentContainer = document.createElement("div");
        contentContainer.classList.add("sys-content");

        const btnContainer = document.createElement("div");
        btnContainer.classList.add("sys-btns");

        if (type == 'delete'){
            const previewContainer = document.createElement("div");
            previewContainer.classList.add("sys-preview");

            const sourceWidth = projectEl?.getBoundingClientRect?.().width || projectEl?.clientWidth || 240;
            const width = Math.min(240, sourceWidth, Math.max(120, window.innerWidth - 80));
            const preview = window.ProjectCard?.createPreview(projectEl, {width});
            if (preview) previewContainer.appendChild(preview);
            else {const label=document.createElement('p');label.textContent=projectEl?.querySelector?.('.project-title')?.textContent || message;previewContainer.appendChild(label);}
            windowEl.appendChild(previewContainer);

            const trashBinContainer = document.createElement("div");
            trashBinContainer.classList.add('sys-delete-trashbin');
            previewContainer.appendChild(trashBinContainer);

            const trashbinTop = document.createElement("img");
            trashbinTop.classList.add("sys-delete-trashbin-top");
            trashbinTop.src = "../icon/delete-3.svg";
            trashBinContainer.appendChild(trashbinTop);

            const trashBinBottom = document.createElement("img");
            trashBinBottom.classList.add("sys-delete-trashbin-bottom");
            trashBinBottom.src = "../icon/delete-4.svg";
            trashBinContainer.appendChild(trashBinBottom);
        }

        contentContainer.appendChild(title);
        contentContainer.appendChild(messageEl);
        windowEl.appendChild(contentContainer);
        windowEl.appendChild(btnContainer);
        bg.appendChild(windowEl);
        document.body.appendChild(bg);

        title.id = 'sys-delete-title';
        windowEl.setAttribute('role', 'dialog');
        windowEl.setAttribute('aria-modal', 'true');
        windowEl.setAttribute('aria-labelledby', title.id);
        windowEl.tabIndex = -1;
        const returnFocus = document.activeElement;
        const closeWindow = () => {
            if (accepted) trashMotion?.complete();
            ModalAnimation.close(bg, windowEl, {
                duration: 400,
                fadeBackdrop: true,
                legacyMotion: true,
                onComplete: () => {
                    trashMotion?.cancel();
                    bg.remove();
                    lease?.release({ restoreFocus: !aborted });
                    signal?.removeEventListener('abort', cancel);
                }
            });
        };

        const btn1 = document.createElement("button");
        btn1.classList.add("btn");
        btn1.classList.add("sys-btn");
        btn1.classList.add("secondary")
        btn1.textContent = "取消";
        btnContainer.appendChild(btn1);

        

        btn1.onclick = () => {
            if (accepted || completed) return;
            closeWindow();
            settle(false);
        };

        const typeStyles = {
            'delete': "linear-gradient(135deg, #b9201e, #6f1d1b)",
            'danger': "linear-gradient(135deg, #b9201e, #6f1d1b)",
        }

        const btn2 = document.createElement("button");
        btn2.classList.add("btn");
        btn2.classList.add("sys-btn");
        btn2.classList.add("primary");
        btn2.style.background = typeStyles[type] || "";
        btn2.textContent = btnText || "確定";
        btnContainer.appendChild(btn2);

        if(type == 'delete'){
            btn2.onclick = () => {
                if (accepted || completed) return;
                accepted = true;
                btn1.disabled = true; btn2.disabled = true;
                const trashbin = windowEl.querySelector('.sys-delete-trashbin');
                const preview = windowEl.querySelector('.project-folder-card');
                if (preview && window.ProjectTrashMotion) trashMotion = window.ProjectTrashMotion.animate({preview,bin:trashbin,signal});
                timers.push(setTimeout(() => {
                    closeWindow();
                }, 1000));
                timers.push(setTimeout(() => {
                    settle(true);
                }, 1500));
            }
        }
        else{
            btn2.onclick = () => {
                closeWindow();
                settle(true);
            };
        }

        ModalAnimation.open(bg, windowEl, {
            duration: 400,
            legacyMotion: true,
            blur: '50px',
            backdropBg: 'var(--primary-soft)'
        });
        lease = window.OverlayManager.acquire({ overlay: bg, panel: windowEl,
            initialFocus: btn1, returnFocus,
            onEscape: () => { if (!accepted) btn1.onclick(); }
        });
        cancel = () => {
            aborted = true;
            timers.forEach(clearTimeout);
            trashMotion?.cancel();
            ModalAnimation.cancel(bg);
            bg.remove(); lease.release({ restoreFocus: false }); settle(false);
            signal?.removeEventListener('abort', cancel);
        };
        signal?.addEventListener('abort', cancel, { once: true });
    });
    task.cancel = () => cancel?.();
    return task;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { alert, confirm, ModalAnimation };
}
