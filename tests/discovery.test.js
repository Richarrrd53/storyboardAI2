const { test } = require('node:test');
const assert = require('node:assert/strict');
const YouTubeCollector = require('../lib/discovery/youtube-collector');
const { analyzeVideo } = require('../lib/discovery/video-analyzer');

const item = (id, duration = 'PT30S', title = '#料理', views = '12') => ({
    id, contentDetails: { duration }, snippet: { title, description: '', channelTitle: '頻道', channelId: 'channel', publishedAt: new Date().toISOString() }, statistics: { viewCount: views }
});
function collector(responses, calls = []) {
    return new YouTubeCollector({ apiKey: 'test', fetchImpl: async url => {
        calls.push(url);
        const data = responses.shift();
        assert.ok(data, 'unexpected API call');
        return { ok: true, json: async () => data };
    } });
}

test('hashtag filters long/unrelated videos, follows pages and sorts views', async () => {
    const calls = [];
    const c = collector([
        { items: [{ id: { videoId: 'a' } }], nextPageToken: 'next' },
        { items: [item('a'), item('long', 'PT4M'), item('wrong', 'PT20S', '#料理教學')] },
        { items: [{ id: { videoId: 'b' } }] },
        { items: [item('b', 'PT3M', '#料理', '100')] }
    ], calls);
    const result = await c.search({ query: '#料理', timeRange: '7', resultLimit: 2 });
    assert.deepEqual(result.videos.map(v => v.id), ['b', 'a']);
    assert.ok(calls[0].searchParams.has('publishedAfter'));
    assert.equal(calls[2].searchParams.get('pageToken'), 'next');
    assert.equal(result.videos[0].stats.likes, null);
});

test('channel names resolve into channelId instead of keyword video search', async () => {
    const calls = [];
    const c = collector([{ items: [{ id: { channelId: 'resolved' }, snippet: { title: '正確頻道' } }] }, { items: [] }], calls);
    const result = await c.search({ query: '頻道名稱', timeRange: 'all', resultLimit: 5 });
    assert.equal(result.channel.id, 'resolved');
    assert.equal(calls[1].searchParams.get('channelId'), 'resolved');
    assert.equal(calls[1].searchParams.has('q'), false);
    assert.equal(calls[1].searchParams.has('publishedAfter'), false);
});

test('missing key and quota errors are actionable', async () => {
    await assert.rejects(new YouTubeCollector({ apiKey: '' }).request('search', {}), /YOUTUBE_API_KEY/);
    const c = new YouTubeCollector({ apiKey: 'test', fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: { errors: [{ reason: 'quotaExceeded' }] } }) }) });
    await assert.rejects(c.request('search', {}), /配額/);
});

test('handle lookup, duplicate removal and publication cutoff', async () => {
    const calls = [];
    const old = item('old');
    old.snippet.publishedAt = '2020-01-01T00:00:00Z';
    const c = collector([
        { items: [{ id: 'resolved', snippet: { title: '頻道' } }] },
        { items: [{ id: { videoId: 'a' } }] },
        { items: [item('a'), item('a'), old] }
    ], calls);
    const result = await c.search({ query: '@channel', timeRange: '7', resultLimit: 5 });
    assert.equal(calls[0].searchParams.get('forHandle'), '@channel');
    assert.deepEqual(result.videos.map(v => v.id), ['a']);
});

test('quoted credential paths are normalized', () => {
    const previous = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    try {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = '"D:\\example\\credentials.json"';
        require('../lib/google-credentials').normalizeCredentialPath();
        assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'D:\\example\\credentials.json');
    } finally {
        if (previous === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        else process.env.GOOGLE_APPLICATION_CREDENTIALS = previous;
    }
});

test('analyzer sends actual video media and rejects invalid structured output', async () => {
    const skill = { id: 'test', name: 'Test', description: 'Test' };
    let input;
    const sections = Object.fromEntries(['setup', 'problem', 'solution', 'ending'].map(key => [key, { status: 'unknown', text: '未觀察到' }]));
    const client = { models: { generateContent: async args => { input = args; return { text: JSON.stringify({ sections }) }; } } };
    assert.equal((await analyzeVideo(client, 'abcdefghijk', skill)).source, 'gemini-video');
    assert.equal(input.contents[0].parts[0].fileData.fileUri, 'https://www.youtube.com/watch?v=abcdefghijk');
    client.models.generateContent = async () => ({ text: '{}' });
    await assert.rejects(analyzeVideo(client, 'abcdefghijk', skill), /格式/);
});
