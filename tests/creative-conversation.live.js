// Explicit paid integration check: RUN_VERTEX_LIVE=1 node --test tests/creative-conversation.live.js
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
const credentials = require('../lib/google-credentials');
credentials.normalizeCredentialPath();
const B = require('../public/js/features/creative-brief');
const { generateDecision, validateInput } = require('../lib/ai/copilot');

test('live Vertex: creative discussion, confirmed choice and valid structured continuation', {
    skip: process.env.RUN_VERTEX_LIVE !== '1' ? 'Explicit paid test opt-in is required' : !credentials.vertexAvailable() ? 'Vertex project or usable ADC is unavailable' : false,
    timeout: 3 * (require('../lib/ai/creative-request').getRequestPolicy().totalMs + 5000)
}, async () => {
    const { GoogleGenAI } = require('@google/genai');
    const client = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT_ID, location: 'global', ...credentials.vertexAuthOptions() });
    const story = '想拍一支咖啡廳短片，還沒決定聚會情境，請先提供不同的創作方向讓我選擇。保持明亮自然光，不要太暗。';
    const brief = B.create(story), history = [];
    for (let round = 0; round < 3; round++) {
        const input = validateInput({ story, brief, history, intent: round ? 'answer' : 'start', autoRounds: round,
            message: '', requestId: 'vertex-live-' + round, revision: brief.revision });
        const decision = await generateDecision(client, input, { requestId: 'vertex-live-' + round });
        B.validateResponse(decision);
        assert.equal(decision.meta.model, require('../lib/ai/model-config').getModel('creative'));
        assert.equal(decision.meta.thinkingLevel, process.env.GEMINI_CREATIVE_THINKING_LEVEL || 'MEDIUM');
        B.suggest(brief, decision.briefPatch);
        history.push({ role: 'assistant', text: decision.message });
        if (decision.action === 'ready') {
            assert.ok(round >= 1, 'The requested initial options must be returned before ready');
            B.confirm(brief); assert.ok(brief.answers.length >= 1); break;
        }
        const drafts = Object.fromEntries(decision.form.questions.map(question => [question.id,
            { values: question.type === 'free_text' ? [] : question.options.slice(0, Math.max(1, question.min || 0)).map(option => option.value), other: question.type === 'free_text' ? '朋友聚會，用桌邊動作與反應鏡頭推進故事。' : '' }]));
        const answers = B.answers(decision.form, drafts);
        B.commit(brief, answers);
        history.push({ role: 'user', text: answers.map(answer => answer.question + '：' + [...answer.values.map(value => value.label), answer.other].filter(Boolean).join('、')).join('\n') });
        if (round === 2) assert.fail('Expected ready by the proactive question limit');
    }
});
