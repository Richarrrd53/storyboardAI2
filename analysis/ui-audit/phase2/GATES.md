# Phase 2 驗收狀態

日期：2026-11-12～2026-11-13。**整體Gate：Pending Verification**。不因單元測試通過而放行Phase3。

|契約／要求|狀態|證據與實際界線|
|---|---|---|
|隔離服務／依賴／可重跑API|Passed（HTTP）|ui-audit-fixture.test：入口／health／JS-CSS載入／壞JSON／一次失敗後重試；固定4318。不是瀏覽器點擊驗收。|
|單次復原／非同步相容|Passed（Node）|原有deferred／cancel／重入／rollback與boolean/void bridge回歸。|
|中央彈窗動畫契約|Passed（Node）|scale0→1、400ms、指定enter／legacy exit、scrim不含opacity或background退出keyframe、reopen取消舊timer、Reduced分支。逐幀觀感待驗。|
|中央按鈕等寬／Pill|Pending Verification|共同class與flex規格已接線；Node不提供實際CSS幾何。375/390/1440待拍。|
|History一般點擊使用SPA|Passed（事件測試）／Pending（Browser）|先綁事件、一次navigate、preventDefault、修飾點擊例外；實際document load計數未執行。|
|History Nav隱藏／恢復|Passed（Node）|hidden/inert/aria-hidden與回Projects解除；indicator在真實layout的結果待驗。|
|Floating recipe唯一owner|Passed（來源）|blur/shadow重複移除，alias graph／必需引用測試；computed style視覺待驗。|
|Button／Input owner與Focus|Passed（來源／數值）／Pending（UI）|36/44/52與44 touch、focus/error宣告色值對比；其他頁面高specificity消費者需實際走查。|
|Layer語意順序|Passed（Token數值）／Pending（UI）|Nav→Menu→Account→QC→Sheet→Modal排序；root/local stacking context、route CSS重入需要Browser。|
|Overlay lease|Passed（Node）|inert、scroll保存、重疊lease最後owner釋放、focus、abort；Source portal與listener卸載回歸。|
|Opaque／corner fallback|Pending Verification|CSS supports與可重跑QA入口已有；無After截圖或目標browser紀錄。|
|品牌signature保存|Passed（來源保護）／Pending（視覺）|Folder/Morph/Hero/Router/Undo/Landing無修改；Cover只layer值，沒有曲線／origin／幾何改動。|
|Before／After與動畫錄製|Pending Verification|Before用Phase1歷史圖；本輪Browser tool停用，無新After／影片／FPS。|
|跨頁CSS、Safari/Firefox、實機、讀屏|Pending Verification|未實測，不填虛構合格結果。|

## 本輪自動檢查

- 完整實際命令與計數見 [TESTING.md](TESTING.md)，原始結果為 [test-results.txt](test-results.txt)：178 passed、0 failed、0 skipped。
- [css-validation.json](css-validation.json) 使用原已安裝PostCSS解析所有變更樣式表；只代表語法可解析。
- [source-verification.json](source-verification.json) 記錄變更與保護範圍；沒有資料庫或正式使用者mutation。
- Browser runner／responsive iframe容器已提供，但**本輪沒有執行結果**。若使用者後續自行執行，結果會存為browser-results.json，不應與本輪證據混淆。

## 放行仍需補做

1440/390/375對照截圖、主要Dialog開關／中斷、Panel→History及Back、QC/Menu/Sheet/Dialog重疊、A→B→A、無backdrop／continuous-corner fallback、長名／錯誤／busy／鍵盤focus。完成後另記測試環境與實際結果，不能只將本表Pending改文字Passed。
