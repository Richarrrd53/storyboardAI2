async function uploadAndAnalyze() {
    

    try {
        // --- 步驟 1: 前端上傳 ---
        const configRes = await fetch('/api/get-config');
        const { apiKey } = await configRes.json();
        
        const fileInput = document.getElementById('video-file');
        const file = fileInput.files[0];
        if (!file) return alert("請選擇影片");
        
        // 建立 Form Data 上傳至 Google File API
        const metadata = {
            file: { displayName: file.name }
        };
        
        const formData = new FormData();
        // 關鍵 1：Metadata 必須轉成 Blob 並指定內容類型為 application/json
        formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        
        // 關鍵 2：直接 append 檔案物件，不要包在額外的 Blob 裡
        formData.append("file", file);

        const uploadRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
            method: "POST",
            body: formData
        });
        if (!uploadRes.ok) {
            const errorData = await uploadRes.json();
            throw new Error(errorData.error.message || "上傳失敗");
        }
        const uploadData = await uploadRes.json();
        const fileUri = uploadData.file.uri;
        const fileName = uploadData.file.name;
        await checkFileStatus(fileName, apiKey, fileUri, file.type);
    } catch (err) {
        console.error(err);
        alert("分析失敗，請稍後再試");
    }
}

async function checkFileStatus(fileName, apiKey, fileUri, mimeType) {
    let state = "PROCESSING";
    while (state === "PROCESSING") {
        console.log("正在處理影片...");
        await new Promise(r => setTimeout(r, 3000)); // 等 3 秒
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
        const data = await res.json();
        state = data.state;
    }

    if (state === "ACTIVE") {
        // 呼叫你的 Vercel 後端 API
        sendToBackend(fileUri, mimeType);
    } else {
        alert("影片處理失敗，請重試");
    }
}