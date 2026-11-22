'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_BUCKET = 'storyboard-images';
const MAX_IMAGE_BYTES = Number(process.env.STORYBOARD_IMAGE_MAX_BYTES || 15 * 1024 * 1024);
const DEFAULT_SIGNED_URL_TTL = Number(process.env.SUPABASE_SIGNED_URL_TTL_SECONDS || 3600);

const MIME_TO_EXT = Object.freeze({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp'
});

const EXT_TO_MIME = Object.freeze({
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp'
});

const SAFE_SEGMENT_RE = /^[A-Za-z0-9_-]{1,128}$/;
const CANONICAL_PATH_RE = /^projects\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.(png|jpg|jpeg|webp)$/i;
const LEGACY_PATH_RE = /^([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.(png|jpg|jpeg|webp)$/i;
const DATA_IMAGE_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i;

function getBucketName(env = process.env) {
    return String(env.SUPABASE_STORAGE_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
}

function getAccessMode(env = process.env) {
    const raw = String(env.SUPABASE_STORAGE_ACCESS_MODE || '').trim().toLowerCase();
    if (raw === 'public' || raw === 'signed' || raw === 'private') {
        return raw === 'private' ? 'signed' : raw;
    }
    if (String(env.SUPABASE_STORAGE_PRIVATE || '').trim().toLowerCase() === 'true') {
        return 'signed';
    }
    // Default to signed URLs when Supabase is configured; falls back gracefully for legacy public URLs.
    return 'signed';
}

function getSignedUrlTtl(env = process.env) {
    const parsed = Number(env.SUPABASE_SIGNED_URL_TTL_SECONDS || DEFAULT_SIGNED_URL_TTL);
    if (!Number.isFinite(parsed) || parsed < 60) return DEFAULT_SIGNED_URL_TTL;
    return Math.min(parsed, 86400);
}

function isSupabaseStorageConfigured(env = process.env) {
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
    return Boolean(env.SUPABASE_URL && key);
}

let cachedClientKey = '';
let cachedClient = null;

function createStorageClient(options = {}) {
    const env = options.env || process.env;
    const bucket = options.bucket || getBucketName(env);
    if (options.storageBucketClient) {
        return { bucket, storage: options.storageBucketClient };
    }
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
        const err = new Error('Supabase Storage 尚未設定完成，無法儲存圖片。');
        err.code = 'STORAGE_NOT_CONFIGURED';
        err.status = 503;
        throw err;
    }
    const cacheKey = `${url}::${key}`;
    if (!cachedClient || cachedClientKey !== cacheKey) {
        cachedClient = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
        cachedClientKey = cacheKey;
    }
    return {
        bucket,
        storage: cachedClient.storage.from(bucket)
    };
}

function isBase64DataUri(value) {
    return typeof value === 'string' && /^data:image\//i.test(value.trim());
}

function detectMimeFromBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    ) {
        return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    // WebP: RIFF....WEBP
    if (
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
    ) {
        return 'image/webp';
    }
    return null;
}

function sha256Buffer(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function validateImageBuffer(buffer, declaredMimeType, options = {}) {
    const maxBytes = options.maxBytes || MAX_IMAGE_BYTES;
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        const err = new Error('圖片內容為空或格式無效');
        err.code = 'INVALID_IMAGE_DATA';
        err.status = 400;
        throw err;
    }
    if (buffer.length > maxBytes) {
        const err = new Error(`圖片大小超過上限 (${Math.round(maxBytes / (1024 * 1024))}MB)`);
        err.code = 'IMAGE_TOO_LARGE';
        err.status = 413;
        throw err;
    }
    const detectedMime = detectMimeFromBuffer(buffer);
    if (!detectedMime || !MIME_TO_EXT[detectedMime]) {
        const err = new Error('不支援的圖片格式或圖片內容已損毀（僅支援 PNG、JPEG、WebP）');
        err.code = 'UNSUPPORTED_IMAGE_FORMAT';
        err.status = 400;
        throw err;
    }
    if (declaredMimeType) {
        const normalized = String(declaredMimeType).trim().toLowerCase().replace('image/jpg', 'image/jpeg');
        if (!MIME_TO_EXT[normalized]) {
            const err = new Error('不支援的圖片 Content-Type');
            err.code = 'UNSUPPORTED_IMAGE_FORMAT';
            err.status = 400;
            throw err;
        }
        if (normalized !== detectedMime) {
            const err = new Error(`圖片實際內容 (${detectedMime}) 與宣告格式 (${normalized}) 不符`);
            err.code = 'IMAGE_MIME_MISMATCH';
            err.status = 400;
            throw err;
        }
    }
    return {
        mimeType: detectedMime,
        ext: MIME_TO_EXT[detectedMime],
        size: buffer.length,
        sha256: sha256Buffer(buffer)
    };
}

function parseBase64DataUri(dataUri, options = {}) {
    if (typeof dataUri !== 'string') {
        const err = new Error('圖片資料必須為字串');
        err.code = 'INVALID_IMAGE_DATA';
        err.status = 400;
        throw err;
    }
    const match = DATA_IMAGE_RE.exec(dataUri.trim());
    if (!match) {
        const err = new Error('無效的 Base64 圖片格式');
        err.code = 'INVALID_IMAGE_DATA';
        err.status = 400;
        throw err;
    }
    const declaredMime = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
    const rawBase64 = match[2].replace(/\s+/g, '');
    if (!rawBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(rawBase64)) {
        const err = new Error('Base64 編碼格式損毀');
        err.code = 'INVALID_IMAGE_DATA';
        err.status = 400;
        throw err;
    }
    const buffer = Buffer.from(rawBase64, 'base64');
    const meta = validateImageBuffer(buffer, declaredMime, options);
    return {
        buffer,
        ...meta
    };
}

function sanitizeSegment(value, label) {
    const str = String(value || '').trim();
    if (!SAFE_SEGMENT_RE.test(str) || str === '.' || str === '..') {
        const err = new Error(`無效的 ${label} 識別碼`);
        err.code = 'INVALID_STORAGE_PATH';
        err.status = 400;
        throw err;
    }
    return str;
}

function buildObjectPath(projectId, shotId, ext, imageId = randomUUID()) {
    const safeProject = sanitizeSegment(projectId, 'projectId');
    const safeShot = sanitizeSegment(shotId, 'shotId');
    const safeImage = sanitizeSegment(imageId, 'imageId');
    const cleanExt = String(ext || '').trim().toLowerCase().replace(/^\./, '');
    if (!EXT_TO_MIME[cleanExt]) {
        const err = new Error('不支援的圖片副檔名');
        err.code = 'UNSUPPORTED_IMAGE_FORMAT';
        err.status = 400;
        throw err;
    }
    return `projects/${safeProject}/${safeShot}/${safeImage}.${cleanExt}`;
}

function toStorageRef(bucket, objectPath) {
    const safeBucket = sanitizeSegment(bucket || getBucketName(), 'bucket');
    const cleanPath = String(objectPath || '').replace(/^\/+/, '');
    if (!isValidStorageObjectPath(cleanPath)) {
        const err = new Error('無效的 Storage 物件路徑');
        err.code = 'INVALID_STORAGE_PATH';
        err.status = 400;
        throw err;
    }
    return `storage://${safeBucket}/${cleanPath}`;
}

function isValidStorageObjectPath(objectPath) {
    if (typeof objectPath !== 'string') return false;
    const trimmed = objectPath.trim();
    if (!trimmed || trimmed.includes('..') || trimmed.includes('\\') || trimmed.startsWith('/')) {
        return false;
    }
    return CANONICAL_PATH_RE.test(trimmed) || LEGACY_PATH_RE.test(trimmed);
}

function parseStorageRef(value, options = {}) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    // 1. Canonical storage://{bucket}/{objectPath}
    if (trimmed.startsWith('storage://')) {
        const rest = trimmed.slice('storage://'.length);
        const slashIdx = rest.indexOf('/');
        if (slashIdx <= 0) return null;
        const bucket = rest.slice(0, slashIdx);
        const objectPath = rest.slice(slashIdx + 1);
        if (!SAFE_SEGMENT_RE.test(bucket) || !isValidStorageObjectPath(objectPath)) return null;
        return { bucket, objectPath, ref: `storage://${bucket}/${objectPath}`, kind: 'storage' };
    }

    // 2. Direct object path (canonical or legacy)
    if (isValidStorageObjectPath(trimmed)) {
        const bucket = options.bucket || getBucketName(options.env);
        return { bucket, objectPath: trimmed, ref: `storage://${bucket}/${trimmed}`, kind: 'path' };
    }

    // 3. Supabase Storage HTTP(S) URL (public or signed)
    if (/^https?:\/\//i.test(trimmed)) {
        try {
            const url = new URL(trimmed);
            const expectedHost = options.env?.SUPABASE_URL ? new URL(options.env.SUPABASE_URL).host : null;
            if (expectedHost && url.host !== expectedHost) {
                return null;
            }
            const match = /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/.exec(url.pathname);
            if (!match) return null;
            const bucket = decodeURIComponent(match[1]);
            const objectPath = decodeURIComponent(match[2]);
            if (!SAFE_SEGMENT_RE.test(bucket) || !isValidStorageObjectPath(objectPath)) return null;
            return { bucket, objectPath, ref: `storage://${bucket}/${objectPath}`, kind: 'supabase_url' };
        } catch (_) {
            return null;
        }
    }

    return null;
}

