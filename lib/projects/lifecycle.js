'use strict';

const {
    extractStorageRefsFromProject,
    removeStorageObjects,
    resolveImageUrl,
    parseStorageRef,
    isBase64DataUri
} = require('../storage/storyboard-images');

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const MAX_BATCH_SIZE = 100;
const JOB_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const SAFE_AUTHOR_SELECT = Object.freeze({
    id: true,
    name: true,
    email: true,
    image: true,
    plan: true,
    aiProvider: true,
    createAt: true
});

function getFirstShot(shots) {
    if (!Array.isArray(shots) || shots.length === 0) return null;
    let first = null;
    for (const shot of shots) {
        if (!shot) continue;
        if (!first) {
            first = shot;
            continue;
        }
        const aOrder = Number.isFinite(Number(shot.order)) ? Number(shot.order) : Number.MAX_SAFE_INTEGER;
        const bOrder = Number.isFinite(Number(first.order)) ? Number(first.order) : Number.MAX_SAFE_INTEGER;
        if (aOrder < bOrder) {
            first = shot;
        }
    }
    return first;
}

function getFirstShotRawImage(project) {
    const firstShot = getFirstShot(project?.shots);
    const img = firstShot?.payload?.image;
    if (typeof img === 'string' && img.trim() && img !== '../icon/error.jpg' && img !== '/icon/error.jpg') {
        return { image: img.trim(), shot: firstShot };
    }
    return { image: null, shot: firstShot };
}

async function resolveProjectCover(project, options = {}) {
    if (!project) return null;
    const { image, shot } = getFirstShotRawImage(project);
    if (!image) {
        // Do NOT fall back to the second shot. Return null so frontend shows default placeholder.
        return null;
    }
    const versionTs = shot?.updateAt ? new Date(shot.updateAt).getTime() : Date.now();
    const legacyProxyUrl = `/api/projects/${project.id}/cover?v=${versionTs}`;
    return resolveImageUrl(image, {
        ...options,
        legacyProxyUrl
    });
}

function computeTrashRetention(project, now = new Date()) {
    if (!project || !project.is_deleted) {
        return {
            deletedAt: null,
            expiresAt: null,
            remainingMs: null,
            remainingDays: null,
            isExpired: false,
            pendingCleanup: false
        };
    }

    if (!project.deletedAt) {
        // Transitional safety for legacy soft-deleted projects without deletedAt:
        // never mark them immediately expired.
        return {
            deletedAt: null,
            expiresAt: null,
            remainingMs: null,
            remainingDays: RETENTION_DAYS,
            isExpired: false,
            pendingCleanup: false
        };
    }

    const deletedTime = new Date(project.deletedAt).getTime();
    if (!Number.isFinite(deletedTime)) {
        return {
            deletedAt: null,
            expiresAt: null,
            remainingMs: null,
            remainingDays: RETENTION_DAYS,
            isExpired: false,
            pendingCleanup: false
        };
    }

    const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const expiresMs = deletedTime + RETENTION_MS;
    const remainingMs = Math.max(0, expiresMs - nowMs);
    const isExpired = nowMs >= expiresMs;
    const remainingDays = isExpired ? 0 : Math.ceil(remainingMs / (24 * 60 * 60 * 1000));

    return {
        deletedAt: new Date(deletedTime).toISOString(),
        expiresAt: new Date(expiresMs).toISOString(),
        remainingMs,
        remainingDays,
        isExpired,
        pendingCleanup: isExpired
    };
}

async function findReferencedStorageRefs(prisma, candidateRefs = [], excludeProjectIds = [], env = process.env) {
    const candidateSet = new Set(
        candidateRefs.map(item => (typeof item === 'string' ? item : item?.ref)).filter(Boolean)
    );
    if (candidateSet.size === 0) return new Set();

    const excludeSet = new Set(excludeProjectIds.map(String));
    const referenced = new Set();

    if (!prisma?.shot?.findMany) {
        return referenced;
    }

    // Scan shots in batches to avoid memory spikes when DB is large
    const batchSize = 200;
    let cursor = null;
    while (true) {
        const query = {
            where: excludeSet.size > 0 ? { projectId: { notIn: Array.from(excludeSet) } } : {},
            select: { id: true, projectId: true, payload: true },
            take: batchSize,
            orderBy: { id: 'asc' },
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
        };
        const shots = await prisma.shot.findMany(query);
        if (!Array.isArray(shots) || shots.length === 0) break;

        for (const shot of shots) {
            if (excludeSet.has(String(shot.projectId))) continue;
            const payload = shot.payload || {};
            const check = (val) => {
                const parsed = parseStorageRef(val, { env });
                if (parsed && candidateSet.has(parsed.ref)) {
                    referenced.add(parsed.ref);
                }
            };
            check(payload.image);
            check(payload.imageRef);
            if (Array.isArray(payload.imageHistory)) {
                for (const h of payload.imageHistory) {
                    check(h?.imageRef);
                    check(h?.image);
                }
            }
        }

        if (referenced.size === candidateSet.size) break;
        if (shots.length < batchSize) break;
        cursor = shots[shots.length - 1].id;
    }

    return referenced;
}

