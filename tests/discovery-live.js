// Explicit opt-in: node tests/discovery-live.js calls YouTube and Gemini once.
require('dotenv').config({ quiet: true });
require('../lib/google-credentials').normalizeCredentialPath();
const { GoogleGenAI } = require('@google/genai');
const YouTubeCollector = require('../lib/discovery/youtube-collector');
const { analyzeVideo } = require('../lib/discovery/video-analyzer');
const { getSkill } = require('../lib/discovery/skill-registry');

(async () => {
    const { videos, channel } = await new YouTubeCollector().search({ query: '@YouTube', timeRange: 'all', resultLimit: 1 });
    console.log(JSON.stringify({ stage: 'search', count: videos.length, channel, videoId: videos[0]?.id }));
    if (!videos.length) throw new Error('No videos found');
    const client = new GoogleGenAI({ vertexai: true, project: process.env.GOOGLE_CLOUD_PROJECT_ID, location: 'global' });
    const analysis = await analyzeVideo(client, videos[0].id, getSkill('short-video-template-lab'));
    console.log(JSON.stringify({ stage: 'analysis', analysis }));
})().catch(error => {
    // Do not print upstream request objects or URLs containing credentials.
    console.error(JSON.stringify({ failed: true, type: error.name, status: error.status || error.code, message: String(error.message).replace(/AIza[\w-]+/g, '[redacted]').slice(0, 1500) }));
    process.exitCode = 1;
});
