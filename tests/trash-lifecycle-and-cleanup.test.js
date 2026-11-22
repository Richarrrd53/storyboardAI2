'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const lifecycle = require('../lib/projects/lifecycle');

function createLifecycleFixture() {
    const projects = new Map();
    const shots = new Map();
    const cleanupJobs = new Map();

    const addProject = (p, shotList = []) => {
        projects.set(p.id, { ...p });
        for (const s of shotList) shots.set(s.id, { ...s, projectId: p.id });
    };

    const prisma = {
        project: {
            async findUnique({ where, include }) {
                const p = projects.get(where.id);
                if (!p) return null;
                if (include?.shots) {
                    return { ...p, shots: Array.from(shots.values()).filter(s => s.projectId === p.id) };
                }
                return { ...p };
            },
            async findMany({ where = {}, take = 100 } = {}) {
                let list = Array.from(projects.values());
                if (where.authorId !== undefined) list = list.filter(p => p.authorId === where.authorId);
                if (where.is_deleted !== undefined) list = list.filter(p => p.is_deleted === where.is_deleted);
                if (where.deletedAt && typeof where.deletedAt === 'object') {
                    if (where.deletedAt.not === null) list = list.filter(p => p.deletedAt !== null);
                    if (where.deletedAt.lte) list = list.filter(p => p.deletedAt && new Date(p.deletedAt) <= where.deletedAt.lte);
                }
                return list.slice(0, take).map(p => ({ ...p }));
            },
            async count({ where = {} } = {}) {
                return (await this.findMany({ where })).length;
            },
            async update({ where, data }) {
                const p = projects.get(where.id);
                Object.assign(p, data);
                return { ...p };
            },
            async delete({ where }) {
                if (prisma._failDbDelete) throw new Error('simulated DB delete failure');
                const p = projects.get(where.id);
                projects.delete(where.id);
                return p;
            }
        },
        shot: {
            async findMany({ where = {}, take = 200, cursor, skip = 0 } = {}) {
                let list = Array.from(shots.values()).sort((a, b) => a.id.localeCompare(b.id));
                if (where.projectId?.notIn) {
                    const excluded = new Set(where.projectId.notIn);
                    list = list.filter(s => !excluded.has(s.projectId));
                }
                if (cursor?.id) {
                    const idx = list.findIndex(s => s.id === cursor.id);
                    list = idx >= 0 ? list.slice(idx + skip) : [];
                }
                return list.slice(0, take);
            },
            async deleteMany({ where }) {
                for (const [id, s] of shots.entries()) {
                    if (s.projectId === where.projectId) shots.delete(id);
                }
            }
        },
        cleanupJob: {
            async findUnique({ where }) {
                return cleanupJobs.get(where.projectId) || null;
            },
            async findMany({ where = {}, take = 20 } = {}) {
                const list = Array.from(cleanupJobs.values()).filter(j => {
                    if (where.OR) {
                        return where.OR.some(cond => {
                            if (cond.status?.in) return cond.status.in.includes(j.status);
                            if (cond.status === 'processing' && cond.lockedAt?.lt) {
                                return j.status === 'processing' && j.lockedAt && new Date(j.lockedAt) < cond.lockedAt.lt;
                            }
                            return false;
                        });
                    }
                    return true;
                });
                return list.slice(0, take);
            },
            async upsert({ where, create, update }) {
                const existing = cleanupJobs.get(where.projectId);
                const next = existing ? { ...existing, ...update, updatedAt: new Date() } : { id: `job-${where.projectId}`, ...create, updatedAt: new Date() };
                cleanupJobs.set(where.projectId, next);
                return next;
            },
            async deleteMany({ where }) {
                const existing = cleanupJobs.get(where.projectId);
                if (existing && (where.dbDeleted === undefined || existing.dbDeleted === where.dbDeleted)) {
                    cleanupJobs.delete(where.projectId);
                }
            }
        },
        async $transaction(fn) {
            return fn(prisma);
        },
        _failDbDelete: false
    };

    const removedPaths = [];
    const storageClient = {
        failRemove: false,
        async remove(paths) {
            if (this.failRemove) return { data: null, error: { message: 'storage remove error' } };
            removedPaths.push(...paths);
            return { data: paths, error: null };
        }
    };

    return { prisma, projects, shots, cleanupJobs, storageClient, removedPaths, addProject };
}

test('permanent delete validates ownership, trash status, and protects shared storage objects', async () => {
    const f = createLifecycleFixture();
    const sharedRef = 'storage://storyboard-images/projects/p1/s1/shared.png';
    const privateRef = 'storage://storyboard-images/projects/p1/s1/private.png';

    f.addProject({ id: 'p-active', authorId: 'u1', is_deleted: false, deletedAt: null }, []);
    f.addProject({ id: 'p1', authorId: 'u1', is_deleted: true, deletedAt: new Date('2026-10-01T00:00:00Z') }, [
        { id: 's1', order: 1, payload: { image: privateRef, imageHistory: [{ image: sharedRef }] } }
    ]);
    f.addProject({ id: 'p2', authorId: 'u1', is_deleted: false, deletedAt: null }, [
        { id: 's2', order: 1, payload: { image: sharedRef } }
    ]);

    // Cannot permanently delete active project
    const notTrashed = await lifecycle.permanentlyDeleteProject({ prisma: f.prisma, projectId: 'p-active', authorId: 'u1', storageClient: f.storageClient });
    assert.equal(notTrashed.ok, false);
    assert.equal(notTrashed.code, 'PROJECT_NOT_IN_TRASH');

    // Cannot delete another user's project
    const forbidden = await lifecycle.permanentlyDeleteProject({ prisma: f.prisma, projectId: 'p1', authorId: 'u2', storageClient: f.storageClient });
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.code, 'FORBIDDEN');

    // Deletes privateRef but skips sharedRef still referenced by p2
    const ok = await lifecycle.permanentlyDeleteProject({ prisma: f.prisma, projectId: 'p1', authorId: 'u1', storageClient: f.storageClient });
    assert.equal(ok.ok, true);
    assert.equal(ok.deletedStorageCount, 1);
    assert.equal(ok.skippedSharedCount, 1);
    assert.deepEqual(f.removedPaths, ['projects/p1/s1/private.png']);
    assert.equal(f.projects.has('p1'), false);
    assert.equal(f.cleanupJobs.get('p1').status, 'completed');
});