function isObjectPathOwnedByProject(objectPath, projectId, shotId = null) {
    if (!isValidStorageObjectPath(objectPath)) return false;
    const canonical = CANONICAL_PATH_RE.exec(objectPath);
    if (canonical) {
        if (canonical[1] !== String(projectId)) return false;
        if (shotId && canonical[2] !== String(shotId)) return false;
        return true;
    }
    const legacy = LEGACY_PATH_RE.exec(objectPath);
    if (legacy) {
        if (legacy[1] !== String(projectId)) return false;
        if (shotId && legacy[2] !== String(shotId)) return false;
        return true;
    }
    return false;
}

function assertNoBase64InShotPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    if (isBase64DataUri(payload.image)) {
        const err = new Error('禁止將 Base64 圖片直接寫入資料庫，請先上傳至圖片儲存空間。');
        err.code = 'BASE64_STORAGE_FORBIDDEN';
        err.status = 400;
        throw err;
    }
    if (Array.isArray(payload.imageHistory)) {
        for (const entry of payload.imageHistory) {
            if (entry && (isBase64DataUri(entry.image) || isBase64DataUri(entry.imageRef))) {
                const err = new Error('禁止將 Base64 歷史版本圖片直接寫入資料庫，請先上傳至圖片儲存空間。');
                err.code = 'BASE64_STORAGE_FORBIDDEN';
                err.status = 400;
                throw err;
            }
        }
    }
}

