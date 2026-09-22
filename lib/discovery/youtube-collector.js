const Collector = require('./collector');

const CHANNEL_PAGE_LIMIT = 50;
const HASHTAG_PAGE_LIMIT = 4;

function parseDuration(value = '') {
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
    return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0;
}

function normalizeTag(value = '') {
    return String(value).normalize('NFKC').trim().replace(/^#+/u, '').replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '').toLocaleLowerCase();
}

function collectTags(snippet = {}) {
    const visible = [...`${snippet.title || ''} ${snippet.description || ''}`.matchAll(/#([^\s#]+)/gu)].map(match => match[1]);
    const metadata = Array.isArray(snippet.tags) ? snippet.tags : [];
    return [...new Set([...visible, ...metadata].map(tag => String(tag).normalize('NFKC').trim().replace(/^#+/u, '')).filter(Boolean))];
}

function extractVideoId(value = '') {
    const input = String(value).trim();
    if (/^[\w-]{11}$/.test(input)) return input;
    try {
        const url = new URL(input);
        const host = url.hostname.replace(/^www\./, '').toLowerCase();
        if (host === 'youtu.be') return /^[\w-]{11}$/.test(url.pathname.slice(1).split('/')[0]) ? url.pathname.slice(1).split('/')[0] : null;
        if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
            const pathId = url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})(?:\/|$)/)?.[1];
            const queryId = url.searchParams.get('v');
            return pathId || (/^[\w-]{11}$/.test(queryId || '') ? queryId : null);
        }
    } catch { return null; }
    return null;
}

class YouTubeCollector extends Collector {
    constructor({ apiKey = process.env.YOUTUBE_API_KEY, fetchImpl = fetch } = {}) {
        super();
        this.apiKey = apiKey;
        this.fetch = fetchImpl;
    }

    async request(resource, params) {
        if (!this.apiKey) throw new Error('尚未設定 YOUTUBE_API_KEY，請先到設定頁填入 YouTube Data API 金鑰。');
        const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
        Object.entries({ ...params, key: this.apiKey }).forEach(([key, value]) => {
            if (value !== undefined) url.searchParams.set(key, value);
        });
        let response;
        try { response = await this.fetch(url, { signal: AbortSignal.timeout(20000) }); }
        catch { throw new Error('YouTube 連線逾時或失敗，請稍後重試。'); }
        const data = await response.json();
        if (!response.ok) {
            const reason = data.error?.errors?.[0]?.reason;
            throw new Error(reason === 'quotaExceeded'
                ? 'YouTube API 今日配額已用完，請稍後重試或更換 API 金鑰。'
                : `YouTube API 查詢失敗（HTTP ${response.status}），請確認 API 金鑰與權限。`);
        }
        return data;
    }

    async resolveChannel(query) {
        let candidate;
        if (query.startsWith('@') || /^UC[\w-]{22}$/.test(query)) {
            const data = await this.request('channels', {
                part: 'snippet,contentDetails',
                ...(query.startsWith('@') ? { forHandle: query } : { id: query })
            });
            candidate = data.items?.[0];
        } else {
            const search = await this.request('search', { part: 'snippet', type: 'channel', q: query, maxResults: 5 });
            const candidates = search.items || [];
            const wanted = query.normalize('NFKC').trim().toLocaleLowerCase();
            const selected = candidates.find(item => item.snippet?.title?.normalize('NFKC').trim().toLocaleLowerCase() === wanted) || candidates[0];
            if (selected) {
                const details = await this.request('channels', { part: 'snippet,contentDetails', id: selected.id.channelId });
                candidate = details.items?.[0];
            }
        }
        if (!candidate) throw new Error('找不到頻道，請改用完整的 @handle 或頻道 ID 以提高準確度。');
        const uploads = candidate.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) throw new Error('無法取得此頻道的官方上傳播放清單。');
        return { id: candidate.id, title: candidate.snippet.title, uploads };
    }

    buildVideo(item) {
        const s = item.snippet;
        const tags = collectTags(s);
        return {
            id: item.id, platform: 'youtube-shorts', source: 'youtube', title: s.title,
            creator: s.channelTitle, channelId: s.channelId, publishedAt: s.publishedAt,
            url: `https://www.youtube.com/watch?v=${item.id}`, durationSeconds: parseDuration(item.contentDetails?.duration),
            description: s.description, hashtags: tags, thumbnail: s.thumbnails?.medium?.url,
            embeddable: item.status?.embeddable !== false,
            stats: { views: item.statistics?.viewCount ?? null, likes: item.statistics?.likeCount ?? null,
                comments: item.statistics?.commentCount ?? null, shares: null }
        };
    }

    async search({ query, timeRange, resultLimit, maxDuration = 180 }) {
        const directVideoId = extractVideoId(query);
        const hashtag = query.startsWith('#');
        const channel = hashtag || directVideoId ? undefined : await this.resolveChannel(query);
        const publishedAfter = timeRange === 'all' ? undefined : new Date(Date.now() - Number(timeRange) * 86400000).toISOString();
        const cutoff = publishedAfter ? Date.parse(publishedAfter) : null;
        const wantedTag = hashtag ? normalizeTag(query) : null;
        const videos = new Map();
        const excluded = { duration: 0, date: 0, hashtag: 0, unavailable: 0 };
        let inspected = 0;
        let pageToken;
        let pagesScanned = 0;
        let reachedEnd = false;
        const pageLimit = hashtag ? HASHTAG_PAGE_LIMIT : CHANNEL_PAGE_LIMIT;

        if (directVideoId) {
            const details = await this.request('videos', { part: 'snippet,contentDetails,statistics,status', id: directVideoId });
            const item = details.items?.[0];
            inspected = 1;
            if (!item) excluded.unavailable = 1;
            else {
                const video = this.buildVideo(item);
                if (cutoff && Date.parse(video.publishedAt) < cutoff) excluded.date = 1;
                else if (!video.durationSeconds || video.durationSeconds > Number(maxDuration)) excluded.duration = 1;
                else videos.set(video.id, video);
            }
            return {
                videos: [...videos.values()], channel,
                diagnostics: {
                    strategy: 'exact-video', inspected, matched: videos.size, returned: videos.size, pagesScanned: 1,
                    excluded, truncated: false, maxDuration: Number(maxDuration),
                    limitation: videos.size ? '已使用影片 ID 直接向 YouTube 驗證，不受搜尋索引影響。' : '影片存在，但不符合目前的發布時間或長度條件，或無法由 YouTube API 公開讀取。'
                }
            };
        }

        for (let page = 0; page < pageLimit; page++) {
            const listing = hashtag
                // search.list treats q as a general search term rather than a hashtag route.
                // Remove the leading # for recall, then enforce an exact hashtag match on
                // title, description and snippet.tags below so precision is unchanged.
                ? await this.request('search', { part: 'snippet', type: 'video', videoDuration: 'short', order: 'relevance', q: query.slice(1), publishedAfter, maxResults: 50, pageToken })
                : await this.request('playlistItems', { part: 'contentDetails', playlistId: channel.uploads, maxResults: 50, pageToken });
            pagesScanned++;
            const ids = (listing.items || []).map(item => hashtag ? item.id?.videoId : item.contentDetails?.videoId).filter(Boolean);
            if (!ids.length) { reachedEnd = !listing.nextPageToken; break; }
            const details = await this.request('videos', { part: 'snippet,contentDetails,statistics,status', id: ids.join(',') });
            inspected += ids.length;
            const detailsById = new Map((details.items || []).map(item => [item.id, item]));
            excluded.unavailable += ids.length - detailsById.size;
            let pageEntirelyOlder = Boolean(cutoff);

            for (const id of ids) {
                const item = detailsById.get(id);
                if (!item) continue;
                const video = this.buildVideo(item);
                const published = Date.parse(video.publishedAt);
                if (!cutoff || published >= cutoff) pageEntirelyOlder = false;
                if (cutoff && published < cutoff) { excluded.date++; continue; }
                if (!video.durationSeconds || video.durationSeconds > Number(maxDuration)) { excluded.duration++; continue; }
                if (hashtag && !video.hashtags.some(tag => normalizeTag(tag) === wantedTag)) { excluded.hashtag++; continue; }
                videos.set(video.id, video);
            }

            pageToken = listing.nextPageToken;
            if (!pageToken || (!hashtag && pageEntirelyOlder)) { reachedEnd = true; break; }
        }

        const sorted = [...videos.values()].sort((a, b) => Number(b.stats.views || 0) - Number(a.stats.views || 0));
        return {
            videos: sorted.slice(0, resultLimit), channel,
            diagnostics: {
                strategy: hashtag ? 'verified-hashtag-search' : 'uploads-playlist',
                inspected, matched: videos.size, returned: Math.min(resultLimit, videos.size), pagesScanned,
                excluded, truncated: Boolean(pageToken && !reachedEnd), maxDuration: Number(maxDuration),
                limitation: 'YouTube Data API 不提供影片長寬比或 Shorts 識別欄位；結果只能以影片長度與可驗證的頻道／標籤資料篩選。'
            }
        };
    }
}

module.exports = YouTubeCollector;
module.exports.parseDuration = parseDuration;
module.exports.normalizeTag = normalizeTag;
module.exports.extractVideoId = extractVideoId;
