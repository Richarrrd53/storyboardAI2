import fs from 'fs';
import prisma from './lib/prisma';
import { nanoid } from 'nanoid';

async function main() {
    const data = JSON.parse(fs.readFileSync('', 'utf-8'));
    const projectCode = nanoid(8);

    const newProject = await prisma.project.create({
        data:{
            title: data.meta.title,
            style: data.meta.style,
            retio: data.meta.ratio,
            metadata: data.metadata,
            characters: data.characters,
            shots: {
                create: data.shots.map((shot) => ({
                    order: shot.id,
                    title: shot.title,
                    camera: shot.camera,
                    duration: shot.duration,
                    playload: {
                        emotion: shot.emotion,
                        shotPrompt: shot.shotPrompt,
                        finalPrompt: shot.finalPrompt,
                        image: shot.image,
                    },
                })),
            },
        },
    });
    console.log(`成功匯入專案： ${newProject.title}，共 ${data.shots.length} 個分鏡。`);
}

main()
    .catch((err) => console.error(err))
    .finally(async () => await prisma.$disconnect());