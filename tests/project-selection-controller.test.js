'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ProjectSelectionController = require('../public/js/components/project-selection');
const ProjectCard = require('../public/js/components/project-card');

function createMockDOM(cardIds = ['p1', 'p2', 'p3', 'p4']) {
    const winListeners = new Map();
    const docListeners = new Map();

    const makeEmitter = (map) => ({
        addEventListener(type, fn) {
            if (!map.has(type)) map.set(type, new Set());
            map.get(type).add(fn);
        },
        removeEventListener(type, fn) {
            map.get(type)?.delete(fn);
        },
        dispatch(type, event) {
            for (const fn of Array.from(map.get(type) || [])) fn(event);
        }
    });

    const win = {
        ...makeEmitter(winListeners),
        requestAnimationFrame: null,
        cancelAnimationFrame: null
    };

    const makeClassList = () => {
        const set = new Set();
        return {
            add: (...cls) => cls.forEach(c => set.add(c)),
            remove: (...cls) => cls.forEach(c => set.delete(c)),
            toggle: (c, force) => (force === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : (force ? set.add(c) : set.delete(c))),
            contains: (c) => set.has(c)
        };
    };

    const cards = cardIds.map((id, idx) => {
        const attrs = new Map();
        const card = {
            dataset: { id },
            classList: makeClassList(),
            setAttribute: (k, v) => attrs.set(k, v),
            getAttribute: (k) => attrs.get(k),
            closest: (sel) => (sel.includes('.project-card') ? card : null),
            getBoundingClientRect: () => ({
                left: idx * 200,
                top: 0,
                right: idx * 200 + 180,
                bottom: 220,
                width: 180,
                height: 220
            })
        };
        return card;
    });

    const containerListeners = new Map();
    const scrollListeners = new Map();

    const bodyChildren = [];
    const doc = {
        ...makeEmitter(docListeners),
        defaultView: win,
        body: {
            appendChild(el) { el.parentNode = doc.body; bodyChildren.push(el); },
            removeChild(el) { const i = bodyChildren.indexOf(el); if (i >= 0) bodyChildren.splice(i, 1); el.parentNode = null; }
        },
        createElement() {
            return { className: '', style: {}, setAttribute() {}, parentNode: null };
        },
        elementFromPoint: () => null
    };

    const container = {
        ...makeEmitter(containerListeners),
        ownerDocument: doc,
        classList: makeClassList(),
        contains: (el) => cards.includes(el),
        querySelectorAll: () => cards
    };

    const scrollContainer = {
        ...makeEmitter(scrollListeners),
        scrollLeft: 0,
        scrollTop: 0,
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 900, bottom: 500 })
    };

    return { win, doc, container, scrollContainer, cards, winListeners, docListeners, containerListeners, scrollListeners, bodyChildren };
}

test('ProjectSelectionController: Ctrl/Cmd toggle, Shift range with dynamic order, Escape clear, and syncItems', () => {
    const dom = createMockDOM(['p1', 'p2', 'p3', 'p4']);
    let ordered = ['p1', 'p2', 'p3', 'p4'];
    const events = [];

    const ctrl = ProjectSelectionController.create({
        container: dom.container,
        scrollContainer: dom.scrollContainer,
        getOrderedIds: () => ordered,
        onChange: (state) => events.push(state)
    });

    // Ctrl+click selects p1
    assert.equal(ctrl.handleCardClick('p1', { ctrlKey: true }), true);
    assert.deepEqual(ctrl.getSelectedIds(), ['p1']);
    assert.equal(dom.cards[0].classList.contains('is-selected'), true);

    // Shift+click p3 selects p1, p2, p3
    assert.equal(ctrl.handleCardClick('p3', { shiftKey: true }), true);
    assert.deepEqual(ctrl.getSelectedIds(), ['p1', 'p2', 'p3']);

    // Reorder list (simulating sort) and sync after p2 deleted
    ordered = ['p4', 'p3', 'p1'];
    ctrl.syncItems(ordered);
    assert.deepEqual(ctrl.getSelectedIds(), ['p1', 'p3']);

    // Escape exits selection mode
    dom.win.dispatch('keydown', { key: 'Escape' });
    assert.equal(ctrl.isActive(), false);
    assert.deepEqual(ctrl.getSelectedIds(), []);

    ctrl.destroy();
    assert.equal(dom.winListeners.get('keydown')?.size || 0, 0);
});

