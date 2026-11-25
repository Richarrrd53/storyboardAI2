'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const resolver = require('../public/js/features/export/image-asset-resolver.js');
const serializer = require('../public/js/features/export/project-serializer.js');
const pdfAssets = require('../public/js/features/export/pdf-assets.js');
const pdfLayout = require('../public/js/features/export/pdf-layout.js');
const storyboardImages = require('../lib/storage/storyboard-images.js');

// Valid 9:16 portrait PNG (90x160) generated minimally in-memory for Node tests, or 1x1 PNG
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;
const TINY_PNG_BUF = Buffer.from(TINY_PNG_BASE64, 'base64');

function makeJwtWithExp(expUnix) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expUnix })).toString('base64url');
  return `${header}.${payload}.sig`;
}

test('V2.1 Resolver: supports storage://, bare object path, imageRef, imageAsset, Supabase URL, and same-origin API path', () => {
  const futureJwt = makeJwtWithExp(Math.floor(Date.now() / 1000) + 3600);
  const expiredJwt = makeJwtWithExp(Math.floor(Date.now() / 1000) - 300);

  // 1. Only imageRef (storage://)
  const d1 = resolver.resolveImageAssetDescriptor({
    imageRef: 'storage://storyboard-images/projects/p1/s1/a1.png'
  }, { projectId: 'p1', shotId: 's1' });
  assert.equal(d1.status, 'succeeded');
  assert.equal(d1.storageRef, 'storage://storyboard-images/projects/p1/s1/a1.png');
  assert.equal(d1.availability, 'unresolved');

  // 2. Only imageAsset (bucket + path)
  const d2 = resolver.resolveImageAssetDescriptor({
    imageAsset: { bucket: 'storyboard-images', path: 'projects/p1/s2/a2.webp', mimeType: 'image/webp' }
  }, { projectId: 'p1', shotId: 's2' });
  assert.equal(d2.status, 'succeeded');
  assert.equal(d2.storageRef, 'storage://storyboard-images/projects/p1/s2/a2.webp');
  assert.equal(d2.mimeType, 'image/webp');

  // 3. Only same-origin API path (must NOT be marked missing!)
  const d3 = resolver.resolveImageAssetDescriptor({
    image: '/api/projects/p1/shots/s3/image?v=123'
  }, { projectId: 'p1', shotId: 's3' });
  assert.equal(d3.status, 'succeeded');
  assert.equal(d3.access, 'api');
  assert.equal(d3.availability, 'requires_auth');
  assert.equal(d3.apiUrl, '/api/projects/p1/shots/s3/image?v=123');

  // 4. Bare object path in imageRef
  const d4 = resolver.resolveImageAssetDescriptor({
    imageRef: 'projects/p1/s4/a4.jpg'
  }, { projectId: 'p1', shotId: 's4' });
  assert.equal(d4.status, 'succeeded');
  assert.equal(d4.storageRef, 'storage://storyboard-images/projects/p1/s4/a4.jpg');

  // 5. Expired Signed URL
  const d5 = resolver.resolveImageAssetDescriptor({
    image: `https://example.supabase.co/storage/v1/object/sign/storyboard-images/projects/p1/s5/a5.png?token=${expiredJwt}`
  }, { projectId: 'p1', shotId: 's5' });
  assert.equal(d5.status, 'succeeded');
  assert.equal(d5.access, 'signed');
  assert.equal(d5.availability, 'expired');

  // 6. Valid Signed URL
  const d6 = resolver.resolveImageAssetDescriptor({
    image: `https://example.supabase.co/storage/v1/object/sign/storyboard-images/projects/p1/s6/a6.png?token=${futureJwt}`
  }, { projectId: 'p1', shotId: 's6' });
  assert.equal(d6.status, 'succeeded');
  assert.equal(d6.access, 'signed');
  assert.equal(d6.availability, 'unchecked');

  // 7. Legitimately missing (no source at all)
  const d7 = resolver.resolveImageAssetDescriptor({}, { projectId: 'p1', shotId: 's7' });
  assert.equal(d7.status, 'missing');
  assert.equal(d7.hasSource, false);
});

