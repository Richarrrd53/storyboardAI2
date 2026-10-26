// Run against a local server: PLAYWRIGHT_MODULE may point to a bundled Playwright.
// BROWSER_EXECUTABLE selects an installed Chrome; screenshots go outside the repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://localhost:3000';
const B = require('../public/js/features/creative-brief');

const ask = { action: 'ask', message: '從可拍攝的小轉變切入，用人物的動作串起故事；明亮自然光能保留親近的電影感。', briefPatch: { subject: '咖啡廳', visualStyle: '明亮電影感', avoid: ['太暗'] }, form: { title: '選擇故事視角', questions: [{ id: 'focus', type: 'single_choice', label: '你希望跟著誰看見這個故事？', description: '視角會影響鏡頭安排。', allowOther: true, recommended: 'customer', options: [ { value: 'customer', label: '顧客的小故事', description: '從街頭的忙碌走入店裡，透過反應呈現放鬆。' }, { value: 'barista', label: '咖啡師的一次沖煮', description: '用手部動作與器具細節呈現製作過程。' } ] }] } };
const ready = { action: 'ready', message: '以入店、沖煮與放鬆的反應串起敘事，保持明亮電影感，避免深黑陰影。', briefPatch: { subject: '咖啡廳', direction: '顧客的小故事', visualStyle: '明亮電影感', avoid: ['太暗'], duration: 30, ratio: '9:16' }, form: null };
const plan = { meta: { title: '一次短暫的休息' }, characters: {}, shots: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, story: `鏡頭 ${i + 1} 的具體畫面`, camera: 'close up', emotion: '平靜', purpose: '推進故事', duration: '3s', dialogue: '', characters: [], shotPrompt: `A bright cafe scene number ${i + 1}, natural daylight, airy composition, no dark shadows` })) };

