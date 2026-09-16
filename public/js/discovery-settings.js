(() => {
    const form = document.getElementById('api-settings-form');
    const fields = document.getElementById('key-fields');
    const save = document.getElementById('save-settings');
    const message = document.getElementById('settings-message');
    const status = document.getElementById('settings-status');
    const returnLink = document.getElementById('return-search');
    let current;

    async function request(payload) {
        const response = await fetch('/api/discovery/settings', {
            cache: 'no-store', signal: AbortSignal.timeout(60000),
            ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {})
        });
        let data;
        try { data = await response.json(); } catch { throw new Error('伺服器未回傳有效結果，請稍後重試。'); }
        if (!response.ok) throw new Error(data.error || '設定儲存失敗。');
        return data;
    }

    function render(data) {
        current = data;
        const fromEnv = data.youtube?.source === 'server' && data.gemini?.source === 'server';
        status.textContent = data.configured
            ? (fromEnv ? '已連接環境變數 (.env)' : '已設定完畢')
            : '尚未完成 API 設定';
        status.className = `status-chip ${data.configured ? 'is-ready' : 'is-pending'}`;
        for (const provider of ['youtube', 'gemini']) {
            const state = data[provider];
            const input = document.getElementById(`${provider}-key`);
            const badge = document.getElementById(`${provider}-status`);
            if (state.configured) {
                badge.textContent = state.source === 'server'
                    ? (provider === 'youtube' ? '已連接 (.env YOUTUBE_API_KEY)' : '已連接 (.env GOOGLE_APPLICATION_CREDENTIALS)')
                    : '已儲存（瀏覽器）';
                badge.className = 'provider-status is-ready';
                input.required = false;
                input.placeholder = state.source === 'server'
                    ? `已由伺服器 .env${provider === 'youtube' ? '（YOUTUBE_API_KEY）' : '（GOOGLE_APPLICATION_CREDENTIALS）'}設定`
                    : '已設定，留空保留；貼上新金鑰可更新';
            } else {
                badge.textContent = '待設定';
                badge.className = 'provider-status';
                input.required = true;
                input.placeholder = `貼上 ${provider === 'youtube' ? 'YouTube' : 'Gemini'} API Key`;
            }
        }
        document.getElementById('youtube-hint').textContent = data.youtube?.source === 'server'
            ? '已自動載入 .env 裡的 YOUTUBE_API_KEY，可直接使用；也可手動輸入金鑰覆蓋。'
            : '請使用已啟用 YouTube Data API v3 的金鑰。';
        document.getElementById('gemini-hint').textContent = data.gemini?.mode === 'vertex'
            ? '已自動載入 .env 裡的 GOOGLE_APPLICATION_CREDENTIALS 進行 Vertex AI 認證，可直接使用；也可手動輸入 Gemini API Key 覆蓋。'
            : '使用 Google AI Studio 建立的 Gemini API Key。';
        returnLink.hidden = !data.configured;
    }

    form.addEventListener('click', event => {
        const toggle = event.target.closest('[data-toggle]');
        if (!toggle) return;
        const input = document.getElementById(toggle.dataset.toggle);
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.textContent = show ? '隱藏' : '顯示';
        toggle.setAttribute('aria-pressed', String(show));
        toggle.setAttribute('aria-label', `${show ? '隱藏' : '顯示'} ${toggle.dataset.toggle === 'youtube-key' ? 'YouTube' : 'Gemini'} API Key`);
    });

    form.addEventListener('input', () => {
        message.textContent = '';
        message.classList.remove('is-success');
        const dirty = [...fields.querySelectorAll('input')].some(input => input.value.trim());
        status.textContent = dirty ? '有尚未儲存的變更' : current.configured ? '已設定完畢' : '尚未完成 API 設定';
        status.className = `status-chip ${dirty || !current.configured ? 'is-pending' : 'is-ready'}`;
        returnLink.hidden = dirty || !current.configured;
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (save.disabled) return;
        const payload = Object.fromEntries([...new FormData(form)].map(([name, value]) => [name, value.trim()]));
        fields.disabled = true;
        save.disabled = true;
        save.textContent = '檢查連線並儲存中…';
        message.classList.remove('is-success');
        message.textContent = '正在檢查新金鑰，請稍候。';
        returnLink.hidden = true;
        try {
            const data = await request(payload);
            const persisted = await request();
            if (persisted.savedAt !== data.savedAt) throw new Error('瀏覽器未保存設定，請允許本站 Cookie 後再試一次。');
            form.reset();
            for (const toggle of form.querySelectorAll('[data-toggle]')) {
                document.getElementById(toggle.dataset.toggle).type = 'password';
                toggle.textContent = '顯示';
                toggle.setAttribute('aria-pressed', 'false');
                toggle.setAttribute('aria-label', `顯示 ${toggle.dataset.toggle === 'youtube-key' ? 'YouTube' : 'Gemini'} API Key`);
            }
            render(data);
            message.classList.add('is-success');
            message.textContent = '已設定完畢！設定已儲存並立即生效，可以開始搜尋影片。';
            returnLink.focus();
        } catch (error) {
            message.textContent = error.name === 'TimeoutError' ? '連線檢查逾時，請稍後重試。' : error.message;
            status.textContent = '尚未儲存成功';
            status.className = 'status-chip is-pending';
        } finally {
            fields.disabled = false;
            save.disabled = false;
            save.textContent = '檢查並儲存設定 ↗';
        }
    });

    request().then(data => { render(data); fields.disabled = false; save.disabled = false; })
        .catch(() => { status.textContent = '無法讀取設定'; message.textContent = '無法讀取目前設定，請重新整理頁面再試一次。'; });
})();
