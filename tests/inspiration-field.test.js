const test = require('node:test');
const assert = require('node:assert/strict');
const { keywords } = require('../public/js/features/inspiration-field');

test('inspiration words come from the current story instead of generic production labels', () => {
  const story = '清晨，咖啡師打開店門，磨豆、沖煮，再將熱咖啡送到窗邊。';
  const words = keywords(story);
  assert.ok(words.length >= 4);
  assert.ok(words.every(word => story.includes(word)));
  assert.ok(words.includes('咖啡'));
  assert.ok(words.includes('窗邊'));
  assert.ok(!words.some(word => ['角色', '情緒', '光影'].includes(word)));
  assert.equal(new Set(words).size, words.length);
});
test('existing shot descriptions contribute words without creating new facts', () => {
  const story = '製作咖啡';
  const shot = '熱水注入濾杯，咖啡滴落玻璃壺。';
  const words = keywords(story, { shots: [{ story: shot }, { story: null }] });
  assert.ok(words.every(word => (story + shot).includes(word)));
  assert.ok(words.some(word => shot.includes(word) && !story.includes(word)));
});
test('empty or generic material leaves abstract drops; repeated and English words stay bounded', () => {
  assert.deepEqual(keywords(null), []);
  assert.deepEqual(keywords('角色 情緒 光影 一個 故事'), []);
  const words = keywords('the coffee and sunlight, coffee with sunlight');
  assert.deepEqual(words, ['coffee', 'sunlight']);
  assert.ok(keywords(Array.from({ length: 200 }, (_, i) => `subject${i}`).join(' ')).length <= 32);
});

test('confirmed visuals and answers precede fallback text; rejected or unconfirmed terms stay out', () => {
  const words = keywords('直接進行人的其他故事，機器人城市', { shots: [{ story: '咖啡師將濾杯放在窗邊' }] }, {
    confirmed: { subject: '咖啡廳', visualKeywords: ['玻璃杯', '日光'], avoid: ['機器人'] },
    answers: [{ values: [{ label: '桌邊交談' }], other: '' }], requirements: ['不要機器人城市'],
    suggestions: { visualKeywords: ['機器人'] }
  });
  assert.ok(words[0].startsWith('咖啡'));
  assert.ok(words.includes('玻璃杯')); assert.ok(words.includes('桌邊'));
  assert.ok(!words.some(w => ['人的', '直接', '進行', '其他', '機器人', '城市'].includes(w)));
  assert.deepEqual(keywords('人的 直接 進行 其他'), []);
});
