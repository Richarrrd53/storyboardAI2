// Explicit paid check: RUN_VERTEX_LIVE=1 node --test tests/storyboard-generation.live.js
const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config({ quiet: true });
const credentials = require('../lib/google-credentials');
credentials.normalizeCredentialPath();
const free = require('../public/js/features/freeform-storyboard');
const { getModelConfig } = require('../lib/ai/model-config');
const { parseResponse, reportAIError } = require('../lib/ai/generation');

test('live Vertex: structured story request returns a valid plan before any image generation', {
    skip: process.env.RUN_VERTEX_LIVE !== '1' ? 'Explicit paid test opt-in is required' : !credentials.vertexAvailable() ? 'Vertex project or usable ADC is unavailable' : false,
    timeout: 125000
}, async () => {
    const { GoogleGenAI } = require('@google/genai');
    const client = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT_ID, location: 'global', ...credentials.vertexAuthOptions() });
    const model = getModelConfig('story', { includeThoughts: true }), started = Date.now();
    let response;
    try {
        response = await client.models.generateContent({ ...model,
            config: { ...model.config, responseJsonSchema: free.schema(30), httpOptions: { timeout: 120000, retryOptions: { attempts: 1 } } },
            contents: [{ text: free.prompt({ story: '以咖啡豆、咖啡杯與沖煮過程拍攝短片，只拍物件，不出現人物。', style: { name: '自然', prompt: 'bright natural light' }, ratio: '9:16', duration: 30 }) }] });
    } catch (error) {
        const failure = reportAIError(error, { task: 'story', model: model.model, contract: 'freeform-v2', stage: 'call_vertex', elapsedMs: Date.now() - started });
        throw new Error('Live storyboard request failed: ' + failure.code);
    }
    const parsed = parseResponse(response, { includeThoughts: true });
    const plan = free.validate(JSON.parse(parsed.response.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), 30);
    assert.ok(plan.shots.length >= 8 && plan.shots.length <= 12);
    console.info('Live story completed', { model: model.model, thinkingLevel: model.config.thinkingConfig.thinkingLevel,
        elapsedMs: Date.now() - started, usage: parsed.usage, shotCount: plan.shots.length,
        thoughtSummaryCount: parsed.thoughtSummaries.length, upstreamStatus: response.sdkHttpResponse?.responseInternal?.status || null });
});
