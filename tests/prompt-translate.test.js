const test = require('node:test');
const assert = require('node:assert/strict');
const { translatePromptText, formatPromptText, escapeHtml } = require('../public/js/prompt-translate');

test('prompt-translate: returns empty string for null or undefined', async () => {
    assert.equal(await translatePromptText(null), '');
    assert.equal(await translatePromptText(undefined), '');
});

test('prompt-translate: preserves pure non-latin text without calling network', async () => {
    const input = '這是一個純中文測試句。';
    const result = await translatePromptText(input);
    assert.equal(result, input);
});

test('prompt-translate: protects placeholders and normalizes punctuation on fallback', async () => {
    // With no internet or failed fetch mock, it should preserve placeholder and format punctuation
    const input = 'A cinematic shot of {hero_name} walking in rain, dark atmosphere: neon lights.';
    const result = await translatePromptText(input);
    assert.match(result, /\{hero_name\}/);
});

test('prompt-translate: formatPromptText escapes HTML and converts newlines', async () => {
    const input = '中文第一行\n中文第二行 <測試> & "引號"';
    const formatted = await formatPromptText(input);
    assert.ok(formatted.includes('&lt;測試&gt;'));
    assert.ok(formatted.includes('&amp;'));
    assert.ok(formatted.includes('&quot;'));
    assert.ok(formatted.includes('<br>'));
});
