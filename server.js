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
const { ApiSettings, isSiteGeminiEnabled, isSiteYouTubeEnabled } = require('./lib/discovery/api-settings');
const { vertexAuthOptions } = require('./lib/google-credentials');
const { createSiteRateLimiter, createSearchCache } = require('./lib/site-quota');
const { buildTemplateFromDiscovery } = require('./lib/discovery/template-builder');
const { toCatalogTemplate } = require('./lib/template-catalog');
const { generationProjectId } = require('./lib/generation-project-id');
const { randomUUID } = require('node:crypto');
const storyboardImages = require('./lib/storage/storyboard-images');
const projectLifecycle = require('./lib/projects/lifecycle');

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
const OpenAI = require('openai');
const { getModel, getModelConfig, isValidProvider, isProviderConfigured } = require('./lib/ai/model-config');
const { parseResponse, generateImage, emptyContent, validatePrompt, reportAIError } = require('./lib/ai/generation');
const { createCopilotHandler } = require('./lib/ai/copilot');
const { createProviderRouter } = require('./lib/ai/provider-router');

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
    // /projects is both a SPA document and a legacy API alias. Browser
    // navigation carries no localStorage Bearer token: never rewrite HTML to API.
    const pathname = req.url.split('?')[0];
    const accept = req.headers.accept || '';
    const projectsDocument = ['GET', 'HEAD'].includes(req.method) && /^\/projects\/?$/.test(pathname) &&
        (accept.includes('text/html') || (!accept.includes('application/json') && !req.headers.authorization));
    if (projectsDocument) return next();
    // 2. 若由 Vercel 或其他 proxy 轉發時遺失 /api 前綴，自動補充
    if (!req.url.startsWith('/api') && req.url !== '/' && !req.url.startsWith('/public') && !req.url.startsWith('/css') && !req.url.startsWith('/js') && !req.url.startsWith('/images') && !req.url.startsWith('/html') && !req.url.startsWith('/video') && !req.url.startsWith('/icon')) {
        const isDiscoveryApi = req.url.startsWith('/discovery/search') || req.url.startsWith('/discovery/analyze') || req.url.startsWith('/discovery/skills') || req.url.startsWith('/discovery/add-template');
        if (req.url.startsWith('/auth') || req.url.startsWith('/user') || req.url.startsWith('/ai') || req.url.startsWith('/projects') || req.url.startsWith('/creation/copilot') || req.url.startsWith('/ask-gemini') || req.url.startsWith('/get-templates') || req.url.startsWith('/templates') || isDiscoveryApi) {
            req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
        }
    }
    next();
});

const { AsyncLocalStorage } = require('node:async_hooks');
const apiRequestContext = new AsyncLocalStorage();
const siteGeminiLimiter = createSiteRateLimiter({ windowMs: 60000, defaultLimit: 20 });
const siteYouTubeLimiter = createSiteRateLimiter({ windowMs: 60000, defaultLimit: 15 });
const youtubeSearchCache = createSearchCache({ ttlMs: 300000, maxEntries: 200 });

function requestAIEnv() {
    const keys = apiRequestContext.getStore() || {};
    return {
        ...process.env,
        OPENAI_API_KEY: keys.openaiApiKey || '',
        GEMINI_API_KEY: keys.geminiApiKey || '',
        GOOGLE_API_KEY: '',
        YOUTUBE_API_KEY: keys.youtubeApiKey || '',
        SITE_GEMINI_ENABLED: isSiteGeminiEnabled(process.env) ? 'true' : 'false'
    };
}
function requirePersonalKey(field, provider) {
    const key = apiRequestContext.getStore()?.[field];
    if (!key) throw Object.assign(new Error(`請先在 API 設定填入此帳號自己的 ${provider} API Key。`),
        { status: 403, code: 'PERSONAL_API_KEY_REQUIRED' });
    return key;
}
function getGenAI() {
    const keys = apiRequestContext.getStore() || {};
    if (keys.geminiApiKey) {
        return new GoogleGenAI({ vertexai: false, apiKey: keys.geminiApiKey });
    }
    if (keys.vertexAvailable) {
        return new GoogleGenAI({
            vertexai: true,
            project: process.env.GOOGLE_CLOUD_PROJECT_ID,
            location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
            ...vertexAuthOptions(process.env)
        });
    }
    throw Object.assign(new Error('目前網站的 Gemini 服務暫時無法使用，請稍後重試或於 API 設定填入個人金鑰。'), {
        status: 503,
        code: 'AI_AUTH_PERMISSION'
    });
}
function getOpenAI() {
    return new OpenAI({ apiKey: requirePersonalKey('openaiApiKey', 'OpenAI') });
}
function enforceSiteGeminiLimit(req, res, provider = 'gemini') {
    if (provider !== 'gemini') return true;
    const keys = apiRequestContext.getStore() || {};
    if (keys.hasPersonalGeminiKey || keys.geminiApiKey) return true;
    const limit = Number(process.env.SITE_GEMINI_RPM || 20);
    const check = siteGeminiLimiter.consume(req.apiSettingsUserId || req.ip, limit);
    if (!check.allowed) {
        res.set('Retry-After', String(check.retryAfterSeconds));
        res.status(429).json({
            error: '目前使用 Gemini 的人數較多，服務暫時繁忙。請稍後再試，或在 API 設定中使用自己的 Gemini API Key。',
            code: 'AI_RATE_LIMIT',
            retryAfter: check.retryAfterSeconds
        });
        return false;
    }
    return true;
}
function enforceSiteYouTubeLimit(req, res) {
    const keys = apiRequestContext.getStore() || {};
    if (keys.hasPersonalYoutubeKey) return true;
    const limit = Number(process.env.SITE_YOUTUBE_RPM || 15);
    const check = siteYouTubeLimiter.consume(req.apiSettingsUserId || req.ip, limit);
    if (!check.allowed) {
        res.set('Retry-After', String(check.retryAfterSeconds));
        res.status(429).json({
            error: '目前使用 YouTube 搜尋的人數較多，服務暫時繁忙。請稍後再試，或在 API 設定中使用自己的 YouTube API Key。',
            code: 'YOUTUBE_RATE_LIMIT',
            retryAfter: check.retryAfterSeconds
        });
        return false;
    }
    return true;
}

const aiRouter = createProviderRouter({
    getRuntimeEnv: requestAIEnv,
    getGeminiClient: getGenAI,
    getOpenAIClient: getOpenAI
});

async function resolveRequestProvider(req, explicitProvider) {
    if (explicitProvider !== undefined && explicitProvider !== null && explicitProvider !== '') {
        return aiRouter.resolveProvider({ requestedProvider: explicitProvider });
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
            if (prisma.user?.findUnique) {
                const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { aiProvider: true } });
                if (user?.aiProvider) return aiRouter.resolveProvider({ userProvider: user.aiProvider });
            }
        } catch (_) { /* Keep default provider when optional auth lookup is unavailable */ }
    }
    return aiRouter.resolveProvider({});
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

const discoverySettings = new ApiSettings({ prisma });
const passwordVerifyLimiter = createSiteRateLimiter({
    windowMs: 15 * 60 * 1000,
    defaultLimit: Number(process.env.PASSWORD_VERIFY_LIMIT || 10)
});

function isSameOriginWrite(req) {
    let sameOrigin = true;
    if (req.headers.origin) {
        try { sameOrigin = new URL(req.headers.origin).host === req.get('host'); }
        catch { sameOrigin = false; }
    }
    return sameOrigin && req.get('sec-fetch-site') !== 'cross-site';
}

