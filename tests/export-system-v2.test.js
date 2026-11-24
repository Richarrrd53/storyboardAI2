'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pdfmake = require('pdfmake');

const serializer = require('../public/js/features/export/project-serializer.js');
const jsonExporter = require('../public/js/features/export/json-exporter.js');
const storyboardExport = require('../public/js/features/export/storyboard-export.js');
const pdfLayout = require('../public/js/features/export/pdf-layout.js');
const pdfAssets = require('../public/js/features/export/pdf-assets.js');

function makeSignedJwtUrl(objectPath, expEpochSec) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ url: objectPath, exp: expEpochSec })).toString('base64url');
  return `https://demo.supabase.co/storage/v1/object/sign/storyboard-images/${objectPath}?token=${header}.${payload}.sig`;
}

function makePublicUrl(objectPath) {
  return `https://demo.supabase.co/storage/v1/object/public/storyboard-images/${objectPath}`;
}

test('JSON V2: serializes freeform project with Creative Brief, characters, signed URLs, and deduplicated assets', () => {
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const shot1Path = 'projects/proj_1/shot_1/img_a.png';
  const shot1SignedA = makeSignedJwtUrl(shot1Path, futureExp);
  const shot1SignedB = makeSignedJwtUrl(shot1Path, futureExp + 120); // Different token, same storageRef!

  const rawProject = {
    id: 'proj_1',
    title: '清晨手沖咖啡企劃',
    style: '電影風格',
    ratio: '直向9:16',
    tags: ['咖啡', '品牌廣告', '咖啡'],
    cover: 'https://legacy-old-cover.example.com/old.jpg', // Must NOT override shot 1 cover!
    authorId: 'user_secret_id',
    is_deleted: false,
    author: {
      id: 'user_secret_id',
      email: 'secret@example.com',
      passwordHash: '$2b$10$secret',
      plan: 'pro',
      apiCredentials: { openai: 'sk-secret' }
    },
    createAt: '2026-11-20 10:00:00',
    updatedAt: '2026-11-24 15:30:00',
    metadata: {
      originalStory: '清晨陽光灑進咖啡館，咖啡師專注手沖一杯單品咖啡。',
      generationMode: 'freeform',
      targetDuration: 15,
      creativeBrief: {
        subject: '精品手沖咖啡',
        purpose: '建立職人手作氛圍',
        direction: '安靜、細膩、強調聲音與光影',
        audience: '25-40 歲都市上班族',
        tone: '沉靜、溫暖',
        baseStyle: 'cinematic',
        visualStyle: '自然逆光與淺景深',
        styleNotes: '低飽和暖木色調',
        visualKeywords: ['晨光', '蒸氣', '手沖'],
        constraints: ['全程無口白'],
        avoid: ['霓虹燈', '過度剪輯'],
        duration: 15,
        ratio: '9:16'
      }
    },
    characters: {
      char_barista: {
        name: '林晨',
        appearance: '30歲男性咖啡師，短髮',
        outfit: '深藍丹寧圍裙配白襯衫',
        personality: '專注、溫和'
      }
    },
    shots: [
      {
        id: 'shot_2',
        order: 3, // Non-contiguous order
        title: '熱水緩緩注入濾杯，蒸氣升騰',
        camera: 'Close-up',
        duration: '4.5s',
        payload: {
          cameraDetails: { size: 'Close-up', angle: '高角度俯拍', movement: '緩慢推軌' },
          angle: '俯拍',
          emotion: '療癒',
          purpose: '呈現咖啡萃取瞬間',
          dialogue: '每一杯咖啡，都從細節開始。',
          note: '保留手沖水流環境音',
          characters: ['char_barista'],
          shotPrompt: 'close up of pour over coffee',
          finalPrompt: 'close up of pour over coffee, cinematic lighting, 9:16',
          image: makePublicUrl('projects/proj_1/shot_2/img_b.jpg'),
          imageRef: 'storage://storyboard-images/projects/proj_1/shot_2/img_b.jpg',
          lighting: '側逆光',
          apiKey: 'should-be-stripped'
        }
      },
      {
        id: 'shot_1',
        order: 1,
        title: '咖啡師將深焙咖啡豆倒入磨豆機',
        camera: 'Medium Close-up',
        duration: '3s',
        payload: {
          emotion: '專注',
          characters: ['char_barista'],
          shotPrompt: 'barista pouring beans',
          finalPrompt: 'barista pouring beans, cinematic lighting',
          image: shot1SignedA,
          imageRef: `storage://storyboard-images/${shot1Path}`,
          imageHistory: [
            {
              version: 2,
              image: shot1SignedB, // Different signed URL, SAME storageRef -> must dedupe to asset-001!
              imageRef: `storage://storyboard-images/${shot1Path}`,
              prompt: 'barista pouring beans v2',
              createdAt: '2026-11-24T12:00:00Z'
            }
          ]
        }
      }
    ]
  };

  const bundle = serializer.serializeProject(rawProject, { exportedAt: '2026-11-24T15:00:00.000Z' });
  const doc = bundle.document;
  const validation = serializer.validateExportDocument(doc);
  assert.equal(validation.valid, true, `Validation failed: ${validation.errors.join('; ')}`);

  assert.equal(doc.format, 'storyboardai.project');
  assert.equal(doc.schemaVersion, '2.0.0');
  assert.equal(doc.exportedAt, '2026-11-24T15:00:00.000Z');
  assert.equal(doc.project.generationMode, 'freeform');
  assert.deepEqual(doc.project.tags, ['咖啡', '品牌廣告']);
  assert.equal(doc.project.coverAssetId, 'asset-001'); // Derived from sorted Shot #1!
  assert.equal(doc.template, null);
  assert.equal(doc.creativeBrief.subject, '精品手沖咖啡');
  assert.equal(doc.storyboard.shotCount, 2);
  assert.equal(doc.storyboard.totalDurationSeconds, 7.5);
  assert.equal(doc.storyboard.durationComplete, true);
  assert.deepEqual(doc.storyboard.shots.map(s => s.order), [1, 3]);

  // Asset deduplication across different signed URLs for the same storageRef
  assert.equal(Object.keys(doc.assets).length, 2);
  assert.equal(doc.storyboard.shots[0].image.assetId, 'asset-001');
  assert.equal(doc.storyboard.shots[0].imageHistory[0].assetId, 'asset-001');
  assert.equal(doc.assets['asset-001'].access, 'signed');
  assert.ok(doc.assets['asset-001'].expiresAt, 'Signed URL should decode JWT exp');
  assert.equal(doc.assets['asset-002'].access, 'public');
  assert.equal(doc.assets['asset-002'].expiresAt, null);
  assert.equal(doc.assets['asset-002'].mimeType, 'image/jpeg');

  // Additional safe creative field preserved, forbidden field stripped
  assert.equal(doc.storyboard.shots[1].additionalData.lighting, '側逆光');
  assert.equal(doc.storyboard.shots[1].additionalData.apiKey, undefined);

  // Security scan: no sensitive data anywhere in JSON text
  const out = jsonExporter.exportJsonDocument(bundle, { download: false });
  assert.doesNotMatch(out.jsonText, /passwordHash|secret@example\.com|sk-secret|user_secret_id|legacy-old-cover/);
});

