const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join('public/css', file), 'utf8');
function declarations(text) {
  return Object.fromEntries([...text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
}
const tokens = Object.assign({}, ...['primitives', 'colors', 'typography', 'spacing', 'sizing', 'radius', 'border', 'shadow', 'blur', 'opacity', 'layers', 'motion', 'components'].map(name => declarations(read(`tokens/${name}.css`).split('/* Opaque fallback')[0])), declarations(read('tokens.css')));
function resolve(name, seen = []) {
  assert.ok(!seen.includes(name), `Token cycle: ${[...seen, name].join(' -> ')}`);
  assert.ok(name in tokens, `Missing token ${name}`);
  return tokens[name].replace(/var\((--[\w-]+)\)/g, (_, key) => resolve(key, [...seen, name]));
}
function layer(name) {
  const expression = resolve(name).replace(/calc\(|\)/g, '').replace(/\s/g, '');
  assert.match(expression, /^\d+(?:[+-]\d+)*$/);
  return expression.match(/[+-]?\d+/g).reduce((sum, value) => sum + Number(value), 0);
}
function rgb(hex) { return hex.match(/[a-f\d]{2}/gi).map(channel => parseInt(channel, 16)); }
function luminance(color) { return color.map(c => { const n = c / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0); }
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

test('floating material aliases resolve without cycles and have one recipe owner', () => {
  for (const name of ['--surface-floating-bg', '--surface-floating-blur', '--surface-floating-shadow', '--surface-floating-highlight']) {
    assert.ok(resolve(name));
    assert.ok(!(name in declarations(read('tokens/blur.css'))));
    assert.ok(!(name in declarations(read('tokens/shadow.css'))));
  }
  assert.equal(resolve('--mobile-nav-bg'), resolve('--surface-floating-bg'));
  assert.equal(resolve('--glass-floating-blur'), resolve('--surface-floating-blur'));
});

test('navigation, menu, account, composer, sheet and modal obey the agreed layer order', () => {
  const names = ['nav', 'dropdown', 'popover', 'dock-backdrop', 'dock', 'dock-navigation', 'dock-content', 'overlay', 'transition', 'sheet-backdrop', 'sheet', 'modal', 'toast', 'system'];
  const values = names.map(name => layer('--layer-' + name));
  for (let i = 1; i < values.length; i++) assert.ok(values[i] > values[i - 1], `${names[i]} must be above ${names[i - 1]}`);
});

test('control sizing follows the approved 36/44/52 scale and mobile hit target', () => {
  assert.deepEqual(['sm', 'md', 'lg'].map(size => resolve('--control-height-' + size)), ['36px', '44px', '52px']);
  assert.equal(resolve('--touch-target-mobile'), '44px');
});

test('all mandatory foundation token references have definitions', () => {
  const files = ['tokens.css', ...fs.readdirSync('public/css/tokens').filter(file => file.endsWith('.css')).map(file => 'tokens/' + file)];
  const source = files.map(read).join('\n');
  const defined = new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  for (const match of source.matchAll(/var\((--[\w-]+)\s*\)/g)) assert.ok(defined.has(match[1]), `Unresolved mandatory token ${match[1]}`);
});

test('focus and text roles meet target contrast on their specified surfaces', () => {
  const white = rgb('#ffffff'), navy = rgb('#0c1324'), focus = rgb(resolve('--focus-ring-color'));
  assert.ok(contrast(focus, white) >= 3); assert.ok(contrast(focus, navy) >= 3);
  assert.ok(contrast(rgb(resolve('--color-text-danger')), white) >= 4.5);
  assert.ok(contrast(white, rgb(resolve('--color-action-primary-default'))) >= 4.5);
  const reading = [250, 251, 253].map((c, i) => c * .96 + navy[i] * .04);
  assert.ok(contrast(rgb(resolve('--color-text-secondary')), reading) >= 4.5);
});
