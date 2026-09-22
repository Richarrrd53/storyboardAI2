const { test } = require('node:test');
const assert = require('node:assert/strict');
const YouTubeCollector = require('../lib/discovery/youtube-collector');
const { analyzeVideo } = require('../lib/discovery/video-analyzer');
const { buildTemplateFromDiscovery, categorizeDiscoveryVideo } = require('../lib/discovery/template-builder');

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
        { items: [{ id: { videoId: 'a' } }, { id: { videoId: 'long' } }, { id: { videoId: 'wrong' } }], nextPageToken: 'next' },
        { items: [item('a'), item('long', 'PT4M'), item('wrong', 'PT20S', '#料理教學')] },
        { items: [{ id: { videoId: 'b' } }] },
        { items: [item('b', 'PT3M', '#料理', '100')] }
    ], calls);
    const result = await c.search({ query: '#料理', timeRange: '7', resultLimit: 2 });
    assert.deepEqual(result.videos.map(v => v.id), ['b', 'a']);
    assert.ok(calls[0].searchParams.has('publishedAfter'));
    assert.equal(calls[0].searchParams.get('q'), '料理');
    assert.equal(calls[2].searchParams.get('pageToken'), 'next');
    assert.equal(result.videos[0].stats.likes, null);
});

test('channel names resolve into channelId instead of keyword video search', async () => {
    const calls = [];
    const c = collector([
        { items: [{ id: { channelId: 'resolved' }, snippet: { title: '正確頻道' } }] },
        { items: [{ id: 'resolved', snippet: { title: '正確頻道' }, contentDetails: { relatedPlaylists: { uploads: 'uploads-list' } } }] },
        { items: [] }
    ], calls);
    const result = await c.search({ query: '頻道名稱', timeRange: 'all', resultLimit: 5 });
    assert.equal(result.channel.id, 'resolved');
    assert.equal(calls[2].pathname.endsWith('/playlistItems'), true);
    assert.equal(calls[2].searchParams.get('playlistId'), 'uploads-list');
    assert.equal(result.diagnostics.strategy, 'uploads-playlist');
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
        { items: [{ id: 'resolved', snippet: { title: '頻道' }, contentDetails: { relatedPlaylists: { uploads: 'uploads-list' } } }] },
        { items: [{ contentDetails: { videoId: 'a' } }, { contentDetails: { videoId: 'a' } }, { contentDetails: { videoId: 'old' } }] },
        { items: [item('a'), item('a'), old] }
    ], calls);
    const result = await c.search({ query: '@channel', timeRange: '7', resultLimit: 5 });
    assert.equal(calls[0].searchParams.get('forHandle'), '@channel');
    assert.deepEqual(result.videos.map(v => v.id), ['a']);
});

test('hashtag evidence includes exact metadata tags and reports exclusions', async () => {
    const tagged = item('tagged', 'PT45S', '沒有可見標籤');
    tagged.snippet.tags = ['料理'];
    const related = item('related', 'PT45S', '#料理教學');
    const c = collector([
        { items: [{ id: { videoId: 'tagged' } }, { id: { videoId: 'related' } }] },
        { items: [tagged, related] }
    ]);
    const result = await c.search({ query: '#料理', timeRange: 'all', resultLimit: 5, maxDuration: 60 });
    assert.deepEqual(result.videos.map(video => video.id), ['tagged']);
    assert.equal(result.diagnostics.excluded.hashtag, 1);
    assert.equal(result.diagnostics.inspected, 2);
});

test('direct Shorts URL bypasses search index and fetches the exact video', async () => {
    const calls = [];
    const c = collector([{ items: [item('abcdefghijk', 'PT55S', '指定影片')] }], calls);
    const result = await c.search({ query: 'https://www.youtube.com/shorts/abcdefghijk?feature=share', timeRange: 'all', resultLimit: 5, maxDuration: 60 });
    assert.deepEqual(result.videos.map(video => video.id), ['abcdefghijk']);
    assert.equal(result.diagnostics.strategy, 'exact-video');
    assert.equal(calls[0].pathname.endsWith('/videos'), true);
    assert.equal(calls[0].searchParams.get('id'), 'abcdefghijk');
});

test('亡妻回憶錄 regression: searches without hash and keeps the exact hashtag match', async () => {
    const calls = [];
    const video = item('eIbf-HnSchU', 'PT45S', '@i_jou96  #一樓 #盜夢空間 #亡妻回憶錄', '100');
    const c = collector([
        { items: [{ id: { videoId: 'eIbf-HnSchU' } }] },
        { items: [video] }
    ], calls);
    const result = await c.search({ query: '#亡妻回憶錄', timeRange: 'all', resultLimit: 5, maxDuration: 180 });
    assert.equal(calls[0].searchParams.get('q'), '亡妻回憶錄');
    assert.deepEqual(result.videos.map(item => item.id), ['eIbf-HnSchU']);
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

test('analysis and hashtags are converted into an auto-categorized template', () => {
    const video = {
        id: 'abcdefghijk', title: '新品開箱與價格實測', description: '完整商品評測', creator: '測試頻道',
        durationSeconds: 40, hashtags: ['開箱', '好物'], thumbnail: 'https://example.com/thumb.jpg',
        url: 'https://www.youtube.com/watch?v=abcdefghijk', stats: { views: '1200' }
    };
    const analysis = { analyzer: 'test', sections: {
        setup: { status: 'observed', timestamp: '00:00', text: '展示產品並提出價格問題' },
        problem: { status: 'observed', timestamp: '00:05', text: '比較使用前的問題' },
        solution: { status: 'observed', timestamp: '00:18', text: '實測產品功能' },
        ending: { status: 'observed', timestamp: '00:34', text: '總結推薦對象' }
    } };
    assert.equal(categorizeDiscoveryVideo(video, analysis), 'product');
    const template = buildTemplateFromDiscovery(video, analysis);
    assert.equal(template.category, 'product');
    assert.equal(template.categoryLabel, '商品廣告');
    assert.equal(template.structure.length, 4);
    assert.equal(template.structure[0].duration, '5s');
    assert.equal(template.source.videoId, video.id);
    assert.ok(template.tags.includes('開箱'));
});