function normalizeIncomingImageRef(value, options = {}) {
    const { projectId, shotId, existingPayload = {}, env = process.env } = options;
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') {
        const err = new Error('無效的圖片引用格式');
        err.code = 'INVALID_IMAGE_REF';
        err.status = 400;
        throw err;
    }
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (isBase64DataUri(trimmed)) {
        const err = new Error('禁止將 Base64 圖片直接寫入資料庫，請先上傳至圖片儲存空間。');
        err.code = 'BASE64_STORAGE_FORBIDDEN';
        err.status = 400;
        throw err;
    }

    // Allow static local placeholder paths (e.g. ../icon/error.jpg)
    if (trimmed === '../icon/error.jpg' || trimmed === '/icon/error.jpg') {
        return trimmed;
    }

    // If client sends back our own shot image proxy endpoint, keep existing DB value
    if (projectId && shotId && trimmed.startsWith(`/api/projects/${projectId}/shots/${shotId}/image`)) {
        if (existingPayload.image && !isBase64DataUri(existingPayload.image)) {
            return existingPayload.image;
        }
        return null;
    }

    // Parse storage ref or Supabase URL (including signed URLs -> normalize back to permanent storage:// ref)
    const parsed = parseStorageRef(trimmed, { env });
    if (parsed) {
        if (projectId && !isObjectPathOwnedByProject(parsed.objectPath, projectId)) {
            // Also check if it is already an existing ref in this shot's payload/history
            const allowedExisting = new Set();
            const existingMain = parseStorageRef(existingPayload.image, { env });
            if (existingMain) allowedExisting.add(existingMain.ref);
            if (Array.isArray(existingPayload.imageHistory)) {
                for (const h of existingPayload.imageHistory) {
                    const parsedH = parseStorageRef(h?.imageRef || h?.image, { env });
                    if (parsedH) allowedExisting.add(parsedH.ref);
                }
            }
            if (!allowedExisting.has(parsed.ref)) {
                const err = new Error('圖片路徑不屬於此專案，拒絕寫入。');
                err.code = 'STORAGE_PATH_FORBIDDEN';
                err.status = 403;
                throw err;
            }
        }
        return parsed.ref;
    }

    // Reject untrusted arbitrary URLs (prevent SSRF / arbitrary URL injection)
    const err = new Error('不信任的圖片 URL，請透過系統圖片上傳流程儲存。');
    err.code = 'UNTRUSTED_IMAGE_URL';
    err.status = 400;
    throw err;
}

