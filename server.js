const express = require('express');
const path = require('path');
const fs = require("fs");
require('dotenv').config();
require('./lib/google-credentials').normalizeCredentialPath();

const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const YouTubeCollector = require('./lib/discovery/youtube-collector');
const { analyzeVideo } = require('./lib/discovery/video-analyzer');
const { getSkill, listSkills } = require('./lib/discovery/skill-registry');
const { ApiSettings } = require('./lib/discovery/api-settings');
const { buildTemplateFromDiscovery } = require('./lib/discovery/template-builder');
const { toCatalogTemplate } = require('./lib/template-catalog');
const { generationProjectId } = require('./lib/generation-project-id');

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 10000, // Close idle connections after 10 seconds to avoid using dead serverless connections
    connectionTimeoutMillis: 10000,
    keepAlive: true
});

pool.on('error', (err) => {
    console.error('⚠️ Unexpected pg connection pool error:', err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JWT_SECRET = process.env.JWT_SECRET || 'storyboard-secret-key-123';

const { GoogleGenAI } = require('@google/genai');
const { getModel, getModelConfig } = require('./lib/ai/model-config');
const { parseResponse, generateImage, emptyContent, validatePrompt, reportAIError } = require('./lib/ai/generation');
const { vertexAuthOptions } = require('./lib/google-credentials');
const { createCopilotHandler } = require('./lib/ai/copilot');

const app = express();

// Vercel Serverless URL 相容中介層
app.use((req, res, next) => {
    // 1. 若 Vercel 將請求重寫至 /api/index.js，從 header 還原原始要求路徑
    const matchedPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
    if (matchedPath && !matchedPath.includes('index.js')) {
        const queryIndex = req.url.indexOf('?');
        const query = (queryIndex !== -1 && !matchedPath.includes('?')) ? req.url.slice(queryIndex) : '';
        req.url = matchedPath + query;
    } else if (req.url.startsWith('/api/index.js') || req.url === '/api' || req.url.startsWith('/index.js')) {
        const original = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'] || req.originalUrl;
        if (original && !original.includes('index.js')) {
            const queryIndex = req.url.indexOf('?');
            const query = (queryIndex !== -1 && !original.includes('?')) ? req.url.slice(queryIndex) : '';
            req.url = original + query;
        }
    }
    // 2. 若由 Vercel 或其他 proxy 轉發時遺失 /api 前綴，自動補充
    if (!req.url.startsWith('/api') && req.url !== '/' && !req.url.startsWith('/public') && !req.url.startsWith('/css') && !req.url.startsWith('/js') && !req.url.startsWith('/images') && !req.url.startsWith('/html') && !req.url.startsWith('/video') && !req.url.startsWith('/icon')) {
        const isDiscoveryApi = req.url.startsWith('/discovery/search') || req.url.startsWith('/discovery/analyze') || req.url.startsWith('/discovery/skills') || req.url.startsWith('/discovery/add-template');
        if (req.url.startsWith('/auth') || req.url.startsWith('/projects') || req.url.startsWith('/creation/copilot') || req.url.startsWith('/ask-gemini') || req.url.startsWith('/get-templates') || req.url.startsWith('/templates') || isDiscoveryApi) {
            req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
        }
    }
    next();
});

const googleCLoudProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const location = "global";

let genAIInstance = null;
function getGenAI() {
    if (!genAIInstance) {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || googleCLoudProjectId;
        if (!projectId) {
            throw new Error("找不到 GOOGLE_CLOUD_PROJECT_ID 環境變數。請在 Vercel 或 .env 中設定。");
        }
        genAIInstance = new GoogleGenAI({
            vertexai: true,
            project: projectId,
            location: location,
            ...vertexAuthOptions(),
        });
    }
    return genAIInstance;
}

app.get('/', (req, res) => {
    const filePath = path.join(process.cwd(), 'public', 'main.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error("發送檔案失敗:", err);
            res.status(500).send("無法讀取主頁面，請檢查路徑設定。");
        }
    });
});

const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));
// Copilot has a smaller parser before the legacy image payload parser.
app.use('/api/creation/copilot', express.json({ limit: '64kb' }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true })); // 增加 URL 編碼限制

const discoverySettings = new ApiSettings();
// Existing text generation permits guests; authenticated callers use their verified identity.
app.post('/api/creation/copilot', (req, res, next) => {
    const authorization = req.get('authorization');
    if (authorization) {
        try { req.copilotIdentity = 'user:' + jwt.verify(authorization.replace(/^Bearer /, ''), JWT_SECRET).id; }
        catch { return res.status(401).json({ error: '登入已失效，請重新登入。' }); }
    }
    next();
}, createCopilotHandler(getGenAI));
const DISCOVERY_PLATFORMS = new Set(['youtube-shorts']);
const DISCOVERY_TIME_RANGES = new Set(['7', '30', '90', 'all']);
const DISCOVERY_MAX_DURATIONS = new Set(['60', '180']);

