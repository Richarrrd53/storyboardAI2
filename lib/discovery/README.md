# 熱門短影音搜尋與自動分析

入口：`/discovery`。輸入頻道名稱、`@handle`、頻道 ID 或單一 `#hashtag`，選擇平台、SKILL、發布時間與 1–20 支影片後送出。

目前開通 YouTube；TikTok、Instagram 尚未串接，介面不可選。YouTube 先解析頻道再搜尋，不會把頻道名稱當影片關鍵字。Hashtag 必須出現在標題或說明。候選按觀看數排序，分頁最多查 200 筆，再篩選 180 秒內影片；Data API 不提供直式 Shorts 判定，結果可能含一般短片，也可能少於要求數量。

## 設定

在搜尋頁點選狀態按鈕進入 `/discovery/settings`，可填入 YouTube API Key 與 Google AI Studio 的 Gemini API Key。新填金鑰通過 API 連線檢查後，會以 AES-256-GCM 加密保存於 HttpOnly、SameSite=Strict Cookie（90 天，僅套用目前瀏覽器）。回傳的狀態不包含完整金鑰；欄位留空保留現有設定，新金鑰優先於環境變數且不修改全站設定。已設定環境變數或 Vertex AI 認證仍可直接沿用。

本機會自動建立 `.private/discovery-settings.key` 保存 Cookie 加密金鑰，此目錄禁止提交 Git。Vercel／多實例部署必須設定相同且至少 32 字元的隨機 `DISCOVERY_SETTINGS_SECRET`，避免不同實例無法讀取設定；變更此值會使原有 Cookie 失效。前端無法讀取已儲存的金鑰，搜尋及分析均由本站後端呼叫服務。

- `YOUTUBE_API_KEY`：啟用 YouTube Data API v3 的金鑰。
- `GOOGLE_CLOUD_PROJECT_ID`：啟用 Vertex AI 的專案。
- `GOOGLE_APPLICATION_CREDENTIALS`：具備 Vertex AI 權限的 Google 認證檔案路徑；雲端部署也可沿用 `GCP_SERVICE_ACCOUNT_BASE64`。
- `DISCOVERY_GEMINI_MODEL`：可選，預設 `gemini-2.5-flash`，需支援影片輸入。

`POST /api/discovery/search` 回傳真實影片與資料來源；瀏覽器接著逐支呼叫 `POST /api/discovery/analyze`，將 YouTube URL 作為 `fileData` 傳給 Gemini，分析畫面與語音，回傳開場、問題、解法、結尾及時間戳。單支失敗不影響其他影片，可個別重試；不會以示範資料或標題推測取代失敗結果。分析需使用 API 配額，20 支影片可能需數分鐘。結果目前只保留在頁面中。

## 驗證

`node --test tests/discovery.test.js`：不連網的搜尋篩選、分頁、頻道解析、錯誤與影片輸入測試。

`node tests/discovery-live.js`：使用現有憑證搜尋 YouTube 官方頻道 1 支影片並呼叫 Gemini，會使用真實 API 配額。

參考：[YouTube 搜尋 API](https://developers.google.com/youtube/v3/docs/search/list)、[Vertex AI 影片輸入](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/video-understanding)。