function normalizeImageHistoryForStorage(history, options = {}) {
    if (!Array.isArray(history)) return [];
    const maxEntries = options.maxEntries || 5;
    const normalized = [];
    const seen = new Set();

    for (const item of history) {
        if (!item || typeof item !== 'object') continue;
        const rawRef = item.imageRef || item.image;
        if (!rawRef) continue;
        const ref = normalizeIncomingImageRef(rawRef, options);
        if (!ref || ref === '../icon/error.jpg' || ref === '/icon/error.jpg') continue;
        if (seen.has(ref)) continue;
        seen.add(ref);
        normalized.push({
            version: item.version || (normalized.length + 1),
            image: ref,
            imageRef: ref,
            prompt: typeof item.prompt === 'string' ? item.prompt : '',
            createdAt: item.createdAt || new Date().toISOString(),
            ...(item.sha256 ? { sha256: item.sha256 } : {}),
            ...(item.mimeType ? { mimeType: item.mimeType } : {}),
            ...(item.size ? { size: item.size } : {})
        });
        if (normalized.length >= maxEntries) break;
    }

    return normalized;
}

async function uploadImageBuffer({
    projectId,
    shotId,
    buffer,
    mimeType,
    existingHistory = [],
    storageClient,
    env = process.env,
    imageId
}) {
    const meta = validateImageBuffer(buffer, mimeType);

    // Deduplicate against existing shot history if identical content hash already stored in this project
    if (Array.isArray(existingHistory)) {
        const duplicate = existingHistory.find(item => {
            if (!item || item.sha256 !== meta.sha256) return false;
            const parsed = parseStorageRef(item.imageRef || item.image, { env });
            return Boolean(parsed && isObjectPathOwnedByProject(parsed.objectPath, projectId));
        });
        if (duplicate) {
            const parsed = parseStorageRef(duplicate.imageRef || duplicate.image, { env });
            return {
                storageRef: parsed.ref,
                objectPath: parsed.objectPath,
                bucket: parsed.bucket,
                mimeType: meta.mimeType,
                size: meta.size,
                sha256: meta.sha256,
                deduplicated: true
            };
        }
    }

    const { bucket, storage } = createStorageClient({ storageBucketClient: storageClient, env });
    const objectPath = buildObjectPath(projectId, shotId, meta.ext, imageId || randomUUID());

    const { error: uploadError } = await storage.upload(objectPath, buffer, {
        contentType: meta.mimeType,
        upsert: false,
        cacheControl: '31536000'
    });
    if (uploadError) {
        const err = new Error(`圖片上傳至 Storage 失敗：${uploadError.message || '未知錯誤'}`);
        err.code = 'STORAGE_UPLOAD_FAILED';
        err.status = 502;
        err.cause = uploadError;
        throw err;
    }

    return {
        storageRef: toStorageRef(bucket, objectPath),
        objectPath,
        bucket,
        mimeType: meta.mimeType,
        size: meta.size,
        sha256: meta.sha256,
        deduplicated: false
    };
}

async function createSignedUpload({ projectId, shotId, contentType, storageClient, env = process.env }) {
    const normalizedMime = String(contentType || '').trim().toLowerCase().replace('image/jpg', 'image/jpeg');
    const ext = MIME_TO_EXT[normalizedMime];
    if (!ext) {
        const err = new Error('不支援的圖片格式（僅支援 PNG、JPEG、WebP）');
        err.code = 'UNSUPPORTED_IMAGE_FORMAT';
        err.status = 400;
        throw err;
    }

    const { bucket, storage } = createStorageClient({ storageBucketClient: storageClient, env });
    const objectPath = buildObjectPath(projectId, shotId, ext);
    const { data, error } = await storage.createSignedUploadUrl(objectPath);
    if (error || !data?.signedUrl) {
        const err = new Error(`無法建立圖片上傳網址：${error?.message || '未知錯誤'}`);
        err.code = 'STORAGE_UPLOAD_PREPARE_FAILED';
        err.status = 502;
        throw err;
    }

    const storageRef = toStorageRef(bucket, objectPath);
    const publicUrl = storage.getPublicUrl ? storage.getPublicUrl(objectPath)?.data?.publicUrl : null;
    return {
        uploadUrl: data.signedUrl,
        token: data.token || null,
        bucket,
        objectPath,
        storageRef,
        publicUrl: publicUrl || storageRef
    };
}

