#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
const {
    validateImageBuffer,
    buildObjectPath,
    toStorageRef,
    sha256Buffer
} = require('../lib/storage/storyboard-images');

const SOURCE_BUCKET = 'avatars';
const TARGET_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'storyboard-images';
const AVATARS_URL_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/avatars\/([^?]+)$/i;

async function listAllObjects(storage, bucket, prefix = '') {
    const out = [];
    let offset = 0;
    while (true) {
        const { data, error } = await storage.from(bucket).list(prefix, { limit: 100, offset });
        if (error) throw new Error(`list(${bucket}/${prefix}): ${error.message}`);
        if (!data?.length) break;
        for (const item of data) {
            const p = prefix ? `${prefix}/${item.name}` : item.name;
            if (item.id === null) {
                out.push(...await listAllObjects(storage, bucket, p));
            } else {
                out.push({ path: p, size: item.metadata?.size ?? null, mimetype: item.metadata?.mimetype ?? null });
            }
        }
        if (data.length < 100) break;
        offset += 100;
    }
    return out;
}

function extractAvatarPath(url) {
    if (typeof url !== 'string') return null;
    const match = AVATARS_URL_RE.exec(url.trim());
    return match ? decodeURIComponent(match[1]) : null;
}

async function downloadBuffer(storage, bucket, objectPath) {
    const { data, error } = await storage.from(bucket).download(objectPath);
    if (error || !data) {
        throw new Error(`download(${bucket}/${objectPath}) 失敗: ${error?.message || '無資料'}`);
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function uploadIdempotent(storage, bucket, objectPath, buffer, contentType) {
    const { error } = await storage.from(bucket).upload(objectPath, buffer, {
        contentType,
        upsert: false,
        cacheControl: '31536000'
    });
    if (error) {
        // Treat "already exists" (409 / Duplicate) as idempotent success
        const msg = String(error.message || '').toLowerCase();
        if (error.statusCode === '409' || error.status === 409 || msg.includes('already exists') || msg.includes('duplicate')) {
            return { uploaded: false, alreadyExisted: true };
        }
        throw new Error(`upload(${bucket}/${objectPath}) 失敗: ${error.message}`);
    }
    return { uploaded: true, alreadyExisted: false };
}

async function main() {
    const argv = process.argv.slice(2);
    const dryRun = !argv.includes('--execute');
    const skipUnreferenced = argv.includes('--skip-unreferenced');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey || !process.env.DATABASE_URL) {
        console.error('❌ 缺少 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 或 DATABASE_URL 環境變數');
        process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

    const report = {
        startedAt: new Date().toISOString(),
        dryRun,
        sourceBucket: SOURCE_BUCKET,
        targetBucket: TARGET_BUCKET,
        sourceObjectCount: 0,
        shotsMigrated: 0,
        shotsAlreadyExistedInTarget: 0,
        shotFailures: [],
        projectsCoverCleared: 0,
        projectsCoverBackedUp: 0,
        projectCoverFailures: [],
        unreferencedBackedUp: 0,
        unreferencedFailures: []
    };

    try {
        const allAvatarObjects = await listAllObjects(supabase.storage, SOURCE_BUCKET);
        report.sourceObjectCount = allAvatarObjects.length;
        const migratedSourcePaths = new Set();

        // 1. Migrate all Shots referencing avatars bucket -> storyboard-images/projects/{projectId}/{shotId}/...
        const shotsRes = await pool.query(`SELECT id, "projectId", "order", payload FROM "Shot" ORDER BY "projectId", "order" ASC`);
        const shotsByProject = new Map();
        for (const s of shotsRes.rows) {
            if (!shotsByProject.has(s.projectId)) shotsByProject.set(s.projectId, []);
            shotsByProject.get(s.projectId).push(s);
        }

        for (const shot of shotsRes.rows) {
            const payload = shot.payload && typeof shot.payload === 'object' ? { ...shot.payload } : {};
            const mainAvatarPath = extractAvatarPath(payload.image);
            let changed = false;

            if (mainAvatarPath) {
                try {
                    const buf = await downloadBuffer(supabase.storage, SOURCE_BUCKET, mainAvatarPath);
                    const meta = validateImageBuffer(buf);
                    const imageId = `migrated-${meta.sha256.slice(0, 16)}`;
                    const targetPath = buildObjectPath(shot.projectId, shot.id, meta.ext, imageId);
                    const storageRef = toStorageRef(TARGET_BUCKET, targetPath);

                    if (!dryRun) {
                        const up = await uploadIdempotent(supabase.storage, TARGET_BUCKET, targetPath, buf, meta.mimeType);
                        if (up.alreadyExisted) report.shotsAlreadyExistedInTarget++;
                    }

                    payload.image = storageRef;
                    payload.imageRef = storageRef;
                    payload.imageAsset = {
                        bucket: TARGET_BUCKET,
                        path: targetPath,
                        mimeType: meta.mimeType,
                        size: meta.size,
                        sha256: meta.sha256
                    };
                    changed = true;
                    migratedSourcePaths.add(mainAvatarPath);
                } catch (err) {
                    report.shotFailures.push({ shotId: shot.id, projectId: shot.projectId, sourcePath: mainAvatarPath, error: err.message });
                }
            }

            if (Array.isArray(payload.imageHistory)) {
                const nextHistory = [];
                for (let idx = 0; idx < payload.imageHistory.length; idx++) {
                    const entry = payload.imageHistory[idx];
                    const histPath = extractAvatarPath(entry?.imageRef || entry?.image);
                    if (!histPath) {
                        nextHistory.push(entry);
                        continue;
                    }
                    try {
                        const buf = await downloadBuffer(supabase.storage, SOURCE_BUCKET, histPath);
                        const meta = validateImageBuffer(buf);
                        const imageId = `migrated-${meta.sha256.slice(0, 16)}`;
                        const targetPath = buildObjectPath(shot.projectId, shot.id, meta.ext, imageId);
                        const storageRef = toStorageRef(TARGET_BUCKET, targetPath);
                        if (!dryRun) {
                            await uploadIdempotent(supabase.storage, TARGET_BUCKET, targetPath, buf, meta.mimeType);
                        }
                        nextHistory.push({
                            ...entry,
                            image: storageRef,
                            imageRef: storageRef,
                            sha256: meta.sha256,
                            mimeType: meta.mimeType,
                            size: meta.size
                        });
                        changed = true;
                        migratedSourcePaths.add(histPath);
                    } catch (err) {
                        nextHistory.push(entry);
                        report.shotFailures.push({ shotId: shot.id, projectId: shot.projectId, field: `imageHistory[${idx}]`, sourcePath: histPath, error: err.message });
                    }
                }
                payload.imageHistory = nextHistory;
            }

            if (changed) {
                if (!dryRun) {
                    await pool.query(`UPDATE "Shot" SET payload = $1::jsonb, "updateAt" = NOW() WHERE id = $2`, [JSON.stringify(payload), shot.id]);
                }
                shot.payload = payload;
                report.shotsMigrated++;
            }
        }

        // 2. Handle Project.cover referencing avatars bucket
        const projRes = await pool.query(`SELECT id, title, cover FROM "Project"`);
        for (const project of projRes.rows) {
            const coverAvatarPath = extractAvatarPath(project.cover);
            if (!coverAvatarPath) continue;

            try {
                const firstShot = (shotsByProject.get(project.id) || [])[0];
                const firstHasImage = Boolean(firstShot?.payload?.image && firstShot.payload.image !== '../icon/error.jpg');

                // Back up legacy cover file into storyboard-images/legacy-avatars/... so zero files are lost
                const buf = await downloadBuffer(supabase.storage, SOURCE_BUCKET, coverAvatarPath);
                const meta = validateImageBuffer(buf);
                const backupPath = `legacy-avatars/${coverAvatarPath}`;
                if (!dryRun) {
                    await uploadIdempotent(supabase.storage, TARGET_BUCKET, backupPath, buf, meta.mimeType);
                }
                report.projectsCoverBackedUp++;
                migratedSourcePaths.add(coverAvatarPath);

                // In new architecture, cover is dynamically derived from first shot; clear legacy Project.cover URL pointing to avatars
                if (!dryRun) {
                    await pool.query(`UPDATE "Project" SET cover = NULL WHERE id = $1`, [project.id]);
                }
                report.projectsCoverCleared++;
                if (!firstHasImage) {
                    // Record note for projects with 0 shots (3 legacy 70-byte placeholders)
                    report.projectCoverFailures.push({
                        projectId: project.id,
                        note: '專案無分鏡，已備份原封面至 legacy-avatars/ 並清除舊 avatars 連結（將顯示預設 Placeholder）',
                        backupPath,
                        size: meta.size
                    });
                }
            } catch (err) {
                report.projectCoverFailures.push({ projectId: project.id, sourcePath: coverAvatarPath, error: err.message });
            }
        }

        // 3. Back up any remaining unreferenced objects from avatars -> storyboard-images/legacy-avatars/...
        if (!skipUnreferenced) {
            for (const obj of allAvatarObjects) {
                if (migratedSourcePaths.has(obj.path)) continue;
                try {
                    const buf = await downloadBuffer(supabase.storage, SOURCE_BUCKET, obj.path);
                    const contentType = obj.mimetype || 'application/octet-stream';
                    const backupPath = `legacy-avatars/${obj.path}`;
                    if (!dryRun) {
                        await uploadIdempotent(supabase.storage, TARGET_BUCKET, backupPath, buf, contentType);
                    }
                    report.unreferencedBackedUp++;
                } catch (err) {
                    report.unreferencedFailures.push({ sourcePath: obj.path, error: err.message });
                }
            }
        }

        report.finishedAt = new Date().toISOString();
        console.log(JSON.stringify(report, null, 2));
        if (report.shotFailures.length > 0 || report.unreferencedFailures.length > 0) {
            process.exitCode = 2;
        }
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('❌ avatars 移植失敗:', err);
        process.exit(1);
    });
}
