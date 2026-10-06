const { createHash } = require('node:crypto');

// Stable per-user identity makes a save retry safe after a lost response.
function generationProjectId(authorId, taskId) {
  if (typeof taskId !== 'string' || !taskId.trim() || taskId.length > 200) return null;
  const hash = createHash('sha256').update(String(authorId) + '\0' + taskId).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
module.exports = { generationProjectId };
