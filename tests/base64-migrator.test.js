'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    inventoryBase64Images,
    migrateBase64Images,
    backfillLegacyDeletedAt
} = require('../lib/storage/base64-migrator');

const PNG_A = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x01]);
const PNG_B = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x02]);
const DATA_A = `data:image/png;base64,${PNG_A.toString('base64')}`;
const DATA_B = `data:image/png;base64,${PNG_B.toString('base64')}`;

function createInMemoryDb() {
    const projects = new Map();
    const shots = new Map();

    const p1 = {
        id: 'p1',
        title: 'Project 1',
        cover: DATA_A,
        is_deleted: false,
        deletedAt: null,
        updatedAt: new Date('2026-01-01T00:00:00Z')
    };
    const s1 = {
        id: 's1',
        projectId: 'p1',
        order: 1,
        updateAt: new Date('2026-01-01T00:00:00Z'),
        payload: {
            image: DATA_A,
            imageHistory: [
                { version: 2, image: DATA_A, prompt: 'v2' },
                { version: 1, image: DATA_B, prompt: 'v1' }
            ]
        }
    };
    const p2 = {
        id: 'p2',
        title: 'Cover Anomaly & Legacy Trash',
        cover: DATA_B, // Different from first shot (DATA_A)
        is_deleted: true,
        deletedAt: null,
        updatedAt: new Date('2025-01-01T00:00:00Z')
    };
    const s2 = {
        id: 's2',
        projectId: 'p2',
        order: 1,
        updateAt: new Date('2026-01-01T00:00:00Z'),
        payload: { image: DATA_A }
    };

    projects.set('p1', p1);
    projects.set('p2', p2);
    shots.set('s1', s1);
    shots.set('s2', s2);

    const prisma = {
        project: {
            async findMany({ where, take = 20, cursor, skip = 0 } = {}) {
                let list = Array.from(projects.values()).sort((a, b) => a.id.localeCompare(b.id));
                if (where) {
                    if (where.is_deleted !== undefined) list = list.filter(p => p.is_deleted === where.is_deleted);
                    if (where.deletedAt === null) list = list.filter(p => p.deletedAt === null);
                }
                if (cursor?.id) {
                    const idx = list.findIndex(p => p.id === cursor.id);
                    list = idx >= 0 ? list.slice(idx + skip) : [];
                }
                return list.slice(0, take).map(p => ({
                    ...p,
                    shots: Array.from(shots.values()).filter(s => s.projectId === p.id).sort((a, b) => a.order - b.order)
                }));
            },
            async update({ where, data }) {
                const p = projects.get(where.id);
                Object.assign(p, data);
                return p;
            },
            async updateMany({ where, data }) {
                let count = 0;
                for (const p of projects.values()) {
                    if (where.id?.in && !where.id.in.includes(p.id)) continue;
                    if (where.is_deleted !== undefined && p.is_deleted !== where.is_deleted) continue;
                    if (where.deletedAt === null && p.deletedAt !== null) continue;
                    Object.assign(p, data);
                    count++;
                }
                return { count };
            }
        },
        shot: {
            async findUnique({ where }) {
                return shots.get(where.id) || null;
            },
            async update({ where, data }) {
                const s = shots.get(where.id);
                Object.assign(s, data, { updateAt: new Date() });
                return s;
            }
        }
    };

    return { prisma, projects, shots };
}

function createStorageMock() {
    const objects = new Map();
    let uploads = 0;
    return {
        objects,
        get uploads() { return uploads; },
        async upload(objectPath, buffer, opts) {
            uploads++;
            objects.set(objectPath, { buffer: Buffer.from(buffer), size: buffer.length, contentType: opts?.contentType });
            return { data: { path: objectPath }, error: null };
        },
        async list(folder, { search } = {}) {
            const res = [];
            for (const [k, v] of objects.entries()) {
                if (k.startsWith(folder + '/') && (!search || k.endsWith('/' + search))) {
                    res.push({ name: k.split('/').pop(), metadata: { size: v.size, mimetype: v.contentType } });
                }
            }
            return { data: res, error: null };
        }
    };
}

