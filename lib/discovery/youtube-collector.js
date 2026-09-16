const Collector = require('./collector');

class YouTubeCollector extends Collector {
    constructor({ apiKey = process.env.YOUTUBE_API_KEY, fetchImpl = fetch } = {}) {
        super();
        this.apiKey = apiKey;
        this.fetch = fetchImpl;
    }

    async request(resource, params) {
        if (!this.apiKey) throw new Error('尚未設定 YOUTUBE_API_KEY，請在伺服器設定 YouTube Data API 金鑰。');
        const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
        Object.entries({ ...params, key: this.apiKey }).forEach(([key, value]) => {
            if (value !== undefined) url.searchParams.set(key, value);
        });
        let response;
        try { response = await this.fetch(url, { signal: AbortSignal.timeout(20000) }); }
        catch { throw new Error('YouTube 連線逾時或無法連線，請稍後重試。'); }
        const data = await response.json();
        if (!response.ok) {
            const reason = data.error?.errors?.[0]?.reason;
            throw new Error(reason === 'quotaExceeded'
                ? 'YouTube 今日搜尋配額已用完，請稍後再試或調整 API 配額。'
                : `YouTube API 無法取得影片（HTTP ${response.status}），請檢查金鑰、API 啟用狀態與限制。`);
        }
        return data;
    }

    async search({ query, timeRange, resultLimit }) {
        const hashtag = query.startsWith('#');
        let channel;
        if (!hashtag) {
            const data = query.startsWith('@') || /^UC[\w-]{22}$/.test(query)
                ? await this.request('channels', { part: 'snippet', ...(query.startsWith('@') ? { forHandle: query } : { id: query }) })
                : await this.request('search', { part: 'snippet', type: 'channel', q: query, maxResults: 1 });
            const item = data.items?.[0];
            if (!item) throw new Error('找不到此頻道，請使用 @帳號或頻道 ID 再試一次。');
            channel = { id: typeof item.id === 'string' ? item.id : item.id.channelId, title: item.snippet.title };
        }
        const videos = new Map();
        let pageToken;
        const publishedAfter = timeRange === 'all' ? undefined : new Date(Date.now() - Number(timeRange) * 86400000).toISOString();
        for (let page = 0; page < 4; page++) {
            const data = await this.request('search', {
                part: 'snippet', type: 'video', videoDuration: 'short', order: 'viewCount',
                q: hashtag ? query : undefined, channelId: channel?.id, publishedAfter,
                maxResults: 50, pageToken
            });
            const ids = (data.items || []).map(item => item.id.videoId).filter(Boolean);
            if (!ids.length) break;
            const details = await this.request('videos', { part: 'snippet,contentDetails,statistics', id: ids.join(',') });
            for (const item of details.items || []) {
                const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(item.contentDetails.duration);
                const duration = match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
                if (!duration || duration > 180) continue;
                const s = item.snippet;
                if (publishedAfter && Date.parse(s.publishedAt) < Date.parse(publishedAfter)) continue;
                const tags = [...`${s.title} ${s.description}`.matchAll(/#([^\s#]+)/gu)].map(m => m[1]);
                if (hashtag && !tags.some(tag => tag.toLowerCase() === query.slice(1).toLowerCase())) continue;
                videos.set(item.id, {
                    id: item.id, platform: 'youtube-shorts', source: 'youtube', title: s.title,
                    creator: s.channelTitle, channelId: s.channelId, publishedAt: s.publishedAt,
                    url: `https://www.youtube.com/watch?v=${item.id}`, durationSeconds: duration,
                    description: s.description, hashtags: [...new Set(tags)],
                    thumbnail: s.thumbnails?.medium?.url,
                    stats: { views: item.statistics?.viewCount ?? null, likes: item.statistics?.likeCount ?? null,
                        comments: item.statistics?.commentCount ?? null, shares: null }
                });
            }
            pageToken = data.nextPageToken;
            if (videos.size >= resultLimit || !pageToken) break;
        }
        return { videos: [...videos.values()].sort((a, b) => Number(b.stats.views) - Number(a.stats.views)).slice(0, resultLimit), channel };
    }
}

module.exports = YouTubeCollector;
