// Local browser regression. Set PLAYWRIGHT_MODULE and optionally BROWSER_EXECUTABLE.
// Screenshots use a temporary directory, removed unless COPILOT_SCREENSHOTS is explicit.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://localhost:3000';
const ask = { action: 'ask', message: '可以讓觀眾像是坐在朋友旁邊，用交談中的動作和反應帶出故事。', briefPatch: { subject: '飲品廣告', visualStyle: '明亮電影感', styleNotes: '自然光、生活紀錄感', avoid: ['太暗'] }, form: { title: '找到敘事方向', questions: [{ id: 'focus', type: 'single_choice', label: '你希望用哪種方式進入故事？', description: '視角與節奏會改變故事的重心。', options: [
    { value: 'friends', label: '朋友聚會的桌邊互動', description: '讓動作與對話自然連結，飲品融入互動。' },
    { value: 'object', label: '物件串起的一天', description: '讓同一件物品連結不同時間與人物。' },
    { value: 'contrast', label: '期待與現實的反差', description: '用同一個人的前後反應建立幽默。' }
] }] } };
const ready = { action: 'ready', message: '那就從朋友聚會切入。保留一點隨手拍攝的自然感，讓桌邊的吐槽與笑聲成為重心，飲品自然出現在互動中。', briefPatch: { subject: '飲品廣告', direction: '朋友聚會的桌邊互動', baseStyle: 'cinematic', visualStyle: '明亮電影感', styleNotes: '自然光、生活紀錄感', avoid: ['太暗'], duration: 30, ratio: '9:16', settingsReason: '直式構圖能保留人物細微反應，30 秒可完成一次互動。', visualKeywords: ['玻璃杯', '桌邊交談'] }, form: null };
const plan = { meta: { title: '朋友的一次聚會' }, characters: [], shots: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, story: `桌邊的具體動作 ${i + 1}`, camera: 'close up', emotion: '輕鬆', purpose: '推進互動', duration: '3s', dialogue: '', characters: [], shotPrompt: `A bright table scene number ${i + 1}, natural daylight, airy composition, no dark shadows` })) };
const template = { id: 'fixed-template', name: '固定鏡頭順序', category: 'general', structure: [{ action: '第一個動作', camera: 'wide', duration: '3s' }, { action: '第二個動作', camera: 'close up', duration: '4s' }] };

