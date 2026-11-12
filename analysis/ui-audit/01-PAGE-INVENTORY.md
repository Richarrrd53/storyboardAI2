# 01｜頁面、路由與驗證範圍

稽核日期：2026-11-11～2026-11-12（Asia/Taipei）。基準：本地目前工作區，含既有未提交 Landing 變更；不是 GitHub HEAD 的遠端部署稽核。

## 範圍與證據分級

- **V**：實際瀏覽器目視、點擊或捲動；**M**：獨立 Mock 的正式前端；**S**：只讀原始碼；**U**：本輪未驗證。
- 正式入口是 `main.html → js/main.js → #ifm → html/index.html → spa-router → PageHost → AppShell`。不可把 `html/dashboard.html` 單獨打開的結果當完整產品。
- 主要頁面使用使用者授權測試帳號登入 localhost:3000；沒有保存密碼、沒有執行正式 DELETE／restore／PATCH。Generate 僅填本地草稿、略過 AI 討論到設定頁，沒有生成、儲存或付費分析。
- localhost:4317／127.0.0.1:4317 是 `mock-server.cjs`，沒有載入 server.js、dotenv、資料庫或代理。API 全部在記憶體終止；Mock 登入與刪除不代表正式驗證通過。
- 瀏覽器為桌面 Chromium IAB，viewport 尺寸是真正 CSS viewport；不是實體 iOS／Android。未宣稱 Safari、Firefox、觸控硬體、GPU 效能或螢幕閱讀器已通過。

## 正式入口與子狀態

|產品頁／route|實際來源與入口|驗證與證據|未涵蓋|
|---|---|---|---|
|Landing `/`|`public/html/index.html`；router landing；`landing.js`、`landing-animation.js`|V：六尺寸首屏；390 捲動到產品、流程、功能段落|完整影片播放、所有 pinned 進度、JS 關閉、reduced-motion 實際模擬|
|Login `/login`、`#/login`|PageHost 共用 `html/login.html`、AuthPage|V：1440 真實登入、375 Mock；伺服器連線錯誤狀態曾出現後恢復|忘記密碼完整流程、螢幕閱讀器|
|Register `/register`|相同 AuthPage，showRegister|M：1440／375，僅切換顯示、不提交|建立帳號、條款外部頁|
|Dashboard `/dashboard`|`html/dashboard.html`、`pages/dashboard.js`|V：1440／1920／390／375；QC、Avatar、Sidebar、Project menu|1024／768 真實 Dashboard 未拍攝；新帳戶 empty 僅 S|
|Projects `/projects`|`html/projects.html`、`pages/projects.js`|V：六尺寸；搜尋無結果；標籤 Morph；專案選單|非空標籤選擇組合、所有排序組合、分頁大量資料|
|Project `/project/:id`|`pages/project-detail.js` 組 DOM；`project-detail.js` controller|V：1440／390；表格→膠卷；鍵盤 Enter 編輯器；滑鼠差異|儲存、再生成、所有比例、失敗回滾、手機編輯器鍵盤|
|Generate `/generate`、`?templateId=`|`html/generate.html`、`generate.js`、creation features|V：第一步 1440／390、第二步 390 捲動；停止於開始生成前|Phase 3～5、生成 loading／error／completion、套模板參數|
|History `/history`|`html/history.html`、`pages/history.js`|V：1440／390，真實 deleted cards；M：刪除→回收桶→雙重確認皆取消|正式復原、永久刪除（未操作）、正式 Undo|
|Template `/template`、`/template/:id`|`html/template.html`、`pages/templates.js`、`template-timeline.js`|V：1440／390 列表；1440 detail、逐鏡展開、進階區展開；390 返回異常|建立模板 modal、儲存、進階時間軸全部手勢、搜尋 native 選單完整操作|
|Discovery `/discovery`（SPA 進入）|Shell link 被 SPA 導覽；PageHost 複製 `discovery.html` main 並隱藏其 nav|V：1440 初始／捲動／連線就緒|真實搜尋與付費分析結果、retry、加入模板|
|Discovery `/discovery`（server 直達）|server.js 顯式 sendFile `html/discovery.html`，不是 main.html|V：從 Settings 返回後在 iframe 內呈現 standalone；390|直接 top-level 1440 與 SPA 並排比較待補|
|Discovery Settings `/discovery/settings`|server.js 顯式 sendFile `html/discovery-settings.html`；Discovery status link 可進|V：1440／390；未揭露或填寫 Key，未儲存|設定變更、失敗／成功回應、跨瀏覽器|
|Analyze `/analyze`、`/analysis`|server 有 catch-all，但 pageDefs 沒有對應，parse 回 landing|S：route 不一致；M：`/html/analyze.html` 375 靜態目視|正式 UI 未找到通往舊 upload Analyze 的入口，不能稱為已整合正式頁|

