const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;
const MIN_SECRET_LENGTH = 32;
const DEFAULT_KEY_VERSION = 'v1';
const HKDF_SALT = Buffer.from('storyboardai-api-key-encryption-v1', 'utf8');

function normalizeVersion(version) {
    const value = String(version || DEFAULT_KEY_VERSION).trim();
    if (!value) throw new Error('API_KEYS_ENCRYPTION_KEY_VERSION 格式無效。');
    return value;
}

function parsePreviousSecrets(raw) {
    if (!raw || typeof raw !== 'string') return {};
    const trimmed = raw.trim();
    if (!trimmed) return {};
    if (trimmed.startsWith('{')) {
        let parsed;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            throw new Error('API_KEYS_ENCRYPTION_PREVIOUS_SECRETS JSON 格式無效。');
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('API_KEYS_ENCRYPTION_PREVIOUS_SECRETS 必須為版本對應密鑰的物件。');
        }
        const map = {};
        for (const [ver, sec] of Object.entries(parsed)) {
            if (typeof sec === 'string' && sec.length >= MIN_SECRET_LENGTH) {
                map[String(ver).trim()] = sec;
            }
        }
        return map;
    }
    const map = {};
    for (const entry of trimmed.split(',')) {
        const idx = entry.indexOf(':');
        if (idx <= 0) continue;
        const ver = entry.slice(0, idx).trim();
        const sec = entry.slice(idx + 1).trim();
        if (ver && sec.length >= MIN_SECRET_LENGTH) {
            map[ver] = sec;
        }
    }
    return map;
}

function deriveKey(secret, keyVersion) {
    if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
        throw new Error(`API_KEYS_ENCRYPTION_SECRET 至少需要 ${MIN_SECRET_LENGTH} 個字元。`);
    }
    const derived = crypto.hkdfSync(
        'sha256',
        Buffer.from(secret, 'utf8'),
        HKDF_SALT,
        Buffer.from(`user-api-credential:${keyVersion}`, 'utf8'),
        KEY_BYTES
    );
    return Buffer.from(derived);
}

function buildAad(userId, provider, keyVersion) {
    if (!userId || !provider || !keyVersion) {
        throw new Error('缺少加密驗證所需的帳號或服務識別資訊。');
    }
    return Buffer.from(`storyboardai:api-key:${String(userId)}:${String(provider)}:${String(keyVersion)}`, 'utf8');
}

class ApiKeyCipher {
    constructor({ env = process.env } = {}) {
        this.env = env;
        this._keyCache = new Map();
    }

    currentVersion() {
        return normalizeVersion(this.env.API_KEYS_ENCRYPTION_KEY_VERSION);
    }

    hasValidSecret() {
        const secret = this.env.API_KEYS_ENCRYPTION_SECRET;
        return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH;
    }

    resolveKeyForVersion(keyVersion) {
        const version = normalizeVersion(keyVersion);
        const currentVersion = this.currentVersion();
        const primarySecret = this.env.API_KEYS_ENCRYPTION_SECRET;

        if (!this.hasValidSecret()) {
            throw new Error('伺服器尚未正確設定 API_KEYS_ENCRYPTION_SECRET（至少需要 32 個字元），無法執行金鑰加解密。');
        }

        let secretToUse = null;
        if (version === currentVersion) {
            secretToUse = primarySecret;
        } else {
            const previousMap = parsePreviousSecrets(this.env.API_KEYS_ENCRYPTION_PREVIOUS_SECRETS);
            secretToUse = previousMap[version] || null;
        }

        if (!secretToUse) {
            throw new Error(`找不到密鑰版本「${version}」對應的伺服器加密金鑰，無法解密 API Key。`);
        }

        const cacheKey = `${version}:${crypto.createHash('sha256').update(secretToUse).digest('hex').slice(0, 16)}`;
        let key = this._keyCache.get(cacheKey);
        if (!key) {
            key = deriveKey(secretToUse, version);
            this._keyCache.set(cacheKey, key);
        }
        return key;
    }

    encrypt(plaintext, { userId, provider } = {}) {
        if (typeof plaintext !== 'string' || !plaintext.trim()) {
            throw new Error('API Key 不可為空。');
        }
        if (!userId || !provider) {
            throw new Error('加密 API Key 必須提供帳號與服務識別。');
        }
        const keyVersion = this.currentVersion();
        const key = this.resolveKeyForVersion(keyVersion);
        const iv = crypto.randomBytes(IV_BYTES);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        cipher.setAAD(buildAad(userId, provider, keyVersion));
        const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();

        return {
            encryptedKey: ciphertext.toString('base64url'),
            iv: iv.toString('base64url'),
            authTag: authTag.toString('base64url'),
            keyVersion
        };
    }

    decrypt(record, { userId, provider } = {}) {
        if (!record || typeof record !== 'object') {
            throw new Error('加密憑證資料無效。');
        }
        const { encryptedKey, iv, authTag, keyVersion } = record;
        if (!encryptedKey || !iv || !authTag || !keyVersion) {
            throw new Error('加密憑證欄位不完整。');
        }
        if (!userId || !provider) {
            throw new Error('解密 API Key 必須提供帳號與服務識別。');
        }

        const ivBuf = Buffer.from(String(iv), 'base64url');
        const authTagBuf = Buffer.from(String(authTag), 'base64url');
        const ciphertextBuf = Buffer.from(String(encryptedKey), 'base64url');

        if (ivBuf.length !== IV_BYTES || authTagBuf.length !== AUTH_TAG_BYTES || ciphertextBuf.length === 0) {
            throw new Error('API Key 密文格式無效。');
        }

        const key = this.resolveKeyForVersion(keyVersion);
        try {
            const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf);
            decipher.setAAD(buildAad(userId, provider, keyVersion));
            decipher.setAuthTag(authTagBuf);
            return Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]).toString('utf8');
        } catch {
            throw new Error('API Key 解密驗證失敗，資料可能已損毀或遭竄改。');
        }
    }
}

module.exports = {
    ApiKeyCipher,
    MIN_SECRET_LENGTH,
    DEFAULT_KEY_VERSION,
    parsePreviousSecrets
};