async function verifyUploadedObject({ bucket, objectPath, storageClient, env = process.env }) {
    if (!isValidStorageObjectPath(objectPath)) {
        const err = new Error('無效的圖片物件路徑');
        err.code = 'INVALID_STORAGE_PATH';
        err.status = 400;
        throw err;
    }
    const { storage } = createStorageClient({ storageBucketClient: storageClient, bucket, env });
    const lastSlash = objectPath.lastIndexOf('/');
    const folder = lastSlash >= 0 ? objectPath.slice(0, lastSlash) : '';
    const fileName = lastSlash >= 0 ? objectPath.slice(lastSlash + 1) : objectPath;

    if (typeof storage.list === 'function') {
        const { data, error } = await storage.list(folder, { search: fileName, limit: 10 });
        if (error) {
            const err = new Error(`驗證已上傳圖片失敗：${error.message || '未知錯誤'}`);
            err.code = 'STORAGE_VERIFY_FAILED';
            err.status = 502;
            throw err;
        }
        const found = Array.isArray(data) ? data.find(item => item.name === fileName) : null;
        if (!found) {
            const err = new Error('在 Storage 找不到已上傳的圖片，請重新上傳。');
            err.code = 'STORAGE_OBJECT_NOT_FOUND';
            err.status = 404;
            throw err;
        }
        const size = Number(found.metadata?.size || 0);
        if (size > MAX_IMAGE_BYTES) {
            const err = new Error('上傳的圖片超過檔案大小上限');
            err.code = 'IMAGE_TOO_LARGE';
            err.status = 413;
            throw err;
        }
        return {
            exists: true,
            size,
            mimeType: found.metadata?.mimetype || EXT_TO_MIME[fileName.split('.').pop().toLowerCase()] || 'image/png'
        };
    }

    return { exists: true, size: null, mimeType: null };
}

async function resolveImageUrl(imageValue, options = {}) {
    if (typeof imageValue !== 'string' || !imageValue.trim()) return null;
    const trimmed = imageValue.trim();

    if (isBase64DataUri(trimmed)) {
        // Legacy unmigrated base64: return fallback API stream endpoint if provided
        return options.legacyProxyUrl || null;
    }

    if (trimmed.startsWith('/api/') || trimmed.startsWith('../') || trimmed.startsWith('/icon/')) {
        return trimmed;
    }

    const env = options.env || process.env;
    const parsed = parseStorageRef(trimmed, { env });
    if (!parsed) {
        return trimmed;
    }

    const mode = options.accessMode || getAccessMode(env);

    // If storage credentials are not available in this environment, return public URL or legacy proxy URL
    if (!options.storageClient && !isSupabaseStorageConfigured(env)) {
        if (parsed.kind === 'supabase_url') return trimmed;
        if (options.legacyProxyUrl) return options.legacyProxyUrl;
        if (env.SUPABASE_URL) {
            return `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${parsed.bucket}/${parsed.objectPath}`;
        }
        return trimmed;
    }

    try {
        const { storage } = createStorageClient({
            storageBucketClient: options.storageClient,
            bucket: parsed.bucket,
            env
        });

        if (mode === 'signed' && typeof storage.createSignedUrl === 'function') {
            const ttl = options.ttlSeconds || getSignedUrlTtl(env);
            const { data, error } = await storage.createSignedUrl(parsed.objectPath, ttl);
            if (!error && data?.signedUrl) {
                return data.signedUrl;
            }
            if (options.strictSigned) {
                throw error || new Error('無法產生圖片存取網址');
            }
        }

        if (typeof storage.getPublicUrl === 'function') {
            const pub = storage.getPublicUrl(parsed.objectPath)?.data?.publicUrl;
            if (pub) return pub;
        }
    } catch (err) {
        if (options.strictSigned) throw err;
        console.warn('[StoryboardImages] resolveImageUrl fallback:', err.message);
    }

    if (parsed.kind === 'supabase_url') return trimmed;
    return options.legacyProxyUrl || trimmed;
}