test('inventoryBase64Images is strictly read-only and reports counts, duplicates, and cover anomalies', async () => {
    const { prisma, projects, shots } = createInMemoryDb();
    const report = await inventoryBase64Images({ prisma });

    assert.equal(report.readOnly, true);
    assert.equal(report.projectCount, 2);
    assert.equal(report.shotCount, 2);
    assert.equal(report.shotImageBase64Count, 2);
    assert.equal(report.shotHistoryBase64Count, 2);
    assert.equal(report.projectCoverBase64Count, 2);
    assert.equal(report.duplicateBase64Count, 2); // DATA_A appears 3 times in shots/history -> 2 duplicates
    assert.equal(report.legacyDeletedWithoutDeletedAt, 1);
    assert.equal(report.coverAnomalies.length, 1);
    assert.equal(report.coverAnomalies[0].projectId, 'p2');
    // Verify nothing mutated
    assert.equal(projects.get('p1').cover, DATA_A);
    assert.equal(shots.get('s1').payload.image, DATA_A);
});

test('migrateBase64Images supports dry-run, idempotent re-runs, deduplication, and anomaly preservation', async () => {
    const { prisma, projects, shots } = createInMemoryDb();
    const storage = createStorageMock();

    // 1. Dry run leaves DB and Storage untouched
    const dryReport = await migrateBase64Images({ prisma, storageClient: storage, dryRun: true, logger: null });
    assert.equal(dryReport.dryRun, true);
    assert.equal(dryReport.migratedImages, 4);
    assert.equal(storage.uploads, 0);
    assert.equal(shots.get('s1').payload.image, DATA_A);

    // 2. Execute migration
    const execReport = await migrateBase64Images({ prisma, storageClient: storage, dryRun: false, logger: null });
    assert.equal(execReport.dryRun, false);
    assert.equal(execReport.failures.length, 0);
    assert.equal(execReport.migratedImages, 4);
    assert.equal(execReport.deduplicatedImages, 1); // s1 main & history[0] share DATA_A within p1
    assert.equal(storage.uploads, 3); // p1: DATA_A + DATA_B, p2: DATA_A
    assert.ok(shots.get('s1').payload.image.startsWith('storage://'));
    assert.equal(projects.get('p1').cover, null); // Cleared because matched first shot
    assert.equal(projects.get('p2').cover, DATA_B); // Preserved because anomaly (different from first shot)
    assert.equal(execReport.coverAnomalies.length, 1);

    // 3. Re-running migration is idempotent (no additional uploads)
    const rerun = await migrateBase64Images({ prisma, storageClient: storage, dryRun: false, logger: null });
    assert.equal(rerun.migratedImages, 0);
    assert.equal(storage.uploads, 3);
    assert.ok(rerun.skippedAlreadyMigrated >= 3);
});

test('migrateBase64Images detects concurrent shot modification and records orphaned upload without overwriting', async () => {
    const { prisma, shots } = createInMemoryDb();
    const storage = createStorageMock();

    // Simulate user editing shot s1 while migration is uploading
    const origFindUnique = prisma.shot.findUnique;
    prisma.shot.findUnique = async ({ where }) => {
        const s = await origFindUnique({ where });
        if (where.id === 's1') {
            return { ...s, updateAt: new Date('2026-11-22T00:00:00Z') };
        }
        return s;
    };

    const report = await migrateBase64Images({ prisma, storageClient: storage, dryRun: false, logger: null });
    assert.equal(report.conflicts.length, 1);
    assert.equal(report.conflicts[0].shotId, 's1');
    assert.ok(report.orphanedUploads.length >= 1);
    assert.equal(shots.get('s1').payload.image, DATA_A); // Did not overwrite
});

test('backfillLegacyDeletedAt grants safe 30-day window without using old updatedAt', async () => {
    const { prisma, projects } = createInMemoryDb();
    const activationTime = new Date('2026-11-22T00:00:00Z');

    const dry = await backfillLegacyDeletedAt({ prisma, dryRun: true, now: activationTime });
    assert.equal(dry.found, 1);
    assert.equal(dry.updated, 0);
    assert.equal(projects.get('p2').deletedAt, null);

    const exec = await backfillLegacyDeletedAt({ prisma, dryRun: false, now: activationTime });
    assert.equal(exec.updated, 1);
    assert.equal(projects.get('p2').deletedAt.toISOString(), activationTime.toISOString());
});
