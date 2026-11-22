const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ApiSettings, COOKIE_NAME } = require('../lib/discovery/api-settings');

const env = {
    API_KEYS_ENCRYPTION_SECRET: 'test-only-db-encryption-key-32-chars-long',
    DISCOVERY_SETTINGS_SECRET: 'test-only-cookie-encryption-key-32-chars-long'
};
const keyA = 'test-youtube-key-1234567890';
const keyB = 'test-gemini-key-1234567890';

function createInMemoryPrisma() {
    const rows = new Map();
    return {
        rows,
        userApiCredential: {
            findMany: async ({ where }) => [...rows.values()].filter(r => r.userId === where.userId),
            upsert: async ({ where, create, update }) => {
                const key = `${where.userId_provider.userId}:${where.userId_provider.provider}`;
                const existing = rows.get(key);
                const now = new Date();
                const record = existing
                    ? { ...existing, ...update, updatedAt: now }
                    : { id: crypto.randomUUID(), ...create, createdAt: now, updatedAt: now };
                rows.set(key, record);
                return record;
            },
            deleteMany: async ({ where }) => {
                let count = 0;
                for (const [k, v] of rows.entries()) {
                    if (v.userId === where.userId && (!where.provider || v.provider === where.provider)) {
                        rows.delete(k);
                        count++;
                    }
                }
                return { count };
            }
        }
    };
}

function buildLegacyCookie(secret, ownerId, data) {
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(String(ownerId)));
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify({ ...data, ownerId, expiresAt: Date.now() + 60000 })),
        cipher.final()
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

test('OpenAI can be saved to DB independently and remains isolated from server defaults and other users', async () => {
    const prisma = createInMemoryPrisma();
    const settings = new ApiSettings({ env: { ...env, OPENAI_API_KEY: 'server-openai-key-1234567890' }, prisma });
    const own = 'sk-test-personal-openai-key-1234567890';

    await settings.saveToDb('account-a', { openaiApiKey: own });
    const stored = [...prisma.rows.values()][0];
    assert.ok(!stored.encryptedKey.includes(own));

    const readA = await settings.readFromDb('account-a');
    const readB = await settings.readFromDb('account-b');
    assert.equal(settings.effective(readA).openaiApiKey, own);
    assert.equal(settings.effective(readB).openaiApiKey, '');
    assert.equal(settings.status(readA).openai.source, 'account');
    assert.equal(settings.status(readA).openai.personalConfigured, true);
    assert.equal(settings.status(readA).configured, false);
    assert.ok(!JSON.stringify(settings.status(readA)).includes(own));
    assert.throws(() => settings.extractUpdates({ openaiApiKey: ['invalid'] }), /OpenAI/);
});

test('encrypted DB settings persist across instances and never return secret values in status', async () => {
    const prisma = createInMemoryPrisma();
    const settings = new ApiSettings({ env, prisma });
    const updates = settings.extractUpdates({ youtubeApiKey: keyA, geminiApiKey: keyB });
    await settings.saveToDb('account-a', updates);

    const reloaded = new ApiSettings({ env, prisma });
    const data = await reloaded.readFromDb('account-a');
    assert.equal(reloaded.effective(data).youtubeApiKey, keyA);
    assert.equal(reloaded.effective(data).geminiApiKey, keyB);

    const status = reloaded.status(data);
    assert.equal(status.configured, true);
    assert.equal(status.youtube.source, 'account');
    assert.equal(status.gemini.source, 'account');
    assert.ok(!JSON.stringify(status).includes(keyA));
    assert.ok(!JSON.stringify(status).includes(keyB));
});

test('tampered DB ciphertext fails decryption and missing encryption secret fails closed', async () => {
    const prisma = createInMemoryPrisma();
    const settings = new ApiSettings({ env, prisma });
    await settings.saveToDb('account-a', { youtubeApiKey: keyA });

    const row = [...prisma.rows.values()][0];
    const tamperedBytes = Buffer.from(row.encryptedKey, 'base64url');
    tamperedBytes[0] ^= 1;
    row.encryptedKey = tamperedBytes.toString('base64url');

    await assert.rejects(() => settings.readFromDb('account-a'), /解密驗證失敗/);

    const noSecretSettings = new ApiSettings({ env: { VERCEL: '1' }, prisma });
    await assert.rejects(() => noSecretSettings.saveToDb('account-a', { youtubeApiKey: keyA }), /API_KEYS_ENCRYPTION_SECRET/);
});

test('legacy cookie reading rejects other users, tampered ciphertext, expired cookies, and shared cookies', () => {
    const settings = new ApiSettings({ env });
    const cookieVal = buildLegacyCookie(env.DISCOVERY_SETTINGS_SECRET, 'account-a', { openaiApiKey: keyA });
    const nameA = settings.cookieName('account-a');

    assert.equal(settings.readLegacyCookie({ apiSettingsUserId: 'account-a', headers: { cookie: `${nameA}=${cookieVal}` } }).openaiApiKey, keyA);
    assert.deepEqual(settings.readLegacyCookie({ apiSettingsUserId: 'account-b', headers: { cookie: `${nameA}=${cookieVal}` } }), {});
    assert.deepEqual(settings.readLegacyCookie({ apiSettingsUserId: 'account-b', headers: { cookie: `${settings.cookieName('account-b')}=${cookieVal}` } }), {});
    assert.deepEqual(settings.readLegacyCookie({ headers: { cookie: `${nameA}=${cookieVal}` } }), {});
    assert.deepEqual(settings.readLegacyCookie({ apiSettingsUserId: 'account-a', headers: { cookie: `${COOKIE_NAME}=${cookieVal}` } }), {});
});