async function upsertCleanupJob(prisma, data) {
    if (!prisma?.cleanupJob?.upsert) return null;
    try {
        return await prisma.cleanupJob.upsert({
            where: { projectId: data.projectId },
            create: {
                projectId: data.projectId,
                authorId: data.authorId || null,
                reason: data.reason || 'manual_permanent_delete',
                status: data.status || 'processing',
                storagePaths: data.storagePaths || [],
                deletedPaths: data.deletedPaths || [],
                dbDeleted: Boolean(data.dbDeleted),
                attempts: data.attempts ?? 1,
                lastError: data.lastError || null,
                lockedAt: data.lockedAt || new Date()
            },
            update: {
                ...(data.status !== undefined ? { status: data.status } : {}),
                ...(data.storagePaths !== undefined ? { storagePaths: data.storagePaths } : {}),
                ...(data.deletedPaths !== undefined ? { deletedPaths: data.deletedPaths } : {}),
                ...(data.dbDeleted !== undefined ? { dbDeleted: data.dbDeleted } : {}),
                ...(data.attempts !== undefined ? { attempts: data.attempts } : {}),
                ...(data.lastError !== undefined ? { lastError: data.lastError } : {}),
                ...(data.lockedAt !== undefined ? { lockedAt: data.lockedAt } : {})
            }
        });
    } catch (err) {
        // Tolerate missing CleanupJob table during partial test mocks
        console.warn('[ProjectLifecycle] CleanupJob upsert skipped:', err.message);
        return null;
    }
}

async function cancelPendingCleanupJob(prisma, projectId) {
    if (!prisma?.cleanupJob?.deleteMany) return;
    try {
        await prisma.cleanupJob.deleteMany({
            where: {
                projectId,
                dbDeleted: false
            }
        });
    } catch (_) {
        // Ignore if table not present in mock
    }
}

const inFlightPermanentDeletes = new Set();