app.use('/api/discovery', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

app.get('/api/discovery/settings', (req, res) => {
    res.json(discoverySettings.status(discoverySettings.read(req)));
});

app.post('/api/discovery/settings', async (req, res) => {
    // Settings affect only this browser. Reject cross-site writes and non-JSON forms.
    let sameOrigin = true;
    if (req.headers.origin) {
        try { sameOrigin = new URL(req.headers.origin).host === req.get('host'); }
        catch { sameOrigin = false; }
    }
    if (!sameOrigin || req.get('sec-fetch-site') === 'cross-site' || !req.is('application/json')) {
        return res.status(403).json({ error: '請從本站 API 設定頁儲存設定。' });
    }
    let next;
    try { next = discoverySettings.merge(discoverySettings.read(req), req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }
    try {
        if (req.body.youtubeApiKey?.trim()) {
            await new YouTubeCollector({ apiKey: next.youtubeApiKey }).request('videos', { part: 'id', id: 'wToeNUwRb_k' });
        }
        if (req.body.geminiApiKey?.trim()) {
            try {
                await new GoogleGenAI({ vertexai: false, apiKey: next.geminiApiKey }).models.get({
                    model: getModel('discovery'), config: { httpOptions: { timeout: 20000 } }
                });
            } catch (error) {
                const failure = reportAIError(error, { task: 'discovery-settings', provider: 'gemini-developer-api', model: getModel('discovery') });
                throw new Error('Gemini Developer API 連線檢查失敗：' + failure.message);
            }
        }
        next.savedAt = new Date().toISOString();
        discoverySettings.write(res, next, req.secure || req.get('x-forwarded-proto') === 'https');
        res.json(discoverySettings.status(next));
    } catch (error) {
        res.status(502).json({ error: error.message.startsWith('YouTube') || error.message.startsWith('Gemini') || error.message.includes('DISCOVERY_SETTINGS_SECRET')
            ? error.message : '無法儲存 API 設定，請檢查伺服器設定目錄權限並重試。' });
    }
});

app.get('/api/discovery/skills', (req, res) => {
    res.json({ skills: listSkills(), configured: discoverySettings.status(discoverySettings.read(req)).configured,
        platforms: [{ id: 'youtube-shorts', name: 'YouTube Shorts', available: true },
            { id: 'tiktok', name: 'TikTok（尚未串接）', available: false },
            { id: 'instagram-reels', name: 'Instagram Reels（尚未串接）', available: false }] });
});

app.post('/api/discovery/search', async (req, res) => {
    try {
        const {
            query = '',
            platform = 'youtube-shorts',
            skill = 'short-video-template-lab',
            timeRange = '30',
            maxDuration = '180',
            resultLimit = 10
        } = req.body || {};
        const normalizedQuery = String(query).trim();
        const normalizedLimit = Number(resultLimit);

        if (typeof query !== 'string' || !normalizedQuery || normalizedQuery === '#' || normalizedQuery.length > 500 || (normalizedQuery.startsWith('#') && /\s/.test(normalizedQuery))) {
            return res.status(400).json({ error: '請輸入影片網址、影片 ID、頻道名稱、@帳號或單一 #hashtag。' });
        }
        if (!DISCOVERY_PLATFORMS.has(platform)) {
            return res.status(400).json({ error: '不支援的 platform' });
        }
        if (!DISCOVERY_TIME_RANGES.has(String(timeRange))) {
            return res.status(400).json({ error: '不支援的 timeRange' });
        }
        if (!DISCOVERY_MAX_DURATIONS.has(String(maxDuration))) {
            return res.status(400).json({ error: 'maxDuration 必須是 60 或 180 秒' });
        }
        if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 20) {
            return res.status(400).json({ error: 'resultLimit 必須是 1 到 20 的整數' });
        }

        const selectedSkill = getSkill(skill);
        if (!selectedSkill) {
            return res.status(400).json({ error: '找不到指定的 skill' });
        }

        const keys = discoverySettings.effective(discoverySettings.read(req));
        const { videos, channel, diagnostics } = await new YouTubeCollector({ apiKey: keys.youtubeApiKey }).search({
            query: normalizedQuery,
            platform,
            timeRange: String(timeRange),
            maxDuration: Number(maxDuration),
            resultLimit: normalizedLimit
        });
        const results = videos;

        res.json({
            query: { query: normalizedQuery, platform, skill, timeRange: String(timeRange), maxDuration: Number(maxDuration), resultLimit: normalizedLimit },
            results,
            meta: { collector: 'YouTube Data API', channel, diagnostics, returnedAt: new Date().toISOString(),
                warning: diagnostics?.limitation || 'YouTube API 無法直接確認影片是否為直式 Shorts。' }
        });
    } catch (error) {
        res.status(502).json({ error: error.message || '搜尋失敗，請稍後再試。' });
    }
});

app.post('/api/discovery/analyze', async (req, res) => {
    const { videoId, skill: skillId } = req.body || {};
    const skill = getSkill(skillId);
    if (typeof videoId !== 'string' || !/^[\w-]{11}$/.test(videoId) || !skill) {
        return res.status(400).json({ error: '影片 ID 或 SKILL 無效。' });
    }
    try {
        const keys = discoverySettings.effective(discoverySettings.read(req));
        const client = keys.geminiApiKey ? new GoogleGenAI({ vertexai: false, apiKey: keys.geminiApiKey }) : getGenAI();
        if (keys.geminiApiKey) await client.models.get({ model: getModel('discovery'), config: { httpOptions: { timeout: 20000 } } });
        res.json({ analysis: await analyzeVideo(client, videoId, skill),
            provider: keys.geminiApiKey ? 'gemini-developer-api' : 'vertex-ai', model: getModel('discovery') });
    } catch (error) {
        const failure = reportAIError(error, { task: 'discovery', model: getModel('discovery') });
        res.status(failure.status).json({ error: failure.message, code: failure.code });
    }
});

app.post('/api/discovery/add-template', async (req, res) => {
    let sameOrigin = true;
    if (req.headers.origin) {
        try { sameOrigin = new URL(req.headers.origin).host === req.get('host'); }
        catch { sameOrigin = false; }
    }
    if (!sameOrigin || req.get('sec-fetch-site') === 'cross-site' || !req.is('application/json')) {
        return res.status(403).json({ error: '請從本站的熱門短影音分析頁加入模板。' });
    }
    const { video, analysis } = req.body || {};
    if (!video || typeof video.id !== 'string' || !/^[\w-]{11}$/.test(video.id) || typeof video.title !== 'string' || !video.title.trim()) {
        return res.status(400).json({ error: '影片資料不完整，無法建立模板。' });
    }
    if (!analysis?.sections || !['setup', 'problem', 'solution', 'ending'].every(key => typeof analysis.sections[key]?.text === 'string')) {
        return res.status(400).json({ error: '請先完成影片分析，再加入模板庫。' });
    }
    try {
        const template = buildTemplateFromDiscovery({
            id: video.id,
            title: video.title.slice(0, 200),
            description: String(video.description || '').slice(0, 5000),
            creator: String(video.creator || '').slice(0, 200),
            durationSeconds: Math.min(180, Math.max(1, Number(video.durationSeconds) || 30)),
            url: String(video.url || ''),
            thumbnail: String(video.thumbnail || ''),
            hashtags: Array.isArray(video.hashtags) ? video.hashtags.slice(0, 30).map(tag => String(tag).slice(0, 80)) : [],
            stats: { views: Number(video.stats?.views || 0) }
        }, analysis);
        await prisma.template.upsert({
            where: { id: template.id },
            update: { name: template.name, category: template.category, tags: template.tags, description: template.description, content: template, is_custom: true },
            create: { id: template.id, name: template.name, category: template.category, tags: template.tags, description: template.description, content: template, is_custom: true }
        });
        res.json({ success: true, template: { id: template.id, name: template.name, category: template.category, categoryLabel: template.categoryLabel } });
    } catch (error) {
        console.error('加入爆點模板庫失敗', error);
        res.status(500).json({ error: '無法加入爆點模板庫，請稍後重試。' });
    }
});

function toTaipeiTZ(date) {
    if (!date) return null;
    const d = new Date(date);
    const tzOffset = 8 * 60 * 60 * 1000;
    const taipeiTime = new Date(d.getTime() + tzOffset);
    return taipeiTime.toISOString().replace('Z', '+08:00');
}

// === AUTHENTICATION API ===
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: '請提供 Email 和密碼' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: '找不到已綁定該電子信箱的使用者' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: '密碼錯誤' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: '登入成功',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                createAt: toTaipeiTZ(user.createAt)
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: '伺服器錯誤' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: '請提供使用者名稱、電子信箱與密碼' });
        }

        // Email 唯一性驗證
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: '此 Email 已被註冊' });
        }

        // 密碼加密
        const passwordHash = await bcrypt.hash(password, 10);

        // 建立新使用者，預設 plan 為 "free"
        const user = await prisma.user.create({
            data: {
                name,
                email,
                passwordHash,
                plan: 'free'
            }
        });

        // 產生 JWT Token
        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: '註冊成功',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                createAt: toTaipeiTZ(user.createAt)
            }
        });
    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ error: '伺服器錯誤，無法完成註冊' });
    }
});

