# Phase 7｜全站 QA 執行結果

2026-11-14，Asia/Taipei。**可執行的自動回歸與來源／HTTP稽核已完成；全站Visual／Responsive驗收尚未完成，不能宣稱Phase7全部gate通過。** 本輪首次CUA開啟本地頁面即回覆「Local browser access is unavailable for this chat」。沒有改用headless／CLI瀏覽器或原生app繞過，也沒有新截圖。

保留Phase1–6既有修改與品牌動畫，不改Undo，不Commit／Push。產品修補只有兩份CSS的placeholder對比；沒有調整Router、Folder、Hero、Morph、Dialog曲線或資料流程。

## 結果摘要

| 項目 | 結果 | 證據／限制 |
|---|---|---|
| 全套回歸 | **471／471**，fail／cancel／skip均0 | test-results.txt；本輪由464增加7案例；涵蓋單元／VM／mock，不能替代UI實測 |
| 新增針對性回歸＋基礎對比 | 28／28 | targeted-tests.txt；包含原有相關測試及7個新增案例 |
| JS／CSS來源 | 58個public JS編譯、50個CSS解析通過 | source-verification.json；沒有執行產品JS或量測渲染 |
| 正式工作區路由 | 11個隔離HTTP200且回傳SPA外殼 | http-audit.json；不是production部署驗收 |
| 資產依賴 | 129個本地HTML／CSS／JS／圖片／字型等依賴無404 | 只涵蓋正式HTML／Router靜態依賴圖；動態API／遠端CDN不在此數字 |
| 來源保護 | 128檔基線中126檔逐位元不變，2檔為核准範圍的QA修補 | source-verification.json；含Undo／Router／品牌動畫owner的保護 |
| 頁面清單 | 12類頁面／子頁，六寬度；72首屏、504狀態組合已列清單 | **本輪瀏覽器已執行0**；不是504項Passed |
| 28項稽核問題 | 26 Pending-Acceptance、1 Open-Protected、1 Excluded-Scope | 0項在本輪提升為完整Closed；詳見 ISSUE-CLOSURE-MATRIX.md |

## QA-01｜Placeholder對比修補（回對Phase2 C02）

- 現況來源：`public/css/auth.css` 的 `.input-field::placeholder` 經 `--text-light` 指向 `--color-text-muted`；共用 `components/input.css` 的form/input/search placeholder亦使用muted。解析值 `#94a3b8` 對白色實體輸入面約 **2.56:1**。
- 修改：只將這兩個placeholder規則改用既有 `--color-text-secondary`（`#475569`），固定`opacity:1`以避免原生placeholder額外淡化。指定白底的色彩計算約 **7.58:1**，達到本專案4.5:1文字設計目標。
- 不修改全域muted token，避免把disabled／低權重indicator一起加深；不更換品牌色或字體。
- 驗證：design-foundations新增實際CSS token解析與對比測試，完整suite通過；兩份修改前來源保存在before/，SHA與本輪起始baseline相符。
- **未完成**：真實placeholder computed style、透明合成、Safari／Firefox、disabled／autofill與200%文字的視覺回歸。這是指定色彩的計算證據，不能寫成WCAG全站合規或原生瀏覽器對比實測通過。

這項修補改善UI-10的一部分，不代表已關閉其focus／背景合成條件。

## 本輪實際補驗的回歸

- 同頁Undo於4999ms仍可取消，之後不送DELETE；預設5000ms才送出一次。使用VM中的fake clock與假的ProjectsApi，**沒有執行真實刪除或改動Undo實作**。
- reduced-motion的ModalAnimation.close仍完成一次callback，scrim alpha保持；關閉中重新開啟不會被前一個completion隱藏。
- Alert／Confirm／Prompt透過共用ModalAnimation與fallback兩條既有owner，在reduced模式都能完成一次並清理dialog。
- 多個Loading SVG中，一個離屏不會停掉另一個；全部離屏才停；Abort後晚到IntersectionObserver callback不能重啟RAF，粒子與訂閱釋放。
- 其餘既有Restore單次確認、Rename retry／IME、Overlay focus／inert、Morph中斷、Folder／Trash geometry、filmstrip threshold、Template返回／原文、Discovery settings生命週期、Auth labels／inactive inert等重跑完整測試。

這些是功能／所有權證據；不把fake clock的60／120Hz、DOM shape或JS callback稱作實機動畫與讀屏驗收。

## UI-23／D05仍未關閉

`public/js/spa-router.js:316` 仍會在離頁時呼叫 `ProjectDeleteQueue.flushAll()`；`public/js/features/projects.js:325` 的既有行為會提前提交。Queue commit失敗仍主要console記錄，完整可視回滾／重試並未完成原D05計畫。

使用者本次明確要求「不改Undo」，因此本輪保持上述檔案hash不變。不能用「同頁4999ms測試通過」宣稱「t=2s換頁仍保留約3s」通過。UI-23維持Open-Protected；登出／reload／session-end政策也沒有擅自重定義。

