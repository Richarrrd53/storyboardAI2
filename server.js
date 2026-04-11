const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require("fs");
const { marked } = import('marked');
const multer = require('multer');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const app = express();
const port = 3000;
const hostname = '127.0.0.1';

const upload = multer({ dest: '/tmp/' });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("FATAL: GEMINI_API_KEY 環境變數未設定。請設定 Vercel 環境變數並重試。");
}

const genAI = new GoogleGenerativeAI({ apiKey: apiKey });
const fileManager = new GoogleAIFileManager({ apiKey: apiKey });


const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));
app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.json());



app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'main.html'));
});

app.post('/api/ask-gemini', async (req, res) => {
    const { question } = req.body;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(question);
        const response = await result.response;
        
        // 關鍵：抓取 Gemini 回傳的 Token 統計
        const usage = response.usageMetadata; 

        res.json({ 
            response: response.text(),
            usage: {
                promptTokens: usage.promptTokenCount,
                candidatesTokens: usage.candidatesTokenCount,
                totalTokens: usage.totalTokenCount
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/analyze-video', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('未上傳影片');

        // 1. 上傳到 Gemini File API
        const uploadResponse = await fileManager.uploadFile(req.file.path, {
            mimeType: req.file.mimetype,
            displayName: "Uploaded Video",
        });

        // 2. 等待影片處理完成
        let file = await fileManager.getFile(uploadResponse.file.name);
        while (file.state === "PROCESSING") {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            file = await fileManager.getFile(uploadResponse.file.name);
        }

        // 3. 進行分析
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = "你是一個專業的短影音企劃。請觀看影片並分析：1. 【前三秒 Hook】：這支影片開頭如何吸引人？ 2. 【鏡頭語言】：畫面構圖與運鏡方式。";
        
        const result = await model.generateContent([
            { fileData: { mimeType: file.mimeType, fileUri: file.uri } },
            { text: prompt },
        ]);

        // 刪除本地與遠端暫存檔
        fs.unlinkSync(req.file.path);
        await fileManager.deleteFile(file.name);

        res.json({ analysis: result.response.text() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "影片分析失敗" });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;