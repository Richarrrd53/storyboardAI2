const test = require('node:test');
const assert = require('node:assert/strict');
const ProjectCard = require('../public/js/components/project-card');

test('ProjectCard.normalizeRatio normalizes aspect ratio strings', () => {
  assert.equal(ProjectCard.normalizeRatio(null), '16:9');
  assert.equal(ProjectCard.normalizeRatio(undefined), '16:9');
  assert.equal(ProjectCard.normalizeRatio(''), '16:9');
  assert.equal(ProjectCard.normalizeRatio('16:9'), '16:9');
  assert.equal(ProjectCard.normalizeRatio('16/9'), '16:9');
  assert.equal(ProjectCard.normalizeRatio('9:16'), '9:16');
  assert.equal(ProjectCard.normalizeRatio('9/16'), '9:16');
  assert.equal(ProjectCard.normalizeRatio('1:1'), '1:1');
  assert.equal(ProjectCard.normalizeRatio('4:3'), '4:3');
  assert.equal(ProjectCard.normalizeRatio('3:2'), '3:2');
  assert.equal(ProjectCard.normalizeRatio('2:3'), '2:3');
  assert.equal(ProjectCard.normalizeRatio('21:9'), '21:9');
  assert.equal(ProjectCard.normalizeRatio('ratio-18:9-custom'), '18:9');
});

test('ProjectCard.parseAspectRatio parses ratios from strings, numbers, and dimensions', () => {
  assert.equal(ProjectCard.parseAspectRatio(1.5), 1.5);
  assert.ok(Math.abs(ProjectCard.parseAspectRatio('16:9') - (16 / 9)) < 0.0001);
  assert.ok(Math.abs(ProjectCard.parseAspectRatio('9/16') - (9 / 16)) < 0.0001);
  assert.equal(ProjectCard.parseAspectRatio('1:1'), 1);
  assert.ok(Math.abs(ProjectCard.parseAspectRatio('', 1920, 1080) - (1920 / 1080)) < 0.0001);
  assert.ok(Math.abs(ProjectCard.parseAspectRatio('直向') - (9 / 16)) < 0.0001);
  assert.equal(ProjectCard.parseAspectRatio('方形'), 1);
  assert.ok(Math.abs(ProjectCard.parseAspectRatio('超寬') - (21 / 9)) < 0.0001);
});

test('ProjectCard.calculateProjectCoverGeometry computes correct dimensions for variants', () => {
  const def = ProjectCard.calculateProjectCoverGeometry({ variant: 'default', isMobile: false });
  assert.equal(def.frame.width, 282);
  assert.equal(def.frame.height, 158.6);
  assert.equal(def.frame.insertDepth, 46);
  assert.equal(def.hoverLift, 16);
  assert.equal(def.hoverRotate, -4.5);
  assert.equal(def.collapsed.width, 282);
  assert.equal(def.expanded.width, 282);

  const compact = ProjectCard.calculateProjectCoverGeometry({ variant: 'compact', isMobile: false });
  assert.equal(compact.frame.width, 254);
  assert.equal(compact.frame.height, 142.9);
  assert.equal(compact.frame.insertDepth, 42);
  assert.equal(compact.hoverLift, 14);

  const mob = ProjectCard.calculateProjectCoverGeometry({ variant: 'default', isMobile: true });
  assert.equal(mob.frame.width, 248);
  assert.equal(mob.frame.height, 139.5);
  assert.equal(mob.frame.insertDepth, 40);
  assert.equal(mob.hoverRotate, -3.5);
});

test('ProjectCard.calculateTransitionTargetSize computes centered target rect within limits', () => {
  const landscape = ProjectCard.calculateTransitionTargetSize({
    aspectRatio: 16 / 9,
    viewportWidth: 1440,
    viewportHeight: 900
  });
  assert.ok(landscape.width <= 1440 * 0.58 + 1);
  assert.ok(landscape.height <= 900 * 0.68 + 1);
  assert.equal(landscape.left, Math.round((1440 - landscape.width) / 2));
  assert.equal(landscape.top, Math.round((900 - landscape.height) / 2));

  const portrait = ProjectCard.calculateTransitionTargetSize({
    aspectRatio: 9 / 16,
    viewportWidth: 1440,
    viewportHeight: 900
  });
  assert.ok(portrait.width <= portrait.height * (9 / 16) + 1);
  assert.equal(portrait.left, Math.round((1440 - portrait.width) / 2));
});