async function verifyAccountPassword(req, res, password) {
    const userId = req.apiSettingsUserId;
    if (!userId) {
        res.status(401).json({ error: '請先登入後再執行此操作。', code: 'AUTH_REQUIRED' });
        return false;
    }
    if (typeof password !== 'string' || !password) {
        res.status(400).json({ error: '請輸入目前的帳號密碼以驗證身分。', code: 'PASSWORD_REQUIRED' });
        return false;
    }
    const rate = passwordVerifyLimiter.consume(userId);
    if (!rate.allowed) {
        res.set('Retry-After', String(rate.retryAfterSeconds));
        res.status(429).json({
            error: '密碼驗證嘗試次數過多，請稍後再試。',
            code: 'PASSWORD_RATE_LIMIT',
            retryAfter: rate.retryAfterSeconds
        });
        return false;
    }
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, passwordHash: true }
    });
    if (!user || !user.passwordHash) {
        res.status(404).json({ error: '找不到對應的使用者帳號。', code: 'USER_NOT_FOUND' });
        return false;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
        res.status(403).json({ error: '帳號密碼錯誤，請重新輸入。', code: 'INVALID_PASSWORD' });
        return false;
    }
    return true;
}

app.use('/api', async (req, res, next) => {
    const protectedRequest = /^\/(?:discovery(?:\/|$)|ask-gemini(?:\/|$)|creation\/copilot(?:\/|$)|ai\/providers(?:\/|$)|user\/ai-provider(?:\/|$)|templates\/recommend(?:\/|$))/.test(req.path);
    const authorization = req.get('authorization') || '';
    if (authorization.startsWith('Bearer ')) {
        try {
            const identity = jwt.verify(authorization.slice(7), JWT_SECRET);
            if (typeof identity.id === 'string' && identity.id) req.apiSettingsUserId = identity.id;
        } catch { /* Protected requests fail closed below. */ }
    }
    if (protectedRequest && !req.apiSettingsUserId) return res.status(401).json({ error: '請先登入，才能設定或使用此帳號的 API 金鑰。', code: 'AUTH_REQUIRED' });
    let saved = {};
    if (req.apiSettingsUserId) {
        try {
            saved = await discoverySettings.readFromDb(req.apiSettingsUserId);
        } catch (error) {
            console.error('讀取使用者 API 憑證失敗:', error.message);
            if (protectedRequest) {
                return res.status(500).json({ error: '無法讀取帳號 API 金鑰設定，請檢查伺服器加密設定或稍後重試。' });
            }
        }
    }
    req.apiSettingsSaved = saved;
    apiRequestContext.run(discoverySettings.effective(saved), () => next());
});
// All user AI requests require the verified account identity established above.
app.post('/api/creation/copilot', async (req, res, next) => {
    const authorization = req.get('authorization');
    if (authorization) {
        try {
            const decoded = jwt.verify(authorization.replace(/^Bearer /, ''), JWT_SECRET);
            req.copilotIdentity = 'user:' + decoded.id;
            if (!req.body?.provider && prisma.user?.findUnique) {
                try {
                    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { aiProvider: true } });
                    if (user?.aiProvider) req.userAiProvider = user.aiProvider;
                } catch (_) {}
            }
        } catch { return res.status(401).json({ error: '登入已失效，請重新登入。' }); }
    }
    const targetProvider = req.body?.provider || req.userAiProvider || 'gemini';
    if (!enforceSiteGeminiLimit(req, res, targetProvider)) return;
    next();
}, createCopilotHandler(aiRouter, { getRuntimeEnv: requestAIEnv, getTemplate: async id => {
    const record = await prisma.template.findUnique({ where: { id } });
    return record ? toCatalogTemplate(record) : null;
} }));
const DISCOVERY_PLATFORMS = new Set(['youtube-shorts']);
const DISCOVERY_TIME_RANGES = new Set(['7', '30', '90', 'all']);
const DISCOVERY_MAX_DURATIONS = new Set(['60', '180']);

app.use('/api/discovery', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
});

app.get('/api/discovery/settings', (req, res) => {
    const saved = req.apiSettingsSaved || {};
    const legacyMigration = discoverySettings.legacyMigrationInfo(req, saved);
    res.json(discoverySettings.status(saved, { legacyMigration }));
});

app.post('/api/discovery/settings', async (req, res) => {
    // Settings affect only the verified account in DB. Reject cross-site writes.
    if (!isSameOriginWrite(req) || !req.is('application/json')) {
        return res.status(403).json({ error: '請從本站 API 設定頁儲存設定。' });
    }
    let updates;
    try { updates = discoverySettings.extractUpdates(req.body); }
    catch (error) { return res.status(400).json({ error: error.message }); }

    const currentSaved = req.apiSettingsSaved || {};
    const hasKeyUpdates = Object.keys(updates).length > 0;
    if (!hasKeyUpdates) {
        const legacyMigration = discoverySettings.legacyMigrationInfo(req, currentSaved);
        return res.json(discoverySettings.status(currentSaved, { legacyMigration }));
    }

    try {
        const verified = await verifyAccountPassword(req, res, req.body?.currentPassword);
        if (!verified) return;

        if (updates.openaiApiKey) {
            try {
                await new OpenAI({ apiKey: updates.openaiApiKey, timeout: 20000, maxRetries: 0 }).models.list();
            } catch {
                throw new Error('OpenAI 連線檢查失敗，請確認金鑰與 API 存取權限後重試。');
            }
        }
        if (updates.youtubeApiKey) {
            await new YouTubeCollector({ apiKey: updates.youtubeApiKey }).request('videos', { part: 'id', id: 'wToeNUwRb_k' });
        }
        if (updates.geminiApiKey) {
            try {
                await new GoogleGenAI({ vertexai: false, apiKey: updates.geminiApiKey }).models.get({
                    model: getModel('discovery'), config: { httpOptions: { timeout: 20000 } }
                });
            } catch (error) {
                const failure = reportAIError(error, { task: 'discovery-settings', provider: 'gemini-developer-api', model: getModel('discovery') });
                throw new Error('Gemini Developer API 連線檢查失敗：' + failure.message);
            }
        }

        await discoverySettings.saveToDb(req.apiSettingsUserId, updates);
        const nextSaved = { ...currentSaved, ...updates, savedAt: new Date().toISOString() };
        req.apiSettingsSaved = nextSaved;
        const legacyMigration = discoverySettings.legacyMigrationInfo(req, nextSaved);
        res.json(discoverySettings.status(nextSaved, { legacyMigration }));
    } catch (error) {
        const msg = error?.message || '';
        const isConfigError = msg.includes('API_KEYS_ENCRYPTION_SECRET') || msg.includes('加密');
        const isProviderError = msg.startsWith('OpenAI') || msg.startsWith('YouTube') || msg.startsWith('Gemini');
        res.status(isConfigError ? 500 : 502).json({
            error: (isConfigError || isProviderError)
                ? msg
                : '無法儲存 API 設定，請稍後重試。'
        });
    }
});

app.post('/api/discovery/settings/migrate-cookie', async (req, res) => {
    if (!isSameOriginWrite(req) || !req.is('application/json')) {
        return res.status(403).json({ error: '請從本站 API 設定頁匯入設定。' });
    }
    try {
        const verified = await verifyAccountPassword(req, res, req.body?.currentPassword);
        if (!verified) return;

        const currentSaved = req.apiSettingsSaved || {};
        const legacy = discoverySettings.readLegacyCookie(req);
        const toMigrate = {};
        const migratedProviders = [];
        for (const [provider, field] of Object.entries({ gemini: 'geminiApiKey', youtube: 'youtubeApiKey', openai: 'openaiApiKey' })) {
            if (legacy[field] && !currentSaved[field]) {
                toMigrate[field] = legacy[field];
                migratedProviders.push(provider);
            }
        }
        if (migratedProviders.length === 0) {
            discoverySettings.clearLegacyCookie(res, req.apiSettingsUserId);
            return res.status(400).json({ error: '目前瀏覽器沒有可匯入的舊版 API 金鑰，請直接輸入金鑰綁定。' });
        }

        await discoverySettings.saveToDb(req.apiSettingsUserId, toMigrate);
        discoverySettings.clearLegacyCookie(res, req.apiSettingsUserId);
        const nextSaved = { ...currentSaved, ...toMigrate, savedAt: new Date().toISOString() };
        req.apiSettingsSaved = nextSaved;
        res.json({
            ...discoverySettings.status(nextSaved, { legacyMigration: { available: false, providers: [] } }),
            migratedProviders
        });
    } catch (error) {
        const msg = error?.message || '';
        res.status(500).json({ error: msg.includes('API_KEYS_ENCRYPTION_SECRET') || msg.includes('加密') ? msg : '匯入舊版 API 金鑰失敗，請重新綁定。' });
    }
});