async function resolveShotPayloadForResponse(shot, projectId, options = {}) {
    const rawPayload = shot?.payload && typeof shot.payload === 'object' ? shot.payload : {};
    const versionTs = shot?.updateAt ? new Date(shot.updateAt).getTime() : Date.now();
    const legacyProxyUrl = `/api/projects/${projectId}/shots/${shot.id}/image?v=${versionTs}`;

    const cleanPayload = { ...rawPayload };
    if (rawPayload.image) {
        const parsedMain = parseStorageRef(rawPayload.image, { env: options.env });
        if (parsedMain) {
            cleanPayload.imageRef = parsedMain.ref;
        }
        cleanPayload.image = await resolveImageUrl(rawPayload.image, {
            ...options,
            legacyProxyUrl
        });
    }

    if (Array.isArray(rawPayload.imageHistory)) {
        cleanPayload.imageHistory = await Promise.all(
            rawPayload.imageHistory.map(async (item, idx) => {
                if (!item || typeof item !== 'object') return item;
                const refSource = item.imageRef || item.image;
                const parsed = parseStorageRef(refSource, { env: options.env });
                const resolved = await resolveImageUrl(refSource, {
                    ...options,
                    legacyProxyUrl: isBase64DataUri(refSource)
                        ? `/api/projects/${projectId}/shots/${shot.id}/image?history=${idx}&v=${versionTs}`
                        : legacyProxyUrl
                });
                return {
                    ...item,
                    image: resolved || item.image,
                    ...(parsed ? { imageRef: parsed.ref } : {})
                };
            })
        );
    }

    return cleanPayload;
}

function extractStorageRefsFromShot(shot, env = process.env) {
    const refs = new Map(); // ref -> { bucket, objectPath, ref }
    const payload = shot?.payload && typeof shot.payload === 'object' ? shot.payload : {};

    const addIfValid = (val) => {
        const parsed = parseStorageRef(val, { env });
        if (parsed) refs.set(parsed.ref, parsed);
    };

    addIfValid(payload.image);
    addIfValid(payload.imageRef);
    if (payload.imageAsset?.path) {
        addIfValid(toStorageRef(payload.imageAsset.bucket || getBucketName(env), payload.imageAsset.path));
    }
    if (Array.isArray(payload.imageHistory)) {
        for (const item of payload.imageHistory) {
            if (!item || typeof item !== 'object') continue;
            addIfValid(item.imageRef);
            addIfValid(item.image);
        }
    }
    return Array.from(refs.values());
}

function extractStorageRefsFromProject(project, env = process.env) {
    const refs = new Map();
    const shots = Array.isArray(project?.shots) ? project.shots : [];
    for (const shot of shots) {
        for (const item of extractStorageRefsFromShot(shot, env)) {
            refs.set(item.ref, item);
        }
    }
    // Also check legacy Project.cover in case it holds an older storage URL
    if (project?.cover) {
        const parsedCover = parseStorageRef(project.cover, { env });
        if (parsedCover) refs.set(parsedCover.ref, parsedCover);
    }
    return Array.from(refs.values());
}

async function copyStorageObjectsForDuplicate({
    sourceShots = [],
    targetProjectId,
    targetShotIdByOrder,
    storageClient,
    env = process.env
}) {
    const copiedPaths = []; // [{ bucket, objectPath }] for rollback on partial failure
    const refMap = new Map(); // oldRef -> newRef

    const uniqueRefs = new Map();
    for (const shot of sourceShots) {
        const targetShotId = targetShotIdByOrder.get(shot.order) || randomUUID();
        for (const item of extractStorageRefsFromShot(shot, env)) {
            if (!uniqueRefs.has(item.ref)) {
                uniqueRefs.set(item.ref, { ...item, targetShotId });
            }
        }
    }

    if (uniqueRefs.size === 0) {
        return { refMap, copiedPaths };
    }

    try {
        for (const [oldRef, item] of uniqueRefs.entries()) {
            const { bucket, storage } = createStorageClient({
                storageBucketClient: storageClient,
                bucket: item.bucket,
                env
            });
            const extMatch = /\.([a-zA-Z0-9]+)$/.exec(item.objectPath);
            const ext = (extMatch ? extMatch[1] : 'png').toLowerCase();
            const newPath = buildObjectPath(targetProjectId, item.targetShotId, ext);
            const { error } = await storage.copy(item.objectPath, newPath);
            if (error) {
                const err = new Error(`複製專案圖片失敗：${error.message || '未知錯誤'}`);
                err.code = 'STORAGE_COPY_FAILED';
                err.status = 502;
                throw err;
            }
            copiedPaths.push({ bucket, objectPath: newPath });
            refMap.set(oldRef, toStorageRef(bucket, newPath));
        }
        return { refMap, copiedPaths };
    } catch (error) {
        // Rollback any already-copied objects so we leave no orphans
        if (copiedPaths.length > 0) {
            await removeStorageObjects(copiedPaths, { storageClient, env }).catch((rollbackErr) => {
                console.error('[StoryboardImages] Duplicate rollback cleanup failed:', rollbackErr.message);
            });
        }
        throw error;
    }
}