test('ProjectCard.getContainedImageRect computes contained image bounds', () => {
  const mockImg = {
    getBoundingClientRect: () => ({ left: 50, top: 100, width: 200, height: 200 }),
    naturalWidth: 400,
    naturalHeight: 200
  };
  const rect = ProjectCard.getContainedImageRect(mockImg);
  assert.equal(rect.width, 200);
  assert.equal(rect.height, 100);
  assert.equal(rect.left, 50);
  assert.equal(rect.top, 150);
});

test('ProjectCard.formatRatioText returns user-facing localized ratio labels', () => {
  assert.equal(ProjectCard.formatRatioText('16:9'), '橫向 16:9');
  assert.equal(ProjectCard.formatRatioText('9:16'), '直向 9:16');
  assert.equal(ProjectCard.formatRatioText('1:1'), '方形 1:1');
  assert.equal(ProjectCard.formatRatioText('4:3'), '橫向 4:3');
  assert.equal(ProjectCard.formatRatioText('3:2'), '橫向 3:2');
  assert.equal(ProjectCard.formatRatioText('2:3'), '直向 2:3');
  assert.equal(ProjectCard.formatRatioText('21:9'), '超寬 21:9');
});

test('ProjectCard.formatRelativeTime handles missing or relative timestamps', () => {
  assert.equal(ProjectCard.formatRelativeTime(null), '剛剛編輯');
  assert.equal(ProjectCard.formatRelativeTime('invalid-date'), '剛剛編輯');
  assert.equal(ProjectCard.formatRelativeTime(new Date().toISOString()), '剛剛編輯');
  
  const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  assert.equal(ProjectCard.formatRelativeTime(tenMinsAgo), '10 分鐘前編輯');
});

test('ProjectCard.renderProjectCard renders expected folder markup, classes, and escapes HTML', () => {
  const p = {
    id: 'proj-123',
    title: '懸疑電影 <序章> & "第一幕"',
    ratio: '16:9',
    shotCount: 3,
    updateAt: new Date().toISOString()
  };

  const html = ProjectCard.renderProjectCard(p, { variant: 'default' });
  assert.ok(html.includes('project-folder-preview-stack'));
  assert.ok(html.includes('project-preview-secondary'));
  assert.ok(html.includes('data-src="/api/projects/proj-123/cover"'));
  assert.ok(html.includes('project-folder-tab'));
  assert.ok(html.includes('project-option-btn'));
  assert.ok(html.includes('3 鏡頭'));
  assert.ok(html.includes('橫向 16:9'));
  assert.ok(html.includes('&lt;序章&gt;'));
  assert.ok(html.includes('&amp;'));
  assert.ok(html.includes('&quot;第一幕&quot;'));
  assert.ok(!html.includes('<序章>')); // must be escaped
});

test('ProjectCard.renderProjectCard handles single shot without secondary card and handles deleted flag', () => {
  const p = {
    id: 'proj-single',
    title: '單一鏡頭專案',
    ratio: '9:16',
    shotCount: 1,
    is_deleted: true
  };

  const html = ProjectCard.renderProjectCard(p, { variant: 'compact' });
  assert.ok(!html.includes('project-preview-secondary'));
  assert.ok(html.includes('project-restore-badge'));
  assert.ok(html.includes('已刪除'));
  assert.ok(html.includes('直向 9:16'));
});