app.delete('/api/discovery/settings/:provider', async (req, res) => {
    if (!isSameOriginWrite(req)) {
        return res.status(403).json({ error: '請從本站 API 設定頁解除綁定。' });
    }
    const provider = String(req.params.provider || '').trim().toLowerCase();
    if (!['gemini', 'youtube', 'openai'].includes(provider)) {
        return res.status(400).json({ error: '不支援的 API 服務類型。' });
    }
    try {
        const verified = await verifyAccountPassword(req, res, req.body?.currentPassword);
        if (!verified) return;

        await discoverySettings.deleteFromDb(req.apiSettingsUserId, provider);
        const next = discoverySettings.clear(req.apiSettingsSaved || {}, provider);
        next.savedAt = new Date().toISOString();
        req.apiSettingsSaved = next;
        let aiProviderReset = false;
        if (provider === 'openai' && req.apiSettingsUserId && prisma.user) {
            try {
                if (typeof prisma.user.updateMany === 'function') {
                    const updated = await prisma.user.updateMany({
                        where: { id: req.apiSettingsUserId, aiProvider: 'openai' },
                        data: { aiProvider: 'gemini' }
                    });
                    aiProviderReset = (updated?.count || 0) > 0;
                } else if (typeof prisma.user.findUnique === 'function' && typeof prisma.user.update === 'function') {
                    const user = await prisma.user.findUnique({ where: { id: req.apiSettingsUserId }, select: { aiProvider: true } });
                    if (user?.aiProvider === 'openai') {
                        await prisma.user.update({ where: { id: req.apiSettingsUserId }, data: { aiProvider: 'gemini' } });
                        aiProviderReset = true;
                    }
                }
            } catch (_) { /* Ignore DB reset failure when DB is mocked or unavailable */ }
        }
        const legacyMigration = discoverySettings.legacyMigrationInfo(req, next);
        res.json({
            ...discoverySettings.status(next, { legacyMigration }),
            ...(provider === 'openai' ? { aiProvider: 'gemini', aiProviderReset } : {})
        });
    } catch (error) {
        res.status(500).json({ error: error.message || '無法解除綁定，請稍後重試。' });
    }
});

app.get('/api/discovery/skills', (req, res) => {
    res.json({ skills: listSkills(), configured: discoverySettings.status(req.apiSettingsSaved || {}).configured,
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

        const keys = discoverySettings.effective(req.apiSettingsSaved || {});
        if (!keys.youtubeApiKey) {
            return res.status(503).json({ error: '目前網站的 YouTube 搜尋服務暫時無法使用，請稍後重試或於 API 設定填入個人金鑰。', code: 'YOUTUBE_UNAVAILABLE' });
        }
        const usingSiteKey = !keys.hasPersonalYoutubeKey;
        const cacheKey = JSON.stringify({
            query: normalizedQuery.toLowerCase(),
            platform,
            timeRange: String(timeRange),
            maxDuration: Number(maxDuration),
            resultLimit: normalizedLimit
        });
        const cachedPayload = usingSiteKey ? youtubeSearchCache.get(cacheKey) : null;
        if (cachedPayload) {
            return res.json({
                query: { query: normalizedQuery, platform, skill, timeRange: String(timeRange), maxDuration: Number(maxDuration), resultLimit: normalizedLimit },
                results: cachedPayload.results,
                meta: { ...cachedPayload.meta, cached: true }
            });
        }
        if (usingSiteKey && !enforceSiteYouTubeLimit(req, res)) return;

        const { videos, channel, diagnostics } = await new YouTubeCollector({ apiKey: keys.youtubeApiKey }).search({
            query: normalizedQuery,
            platform,
            timeRange: String(timeRange),
            maxDuration: Number(maxDuration),
            resultLimit: normalizedLimit
        });
        const results = videos;
        const meta = {
            collector: 'YouTube Data API',
            channel,
            diagnostics,
            returnedAt: new Date().toISOString(),
            warning: diagnostics?.limitation || 'YouTube API 無法直接確認影片是否為直式 Shorts。'
        };
        if (usingSiteKey) {
            youtubeSearchCache.set(cacheKey, { results, meta }, Number(process.env.SITE_YOUTUBE_CACHE_TTL_MS || 300000));
        }

        res.json({
            query: { query: normalizedQuery, platform, skill, timeRange: String(timeRange), maxDuration: Number(maxDuration), resultLimit: normalizedLimit },
            results,
            meta
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
        const keys = discoverySettings.effective(req.apiSettingsSaved || {});
        if (!keys.geminiApiKey && !enforceSiteGeminiLimit(req, res, 'gemini')) return;
        const client = keys.geminiApiKey ? new GoogleGenAI({ vertexai: false, apiKey: keys.geminiApiKey }) : getGenAI();
        if (keys.geminiApiKey) await client.models.get({ model: getModel('discovery'), config: { httpOptions: { timeout: 20000 } } });
        res.json({ analysis: await analyzeVideo(client, videoId, skill),
            provider: keys.geminiApiKey ? 'gemini-developer-api' : 'vertex-ai', model: getModel('discovery') });
    } catch (error) {
        const failure = reportAIError(error, { task: 'discovery', model: getModel('discovery') });
        if (failure.status === 429 && !res.get('Retry-After')) res.set('Retry-After', '60');
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
        templateIndexCache = null;
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

app.get('/api/ai/providers', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const saved = req.apiSettingsSaved || {};
    const caps = aiRouter.getCapabilities(requestAIEnv());
    const status = discoverySettings.status(saved);
    res.json({
        ...caps,
        services: {
            gemini: status.gemini,
            youtube: status.youtube,
            openai: status.openai
        }
    });
});

app.patch('/api/user/ai-provider', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const provider = req.body?.provider;
        if (!isValidProvider(provider)) {
            return res.status(400).json({ error: '無效的 AI Provider 設定' });
        }
        if (provider === 'openai' && !isProviderConfigured('openai', requestAIEnv())) {
            return res.status(503).json({ error: '請先在 API 設定綁定個人 OpenAI API 金鑰，再切換至此模型。', code: 'PERSONAL_API_KEY_REQUIRED' });
        }
        const updated = await prisma.user.update({
            where: { id: decoded.id },
            data: { aiProvider: provider },
            select: { aiProvider: true }
        });
        res.json({ aiProvider: updated.aiProvider || 'gemini' });
    } catch (error) {
        if (error?.name === 'JsonWebTokenError' || error?.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token 無效或已過期' });
        }
        console.error('Update AI Provider Error:', error);
        res.status(500).json({ error: '無法儲存 AI 模型設定' });
    }
});

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
                aiProvider: user.aiProvider || 'gemini',
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
                aiProvider: user.aiProvider || 'gemini',
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
            select: { id: true, name: true, email: true, image: true, plan: true, aiProvider: true, createAt: true }
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
                aiProvider: user.aiProvider || 'gemini',
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
function getInjectedStorageClient() {
    return app.locals?.storageClient || undefined;
}

function requireAuthUser(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: '未授權' });
        return null;
    }
    try {
        return jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    } catch (error) {
        res.status(401).json({ error: 'Token 無效或已過期' });
        return null;
    }
}

