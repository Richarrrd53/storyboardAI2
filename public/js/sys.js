const ModalAnimation = {
    EASING_BACKDROP: 'cubic-bezier(.4,0,.2,1)',
    EASING_CARD_ENTER: 'cubic-bezier(.33,1.53,.69,.99)',
    EASING_CARD_LEAVE: 'cubic-bezier(.31, .01, .66, -0.59)',
    DURATION: 400,

    open(overlay, panel, options = {}) {
        if (!overlay) return;
        const duration = options.duration || this.DURATION;
        const blur = options.blur || '16px';
        const backdropBg = options.backdropBg || 'rgba(15, 23, 42, 0.45)';

        overlay.style.display = 'flex';
        overlay.style.pointerEvents = 'none';
        overlay.style.transition = `all ${duration}ms ${this.EASING_BACKDROP}`;
        overlay.style.backdropFilter = 'blur(0px)';
        if (overlay.style.webkitBackdropFilter !== undefined) {
            overlay.style.webkitBackdropFilter = 'blur(0px)';
        }
        overlay.style.background = 'rgba(15, 23, 42, 0)';
        overlay.style.opacity = '0';

        if (panel) {
            panel.style.transition = `all ${duration}ms ${this.EASING_CARD_ENTER}`;
            panel.style.scale = '0';
            panel.style.opacity = '0';
        }

        setTimeout(() => {
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
        }, 10);
    },

    close(overlay, panel, options = {}) {
        if (!overlay) return;
        const duration = options.duration || this.DURATION;
        const onComplete = typeof options === 'function' ? options : (options.onComplete || null);

        overlay.style.pointerEvents = 'none';

        if (panel) {
            panel.style.transition = `all ${duration}ms ${this.EASING_CARD_LEAVE}`;
        }
        overlay.style.transition = `all ${duration}ms ${this.EASING_BACKDROP}`;

        setTimeout(() => {
            if (panel) {
                panel.style.scale = '0';
                panel.style.opacity = '0';
            }
            overlay.style.backdropFilter = 'blur(0px)';
            if (overlay.style.webkitBackdropFilter !== undefined) {
                overlay.style.webkitBackdropFilter = 'blur(0px)';
            }
            overlay.style.background = 'rgba(15, 23, 42, 0)';
            overlay.style.opacity = '0';
            if (overlay.classList && typeof overlay.classList.remove === 'function') {
                overlay.classList.remove('active');
            }
        }, 10);

        setTimeout(() => {
            overlay.style.display = 'none';
            if (typeof onComplete === 'function') {
                onComplete();
            }
        }, duration + 50);
    }
};

if (typeof window !== 'undefined') window.ModalAnimation = ModalAnimation;
if (typeof global !== 'undefined') global.ModalAnimation = ModalAnimation;

function alert(message, options = { btnText: "確定", duration: 15000 }) {
    return new Promise((resolve) => {
        const bg = document.createElement("div");
        bg.classList.add("sys-bg");
        
        const windowEl = document.createElement("div");
        windowEl.classList.add("sys-window");

        const title = document.createElement("h1");
        title.innerHTML = "出現錯誤了！";

        const messageEl = document.createElement("p");
        messageEl.innerHTML = message;

        const contentContainer = document.createElement("div");
        contentContainer.classList.add("sys-content");

        const btnContainer = document.createElement("div");
        btnContainer.classList.add("sys-btns");

        const confirmBtn = document.createElement("button");
        confirmBtn.classList.add("sys-btn");
        confirmBtn.textContent = options.btnText;

        btnContainer.appendChild(confirmBtn);
        contentContainer.appendChild(title);
        contentContainer.appendChild(messageEl);
        windowEl.appendChild(contentContainer);
        windowEl.appendChild(btnContainer);
        bg.appendChild(windowEl);
        document.body.appendChild(bg);

        const closeAlert = () => {
            ModalAnimation.close(bg, windowEl, {
                duration: 400,
                onComplete: () => {
                    bg.remove();
                    resolve();
                }
            });
        };

        ModalAnimation.open(bg, windowEl, {
            duration: 400,
            blur: '50px',
            backdropBg: 'var(--primary-soft)'
        });

        confirmBtn.onclick = closeAlert;
    });
}

function confirm(message, description, type = 'default', btnText, projectEl) {
    return new Promise((resolve) => {
        const bg = document.createElement("div");
        bg.classList.add("sys-bg");
        
        const windowEl = document.createElement("div");
        windowEl.classList.add("sys-window");

        const title = document.createElement("h1");
        title.innerHTML = message;

        const messageEl = document.createElement("p");
        messageEl.innerHTML = description;

        const contentContainer = document.createElement("div");
        contentContainer.classList.add("sys-content");

        const btnContainer = document.createElement("div");
        btnContainer.classList.add("sys-btns");

        if (type == 'delete'){
            const previewContainer = document.createElement("div");
            previewContainer.classList.add("sys-preview");

            const cloneProject = projectEl.cloneNode(true);
            previewContainer.appendChild(cloneProject);
            windowEl.appendChild(previewContainer);

            const delBtn = cloneProject.querySelector('.project-delete-btn') || cloneProject.querySelector('.project-option-btn');
            if (delBtn) delBtn.remove();
            cloneProject.classList.add('lock');

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

        const closeWindow = () => {
            ModalAnimation.close(bg, windowEl, {
                duration: 400,
                onComplete: () => {
                    bg.remove();
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
            closeWindow();
            resolve(false);
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
                const trashbin = windowEl.querySelector('.sys-delete-trashbin');
                const trashbinTop = windowEl.querySelector(".sys-delete-trashbin-top");
                const cloneProject = windowEl.querySelector('.project-card');
    
                trashbin.style.animation = "trashbin 1s cubic-bezier(.33,1.53,.69,.99) 2 alternate";
                trashbinTop.style.animation = "trashbin-top 0.5s cubic-bezier(.4,0,.2,1) 2 alternate";
    
                let position = { x: 0, y: 0, z: 0 };
                let velocity = { x: 0, y: -16, z: -8 };
                const gravity = 1.1;
    
                const animate = () => {
                    position.x += velocity.x;
                    position.z += velocity.z;
                    velocity.y += gravity;
                    position.y += velocity.y;
    
                    let s = position.z/-232;
                    let currentScale = Math.max(0, 0.8 - s * 0.5);
                    cloneProject.style.transform = `translate3d(${position.x}px, ${position.y}px, ${position.z}px) rotateX(${s*135}deg) scale(${currentScale})`;
                    
                    cloneProject.style.filter = `blur(${Math.max(s-0.5)*10}px)`;
                    cloneProject.style.zIndex = (s > 0.5) ? 0 : 2;
    
                    if (position.y < 0) { 
                        requestAnimationFrame(animate);
                    }
                    else{
    
                        cloneProject.style.opacity = 0;
                    }
                };
    
                requestAnimationFrame(animate);
                setTimeout(() => {
                    closeWindow();
                }, 1000);
                setTimeout(() => {
                    resolve(true);
                }, 1500);
            }
        }
        else{
            btn2.onclick = () => {
                closeWindow();
                resolve(true);
            };
        }

        ModalAnimation.open(bg, windowEl, {
            duration: 400,
            blur: '50px',
            backdropBg: 'var(--primary-soft)'
        });
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { alert, confirm, ModalAnimation };
}