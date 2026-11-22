const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');

test('account-bound DB credentials, password re-auth, cross-device sync, legacy cookie migration, unbind, and rate limits', async () => {
    Object.assign(process.env, {
        NODE_ENV: 'production',
        JWT_SECRET: 'api-key-mgmt-test-secret',
        GOOGLE_CLOUD_PROJECT_ID: 'site-vertex-project',
        GOOGLE_CLOUD_LOCATION: 'global',
        GOOGLE_APPLICATION_CREDENTIALS: __filename,
        GCP_SERVICE_ACCOUNT_BASE64: '',
        GEMINI_API_KEY: '',
        GOOGLE_API_KEY: '',
        OPENAI_API_KEY: 'server-openai-must-never-be-used-123456',
        YOUTUBE_API_KEY: 'site-youtube-default-key-1234567890',
        SITE_GEMINI_ENABLED: 'true',
        SITE_YOUTUBE_ENABLED: 'true',
        SITE_GEMINI_RPM: '50',
        SITE_YOUTUBE_RPM: '2',
        SITE_YOUTUBE_CACHE_TTL_MS: '60000',
        PASSWORD_VERIFY_LIMIT: '15',
        API_KEYS_ENCRYPTION_SECRET: 'api-key-mgmt-db-secret-32-chars-min-len',
        DISCOVERY_SETTINGS_SECRET: 'api-key-mgmt-cookie-secret-32-chars-min'
    });

    const sdkPath = require.resolve('@google/genai');
    const originalSdk = require(sdkPath);
    const geminiCalls = [];
    let forceGeminiError = null;

    require.cache[sdkPath].exports = {
        ...originalSdk,
        GoogleGenAI: class {
            constructor(options) {
                this.options = options;
                this.models = {
                    get: async ({ model }) => ({ name: model }),
                    generateContent: async args => {
                        geminiCalls.push({ vertexai: this.options.vertexai, apiKey: this.options.apiKey, model: args.model });
                        if (forceGeminiError) throw forceGeminiError;
                        if (args.contents?.[0]?.parts?.[0]?.fileData) {
                            const sections = Object.fromEntries(['setup', 'problem', 'solution', 'ending'].map(k => [k, { status: 'observed', text: 'ok', timestamp: '00:01' }]));
                            return { candidates: [{ content: { parts: [{ text: JSON.stringify({ sections }) }] } }] };
                        }
                        return { candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'ready', message: 'ok', briefPatch: {} }) }] } }] };
                    }
                };
            }
        }
    };

    const openaiPath = require.resolve('openai');
    const originalOpenai = require(openaiPath);
    require.cache[openaiPath].exports = class {
        constructor({ apiKey }) {
            this.apiKey = apiKey;
            this.models = { list: async () => ({ data: [] }) };
        }
    };

    const YouTubeCollector = require('../lib/discovery/youtube-collector');
    const originalYtRequest = YouTubeCollector.prototype.request;
    const originalYtSearch = YouTubeCollector.prototype.search;
    const ytSearches = [];
    let forceYtSearchError = null;
    YouTubeCollector.prototype.request = async function () { return { items: [] }; };
    YouTubeCollector.prototype.search = async function ({ query }) {
        ytSearches.push({ apiKey: this.apiKey, query });
        if (forceYtSearchError) throw forceYtSearchError;
        return { videos: [{ id: 'abcdefghijk', title: 'Mock Short', stats: { views: 100 } }], diagnostics: {} };
    };

    const pwHash1 = await bcrypt.hash('user1-password-secret', 4);
    const pwHash2 = await bcrypt.hash('user2-password-secret', 4);
    const prismaPath = require.resolve('@prisma/client');
    const originalPrisma = require(prismaPath);
    const users = new Map([
        ['user-1', { id: 'user-1', passwordHash: pwHash1, aiProvider: 'gemini' }],
        ['user-2', { id: 'user-2', passwordHash: pwHash2, aiProvider: 'gemini' }]
    ]);
    const credentialRows = new Map();

    require.cache[prismaPath].exports = {
        PrismaClient: class {
            constructor() {
                this.user = {
                    findUnique: async ({ where }) => (users.has(where.id) ? { ...users.get(where.id) } : null),
                    update: async ({ where, data }) => {
                        const u = users.get(where.id);
                        if (!u) return null;
                        if (data.aiProvider) u.aiProvider = data.aiProvider;
                        return { ...u };
                    },
                    updateMany: async ({ where, data }) => {
                        const u = users.get(where.id);
                        if (u && (!where.aiProvider || u.aiProvider === where.aiProvider)) {
                            u.aiProvider = data.aiProvider;
                            return { count: 1 };
                        }
                        return { count: 0 };
                    }
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
                this.template = {
                    findMany: async () => [{ id: 'tpl-1', name: 'Test', category: 'story', tags: [], description: 'desc', content: { structure: [{ id: 'n1', label: 'Hook' }] } }]
                };
            }
        }
    };

    const app = require('../server');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const jwt = require('jsonwebtoken');
    const token1DeviceA = jwt.sign({ id: 'user-1' }, process.env.JWT_SECRET);
    const token1DeviceB = jwt.sign({ id: 'user-1' }, process.env.JWT_SECRET);
    const token2 = jwt.sign({ id: 'user-2' }, process.env.JWT_SECRET);

    const api = (url, { method = 'GET', body, cookie = '', token = token1DeviceA } = {}) => fetch(base + url, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Origin: base,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });

    try {
        // 0. Unauthenticated requests are denied
        assert.equal((await api('/api/discovery/settings', { token: null })).status, 401);
        assert.equal((await api('/api/discovery/settings', { method: 'POST', token: null, body: { geminiApiKey: 'k'.repeat(25) } })).status, 401);

        // 1. No personal keys -> site Gemini (Vertex AI) & site YouTube are active
        const initCaps = await (await api('/api/ai/providers')).json();
        assert.equal(initCaps.providers.gemini.available, true);
        assert.equal(initCaps.providers.openai.available, false);
        assert.equal(initCaps.services.gemini.source, 'server');
        assert.equal(initCaps.services.gemini.personalConfigured, false);
        assert.equal(initCaps.services.youtube.source, 'server');
        assert.equal(initCaps.services.openai.configured, false);

        // Discovery search uses site YouTube key and caches repeated query
        const search1 = await api('/api/discovery/search', { method: 'POST', body: { query: '#shorts', platform: 'youtube-shorts' } });
        assert.equal(search1.status, 200);
        assert.equal(ytSearches.at(-1).apiKey, process.env.YOUTUBE_API_KEY);
        const searchCached = await api('/api/discovery/search', { method: 'POST', body: { query: '#shorts', platform: 'youtube-shorts' } });
        assert.equal(searchCached.status, 200);
        assert.equal((await searchCached.json()).meta.cached, true);
        assert.equal(ytSearches.length, 1);

        // Site YouTube rate limit (RPM = 2) triggers 429 + Retry-After on 3rd distinct search
        assert.equal((await api('/api/discovery/search', { method: 'POST', body: { query: '#q2', platform: 'youtube-shorts' } })).status, 200);
        const ytLimited = await api('/api/discovery/search', { method: 'POST', body: { query: '#q3', platform: 'youtube-shorts' } });
        assert.equal(ytLimited.status, 429);
        assert.ok(ytLimited.headers.get('retry-after'));

        // Site Gemini works for ask-gemini, copilot, discovery/analyze
        assert.equal((await api('/api/ask-gemini', { method: 'POST', body: { type: 'flash', question: 'hello' } })).status, 200);
        assert.equal(geminiCalls.at(-1).vertexai, true);

        const creative = require('../public/js/features/creative-brief');
        const copilotRes = await api('/api/creation/copilot', {
            method: 'POST',
            body: { story: 'test', brief: creative.create('test'), history: [], message: '', intent: 'start', autoRounds: 0, requestId: 'site-gemini-copilot', revision: 0 }
        });
        assert.equal(copilotRes.status, 200);
        assert.equal(geminiCalls.at(-1).vertexai, true);

        const analyzeRes = await api('/api/discovery/analyze', { method: 'POST', body: { videoId: 'abcdefghijk', skill: 'short-video-template-lab' } });
        assert.equal(analyzeRes.status, 200);
        assert.equal(geminiCalls.at(-1).vertexai, true);

        // 2. Wrong password cannot save personal keys
        const badSave = await api('/api/discovery/settings', {
            method: 'POST',
            body: { geminiApiKey: 'personal-gemini-key-1234567890', currentPassword: 'wrong-password' }
        });
        assert.equal(badSave.status, 403);
        assert.equal(credentialRows.size, 0);

        // Bind personal Gemini & YouTube keys with correct password
        const saveRes = await api('/api/discovery/settings', {
            method: 'POST',
            body: {
                geminiApiKey: 'personal-gemini-key-1234567890',
                youtubeApiKey: 'personal-youtube-key-1234567890',
                currentPassword: 'user1-password-secret'
            }
        });
        assert.equal(saveRes.status, 200);
        const saveData = await saveRes.json();
        assert.equal(saveData.gemini.source, 'account');
        assert.equal(saveData.gemini.personalConfigured, true);
        assert.equal(saveData.youtube.source, 'account');
        assert.equal(saveData.youtube.personalConfigured, true);

        // Verify DB has encrypted records with no plaintext
        assert.equal(credentialRows.size, 2);
        for (const row of credentialRows.values()) {
            assert.ok(!row.encryptedKey.includes('personal-gemini-key'));
            assert.ok(!row.encryptedKey.includes('personal-youtube-key'));
            assert.equal(row.keyVersion, 'v1');
        }

        // Cross-device sync: Device B (fresh JWT, zero cookies) immediately sees and uses User 1's keys
        const deviceBCaps = await (await api('/api/ai/providers', { token: token1DeviceB })).json();
        assert.equal(deviceBCaps.services.gemini.source, 'account');
        assert.equal(deviceBCaps.services.gemini.personalConfigured, true);

        assert.equal((await api('/api/ask-gemini', { method: 'POST', token: token1DeviceB, body: { type: 'flash', question: 'personal' } })).status, 200);
        assert.equal(geminiCalls.at(-1).vertexai, false);
        assert.equal(geminiCalls.at(-1).apiKey, 'personal-gemini-key-1234567890');

        // Personal Gemini failure MUST NOT fall back to Vertex AI
        const beforeFailCount = geminiCalls.length;
        forceGeminiError = Object.assign(new Error('invalid personal key'), { status: 403 });
        const failedPersonalGemini = await api('/api/ask-gemini', { method: 'POST', token: token1DeviceB, body: { type: 'flash', question: 'fail' } });
        assert.equal(failedPersonalGemini.status, 502);
        assert.equal(geminiCalls.length, beforeFailCount + 1);
        forceGeminiError = null;

        // Personal YouTube key is used and failure MUST NOT fall back to site key
        const ytPersonalSearch = await api('/api/discovery/search', { method: 'POST', token: token1DeviceB, body: { query: '#personal-tag', platform: 'youtube-shorts' } });
        assert.equal(ytPersonalSearch.status, 200);
        assert.equal(ytSearches.at(-1).apiKey, 'personal-youtube-key-1234567890');

        forceYtSearchError = new Error('YouTube API 今日配額已用完');
        const ytPersonalFail = await api('/api/discovery/search', { method: 'POST', token: token1DeviceB, body: { query: '#personal-fail', platform: 'youtube-shorts' } });
        assert.equal(ytPersonalFail.status, 502);
        assert.equal(ytSearches.at(-1).apiKey, 'personal-youtube-key-1234567890');
        forceYtSearchError = null;

        // User 2 does not inherit User 1's personal keys
        const user2Caps = await (await api('/api/ai/providers', { token: token2 })).json();
        assert.equal(user2Caps.services.gemini.source, 'server');
        assert.equal(user2Caps.services.gemini.personalConfigured, false);

        // 3. Wrong password cannot unbind Gemini
        const badUnbind = await api('/api/discovery/settings/gemini', { method: 'DELETE', body: { currentPassword: 'wrong' } });
        assert.equal(badUnbind.status, 403);

        // Unbind Gemini with correct password -> restores Vertex AI without affecting YouTube
        const unbindGemini = await api('/api/discovery/settings/gemini', { method: 'DELETE', body: { currentPassword: 'user1-password-secret' } });
        assert.equal(unbindGemini.status, 200);
        const afterUnbindGemini = await unbindGemini.json();
        assert.equal(afterUnbindGemini.gemini.source, 'server');
        assert.equal(afterUnbindGemini.gemini.personalConfigured, false);
        assert.equal(afterUnbindGemini.youtube.source, 'account');

        // Device B also sees restored Vertex AI immediately after unbind
        assert.equal((await api('/api/ask-gemini', { method: 'POST', token: token1DeviceB, body: { type: 'flash', question: 'restored-vertex' } })).status, 200);
        assert.equal(geminiCalls.at(-1).vertexai, true);

        // 4. Unbind YouTube -> restores site YouTube key
        const unbindYt = await api('/api/discovery/settings/youtube', { method: 'DELETE', body: { currentPassword: 'user1-password-secret' } });
        assert.equal(unbindYt.status, 200);
        const afterUnbindYt = await unbindYt.json();
        assert.equal(afterUnbindYt.youtube.source, 'server');
        assert.equal(afterUnbindYt.youtube.personalConfigured, false);

        // 5. OpenAI bind, select as default provider, then unbind -> auto-resets aiProvider to gemini
        const bindOpenAI = await api('/api/discovery/settings', {
            method: 'POST',
            body: { openaiApiKey: 'sk-personal-openai-key-1234567890', currentPassword: 'user1-password-secret' }
        });
        assert.equal(bindOpenAI.status, 200);

        const switchOpenAI = await api('/api/user/ai-provider', { method: 'PATCH', body: { provider: 'openai' } });
        assert.equal(switchOpenAI.status, 200);
        assert.equal(users.get('user-1').aiProvider, 'openai');

        const unbindOpenAI = await api('/api/discovery/settings/openai', { method: 'DELETE', body: { currentPassword: 'user1-password-secret' } });
        assert.equal(unbindOpenAI.status, 200);
        const unbindOpenAIData = await unbindOpenAI.json();
        assert.equal(unbindOpenAIData.openai.configured, false);
        assert.equal(unbindOpenAIData.aiProvider, 'gemini');
        assert.equal(users.get('user-1').aiProvider, 'gemini');

        // Selecting OpenAI while unbound fails
        const deniedOpenAI = await api('/api/user/ai-provider', { method: 'PATCH', body: { provider: 'openai' } });
        assert.equal(deniedOpenAI.status, 503);

        // 6. Legacy cookie migration: detects old cookie, requires password, imports without overwriting DB, clears cookie
        const { ApiSettings } = require('../lib/discovery/api-settings');
        const legacyHelper = new ApiSettings({ env: process.env });
        const cookieName = legacyHelper.cookieName('user-1');
        const legacyKey = crypto.createHash('sha256').update(process.env.DISCOVERY_SETTINGS_SECRET).digest();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
        cipher.setAAD(Buffer.from('user-1'));
        const enc = Buffer.concat([
            cipher.update(JSON.stringify({ geminiApiKey: 'legacy-cookie-gemini-key-123456', ownerId: 'user-1', expiresAt: Date.now() + 60000 })),
            cipher.final()
        ]);
        const legacyCookie = `${cookieName}=${Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url')}`;

        const statusWithLegacy = await (await api('/api/discovery/settings', { cookie: legacyCookie })).json();
        assert.equal(statusWithLegacy.legacyMigration.available, true);
        assert.deepEqual(statusWithLegacy.legacyMigration.providers, ['gemini']);

        const badMigrate = await api('/api/discovery/settings/migrate-cookie', {
            method: 'POST', cookie: legacyCookie, body: { currentPassword: 'wrong' }
        });
        assert.equal(badMigrate.status, 403);

        const okMigrate = await api('/api/discovery/settings/migrate-cookie', {
            method: 'POST', cookie: legacyCookie, body: { currentPassword: 'user1-password-secret' }
        });
        assert.equal(okMigrate.status, 200);
        const migratedData = await okMigrate.json();
        assert.equal(migratedData.gemini.personalConfigured, true);
        assert.equal(migratedData.legacyMigration.available, false);
        assert.deepEqual(migratedData.migratedProviders, ['gemini']);
        assert.match(okMigrate.headers.get('set-cookie') || '', /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    } finally {
        require.cache[sdkPath].exports = originalSdk;
        require.cache[openaiPath].exports = originalOpenai;
        require.cache[prismaPath].exports = originalPrisma;
        YouTubeCollector.prototype.request = originalYtRequest;
        YouTubeCollector.prototype.search = originalYtSearch;
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});
