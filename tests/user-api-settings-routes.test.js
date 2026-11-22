const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');

test('personal OpenAI keys validate, drive generation and stay isolated across concurrent requests', async () => {
    process.env.OPENAI_API_KEY = 'server-key-must-never-be-used-123456';
    process.env.GEMINI_API_KEY = 'server-gemini-key-must-never-be-used-123456';
    process.env.GOOGLE_API_KEY = 'server-google-key-must-never-be-used-123456';
    process.env.YOUTUBE_API_KEY = 'server-youtube-key-must-never-be-used-123456';
    process.env.SITE_GEMINI_ENABLED = 'false';
    process.env.SITE_YOUTUBE_ENABLED = 'false';
    process.env.JWT_SECRET = 'account-api-test-jwt-secret';
    process.env.API_KEYS_ENCRYPTION_SECRET = 'fixture-only-db-encryption-secret-32-chars';
    process.env.DISCOVERY_SETTINGS_SECRET = 'fixture-only-stable-secret-at-least-32-characters';

    const jwt = require('jsonwebtoken');
    const tokens = ['account-a', 'account-b'].map(id => jwt.sign({ id }, process.env.JWT_SECRET));
    const pwHashes = {
        'account-a': await bcrypt.hash('pass-a-123', 4),
        'account-b': await bcrypt.hash('pass-b-123', 4)
    };
    const passwords = ['pass-a-123', 'pass-b-123'];
    const credentialRows = new Map();
    const prismaPath = require.resolve('@prisma/client');
    const originalPrisma = require(prismaPath);
    require.cache[prismaPath].exports = {
        PrismaClient: class {
            constructor() {
                this.user = {
                    findUnique: async ({ where }) => (pwHashes[where.id] ? { id: where.id, passwordHash: pwHashes[where.id], aiProvider: 'gemini' } : null)
                };
                this.userApiCredential = {
                    findMany: async ({ where }) => [...credentialRows.values()].filter(r => r.userId === where.userId),
                    upsert: async ({ where, create, update }) => {
                        const key = `${where.userId_provider.userId}:${where.userId_provider.provider}`;
                        const existing = credentialRows.get(key);
                        const now = new Date();
                        const record = existing ? { ...existing, ...update, updatedAt: now } : { id: crypto.randomUUID(), ...create, createdAt: now, updatedAt: now };
                        credentialRows.set(key, record);
                        return record;
                    }
                };
            }
        }
    };

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
    const post = (path, body, token = tokens[0]) => fetch(base + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: base, Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
    });
    const save = async (key, index) => {
        const response = await post('/api/discovery/settings', { openaiApiKey: key, currentPassword: passwords[index] }, tokens[index]);
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.openai.source, 'account');
        assert.ok(!JSON.stringify(data).includes(key));
    };
    try {
        const keys = ['sk-fixture-first-personal-key-12345', 'sk-fixture-second-personal-key-12345'];
        await Promise.all(keys.map(save));
        const available = await fetch(base + '/api/ai/providers', { headers: { Authorization: `Bearer ${tokens[0]}` } });
        const capabilities = await available.json();
        assert.equal(capabilities.providers.openai.available, true);
        assert.equal(capabilities.providers.gemini.available, false);
        const missingGemini = await post('/api/ask-gemini', { provider: 'gemini', type: 'text', question: 'fixture' }, tokens[0]);
        assert.equal(missingGemini.status, 503);
        const mine = await fetch(base + '/api/discovery/settings', { headers: { Authorization: `Bearer ${tokens[0]}` } });
        const mineStatus = await mine.json();
        assert.equal(mineStatus.youtube.configured, false);
        assert.equal(mineStatus.gemini.configured, false);
        const guest = await fetch(base + '/api/ai/providers');
        assert.equal(guest.status, 401);
        const invalidToken = await fetch(base + '/api/discovery/settings', { headers: { Authorization: 'Bearer invalid' } });
        assert.equal(invalidToken.status, 401);
        const unsigned = await post('/api/discovery/settings', { openaiApiKey: keys[0], ownerId: 'account-a', currentPassword: passwords[0] }, 'invalid');
        assert.equal(unsigned.status, 401);

        const generated = await Promise.all(tokens.map(token => post('/api/ask-gemini', {
            provider: 'openai', type: 'text', question: 'A fixture story'
        }, token)));
        for (const response of generated) {
            assert.equal(response.status, 200);
            assert.equal((await response.json()).response, 'fixture response');
        }
        assert.deepEqual(seen.sort(), keys.sort());
        const failed = await post('/api/discovery/settings', { openaiApiKey: 'sk-invalid-fixture-key-1234567', currentPassword: passwords[0] }, tokens[0]);
        assert.equal(failed.status, 502);
        assert.ok(!(await failed.text()).includes('private upstream'));
        const crossSite = await fetch(base + '/api/discovery/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'https://other.example', Authorization: `Bearer ${tokens[0]}` },
            body: JSON.stringify({ openaiApiKey: keys[0], currentPassword: passwords[0] })
        });
        assert.equal(crossSite.status, 403);
    } finally {
        require.cache[sdkPath].exports = original;
        require.cache[prismaPath].exports = originalPrisma;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
