# StoryboardAI2：P0 + P1 交接

更新：2026-10-13（Asia/Taipei）。工作區：`D:/My Files/web/StoryboardAI2`。

## 使用者要求與目前停止點

- 本輪只授權 P0 + P1；不要自行展開 P2～P5。
- 使用者追加要求：**必須實際觀看截圖、判斷視覺品質，不能只檢查 CSS 或 overflow。**
- 使用者追加要求：**五小時額度剩餘 10% 或以下時暫停實作，保存交接紀錄。** 下一個 Agent 開始及重要檢查點使用 `get_usage_limits` 查詢 `windowDurationMins: 300` 的視窗；`usedPercent >= 90` 即達門檻。不要重設或購買額度。
- 最後查詢：五小時已使用 77%，剩餘 23%；尚未觸發門檻。本輪在 P0/P1 可驗證完成點結束。
- 不建立新框架、不增加依賴、不部署、不建立 PR、不提交 Git。保持原生 HTML/CSS/JS 與現有 API、專案資料、生成流程、動畫。
- 原始工作區已存在 `public/html/discovery.html`、`public/js/discovery.js`、`public/js/spa-router.js` 的修改，以及 `tests/discovery-page.test.js`。這些既有 Discovery 修改已保留，不能還原或誤認為本輪新增。

## Completed

1. 精準檢查 Design Tokens v3、Shell、模板頁責任、Router、正式 iframe 入口与既有測試；沒有掃描整個 Repo 或大量 analysis 媒體。
2. Marketplace 瀏覽：頁面標題與建立入口、搜尋、真實資料的內容方向推薦、分類按鈕及數量、資料標籤篩選、名稱／時長排序、結果數量與清除篩選。
3. 封面優先的卡片：名稱、描述、分類、標籤、資料實際提供的規格、預覽／套用操作。移除寫死精選、虛構驗證狀態、推算節奏及預設媒體規格；文字逃逸、圖片錯誤回復；空、錯誤、無符合結果與 Skeleton 各有狀態。
4. `/template`、`/template/:id`、深連結、刷新、Back/Forward、無效 ID 回復；切換 ID 不重新下載清單，保存搜尋／分類／標籤／排序／捲動。
5. 正式入口的單一 History 管理：iframe 模式使用 **parent.history**；直接 SPA 模式使用自己的 History。頁面渲染與 lifecycle 仍由既有 Router 管理。保留舊 Hash 路由與 `/project/:id`，Generate 的 templateId 也保存於 History。
6. 詳情先呈現名稱、規格與既有影片編輯工作區，完整結構分析保留在工作區之後；保留影片定位、鏡頭清單、提示詞、變數、時間軸、軌道篩選、縮放、分鏡表、CSV 匯出與套用。
7. 修正模板第二層 Shell：`cloneMainContent` 會複製 main 的 Shell classes，因此 `renderTemplate` 必須在 clone **之後** 設定 `m.className = 'spa-template-wrap'`。
8. 詳情腳本必須在 TemplatesPage.mount **之前** 載入，否則首次深連結會因 renderer 尚不存在而誤顯示 Not Found。
9. 播放器／Timeline／TemplateEditor 清理、YouTube 延遲回呼 revision guard、HTML5 事件釋放、軌道與縮放重置；建立模板表單初始化去重，成功建立後清除清單 cache。
10. 鍵盤、語意標籤、原生預覽連結、Focus、播放進度 Slider 方向鍵、較大操作區域；解除入口 zoom 限制。模板 Loader CSS 的全域 dark color-scheme 與 universal selector 限定到 `.loader`，沒有重寫 Loader engine。

## Changed Files

以下路徑皆相對於 `D:/My Files/web/StoryboardAI2/`：

- `public/css/template.css`：取代舊 Marketplace 外觀，來源樣式使用 Tokens；保留且限定 Generate 既有模板選擇器相容樣式。
- `public/css/template-detail.css`：重寫詳情外層樣式，淺色分析 Canvas、既有深色編輯區、單一詳情捲動、不透明 Sticky 工具列。
- `public/css/template-editor.css`：既有編輯器的部分字級、间距、圓角、按鈕與播放進度操作區域調整。
- `public/css/math-curve-loader.css`：僅修正兩個全域 selector 的污染。
- `public/html/template.html`：Marketplace 結構、Recovery、詳情資訊順序、語意與 ARIA。
- `public/js/pages/templates.js`：清單渲染、筛選、排序、狀態、快取、History snapshot、updateRoute 與 Lifecycle。
- `public/js/template-timeline.js`：路由入口委派、播放器 cleanup／revision guard、Slider 鍵盤操作與 ARIA；保留原 Timeline Engine。
- `public/js/template.js`：表單事件去重與釋放、建立後 cache invalidation。
- `public/js/spa-router.js`：模板參數、History host、同頁 updateRoute、popstate、首載資源順序、模板 clone 修正；原有 Discovery 改動仍在。
- `public/js/main.js`：正式 iframe 初始 navigation 使用 replace，支援外層舊 Hash 深連結。
- `public/main.html`、`public/html/index.html`：解除 viewport 的縮放禁止。
- `server.js`：開發入口增加 `/template/:id`；其餘 API 不改。
- `tests/templates-page.test.js`：更新新的路由／清理契約，新增篩選、深連結、cache、錯誤與安全文字案例。
- `tests/template-routes.test.js`：新增解析、序列化、舊 Hash、project 相容與入口規則測試。
- `tests/templates-browser.js`：既有編輯器回歸增加三尺寸與 Slider 鍵盤測試。
- `tests/template-history-browser.js`：新增真正 `main.html` + iframe 的路由與狀態回歸。
- `vercel.json` **未修改**：既有 `/(.*) -> /main.html` 已涵蓋新深連結，測試確認此契約。
- `AGENT-HANDOFF-P0-P1.md`：本交接檔。