app.get('/api/auth/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, name: true, email: true, image: true, plan: true, createAt: true }
        });

        if (!user) {
            return res.status(404).json({ error: '找不到使用者' });
        }

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                plan: user.plan,
                createAt: toTaipeiTZ(user.createAt)
            }
        });
    } catch (error) {
        console.error('Auth Me Error:', error);
        res.status(401).json({ error: 'Token 無效或已過期' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.json({ success: true, message: '已登出' });
});

// === PROJECTS API ===
app.get('/api/projects', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const includeDeleted = req.query.include_deleted === 'true';

        const projects = await prisma.project.findMany({
            where: { 
                authorId: decoded.id,
                ...(includeDeleted ? {} : { is_deleted: false })
            },
            select: {
                id: true,
                title: true,
                ratio: true,
                style: true,
                is_deleted: true,
                metadata: true,
                createAt: true,
                updatedAt: true,
                _count: {
                    select: { shots: true }
                }
            },
            orderBy: { createAt: 'desc' }
        });

        const formattedProjects = projects.map(p => ({
            ...p,
            tags: (p.metadata && typeof p.metadata === 'object' && Array.isArray(p.metadata.tags)) ? p.metadata.tags : [],
            shotCount: p._count ? p._count.shots : 0,
            createAt: toTaipeiTZ(p.createAt),
            updateAt: toTaipeiTZ(p.updatedAt || p.createAt)
        }));

        res.json({ projects: formattedProjects });
    } catch (error) {
        console.error('Fetch Projects Error:', error);
        res.status(500).json({ error: '獲取專案失敗' });
    }
});

