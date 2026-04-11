function alert(message, options = { btnText: "確定", duration: 15000 }) {
    return new Promise((resolve) => {
        const bg = document.createElement("div");
        bg.id = "notifyWindowBG";
        
        const windowEl = document.createElement("div");
        windowEl.id = "notifyWindow";

        const title = document.createElement("h1");
        title.innerHTML = "出現錯誤了！";

        const messageEl = document.createElement("p");
        messageEl.innerHTML = message;

        const btnContainer = document.createElement("div");
        btnContainer.id = "notifyBtnContainer";

        const confirmBtn = document.createElement("button");
        confirmBtn.className = "notifyBtn";
        confirmBtn.textContent = options.btnText;

        btnContainer.appendChild(confirmBtn);
        windowEl.appendChild(title);
        windowEl.appendChild(messageEl);
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