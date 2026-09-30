# StoryboardAI UI Baseline & Audit Report

> **Date:** 2026-09-30  
> **Status:** Baselined for v1.0 Normalization  
> **Standard Resolutions Monitored:**  
> - Desktop: `1440 × 900`, `1920 × 1080`  
> - Tablet: `768 × 1024`, `1024 × 768`  
> - Mobile: `375 × 812`, `390 × 844`, `430 × 932`

---

## 1. 頁面清查與基準記錄 (Screen Baseline Matrix)

| 頁面 / 狀態 | 檔案位置 | 核心職責 | 目前觀察到的偏離 / 問題 |
|---|---|---|---|
| **Landing** | `public/html/index.html` | 品牌視覺傳達、產品亮點、註冊/登入引流 | 與主應用 Dashboard 色彩有落差，按鈕樣式多處未 token 化 |
| **Login / Register** | `public/html/login.html` | 使用者認證 minimal flow | 輸入框與主應用微有差異，獨立 CSS 偏離品牌規範 |
| **Dashboard** | `public/html/dashboard.html` | **Golden Reference 1**：全站空氣感、Greeting、近期專案、QC | Greeting 與 Sidebar Logo baseline 微差；卡片與 Projects 未統一 |
| **Dashboard + QC Expanded** | `public/html/dashboard.html` | **Golden Reference 2**：Matte Acrylic、招牌彩光、形變浮動面板 | 核心互動完好，需防止其他頁面誤用 QC 彩光 (glow leakage) |
| **Projects (我的分鏡)** | `public/html/projects.html` | 分鏡庫列表、管理、排序、新增分鏡 | 新增按鈕誤用 QC 彩色 glow (`.btn-glow-container`)；卡片與 Dashboard 不一致 |
| **Recycle Bin (資源回收桶)** | `public/html/history.html` | 已刪除項目暫存、復原與永久刪除 | 與 Projects 結構雷同，卡片與動作應共享 Component 家族 |
| **Generate Step 1 (想法輸入)** | `public/html/generate.html` | 創作主體/核心想法輸入 | 容器過寬，Scroll 容器不唯一，與 Dashboard 缺乏視覺連續性 |
| **Generate Step 2 (創作方向)** | `public/html/generate.html` | 方向/節奏選擇 | 手機端 Stepper 4 個字硬塞導致擠壓折字；中心軸未校準 |
| **Generate Step 3 (模板選擇)** | `public/html/generate.html` | 推薦模板預覽 | 模板卡片與外層風格不搭，缺乏統一卡片家族邊界 |
| **Generate Step 4 (生成確認)** | `public/html/generate.html` | 最終參數確認與產出等待 | 狀態回饋與主應用 Token 稍微脫節 |
| **Project Detail** | `public/html/project-detail.html` | 專案分鏡檢視 (Story View / Pro View) | 手機端 Story View 依賴 `min-width: 680px` 表格導致水平破版，需重構為 Shot Card |
| **Template Library Top** | `public/html/template.html` | 模板庫首頁、編輯推薦、分類切換 | 過去使用獨立紫色 System UI (`--purple-accent`)，與品牌藍衝突；手機版分類卡過大 |
| **Template Library Results** | `public/html/template.html` | 搜尋與篩選結果 | 375px 手機搜尋欄與「+建立序列」擠在一起造成折字換行錯位 |
| **Template Detail** | `public/html/template.html` (動態渲染) | 模板詳細腳本、鏡頭分析與套用 | 過去偏向暗色編輯器，應維持 StoryboardAI Light Base + 內容暗色 |
| **Account Popover** | `public/js/spa-router.js` (DOM) | 桌面端帳號浮動資訊面板 | 浮動材質未統一套用 Matte Acrylic 與 Elevation 3 |
| **Account Bottom Sheet** | `public/js/spa-router.js` (DOM) | 手機端帳號抽屜面板 | 需遵循 Safe Area，頂部半徑 24~32px |
| **Logout Confirmation** | `public/js/spa-router.js` (DOM) | 登出確認對話框 | 需統一套用 Dialog Component 與 Danger 按鈕規範 |

---

## 2. 核心規範與對齊基準錨點 (Alignment Anchors Baseline)

1. **Logo 與 Header Baseline:**
   - Sidebar 展開時的 `StoryboardAI` 文字基線，必須與 Dashboard 的「早安/午安/晚上好，今天想繼續哪個創作？」形成光學水平呼應。
2. **Page Content Left / Right Edge:**
   - Desktop Gutter: `32px`
   - Tablet Gutter: `24px`
   - Mobile Gutter: `16px`
   - Dashboard、Projects、Template、Generate、Project Detail 必須依附同一 Content Grid，不可各差 8~20px。
3. **Scroll Ownership:**
   - 每個 Route 僅限單一 Vertical Scroll Owner（`PageScroll`）。禁止多層容器重複宣告 `overflow-y: auto`。
4. **Mobile Bottom Nav:**
   - 位於水平置中，中央 Create 按鈕精確位於螢幕 `Center X`。
   - 底部內容必須具備 `calc(var(--mobile-nav-height) + env(safe-area-inset-bottom) + 32px)` 安全留白。

---

## 3. 測試與驗證基準設備視口

- **Mobile Small (375 × 812):** iPhone SE / Mini 等窄螢幕，嚴格禁止水平 Overflow，搜尋與按鈕禁止擠壓折字。
- **Mobile Large (390 × 844, 430 × 932):** 主流 iPhone 規格，檢驗 Floating Nav 置中與安全邊距。
- **Tablet (768 × 1024):** 導航閾值切換點，檢查側邊欄收合與 Gutter 24px。
- **Desktop (1440 × 900):** 標準桌面端，最大寬度 `1440px`，檢驗左右邊緣對齊。
- **Wide Desktop (1920 × 1080):** 廣角桌面端，Content 置中，不得過度拉伸變形。
