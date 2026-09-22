const SECTION_TYPES = ['setup', 'problem', 'solution', 'ending'];
const EXCLUDED_PROBLEM_TYPES = new Set(['summary', 'development', 'continuation']);

function unknown(reason) {
    return { status: 'unknown', text: reason };
}

function analyze(video) {
    const segments = Array.isArray(video.segments) ? video.segments : [];
    const analysis = {};

    for (const section of SECTION_TYPES) {
        const segment = segments.find(item => item.type === section);
        if (segment?.text) {
            analysis[section] = { status: 'observed', text: segment.text, source: 'provided segment' };
        } else {
            analysis[section] = unknown('未在可取得的影片資訊中確認');
        }
    }

    const problemCandidates = segments.filter(item => item.type === 'problem');
    const validProblem = problemCandidates.find(item => {
        const normalized = String(item.subtype || '').toLowerCase();
        return !EXCLUDED_PROBLEM_TYPES.has(normalized) && item.text;
    });
    analysis.problem = validProblem
        ? { status: 'observed', text: validProblem.text, source: 'provided segment' }
        : unknown('未找到符合條件的 Problem：已排除中段小結、尚有主要內容未完成、單純繼續事件與沒有明顯程度提升的 Development');

    return {
        analyzer: 'short-video-template-lab',
        evidencePolicy: '僅整理 collector 提供的欄位；未確認欄位標記 unknown。此分析不宣稱影片爆紅原因。',
        sections: analysis,
        knownMetadata: {
            title: video.title || 'unknown',
            durationSeconds: video.durationSeconds ?? 'unknown',
            publishedAt: video.publishedAt || 'unknown',
            hashtags: video.hashtags?.length ? video.hashtags : 'unknown'
        },
        metrics: video.stats || { views: 'unknown', likes: 'unknown', comments: 'unknown', shares: 'unknown' }
    };
}

module.exports = { analyze };