test('ProjectSelectionController: desktop marquee box selection intersects cards and accounts for scroll', () => {
    const dom = createMockDOM(['p1', 'p2', 'p3', 'p4']);
    const ctrl = ProjectSelectionController.create({
        container: dom.container,
        scrollContainer: dom.scrollContainer,
        getOrderedIds: () => ['p1', 'p2', 'p3', 'p4']
    });

    const blankTarget = { closest: () => null };
    dom.scrollContainer.dispatch('pointerdown', {
        pointerType: 'mouse',
        button: 0,
        pointerId: 1,
        clientX: 10,
        clientY: 10,
        target: blankTarget
    });
    dom.win.dispatch('pointermove', { pointerType: 'mouse', pointerId: 1, clientX: 350, clientY: 180 });

    assert.equal(ctrl.isActive(), true);
    assert.deepEqual(ctrl.getSelectedIds(), ['p1', 'p2']);
    assert.equal(dom.bodyChildren.length, 1); // marquee element mounted

    dom.win.dispatch('pointerup', { pointerType: 'mouse', pointerId: 1 });
    assert.equal(dom.bodyChildren.length, 0); // marquee element removed
    assert.deepEqual(ctrl.getSelectedIds(), ['p1', 'p2']); // selection preserved

    ctrl.destroy();
});

test('ProjectSelectionController: mobile touch scroll cancels long-press; confirmed long-press enables slide-select without double-toggle', async () => {
    const dom = createMockDOM(['p1', 'p2', 'p3']);
    const ctrl = ProjectSelectionController.create({
        container: dom.container,
        scrollContainer: dom.scrollContainer,
        getOrderedIds: () => ['p1', 'p2', 'p3']
    });

    // 1. Normal vertical scroll (>10px movement before 450ms) does NOT trigger selection
    dom.container.dispatch('pointerdown', {
        pointerType: 'touch',
        pointerId: 10,
        clientX: 50,
        clientY: 50,
        target: dom.cards[0]
    });
    dom.win.dispatch('pointermove', { pointerType: 'touch', pointerId: 10, clientX: 50, clientY: 90 });
    await new Promise(r => setTimeout(r, ProjectSelectionController.LONG_PRESS_MS + 40));
    assert.equal(ctrl.isActive(), false);
    dom.win.dispatch('pointerup', { pointerType: 'touch', pointerId: 10 });

    // 2. Stationary long-press enters selection mode, then sliding across p2 twice only selects p2 once
    dom.container.dispatch('pointerdown', {
        pointerType: 'touch',
        pointerId: 11,
        clientX: 50,
        clientY: 50,
        target: dom.cards[0]
    });
    await new Promise(r => setTimeout(r, ProjectSelectionController.LONG_PRESS_MS + 40));
    assert.equal(ctrl.isActive(), true);
    assert.deepEqual(ctrl.getSelectedIds(), ['p1']);

    dom.doc.elementFromPoint = () => dom.cards[1];
    dom.win.dispatch('pointermove', { pointerType: 'touch', pointerId: 11, clientX: 220, clientY: 50 });
    dom.win.dispatch('pointermove', { pointerType: 'touch', pointerId: 11, clientX: 230, clientY: 55 });
    assert.deepEqual(ctrl.getSelectedIds(), ['p1', 'p2']); // Not toggled off on second move over same card

    dom.win.dispatch('pointerup', { pointerType: 'touch', pointerId: 11 });
    assert.equal(ctrl.shouldSuppressCardClick(), true);

    ctrl.destroy();
});

test('ProjectCard.formatTrashRetentionText displays remaining days, <1 day, and pending cleanup accurately', () => {
    const now = Date.parse('2026-11-22T00:00:00Z');
    assert.equal(
        ProjectCard.formatTrashRetentionText({ deletedAt: '2026-11-19T00:00:00Z' }, now),
        '27 天後永久刪除'
    );
    assert.equal(
        ProjectCard.formatTrashRetentionText({ deletedAt: '2026-10-23T12:00:00Z' }, now),
        '剩餘不到 1 天'
    );
    assert.equal(
        ProjectCard.formatTrashRetentionText({ deletedAt: '2026-10-20T00:00:00Z' }, now),
        '等待清理'
    );
});