app.get('/api/projects', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;

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
                deletedAt: true,
                metadata: true,
                createAt: true,
                updatedAt: true,
                shots: {
                    orderBy: { order: 'asc' },
                    take: 1,
                    select: {
                        id: true,
                        order: true,
                        updateAt: true,
                        payload: true
                    }
                },
                _count: {
                    select: { shots: true }
                }
            },
            orderBy: { createAt: 'desc' }
        });

        const now = new Date();
        const storageClient = getInjectedStorageClient();
        const formattedProjects = await Promise.all(projects.map(async (p) => {
            const dynamicCover = await projectLifecycle.resolveProjectCover(p, { storageClient });
            const retention = projectLifecycle.computeTrashRetention(p, now);
            const { shots: _firstShotOnly, _count, ...rest } = p;
            return {
                ...rest,
                cover: dynamicCover,
                tags: (p.metadata && typeof p.metadata === 'object' && Array.isArray(p.metadata.tags)) ? p.metadata.tags : [],
                shotCount: _count ? _count.shots : (Array.isArray(p.shots) ? p.shots.length : 0),
                deletedAt: p.deletedAt ? new Date(p.deletedAt).toISOString() : null,
                retention,
                createAt: toTaipeiTZ(p.createAt),
                updateAt: toTaipeiTZ(p.updatedAt || p.createAt)
            };
        }));

        res.json({ projects: formattedProjects });
    } catch (error) {
        if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
            return res.status(401).json({ error: 'Token 無效或已過期' });
        }
        console.error('Fetch Projects Error:', error);
        res.status(500).json({ error: '獲取專案失敗' });
    }
});

// GET project cover (dynamic from first shot with lowest order)
app.get('/api/projects/:id/cover', async (req, res) => {
    try {
        const { id } = req.params;
        let firstShot = null;
        if (prisma.shot?.findFirst) {
            firstShot = await prisma.shot.findFirst({
                where: { projectId: id },
                orderBy: { order: 'asc' },
                select: { id: true, order: true, payload: true, updateAt: true }
            });
        } else if (prisma.project?.findUnique) {
            const proj = await prisma.project.findUnique({
                where: { id },
                include: { shots: true }
            });
            firstShot = projectLifecycle.getFirstShot(proj?.shots);
        }

        const rawImage = firstShot?.payload?.image;
        if (!rawImage || rawImage === '../icon/error.jpg' || rawImage === '/icon/error.jpg') {
            return res.status(404).send('Not Found');
        }

        if (storyboardImages.isBase64DataUri(rawImage)) {
            const matches = rawImage.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'private, max-age=300');
                return res.send(buffer);
            }
            return res.status(404).send('Not Found');
        }

        const resolvedUrl = await storyboardImages.resolveImageUrl(rawImage, {
            storageClient: getInjectedStorageClient()
        });
        if (!resolvedUrl) {
            return res.status(404).send('Not Found');
        }

        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.redirect(302, resolvedUrl);
    } catch (err) {
        console.error('Fetch Cover Error:', err);
        res.status(500).send('Server Error');
    }
});

// GET shot image (supports signed URL redirect, authenticated ?proxy=1 binary stream for PDF export, and legacy base64 stream + ?history=index)
app.get('/api/projects/:projectId/shots/:shotId/image', async (req, res) => {
    try {
        const { projectId, shotId } = req.params;
        const wantsProxy = req.query.proxy === '1' || req.query.proxy === 'true';

        if (wantsProxy) {
            const decoded = requireAuthUser(req, res);
            if (!decoded) return;
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true, authorId: true }
            });
            if (!project) return res.status(404).json({ error: '找不到專案' });
            if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限存取此專案圖片' });
        }

        const shot = await prisma.shot.findUnique({
            where: { id: shotId },
            select: { payload: true, projectId: true }
        });

        if (!shot || !shot.payload || shot.projectId !== projectId) {
            return res.status(404).send('Not Found');
        }

        const defaultBucket = storyboardImages.getBucketName();
        const pickShotImageSource = (obj) => {
            if (!obj || typeof obj !== 'object') return null;
            const assetRef = obj.imageAsset?.storageRef
                || (obj.imageAsset?.path ? `storage://${obj.imageAsset.bucket || defaultBucket}/${String(obj.imageAsset.path).replace(/^\/+/, '')}` : null)
                || obj.imageAsset?.url
                || null;
            const candidates = [obj.imageRef, assetRef, obj.image];
            for (const c of candidates) {
                if (typeof c !== 'string') continue;
                const t = c.trim();
                if (!t || t === '../icon/error.jpg' || t === '/icon/error.jpg') continue;
                if (t.startsWith('/api/')) continue;
                return t;
            }
            return null;
        };

        let imageSource = pickShotImageSource(shot.payload);
        if (req.query.history !== undefined) {
            const idx = Number.parseInt(req.query.history, 10);
            const hist = Array.isArray(shot.payload.imageHistory) ? shot.payload.imageHistory : [];
            if (!Number.isInteger(idx) || idx < 0 || idx >= hist.length) {
                return res.status(404).send('Not Found');
            }
            imageSource = pickShotImageSource(hist[idx]);
        }

        if (!imageSource || imageSource === '../icon/error.jpg' || imageSource === '/icon/error.jpg') {
            return res.status(404).send('Not Found');
        }

        if (storyboardImages.isBase64DataUri(imageSource)) {
            const matches = imageSource.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                const meta = storyboardImages.validateImageBuffer(buffer, contentType);
                res.setHeader('Content-Type', meta.mimeType);
                res.setHeader('Cache-Control', 'private, max-age=300');
                return res.send(buffer);
            }
            return res.status(404).send('Not Found');
        }

        if (wantsProxy) {
            const storageClient = getInjectedStorageClient();
            const parsed = storyboardImages.parseStorageRef(imageSource);
            if (!parsed) {
                return res.status(400).json({ error: '無法解析受信任的圖片儲存引用' });
            }
            if (!storyboardImages.isObjectPathOwnedByProject(parsed.objectPath, projectId)) {
                return res.status(403).json({ error: '圖片路徑不屬於此專案' });
            }
            try {
                const downloaded = await storyboardImages.downloadStorageObject(parsed.ref, {
                    projectId,
                    storageClient
                });
                const meta = storyboardImages.validateImageBuffer(downloaded.buffer);
                res.setHeader('Content-Type', meta.mimeType);
                res.setHeader('Cache-Control', 'private, max-age=300');
                return res.send(downloaded.buffer);
            } catch (downloadErr) {
                // Fallback: fetch from freshly resolved signed URL (still strictly bound to trusted parsed storageRef)
                const freshUrl = await storyboardImages.resolveImageUrl(parsed.ref, { storageClient });
                if (!freshUrl || !/^https?:\/\//i.test(freshUrl)) {
                    return res.status(downloadErr.status || 404).send('Not Found');
                }
                const upstream = await fetch(freshUrl, { signal: AbortSignal.timeout(15000) });
                if (!upstream.ok) return res.status(upstream.status === 404 ? 404 : 502).send('Image Fetch Failed');
                const buf = Buffer.from(await upstream.arrayBuffer());
                const meta = storyboardImages.validateImageBuffer(buf);
                res.setHeader('Content-Type', meta.mimeType);
                res.setHeader('Cache-Control', 'private, max-age=300');
                return res.send(buf);
            }
        }

        const resolvedUrl = await storyboardImages.resolveImageUrl(imageSource, {
            storageClient: getInjectedStorageClient()
        });
        if (!resolvedUrl) {
            return res.status(404).send('Not Found');
        }

        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.redirect(302, resolvedUrl);
    } catch (err) {
        console.error('Fetch Shot Image Error:', err);
        res.status(500).send('Server Error');
    }
});