## 修改規範與參考

- 優先沿用 `public/css/tokens.css`、`public/css/tokens/{spacing,typography,radius,colors,shadow,border,layers,components,layout,sizing}.css`。
- 間距使用既有 4px scale：`--space-1/2/3/4/5/6/8/10/12/16/20/24`；字體保留品牌字型與既有語意 Typography；按鈕 Pill，卡片 `--radius-md`，內層不大於外層。
- 新 Marketplace styles 限定在模板容器；不要堆疊 Global Overrides。詳情少數 `!important` 用於釋放既有 Shell 強制高度、overflow 與 padding，已有來源註解。
- Layout 的非標準數字若是封面比例、編輯器面板尺寸或 Timeline 精準定位，可以保留；不要機械式四捨五入 Token。
- 附件 `C:/Users/orgal/Downloads/web-design-guidelines.md`、`C:/Users/orgal/Downloads/frontend-design.md` 已讀；它們是設計參考，**使用者保留品牌與現有 Tokens 的要求優先**，不要換字體或另建 Token System。
- 官方規範：[Vercel](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)、[WCAG 2.2](https://www.w3.org/WAI/WCAG22/quickref/)、[Material Spacing](https://m2.material.io/design/layout/spacing-methods.html)、[Baymard Filters](https://baymard.com/research-articles/how-to-design-applied-filters)。
- Router 管理 History／資源，Pages 管理 DOM／Lifecycle，Features 管理業務與 API，Components 管理共用 UI。不要把清單篩選或卡片渲染塞回 Router。

## Tests 與截圖

- 完整 `node --test tests/*.test.js`：**208/208 通過**。結果：`D:/My Files/web/StoryboardAI2/.codex-backup/ui-validation/unit-tests.tap`。
- 最後修改後的模板頁／路由測試：**19/19 通過**。`git diff --check` 通過。
- 兩支 Chrome regression 在 1440、1024、390px 通過。最末小範圍調整另外重跑 390px 兩支與 1440px History。
- 用現有 bundled Playwright 與本機 Chrome，沒有安裝 dependency。指令（PowerShell）：

```powershell
$env:STORYBOARD_PLAYWRIGHT_PATH = 'C:\Users\orgal\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/template-history-browser.js
node tests/templates-browser.js
```

- 可用 `$env:STORYBOARD_QA_WIDTH = '390'` 或 `'1440'` 限定尺寸；沒有指定時檢查三尺寸。
- 截圖在 `D:/My Files/web/StoryboardAI2/.codex-backup/ui-validation/`：`marketplace-{1440,1024,390}.png`、`marketplace-detail-{1440,1024,390}.png`、`editor-*.png`、`storyboard-*.png`、`sparse-*.png`。
- 已實際逐張觀看桌面／平板／手機截圖，據此修正第二層 Shell、工具列透出文字、影片被分析面板推下首屏、平板推薦佔據兩大列、手機建立入口佔單獨一列等問題。
- **驗證限制**：API、封面及 YouTube SDK 使用本機 fixtures／替身；真正 YouTube 連線、遠端字體下載、正式登入與資料庫端到端未驗證。黑色監看器為測試 SDK 替身，不是已確認的正式播放器故障。不宣稱完整 WCAG AA 或全站 Visual QA 已完成。

## Remaining Issues / Next Phase

- 本輪 P0/P1 無已知阻擋功能的未完成項。不要將 P2/P3/P4/P5 打勾。
- P2：Projects Tags 真正儲存、編輯與 OR 篩選。先看 `public/html/projects.html`、`public/js/pages/projects.js`、`public/js/features/projects.js`、`public/js/components/project-card.js`、ProjectStore 與既有 metadata/API 權限；可安全沿用 metadata 時不要增加 Schema。確保 Dashboard 共用 Card 不回歸。
- P3：Generate 異常容器與四階段 UI、現有 Math Curve／粒子與 Lifecycle。重點 `public/html/generate.html`、`public/css/generate.css`、`public/js/generate.js`、`public/js/features/creation.js`、`public/js/features/generation-task.js`、`public/js/math-curve-loader.js`。特別檢查 clone 後帶入 Shell classes 的相同問題；先確認 DOM 根因。
- P4：其餘正式頁面與全域 Tokens／Legacy CSS。已發現 `tokens/colors.css` 的 `--color-bg-canvas -> --canvas` 與 `tokens.css` 的 `--canvas -> --color-bg-canvas` 存在循環 alias；本輪新詳情採有效的 `--color-bg-page`。`generate.css` 自有 `--gen-*`、Shell 與 style.css 的重複定義仍待後續來源修正。
- P4 也檢查共用浮動「新增分鏡」與底部 Navigation 的遮擋／Contrast、Legacy Editor 的其餘 magic values／metadata；本輪不能宣稱全站所有元件已正規化。
- P5：最後整合回歸與剩餘清單。只在重要整合點重跑完整測試；平時跑受影響模組。每輪最多一個實作階段，不反覆掃 Repo。

最終回覆延續使用者指定的五項格式：完成項目、修改檔案、測試結果、已知問題、下一階段。