// GET project cover (binary stream endpoint)
app.get('/api/projects/:id/cover', async (req, res) => {
    try {
        const { id } = req.params;
        const project = await prisma.project.findUnique({
            where: { id },
            select: { cover: true }
        });
        if (!project || !project.cover) {
            return res.status(404).send('Not Found');
        }

        if (project.cover.startsWith('data:')) {
            const matches = project.cover.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
                return res.send(buffer);
            }
        }

        res.redirect(project.cover);
    } catch (err) {
        console.error('Fetch Cover Error:', err);
        res.status(500).send('Server Error');
    }
});

// GET shot image (binary stream endpoint)
app.get('/api/projects/:projectId/shots/:shotId/image', async (req, res) => {
    try {
        const { projectId, shotId } = req.params;
        const shot = await prisma.shot.findUnique({
            where: { id: shotId },
            select: { payload: true, projectId: true }
        });

        if (!shot || !shot.payload || !shot.payload.image) {
            return res.status(404).send('Not Found');
        }

        // 驗證 Shot 確實屬於此 Project
        if (shot.projectId !== projectId) {
            return res.status(404).send('Not Found');
        }

        const imageUrl = shot.payload.image;
        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
                return res.send(buffer);
            }
        }

        res.redirect(imageUrl);
    } catch (err) {
        console.error('Fetch Shot Image Error:', err);
        res.status(500).send('Server Error');
    }
});

// DELETE project (soft delete)
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { id } = req.params;

        const project = await prisma.project.findUnique({
            where: { id }
        });

        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限刪除此專案' });

        await prisma.project.update({
            where: { id },
            data: { is_deleted: true }
        });

        res.json({ message: '專案已成功移至回收桶' });
    } catch (error) {
        console.error('Delete Project Error:', error);
        res.status(500).json({ error: '刪除專案失敗' });
    }
});

// POST restore project
app.post('/api/projects/:id/restore', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { id } = req.params;

        const project = await prisma.project.findUnique({
            where: { id }
        });

        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限還原此專案' });

        await prisma.project.update({
            where: { id },
            data: { is_deleted: false }
        });

        res.json({ message: '專案已成功還原' });
    } catch (error) {
        console.error('Restore Project Error:', error);
        res.status(500).json({ error: '還原專案失敗' });
    }
});