test('ProjectCard.renderProjectCard renders tags cleanly and escapes HTML in tags', () => {
  const pWithTags = {
    id: 'proj-tags',
    title: '標籤專案',
    ratio: '16:9',
    tags: ['商業廣告', '短影音 <特別篇>', '品牌 & 企劃']
  };

  const html = ProjectCard.renderProjectCard(pWithTags, { variant: 'default' });
  assert.ok(html.includes('project-tags-row'));
  assert.ok(html.includes('project-tag-pill'));
  assert.ok(html.includes('#商業廣告'));
  assert.ok(html.includes('#短影音 &lt;特別篇&gt;'));
  assert.ok(html.includes('#品牌 &amp; 企劃'));
  assert.ok(!html.includes('<特別篇>')); // must escape

  // Compact variant should show first 2 tags and +1 more
  const compactHtml = ProjectCard.renderProjectCard(pWithTags, { variant: 'compact' });
  assert.ok(compactHtml.includes('project-tags-row-compact'));
  assert.ok(compactHtml.includes('#商業廣告'));
  assert.ok(compactHtml.includes('+1'));

  // Without tags: no tags row
  const pNoTags = { id: 'p-none', title: '無標籤專案', ratio: '16:9' };
  const htmlNoTags = ProjectCard.renderProjectCard(pNoTags);
  assert.ok(!htmlNoTags.includes('project-tags-row'));
});

test('Dashboard compact card normalizes metadata tags before its two-tag display limit', () => {
  const html = ProjectCard.buildHomeRecentCardHTML({ id: 'legacy', metadata: { tags: [' A ', 'A', '', 'B', 'C', null] } });
  assert.equal((html.match(/data-tag="A"/g) || []).length, 1);
  assert.ok(html.includes('data-tag="B"'));
  assert.ok(!html.includes('data-tag="C"'));
  assert.ok(html.includes('project-tag-pill-more">+1'));
});


function thumbnailFixture(ratio = '9:16') {
  const vm = require('node:vm'), fs = require('node:fs');
  const images = [], frames = [], children = [], classes = new Set(['loading', 'project-preview-primary']);
  const thumb = { isConnected: true, dataset: { src: 'project-id', ratio }, style: { setProperty(key, value) { this[key] = value; } },
    classList: { contains: key => classes.has(key), add: key => classes.add(key), remove: key => classes.delete(key) },
    querySelector: selector => selector === '.lazy-thumb' ? children.find(child => child.className?.includes('lazy-thumb')) : null,
    closest: () => null, appendChild: child => children.push(child) };
  const root = { contains: node => node === thumb && thumb.isConnected, querySelectorAll: () => classes.has('loading') ? [thumb] : [] };
  const window = { ProjectCard, AppShell: { isMobileView: () => false } };
  const context = vm.createContext({ window, requestAnimationFrame: fn => frames.push(fn), Image: class { constructor() { this.style = {}; this.naturalWidth = 360; this.naturalHeight = 640; images.push(this); } } });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/components/project-thumbnails.js'), 'utf8'), context);
  return { window, root, thumb, images, frames, children, classes };
}

test('project thumbnails deduplicate in-flight loads and retain portrait background and geometry', () => {
  const f = thumbnailFixture();
  f.window.lazyLoadProjectThumbs(f.root); f.window.lazyLoadProjectThumbs(f.root);
  assert.equal(f.images.length, 1);
  assert.equal(f.images[0].src, '/api/projects/project-id/cover');
  f.images[0].onload();
  assert.equal(f.children.length, 2);
  assert.equal(f.classes.has('has-contain-preview'), true);
  assert.ok(f.children[1].className.includes('fit-contain'));
  assert.ok(f.thumb.style['--cover-height']);
  f.frames.shift()();
  assert.equal(f.classes.has('loading'), false);
  f.window.lazyLoadProjectThumbs(f.root);
  assert.equal(f.images.length, 2, 'only main image and blurred background were constructed');
});

test('project thumbnail callbacks never insert into detached pages or reveal detached images', () => {
  const f = thumbnailFixture('16:9');
  f.window.lazyLoadProjectThumbs(f.root);
  f.thumb.isConnected = false; f.images[0].onload();
  assert.equal(f.children.length, 0);
  f.thumb.isConnected = true; f.window.lazyLoadProjectThumbs(f.root); f.images[1].onload();
  assert.equal(f.children.length, 1);
  f.thumb.isConnected = false; f.frames.shift()();
  assert.equal(f.children[0].style.opacity, '0');
  assert.equal(f.classes.has('loading'), true);
});

test('failed thumbnail loads retain fallback content and clear loading state', () => {
  const f = thumbnailFixture(); f.window.lazyLoadProjectThumbs(f.root); f.images[0].onerror();
  assert.equal(f.children.length, 0);
  assert.equal(f.classes.has('loading'), false);
});
