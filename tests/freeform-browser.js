/** Real production entrypoint; run node server.js first. APIs are fixtures, with no paid requests. */
const { chromium } = require(process.env.STORYBOARD_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const out = process.env.STORYBOARD_QA_OUTPUT;
const origin = process.env.STORYBOARD_QA_ORIGIN || 'http://localhost:3000';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const fixture = {
  meta: { title: '清晨的一杯咖啡' }, characters: {},
  shots: ['拉起店門，晨光落在吧檯', '倒出咖啡豆，檢查豆粒', '秤上數字停在十八克', '轉動磨豆機刻度盤', '研磨好的粉落入濾杯', '熱水繞圈注入咖啡粉', '咖啡滴落，杯中液面升高', '托盤端向靠窗的木桌', '杯子落在桌面，蒸氣升起', '窗邊的咖啡映著街道晨光'].map((story, i) => ({
    id: i + 1, story, camera: ['wide establishing shot', 'overhead close-up', 'insert detail', 'tracking close-up', 'low angle', 'overhead slow push', 'macro detail', 'lateral tracking', 'close-up tilt', 'wide pull-back'][i],
    duration: '3s', emotion: '安靜、專注', purpose: '推進咖啡製作的第 ' + (i + 1) + ' 個具體動作', dialogue: '',
    shotPrompt: 'Coffee preparation step ' + (i + 1) + ', morning light, precise composition', characters: []
  }))
};
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 375, height: 667 }].filter(size => !process.env.STORYBOARD_QA_WIDTH || String(size.width) === process.env.STORYBOARD_QA_WIDTH)) {
      const mobile = viewport.width < 600;
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, reducedMotion: viewport.width === 375 ? 'reduce' : 'no-preference' });
      await context.addInitScript(() => localStorage.setItem('spa_auth_token', 'fixture-token'));
      let images = 0, stories = 0, saves = 0, failImage = true, failSave = true, holdAt = -1, savedShots = [];
      const errors = [], storyReached = deferred(), storyRelease = deferred();
      let imageReached = deferred(), imageRelease = deferred();
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        const fulfill = (data, status = 200) => route.fulfill({ status, json: data }).catch(() => {});
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/api/auth/me') return fulfill({ user: { id: 'qa', name: 'Creator', plan: 'free' } });
        if (url.pathname === '/api/ask-gemini') {
          const body = route.request().postDataJSON();
          if (body.type === 'story') {
            stories++;
            if (stories === 1) { storyReached.resolve(); await storyRelease.promise; }
            const data = body.question.startsWith('依以下已確認分鏡') ? JSON.parse(body.question.slice(body.question.indexOf('{'))) : fixture;
            return fulfill({ response: JSON.stringify(data) });
          }
          images++;
          if (images === holdAt) { imageReached.resolve(); await imageRelease.promise; }
          if (images === 2 && failImage) { failImage = false; return fulfill({ error: 'fixture image failure' }, 503); }
          return fulfill({ image: ['/icon/logo/logo.png'] });
        }
        if (url.pathname === '/api/projects' && route.request().method() === 'POST') {
          saves++;
          if (failSave) { failSave = false; return fulfill({ error: 'fixture storage failure' }, 503); }
          const body = route.request().postDataJSON();
          savedShots = body.shots.map(shot => ({ ...shot, id: 'shot-' + shot.order }));
          return fulfill({ project: { id: 'qa-project', shots: savedShots } });
        }
        if (url.pathname === '/api/projects/qa-project') return fulfill({ project: { id: 'qa-project', title: '咖啡', shots: savedShots } });
        if (url.pathname.startsWith('/api/')) return fulfill(url.pathname === '/api/get-templates' ? [] : { projects: [] });
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/generate');
      const app = page.frameLocator('#ifm');
      await app.locator('#story-input').fill('清晨，咖啡師打開店門，磨豆、沖煮，再將熱咖啡送到窗邊。');
      await app.locator('body.is-navigating').waitFor({ state: 'hidden' });
      await app.locator('#page-inner-loader.active').waitFor({ state: 'hidden' });
      assert.equal(await app.locator('#story-input').evaluate(node => getComputedStyle(node).borderTopWidth), '0px');
      assert.equal(await app.locator('#story-input').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
      assert.equal(await app.locator('.composer-container').evaluate(node => getComputedStyle(node).outlineStyle), 'none', 'focused composer must use its soft shadow without a blue outline');
      assert.equal(await app.locator('#composer-submit-btn').evaluate(node => node.getBoundingClientRect().width), 38);
      if (out) await page.screenshot({ path: out + '/composer-' + viewport.width + '.png' });
      await app.locator('#composer-submit-btn').click();
      const frame = page.frames().find(item => item.url().includes('/html/index.html'));
      if (viewport.width !== 375) {
        const motion = await frame.evaluate(() => {
          switchPhase(1, false); switchPhase(2);
          const animations = document.getElementById('creation-surface').getAnimations({ subtree: true });
          const skin = animations.find(animation => animation.effect?.pseudoElement === '::before');
          return {
            skin: !!skin,
            timing: skin?.effect.getTiming(),
            blur: animations.some(animation => animation.effect?.getKeyframes().some(keyframe => keyframe.filter?.includes('blur(12px)')))
          };
        });
        assert.equal(motion.skin, true, 'surface skin must morph without scaling controls');
        assert.equal(motion.timing.duration, 500, 'background morph must last half a second');
        assert.equal(motion.timing.easing.replace(/\s/g, ''), 'cubic-bezier(0.4,0,0.2,1)');
        assert.equal(motion.blur, true, 'content exchange must include the requested blur');
      }
      const screenshot = async name => { if (out) await page.screenshot({ path: out + '/' + name + '-' + viewport.width + '.png' }); };
      async function bounds(label, mustScroll = false) {
        const result = await frame.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          ownership: getComputedStyle(document.getElementById('page-content')).overflowY,
          scrollers: [...document.querySelectorAll('#page-main,#page-content,.generate-workspace,.creation-surface,.phase-panel.active')].filter(element => element.scrollHeight > element.clientHeight + 2 && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)).map(element => element.id || element.className)
        }));
        assert.equal(result.overflow, false, label + ' horizontal overflow');
        assert.equal(result.ownership, 'auto', label + ' native scrolling disabled');
        assert.ok(result.scrollers.length <= 1, label + ' nested scrollers');
        if (mustScroll) assert.deepEqual(result.scrollers, ['page-content']);
      }
      async function reachable(selector) {
        const element = app.locator(selector);
        await element.scrollIntoViewIfNeeded();
        assert.equal(await element.evaluate(node => {
          const rect = node.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return rect.top >= 0 && rect.bottom <= innerHeight && (hit === node || node.contains(hit));
        }), true, selector + ' is covered or clipped');
      }
      await app.locator('#phase-panel-2.active').waitFor();
      assert.equal(await app.locator('.creation-surface').evaluate(element => getComputedStyle(element).borderTopWidth), '0px');
      await app.locator('.style-card[data-index="1"]').click();
      assert.equal(await app.locator('.style-card.active .style-card-check').textContent(), '✓');
      assert.equal(await app.locator('.style-card[data-index="0"] .style-card-check').textContent(), '');
      await app.locator('.style-card[data-index="0"]').click();
      await bounds('settings');
      await reachable('#btn-direction-next');
      await screenshot('settings');
      await app.locator('#btn-direction-next').click();
      await storyReached.promise;
      await app.locator('.math-loader-box').waitFor({ state: 'visible' });
      if (viewport.width !== 375) {
        await frame.waitForFunction(() => [...document.querySelectorAll('.inspiration-fragment')].some(node => Number(node.style.opacity) > .6));
        const inspiration = await frame.evaluate(() => ({
          words: [...document.querySelectorAll('.inspiration-token > span')].map(node => node.textContent),
          count: document.querySelectorAll('.inspiration-fragment').length,
          story: GenerationTask.getState().input.story
        }));
        assert.ok(inspiration.count >= 1 && inspiration.count <= 2);
        assert.ok(inspiration.words.every(word => inspiration.story.includes(word)));
      } else {
        assert.equal(await app.locator('.inspiration-fragment').count(), 0, 'reduced motion skips convergence fragments');
      }
      assert.equal(await app.locator('#gen-progress-track').isVisible(), false);
      assert.equal(await app.locator('#gen-status-pct').textContent(), '');
      await screenshot('planning');
      storyRelease.resolve();
      await frame.waitForFunction(() => GenerationTask.getState().status === 'awaiting_confirmation');
      assert.equal(await app.locator('.inspiration-field').count(), 0, 'preview must clean up generation animation');
      assert.equal(images, 0); assert.equal(stories, 1);
      await bounds('plan', true);
      await app.locator('#plan-0-story').fill('拉起咖啡店鐵門，晨光照亮空吧檯。');
      await app.locator('#plan-0-duration').fill('3.5');
      await app.locator('[data-shot-index="0"] [data-move="1"]').click();
      assert.equal(await app.locator('#plan-1-story').inputValue(), '拉起咖啡店鐵門，晨光照亮空吧檯。');
      await frame.evaluate(async () => { await spaNavigate('dashboard'); await spaNavigate('generate'); });
      await app.locator('#phase-panel-5.active').waitFor();
      assert.equal(await app.locator('#plan-1-story').inputValue(), '拉起咖啡店鐵門，晨光照亮空吧檯。');
      await app.locator('#btn-plan-back').click();
      assert.equal(await app.locator('#btn-direction-next').textContent(), '返回分鏡企劃');
      await app.locator('#btn-direction-next').click();
      await app.locator('#phase-panel-5.active').waitFor();
      assert.equal(stories, 1, 'unchanged settings must reuse the edited plan');
      await frame.evaluate(() => { switchPhase(2); switchPhase(1); switchPhase(2); switchPhase(5); });
      await frame.waitForFunction(() => !document.querySelector('.phase-exit-layer'));
      assert.equal(await app.locator('.phase-panel.active').count(), 1);
      await page.setViewportSize({ width: viewport.width, height: mobile ? 420 : 480 });
      await app.locator('#plan-1-story').focus();
      await reachable('#btn-confirm-plan');
      await bounds('short window / keyboard simulation', true);
      await page.setViewportSize(viewport);
      await frame.evaluate(() => { document.getElementById('page-content').scrollTop = 0; });
      await screenshot('plan');
      await reachable('#btn-confirm-plan');
      await frame.evaluate(() => { const button = document.getElementById('btn-confirm-plan'); button.click(); button.click(); });
      await frame.waitForFunction(() => GenerationTask.getState().status === 'completed');
      assert.equal(images, 10); assert.equal(stories, 2); assert.equal(saves, 1);
      assert.equal(await app.locator('[data-retry-shot]').count(), 1);
      await app.locator('#btn-retry-save').click();
      await frame.waitForFunction(() => GenerationTask.getState().save.status === 'saved');
      await app.locator('[data-retry-shot]').click();
      await frame.waitForFunction(() => GenerationTask.getState().status === 'completed' && GenerationTask.getState().result.failedShotIndexes.length === 0);
      assert.equal(images, 11); assert.equal(saves, 2);
      await bounds('result', true);
      await app.locator('#result-heading').scrollIntoViewIfNeeded();
      await screenshot('result');
      await app.locator('[data-result-view="table"]').click();
      await bounds('result table', true);
      for (const selector of ['#btn-export-result-csv', '#generation-result-wrap .result-actions .btn-outline']) {
        const download = page.waitForEvent('download'); await app.locator(selector).click();
        assert.match((await download).suggestedFilename(), /\.(?:csv|json)$/);
      }
      await app.locator('#btn-open-generated-project').click();
      await page.waitForURL('**/project/qa-project');
      await app.locator('body.is-navigating').waitFor({ state: 'hidden' });
      await frame.evaluate(() => spaNavigate('generate'));
      await app.locator('body.is-navigating').waitFor({ state: 'hidden' });
      await app.locator('#phase-panel-4.active').waitFor();
      // Cancel on the second image, then resume only the unfinished images.
      await frame.evaluate(() => resetCreationWorkflow());
      await app.locator('#phase-panel-1.active').waitFor();
      await app.locator('#story-input').fill('咖啡師磨豆、沖煮並將咖啡放到窗邊。');
      await app.locator('#composer-submit-btn').click();
      await app.locator('#btn-direction-next').click();
      await frame.waitForFunction(() => GenerationTask.getState().status === 'awaiting_confirmation');
      holdAt = images + 2;
      await app.locator('#btn-confirm-plan').click();
      await imageReached.promise;
      assert.equal(await app.locator('#gen-status-pct').textContent(), '1 / 10');
      await app.locator('#btn-abort-generation').click();
      imageRelease.resolve();
      await frame.waitForFunction(() => GenerationTask.getState().status === 'cancelled');
      assert.equal(await app.locator('.inspiration-field').count(), 0, 'cancel must dispose the convergence loop');
      assert.equal(await frame.evaluate(() => GenerationTask.getState().result.generatedShotData[0].payload.imageStatus), 'succeeded');
      await app.locator('#btn-retry-generation').click();
      await app.locator('#phase-panel-5.active').waitFor();
      await app.locator('#btn-confirm-plan').click();
      await frame.waitForFunction(() => GenerationTask.getState().status === 'completed');
      assert.equal(images, 22); assert.equal(stories, 3);
      assert.deepEqual(errors, []);
      console.log('PASS', viewport, 'preview gate, edit, reorder, route restore, interrupted motion, keyboard layout, selective retry, save, export, open, cancel/resume');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
