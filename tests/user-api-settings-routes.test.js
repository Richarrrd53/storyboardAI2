const { test } = require('node:test');
const assert = require('node:assert/strict');

test('personal OpenAI keys validate, drive generation and stay isolated across concurrent requests', async () => {
    process.env.OPENAI_API_KEY = 'server-key-must-never-be-used-123456';
    process.env.GEMINI_API_KEY = 'server-gemini-key-must-never-be-used-123456';
    process.env.GOOGLE_API_KEY = 'server-google-key-must-never-be-used-123456';
    process.env.YOUTUBE_API_KEY = 'server-youtube-key-must-never-be-used-123456';
    process.env.SITE_GEMINI_ENABLED = 'false';
    process.env.SITE_YOUTUBE_ENABLED = 'false';
    process.env.JWT_SECRET = 'account-api-test-jwt-secret';
    const jwt = require('jsonwebtoken');
    const tokens = ['account-a', 'account-b'].map(id => jwt.sign({ id }, process.env.JWT_SECRET));
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
    const post = (path, body, cookie = '', token = tokens[0]) => fetch(base + path, { method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const save = async (key, index) => {
        const response = await post('/api/discovery/settings', { openaiApiKey: key }, '', tokens[index]);
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.openai.source, 'browser');
        assert.ok(!JSON.stringify(data).includes(key));
        return response.headers.get('set-cookie').split(';')[0];
    };
    try {
        const keys = ['sk-fixture-first-personal-key-12345', 'sk-fixture-second-personal-key-12345'];
        const cookies = await Promise.all(keys.map(save));
        const available = await fetch(base + '/api/ai/providers', { headers: { Cookie: cookies[0], Authorization: `Bearer ${tokens[0]}` } });
        const capabilities = await available.json();
        assert.equal(capabilities.providers.openai.available, true);
        assert.equal(capabilities.providers.gemini.available, false);
        const missingGemini = await post('/api/ask-gemini', { provider: 'gemini', type: 'text', question: 'fixture' }, cookies[0]);
        assert.equal(missingGemini.status, 503);
        const mine = await fetch(base + '/api/discovery/settings', { headers: { Cookie: cookies[0], Authorization: `Bearer ${tokens[0]}` } });
        const mineStatus = await mine.json();
        assert.equal(mineStatus.youtube.configured, false);
        assert.equal(mineStatus.gemini.configured, false);
        const guest = await fetch(base + '/api/ai/providers');
        assert.equal(guest.status, 401);
        const invalidToken = await fetch(base + '/api/discovery/settings', { headers: { Cookie: cookies[0], Authorization: 'Bearer invalid' } });
        assert.equal(invalidToken.status, 401);
        const unsigned = await post('/api/discovery/settings', { openaiApiKey: keys[0], ownerId: 'account-a' }, cookies[0], 'invalid');
        assert.equal(unsigned.status, 401);
        assert.equal(unsigned.headers.get('set-cookie'), null);
        const combined = cookies.join('; ');
        for (const token of tokens) {
            const mine = await fetch(base + '/api/discovery/settings', { headers: { Cookie: combined, Authorization: `Bearer ${token}` } });
            assert.equal((await mine.json()).openai.configured, true);
        }
        const other = await fetch(base + '/api/ai/providers', { headers: { Cookie: cookies[0], Authorization: `Bearer ${tokens[1]}` } });
        assert.equal((await other.json()).providers.openai.available, false);
        const before = seen.length;
        const denied = await post('/api/ask-gemini', { provider: 'openai', type: 'text', question: 'fixture' }, cookies[0], tokens[1]);
        assert.equal(denied.status, 403);
        assert.equal(seen.length, before);
        const generated = await Promise.all(cookies.map((cookie, index) => post('/api/ask-gemini', {
            provider: 'openai', type: 'text', question: 'A fixture story'
        }, cookie, tokens[index])));
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
            headers: { 'Content-Type': 'application/json', Origin: 'https://other.example', Authorization: `Bearer ${tokens[0]}` },
            body: JSON.stringify({ openaiApiKey: keys[0] }) });
        assert.equal(crossSite.status, 403);
    } finally {
        require.cache[sdkPath].exports = original;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
