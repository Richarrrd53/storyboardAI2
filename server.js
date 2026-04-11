const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require("fs");
const { marked } = import('marked');
const multer = require('multer');
require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const readline = require('node:readline');

const app = express();
const port = 3000;
const hostname = '127.0.0.1';

const upload = multer({ dest: '/tmp/' });

let apiKey = '';
if (process.env.NODE_ENV !== 'production') {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('What is your GEMINI_API_KEY? ', (key) => {
        apiKey = key;
        rl.close();
    });
}
else {
    apiKey = process.env.GEMINI_API_KEY;
}
// if (!apiKey) {
//     console.error("FATAL: GEMINI_API_KEY 環境變數未設定。請設定 Vercel 環境變數並重試。");
// }

const genAI = new GoogleGenAI({ apiKey: apiKey });
const fileManager = new GoogleAIFileManager(apiKey);


const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));
app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.json());



app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'main.html'));
});

app.post('/api/ask-gemini', async (req, res) => {


    const question = req.body.question;
    try {
        const contents = [{ text: question }];

        // 模型名稱建議檢查或更新，這裡暫時保留您的設定。
        const response = await genAI.models.generateContent({
            model: "gemini-3-pro-image-preview",
            contents: contents,
            config: {
                responseModalities: ['Text', 'Image']
            },
        });

        let responseText = "";
        let imgs = [];

        // 檢查 candidates 是否存在且非空
        const candidate = response.candidates && response.candidates.length > 0 ? response.candidates[0] : null;

        if (candidate && candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
                if (part.text) {
                    responseText += part.text;
                } else if (part.inlineData) {
                    const imageData = part.inlineData.data;
                    const buffer = Buffer.from(imageData, 'base64');
                    // 注意：在 Vercel Serverless 環境中，您無法直接寫入檔案系統 (fs.writeFileSync)。
                    // 如果需要圖片，您必須將圖片 Base64 編碼後直接傳回前端，
                    // 或將圖片上傳到外部儲存服務（如 AWS S3 或 Google Cloud Storage）。
                    // **以下寫入檔案的邏輯在 Vercel 伺服器上會失敗。**
                    
                    // 為了讓應用程式在 Vercel 上工作，我將修改邏輯：直接將 Base64 資料傳回給前端。
                    // 前端將需要處理這個 Base64 字串以顯示圖片。
                    
                    const mimeType = part.inlineData.mimeType || 'image/png';
                    const base64Image = `data:${mimeType};base64,${imageData}`;
                    imgs.push(base64Image);
                }
            }
        }
        const usage = response.usageMetadata;

        // 回傳 base64 圖片資料，取代原本的檔案路徑
        res.json({ 
                response: responseText,
                image: imgs, 
                usage: {
                    promptTokens: usage.promptTokenCount,
                    candidatesTokens: usage.candidatesTokenCount,
                    totalTokens: usage.totalTokenCount
            } });
        
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
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
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
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