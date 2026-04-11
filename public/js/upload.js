async function uploadAndAnalyze() {
    const fileInput = document.getElementById('video-file');
    const file = fileInput.files[0];
    
    if (!file) return alert("請先選擇檔案！");

    try {
        
        // 1. 取得 API Key
        const configRes = await fetch('/api/get-config');
        const { apiKey } = await configRes.json();

        // 2. 第一步：取得 Resumable 上傳網址
        const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
            method: "POST",
            headers: {
                "X-Goog-Upload-Protocol": "resumable",
                "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": file.size,
                "X-Goog-Upload-Header-Content-Type": file.type,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ file: { displayName: file.name } })
        });

        const uploadUrl = initRes.headers.get("X-Goog-Upload-URL");

        // 3. 第二步：正式上傳影片
        const finalRes = await fetch(uploadUrl, {
            method: "POST",
            headers: {
                "X-Goog-Upload-Offset": "0",
                "X-Goog-Upload-Command": "upload, finalize"
            },
            body: file 
        });

        const uploadData = await finalRes.json();
        const fileName = uploadData.file.name; // 格式會是 "files/xxxx"

        // 4. 第三步：開始輪詢 (Polling)，確認 Google 處理好了沒
        const fileUri = await pollFileStatus(fileName, apiKey);

        // 5. 第四步：通知你的 Vercel 後端進行 AI 分析
        const analyzeRes = await fetch('/api/analyze-video-uri', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                fileUri: fileUri, 
                mimeType: file.type 
            })
        });

        const result = await analyzeRes.json();

        // 6. 最後：把結果漂亮的顯示出來
        if (result.analysis) {
            document.getElementById('analysis-result').innerHTML = result.analysis;
        } else {
            throw new Error(result.error || "分析結果空白");
        }

    } catch (err) {
        console.error(err);
    }
}

// 輪詢函式保持不變，它是 uploadAndAnalyze 的好幫手
async function pollFileStatus(fileName, apiKey) {
    while (true) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
        const fileInfo = await response.json();

        if (fileInfo.state === "ACTIVE") {
            return fileInfo.uri; 
        } else if (fileInfo.state === "FAILED") {
            throw new Error("Google 影片處理失敗");
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}