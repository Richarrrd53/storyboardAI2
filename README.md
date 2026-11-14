# 🎬 Storyboard AI

以 AI 協助短影音創作者從故事構想到分鏡的網頁應用。專案提供創作助手、分鏡生成、專案管理、模板與 YouTube 短片探索功能。

![Storyboard AI 落地頁](./public/screenshot/landing%20page.png)

## 功能

- **創作與分鏡**：透過創作助手討論需求，設定風格、比例和模板，產生文字分鏡與圖片；支援單鏡頭編輯與重新生成。
- **專案管理**：瀏覽、搜尋、修改和複製專案；軟刪除後可從歷史紀錄還原。
- **模板**：瀏覽短影音模板、查看時間軸，並將模板帶入創作流程。
- **短片探索**：搜尋 YouTube 影片，分析開場、問題、解法與結尾，並可將分析結果加入模板。其他平台目前尚未串接。搜尋結果可能包含一般短片，詳見 [探索模組說明](./lib/discovery/README.md)。
- **操作介面**：原生 JavaScript SPA、響應式導覽及背景生成狀態；登入後可管理自己的專案。

<table><tr><td><img src="./public/screenshot/dahboard_pc.png" alt="桌面儀表板"></td><td><img src="./public/screenshot/dashboard_mobile.png" alt="行動版儀表板"></td></tr></table>

## 技術架構

前端以 HTML、CSS 和原生 JavaScript 建置，由 `public/main.html` 與 SPA 路由載入各頁面。後端使用 Node.js、Express 5、Prisma 7 和 PostgreSQL；帳號使用 bcrypt 與 JWT。AI 功能使用 `@google/genai`，主要創作流程透過 Vertex AI；探索功能另支援 Gemini Developer API。YouTube 搜尋使用 YouTube Data API v3。

```text
public/              頁面、樣式、前端程式與靜態資源
server.js            Express 路由、資料庫與 AI 整合
api/index.js         Vercel Serverless 入口
lib/ai/              模型設定、創作助手與生成邏輯
lib/discovery/       短片搜尋、分析與設定
prisma/              Schema 與模板匯入腳本
tests/               自動化、瀏覽器及真實服務驗證
```

## 本機啟動

需要 Node.js 20 以上（專案曾使用 22.12.0）、PostgreSQL 資料庫，以及所需 Google Cloud 憑證。AI 與 YouTube 功能需要對應服務的權限和配額。

1. 安裝套件：

   ```bash
   npm install
   ```

2. 在專案根目錄建立 `.env`，至少設定資料庫和 JWT 金鑰；需要 AI 功能時也設定 Google Cloud 專案與認證：

   ```ini
   PORT=3000
   DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
   JWT_SECRET="replace-with-a-long-random-secret"
   GOOGLE_CLOUD_PROJECT_ID="your-gcp-project-id"
   # GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/credentials.json"
   # GCP_SERVICE_ACCOUNT_BASE64="base64-encoded-service-account-json"
   # YOUTUBE_API_KEY="your-youtube-data-api-key"
   # DISCOVERY_SETTINGS_SECRET="at-least-32-random-characters"
   ```

   創作功能使用 Vertex AI；本機可使用現有 Application Default Credentials（ADC）或指定認證檔案，部署環境可設定 Base64 服務帳戶憑證。正式環境務必設定自己的 `JWT_SECRET`，避免使用程式內的開發預設值。探索頁也可儲存瀏覽器專用的 YouTube 與 Gemini API 金鑰；其 provider 與設定細節見[探索模組說明](./lib/discovery/README.md)。

3. 同步資料庫結構並生成 Prisma Client：

   ```bash
   npx prisma db push
   npx prisma generate
   ```

