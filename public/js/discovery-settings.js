/** Settings owns form state and requests; PageHost owns SPA links and the shell. */
(() => {
    window.initDiscoverySettingsPage = function ({ root = document, signal } = {}) {
        const find = id => root.querySelector('#' + id);
        const form = find('api-settings-form');
        if (!form || signal?.aborted) return { unmount() {} };
        if (form._settingsOwner) return form._settingsOwner;
        const fields = find('key-fields'), save = find('save-settings'), message = find('settings-message');
        const status = find('settings-status'), returnLink = find('return-search'), retry = find('retry-settings');
        const controller = new AbortController(), listeners = [];
        let current, disposed = false, saving = false, loading = false;
        document.title = 'API 連線設定 — Storyboard AI';
        const listen = (element, event, callback) => {
            if (!element) return;
            element.addEventListener(event, callback);
            listeners.push(() => element.removeEventListener(event, callback));
        };
        const active = () => !disposed && !signal?.aborted;
        async function request(payload) {
            const response = await fetch('/api/discovery/settings', {
                cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
                ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {})
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
            status.textContent = data.configured ? '已設定完畢' : '尚未完成 API 設定';
            status.className = `status-chip ${data.configured ? 'is-ready' : 'is-pending'}`;
            for (const provider of ['youtube', 'gemini']) {
                const state = data[provider], input = find(`${provider}-key`), badge = find(`${provider}-status`);
                badge.textContent = state.configured ? (state.source === 'browser' ? '已儲存' : '沿用伺服器設定') : '待設定';
                badge.className = `provider-status ${state.configured ? 'is-ready' : ''}`;
                input.required = !state.configured;
                input.placeholder = state.configured ? '已設定，留空保留；貼上新金鑰可更新' : `貼上 ${provider === 'youtube' ? 'YouTube' : 'Gemini'} API Key`;
            }
            find('gemini-hint').textContent = data.gemini.mode === 'vertex'
                ? '目前使用 Vertex AI／Google Cloud ADC 與 Google Cloud 計費。填入 Gemini API Key 後將切換至獨立計費的 Gemini Developer API。'
                : '使用 Google AI Studio 的 Gemini Developer API Key；此模式獨立計費，不使用 Vertex AI 抵用額。';
            returnLink.hidden = !data.configured;
        }
        function clearInputs() {
            for (const toggle of form.querySelectorAll('[data-toggle]')) {
                const input = find(toggle.dataset.toggle);input.value = '';input.type = 'password';
                toggle.textContent = '顯示';toggle.setAttribute('aria-pressed', 'false');
                toggle.setAttribute('aria-label', `顯示 ${toggle.dataset.toggle === 'youtube-key' ? 'YouTube' : 'Gemini'} API Key`);
            }
        }
        async function load() {
            if (!active() || loading || saving) return;
            loading = true;fields.disabled = true;save.disabled = true;
            if (retry) { retry.hidden = true;retry.disabled = true; }
            status.textContent = '讀取設定中…';status.className = 'status-chip';message.textContent = '';message.classList.remove('is-success');returnLink.hidden = true;form.setAttribute('aria-busy','true');
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
            toggle.setAttribute('aria-label', `${show ? '隱藏' : '顯示'} ${toggle.dataset.toggle === 'youtube-key' ? 'YouTube' : 'Gemini'} API Key`);
        });
        listen(form, 'input', () => {
            message.textContent = '';message.classList.remove('is-success');
            const dirty = [...fields.querySelectorAll('input')].some(input => input.value.trim());
            status.textContent = dirty ? '有尚未儲存的變更' : current?.configured ? '已設定完畢' : '尚未完成 API 設定';
            status.className = `status-chip ${dirty || !current?.configured ? 'is-pending' : 'is-ready'}`;
            returnLink.hidden = dirty || !current?.configured;
        });
        listen(form, 'submit', async event => {
            event.preventDefault();
            if (!active() || saving || loading || !current || save.disabled) return;
            if (form.checkValidity && !form.checkValidity()) return;
            const payload = Object.fromEntries([...new FormData(form)].map(([name, value]) => [name, value.trim()]));
            saving = true;form.setAttribute('aria-busy','true');fields.disabled = true;save.disabled = true;save.textContent = '檢查連線並儲存中…';
            message.classList.remove('is-success');message.textContent = '正在檢查新金鑰，請稍候。';returnLink.hidden = true;
            try {
                const data = await request(payload), persisted = await request();
                if (!active()) return;
                if (persisted.savedAt !== data.savedAt) throw new Error('瀏覽器未保存設定，請允許本站 Cookie 後再試一次。');
                clearInputs();render(persisted);message.classList.add('is-success');
                message.textContent = '已設定完畢！設定已儲存並立即生效，可以開始搜尋影片。';returnLink.focus();
            } catch (error) {
                if (!active()) return;
                message.textContent = error.name === 'TimeoutError' ? '連線檢查逾時，請稍後重試。' : error.message;
                status.textContent = '尚未儲存成功';status.className = 'status-chip is-pending';
            } finally {
                saving = false;
                if (active()) { form.setAttribute('aria-busy','false');fields.disabled = false;save.disabled = false;save.textContent = '檢查並儲存設定 ↗'; }
            }
        });
        function unmount() {
            if (disposed) return;disposed = true;controller.abort();listeners.forEach(off => off());
            clearInputs();signal?.removeEventListener('abort',unmount);delete form._settingsOwner;
        }
        const owner = { unmount };form._settingsOwner = owner;
        signal?.addEventListener('abort',unmount,{once:true});load();return owner;
    };
    const initStandalone = () => { if (!window.PageHost && document.getElementById('api-settings-form')) window.initDiscoverySettingsPage(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initStandalone,{once:true});else initStandalone();
})();
