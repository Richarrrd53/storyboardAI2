/**
 * Manual opt-in low-cost OpenAI Smoke Test.
 * Run manually: node tests/openai-live.js
 * Not included in `npm test` (*.test.js) to avoid paid API calls in CI.
 */
require('dotenv').config();
const assert = require('node:assert/strict');
const OpenAI = require('openai');
const { generateDecision } = require('../lib/ai/copilot');
const { createProviderRouter } = require('../lib/ai/provider-router');
const brief = require('../public/js/features/creative-brief');
const freeform = require('../public/js/features/freeform-storyboard');

async function main() {
    if (!process.env.OPENAI_API_KEY?.trim()) {
        console.log('Skipped: OPENAI_API_KEY is not configured.');
        return;
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() });
    const router = createProviderRouter({
        getOpenAIClient: () => client,
        getGeminiClient: () => { throw new Error('Gemini client should not be called'); }
    });

    console.log('1. Testing OpenAI Copilot structured decision...');
    const copilotResult = await generateDecision(client, {
        story: '早晨陽光灑進咖啡廳，咖啡師手沖一杯咖啡。',
        brief: brief.create('早晨陽光灑進咖啡廳，咖啡師手沖一杯咖啡。'),
        history: [],
        message: '',
        intent: 'start',
        autoRounds: 0
    }, { provider: 'openai' });
    assert.ok(['ask', 'propose', 'ready'].includes(copilotResult.action));
    console.log('   OK:', copilotResult.action, copilotResult.meta?.model, copilotResult.meta?.usage);

    console.log('2. Testing OpenAI Freeform v2 storyboard...');
    const storyResult = await router.generateText({
        provider: 'openai',
        task: 'story',
        schemaName: 'freeform_storyboard',
        responseSchema: freeform.schema(15),
        prompt: freeform.prompt({
            story: '早晨陽光灑進咖啡廳，咖啡師手沖一杯咖啡。',
            duration: 15,
            ratio: '9:16',
            style: { name: '自然寫實', prompt: 'natural realistic lighting' }
        })
    });
    const validated = freeform.validate(JSON.parse(storyResult.response), 15);
    console.log('   OK:', validated.shots.length, 'shots,', storyResult.model, storyResult.usage);
}

main().catch(err => {
    console.error('OpenAI live smoke test failed:', err.code || '', err.message);
    process.exitCode = 1;
});
