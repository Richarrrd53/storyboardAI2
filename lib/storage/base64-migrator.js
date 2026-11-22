'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    isBase64DataUri,
    parseBase64DataUri,
    parseStorageRef,
    uploadImageBuffer,
    verifyUploadedObject,
    sha256Buffer
} = require('./storyboard-images');
const { getFirstShot } = require('../projects/lifecycle');

function safeParseDataUriForStats(value) {
    try {
        return { ok: true, ...parseBase64DataUri(value) };
    } catch (error) {
        return { ok: false, error: error.message, code: error.code || 'INVALID_IMAGE_DATA' };
    }
}

function classifyImageValue(value, env = process.env) {
    if (!value || typeof value !== 'string' || !value.trim()) return 'empty';
    const trimmed = value.trim();
    if (trimmed === '../icon/error.jpg' || trimmed === '/icon/error.jpg') return 'placeholder';
    if (isBase64DataUri(trimmed)) return 'base64';
    if (parseStorageRef(trimmed, { env })) return 'storage';
    if (trimmed.startsWith('/api/')) return 'api_proxy';
    if (/^https?:\/\//i.test(trimmed)) return 'external_url';
    return 'invalid';
}

async function inventoryBase64Images({ prisma, batchSize = 20, env = process.env }) {
    const safeBatch = Math.min(Math.max(1, Number(batchSize) || 20), 100);
    const seenHashes = new Map(); // sha256 -> count
    const report = {
        generatedAt: new Date().toISOString(),
        readOnly: true,
        projectCount: 0,
        shotCount: 0,
        shotImageBase64Count: 0,
        shotHistoryBase64Count: 0,
        projectCoverBase64Count: 0,
        storageUrlCount: 0,
        externalUrlCount: 0,
        invalidImageCount: 0,
        duplicateBase64Count: 0,
        estimatedBytes: 0,
        legacyDeletedWithoutDeletedAt: 0,
        coverAnomalies: [],
        invalidEntries: [],
        externalUrls: []
    };

    let cursor = null;
    while (true) {
        const projects = await prisma.project.findMany({
            include: { shots: { orderBy: { order: 'asc' } } },
            orderBy: { id: 'asc' },
            take: safeBatch,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
        });
        if (!Array.isArray(projects) || projects.length === 0) break;

        for (const project of projects) {
            report.projectCount++;
            if (project.is_deleted && !project.deletedAt) {
                report.legacyDeletedWithoutDeletedAt++;
            }

            const firstShot = getFirstShot(project.shots);
            let firstShotHash = null;

            for (const shot of (project.shots || [])) {
                report.shotCount++;
                const payload = shot.payload && typeof shot.payload === 'object' ? shot.payload : {};

                const mainKind = classifyImageValue(payload.image, env);
                if (mainKind === 'base64') {
                    report.shotImageBase64Count++;
                    const parsed = safeParseDataUriForStats(payload.image);
                    if (parsed.ok) {
                        report.estimatedBytes += parsed.size;
                        const prev = seenHashes.get(parsed.sha256) || 0;
                        if (prev > 0) report.duplicateBase64Count++;
                        seenHashes.set(parsed.sha256, prev + 1);
                        if (firstShot && shot.id === firstShot.id) firstShotHash = parsed.sha256;
                    } else {
                        report.invalidImageCount++;
                        report.invalidEntries.push({
                            projectId: project.id,
                            shotId: shot.id,
                            field: 'payload.image',
                            error: parsed.error
                        });
                    }
                } else if (mainKind === 'storage') {
                    report.storageUrlCount++;
                } else if (mainKind === 'external_url') {
                    report.externalUrlCount++;
                    report.externalUrls.push({ projectId: project.id, shotId: shot.id, field: 'payload.image', url: payload.image });
                } else if (mainKind === 'invalid') {
                    report.invalidImageCount++;
                    report.invalidEntries.push({ projectId: project.id, shotId: shot.id, field: 'payload.image', error: '無法辨識的圖片格式' });
                }

                if (Array.isArray(payload.imageHistory)) {
                    payload.imageHistory.forEach((entry, idx) => {
                        const raw = entry?.imageRef || entry?.image;
                        const hKind = classifyImageValue(raw, env);
                        if (hKind === 'base64') {
                            report.shotHistoryBase64Count++;
                            const parsed = safeParseDataUriForStats(raw);
                            if (parsed.ok) {
                                report.estimatedBytes += parsed.size;
                                const prev = seenHashes.get(parsed.sha256) || 0;
                                if (prev > 0) report.duplicateBase64Count++;
                                seenHashes.set(parsed.sha256, prev + 1);
                            } else {
                                report.invalidImageCount++;
                                report.invalidEntries.push({
                                    projectId: project.id,
                                    shotId: shot.id,
                                    field: `payload.imageHistory[${idx}]`,
                                    error: parsed.error
                                });
                            }
                        } else if (hKind === 'storage') {
                            report.storageUrlCount++;
                        } else if (hKind === 'external_url') {
                            report.externalUrlCount++;
                            report.externalUrls.push({ projectId: project.id, shotId: shot.id, field: `payload.imageHistory[${idx}]`, url: raw });
                        } else if (hKind === 'invalid') {
                            report.invalidImageCount++;
                            report.invalidEntries.push({
                                projectId: project.id,
                                shotId: shot.id,
                                field: `payload.imageHistory[${idx}]`,
                                error: '無法辨識的歷史圖片格式'
                            });
                        }
                    });
                }
            }

            // Inspect Project.cover
            const coverKind = classifyImageValue(project.cover, env);
            if (coverKind === 'base64') {
                report.projectCoverBase64Count++;
                const parsedCover = safeParseDataUriForStats(project.cover);
                if (!parsedCover.ok) {
                    report.invalidImageCount++;
                    report.invalidEntries.push({
                        projectId: project.id,
                        shotId: null,
                        field: 'project.cover',
                        error: parsedCover.error
                    });
                } else {
                    const firstImg = firstShot?.payload?.image;
                    if (!firstShot || !firstImg || (firstShotHash && firstShotHash !== parsedCover.sha256)) {
                        report.coverAnomalies.push({
                            projectId: project.id,
                            title: project.title,
                            reason: !firstShot
                                ? '專案沒有任何鏡頭但存在封面 Base64'
                                : !firstImg
                                    ? '第一鏡無圖片但專案封面存在 Base64'
                                    : '專案封面 Base64 與第一鏡圖片內容不一致',
                            coverSha256: parsedCover.sha256,
                            coverSize: parsedCover.size
                        });
                    }
                }
            } else if (coverKind === 'storage') {
                report.storageUrlCount++;
            } else if (coverKind === 'external_url') {
                report.externalUrlCount++;
                report.externalUrls.push({ projectId: project.id, shotId: null, field: 'project.cover', url: project.cover });
            }
        }

        if (projects.length < safeBatch) break;
        cursor = projects[projects.length - 1].id;
    }

    report.estimatedMegabytes = Number((report.estimatedBytes / (1024 * 1024)).toFixed(2));
    return report;
}

function loadCheckpoint(checkpointPath) {
    if (!checkpointPath || !fs.existsSync(checkpointPath)) {
        return { completedShots: {}, completedProjects: {}, orphanedUploads: [] };
    }
    try {
        const raw = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
        return {
            completedShots: raw.completedShots || {},
            completedProjects: raw.completedProjects || {},
            orphanedUploads: Array.isArray(raw.orphanedUploads) ? raw.orphanedUploads : []
        };
    } catch (_) {
        return { completedShots: {}, completedProjects: {}, orphanedUploads: [] };
    }
}

function saveCheckpoint(checkpointPath, state) {
    if (!checkpointPath) return;
    const dir = path.dirname(checkpointPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(checkpointPath, JSON.stringify(state, null, 2), 'utf8');
}

async function migrateBase64Images({
    prisma,
    storageClient,
    dryRun = true,
    batchSize = 10,
    checkpointPath = null,
    env = process.env,
    logger = console
}) {
    const safeBatch = Math.min(Math.max(1, Number(batchSize) || 10), 50);
    const checkpoint = loadCheckpoint(checkpointPath);
    const report = {
        startedAt: new Date().toISOString(),
        dryRun: Boolean(dryRun),
        processedProjects: 0,
        processedShots: 0,
        migratedImages: 0,
        deduplicatedImages: 0,
        clearedCovers: 0,
        skippedAlreadyMigrated: 0,
        conflicts: [],
        failures: [],
        coverAnomalies: [],
        orphanedUploads: [...checkpoint.orphanedUploads]
    };

    let cursor = null;
    while (true) {
        const projects = await prisma.project.findMany({
            include: { shots: { orderBy: { order: 'asc' } } },
            orderBy: { id: 'asc' },
            take: safeBatch,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
        });
        if (!Array.isArray(projects) || projects.length === 0) break;

        for (const project of projects) {
            report.processedProjects++;
            const projectHashCache = new Map(); // sha256 -> storageRef within same project
            const firstShot = getFirstShot(project.shots);
            let firstShotOriginalHash = null;
            let firstShotMigratedOrHasStorage = false;

            for (const shot of (project.shots || [])) {
                report.processedShots++;
                const payload = shot.payload && typeof shot.payload === 'object' ? { ...shot.payload } : {};
                const originalUpdateAt = shot.updateAt ? new Date(shot.updateAt).getTime() : null;

                let shotChanged = false;
                const uploadedInThisShot = [];

                // Helper to migrate one base64 value
                const migrateOne = async (dataUri, fieldLabel) => {
                    const parsed = parseBase64DataUri(dataUri);
                    if (firstShot && shot.id === firstShot.id && fieldLabel === 'payload.image') {
                        firstShotOriginalHash = parsed.sha256;
                    }
                    if (projectHashCache.has(parsed.sha256)) {
                        report.deduplicatedImages++;
                        return {
                            storageRef: projectHashCache.get(parsed.sha256),
                            sha256: parsed.sha256,
                            mimeType: parsed.mimeType,
                            size: parsed.size
                        };
                    }
                    if (dryRun) {
                        const simulatedRef = `storage://dry-run/projects/${project.id}/${shot.id}/${parsed.sha256.slice(0, 12)}.${parsed.ext}`;
                        projectHashCache.set(parsed.sha256, simulatedRef);
                        return {
                            storageRef: simulatedRef,
                            sha256: parsed.sha256,
                            mimeType: parsed.mimeType,
                            size: parsed.size
                        };
                    }
                    const uploaded = await uploadImageBuffer({
                        projectId: project.id,
                        shotId: shot.id,
                        buffer: parsed.buffer,
                        mimeType: parsed.mimeType,
                        storageClient,
                        env
                    });
                    // Verify uploaded object exists & size matches
                    const verified = await verifyUploadedObject({
                        bucket: uploaded.bucket,
                        objectPath: uploaded.objectPath,
                        storageClient,
                        env
                    });
                    if (verified.size !== null && verified.size !== parsed.size) {
                        throw new Error(`Storage 檔案大小驗證不符 (預期 ${parsed.size}, 實際 ${verified.size})`);
                    }
                    uploadedInThisShot.push(uploaded.storageRef);
                    projectHashCache.set(parsed.sha256, uploaded.storageRef);
                    return {
                        storageRef: uploaded.storageRef,
                        sha256: parsed.sha256,
                        mimeType: parsed.mimeType,
                        size: parsed.size
                    };
                };

                // 1. Migrate Shot.payload.image
                if (isBase64DataUri(payload.image)) {
                    try {
                        const res = await migrateOne(payload.image, 'payload.image');
                        payload.image = res.storageRef;
                        payload.imageRef = res.storageRef;
                        payload.imageAsset = {
                            sha256: res.sha256,
                            mimeType: res.mimeType,
                            size: res.size
                        };
                        shotChanged = true;
                        report.migratedImages++;
                        if (firstShot && shot.id === firstShot.id) firstShotMigratedOrHasStorage = true;
                    } catch (err) {
                        report.failures.push({
                            projectId: project.id,
                            shotId: shot.id,
                            field: 'payload.image',
                            error: err.message
                        });
                    }
                } else if (parseStorageRef(payload.image, { env })) {
                    report.skippedAlreadyMigrated++;
                    if (firstShot && shot.id === firstShot.id) firstShotMigratedOrHasStorage = true;
                }

                // 2. Migrate Shot.payload.imageHistory
                if (Array.isArray(payload.imageHistory)) {
                    const nextHistory = [];
                    for (let idx = 0; idx < payload.imageHistory.length; idx++) {
                        const entry = payload.imageHistory[idx];
                        if (!entry || typeof entry !== 'object') {
                            nextHistory.push(entry);
                            continue;
                        }
                        const raw = entry.imageRef || entry.image;
                        if (isBase64DataUri(raw)) {
                            try {
                                const res = await migrateOne(raw, `payload.imageHistory[${idx}]`);
                                nextHistory.push({
                                    ...entry,
                                    image: res.storageRef,
                                    imageRef: res.storageRef,
                                    sha256: res.sha256,
                                    mimeType: res.mimeType,
                                    size: res.size
                                });
                                shotChanged = true;
                                report.migratedImages++;
                            } catch (err) {
                                // Preserve original base64 on failure
                                nextHistory.push(entry);
                                report.failures.push({
                                    projectId: project.id,
                                    shotId: shot.id,
                                    field: `payload.imageHistory[${idx}]`,
                                    error: err.message
                                });
                            }
                        } else {
                            if (parseStorageRef(raw, { env })) report.skippedAlreadyMigrated++;
                            nextHistory.push(entry);
                        }
                    }
                    payload.imageHistory = nextHistory;
                }

                // 3. Persist updated Shot payload with optimistic concurrency check
                if (shotChanged && !dryRun) {
                    try {
                        const latest = await prisma.shot.findUnique({
                            where: { id: shot.id },
                            select: { updateAt: true }
                        });
                        const latestTs = latest?.updateAt ? new Date(latest.updateAt).getTime() : null;
                        if (originalUpdateAt !== null && latestTs !== null && latestTs !== originalUpdateAt) {
                            // User modified shot during migration -> do NOT overwrite newer data
                            report.conflicts.push({
                                projectId: project.id,
                                shotId: shot.id,
                                reason: 'CONCURRENT_MODIFICATION',
                                uploadedRefs: uploadedInThisShot
                            });
                            report.orphanedUploads.push(...uploadedInThisShot);
                            checkpoint.orphanedUploads = report.orphanedUploads;
                            saveCheckpoint(checkpointPath, checkpoint);
                            continue;
                        }

                        await prisma.shot.update({
                            where: { id: shot.id },
                            data: { payload }
                        });
                        checkpoint.completedShots[shot.id] = new Date().toISOString();
                        saveCheckpoint(checkpointPath, checkpoint);
                    } catch (dbErr) {
                        report.failures.push({
                            projectId: project.id,
                            shotId: shot.id,
                            field: 'db_update',
                            error: dbErr.message
                        });
                        if (uploadedInThisShot.length > 0) {
                            report.orphanedUploads.push(...uploadedInThisShot);
                            checkpoint.orphanedUploads = report.orphanedUploads;
                            saveCheckpoint(checkpointPath, checkpoint);
                        }
                    }
                }
            }

            // 4. Clean legacy Project.cover Base64 only if first shot owns the same image or is migrated
            if (isBase64DataUri(project.cover)) {
                const parsedCover = safeParseDataUriForStats(project.cover);
                if (!parsedCover.ok) {
                    report.coverAnomalies.push({
                        projectId: project.id,
                        reason: `封面 Base64 損毀：${parsedCover.error}`
                    });
                } else if (
                    firstShotMigratedOrHasStorage &&
                    (firstShotOriginalHash === null || firstShotOriginalHash === parsedCover.sha256)
                ) {
                    if (!dryRun) {
                        await prisma.project.update({
                            where: { id: project.id },
                            data: { cover: null }
                        });
                    }
                    report.clearedCovers++;
                } else {
                    report.coverAnomalies.push({
                        projectId: project.id,
                        title: project.title,
                        reason: '封面包含第一鏡沒有的歷史圖片資料，已保留原資料並列入異常報告',
                        coverSha256: parsedCover.sha256
                    });
                }
            }
        }

        if (projects.length < safeBatch) break;
        cursor = projects[projects.length - 1].id;
    }

    report.finishedAt = new Date().toISOString();
    if (logger && typeof logger.info === 'function') {
        logger.info(`[Base64Migrator] Completed (dryRun=${report.dryRun}): migrated=${report.migratedImages}, failures=${report.failures.length}, conflicts=${report.conflicts.length}`);
    }
    return report;
}

async function backfillLegacyDeletedAt({ prisma, dryRun = true, now = new Date() }) {
    const nowDate = now instanceof Date ? now : new Date(now);
    const targets = await prisma.project.findMany({
        where: { is_deleted: true, deletedAt: null },
        select: { id: true, title: true, updatedAt: true }
    });

    const report = {
        executedAt: nowDate.toISOString(),
        dryRun: Boolean(dryRun),
        found: targets.length,
        updated: 0,
        assignedDeletedAt: nowDate.toISOString(),
        projectIds: targets.map(t => t.id)
    };

    if (!dryRun && targets.length > 0) {
        const res = await prisma.project.updateMany({
            where: { id: { in: targets.map(t => t.id) }, is_deleted: true, deletedAt: null },
            data: { deletedAt: nowDate }
        });
        report.updated = res?.count ?? targets.length;
    }

    return report;
}

module.exports = {
    inventoryBase64Images,
    migrateBase64Images,
    backfillLegacyDeletedAt,
    classifyImageValue,
    sha256Buffer
};
