const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');

test('settings page, password-verified DB save, reload across devices and search use account credentials without leaking keys', async () => {
    Object.assign(process.env, {
        NODE_ENV: 'production', YOUTUBE_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '',
        GOOGLE_CLOUD_PROJECT_ID: 'test-project', GOOGLE_APPLICATION_CREDENTIALS: '', GCP_SERVICE_ACCOUNT_BASE64: '',
        API_KEYS_ENCRYPTION_SECRET: 'route-test-only-stable-db-encryption-secret',
        DISCOVERY_SETTINGS_SECRET: 'route-test-only-stable-cookie-secret-32c'
    });

    const passwordHash = await bcrypt.hash('correct-password-123', 4);
    const credentialRows = new Map();
    const prismaPath = require.resolve('@prisma/client');
    const originalPrisma = require(prismaPath);
    require.cache[prismaPath].exports = {
        PrismaClient: class {
            constructor() {
                this.user = {
                    findUnique: async ({ where }) => (where.id === 'account-settings-fixture'
                        ? { id: 'account-settings-fixture', passwordHash, aiProvider: 'gemini' }
                        : null)
                };
                this.userApiCredential = {
                    findMany: async ({ where }) => [...credentialRows.values()].filter(r => r.userId === where.userId),
                    upsert: async ({ where, create, update }) => {
                        const key = `${where.userId_provider.userId}:${where.userId_provider.provider}`;
                        const existing = credentialRows.get(key);
                        const now = new Date();
                        const record = existing
                            ? { ...existing, ...update, updatedAt: now }
                            : { id: crypto.randomUUID(), ...create, createdAt: now, updatedAt: now };
                        credentialRows.set(key, record);
                        return record;
                    },
                    deleteMany: async ({ where }) => {
                        let count = 0;
                        for (const [k, v] of credentialRows.entries()) {
                            if (v.userId === where.userId && (!where.provider || v.provider === where.provider)) {
                                credentialRows.delete(k);
                                count++;
                            }
                        }
                        return { count };
                    }
                };
            }
        }
    };

    const YouTubeCollector = require('../lib/discovery/youtube-collector');
    const { GoogleGenAI } = require('@google/genai');
    const { getModel } = require('../lib/ai/model-config');
    const modelPrototype = Object.getPrototypeOf(new GoogleGenAI({ vertexai: false, apiKey: 'test' }).models);
    let checkedYouTube;
    let checkedGemini = 0;
    let searchedKey;
    YouTubeCollector.prototype.request = async function () {
        if (this.apiKey === 'invalid-youtube-key-1234567890') throw new Error('YouTube API 無法取得影片');
        checkedYouTube = this.apiKey;
        return { items: [] };
    };
    YouTubeCollector.prototype.search = async function () { searchedKey = this.apiKey; return { videos: [] }; };
    modelPrototype.get = async ({ model }) => { checkedGemini++; assert.equal(model, getModel('discovery')); return { name: model }; };
    const app = require('../server');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = require('jsonwebtoken').sign({ id: 'account-settings-fixture' }, process.env.JWT_SECRET || 'storyboard-secret-key-123');
    const auth = { Authorization: `Bearer ${token}` };
    const nativeFetch = fetch;
    const fetchAsUser = (url, options = {}) => nativeFetch(url, { ...options, headers: { ...auth, ...options.headers } });
    const post = (url, payload, origin = base) => fetchAsUser(base + url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(payload)
    });
    try {
        const page = await fetchAsUser(base + '/discovery/settings');
        assert.equal(page.status, 200);
        assert.match(await page.text(), /js\/main\.js/);
        assert.match(await (await fetchAsUser(base + '/html/discovery-settings.html')).text(), /id="api-settings-form"/);
        assert.match(await (await fetchAsUser(base + '/discovery')).text(), /js\/main\.js/);
        assert.match(await (await fetchAsUser(base + '/html/discovery.html')).text(), /href="\/discovery\/settings"/);
        assert.equal((await (await fetchAsUser(base + '/api/discovery/settings')).json()).configured, false);

        const invalid = await post('/api/discovery/settings', { youtubeApiKey: 'bad', currentPassword: 'correct-password-123' });
        assert.equal(invalid.status, 400);

        const keys = { youtubeApiKey: 'test-youtube-key-1234567890', geminiApiKey: 'test-gemini-key-1234567890', currentPassword: 'correct-password-123' };
        const rejected = await post('/api/discovery/settings', keys, 'https://other.example');
        assert.equal(rejected.status, 403);

        // Missing or wrong password must be rejected without calling providers or saving
        const missingPw = await post('/api/discovery/settings', { youtubeApiKey: keys.youtubeApiKey });
        assert.equal(missingPw.status, 400);
        const wrongPw = await post('/api/discovery/settings', { ...keys, currentPassword: 'wrong-password' });
        assert.equal(wrongPw.status, 403);
        assert.equal(credentialRows.size, 0);

        const saved = await post('/api/discovery/settings', keys);
        assert.equal(saved.status, 200);
        const savedStatus = await saved.json();
        assert.equal(savedStatus.configured, true);
        assert.equal(checkedYouTube, keys.youtubeApiKey);
        assert.equal(checkedGemini, 1);
        assert.ok(!JSON.stringify(savedStatus).includes(keys.youtubeApiKey));
        assert.ok(!JSON.stringify(savedStatus).includes('correct-password-123'));

        // Cross-device reload (no cookies needed, only Bearer JWT)
        const reload = await fetchAsUser(base + '/api/discovery/settings');
        assert.equal(reload.headers.get('cache-control'), 'no-store');
        const reloadData = await reload.json();
        assert.equal(reloadData.configured, true);
        assert.equal(reloadData.youtube.source, 'account');
        assert.equal((await (await fetchAsUser(base + '/api/discovery/skills')).json()).configured, true);

        const search = await post('/api/discovery/search', { query: '#food', platform: 'youtube-shorts' });
        assert.equal(search.status, 200);
        assert.equal(searchedKey, keys.youtubeApiKey);

        // Failed provider check preserves existing DB keys
        const failedUpdate = await post('/api/discovery/settings', { youtubeApiKey: 'invalid-youtube-key-1234567890', currentPassword: 'correct-password-123' });
        assert.equal(failedUpdate.status, 502);
        const searchAfterFail = await post('/api/discovery/search', { query: '#food2', platform: 'youtube-shorts' });
        assert.equal(searchAfterFail.status, 200);
        assert.equal(searchedKey, keys.youtubeApiKey);

        // Empty update keeps existing keys without requiring password
        const keep = await post('/api/discovery/settings', { youtubeApiKey: '', geminiApiKey: '' });
        assert.equal(keep.status, 200);
        assert.equal((await keep.json()).configured, true);
    } finally {
        require.cache[prismaPath].exports = originalPrisma;
        await new Promise(resolve => server.close(resolve));
    }
});
