const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require("fs");
const { marked } = import('marked');
const multer = require('multer');
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");


const app = express();
const port = 3000;
const hostname = '127.0.0.1';

const upload = multer({ dest: 'uploads/' });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
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

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));