## Phase 6 待驗項目補驗狀態

| Phase6未決項 | 本輪完成 | 仍Pending |
|---|---|---|
| Dialog縮小連續性 | target scale／退出curve、reduced完成callback、re-entry stale completion回歸 | 新瀏覽器中間幀、完整400ms曲線／scrim連續性；舊integration false保留 |
| QC光暈恢復 | 來源hash核對；Phase6 inert→paused JSON作歷史證據 | paused→running、快速切換與正常視覺重拍 |
| Live reduced偏好 | 多SVG／abort／reduced的VM測試加強；既有動態回呼測試重跑 | 系統pref變更、原生reduced-transparency與Safari／Firefox |
| 原生不支援CSS | fallback來源與資產完整性檢查 | 真實backdrop／mask／color-mix不支援組合；不能用opaque按鈕代替 |
| 真機效能 | 沒有新增可支持性能結論的量測 | iOS／Android低階機、GPU／paint／composite、60／120Hz與長任務 |
| Landing／影片 | 原GSAP／Landing來源hash不變；Phase6 pin2→0紀錄仍可追 | mobile開場／workflow、影片播放與離屏／背景返回 |

## 頁面／問題／截圖索引

- [頁面與狀態清單](PAGE-AND-STATE-MATRIX.md)、[機器可讀504狀態清單](page-state-matrix.json)。六width是375／390／768／1024／1440／1920；不是實體裝置。
- [28項驗收矩陣](ISSUE-CLOSURE-MATRIX.md)、[逐項原始條件與狀態](issue-status.json)。未以單一綠測試關閉整頁。
- [截圖索引與歷史證據限制](SCREENSHOT-INDEX.md)。本輪沒有新的Before／After；沒有另存舊圖片為Phase7 After。
- dev／demo／backup／舊Generate Template／Analyze分開列為非正式範圍。舊Analyze維持既有狀態，沒有私接SPA或上傳影片。

Hallmark／Unslop沿用Phase0品牌契約：本輪目視的是Phase6 Projects1440與Phase5 Register390的**歷史圖片**，用來核對原稽核脈絡與placeholder風險。註冊表單label層級保留，次要字色需驗；Projects Folder／浮動Header的材質分工保留。沒有新live render，因此沒有聲稱完成兩套skill的全站視覺覆核，更沒有為符合通用去裝飾建議而移除品牌動畫。

Hallmark對兩份CSS的受控來源快照比較為28→27 FAIL、11 REFLEX不變（移除一處literal fallback）；未達全綠。直接掃描產品目錄的full-context結果另存hallmark-after-full-context.json（38 FAIL），因鄰接檔案／上下文不同，不與隔離Before直接比較。所有原始結果保留，未將舊有brand／layout問題改成通過。--render對CSS-only目標未執行HTML渲染，本輪CUA亦不可用，不能作視覺驗收證據。

## 驗證台與重跑

[Phase7入口](http://127.0.0.1:4327/phase7-harness?width=390)

```powershell
$env:AUDIT_UI_PORT='4327'
node analysis/ui-audit/phase1/mock-server.cjs
```

1. 選頁面與width，按「準備隔離頁面」。使用fixture-only帳戶與記憶體資料；不需要真實帳密。
2. 「量測目前狀態」記錄scroll owner／overflow／labels／broken images；要自行目視、用鍵盤、捲動與開啟各狀態，不以幾何紀錄取代判斷。
3. 「72個首屏技術檢查」準備好逐頁逐寬的自動流程；它**本輪未執行**，且不包含全部504狀態。
4. Generate按鈕只準備42秒方向選項，不按生成。Dialog記錄只在隔離頁開啟／取消一般視窗；不足的中間幀保持inconclusive，不自動改Passed。
5. Phase6動態矩陣與Discovery錯誤矩陣有連結；所有流程需在瀏覽器恢復後實際操作。

驗證台入口、HTTP依賴與inline script syntax已檢查，**整套瀏覽器按鈕流程尚未驗證**。Landing透過隔離host的`/main.html`準備正式SPA內容，helper的`/`仍保留原QA redirect；不把helper redirect當正式產品Landing路由行為。

服務只listen127.0.0.1；沒有production server import、dotenv、proxy或database。控制端點只改memory fixture。不要把真實key或帳戶資料填到QA台。

完整自動測試清單見test-files.json；現有 *.browser.js、*-browser.js、*.live.js 沒有在本輪透過CLI執行，不繞過CUA限制，也不呼叫付費AI／真實刪除API。

## 最終判定

目前不能推薦為「全站Visual／Responsive／Regression驗收通過」。退出條件仍需新瀏覽器逐頁證據、真機／跨browser及UI-23處置範圍的明確決定；使用者確認Phase6不等於豁免這些條件。本輪停止於Phase7交付清單、已通過的可自動化檢查與小範圍對比修補，不開始其他重構。
