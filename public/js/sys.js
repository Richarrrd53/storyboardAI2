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
            bg.style.background = "rgba(46, 46, 46, 0)";
            bg.style.backdropFilter = "blur(0px)";
            windowEl.style.transition = "all 0.5s cubic-bezier(.31,.01,.66,-0.59)";
            windowEl.style.scale = "0";
            windowEl.style.transform = "translate(0, -400px)";
            windowEl.style.filter = "blur(20px)";
            windowEl.style.opacity = "0";

            setTimeout(() => {
                bg.remove();
                resolve();
            }, 500);
        };

        setTimeout(() => {
            bg.style.background = "rgba(46, 46, 46, 0.2)";
            bg.style.backdropFilter = "blur(40px)";
            windowEl.style.scale = "1";
            windowEl.style.transform = "translate(0, 0px)";
            windowEl.style.filter = "blur(0)";
            windowEl.style.opacity = "1";
        }, 10);

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
            bg.style.background = "rgba(46, 46, 46, 0)";
            bg.style.backdropFilter = "blur(0px)";
            windowEl.style.transition = "all 0.5s cubic-bezier(.31,.01,.66,-0.59)";
            windowEl.style.scale = 0;
            windowEl.style.filter = "blur(20px)";
            setTimeout(() => {
                bg.remove();
            }, 700);
        };

        const btn1 = document.createElement("button");
        btn1.classList.add("sys-btn");
        btn1.classList.add("secondary")
        btn1.textContent = "取消";
        btnContainer.appendChild(btn1);

        

        btn1.onclick = () => {
            closeWindow();
            resolve(false);
        };

        const typeStyles = {
            'delete': "#6f1d1b",
            'danger': "#6f1d1b",
            'success': "#52c41a",
            'warning': "#faad14",
            'default': "var(--text-dark)"
        }

        const btn2 = document.createElement("button");
        btn2.classList.add("sys-btn");
        btn2.classList.add("primary")
        btn2.style.backgroundColor = typeStyles[type];
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




        setTimeout(() => {
            bg.style.background = "rgba(46, 46, 46, 0.2)";
            bg.style.backdropFilter = "blur(40px)";
            windowEl.style.scale = 1;
            windowEl.style.filter = "blur(0)";
            windowEl.style.opacity = "1"
        }, 10);
    });
}