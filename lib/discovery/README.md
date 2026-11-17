# 熱門短影音搜尋與自動分析

入口：`/discovery`。輸入頻道名稱、`@handle`、頻道 ID 或單一 `#hashtag`，選擇平台、SKILL、發布時間與 1–20 支影片後送出。

目前開通 YouTube；TikTok、Instagram 尚未串接，介面不可選。YouTube 先解析頻道再搜尋，不會把頻道名稱當影片關鍵字。Hashtag 必須出現在標題或說明。候選按觀看數排序，分頁最多查 200 筆，再篩選 180 秒內影片；Data API 不提供直式 Shorts 判定，結果可能含一般短片，也可能少於要求數量。

## 設定

從帳戶選單的「設定 → API 設定」，或搜尋頁的狀態按鈕，進入 `/discovery/settings`。可分別填入 OpenAI、YouTube Data API 與 Google AI Studio 的 Gemini API Key；搜尋與影片分析仍需 YouTube 與 Gemini。OpenAI 儲存後可在「設定 → AI 模型」選用。

所有設定、探索及 AI 入口均要求登入。後端只接受 JWT 驗證後的帳號 ID，不接受客戶端提交的 ownerId。各帳號使用不同名稱的 HttpOnly、SameSite=Strict Cookie（90 天，路徑 `/api`，HTTPS 使用 Secure），以 AES-256-GCM 加密並將帳號 ID 作為 AAD；即使改名或複製另一帳號的 Cookie，也無法讀取。舊版未綁定帳號的 Cookie 一律忽略，所有帳號須重新輸入。金鑰僅儲存在該瀏覽器，不跨裝置同步。

新填金鑰通過連線檢查才寫入，回傳狀態不含完整金鑰。欄位留空僅保留目前帳號自己的設定。所有使用者功能禁止沿用 OPENAI_API_KEY、GEMINI_API_KEY、GOOGLE_API_KEY、YOUTUBE_API_KEY 或 Vertex AI／ADC；缺少個人金鑰就拒絕請求。AsyncLocalStorage 隔離每次請求，適用創作討論、分鏡、圖片、模板推薦及搜尋分析。前端快取與生成任務也綁定登入狀態，切換帳號後舊任務不得繼續請求或儲存。OpenAI 連線檢查使用模型清單，不執行文字或圖片生成，通過檢查不代表所有模型皆有使用權限。

本機會自動建立 `.private/discovery-settings.key` 保存 Cookie 加密金鑰，此目錄禁止提交 Git。Vercel／多實例部署必須設定相同且至少 32 字元的隨機 `DISCOVERY_SETTINGS_SECRET`，避免不同實例無法讀取設定；變更此值會使原有 Cookie 失效。前端無法讀取已儲存的金鑰，搜尋及分析均由本站後端呼叫服務。

- YouTube、Gemini 與 OpenAI 金鑰必須由登入帳號在設定頁輸入；伺服器環境變數與 Google 認證不會作為使用者金鑰的替代來源。
- `DISCOVERY_GEMINI_MODEL`：可選，預設 `gemini-3.8-flash`，需支援影片輸入。

模型來自 `lib/ai/model-config.js`，分析與設定驗證使用同一常數。預設 MEDIUM thinking，可由後端任務改為 LOW／HIGH。Gemini 一律使用此帳號自己的 Developer API Key；未設定時拒絕請求，不切換到 Vertex AI ADC。設定模型必須在該金鑰專案可用，Developer API 用量由該專案計費。

`POST /api/discovery/search` 回傳真實影片與資料來源；瀏覽器接著逐支呼叫 `POST /api/discovery/analyze`，將 YouTube URL 作為 `fileData` 傳給 Gemini，分析畫面與語音，回傳開場、問題、解法、結尾及時間戳。單支失敗不影響其他影片，可個別重試；不會以示範資料或標題推測取代失敗結果。分析需使用 API 配額，20 支影片可能需數分鐘。結果目前只保留在頁面中。

## 驗證

`node --test tests/discovery.test.js`：不連網的搜尋篩選、分頁、頻道解析、錯誤與影片輸入測試。

`node tests/discovery-live.js`：使用現有憑證搜尋 YouTube 官方頻道 1 支影片並呼叫 Gemini，會使用真實 API 配額。

參考：[YouTube 搜尋 API](https://developers.google.com/youtube/v3/docs/search/list)、[Vertex AI 影片輸入](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/video-understanding)。
