import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

async function main() {
    const targetDir = path.join(process.cwd(), 'analysis', 'templates', 'gemini_outputs');
    if (!fs.existsSync(targetDir)) {
        console.warn(`⚠️ 找不到模板資料夾: ${targetDir}`);
        return;
    }

    const files = fs.readdirSync(targetDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    console.log(`🎬 開始匯入 ${jsonFiles.length} 個模板至資料庫...`);

    let count = 0;
    for (const file of jsonFiles) {
        const filePath = path.join(targetDir, file);
        const rawContent = fs.readFileSync(filePath, 'utf-8');
        try {
            const data = JSON.parse(rawContent);
            const templateId = data.id || file.split('_')[0] || path.basename(file, '.json');

            await prisma.template.upsert({
                where: { id: templateId },
                update: {
                    name: data.name || data.title || '無標題',
                    category: data.category || '未分類',
                    tags: data.tags || [],
                    description: data.description || '',
                    content: data,
                },
                create: {
                    id: templateId,
                    name: data.name || data.title || '無標題',
                    category: data.category || '未分類',
                    tags: data.tags || [],
                    description: data.description || '',
                    content: data,
                    is_custom: false,
                }
            });
            console.log(`✅ 已匯入/更新模板: ${data.name || templateId}`);
            count++;
        } catch (e) {
            console.error(`❌ 匯入模板檔案失敗: ${file}`, e);
        }
    }

    console.log(`🎉 模板匯入完成，成功匯入/更新 ${count} 個模板。`);
}

main()
    .catch((e) => {
        console.error("❌ 匯入發生未預期錯誤：", e);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