// PATCH update project (e.g. rename title)
app.patch('/api/projects/:id', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { id } = req.params;
        const { title, tags } = req.body;

        if (title === undefined && tags === undefined) {
            return res.status(400).json({ error: '請提供要更新的欄位' });
        }

        const project = await prisma.project.findUnique({
            where: { id }
        });

        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限修改此專案' });

        const dataToUpdate = {};

        if (title !== undefined) {
            if (!title || !title.trim()) {
                return res.status(400).json({ error: '專案標題為必填' });
            }
            dataToUpdate.title = title.trim();
        }

        if (tags !== undefined) {
            if (!Array.isArray(tags)) {
                return res.status(400).json({ error: 'Tags 必須為陣列' });
            }
            const cleanTags = Array.from(new Set(tags.map(t => String(t || '').trim()).filter(Boolean)));
            const currentMetadata = (project.metadata && typeof project.metadata === 'object' && !Array.isArray(project.metadata)) ? project.metadata : {};
            dataToUpdate.metadata = {
                ...currentMetadata,
                tags: cleanTags
            };
        }

        const updated = await prisma.project.update({
            where: { id },
            data: dataToUpdate
        });

        const formatted = {
            ...updated,
            tags: (updated.metadata && typeof updated.metadata === 'object' && Array.isArray(updated.metadata.tags)) ? updated.metadata.tags : [],
            createAt: toTaipeiTZ(updated.createAt),
            updateAt: toTaipeiTZ(updated.updatedAt || updated.createAt)
        };

        res.json({ message: '專案已成功更新', project: formatted });
    } catch (error) {
        console.error('Update Project Error:', error);
        res.status(500).json({ error: '更新專案失敗' });
    }
});

// POST duplicate project
app.post('/api/projects/:id/duplicate', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { id } = req.params;

        const original = await prisma.project.findUnique({
            where: { id },
            include: { shots: true }
        });

        if (!original) return res.status(404).json({ error: '找不到專案' });
        if (original.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限複製此專案' });

        // 產生唯一的 shortId
        let shortId = generateShortId();
        let exists = await prisma.project.findUnique({ where: { shortId } });
        let attempts = 0;
        while (exists && attempts < 5) {
            shortId = generateShortId();
            exists = await prisma.project.findUnique({ where: { shortId } });
            attempts++;
        }

        const duplicateTitle = `${original.title} (副本)`;

        const newProject = await prisma.project.create({
            data: {
                shortId,
                authorId: decoded.id,
                title: duplicateTitle,
                style: original.style || '',
                ratio: original.ratio || '',
                cover: original.cover || null,
                metadata: original.metadata || {},
                characters: original.characters || {},
                shots: {
                    create: (original.shots || []).map((shot) => ({
                        order: shot.order,
                        title: shot.title || '',
                        camera: shot.camera || '',
                        duration: shot.duration || '3s',
                        payload: shot.payload || {}
                    }))
                }
            },
            include: {
                shots: true
            }
        });

        const formattedProject = {
            ...newProject,
            tags: (newProject.metadata && typeof newProject.metadata === 'object' && Array.isArray(newProject.metadata.tags)) ? newProject.metadata.tags : [],
            createAt: toTaipeiTZ(newProject.createAt),
            updatedAt: toTaipeiTZ(newProject.updatedAt),
            shots: (newProject.shots || []).map(s => ({
                ...s,
                createAt: toTaipeiTZ(s.createAt),
                updateAt: toTaipeiTZ(s.updateAt)
            }))
        };

        res.json({ message: '專案複製成功', project: formattedProject });
    } catch (error) {
        console.error('Duplicate Project Error:', error);
        res.status(500).json({ error: '複製專案失敗' });
    }
});

// ——————————————————————————————————————————————
// Shot 編輯與重新生成 API
// ——————————————————————————————————————————————

// 共用 Gemini 圖片生成 helper
async function runGeminiImageGeneration({ question, ratio }) {
    return (await generateImage(getGenAI(), { question, ratio })).image[0];
}