4. 啟動應用：

   ```bash
   npm start
   ```

   開啟 [http://localhost:3000](http://localhost:3000)。`npm start` 執行 `node server.js`，並不提供自動重載。

如需從 `analysis/templates/gemini_outputs` 匯入 JSON 模板，可執行 `npx tsx prisma/seed_templates.ts`。此腳本使用 `PRISMA_DATABASE_URL`，執行前須另外設定為目標資料庫；資料夾不存在時會略過匯入。

## AI 模型設定

預設值以 `lib/ai/model-config.js` 為準，可透過環境變數分別覆寫：

| 用途 | 環境變數 | 程式預設值 |
| --- | --- | --- |
| 快速任務 | `GEMINI_MODEL_FAST` | `gemini-3.5-flash-lite` |
| 創作助手 | `GEMINI_MODEL_CREATIVE` | `gemini-3.8-flash` |
| 文字分鏡 | `GEMINI_MODEL_STORY` | `gemini-3.8-flash` |
| 圖片 | `GEMINI_MODEL_IMAGE` | `gemini-nano-banana-2.1` |
| 影片探索 | `DISCOVERY_GEMINI_MODEL` | `gemini-3.8-flash` |
| 預留進階文字分鏡 | `GEMINI_MODEL_PREMIUM_STORY` | `gemini-4-argon` |

模型可用性取決於服務供應商、帳號與部署設定；設定的模型不支援時需自行調整。圖片設定為 1K，支援 16:9、9:16、3:2、2:3 和 1:1。創作助手可透過 `GEMINI_CREATIVE_THINKING_LEVEL`、`GEMINI_CREATIVE_INCLUDE_THOUGHTS` 和 `GEMINI_CREATIVE_TIMEOUT_MS` 調整；總期限預設本機 100 秒、Vercel 55 秒，覆寫範圍為 30–300 秒。

## 資料與 API

Prisma schema 包含 `User`、`Project`、`Shot` 和 `Template`。專案可包含多個鏡頭，刪除專案時使用 `is_deleted` 標記；鏡頭與專案關聯的完整欄位以 [schema](./prisma/schema.prisma) 為準。

| 路徑 | 主要用途 |
| --- | --- |
| `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` | 註冊、登入與身份資訊 |
| `/api/projects`、`/api/projects/:id` | 專案列表、建立、查詢、修改及刪除 |
| `/api/projects/:id/restore`, `/api/projects/:id/duplicate` | 還原及複製專案 |
| `/api/projects/:projectId/shots/:shotId` | 編輯鏡頭；另有 `regenerate` 和 `optimize-prompt` 端點 |
| `/api/creation/copilot`, `/api/ask-gemini` | 創作討論及分鏡／圖片生成 |
| `/api/get-templates`, `/api/templates` | 讀取及建立模板 |
| `/api/discovery/settings`, `/api/discovery/skills`, `/api/discovery/search`, `/api/discovery/analyze`, `/api/discovery/add-template` | 探索設定、搜尋、分析及加入模板 |

實際 HTTP 方法、驗證和資料格式以 [server.js](./server.js) 為準。

## 測試與部署

```bash
npm test
```

此命令執行 `tests/*.test.js`。瀏覽器測試和真實服務驗證是獨立腳本；例如設定 `RUN_VERTEX_LIVE=1` 後可執行 `node --test tests/creative-conversation.live.js` 或 `node --test tests/storyboard-generation.live.js`。真實服務測試需要有效憑證，並可能產生費用。

Vercel 路由設定見 [vercel.json](./vercel.json)：API 轉至 `api/index.js`，探索頁有專用路由，其餘頁面轉至主外框。部署時設定資料庫、JWT 和所需 Google 憑證；若使用探索頁儲存金鑰，需設定至少 32 字元的 `DISCOVERY_SETTINGS_SECRET`。函式執行期限由 Vercel 專案設定決定，應確保足以涵蓋 AI 請求。
# 生成圖片儲存

分鏡生成圖片使用 Supabase Storage。請在 Supabase 建立公開讀取的 bucket，預設名稱為 `storyboard-images`；可用 `SUPABASE_STORAGE_BUCKET` 指定其他公開 bucket。伺服器需設定 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`（或 `SUPABASE_SECRET_KEY`），金鑰僅供伺服器使用。瀏覽器使用伺服器簽發的上傳網址直接上傳圖片，資料庫僅保存圖片公開網址。既有的資料 URI 圖片仍可讀取。

