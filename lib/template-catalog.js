/** Keep database identity and basic fields available for catalog/detail navigation. */
function toCatalogTemplate(record) {
  const content = typeof record.content === 'string' ? JSON.parse(record.content) : record.content;
  const template = content && typeof content === 'object' && !Array.isArray(content) ? content : {};
  return {
    ...template,
    id: record.id || template.id,
    name: template.name || template.title || record.name || '無標題',
    category: template.category || record.category || 'custom',
    description: template.description || record.description || '',
    tags: Array.isArray(template.tags) ? template.tags : (record.tags || [])
  };
}

module.exports = { toCatalogTemplate };
