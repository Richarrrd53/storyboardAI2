const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const IconMotion = require('../public/js/components/icon-motion.js');

function createMockSvg(name, partNames) {
  const createdAnims = [];
  const parts = {};
  for (const pName of partNames) {
    const el = {
      style: {},
      animate(keyframes, options) {
        const anim = {
          keyframes,
          options,
          playState: 'running',
          cancelled: false,
          finished: false,
          onfinish: null,
          oncancel: null,
          cancel() {
            this.cancelled = true;
            this.playState = 'idle';
            this.oncancel?.();
          },
          finish() {
            this.finished = true;
            this.playState = 'finished';
            this.onfinish?.();
          }
        };
        createdAnims.push(anim);
        return anim;
      }
    };
    parts[pName] = el;
  }

  const svg = {
    tagName: 'svg',
    dataset: { imIcon: name },
    querySelectorAll(selector) {
      const m = selector.match(/\[data-im-part="([^"]+)"\]/);
      if (!m) return [];
      const found = parts[m[1]];
      return found ? [found] : [];
    }
  };
  return { svg, parts, createdAnims };
}

test('IconMotion: all 14 unique semantic definitions (covering 16 icons) exist and end at rest', () => {
  const expected = [
    'home', 'add', 'folder', 'trash', 'flame', 'compass',
    'pencil', 'tag', 'copy', 'download',
    'profile', 'upgrade', 'settings', 'logout'
  ];
  for (const name of expected) {
    const def = IconMotion.MOTIONS[name];
    assert.ok(def, `Missing motion definition for ${name}`);
    assert.ok(['mechanical', 'organic', 'directional'].includes(def.family));
    assert.ok(def.duration >= 660 && def.duration <= 1500, `${name} duration ${def.duration}ms out of range`);
    for (const [partName, spec] of Object.entries(def.parts)) {
      const last = spec.keyframes[spec.keyframes.length - 1];
      assert.equal(last.offset, 1, `${name}.${partName} must end at offset 1`);
    }
  }
});

test('IconMotion: play, interrupt, and reverse cleanly without lingering animations', () => {
  const prevWindow = global.window;
  global.window = {
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ transform: 'matrix(1, 0, 0, 1, 0, -1.2)', opacity: '0.8' })
  };
  try {
    const { svg, createdAnims } = createMockSvg('trash', ['lid']);
    assert.equal(IconMotion.play(svg), true);
    assert.equal(createdAnims.length, 1);
    assert.equal(createdAnims[0].playState, 'running');

    // Replaying interrupts prior animation
    assert.equal(IconMotion.play(svg), true);
    assert.equal(createdAnims[0].cancelled, true);
    assert.equal(createdAnims.length, 2);
    assert.equal(createdAnims[1].playState, 'running');

    // Reversing cancels running animation and starts return-to-rest animation
    IconMotion.reverse(svg);
    assert.equal(createdAnims[1].cancelled, true);
    assert.equal(createdAnims.length, 3);
    assert.equal(createdAnims[2].keyframes[1].transform, 'none');

    // Cancel clears all
    IconMotion.cancel(svg);
    assert.equal(createdAnims[2].cancelled, true);
  } finally {
    global.window = prevWindow;
  }
});

test('IconMotion: respects prefers-reduced-motion: reduce', () => {
  const prevMatchMedia = global.matchMedia;
  global.matchMedia = () => ({ matches: true });
  try {
    const { svg, createdAnims } = createMockSvg('compass', ['needle']);
    assert.equal(IconMotion.play(svg), false);
    assert.equal(createdAnims.length, 0);
  } finally {
    global.matchMedia = prevMatchMedia;
  }
});

test('SVG markup: all 16 icons are layered with data-im-icon and data-im-part in their sources', () => {
  const dashboardHtml = fs.readFileSync(path.join(__dirname, '../public/html/dashboard.html'), 'utf8');
  for (const name of ['home', 'add', 'folder', 'trash', 'flame', 'compass']) {
    assert.ok(dashboardHtml.includes(`data-im-icon="${name}"`), `dashboard.html missing data-im-icon="${name}"`);
  }

  const optionMorphJs = fs.readFileSync(path.join(__dirname, '../public/js/components/project-option-morph.js'), 'utf8');
  for (const name of ['pencil', 'tag', 'copy', 'download', 'trash']) {
    assert.ok(optionMorphJs.includes(`data-im-icon="${name}"`), `project-option-morph.js missing data-im-icon="${name}"`);
  }

  const appShellJs = fs.readFileSync(path.join(__dirname, '../public/js/shell/app-shell.js'), 'utf8');
  for (const name of ['profile', 'upgrade', 'trash', 'settings', 'logout']) {
    assert.ok(appShellJs.includes(`data-im-icon="${name}"`), `app-shell.js missing data-im-icon="${name}"`);
  }
});
