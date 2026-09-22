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
        settingsLink.textContent = data.configured ? '已設定完畢' : '尚未完成 API 設定';
        settingsLink.classList.toggle('is-pending', !data.configured);
        if (!data.configured) message.textContent = '請點選「尚未完成 API 設定」，填寫 YouTube 與 Gemini 金鑰後即可開始。';
        else if (message.textContent.startsWith('請點選「尚未完成 API 設定」')) message.textContent = '';
        button.disabled = !data.configured || !data.skills.length;
    }

    function renderSection(name, section) {
        const observed = section.status === 'observed';
        return `<div class="analysis-block ${observed ? 'observed' : ''}"><div class="analysis-label"><span>${escapeHtml(name)}</span><time>${escapeHtml(section.timestamp || '—')}</time></div><p class="analysis-text ${observed ? '' : 'unknown'}">${escapeHtml(section.text)}</p></div>`;
    }

    function suggestedCategory(video) {
        const text = `${video.title} ${video.description || ''} ${(video.hashtags || []).join(' ')} ${Object.values(video.analysis?.sections || {}).map(section => section.text).join(' ')}`.toLowerCase();
        const rules = [
            ['product', '商品廣告', ['開箱', '評測', '商品', '產品', '品牌', '推薦', '美食', '料理', '餐廳', '價格']],
            ['twist', '高留存節奏', ['反轉', '挑戰', '整人', '搞笑', '衝突', '震驚', '竟然', '沒想到', '翻車']],
            ['story', '敘事紀實', ['故事', '日常', 'vlog', '旅遊', '紀錄', '人物', '訪談', '生活', '體驗']]
        ];
        const ranked = rules.map(([id, label, keywords]) => ({ id, label, score: keywords.filter(keyword => text.includes(keyword)).length })).sort((a, b) => b.score - a.score);
        return ranked[0].score ? ranked[0] : { id: 'story', label: '敘事紀實', score: 0 };
    }

    function renderVideo(video) {
        const analysis = video.analysis;
        const sections = ['setup', 'problem', 'solution', 'ending'];
        const metric = value => value == null ? '未提供' : Number(value).toLocaleString('zh-TW');
        const labels = { setup: '開場', problem: '問題／衝突', solution: '解法', ending: '結尾' };
        const category = analysis ? suggestedCategory(video) : null;
        const templateAction = analysis ? `<div class="template-action-bar ${video.template ? 'is-added' : ''}">
            <div class="auto-category"><small>AI 自動歸類</small><strong><i></i>${escapeHtml(video.template?.categoryLabel || category.label)}</strong></div>
            <div class="template-action-copy"><b>${video.template ? '已收進爆點模板庫' : '將分析結構轉為可重複使用的模板'}</b><span>${video.template ? '你可以前往模板庫查看完整時間軸' : '會保留來源、時間戳、標籤與分析結果'}</span></div>
            ${video.template ? `<a class="open-library-button" href="/template">前往模板庫 →</a>` : `<button class="add-template-button" type="button" data-add-template="${escapeHtml(video.id)}" ${video.savingTemplate ? 'disabled' : ''}>${video.savingTemplate ? '正在建立…' : '加入爆點模板庫'}</button>`}
        </div>` : '';
        return `<article class="video-card" id="video-${escapeHtml(video.id)}">
            <div class="video-preview"><iframe loading="lazy" title="${escapeHtml(video.title)}" src="https://www.youtube-nocookie.com/embed/${escapeHtml(video.id)}?rel=0" allowfullscreen></iframe><div><span>YOUTUBE SHORTS</span><time>${escapeHtml(video.durationSeconds)} 秒</time></div></div>
            <div class="video-main">
                <div class="video-meta"><span>${escapeHtml(video.creator)} · ${escapeHtml(new Date(video.publishedAt).toLocaleDateString('zh-TW'))}</span><a href="${escapeHtml(video.url)}" target="_blank" rel="noreferrer">原始影片 ↗</a></div>
                <h3 class="video-title">${escapeHtml(video.title)}</h3>
                <details class="video-description"><summary>影片說明</summary>${escapeHtml(video.description || '未提供')}</details>
                <div class="tag-row">${(video.hashtags || []).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}</div>
                ${analysis ? `<div class="analysis-heading"><span>AI STRUCTURE</span><small>依原片時間戳分析</small></div><div class="analysis-grid">${sections.map(section => renderSection(labels[section], analysis.sections[section])).join('')}</div>` : `<p class="analysis-state"><span class="analysis-spinner"></span>${escapeHtml(video.error || video.state || '等待分析…')}</p>${video.error ? `<button type="button" class="retry-button" data-retry="${escapeHtml(video.id)}">重試此影片</button>` : ''}`}
                <div class="metrics"><span>觀看 <b>${metric(video.stats.views)}</b></span><span>按讚 <b>${metric(video.stats.likes)}</b></span><span>留言 <b>${metric(video.stats.comments)}</b></span><span>分享 <b>${metric(video.stats.shares)}</b></span></div>
                ${templateAction}
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
        const retry = event.target.closest('[data-retry]');
        const addTemplate = event.target.closest('[data-add-template]');
        if (retry) {
            if (button.disabled) return;
            const video = currentVideos.find(item => item.id === retry.dataset.retry);
            if (!video) return;
            button.disabled = true;
            try { await analyze(video); }
            finally { button.disabled = false; count.textContent = `${currentVideos.length} 支影片 · ${currentVideos.filter(v => v.analysis).length} 支分析完成`; }
            return;
        }
        if (addTemplate) {
            const video = currentVideos.find(item => item.id === addTemplate.dataset.addTemplate);
            if (!video?.analysis || video.savingTemplate) return;
            video.savingTemplate = true;
            document.getElementById(`video-${video.id}`).outerHTML = renderVideo(video);
            try {
                const data = await api('/api/discovery/add-template', { video, analysis: video.analysis });
                video.template = data.template;
                message.textContent = `「${video.title}」已自動歸類為「${data.template.categoryLabel}」並加入爆點模板庫。`;
            } catch (error) {
                message.textContent = error.message;
            } finally {
                video.savingTemplate = false;
                document.getElementById(`video-${video.id}`).outerHTML = renderVideo(video);
            }
        }
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
            const meta = data.meta || {};
            const diagnostics = meta.diagnostics;
            let audit = '';
            if (diagnostics) {
                const excluded = diagnostics.excluded || {};
                audit = `已掃描 ${diagnostics.inspected ?? 0} 支、符合 ${diagnostics.matched ?? data.results.length} 支；排除：長度 ${excluded.duration ?? 0}、日期 ${excluded.date ?? 0}、標籤不符 ${excluded.hashtag ?? 0}、無法讀取 ${excluded.unavailable ?? 0}。`;
                if (diagnostics.truncated) audit += ' 已達掃描上限，較舊或較後面的結果可能尚未納入。';
            }
            message.textContent = `${meta.channel ? `搜尋頻道：${meta.channel.title}（${meta.channel.id}）。` : ''}${audit}${audit && meta.warning ? ' ' : ''}${meta.warning || ''}`;
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
