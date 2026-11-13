# Phase 5｜Discovery／設定頁統一 SPA 外殼

2026-11-13，Asia/Taipei。使用者已選擇「統一現有 SPA 外殼」，並指示繼續。本子批次程式與自動測試完成；**瀏覽器視覺／真實操作仍待驗證，Phase 5 尚未整體結案。** 沒有 Commit／Push，沒有進入 Phase 6。

## 這次完成的行為

- `/discovery` 與 `/discovery/settings` 在 Express 與 Vercel 都進入 `main.html`，沿用原有 iframe／Vanilla JS SPA bootstrap、Sidebar、Account／User Panel 與 QC。原始 `/html/*.html` 留作 PageHost 的內容資產，不是另一個正式產品入口。
- 新增 `discovery-settings` 頁面註冊及 `/discovery/settings`／`#/discovery/settings` 路徑對應，沒有重寫 Router。測試對照 `navigate()` 主流程與原始快照相同；登入後返回允許到達此設定頁。
- Discovery、設定頁返回、模板庫與工作台的內部連結由 PageHost 的單一 delegate 處理。修飾鍵、新分頁及下載連結保留原生操作；離頁解除 listener，避免重複導頁。
- 移除原本 Discovery 專用的 S 漸層識別與獨立 nav；正式入口由現有 App Shell 提供品牌與導覽。設定頁的 Sidebar active 屬於 Discovery；手機設定頁隱藏 Bottom Nav，保留明確返回入口。
- Discovery CSS 的自訂別名及 `.tag`、`.empty-state`、欄位等選擇器限制在 `.discovery-page-content`，移除其全域 body／html 裝飾與字型重設。spinner 名稱也改為局部命名，避免跨頁污染。
- 設定頁改用既有語意 Token、Solid／Raised 閱讀面、中性 inset 說明區、大圓角及 squircle fallback；不再依賴未定義的 `--blue`／`--lime`。按鈕最小44px、輸入48px、focus-within／focus-visible 有共用規則。既有浮層 acrylic、Morph 與品牌動畫保留。

## 設定頁生命週期

`initDiscoverySettingsPage({root, signal})` 回傳 idempotent owner；由 PageHost 掛載／卸載。

- Read：讀取中停用欄位與儲存；失敗顯示重新讀取，成功再恢復控制。
- Save：一次只有一個 submit；維持原有 POST 後 GET 驗證保存時點的契約；失敗保留可重試輸入，成功清空欄位並聚焦返回搜尋。
- 顯示／隱藏：按鈕 label／pressed 與 input type 同步，預設遮罩；讀取 API 狀態不會回填已儲存金鑰。
- Leave：AbortController 中止 pending request，移除 listeners，清除尚未送出內容並恢復 password；晚到的 read／save 不更新舊頁，也不再發出下一個驗證請求。
- API 金鑰的加密、Cookie、90天保存、原有 YouTube／Gemini 連線驗證沒有變更。自動測試對照 server.js 的整段既有 API 實作與 before 相同。

## 修改位置

|類別|檔案|
|---|---|
|正式入口|`server.js`、`vercel.json`|
|頁面接線|`public/js/spa-router.js`、`pages/page-host.js`、`features/page-asset-loader.js`、`pages/auth-page.js`|
|Shell family|`public/js/shell/app-shell.js`|
|Discovery|`public/html/discovery.html`、`public/js/discovery.js`、`public/css/discovery.css`|
|Settings|`public/html/discovery-settings.html`、`public/js/discovery-settings.js`、`public/css/discovery-settings.css`|

保留上一輪 dirty 修改。此子批次沒有再改 Folder、Hero、Morph Engine、Dialog、Trash 或 Undo，也沒有接上或改造舊 Analyze 頁。

## 實際測試結果

- [完整 Node 回歸](test-results.txt)：**448／448**，失敗／取消／跳過均0。
- [針對性 route／PageHost／settings 測試](targeted-tests.txt)：28／28。
- [最終 CSS scope／生命週期檢查](final-css-and-lifecycle-tests.txt)：6／6。包含 scoped selectors、防止重複 mount、失敗重試、單一 submit、保存時點不一致、read／save 中途 abort、晚到結果、輸入清除與焦點。
- [來源驗證](source-verification.json)：產品 JS／server 語法、CSS parser、Vercel JSON／API rewrite、git diff whitespace；核心 Router navigate 對照、Feature／Undo 與 Toast 保護。
- [隔離 HTTP 檢查](http-results.json)：兩個正式路徑200並回傳bootstrap；設定頁資產可取得；read／POST／readback、503 read／save、狀態不回傳測試金鑰及 harness script 語法通過。
- Express 的實際 route／金鑰 Cookie 與驗證行為，由既有 `discovery-settings-routes.test.js` 在隔離 provider／DB mock 中回歸。沒有使用正式帳戶、真實金鑰或呼叫真實供應商。

`448／448` 是自動化結果，不代表下表已取得瀏覽器證據。

## 待驗證矩陣

本輪瀏覽器工具回報本機存取不可用。已保留 [before來源快照](before/) 與 [雜湊](baseline.json)，**沒有本輪 Before／After 截圖，不用舊稽核圖片冒充新驗證。**

|範圍|自動化|實際瀏覽器|
|---|---|---|
|Express／Vercel 直達、hash route|Passed|Pending|
|內部連結、Ctrl／新分頁、單一 owner|Passed（單元）|Pending|
|SPA settings→Discovery／back／forward、不重新載入文件|Passed（Router／delegate單元）|Pending（尚無載入次數與DOM實測）|
|讀取／儲存／重試／錯誤／重入／abort|Passed（生命週期及HTTP）|Pending|
|375／390／768／1024／1440／1920 排版|CSS結構及parse通過|Pending，沒有量測或截圖|
|Sidebar active／手機nav hidden、focus／Tab、44px hit area|狀態及規則測試|Pending（視覺與手勢）|
|Squircle／不支援時fallback、200%文字|規則已提供|Pending|
|真實iOS／Android／Safari／Firefox、讀屏|未執行|Pending|

真正供應商連線與正式金鑰沒有實測；搜尋結果卡片／逐支分析／加入模板未於本輪瀏覽器重新驗證。這不是全站效能／材質簽核。

## 隔離驗證台

<http://127.0.0.1:4323/discovery-harness?width=390>；可換375、768、1024、1440、1920。

```powershell
$env:AUDIT_UI_PORT='4323'
node analysis/ui-audit/phase1/mock-server.cjs
```

1. 「開啟隔離 Discovery」／「設定頁直達」：測正式路徑與bootstrap。
2. 「SPA 返回與狀態檢查」：自動以 fixture-only 輸入進行設定、返回、空結果搜尋、history back／forward；輸出 reload／document identity／溢出等記錄。
3. 「讀取失敗／重試／離頁中斷」：測503、重試、保留失敗輸入、離頁清除與晚到結果。
4. 「截圖模式」移除QA工具列；reload可恢復。

服務與HTTP端點已檢查；上述**瀏覽器按鈕流程尚未實際執行**。待工具恢復後要先跑此矩陣，不能僅看程式碼宣稱正常。API全由memory-only mock終止，沒有production proxy／database。驗證台不需要真正的金鑰，請使用 fixture-only 資料。
