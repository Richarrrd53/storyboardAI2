const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const F = require('../public/js/features/freeform-storyboard');
const B = require('../public/js/features/creative-brief');
const P = require('../public/js/components/template-presentation');
const { templateIndex, candidates, createRecommendationHandler } = require('../lib/template-recommendations');
const { responseSchemaFor, generateDecision, validateInput } = require('../lib/ai/copilot');
const { toOpenAIStrictSchema, normalizeOpenAIStructuredData } = require('../lib/ai/openai-schema');
const read = name => fs.readFileSync(path.join(__dirname, '../public/js/features', name + '.js'), 'utf8');
const template = count => ({ id: 'coffee', name: '晨間咖啡', category: 'story', tags: ['咖啡', '療癒'], variables: ['character', 'scene'],
    promptTemplate: { base: 'Feature coffee', perShot: [] }, narrative: { summary: '咖啡帶來日常轉折' },
    structure: Array.from({ length: count }, (_, i) => ({ id: `beat-${i}`, action: `故事節點 ${i}`, camera: 'original camera', duration: '1s' })) });
function plan(count = 8, target = 30, source = template(4)) {
    return { meta: { title: '咖啡的早晨' }, characters: [], shots: Array.from({ length: count }, (_, i) => ({ id: i + 1,
        sourceStructureId: source.structure[Math.min(source.structure.length - 1, Math.floor(i * source.structure.length / count))].id,
        story: `咖啡師的動作 ${i}`, camera: 'tracking close-up', duration: `${target / count}s`, emotion: 'calm', purpose: '推進故事細節', dialogue: '',
        shotPrompt: `Coffee cup in soft morning light, detail number ${i}`, characters: [] })) };
}
const input = source => ({ story: '大學生在晨間咖啡廳喝咖啡，30秒療癒故事', style: { name: '自然', prompt: 'natural light' }, duration: 30, ratio: '直向9:16', confirmBeforeImages: true, selectedTemplate: source, templateValues: { character: '大學生' }, creativeBrief: B.snapshot(B.create('30秒療癒故事')) });
function sessionFixture(storage = new Map()) {
    const events = {}, navigations = [];
    const context = vm.createContext({ console, AbortController, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }),
        sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        addEventListener: (name, listener) => { events[name] = listener; },
        spaNavigate: async (...args) => { navigations.push(args); },
        GenerationTask: { getState: () => ({ status: 'idle', save: {}, result: {} }), reset() {} } });
    context.window = context; vm.runInContext(read('creation'), context);
    return { context, session: context.CreationSessionStore, controller: context.CreationController, storage, events, navigations };
}
test('freeform remains default; template mode does not require a preselected template', () => {
    const f = sessionFixture(); assert.equal(f.session.generationMode, 'freeform');
    f.controller.setTemplateMode(true); assert.equal(f.session.generationMode, 'template'); assert.equal(f.session.selectedTemplate, null);
});
test('switching templates clears dependent variables but preserves story and brief', () => {
    const f = sessionFixture(); f.session.story = '原始故事'; f.session.creativeBrief = B.create('原始故事');
    f.controller.selectTemplate(template(4)); f.session.templateValues.character = '先前角色';
    f.controller.selectTemplate({ ...template(6), id: 'next' });
    assert.equal(f.session.story, '原始故事'); assert.equal(f.session.creativeBrief.originalStory, '原始故事');
    assert.equal(Object.keys(f.session.templateValues).length, 0); assert.equal(f.session.discussionStage, 'story');
});
test('cancel template returns to freeform and clears reference-only state', () => {
    const f = sessionFixture(); f.controller.selectTemplate(template(4)); f.session.templateSuggestions = { scene: '咖啡廳' };
    f.controller.setTemplateMode(false); assert.equal(f.session.generationMode, 'freeform'); assert.equal(f.session.selectedTemplate, null);
    assert.equal(Object.keys(f.session.templateSuggestions).length, 0);
});
test('active task prevents template replacement and cancellation', () => {
    const f = sessionFixture(); f.controller.selectTemplate(template(4));
    f.context.GenerationTask.getState = () => ({ status: 'generating', save: {} });
    assert.equal(f.controller.setTemplateMode(false), false); assert.equal(f.controller.selectTemplate({ id: 'other' }), false);
    assert.equal(f.session.selectedTemplate.id, 'coffee');
});
test('checkpoint reload restores discussion and filters without templates, images or running tasks', () => {
    const f = sessionFixture(); f.controller.selectTemplate(template(4)); f.session.story = '故事'; f.session.draft.story = '未送出草稿';
    f.session.currentPhase = 3; f.session.templateSelectionState.query = '咖啡'; f.session.templateSelectionState.scrollTop = 180;
    f.session.copilot = { active: true, busy: true, response: null, history: [], drafts: {}, retry: { secret: 'not serialized' } };
    f.controller.checkpoint(); const encoded = [...f.storage.values()][0];
    assert.doesNotMatch(encoded, /original camera|not serialized|data:image/);
    const restored = sessionFixture(f.storage).session;
    assert.equal(restored.selectedTemplate, null); assert.equal(restored.selectedTemplateId, 'coffee');
    assert.equal(restored.draft.story, '未送出草稿'); assert.equal(restored.templateSelectionState.scrollTop, 180); assert.equal(restored.copilot.busy, false);
});
test('QC submit carries mode and selected template across the new-session guard', async () => {
    const f = sessionFixture(); f.controller.selectTemplate(template(4)); f.session.draft.story = '保留的故事';
    await f.controller.submitFromQuickCompose('保留的故事');
    assert.equal(f.session.generationMode, 'template'); assert.equal(f.session.selectedTemplate.id, 'coffee');
    assert.equal(f.session.entrySource, 'qc'); assert.equal(f.navigations[0][0], 'generate');
});
test('mobile apply opens existing QC and keeps unsent story draft', async () => {
    const f = sessionFixture(); f.context.matchMedia = () => ({ matches: true }); let opens = 0;
    f.context.QuickCompose = { open: () => opens++, updateProgress() {} }; f.session.draft.story = '未送出故事';
    await f.controller.applyTemplateEntry(template(4)); assert.equal(opens, 1);
    assert.equal(f.session.draft.story, '未送出故事'); assert.equal(f.session.selectedTemplate.id, 'coffee'); assert.equal(f.navigations.length, 0);
});
test('preview apply resumes current selection instead of starting a new creation', async () => {
    const f = sessionFixture(); f.session.currentStep = 'template-selection'; f.session.currentPhase = 3; f.session.submitted = true;
    await f.controller.applyTemplateEntry(template(4));
    assert.equal(f.navigations[0][1].creationIntent, 'resume'); assert.equal(f.session.currentPhase, 3);
});
test('4 narrative nodes can expand to 8 valid shots without timing/camera overwrite', () => {
    const t = template(4), data = F.validate(plan(8, 30, t), 30, t);
    assert.equal(data.shots.length, 8); assert.equal(data.shots[0].camera, 'tracking close-up'); assert.equal(data.shots[0].duration, '3.75s');
});
test('6 narrative nodes can expand to 10 shots; target duration controls shot limits and totals', () => {
    const t = template(6); assert.equal(F.validate(plan(10, 30, t), 30, t).shots.length, 10);
    assert.equal(F.validate(plan(15, 60, t), 60, t).shots.length, 15);
    assert.throws(() => F.validate(plan(10, 30, t), 60, t), /時長|12–18/);
});
test('mapping requires exactly one existing node per shot and deterministic unique IDs', () => {
    const t = template(4), data = plan(); data.shots[0].sourceStructureId = 'unknown';
    assert.throws(() => F.validate(data, 30, t), /sourceStructureId/);
    data.shots[0].sourceStructureId = ['beat-0', 'beat-1']; assert.throws(() => F.validate(data, 30, t), /sourceStructureId/);
    const legacy = { structure: [{ id: 'node-2' }, {}, { id: 'node-2' }, { id: 'node-3-1' }] };
    assert.equal(new Set(F.nodes(legacy).map(node => node.id)).size, 4);
    assert.deepEqual(F.nodes(legacy), F.nodes(legacy));
    assert.ok(F.schema(30, ['beat-0']).properties.shots.items.required.includes('sourceStructureId'));
});
test('template planning preserves confirmed brief and variables and makes reference priorities explicit', () => {
    const i = input(template(4)); i.creativeBrief.confirmed.avoid = ['不要太暗'];
    const prompt = F.prompt(i); assert.match(prompt, /不要太暗/); assert.match(prompt, /大學生/); assert.match(prompt, /sourceStructureId/);
    assert.doesNotMatch(prompt, /必須輸出剛好 4/); assert.match(prompt, /原時長、運鏡與角度僅作節奏參考/);
});
test('template variable suggestions remain separate from confirmed values through shared response validation', () => {
    const response = B.validateResponse({ action: 'ready', message: '已整理', briefPatch: {}, templatePatch: [{ name: 'character', value: '大學生' }] });
    assert.equal(response.templatePatch[0].name, 'character');
    assert.throws(() => B.validateResponse({ action: 'ready', message: '已整理', briefPatch: {}, templatePatch: [{ name: '__proto__', value: 'x' }] }));
});
test('recommendation nullable and explicit values survive OpenAI strict normalization without selecting options', () => {
    const schema = toOpenAIStrictSchema(responseSchemaFor({ autoRounds: 0, intent: 'start' }));
    const q = schema.properties.form.anyOf?.[0] || schema.properties.form;
    assert.ok(JSON.stringify(q).includes('recommended'));
    for (const recommended of ['second', null, undefined]) {
        const data = { action: 'ask', message: '選擇方向', briefPatch: {}, form: { title: '方向', questions: [{ id: 'focus', type: 'single_choice', label: '視角', recommended, options: [{ value: 'first', label: '一' }, { value: 'second', label: '二' }] }] } };
        const result = B.validateResponse(normalizeOpenAIStructuredData(data));
        assert.equal(result.form.questions[0].recommended, recommended || null); assert.equal(B.create('故事').answers.length, 0);
    }
});
test('both providers return identical recommendation and template variable contracts in story and variable discussion', async () => {
    const decision = { action: 'ask', message: '希望留下什麼情緒？', briefPatch: {}, templatePatch: [{ name: 'scene', value: '晨間咖啡廳' }], form: { title: '討論', questions: [{ id: 'mood', type: 'single_choice', label: '情緒', recommended: 'calm', options: [{ value: 'joy', label: '輕快' }, { value: 'calm', label: '療癒' }] }] } };
    for (const stage of ['story', 'template']) {
        const results = [];
        for (const provider of ['gemini', 'openai']) {
            const client = { models: { generateContent: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(decision) }] } }] }) }, responses: { create: async () => ({ status: 'completed', output_text: JSON.stringify(decision) }) } };
            const result = await generateDecision(client, { ...input(template(4)), brief: B.create('故事'), history: [], intent: 'start', autoRounds: 0, discussionStage: stage, template: { ...template(4), variables: F.variables(template(4)) } }, { provider, logger() {} });
            results.push(result.form); assert.equal(result.templatePatch[0].name, 'scene');
        }
        assert.deepEqual(results[0], results[1]);
    }
});
test('Copilot input rejects malformed stages and variables before loading selected template', () => {
    const body = { story: '故事', brief: B.create('故事'), history: [], intent: 'start', autoRounds: 0, requestId: 'test', revision: 0, message: '', templateId: 'coffee', discussionStage: 'template', templateValues: { scene: '咖啡廳' } };
    assert.equal(validateInput(body).templateValues.scene, '咖啡廳');
    assert.throws(() => validateInput({ ...body, discussionStage: 'arbitrary' }));
    assert.throws(() => validateInput({ ...body, templateValues: { scene: ['invalid'] } }));
});
test('shared catalog combines category, search, tags and sort without mutating source templates', () => {
    const list = [template(4), { ...template(6), id: 'tea', name: '晨茶', tags: ['茶'], duration: '20s' }];
    assert.deepEqual(P.filter(list, { query: '咖啡', category: 'story', tag: '療癒', sort: 'name' }).map(t => t.id), ['coffee']);
    assert.equal(list[0].structure.length, 4);
});
test('candidate retrieval caps full-catalog growth and excludes detailed prompts/structure', () => {
    const index = Array.from({ length: 200 }, (_, i) => templateIndex({ ...template(6), id: `t-${i}` }));
    const result = candidates(index, '咖啡療癒故事', {});
    assert.equal(result.length, 12); assert.ok(JSON.stringify(result).length < 24000);
    assert.doesNotMatch(JSON.stringify(result), /original camera|promptTemplate|beat-0/);
});
async function invoke(handler, body, ip = 'test') {
    let status = 200, data;
    await handler({ body, ip, get: () => 'same-origin', is: () => true }, { status(value) { status = value; return this; }, json(value) { data = value; return this; } });
    return { status, data };
}
test('AI ranking validates IDs, deduplicates requests, caches per provider and never chooses a template', async () => {
    let calls = 0;
    const handler = createRecommendationHandler({ loadIndex: async () => [templateIndex(template(4))], resolveProvider: async (req, requested) => requested || 'gemini', generateText: async options => {
        calls++; assert.doesNotMatch(options.prompt, /original camera/);
        return { response: JSON.stringify({ recommendations: [{ id: 'coffee', reason: '敘事適合' }, { id: 'coffee', reason: '重複' }, { id: 'invented', reason: '不存在' }] }) };
    } });
    const body = { story: '咖啡的故事', brief: {} };
    const results = await Promise.all([invoke(handler, body), invoke(handler, body)]);
    assert.equal(calls, 1); assert.equal(results[0].data.recommendations.length, 1);
    assert.equal(results[0].data.selectedTemplate, undefined);
    await invoke(handler, body); assert.equal(calls, 1);
    await invoke(handler, { ...body, provider: 'openai' }); assert.equal(calls, 2);
});
test('recommendation failure has a recoverable manual-selection response', async () => {
    const handler = createRecommendationHandler({ loadIndex: async () => [templateIndex(template(4))], resolveProvider: async () => 'gemini', generateText: async () => { throw new Error('provider unavailable'); } });
    const result = await invoke(handler, { story: '咖啡', brief: {} });
    assert.equal(result.status, 503); assert.match(result.data.error, /手動搜尋與選擇/);
});
test('real shared task validates template plans before images, supports edits and preserves mapping payload', async () => {
    const t = template(4), calls = [];
    const context = vm.createContext({ console, AbortController, setTimeout, clearTimeout, FreeformStoryboard: F, fetch: async (url, init) => {
        const body = JSON.parse(init.body); calls.push(body);
        return { ok: true, json: async () => body.type === 'story' ? { response: JSON.stringify(plan()) } : { image: ['fixture.png'] } };
    } });
    context.window = context; vm.runInContext(read('generation-task'), context);
    const task = context.GenerationTask; await task.start(input(t));
    assert.equal(task.getState().status, 'awaiting_confirmation'); assert.equal(calls.length, 1);
    const data = task.getState().result.storyboardData; data.shots[0].duration = '4s'; data.shots[1].duration = '3.5s';
    assert.equal(task.updatePlan(data), true); await task.confirmPlan();
    assert.equal(task.getState().status, 'completed'); assert.equal(calls.filter(call => call.type === 'image').length, 8);
    assert.equal(task.getState().result.generatedShotData[0].payload.sourceStructureId, 'beat-0');
});
test('invalid mapping repairs once, starts no images and retry preserves the same task ID', async () => {
    let valid = false; const calls = [];
    const context = vm.createContext({ console, AbortController, setTimeout, clearTimeout, FreeformStoryboard: F, fetch: async (url, init) => {
        const body = JSON.parse(init.body); calls.push(body); const data = plan(); if (!valid) data.shots[0].sourceStructureId = 'invented';
        return { ok: true, json: async () => ({ response: JSON.stringify(data) }) };
    } });
    context.window = context; vm.runInContext(read('generation-task'), context);
    const task = context.GenerationTask; await task.start(input(template(4))); const id = task.getState().taskId;
    assert.equal(task.getState().status, 'error'); assert.equal(calls.length, 2);
    valid = true; await task.retry(); assert.equal(task.getState().taskId, id); assert.equal(task.getState().status, 'awaiting_confirmation');
});
test('recommendation prompt excludes display-only source fields, caps prompt length and sets json mime type', async () => {
    let seen = null;
    const items = Array.from({ length: 12 }, (_, i) => templateIndex({
        id: 'tpl-' + i, name: '咖啡故事 ' + i, category: 'story',
        description: '咖啡'.repeat(400), thumbnail: 'https://example.com/thumb-' + i + '.jpg',
        source: { videoId: 'v-' + i, title: '來源標題', description: 'SECRET_SOURCE_DESC_' + 'x'.repeat(1200) }
    }));
    const handler = createRecommendationHandler({
        loadIndex: async () => items, resolveProvider: async () => 'gemini',
        generateText: async args => { seen = args; return { response: JSON.stringify({ recommendations: [{ id: 'tpl-0', reason: '適合敘事' }] }) }; }
    });
    const result = await invoke(handler, { story: '咖啡故事', brief: {} });
    assert.equal(result.status, 200);
    assert.equal(seen.responseMimeType, 'application/json');
    assert.ok(seen.prompt.length <= 18000);
    assert.equal(seen.prompt.includes('SECRET_SOURCE_DESC_'), false);
    assert.equal(seen.prompt.includes('https://example.com/thumb-'), false);
});
test('shared catalog filter matches Chinese category names without explicit categoryLabel', () => {
    const items = [
        { id: '1', name: 'A', category: 'product', tags: [] },
        { id: '2', name: 'B', category: 'story', tags: [] }
    ];
    assert.deepEqual(TemplatePresentation.filter(items, { query: '商品廣告' }).map(item => item.id), ['1']);
    assert.deepEqual(TemplatePresentation.filter(items, { query: '敘事紀實' }).map(item => item.id), ['2']);
});
test('checkpoint clears oversized stale drafts and ignores expired or malformed storage', () => {
    const store = new Map([['storyboard.creation.v1', '{broken-json']]);
    const sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
    const ctx1 = vm.createContext({ console, sessionStorage, addEventListener() {} });
    ctx1.window = ctx1; vm.runInContext(read('creation'), ctx1);
    assert.equal(ctx1.CreationSessionStore.restoredDraft, undefined);

    ctx1.CreationSessionStore.story = '保留故事';
    ctx1.CreationSessionStore.creativeBrief = { requirements: ['x'.repeat(130000)] };
    ctx1.CreationController.checkpoint();
    assert.equal(store.has('storyboard.creation.v1'), false);

    store.set('storyboard.creation.v1', JSON.stringify({ savedAt: Date.now() - 86400001, story: '過期故事', generationMode: 'freeform' }));
    const ctx2 = vm.createContext({ console, sessionStorage, addEventListener() {} });
    ctx2.window = ctx2; vm.runInContext(read('creation'), ctx2);
    assert.equal(ctx2.CreationSessionStore.story, '');
});
test('gemini adapter sets responseMimeType application/json when responseSchema is provided', async () => {
    const geminiAdapter = require('../lib/ai/adapters/gemini-adapter');
    let captured = null;
    const client = { models: { generateContent: async req => { captured = req; return { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }; } } };
    const res = await geminiAdapter.generateText(client, { task: 'fast', prompt: 'hi', responseSchema: { type: 'object' } });
    assert.equal(captured.config.responseMimeType, 'application/json');
    assert.equal(res.response, '{"ok":true}');
});
