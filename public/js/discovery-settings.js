/** Settings owns form state and requests; PageHost owns SPA links and the shell. */
(() => {
    const IDLE_SAVE_LABEL = '儲存並檢查設定';

    window.initDiscoverySettingsPage = function ({ root = document, signal, onSaved } = {}) {
        const find = id => root.querySelector('#' + id);
        const form = find('api-settings-form');
        if (!form || signal?.aborted) return { unmount() {} };
        if (form._settingsOwner) return form._settingsOwner;
        const fields = find('key-fields'), save = find('save-settings'), message = find('settings-message');
        const status = find('settings-status'), returnLink = find('return-search'), retry = find('retry-settings');
        const controller = new AbortController(), listeners = [];
        let current, disposed = false, saving = false, loading = false;
        const summary = data => `已連接 ${['openai', 'gemini', 'youtube'].filter(name => data?.[name]?.configured).length} / 3 項服務`;
        const isDialog = Boolean(root !== document && root?.classList?.contains?.('api-settings-dialog'));
        if (!isDialog) document.title = 'API 連線設定 — Storyboard AI';
        const listen = (element, event, callback) => {
            if (!element) return;
            element.addEventListener(event, callback);
            listeners.push(() => element.removeEventListener(event, callback));
        };
        const ownerToken = window.spaAuth?.getToken?.();
        const active = () => !disposed && !signal?.aborted && window.spaAuth?.getToken?.() === ownerToken;
        async function request(payload) {
            const response = await fetch('/api/discovery/settings', {
                cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
                headers: { ...(ownerToken ? { Authorization: `Bearer ${ownerToken}` } : {}), ...(payload ? { 'Content-Type': 'application/json' } : {}) },
                ...(payload ? { method: 'POST', body: JSON.stringify(payload) } : {})
            });
            let data;
            try { data = await response.json(); } catch { throw new Error('伺服器未回傳有效結果，請稍後重試。'); }
            if (!active()) throw new DOMException('Settings unmounted', 'AbortError');
            if (!response.ok) throw new Error(data.error || '設定儲存失敗。');
            if (!data?.youtube || !data?.gemini) throw new Error('設定資料不完整，請重新讀取。');
            return data;
        }
        function render(data) {
            current = data;
            status.textContent = summary(data);
            status.className = `status-chip ${data.configured ? 'is-ready' : 'is-pending'}`;
            for (const provider of ['youtube', 'gemini', 'openai']) {
                const state = data[provider] || { configured: false }, input = find(`${provider}-key`), badge = find(`${provider}-status`);
                if (!input || !badge) continue;
                badge.textContent = state.configured ? '此帳號已儲存' : '待設定';
                badge.className = `provider-status ${state.configured ? 'is-ready' : ''}`;
                input.required = false;
                input.placeholder = state.configured ? '已設定，留空保留；貼上新金鑰可更新' : `貼上 ${provider === 'youtube' ? 'YouTube' : provider === 'openai' ? 'OpenAI' : 'Gemini'} API Key`;
            }
            const geminiHint = find('gemini-hint');
            if (geminiHint) geminiHint.textContent = '請填入此帳號自己的 Google AI Studio API Key；使用量由該金鑰所屬專案計費。';
            if (returnLink) returnLink.hidden = !data.configured;
        }
        function clearInputs() {
            for (const toggle of form.querySelectorAll('[data-toggle]')) {
                const input = find(toggle.dataset.toggle);input.value = '';input.type = 'password';
                toggle.textContent = '顯示';toggle.setAttribute('aria-pressed', 'false');
                toggle.setAttribute('aria-label', `顯示 ${toggle.dataset.toggle === 'youtube-key' ? 'YouTube' : toggle.dataset.toggle === 'openai-key' ? 'OpenAI' : 'Gemini'} API Key`);
            }
        }
        async function load() {
            if (!active() || loading || saving) return;
            loading = true;fields.disabled = true;save.disabled = true;
            if (retry) { retry.hidden = true;retry.disabled = true; }
            status.textContent = '讀取設定中…';status.className = 'status-chip';message.textContent = '';message.classList.remove('is-success');if (returnLink) returnLink.hidden = true;form.setAttribute('aria-busy','true');
            try {
                const data = await request();if (!active()) return;
                render(data);fields.disabled = false;save.disabled = false;
            } catch (error) {
                if (!active()) return;
                status.textContent = '無法讀取設定';message.textContent = '無法讀取目前設定，請重新讀取後再試一次。';
                if (retry) retry.hidden = false;
            } finally { loading = false;if (active()) {form.setAttribute('aria-busy','false');if (retry) retry.disabled = false;} }
        }
        listen(retry, 'click', load);
        listen(form, 'click', event => {
            const toggle = event.target.closest('[data-toggle]');if (!toggle) return;
            const input = find(toggle.dataset.toggle), show = input.type === 'password';
            input.type = show ? 'text' : 'password';toggle.textContent = show ? '隱藏' : '顯示';
            toggle.setAttribute('aria-pressed', String(show));
            toggle.setAttribute('aria-label', `${show ? '隱藏' : '顯示'} ${toggle.dataset.toggle === 'youtube-key' ? 'YouTube' : toggle.dataset.toggle === 'openai-key' ? 'OpenAI' : 'Gemini'} API Key`);
        });
        listen(form, 'input', () => {
            message.textContent = '';message.classList.remove('is-success');
            const dirty = [...fields.querySelectorAll('input')].some(input => input.value.trim());
            status.textContent = dirty ? '有尚未儲存的變更' : summary(current);
            status.className = `status-chip ${dirty || !current?.configured ? 'is-pending' : 'is-ready'}`;
            if (returnLink) returnLink.hidden = dirty || !current?.configured;
        });
        listen(form, 'submit', async event => {
            event.preventDefault();
            if (!active() || saving || loading || !current || save.disabled) return;
            if (form.checkValidity && !form.checkValidity()) return;
            const payload = Object.fromEntries([...new FormData(form)].map(([name, value]) => [name, value.trim()]));
            saving = true;form.setAttribute('aria-busy','true');fields.disabled = true;save.disabled = true;save.textContent = '檢查連線並儲存中…';
            message.classList.remove('is-success');message.textContent = '正在檢查新金鑰，請稍候。';if (returnLink) returnLink.hidden = true;
            try {
                const data = await request(payload), persisted = await request();
                if (!active()) return;
                if (persisted.savedAt !== data.savedAt) throw new Error('瀏覽器未保存設定，請允許本站 Cookie 後再試一次。');
                clearInputs();render(persisted);message.classList.add('is-success');
                message.textContent = '金鑰已通過連線檢查並加密儲存，後續請求將使用新設定。';
                window.spaAuth?.fetchAiCapabilities?.({ force: true });
                window.dispatchEvent?.(new CustomEvent('discovery:settings-updated', { detail: persisted }));
                onSaved?.(persisted);
                if (returnLink && !returnLink.hidden) returnLink.focus();
            } catch (error) {
                if (!active()) return;
                message.textContent = error.name === 'TimeoutError' ? '連線檢查逾時，請稍後重試。' : error.message;
                status.textContent = '尚未儲存成功';status.className = 'status-chip is-pending';
            } finally {
                saving = false;
                if (active()) { form.setAttribute('aria-busy','false');fields.disabled = false;save.disabled = false;save.textContent = IDLE_SAVE_LABEL; }
            }
        });
        function unmount() {
            if (disposed) return;disposed = true;controller.abort();listeners.forEach(off => off());
            clearInputs();signal?.removeEventListener('abort',unmount);delete form._settingsOwner;
        }
        const owner = { unmount, isSaving: () => saving };form._settingsOwner = owner;
        signal?.addEventListener('abort',unmount,{once:true});load();return owner;
    };

    let activeDialog = null;

    window.openApiSettingsDialog = function ({ returnFocus, onSaved, signal } = {}) {
        if (activeDialog) {
            activeDialog.panel?.focus?.({ preventScroll: true });
            return activeDialog.promise;
        }
        if (signal?.aborted) return Promise.resolve({ closed: true, reason: 'abort' });

        window.PageAssetLoader?.injectCSS?.('/css/discovery-settings.css');

        const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        const isMobileSheet = () => Boolean(window.matchMedia?.('(max-width: 768px), (max-width: 767px) and (orientation: portrait), (max-width: 480px)')?.matches);
        const mobileSheet = isMobileSheet();
        const modalMotion = mobileSheet ? null : window.ModalAnimation;
        const overlay = document.createElement('div');
        overlay.className = 'sb-dialog-overlay api-settings-overlay' + (mobileSheet ? ' is-sheet' : '');
        const panel = document.createElement('section');
        panel.className = 'sb-dialog api-settings-dialog' + (mobileSheet ? ' is-sheet' : '');
        panel.tabIndex = -1;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'api-settings-dialog-title');

        if (!motion?.matches && !mobileSheet) {
            panel.style.scale = '0';
            overlay.style.backdropFilter = 'blur(0px)';
            overlay.style.webkitBackdropFilter = 'blur(0px)';
        }

        panel.innerHTML = `
            <div class="api-settings-sheet-handle" aria-hidden="true"></div>
            <div class="api-settings-dialog-head">
                <h2 id="api-settings-dialog-title" class="sb-dialog-title">API 設定</h2>
                <span id="settings-status" class="status-chip" role="status" aria-live="polite">讀取設定中…</span>
            </div>
            <form id="api-settings-form" autocomplete="off">
                <fieldset id="key-fields" disabled>
                    <section class="provider-block" aria-labelledby="openai-title">
                        <div class="provider-heading"><span class="provider-icon openai-icon" aria-hidden="true">◎</span><div><h3 id="openai-title">OpenAI / GPT</h3><p>創作討論、分鏡文字與圖片生成</p></div><span id="openai-status" class="provider-status">讀取中</span></div>
                        <label class="field" for="openai-key">OpenAI API Key</label>
                        <div class="key-input"><input id="openai-key" name="openaiApiKey" type="password" placeholder="sk-…" maxlength="400" autocomplete="new-password" spellcheck="false" aria-describedby="openai-hint" /><button type="button" class="visibility-button" data-toggle="openai-key" aria-label="顯示 OpenAI API Key" aria-pressed="false">顯示</button></div>
                        <p id="openai-hint" class="field-hint">儲存後，可在使用者設定的「AI 模型」切換到 OpenAI。</p>
                        <a class="provider-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">前往 OpenAI 取得金鑰 ↗</a>
                    </section>
                    <section class="provider-block" aria-labelledby="youtube-title">
                        <div class="provider-heading"><span class="provider-icon youtube-icon" aria-hidden="true">▶</span><div><h3 id="youtube-title">YouTube Data API</h3><p>搜尋頻道、hashtag 與熱門影片資料</p></div><span id="youtube-status" class="provider-status">讀取中</span></div>
                        <label class="field" for="youtube-key">YouTube API Key</label>
                        <div class="key-input"><input id="youtube-key" name="youtubeApiKey" type="password" placeholder="貼上 YouTube API Key" maxlength="400" autocomplete="new-password" spellcheck="false" aria-describedby="youtube-hint" /><button type="button" class="visibility-button" data-toggle="youtube-key" aria-label="顯示 YouTube API Key" aria-pressed="false">顯示</button></div>
                        <p id="youtube-hint" class="field-hint">請使用已啟用 YouTube Data API v3 的金鑰。</p>
                        <a class="provider-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">前往 Google Cloud 取得金鑰 ↗</a>
                    </section>
                    <section class="provider-block" aria-labelledby="gemini-title">
                        <div class="provider-heading"><span class="provider-icon gemini-icon" aria-hidden="true">✦</span><div><h3 id="gemini-title">Gemini AI</h3><p>創作討論、分鏡與圖片生成，以及影片分析</p></div><span id="gemini-status" class="provider-status">讀取中</span></div>
                        <label class="field" for="gemini-key">Gemini API Key</label>
                        <div class="key-input"><input id="gemini-key" name="geminiApiKey" type="password" placeholder="貼上 Gemini API Key" maxlength="400" autocomplete="new-password" spellcheck="false" aria-describedby="gemini-hint" /><button type="button" class="visibility-button" data-toggle="gemini-key" aria-label="顯示 Gemini API Key" aria-pressed="false">顯示</button></div>
                        <p id="gemini-hint" class="field-hint">使用 Google AI Studio 建立的 Gemini API Key。</p>
                        <a class="provider-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">前往 Google AI Studio 取得金鑰 ↗</a>
                    </section>
                </fieldset>
                <button id="retry-settings" class="btn btn-secondary retry-button" type="button" hidden>重新讀取設定</button>
                <p id="settings-message" class="form-message" role="status" aria-live="polite"></p>
                <div class="api-settings-dialog-actions">
                    <button id="close-api-settings" class="btn btn-secondary api-settings-close" type="button">關閉</button>
                    <button id="save-settings" class="btn btn-primary api-settings-save" type="submit" disabled>${IDLE_SAVE_LABEL}</button>
                </div>
            </form>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const dialogController = new AbortController();
        const closeBtn = panel.querySelector('#close-api-settings');
        const settingsOwner = window.initDiscoverySettingsPage({ root: panel, signal: dialogController.signal, onSaved });
        const focusTarget = returnFocus || document.activeElement;
        let settled = false;
        let timer = null;
        const animations = [];

        let resolvePromise;
        const promise = new Promise(resolve => { resolvePromise = resolve; });

        const lease = window.OverlayManager?.acquire?.({
            overlay,
            panel,
            returnFocus: focusTarget,
            initialFocus: closeBtn,
            onEscape: () => { if (!settingsOwner.isSaving?.()) close('escape'); }
        });

        function dispose(reason) {
            clearTimeout(timer);
            modalMotion?.cancel?.(overlay);
            animations.forEach(a => a.cancel());
            signal?.removeEventListener('abort', onAbort);
            dialogController.abort();
            overlay.remove();
            lease?.release?.({ restoreFocus: reason !== 'abort' });
            if (activeDialog?.overlay === overlay) activeDialog = null;
            resolvePromise({ closed: true, reason });
        }

        function close(reason = 'close', immediate = false) {
            if (settled) {
                if (immediate) dispose(reason);
                return;
            }
            settled = true;
            if (closeBtn) closeBtn.disabled = true;
            if (immediate || motion?.matches) {
                dispose(reason);
                return;
            }
            if (modalMotion) {
                modalMotion.close(overlay, panel, { onComplete: () => dispose(reason) });
                return;
            }
            if (mobileSheet) {
                const duration = 260;
                const easing = 'cubic-bezier(.16,1,.3,1)';
                if (overlay.animate) {
                    animations.push(overlay.animate(
                        [
                            { backgroundColor: 'var(--color-surface-overlay)', backdropFilter: 'blur(4px)', webkitBackdropFilter: 'blur(4px)' },
                            { backgroundColor: 'transparent', backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)' }
                        ],
                        { duration, easing, fill: 'both' }
                    ));
                }
                if (panel.animate) {
                    animations.push(panel.animate(
                        [{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,100%,0)' }],
                        { duration, easing, fill: 'both' }
                    ));
                }
                timer = setTimeout(() => dispose(reason), duration);
                return;
            }
            const duration = 300;
            if (overlay.animate) {
                animations.push(overlay.animate(
                    [{ backdropFilter: 'blur(var(--dialog-backdrop-blur, 50px))' }, { backdropFilter: 'blur(0px)' }],
                    { duration, easing: 'cubic-bezier(.8,0,.6,1)', fill: 'both' }
                ));
            }
            if (panel.animate) {
                animations.push(panel.animate(
                    [{ scale: '1' }, { scale: '0' }],
                    { duration, easing: 'cubic-bezier(.31,.01,.66,-.59)', fill: 'both' }
                ));
            }
            timer = setTimeout(() => dispose(reason), duration);
        }

        const onAbort = () => close('abort', true);
        signal?.addEventListener('abort', onAbort, { once: true });

        closeBtn?.addEventListener('click', () => {
            if (!settingsOwner.isSaving?.()) close('close');
        });
        overlay.addEventListener('click', event => {
            if (event.target === overlay && !settled && !settingsOwner.isSaving?.()) close('backdrop');
        });

        if (!motion?.matches && modalMotion) {
            modalMotion.open(overlay, panel, { blur: 'var(--dialog-backdrop-blur, 50px)', backdropBg: 'var(--dialog-backdrop-bg)' });
        } else if (!motion?.matches && mobileSheet && panel.animate) {
            const easing = 'cubic-bezier(.16,1,.3,1)';
            animations.push(overlay.animate(
                [
                    { backgroundColor: 'transparent', backdropFilter: 'blur(0px)', webkitBackdropFilter: 'blur(0px)' },
                    { backgroundColor: 'var(--color-surface-overlay)', backdropFilter: 'blur(4px)', webkitBackdropFilter: 'blur(4px)' }
                ],
                { duration: 350, easing, fill: 'both' }
            ));
            animations.push(panel.animate(
                [{ transform: 'translate3d(0,100%,0)' }, { transform: 'translate3d(0,0,0)' }],
                { duration: 350, easing, fill: 'both' }
            ));
        } else if (!motion?.matches && panel.animate) {
            animations.push(overlay.animate(
                [{ backdropFilter: 'blur(0px)' }, { backdropFilter: 'blur(var(--dialog-backdrop-blur, 50px))' }],
                { duration: 300, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }
            ));
            animations.push(panel.animate(
                [{ scale: '0' }, { scale: '1' }],
                { duration: 300, easing: 'cubic-bezier(.34,1.59,.69,.99)', fill: 'both' }
            ));
        }

        activeDialog = { overlay, panel, close, promise };
        return promise;
    };

    const initStandalone = () => { if (!window.PageHost && document.getElementById('api-settings-form')) window.initDiscoverySettingsPage(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initStandalone,{once:true});else initStandalone();
})();