路由證據：[public/js/spa-router.js:22](../../public/js/spa-router.js#L22)、[public/js/pages/page-host.js:58](../../public/js/pages/page-host.js#L58)、[server.js:1234](../../server.js#L1234)。`isDashboardPage` 包含 analysis 不代表該 route 有實作。

## 非正式／舊頁

|檔案|分類|本輪處置|
|---|---|---|
|`public/html/dev-test.html`、`css/dev-test.css`、`js/dev-test.js`|開發測試台|S；排除正式品質統計，後續可做元件展示台|
|`html/test-folder-card.html`|Folder demo|S；可作幾何回歸參考，不能替代 SPA 實測|
|`html/landing_demo.html`、`html/index_backup.html`|Demo／備份|S；不建議同步重構，先確認是否仍部署|
|`html/generate-template.html`、`js/generate-template.js`|舊模板工作流候選|S；未證明正式入口可達，不當成正式新頁|
|`html/analyze.html`|舊上傳分析頁|M 靜態目視，未上傳影片；是否保留待決策|
|`public/js/dashboard.js`|legacy 候選|S；正式 SPA 以 pages/* 與 shell 為準，不直接假定所有舊程式都會執行|

## 狀態覆蓋表

|狀態|結果|
|---|---|
|Sidebar collapsed／expanded|V 1440；expanded footer 仍只有頭像，無 account row|
|User Panel desktop／mobile|V 1440／390；手機 Escape 未關閉，點背景可關閉；未測拖曳速度閾值|
|Project option open／close|V desktop，Escape 測試；M mobile/delete；未做逐幀錄影|
|Tag filter|V 1440，只有「全部標籤」的真實帳號資料；非空標籤內容為 S|
|Search empty|V Projects；Template 真實空結果待驗證，S 可見有專用 empty/error|
|Sort／Native select|S 契約；可見未全面展開；不應改成統一 action menu|
|QC collapsed／expanded|V 375 展開、關閉；390 曾仍為 User Panel，不能把 `qc-390.jpg` 誤當 QC 展開|
|Loading／Error|登入 server error 曾目視；其他多數為 S；真實網路故障回滾 U|
|Hover／Active／Focus|V Folder hover、選單 active、Search focus、編輯器 focus；完整鍵盤走查 U|
|Mobile nav|V 375／390／768；底部 nav 外觀；實機 safe-area 與軟鍵盤 U|
|Header scroll／mask|V Discovery scroll、Template detail scroll、Generate settings scroll；量化 FPS U|
|Delete Confirm／cancel／animation|M 375 confirm/cancel，1440 confirm/動畫；沒有觸發正式刪除|
|Restore double confirm|M 1440 明確重現，2 個 `.sys-bg`，兩層取消，S 根因確認|
|Rename prompt|M，瀏覽器回報 type=prompt，dismiss；原生 prompt 開啟時 IAB 不提供截圖|
|Undo／rollback|S；本輪未完整實測，列入下一階段阻擋驗收項|

## 截圖索引

完整清單見 [SCREENSHOT-INDEX.md](SCREENSHOT-INDEX.md)。檔名中的寬度是拍攝 viewport，並不代表該頁所有互動均在此寬度驗證。截圖是 viewport capture，內部 scroll owner 的完整內容以多張捲動畫面取代假冒 full-page。
