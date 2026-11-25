/**
 * StoryboardAI — Shared Image Asset Resolver (Export System V2.1)
 *
 * Isomorphic (Node.js + Browser) contract for parsing, prioritizing, and classifying
 * storyboard image sources across PostgreSQL Shot.payload, Backend API responses,
 * JSON V2.1 Assets Registry, and PDF Runtime Image Loader.
 *
 * Separates:
 * - Lifecycle status: succeeded | pending | failed | missing | unsaved | unknown
 * - Access mode: signed | public | private | api | external | unsaved | none
 * - Availability: available | requires_auth | expired | unresolved | unavailable | unchecked
 */
(function (root) {
  'use strict';

  const DEFAULT_BUCKET = 'storyboard-images';

  const EXT_TO_MIME = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp'
  };

  const PLACEHOLDER_PATHS = new Set([
    '../icon/error.jpg',
    '/icon/error.jpg',
    'icon/error.jpg'
  ]);

  const SAFE_SEGMENT_RE = /^[A-Za-z0-9_-]{1,128}$/;
  const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]{1,160}\.(png|jpg|jpeg|webp)$/i;
  const CANONICAL_PATH_RE = /^projects\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9._-]{1,160}\.(png|jpg|jpeg|webp))$/i;
  const LEGACY_PATH_RE = /^([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9._-]{1,160}\.(png|jpg|jpeg|webp))$/i;
  const SHOT_IMAGE_API_RE = /^\/api\/projects\/([^/?#]+)\/shots\/([^/?#]+)\/image(?:\?(.*))?$/i;

  function isBase64DataUri(value) {
    return typeof value === 'string' && /^data:image\//i.test(value.trim());
  }

  function isBlobUrl(value) {
    return typeof value === 'string' && /^blob:/i.test(value.trim());
  }

  function isPlaceholderImage(value) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return PLACEHOLDER_PATHS.has(trimmed) || /(?:^|\/)error\.jpg$/i.test(trimmed);
  }

  function toIsoTimestamp(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value.toISOString();
    }
    if (typeof value === 'number') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      let candidate = trimmed;
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(trimmed)) {
        candidate = trimmed.replace(/\s+/, 'T') + '+08:00';
      }
      const parsed = new Date(candidate);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return null;
  }

  function isValidStorageObjectPath(objectPath) {
    if (typeof objectPath !== 'string') return false;
    const trimmed = objectPath.trim();
    if (!trimmed || trimmed.includes('..') || trimmed.includes('\\') || trimmed.startsWith('/')) {
      return false;
    }
    if (CANONICAL_PATH_RE.test(trimmed) || LEGACY_PATH_RE.test(trimmed)) {
      return true;
    }
    // Also allow general safe nested paths ending in a valid image filename (e.g. legacy/custom folders)
    const parts = trimmed.split('/');
    if (parts.length >= 2 && parts.length <= 6) {
      const file = parts[parts.length - 1];
      const dirs = parts.slice(0, -1);
      return SAFE_FILENAME_RE.test(file) && dirs.every(d => SAFE_SEGMENT_RE.test(d));
    }
    return false;
  }

  function parseStorageRef(value, options = {}) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed || isBase64DataUri(trimmed) || isBlobUrl(trimmed) || isPlaceholderImage(trimmed)) {
      return null;
    }

    // 1. Canonical storage://{bucket}/{objectPath}
    if (trimmed.startsWith('storage://')) {
      const rest = trimmed.slice('storage://'.length);
      const slashIdx = rest.indexOf('/');
      if (slashIdx <= 0) return null;
      const bucket = rest.slice(0, slashIdx);
      const objectPath = rest.slice(slashIdx + 1);
      if (!SAFE_SEGMENT_RE.test(bucket) || !isValidStorageObjectPath(objectPath)) return null;
      return {
        bucket,
        objectPath,
        ref: `storage://${bucket}/${objectPath}`,
        kind: 'storage',
        accessKind: 'private'
      };
    }

    // 2. Direct object path (canonical or legacy)
    if (isValidStorageObjectPath(trimmed)) {
      const bucket = options.defaultBucket || DEFAULT_BUCKET;
      return {
        bucket,
        objectPath: trimmed,
        ref: `storage://${bucket}/${trimmed}`,
        kind: 'path',
        accessKind: 'private'
      };
    }

    // 3. Supabase Storage HTTP(S) URL (public, signed, or authenticated)
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsedUrl = new URL(trimmed);
        if (options.expectedHost && parsedUrl.host !== options.expectedHost) {
          return null;
        }
        const match = /^\/storage\/v1\/object\/(public|sign|authenticated)\/([^/]+)\/(.+)$/.exec(parsedUrl.pathname);
        if (!match) return null;
        const accessKind = match[1] === 'public' ? 'public' : 'signed';
        const bucket = decodeURIComponent(match[2]);
        const objectPath = decodeURIComponent(match[3]);
        if (!SAFE_SEGMENT_RE.test(bucket) || !isValidStorageObjectPath(objectPath)) return null;
        return {
          bucket,
          objectPath,
          ref: `storage://${bucket}/${objectPath}`,
          kind: 'supabase_url',
          accessKind
        };
      } catch (_) {
        return null;
      }
    }

    return null;
  }

  function parseShotImageApiUrl(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    const match = SHOT_IMAGE_API_RE.exec(trimmed);
    if (!match) return null;
    const projectId = decodeURIComponent(match[1]);
    const shotId = decodeURIComponent(match[2]);
    const queryStr = match[3] || '';
    const params = new URLSearchParams(queryStr);
    const historyRaw = params.get('history');
    const historyIndex = historyRaw !== null && /^\d+$/.test(historyRaw) ? Number.parseInt(historyRaw, 10) : null;
    return {
      projectId,
      shotId,
      historyIndex,
      isProxy: params.get('proxy') === '1' || params.get('proxy') === 'true',
      path: trimmed
    };
  }

  function decodeJwtExp(urlString) {
    if (typeof urlString !== 'string') return null;
    try {
      const parsed = new URL(urlString);
      const token = parsed.searchParams.get('token');
      if (!token) return null;
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      let jsonStr = '';
      if (typeof atob === 'function') {
        jsonStr = atob(padded);
      } else if (typeof Buffer !== 'undefined') {
        jsonStr = Buffer.from(padded, 'base64').toString('utf8');
      } else {
        return null;
      }
      const claims = JSON.parse(jsonStr);
      if (claims && typeof claims.exp === 'number' && Number.isFinite(claims.exp)) {
        return new Date(claims.exp * 1000).toISOString();
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  function isExpiresSoonOrExpired(expiresAt, bufferMs = 60000, nowMs = Date.now()) {
    const iso = toIsoTimestamp(expiresAt);
    if (!iso) return false;
    const expMs = Date.parse(iso);
    if (!Number.isFinite(expMs)) return false;
    return expMs <= (nowMs + bufferMs);
  }

  function inferMimeType(urlOrRef, explicitMime) {
    if (typeof explicitMime === 'string' && /^image\/(png|jpeg|jpg|webp)$/i.test(explicitMime.trim())) {
      return explicitMime.trim().toLowerCase().replace('image/jpg', 'image/jpeg');
    }
    if (typeof urlOrRef === 'string') {
      const clean = urlOrRef.split('?')[0].split('#')[0];
      const extMatch = /\.([a-zA-Z0-9]+)$/.exec(clean);
      if (extMatch) {
        const mime = EXT_TO_MIME[extMatch[1].toLowerCase()];
        if (mime) return mime;
      }
    }
    return null;
  }

  function buildShotImageApiUrl(projectId, shotId, options = {}) {
    if (!projectId || !shotId) return null;
    const base = `/api/projects/${encodeURIComponent(String(projectId))}/shots/${encodeURIComponent(String(shotId))}/image`;
    const params = [];
    if (options.historyIndex !== null && options.historyIndex !== undefined && Number.isInteger(Number(options.historyIndex))) {
      params.push(`history=${encodeURIComponent(String(options.historyIndex))}`);
    }
    if (options.proxy) {
      params.push('proxy=1');
    }
    return params.length > 0 ? `${base}?${params.join('&')}` : base;
  }

  function extractImageAssetRef(imageAsset, defaultBucket = DEFAULT_BUCKET) {
    if (!imageAsset || typeof imageAsset !== 'object') return null;
    if (typeof imageAsset.storageRef === 'string' && imageAsset.storageRef.trim()) {
      return imageAsset.storageRef.trim();
    }
    const rawPath = typeof imageAsset.path === 'string'
      ? imageAsset.path.trim()
      : (typeof imageAsset.objectPath === 'string' ? imageAsset.objectPath.trim() : '');
    if (rawPath) {
      if (rawPath.startsWith('storage://')) return rawPath;
      const bucket = typeof imageAsset.bucket === 'string' && imageAsset.bucket.trim()
        ? imageAsset.bucket.trim()
        : defaultBucket;
      return `storage://${bucket}/${rawPath.replace(/^\/+/, '')}`;
    }
    if (typeof imageAsset.url === 'string' && imageAsset.url.trim()) {
      return imageAsset.url.trim();
    }
    return null;
  }

  /**
   * Resolve a shot payload or history entry into a canonical image descriptor.
   * Priority:
   * 1. imageRef
   * 2. imageAsset (bucket/path/storageRef/url)
   * 3. image
   * 4. Protected shot image API path (when projectId & shotId exist and status isn't failed/missing)
   */
  function resolveImageAssetDescriptor(source, options = {}) {
    const src = source && typeof source === 'object' ? source : {};
    const defaultBucket = options.defaultBucket || DEFAULT_BUCKET;
    const projectId = options.projectId || null;
    const shotId = options.shotId || null;
    const historyIndex = options.historyIndex !== undefined ? options.historyIndex : null;

    const explicitStatus = src.imageStatus || src.status || null;
    const uploadStatus = src.uploadStatus || null;
    const explicitAccess = src.imageAccess || src.access || null;
    const explicitExpiresAt = toIsoTimestamp(src.imageExpiresAt || src.expiresAt);
    const explicitMime = src.imageMimeType || src.mimeType || src.imageAsset?.mimeType || null;

    const rawRef = typeof src.imageRef === 'string' ? src.imageRef.trim() : '';
    const rawAssetVal = extractImageAssetRef(src.imageAsset, defaultBucket) || '';
    const rawImage = typeof src.image === 'string' ? src.image.trim() : '';

    // Fast-path: unsaved in-memory Base64 or Blob
    const temporaryDataUri = isBase64DataUri(rawImage) ? rawImage : (isBase64DataUri(rawRef) ? rawRef : null);
    if (temporaryDataUri || isBlobUrl(rawImage) || isBlobUrl(rawRef)) {
      return {
        hasSource: true,
        sourceType: temporaryDataUri ? 'base64' : 'blob',
        storageRef: null,
        httpUrl: null,
        apiUrl: null,
        proxyUrl: null,
        temporaryDataUri,
        status: 'unsaved',
        access: 'unsaved',
        availability: 'unavailable',
        expiresAt: null,
        mimeType: inferMimeType(null, explicitMime)
      };
    }

    if (uploadStatus === 'pending_retry') {
      return {
        hasSource: Boolean(rawRef || rawAssetVal || rawImage),
        sourceType: 'pending_retry',
        storageRef: parseStorageRef(rawRef, { defaultBucket })?.ref || parseStorageRef(rawAssetVal, { defaultBucket })?.ref || null,
        httpUrl: null,
        apiUrl: null,
        proxyUrl: null,
        temporaryDataUri: null,
        status: 'pending',
        access: 'none',
        availability: 'unavailable',
        expiresAt: null,
        mimeType: inferMimeType(rawRef || rawAssetVal, explicitMime)
      };
    }

    if (explicitStatus === 'failed') {
      return {
        hasSource: false,
        sourceType: 'failed',
        storageRef: null,
        httpUrl: null,
        apiUrl: null,
        proxyUrl: null,
        temporaryDataUri: null,
        status: 'failed',
        access: 'none',
        availability: 'unavailable',
        expiresAt: null,
        mimeType: null
      };
    }

    // Evaluate candidates in priority order without discarding valid fallbacks if an earlier field is invalid
    const candidates = [
      { key: 'imageRef', val: rawRef },
      { key: 'imageAsset', val: rawAssetVal },
      { key: 'image', val: rawImage }
    ];

    let parsedStorage = null;
    let httpUrl = null;
    let apiUrl = null;
    let sourceType = 'none';

    for (const c of candidates) {
      if (!c.val || isPlaceholderImage(c.val) || isBase64DataUri(c.val) || isBlobUrl(c.val)) continue;

      const parsed = parseStorageRef(c.val, { defaultBucket });
      if (parsed) {
        if (!parsedStorage) {
          parsedStorage = parsed;
          if (sourceType === 'none') sourceType = parsed.kind;
        }
        if (/^https?:\/\//i.test(c.val) && !httpUrl) {
          httpUrl = c.val;
          sourceType = parsed.kind;
        }
        continue;
      }

      const apiParsed = parseShotImageApiUrl(c.val);
      if (apiParsed) {
        if (!apiUrl) {
          apiUrl = apiParsed.path;
          if (sourceType === 'none') sourceType = 'api';
        }
        continue;
      }

      if (/^https?:\/\//i.test(c.val)) {
        if (!httpUrl) {
          httpUrl = c.val;
          if (sourceType === 'none') sourceType = 'external_url';
        }
      }
    }

    // Build protected proxy URL whenever we have projectId & shotId and either a source exists or status is unknown/pending
    const proxyUrl = buildShotImageApiUrl(projectId, shotId, { historyIndex, proxy: true });
    const fallbackApiUrl = apiUrl || buildShotImageApiUrl(projectId, shotId, { historyIndex, proxy: false });

    const hasValidSource = Boolean(parsedStorage || httpUrl || apiUrl);
    if (!hasValidSource) {
      const lifecycle = explicitStatus === 'pending' ? 'pending' : 'missing';
      return {
        hasSource: false,
        sourceType: 'none',
        storageRef: null,
        httpUrl: null,
        apiUrl: null,
        proxyUrl: null,
        temporaryDataUri: null,
        status: lifecycle,
        access: 'none',
        availability: 'unavailable',
        expiresAt: null,
        mimeType: null
      };
    }

    // Determine access type
    let access = explicitAccess;
    if (access !== 'signed' && access !== 'public' && access !== 'private' && access !== 'api' && access !== 'external') {
      if (parsedStorage?.kind === 'supabase_url') {
        access = parsedStorage.accessKind;
      } else if (httpUrl && /\/storage\/v1\/object\/sign\//.test(httpUrl)) {
        access = 'signed';
      } else if (httpUrl && /\/storage\/v1\/object\/public\//.test(httpUrl)) {
        access = 'public';
      } else if (httpUrl) {
        access = parsedStorage ? 'public' : 'external';
      } else if (apiUrl) {
        access = 'api';
      } else {
        access = 'private';
      }
    }

    let expiresAt = explicitExpiresAt;
    if (access === 'signed' && !expiresAt && httpUrl) {
      expiresAt = decodeJwtExp(httpUrl);
    }
    if (access === 'public' || access === 'api') {
      expiresAt = null;
    }

    // Determine availability independently from lifecycle status
    let availability = 'unchecked';
    if (httpUrl) {
      if (access === 'signed' && expiresAt && isExpiresSoonOrExpired(expiresAt, 0)) {
        availability = 'expired';
      } else {
        availability = 'unchecked';
      }
    } else if (apiUrl && !parsedStorage) {
      availability = 'requires_auth';
    } else if (parsedStorage) {
      availability = 'unresolved';
    }

    const storageRef = parsedStorage ? parsedStorage.ref : null;
    const mimeType = inferMimeType(storageRef || httpUrl || apiUrl, explicitMime);

    return {
      hasSource: true,
      sourceType,
      storageRef,
      httpUrl,
      apiUrl: fallbackApiUrl,
      proxyUrl,
      temporaryDataUri: null,
      status: 'succeeded',
      access,
      availability,
      expiresAt,
      mimeType
    };
  }

  function summarizeImageSourceForDebug(descriptor, shotId = null) {
    if (!descriptor) return { shotId, sourceType: 'none', status: 'missing' };
    return {
      shotId,
      sourceType: descriptor.sourceType,
      hasStorageRef: Boolean(descriptor.storageRef),
      hasHttpUrl: Boolean(descriptor.httpUrl),
      hasApiUrl: Boolean(descriptor.apiUrl),
      status: descriptor.status,
      access: descriptor.access,
      availability: descriptor.availability
    };
  }

  const api = {
    DEFAULT_BUCKET,
    EXT_TO_MIME,
    isBase64DataUri,
    isBlobUrl,
    isPlaceholderImage,
    toIsoTimestamp,
    isValidStorageObjectPath,
    parseStorageRef,
    parseShotImageApiUrl,
    decodeJwtExp,
    isExpiresSoonOrExpired,
    inferMimeType,
    buildShotImageApiUrl,
    extractImageAssetRef,
    resolveImageAssetDescriptor,
    summarizeImageSourceForDebug
  };

  if (typeof root !== 'undefined') {
    root.StoryboardImageAssetResolver = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