async function permanentlyDeleteProject({
    prisma,
    projectId,
    authorId = null,
    requireOwnership = true,
    reason = 'manual_permanent_delete',
    storageClient,
    env = process.env,
    now = new Date()
}) {
    if (!projectId) {
        return { ok: false, status: 400, code: 'INVALID_PROJECT_ID', error: '缺少專案 ID' };
    }

    if (inFlightPermanentDeletes.has(projectId)) {
        return { ok: false, status: 409, code: 'DELETE_IN_PROGRESS', error: '此專案正在永久刪除中，請勿重複送出' };
    }

    inFlightPermanentDeletes.add(projectId);
    try {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { shots: true }
        });

        const existingJob = prisma?.cleanupJob?.findUnique
            ? await prisma.cleanupJob.findUnique({ where: { projectId } }).catch(() => null)
            : null;

        if (!project) {
            // If DB row already deleted, check whether there is a pending CleanupJob with leftover storage objects
            if (existingJob && existingJob.status !== 'completed') {
                return resumeCleanupJob({ prisma, job: existingJob, storageClient, env, now });
            }
            return { ok: false, status: 404, code: 'PROJECT_NOT_FOUND', error: '找不到專案' };
        }

        if (requireOwnership && project.authorId !== authorId) {
            return { ok: false, status: 403, code: 'FORBIDDEN', error: '沒有權限永久刪除此專案' };
        }

        if (!project.is_deleted) {
            return { ok: false, status: 400, code: 'PROJECT_NOT_IN_TRASH', error: '僅能永久刪除位於資源回收桶內的專案' };
        }

        const storageRefs = extractStorageRefsFromProject(project, env);
        const allRefStrings = Array.from(new Set([
            ...storageRefs.map(r => r.ref),
            ...(Array.isArray(existingJob?.storagePaths) ? existingJob.storagePaths : [])
        ]));

        // Check cross-project references before deleting any storage object
        const referencedElsewhere = await findReferencedStorageRefs(prisma, allRefStrings, [projectId], env);
        const alreadyDeletedSet = new Set(Array.isArray(existingJob?.deletedPaths) ? existingJob.deletedPaths : []);
        const deletableRefs = allRefStrings.filter(ref => !referencedElsewhere.has(ref) && !alreadyDeletedSet.has(ref));
        const skippedSharedRefs = allRefStrings.filter(ref => referencedElsewhere.has(ref));

        const nextAttempts = (existingJob?.attempts || 0) + 1;
        await upsertCleanupJob(prisma, {
            projectId,
            authorId: project.authorId,
            reason: existingJob?.reason || reason,
            status: 'processing',
            storagePaths: allRefStrings,
            deletedPaths: Array.from(alreadyDeletedSet),
            dbDeleted: false,
            attempts: nextAttempts,
            lastError: null,
            lockedAt: now
        });

        // 1. Delete unreferenced Storage objects
        let storageResult = { deleted: [], failed: [] };
        if (deletableRefs.length > 0) {
            storageResult = await removeStorageObjects(deletableRefs, { storageClient, env });
        }

        const updatedDeletedPaths = Array.from(new Set([...alreadyDeletedSet, ...storageResult.deleted]));

        if (storageResult.failed.length > 0) {
            const errMsg = `部分 Storage 圖片清理失敗 (${storageResult.failed.length}/${deletableRefs.length})：${storageResult.failed[0].error}`;
            await upsertCleanupJob(prisma, {
                projectId,
                authorId: project.authorId,
                reason: existingJob?.reason || reason,
                status: 'failed',
                storagePaths: allRefStrings,
                deletedPaths: updatedDeletedPaths,
                dbDeleted: false,
                attempts: nextAttempts,
                lastError: errMsg,
                lockedAt: null
            });
            return {
                ok: false,
                status: 502,
                code: 'STORAGE_CLEANUP_FAILED',
                error: errMsg,
                projectId,
                deletedStorageCount: updatedDeletedPaths.length,
                failedStorageCount: storageResult.failed.length,
                skippedSharedCount: skippedSharedRefs.length
            };
        }

        // 2. Delete Shots and Project in DB
        try {
            if (typeof prisma.$transaction === 'function') {
                await prisma.$transaction(async (tx) => {
                    if (tx.shot?.deleteMany) {
                        await tx.shot.deleteMany({ where: { projectId } });
                    }
                    await tx.project.delete({ where: { id: projectId } });
                });
            } else {
                if (prisma.shot?.deleteMany) {
                    await prisma.shot.deleteMany({ where: { projectId } });
                }
                await prisma.project.delete({ where: { id: projectId } });
            }
        } catch (dbError) {
            const errMsg = `資料庫刪除失敗：${dbError.message || '未知錯誤'}`;
            await upsertCleanupJob(prisma, {
                projectId,
                authorId: project.authorId,
                reason: existingJob?.reason || reason,
                status: 'failed',
                storagePaths: allRefStrings,
                deletedPaths: updatedDeletedPaths,
                dbDeleted: false,
                attempts: nextAttempts,
                lastError: errMsg,
                lockedAt: null
            });
            return {
                ok: false,
                status: 500,
                code: 'DB_DELETE_FAILED',
                error: errMsg,
                projectId
            };
        }

        // 3. Mark CleanupJob completed
        await upsertCleanupJob(prisma, {
            projectId,
            authorId: project.authorId,
            reason: existingJob?.reason || reason,
            status: 'completed',
            storagePaths: allRefStrings,
            deletedPaths: updatedDeletedPaths,
            dbDeleted: true,
            attempts: nextAttempts,
            lastError: null,
            lockedAt: null
        });

        return {
            ok: true,
            status: 200,
            projectId,
            deletedStorageCount: updatedDeletedPaths.length,
            skippedSharedCount: skippedSharedRefs.length
        };
    } finally {
        inFlightPermanentDeletes.delete(projectId);
    }
}

