const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ApiSettings, COOKIE_NAME } = require('../lib/discovery/api-settings');
const env = { DISCOVERY_SETTINGS_SECRET: 'test-only-encryption-key-32-characters-long' };
const keyA = 'test-youtube-key-1234567890';
const keyB = 'test-gemini-key-1234567890';

test('OpenAI can be saved independently and remains isolated from server defaults', () => {
    const settings = new ApiSettings({ env: { ...env, OPENAI_API_KEY: 'server-openai-key-1234567890' } });
    const own = 'sk-test-personal-openai-key-1234567890';
    const saved = settings.merge({}, { openaiApiKey: own });
    const cookie = saveCookie(settings, saved);
    const read = settings.read({ apiSettingsUserId: 'account-a', headers: { cookie: `${cookie.name}=${cookie.value}` } });
    assert.equal(settings.effective(read).openaiApiKey, own);
    assert.equal(settings.effective().openaiApiKey, '');
    assert.equal(settings.status(read).openai.source, 'browser');
    assert.equal(settings.status(read).configured, false);
    assert.ok(!JSON.stringify(settings.status(read)).includes(own));
    assert.throws(() => settings.merge({}, { openaiApiKey: ['invalid'] }), /OpenAI/);
});

function saveCookie(manager, values) {
    let cookie;
    manager.write({ cookie(name, value, options) { cookie = { name, value, options }; } }, values, true, 'account-a');
    return cookie;
}

test('encrypted settings persist across instances and never return secret values in status', () => {
    const settings = new ApiSettings({ env });
    const saved = settings.merge({}, { youtubeApiKey: keyA, geminiApiKey: keyB });
    saved.savedAt = '2026-09-12T00:00:00Z';
    const cookie = saveCookie(settings, saved);
    assert.equal(cookie.name, settings.cookieName('account-a'));
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.secure, true);
    assert.equal(cookie.options.sameSite, 'strict');
    assert.equal(cookie.options.path, '/api');
    assert.ok(!cookie.value.includes(keyA));
    const reloaded = new ApiSettings({ env });
    const data = reloaded.read({ apiSettingsUserId: 'account-a', headers: { cookie: `${cookie.name}=${cookie.value}` } });
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
    assert.deepEqual(settings.read({ apiSettingsUserId: 'account-a', headers: { cookie: `${cookie.name}=${bytes.toString('base64url')}` } }), {});
    assert.deepEqual(settings.read({ headers: {} }), {});
    assert.equal(settings.status().configured, false);
});

test('empty fields keep existing keys, server defaults are recognized and malformed updates fail', () => {
    const settings = new ApiSettings({ env: { ...env, YOUTUBE_API_KEY: keyA, GEMINI_API_KEY: keyB } });
    assert.equal(settings.status().configured, false);
    assert.equal(settings.status().youtube.source, 'none');
    assert.deepEqual(settings.merge({ youtubeApiKey: keyA }, { youtubeApiKey: '' }), { youtubeApiKey: keyA });
    assert.throws(() => settings.merge({}, { geminiApiKey: 'bad key' }), /Gemini/);
    assert.throws(() => settings.merge({}, { youtubeApiKey: ['bad'] }), /YouTube/);
    assert.equal(new ApiSettings({ env }).merge({}, { youtubeApiKey: keyA }).youtubeApiKey, keyA);
});

test('cloud encryption requires a stable secret, and valid configuration does not require a local file', () => {
    assert.throws(() => new ApiSettings({ env: { VERCEL: '1' } }).encryptionKey(), /DISCOVERY_SETTINGS_SECRET/);
    assert.equal(new ApiSettings({ env: { ...env, VERCEL: '1' } }).encryptionKey().length, 32);
});

test('account-bound cookies reject other users, renamed ciphertext, guests and legacy shared cookies', () => {
    const settings = new ApiSettings({ env });
    const cookie = saveCookie(settings, { openaiApiKey: keyA });
    assert.deepEqual(settings.read({ apiSettingsUserId: 'account-b', headers: { cookie: `${cookie.name}=${cookie.value}` } }), {});
    assert.deepEqual(settings.read({ apiSettingsUserId: 'account-b', headers: { cookie: `${settings.cookieName('account-b')}=${cookie.value}` } }), {});
    assert.deepEqual(settings.read({ headers: { cookie: `${cookie.name}=${cookie.value}` } }), {});
    assert.deepEqual(settings.read({ apiSettingsUserId: 'account-a', headers: { cookie: `${COOKIE_NAME}=${cookie.value}` } }), {});
    assert.throws(() => settings.write({}, { openaiApiKey: keyA }, true), /登入/);
});
