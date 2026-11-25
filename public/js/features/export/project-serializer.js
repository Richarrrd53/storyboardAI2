/**
 * StoryboardAI — Shared Project Serializer (Export System V2)
 *
 * Converts saved API project objects or unsaved GenerationTask snapshots into:
 * 1. Standardized StoryboardAI Project JSON V2 (`storyboardai.project` / `2.0.0`)
 * 2. Shared structured export model consumed by both JSON and PDF exporters
 */
(function (root) {
  'use strict';

  const FORMAT_ID = 'storyboardai.project';
  const SCHEMA_VERSION = '2.1.0';
  const SUPPORTED_SCHEMA_VERSIONS = new Set(['2.0.0', '2.1.0']);

  function getResolver() {
    if (root.StoryboardImageAssetResolver) return root.StoryboardImageAssetResolver;
    if (typeof require === 'function') return require('./image-asset-resolver.js');
    throw new Error('StoryboardImageAssetResolver 尚未載入');
  }

  const FORBIDDEN_KEYS = new Set([
    'password', 'passwordHash', 'password_hash',
    'email', 'userEmail', 'authorEmail',
    'apiKey', 'api_key', 'apiKeys', 'apiCredentials', 'api_credentials',
    'serviceRoleKey', 'service_role_key', 'secretKey', 'secret_key',
    'jwt', 'accessToken', 'access_token', 'refreshToken', 'refresh_token',
    'authorization', 'cookie', 'cookies',
    'cronSecret', 'cron_secret', 'cleanupJob', 'cleanup_job',
    'authorId', 'author_id', 'author', 'userId', 'user_id',
    'plan', 'subscription', 'billing', 'aiProvider',
    'is_deleted', 'deletedAt', 'retention',
    'stack', 'debug', 'internalError', 'rawResponse'
  ]);

  const PRIMARY_SHOT_PAYLOAD_KEYS = new Set([
    'cameraDetails', 'angle', 'emotion', 'purpose', 'dialogue', 'note',
    'characters', 'sourceStructureId', 'sourceShot',
    'shotPrompt', 'prompt', 'finalPrompt',
    'image', 'imageRef', 'imageAsset', 'imageHistory',
    'imageStatus', 'imageError', 'imageAccess', 'imageExpiresAt', 'imageMimeType',
    'uploadStatus', 'uploadError', 'regeneratedAt'
  ]);

  const SAFE_ADDITIONAL_CREATIVE_KEYS = new Set([
    'lighting', 'sound', 'audio', 'sfx', 'music', 'bgm',
    'transition', 'pacing', 'lens', 'focalLength', 'colorPalette',
    'location', 'setting', 'timeOfDay', 'props', 'wardrobe',
    'action', 'blocking', 'voiceover', 'narration', 'subtitle',
    'subtitleText', 'visualFocus', 'composition', 'referenceNotes'
  ]);

  const CREATIVE_BRIEF_KEYS = [
    'subject', 'purpose', 'direction', 'audience', 'tone',
    'baseStyle', 'visualStyle', 'styleNotes', 'visualKeywords',
    'constraints', 'avoid', 'duration', 'ratio', 'settingsReason',
    'originalStory', 'requirements', 'answers'
  ];

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
  const CANONICAL_PATH_RE = /^projects\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.(png|jpg|jpeg|webp)$/i;
  const LEGACY_PATH_RE = /^([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\.(png|jpg|jpeg|webp)$/i;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

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
      // Handle Taipei formatted strings like "2026-11-24 23:40:00"
      let candidate = trimmed;
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(trimmed)) {
        candidate = trimmed.replace(/\s+/, 'T') + '+08:00';
      }
      const parsed = new Date(candidate);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    return null;
  }

  function parseDurationSeconds(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    // mm:ss format (e.g. "00:05", "1:30")
    const clockMatch = /^(\d{1,2}):(\d{2})(?:\.(\d+))?$/.exec(trimmed);
    if (clockMatch) {
      const mins = Number(clockMatch[1]);
      const secs = Number(clockMatch[2] + (clockMatch[3] ? '.' + clockMatch[3] : ''));
      const total = mins * 60 + secs;
      return Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : null;
    }

    // Strict numeric + optional seconds unit ("3", "3s", "3.5 sec", "3秒", "3.5 秒")
    const secMatch = /^(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds|秒)?$/i.exec(trimmed);
    if (secMatch) {
      const num = Number(secMatch[1]);
      return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
    }

    // Minutes unit ("1m", "1.5 min", "2分", "2分鐘")
    const minMatch = /^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes|分|分鐘)$/i.exec(trimmed);
    if (minMatch) {
      const num = Number(minMatch[1]) * 60;
      return Number.isFinite(num) && num > 0 ? Math.round(num * 100) / 100 : null;
    }

    return null;
  }

  function isValidStorageObjectPath(objectPath) {
    if (typeof objectPath !== 'string') return false;
    const trimmed = objectPath.trim();
    if (!trimmed || trimmed.includes('..') || trimmed.includes('\\') || trimmed.startsWith('/')) {
      return false;
    }
    return CANONICAL_PATH_RE.test(trimmed) || LEGACY_PATH_RE.test(trimmed);
  }

  function parseStorageRef(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('storage://')) {
      const rest = trimmed.slice('storage://'.length);
      const slashIdx = rest.indexOf('/');
      if (slashIdx <= 0) return null;
      const bucket = rest.slice(0, slashIdx);
      const objectPath = rest.slice(slashIdx + 1);
      if (!SAFE_SEGMENT_RE.test(bucket) || !isValidStorageObjectPath(objectPath)) return null;
      return { bucket, objectPath, ref: `storage://${bucket}/${objectPath}`, kind: 'storage' };
    }

    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsedUrl = new URL(trimmed);
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

  function inferMimeType(urlOrRef, explicitMime) {
    if (typeof explicitMime === 'string' && /^image\/(png|jpeg|webp)$/i.test(explicitMime.trim())) {
      return explicitMime.trim().toLowerCase();
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

  function sanitizeValue(value, depth = 0) {
    if (depth > 8) return null;
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      if (isBase64DataUri(value) || isBlobUrl(value)) return null;
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
      return value
        .map(item => sanitizeValue(item, depth + 1))
        .filter(item => item !== undefined);
    }
    if (isPlainObject(value)) {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (FORBIDDEN_KEYS.has(k)) continue;
        if (typeof v === 'string' && (isBase64DataUri(v) || isBlobUrl(v))) continue;
        const clean = sanitizeValue(v, depth + 1);
        if (clean !== undefined) out[k] = clean;
      }
      return out;
    }
    return null;
  }

  function sanitizeCreativeBrief(rawBrief) {
    if (!isPlainObject(rawBrief)) return null;
    // Handle both flat confirmed brief and wrapped { confirmed, originalStory, ... } shape
    const source = isPlainObject(rawBrief.confirmed)
      ? { ...rawBrief.confirmed, ...(rawBrief.originalStory ? { originalStory: rawBrief.originalStory } : {}), ...(Array.isArray(rawBrief.requirements) && rawBrief.requirements.length ? { requirements: rawBrief.requirements } : {}) }
      : rawBrief;

    const out = {};
    for (const key of CREATIVE_BRIEF_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const val = source[key];
      if (val === null || val === undefined) continue;
      if (typeof val === 'string' && !val.trim()) continue;
      if (Array.isArray(val) && val.length === 0) continue;
      out[key] = sanitizeValue(val);
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  function sanitizeTemplate(metadata) {
    if (!isPlainObject(metadata)) return null;
    const id = typeof metadata.templateId === 'string' && metadata.templateId.trim()
      ? metadata.templateId.trim()
      : (typeof metadata.templateSnapshot?.id === 'string' && metadata.templateSnapshot.id.trim()
        ? metadata.templateSnapshot.id.trim()
        : null);
    const snapshot = isPlainObject(metadata.templateSnapshot) ? sanitizeValue(metadata.templateSnapshot) : null;
    const values = isPlainObject(metadata.templateValues) ? sanitizeValue(metadata.templateValues) : {};

    if (!id && !snapshot && Object.keys(values).length === 0) {
      return null;
    }

    const name = (typeof snapshot?.name === 'string' && snapshot.name.trim())
      || (typeof snapshot?.title === 'string' && snapshot.title.trim())
      || (typeof metadata.templateName === 'string' && metadata.templateName.trim())
      || null;

    return {
      id,
      name,
      values,
      snapshot
    };
  }

  function sanitizeCharacters(rawCharacters) {
    if (!isPlainObject(rawCharacters)) return {};
    const out = {};
    for (const [charId, charData] of Object.entries(rawCharacters)) {
      if (!charId || FORBIDDEN_KEYS.has(charId)) continue;
      if (isPlainObject(charData)) {
        const clean = sanitizeValue(charData);
        if (clean && Object.keys(clean).length > 0) {
          out[charId] = clean;
        }
      } else if (typeof charData === 'string' && charData.trim()) {
        out[charId] = { description: charData.trim() };
      }
    }
    return out;
  }

  function normalizeTags(rawTags, metadata) {
    const src = Array.isArray(rawTags) ? rawTags : (Array.isArray(metadata?.tags) ? metadata.tags : []);
    return Array.from(new Set(
      src.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean)
    ));
  }

  function extractAdditionalData(payload) {
    if (!isPlainObject(payload)) return {};
    const out = {};
    for (const [key, val] of Object.entries(payload)) {
      if (PRIMARY_SHOT_PAYLOAD_KEYS.has(key) || FORBIDDEN_KEYS.has(key)) continue;
      if (!SAFE_ADDITIONAL_CREATIVE_KEYS.has(key)) continue;
      if (val === null || val === undefined) continue;
      if (typeof val === 'string' && (!val.trim() || isBase64DataUri(val) || isBlobUrl(val))) continue;
      const clean = sanitizeValue(val);
      if (clean !== null && clean !== undefined) {
        out[key] = clean;
      }
    }
    return out;
  }

  function normalizeCameraDetails(payload) {
    if (!isPlainObject(payload?.cameraDetails)) return {};
    const clean = sanitizeValue(payload.cameraDetails);
    return isPlainObject(clean) ? clean : {};
  }

  /**
   * Asset registry: deduplicates images by permanent storageRef first, then by URL/API path.
   * Never registers Base64 data URIs, Blob URLs, or error placeholders.
   */
  function createAssetRegistry() {
    const resolver = getResolver();
    const assets = {};
    const keyToAssetId = new Map();
    let seq = 0;

    function registerImage(sourceObj, options = {}) {
      const desc = resolver.resolveImageAssetDescriptor(sourceObj, options);

      if (desc.status === 'unsaved') {
        return { assetId: null, status: 'unsaved', descriptor: desc };
      }
      if (desc.status === 'pending') {
        return { assetId: null, status: 'pending', descriptor: desc };
      }
      if (desc.status === 'failed') {
        return { assetId: null, status: 'failed', descriptor: desc };
      }
      if (!desc.hasSource || desc.status === 'missing') {
        return { assetId: null, status: 'missing', descriptor: desc };
      }

      const dedupeKey = desc.storageRef || desc.httpUrl || desc.apiUrl;
      if (!dedupeKey) {
        return { assetId: null, status: 'missing', descriptor: desc };
      }

      if (keyToAssetId.has(dedupeKey)) {
        const existingId = keyToAssetId.get(dedupeKey);
        const existing = assets[existingId];
        if (!existing.url && desc.httpUrl) {
          existing.url = desc.httpUrl;
          existing.availability = desc.availability;
        }
        if (!existing.expiresAt && desc.expiresAt) {
          existing.expiresAt = desc.expiresAt;
        }
        if (!existing.mimeType && desc.mimeType) {
          existing.mimeType = desc.mimeType;
        }
        return { assetId: existingId, status: 'succeeded', descriptor: desc };
      }

      const assetId = `asset-${String(++seq).padStart(3, '0')}`;
      const record = {
        type: 'image',
        url: desc.httpUrl || null,
        storageRef: desc.storageRef || null,
        access: desc.access,
        availability: desc.availability,
        expiresAt: desc.expiresAt || null,
        mimeType: desc.mimeType || null
      };

      assets[assetId] = record;
      keyToAssetId.set(dedupeKey, assetId);
      return { assetId, status: 'succeeded', descriptor: desc };
    }

    return { assets, registerImage };
  }

  /**
   * Build a clean filename safe across Windows, macOS, Android, and iOS.
   */
  function buildExportFilename(title, extension, date = new Date()) {
    const ext = String(extension || 'json').replace(/^\./, '').toLowerCase();
    let raw = typeof title === 'string' ? title.trim() : '';
    // Avoid bare UUIDs as filenames
    if (!raw || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
      raw = 'storyboard';
    }
    const safeTitle = raw
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[._]+|[._]+$/g, '')
      .slice(0, 64) || 'storyboard';

    const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${safeTitle}_storyboard_${yyyy}${mm}${dd}.${ext}`;
  }

  /**
   * Convert an unsaved GenerationTask state into a project-like input for serializeProject.
   */
  function normalizeGenerationTask(task) {
    if (!task || !task.result) return null;
    const input = task.input || {};
    const result = task.result || {};
    const storyboardData = result.storyboardData || {};
    const rawShots = Array.isArray(result.generatedShotData) && result.generatedShotData.length > 0
      ? result.generatedShotData
      : (Array.isArray(storyboardData.shots) ? storyboardData.shots : []);

    const isTemplate = Boolean(input.selectedTemplate);
    const title = storyboardData.meta?.title
      || (typeof input.story === 'string' && input.story.trim() ? input.story.trim().slice(0, 48) : '未命名分鏡');

    return {
      id: task.projectId || null,
      title,
      style: typeof input.style === 'string' ? input.style : (input.style?.name || ''),
      ratio: input.ratio || '',
      tags: [],
      createAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _unsaved: !task.projectId || task.save?.status !== 'saved',
      metadata: {
        originalStory: input.story || '',
        generationMode: isTemplate ? 'template' : 'freeform',
        templateId: input.selectedTemplate?.id || null,
        templateValues: input.templateValues || {},
        templateSnapshot: input.selectedTemplate || null,
        targetDuration: input.duration || null,
        creativeBrief: input.creativeBrief || null
      },
      characters: storyboardData.characters || {},
      shots: rawShots.map((s, idx) => {
        const payload = isPlainObject(s.payload) ? { ...s.payload } : {
          angle: s.angle,
          emotion: s.emotion,
          purpose: s.purpose,
          dialogue: s.dialogue,
          note: s.note,
          characters: s.characters,
          sourceStructureId: s.sourceStructureId,
          sourceShot: s.sourceShot,
          shotPrompt: s.shotPrompt,
          finalPrompt: s.finalPrompt,
          image: s.image
        };
        return {
          id: s.id || `unsaved-shot-${idx + 1}`,
          order: Number.isFinite(Number(s.order)) ? Number(s.order) : (idx + 1),
          title: s.title || s.story || '',
          camera: s.camera || '',
          duration: s.duration != null ? String(s.duration) : '',
          payload
        };
      })
    };
  }

  function parseOptionalSourceShot(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : null;
    }
    return null;
  }

  function roundSeconds(val) {
    return Math.round(val * 100) / 100;
  }

  /**
   * Main serializer: produces the standardized StoryboardAI Project JSON V2.1 document
   * plus non-serialized runtime metadata (for PDF asset loading / warnings).
   */
  function serializeProject(rawProject, options = {}) {
    if (!isPlainObject(rawProject)) {
      throw new Error('無效的專案資料，無法進行序列化。');
    }

    const resolver = getResolver();
    const exportedAt = toIsoTimestamp(options.exportedAt || new Date()) || new Date().toISOString();
    const metadata = isPlainObject(rawProject.metadata) ? rawProject.metadata : {};
    const projectId = rawProject.id != null ? String(rawProject.id) : null;
    const registry = createAssetRegistry();

    const rawShots = Array.isArray(rawProject.shots) ? [...rawProject.shots] : [];
    rawShots.sort((a, b) => {
      const oa = Number.isFinite(Number(a?.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER;
      const ob = Number.isFinite(Number(b?.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER;
      return oa - ob;
    });

    const runtimeImages = []; // parallel to serialized shots; used ONLY by PDF exporter (never written to JSON)
    let totalDurationSeconds = 0;
    let durationComplete = rawShots.length > 0;
    let timelineCursor = 0;
    let timelineComplete = rawShots.length > 0;
    let hasUnsavedImages = false;
    let hasSignedUrls = false;
    let hasExpiredSignedUrls = false;

    const shots = rawShots.map((shot, idx) => {
      const payload = isPlainObject(shot?.payload) ? shot.payload : {};
      const shotId = shot?.id != null ? String(shot.id) : null;
      const order = Number.isFinite(Number(shot?.order)) ? Number(shot.order) : (idx + 1);
      const durationStr = shot?.duration != null ? String(shot.duration).trim() : '';
      const durationSec = parseDurationSeconds(durationStr);

      let startTimeSeconds = null;
      let endTimeSeconds = null;
      if (durationSec !== null) {
        totalDurationSeconds += durationSec;
        if (timelineComplete) {
          startTimeSeconds = roundSeconds(timelineCursor);
          endTimeSeconds = roundSeconds(timelineCursor + durationSec);
          timelineCursor = endTimeSeconds;
        }
      } else {
        durationComplete = false;
        timelineComplete = false;
      }

      const mainImageResult = registry.registerImage(payload, { projectId, shotId });
      const mainDesc = mainImageResult.descriptor;

      if (mainImageResult.status === 'unsaved') {
        hasUnsavedImages = true;
      }

      // Preserve runtime image source for PDF export (including API proxy fallback & in-memory Base64)
      runtimeImages.push({
        shotId,
        order,
        assetId: mainImageResult.assetId,
        status: mainImageResult.status,
        access: mainDesc?.access || 'none',
        availability: mainDesc?.availability || 'unavailable',
        expiresAt: mainDesc?.expiresAt || null,
        url: mainImageResult.assetId ? registry.assets[mainImageResult.assetId]?.url : null,
        storageRef: mainImageResult.assetId ? registry.assets[mainImageResult.assetId]?.storageRef : null,
        apiUrl: mainDesc?.apiUrl || null,
        proxyUrl: mainDesc?.proxyUrl || null,
        temporaryDataUri: mainDesc?.temporaryDataUri || null
      });

      const rawHistory = Array.isArray(payload.imageHistory) ? payload.imageHistory : [];
      const imageHistory = [];
      for (let hIdx = 0; hIdx < rawHistory.length; hIdx++) {
        const entry = rawHistory[hIdx];
        if (!isPlainObject(entry)) continue;
        const histReg = registry.registerImage(entry, { projectId, shotId, historyIndex: hIdx });
        imageHistory.push({
          version: Number.isFinite(Number(entry.version)) ? Number(entry.version) : (rawHistory.length - hIdx),
          assetId: histReg.assetId,
          status: histReg.status,
          prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
          createdAt: toIsoTimestamp(entry.createdAt)
        });
      }

      const cameraDetails = normalizeCameraDetails(payload);
      const rawAngle = typeof payload.angle === 'string' ? payload.angle.trim() : '';
      const detailAngle = typeof cameraDetails.angle === 'string' ? cameraDetails.angle.trim() : '';
      const resolvedAngle = rawAngle || detailAngle || '';

      const dialogueVal = typeof payload.dialogue === 'string'
        ? payload.dialogue
        : (isPlainObject(payload.dialogue) || Array.isArray(payload.dialogue) ? sanitizeValue(payload.dialogue) : '');

      return {
        id: shotId,
        order,
        story: typeof shot?.title === 'string' ? shot.title : (typeof shot?.story === 'string' ? shot.story : ''),
        duration: durationStr,
        durationSeconds: durationSec,
        startTimeSeconds,
        endTimeSeconds,
        camera: typeof shot?.camera === 'string' ? shot.camera : '',
        cameraDetails,
        angle: resolvedAngle,
        emotion: typeof payload.emotion === 'string'
          ? payload.emotion
          : (typeof shot?.emotion === 'string' ? shot.emotion : ''),
        purpose: typeof payload.purpose === 'string' ? payload.purpose : '',
        dialogue: dialogueVal,
        note: typeof payload.note === 'string' ? payload.note : '',
        characters: Array.isArray(payload.characters)
          ? payload.characters.filter(c => typeof c === 'string' && c.trim())
          : [],
        sourceStructureId: payload.sourceStructureId != null && String(payload.sourceStructureId).trim() !== ''
          ? String(payload.sourceStructureId)
          : null,
        sourceShot: parseOptionalSourceShot(payload.sourceShot),
        prompts: {
          shotPrompt: typeof payload.shotPrompt === 'string'
            ? payload.shotPrompt
            : (typeof payload.prompt === 'string' ? payload.prompt : ''),
          finalPrompt: typeof payload.finalPrompt === 'string' ? payload.finalPrompt : ''
        },
        image: {
          assetId: mainImageResult.assetId,
          status: mainImageResult.status
        },
        imageHistory,
        additionalData: extractAdditionalData(payload)
      };
    });

    const nowMs = Date.now();
    for (const asset of Object.values(registry.assets)) {
      if (asset.access === 'signed') {
        hasSignedUrls = true;
        if (asset.expiresAt && Date.parse(asset.expiresAt) <= nowMs) {
          hasExpiredSignedUrls = true;
        }
      }
    }

    const originalStory = typeof metadata.originalStory === 'string' ? metadata.originalStory : '';
    const template = sanitizeTemplate(metadata);
    let creativeBrief = sanitizeCreativeBrief(metadata.creativeBrief);
    if (creativeBrief && typeof creativeBrief.originalStory === 'string' && originalStory) {
      if (creativeBrief.originalStory.trim() === originalStory.trim()) {
        delete creativeBrief.originalStory;
        if (Object.keys(creativeBrief).length === 0) {
          creativeBrief = null;
        }
      }
    }
    const resolvedOriginalStory = originalStory || (typeof creativeBrief?.originalStory === 'string' ? creativeBrief.originalStory : '');

    const characters = sanitizeCharacters(rawProject.characters);
    const coverAssetId = shots.length > 0 && shots[0].image?.assetId ? shots[0].image.assetId : null;
    const generationMode = metadata.generationMode === 'template' || Boolean(template) ? 'template' : 'freeform';
    const targetDurationSeconds = parseDurationSeconds(metadata.targetDuration ?? creativeBrief?.duration);
    const roundedTotal = rawShots.length > 0 && durationComplete
      ? roundSeconds(totalDurationSeconds)
      : (rawShots.length > 0 && totalDurationSeconds > 0 ? roundSeconds(totalDurationSeconds) : null);

    const documentData = {
      format: FORMAT_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt,
      project: {
        id: projectId,
        title: typeof rawProject.title === 'string' && rawProject.title.trim() ? rawProject.title.trim() : '未命名分鏡',
        style: typeof rawProject.style === 'string' ? rawProject.style : '',
        ratio: typeof rawProject.ratio === 'string' ? rawProject.ratio : '',
        tags: normalizeTags(rawProject.tags, metadata),
        createdAt: toIsoTimestamp(rawProject.createdAt || rawProject.createAt),
        updatedAt: toIsoTimestamp(rawProject.updatedAt || rawProject.updateAt),
        coverAssetId,
        generationMode,
        originalStory: resolvedOriginalStory
      },
      creativeBrief,
      template,
      characters,
      storyboard: {
        shotCount: shots.length,
        targetDurationSeconds,
        totalDurationSeconds: durationComplete ? roundedTotal : null,
        durationComplete,
        timelineComplete,
        shots
      },
      assets: registry.assets
    };

    return {
      document: documentData,
      meta: {
        isUnsaved: Boolean(rawProject._unsaved || !rawProject.id),
        hasUnsavedImages,
        hasSignedUrls,
        hasExpiredSignedUrls,
        runtimeImages
      }
    };
  }

  /**
   * Validate a serialized JSON V2.0 / V2.1 document for structural integrity, timeline consistency, and security.
   * Returns { valid, errors, warnings }.
   */
  function validateExportDocument(doc) {
    const resolver = getResolver();
    const errors = [];
    const warnings = [];
    if (!isPlainObject(doc)) {
      return { valid: false, errors: ['匯出文件必須為 JSON 物件'], warnings };
    }
    if (doc.format !== FORMAT_ID) errors.push(`format 必須為 ${FORMAT_ID}`);
    if (!SUPPORTED_SCHEMA_VERSIONS.has(doc.schemaVersion)) {
      errors.push(`schemaVersion 必須為 ${Array.from(SUPPORTED_SCHEMA_VERSIONS).join(' 或 ')}`);
    }
    if (!toIsoTimestamp(doc.exportedAt)) errors.push('exportedAt 必須為合法 ISO 8601 時間');

    if (!isPlainObject(doc.project)) {
      errors.push('缺少 project 區塊');
    } else {
      if (typeof doc.project.title !== 'string' || !doc.project.title.trim()) errors.push('project.title 不可為空');
      if (doc.project.coverAssetId !== null && (!isPlainObject(doc.assets) || !doc.assets[doc.project.coverAssetId])) {
        errors.push(`project.coverAssetId (${doc.project.coverAssetId}) 未對應有效的 assets 紀錄`);
      }
    }

    const characterIds = isPlainObject(doc.characters) ? new Set(Object.keys(doc.characters)) : new Set();

    if (!isPlainObject(doc.storyboard) || !Array.isArray(doc.storyboard.shots)) {
      errors.push('缺少 storyboard.shots 陣列');
    } else {
      const shots = doc.storyboard.shots;
      if (doc.storyboard.shotCount !== shots.length) {
        errors.push('storyboard.shotCount 與 shots 長度不一致');
      }
      if (doc.project && shots.length > 0) {
        const expectedCover = shots[0]?.image?.assetId || null;
        if (doc.project.coverAssetId !== expectedCover) {
          errors.push(`project.coverAssetId (${doc.project.coverAssetId}) 與第一鏡資產 (${expectedCover}) 不一致`);
        }
      }

      const seenShotIds = new Set();
      const seenOrders = new Set();
      let sumDuration = 0;
      let allDurationsKnown = shots.length > 0;
      let cursor = 0;
      let timelineValid = shots.length > 0;

      for (const shot of shots) {
        if (shot.id != null) {
          if (seenShotIds.has(shot.id)) errors.push(`發現重複的分鏡 ID：${shot.id}`);
          seenShotIds.add(shot.id);
        }
        if (typeof shot.order !== 'number' || !Number.isFinite(shot.order)) {
          errors.push(`分鏡 order 必須為有限數值`);
        } else {
          if (seenOrders.has(shot.order)) errors.push(`發現重複的分鏡順序 order：${shot.order}`);
          seenOrders.add(shot.order);
        }

        if (shot.durationSeconds !== null && shot.durationSeconds !== undefined) {
          if (typeof shot.durationSeconds !== 'number' || !Number.isFinite(shot.durationSeconds) || shot.durationSeconds < 0) {
            errors.push(`Shot #${shot.order} 的 durationSeconds 必須為非負數值或 null`);
          } else {
            sumDuration += shot.durationSeconds;
            if (timelineValid && shot.startTimeSeconds != null && shot.endTimeSeconds != null) {
              const expectedStart = roundSeconds(cursor);
              const expectedEnd = roundSeconds(cursor + shot.durationSeconds);
              if (Math.abs(shot.startTimeSeconds - expectedStart) > 0.02 || Math.abs(shot.endTimeSeconds - expectedEnd) > 0.02) {
                errors.push(`Shot #${shot.order} 的時間軸 startTimeSeconds/endTimeSeconds 計算不一致`);
              }
              cursor = expectedEnd;
            }
          }
        } else {
          allDurationsKnown = false;
          timelineValid = false;
        }

        if (typeof shot.story === 'string' && /^\s*\d{1,2}\s*[–—\-~～]\s*\d{1,2}\s*秒[。．.]?/.test(shot.story)) {
          warnings.push(`Shot #${shot.order} 的畫面描述開頭包含舊時間碼，可能與目前時長設定不同`);
        }

        if (shot.image?.assetId && (!isPlainObject(doc.assets) || !doc.assets[shot.image.assetId])) {
          errors.push(`Shot #${shot.order} 的 image.assetId (${shot.image.assetId}) 未對應 assets`);
        }
        for (const hist of (shot.imageHistory || [])) {
          if (hist.assetId && (!isPlainObject(doc.assets) || !doc.assets[hist.assetId])) {
            errors.push(`Shot #${shot.order} 的 imageHistory assetId (${hist.assetId}) 未對應 assets`);
          }
        }
        for (const cid of (shot.characters || [])) {
          if (!characterIds.has(cid)) {
            warnings.push(`Shot #${shot.order} 引用了未定義的角色 ID：${cid}`);
          }
        }
      }

      if (doc.storyboard.durationComplete === true && allDurationsKnown && doc.storyboard.totalDurationSeconds !== null) {
        if (Math.abs(doc.storyboard.totalDurationSeconds - roundSeconds(sumDuration)) > 0.05) {
          errors.push('storyboard.totalDurationSeconds 與各分鏡時長加總不一致');
        }
      }
      if (doc.storyboard.targetDurationSeconds && doc.storyboard.totalDurationSeconds &&
          Math.abs(doc.storyboard.targetDurationSeconds - doc.storyboard.totalDurationSeconds) > 0.5) {
        warnings.push(`目標時長 (${doc.storyboard.targetDurationSeconds}s) 與實際分鏡總時長 (${doc.storyboard.totalDurationSeconds}s) 不同`);
      }
    }

    if (!isPlainObject(doc.assets)) {
      errors.push('缺少 assets 物件');
    } else {
      const nowMs = Date.now();
      for (const [assetId, asset] of Object.entries(doc.assets)) {
        if (isBase64DataUri(asset?.url) || isBase64DataUri(asset?.storageRef)) {
          errors.push(`資產 ${assetId} 包含禁止的 Base64 資料`);
        }
        if (isBlobUrl(asset?.url)) {
          errors.push(`資產 ${assetId} 包含禁止的 Blob URL`);
        }
        if (isPlaceholderImage(asset?.url)) {
          errors.push(`資產 ${assetId} 包含無效的 Placeholder 圖片`);
        }
        if (asset?.storageRef && !resolver.parseStorageRef(asset.storageRef)) {
          errors.push(`資產 ${assetId} 的 storageRef 格式無效`);
        }
        if (asset?.url && !/^https?:\/\//i.test(asset.url)) {
          errors.push(`資產 ${assetId} 的 url 必須為 HTTP(S) 網址或 null`);
        }
        if (asset?.access === 'signed' && asset?.expiresAt) {
          if (resolver.isExpiresSoonOrExpired(asset.expiresAt, 5 * 60 * 1000, nowMs)) {
            warnings.push(`資產 ${assetId} 的 Signed URL 已過期或即將過期`);
          }
        }
        if (!asset?.url && asset?.storageRef) {
          warnings.push(`資產 ${assetId} 具有 Storage Reference 但尚未取得可下載的 HTTP URL`);
        }
      }
    }

    // Security & numeric scan: ensure no forbidden keys, Base64, NaN, or Infinity
    const serialized = JSON.stringify(doc);
    if (/data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(serialized)) {
      errors.push('偵測到 Base64 圖片資料殘留於 JSON 文件中');
    }
    const checkObject = (obj, path = '') => {
      if (typeof obj === 'number' && !Number.isFinite(obj)) {
        errors.push(`偵測到無效數值 (NaN/Infinity)：${path}`);
        return;
      }
      if (!isPlainObject(obj) && !Array.isArray(obj)) return;
      if (Array.isArray(obj)) {
        obj.forEach((v, i) => checkObject(v, `${path}[${i}]`));
        return;
      }
      for (const [k, v] of Object.entries(obj)) {
        if (FORBIDDEN_KEYS.has(k)) {
          errors.push(`偵測到禁止輸出的敏感欄位：${path ? path + '.' : ''}${k}`);
        }
        checkObject(v, path ? `${path}.${k}` : k);
      }
    };
    checkObject(doc);

    return { valid: errors.length === 0, errors, warnings };
  }

  const api = {
    FORMAT_ID,
    SCHEMA_VERSION,
    FORBIDDEN_KEYS,
    toIsoTimestamp,
    parseDurationSeconds,
    parseStorageRef,
    decodeJwtExp,
    buildExportFilename,
    normalizeGenerationTask,
    serializeProject,
    validateExportDocument
  };

  if (typeof root !== 'undefined') {
    root.StoryboardProjectSerializer = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