// PATCH Shot（編輯鏡頭資料）
app.patch('/api/projects/:projectId/shots/:shotId', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { projectId, shotId } = req.params;

        // 驗證 Project 存在且屬於登入使用者
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限修改此專案' });

        // 驗證 Shot 存在且屬於此 Project
        const shot = await prisma.shot.findUnique({ where: { id: shotId } });
        if (!shot) return res.status(404).json({ error: '找不到鏡頭' });
        if (shot.projectId !== projectId) return res.status(404).json({ error: '找不到鏡頭' });

        // Whitelist 可修改欄位
        const { title, camera, duration, payloadPatch } = req.body;
        const updateData = {};
        if (title !== undefined) updateData.title = String(title).trim();
        if (camera !== undefined) updateData.camera = String(camera).trim();
        if (duration !== undefined) updateData.duration = String(duration).trim();

        // Payload merge（不覆蓋，只更新指定欄位）
        if (payloadPatch && typeof payloadPatch === 'object') {
            const currentPayload = shot.payload || {};
            const allowedPayloadKeys = ['emotion', 'note', 'shotPrompt', 'finalPrompt', 'cameraDetails', 'image', 'imageHistory', 'imageStatus', 'imageError', 'characters', 'dialogue', 'purpose', 'angle', 'sourceShot'];
            const patchedPayload = { ...currentPayload };
            for (const key of allowedPayloadKeys) {
                if (payloadPatch[key] !== undefined) {
                    patchedPayload[key] = payloadPatch[key];
                }
            }
            updateData.payload = patchedPayload;
        }

        // 更新 Shot
        const updatedShot = await prisma.shot.update({
            where: { id: shotId },
            data: updateData
        });

        // Touch Project.updatedAt
        const projectUpdateData = { updatedAt: new Date() };
        if (shot.order === 1 && updateData.payload?.image) {
            projectUpdateData.cover = updateData.payload.image;
        }
        await prisma.project.update({ where: { id: projectId }, data: projectUpdateData });

        // 回傳 Shot（image URL 帶版本號）
        const versionTs = updatedShot.updateAt ? new Date(updatedShot.updateAt).getTime() : Date.now();
        const cleanPayload = { ...updatedShot.payload };
        if (cleanPayload.image && cleanPayload.image.startsWith('data:')) {
            cleanPayload.image = `/api/projects/${projectId}/shots/${shotId}/image?v=${versionTs}`;
        }

        res.json({
            message: '鏡頭已成功更新',
            shot: {
                ...updatedShot,
                payload: cleanPayload,
                createAt: toTaipeiTZ(updatedShot.createAt),
                updateAt: toTaipeiTZ(updatedShot.updateAt)
            }
        });
    } catch (error) {
        console.error('Update Shot Error:', error);
        res.status(500).json({ error: '更新鏡頭失敗' });
    }
});

// POST 重新生成單一鏡頭圖片
app.post('/api/projects/:projectId/shots/:shotId/regenerate', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { projectId, shotId } = req.params;

        // 驗證 Project 存在且屬於登入使用者
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限修改此專案' });

        // 驗證 Shot 存在且屬於此 Project
        const shot = await prisma.shot.findUnique({ where: { id: shotId } });
        if (!shot) return res.status(404).json({ error: '找不到鏡頭' });
        if (shot.projectId !== projectId) return res.status(404).json({ error: '找不到鏡頭' });

        // 取得 prompt（body.prompt > payload.finalPrompt > payload.shotPrompt > title）
        const prompt = req.body.prompt
            || (shot.payload && shot.payload.finalPrompt)
            || (shot.payload && shot.payload.shotPrompt)
            || shot.title
            || '';

        if (!prompt) {
            return res.status(400).json({ error: '缺少生圖提示詞' });
        }

        // 呼叫 Gemini 生成圖片
        const newImageDataUri = await runGeminiImageGeneration({
            question: prompt,
            ratio: project.ratio
        });

        // 整理歷史版本（最多保存 5 筆）
        const currentPayload = shot.payload || {};
        let history = Array.isArray(currentPayload.imageHistory) ? [...currentPayload.imageHistory] : [];
        if (currentPayload.image && !history.some(h => h.image === currentPayload.image)) {
            history.unshift({
                version: history.length + 1,
                image: currentPayload.image,
                prompt: currentPayload.finalPrompt || '',
                createdAt: new Date().toISOString()
            });
        }
        history.unshift({
            version: history.length + 1,
            image: newImageDataUri,
            prompt: req.body.prompt ? prompt : (currentPayload.finalPrompt || prompt),
            createdAt: new Date().toISOString()
        });
        history = history.slice(0, 5);

        // 更新 Shot payload
        const updatedPayload = {
            ...currentPayload,
            image: newImageDataUri,
            finalPrompt: req.body.prompt ? prompt : (currentPayload.finalPrompt || prompt),
            imageHistory: history
        };

        const updatedShot = await prisma.shot.update({
            where: { id: shotId },
            data: { payload: updatedPayload }
        });

        // Touch Project.updatedAt，若是第一鏡也更新 cover
        const projectUpdateData = { updatedAt: new Date() };
        if (shot.order === 1) {
            projectUpdateData.cover = newImageDataUri;
        }
        await prisma.project.update({ where: { id: projectId }, data: projectUpdateData });

        // 回傳 updated Shot（image URL 帶版本號）
        const versionTs = updatedShot.updateAt ? new Date(updatedShot.updateAt).getTime() : Date.now();
        const cleanPayload = { ...updatedShot.payload };
        if (cleanPayload.image && cleanPayload.image.startsWith('data:')) {
            cleanPayload.image = `/api/projects/${projectId}/shots/${shotId}/image?v=${versionTs}`;
        }

        res.json({
            message: '鏡頭圖片已重新生成',
            shot: {
                ...updatedShot,
                payload: cleanPayload,
                createAt: toTaipeiTZ(updatedShot.createAt),
                updateAt: toTaipeiTZ(updatedShot.updateAt)
            }
        });
    } catch (error) {
        const failure = reportAIError(error, { task: 'regenerate-image', model: getModel('image') });
        res.status(failure.status).json({ error: '重新生成圖片失敗：' + failure.message, code: failure.code });
    }
});

