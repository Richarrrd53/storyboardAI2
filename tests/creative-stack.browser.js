// Real motion regression; no real model requests. Uses the same Playwright environment as copilot.browser.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://localhost:3000';
const proposal = { action: 'propose', message: '從朋友遞過杯子的動作切入，用反應鏡頭留下聚會的自然感。', briefPatch: { tone: '自然溫暖', avoid: ['太暗'] }, form: { title: '選擇敘事方式', questions: [{ id: 'occasion', type: 'proposal_choice', label: '希望怎麼展開？', options: [
    { value: 'friends', label: '朋友聚會的桌邊互動', description: '以遞杯、笑聲與反應連結鏡頭。' },
    { value: 'objects', label: '物件串起的一天', description: '讓同一只杯子連結不同情境。' },
    { value: 'contrast', label: '期待與現實的反差', description: '透過人物前後反應建立幽默。' }
] }] } };
const ready = { action: 'ready', message: '用自然光保留桌邊的手部動作，讓反應鏡頭形成節奏。', briefPatch: { baseStyle: 'cinematic', ratio: '9:16', duration: 30 } };

test('Creative Stack: four viewports, moving cards, captions, retries, edits, fast results and cleanup', { timeout: 180000 }, async () => {
    const browser = await chromium.launch({ headless: process.env.HEADED !== '1', ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
    const context = await browser.newContext();
    const page = await context.newPage(); page.setDefaultTimeout(8000);
    const screenshots = process.env.STACK_SCREENSHOTS || await fs.mkdtemp(path.join(os.tmpdir(), 'storyboard-stack-'));
    await fs.mkdir(screenshots, { recursive: true });
    const errors = [], calls = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window), timers = new Set();
        window.__captionTimers = timers;
        window.setTimeout = (fn, ms, ...args) => {
            let id;
            id = set(() => { timers.delete(id); fn(...args); }, ms);
            if (fn.name === 'rotate') timers.add(id);
            return id;
        };
        window.clearTimeout = id => { timers.delete(id); clear(id); };
    });
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    for (const name of ['gsap', 'ScrollTrigger', 'ScrollToPlugin']) {
        const source = await fs.readFile(require.resolve(`gsap/dist/${name}.js`), 'utf8');
        await page.route(`https://cdn.skypack.dev/${name === 'gsap' ? 'gsap' : 'gsap/' + name}`, route => route.fulfill({ contentType: 'application/javascript', body: `const module={exports:{}};const exports=module.exports;\n${source}\nwindow.${name}=module.exports.${name};export default module.exports.${name};` }));
    }
    await page.route('**/api/get-templates', route => route.fulfill({ json: [] }));
    let pending = null, mode = 'proposal';
    await page.route('**/api/creation/copilot', async route => {
        const body = route.request().postDataJSON(); calls.push(body);
        await new Promise(resolve => { pending = resolve; });
        if (mode === 'timeout') return route.fulfill({ status: 504, json: { code: 'AI_UPSTREAM_TIMEOUT', error: '思考時間較長；你的選擇已保留，可以重試。' } });
        let result = structuredClone(mode === 'ready' ? ready : proposal);
        if (mode === 'multi' || mode === 'free') {
            result.action = 'ask'; result.form.questions[0].id = mode === 'multi' ? 'visuals' : 'details';
            Object.assign(result.form.questions[0], { type: mode === 'multi' ? 'multi_choice' : 'free_text', min: 0, max: 3 });
        }
        await route.fulfill({ json: { ...result, requestId: body.requestId, revision: body.revision } });
    });
    async function release(nextMode) {
        if (nextMode) mode = nextMode;
        await page.waitForFunction(() => CreationSessionStore.copilot?.busy);
        while (!pending) await new Promise(resolve => setTimeout(resolve, 10));
        const resolve = pending; pending = null; resolve();
        await page.waitForFunction(() => !CreationSessionStore.copilot.busy);
    }
    async function start(story) {
        await page.goto(base + '/html/generate.html', { waitUntil: 'domcontentloaded' });
        await page.locator('#generate-workspace[data-ready]').waitFor();
        await page.locator('#story-input').fill(story); await page.locator('#composer-submit-btn').click();
        await page.waitForFunction(() => CreationSessionStore.copilot?.busy);
        await page.waitForFunction(() => document.querySelector('.ai-activity-panel .math-loader-path')?.getAttribute('d'));
    }
    async function settle() { await page.waitForFunction(() => !document.querySelector('.copilot-archive-flight')); }
    async function screenshot(name) { await page.screenshot({ path: path.join(screenshots, name + '.png'), fullPage: true }); }
    try {
        for (const [index, [width, height]] of [[1440, 900], [1280, 800], [390, 844], [375, 667]].entries()) {
            await page.setViewportSize({ width, height });
            const story = index === 3 ? '原始想法：' + '拍朋友聚會，保留自然光與手部動作，不要太暗。'.repeat(35) : '一支朋友聚會的咖啡廳短片，保留自然光與生活感。';
            await start(story);
            const initial = await page.evaluate(() => {
                const root = document.querySelector('#creative-copilot'), card = document.querySelector('.copilot-user-message'), loader = root.querySelector('.math-loader-box'), caption = root.querySelector('.ai-thinking-caption');
                window.__originalCard = card;
                return { root: root.clientWidth, card: card.getBoundingClientRect().width, loader: loader.getBoundingClientRect().width, svg: loader.querySelector('svg').getBoundingClientRect().width,
                    captionHeight: caption.clientHeight, lineHeight: parseFloat(getComputedStyle(caption).lineHeight),
                    mask: getComputedStyle(caption).maskImage, nowrap: getComputedStyle(caption.firstElementChild).whiteSpace,
                    suck: root.querySelectorAll('.math-loader-sucked').length, timerCount: __captionTimers.size };
            });
            assert.ok(Math.abs(initial.root - initial.card) < 1);
            assert.equal(initial.loader, 40); assert.equal(initial.svg, 40); assert.equal(initial.suck, 0);
            assert.equal(initial.nowrap, 'nowrap'); assert.ok(initial.mask.includes('linear-gradient'));
            assert.ok(Math.abs(initial.captionHeight - initial.lineHeight) <= 1); assert.equal(initial.timerCount, 1);
            assert.equal(await page.locator('.copilot-history').isVisible(), false);
            assert.equal(await page.locator('.copilot-brief-slot').isVisible(), false);
            assert.equal(await page.locator('.copilot-user-message p').textContent(), story);
            if (index === 0) {
                const first = await page.locator('.ai-thinking-caption').innerText();
                await page.waitForFunction(text => document.querySelector('.ai-thinking-caption').innerText !== text, first);
                const rotation = await page.locator('.ai-thinking-caption').evaluate(el => ({ children: el.children.length, animations: el.getAnimations({ subtree: true }).length }));
                assert.ok(rotation.children <= 2); assert.ok(rotation.animations >= 1);
            }
            await screenshot(width + '-thinking'); await release('proposal');
            await page.waitForFunction(() => CreationSessionStore.copilot.phase === 'responded');
            assert.equal(await page.evaluate(() => __captionTimers.size), 0);
            assert.equal(await page.locator('.copilot-brief').count(), 0);
            assert.equal(await page.locator('.copilot-brief-slot').isVisible(), false);
            assert.equal(await page.evaluate(() => document.querySelector('.copilot-user-message') === __originalCard), true);
            await page.locator('#creative-copilot .copilot-option').first().click();
            const source = await page.locator('#creative-copilot .copilot-option').first().boundingBox();
            await page.locator('#copilot-answer-form button[type=submit]').click();
            await page.locator('.copilot-archive-flight').waitFor();
            const from = await page.locator('.copilot-archive-flight').evaluate(el => {
                window.__flightAnimations = el.getAnimations({ subtree: true });
                __flightAnimations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
                return { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, width: el.getBoundingClientRect().width,
                    parent: el.parentElement.className, z: Number(getComputedStyle(el).zIndex) };
            });
            // Playwright may scroll the confirm button into view; compare against the captured live source in the controller.
            assert.ok(Math.abs(from.width - source.width) < 2);
            assert.equal(from.parent, 'copilot-stack'); assert.equal(from.z, 3);
            await screenshot(width + '-archive-start');
            await page.evaluate(() => __flightAnimations.forEach(animation => { animation.currentTime = 250; }));
            const middle = await page.locator('.copilot-archive-flight').boundingBox();
            assert.ok(Math.abs(middle.y - from.y) + Math.abs(middle.x - from.x) > 5);
            assert.equal(await page.locator('.copilot-stack-card[data-archiving]').evaluate(el => getComputedStyle(el).visibility), 'hidden');
            await page.evaluate(() => { CreativeCopilot.render(); CreativeCopilot.render(); });
            assert.equal(await page.locator('.copilot-archive-flight').count(), 1);
            assert.equal(await page.evaluate(() => __captionTimers.size), 1);
            await screenshot(width + '-archive-middle');
            await page.evaluate(() => __flightAnimations.forEach(animation => animation.finish())); await settle();
            const stack = await page.evaluate(() => {
                const main = document.querySelector('.copilot-user-message'), card = document.querySelector('.copilot-stack-supplements .copilot-stack-card');
                return { mainWidth: main.getBoundingClientRect().width, width: card.getBoundingClientRect().width, overlap: main.getBoundingClientRect().bottom - card.getBoundingClientRect().top,
                    zMain: Number(getComputedStyle(main).zIndex), zCard: Number(getComputedStyle(card).zIndex), original: main === __originalCard,
                    animations: main.getAnimations().filter(animation => animation.playState === 'running').length, overflow: document.documentElement.scrollWidth > innerWidth,
                    opaque: getComputedStyle(main).backgroundColor, overlapOwner: document.elementFromPoint(card.getBoundingClientRect().left + 16, card.getBoundingClientRect().top + 2)?.closest('.copilot-user-message') === main };
            });
            assert.ok(Math.abs(stack.width / stack.mainWidth - .94) < .005); assert.ok(Math.abs(stack.overlap - 5.2) < .1);
            assert.ok(stack.zMain > stack.zCard); assert.equal(stack.original, true); assert.equal(stack.animations, 0); assert.equal(stack.overflow, false);
            assert.equal(stack.opaque, 'rgb(255, 255, 255)');
            if (index !== 3) assert.equal(stack.overlapOwner, true);
            assert.match(await page.locator('.copilot-stack-supplements').textContent(), /討論 1：.*朋友聚會/);
            await screenshot(width + '-second-thinking');
            await release('timeout');
            assert.equal(await page.locator('.copilot-stack-supplements .copilot-stack-card').count(), 1);
            const failed = calls.at(-1); await page.locator('[data-copilot=retry]').click();
            await release(index === 0 ? 'multi' : 'ready');
            assert.deepEqual(calls.at(-1), failed);
            assert.equal(await page.evaluate(() => CreationSessionStore.creativeBrief.answers.length), 1);
            if (index !== 0) {
                await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);
                assert.equal(await page.locator('#creation-discussion-stack').isVisible(), true);
                assert.equal(await page.evaluate(() => document.querySelector('.copilot-user-message') === __originalCard), true);
                assert.equal(await page.locator('.copilot-stack-supplements .copilot-stack-card').count(), 1);
                await screenshot(width + '-settings');
                continue;
            }
            await page.waitForFunction(() => CreationSessionStore.copilot.phase === 'responded');
            await page.locator('#creative-copilot .copilot-option').nth(0).click();
            await page.locator('#creative-copilot .copilot-option').nth(1).click();
            await page.locator('#creative-copilot .copilot-option').nth(3).click();
            await page.locator('[data-other=visuals]').fill('自然光與手持主觀鏡頭');
            await page.locator('#copilot-answer-form button[type=submit]').click(); await settle();
            assert.equal(await page.locator('.copilot-stack-supplements .copilot-stack-card').count(), 2);
            assert.match(await page.locator('.copilot-stack-supplements').innerText(), /自然光與手持/);
            await release('free');
            await page.locator('[data-other=details]').fill('自由描述：' + '保留杯子的細節與生活聲音。'.repeat(80));
            await page.locator('#copilot-answer-form button[type=submit]').click(); await settle(); await release('proposal');
            await page.locator('[data-copilot=continue]').click(); await page.locator('#copilot-message').fill('不要太商業化，保留自然的生活感');
            await page.locator('#copilot-answer-form button[type=submit]').click(); await settle(); await release('proposal');
            assert.equal(await page.evaluate(() => CreationSessionStore.copilot.stackRounds.length), 4);
            assert.equal(await page.locator('.copilot-stack-supplements .copilot-stack-card').count(), 3);
            assert.deepEqual(await page.locator('.copilot-stack-supplements .copilot-stack-card').evaluateAll(cards => cards.map(card => Number(getComputedStyle(card).zIndex))), [3, 2, 1]);
            const sizes = await page.locator('.copilot-stack-supplements .copilot-stack-card').evaluateAll(cards => cards.map(card => ({
                width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height,
                font: parseFloat(getComputedStyle(card).fontSize), radius: parseFloat(getComputedStyle(card).borderRadius)
            })));
            for (let depth = 1; depth < sizes.length; depth++) {
                for (const key of ['width', 'height', 'font', 'radius']) assert.ok(Math.abs(sizes[depth][key] / sizes[depth - 1][key] - .94) < .002, key);
            }
            assert.equal(await page.locator('.stack-history-link').isVisible(), true);
            await page.locator('.stack-history-link').click();
            await page.locator('[data-edit-answer="1"]').fill('修改後的光線與手持鏡頭');
            await page.locator('[data-save-answer="1"]').click();
            assert.match(await page.locator('.copilot-stack-supplements').innerText(), /修改後的光線與手持鏡頭/);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
            await screenshot('multiple-rounds');
            await page.locator('[data-copilot=continue]').click(); await page.locator('#copilot-message').fill('可以進入設定');
            await page.locator('#copilot-answer-form button[type=submit]').click();
            // A result can arrive before the 500ms archive flight ends; it must never delay ready.
            await release('ready'); await page.waitForFunction(() => CreationSessionStore.currentPhase === 2);
            assert.equal(await page.locator('#creation-discussion-stack').isVisible(), true);
            assert.equal(await page.evaluate(() => document.querySelector('.copilot-user-message') === __originalCard), true);
            assert.equal(await page.locator('.copilot-archive-flight').count(), 0);
            assert.equal(await page.evaluate(() => __captionTimers.size), 0);
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await start('減少動畫模式的創作想法');
        assert.equal(await page.evaluate(() => __captionTimers.size), 0);
        assert.equal(await page.locator('.copilot-user-message').evaluate(el => el.getAnimations().length), 0);
        await release('proposal'); await page.locator('#creative-copilot .copilot-option').first().click();
        await page.locator('#copilot-answer-form button[type=submit]').click();
        assert.equal(await page.locator('.copilot-archive-flight').count(), 0);
        assert.equal(await page.locator('.copilot-stack-supplements .copilot-stack-card').count(), 1);
        await page.evaluate(() => CreativeCopilot.cancel());
        assert.equal(await page.evaluate(() => __captionTimers.size), 0);
        assert.equal(await page.locator('.math-loader-group circle').count(), 0);
        await releaseAfterCancel();
        await page.goto(base + '/html/index.html#/dashboard', { waitUntil: 'domcontentloaded' });
        assert.equal(await page.locator('.copilot-archive-flight,.copilot-response-exit').count(), 0);
        assert.deepEqual(errors, []);
        async function releaseAfterCancel() { if (pending) { const resolve = pending; pending = null; resolve(); } }
    } finally {
        if (pending) pending();
        await browser.close();
        if (!process.env.STACK_SCREENSHOTS) await fs.rm(screenshots, { recursive: true, force: true });
    }
});
