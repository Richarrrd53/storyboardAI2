const express = require('express');
const path = require('path');
const fs = require("fs");
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 10000, // Close idle connections after 10 seconds to avoid using dead serverless connections
    connectionTimeoutMillis: 10000,
    keepAlive: true
});

pool.on('error', (err) => {
    console.error('⚠️ Unexpected pg connection pool error:', err.message);
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JWT_SECRET = process.env.JWT_SECRET || 'storyboard-secret-key-123';

if(process.env.GCP_SERVICE_ACCOUNT_BASE64) {
    console.log("👉偵測到使用雲端部屬，正在進行認證...");
    try{
        const credentialsJson = Buffer.from(process.env.GCP_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
        const keyPath = path.join('/tmp', 'gcp-key.json');
        fs.writeFileSync(keyPath, credentialsJson);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
        console.log("👌認證成功！");
    }
    catch (error) {
        console.error("🫸認證失敗：", error.message);
    }
}
else if(process.env.GOOGLE_APPLICATION_CREDENTIALS){
    console.log("👉偵測到使用本地端部屬，正在進行認證...");
    try{
        if (!fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
            throw new Error(`找不到指定的金鑰檔案：${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
        }
        console.log("👌認證成功！");
    }
    catch (error) {
        console.error("🫸認證失敗：", error.message);
    }
}


const { GoogleGenAI } = require('@google/genai');

const app = express();


const googleCLoudProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const location = "global";

if (!googleCLoudProjectId) {
    console.error("❌ 錯誤：找不到 GOOGLE_CLOUD_PROJECT_ID。");
}

const genAI = new GoogleGenAI({
    vertexai: true,
    project: googleCLoudProjectId,
    location: location,
});


app.get('/', (req, res) => {
    const filePath = path.join(process.cwd(), 'public', 'main.html');
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error("發送檔案失敗:", err);
            res.status(500).send("無法讀取主頁面，請檢查路徑設定。");
        }
    });
});

const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true })); // 增加 URL 編碼限制

function toTaipeiTZ(date) {
    if (!date) return null;
    const d = new Date(date);
    const tzOffset = 8 * 60 * 60 * 1000;
    const taipeiTime = new Date(d.getTime() + tzOffset);
    return taipeiTime.toISOString().replace('Z', '+08:00');
}

// === AUTHENTICATION API ===
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: '請提供 Email 和密碼' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: '找不到已綁定該電子信箱的使用者' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: '密碼錯誤' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: '登入成功',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                createAt: toTaipeiTZ(user.createAt)
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: '伺服器錯誤' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: '請提供使用者名稱、電子信箱與密碼' });
        }

        // Email 唯一性驗證
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: '此 Email 已被註冊' });
        }

        // 密碼加密
        const passwordHash = await bcrypt.hash(password, 10);

        // 建立新使用者，預設 plan 為 "free"
        const user = await prisma.user.create({
            data: {
                name,
                email,
                passwordHash,
                plan: 'free'
            }
        });

        // 產生 JWT Token
        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: '註冊成功',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                createAt: toTaipeiTZ(user.createAt)
            }
        });
    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ error: '伺服器錯誤，無法完成註冊' });
    }
});

app.get('/api/auth/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, name: true, email: true, image: true, plan: true, createAt: true }
        });

        if (!user) {
            return res.status(404).json({ error: '找不到使用者' });
        }

        res.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                plan: user.plan,
                createAt: toTaipeiTZ(user.createAt)
            }
        });
    } catch (error) {
        console.error('Auth Me Error:', error);
        res.status(401).json({ error: 'Token 無效或已過期' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.json({ success: true, message: '已登出' });
});

// === PROJECTS API ===
app.get('/api/projects', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const includeDeleted = req.query.include_deleted === 'true';

        const projects = await prisma.project.findMany({
            where: { 
                authorId: decoded.id,
                ...(includeDeleted ? {} : { is_deleted: false })
            },
            select: {
                id: true,
                title: true,
                ratio: true,
                style: true,
                is_deleted: true,
                createAt: true,
            },
            orderBy: { createAt: 'desc' }
        });

        const formattedProjects = projects.map(p => ({
            ...p,
            createAt: toTaipeiTZ(p.createAt)
        }));

        res.json({ projects: formattedProjects });
    } catch (error) {
        console.error('Fetch Projects Error:', error);
        res.status(500).json({ error: '獲取專案失敗' });
    }
});

// GET project cover (binary stream endpoint)
app.get('/api/projects/:id/cover', async (req, res) => {
    try {
        const { id } = req.params;
        const project = await prisma.project.findUnique({
            where: { id },
            select: { cover: true }
        });
        if (!project || !project.cover) {
            return res.status(404).send('Not Found');
        }

        if (project.cover.startsWith('data:')) {
            const matches = project.cover.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
                return res.send(buffer);
            }
        }

        res.redirect(project.cover);
    } catch (err) {
        console.error('Fetch Cover Error:', err);
        res.status(500).send('Server Error');
    }
});

// GET shot image (binary stream endpoint)
app.get('/api/projects/:projectId/shots/:shotId/image', async (req, res) => {
    try {
        const { shotId } = req.params;
        const shot = await prisma.shot.findUnique({
            where: { id: shotId },
            select: { payload: true }
        });

        if (!shot || !shot.payload || !shot.payload.image) {
            return res.status(404).send('Not Found');
        }

        const imageUrl = shot.payload.image;
        if (imageUrl.startsWith('data:')) {
            const matches = imageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
                return res.send(buffer);
            }
        }

        res.redirect(imageUrl);
    } catch (err) {
        console.error('Fetch Shot Image Error:', err);
        res.status(500).send('Server Error');
    }
});

// DELETE project (soft delete)
app.delete('/api/projects/:id', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { id } = req.params;

        const project = await prisma.project.findUnique({
            where: { id }
        });

        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限刪除此專案' });

        await prisma.project.update({
            where: { id },
            data: { is_deleted: true }
        });

        res.json({ message: '專案已成功移至回收桶' });
    } catch (error) {
        console.error('Delete Project Error:', error);
        res.status(500).json({ error: '刪除專案失敗' });
    }
});

// POST restore project
app.post('/api/projects/:id/restore', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const { id } = req.params;

        const project = await prisma.project.findUnique({
            where: { id }
        });

        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有權限還原此專案' });

        await prisma.project.update({
            where: { id },
            data: { is_deleted: false }
        });

        res.json({ message: '專案已成功還原' });
    } catch (error) {
        console.error('Restore Project Error:', error);
        res.status(500).json({ error: '還原專案失敗' });
    }
});

// GET single project (with shots and metadata)
app.get('/api/projects/:id', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const id = req.params.id;
        const project = await prisma.project.findUnique({
            where: { id },
            include: { shots: true, author: true }
        });

        let cleanCover = project.cover;
        if (cleanCover && cleanCover.startsWith('data:')) {
            cleanCover = `/api/projects/${project.id}/cover`;
        }

        const formattedProject = {
            ...project,
            cover: cleanCover,
            createAt: toTaipeiTZ(project.createAt),
            updatedAt: toTaipeiTZ(project.updatedAt),
            shots: (project.shots || []).map(s => {
                let cleanPayload = { ...s.payload };
                if (cleanPayload.image && cleanPayload.image.startsWith('data:')) {
                    cleanPayload.image = `/api/projects/${project.id}/shots/${s.id}/image`;
                }
                return {
                    ...s,
                    payload: cleanPayload,
                    createAt: toTaipeiTZ(s.createAt),
                    updateAt: toTaipeiTZ(s.updateAt)
                };
            }),
            author: project.author ? {
                ...project.author,
                createAt: toTaipeiTZ(project.author.createAt)
            } : null
        };

        res.json({ project: formattedProject });
    } catch (error) {
        console.error('Fetch Project Error:', error);
        res.status(500).json({ error: '獲取專案失敗' });
    }
});

function generateShortId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

app.post('/api/projects', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: '未授權' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const { title, style, ratio, cover, metadata, characters, shots } = req.body;

        if (!title) {
            return res.status(400).json({ error: '專案標題為必填欄位' });
        }

        // 產生唯一的 shortId
        let shortId = generateShortId();
        let exists = await prisma.project.findUnique({ where: { shortId } });
        let attempts = 0;
        while (exists && attempts < 5) {
            shortId = generateShortId();
            exists = await prisma.project.findUnique({ where: { shortId } });
            attempts++;
        }

        const project = await prisma.project.create({
            data: {
                shortId,
                authorId: decoded.id,
                title,
                style: style || '',
                ratio: ratio || '',
                cover: cover || null,
                metadata: metadata || {},
                characters: characters || {},
                shots: {
                    create: (shots || []).map((shot) => ({
                        order: shot.order,
                        title: shot.title || '',
                        camera: shot.camera || '',
                        duration: shot.duration || '3s',
                        payload: shot.payload || {}
                    }))
                }
            },
            include: {
                shots: true
            }
        });

        const formattedProject = {
            ...project,
            createAt: toTaipeiTZ(project.createAt),
            updatedAt: toTaipeiTZ(project.updatedAt),
            shots: (project.shots || []).map(s => ({
                ...s,
                createAt: toTaipeiTZ(s.createAt),
                updateAt: toTaipeiTZ(s.updateAt)
            }))
        };

        res.json({ message: '專案儲存成功', project: formattedProject });
    } catch (error) {
        console.error('Create Project Error:', error);
        res.status(500).json({ error: '建立專案失敗' });
    }
});

// ==========================
// ==========================




app.post('/api/ask-gemini', async (req, res) => {
    const { question, type, ratio } = req.body;

    let targetRatio = "16:9";
    if (ratio) {
        if (ratio.includes("16:9")) targetRatio = "16:9";
        else if (ratio.includes("9:16")) targetRatio = "9:16";
        else if (ratio.includes("3:2")) targetRatio = "3:2";
        else if (ratio.includes("2:3")) targetRatio = "2:3";
        else if (ratio.includes("1:1")) targetRatio = "1:1";
    }

    const modelConfigs = {
        'flash': {
            model: 'gemini-2.5-flash-lite',
            config: { responseModalities: ['TEXT'] }
        },
        'image': {
            model: 'gemini-3.1-flash-image',
            config: { 
                responseModalities: ['TEXT', 'IMAGE'],
                imageConfig: {
                    aspectRatio: targetRatio,
                    imageSize: '1K'
                }
            }
        },
        'story': {
            model: 'gemini-3.5-flash',
            config: { responseModalities: ['TEXT'] }
        }
    };

    const selectedConfig = modelConfigs[type] || modelConfigs['flash'];

    try {
        const contents = [{ text: question }];

        const response = await genAI.models.generateContent({
            model: selectedConfig.model,
            contents: contents,
            config: selectedConfig.config,
        });

        let responseText = "";
        let imgs = [];

        const candidate = response.candidates && response.candidates.length > 0 ? response.candidates[0] : null;

        if (candidate && candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
                if (part.text) {
                    responseText += part.text;
                } else if (part.inlineData) {
                    const imageData = part.inlineData.data;
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    const base64Image = `data:${mimeType};base64,${imageData}`;
                    imgs.push(base64Image);
                }
            }
        }
        const usage = response.usageMetadata;

        res.json({
            response: responseText,
            image: imgs,
            usage: {
                promptTokens: usage.promptTokenCount,
                candidatesTokens: usage.candidatesTokenCount,
                totalTokens: usage.totalTokenCount
            }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

app.get('/api/get-templates', async (req, res) => {
    try {
        const templates = await prisma.template.findMany({
            orderBy: { createAt: 'desc' }
        });
        const dataArray = templates.map(t => {
            return typeof t.content === 'string' ? JSON.parse(t.content) : t.content;
        });
        res.json(dataArray);
    }
    catch (err) {
        console.error('讀取模板失敗', err);
        res.status(500).json({ error: '無法讀取模板'});
    }
});

app.post('/api/templates', async (req, res) => {
    try {
        const data = req.body;
        if (!data || !data.id || !data.name) {
            return res.status(400).json({ error: '缺少必要欄位：id, name' });
        }
        const newTpl = await prisma.template.create({
            data: {
                id: data.id,
                name: data.name,
                category: data.category || '未分類',
                tags: data.tags || [],
                description: data.description || '',
                content: data,
                is_custom: true
            }
        });
        res.json({ success: true, template: newTpl });
    } catch (err) {
        console.error('新增模板失敗', err);
        res.status(500).json({ error: '新增模板失敗', details: err.message });
    }
});


// SPA catch-all — redirect routes to main.html
const spaRoutes = ['/dashboard', '/projects', '/login', '/register', '/generate', '/analyze', '/analysis', '/history', '/template', '/project/:id'];
spaRoutes.forEach(route => {
    app.get(route, (req, res) => {
        res.sendFile(path.join(process.cwd(), 'public', 'main.html'));
    });
});
if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