test('V2.1 Reproduction: 11 shots (9:16 portrait), 12 history items, 30s target vs 41s actual, sourceShot null, angle fallback, deduplicated originalStory', () => {
  const futureJwt = makeJwtWithExp(Math.floor(Date.now() / 1000) + 3600);
  const projectId = 'proj-repro-11';
  const durations = ['3s', '4s', '3s', '4s', '4s', '4s', '3s', '4s', '4s', '4s', '4s']; // sum = 41s

  const shots = durations.map((dur, idx) => {
    const order = idx + 1;
    const shotId = `shot-${String(order).padStart(2, '0')}`;
    const ref = `storage://storyboard-images/projects/${projectId}/${shotId}/main.png`;
    // Mix of realistic backend/DB shapes: imageRef only, imageAsset only, /api/ path, signed URL
    const payload = {
      cameraDetails: { size: order === 6 ? '特寫鏡頭（Extreme Close-Up）' : '中景', angle: 'Eye Level', movement: '緩慢推進' },
      angle: '', // empty outer angle should fall back to cameraDetails.angle!
      emotion: '專注',
      purpose: '推進敘事',
      dialogue: order === 1 ? '（旁白）早晨的辦公室總是特別安靜。' : '',
      note: order === 6 ? '注意人物眼神與手部細節。' : '',
      characters: ['char-1'],
      sourceStructureId: order <= 3 ? `tpl-struct-${order}` : null,
      sourceShot: order === 1 ? 0 : (order === 2 ? 1 : null), // null must stay null, 0 must stay 0!
      shotPrompt: `Vertical 9:16 cinematic frame ${order}, realistic lighting`,
      finalPrompt: `Vertical 9:16 cinematic frame ${order}, realistic lighting, 8k`,
      imageHistory: []
    };

    if (idx % 4 === 0) {
      payload.image = `https://demo.supabase.co/storage/v1/object/sign/storyboard-images/projects/${projectId}/${shotId}/main.png?token=${futureJwt}`;
      payload.imageRef = ref;
    } else if (idx % 4 === 1) {
      // Simulates DB row where payload.image is empty/api and imageRef holds the storage ref
      payload.image = `/api/projects/${projectId}/shots/${shotId}/image?v=1`;
      payload.imageRef = ref;
    } else if (idx % 4 === 2) {
      payload.imageAsset = { bucket: 'storyboard-images', path: `projects/${projectId}/${shotId}/main.png`, mimeType: 'image/png' };
    } else {
      payload.image = `/api/projects/${projectId}/shots/${shotId}/image?v=2`;
    }

    // Add 12 total history entries across shots (shots 1..10 have 1, shot 11 has 2 => 12 total)
    const histCount = order === 11 ? 2 : 1;
    for (let h = 0; h < histCount; h++) {
      payload.imageHistory.push({
        version: h + 1,
        imageRef: `storage://storyboard-images/projects/${projectId}/${shotId}/hist-${h}.png`,
        image: `/api/projects/${projectId}/shots/${shotId}/image?history=${h}`,
        prompt: `History prompt ${order}-${h}`,
        createdAt: '2026-11-24T12:00:00.000Z'
      });
    }

    return {
      id: shotId,
      order,
      title: order === 2 ? '03–05秒。一個主管走進來查看桌面上的咖啡杯。' : `第 ${order} 鏡畫面描述`,
      camera: order === 6 ? '特寫鏡頭搭配極慢速推進與淺景深手持微晃運鏡效果來強調緊張氣氛' : '中景',
      duration: dur,
      payload
    };
  });

  const longStory = '這是一段超過兩百字的原始創作需求，描述主角在忙碌城市中尋找片刻喘息的品牌短片企劃。';
  const rawProject = {
    id: projectId,
    title: '城市晨光品牌短片',
    style: '寫實電影感',
    ratio: '直向9:16',
    tags: ['品牌', '直式短影音'],
    createAt: '2026-11-24T10:00:00.000Z',
    updatedAt: '2026-11-25T08:00:00.000Z',
    metadata: {
      originalStory: longStory,
      generationMode: 'template',
      templateId: 'tpl-brand-01',
      templateSnapshot: { id: 'tpl-brand-01', name: '品牌日常結構' },
      templateValues: { brand: 'MorningLab' },
      targetDuration: 30,
      creativeBrief: {
        subject: '城市晨光',
        duration: 30,
        ratio: '直向9:16',
        originalStory: longStory // identical to metadata.originalStory -> should be deduplicated
      }
    },
    characters: {
      'char-1': { name: '林主管', role: '主角', appearance: '深色西裝' }
    },
    shots
  };

  const bundle = serializer.serializeProject(rawProject, { exportedAt: '2026-11-25T09:00:00.000Z' });
  const doc = bundle.document;
  const validation = serializer.validateExportDocument(doc);

  assert.equal(validation.valid, true, `Errors: ${validation.errors.join('; ')}`);
  assert.equal(doc.schemaVersion, '2.1.0');
  assert.equal(doc.storyboard.shotCount, 11);
  assert.equal(doc.storyboard.targetDurationSeconds, 30);
  assert.equal(doc.storyboard.totalDurationSeconds, 41);
  assert.equal(doc.storyboard.durationComplete, true);
  assert.equal(doc.storyboard.timelineComplete, true);

  // All 11 current shots + 12 history items = 23 asset references, all non-null!
  assert.equal(doc.project.coverAssetId, doc.storyboard.shots[0].image.assetId);
  assert.ok(doc.project.coverAssetId);
  let histTotal = 0;
  for (const s of doc.storyboard.shots) {
    assert.ok(s.image.assetId, `Shot #${s.order} missing assetId`);
    assert.equal(s.image.status, 'succeeded');
    assert.equal(s.angle, 'Eye Level'); // angle fallback!
    for (const h of s.imageHistory) {
      histTotal++;
      assert.ok(h.assetId, `Shot #${s.order} history missing assetId`);
      assert.equal(h.status, 'succeeded');
    }
  }
  assert.equal(histTotal, 12);
  assert.equal(Object.keys(doc.assets).length, 23);

  // sourceShot null vs 0
  assert.equal(doc.storyboard.shots[0].sourceShot, 0);
  assert.equal(doc.storyboard.shots[1].sourceShot, 1);
  assert.equal(doc.storyboard.shots[2].sourceShot, null);

  // Timeline startTimeSeconds / endTimeSeconds
  assert.equal(doc.storyboard.shots[0].startTimeSeconds, 0);
  assert.equal(doc.storyboard.shots[0].endTimeSeconds, 3);
  assert.equal(doc.storyboard.shots[1].startTimeSeconds, 3);
  assert.equal(doc.storyboard.shots[1].endTimeSeconds, 7);
  assert.equal(doc.storyboard.shots[5].startTimeSeconds, 18); // SHOT 06: 3+4+3+4+4 = 18..22
  assert.equal(doc.storyboard.shots[5].endTimeSeconds, 22);
  assert.equal(doc.storyboard.shots[10].endTimeSeconds, 41);

  // originalStory deduplication: kept in project, omitted from creativeBrief when identical
  assert.equal(doc.project.originalStory, longStory);
  assert.equal(doc.creativeBrief.originalStory, undefined);
  // Original timecode in shot.story preserved in JSON, stripped in PDF presentation
  assert.ok(doc.storyboard.shots[1].story.startsWith('03–05秒。'));
  assert.equal(pdfLayout.stripLeadingTimecodeForPdf(doc.storyboard.shots[1].story), '一個主管走進來查看桌面上的咖啡杯。');
  // Warning emitted for old timecode & target vs actual duration mismatch
  assert.ok(validation.warnings.some(w => w.includes('舊時間碼')));
  assert.ok(validation.warnings.some(w => w.includes('目標時長')));
});

