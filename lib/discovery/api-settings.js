const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const COOKIE_NAME = 'discovery_api_settings';
const MAX_AGE = 90 * 24 * 60 * 60;

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
        const cookie = String(req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE_NAME}=`));
        if (!cookie) return {};
        try {
            const raw = cookie.slice(COOKIE_NAME.length + 1);
            if (raw.length > 3000) return {};
            const bytes = Buffer.from(raw, 'base64url');
            const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey(), bytes.subarray(0, 12));
            decipher.setAuthTag(bytes.subarray(12, 28));
            const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
            if (!Number.isFinite(data.expiresAt) || data.expiresAt < Date.now()) return {};
            return data;
        } catch { return {}; }
    }

    write(res, data, secure) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
        const encrypted = Buffer.concat([cipher.update(JSON.stringify({ ...data, expiresAt: Date.now() + MAX_AGE * 1000 })), cipher.final()]);
        const value = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
        res.cookie(COOKIE_NAME, value, { httpOnly: true, sameSite: 'strict', secure, path: '/api/discovery', maxAge: MAX_AGE * 1000 });
    }

    effective(saved = {}) {
        const rawCred = this.env.GOOGLE_APPLICATION_CREDENTIALS;
        const credPath = rawCred ? rawCred.trim().replace(/^(["'])(.*)\1$/, '$2') : '';
        const fallbackCred = path.join(process.cwd(), 'application_default_credentials.json');
        const hasCredentials = Boolean(
            (credPath && fs.existsSync(credPath)) ||
            fs.existsSync(fallbackCred)
        );
        const vertexAvailable = Boolean(this.env.GOOGLE_CLOUD_PROJECT_ID &&
            (this.env.GCP_SERVICE_ACCOUNT_BASE64 || hasCredentials));
        return {
            youtubeApiKey: this.env.YOUTUBE_API_KEY || saved.youtubeApiKey || '',
            geminiApiKey: saved.geminiApiKey || this.env.GEMINI_API_KEY || this.env.GOOGLE_API_KEY || '',
            vertexAvailable
        };
    }

    status(saved = {}) {
        const keys = this.effective(saved);
        const youtube = Boolean(keys.youtubeApiKey);
        const gemini = Boolean(keys.geminiApiKey || keys.vertexAvailable);
        return {
            configured: youtube && gemini,
            savedAt: saved.savedAt || null,
            youtube: {
                configured: youtube,
                source: this.env.YOUTUBE_API_KEY ? 'server' : (saved.youtubeApiKey ? 'browser' : 'none')
            },
            gemini: {
                configured: gemini,
                source: keys.vertexAvailable ? 'server' : (saved.geminiApiKey ? 'browser' : (keys.geminiApiKey ? 'server' : 'none')),
                mode: keys.vertexAvailable ? 'vertex' : (keys.geminiApiKey ? 'api-key' : 'none')
            }
        };
    }

    merge(saved, body) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('設定格式無效。');
        const next = { ...saved };
        for (const field of ['youtubeApiKey', 'geminiApiKey']) {
            if (body[field] === undefined || body[field] === '') continue;
            if (typeof body[field] !== 'string' || !/^[A-Za-z0-9_-]{20,200}$/.test(body[field].trim())) {
                throw new Error(`${field === 'youtubeApiKey' ? 'YouTube' : 'Gemini'} API Key 格式不正確，請貼上完整金鑰。`);
            }
            next[field] = body[field].trim();
        }
        if (!this.status(next).configured) throw new Error('請完成 YouTube 與 Gemini 的 API 設定。');
        return next;
    }
}

module.exports = { ApiSettings, COOKIE_NAME };
