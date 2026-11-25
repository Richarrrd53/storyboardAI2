/**
 * StoryboardAI — PDF Assets & Font Loader (Export System V2)
 *
 * Handles:
 * - Lazy-loading pdfmake and Noto Sans TC Regular/Bold fonts
 * - Bounded-concurrency image downloading with timeout & AbortSignal
 * - Automatic fallback to authenticated same-origin shot image proxy on CORS / expired Signed URL
 * - Image validation, natural dimension extraction, and quality-aware resizing (standard vs high)
 * - Cleanup of temporary resources
 */
(function (root) {
  'use strict';

  const DEFAULT_CONCURRENCY = 4;
  const DEFAULT_TIMEOUT_MS = 15000;
  const PDFMAKE_SCRIPT_URL = '/js/vendor/export/pdfmake.min.js';
  const FONT_FILES = {
    regular: { vfsName: 'NotoSansTC-Regular.ttf', url: '/fonts/export/NotoSansTC-Regular.ttf' },
    bold: { vfsName: 'NotoSansTC-Bold.ttf', url: '/fonts/export/NotoSansTC-Bold.ttf' }
  };

  const QUALITY_PROFILES = {
    standard: { maxEdge: 1280, jpegQuality: 0.84, label: '標準品質' },
    high: { maxEdge: 2400, jpegQuality: 0.94, label: '高畫質' }
  };

  let pdfMakeLoadPromise = null;
  let fontsLoadPromise = null;

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    const chunks = [];
    for (let i = 0; i < bytes.length; i += chunkSize) {
      chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
    }
    return btoa(chunks.join(''));
  }

  function getResolver() {
    if (root.StoryboardImageAssetResolver) return root.StoryboardImageAssetResolver;
    if (typeof require === 'function') return require('./image-asset-resolver.js');
    return null;
  }

  function createAbortError(msg = '匯出已取消') {
    const err = new Error(msg);
    err.name = 'AbortError';
    return err;
  }

  function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    if (externalSignal?.aborted) {
      return Promise.reject(createAbortError());
    }
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const doFetch = options.fetchFn || root.fetch?.bind(root);

    return doFetch(url, { ...options, signal: controller.signal })
      .catch(err => {
        if (externalSignal?.aborted) throw createAbortError();
        if (err?.name === 'AbortError') {
          const timeoutErr = new Error('圖片下載逾時');
          timeoutErr.code = 'IMAGE_TIMEOUT';
          throw timeoutErr;
        }
        throw err;
      })
      .finally(() => {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', onExternalAbort);
      });
  }

  async function fetchImageBlobWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    if (externalSignal?.aborted) {
      throw createAbortError();
    }
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const doFetch = options.fetchFn || root.fetch?.bind(root);

    try {
      const res = await doFetch(url, { ...options, signal: controller.signal });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        err.code = 'IMAGE_HTTP_ERROR';
        throw err;
      }
      const contentType = (res.headers?.get?.('content-type') || '').toLowerCase();
      if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
        const err = new Error(`無效的圖片 Content-Type (${contentType})`);
        err.code = 'INVALID_IMAGE_MIME';
        throw err;
      }
      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        const err = new Error('圖片檔案為空');
        err.code = 'EMPTY_IMAGE_BLOB';
        throw err;
      }
      if (blob.type && !blob.type.toLowerCase().startsWith('image/') && !blob.type.toLowerCase().includes('octet-stream')) {
        const err = new Error(`無效的圖片格式 (${blob.type})`);
        err.code = 'INVALID_IMAGE_MIME';
        throw err;
      }
      return blob;
    } catch (err) {
      if (externalSignal?.aborted) throw createAbortError();
      if (err?.name === 'AbortError') {
        const timeoutErr = new Error('圖片下載逾時');
        timeoutErr.code = 'IMAGE_TIMEOUT';
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  /**
   * Lazy-load pdfmake browser bundle on demand.
   */
  async function ensurePdfMake(signal) {
    if (signal?.aborted) throw createAbortError();
    if (root.pdfMake && typeof root.pdfMake.createPdf === 'function') {
      return root.pdfMake;
    }
    if (!pdfMakeLoadPromise) {
      pdfMakeLoadPromise = new Promise((resolve, reject) => {
        if (typeof document === 'undefined') {
          reject(new Error('瀏覽器環境不存在，無法載入 pdfmake'));
          return;
        }
        const script = document.createElement('script');
        script.src = PDFMAKE_SCRIPT_URL;
        script.async = true;
        script.onload = () => {
          if (root.pdfMake && typeof root.pdfMake.createPdf === 'function') {
            resolve(root.pdfMake);
          } else {
            reject(new Error('pdfmake 載入異常'));
          }
        };
        script.onerror = () => reject(new Error('無法載入 PDF 生成函式庫'));
        document.head.appendChild(script);
      }).catch(err => {
        pdfMakeLoadPromise = null;
        throw err;
      });
    }
    const lib = await pdfMakeLoadPromise;
    if (signal?.aborted) throw createAbortError();
    return lib;
  }

  /**
   * Lazy-load Noto Sans TC Regular & Bold TTF fonts into pdfMake VFS (cached once loaded).
   * Supports both pdfmake 0.3.x (addVirtualFileSystem / addFonts) and 0.2.x (vfs / fonts).
   */
  async function ensureCjkFonts(pdfMakeInstance, signal) {
    if (signal?.aborted) throw createAbortError();

    if (pdfMakeInstance._sbCjkFontsReady) {
      registerFontFamily(pdfMakeInstance);
      return;
    }

    if (!fontsLoadPromise) {
      fontsLoadPromise = (async () => {
        const vfsPatch = {};
        const entries = Object.values(FONT_FILES);
        for (const font of entries) {
          if (signal?.aborted) throw createAbortError();
          const res = await fetchWithTimeout(font.url, { signal }, 30000);
          if (!res.ok) {
            throw new Error(`字型載入失敗（${font.vfsName}，HTTP ${res.status}）`);
          }
          const buf = await res.arrayBuffer();
          if (signal?.aborted) throw createAbortError();
          vfsPatch[font.vfsName] = arrayBufferToBase64(buf);
        }
        if (typeof pdfMakeInstance.addVirtualFileSystem === 'function') {
          pdfMakeInstance.addVirtualFileSystem(vfsPatch);
        } else {
          pdfMakeInstance.vfs = { ...(pdfMakeInstance.vfs || {}), ...vfsPatch };
        }
        registerFontFamily(pdfMakeInstance);
        pdfMakeInstance._sbCjkFontsReady = true;
      })().catch(err => {
        fontsLoadPromise = null;
        throw err;
      });
    }

    await fontsLoadPromise;
    if (signal?.aborted) throw createAbortError();
  }

  function registerFontFamily(pdfMakeInstance) {
    const fontDef = {
      NotoSansTC: {
        normal: FONT_FILES.regular.vfsName,
        bold: FONT_FILES.bold.vfsName,
        italics: FONT_FILES.regular.vfsName,
        bolditalics: FONT_FILES.bold.vfsName
      }
    };
    if (typeof pdfMakeInstance.addFonts === 'function') {
      pdfMakeInstance.addFonts(fontDef);
    } else {
      pdfMakeInstance.fonts = { ...(pdfMakeInstance.fonts || {}), ...fontDef };
    }
  }

  /**
   * Decode a Blob or Data URI into an HTMLImageElement, validate dimensions,
   * and resize according to quality profile without ever upscaling.
   */
  async function decodeAndOptimizeImage(source, quality = 'standard', signal) {
    if (signal?.aborted) throw createAbortError();
    const profile = QUALITY_PROFILES[quality] || QUALITY_PROFILES.standard;

    // Node.js fallback (when running unit/visual tests outside browser)
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      if (typeof source === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(source)) {
        const dims = extractImageDimensionsFromDataUri(source);
        return {
          dataUrl: source,
          width: dims.width,
          height: dims.height,
          aspectRatio: dims.width / dims.height,
          originalWidth: dims.width,
          originalHeight: dims.height,
          mimeType: dims.mimeType
        };
      }
      throw new Error('非瀏覽器環境僅支援 Data URI 圖片測試');
    }

    let objectUrl = null;
    let imgSrc = '';
    let originalMime = 'image/png';

    if (typeof source === 'string') {
      imgSrc = source;
      const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i.exec(source);
      if (m) originalMime = m[1].toLowerCase();
    } else if (typeof Blob !== 'undefined' && source instanceof Blob) {
      if (source.size === 0) throw new Error('圖片檔案為空');
      originalMime = (source.type || '').toLowerCase() || 'image/png';
      objectUrl = URL.createObjectURL(source);
      imgSrc = objectUrl;
    } else {
      throw new Error('不支援的圖片來源格式');
    }

    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        const onAbort = () => {
          el.onload = el.onerror = null;
          el.src = '';
          reject(createAbortError());
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        el.onload = () => {
          signal?.removeEventListener('abort', onAbort);
          if (!el.naturalWidth || !el.naturalHeight) {
            reject(new Error('圖片尺寸無效或檔案已損毀'));
            return;
          }
          resolve(el);
        };
        el.onerror = () => {
          signal?.removeEventListener('abort', onAbort);
          reject(new Error('圖片解碼失敗或檔案已損毀'));
        };
        el.src = imgSrc;
      });

      if (signal?.aborted) throw createAbortError();

      const origW = img.naturalWidth;
      const origH = img.naturalHeight;
      const maxDim = Math.max(origW, origH);
      // Never upscale low-resolution images
      const scale = maxDim > profile.maxEdge ? (profile.maxEdge / maxDim) : 1;
      const targetW = Math.max(1, Math.round(origW * scale));
      const targetH = Math.max(1, Math.round(origH * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      // White background behind any transparent PNG before JPEG encoding
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      // pdfmake supports PNG and JPEG (not WebP directly), so normalize WebP/large images to JPEG
      const outputMime = 'image/jpeg';
      const dataUrl = canvas.toDataURL(outputMime, profile.jpegQuality);

      // Release canvas backing store immediately
      canvas.width = 0;
      canvas.height = 0;

      return {
        dataUrl,
        width: targetW,
        height: targetH,
        aspectRatio: origW / origH,
        originalWidth: origW,
        originalHeight: origH,
        mimeType: outputMime
      };
    } finally {
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      }
    }
  }

  /**
   * Minimal PNG/JPEG dimension parser for Node.js test environments.
   */
  function extractImageDimensionsFromDataUri(dataUri) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUri);
    if (!match) return { width: 1600, height: 900, mimeType: 'image/png' };
    const mimeType = match[1].toLowerCase();
    if (typeof Buffer === 'undefined') return { width: 1600, height: 900, mimeType };
    const buf = Buffer.from(match[2], 'base64');

    // PNG IHDR: bytes 16..23
    if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      if (width > 0 && height > 0) return { width, height, mimeType: 'image/png' };
    }

    // JPEG SOF0/SOF2
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buf.length) {
        if (buf[offset] !== 0xff) break;
        const marker = buf[offset + 1];
        const segLen = buf.readUInt16BE(offset + 2);
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const height = buf.readUInt16BE(offset + 5);
          const width = buf.readUInt16BE(offset + 7);
          if (width > 0 && height > 0) return { width, height, mimeType: 'image/jpeg' };
          break;
        }
        offset += 2 + segLen;
      }
    }

    return { width: 1600, height: 900, mimeType };
  }

  const FAILURE_STATUSES = new Set(['failed', 'download_failed', 'decode_failed', 'unresolved']);

  async function tryDecodeBlob(blob, order, shotId, quality, signal) {
    try {
      const decoded = await decodeAndOptimizeImage(blob, quality, signal);
      return { ok: true, result: { status: 'ok', order, shotId, ...decoded } };
    } catch (decodeErr) {
      if (decodeErr?.name === 'AbortError') throw decodeErr;
      return { ok: false, status: 'decode_failed', error: decodeErr?.message || '圖片解碼失敗' };
    }
  }

  async function fetchSingleShotImage(item, options = {}) {
    const { projectId, authToken, quality = 'standard', signal, fetchFn, refreshUrls } = options;
    if (signal?.aborted) throw createAbortError();
    const resolver = getResolver();

    // 1. In-memory temporary Base64 (unsaved generation task)
    if (item.temporaryDataUri) {
      const decoded = await tryDecodeBlob(item.temporaryDataUri, item.order, item.shotId, quality, signal);
      if (decoded.ok) return decoded.result;
      return { status: 'decode_failed', order: item.order, shotId: item.shotId, error: decoded.error };
    }

    // 2. Explicit non-downloadable lifecycle states
    if (item.status === 'failed') {
      return { status: 'generation_failed', order: item.order, shotId: item.shotId };
    }
    if (item.status === 'unsaved') {
      return { status: 'unsaved', order: item.order, shotId: item.shotId };
    }

    const hasDirectUrl = Boolean(item.url && /^https?:\/\//i.test(item.url));
    const hasStorageRef = Boolean(item.storageRef);
    const hasApiPath = Boolean(item.apiUrl || item.proxyUrl);

    // Only classify as missing when we truly have no image source and no project/shot identity to query
    if (item.status === 'missing' && !hasDirectUrl && !hasStorageRef && !hasApiPath) {
      return { status: 'missing', order: item.order, shotId: item.shotId };
    }

    let lastError = null;
    let lastFailureStatus = hasStorageRef && !hasDirectUrl ? 'unresolved' : 'download_failed';

    // 3. Direct URL fetch (skip if signed URL is already known to be expired)
    const isExpired = item.access === 'signed' && item.expiresAt && resolver?.isExpiresSoonOrExpired?.(item.expiresAt, 5000);
    if (hasDirectUrl && !isExpired) {
      try {
        const blob = await fetchImageBlobWithTimeout(item.url, { signal, mode: 'cors', fetchFn });
        const decoded = await tryDecodeBlob(blob, item.order, item.shotId, quality, signal);
        if (decoded.ok) return decoded.result;
        lastFailureStatus = 'decode_failed';
        lastError = new Error(decoded.error);
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        lastError = err;
        lastFailureStatus = 'download_failed';
      }
    }

    // 4. Refresh Signed URL via GET /api/projects/:id once if expired or direct fetch failed
    if (typeof refreshUrls === 'function' && (isExpired || (hasDirectUrl && lastFailureStatus === 'download_failed'))) {
      try {
        const refreshedItem = await refreshUrls(item.shotId, item.order);
        if (refreshedItem?.url && /^https?:\/\//i.test(refreshedItem.url) && refreshedItem.url !== item.url) {
          const blob = await fetchImageBlobWithTimeout(refreshedItem.url, { signal, mode: 'cors', fetchFn });
          const decoded = await tryDecodeBlob(blob, item.order, item.shotId, quality, signal);
          if (decoded.ok) return decoded.result;
          lastFailureStatus = 'decode_failed';
          lastError = new Error(decoded.error);
        }
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        lastError = err;
      }
    }

    // 5. Fallback to authenticated same-origin shot image binary proxy (handles CORS + expired Signed URL + storageRef-only)
    if (projectId && item.shotId && authToken && lastFailureStatus !== 'decode_failed') {
      try {
        const proxyUrl = item.proxyUrl || `/api/projects/${encodeURIComponent(projectId)}/shots/${encodeURIComponent(item.shotId)}/image?proxy=1`;
        const blob = await fetchImageBlobWithTimeout(proxyUrl, {
          signal,
          headers: { Authorization: `Bearer ${authToken}` },
          fetchFn
        });
        const decoded = await tryDecodeBlob(blob, item.order, item.shotId, quality, signal);
        if (decoded.ok) return decoded.result;
        return { status: 'decode_failed', order: item.order, shotId: item.shotId, error: decoded.error };
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        lastError = err;
        lastFailureStatus = 'download_failed';
      }
    }

    return {
      status: lastFailureStatus,
      order: item.order,
      shotId: item.shotId,
      error: lastError?.message || '圖片無法載入'
    };
  }

  /**
   * Download & prepare all shot images with bounded concurrency, deduplication, and real progress updates.
   */
  async function loadShotImages(runtimeImages = [], options = {}) {
    const {
      projectId = null,
      authToken = '',
      quality = 'standard',
      concurrency = DEFAULT_CONCURRENCY,
      signal,
      fetchFn,
      onProgress
    } = options;

    const total = runtimeImages.length;
    const results = new Array(total);
    let completed = 0;
    let nextIndex = 0;

    if (total === 0) {
      return { imagesByOrder: new Map(), failed: [], results: [] };
    }

    onProgress?.({
      stage: 'images',
      completed: 0,
      total,
      message: `正在準備分鏡圖片 0 / ${total}`
    });

    // Shared once-per-export refresh promise so concurrent workers don't spam GET /api/projects/:id
    let refreshPromise = null;
    const doFetch = fetchFn || root.fetch?.bind(root);
    const refreshUrls = (projectId && authToken && typeof doFetch === 'function')
      ? async (shotId, order) => {
          if (!refreshPromise) {
            refreshPromise = (async () => {
              const res = await fetchWithTimeout(`/api/projects/${encodeURIComponent(projectId)}`, {
                signal,
                cache: 'no-store',
                headers: { Authorization: `Bearer ${authToken}` },
                fetchFn: doFetch
              });
              if (!res.ok) return new Map();
              const data = await res.json().catch(() => null);
              const shots = Array.isArray(data?.project?.shots) ? data.project.shots : [];
              const resolver = getResolver();
              const map = new Map();
              for (const s of shots) {
                const desc = resolver?.resolveImageAssetDescriptor?.(s.payload, { projectId, shotId: s.id });
                if (desc?.httpUrl) {
                  map.set(String(s.id || s.order), { url: desc.httpUrl, expiresAt: desc.expiresAt });
                }
              }
              return map;
            })().catch(() => new Map());
          }
          const map = await refreshPromise;
          return map.get(String(shotId)) || map.get(String(order)) || null;
        }
      : null;

    // Deduplicate identical assets within the same export run
    const inflightByAssetKey = new Map();

    const workerCount = Math.min(Math.max(1, concurrency), total);
    const workers = Array.from({ length: workerCount }, async () => {
      while (nextIndex < total) {
        if (signal?.aborted) throw createAbortError();
        const idx = nextIndex++;
        const item = runtimeImages[idx];
        const dedupeKey = item.assetId || item.storageRef || item.url || null;

        let res;
        if (dedupeKey && inflightByAssetKey.has(dedupeKey)) {
          const shared = await inflightByAssetKey.get(dedupeKey);
          res = { ...shared, order: item.order, shotId: item.shotId };
        } else {
          const p = fetchSingleShotImage(item, {
            projectId,
            authToken,
            quality,
            signal,
            fetchFn,
            refreshUrls
          });
          if (dedupeKey) inflightByAssetKey.set(dedupeKey, p);
          res = await p;
        }

        results[idx] = res;
        completed++;
        onProgress?.({
          stage: 'images',
          completed,
          total,
          message: `正在準備分鏡圖片 ${completed} / ${total}`
        });
      }
    });

    await Promise.all(workers);

    const imagesByOrder = new Map();
    const failed = [];
    for (const r of results) {
      if (!r) continue;
      imagesByOrder.set(r.order, r);
      if (FAILURE_STATUSES.has(r.status)) failed.push(r);
    }

    return { imagesByOrder, failed, results };
  }

  const api = {
    QUALITY_PROFILES,
    FONT_FILES,
    ensurePdfMake,
    ensureCjkFonts,
    decodeAndOptimizeImage,
    extractImageDimensionsFromDataUri,
    fetchSingleShotImage,
    loadShotImages
  };

  if (typeof root !== 'undefined') {
    root.StoryboardPdfAssets = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
