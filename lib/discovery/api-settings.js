const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getModel } = require('../ai/model-config');
const { vertexAvailable } = require('../google-credentials');

const COOKIE_NAME = 'discovery_api_settings';
const MAX_AGE = 90 * 24 * 60 * 60;
const PROVIDER_FIELD = Object.freeze({
    gemini: 'geminiApiKey',
    youtube: 'youtubeApiKey',
    openai: 'openaiApiKey'
});

function isSiteServiceFlagEnabled(env = process.env, flagName) {
    const raw = String(env?.[flagName] ?? '').trim().toLowerCase();
    return !['false', '0', 'disabled', 'no', 'off'].includes(raw);
}

function isSiteGeminiEnabled(env = process.env) {
    return isSiteServiceFlagEnabled(env, 'SITE_GEMINI_ENABLED') && vertexAvailable(env);
}

function isSiteYouTubeEnabled(env = process.env) {
    return isSiteServiceFlagEnabled(env, 'SITE_YOUTUBE_ENABLED') && Boolean(env?.YOUTUBE_API_KEY?.trim());
}

class ApiSettings {
    constructor({ env = process.env, secretPath = path.join(process.cwd(), '.private', 'discovery-settings.key') } = {}) {
        this.env = env;
        this.secretPath = secretPath;
    }

    encryptionKey() {
        if (this.key) return this.key;
        if (this.env.DISCOVERY_SETTINGS_SECRET) {
            if (this.env.DISCOVERY_SETTINGS_SECRET.length < 32) throw new Error('DISCOVERY_SETTINGS_SECRET 至少需要 32 個字元。');
            this.key = crypto.createHash('sha256').update(this.env.DISCOVERY_SETTINGS_SECRET).digest();
        } else {
            if (this.env.VERCEL) throw new Error('請先在部署環境設定至少 32 字元的 DISCOVERY_SETTINGS_SECRET，才能儲存金鑰。');
            fs.mkdirSync(path.dirname(this.secretPath), { recursive: true });
            try { fs.writeFileSync(this.secretPath, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); }
            catch (error) { if (error.code !== 'EEXIST') throw new Error('無法儲存加密設定，請檢查伺服器設定目錄權限。'); }
            this.key = fs.readFileSync(this.secretPath);
        }
        if (this.key.length !== 32) throw new Error('API 設定加密金鑰無效。');
        return this.key;
    }

    read(req) {
        const ownerId = req.apiSettingsUserId;
        if (!ownerId) return {};
        const name = this.cookieName(ownerId);
        const cookie = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
        if (!cookie) return {};
        try {
            const raw = cookie.slice(name.length + 1);
            if (raw.length > 3000) return {};
            const bytes = Buffer.from(raw, 'base64url');
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey(), bytes.subarray(0, 12));
            decipher.setAAD(Buffer.from(String(ownerId)));
            decipher.setAuthTag(bytes.subarray(12, 28));
            const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
            if (data.ownerId !== ownerId || !Number.isFinite(data.expiresAt) || data.expiresAt < Date.now()) return {};
            return data;
        } catch { return {}; }
    }

    cookieName(ownerId) {
        return COOKIE_NAME + '_' + crypto.createHash('sha256').update(String(ownerId)).digest('hex').slice(0, 24);
    }

    write(res, data, secure, ownerId) {
        if (!ownerId) throw new Error('請先登入後再儲存 API 金鑰。');
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
        cipher.setAAD(Buffer.from(String(ownerId)));
        const encrypted = Buffer.concat([cipher.update(JSON.stringify({ ...data, ownerId, expiresAt: Date.now() + MAX_AGE * 1000 })), cipher.final()]);
        const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
        res.cookie(this.cookieName(ownerId), value, { httpOnly: true, sameSite: 'strict', secure, path: '/api', maxAge: MAX_AGE * 1000 });
        res.clearCookie?.(COOKIE_NAME, { path: '/api' });
        res.clearCookie?.(COOKIE_NAME, { path: '/api/discovery' });
    }

    effective(saved = {}) {
        const siteGeminiAvailable = isSiteGeminiEnabled(this.env);
        const siteYouTubeAvailable = isSiteYouTubeEnabled(this.env);
        const hasPersonalOpenaiKey = Boolean(saved.openaiApiKey);
        const hasPersonalYoutubeKey = Boolean(saved.youtubeApiKey);
        const hasPersonalGeminiKey = Boolean(saved.geminiApiKey);
        return {
            openaiApiKey: saved.openaiApiKey || '',
            youtubeApiKey: saved.youtubeApiKey || (siteYouTubeAvailable ? this.env.YOUTUBE_API_KEY.trim() : ''),
            geminiApiKey: saved.geminiApiKey || '',
            vertexAvailable: Boolean(!hasPersonalGeminiKey && siteGeminiAvailable),
            hasPersonalOpenaiKey,
            hasPersonalYoutubeKey,
            hasPersonalGeminiKey,
            siteGeminiAvailable,
            siteYouTubeAvailable
        };
    }

    status(saved = {}) {
        const keys = this.effective(saved);
        const youtube = Boolean(keys.youtubeApiKey);
        const gemini = Boolean(keys.geminiApiKey || keys.vertexAvailable);
        const openai = Boolean(keys.openaiApiKey);
        return {
            configured: youtube && gemini,
            savedAt: saved.savedAt || null,
            openai: {
                configured: openai,
                personalConfigured: keys.hasPersonalOpenaiKey,
                siteAvailable: false,
                source: keys.hasPersonalOpenaiKey ? 'browser' : 'none'
            },
            youtube: {
                configured: youtube,
                personalConfigured: keys.hasPersonalYoutubeKey,
                siteAvailable: keys.siteYouTubeAvailable,
                source: keys.hasPersonalYoutubeKey ? 'browser' : youtube ? 'server' : 'none'
            },
            gemini: {
                configured: gemini,
                personalConfigured: keys.hasPersonalGeminiKey,
                siteAvailable: keys.siteGeminiAvailable,
                source: keys.hasPersonalGeminiKey ? 'browser' : gemini ? 'server' : 'none',
                mode: keys.geminiApiKey ? 'api-key' : keys.vertexAvailable ? 'vertex' : 'none',
                provider: keys.geminiApiKey ? 'gemini-developer-api' : keys.vertexAvailable ? 'vertex-ai' : 'none',
                model: getModel('discovery', this.env)
            }
        };
    }

    clear(saved = {}, provider) {
        const field = PROVIDER_FIELD[provider];
        if (!field) throw new Error('不支援的 API 服務類型。');
        const next = { ...saved };
        delete next[field];
        return next;
    }

    merge(saved, body) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('設定格式無效。');
        const next = { ...saved };
        for (const field of ['youtubeApiKey', 'geminiApiKey', 'openaiApiKey']) {
            if (body[field] === undefined || body[field] === '') continue;
            if (typeof body[field] !== 'string' || !/^[A-Za-z0-9._:+/=-]{20,400}$/.test(body[field].trim())) {
                throw new Error(`${field === 'youtubeApiKey' ? 'YouTube' : field === 'openaiApiKey' ? 'OpenAI' : 'Gemini'} API Key 格式不正確，請貼上完整金鑰。`);
            }
            next[field] = body[field].trim();
        }
        // Providers can be configured independently; discovery still requires YouTube + Gemini.
        return next;
    }
}

module.exports = { ApiSettings, COOKIE_NAME, isSiteGeminiEnabled, isSiteYouTubeEnabled };