async function removeStorageObjects(items = [], options = {}) {
    const env = options.env || process.env;
    const byBucket = new Map();

    for (const item of items) {
        const parsed = typeof item === 'string'
            ? parseStorageRef(item, { env })
            : (item?.objectPath ? { bucket: item.bucket || getBucketName(env), objectPath: item.objectPath } : null);
        if (!parsed || !isValidStorageObjectPath(parsed.objectPath)) continue;
        if (!byBucket.has(parsed.bucket)) byBucket.set(parsed.bucket, new Set());
        byBucket.get(parsed.bucket).add(parsed.objectPath);
    }

    const deleted = [];
    const failed = [];

    for (const [bucket, pathSet] of byBucket.entries()) {
        const paths = Array.from(pathSet);
        if (paths.length === 0) continue;
        try {
            const { storage } = createStorageClient({
                storageBucketClient: options.storageClient,
                bucket,
                env
            });
            // Batch in chunks of 100
            for (let i = 0; i < paths.length; i += 100) {
                const chunk = paths.slice(i, i + 100);
                const { error } = await storage.remove(chunk);
                if (error) {
                    for (const p of chunk) {
                        failed.push({ bucket, objectPath: p, ref: toStorageRef(bucket, p), error: error.message || '刪除失敗' });
                    }
                } else {
                    for (const p of chunk) {
                        deleted.push(toStorageRef(bucket, p));
                    }
                }
            }
        } catch (err) {
            for (const p of paths) {
                failed.push({ bucket, objectPath: p, ref: toStorageRef(bucket, p), error: err.message || '刪除失敗' });
            }
        }
    }

    return { deleted, failed };
}

function rewriteShotPayloadWithRefMap(payload, refMap, env = process.env) {
    if (!payload || typeof payload !== 'object') return {};
    const next = { ...payload };

    if (next.image) {
        const parsed = parseStorageRef(next.image, { env });
        if (parsed && refMap.has(parsed.ref)) {
            next.image = refMap.get(parsed.ref);
            next.imageRef = next.image;
        }
    }
    if (next.imageRef) {
        const parsed = parseStorageRef(next.imageRef, { env });
        if (parsed && refMap.has(parsed.ref)) {
            next.imageRef = refMap.get(parsed.ref);
        }
    }
    if (Array.isArray(next.imageHistory)) {
        next.imageHistory = next.imageHistory.map(item => {
            if (!item || typeof item !== 'object') return item;
            const parsed = parseStorageRef(item.imageRef || item.image, { env });
            if (parsed && refMap.has(parsed.ref)) {
                const mapped = refMap.get(parsed.ref);
                return { ...item, image: mapped, imageRef: mapped };
            }
            return { ...item };
        });
    }
    return next;
}

module.exports = {
    DEFAULT_BUCKET,
    MAX_IMAGE_BYTES,
    MIME_TO_EXT,
    EXT_TO_MIME,
    getBucketName,
    getAccessMode,
    getSignedUrlTtl,
    isSupabaseStorageConfigured,
    createStorageClient,
    isBase64DataUri,
    detectMimeFromBuffer,
    sha256Buffer,
    validateImageBuffer,
    parseBase64DataUri,
    buildObjectPath,
    toStorageRef,
    isValidStorageObjectPath,
    parseStorageRef,
    isObjectPathOwnedByProject,
    assertNoBase64InShotPayload,
    normalizeIncomingImageRef,
    normalizeImageHistoryForStorage,
    uploadImageBuffer,
    createSignedUpload,
    verifyUploadedObject,
    resolveImageUrl,
    resolveShotPayloadForResponse,
    extractStorageRefsFromShot,
    extractStorageRefsFromProject,
    copyStorageObjectsForDuplicate,
    removeStorageObjects,
    rewriteShotPayloadWithRefMap
};
