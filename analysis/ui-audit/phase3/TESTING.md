# Phase 3 測試與待驗證

2026-11-13；測試分為 Node／來源驗證與實際瀏覽器檢查，不能互相替代。

## 自動化

最終完整指令（PowerShell）：

```powershell
$testFiles = (Get-ChildItem tests -Filter '*.test.js').FullName
node --test @testFiles
node analysis/ui-audit/phase3/verify.cjs
git diff --check
```

完整 suite：417 通過、0 失敗，見 [test-results.txt](test-results.txt)。Targeted shell／morph suite：46 通過、0 失敗，見 [target-tests-final.txt](target-tests-final.txt)。新增覆蓋：中途反向重開共用節點／frame、離頁取消待執行 action、內部捲動與祖先捲動區分、Reduced Motion 即時結束、Account Row 真實資料與 DOM 保留、Sheet modal／Escape／abort、跨模式關閉與重開、trigger ResizeObserver 避免誤關閉標籤選單。

來源檢查：6 個 JS 語法通過、21 個變更／新增 CSS 以既有 PostCSS 解析通過、10 個保護檔案雜湊一致、diff whitespace 檢查通過；見 [source-verification.json](source-verification.json)。CSS 解析不代表跨瀏覽器排版或效能通過。

`npm test` 曾因本機 npm 指向不存在的 `npm-cli.js` 而無法啟動；改用既有 node 直接跑同一 tests glob，沒有安裝或修復全域工具。早期探索失敗記錄保留在 target-tests／full-tests 等檔案，最終結果以本節列出的檔案為準。

## 瀏覽器實測

使用內建瀏覽器，服務為 localhost:4318 記憶體 mock；不是正式帳號或真實資料庫。操作正式 SPA 的實際 UI，非僅掃描 HTML／CSS。

|項目|結果／證據|
|---|---|
|1440 Dashboard Account Row 收合／展開|36px 頭像；X 坐標兩狀態一致；原生按鈕 hit≥52px；`sidebar-expanded-1440.png`|
|1440 桌面 User Panel|實際點擊開啟；帳戶／disabled 操作／回收桶／登出分組；`desktop-account-1440.png`（最終圖為 Projects context）|
|Desktop Escape|關閉後焦點實際回到帳戶 trigger；Project Option 也可關閉|
|Desktop 登出|進入既有中央 Confirm，點取消；未真正登出正式帳號|
|390 Sheet → History|點回收桶後外層 route 為 /history、內層 iframe URL 保留原 dashboard document；nav hidden=true、aria-hidden=true、sheet 節點數0；`mobile-history-390.png`|
|Project Option|實際展開、ArrowDown 從重新命名移到編輯標籤、Escape 關閉；沒有點刪除；`project-menu-1440.png`|
|Tag Filter|點品牌後 aria-checked=true、焦點留在品牌、menu 保持展開；`tag-multiselect-1440.png`|
|Sort|選擇專案名稱後 radio 狀態更新，選單仍在；Escape 可關閉|
|375／390／768|Sheet 局部排版；375 實測 width=375、scrollWidth 未超出 clientWidth；`mobile-account-375.png`／`mobile-account-390.png`／`account-768.png`|
|1024／1440／1920|桌面入口與 anchored panel 可開啟；1920 實測面板320×397、頁面只有一個 account DOM；`account-1024.png`／`desktop-account-1440.png`／`account-1920.png`|
|手機同模式 resize|實測 AX 只呈現 modal 內容，背景 Nav 不重新進入可操作樹|
|最終跨模式規則|1440 開啟面板→390 關閉並回焦 mobile trigger→點擊可開 Sheet→1024 關閉並回焦 desktop trigger→點擊可開桌面面板|

上述六種寬度只代表本輪帳戶元件的局部檢查，不代表全站各 route／全部互動狀態在六尺寸皆已驗收。截圖沒有 before 視覺基線，本輪開始時僅保存來源副本。

## 待驗證（不計為通過）

- iOS Safari／Android 真機的 pointer capture、拖曳速度、pointercancel、虛擬鍵盤、safe-area 與橡皮筋捲動。
- Safari／Firefox 的 backdrop-filter、mask 合成、visualViewport 連續 resize 與長時間開關壓力測試。
- 系統層 Reduced Motion 切換的實際畫面；目前僅有 Node lifecycle 測試。
- 螢幕閱讀器、觸控輔助工具的完整宣告；瀏覽器 AX／鍵盤局部檢查不能代替 AT 驗收。
- 真實帳號的慢速登入回應、頭像載入失敗、極長中英姓名／email、方案缺失或切換的完整視覺矩陣。
- 真機 FPS、paint／layout trace、GPU／電池成本、低階手機多層 Acrylic 同頁壓力；未宣稱效能改善數值。
- 登出的正式 Auth integration、正式專案 CRUD／刪除／Undo；本輪未操作，原行為由既有測試回歸保護。
- Folder、Hero、Header progressive blur 及其他頁面的全站視覺回歸不屬本輪完成範圍；不以本次局部元件檢查取代後續階段驗收。

目前未進入下一階段。