async function resumeCleanupJob({ prisma, job, storageClient, env = process.env, now = new Date() }) {
    const projectId = job.projectId;
    const existingProject = await prisma.project.findUnique({
        where: { id: projectId },
        include: { shots: true }
    });

    // If the user restored the project before cleanup completed, abort and remove cleanup job!
    if (existingProject && !existingProject.is_deleted) {
        await cancelPendingCleanupJob(prisma, projectId);
        return { ok: true, status: 200, projectId, skipped: true, reason: 'PROJECT_RESTORED' };
    }

    if (existingProject && existingProject.is_deleted) {
        return permanentlyDeleteProject({
            prisma,
            projectId,
            authorId: existingProject.authorId,
            requireOwnership: false,
            reason: job.reason || 'retention_30d',
            storageClient,
            env,
            now
        });
    }

    // DB record already deleted; finish cleaning any remaining Storage objects
    const allRefs = Array.isArray(job.storagePaths) ? job.storagePaths : [];
    const deletedSet = new Set(Array.isArray(job.deletedPaths) ? job.deletedPaths : []);
    const remaining = allRefs.filter(ref => !deletedSet.has(ref));
    const referencedElsewhere = await findReferencedStorageRefs(prisma, remaining, [projectId], env);
    const deletable = remaining.filter(ref => !referencedElsewhere.has(ref));

    const result = deletable.length > 0
        ? await removeStorageObjects(deletable, { storageClient, env })
        : { deleted: [], failed: [] };

    const updatedDeleted = Array.from(new Set([...deletedSet, ...result.deleted]));
    const nextAttempts = (job.attempts || 0) + 1;

    if (result.failed.length > 0) {
        const errMsg = `續傳清理 Storage 失敗：${result.failed[0].error}`;
        await upsertCleanupJob(prisma, {
            projectId,
            authorId: job.authorId,
            reason: job.reason,
            status: 'failed',
            storagePaths: allRefs,
            deletedPaths: updatedDeleted,
            dbDeleted: true,
            attempts: nextAttempts,
            lastError: errMsg,
            lockedAt: null
        });
        return { ok: false, status: 502, code: 'STORAGE_CLEANUP_FAILED', error: errMsg, projectId };
    }

    await upsertCleanupJob(prisma, {
        projectId,
        authorId: job.authorId,
        reason: job.reason,
        status: 'completed',
        storagePaths: allRefs,
        deletedPaths: updatedDeleted,
        dbDeleted: true,
        attempts: nextAttempts,
        lastError: null,
        lockedAt: null
    });

    return { ok: true, status: 200, projectId, deletedStorageCount: result.deleted.length };
}

function normalizeBatchIds(rawIds) {
    if (!Array.isArray(rawIds)) return [];
    const unique = [];
    const seen = new Set();
    for (const id of rawIds) {
        if (typeof id !== 'string') continue;
        const trimmed = id.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        unique.push(trimmed);
    }
    return unique;
}

async function batchTrashProjects({ prisma, authorId, projectIds, now = new Date() }) {
    const ids = normalizeBatchIds(projectIds);
    if (ids.length === 0) {
        return { ok: false, status: 400, error: '請至少選擇一個專案' };
    }
    if (ids.length > MAX_BATCH_SIZE) {
        return { ok: false, status: 400, error: `單次批次操作上限為 ${MAX_BATCH_SIZE} 個專案` };
    }

    const succeeded = [];
    const failed = [];
    const skipped = [];

    for (const id of ids) {
        try {
            const project = await prisma.project.findUnique({ where: { id } });
            if (!project) {
                failed.push({ id, code: 'PROJECT_NOT_FOUND', error: '找不到專案' });
                continue;
            }
            if (project.authorId !== authorId) {
                failed.push({ id, code: 'FORBIDDEN', error: '沒有權限操作此專案' });
                continue;
            }
            if (project.is_deleted) {
                // Already in trash: do NOT extend deletedAt
                skipped.push({ id, reason: 'ALREADY_IN_TRASH' });
                continue;
            }
            await prisma.project.update({
                where: { id },
                data: {
                    is_deleted: true,
                    deletedAt: project.deletedAt || now
                }
            });
            succeeded.push({ id });
        } catch (err) {
            failed.push({ id, code: 'TRASH_FAILED', error: err.message || '移入回收桶失敗' });
        }
    }

    return {
        ok: true,
        status: 200,
        succeeded,
        failed,
        skipped,
        summary: {
            requested: ids.length,
            succeeded: succeeded.length,
            failed: failed.length,
            skipped: skipped.length
        }
    };
}