test('JSON V2: template project separates templateSnapshot from actual generated shots', () => {
  const rawProject = {
    id: 'proj_tpl',
    title: '30秒商品開箱模板專案',
    style: '美式寫實風格',
    ratio: '16:9',
    metadata: {
      originalStory: '介紹新款降噪耳機',
      generationMode: 'template',
      templateId: 'tpl_unbox_01',
      templateValues: { product: 'AirWave Pro 降噪耳機', cta: '立即體驗' },
      templateSnapshot: {
        id: 'tpl_unbox_01',
        name: '商品痛點開箱結構',
        description: '3 節點黃金轉換結構',
        structure: [
          { id: 'hook', action: '模板原始節點 1', duration: '3s' },
          { id: 'demo', action: '模板原始節點 2', duration: '5s' },
          { id: 'cta', action: '模板原始節點 3', duration: '3s' }
        ]
      }
    },
    characters: {},
    shots: [
      { id: 's1', order: 1, title: '實際分鏡 1：吵雜捷運中戴上耳機', camera: 'Close-up', duration: '3s', payload: { sourceStructureId: 'hook', sourceShot: 1 } },
      { id: 's2', order: 2, title: '實際分鏡 2：世界瞬間安靜', camera: 'Wide', duration: '4s', payload: { sourceStructureId: 'demo', sourceShot: 2 } },
      { id: 's3', order: 3, title: '實際分鏡 3：耳機金屬質感特寫', camera: 'Macro', duration: '3s', payload: { sourceStructureId: 'demo', sourceShot: 3 } },
      { id: 's4', order: 4, title: '實際分鏡 4：結尾品牌與 CTA', camera: 'Static', duration: '不確定', payload: { sourceStructureId: 'cta', sourceShot: 4 } }
    ]
  };

  const bundle = serializer.serializeProject(rawProject);
  const doc = bundle.document;
  assert.equal(serializer.validateExportDocument(doc).valid, true);
  assert.equal(doc.project.generationMode, 'template');
  assert.equal(doc.project.coverAssetId, null); // First shot has no image
  assert.equal(doc.creativeBrief, null);
  assert.equal(doc.template.id, 'tpl_unbox_01');
  assert.equal(doc.template.name, '商品痛點開箱結構');
  assert.equal(doc.template.snapshot.structure.length, 3);
  assert.equal(doc.storyboard.shotCount, 4); // 4 actual shots != 3 template nodes
  assert.equal(doc.storyboard.shots[2].sourceStructureId, 'demo');
  assert.equal(doc.storyboard.shots[3].durationSeconds, null); // Unparseable duration -> null, never guessed
  assert.equal(doc.storyboard.durationComplete, false);
});

