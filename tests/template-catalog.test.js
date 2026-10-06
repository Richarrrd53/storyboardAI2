const test = require('node:test');
const assert = require('node:assert/strict');
const { toCatalogTemplate } = require('../lib/template-catalog');

test('new templates without content IDs retain their database identity and fields', () => {
  const template = toCatalogTemplate({ id: 'db-id', name: '模板名稱', category: 'story', description: '描述', tags: ['標籤'], content: { structure: [{ action: '開場' }] } });
  assert.equal(template.id, 'db-id');
  assert.equal(template.name, '模板名稱');
  assert.equal(template.category, 'story');
  assert.deepEqual(template.tags, ['標籤']);
  assert.equal(template.structure[0].action, '開場');
});

test('serialized analysis preserves all nested data while using canonical database IDs', () => {
  const content = { id: 'source-video-id', name: '分析名稱', narrative: { summary: '故事' }, promptTemplate: { perShot: ['提示'] }, confidence: 0.9 };
  const template = toCatalogTemplate({ id: 'db-id', name: '舊名稱', content: JSON.stringify(content) });
  assert.equal(template.id, 'db-id');
  assert.equal(template.name, content.name);
  assert.deepEqual(template.narrative, content.narrative);
  assert.deepEqual(template.promptTemplate, content.promptTemplate);
  assert.equal(template.confidence, 0.9);
});
