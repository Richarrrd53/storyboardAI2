/**
 * StoryboardAI — PDF Exporter (Export System V2)
 *
 * Orchestrates font loading, image preparation (with retry on partial failures),
 * document layout generation, PDF compilation, download, and cleanup.
 */
(function (root) {
  'use strict';

  function getAssets() {
    if (root.StoryboardPdfAssets) return root.StoryboardPdfAssets;
    if (typeof require === 'function') return require('./pdf-assets.js');
    throw new Error('StoryboardPdfAssets 尚未載入');
  }

  function getLayout() {
    if (root.StoryboardPdfLayout) return root.StoryboardPdfLayout;
    if (typeof require === 'function') return require('./pdf-layout.js');
    throw new Error('StoryboardPdfLayout 尚未載入');
  }

  function getSerializer() {
    if (root.StoryboardProjectSerializer) return root.StoryboardProjectSerializer;
    if (typeof require === 'function') return require('./project-serializer.js');
    throw new Error('StoryboardProjectSerializer 尚未載入');
  }

  function triggerBlobDownload(blob, filename) {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
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
    }, 1500);
    return true;
  }

  function yieldToMainThread() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  async function exportPdfDocument(bundle, pdfOptions = {}, callbacks = {}) {
    const assets = getAssets();
    const layout = getLayout();
    const serializer = getSerializer();
    const { signal, authToken = '', fetchFn, onProgress, onImageFailures } = callbacks;

    const checkAbort = () => {
      if (signal?.aborted) {
        const err = new Error('匯出已取消');
        err.name = 'AbortError';
        throw err;
      }
    };

    checkAbort();

    const doc = bundle?.document || bundle;
    const meta = bundle?.meta || {};
    const runtimeImages = Array.isArray(meta.runtimeImages) ? meta.runtimeImages : [];
    const quality = pdfOptions.quality === 'high' ? 'high' : 'standard';

    // 1. Load images with bounded concurrency & real progress
    let imageLoad = await assets.loadShotImages(runtimeImages, {
      projectId: doc.project?.id || null,
      authToken,
      quality,
      signal,
      fetchFn,
      onProgress
    });
    checkAbort();

    // 2. Partial image failure handling: allow retry, continue-anyway, or cancel
    while (imageLoad.failed.length > 0 && typeof onImageFailures === 'function') {
      const failedOrders = imageLoad.failed.map(f => f.order);
      const decision = await onImageFailures({
        failedCount: imageLoad.failed.length,
        failedOrders,
        failures: imageLoad.failed
      });
      checkAbort();

      if (decision === 'retry') {
        const toRetry = runtimeImages.filter(img => failedOrders.includes(img.order));
        const retried = await assets.loadShotImages(toRetry, {
          projectId: doc.project?.id || null,
          authToken,
          quality,
          signal,
          fetchFn,
          onProgress
        });
        checkAbort();
        for (const [order, entry] of retried.imagesByOrder.entries()) {
          imageLoad.imagesByOrder.set(order, entry);
        }
        imageLoad.failed = Array.from(imageLoad.imagesByOrder.values()).filter(r => r.status === 'failed');
        continue;
      }
      if (decision === 'cancel') {
        return { aborted: true };
      }
      // decision === 'continue'
      break;
    }

    // 3. Layout document definition
    onProgress?.({ stage: 'layout', message: '正在安排文件版面…' });
    await yieldToMainThread();
    checkAbort();

    const docDefinition = layout.buildPdfDocumentDefinition(bundle, imageLoad.imagesByOrder, pdfOptions);
    const filename = pdfOptions.filename || serializer.buildExportFilename(doc.project?.title, 'pdf');

    // 4. Lazy-load pdfmake + Traditional Chinese fonts and compile PDF
    onProgress?.({ stage: 'generate', message: '正在載入字型與生成 PDF…' });
    const pdfMakeInstance = await assets.ensurePdfMake(signal);
    await assets.ensureCjkFonts(pdfMakeInstance, signal);
    checkAbort();

    onProgress?.({ stage: 'generate', message: '正在生成 PDF…' });
    await yieldToMainThread();
    checkAbort();

    const pdfDoc = pdfMakeInstance.createPdf(docDefinition);
    const blob = await new Promise((resolve, reject) => {
      try {
        const maybePromise = pdfDoc.getBlob((resultBlob) => {
          if (signal?.aborted) {
            const err = new Error('匯出已取消');
            err.name = 'AbortError';
            reject(err);
            return;
          }
          resolve(resultBlob);
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then((resultBlob) => {
            if (signal?.aborted) {
              const err = new Error('匯出已取消');
              err.name = 'AbortError';
              reject(err);
              return;
            }
            resolve(resultBlob);
          }, reject);
        }
      } catch (err) {
        reject(err);
      }
    });

    checkAbort();

    if (pdfOptions.download !== false) {
      triggerBlobDownload(blob, filename);
    }

    const failedImageCount = imageLoad.failed.length;
    // Release image memory references immediately
    imageLoad.imagesByOrder.clear();

    return {
      filename,
      blob,
      byteLength: blob.size,
      failedImageCount
    };
  }

  const api = {
    exportPdfDocument,
    triggerBlobDownload
  };

  if (typeof root !== 'undefined') {
    root.StoryboardPdfExporter = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
