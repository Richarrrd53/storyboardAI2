/** Settings owns form state and requests; PageHost owns SPA links and the shell. */
(() => {
    const IDLE_SAVE_LABEL = '儲存並檢查設定';
    const UNBIND_COPY = {
        gemini: {
            title: '確定解除綁定 Gemini API Key？',
            message: '解除後將清除此帳號的個人 Gemini API Key，並恢復使用網站提供的 Gemini。'
        },
        youtube: {
            title: '確定解除綁定 YouTube API Key？',
            message: '解除後將清除此帳號的個人 YouTube API Key，並恢復使用網站提供的 API。'
        },
        openai: {
            title: '確定解除綁定 OpenAI API Key？',
            message: '解除後將清除此帳號的個人 OpenAI API Key，不再提供 OpenAI 模型選擇；若目前預設為 OpenAI，將自動切回 Google Gemini。'
        }
    };

    function buildDialogFormMarkup() {
        return `
            <div class="api-settings-sheet-handle" aria-hidden="true"></div>
            <div class="api-settings-dialog-head">
                <div>
                    <h2 id="api-settings-dialog-title" class="sb-dialog-title">API 設定</h2>
                    <p class="settings-subtitle">管理 AI 服務與個人 API 金鑰。</p>
                </div>
                <span id="settings-status" class="status-chip" role="status" aria-live="polite">讀取設定中…</span>
            </div>
            <form id="api-settings-form" autocomplete="off">
                <div id="api-settings-scroll" class="api-settings-scroll">
                <fieldset id="key-fields" disabled>
                    <div class="settings-category" aria-labelledby="cat-generative-title">
                        <div class="settings-category-head">
                            <h3 id="cat-generative-title" class="settings-category-title">生成式 AI 設定</h3>
                            <p class="settings-category-desc">創作討論、分鏡與圖片生成</p>
                        </div>

                        <section class="provider-block" data-provider="gemini" aria-labelledby="gemini-title">
                            <div class="provider-heading">
                                <span class="provider-icon gemini-icon" aria-hidden="true">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
                                </span>
                                <div class="provider-title-group">
                                    <h4 id="gemini-title">Google Gemini</h4>
                                    <p>創作討論、分鏡與圖片生成，以及影片分析</p>
                                </div>
                                <span id="gemini-status" class="provider-status">讀取中</span>
                            </div>
                            <div class="source-radio-group" role="radiogroup" aria-label="Google Gemini 憑證來源">
                                <label class="source-radio-card">
                                    <input type="radio" name="geminiMode" value="site" checked />
                                    <span class="source-radio-body">
                                        <span class="source-radio-title">使用網站提供的 Gemini</span>
                                        <span class="source-radio-desc">無須設定 API Key，即可使用 AI 創作功能。</span>
                                    </span>
                                </label>
                                <label class="source-radio-card">
                                    <input type="radio" name="geminiMode" value="personal" />
                                    <span class="source-radio-body">
                                        <span class="source-radio-title">使用自己的 Gemini API Key</span>
                                        <span class="source-radio-desc">透過個人 API Key 使用 Gemini 服務。</span>
                                    </span>
                                </label>
                            </div>
                            <div id="gemini-site-notice" class="site-info-notice">
                                <svg class="site-info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                                <p>網站提供的 Gemini 服務設有每分鐘請求次數限制。當使用人數較多時，可能出現回應較慢、服務繁忙或生成失敗的情況。若遇到此問題，建議稍後重試，或使用自己的 Gemini API Key。</p>
                            </div>
                            <div id="gemini-switch-hint" class="switch-unbind-hint" hidden>
                                <span>目前仍已綁定個人金鑰；若要恢復使用網站提供的 Gemini，請解除綁定。</span>
                                <button type="button" class="btn-unbind btn-unbind-inline" data-unbind="gemini">解除綁定</button>
                            </div>
                            <div id="gemini-personal-panel" class="provider-collapsible" aria-hidden="true">
                                <div class="provider-collapsible-inner">
                                    <label class="field" for="gemini-key">Gemini API Key</label>
                                    <div class="key-input">
                                        <input id="gemini-key" name="geminiApiKey" type="password" placeholder="貼上 Gemini API Key" maxlength="400" autocomplete="new-password" spellcheck="false" aria-describedby="gemini-hint" />
                                        <button type="button" class="visibility-button" data-toggle="gemini-key" aria-label="顯示 Gemini API Key" aria-pressed="false">顯示</button>
                                    </div>
                                    <p id="gemini-hint" class="field-hint">請填入此帳號自己的 Google AI Studio API Key；使用量由該金鑰所屬專案計費。</p>
                                    <div class="provider-actions-row">
                                        <a class="provider-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">前往 Google AI Studio 取得金鑰 ↗</a>
                                        <button type="button" class="btn-unbind" data-unbind="gemini" hidden>解除綁定</button>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section class="provider-block" data-provider="openai" aria-labelledby="openai-title">
                            <div class="provider-heading">
                                <span class="provider-icon openai-icon" aria-hidden="true">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/></svg>
                                </span>
                                <div class="provider-title-group">
                                    <div class="provider-title-row">
                                        <h4 id="openai-title">OpenAI</h4>
                                        <span class="recommend-badge">推薦</span>
                                    </div>
                                    <p>創作討論、分鏡文字與圖片生成</p>
                                </div>
                                <span id="openai-status" class="provider-status">讀取中</span>
                            </div>
                            <div class="openai-recommend-row">
                                <p class="openai-recommend-text">使用 OpenAI 的 GPT 模型進行 AI 創作與分鏡生成。在部分任務或使用情境下，可能提供更快速的回應與生成體驗。</p>
                            </div>
                            <label class="field" for="openai-key">OpenAI API Key</label>
                            <div class="key-input">
                                <input id="openai-key" name="openaiApiKey" type="password" placeholder="sk-…" maxlength="400" autocomplete="new-password" spellcheck="false" aria-describedby="openai-hint" />
                                <button type="button" class="visibility-button" data-toggle="openai-key" aria-label="顯示 OpenAI API Key" aria-pressed="false">顯示</button>
                            </div>
                            <p id="openai-hint" class="field-hint">綁定後可在使用者設定中選擇 OpenAI 作為預設 AI 模型。</p>
                            <div class="provider-actions-row">
                                <a class="provider-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">前往 OpenAI 取得金鑰 ↗</a>
                                <button type="button" class="btn-unbind" data-unbind="openai" hidden>解除綁定</button>
                            </div>
                        </section>
                    </div>

                    <div class="settings-category" aria-labelledby="cat-other-title">
                        <div class="settings-category-head">
                            <h3 id="cat-other-title" class="settings-category-title">其他設定</h3>
                            <p class="settings-category-desc">熱門短影音搜尋與資料擷取</p>
                        </div>

                        <section class="provider-block" data-provider="youtube" aria-labelledby="youtube-title">
                            <div class="provider-heading">
                                <span class="provider-icon youtube-icon" aria-hidden="true">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><polygon points="8,5 19,12 8,19" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
                                </span>
                                <div class="provider-title-group">
                                    <h4 id="youtube-title">YouTube Data API</h4>
                                    <p>搜尋頻道、hashtag 與熱門影片資料</p>
                                </div>
                                <span id="youtube-status" class="provider-status">讀取中</span>
                            </div>
                            <div class="source-radio-group" role="radiogroup" aria-label="YouTube Data API 憑證來源">
                                <label class="source-radio-card">
                                    <input type="radio" name="youtubeMode" value="site" checked />
                                    <span class="source-radio-body">
                                        <span class="source-radio-title">使用網站提供的 API</span>
                                        <span class="source-radio-desc">無須設定 API Key，即可使用影片搜尋功能。網站共用的 API 配額可能受到使用量限制。</span>
                                    </span>
                                </label>
                                <label class="source-radio-card">
                                    <input type="radio" name="youtubeMode" value="personal" />
                                    <span class="source-radio-body">
                                        <span class="source-radio-title">使用自己的 API Key</span>
                                        <span class="source-radio-desc">透過個人 YouTube Data API v3 金鑰搜尋影片。</span>
                                    </span>
                                </label>
                            </div>
                            <div id="youtube-switch-hint" class="switch-unbind-hint" hidden>
                                <span>目前仍已綁定個人金鑰；若要恢復使用網站提供的 API，請解除綁定。</span>
                                <button type="button" class="btn-unbind btn-unbind-inline" data-unbind="youtube">解除綁定</button>
                            </div>
                            <div id="youtube-personal-panel" class="provider-collapsible" aria-hidden="true">
                                <div class="provider-collapsible-inner">
                                    <label class="field" for="youtube-key">YouTube API Key</label>
                                    <div class="key-input">
                                        <input id="youtube-key" name="youtubeApiKey" type="password" placeholder="貼上 YouTube API Key" maxlength="400" autocomplete="new-password" spellcheck="false" aria-describedby="youtube-hint" />
                                        <button type="button" class="visibility-button" data-toggle="youtube-key" aria-label="顯示 YouTube API Key" aria-pressed="false">顯示</button>
                                    </div>
                                    <p id="youtube-hint" class="field-hint">請使用已啟用 YouTube Data API v3 的金鑰。</p>
                                    <div class="provider-actions-row">
                                        <a class="provider-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">前往 Google Cloud 取得金鑰 ↗</a>
                                        <button type="button" class="btn-unbind" data-unbind="youtube" hidden>解除綁定</button>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                </fieldset>
                </div>
                <button id="retry-settings" class="btn btn-secondary retry-button" type="button" hidden>重新讀取設定</button>
                <p id="settings-message" class="form-message" role="status" aria-live="polite"></p>
                <div class="api-settings-dialog-actions">
                    <button id="close-api-settings" class="btn btn-secondary api-settings-close" type="button">關閉</button>
                    <button id="save-settings" class="btn btn-primary api-settings-save" type="submit" disabled>${IDLE_SAVE_LABEL}</button>
                </div>
            </form>
        `;
    }

    window.initDiscoverySettingsPage = function ({ root = document, signal, onSaved } = {}) {
        const find = id => root.querySelector('#' + id);
        const findAll = selector => [...(root.querySelectorAll ? root.querySelectorAll(selector) : [])];
        const form = find('api-settings-form');
        if (!form || signal?.aborted) return { unmount() {} };
        if (form._settingsOwner) return form._settingsOwner;
        const fields = find('key-fields'), save = find('save-settings'), message = find('settings-message');
        const status = find('settings-status'), returnLink = find('return-search'), retry = find('retry-settings');
        const controller = new AbortController(), listeners = [];
        let current, disposed = false, saving = false, loading = false;
        const modeState = { gemini: 'site', youtube: 'site' };

        const summary = data => {
            const readyCount = ['gemini', 'youtube'].filter(name => data?.[name]?.configured).length;
            const personalCount = ['gemini', 'youtube', 'openai'].filter(name => data?.[name]?.personalConfigured || (name === 'openai' && data?.[name]?.configured)).length;
            if (readyCount === 2) return personalCount ? `服務就緒 · 已綁定 ${personalCount} 組個人金鑰` : '預設服務就緒';
            return `核心服務 ${readyCount} / 2 可用`;
        };

        const isDialog = Boolean(root !== document && root?.classList?.contains?.('api-settings-dialog'));
        if (!isDialog) document.title = 'API 設定 — Storyboard AI';
        const scrollTarget = isDialog
            ? find('api-settings-scroll')
            : document.getElementById?.('page-content')?.classList?.contains?.('spa-discovery-settings-wrap')
                ? document.getElementById('page-content')
                : null;
        if (scrollTarget && window.DynamicMaskSystem?.attach) {
            window.DynamicMaskSystem.attach(scrollTarget, { maskSize: 36, direction: 'vertical' });
        }
        const updateMask = () => {
            if (scrollTarget && window.DynamicMaskSystem?.update) {
                window.DynamicMaskSystem.update(scrollTarget);
            }
        };
        const revealPersonalPanel = provider => {
            const panel = find(`${provider}-personal-panel`);
            if (!panel?.scrollIntoView) return;
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
            const scrollNow = () => {
                if (!active()) return;
                panel.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
                updateMask();
            };
            if (reduced) {
                requestAnimationFrame?.(scrollNow) ?? scrollNow();
                return;
            }
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                panel.removeEventListener?.('transitionend', onEnd);
                scrollNow();
            };
            const onEnd = event => {
                if (event.target === panel && event.propertyName === 'grid-template-rows') finish();
            };
            panel.addEventListener?.('transitionend', onEnd);
            setTimeout(finish, 340);
        };

        const listen = (element, event, callback) => {
            if (!element) return;
            element.addEventListener(event, callback);
            listeners.push(() => element.removeEventListener(event, callback));
        };

        const ownerToken = window.spaAuth?.getToken?.();
        const active = () => !disposed && !signal?.aborted && window.spaAuth?.getToken?.() === ownerToken;

        async function request(payload, { method, url = '/api/discovery/settings' } = {}) {
            const httpMethod = method || (payload ? 'POST' : 'GET');
            const response = await fetch(url, {
                cache: 'no-store',
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]),
                headers: {
                    ...(ownerToken ? { Authorization: `Bearer ${ownerToken}` } : {}),
                    ...(payload ? { 'Content-Type': 'application/json' } : {})
                },
                method: httpMethod,
                ...(payload ? { body: JSON.stringify(payload) } : {})
            });
            let data;
            try { data = await response.json(); } catch { throw new Error('伺服器未回傳有效結果，請稍後重試。'); }
            if (!active()) throw new DOMException('Settings unmounted', 'AbortError');
            if (!response.ok) throw new Error(data.error || '設定儲存失敗。');
            if (!data?.youtube || !data?.gemini) throw new Error('設定資料不完整，請重新讀取。');
            return data;
        }

        function formatProviderState(provider, state) {
            const personal = Boolean(state?.personalConfigured || (state?.source === 'browser' && state?.configured));
            if (provider === 'openai') {
                return personal
                    ? { badge: '已綁定', summary: '個人金鑰', ready: true, unavailable: false }
                    : { badge: '未綁定', summary: '未綁定', ready: false, unavailable: true };
            }
            if (personal) return { badge: '個人金鑰', summary: '個人金鑰', ready: true, unavailable: false };
            if (state?.configured) return { badge: '網站提供', summary: '網站提供', ready: true, unavailable: false };
            return { badge: '暫不可用', summary: '暫不可用', ready: false, unavailable: true };
        }

        function syncModePanels(provider) {
            if (!['gemini', 'youtube'].includes(provider)) return;
            const mode = modeState[provider] || 'site';
            const panel = find(`${provider}-personal-panel`);
            const switchHint = find(`${provider}-switch-hint`);
            const siteNotice = provider === 'gemini' ? find('gemini-site-notice') : null;
            const state = current?.[provider] || {};
            const personal = Boolean(state.personalConfigured || (state.source === 'browser' && state.configured));

            for (const radio of findAll(`input[name="${provider}Mode"]`)) {
                radio.checked = radio.value === mode;
            }
            if (panel) {
                const open = mode === 'personal';
                panel.classList?.toggle?.('is-open', open);
                panel.setAttribute?.('aria-hidden', String(!open));
            }
            if (siteNotice) siteNotice.hidden = mode !== 'site';
            if (switchHint) switchHint.hidden = !(personal && mode === 'site');
        }

        function render(data) {
            current = data;
            status.textContent = summary(data);
            status.className = `status-chip ${data.configured ? 'is-ready' : 'is-pending'}`;

            for (const provider of ['gemini', 'youtube', 'openai']) {
                const state = data[provider] || { configured: false };
                const personal = Boolean(state.personalConfigured || (state.source === 'browser' && state.configured));
                const formatted = formatProviderState(provider, state);
                const input = find(`${provider}-key`), badge = find(`${provider}-status`), sumVal = find(`summary-${provider}`);

                if (badge) {
                    badge.textContent = formatted.badge;
                    badge.className = `provider-status ${formatted.ready ? 'is-ready' : formatted.unavailable ? 'is-unavailable' : ''}`;
                }
                if (sumVal) {
                    sumVal.textContent = formatted.summary;
                    sumVal.className = `summary-value ${formatted.ready ? 'is-ready' : formatted.unavailable ? 'is-unavailable' : ''}`;
                }
                if (input) {
                    input.required = false;
                    input.placeholder = personal
                        ? '已綁定個人金鑰（留空保留，貼上新金鑰可更換）'
                        : `貼上 ${provider === 'youtube' ? 'YouTube' : provider === 'openai' ? 'OpenAI' : 'Gemini'} API Key`;
                }
                for (const unbindBtn of findAll(`[data-unbind="${provider}"]`)) {
                    unbindBtn.hidden = !personal;
                }
                if (provider === 'gemini' || provider === 'youtube') {
                    modeState[provider] = personal ? 'personal' : 'site';
                    syncModePanels(provider);
                }
            }

            const geminiHint = find('gemini-hint');
            if (geminiHint) geminiHint.textContent = '請填入此帳號自己的 Google AI Studio API Key；使用量由該金鑰所屬專案計費。';
            if (returnLink) returnLink.hidden = !data.configured;
            updateMask();
        }

        function clearInputs(onlyProvider) {
            for (const toggle of form.querySelectorAll('[data-toggle]')) {
                if (onlyProvider && toggle.dataset.toggle !== `${onlyProvider}-key`) continue;
                const input = find(toggle.dataset.toggle);
                if (!input) continue;
                input.value = '';
                input.type = 'password';
                toggle.textContent = '顯示';
                toggle.setAttribute('aria-pressed', 'false');
                toggle.setAttribute('aria-label', `顯示 ${toggle.dataset.toggle === 'youtube-key' ? 'YouTube' : toggle.dataset.toggle === 'openai-key' ? 'OpenAI' : 'Gemini'} API Key`);
            }
        }

        async function load() {
            if (!active() || loading || saving) return;
            loading = true; fields.disabled = true; save.disabled = true;
            if (retry) { retry.hidden = true; retry.disabled = true; }
            status.textContent = '讀取設定中…'; status.className = 'status-chip';
            message.textContent = ''; message.classList.remove('is-success', 'is-pending');
            if (returnLink) returnLink.hidden = true;
            form.setAttribute('aria-busy', 'true');
            try {
                const data = await request();
                if (!active()) return;
                render(data);
                fields.disabled = false;
                save.disabled = false;
            } catch (error) {
                if (!active()) return;
                status.textContent = '無法讀取設定';
                message.textContent = '無法讀取目前設定，請重新讀取後再試一次。';
                if (retry) retry.hidden = false;
            } finally {
                loading = false;
                if (active()) {
                    form.setAttribute('aria-busy', 'false');
                    if (retry) retry.disabled = false;
                }
            }
        }

        async function confirmUnbind(provider, triggerBtn) {
            const copy = UNBIND_COPY[provider];
            if (!copy) return false;
            if (window.DialogService?.confirm) {
                const result = await window.DialogService.confirm({
                    title: copy.title,
                    message: copy.message,
                    confirmText: '確認解除綁定',
                    cancelText: '取消',
                    tone: 'danger',
                    returnFocus: triggerBtn
                });
                return Boolean(result?.confirmed);
            }
            if (typeof window.confirm === 'function') {
                return window.confirm(`${copy.title}\n\n${copy.message}`);
            }
            return true;
        }

        async function handleUnbind(provider, triggerBtn) {
            if (!active() || saving || loading || !current) return;
            const confirmed = await confirmUnbind(provider, triggerBtn);
            if (!confirmed || !active()) return;

            saving = true;
            form.setAttribute('aria-busy', 'true');
            fields.disabled = true;
            save.disabled = true;
            message.classList.remove('is-success');
            message.classList.add('is-pending');
            message.textContent = '正在解除綁定，請稍候…';
            try {
                const data = await request(null, { method: 'DELETE', url: `/api/discovery/settings/${provider}` });
                if (!active()) return;
                clearInputs(provider);
                render(data);
                message.classList.remove('is-pending');
                message.classList.add('is-success');
                message.textContent = provider === 'openai'
                    ? '已解除 OpenAI 金鑰綁定，並切回預設 Google Gemini 模型。'
                    : provider === 'gemini'
                        ? '已解除個人 Gemini 金鑰綁定，將恢復使用網站提供的 Gemini。'
                        : '已解除個人 YouTube 金鑰綁定，將恢復使用網站提供的 API。';
                if (provider === 'openai' && data.aiProvider) {
                    window.spaAuth?.syncAiProviderLocal?.(data.aiProvider);
                }
                window.spaAuth?.fetchAiCapabilities?.({ force: true });
                window.dispatchEvent?.(new CustomEvent('discovery:settings-updated', { detail: data }));
                onSaved?.(data);
            } catch (error) {
                if (!active()) return;
                message.classList.remove('is-pending', 'is-success');
                message.textContent = error.message || '解除綁定失敗，請稍後重試。';
            } finally {
                saving = false;
                if (active()) {
                    form.setAttribute('aria-busy', 'false');
                    fields.disabled = false;
                    save.disabled = false;
                }
            }
        }

        listen(retry, 'click', load);

        listen(form, 'change', event => {
            const target = event.target;
            if (!target || target.type !== 'radio') return;
            if (target.name === 'geminiMode') {
                modeState.gemini = target.value === 'personal' ? 'personal' : 'site';
                syncModePanels('gemini');
                updateMask();
            } else if (target.name === 'youtubeMode') {
                modeState.youtube = target.value === 'personal' ? 'personal' : 'site';
                syncModePanels('youtube');
                updateMask();
                if (modeState.youtube === 'personal') revealPersonalPanel('youtube');
            }
        });
        listen(form, 'transitionend', event => {
            if (event.propertyName === 'grid-template-rows') updateMask();
        });

        listen(form, 'click', event => {
            const toggle = event.target.closest?.('[data-toggle]');
            if (toggle) {
                const input = find(toggle.dataset.toggle), show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                toggle.textContent = show ? '隱藏' : '顯示';
                toggle.setAttribute('aria-pressed', String(show));
                toggle.setAttribute('aria-label', `${show ? '隱藏' : '顯示'} ${toggle.dataset.toggle === 'youtube-key' ? 'YouTube' : toggle.dataset.toggle === 'openai-key' ? 'OpenAI' : 'Gemini'} API Key`);
                return;
            }
            const unbindBtn = event.target.closest?.('[data-unbind]');
            if (unbindBtn) {
                handleUnbind(unbindBtn.dataset.unbind, unbindBtn);
            }
        });

        listen(form, 'input', () => {
            message.textContent = ''; message.classList.remove('is-success', 'is-pending');
            const dirty = [...fields.querySelectorAll('input')].some(input => input.type !== 'radio' && input.value.trim());
            status.textContent = dirty ? '有尚未儲存的變更' : summary(current);
            status.className = `status-chip ${dirty || !current?.configured ? 'is-pending' : 'is-ready'}`;
            if (returnLink) returnLink.hidden = dirty || !current?.configured;
        });

        listen(form, 'submit', async event => {
            event.preventDefault();
            if (!active() || saving || loading || !current || save.disabled) return;
            if (form.checkValidity && !form.checkValidity()) return;
            const entries = [...new FormData(form)]
                .filter(([name]) => ['openaiApiKey', 'youtubeApiKey', 'geminiApiKey'].includes(name))
                .map(([name, value]) => [name, String(value).trim()]);
            const payload = Object.fromEntries(entries);
            saving = true; form.setAttribute('aria-busy', 'true'); fields.disabled = true; save.disabled = true; save.textContent = '檢查連線並儲存中…';
            message.classList.remove('is-success'); message.classList.add('is-pending'); message.textContent = '正在檢查新金鑰，請稍候。';
            if (returnLink) returnLink.hidden = true;
            try {
                const data = await request(payload), persisted = await request();
                if (!active()) return;
                if (persisted.savedAt !== data.savedAt) throw new Error('瀏覽器未保存設定，請允許本站 Cookie 後再試一次。');
                clearInputs();
                render(persisted);
                message.classList.remove('is-pending');
                message.classList.add('is-success');
                message.textContent = '金鑰已通過連線檢查並加密儲存，後續請求將使用新設定。';
                window.spaAuth?.fetchAiCapabilities?.({ force: true });
                window.dispatchEvent?.(new CustomEvent('discovery:settings-updated', { detail: persisted }));
                onSaved?.(persisted);
                if (returnLink && !returnLink.hidden) returnLink.focus();
            } catch (error) {
                if (!active()) return;
                message.classList.remove('is-pending', 'is-success');
                message.textContent = error.name === 'TimeoutError' ? '連線檢查逾時，請稍後重試。' : error.message;
                status.textContent = '尚未儲存成功'; status.className = 'status-chip is-pending';
            } finally {
                saving = false;
                if (active()) {
                    form.setAttribute('aria-busy', 'false');
                    fields.disabled = false;
                    save.disabled = false;
                    save.textContent = IDLE_SAVE_LABEL;
                }
            }
        });

        function unmount() {
            if (disposed) return; disposed = true;
            if (scrollTarget && window.DynamicMaskSystem?.detach) {
                window.DynamicMaskSystem.detach(scrollTarget);
            }
            controller.abort();
            listeners.forEach(off => off());
            clearInputs();
            signal?.removeEventListener('abort', unmount);
            delete form._settingsOwner;
        }
        const owner = { unmount, isSaving: () => saving };
        form._settingsOwner = owner;
        signal?.addEventListener('abort', unmount, { once: true });
        load();
        return owner;
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

        panel.innerHTML = buildDialogFormMarkup();

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const dialogController = new AbortController();
        const closeBtn = panel.querySelector('#close-api-settings');
        const settingsOwner = window.initDiscoverySettingsPage({ root: panel, signal: dialogController.signal, onSaved });
        const focusTarget = returnFocus || document.activeElement;
        const depth = window.BackgroundDepth;
        let settled = false;
        let timer = null;
        let pointer = null;
        const animations = [];
        const stopAnimations = () => {
            clearTimeout(timer);
            timer = null;
            animations.splice(0).forEach(a => a.cancel());
        };
        const overlayFrame = (color, blur) => ({ backgroundColor: color, backdropFilter: blur, webkitBackdropFilter: blur });
        const currentOverlay = () => {
            const style = window.getComputedStyle?.(overlay);
            return overlayFrame(
                style?.backgroundColor || overlay.style.backgroundColor || 'var(--color-surface-overlay)',
                style?.backdropFilter || overlay.style.backdropFilter || 'blur(4px)'
            );
        };

        let resolvePromise;
        const promise = new Promise(resolve => { resolvePromise = resolve; });

        const lease = window.OverlayManager?.acquire?.({
            overlay,
            panel,
            returnFocus: focusTarget,
            initialFocus: closeBtn,
            onEscape: () => { if (!settingsOwner.isSaving?.()) close('escape'); }
        });

        function endPointer() {
            if (!pointer) return;
            try { panel.releasePointerCapture?.(pointer.id); } catch (_) {}
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
            pointer = null;
        }

        function onPointerDown(event) {
            if (!mobileSheet || settled || event.button > 0 || settingsOwner.isSaving?.()) return;
            const target = event.target;
            if (!target?.closest?.('.api-settings-sheet-handle') && (!target?.closest?.('.api-settings-dialog-head') || target.closest('a,button,input,select,textarea'))) return;
            const transform = window.getComputedStyle?.(panel)?.transform || '';
            const match = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([-\d.]+)\)/);
            const offset = match ? Math.max(0, Number(match[1])) : 0;
            stopAnimations();
            pointer = {
                id: event.pointerId,
                start: event.clientY,
                last: event.clientY,
                time: Date.now(),
                dy: offset,
                offset,
                velocity: 0,
                height: panel.getBoundingClientRect().height || 480,
                moved: false
            };
            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp);
            window.addEventListener('pointercancel', onPointerCancel);
        }

        function onPointerMove(event) {
            if (!pointer || event.pointerId !== pointer.id) return;
            const delta = event.clientY - pointer.start;
            if (!pointer.moved && Math.abs(delta) < 6) return;
            if (!pointer.moved) {
                pointer.moved = true;
                try { panel.setPointerCapture?.(pointer.id); } catch (_) {}
            }
            event.preventDefault?.();
            const stamp = Date.now();
            pointer.velocity = (event.clientY - pointer.last) / Math.max(1, stamp - pointer.time);
            pointer.last = event.clientY;
            pointer.time = stamp;
            pointer.dy = Math.max(0, pointer.offset + delta);
            panel.style.transform = `translate3d(0,${pointer.dy}px,0)`;
            const progress = Math.max(0, 1 - pointer.dy / pointer.height);
            overlay.style.backgroundColor = `rgba(15,23,42,${0.45 * progress})`;
            overlay.style.backdropFilter = `blur(${4 * progress}px)`;
            overlay.style.webkitBackdropFilter = `blur(${4 * progress}px)`;
            depth?.setProgress?.(progress);
        }

        function snapBack() {
            if (!mobileSheet || settled) return;
            const from = panel.style.transform || 'translate3d(0,0,0)';
            const overlayFrom = currentOverlay();
            stopAnimations();
            const duration = 260;
            const easing = 'cubic-bezier(.16,1,.3,1)';
            overlay.style.backgroundColor = '';
            overlay.style.backdropFilter = '';
            overlay.style.webkitBackdropFilter = '';
            if (!motion?.matches && overlay.animate) {
                animations.push(overlay.animate([overlayFrom, overlayFrame('var(--color-surface-overlay)', 'blur(4px)')], { duration, easing, fill: 'both' }));
            }
            if (!motion?.matches && panel.animate) {
                animations.push(panel.animate([{ transform: from }, { transform: 'translate3d(0,0,0)' }], { duration, easing, fill: 'both' }));
            }
            depth?.animate?.(true, motion?.matches ? 0 : 0.26);
            if (motion?.matches) {
                panel.style.transform = 'translate3d(0,0,0)';
            } else {
                timer = setTimeout(() => {
                    stopAnimations();
                    panel.style.transform = 'translate3d(0,0,0)';
                }, duration);
            }
        }

        function onPointerUp(event) {
            if (!pointer || event.pointerId !== pointer.id) return;
            const dismiss = pointer.moved && (pointer.dy / pointer.height >= 0.30 || pointer.velocity > 0.38);
            endPointer();
            if (dismiss && !settingsOwner.isSaving?.()) close('drag');
            else snapBack();
        }

        function onPointerCancel(event) {
            if (!pointer || event.pointerId !== pointer.id) return;
            endPointer();
            snapBack();
        }

        function dispose(reason) {
            stopAnimations();
            endPointer();
            panel.removeEventListener('pointerdown', onPointerDown);
            modalMotion?.cancel?.(overlay);
            signal?.removeEventListener('abort', onAbort);
            dialogController.abort();
            overlay.remove();
            if (mobileSheet) depth?.setProgress?.(0);
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
            endPointer();
            if (closeBtn) closeBtn.disabled = true;
            if (immediate || motion?.matches) {
                if (mobileSheet) depth?.animate?.(false, 0);
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
                const from = window.getComputedStyle?.(panel)?.transform || panel.style.transform || 'translate3d(0,0,0)';
                const overlayFrom = currentOverlay();
                stopAnimations();
                if (overlay.animate) {
                    animations.push(overlay.animate(
                        [
                            overlayFrom,
                            overlayFrame('transparent', 'blur(0px)')
                        ],
                        { duration, easing, fill: 'both' }
                    ));
                }
                if (panel.animate) {
                    animations.push(panel.animate(
                        [{ transform: from }, { transform: 'translate3d(0,100%,0)' }],
                        { duration, easing, fill: 'both' }
                    ));
                }
                depth?.animate?.(false, 0.26);
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

        panel.addEventListener('pointerdown', onPointerDown);

        if (!motion?.matches && modalMotion) {
            modalMotion.open(overlay, panel, { blur: 'var(--dialog-backdrop-blur, 50px)', backdropBg: 'var(--dialog-backdrop-bg)' });
        } else if (mobileSheet) {
            if (!motion?.matches && panel.animate) {
                const easing = 'cubic-bezier(.16,1,.3,1)';
                animations.push(overlay.animate(
                    [
                        overlayFrame('transparent', 'blur(0px)'),
                        overlayFrame('var(--color-surface-overlay)', 'blur(4px)')
                    ],
                    { duration: 350, easing, fill: 'both' }
                ));
                animations.push(panel.animate(
                    [{ transform: 'translate3d(0,100%,0)' }, { transform: 'translate3d(0,0,0)' }],
                    { duration: 350, easing, fill: 'both' }
                ));
                timer = setTimeout(() => {
                    stopAnimations();
                    panel.style.transform = 'translate3d(0,0,0)';
                }, 350);
            }
            depth?.animate?.(true, motion?.matches ? 0 : 0.35);
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
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initStandalone, { once: true }); else initStandalone();
})();