test('JSON V2: unsaved GenerationTask excludes Base64 from JSON while preserving runtimeImages for PDF', () => {
  const fakePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAHklEQVR4nGP8z4AfMDEwMDBgYmBg+M9ABBg1nHIGAEPBAQoQ9K6QAAAAAElFTkSuQmCC';
  const task = {
    taskId: 'gen-1',
    projectId: null,
    save: { status: 'local', error: null },
    input: {
      story: '未登入使用者的本地測試故事',
      style: { name: '預設風格' },
      ratio: '16:9',
      duration: 15
    },
    result: {
      storyboardData: {
        meta: { title: '本地未儲存分鏡' },
        characters: { c1: { appearance: 'young woman' } }
      },
      generatedShotData: [
        {
          order: 1,
          title: '鏡頭一畫面',
          camera: 'Wide Shot',
          duration: '3s',
          payload: { image: fakePng, imageStatus: 'succeeded', emotion: '平靜', finalPrompt: 'wide shot' }
        },
        {
          order: 2,
          title: '鏡頭二畫面（失敗）',
          camera: 'Close-up',
          duration: '3s',
          payload: { image: '../icon/error.jpg', imageStatus: 'failed', emotion: '緊張' }
        }
      ]
    }
  };

  const normalized = serializer.normalizeGenerationTask(task);
  const bundle = serializer.serializeProject(normalized);
  const doc = bundle.document;

  assert.equal(serializer.validateExportDocument(doc).valid, true);
  assert.equal(bundle.meta.isUnsaved, true);
  assert.equal(bundle.meta.hasUnsavedImages, true);
  assert.equal(Object.keys(doc.assets).length, 0); // Zero Base64 or error.jpg in JSON assets!
  assert.equal(doc.storyboard.shots[0].image.status, 'unsaved');
  assert.equal(doc.storyboard.shots[1].image.status, 'failed');
  assert.equal(bundle.meta.runtimeImages[0].temporaryDataUri, fakePng); // Preserved ONLY in runtime meta for PDF
});

