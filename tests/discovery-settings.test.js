const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ApiSettings, COOKIE_NAME } = require('../lib/discovery/api-settings');
const env = { DISCOVERY_SETTINGS_SECRET: 'test-only-encryption-key-32-characters-long' };
const keyA = 'test-youtube-key-1234567890';
const keyB = 'test-gemini-key-1234567890';

function saveCookie(manager, values) {
    let cookie;
    manager.write({ cookie(name, value, options) { cookie = { name, value, options }; } }, values, true);
    return cookie;
}

test('encrypted settings persist across instances and never return secret values in status', () => {
    const settings = new ApiSettings({ env });
    const saved = settings.merge({}, { youtubeApiKey: keyA, geminiApiKey: keyB });
    saved.savedAt = '2026-09-12T00:00:00Z';
    const cookie = saveCookie(settings, saved);
    assert.equal(cookie.name, COOKIE_NAME);
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.secure, true);
    assert.equal(cookie.options.sameSite, 'strict');
    assert.equal(cookie.options.path, '/api/discovery');
    assert.ok(!cookie.value.includes(keyA));
    const reloaded = new ApiSettings({ env });
    const data = reloaded.read({ headers: { cookie: `${cookie.name}=${cookie.value}` } });
    assert.equal(reloaded.effective(data).youtubeApiKey, keyA);
    assert.equal(reloaded.effective(data).geminiApiKey, keyB);
    const status = reloaded.status(data);
    assert.equal(status.configured, true);
    assert.equal(status.youtube.source, 'browser');
    assert.ok(!JSON.stringify(status).includes(keyA));
    assert.ok(!JSON.stringify(status).includes(keyB));
});

test('tampered cookies cannot supply keys and another browser does not inherit them', () => {
    const settings = new ApiSettings({ env });
    const cookie = saveCookie(settings, { youtubeApiKey: keyA, geminiApiKey: keyB });
    const bytes = Buffer.from(cookie.value, 'base64url');
    bytes[28] ^= 1;
    assert.deepEqual(settings.read({ headers: { cookie: `${COOKIE_NAME}=${bytes.toString('base64url')}` } }), {});
    assert.deepEqual(settings.read({ headers: {} }), {});
    assert.equal(settings.status().configured, false);
});

test('empty fields keep existing keys, server defaults are recognized and malformed updates fail', () => {
    const settings = new ApiSettings({ env: { ...env, YOUTUBE_API_KEY: keyA, GEMINI_API_KEY: keyB } });
    assert.equal(settings.status().configured, true);
    assert.equal(settings.status().youtube.source, 'server');
    assert.deepEqual(settings.merge({ youtubeApiKey: keyA }, { youtubeApiKey: '' }), { youtubeApiKey: keyA });
    assert.throws(() => settings.merge({}, { geminiApiKey: 'bad key' }), /Gemini/);
    assert.throws(() => settings.merge({}, { youtubeApiKey: ['bad'] }), /YouTube/);
    assert.throws(() => new ApiSettings({ env }).merge({}, { youtubeApiKey: keyA }), /完成/);
});

test('cloud encryption requires a stable secret, and valid configuration does not require a local file', () => {
    assert.throws(() => new ApiSettings({ env: { VERCEL: '1' } }).encryptionKey(), /DISCOVERY_SETTINGS_SECRET/);
    assert.equal(new ApiSettings({ env: { ...env, VERCEL: '1' } }).encryptionKey().length, 32);
});