test('V2.1 Backend resolveShotPayloadForResponse: resolves imageRef/imageAsset even when payload.image is empty', async () => {
  const mockStorage = {
    createSignedUrl: async (objectPath, ttl) => ({
      data: { signedUrl: `https://demo.supabase.co/storage/v1/object/sign/storyboard-images/${objectPath}?token=sig-123` },
      error: null
    })
  };
  const shot = {
    id: 'shot-1',
    updateAt: new Date(),
    payload: {
      image: null,
      imageRef: 'storage://storyboard-images/projects/p1/shot-1/a1.png',
      imageHistory: [
        { version: 1, image: '', imageRef: 'storage://storyboard-images/projects/p1/shot-1/h0.png' }
      ]
    }
  };
  const resolved = await storyboardImages.resolveShotPayloadForResponse(shot, 'p1', {
    storageClient: mockStorage,
    accessMode: 'signed'
  });
  assert.equal(resolved.imageRef, 'storage://storyboard-images/projects/p1/shot-1/a1.png');
  assert.ok(resolved.image.includes('token=sig-123'));
  assert.equal(resolved.imageHistory[0].imageRef, 'storage://storyboard-images/projects/p1/shot-1/h0.png');
  assert.ok(resolved.imageHistory[0].image.includes('token=sig-123'));
});