async function batchRestoreProjects({ prisma, authorId, projectIds, all = false }) {
    let ids = normalizeBatchIds(projectIds);
    if (all) {
        const trashed = await prisma.project.findMany({
            where: { authorId, is_deleted: true },
            select: { id: true },
            take: MAX_BATCH_SIZE
        });
        ids = trashed.map(p => p.id);
    }

    if (ids.length === 0) {
        return {
            ok: true,
            status: 200,
            succeeded: [],
            failed: [],
            skipped: [],
            summary: { requested: 0, succeeded: 0, failed: 0, skipped: 0 }
        };
    }

    if (ids.length > MAX_BATCH_SIZE) {
        return { ok: false, status: 400, error: `單次批次還原上限為 ${MAX_BATCH_SIZE} 個專案` };
    }

    const succeeded = [];
    const failed = [];
    const skipped = [];

    for (const id of ids) {
        try {
            const project = await prisma.project.findUnique({ where: { id } });
            if (!project) {
                failed.push({ id, code: 'PROJECT_NOT_FOUND', error: '找不到專案' });
                continue;
            }
            if (project.authorId !== authorId) {
                failed.push({ id, code: 'FORBIDDEN', error: '沒有權限還原此專案' });
                continue;
            }
            if (!project.is_deleted) {
                skipped.push({ id, reason: 'NOT_IN_TRASH' });
                continue;
            }
            await prisma.project.update({
                where: { id },
                data: { is_deleted: false, deletedAt: null }
            });
            await cancelPendingCleanupJob(prisma, id);
            succeeded.push({ id });
        } catch (err) {
            failed.push({ id, code: 'RESTORE_FAILED', error: err.message || '還原失敗' });
        }
    }

    return {
        ok: true,
        status: 200,
        succeeded,
        failed,
        skipped,
        summary: {
            requested: ids.length,
            succeeded: succeeded.length,
            failed: failed.length,
            skipped: skipped.length
        }
    };
}

async function batchPermanentDeleteProjects({
    prisma,
    authorId,
    projectIds,
    reason = 'batch_delete',
    storageClient,
    env = process.env,
    now = new Date()
}) {
    const ids = normalizeBatchIds(projectIds);
    if (ids.length === 0) {
        return { ok: false, status: 400, error: '請至少選擇一個專案' };
    }
    if (ids.length > MAX_BATCH_SIZE) {
        return { ok: false, status: 400, error: `單次批次永久刪除上限為 ${MAX_BATCH_SIZE} 個專案` };
    }

    const succeeded = [];
    const failed = [];
    const skipped = [];

    for (const id of ids) {
        const result = await permanentlyDeleteProject({
            prisma,
            projectId: id,
            authorId,
            requireOwnership: true,
            reason,
            storageClient,
            env,
            now
        });
        if (result.ok) {
            if (result.skipped) {
                skipped.push({ id, reason: result.reason });
            } else {
                succeeded.push({
                    id,
                    deletedStorageCount: result.deletedStorageCount || 0,
                    skippedSharedCount: result.skippedSharedCount || 0
                });
            }
        } else {
            failed.push({ id, code: result.code, error: result.error });
        }
    }

    return {
        ok: true,
        status: 200,
        succeeded,
        failed,
        skipped,
        summary: {
            requested: ids.length,
            succeeded: succeeded.length,
            failed: failed.length,
            skipped: skipped.length
        }
    };
}

async function emptyTrash({ prisma, authorId, storageClient, env = process.env, now = new Date() }) {
    const trashed = await prisma.project.findMany({
        where: { authorId, is_deleted: true },
        select: { id: true },
        orderBy: { deletedAt: 'asc' },
        take: MAX_BATCH_SIZE
    });

    if (trashed.length === 0) {
        return {
            ok: true,
            status: 200,
            succeeded: [],
            failed: [],
            skipped: [],
            hasMore: false,
            summary: { requested: 0, succeeded: 0, failed: 0, skipped: 0 }
        };
    }

    const batchResult = await batchPermanentDeleteProjects({
        prisma,
        authorId,
        projectIds: trashed.map(p => p.id),
        reason: 'empty_trash',
        storageClient,
        env,
        now
    });

    const remainingCount = await prisma.project.count({
        where: { authorId, is_deleted: true }
    }).catch(() => 0);

    return {
        ...batchResult,
        hasMore: remainingCount > 0,
        remainingCount
    };
}

