const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ApiKeyCipher } = require('../lib/security/api-key-cipher');

const SECRET_V1 = 'test-api-keys-encryption-secret-v1-32-chars';
const SECRET_V2 = 'test-api-keys-encryption-secret-v2-32-chars';

test('encrypts with AES-256-GCM, unique IVs, and hides plaintext', () => {
    const cipher = new ApiKeyCipher({ env: { API_KEYS_ENCRYPTION_SECRET: SECRET_V1 } });
    const plaintext = 'sk-proj-super-secret-openai-key-1234567890';

    const first = cipher.encrypt(plaintext, { userId: 'user-a', provider: 'openai' });
    const second = cipher.encrypt(plaintext, { userId: 'user-a', provider: 'openai' });

    assert.equal(first.keyVersion, 'v1');
    assert.notEqual(first.iv, second.iv);
    assert.notEqual(first.encryptedKey, second.encryptedKey);
    assert.ok(!first.encryptedKey.includes(plaintext));
    assert.ok(!first.encryptedKey.includes('super-secret'));

    assert.equal(cipher.decrypt(first, { userId: 'user-a', provider: 'openai' }), plaintext);
    assert.equal(cipher.decrypt(second, { userId: 'user-a', provider: 'openai' }), plaintext);
});

test('rejects tampered ciphertext, iv, authTag, or cross-user / cross-provider AAD swap', () => {
    const cipher = new ApiKeyCipher({ env: { API_KEYS_ENCRYPTION_SECRET: SECRET_V1 } });
    const record = cipher.encrypt('AIzaSyTestGeminiKey1234567890', { userId: 'user-a', provider: 'gemini' });

    // Cross-user swap
    assert.throws(() => cipher.decrypt(record, { userId: 'user-b', provider: 'gemini' }), /解密驗證失敗/);
    // Cross-provider swap
    assert.throws(() => cipher.decrypt(record, { userId: 'user-a', provider: 'youtube' }), /解密驗證失敗/);

    // Tampered ciphertext
    const badCt = Buffer.from(record.encryptedKey, 'base64url');
    badCt[0] ^= 1;
    assert.throws(() => cipher.decrypt({ ...record, encryptedKey: badCt.toString('base64url') }, { userId: 'user-a', provider: 'gemini' }), /解密驗證失敗/);

    // Tampered authTag
    const badTag = Buffer.from(record.authTag, 'base64url');
    badTag[0] ^= 1;
    assert.throws(() => cipher.decrypt({ ...record, authTag: badTag.toString('base64url') }, { userId: 'user-a', provider: 'gemini' }), /解密驗證失敗/);

    // Wrong secret
    const wrongCipher = new ApiKeyCipher({ env: { API_KEYS_ENCRYPTION_SECRET: SECRET_V2 } });
    assert.throws(() => wrongCipher.decrypt(record, { userId: 'user-a', provider: 'gemini' }), /解密驗證失敗/);
});

test('fails closed when API_KEYS_ENCRYPTION_SECRET is missing or too short', () => {
    const missing = new ApiKeyCipher({ env: {} });
    assert.equal(missing.hasValidSecret(), false);
    assert.throws(() => missing.encrypt('test-key-12345678901234567890', { userId: 'u1', provider: 'gemini' }), /API_KEYS_ENCRYPTION_SECRET/);

    const short = new ApiKeyCipher({ env: { API_KEYS_ENCRYPTION_SECRET: 'too-short' } });
    assert.equal(short.hasValidSecret(), false);
    assert.throws(() => short.encrypt('test-key-12345678901234567890', { userId: 'u1', provider: 'gemini' }), /API_KEYS_ENCRYPTION_SECRET/);
});

test('supports key version rotation with previous secrets without breaking existing credentials', () => {
    const cipherV1 = new ApiKeyCipher({
        env: { API_KEYS_ENCRYPTION_SECRET: SECRET_V1, API_KEYS_ENCRYPTION_KEY_VERSION: 'v1' }
    });
    const oldRecord = cipherV1.encrypt('yt-key-before-rotation-123456', { userId: 'user-1', provider: 'youtube' });
    assert.equal(oldRecord.keyVersion, 'v1');

    const cipherV2 = new ApiKeyCipher({
        env: {
            API_KEYS_ENCRYPTION_SECRET: SECRET_V2,
            API_KEYS_ENCRYPTION_KEY_VERSION: 'v2',
            API_KEYS_ENCRYPTION_PREVIOUS_SECRETS: JSON.stringify({ v1: SECRET_V1 })
        }
    });

    // Old v1 record still decrypts under rotated v2 configuration
    assert.equal(cipherV2.decrypt(oldRecord, { userId: 'user-1', provider: 'youtube' }), 'yt-key-before-rotation-123456');

    // New records use v2
    const newRecord = cipherV2.encrypt('yt-key-after-rotation-123456', { userId: 'user-1', provider: 'youtube' });
    assert.equal(newRecord.keyVersion, 'v2');
    assert.equal(cipherV2.decrypt(newRecord, { userId: 'user-1', provider: 'youtube' }), 'yt-key-after-rotation-123456');
});