// POST 最佳化提示詞（根據故事內容與鏡頭語言生成精確生圖 prompt）
app.post('/api/projects/:projectId/shots/:shotId/optimize-prompt', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { projectId, shotId } = req.params;

        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project || project.authorId !== decoded.id) {
            return res.status(403).json({ error: '無權限' });
        }

        const shot = await prisma.shot.findUnique({ where: { id: shotId } });
        if (!shot || shot.projectId !== projectId) {
            return res.status(404).json({ error: '找不到鏡頭' });
        }

        const { title, camera, emotion, cameraDetails } = req.body;
        const shotStory = title || shot.title;
        const shotCamera = camera || shot.camera;
        const shotEmotion = emotion || (shot.payload?.emotion || '');
        const style = project.style || 'Cinematic';
        const ratio = project.ratio || '16:9';

        const ai = getGenAI();
        const promptGenRequest = `You are a professional cinematographer and AI image prompt engineer.
Convert this storyboard shot description into a highly detailed, evocative English image prompt for visual generation.
- Story/Action: "${shotStory}"
- Camera / Shot Type: "${shotCamera}"
- Camera Details: "${JSON.stringify(cameraDetails || {})}"
- Emotion/Atmosphere: "${shotEmotion}"
- Style Aesthetic: "${style}"
- Aspect Ratio: "${ratio}"

Requirements:
- Output ONLY the English prompt, no explanations, no markdown ticks, no quotation marks.
- Include cinematic lighting, environment composition, framing, and mood.`;

        const response = await ai.models.generateContent({
            ...getModelConfig('fast'),
            contents: [{ text: promptGenRequest }],
            config: { ...getModelConfig('fast').config,
                systemInstruction: 'Return only the complete English image prompt. No headings, introduction, markdown, JSON, surrounding quotes or explanations.' }
        });

        const generatedPrompt = validatePrompt(parseResponse(response).response);

        res.json({
            prompt: generatedPrompt
        });
    } catch (error) {
        const failure = reportAIError(error, { task: 'optimize-prompt', model: getModel('fast') });
        res.status(failure.status).json({ error: failure.message, code: failure.code });
    }
});

// GET single project (with shots and metadata)
app.get('/api/projects/:id', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const id = req.params.id;
        const project = await prisma.project.findUnique({
            where: { id },
            include: { shots: true, author: true }
        });

        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限存取此專案' });

        let cleanCover = project.cover;
        if (cleanCover && cleanCover.startsWith('data:')) {
            cleanCover = `/api/projects/${project.id}/cover`;
        }

        const formattedProject = {
            ...project,
            tags: (project.metadata && typeof project.metadata === 'object' && Array.isArray(project.metadata.tags)) ? project.metadata.tags : [],
            cover: cleanCover,
            createAt: toTaipeiTZ(project.createAt),
            updatedAt: toTaipeiTZ(project.updatedAt),
            shots: (project.shots || []).map(s => {
                let cleanPayload = { ...s.payload };
                const versionTs = s.updateAt ? new Date(s.updateAt).getTime() : Date.now();
                if (cleanPayload.image && cleanPayload.image.startsWith('data:')) {
                    cleanPayload.image = `/api/projects/${project.id}/shots/${s.id}/image?v=${versionTs}`;
                }
                return {
                    ...s,
                    payload: cleanPayload,
                    createAt: toTaipeiTZ(s.createAt),
                    updateAt: toTaipeiTZ(s.updateAt)
                };
            }),
            author: project.author ? {
                ...project.author,
                createAt: toTaipeiTZ(project.author.createAt)
            } : null
        };

        res.json({ project: formattedProject });
    } catch (error) {
        console.error('Fetch Project Error:', error);
        res.status(500).json({ error: '獲取專案失敗' });
    }
});

function generateShortId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