// BATCH trash projects (for /projects multi-select; never bypasses trash)
app.post('/api/projects/batch/trash', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const result = await projectLifecycle.batchTrashProjects({
            prisma,
            authorId: decoded.id,
            projectIds: req.body?.projectIds
        });
        return res.status(result.status).json(result);
    } catch (error) {
        console.error('Batch Trash Projects Error:', error);
        res.status(500).json({ error: '批次移入回收桶失敗' });
    }
});

// BATCH restore projects (specific IDs or all trashed projects)
app.post('/api/projects/batch/restore', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const result = await projectLifecycle.batchRestoreProjects({
            prisma,
            authorId: decoded.id,
            projectIds: req.body?.projectIds,
            all: req.body?.all === true
        });
        return res.status(result.status).json(result);
    } catch (error) {
        console.error('Batch Restore Projects Error:', error);
        res.status(500).json({ error: '批次還原專案失敗' });
    }
});

// BATCH permanent delete projects (only trashed projects owned by user)
app.post('/api/projects/batch/permanent-delete', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const result = await projectLifecycle.batchPermanentDeleteProjects({
            prisma,
            authorId: decoded.id,
            projectIds: req.body?.projectIds,
            storageClient: getInjectedStorageClient()
        });
        return res.status(result.status).json(result);
    } catch (error) {
        console.error('Batch Permanent Delete Error:', error);
        res.status(500).json({ error: '批次永久刪除失敗' });
    }
});

// EMPTY trash (requires confirm: true)
app.post('/api/projects/trash/empty', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        if (req.body?.confirm !== true) {
            return res.status(400).json({ error: '請先確認清空資源回收桶（此操作無法復原）', code: 'CONFIRM_REQUIRED' });
        }
        const result = await projectLifecycle.emptyTrash({
            prisma,
            authorId: decoded.id,
            storageClient: getInjectedStorageClient()
        });
        return res.status(result.status).json(result);
    } catch (error) {
        console.error('Empty Trash Error:', error);
        res.status(500).json({ error: '清空資源回收桶失敗' });
    }
});

// INTERNAL CRON: 30-day automatic trash cleanup (protected by CRON_SECRET)
app.post('/api/internal/cron/cleanup-trash', async (req, res) => {
    try {
        const expectedSecret = process.env.CRON_SECRET;
        if (!expectedSecret) {
            return res.status(503).json({ error: '伺服器尚未設定 CRON_SECRET，自動清理端點已停用。', code: 'CRON_NOT_CONFIGURED' });
        }
        const auth = req.headers.authorization || '';
        const headerSecret = req.headers['x-cron-secret'] || (auth.startsWith('Bearer ') ? auth.slice(7) : '');
        if (!headerSecret || headerSecret !== expectedSecret) {
            return res.status(401).json({ error: '未授權的排程請求' });
        }
        const dryRun = req.body?.dryRun === true || req.query.dryRun === 'true';
        const batchSize = Number(req.body?.batchSize || req.query.batchSize || 20);
        const report = await projectLifecycle.runRetentionCleanup({
            prisma,
            storageClient: getInjectedStorageClient(),
            dryRun,
            batchSize
        });
        res.json({ ok: report.failed.length === 0, report });
    } catch (error) {
        console.error('Cron Cleanup Trash Error:', error);
        res.status(500).json({ error: '自動清理排程執行失敗' });
    }
});

// DELETE project (soft delete -> move to trash)
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const { id } = req.params;

        const project = await prisma.project.findUnique({ where: { id } });
        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限刪除此專案' });

        // Do not extend retention if project is already in trash with a deletedAt timestamp
        if (project.is_deleted && project.deletedAt) {
            return res.json({
                message: '專案已在回收桶中',
                deletedAt: new Date(project.deletedAt).toISOString()
            });
        }

        const deletedAt = project.deletedAt || new Date();
        await prisma.project.update({
            where: { id },
            data: { is_deleted: true, deletedAt }
        });

        res.json({
            message: '專案已成功移至回收桶',
            deletedAt: deletedAt.toISOString()
        });
    } catch (error) {
        console.error('Delete Project Error:', error);
        res.status(500).json({ error: '刪除專案失敗' });
    }
});

// DELETE project permanently (must be in trash & owned by user)
app.delete('/api/projects/:id/permanent', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const { id } = req.params;
        const result = await projectLifecycle.permanentlyDeleteProject({
            prisma,
            projectId: id,
            authorId: decoded.id,
            requireOwnership: true,
            reason: 'manual_permanent_delete',
            storageClient: getInjectedStorageClient()
        });
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error, code: result.code });
        }
        res.json({
            message: '專案已永久刪除',
            projectId: id,
            deletedStorageCount: result.deletedStorageCount || 0,
            skippedSharedCount: result.skippedSharedCount || 0
        });
    } catch (error) {
        console.error('Permanent Delete Project Error:', error);
        res.status(500).json({ error: '永久刪除專案失敗' });
    }
});

// POST restore project
app.post('/api/projects/:id/restore', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const { id } = req.params;

        const project = await prisma.project.findUnique({ where: { id } });
        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限還原此專案' });

        await prisma.project.update({
            where: { id },
            data: { is_deleted: false, deletedAt: null }
        });
        await projectLifecycle.cancelPendingCleanupJob(prisma, id);

        res.json({ message: '專案已成功還原' });
    } catch (error) {
        console.error('Restore Project Error:', error);
        res.status(500).json({ error: '還原專案失敗' });
    }
});