test('browser: responsive copilot, drafts, answers, planning, retries and SPA handoff', { timeout: 120000 }, async () => {
    const browser = await chromium.launch({ headless: process.env.HEADED !== '1', ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(5000);
    const errors = [], calls = [], aiCalls = [];
    page.on('pageerror', error => errors.push(error.message));
    let mode = 'ask';
    const screenshots = process.env.COPILOT_SCREENSHOTS || await fs.mkdtemp(path.join(os.tmpdir(), 'storyboard-copilot-'));
    await page.route('**/api/creation/copilot', async route => {
        const body = route.request().postDataJSON(); calls.push(body);
        if (mode === 'error') return route.fulfill({ status: 429, json: { error: '配額不足，請稍後重試。' } });
        let response = mode === 'ready' ? ready : mode === 'malformed' ? { action: 'ask', message: '壞資料', form: {} } : mode === 'proposal' ? { ...ask, action: 'propose', form: { title: 'AI 產品介紹提案', questions: [{ ...ask.form.questions[0], type: 'proposal_choice', label: '選擇產品介紹的敘事方式', options: [ { value: 'customer', label: '使用情境', description: '只呈現已知功能的實際使用流程。' }, { value: 'barista', label: '問題與解法', description: '從使用者困境開始，以產品操作回應需求。' } ] }] } } : ask;
        if (mode === 'long') response = { ...ask, message: '<script>window.__executed=true</script>' + '用具體動作與場景說明創作方向。'.repeat(40), form: { title: '長文字驗證', questions: [{ ...ask.form.questions[0], id: 'constructor', options: ask.form.questions[0].options.map(o => ({ ...o, label: o.label.repeat(8), description: o.description.repeat(16) })) }] } };
        if (mode === 'multi' || mode === 'free') response = { ...ask, form: { title: '補充創作元素', questions: [{ ...ask.form.questions[0], type: mode === 'multi' ? 'multi_choice' : 'free_text', min: 1, max: 2 }] } };
        await route.fulfill({ json: { ...response, requestId: body.requestId, revision: body.revision } });
    });
    await page.route('**/api/ask-gemini', async route => {
        const body = route.request().postDataJSON(); aiCalls.push(body);
        await route.fulfill({ json: { response: JSON.stringify(plan) } });
    });
    await page.route('**/api/get-templates', route => route.fulfill({ json: [] }));
    const start = async story => {
        await page.goto(base + '/html/generate.html', { waitUntil: 'domcontentloaded' });
        await page.locator('#story-input').fill(story);
        await page.locator('#composer-submit-btn').click();
        await page.locator('#creative-copilot form').first().waitFor();
    };
    try {
        await start('咖啡廳影片，明亮電影感，不要太暗。');
        await page.locator('.copilot-option').first().waitFor();
        for (const [width, height] of [[1440, 900], [1280, 800], [390, 844], [375, 667]]) {
            await page.setViewportSize({ width, height });
            await page.locator('#creative-copilot').scrollIntoViewIfNeeded();
            await page.screenshot({ path: path.join(screenshots, `${width}x${height}.png`), fullPage: true });
            const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('.copilot-option')].some(e => e.scrollWidth > e.clientWidth + 1) }));
            assert.ok(dimensions.scroll <= dimensions.width, JSON.stringify(dimensions));
            assert.equal(dimensions.overflow, false);
            await page.locator('#copilot-message').fill('不要硬性推銷');
            await page.locator('[data-copilot=advance]').scrollIntoViewIfNeeded();
            assert.equal(await page.locator('[data-copilot=advance]').isVisible(), true);
        }
        await page.locator('.copilot-option').first().click();
        assert.equal(calls.length, 1);
        assert.equal(await page.evaluate(() => CreationSessionStore.creativeBrief.answers.length), 0);
        mode = 'ready';
        await page.locator('#copilot-answer-form button[type=submit]').click();
        await page.waitForFunction(() => CreationSessionStore.copilot.response?.action === 'ready');
        assert.equal(calls.length, 2);
        assert.equal(calls[1].brief.answers[0].values[0].value, 'customer');
        await page.locator('[data-copilot=advance]').click();
        await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);
        assert.equal(await page.evaluate(() => CreationSessionStore.ratio), '直向9:16');
        await page.locator('#btn-direction-next').click();
        await page.waitForFunction(() => GenerationTask.getState().status === 'awaiting_confirmation');
        assert.equal(aiCalls.length, 1); assert.equal(aiCalls[0].type, 'story');
        assert.match(aiCalls[0].question, /顧客的小故事/); assert.match(aiCalls[0].question, /不要硬性推銷/);
        assert.ok(!aiCalls[0].question.includes('deep shadows'));
        assert.equal(await page.locator('#plan-shots [data-shot-index]').count(), 10);

        // Complete input can be immediately ready; skip needs no copilot request.
        const beforeSkip = calls.length;
        await page.goto(base + '/html/generate.html', { waitUntil: 'domcontentloaded' });
        await page.locator('#story-input').fill('完整需求，直接創作');
        await page.locator('#btn-skip-copilot').click();
        assert.equal(calls.length, beforeSkip);
        await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);

        mode = 'error'; await start('想拍一支影片');
        await page.locator('#creative-copilot [role=alert]').waitFor();
        await page.screenshot({ path: path.join(screenshots, 'error.png'), fullPage: true });
        assert.equal(await page.locator('#story-input').inputValue(), '想拍一支影片');
        mode = 'ready'; await page.locator('[data-copilot=retry]').click();
        await page.waitForFunction(() => CreationSessionStore.copilot.response?.action === 'ready');
        assert.equal(calls.at(-1).requestId, calls.at(-2).requestId);

        mode = 'malformed'; await start('模糊想法');
        await page.locator('#creative-copilot [role=alert]').waitFor();
        assert.equal(await page.locator('.copilot-option').count(), 0);

        mode = 'proposal'; await start('AI 產品介紹，不要虛構功能');
        await page.locator('.copilot-option').first().waitFor();
        assert.match(await page.locator('#creative-copilot').innerText(), /問題與解法/);
        await page.screenshot({ path: path.join(screenshots, 'proposal-long.png'), fullPage: true });

        mode = 'long'; await start('長文字與不可信內容驗證');
        await page.locator('.copilot-option').first().waitFor();
        assert.equal(await page.evaluate(() => window.__executed), undefined);
        assert.equal(await page.locator('#creative-copilot script').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(screenshots, 'long-text.png'), fullPage: true });

        mode = 'multi'; await start('大學生創業，笑點可以來自團隊互動或理想與現實反差');
        await page.locator('.copilot-option').first().waitFor();
        const beforeMulti = calls.length;
        await page.locator('.copilot-option').nth(0).click(); await page.locator('.copilot-option').nth(1).click();
        assert.equal(calls.length, beforeMulti);
        mode = 'ready'; await page.locator('#copilot-answer-form button[type=submit]').click();
        await page.waitForFunction(() => CreationSessionStore.copilot.response?.action === 'ready');
        assert.equal(calls.at(-1).brief.answers[0].values.length, 2);

        mode = 'free'; await start('自由補充想法');
        await page.locator('[data-other=focus]').fill('只拍攝兩位角色，室內自然光');
        // A reduced visual viewport exercises focus and scrolling with keyboard-sized space.
        await page.setViewportSize({ width: 375, height: 367 });
        mode = 'ready'; await page.locator('#copilot-answer-form button[type=submit]').click();
        await page.waitForFunction(() => CreationSessionStore.copilot.response?.action === 'ready');
        assert.match(calls.at(-1).brief.answers[0].other, /兩位角色/);
        await page.setViewportSize({ width: 375, height: 667 });

        // Real SPA shell with isolated auth and project reads.
        await page.addInitScript(() => localStorage.setItem('spa_auth_token', 'browser-test'));
        await page.route('**/api/auth/me', route => route.fulfill({ json: { user: { id: 'ui', name: 'UI Test' } } }));
        await page.route('**/api/projects**', route => route.fulfill({ json: { projects: [] } }));
        await page.goto(base + '/html/index.html#/generate', { waitUntil: 'domcontentloaded' });
        await page.locator('#story-input').waitFor();
        mode = 'ask';
        await page.locator('#story-input').fill('大學生創業，幽默但專業');
        await page.locator('#composer-submit-btn').click();
        await page.locator('.copilot-option').first().waitFor();
        const beforeRoute = calls.length;
        await page.evaluate(() => spaNavigate('dashboard'));
        await page.evaluate(() => spaNavigate('generate'));
        await page.locator('.copilot-option').first().waitFor();
        assert.equal(calls.length, beforeRoute);
        await page.locator('.copilot-option').first().click();
        mode = 'ready'; await page.locator('#copilot-answer-form button[type=submit]').click();
        await page.waitForFunction(() => CreationSessionStore.copilot.response?.action === 'ready');
        await page.locator('.copilot-history summary').click();
        await page.locator('[data-edit-answer="0"]').fill('改成團隊成員的互動，不用顧客故事');
        await page.locator('[data-save-answer="0"]').click();
        assert.match(await page.evaluate(() => CreationSessionStore.creativeBrief.answers[0].other), /團隊成員/);
        await page.evaluate(() => spaNavigate('dashboard'));
        mode = 'ask';
        await page.evaluate(() => CreationController.submitFromQuickCompose('全新的 AI 產品企劃'));
        await page.locator('.copilot-option').first().waitFor();
        assert.equal(await page.evaluate(() => CreationSessionStore.creativeBrief.originalStory), '全新的 AI 產品企劃');
        assert.equal(await page.evaluate(() => CreationSessionStore.creativeBrief.answers.length), 0);
        assert.deepEqual(errors, []);
        console.log('Screenshots:', screenshots);
    } finally { await browser.close(); }
});
