/**
 * StoryboardAI — JSON V2 Exporter (Export System V2)
 *
 * Validates serialized StoryboardAI Project JSON V2 documents and triggers UTF-8 download.
 */
(function (root) {
  'use strict';

  function getSerializer() {
    if (root.StoryboardProjectSerializer) return root.StoryboardProjectSerializer;
    if (typeof require === 'function') return require('./project-serializer.js');
    throw new Error('StoryboardProjectSerializer 尚未載入');
  }

  function triggerDownload(content, filename, mimeType = 'application/json;charset=utf-8') {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
      return false;
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }, 1000);
    return true;
  }

  function exportJsonDocument(serializedResult, options = {}) {
    const serializer = getSerializer();
    const doc = serializedResult?.document || serializedResult;
    const validation = serializer.validateExportDocument(doc);
    if (!validation.valid) {
      const err = new Error(`JSON 匯出格式驗證失敗：${validation.errors[0]}`);
      err.code = 'EXPORT_JSON_INVALID';
      err.validationErrors = validation.errors;
      throw err;
    }

    const jsonText = JSON.stringify(doc, null, 2);
    const filename = options.filename || serializer.buildExportFilename(doc.project?.title, 'json');

    if (options.download !== false) {
      triggerDownload(jsonText, filename, 'application/json;charset=utf-8');
    }

    return {
      filename,
      jsonText,
      document: doc,
      byteLength: typeof Blob !== 'undefined' ? new Blob([jsonText]).size : Buffer.byteLength(jsonText, 'utf8')
    };
  }

  const api = {
    exportJsonDocument,
    triggerDownload
  };

  if (typeof root !== 'undefined') {
    root.StoryboardJsonExporter = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
