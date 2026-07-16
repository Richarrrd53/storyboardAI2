import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const connectionString = process.env.PRISMA_DATABASE_URL;
const pool = new pg.Pool({
    connectionString,
    max: 1, // 限制為 1 個連線，防止資料庫達到連線數限制
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ 錯誤：找不到 Supabase 設定，請檢查 .env 檔案。");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseBase64Image(dataString: string) {
    const matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        return null;
    }
    return {
        mimeType: matches[1],
        buffer: Buffer.from(matches[2], 'base64')
    };
}

function getExtension(mimeType: string) {
    switch (mimeType) {
        case 'image/png': return 'png';
        case 'image/jpeg':
        case 'image/jpg': return 'jpg';
        case 'image/gif': return 'gif';
        case 'image/webp': return 'webp';
        default: return 'png';
    }
}

async function runMigration() {
    console.log("🚀 開始執行 Base64 圖片至 Supabase 儲存空間遷移任務...");

    // 1. 將 avatars bucket 設為 public
    try {
        console.log("⚙️ 正在將 'avatars' 儲存桶設為公開 (public)...");
        const { error: bucketError } = await supabase.storage.updateBucket('avatars', { public: true });
        if (bucketError) {
            console.warn("⚠️ 警告：無法自動將儲存桶設為公開，請至 Supabase 主控台確認權限：", bucketError.message);
        } else {
            console.log("✅ 成功將 'avatars' 儲存桶設為公開。");
        }
    } catch (err: any) {
        console.warn("⚠️ 警告：設定儲存桶公開狀態時發生錯誤：", err.message || err);
    }

    // 2. 遷移 User.image
    console.log("\n--- 開始遷移用戶頭像 (User.image) ---");
    let lastUserId = '';
    let hasMoreUsers = true;
    let userMigratedCount = 0;

    while (hasMoreUsers) {
        const users: any[] = await prisma.user.findMany({
            where: lastUserId ? { id: { gt: lastUserId } } : {},
            orderBy: { id: 'asc' },
            take: 10,
            select: { id: true, image: true, email: true }
        });

        if (users.length === 0) {
            hasMoreUsers = false;
            break;
        }

        for (const user of users) {
            lastUserId = user.id;
            if (user.image && user.image.startsWith('data:')) {
                try {
                    const parsed = parseBase64Image(user.image);
                    if (!parsed) {
                        console.error(`❌ 解析用戶 ${user.email} (${user.id}) 的 Base64 失敗`);
                        continue;
                    }
                    const ext = getExtension(parsed.mimeType);
                    const fileName = `users/avatar-${user.id}-${Date.now()}.${ext}`;

                    console.log(`📤 上傳用戶 ${user.email} 的頭像...`);
                    // 在慢速上傳前斷開資料庫連線，避免連線逾時被關閉
                    await prisma.$disconnect();

                    const { error: uploadError } = await supabase.storage
                        .from('avatars')
                        .upload(fileName, parsed.buffer, {
                            contentType: parsed.mimeType,
                            duplex: 'half'
                        });

                    if (uploadError) {
                        console.error(`❌ 上傳用戶 ${user.id} 的頭像失敗:`, uploadError.message);
                        continue;
                    }

                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(fileName);

                    await prisma.user.update({
                        where: { id: user.id },
                        data: { image: publicUrl }
                    });

                    userMigratedCount++;
                    console.log(`✅ 用戶 ${user.email} 頭像已成功遷移！`);
                } catch (err: any) {
                    console.error(`❌ 遷移用戶 ${user.id} 頭像時發生未預期錯誤:`, err.message || err);
                }
            }
        }
    }
    console.log(`🎉 用戶頭像遷移完成，共遷移 ${userMigratedCount} 筆資料。`);

    // 3. 遷移 Project.cover
    console.log("\n--- 開始遷移專案封面 (Project.cover) ---");
    let lastProjectId = '';
    let hasMoreProjects = true;
    let projectMigratedCount = 0;

    while (hasMoreProjects) {
        const projects: any[] = await prisma.project.findMany({
            where: lastProjectId ? { id: { gt: lastProjectId } } : {},
            orderBy: { id: 'asc' },
            take: 10,
            select: { id: true, cover: true, title: true }
        });

        if (projects.length === 0) {
            hasMoreProjects = false;
            break;
        }

        for (const project of projects) {
            lastProjectId = project.id;
            if (project.cover && project.cover.startsWith('data:')) {
                try {
                    const parsed = parseBase64Image(project.cover);
                    if (!parsed) {
                        console.error(`❌ 解析專案 "${project.title}" (${project.id}) 的 Base64 失敗`);
                        continue;
                    }
                    const ext = getExtension(parsed.mimeType);
                    const fileName = `projects/cover-${project.id}-${Date.now()}.${ext}`;

                    console.log(`📤 上傳專案 "${project.title}" 的封面...`);
                    // 在慢速上傳前斷開資料庫連線
                    await prisma.$disconnect();

                    const { error: uploadError } = await supabase.storage
                        .from('avatars')
                        .upload(fileName, parsed.buffer, {
                            contentType: parsed.mimeType,
                            duplex: 'half'
                        });

                    if (uploadError) {
                        console.error(`❌ 上傳專案 ${project.id} 封面失敗:`, uploadError.message);
                        continue;
                    }

                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(fileName);

                    await prisma.project.update({
                        where: { id: project.id },
                        data: { cover: publicUrl }
                    });

                    projectMigratedCount++;
                    console.log(`✅ 專案 "${project.title}" 封面已成功遷移！`);
                } catch (err: any) {
                    console.error(`❌ 遷移專案 ${project.id} 封面時發生未預期錯誤:`, err.message || err);
                }
            }
        }
    }
    console.log(`🎉 專案封面遷移完成，共遷移 ${projectMigratedCount} 筆資料。`);

    // 4. 遷移 Shot.payload.image
    console.log("\n--- 開始遷移分鏡圖片 (Shot.payload.image) ---");
    let lastShotId = '';
    let hasMoreShots = true;
    let shotMigratedCount = 0;

    while (hasMoreShots) {
        const shots: any[] = await prisma.shot.findMany({
            where: lastShotId ? { id: { gt: lastShotId } } : {},
            orderBy: { id: 'asc' },
            take: 5, // 每次撈 5 筆，降低記憶體消耗與網路負擔
            select: { id: true, payload: true, title: true }
        });

        if (shots.length === 0) {
            hasMoreShots = false;
            break;
        }

        for (const shot of shots) {
            lastShotId = shot.id;
            const payload = shot.payload as any;
            if (payload && typeof payload === 'object' && payload.image && typeof payload.image === 'string' && payload.image.startsWith('data:')) {
                try {
                    const parsed = parseBase64Image(payload.image);
                    if (!parsed) {
                        console.error(`❌ 解析分鏡 "${shot.title || '無標題'}" (${shot.id}) 的 Base64 失敗`);
                        continue;
                    }
                    const ext = getExtension(parsed.mimeType);
                    const fileName = `shots/shot-${shot.id}-${Date.now()}.${ext}`;

                    console.log(`📤 上傳分鏡 "${shot.title || '無標題'}" 的圖片...`);
                    // 在慢速上傳前斷開資料庫連線
                    await prisma.$disconnect();

                    const { error: uploadError } = await supabase.storage
                        .from('avatars')
                        .upload(fileName, parsed.buffer, {
                            contentType: parsed.mimeType,
                            duplex: 'half'
                        });

                    if (uploadError) {
                        console.error(`❌ 上傳分鏡 ${shot.id} 圖片失敗:`, uploadError.message);
                        continue;
                    }

                    const { data: { publicUrl } } = supabase.storage
                        .from('avatars')
                        .getPublicUrl(fileName);

                    const updatedPayload = {
                        ...payload,
                        image: publicUrl
                    };

                    await prisma.shot.update({
                        where: { id: shot.id },
                        data: { payload: updatedPayload }
                    });

                    shotMigratedCount++;
                    console.log(`✅ 分鏡 "${shot.title || '無標題'}" 圖片已成功遷移！`);
                } catch (err: any) {
                    console.error(`❌ 遷移分鏡 ${shot.id} 圖片時發生未預期錯誤:`, err.message || err);
                }
            }
        }
    }
    console.log(`🎉 分鏡圖片遷移完成，共遷移 ${shotMigratedCount} 筆資料。`);
    console.log("\n✨ 所有遷移任務皆已執行完畢！");
}

runMigration()
    .catch(err => {
        console.error("❌ 遷移指令執行期間發生錯誤：", err);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
        console.log("Database connection closed cleanly.");
    });
