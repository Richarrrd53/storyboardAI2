const ModalAnimation = {
    sessions: new WeakMap(),
    EASING_BACKDROP: 'cubic-bezier(.4,0,.2,1)',
    EASING_CARD_ENTER: 'cubic-bezier(.33,1.53,.69,.99)', // Legacy delete signature.
    EASING_DIALOG_ENTER: 'cubic-bezier(.34,1.59,.69,.99)',
    EASING_BACKDROP_LEAVE: 'cubic-bezier(.8,0,.6,1)',
    EASING_CARD_LEAVE: 'cubic-bezier(.31, .01, .66, -0.59)',
    DURATION: 400,
    // Configurable scrim blur policy ('none' | 'blur(10px)' | 'blur(20px)' | 'progressive:20px')
    scrimBlur: 'none',

    ensureScrim(overlay, panel) {
        if (!overlay) return null;
        let scrim = overlay.querySelector?.('.modal-scrim, .sb-dialog-blur, .project-tags-modal-backdrop') || null;
        if (!scrim && typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof overlay.insertBefore === 'function') {
            scrim = document.createElement('div');
            scrim.className = 'modal-scrim';
            scrim.setAttribute('aria-hidden', 'true');
            if (panel && panel.parentNode === overlay) {
                overlay.insertBefore(scrim, panel);
            } else {
                overlay.insertBefore(scrim, overlay.firstChild || null);
            }
        }
        return scrim;
    },

    _releaseMotion(session) {
        if (!session) return;
        if (session.motionHandle) {
            try { session.motionHandle.end(); } catch (_) {}
            session.motionHandle = null;
        } else if (session.usedMaskFallback && typeof window !== 'undefined') {
            window.DynamicMaskSystem?.setMotionMode?.('normal');
            session.usedMaskFallback = false;
        }
    },

    _acquireMotion(session, duration) {
        if (typeof window === 'undefined') return;
        if (window.MotionCoordinator && typeof window.MotionCoordinator.begin === 'function') {
            session.motionHandle = window.MotionCoordinator.begin('dialog', {
                maskMode: 'defer',
                pauseDecor: true,
                timeoutMs: Math.max(200, duration + 180)
            });
        } else {
            window.DynamicMaskSystem?.setMotionMode?.('defer');
            session.usedMaskFallback = true;
        }
    },

    _readOpacity(el, fallback) {
        if (!el) return fallback;
        try {
            if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
                const v = parseFloat(window.getComputedStyle(el).opacity);
                if (Number.isFinite(v)) return v;
            }
        } catch (_) {}
        const inline = parseFloat(el.style?.opacity);
        return Number.isFinite(inline) ? inline : fallback;
    },

    _readScale(el, fallback) {
        if (!el) return fallback;
        try {
            if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
                const s = window.getComputedStyle(el).scale;
                if (s && s !== 'none') return s;
            }
        } catch (_) {}
        if (el.style?.scale && el.style.scale !== 'none') return String(el.style.scale);
        return fallback;
    },

    _applyScrimBlur(scrim, blurMode) {
        if (!scrim || !scrim.style) return;
        const val = (!blurMode || blurMode === 'none' || String(blurMode).startsWith('progressive:')) ? 'none' : blurMode;
        scrim.style.backdropFilter = val;
        if (scrim.style.webkitBackdropFilter !== undefined) {
            scrim.style.webkitBackdropFilter = val;
        }
    },

    cancel(overlay) {
        const session = this.sessions.get(overlay);
        if (!session) return;
        session.state = 'cancelled';
        session.timers.forEach(clearTimeout);
        session.timers.length = 0;
        session.animations.forEach(anim => { try { anim.cancel(); } catch (_) {} });
        session.animations.length = 0;
        if (session.scrim?.style) session.scrim.style.willChange = '';
        if (session.panel?.style) session.panel.style.willChange = '';
        this._releaseMotion(session);
        this.sessions.delete(overlay);
    },

    schedule(overlay, callback, delay) {
        let session = this.sessions.get(overlay);
        if (!session) {
            session = { state: 'idle', timers: [], animations: [], motionHandle: null, usedMaskFallback: false, scrim: null, panel: null };
            this.sessions.set(overlay, session);
        }
        const id = setTimeout(callback, delay);
        session.timers.push(id);
        return id;
    },

    open(overlay, panel, options = {}) {
        if (!overlay) return;
        const prevSession = this.sessions.get(overlay);
        const scrim = this.ensureScrim(overlay, panel);
        const fromOpacity = prevSession ? this._readOpacity(scrim, 0) : 0;
        const fromScale = prevSession ? this._readScale(panel, '0') : '0';
        this.cancel(overlay);

        const reduced = !options.legacyMotion && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const duration = reduced ? 0 : options.duration || this.DURATION;
        const backdropBg = options.backdropBg || 'var(--dialog-backdrop-bg, rgba(15, 23, 42, 0.45))';
        const blurMode = options.scrimBlur !== undefined ? options.scrimBlur : this.scrimBlur;
        const enterEase = options.legacyMotion ? this.EASING_CARD_ENTER : this.EASING_DIALOG_ENTER;

        const session = {
            state: 'opening',
            timers: [],
            animations: [],
            motionHandle: null,
            usedMaskFallback: false,
            scrim,
            panel
        };
        this.sessions.set(overlay, session);

        // Overlay root ALWAYS stays transparent and opacity: 1 so Panel never inherits backdrop opacity.
        overlay.style.display = 'flex';
        overlay.style.pointerEvents = 'auto';
        overlay.style.background = 'transparent';
        overlay.style.opacity = '1';
        overlay.style.transition = 'none';
        if (overlay.classList && typeof overlay.classList.add === 'function') {
            overlay.classList.add('active');
        }

        if (scrim) {
            scrim.style.transition = 'none';
            scrim.style.background = backdropBg;
            this._applyScrimBlur(scrim, blurMode);
            scrim.style.opacity = reduced ? '1' : String(fromOpacity);
        }

        if (panel) {
            panel.style.transition = 'none';
            panel.style.pointerEvents = 'auto';
            panel.style.opacity = '1';
            panel.style.scale = reduced ? '1' : fromScale;
        }

        if (reduced) {
            session.state = 'open';
            if (typeof options.onOpened === 'function') options.onOpened();
            return;
        }

        this._acquireMotion(session, duration);

        const canWaapi = Boolean(
            (scrim && typeof scrim.animate === 'function') ||
            (panel && typeof panel.animate === 'function')
        );

        if (canWaapi) {
            if (scrim?.style) scrim.style.willChange = 'opacity';
            if (panel?.style) panel.style.willChange = 'scale';

            if (scrim && typeof scrim.animate === 'function') {
                const isProgressive = typeof blurMode === 'string' && blurMode.startsWith('progressive:');
                const targetBlur = isProgressive ? blurMode.slice('progressive:'.length) : null;
                const frames = isProgressive
                    ? [{ opacity: fromOpacity, backdropFilter: 'blur(0px)' }, { opacity: 1, backdropFilter: `blur(${targetBlur})` }]
                    : [{ opacity: fromOpacity }, { opacity: 1 }];
                session.animations.push(scrim.animate(frames, {
                    duration,
                    easing: this.EASING_BACKDROP,
                    fill: 'both'
                }));
            }
            if (panel && typeof panel.animate === 'function') {
                session.animations.push(panel.animate(
                    [{ scale: fromScale }, { scale: '1' }],
                    { duration, easing: enterEase, fill: 'both' }
                ));
            }

            let settled = false;
            const finishOpen = () => {
                if (settled || session.state !== 'opening') return;
                settled = true;
                session.state = 'open';
                if (scrim?.style) {
                    scrim.style.opacity = '1';
                    if (typeof blurMode === 'string' && blurMode.startsWith('progressive:')) {
                        const blurPx = `blur(${blurMode.slice('progressive:'.length)})`;
                        scrim.style.backdropFilter = blurPx;
                        if (scrim.style.webkitBackdropFilter !== undefined) scrim.style.webkitBackdropFilter = blurPx;
                    }
                    scrim.style.willChange = '';
                }
                if (panel?.style) {
                    panel.style.scale = '1';
                    panel.style.opacity = '1';
                    panel.style.willChange = '';
                }
                session.animations.splice(0).forEach(a => { try { a.cancel(); } catch (_) {} });
                this._releaseMotion(session);
                if (typeof options.onOpened === 'function') options.onOpened();
            };

            const finishedPromises = session.animations.map(a => a.finished).filter(Boolean);
            if (finishedPromises.length) {
                Promise.allSettled(finishedPromises).then(finishOpen);
            }
            this.schedule(overlay, finishOpen, duration + 30);
            return;
        }

        // Mock / non-WAAPI environment fallback (uses CSS opacity on scrim + scale on panel, no offsetWidth)
        const target = scrim || overlay;
        if (scrim) {
            scrim.style.transition = `opacity ${duration}ms ${this.EASING_BACKDROP}`;
        } else {
            target.style.background = 'transparent';
            target.style.backdropFilter = 'none';
            target.style.transition = `background-color ${duration}ms ${this.EASING_BACKDROP}`;
        }
        if (panel) {
            panel.style.transition = `scale ${duration}ms ${enterEase}`;
        }
        this.schedule(overlay, () => {
            if (session.state !== 'opening') return;
            if (scrim) scrim.style.opacity = '1';
            else target.style.background = backdropBg;
            if (panel) panel.style.scale = '1';
            this.schedule(overlay, () => {
                if (session.state !== 'opening') return;
                session.state = 'open';
                this._releaseMotion(session);
            }, duration + 30);
            if (typeof options.onOpened === 'function') options.onOpened();
        }, 10);
    },

    close(overlay, panel, options = {}) {
        if (!overlay) return;
        const prevSession = this.sessions.get(overlay);
        const scrim = prevSession?.scrim || this.ensureScrim(overlay, panel);
        const fromOpacity = this._readOpacity(scrim, 1);
        const fromScale = this._readScale(panel, '1');
        this.cancel(overlay);

        const reduced = !options.legacyMotion && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const duration = reduced ? 0 : options.duration || this.DURATION;
        const onComplete = typeof options === 'function' ? options : (options.onComplete || null);
        const backdropEase = options.legacyMotion ? this.EASING_BACKDROP : this.EASING_BACKDROP_LEAVE;
        const blurMode = options.scrimBlur !== undefined ? options.scrimBlur : this.scrimBlur;

        const session = {
            state: 'closing',
            timers: [],
            animations: [],
            motionHandle: null,
            usedMaskFallback: false,
            scrim,
            panel
        };
        this.sessions.set(overlay, session);

        // Keep overlay blocking background clicks during exit (prevent click-through) while disabling panel interactions.
        overlay.style.pointerEvents = 'auto';
        if (panel?.style) panel.style.pointerEvents = 'none';

        const finishClose = () => {
            if (session.state !== 'closing') return;
            session.state = 'disposed';
            session.timers.forEach(clearTimeout);
            session.timers.length = 0;
            session.animations.splice(0).forEach(a => { try { a.cancel(); } catch (_) {} });
            if (scrim?.style) {
                scrim.style.opacity = '0';
                scrim.style.willChange = '';
            }
            if (panel?.style) {
                panel.style.scale = '0';
                panel.style.pointerEvents = '';
                panel.style.willChange = '';
            }
            overlay.style.pointerEvents = 'none';
            overlay.style.display = 'none';
            if (overlay.classList && typeof overlay.classList.remove === 'function') {
                overlay.classList.remove('active');
            }
            this._releaseMotion(session);
            this.sessions.delete(overlay);
            if (typeof onComplete === 'function') {
                onComplete();
            }
        };

        if (reduced) {
            finishClose();
            return;
        }

        this._acquireMotion(session, duration);

        const canWaapi = Boolean(
            (scrim && typeof scrim.animate === 'function') ||
            (panel && typeof panel.animate === 'function')
        );

        if (canWaapi) {
            if (scrim?.style) scrim.style.willChange = 'opacity';
            if (panel?.style) panel.style.willChange = 'scale';

            if (scrim && typeof scrim.animate === 'function') {
                const isProgressive = typeof blurMode === 'string' && blurMode.startsWith('progressive:');
                const targetBlur = isProgressive ? blurMode.slice('progressive:'.length) : null;
                const frames = isProgressive
                    ? [{ opacity: fromOpacity, backdropFilter: `blur(${targetBlur})` }, { opacity: 0, backdropFilter: 'blur(0px)' }]
                    : [{ opacity: fromOpacity }, { opacity: 0 }];
                session.animations.push(scrim.animate(frames, {
                    duration,
                    easing: backdropEase,
                    fill: 'both'
                }));
            }
            if (panel && typeof panel.animate === 'function') {
                session.animations.push(panel.animate(
                    [{ scale: fromScale }, { scale: '0' }],
                    { duration, easing: this.EASING_CARD_LEAVE, fill: 'both' }
                ));
            }

            const finishedPromises = session.animations.map(a => a.finished).filter(Boolean);
            if (finishedPromises.length) {
                Promise.allSettled(finishedPromises).then(finishClose);
            }
            this.schedule(overlay, finishClose, duration + 30);
            return;
        }

        // Mock / non-WAAPI environment fallback
        if (panel) {
            panel.style.transition = `scale ${duration}ms ${this.EASING_CARD_LEAVE}`;
        }
        if (scrim) {
            scrim.style.transition = `opacity ${duration}ms ${backdropEase}`;
        } else {
            overlay.style.transition = `background-color ${duration}ms ${backdropEase}`;
        }

        this.schedule(overlay, () => {
            if (session.state !== 'closing') return;
            if (panel) panel.style.scale = '0';
            if (scrim) scrim.style.opacity = '0';
            else overlay.style.background = 'transparent';
            if (overlay.classList && typeof overlay.classList.remove === 'function') {
                overlay.classList.remove('active');
            }
        }, 10);

        this.schedule(overlay, finishClose, duration + 50);
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
    if (type === 'delete' && projectEl) {
        return service.runLegacy({ run: signal => legacyDeleteConfirm(message, description, type, btnText, projectEl, signal) }).then(value => value === true);
    }
    const result = await service.confirm({ title: message, description, confirmText: btnText || '確定', danger: type === 'danger' || type === 'delete' });
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

        const scrimEl = document.createElement("div");
        scrimEl.classList.add("modal-scrim");
        scrimEl.setAttribute('aria-hidden', 'true');
        bg.appendChild(scrimEl);
        
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
            const maxByViewport = Math.min(240, Math.max(132, window.innerWidth - 96), Math.max(132, Math.round(window.innerHeight * 0.28)));
            const width = Math.min(maxByViewport, Math.max(132, sourceWidth));
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

        

        bg.addEventListener("click", event => { if (event.target === bg && !accepted) btn1.onclick(); });
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
            backdropBg: 'var(--dialog-backdrop-bg, rgba(15, 23, 42, 0.45))'
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
