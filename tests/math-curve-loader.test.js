const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(reduce = false) {
    const frames = new Map(), listeners = new Set(); let next = 0;
    function node() {
        return { children: [], attributes: {}, isConnected: true, setAttribute(key, value) { this.attributes[key] = value; },
            appendChild(child) { this.children.push(child); child.parent = this; },
            remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); },
            querySelectorAll() { return [...this.children]; } };
    }
    const document = { hidden: false, createElementNS: () => node(),
        addEventListener: (event, fn) => listeners.add(fn), removeEventListener: (event, fn) => listeners.delete(fn) };
    const math = Object.create(Math); math.random = () => 0; // Ensure the normal variant spawns an inward particle.
    const context = vm.createContext({ document, performance: { now: () => 0 }, Math: math,
        requestAnimationFrame: fn => { const id = ++next; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id) });
    context.window = context; context.matchMedia = () => ({ matches: reduce });
    vm.runInContext(fs.readFileSync('public/js/math-curve-loader.js', 'utf8'), context);
    function start(compact) {
        const group = node(), path = node(), sucked = node(), svg = node();
        svg.querySelector = selector => ({ '.math-loader-group': group, '.math-loader-path': path, '.math-loader-sucked': sucked })[selector];
        const handle = context.initMathCurveLoader({ root: { querySelectorAll: () => [svg] }, compact });
        return { group, path, sucked, handle };
    }
    return { start, frames, listeners };
}

test('compact shares the original curve and timing, disables only inward particles and cleans up', () => {
    const f = fixture();
    const large = f.start(false), originalPath = large.path.attributes.d;
    assert.equal(large.group.children.length, 78); assert.equal(large.sucked.children.length, 1);
    const compact = f.start(true);
    assert.equal(large.group.children.length, 0, 'A new loader stops the previous mounted loader');
    assert.equal(compact.path.attributes.d, originalPath);
    assert.equal(compact.group.children.length, 78); assert.equal(compact.sucked.children.length, 0);
    const [id, frame] = [...f.frames][0]; f.frames.delete(id); frame(600);
    assert.notEqual(compact.path.attributes.d, originalPath);
    assert.equal(compact.sucked.children.length, 0); assert.equal(f.listeners.size, 1);
    compact.handle.stop(); compact.handle.stop();
    assert.equal(f.frames.size, 0); assert.equal(f.listeners.size, 0); assert.equal(compact.group.children.length, 0);
});

test('reduced motion keeps both loader variants static without inward particles or RAF loops', () => {
    for (const compact of [false, true]) {
        const f = fixture(true), result = f.start(compact);
        assert.ok(result.path.attributes.d.startsWith('M '));
        assert.equal(result.sucked.children.length, 0); assert.equal(f.frames.size, 0);
        result.handle.stop(); assert.equal(f.listeners.size, 0);
    }
});
