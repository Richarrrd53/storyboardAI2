const express = require('express');
const path = require('path');
const fs = require("fs");
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JWT_SECRET = process.env.JWT_SECRET || 'storyboard-secret-key-123';

if(process.env.GCP_SERVICE_ACCOUNT_BASE64) {
    try{
        const credentialsJson = Buffer.from(process.env.GCP_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
        const keyPath = path.join('/tmp', 'gcp-key.json');
        fs.writeFileSync(keyPath, credentialsJson);
        process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
        console.log("✅ 成功從環境變數載入金鑰，並寫入臨時檔案。");
    }
    catch (error) {
        console.error("❌ 從環境變數載入金鑰失敗：", error.message);
    }
}
else{
    console.log("⚠️ 未偵測到 GCP_SERVICE_ACCOUNT_BASE64，將使用本地 ADC 憑證 (如果有的話)。");
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
                image: user.image
            }
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ error: '伺服器錯誤' });
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
            select: { id: true, name: true, email: true, image: true, plan: true }
        });

        if (!user) {
            return res.status(404).json({ error: '找不到使用者' });
        }

        res.json({ user });
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

        const projects = await prisma.project.findMany({
            where: { authorId: decoded.id },
            select: {
                id: true,
                title: true,
                ratio: true,
                cover: true, // 👈 記得加上這行！
                createAt: true,
            },
            orderBy: { createAt: 'desc' }
        });

        res.json({ projects });
    } catch (error) {
        console.error('Fetch Projects Error:', error);
        res.status(500).json({ error: '獲取專案失敗' });
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

        if (!project) return res.status(404).json({ error: '找不到專案' });
        if (project.authorId !== decoded.id) return res.status(403).json({ error: '沒有存取權限' });

        res.json({ project });
    } catch (error) {
        console.error('Fetch Project Error:', error);
        res.status(500).json({ error: '獲取專案失敗' });
    }
});

// ==========================
// ==========================




app.post('/api/ask-gemini', async (req, res) => {
    const { question, type } = req.body;
    const modelConfigs = {
        'flash': {
            model: 'gemini-2.5-flash-lite',
            config: { responseModalities: ['Text'] }
        },
        'image': {
            model: "gemini-3.1-flash-image-preview",
            config: { responseModalities: ['Text', 'Image'] }
        },
        'story': {
            model: "gemini-3-flash-preview",
            config: { responseModalities: ['Text'] }
        }
    }

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
    const targetDir = path.join(process.cwd(), 'analysis', 'templates', 'gemini_outputs');
    try {
        if (!fs.existsSync(targetDir)) {
            return res.json([]);
        }

        const files = await fs.promises.readdir(targetDir);
        const josnFiles = files.filter(file => file.endsWith('.json'));
        
        const dataArray = await Promise.all(
            josnFiles.map(async (file) => {
                const filePath = path.join(targetDir, file);
                const content = await fs.promises.readFile(filePath, 'utf-8');
                return JSON.parse(content);
            })
        )
        res.json(dataArray);
    }
    catch (err) {
        console.error('讀取模板失敗', err);
        res.status(500).json({ error: '無法讀取模板'});
    }
});


// SPA catch-all — redirect /dashboard, /login, /register, /generate to main.html
const spaRoutes = ['/dashboard', '/login', '/register', '/generate', '/analyze'];
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
