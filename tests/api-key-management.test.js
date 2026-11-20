const { test } = require('node:test');
const assert = require('node:assert/strict');

test('site-default Vertex AI + YouTube, personal override, strict no-fallback, unbind, rate limit, and search cache', async () => {
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

    const prismaPath = require.resolve('@prisma/client');
    const originalPrisma = require(prismaPath);
    const userState = { id: 'user-1', aiProvider: 'gemini' };
    require.cache[prismaPath].exports = {
        PrismaClient: class {
            constructor() {
                this.user = {
                    findUnique: async ({ where }) => (where.id === userState.id ? { ...userState } : null),
                    update: async ({ where, data }) => {
                        if (where.id === userState.id && data.aiProvider) userState.aiProvider = data.aiProvider;
                        return { ...userState };
                    },
                    updateMany: async ({ where, data }) => {
                        if (where.id === userState.id && (!where.aiProvider || userState.aiProvider === where.aiProvider)) {
                            userState.aiProvider = data.aiProvider;
                            return { count: 1 };
                        }
                        return { count: 0 };
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
    const token1 = jwt.sign({ id: 'user-1' }, process.env.JWT_SECRET);
    const token2 = jwt.sign({ id: 'user-2' }, process.env.JWT_SECRET);

    const api = (url, { method = 'GET', body, cookie = '', token = token1 } = {}) => fetch(base + url, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            Origin: base,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });

    try {
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

        // Site Gemini works for ask-gemini, copilot, discovery/analyze, templates/recommend
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

        // 2. Bind personal Gemini & YouTube keys -> personal keys take priority
        const saveRes = await api('/api/discovery/settings', {
            method: 'POST',
            body: { geminiApiKey: 'personal-gemini-key-1234567890', youtubeApiKey: 'personal-youtube-key-1234567890' }
        });
        assert.equal(saveRes.status, 200);
        const saveData = await saveRes.json();
        assert.equal(saveData.gemini.source, 'browser');
        assert.equal(saveData.gemini.personalConfigured, true);
        assert.equal(saveData.youtube.source, 'browser');
        assert.equal(saveData.youtube.personalConfigured, true);
        let cookie = saveRes.headers.get('set-cookie').split(';')[0];

        // Personal Gemini key is used instead of Vertex AI
        assert.equal((await api('/api/ask-gemini', { method: 'POST', cookie, body: { type: 'flash', question: 'personal' } })).status, 200);
        assert.equal(geminiCalls.at(-1).vertexai, false);
        assert.equal(geminiCalls.at(-1).apiKey, 'personal-gemini-key-1234567890');

        // Personal Gemini failure MUST NOT fall back to Vertex AI
        const beforeFailCount = geminiCalls.length;
        forceGeminiError = Object.assign(new Error('invalid personal key'), { status: 403 });
        const failedPersonalGemini = await api('/api/ask-gemini', { method: 'POST', cookie, body: { type: 'flash', question: 'fail' } });
        assert.equal(failedPersonalGemini.status, 502);
        assert.equal(geminiCalls.length, beforeFailCount + 1);
        forceGeminiError = null;

        // Personal YouTube key is used and failure MUST NOT fall back to site key
        const ytPersonalSearch = await api('/api/discovery/search', { method: 'POST', cookie, body: { query: '#personal-tag', platform: 'youtube-shorts' } });
        assert.equal(ytPersonalSearch.status, 200);
        assert.equal(ytSearches.at(-1).apiKey, 'personal-youtube-key-1234567890');

        forceYtSearchError = new Error('YouTube API 今日配額已用完');
        const ytPersonalFail = await api('/api/discovery/search', { method: 'POST', cookie, body: { query: '#personal-fail', platform: 'youtube-shorts' } });
        assert.equal(ytPersonalFail.status, 502);
        assert.equal(ytSearches.at(-1).apiKey, 'personal-youtube-key-1234567890');
        forceYtSearchError = null;

        // User 2 does not inherit User 1's personal keys
        const user2Caps = await (await api('/api/ai/providers', { cookie, token: token2 })).json();
        assert.equal(user2Caps.services.gemini.source, 'server');
        assert.equal(user2Caps.services.gemini.personalConfigured, false);

        // 3. Unbind Gemini -> restores Vertex AI without affecting YouTube
        const unbindGemini = await api('/api/discovery/settings/gemini', { method: 'DELETE', cookie });
        assert.equal(unbindGemini.status, 200);
        cookie = unbindGemini.headers.get('set-cookie').split(';')[0];
        const afterUnbindGemini = await unbindGemini.json();
        assert.equal(afterUnbindGemini.gemini.source, 'server');
        assert.equal(afterUnbindGemini.gemini.personalConfigured, false);
        assert.equal(afterUnbindGemini.youtube.source, 'browser');

        assert.equal((await api('/api/ask-gemini', { method: 'POST', cookie, body: { type: 'flash', question: 'restored-vertex' } })).status, 200);
        assert.equal(geminiCalls.at(-1).vertexai, true);

        // 4. Unbind YouTube -> restores site YouTube key
        const unbindYt = await api('/api/discovery/settings/youtube', { method: 'DELETE', cookie });
        assert.equal(unbindYt.status, 200);
        cookie = unbindYt.headers.get('set-cookie').split(';')[0];
        const afterUnbindYt = await unbindYt.json();
        assert.equal(afterUnbindYt.youtube.source, 'server');
        assert.equal(afterUnbindYt.youtube.personalConfigured, false);

        // 5. OpenAI bind, select as default provider, then unbind -> auto-resets aiProvider to gemini
        const bindOpenAI = await api('/api/discovery/settings', { method: 'POST', cookie, body: { openaiApiKey: 'sk-personal-openai-key-1234567890' } });
        assert.equal(bindOpenAI.status, 200);
        cookie = bindOpenAI.headers.get('set-cookie').split(';')[0];

        const switchOpenAI = await api('/api/user/ai-provider', { method: 'PATCH', cookie, body: { provider: 'openai' } });
        assert.equal(switchOpenAI.status, 200);
        assert.equal(userState.aiProvider, 'openai');

        const unbindOpenAI = await api('/api/discovery/settings/openai', { method: 'DELETE', cookie });
        assert.equal(unbindOpenAI.status, 200);
        const unbindOpenAIData = await unbindOpenAI.json();
        assert.equal(unbindOpenAIData.openai.configured, false);
        assert.equal(unbindOpenAIData.aiProvider, 'gemini');
        assert.equal(userState.aiProvider, 'gemini');

        // Selecting OpenAI while unbound fails
        cookie = unbindOpenAI.headers.get('set-cookie').split(';')[0];
        const deniedOpenAI = await api('/api/user/ai-provider', { method: 'PATCH', cookie, body: { provider: 'openai' } });
        assert.equal(deniedOpenAI.status, 503);
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
