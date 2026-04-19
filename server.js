const express = require('express');
const path = require('path');
const fs = require("fs");

const multer = require('multer');
require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const app = express();


const apiKey = process.env.GEMINI_API_KEY;


if (!apiKey) {
    console.error("❌ 錯誤：找不到 GEMINI_API_KEY。");
    console.log("本機測試：請確認 .env 檔案中有設定 GEMINI_API_KEY");
    console.log("Vercel：請在 Environment Variables 中設定 GEMINI_API_KEY");
}

const genAI = new GoogleGenAI({ apiKey: apiKey });
const genAIVideo = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);



// 2. 修改路由回傳檔案的路徑
app.get('/', (req, res) => {
    // 確保路徑指向根目錄下的 public/main.html
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

const upload = multer({ 
    dest: '/tmp/',
    limits: { fileSize: 100 * 1024 * 1024 } // 限制 100MB
});



app.post('/api/ask-gemini', async (req, res) => {


    const { question, type} = req.body;
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


app.post('/api/analyze-video', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('未上傳影片');

        // 檢查 API Key 是否已初始化 (針對你 readline 的邏輯)
        if (!apiKey) {
            return res.status(500).json({ error: "伺服器 API Key 尚未設定" });
        }

        // 1. 上傳到 Gemini File API
        const uploadResponse = await fileManager.uploadFile(req.file.path, {
            mimeType: req.file.mimetype,
            displayName: req.file.originalname,
        });

        // 2. 等待影片處理完成
        let file = await fileManager.getFile(uploadResponse.file.name);
        while (file.state === "PROCESSING") {
            process.stdout.write("."); // 讓後端 log 知道還在動
            await new Promise((resolve) => setTimeout(resolve, 3000));
            file = await fileManager.getFile(uploadResponse.file.name);
        }

        if (file.state === "FAILED") {
            throw new Error("Gemini 影片處理失敗");
        }
        const { marked } = await import('marked');
        // 3. 進行分析 - 建議使用目前穩定的模型名稱
        const model = genAIVideo.getGenerativeModel({ model: "gemini-3-flash-preview" }); 
        const prompt = "你是一個專業的短影音企劃。請觀看影片並分析：1. 【前三秒 Hook】：這支影片開頭如何吸引人？ 2. 【鏡頭語言】：畫面構圖與運鏡方式。";

        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: file.mimeType,
                    fileUri: file.uri,
                },
            },
            { text: prompt },
        ]);
        
        const rawText = result.response.text();// 使用 marked 將 Markdown 轉換為 HTML
        const htmlContent = marked.parse(rawText);
        // 4. 清理：先刪除本地檔案，避免占用 Vercel /tmp 空間
        if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        // 刪除 Gemini 雲端檔案 (選用，節省雲端空間)
        await fileManager.deleteFile(file.name);

        res.json({ 
            analysis: htmlContent, 
            raw_text: rawText // 保留一份純文字備用
        });

    } catch (error) {
        console.error('Video Analysis Error:', error);
        res.status(500).json({ 
            error: "影片分析失敗", 
            details: error.message 
        });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = 3000;
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;