// PATCH update project (e.g. rename title, tags)
app.patch('/api/projects/:id', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const { id } = req.params;
        const { title, tags } = req.body;

        if (title === undefined && tags === undefined) {
            return res.status(400).json({ error: '請提供要更新的欄位' });
        }

        const project = await prisma.project.findUnique({ where: { id } });
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

// POST duplicate project (with independent Storage copy & dynamic cover from first shot)
app.post('/api/projects/:id/duplicate', async (req, res) => {
    let copiedStoragePaths = [];
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const { id } = req.params;

        const original = await prisma.project.findUnique({
            where: { id },
            include: { shots: true }
        });

        if (!original) return res.status(404).json({ error: '找不到專案' });
        if (original.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限複製此專案' });

        let shortId = generateShortId();
        let exists = await prisma.project.findUnique({ where: { shortId } });
        let attempts = 0;
        while (exists && attempts < 5) {
            shortId = generateShortId();
            exists = await prisma.project.findUnique({ where: { shortId } });
            attempts++;
        }

        const newProjectId = randomUUID();
        const duplicateTitle = `${original.title} (副本)`;
        const sourceShots = Array.isArray(original.shots) ? original.shots : [];
        const targetShotIdByOrder = new Map();
        for (const shot of sourceShots) {
            targetShotIdByOrder.set(shot.order, randomUUID());
        }

        const storageClient = getInjectedStorageClient();
        const { refMap, copiedPaths } = await storyboardImages.copyStorageObjectsForDuplicate({
            sourceShots,
            targetProjectId: newProjectId,
            targetShotIdByOrder,
            storageClient
        });
        copiedStoragePaths = copiedPaths;

        const newProject = await prisma.project.create({
            data: {
                id: newProjectId,
                shortId,
                authorId: decoded.id,
                title: duplicateTitle,
                style: original.style || '',
                ratio: original.ratio || '',
                cover: null,
                metadata: original.metadata || {},
                characters: original.characters || {},
                shots: {
                    create: sourceShots.map((shot) => ({
                        id: targetShotIdByOrder.get(shot.order),
                        order: shot.order,
                        title: shot.title || '',
                        camera: shot.camera || '',
                        duration: shot.duration || '3s',
                        payload: storyboardImages.rewriteShotPayloadWithRefMap(shot.payload || {}, refMap)
                    }))
                }
            },
            include: {
                shots: true
            }
        });

        const dynamicCover = await projectLifecycle.resolveProjectCover(newProject, { storageClient });
        const resolvedShots = await Promise.all((newProject.shots || []).map(async (s) => ({
            ...s,
            payload: await storyboardImages.resolveShotPayloadForResponse(s, newProject.id, { storageClient }),
            createAt: toTaipeiTZ(s.createAt),
            updateAt: toTaipeiTZ(s.updateAt)
        })));

        const formattedProject = {
            ...newProject,
            cover: dynamicCover,
            tags: (newProject.metadata && typeof newProject.metadata === 'object' && Array.isArray(newProject.metadata.tags)) ? newProject.metadata.tags : [],
            createAt: toTaipeiTZ(newProject.createAt),
            updatedAt: toTaipeiTZ(newProject.updatedAt),
            shots: resolvedShots
        };

        res.json({ message: '專案複製成功', project: formattedProject });
    } catch (error) {
        if (copiedStoragePaths.length > 0) {
            await storyboardImages.removeStorageObjects(copiedStoragePaths, {
                storageClient: getInjectedStorageClient()
            }).catch(() => {});
        }
        console.error('Duplicate Project Error:', error);
        res.status(error.status || 500).json({ error: error.message || '複製專案失敗', code: error.code });
    }
});

// ——————————————————————————————————————————————
// Shot 編輯與重新生成 API
// ——————————————————————————————————————————————

// 共用 Gemini 圖片生成 helper
async function runGeminiImageGeneration({ question, ratio }) {
    return (await generateImage(getGenAI(), { question, ratio })).image[0];
}

// POST 準備圖片 Signed Upload URL（前端直傳 Supabase Storage）
app.post('/api/projects/:projectId/shots/:shotId/image-upload', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const { projectId, shotId } = req.params;
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project || project.is_deleted) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限修改此專案' });
        const shot = await prisma.shot.findUnique({ where: { id: shotId } });
        if (!shot || shot.projectId !== projectId) return res.status(404).json({ error: '找不到鏡頭' });

        const prepared = await storyboardImages.createSignedUpload({
            projectId,
            shotId,
            contentType: req.body?.contentType,
            storageClient: getInjectedStorageClient()
        });
        res.json(prepared);
    } catch (error) {
        console.error('Create image upload URL error:', error);
        res.status(error.status || 500).json({
            error: error.message || '無法準備圖片上傳，請稍後重試。',
            code: error.code
        });
    }
});

// POST 後端驗證並上傳鏡頭圖片（供上傳/替換圖片或重試，嚴格禁止 Base64 寫入 DB）
app.post('/api/projects/:projectId/shots/:shotId/image', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const { projectId, shotId } = req.params;
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project || project.is_deleted) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限修改此專案' });
        const shot = await prisma.shot.findUnique({ where: { id: shotId } });
        if (!shot || shot.projectId !== projectId) return res.status(404).json({ error: '找不到鏡頭' });

        const { dataUri, prompt } = req.body || {};
        if (!dataUri || !storyboardImages.isBase64DataUri(dataUri)) {
            return res.status(400).json({ error: '請提供有效的圖片資料', code: 'INVALID_IMAGE_DATA' });
        }

        const parsed = storyboardImages.parseBase64DataUri(dataUri);
        const currentPayload = shot.payload && typeof shot.payload === 'object' ? shot.payload : {};
        const storageClient = getInjectedStorageClient();

        const uploaded = await storyboardImages.uploadImageBuffer({
            projectId,
            shotId,
            buffer: parsed.buffer,
            mimeType: parsed.mimeType,
            existingHistory: currentPayload.imageHistory,
            storageClient
        });

        let history = Array.isArray(currentPayload.imageHistory) ? [...currentPayload.imageHistory] : [];
        if (currentPayload.image && !storyboardImages.isBase64DataUri(currentPayload.image) && currentPayload.image !== '../icon/error.jpg') {
            const currentRef = storyboardImages.parseStorageRef(currentPayload.image)?.ref || currentPayload.image;
            if (!history.some(h => (h?.imageRef || h?.image) === currentRef)) {
                history.unshift({
                    version: history.length + 1,
                    image: currentRef,
                    imageRef: currentRef,
                    prompt: currentPayload.finalPrompt || '',
                    createdAt: new Date().toISOString()
                });
            }
        }
        if (!history.some(h => (h?.imageRef || h?.image) === uploaded.storageRef)) {
            history.unshift({
                version: history.length + 1,
                image: uploaded.storageRef,
                imageRef: uploaded.storageRef,
                prompt: typeof prompt === 'string' && prompt.trim() ? prompt.trim() : (currentPayload.finalPrompt || ''),
                sha256: uploaded.sha256,
                mimeType: uploaded.mimeType,
                size: uploaded.size,
                createdAt: new Date().toISOString()
            });
        }
        history = history.slice(0, 5);

        const updatedPayload = {
            ...currentPayload,
            image: uploaded.storageRef,
            imageRef: uploaded.storageRef,
            imageAsset: {
                bucket: uploaded.bucket,
                path: uploaded.objectPath,
                mimeType: uploaded.mimeType,
                size: uploaded.size,
                sha256: uploaded.sha256
            },
            imageStatus: 'succeeded',
            imageError: null,
            imageHistory: history
        };

        const updatedShot = await prisma.shot.update({
            where: { id: shotId },
            data: { payload: updatedPayload }
        });

        await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });

        const cleanPayload = await storyboardImages.resolveShotPayloadForResponse(updatedShot, projectId, { storageClient });
        res.json({
            message: '鏡頭圖片已成功上傳並儲存',
            storageRef: uploaded.storageRef,
            deduplicated: uploaded.deduplicated,
            shot: {
                ...updatedShot,
                payload: cleanPayload,
                createAt: toTaipeiTZ(updatedShot.createAt),
                updateAt: toTaipeiTZ(updatedShot.updateAt)
            }
        });
    } catch (error) {
        console.error('Upload Shot Image Error:', error);
        res.status(error.status || 500).json({
            error: error.message || '圖片上傳失敗，請稍後重試。',
            code: error.code || 'STORAGE_UPLOAD_FAILED'
        });
    }
});