test('JSON V2: detects expired Signed URLs and refuses silent fallback when GET /api/projects/:id fails', async () => {
  const expiredExp = Math.floor(Date.now() / 1000) - 600;
  const expiredUrl = makeSignedJwtUrl('projects/p1/s1/a.png', expiredExp);
  const bundle = serializer.serializeProject({
    id: 'p1',
    title: '過期簽章測試',
    shots: [{ id: 's1', order: 1, title: '測試', payload: { image: expiredUrl } }]
  });
  assert.equal(bundle.meta.hasSignedUrls, true);
  assert.equal(bundle.meta.hasExpiredSignedUrls, true);

  // API failure must NOT fall back to summary object!
  globalThis.localStorage = { getItem: () => 'fake-token' };
  const result = await storyboardExport.exportJson(
    { projectId: 'p1', project: { id: 'p1', title: 'Summary Only' } },
    {
      silent: true,
      download: false,
      fetchFn: async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: '資料庫連線逾時' })
      })
    }
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'EXPORT_FETCH_FAILED');
  delete globalThis.localStorage;
});

test('Filename sanitization preserves Chinese, strips illegal OS characters, and avoids bare UUIDs', () => {
  const d = new Date(2026, 10, 24);
  assert.equal(
    serializer.buildExportFilename('清晨/咖啡:企劃*?"<>|測試', 'pdf', d),
    '清晨_咖啡_企劃_測試_storyboard_20261124.pdf'
  );
  assert.equal(
    serializer.buildExportFilename('550e8400-e29b-41d4-a716-446655440000', 'json', d),
    'storyboard_storyboard_20261124.json'
  );
});

test('PDF layout: generates valid Portrait and Landscape PDFs with embedded Noto Sans TC and ultra-long shot splitting', async () => {
  const fontsDir = path.join(__dirname, '..', 'public', 'fonts', 'export');
  pdfmake.setFonts({
    NotoSansTC: {
      normal: path.join(fontsDir, 'NotoSansTC-Regular.ttf'),
      bold: path.join(fontsDir, 'NotoSansTC-Bold.ttf'),
      italics: path.join(fontsDir, 'NotoSansTC-Regular.ttf'),
      bolditalics: path.join(fontsDir, 'NotoSansTC-Bold.ttf')
    }
  });

  const png16x9 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAAC0SDtlAAAAHklEQVR4nGP8z4AfMDEwMDBgYmBg+M9ABBg1nHIGAEPBAQoQ9K6QAAAAAElFTkSuQmCC';
  const bundle = serializer.serializeProject({
    id: 'pdf_unit_1',
    title: '單元測試分鏡企劃書',
    style: '電影風格',
    ratio: '16:9',
    metadata: { originalStory: '測試故事需求' },
    characters: { c1: { name: '主角', appearance: '黑髮青年' } },
    shots: [
      {
        id: 's1',
        order: 1,
        title: '這是一段非常長的分鏡描述。'.repeat(60),
        camera: 'Tracking Shot',
        duration: '5s',
        payload: {
          image: png16x9,
          dialogue: '長對白測試內容。'.repeat(40),
          note: '導演備註：注意光影變化。'.repeat(20),
          finalPrompt: 'UltraLongUnbrokenPromptToken_cinematic_anamorphic_8k_volumetric_fog_lighting_render'
        }
      }
    ]
  });

  const imgMap = new Map([[1, { status: 'ok', dataUrl: png16x9, width: 16, height: 9, aspectRatio: 16 / 9 }]]);

  for (const orientation of ['portrait', 'landscape']) {
    const def = pdfLayout.buildPdfDocumentDefinition(bundle, imgMap, {
      orientation,
      includeOverview: true,
      includeBriefAndTemplate: true,
      includeCharacters: true,
      includePrompts: true
    });

    const buffer = await pdfmake.createPdf(def).getBuffer();

    assert.ok(buffer.length > 5000, `${orientation} PDF should be non-trivial size`);
    assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-', 'Must start with %PDF- header');
  }
});
