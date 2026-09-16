(() => {
    const form = document.getElementById('discovery-form');
    const results = document.getElementById('results');
    const message = document.getElementById('form-message');
    const count = document.getElementById('result-count');
    const skillSelect = document.getElementById('skill');
    const button = form.querySelector('button');
    let currentVideos = [];
    let currentSkill;

    async function api(url, payload) {
        const response = await fetch(url, { ...(payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(120000) });
        let data;
        try { data = await response.json(); } catch { throw new Error('伺服器沒有回傳有效結果，請稍後重試。'); }
        if (!response.ok) throw new Error(data.error || '請求失敗');
        return data;
    }

    const escapeHtml = value => String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

    async function loadSkills() {
        const data = await api('/api/discovery/skills');
        skillSelect.innerHTML = data.skills.map(skill => `<option value="${escapeHtml(skill.id)}">${escapeHtml(skill.name)}</option>`).join('');
        const settingsLink = document.getElementById('skill-status');
        if (data.configured) {
            settingsLink.textContent = '✓ API 已連線 (.env)';
            settingsLink.classList.remove('is-pending');
            settingsLink.classList.add('is-ready');
            if (message.textContent.startsWith('請點選「尚未完成 API 設定」') || message.textContent.startsWith('請確認 .env')) {
                message.textContent = '';
            }
        } else {
            settingsLink.textContent = '尚未完成 API 設定';
            settingsLink.classList.add('is-pending');
            settingsLink.classList.remove('is-ready');
            message.textContent = '請確認 .env 中已設定 YOUTUBE_API_KEY 與 GOOGLE_APPLICATION_CREDENTIALS。';
        }
        button.disabled = !data.configured || !data.skills.length;
    }

    function renderSection(name, section) {
        const observed = section.status === 'observed';
        return `<div class="analysis-block ${observed ? 'observed' : ''}"><div class="analysis-label">${escapeHtml(name)} ${escapeHtml(section.timestamp || '')}</div><p class="analysis-text ${observed ? '' : 'unknown'}">${escapeHtml(section.text)}</p></div>`;
    }

    function renderVideo(video) {
        const analysis = video.analysis;
        const sections = ['setup', 'problem', 'solution', 'ending'];
        const metric = value => value == null ? '未提供' : Number(value).toLocaleString('zh-TW');
        const labels = { setup: '開場', problem: '問題／衝突', solution: '解法', ending: '結尾' };
        return `<article class="video-card" id="video-${escapeHtml(video.id)}">
            <div class="video-preview"><iframe loading="lazy" title="${escapeHtml(video.title)}" src="https://www.youtube-nocookie.com/embed/${escapeHtml(video.id)}" allowfullscreen></iframe><span>YouTube · ${escapeHtml(video.durationSeconds)} 秒</span></div>
            <div class="video-main">
                <div class="video-meta"><span>${escapeHtml(video.creator)} · ${escapeHtml(new Date(video.publishedAt).toLocaleDateString('zh-TW'))}</span><a href="${escapeHtml(video.url)}" target="_blank" rel="noreferrer">開啟來源 ↗</a></div>
                <h3 class="video-title">${escapeHtml(video.title)}</h3>
                <details class="video-description"><summary>影片說明</summary>${escapeHtml(video.description || '未提供')}</details>
                <div class="tag-row">${(video.hashtags || []).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}</div>
                ${analysis ? `<div class="analysis-grid">${sections.map(section => renderSection(labels[section], analysis.sections[section])).join('')}</div><p class="search-help">AI 影片分析，請搭配原片核對時間戳與內容。</p>` : `<p class="analysis-state">${escapeHtml(video.error || video.state || '等待分析…')}</p>${video.error ? `<button type="button" class="retry-button" data-id="${escapeHtml(video.id)}">重試此影片</button>` : ''}`}
                <div class="metrics"><span>觀看 <b>${metric(video.stats.views)}</b></span><span>按讚 <b>${metric(video.stats.likes)}</b></span><span>留言 <b>${metric(video.stats.comments)}</b></span><span>分享 <b>${metric(video.stats.shares)}</b></span></div>
            </div>
        </article>`;
    }

    async function analyze(video) {
        video.error = null;
        video.state = '正在分析影片畫面與語音…';
        const update = () => { document.getElementById(`video-${video.id}`).outerHTML = renderVideo(video); };
        update();
        try { video.analysis = (await api('/api/discovery/analyze', { videoId: video.id, skill: currentSkill })).analysis; }
        catch (error) { video.error = error.name === 'TimeoutError' ? '分析逾時，請重試此影片。' : error.message; }
        update();
    }

    results.addEventListener('click', async event => {
        const retry = event.target.closest('[data-id]');
        if (!retry || button.disabled) return;
        const video = currentVideos.find(item => item.id === retry.dataset.id);
        if (!video) return;
        button.disabled = true;
        try { await analyze(video); }
        finally { button.disabled = false; count.textContent = `${currentVideos.length} 支影片 · ${currentVideos.filter(v => v.analysis).length} 支分析完成`; }
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (button.disabled) return;
        button.disabled = true;
        button.querySelector('span').textContent = '搜尋中…';
        message.textContent = '';
        results.innerHTML = '<div class="empty-state"><strong>正在取得候選影片並整理結構…</strong></div>';
        try {
            const payload = Object.fromEntries(new FormData(form).entries());
            const data = await api('/api/discovery/search', payload);
            currentSkill = payload.skill;
            currentVideos = data.results;
            count.textContent = `${data.results.length} 筆結果 · ${data.meta.collector}`;
            message.textContent = `${data.meta.channel ? `搜尋頻道：${data.meta.channel.title}（${data.meta.channel.id}）。` : ''}${data.meta.warning}`;
            results.innerHTML = data.results.length ? data.results.map(renderVideo).join('') : '<div class="empty-state"><strong>沒有符合條件的影片</strong><span>請放寬發布時間、確認頻道名稱或更換 hashtag。</span></div>';
            for (const [index, video] of currentVideos.entries()) {
                button.querySelector('span').textContent = `分析 ${index + 1} / ${currentVideos.length}`;
                count.textContent = `已找到 ${currentVideos.length} 支 · 正在分析第 ${index + 1} 支`;
                await analyze(video);
            }
            count.textContent = `${currentVideos.length} 支影片 · ${currentVideos.filter(v => v.analysis).length} 支分析完成 · ${currentVideos.filter(v => v.error).length} 支失敗`;
        } catch (error) {
            count.textContent = '搜尋失敗';
            message.textContent = error.message;
            results.innerHTML = '';
        } finally {
            button.disabled = false;
            button.querySelector('span').textContent = '搜尋並分析';
        }
    });

    loadSkills().catch(error => { message.textContent = `無法載入 skill registry：${error.message}`; });
    // Refresh status when returning from settings through browser Back (bfcache).
    window.addEventListener('pageshow', event => {
        if (event.persisted) loadSkills().catch(() => { message.textContent = '無法更新 API 設定狀態，請重新整理。'; });
    });
})();
