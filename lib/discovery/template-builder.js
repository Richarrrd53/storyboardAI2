const CATEGORY_RULES = [
    { id: 'product', keywords: ['開箱', '評測', '商品', '產品', '品牌', '推薦', '好物', '美食', '料理', '餐廳', '價格', '必買'] },
    { id: 'twist', keywords: ['反轉', '挑戰', '整人', '搞笑', '衝突', '震驚', '竟然', '沒想到', '翻車', '對決'] },
    { id: 'story', keywords: ['故事', '日常', 'vlog', '旅遊', '紀錄', '人物', '訪談', '生活', '體驗', '幕後'] }
];

const CATEGORY_LABELS = { product: '商品廣告', story: '敘事紀實', twist: '高留存節奏', custom: '團隊資產' };

function normalizeText(value) {
    return String(value || '').toLowerCase();
}

function analysisText(analysis) {
    return Object.values(analysis?.sections || {}).map(section => `${section?.text || ''} ${section?.timestamp || ''}`).join(' ');
}

function categorizeDiscoveryVideo(video, analysis) {
    const haystack = normalizeText([video?.title, video?.description, ...(video?.hashtags || []), analysisText(analysis)].join(' '));
    const scores = CATEGORY_RULES.map(rule => ({
        id: rule.id,
        score: rule.keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0)
    })).sort((a, b) => b.score - a.score);
    return scores[0].score > 0 ? scores[0].id : 'story';
}

function parseTimestamp(value) {
    const match = String(value || '').match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function compactTags(video, category) {
    const tags = [...(video.hashtags || [])].map(tag => String(tag).replace(/^#/, '').trim()).filter(Boolean);
    const defaults = { product: ['產品亮點', '轉換導向'], twist: ['反轉', '高留存'], story: ['故事敘事', '生活共鳴'] };
    return [...new Set([...tags, ...(defaults[category] || [])])].slice(0, 8);
}

function buildStructure(video, analysis) {
    const keys = ['setup', 'problem', 'solution', 'ending'];
    const purpose = { setup: 'hook', problem: 'conflict', solution: 'payoff', ending: 'call_to_action' };
    const observed = keys.map(key => ({ key, ...analysis.sections?.[key] })).filter(section => section.text);
    const total = Math.max(1, Number(video.durationSeconds) || 30);
    return observed.map((section, index) => {
        const start = parseTimestamp(section.timestamp);
        const nextStart = parseTimestamp(observed[index + 1]?.timestamp);
        const duration = start !== null && nextStart !== null ? Math.max(1, nextStart - start)
            : index === observed.length - 1 && start !== null ? Math.max(1, total - start)
            : Math.max(1, Math.round(total / Math.max(observed.length, 1)));
        return {
            shot: index + 1,
            duration: `${duration}s`,
            camera: 'static',
            angle: 'eye-level',
            action: section.text.trim(),
            emotion: section.key === 'problem' ? 'curiosity' : section.key === 'solution' ? 'satisfied' : section.key === 'ending' ? 'friendly' : 'anticipation',
            purpose: purpose[section.key]
        };
    });
}

function buildTemplateFromDiscovery(video, analysis) {
    const category = categorizeDiscoveryVideo(video, analysis);
    const sections = analysis.sections || {};
    const structure = buildStructure(video, analysis);
    const tags = compactTags(video, category);
    const summary = ['setup', 'problem', 'solution', 'ending'].map(key => sections[key]?.text).filter(Boolean).join(' → ');
    const hasProductIntent = category === 'product';

    return {
        id: video.id,
        name: video.title,
        category,
        categoryLabel: CATEGORY_LABELS[category],
        tags,
        description: video.description?.trim() || summary.slice(0, 220),
        thumbnail: video.thumbnail || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
        videoUrl: video.url || `https://www.youtube.com/watch?v=${video.id}`,
        narrative: {
            type: category === 'story' ? 'story' : 'montage',
            structure: '開場 → 問題／衝突 → 解法／發展 → 結尾',
            tone: category === 'twist' ? 'humor' : 'casual',
            summary
        },
        hook: { type: category === 'twist' ? 'conflict' : 'curiosity', position: 'start', description: sections.setup?.text || video.title },
        marketing: {
            isImplicit: hasProductIntent,
            exposureType: hasProductIntent ? 'product' : 'none',
            brandRole: hasProductIntent ? 'active' : 'none',
            integrationMethod: hasProductIntent ? 'plot' : 'none',
            revealTiming: hasProductIntent ? 'middle' : 'none',
            persuasionStyle: hasProductIntent ? 'subtle' : 'none',
            targetEmotion: category === 'twist' ? ['curiosity', 'relatability'] : ['trust', 'curiosity']
        },
        structure,
        visualFlow: { pace: Number(video.durationSeconds) <= 45 ? 'fast' : 'medium', rhythmPattern: '依分析段落與原片時間戳切分', transitionStyle: 'cut' },
        promptTemplate: { base: '依照來源影片的敘事與鏡頭節奏重新生成直式短影音。', perShot: structure.map(shot => shot.action) },
        variables: ['character', 'scene', 'emotion', 'style', 'product'],
        controls: { pace: ['fast', 'medium', 'slow'], cameraIntensity: ['low', 'medium', 'high'], emotionIntensity: ['low', 'medium', 'high'] },
        useCase: `${CATEGORY_LABELS[category]}短影音`,
        platform: ['shorts'],
        shotsCount: structure.length,
        source: { videoId: video.id, title: video.title, channel: video.creator, views: Number(video.stats?.views || 0), url: video.url },
        analysis: {
            whyItWorks: `依影片實際內容辨識出「${CATEGORY_LABELS[category]}」結構；請搭配原片與時間戳審核。`,
            targetAudience: tags.length ? `對 ${tags.slice(0, 3).join('、')} 感興趣的短影音觀眾` : '短影音觀眾',
            replicableElements: Object.values(sections).filter(section => section?.status === 'observed').map(section => section.text).slice(0, 4),
            discoverySections: sections
        },
        confidence: structure.length / 4,
        version: '2.0',
        discovery: { analyzer: analysis.analyzer, importedAt: new Date().toISOString(), autoCategorized: true }
    };
}

module.exports = { buildTemplateFromDiscovery, categorizeDiscoveryVideo, CATEGORY_LABELS };