app.patch('/api/projects/:projectId/shots/:shotId', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const { projectId, shotId } = req.params;

        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限修改此專案' });

        const shot = await prisma.shot.findUnique({ where: { id: shotId } });
        if (!shot || shot.projectId !== projectId) return res.status(404).json({ error: '找不到鏡頭' });

        const { title, camera, duration, order, payloadPatch } = req.body;
        const updateData = {};
        if (title !== undefined) updateData.title = String(title).trim();
        if (camera !== undefined) updateData.camera = String(camera).trim();
        if (duration !== undefined) updateData.duration = String(duration).trim();
        if (order !== undefined && Number.isInteger(Number(order)) && Number(order) >= 1) {
            updateData.order = Number(order);
        }

        if (payloadPatch && typeof payloadPatch === 'object') {
            storyboardImages.assertNoBase64InShotPayload(payloadPatch);

            const currentPayload = shot.payload || {};
            const allowedPayloadKeys = [
                'emotion', 'note', 'shotPrompt', 'finalPrompt', 'cameraDetails',
                'image', 'imageRef', 'imageAsset', 'imageHistory', 'imageStatus', 'imageError',
                'characters', 'dialogue', 'purpose', 'angle', 'sourceShot'
            ];
            const patchedPayload = { ...currentPayload };
            for (const key of allowedPayloadKeys) {
                if (payloadPatch[key] !== undefined) {
                    patchedPayload[key] = payloadPatch[key];
                }
            }

            // Normalize image / imageRef to permanent storage:// reference (never store expiring signed URLs or base64)
            const incomingImage = payloadPatch.imageRef !== undefined ? payloadPatch.imageRef : payloadPatch.image;
            if (incomingImage !== undefined) {
                const normalizedRef = storyboardImages.normalizeIncomingImageRef(incomingImage, {
                    projectId,
                    shotId,
                    existingPayload: currentPayload
                });
                patchedPayload.image = normalizedRef;
                if (normalizedRef && normalizedRef.startsWith('storage://')) {
                    patchedPayload.imageRef = normalizedRef;
                }
            }

            if (payloadPatch.imageHistory !== undefined) {
                patchedPayload.imageHistory = storyboardImages.normalizeImageHistoryForStorage(payloadPatch.imageHistory, {
                    projectId,
                    shotId,
                    existingPayload: currentPayload
                });
            }

            storyboardImages.assertNoBase64InShotPayload(patchedPayload);
            updateData.payload = stripNullBytes(patchedPayload);
        }
        if (updateData.title !== undefined) updateData.title = stripNullBytes(updateData.title);
        if (updateData.camera !== undefined) updateData.camera = stripNullBytes(updateData.camera);
        if (updateData.duration !== undefined) updateData.duration = stripNullBytes(updateData.duration);

        const updatedShot = await prisma.shot.update({
            where: { id: shotId },
            data: updateData
        });

        // Touch Project.updatedAt only — cover is dynamically derived from first shot, never duplicated to Project.cover
        await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });

        const storageClient = getInjectedStorageClient();
        const cleanPayload = await storyboardImages.resolveShotPayloadForResponse(updatedShot, projectId, { storageClient });

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
        if (error.status && error.status >= 400 && error.status < 500) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error('Update Shot Error:', error);
        res.status(500).json({ error: '更新鏡頭失敗' });
    }
});

// POST 重新生成單一鏡頭圖片（強制上傳 Supabase Storage，絕不將 Base64 寫入 DB）
app.post('/api/projects/:projectId/shots/:shotId/regenerate', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;
        const { projectId, shotId } = req.params;

        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限修改此專案' });

        const shot = await prisma.shot.findUnique({ where: { id: shotId } });
        if (!shot || shot.projectId !== projectId) return res.status(404).json({ error: '找不到鏡頭' });

        const prompt = req.body.prompt
            || (shot.payload && shot.payload.finalPrompt)
            || (shot.payload && shot.payload.shotPrompt)
            || shot.title
            || '';

        if (!prompt) {
            return res.status(400).json({ error: '缺少生圖提示詞' });
        }

        const provider = await resolveRequestProvider(req, req.body?.provider);
        if (!enforceSiteGeminiLimit(req, res, provider)) return;
        const imageResult = await aiRouter.generateImage({
            provider,
            question: prompt,
            ratio: project.ratio
        });
        const newImageDataUri = imageResult.image[0];

        // Decode, validate, and upload to Supabase Storage BEFORE touching PostgreSQL.
        // If Storage upload fails, original saved image remains untouched and we return an error.
        const currentPayload = shot.payload || {};
        const parsedImage = storyboardImages.parseBase64DataUri(newImageDataUri);
        const storageClient = getInjectedStorageClient();
        const uploaded = await storyboardImages.uploadImageBuffer({
            projectId,
            shotId,
            buffer: parsedImage.buffer,
            mimeType: parsedImage.mimeType,
            existingHistory: currentPayload.imageHistory,
            storageClient
        });

        // Build imageHistory (max 5 versions, all permanent storage refs)
        let history = Array.isArray(currentPayload.imageHistory) ? [...currentPayload.imageHistory] : [];
        if (currentPayload.image && !storyboardImages.isBase64DataUri(currentPayload.image) && currentPayload.image !== '../icon/error.jpg') {
            const currentRef = storyboardImages.parseStorageRef(currentPayload.image)?.ref || currentPayload.image;
            if (!history.some(h => (h?.imageRef || h?.image) === currentRef)) {
                history.unshift({
                    version: history.length + 1,
                    image: currentRef,
                    imageRef: currentRef,
                    prompt: currentPayload.finalPrompt || '',
                    createdAt: new Date().toISOString()
                });
            }
        }
        const effectivePrompt = req.body.prompt ? prompt : (currentPayload.finalPrompt || prompt);
        history.unshift({
            version: history.length + 1,
            image: uploaded.storageRef,
            imageRef: uploaded.storageRef,
            prompt: effectivePrompt,
            sha256: uploaded.sha256,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
            createdAt: new Date().toISOString()
        });
        // Deduplicate by storageRef while keeping newest order, max 5
        const seenHistory = new Set();
        history = history.filter(item => {
            const key = item?.imageRef || item?.image;
            if (!key || seenHistory.has(key)) return false;
            seenHistory.add(key);
            return true;
        }).slice(0, 5);

        const updatedPayload = {
            ...currentPayload,
            image: uploaded.storageRef,
            imageRef: uploaded.storageRef,
            imageAsset: {
                bucket: uploaded.bucket,
                path: uploaded.objectPath,
                mimeType: uploaded.mimeType,
                size: uploaded.size,
                sha256: uploaded.sha256
            },
            imageStatus: 'succeeded',
            imageError: null,
            finalPrompt: effectivePrompt,
            imageHistory: history
        };

        const updatedShot = await prisma.shot.update({
            where: { id: shotId },
            data: { payload: updatedPayload }
        });

        // Touch Project.updatedAt only (cover is derived dynamically from first shot)
        await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });

        const cleanPayload = await storyboardImages.resolveShotPayloadForResponse(updatedShot, projectId, { storageClient });

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
        if (error.code && (error.code.startsWith('STORAGE_') || error.code.startsWith('INVALID_IMAGE') || error.code === 'UNSUPPORTED_IMAGE_FORMAT' || error.code === 'IMAGE_TOO_LARGE')) {
            return res.status(error.status || 502).json({
                error: error.message || '圖片上傳至儲存空間失敗，已保留原有圖片，請稍後重試。',
                code: error.code
            });
        }
        const provider = req.body?.provider === 'openai' ? 'openai' : 'gemini';
        const failure = reportAIError(error, { task: 'regenerate-image', provider, model: aiRouter.getModel(provider, 'image') || undefined });
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

        const provider = await resolveRequestProvider(req, req.body?.provider);
        if (!enforceSiteGeminiLimit(req, res, provider)) return;
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

        const optimized = await aiRouter.optimizePrompt({
            provider,
            promptGenRequest,
            systemInstruction: 'Return only the complete English image prompt. No headings, introduction, markdown, JSON, surrounding quotes or explanations.'
        });

        res.json({
            prompt: optimized.prompt,
            provider: optimized.provider
        });
    } catch (error) {
        const provider = req.body?.provider === 'openai' ? 'openai' : 'gemini';
        const failure = reportAIError(error, { task: 'optimize-prompt', provider, model: aiRouter.getModel(provider, 'fast') || undefined });
        res.status(failure.status).json({ error: failure.message, code: failure.code });
    }
});

