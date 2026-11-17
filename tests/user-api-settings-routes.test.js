const { test } = require('node:test');
const assert = require('node:assert/strict');

test('personal OpenAI keys validate, drive generation and stay isolated across concurrent requests', async () => {
    process.env.OPENAI_API_KEY = '';
    process.env.DISCOVERY_SETTINGS_SECRET = 'fixture-only-stable-secret-at-least-32-characters';
    const sdkPath = require.resolve('openai');
    const original = require(sdkPath);
    const seen = [];
    require.cache[sdkPath].exports = class {
        constructor({ apiKey }) {
            this.models = { list: async () => {
                if (apiKey.includes('invalid')) throw new Error('private upstream details');
                return { data: [] };
            } };
            this.responses = { create: async () => {
                seen.push(apiKey);
                await new Promise(resolve => setTimeout(resolve, apiKey.includes('first') ? 15 : 1));
                return { status: 'completed', output_text: 'fixture response' };
            } };
        }
    };
    const app = require('../server');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (path, body, cookie = '') => fetch(base + path, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie }, body: JSON.stringify(body) });
    const save = async key => {
        const response = await post('/api/discovery/settings', { openaiApiKey: key });
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.openai.source, 'browser');
        assert.ok(!JSON.stringify(data).includes(key));
        return response.headers.get('set-cookie').split(';')[0];
    };
    try {
        const keys = ['sk-fixture-first-personal-key-12345', 'sk-fixture-second-personal-key-12345'];
        const cookies = await Promise.all(keys.map(save));
        const available = await fetch(base + '/api/ai/providers', { headers: { Cookie: cookies[0] } });
        assert.equal((await available.json()).providers.openai.available, true);
        const guest = await fetch(base + '/api/ai/providers');
        assert.equal((await guest.json()).providers.openai.available, false);
        const generated = await Promise.all(cookies.map(cookie => post('/api/ask-gemini', {
            provider: 'openai', type: 'text', question: 'A fixture story'
        }, cookie)));
        for (const response of generated) {
            assert.equal(response.status, 200);
            assert.equal((await response.json()).response, 'fixture response');
        }
        assert.deepEqual(seen.sort(), keys.sort());
        const failed = await post('/api/discovery/settings', { openaiApiKey: 'sk-invalid-fixture-key-1234567' }, cookies[0]);
        assert.equal(failed.status, 502);
        assert.equal(failed.headers.get('set-cookie'), null);
        assert.ok(!(await failed.text()).includes('private upstream'));
        const crossSite = await fetch(base + '/api/discovery/settings', { method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' },
            body: JSON.stringify({ openaiApiKey: keys[0] }) });
        assert.equal(crossSite.status, 403);
    } finally {
        require.cache[sdkPath].exports = original;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
