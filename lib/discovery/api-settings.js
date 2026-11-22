const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { getModel } = require('../ai/model-config');
const { vertexAvailable } = require('../google-credentials');
const { ApiKeyCipher } = require('../security/api-key-cipher');

const COOKIE_NAME = 'discovery_api_settings';
const PROVIDER_FIELD = Object.freeze({
    gemini: 'geminiApiKey',
    youtube: 'youtubeApiKey',
    openai: 'openaiApiKey'
});
const FIELD_PROVIDER = Object.freeze({
    geminiApiKey: 'gemini',
    youtubeApiKey: 'youtube',
    openaiApiKey: 'openai'
});
const VALID_PROVIDERS = Object.freeze(['gemini', 'youtube', 'openai']);

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
    constructor({ env = process.env, prisma = null, secretPath = path.join(process.cwd(), '.private', 'discovery-settings.key') } = {}) {
        this.env = env;
        this.prisma = prisma;
        this.secretPath = secretPath;
        this.cipher = new ApiKeyCipher({ env });
    }

    legacyCookieEncryptionKey() {
        if (this.legacyKey) return this.legacyKey;
        if (this.env.DISCOVERY_SETTINGS_SECRET) {
            if (this.env.DISCOVERY_SETTINGS_SECRET.length < 32) return null;
            this.legacyKey = crypto.createHash('sha256').update(this.env.DISCOVERY_SETTINGS_SECRET).digest();
            return this.legacyKey;
        }
        if (!this.env.VERCEL && fs.existsSync(this.secretPath)) {
            const key = fs.readFileSync(this.secretPath);
            if (key.length === 32) {
                this.legacyKey = key;
                return this.legacyKey;
            }
        }
        return null;
    }

    cookieName(ownerId) {
        return COOKIE_NAME + '_' + crypto.createHash('sha256').update(String(ownerId)).digest('hex').slice(0, 24);
    }

    readLegacyCookie(req) {
        const ownerId = req?.apiSettingsUserId;
        if (!ownerId) return {};
        const name = this.cookieName(ownerId);
        const cookie = String(req.headers?.cookie || '')
            .split(';')
            .map(item => item.trim())
            .find(item => item.startsWith(`${name}=`));
        if (!cookie) return {};
        const key = this.legacyCookieEncryptionKey();
        if (!key) return {};
        try {
            const raw = cookie.slice(name.length + 1);
            if (raw.length > 3000) return {};
            const bytes = Buffer.from(raw, 'base64url');
            if (bytes.length <= 28) return {};
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
            decipher.setAAD(Buffer.from(String(ownerId)));
            decipher.setAuthTag(bytes.subarray(12, 28));
            const data = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
            if (data.ownerId !== ownerId || !Number.isFinite(data.expiresAt) || data.expiresAt < Date.now()) return {};
            return data;
        } catch {
            return {};
        }
    }

    clearLegacyCookie(res, ownerId) {
        if (!res?.clearCookie) return;
        if (ownerId) {
            res.clearCookie(this.cookieName(ownerId), { path: '/api' });
        }
        res.clearCookie(COOKIE_NAME, { path: '/api' });
        res.clearCookie(COOKIE_NAME, { path: '/api/discovery' });
    }

    legacyMigrationInfo(req, dbSaved = {}) {
        const legacy = this.readLegacyCookie(req);
        const providers = VALID_PROVIDERS.filter(provider => {
            const field = PROVIDER_FIELD[provider];
            return Boolean(legacy[field]) && !dbSaved[field];
        });
        return {
            available: providers.length > 0,
            providers
        };
    }

    async readFromDb(userId, prismaClient = this.prisma) {
        if (!userId || !prismaClient?.userApiCredential?.findMany) return {};
        const rows = await prismaClient.userApiCredential.findMany({
            where: { userId: String(userId) }
        });
        if (!Array.isArray(rows) || rows.length === 0) return {};

        const saved = {};
        let latestUpdatedAt = 0;
        for (const row of rows) {
            const field = PROVIDER_FIELD[row.provider];
            if (!field) continue;
            const plaintext = this.cipher.decrypt(row, { userId: String(userId), provider: row.provider });
            saved[field] = plaintext;
            const updatedMs = row.updatedAt ? new Date(row.updatedAt).getTime() : 0;
            if (Number.isFinite(updatedMs) && updatedMs > latestUpdatedAt) {
                latestUpdatedAt = updatedMs;
            }
        }
        if (latestUpdatedAt > 0) {
            saved.savedAt = new Date(latestUpdatedAt).toISOString();
        }
        return saved;
    }

    async saveToDb(userId, updates = {}, prismaClient = this.prisma) {
        if (!userId) throw new Error('請先登入後再儲存 API 金鑰。');
        if (!prismaClient?.userApiCredential?.upsert) {
            throw new Error('資料庫憑證儲存服務尚未就緒。');
        }
        const entries = Object.entries(updates)
            .filter(([field, value]) => FIELD_PROVIDER[field] && typeof value === 'string' && value.trim() !== '');
        if (entries.length === 0) return;

        // Fail closed before any DB write if server encryption secret is missing or invalid.
        if (!this.cipher.hasValidSecret()) {
            throw new Error('伺服器尚未正確設定 API_KEYS_ENCRYPTION_SECRET（至少需要 32 個字元），無法儲存 API 金鑰。');
        }

        const operations = entries.map(([field, rawValue]) => {
            const provider = FIELD_PROVIDER[field];
            const encrypted = this.cipher.encrypt(rawValue.trim(), { userId: String(userId), provider });
            return {
                provider,
                encrypted
            };
        });

        const runUpsert = async client => {
            for (const { provider, encrypted } of operations) {
                await client.userApiCredential.upsert({
                    where: {
                        userId_provider: {
                            userId: String(userId),
                            provider
                        }
                    },
                    create: {
                        userId: String(userId),
                        provider,
                        encryptedKey: encrypted.encryptedKey,
                        iv: encrypted.iv,
                        authTag: encrypted.authTag,
                        keyVersion: encrypted.keyVersion
                    },
                    update: {
                        encryptedKey: encrypted.encryptedKey,
                        iv: encrypted.iv,
                        authTag: encrypted.authTag,
                        keyVersion: encrypted.keyVersion
                    }
                });
            }
        };

        if (typeof prismaClient.$transaction === 'function') {
            await prismaClient.$transaction(async tx => {
                if (tx?.userApiCredential?.upsert) {
                    await runUpsert(tx);
                } else {
                    await runUpsert(prismaClient);
                }
            });
        } else {
            await runUpsert(prismaClient);
        }
    }

    async deleteFromDb(userId, provider, prismaClient = this.prisma) {
        if (!userId) throw new Error('請先登入後再解除綁定 API 金鑰。');
        if (!VALID_PROVIDERS.includes(provider)) throw new Error('不支援的 API 服務類型。');
        if (!prismaClient?.userApiCredential?.deleteMany) {
            throw new Error('資料庫憑證儲存服務尚未就緒。');
        }
        await prismaClient.userApiCredential.deleteMany({
            where: {
                userId: String(userId),
                provider
            }
        });
    }

    extractUpdates(body) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('設定格式無效。');
        const updates = {};
        for (const field of ['youtubeApiKey', 'geminiApiKey', 'openaiApiKey']) {
            if (body[field] === undefined || body[field] === '') continue;
            if (typeof body[field] !== 'string' || !/^[A-Za-z0-9._:+/=-]{20,400}$/.test(body[field].trim())) {
                throw new Error(`${field === 'youtubeApiKey' ? 'YouTube' : field === 'openaiApiKey' ? 'OpenAI' : 'Gemini'} API Key 格式不正確，請貼上完整金鑰。`);
            }
            updates[field] = body[field].trim();
        }
        return updates;
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

    status(saved = {}, { legacyMigration } = {}) {
        const keys = this.effective(saved);
        const youtube = Boolean(keys.youtubeApiKey);
        const gemini = Boolean(keys.geminiApiKey || keys.vertexAvailable);
        const openai = Boolean(keys.openaiApiKey);
        return {
            configured: youtube && gemini,
            savedAt: saved.savedAt || null,
            ...(legacyMigration ? { legacyMigration } : {}),
            openai: {
                configured: openai,
                personalConfigured: keys.hasPersonalOpenaiKey,
                siteAvailable: false,
                source: keys.hasPersonalOpenaiKey ? 'account' : 'none'
            },
            youtube: {
                configured: youtube,
                personalConfigured: keys.hasPersonalYoutubeKey,
                siteAvailable: keys.siteYouTubeAvailable,
                source: keys.hasPersonalYoutubeKey ? 'account' : youtube ? 'server' : 'none'
            },
            gemini: {
                configured: gemini,
                personalConfigured: keys.hasPersonalGeminiKey,
                siteAvailable: keys.siteGeminiAvailable,
                source: keys.hasPersonalGeminiKey ? 'account' : gemini ? 'server' : 'none',
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
        const updates = this.extractUpdates(body);
        return { ...saved, ...updates };
    }
}

module.exports = {
    ApiSettings,
    COOKIE_NAME,
    PROVIDER_FIELD,
    FIELD_PROVIDER,
    VALID_PROVIDERS,
    isSiteGeminiEnabled,
    isSiteYouTubeEnabled
};
