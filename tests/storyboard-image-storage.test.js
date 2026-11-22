'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const storyboardImages = require('../lib/storage/storyboard-images');
const projectLifecycle = require('../lib/projects/lifecycle');

// Minimal valid binary headers for PNG, JPEG, WebP
const PNG_BUF = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPEG_BUF = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const WEBP_BUF = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);

const PNG_DATA_URI = `data:image/png;base64,${PNG_BUF.toString('base64')}`;
const JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_BUF.toString('base64')}`;

function createMockStorage(options = {}) {
    const objects = new Map();
    let uploadCalls = 0;
    let copyCalls = 0;
    let removeCalls = 0;
    return {
        objects,
        get stats() { return { uploadCalls, copyCalls, removeCalls }; },
        async upload(objectPath, buffer, opts) {
            uploadCalls++;
            if (options.failUpload) return { data: null, error: { message: 'storage unavailable' } };
            objects.set(objectPath, { buffer: Buffer.from(buffer), contentType: opts?.contentType, size: buffer.length });
            return { data: { path: objectPath }, error: null };
        },
        async copy(fromPath, toPath) {
            copyCalls++;
            if (options.failCopyOnCall && copyCalls === options.failCopyOnCall) {
                return { data: null, error: { message: 'copy failed' } };
            }
            const src = objects.get(fromPath);
            if (!src) return { data: null, error: { message: 'source not found' } };
            objects.set(toPath, { ...src });
            return { data: { path: toPath }, error: null };
        },
        async remove(paths) {
            removeCalls++;
            if (options.failRemove) return { data: null, error: { message: 'remove failed' } };
            for (const p of paths) objects.delete(p);
            return { data: paths, error: null };
        },
        async createSignedUrl(objectPath, ttl) {
            return { data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/storyboard-images/${objectPath}?token=sig-${ttl}` }, error: null };
        },
        getPublicUrl(objectPath) {
            return { data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/storyboard-images/${objectPath}` } };
        },
        async list(folder, { search } = {}) {
            const items = [];
            for (const [k, v] of objects.entries()) {
                if (k.startsWith(folder + '/') && (!search || k.endsWith('/' + search))) {
                    items.push({ name: k.split('/').pop(), metadata: { size: v.size, mimetype: v.contentType } });
                }
            }
            return { data: items, error: null };
        }
    };
}

test('validateImageBuffer verifies PNG/JPEG/WebP magic bytes and rejects mismatched or oversized files', () => {
    assert.equal(storyboardImages.validateImageBuffer(PNG_BUF, 'image/png').ext, 'png');
    assert.equal(storyboardImages.validateImageBuffer(JPEG_BUF, 'image/jpeg').ext, 'jpg');
    assert.equal(storyboardImages.validateImageBuffer(WEBP_BUF, 'image/webp').ext, 'webp');

    assert.throws(() => storyboardImages.validateImageBuffer(PNG_BUF, 'image/jpeg'), /IMAGE_MIME_MISMATCH|不符/);
    assert.throws(() => storyboardImages.validateImageBuffer(Buffer.from('not-an-image-at-all'), 'image/png'), /不支援/);
    assert.throws(() => storyboardImages.validateImageBuffer(PNG_BUF, 'image/png', { maxBytes: 4 }), /上限/);
});

test('path validation blocks traversal, untrusted URLs, cross-project refs, and Base64 writes', () => {
    assert.throws(() => storyboardImages.buildObjectPath('../evil', 'shot1', 'png'), /無效/);
    assert.equal(storyboardImages.isValidStorageObjectPath('projects/p1/s1/img1.png'), true);
    assert.equal(storyboardImages.isValidStorageObjectPath('projects/p1/../s1/img1.png'), false);

    assert.throws(() => storyboardImages.normalizeIncomingImageRef(PNG_DATA_URI, { projectId: 'p1', shotId: 's1' }), /Base64/);
    assert.throws(() => storyboardImages.normalizeIncomingImageRef('https://evil.example/img.png', { projectId: 'p1', shotId: 's1' }), /不信任/);
    assert.throws(() => storyboardImages.normalizeIncomingImageRef('storage://storyboard-images/projects/other-proj/s1/a.png', { projectId: 'p1', shotId: 's1' }), /不屬於此專案/);

    // Expiring signed URL is normalized back to permanent storage:// ref
    const signedUrl = 'https://demo.supabase.co/storage/v1/object/sign/storyboard-images/projects/p1/s1/abc.png?token=expiring';
    const normalized = storyboardImages.normalizeIncomingImageRef(signedUrl, {
        projectId: 'p1',
        shotId: 's1',
        env: { SUPABASE_URL: 'https://demo.supabase.co' }
    });
    assert.equal(normalized, 'storage://storyboard-images/projects/p1/s1/abc.png');
});

test('uploadImageBuffer deduplicates identical SHA-256 content within shot history', async () => {
    const storage = createMockStorage();
    const first = await storyboardImages.uploadImageBuffer({
        projectId: 'proj-1',
        shotId: 'shot-1',
        buffer: PNG_BUF,
        mimeType: 'image/png',
        storageClient: storage
    });
    assert.equal(first.deduplicated, false);
    assert.equal(storage.stats.uploadCalls, 1);

    const second = await storyboardImages.uploadImageBuffer({
        projectId: 'proj-1',
        shotId: 'shot-1',
        buffer: PNG_BUF,
        mimeType: 'image/png',
        existingHistory: [{ image: first.storageRef, imageRef: first.storageRef, sha256: first.sha256 }],
        storageClient: storage
    });
    assert.equal(second.deduplicated, true);
    assert.equal(second.storageRef, first.storageRef);
    assert.equal(storage.stats.uploadCalls, 1);
});

test('copyStorageObjectsForDuplicate creates independent copies and rolls back on partial failure', async () => {
    const storage = createMockStorage();
    const up1 = await storyboardImages.uploadImageBuffer({ projectId: 'p1', shotId: 's1', buffer: PNG_BUF, mimeType: 'image/png', storageClient: storage });
    const up2 = await storyboardImages.uploadImageBuffer({ projectId: 'p1', shotId: 's2', buffer: JPEG_BUF, mimeType: 'image/jpeg', storageClient: storage });

    const sourceShots = [
        { order: 1, payload: { image: up1.storageRef, imageHistory: [{ image: up1.storageRef }] } },
        { order: 2, payload: { image: up2.storageRef } }
    ];
    const targetShotMap = new Map([[1, 's1-copy'], [2, 's2-copy']]);

    // 1. Success copy
    const copied = await storyboardImages.copyStorageObjectsForDuplicate({
        sourceShots,
        targetProjectId: 'p2',
        targetShotIdByOrder: targetShotMap,
        storageClient: storage
    });
    assert.equal(copied.copiedPaths.length, 2);
    assert.notEqual(copied.refMap.get(up1.storageRef), up1.storageRef);
    assert.ok(copied.refMap.get(up1.storageRef).includes('projects/p2/s1-copy/'));

    // 2. Partial failure on second copy rolls back first copy
    const failingStorage = createMockStorage({ failCopyOnCall: 2 });
    failingStorage.objects.set(up1.objectPath, { buffer: PNG_BUF, contentType: 'image/png', size: PNG_BUF.length });
    failingStorage.objects.set(up2.objectPath, { buffer: JPEG_BUF, contentType: 'image/jpeg', size: JPEG_BUF.length });

    await assert.rejects(() => storyboardImages.copyStorageObjectsForDuplicate({
        sourceShots,
        targetProjectId: 'p3',
        targetShotIdByOrder: targetShotMap,
        storageClient: failingStorage
    }), /複製專案圖片失敗/);
    assert.equal(failingStorage.objects.size, 2); // Only original 2 objects remain
});

test('dynamic cover uses lowest-order first shot, does not fall back to second shot, and follows reordering', async () => {
    const storage = createMockStorage();
    const s1Ref = 'storage://storyboard-images/projects/p1/s1/first.png';
    const s2Ref = 'storage://storyboard-images/projects/p1/s2/second.png';

    // First shot has no image -> cover is null (does NOT fall back to second shot)
    const noFirstCover = await projectLifecycle.resolveProjectCover({
        id: 'p1',
        shots: [
            { id: 's1', order: 1, payload: { image: null } },
            { id: 's2', order: 2, payload: { image: s2Ref } }
        ]
    }, { storageClient: storage });
    assert.equal(noFirstCover, null);

    // Reorder so s2 becomes order 1 -> cover follows s2
    const reorderedCover = await projectLifecycle.resolveProjectCover({
        id: 'p1',
        shots: [
            { id: 's1', order: 2, payload: { image: s1Ref } },
            { id: 's2', order: 1, payload: { image: s2Ref } }
        ]
    }, { storageClient: storage });
    assert.ok(reorderedCover.includes('projects/p1/s2/second.png'));
});

test('GET /api/projects/:id strips sensitive user fields (passwordHash, apiCredentials) and resolves dynamic cover', async () => {
    Object.assign(process.env, { NODE_ENV: 'production', JWT_SECRET: 'storage-route-test-secret' });

    const storage = createMockStorage();
    const imgRef = 'storage://storyboard-images/projects/proj-safe/shot-1/a1.png';
    storage.objects.set('projects/proj-safe/shot-1/a1.png', { buffer: PNG_BUF, contentType: 'image/png', size: PNG_BUF.length });

    const prismaPath = require.resolve('@prisma/client');
    require(prismaPath);
    const original = require.cache[prismaPath].exports;

    class FakePrisma {
        constructor() {
            this.userApiCredential = {
                findMany: async () => []
            };
            this.project = {
                findUnique: async ({ where }) => {
                    if (where.id !== 'proj-safe') return null;
                    return {
                        id: 'proj-safe',
                        shortId: 'abcd1234',
                        authorId: 'u1',
                        title: 'Safe Project',
                        style: 'Film',
                        ratio: '16:9',
                        cover: null,
                        metadata: { tags: ['測試'] },
                        is_deleted: false,
                        deletedAt: null,
                        createAt: new Date(),
                        updatedAt: new Date(),
                        shots: [
                            { id: 'shot-1', projectId: 'proj-safe', order: 1, title: 'S1', camera: 'Wide', duration: '3s', payload: { image: imgRef }, createAt: new Date(), updateAt: new Date() }
                        ],
                        // Even if mock leaks passwordHash, server defensive projection must strip it
                        author: {
                            id: 'u1',
                            name: 'Alice',
                            email: 'alice@example.com',
                            passwordHash: '$2b$10$SUPER_SECRET_HASH',
                            apiCredentials: [{ encryptedKey: 'SECRET' }],
                            plan: 'pro',
                            aiProvider: 'gemini',
                            createAt: new Date()
                        }
                    };
                }
            };
        }
    }

    const serverPath = require.resolve('../server');
    delete require.cache[serverPath];
    require.cache[prismaPath].exports = { ...original, PrismaClient: FakePrisma };
    const app = require('../server');
    app.locals.storageClient = storage;
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = jwt.sign({ id: 'u1' }, process.env.JWT_SECRET);

    try {
        const res = await fetch(`${base}/api/projects/proj-safe`, {
            headers: { Authorization: `Bearer ${token}`, Connection: 'close' }
        });
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.project.author.passwordHash, undefined);
        assert.equal(body.project.author.apiCredentials, undefined);
        assert.equal(body.project.author.email, 'alice@example.com');
        assert.ok(body.project.cover.includes('projects/proj-safe/shot-1/a1.png'));
        assert.equal(body.project.shots[0].payload.imageRef, imgRef);
        assert.ok(body.project.shots[0].payload.image.includes('token=sig-'));

        // Verify cron endpoint rejects missing/wrong secret
        process.env.CRON_SECRET = 'cron-test-secret';
        const cronUnauth = await fetch(`${base}/api/internal/cron/cleanup-trash`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Connection: 'close' },
            body: JSON.stringify({ dryRun: true })
        });
        assert.equal(cronUnauth.status, 401);
    } finally {
        delete process.env.CRON_SECRET;
        require.cache[prismaPath].exports = original;
        delete require.cache[serverPath];
        server.closeAllConnections?.();
        await new Promise(resolve => server.close(resolve));
    }
});
