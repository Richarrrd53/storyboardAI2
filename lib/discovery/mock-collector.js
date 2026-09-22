const Collector = require('./collector');
const MOCK_NOW = Date.now();
const daysAgo = days => new Date(MOCK_NOW - days * 24 * 60 * 60 * 1000).toISOString();

const MOCK_VIDEOS = [
    {
        id: 'mock-food-001',
        platform: 'youtube-shorts',
        title: '用一個晚上整理租屋處：從混亂到能住',
        creator: 'mock_creator_home',
        url: 'https://example.com/mock-food-001',
        publishedAt: daysAgo(3),
        durationSeconds: 42,
        description: '開場展示桌面雜物，接著依序整理書桌、收納線材，最後展示完成後的桌面。',
        hashtags: ['整理', '租屋', '居家'],
        segments: [
            { type: 'setup', text: '展示整理前的桌面與待處理的雜物。' },
            { type: 'development', text: '依序整理書桌並收納線材。' },
            { type: 'ending', text: '展示整理完成後的桌面。' }
        ],
        stats: { views: 'unknown', likes: 'unknown', comments: 'unknown', shares: 'unknown' }
    },
    {
        id: 'mock-cooking-002',
        platform: 'tiktok',
        title: '三分鐘做出下班後的番茄蛋麵',
        creator: 'mock_creator_food',
        url: 'https://example.com/mock-cooking-002',
        publishedAt: daysAgo(12),
        durationSeconds: 35,
        description: '以成品畫面開場，示範備料、下鍋與起鍋，最後補充調味方式。',
        hashtags: ['料理', '下班吃什麼', '番茄蛋麵'],
        segments: [
            { type: 'setup', text: '先展示完成的番茄蛋麵。' },
            { type: 'solution', text: '示範備料、下鍋與起鍋步驟。' },
            { type: 'ending', text: '補充調味方式並展示成品。' }
        ],
        stats: { views: 'unknown', likes: 'unknown', comments: 'unknown', shares: 'unknown' }
    },
    {
        id: 'mock-work-003',
        platform: 'instagram-reels',
        title: '第一次接案前，我會先確認的四件事',
        creator: 'mock_creator_work',
        url: 'https://example.com/mock-work-003',
        publishedAt: daysAgo(38),
        durationSeconds: 51,
        description: '以接案情境切入，列出需求、時程、修改次數與付款方式四項確認事項。',
        hashtags: ['接案', '工作方法', '自由工作者'],
        segments: [
            { type: 'setup', text: '提出第一次接案前需要確認哪些事情。' },
            { type: 'problem', text: '列出需求、時程、修改次數與付款方式容易被忽略。' },
            { type: 'solution', text: '逐項說明四項確認事項。' },
            { type: 'ending', text: '回顧四項確認事項。' }
        ],
        stats: { views: 'unknown', likes: 'unknown', comments: 'unknown', shares: 'unknown' }
    },
    {
        id: 'mock-story-004',
        platform: 'youtube-shorts',
        title: '把週末散步拍成一支 30 秒小短片',
        creator: 'mock_creator_story',
        url: 'https://example.com/mock-story-004',
        publishedAt: daysAgo(82),
        durationSeconds: 30,
        description: '記錄出門、街角、咖啡店與回家四個片段，沒有提供觀看或互動數據。',
        hashtags: ['vlog', '散步', '生活'],
        segments: [
            { type: 'setup', text: '從穿鞋出門的畫面開始。' },
            { type: 'development', text: '持續記錄街角與咖啡店畫面。' },
            { type: 'ending', text: '以回家畫面結束。' }
        ],
        stats: { views: 'unknown', likes: 'unknown', comments: 'unknown', shares: 'unknown' }
    }
];

class MockCollector extends Collector {
    async search({ query = '', platform = 'all', timeRange = '30d', resultLimit = 10 } = {}) {
        const normalizedQuery = String(query).trim().toLowerCase().replace(/^#/, '');
        const now = Date.now();
        const rangeDays = timeRange === 'all' ? Infinity : Number.parseInt(timeRange, 10) || 30;
        const rangeStart = now - rangeDays * 24 * 60 * 60 * 1000;

        return MOCK_VIDEOS
            .filter(video => platform === 'all' || video.platform === platform)
            .filter(video => new Date(video.publishedAt).getTime() >= rangeStart || timeRange === 'all')
            .filter(video => {
                if (!normalizedQuery) return true;
                const searchable = [video.title, video.description, ...video.hashtags].join(' ').toLowerCase();
                return searchable.includes(normalizedQuery);
            })
            .slice(0, resultLimit)
            .map(video => ({ ...video, source: 'mock' }));
    }
}

module.exports = MockCollector;
