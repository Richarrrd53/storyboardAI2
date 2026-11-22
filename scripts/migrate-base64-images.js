#!/usr/bin/env node
'use strict';

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const {
    inventoryBase64Images,
    migrateBase64Images,
    backfillLegacyDeletedAt
} = require('../lib/storage/base64-migrator');

function parseArgs(argv) {
    const args = {
        mode: 'inventory',
        dryRun: true,
        batchSize: 10,
        checkpoint: null,
        output: null
    };
    for (const token of argv.slice(2)) {
        if (token === '--inventory') args.mode = 'inventory';
        else if (token === '--migrate') args.mode = 'migrate';
        else if (token === '--backfill-deleted-at') args.mode = 'backfill-deleted-at';
        else if (token === '--dry-run') args.dryRun = true;
        else if (token === '--execute') args.dryRun = false;
        else if (token.startsWith('--batch-size=')) args.batchSize = Number(token.split('=')[1]) || 10;
        else if (token.startsWith('--checkpoint=')) args.checkpoint = token.split('=')[1];
        else if (token.startsWith('--output=')) args.output = token.split('=')[1];
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv);
    if (!process.env.DATABASE_URL) {
        console.error('❌ 缺少 DATABASE_URL 環境變數，無法連線至 PostgreSQL。');
        process.exit(1);
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
    const adapter = new PrismaPg(pool);
    const prisma = new PrismaClient({ adapter });

    try {
        let result;
        if (args.mode === 'inventory') {
            result = await inventoryBase64Images({ prisma, batchSize: args.batchSize });
        } else if (args.mode === 'backfill-deleted-at') {
            result = await backfillLegacyDeletedAt({ prisma, dryRun: args.dryRun });
        } else {
            if (!args.dryRun && (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY))) {
                throw new Error('執行正式遷移 (--execute) 需要設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY');
            }
            result = await migrateBase64Images({
                prisma,
                dryRun: args.dryRun,
                batchSize: args.batchSize,
                checkpointPath: args.checkpoint || path.join(process.cwd(), 'temp', 'base64-migration-checkpoint.json')
            });
        }

        const json = JSON.stringify(result, null, 2);
        if (args.output) {
            const dir = path.dirname(args.output);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(args.output, json, 'utf8');
            console.log(`✅ 報告已輸出至 ${args.output}`);
        }
        console.log(json);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('❌ 遷移執行失敗:', err);
        process.exit(1);
    });
}