test('batch operations isolate partial failures and never interrupt remaining items', async () => {
    const f = createLifecycleFixture();
    f.addProject({ id: 'p1', authorId: 'u1', is_deleted: true, deletedAt: new Date() }, []);
    f.addProject({ id: 'p2', authorId: 'u2', is_deleted: true, deletedAt: new Date() }, []); // other user
    f.addProject({ id: 'p3', authorId: 'u1', is_deleted: false, deletedAt: null }, []); // active

    const delRes = await lifecycle.batchPermanentDeleteProjects({
        prisma: f.prisma,
        authorId: 'u1',
        projectIds: ['p1', 'p2', 'p3', 'missing'],
        storageClient: f.storageClient
    });
    assert.equal(delRes.ok, true);
    assert.equal(delRes.summary.succeeded, 1);
    assert.equal(delRes.summary.failed, 3);
    assert.equal(f.projects.has('p1'), false);
    assert.equal(f.projects.has('p2'), true);
    assert.equal(f.projects.has('p3'), true);

    // Batch trash + batch restore all
    const trashRes = await lifecycle.batchTrashProjects({ prisma: f.prisma, authorId: 'u1', projectIds: ['p3', 'p2'] });
    assert.equal(trashRes.summary.succeeded, 1);
    assert.equal(trashRes.summary.failed, 1);
    assert.equal(f.projects.get('p3').is_deleted, true);
    assert.ok(f.projects.get('p3').deletedAt instanceof Date);

    const restoreAll = await lifecycle.batchRestoreProjects({ prisma: f.prisma, authorId: 'u1', all: true });
    assert.equal(restoreAll.summary.succeeded, 1);
    assert.equal(f.projects.get('p3').is_deleted, false);
    assert.equal(f.projects.get('p3').deletedAt, null);
});

test('30-day retention cleanup preserves <30d projects, removes >=30d, recovers from storage/DB failures, and respects restore', async () => {
    const f = createLifecycleFixture();
    const now = new Date('2026-11-22T00:00:00Z');
    const expiredDate = new Date('2026-10-20T00:00:00Z'); // 33 days ago
    const recentDate = new Date('2026-11-10T00:00:00Z');  // 12 days ago

    f.addProject({ id: 'p-expired', authorId: 'u1', is_deleted: true, deletedAt: expiredDate }, [
        { id: 's-exp', order: 1, payload: { image: 'storage://storyboard-images/projects/p-expired/s-exp/a.png' } }
    ]);
    f.addProject({ id: 'p-recent', authorId: 'u1', is_deleted: true, deletedAt: recentDate }, []);
    f.addProject({ id: 'p-legacy-null', authorId: 'u1', is_deleted: true, deletedAt: null }, []);

    // 1. Storage failure records failed CleanupJob and preserves project for retry
    f.storageClient.failRemove = true;
    const firstRun = await lifecycle.runRetentionCleanup({ prisma: f.prisma, storageClient: f.storageClient, now });
    assert.equal(firstRun.summary.expiredFound, 1);
    assert.equal(firstRun.summary.failed, 1);
    assert.equal(f.projects.has('p-expired'), true);
    assert.equal(f.projects.has('p-recent'), true);
    assert.equal(f.projects.has('p-legacy-null'), true);
    assert.equal(f.cleanupJobs.get('p-expired').status, 'failed');

    // 2. Storage recovers, retry completes cleanup
    f.storageClient.failRemove = false;
    const secondRun = await lifecycle.runRetentionCleanup({ prisma: f.prisma, storageClient: f.storageClient, now });
    assert.equal(secondRun.summary.succeeded, 1);
    assert.equal(f.projects.has('p-expired'), false);
    assert.equal(f.projects.has('p-recent'), true);
    assert.equal(f.projects.has('p-legacy-null'), true);

    // 3. Restoring a project with a pending failed cleanup job cancels cleanup
    f.addProject({ id: 'p-restored', authorId: 'u1', is_deleted: true, deletedAt: expiredDate }, []);
    f.prisma._failDbDelete = true;
    await lifecycle.runRetentionCleanup({ prisma: f.prisma, storageClient: f.storageClient, now });
    assert.equal(f.cleanupJobs.get('p-restored').status, 'failed');

    f.prisma._failDbDelete = false;
    await lifecycle.batchRestoreProjects({ prisma: f.prisma, authorId: 'u1', projectIds: ['p-restored'] });
    assert.equal(f.cleanupJobs.has('p-restored'), false);

    const thirdRun = await lifecycle.runRetentionCleanup({ prisma: f.prisma, storageClient: f.storageClient, now });
    assert.equal(thirdRun.summary.expiredFound, 0);
    assert.equal(f.projects.has('p-restored'), true);
});
