#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const { runRetentionCleanup } = require('../lib/projects/lifecycle');

async function main() {
    const argv = process.argv.slice(2);
    const dryRun = argv.includes('--dry-run') || !argv.includes('--execute');
    const batchArg = argv.find(a => a.startsWith('--batch-size='));
    const batchSize = batchArg ? Number(batchArg.split('=')[1]) || 20 : 20;

    if (!process.env.DATABASE_URL) {
        console.error('❌ 缺少 DATABASE_URL 環境變數');
        process.exit(1);
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        const report = await runRetentionCleanup({ prisma, dryRun, batchSize });
        console.log(JSON.stringify(report, null, 2));
        if (report.failed.length > 0) {
            process.exitCode = 2;
        }
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('❌ 30 天回收桶自動清理失敗:', err);
        process.exit(1);
    });
}