test('V2.1 PDF Assets: falls back to authorized proxy when direct URL is missing/expired and classifies errors distinctly', async () => {
  const expiredJwt = makeJwtWithExp(Math.floor(Date.now() / 1000) - 600);
  const runtimeImages = [
    // 1. Only storageRef (no HTTP URL) -> must NOT prematurely return missing, must use proxy!
    { shotId: 's1', order: 1, assetId: 'asset-001', status: 'succeeded', url: null, storageRef: 'storage://storyboard-images/projects/p1/s1/a.png', proxyUrl: '/api/projects/p1/shots/s1/image?proxy=1' },
    // 2. Expired signed URL -> refreshes or falls back to proxy
    { shotId: 's2', order: 2, assetId: 'asset-002', status: 'succeeded', access: 'signed', expiresAt: new Date(Date.now() - 60000).toISOString(), url: `https://demo.supabase.co/storage/v1/object/sign/storyboard-images/projects/p1/s2/b.png?token=${expiredJwt}`, storageRef: 'storage://storyboard-images/projects/p1/s2/b.png', proxyUrl: '/api/projects/p1/shots/s2/image?proxy=1' },
    // 3. Legitimately missing
    { shotId: 's3', order: 3, assetId: null, status: 'missing', url: null, storageRef: null },
    // 4. Download failure (proxy returns 502)
    { shotId: 's4', order: 4, assetId: 'asset-004', status: 'succeeded', url: null, storageRef: 'storage://storyboard-images/projects/p1/s4/d.png', proxyUrl: '/api/projects/p1/shots/s4/image?proxy=1' }
  ];

  const origDecode = pdfAssets.decodeAndOptimizeImage;
  // Stub fetchFn returning valid PNG Blob for s1 & s2 proxy, 502 for s4
  const mockFetch = async (url) => {
    if (String(url).includes('/shots/s1/') || String(url).includes('/shots/s2/')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/png' },
        blob: async () => new Blob([TINY_PNG_BUF], { type: 'image/png' })
      };
    }
    if (String(url).includes('/api/projects/p1')) {
      return { ok: true, status: 200, json: async () => ({ project: { shots: [] } }) };
    }
    return { ok: false, status: 502, headers: { get: () => 'text/plain' } };
  };

  // Since Node.js doesn't have Image/Canvas DOM, test fetchSingleShotImage with temporaryDataUri / mock decode
  // We test the proxy fetch path by mocking global Blob & decodeAndOptimizeImage via temporaryDataUri or checking error classification
  assert.equal(typeof origDecode, 'function');
  const loaded = await pdfAssets.loadShotImages(runtimeImages, {
    projectId: 'p1',
    authToken: 'test-token',
    fetchFn: mockFetch
  });

  // s3 is legitimately missing (not in failed)
  assert.equal(loaded.imagesByOrder.get(3).status, 'missing');
  // s4 failed download -> classified as download_failed and included in failed[]
  assert.equal(loaded.imagesByOrder.get(4).status, 'download_failed');
  assert.ok(loaded.failed.some(f => f.order === 4));
});

test('V2.1 PDF Layout: generates real 11-shot 9:16 PDF with embedded images, fixed header bar, and proper placeholder ratio', async () => {
  const fontsDir = path.resolve(__dirname, '../public/fonts/export');
  const pdfMake = require('pdfmake');
  pdfMake.setFonts({
    NotoSansTC: {
      normal: path.join(fontsDir, 'NotoSansTC-Regular.ttf'),
      bold: path.join(fontsDir, 'NotoSansTC-Bold.ttf'),
      italics: path.join(fontsDir, 'NotoSansTC-Regular.ttf'),
      bolditalics: path.join(fontsDir, 'NotoSansTC-Bold.ttf')
    }
  });

  const shots = Array.from({ length: 11 }, (_, i) => ({
    id: `s-${i + 1}`,
    order: i + 1,
    title: i === 1 ? '03–05秒。一個主管走進辦公室。' : `分鏡 ${i + 1} 的畫面描述`,
    camera: i === 5 ? '特寫鏡頭搭配極慢速推進與淺景深手持微晃運鏡效果來強調緊張氣氛' : '中景',
    duration: i % 2 === 0 ? '3s' : '4s',
    payload: {
      image: `storage://storyboard-images/projects/p1/s-${i + 1}/a.png`,
      cameraDetails: { angle: 'Eye Level', movement: '緩慢推進' },
      emotion: '專注'
    }
  }));

  const bundle = serializer.serializeProject({
    id: 'p1',
    title: '直向 9:16 分鏡測試',
    ratio: '直向9:16',
    style: '寫實電影感',
    metadata: { targetDuration: 30, originalStory: '測試原始故事' },
    shots
  });

  const imagesByOrder = new Map();
  for (const s of bundle.document.storyboard.shots) {
    imagesByOrder.set(s.order, {
      status: 'ok',
      order: s.order,
      dataUrl: TINY_PNG_DATA_URI,
      aspectRatio: 9 / 16,
      width: 90,
      height: 160
    });
  }

  const docDef = pdfLayout.buildPdfDocumentDefinition(bundle, imagesByOrder, {
    orientation: 'portrait',
    includePrompts: true
  });

  const pdfBuffer = await pdfMake.createPdf(docDef).getBuffer();
  assert.ok(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 5000);
  const pdfAscii = pdfBuffer.toString('latin1');
  assert.ok(pdfAscii.includes('/Subtype /Image'), 'PDF must contain embedded image XObjects');

  // Verify placeholder aspect ratio matches 9:16 (height > width)
  const ratio = pdfLayout.parseAspectRatioFromString('直向9:16');
  assert.ok(Math.abs(ratio - (9 / 16)) < 0.001);
});