app.post('/api/projects', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const { title, style, ratio, cover, metadata, characters, shots } = req.body;

        const generationId = generationProjectId(decoded.id, metadata?.generationTaskId);
        if (generationId) {
            const existingProject = await prisma.project.findUnique({ where: { id: generationId }, include: { shots: true } });
            if (existingProject) {
                if (existingProject.is_deleted) return res.status(409).json({ error: '這份分鏡已被刪除，請建立新的分鏡。' });
                return res.json({ message: '分鏡已儲存', project: existingProject, reused: true });
            }
        }

        if (!title) {
            return res.status(400).json({ error: '專案標題為必填欄位' });
        }

        // 產生唯一的 shortId
        let shortId = generateShortId();
        let exists = await prisma.project.findUnique({ where: { shortId } });
        let attempts = 0;
        while (exists && attempts < 5) {
            shortId = generateShortId();
            exists = await prisma.project.findUnique({ where: { shortId } });
            attempts++;
        }

        const project = await prisma.project.create({
            data: {
                ...(generationId ? { id: generationId } : {}),
                shortId,
                authorId: decoded.id,
                title,
                style: style || '',
                ratio: ratio || '',
                cover: cover || null,
                metadata: metadata || {},
                characters: characters || {},
                shots: {
                    create: (shots || []).map((shot) => ({
                        order: shot.order,
                        title: shot.title || '',
                        camera: shot.camera || '',
                        duration: shot.duration || '3s',
                        payload: shot.payload || {}
                    }))
                }
            },
            include: {
                shots: true
            }
        });

        const formattedProject = {
            ...project,
            createAt: toTaipeiTZ(project.createAt),
            updatedAt: toTaipeiTZ(project.updatedAt),
            shots: (project.shots || []).map(s => ({
                ...s,
                createAt: toTaipeiTZ(s.createAt),
                updateAt: toTaipeiTZ(s.updateAt)
            }))
        };

        res.json({ message: '專案儲存成功', project: formattedProject });
    } catch (error) {
        console.error('Create Project Error:', error);
        res.status(500).json({ error: '建立專案失敗' });
    }
});

// ==========================
// ==========================




app.post('/api/ask-gemini', async (req, res) => {
    const { question, type, ratio } = req.body || {};
    if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: '缺少有效提示詞', details: 'question 必須是非空白文字' });
    // The client selects a task only; model IDs and parameters stay on the server.
    const task = type === 'image' ? 'image' : type === 'story' ? 'story' : 'fast';
    try {
        const ai = getGenAI();
        const result = task === 'image' ? await generateImage(ai, { question, ratio })
            : parseResponse(await ai.models.generateContent({ ...getModelConfig(task), contents: [{ text: question }] }));
        if (task !== 'image' && !result.response.trim()) throw emptyContent('模型未回傳有效文字，請重試。');
        res.json(result);
    } catch (error) {
        const failure = reportAIError(error, { task, provider: 'vertex-ai', model: getModel(task) });
        res.status(failure.status).json({ error: 'Internal Server Error', details: failure.message, code: failure.code });
    }
});

app.get('/api/get-templates', async (req, res) => {
    try {
        const templates = await prisma.template.findMany({
            orderBy: { createAt: 'desc' }
        });
        const dataArray = templates.map(toCatalogTemplate);
        res.json(dataArray);
    }
    catch (err) {
        console.error('讀取模板失敗', err);
        res.status(500).json({ error: '無法讀取模板'});
    }
});

app.post('/api/templates', async (req, res) => {
    try {
        const data = req.body;
        if (!data || !data.id || !data.name) {
            return res.status(400).json({ error: '缺少必要欄位：id, name' });
        }
        const newTpl = await prisma.template.create({
            data: {
                id: data.id,
                name: data.name,
                category: data.category || '未分類',
                tags: data.tags || [],
                description: data.description || '',
                content: data,
                is_custom: true
            }
        });
        res.json({ success: true, template: newTpl });
    } catch (err) {
        console.error('新增模板失敗', err);
        res.status(500).json({ error: '新增模板失敗', details: err.message });
    }
});

// API 404 攔截：確保任何未匹配的 /api/* 請求永遠回傳 JSON，絕不回傳 Express 預設的 HTML 錯誤頁
app.use('/api', (req, res) => {
    res.status(404).json({
        error: `找不到 API 端點: ${req.method} ${req.originalUrl || req.url}`
    });
});

// API 全域錯誤處理：捕捉任何未捕獲的例外並回傳 JSON
app.use((err, req, res, next) => {
    if (req.url.startsWith('/api') || req.originalUrl?.startsWith('/api')) {
        console.error('⚠️ API 內部錯誤:', err);
        return res.status(err.status || 500).json({
            error: err.message || '伺服器內部錯誤'
        });
    }
    next(err);
});

// Discovery pages
app.get('/discovery', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'html', 'discovery.html'));
});
app.get('/discovery/settings', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'html', 'discovery-settings.html'));
});

// SPA catch-all — redirect routes to main.html
const spaRoutes = ['/dashboard', '/projects', '/login', '/register', '/generate', '/analyze', '/analysis', '/history', '/template', '/template/:id', '/project/:id'];
spaRoutes.forEach(route => {
    app.get(route, (req, res) => {
        res.sendFile(path.join(process.cwd(), 'public', 'main.html'));
    });
});
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
