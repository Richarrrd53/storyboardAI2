// Real cover-transition modules, held in waiting-project without API calls.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.STORYBOARD_PLAYWRIGHT_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.STORYBOARD_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const output = path.resolve('.codex-backup/ui-validation/rose-orbit');
  await fs.mkdir(output, { recursive: true });
  try {
    for (const [name, viewport, ratio, reduced] of [
      ['landscape', { width: 1440, height: 900 }, '16:9', false],
      ['portrait', { width: 1440, height: 900 }, '9:16', false],
      ['mobile', { width: 390, height: 844 }, '16:9', false],
      ['mobile-portrait', { width: 390, height: 844 }, '9:16', false],
      ['reduced-motion', { width: 390, height: 844 }, '1:1', true]
    ]) {
      const page = await browser.newPage({ viewport, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.setContent(`<style>body{background:#f8fafc;font-family:Arial} .project-preview-primary{position:fixed;left:40px;top:80px;width:282px;height:159px} .project-preview-primary img{width:100%;height:100%;object-fit:cover}</style>
        <div class="project-card"><div class="project-folder-shell"></div><div class="project-preview-primary" data-true-ratio="${ratio}"><img src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#334155"/><circle cx="320" cy="180" r="100" fill="#94a3b8"/><path d="M0 310L240 120L640 360H0" fill="#64748b"/></svg>')}"></div></div>`);
      await page.addStyleTag({ path: 'public/css/components/project-card.css' });
      for (const file of ['project-card', 'transition-loader', 'project-cover-transition']) {
        await page.addScriptTag({ path: `public/js/components/${file}.js` });
      }
      await page.evaluate(ratio => {
        window.session = ProjectCoverTransition.launch(document.querySelector('.project-card'), { id: 'preview', ratio }, { navigate() {} });
      }, ratio);
      await page.waitForFunction(() => window.session.state === 'waiting-project');
      await page.waitForTimeout(300);
      const before = await page.locator('.project-cover-rose-orbit circle').first().getAttribute('cx');
      await page.waitForTimeout(200);
      const after = await page.locator('.project-cover-rose-orbit circle').first().getAttribute('cx');
      assert.equal(before === after, reduced, `${name}: orbit follows motion preference`);
      const bounds = await page.evaluate(reduced => {
        const svg = document.querySelector('.project-cover-rose-svg');
        const cover = window.session;
        const roseGroup = svg.querySelector('g');
        if (svg.getAttribute('viewBox') !== '0 0 100 100' || svg.querySelectorAll('circle').length !== 45) throw Error('Original rose geometry was changed');
        const front = document.querySelector('.project-cover-rose-front');
        if (!front || !front.querySelector('path').getAttribute('d').includes('L')) throw Error('Foreground arc missing');
        if (Number(getComputedStyle(front).zIndex) <= Number(cover.flyingCover.style.zIndex) || Number(getComputedStyle(svg.parentElement).zIndex) >= Number(cover.flyingCover.style.zIndex)) throw Error('Incorrect front/cover/back depth order');
        if (front.querySelectorAll('circle').length !== 45) throw Error('Foreground particle layer missing');
        const backTrack = svg.querySelector('path');
        const frontTrack = front.querySelector('path');
        if (backTrack.getAttribute('opacity') !== frontTrack.getAttribute('opacity')) throw Error('Front and rear track colours differ');
        const intersectionMask = svg.querySelector('mask path');
        if (!backTrack.getAttribute('mask') || !intersectionMask || intersectionMask.getAttribute('d') !== frontTrack.getAttribute('d')) throw Error('Track intersections accumulate opacity');
        if (getComputedStyle(front).filter !== 'none') throw Error('Foreground glow changes the track colour');
        const rect = svg.getBoundingClientRect();
        if (Math.abs(rect.x + rect.width / 2 - cover.targetLeft - cover.targetW / 2) > 1 || Math.abs(rect.y + rect.height / 2 - cover.targetTop - cover.targetH / 2) > 1) throw Error('Rose is not centred on cover');
        if (rect.width < Math.max(cover.targetW, cover.targetH) * 3) throw Error('Rose must surround the smaller cover');
        if (getComputedStyle(svg).color !== 'rgb(255, 255, 255)' || getComputedStyle(document.querySelector('.project-cover-cancel')).color !== 'rgb(255, 255, 255)') throw Error('Loader and X must be white');
        if (document.querySelector('.project-cover-waiting-text') || document.querySelector('.project-cover-mini-curve')) throw Error('Old loading row remains');
        const matrix = roseGroup.getScreenCTM();
        const points = svg.querySelector('path').getAttribute('d').match(/-?\d+\.\d+/g).map(Number);
        for (let i = 0; i < points.length; i += 2) {
          const p = new DOMPoint(points[i], points[i + 1]).matrixTransform(matrix);
          if (p.x < 0 || p.x > innerWidth || p.y < 0 || p.y > innerHeight) throw Error('Rose clipped by viewport');
        }
        const ui = document.querySelector('.project-cover-waiting').getBoundingClientRect();
        return { bottom: ui.bottom, height: innerHeight };
      }, reduced);
      assert.ok(bounds.bottom <= bounds.height, `${name}: loading controls fit viewport ${JSON.stringify(bounds)}`);
      await page.screenshot({ path: path.join(output, `${name}.png`) });
      await page.evaluate(() => window.session.cleanup());
      assert.equal(await page.locator('.project-cover-rose-orbit').count(), 0);
      assert.deepEqual(errors, []);
      console.log(`${name}: 3D rose front/cover/back layers, white X, viewport and cleanup passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