// GET single project (with shots and safe author projection)
app.get('/api/projects/:id', async (req, res) => {
    try {
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;

        const id = req.params.id;
        const project = await prisma.project.findUnique({
            where: { id },
            include: {
                shots: { orderBy: { order: 'asc' } },
                author: { select: projectLifecycle.SAFE_AUTHOR_SELECT }
            }
        });

        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限存取此專案' });

        const storageClient = getInjectedStorageClient();
        const dynamicCover = await projectLifecycle.resolveProjectCover(project, { storageClient });
        const retention = projectLifecycle.computeTrashRetention(project);

        const resolvedShots = await Promise.all((project.shots || []).map(async (s) => ({
            ...s,
            payload: await storyboardImages.resolveShotPayloadForResponse(s, project.id, { storageClient }),
            createAt: toTaipeiTZ(s.createAt),
            updateAt: toTaipeiTZ(s.updateAt)
        })));

        // Defensive projection in case a test mock ignored `select` and returned full user fields
        const safeAuthor = project.author ? {
            id: project.author.id,
            name: project.author.name,
            email: project.author.email,
            image: project.author.image,
            plan: project.author.plan,
            aiProvider: project.author.aiProvider || 'gemini',
            createAt: toTaipeiTZ(project.author.createAt)
        } : null;

        const formattedProject = {
            ...project,
            tags: (project.metadata && typeof project.metadata === 'object' && Array.isArray(project.metadata.tags)) ? project.metadata.tags : [],
            cover: dynamicCover,
            deletedAt: project.deletedAt ? new Date(project.deletedAt).toISOString() : null,
            retention,
            createAt: toTaipeiTZ(project.createAt),
            updatedAt: toTaipeiTZ(project.updatedAt),
            shots: resolvedShots,
            author: safeAuthor
        };

        res.json({ project: formattedProject });
    } catch (error) {
        console.error('Fetch Project Error:', error);
        res.status(500).json({ error: '獲取專案失敗' });
    }
});

function stripNullBytes(value) {
    if (typeof value === 'string') return value.replace(/\u0000/g, '');
    if (Array.isArray(value)) return value.map(stripNullBytes);
    if (value && typeof value === 'object') {
        const cleaned = {};
        for (const [key, val] of Object.entries(value)) {
            cleaned[key.replace(/\u0000/g, '')] = stripNullBytes(val);
        }
        return cleaned;
    }
    return value;
}

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
        const decoded = requireAuthUser(req, res);
        if (!decoded) return;

        const { title, style, ratio, metadata, characters, shots } = req.body;

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

        // Enforce no Base64 images written to PostgreSQL
        const incomingShots = Array.isArray(shots) ? shots : [];
        for (const shot of incomingShots) {
            storyboardImages.assertNoBase64InShotPayload(shot?.payload);
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
                title: stripNullBytes(title),
                style: stripNullBytes(style || ''),
                ratio: stripNullBytes(ratio || ''),
                cover: null,
                metadata: stripNullBytes(metadata || {}),
                characters: stripNullBytes(characters || {}),
                shots: {
                    create: incomingShots.map((shot) => ({
                        order: shot.order,
                        title: stripNullBytes(shot.title || ''),
                        camera: stripNullBytes(shot.camera || ''),
                        duration: stripNullBytes(shot.duration || '3s'),
                        payload: stripNullBytes(shot.payload || {})
                    }))
                }
            },
            include: {
                shots: true
            }
        });

        const storageClient = getInjectedStorageClient();
        const dynamicCover = await projectLifecycle.resolveProjectCover(project, { storageClient });
        const resolvedShots = await Promise.all((project.shots || []).map(async (s) => ({
            ...s,
            payload: await storyboardImages.resolveShotPayloadForResponse(s, project.id, { storageClient }),
            createAt: toTaipeiTZ(s.createAt),
            updateAt: toTaipeiTZ(s.updateAt)
        })));

        const formattedProject = {
            ...project,
            cover: dynamicCover,
            createAt: toTaipeiTZ(project.createAt),
            updatedAt: toTaipeiTZ(project.updatedAt),
            shots: resolvedShots
        };

        res.json({ message: '專案儲存成功', project: formattedProject });
    } catch (error) {
        if (error.status && error.status >= 400 && error.status < 500) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
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
    const structured = task === 'story' && req.body.contract === 'freeform-v2';
    if (structured && ![15, 30, 45, 60].includes(req.body.duration)) return res.status(400).json({ error: '無效的自由分鏡時長' });
    let sourceIds = [];
    if (structured && req.body.templateId) {
        try {
            const record = await prisma.template.findUnique({ where: { id: String(req.body.templateId).slice(0, 200) } });
            if (!record) return res.status(404).json({ error: '找不到所選模板。' });
            sourceIds = require('./public/js/features/freeform-storyboard').nodes(toCatalogTemplate(record)).map(node => node.id);
        } catch { return res.status(503).json({ error: '模板暫時無法載入。' }); }
    }
    const summaries = task !== 'image' && req.body.includeThoughts === true;
    const requestId = typeof req.body.requestId === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(req.body.requestId)
        ? req.body.requestId : require('node:crypto').randomUUID();
    const started = Date.now();
    let provider = 'gemini';
    try {
        provider = await resolveRequestProvider(req, req.body?.provider);
        if (!enforceSiteGeminiLimit(req, res, provider)) return;
        const result = task === 'image'
            ? await aiRouter.generateImage({ provider, question, ratio, requestId })
            : await aiRouter.generateText({
                provider,
                task,
                prompt: question,
                includeThoughts: summaries,
                requestId,
                schemaName: structured ? 'freeform_storyboard' : undefined,
                responseMimeType: structured ? 'application/json' : undefined,
                responseSchema: structured ? require('./public/js/features/freeform-storyboard').schema(req.body.duration, sourceIds) : undefined
            });
        res.json(result);
    } catch (error) {
        const stage = provider === 'openai' ? 'call_openai' : 'call_vertex';
        const failure = reportAIError(error, { requestId, task, provider: provider === 'openai' ? 'openai' : 'vertex-ai', model: aiRouter.getModel(provider, task) || undefined,
            stage, contract: structured ? 'freeform-v2' : 'legacy', elapsedMs: Date.now() - started });
        if (failure.status === 429 && !res.get('Retry-After')) res.set('Retry-After', '60');
        res.status(failure.status).json({ error: 'Internal Server Error', details: failure.message, code: failure.code, provider,
            diagnostics: { requestId, stage, upstreamStatus: Number(error?.status || error?.error?.code) || null,
                ...require('./lib/ai/generation').requestIssue(error) } });
    }
});

const { templateIndex, createRecommendationHandler } = require('./lib/template-recommendations');
let templateIndexCache = null, templateIndexPending = null;
async function loadTemplateIndex() {
    if (templateIndexCache?.expires > Date.now()) return templateIndexCache.items;
    if (!templateIndexPending) templateIndexPending = prisma.template.findMany({ orderBy: { createAt: 'desc' } })
        .then(records => {
            const items = records.map(record => templateIndex(toCatalogTemplate(record)));
            templateIndexCache = { items, expires: Date.now() + 60000 }; return items;
        }).finally(() => { templateIndexPending = null; });
    return templateIndexPending;
}
app.post('/api/templates/recommend', createRecommendationHandler({ loadIndex: loadTemplateIndex,
    generateText: options => aiRouter.generateText(options), resolveProvider: resolveRequestProvider }));
app.get('/api/templates/:id', async (req, res) => {
    try {
        const record = await prisma.template.findUnique({ where: { id: req.params.id } });
        if (!record) return res.status(404).json({ error: '找不到此模板。' });
        res.json(toCatalogTemplate(record));
    } catch { res.status(503).json({ error: '模板暫時無法載入。' }); }
});
app.get('/api/get-templates', async (req, res) => {
    try {
        if (req.query.view === 'index') {
            const index = await loadTemplateIndex();
            const filtered = require('./public/js/components/template-presentation').filter(index, req.query);
            const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
            const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
            return res.json({ items: filtered.slice(offset, offset + limit), total: filtered.length });
        }
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
        templateIndexCache = null;
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

// SPA catch-all — redirect routes to main.html
const spaRoutes = ['/discovery', '/discovery/settings', '/dashboard', '/projects', '/login', '/register', '/generate', '/analyze', '/analysis', '/history', '/template', '/template/:id', '/project/:id'];
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