test('browser: round-two copilot, real loader, automatic settings, structured planning and SPA safety', { timeout: 150000 }, async () => {
    const browser = await chromium.launch({ headless: process.env.HEADED !== '1', ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(); page.setDefaultTimeout(7000);
    const errors = [], calls = [], aiCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    let mode = 'ask', release = null, hold = false, planningBad = false;
    let imageAttempts = 0, releaseImage = null;
    const screenshots = process.env.COPILOT_SCREENSHOTS || await fs.mkdtemp(path.join(os.tmpdir(), 'storyboard-copilot-'));
    await fs.mkdir(screenshots, { recursive: true });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    // Use the installed GSAP release for offline route checks, including the landing page.
    for (const name of ['gsap', 'ScrollTrigger', 'ScrollToPlugin']) {
        const source = await fs.readFile(require.resolve(`gsap/dist/${name}.js`), 'utf8');
        await page.route(`https://cdn.skypack.dev/${name === 'gsap' ? 'gsap' : 'gsap/' + name}`, route => route.fulfill({ contentType: 'application/javascript', body: `const module = {exports:{}}; const exports = module.exports;\n${source}\nwindow.${name} = module.exports.${name}; export default module.exports.${name};` }));
    }
    await page.route('**/api/creation/copilot', async route => {
        const body = route.request().postDataJSON(); calls.push(body);
        if (hold) await new Promise(resolve => { release = resolve; });
        if (mode === 'error') return route.fulfill({ status: 429, json: { error: '配額不足，請稍後重試。' } });
        if (mode === 'timeout') return route.fulfill({ status: 504, json: { code: 'AI_UPSTREAM_TIMEOUT', error: '思考時間較長，請重試；你的選擇已保留。' } });
        let response = mode === 'ready' ? ready : mode === 'malformed' ? { action: 'ask', message: '格式錯誤', form: {} } : ask;
        if (mode === 'next') response = { ...ask, message: '桌邊互動可以用反應鏡頭建立節奏，再確認對話與動作的比例。' };
        if (mode === 'multi' || mode === 'free' || mode === 'proposal') response = { ...ask, action: mode === 'proposal' ? 'propose' : 'ask', form: { title: '補充創作元素', questions: [{ ...ask.form.questions[0], type: { multi: 'multi_choice', free: 'free_text', proposal: 'proposal_choice' }[mode], min: 0, max: 3 }] } };
        if (mode === 'long') response = { ...ask, message: '<script>window.__executed=true</script>' + '用具體的可見動作連接鏡頭。'.repeat(35), form: { title: '長文字測試', questions: [{ ...ask.form.questions[0], id: 'constructor', options: ask.form.questions[0].options.map(o => ({ ...o, description: o.description.repeat(25) })) }] } };
        if (mode === 'ready') await page.evaluate(() => { window.__beforeReadyScroll = scrollY; });
        await route.fulfill({ json: { ...response, thoughtSummaries: mode === 'ready' ? ['Provider fixture summary; isolated browser test.'] : [], requestId: body.requestId, revision: body.revision } });
    });
    await page.route('**/api/ask-gemini', async route => {
        const body = route.request().postDataJSON(); aiCalls.push(body);
        if (body.type === 'image') {
            imageAttempts++;
            if (imageAttempts === 2) return route.fulfill({ status: 503, json: { code: 'AI_UPSTREAM_UNAVAILABLE' } });
            if (imageAttempts === 3) {
                await new Promise(resolve => {
                    releaseImage = resolve;
                    page.evaluate(() => { window.__imageRetryArrived = true; });
                });
            }
        }
        const response = body.type === 'image' ? { image: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOioAAAAASUVORK5CYII='] } : { response: JSON.stringify(planningBad ? { ...plan, characters: { hero: 'invalid' } } : plan), thoughtSummaries: ['Real-provider-parts fixture for planning.'] };
        await route.fulfill({ json: response });
    });
    await page.route('**/api/get-templates', route => route.fulfill({ json: [template] }));
    const openGenerate = async () => {
        await page.goto(base + '/html/generate.html', { waitUntil: 'domcontentloaded' });
        await page.locator('#generate-workspace[data-ready]').waitFor();
    };
    const start = async story => {
        await openGenerate();
        await page.locator('#story-input').fill(story); await page.locator('#composer-submit-btn').click();
        await page.waitForFunction(() => CreationSessionStore.copilot?.active);
        if (!hold) await page.waitForFunction(() => !CreationSessionStore.copilot.busy);
    };
    const settled = () => page.waitForFunction(() => [...document.querySelectorAll('#creation-surface')].every(el => el.getAnimations({ subtree: true }).every(a => a.playState !== 'running')));
    try {
        hold = true;
        const story = '藏鏡人視角的飲品影片，朋友聚會，明亮自然電影感，不要太暗。';
        await start(story);
        await page.evaluate(() => { window.__persistentIdea = document.querySelector('.copilot-user-message'); });
        await page.waitForFunction(() => !!document.querySelector('.ai-activity-panel .math-loader-path')?.getAttribute('d'));
        assert.match(await page.locator('.ai-activity-panel').innerText(), /已收到你的創作想法/);
        assert.equal(await page.locator('.copilot-brief').count(), 0);
        assert.equal(await page.locator('.copilot-history').isVisible(), false);
        assert.ok(!(await page.locator('.ai-activity-panel').innerText()).includes('Gemini'));
        assert.equal(await page.evaluate(() => document.querySelector('.copilot-user-message').getAnimations().some(a => a.playState === 'running')), true);
        assert.equal(await page.locator('#phase1-composer').isVisible(), false);
        assert.equal(await page.locator('.copilot-user-message p').textContent(), story);
        assert.equal(await page.locator('.copilot-option').count(), 0);
        await page.screenshot({ path: path.join(screenshots, 'thinking.png'), fullPage: true });
        hold = false; release();
        await page.waitForFunction(() => CreationSessionStore.copilot.phase === 'responded');
        assert.equal(await page.locator('.copilot-heading h2').textContent(), '創作助手');
        assert.equal(await page.locator('#creative-copilot').getAttribute('aria-label'), 'AI 創作討論');
        assert.doesNotMatch(await page.locator('#creative-copilot').innerText(), /Ask Gemini|Gemini/);
        assert.equal(await page.evaluate(() => AskGeminiConversation === CreativeCopilot), true);
        assert.equal(await page.locator('#creative-copilot .ai-activity-panel').count(), 0);
        assert.equal(await page.locator('.ai-thought-summary').count(), 0);
        for (const [width, height] of [[1440, 900], [1280, 800], [390, 844], [375, 667]]) {
            await page.setViewportSize({ width, height }); await settled();
            await page.screenshot({ path: path.join(screenshots, `${width}x${height}.png`), fullPage: true });
            assert.equal(await page.locator('.copilot-option').count(), 4);
            assert.equal(await page.locator('[data-other=focus]').isVisible(), false);
            assert.equal(await page.locator('#copilot-message').count(), 0);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        const beforeDraft = calls.length;
        await page.locator('.copilot-option').nth(3).click();
        await page.locator('[data-other=focus]').fill('把鏡頭留在餐桌旁，保留杯子細節');
        await page.locator('.copilot-option').first().click();
        assert.equal(await page.locator('[data-other=focus]').isVisible(), false);
        await page.locator('.copilot-option').nth(3).click();
        assert.match(await page.locator('[data-other=focus]').inputValue(), /餐桌旁/);
        await page.locator('.copilot-option').first().click();
        assert.equal(calls.length, beforeDraft);
        assert.equal(await page.evaluate(() => CreationSessionStore.creativeBrief.answers.length), 0);
        mode = 'timeout'; await page.locator('#copilot-answer-form button[type=submit]').click();
        await page.locator('#creative-copilot [role=alert]').waitFor();
        assert.equal(await page.evaluate(() => CreationSessionStore.creativeBrief.answers.length), 1);
        assert.equal(calls.at(-1).brief.answers[0].values[0].value, 'friends');
        const failed = calls.at(-1);
        mode = 'next'; await page.locator('[data-copilot=retry]').click();
        await page.waitForFunction(() => !CreationSessionStore.copilot.busy);
        assert.deepEqual(calls.at(-1), failed);
        assert.equal(await page.evaluate(() => CreationSessionStore.creativeBrief.answers.length), 1);
        assert.equal(await page.evaluate(() => CreationSessionStore.currentPhase), 1);
        assert.equal(calls.at(-1).brief.answers[0].values[0].value, 'friends');
        assert.equal(calls.at(-1).brief.answers[0].other, '');
        assert.match(await page.locator('.copilot-message').textContent(), /桌邊互動/);
        const beforeContinue = calls.length;
        await page.locator('[data-copilot=continue]').click();
        assert.equal(calls.length, beforeContinue);
        await page.locator('#copilot-answer-form button[type=submit]').click();
        assert.equal(calls.length, beforeContinue);
        await page.locator('#copilot-message').fill('不要硬性推銷，只拍攝雙手與桌面的物件。');
        const ideaTop = await page.locator('.copilot-user-message').evaluate(el => el.getBoundingClientRect().top + scrollY);
        mode = 'ready'; await page.locator('#copilot-answer-form button[type=submit]').click();
        await page.waitForFunction(() => CreationSessionStore.currentPhase === 2); await settled();
        assert.equal(await page.locator('#creation-discussion-stack').isVisible(), true);
        assert.equal(await page.evaluate(() => document.querySelector('.copilot-user-message') === __persistentIdea), true);
        assert.equal(await page.locator('.copilot-stack-supplements .copilot-stack-card').count(), 2);
        assert.equal(await page.locator('.copilot-brief').count(), 0);
        assert.equal(await page.locator('.phase-exit-layer .copilot-stack').count(), 0);
        assert.equal(await page.locator('#story-context-header').isVisible(), false);
        assert.ok(Math.abs(await page.locator('.copilot-user-message').evaluate(el => el.getBoundingClientRect().top + scrollY) - ideaTop) < 1);
        assert.ok(Math.abs(await page.evaluate(() => scrollY - __beforeReadyScroll)) < 1);
        assert.equal(await page.locator('#direction-ai-text').textContent(), ready.message);
        assert.equal(await page.locator('#direction-style-notes').inputValue(), ready.briefPatch.styleNotes);
        assert.equal(await page.evaluate(() => CreationSessionStore.story), story);
        assert.equal(await page.evaluate(() => CreationSessionStore.styleIndex), 1);
        assert.equal(await page.evaluate(() => CreationSessionStore.ratio), '直向9:16');
        assert.equal(await page.locator('#direction-thought-summary summary').count(), 1);
        assert.equal(await page.locator('#direction-thought-summary summary').textContent(), '思考摘要');
        assert.doesNotMatch(await page.locator('#phase-panel-2').innerText(), /Ask Gemini|Gemini/);
        await page.screenshot({ path: path.join(screenshots, 'settings.png'), fullPage: true });
        const settingsCalls = calls.length;
        assert.equal(await page.locator('#direction-style-notes').isVisible(), false);
        assert.equal(await page.locator('#direction-avoid').isVisible(), false);
        assert.equal(await page.locator('#direction-style-notes-summary').textContent(), ready.briefPatch.styleNotes);
        await page.locator('#direction-style-conditions > summary').click();
        await page.locator('#direction-style-notes').fill('明亮自然光，保留手部動作');
        assert.equal(await page.locator('#direction-style-notes-summary').textContent(), '明亮自然光，保留手部動作');
        await page.locator('#direction-style-conditions > summary').click();
        assert.equal(await page.locator('#direction-style-notes').isVisible(), false);
        await page.locator('#direction-avoid-conditions > summary').click();
        await page.locator('#direction-avoid').fill('太暗、過度商業化');
        await page.locator('#direction-avoid-conditions > summary').click();
        assert.equal(await page.locator('#direction-avoid-summary').textContent(), '太暗、過度商業化');
        await page.locator('#btn-direction-discuss').click();
        assert.equal(await page.evaluate(() => CreationSessionStore.currentPhase), 1);
        assert.equal(await page.evaluate(() => document.querySelector('.copilot-user-message') === __persistentIdea), true);
        await page.locator('#creative-copilot [data-copilot=advance]').click();
        await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);
        assert.equal(await page.locator('#direction-style-notes-summary').textContent(), '明亮自然光，保留手部動作');
        await page.locator('.ratio-chip[data-ratio="橫向16:9"]').click();
        assert.equal(calls.length, settingsCalls);
        await page.locator('#btn-direction-next').click();
        await page.waitForFunction(() => GenerationTask.getState().status === 'awaiting_confirmation');
        assert.equal(aiCalls.length, 1); assert.equal(aiCalls[0].contract, 'freeform-v2');
        assert.match(aiCalls[0].question, /不要硬性推銷/); assert.match(aiCalls[0].question, /明亮自然光，保留手部動作/);
        assert.match(aiCalls[0].question, /過度商業化/);
        assert.equal(aiCalls[0].ratio, '橫向16:9');
        assert.equal(await page.locator('#plan-shots [data-shot-index]').count(), 10);
        assert.equal(await page.locator('#plan-thought-summary summary').count(), 1);
        assert.equal(aiCalls.filter(c => c.type === 'image').length, 0);
        await page.locator('#btn-confirm-plan').click();
        await page.waitForFunction(() => GenerationTask.getState().progress.statusText.includes('伺服器繁忙'));
        await page.getByText(/伺服器繁忙，約 10 秒後自動重試鏡頭 2/).waitFor();
        await page.waitForFunction(() => GenerationTask.getState().progress.completed === 1);
        await page.waitForFunction(() => window.__imageRetryArrived, null, { timeout: 15000 });
        releaseImage();
        await page.waitForFunction(() => GenerationTask.getState().status === 'completed');
        const imageCalls = aiCalls.filter(c => c.type === 'image');
        assert.equal(imageCalls.length, 11);
        assert.deepEqual(imageCalls[1], imageCalls[2]);
        assert.ok(aiCalls.filter(c => c.type === 'image').every(c => c.ratio === '橫向16:9' && !c.question.includes('film noir vibes')));

        await openGenerate();
        await page.locator('#story-input').fill('直接創作'); await page.locator('#btn-skip-copilot').click();
        assert.equal(await page.evaluate(() => CreationSessionStore.ratio), '直向9:16');
        assert.equal(calls.length, settingsCalls);
        await openGenerate();
        await page.locator('#story-input').fill('16:9 的 YouTube 橫向影片，30 秒'); await page.locator('#btn-skip-copilot').click();
        assert.equal(await page.evaluate(() => CreationSessionStore.ratio), '橫向16:9');
        planningBad = true; await page.locator('#btn-direction-next').click();
        await page.waitForFunction(() => GenerationTask.getState().status === 'error');
        assert.equal(await page.evaluate(() => CreationSessionStore.currentPhase), 4);
        assert.equal(await page.locator('#phase-panel-2').isVisible(), false);
        assert.equal(await page.locator('#generation-error-banner').isVisible(), true);
        await page.screenshot({ path: path.join(screenshots, 'planning-error.png'), fullPage: true });
        planningBad = false; await page.locator('#btn-retry-generation').click();
        await page.waitForFunction(() => GenerationTask.getState().status === 'awaiting_confirmation');

        mode = 'error'; await start('模糊想法');
        await page.locator('#creative-copilot [role=alert]').waitFor();
        assert.equal(await page.locator('.copilot-user-message p').textContent(), '模糊想法');
        mode = 'ready'; await page.locator('[data-copilot=retry]').click();
        await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);
        assert.equal(calls.at(-1).requestId, calls.at(-2).requestId);
        mode = 'malformed'; await start('格式錯誤測試');
        assert.equal(await page.locator('.copilot-option').count(), 0);
        assert.equal(await page.locator('#creative-copilot [role=alert]').isVisible(), true);
        mode = 'long'; await start('長故事。'.repeat(150));
        assert.equal(await page.evaluate(() => window.__executed), undefined);
        assert.equal(await page.locator('#creative-copilot script').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(screenshots, 'long-text.png'), fullPage: true });
        for (const variant of ['multi', 'free', 'proposal']) {
            mode = variant; await start('創作元素測試');
            if (variant !== 'free') await page.locator('.copilot-option').first().click();
            if (variant === 'multi') { await page.locator('.copilot-option').last().click(); await page.locator('[data-other=focus]').fill('桌邊的玻璃杯'); }
            if (variant === 'free') await page.locator('[data-other=focus]').fill('只拍雙手，不拍攝觀察者');
            await page.setViewportSize({ width: 375, height: 367 });
            mode = 'ready'; await page.locator('#copilot-answer-form button[type=submit]').click();
            await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);
            await page.setViewportSize({ width: 375, height: 667 });
        }

        await page.addInitScript(() => localStorage.setItem('spa_auth_token', 'browser-test'));
        await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'ui', name: 'UI Test' } } }));
        await page.route('**/api/projects**', route => route.fulfill({ json: { projects: [] } }));
        await page.goto(base + '/html/index.html#/generate', { waitUntil: 'domcontentloaded' });
        await page.locator('#generate-workspace[data-ready]').waitFor();
        await page.waitForFunction(() => !document.body.classList.contains('is-navigating') && !document.getElementById('page-content').inert);
        mode = 'ask'; await page.locator('#story-input').fill('大學生創業，幽默但專業'); await page.locator('#composer-submit-btn').click();
        await page.locator('.copilot-option').first().waitFor();
        const beforeRoute = calls.length;
        await page.evaluate(() => spaNavigate('dashboard')); await page.evaluate(() => spaNavigate('generate'));
        await page.locator('.copilot-option').first().waitFor(); assert.equal(calls.length, beforeRoute);
        await page.locator('.copilot-user-message [data-copilot=edit-story]').click();
        await page.locator('#story-input').fill('修改後的原始想法，16:9'); await page.locator('#composer-submit-btn').click();
        await page.waitForFunction(() => !CreationSessionStore.copilot.busy);
        assert.match(await page.locator('.copilot-user-message p').textContent(), /修改後/);
        mode = 'ready';
        await page.locator('#creative-copilot .copilot-option').first().click();
        await page.locator('#copilot-answer-form button[type=submit]').click();
        await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);
        const beforeSettingsRoute = calls.length;
        await page.evaluate(() => spaNavigate('dashboard')); await page.evaluate(() => spaNavigate('generate'));
        await page.locator('#style-cards-grid .style-card').first().waitFor();
        assert.equal(await page.evaluate(() => CreationSessionStore.currentPhase), 2);
        assert.equal(await page.locator('#creation-discussion-stack').isVisible(), true);
        assert.match(await page.locator('.copilot-user-message p').textContent(), /修改後/);
        assert.equal(await page.locator('#direction-style-notes').isVisible(), false);
        assert.equal(calls.length, beforeSettingsRoute);
        await page.locator('.copilot-user-message [data-copilot=edit-story]').click();
        await page.locator('#story-input').waitFor({ state: 'visible' });
        assert.equal(await page.evaluate(() => CreationSessionStore.currentPhase), 1);
        await page.evaluate(() => spaNavigate('dashboard'));
        mode = 'ask'; await page.evaluate(() => CreationController.submitFromQuickCompose('全新的產品企劃'));
        await page.locator('.copilot-option').first().waitFor();
        assert.equal(await page.evaluate(() => CreationSessionStore.creativeBrief.originalStory), '全新的產品企劃');
        assert.equal(await page.evaluate(() => CreationSessionStore.creativeBrief.answers.length), 0);
        assert.equal(await page.evaluate(() => CreationSessionStore.ratio), '直向9:16');
        const beforeTemplate = calls.length;
        await page.evaluate(() => spaNavigate('generate', { templateId: 'fixed-template', force: true }));
        await page.waitForFunction(() => CreationSessionStore.selectedTemplate?.id === 'fixed-template');
        await page.locator('#story-input').fill('模板創作'); await page.locator('#composer-submit-btn').click();
        await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);
        assert.equal(calls.length, beforeTemplate);
        assert.equal(await page.locator('#creative-copilot').isVisible(), false);
        assert.deepEqual(await page.evaluate(() => CreationSessionStore.selectedTemplate.structure.map(s => s.action)), ['第一個動作', '第二個動作']);

        await page.emulateMedia({ reducedMotion: 'reduce' });
        mode = 'ask'; await start('低動態效果測試');
        assert.equal(await page.locator('.ai-activity-exit').count(), 0);
        hold = true; await start('取消中的新企劃，45 秒');
        await page.waitForFunction(() => CreationSessionStore.copilot.busy);
        await page.locator('[data-copilot=advance]').click();
        await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);
        hold = false; mode = 'ready'; if (release) release();
        await page.waitForFunction(() => !CreationSessionStore.copilot.busy);
        assert.equal(await page.evaluate(() => CreationSessionStore.duration), 45);
        assert.equal(await page.evaluate(() => CreationSessionStore.copilot.response), null);

        // Every router page shares an exit-before-teardown and a visible, interactive entry.
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.route('**/api/discovery/skills', route => route.fulfill({ json: { skills: [], configured: false } }));
        await page.route('**/api/projects/motion-check', route => route.fulfill({ json: { project: { id: 'motion-check', shortId: 'motion-check', title: '頁面轉場測試', style: '預設風格', ratio: '9:16', createAt: '2026-10-26T00:00:00Z', characters: {}, shots: [], tags: [] } } }));
        await page.goto(base + '/html/index.html#/dashboard', { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!window.spaNavigate && !document.body.classList.contains('is-navigating'));
        for (const route of ['projects', 'history', 'template', 'discovery', 'project', 'generate', 'login', 'register', 'landing', 'dashboard']) {
            await page.evaluate(async name => { await spaNavigate(name, name === 'project' ? { id: 'motion-check' } : {}); }, route);
            const state = await page.locator('#page-content').evaluate(el => ({ inert: el.inert, opacity: getComputedStyle(el).opacity, text: el.innerText.trim().length, transitioning: getComputedStyle(el).transitionProperty }));
            assert.equal(state.inert, false, route);
            assert.ok(state.text > 0, route);
            assert.ok(state.transitioning.includes('opacity'), route);
            await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('page-content')).opacity) > .99);
            await page.screenshot({ path: path.join(screenshots, `route-${route}.png`) });
        }
        assert.deepEqual(errors, []);
        console.log('Screenshots:', screenshots);
    } finally {
        if (release) release();
        if (errors.length) console.error('Browser errors:', errors);
        await browser.close();
        if (!process.env.COPILOT_SCREENSHOTS) await fs.rm(screenshots, { recursive: true, force: true });
    }
});