async function runRetentionCleanup({
    prisma,
    storageClient,
    env = process.env,
    now = new Date(),
    batchSize = 20,
    dryRun = false
}) {
    const nowDate = now instanceof Date ? now : new Date(now);
    const cutoff = new Date(nowDate.getTime() - RETENTION_MS);
    const lockCutoff = new Date(nowDate.getTime() - JOB_LOCK_TIMEOUT_MS);
    const safeBatchSize = Math.min(Math.max(1, Number(batchSize) || 20), 100);

    const report = {
        startedAt: nowDate.toISOString(),
        cutoff: cutoff.toISOString(),
        dryRun: Boolean(dryRun),
        retriedJobs: [],
        expiredProjects: [],
        succeeded: [],
        failed: [],
        skipped: []
    };

    // 1. Retry pending/failed/stale-locked CleanupJobs
    if (prisma?.cleanupJob?.findMany) {
        const pendingJobs = await prisma.cleanupJob.findMany({
            where: {
                OR: [
                    { status: { in: ['pending', 'failed'] } },
                    { status: 'processing', lockedAt: { lt: lockCutoff } }
                ]
            },
            orderBy: { updatedAt: 'asc' },
            take: safeBatchSize
        }).catch(() => []);

        for (const job of pendingJobs) {
            report.retriedJobs.push(job.projectId);
            if (dryRun) {
                report.skipped.push({ id: job.projectId, reason: 'DRY_RUN_RETRY' });
                continue;
            }
            const res = await resumeCleanupJob({ prisma, job, storageClient, env, now: nowDate });
            if (res.ok) {
                if (res.skipped) report.skipped.push({ id: job.projectId, reason: res.reason });
                else report.succeeded.push({ id: job.projectId, resumed: true, deletedStorageCount: res.deletedStorageCount || 0 });
            } else {
                report.failed.push({ id: job.projectId, code: res.code, error: res.error });
            }
        }
    }

    // 2. Find expired trashed projects (is_deleted = true AND deletedAt <= cutoff)
    const expired = await prisma.project.findMany({
        where: {
            is_deleted: true,
            deletedAt: {
                not: null,
                lte: cutoff
            }
        },
        select: { id: true, authorId: true, title: true, deletedAt: true },
        orderBy: { deletedAt: 'asc' },
        take: safeBatchSize
    });

    const alreadyHandled = new Set(report.retriedJobs);
    for (const project of expired) {
        if (alreadyHandled.has(project.id)) continue;
        report.expiredProjects.push({
            id: project.id,
            deletedAt: project.deletedAt ? new Date(project.deletedAt).toISOString() : null
        });

        if (dryRun) {
            report.skipped.push({ id: project.id, reason: 'DRY_RUN_EXPIRED' });
            continue;
        }

        const res = await permanentlyDeleteProject({
            prisma,
            projectId: project.id,
            authorId: project.authorId,
            requireOwnership: false,
            reason: 'retention_30d',
            storageClient,
            env,
            now: nowDate
        });

        if (res.ok) {
            report.succeeded.push({
                id: project.id,
                deletedStorageCount: res.deletedStorageCount || 0,
                skippedSharedCount: res.skippedSharedCount || 0
            });
        } else {
            report.failed.push({ id: project.id, code: res.code, error: res.error });
        }
    }

    report.finishedAt = new Date().toISOString();
    report.summary = {
        retried: report.retriedJobs.length,
        expiredFound: report.expiredProjects.length,
        succeeded: report.succeeded.length,
        failed: report.failed.length,
        skipped: report.skipped.length
    };

    return report;
}

module.exports = {
    RETENTION_DAYS,
    RETENTION_MS,
    MAX_BATCH_SIZE,
    SAFE_AUTHOR_SELECT,
    getFirstShot,
    getFirstShotRawImage,
    resolveProjectCover,
    computeTrashRetention,
    findReferencedStorageRefs,
    cancelPendingCleanupJob,
    permanentlyDeleteProject,
    resumeCleanupJob,
    batchTrashProjects,
    batchRestoreProjects,
    batchPermanentDeleteProjects,
    emptyTrash,
    runRetentionCleanup
};
