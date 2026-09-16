const { test } = require('node:test');
const assert = require('node:assert/strict');

test('settings page, validated save, reload and search use browser credentials without leaking keys', async () => {
    // Isolated process: no real credentials, provider calls or database access.
    Object.assign(process.env, {
        NODE_ENV: 'production', YOUTUBE_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '',
        GOOGLE_CLOUD_PROJECT_ID: 'test-project', GOOGLE_APPLICATION_CREDENTIALS: '', GCP_SERVICE_ACCOUNT_BASE64: '',
        DISCOVERY_SETTINGS_SECRET: 'route-test-only-stable-encryption-secret'
    });
    const YouTubeCollector = require('../lib/discovery/youtube-collector');
    const { GoogleGenAI } = require('@google/genai');
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
    modelPrototype.get = async () => { checkedGemini++; return { name: 'gemini-2.5-flash' }; };
    const app = require('../server');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, payload, cookie = '', origin = base) => fetch(base + url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, Origin: origin }, body: JSON.stringify(payload)
    });
    try {
        const page = await fetch(base + '/discovery/settings');
        assert.equal(page.status, 200);
        assert.match(await page.text(), /id="api-settings-form"/);
        assert.match(await (await fetch(base + '/discovery')).text(), /href="\/discovery\/settings"/);
        assert.equal((await (await fetch(base + '/api/discovery/settings')).json()).configured, false);
        const invalid = await post('/api/discovery/settings', { youtubeApiKey: 'bad' });
        assert.equal(invalid.status, 400);
        assert.equal(invalid.headers.get('set-cookie'), null);
        const keys = { youtubeApiKey: 'test-youtube-key-1234567890', geminiApiKey: 'test-gemini-key-1234567890' };
        const rejected = await post('/api/discovery/settings', keys, '', 'https://other.example');
        assert.equal(rejected.status, 403);
        const saved = await post('/api/discovery/settings', keys);
        assert.equal(saved.status, 200);
        const savedStatus = await saved.json();
        assert.equal(savedStatus.configured, true);
        assert.equal(checkedYouTube, keys.youtubeApiKey);
        assert.equal(checkedGemini, 1);
        assert.ok(!JSON.stringify(savedStatus).includes(keys.youtubeApiKey));
        const cookie = saved.headers.get('set-cookie').split(';')[0];
        const reload = await fetch(base + '/api/discovery/settings', { headers: { Cookie: cookie } });
        assert.equal(reload.headers.get('cache-control'), 'no-store');
        assert.equal((await reload.json()).savedAt, savedStatus.savedAt);
        assert.equal((await (await fetch(base + '/api/discovery/skills', { headers: { Cookie: cookie } })).json()).configured, true);
        assert.equal((await (await fetch(base + '/api/discovery/settings')).json()).configured, false);
        const search = await post('/api/discovery/search', { query: '#food', platform: 'youtube-shorts' }, cookie);
        assert.equal(search.status, 200);
        assert.equal(searchedKey, keys.youtubeApiKey);
        const failedUpdate = await post('/api/discovery/settings', { youtubeApiKey: 'invalid-youtube-key-1234567890' }, cookie);
        assert.equal(failedUpdate.status, 502);
        assert.equal(failedUpdate.headers.get('set-cookie'), null);
        const keep = await post('/api/discovery/settings', { youtubeApiKey: '', geminiApiKey: '' }, cookie);
        assert.equal(keep.status, 200);
        assert.equal((await keep.json()).configured, true);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
