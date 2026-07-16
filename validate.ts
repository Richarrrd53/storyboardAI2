import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.PRISMA_DATABASE_URL;
const pool = new pg.Pool({
    connectionString,
    max: 1, // Only 1 connection needed
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🔍 開始驗證資料庫中是否仍殘留 Base64 編碼圖片...");
    
    // 1. 檢查用戶
    const base64Users = await prisma.user.findMany({
        where: {
            image: {
                startsWith: 'data:'
            }
        },
        select: { id: true, email: true }
    });
    console.log(`- 殘留 Base64 頭像的用戶數: ${base64Users.length}`);

    // 2. 檢查專案
    const base64Projects = await prisma.project.findMany({
        where: {
            cover: {
                startsWith: 'data:'
            }
        },
        select: { id: true, title: true }
    });
    console.log(`- 殘留 Base64 封面的專案數: ${base64Projects.length}`);

    // 3. 檢查分鏡
    let base64ShotsCount = 0;
    let lastShotId = '';
    let hasMoreShots = true;

    while (hasMoreShots) {
        const shots: any[] = await prisma.shot.findMany({
            where: lastShotId ? { id: { gt: lastShotId } } : {},
            orderBy: { id: 'asc' },
            take: 20,
            select: { id: true, payload: true }
        });

        if (shots.length === 0) {
            hasMoreShots = false;
            break;
        }

        for (const shot of shots) {
            lastShotId = shot.id;
            const payload = shot.payload as any;
            if (payload && typeof payload === 'object' && payload.image && typeof payload.image === 'string' && payload.image.startsWith('data:')) {
                base64ShotsCount++;
            }
        }
    }
    console.log(`- 殘留 Base64 圖片的分鏡數: ${base64ShotsCount}`);

    console.log("\n------------------------------------");
    if (base64Users.length === 0 && base64Projects.length === 0 && base64ShotsCount === 0) {
        console.log("🎉 驗證成功！資料庫中所有 Base64 圖片均已成功遷移至 Supabase Storage！");
    } else {
        console.warn("⚠️ 警告：資料庫中仍有部分 Base64 圖片尚未完成遷移，請檢查上述殘留項目。");
    }
    console.log("------------------------------------");
}

main()
    .catch(err => console.error("❌ 驗證時發生錯誤:", err))
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
        console.log("Database connection closed cleanly.");
    });
