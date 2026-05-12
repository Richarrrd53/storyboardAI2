import 'dotenv/config';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.PRISMA_DATABASE_URL;
if (!connectionString) {
    throw new Error("❌ 錯誤：找不到 PRISMA_DATABASE_URL 環境變數，請檢查 .env 檔案。");
}
// 為了避免在開發環境下熱重載（Hot Reload）導致產生過多連線
// 我們會將 prisma 實例掛載在 global 物件上
const globalForPrisma = global as unknown as { prisma: PrismaClient };

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma || new PrismaClient({adapter});
        // log: ['query'], // 如果你想在終端機看到 SQL 指令，可以開啟這行

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// export default prisma;