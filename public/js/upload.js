async function uploadAndAnalyze() {
    const fileInput = document.getElementById('video-file');
    const file = fileInput.files[0];
    if (!file) return alert("請選擇影片");

    try {
        // --- 步驟 1: 前端上傳 ---
        // 注意：正式上線建議 API Key 由後端保護，這裡先示範邏輯
        const apiKey = process.env.GEMINI_API_KEY;
        
        // 建立 Form Data 上傳至 Google File API
        const metadata = {
            file: { displayName: file.name }
        };
        
        const formData = new FormData();
        formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        formData.append("file", file);

        const uploadRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
            method: "POST",
            body: formData
        });
        const uploadData = await uploadRes.json();
        const fileUri = uploadData.file.uri;
        const fileName = uploadData.file.name;

        let fileState = "PROCESSING";
        while (fileState === "PROCESSING") {
            await new Promise(r => setTimeout(r, 3000));
            const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
            const checkData = await checkRes.json();
            fileState = checkData.state;
        }

        // --- 步驟 3: 傳送 fileUri 給你的 Vercel 後端進行分析 ---

        const analyzeRes = await fetch('/api/analyze-video-uri', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileUri: fileUri, mimeType: file.mimeType })
        });
        
        const result = await analyzeRes.json();
        document.getElementById('result-container').innerHTML = result.analysis;

    } catch (err) {
        console.error(err);
        alert("分析失敗，請稍後再試");
    }
}