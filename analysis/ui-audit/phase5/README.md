> 最新交付（2026-11-13）：Phase 5核准範圍實作完成，完整測試458／458。Generate／Template剩餘項目見 [交付報告](remaining/README.md)，全項目狀態見 [矩陣](DELIVERY-STATUS.md)。本輪瀏覽器不可用，新視覺驗收與截圖待補；下文Hero／Auth等截圖屬先前子批次。

# Phase 5｜Dashboard 工作區與跨頁操作

2026-11-13。**核准範圍實作完成；Phase 5 視覺驗收尚未全部結案。** Discovery／Settings依核准決策統一SPA，Generate／Template剩餘實作已補齊；Legacy Analyze維持原狀。沒有進入 Phase 6，沒有 Commit／Push。Phase 4 的補充修正與431項基線驗證先完成，之後才開始本階段。

## 方向與界線

沿用 Hallmark、Unslop 和 Phase 0 D01，不重新提案或更換品牌。

- 產品：讓創作者從故事走到可編輯的鏡頭。
- 性格：沉著、具體、有創作現場感。
- 場景：分鏡工作桌，內容與操作先於展示。
- 識別：保留 Folder、流體 Morph、QC 與真實鏡頭畫面。
- 色彩：既有藍色與語意中性色，實體閱讀面搭配既有浮層。

Hero 使用 Solid／Raised 工作區 surface；沒有增加常駐 blur、裝飾動態或額外主要創作流程。QC 保留主創作入口。近旁 shortcuts 採相同實體閱讀面及較緊密密度；沒有把全站 acrylic 移除。設計優先序是已核准品牌契約，而非 skill 的泛用禁則。

## 已實作

1. **UI-13／D01 Hybrid Hero**：`public/html/dashboard.html`、`public/js/pages/dashboard.js`、`public/css/dashboard.css`。
   - 最近未刪除、非 pending-delete 專案提供真實標題與最多三張去重分鏡影像；以 textContent 呈現名稱，不拼接未信任 HTML，拒絕非支援媒體 URL。
   - 繼續編輯走既有 project route；模板為次要入口。手機只顯示代表性第一張，保留完整標題。沒有建立另一套 Folder，也沒有更改封面或 Undo。
   - Loading／Empty／Error 分開。空帳戶以畫面、運鏡／秒數構圖表示產品；不假造作品或進度。讀取失敗仍可走模板／QC。
   - 原有一次性 page enter 與 reduced-motion foundation 保留，未新增 JS animation loop。Desktop 典型200px；390典型約166px；長名稱及文字放大允許自然增高。
   - Desktop 三個 shortcuts 改為原生 button，保留既有行為。
2. **UI-08 膠卷點擊**：`public/js/project-detail.js`。
   - 修改前在實際1440隔離頁重現：滑鼠點擊編輯沒有開啟，AX只改焦點。
   - 根因是 pointerdown 無條件 capture 導致 click retarget。現在超過5px才 capture；0／4px仍為click、6px才為drag，touch保留原生pan，互動子控制項不接管。
   - pointercancel／lost capture／teardown 釋放session，移除pointer與wheel listeners並停止wheel RAF。拖曳後鍵盤仍可開啟編輯器。
   - 修改後實際滑鼠可開啟鏡頭編輯器；只取消，沒有儲存資料。沒有改 editor drawer 動畫。
3. **UI-25 Auth**：`public/html/login.html`、`public/js/pages/auth-page.js`、`public/css/auth.css`。
   - 六個欄位提供持續可見 label、autocomplete；label在pill外，避免被原有clip裁掉。
   - inactive filmstrip face 設 inert／aria-hidden；tab buttons 有 aria-pressed。保留膠卷外框與切換視覺，不使用 display:none 破壞雙面幾何。
   - 密碼顯示按鈕補 type、名稱、pressed與controls，切換後名稱同步；原有圖示／300ms效果保留。頁面卸載清除延遲工作。
   - 表單內切換改原生button，保留原文案及登入／註冊API。
4. **UI-26 Mobile nav**：`public/js/shell/app-shell.js`。
   - nav landmark；route links使用aria-current；profile為button＋pressed／expanded。
   - Create slot改非互動layout容器，讓真正QC trigger保有單一button，沒有button包button。
   - 路由current與動畫indicator的active分開：profile開啟時home仍為目前route。
   - 保留indicator、drag／release、QC及User Panel動畫時長。

## 實際驗證

- 首批 [Node 輸出](test-results.txt)：437／437；Discovery子批次448／448；最新剩餘批次完整 [458／458](remaining/test-results.txt)，fail／cancel／skip均0。
- [來源驗證](source-verification.json)：13個產品／server JS語法、5個CSS解析、whitespace通過；Projects Feature／Undo與Global Toast hash不變；後續Discovery子批次僅新增Router註冊及路徑對應，核心navigate流程對照相同。
- Hero：375／390／768／1024／1440／1920，逐寬度 [geometry JSON](geometry-390.json)；有作品、空、loading、長名稱＋三畫面、200%文字。390／1440另測隔離拒絕fetch的error。
- 普通字級首列可見；200%允許垂直增高，不以固定高度或裁字硬守首列。375／390的200%長標題會將首列推到下方，但沒有橫向溢出，這是已記錄的可捲動行為。
- Auth六寬度：六label、inactive inert、show/hide同步；註冊面無橫向溢出。沒有輸入真實憑證或註冊帳戶。
- [手機導航](mobile-nav-results.json)：目前route、profile、無巢狀button及QC真正展開通過。
- [Template trace](template-return-trace.json)：隔離模板由列表→詳情→1440縮390→返回，URL及搜尋「咖啡」保留。此路徑沒有重現舊UI-09，**不因此宣稱所有joint-history案例已關閉**，這是前批歷史trace；本批僅補資產註冊與Templates連點返回guard，Router核心流程不變。
- Hero「瀏覽敘事模板」及「繼續編輯」以Enter實際到達模板庫與隔離專案。
- Phase 4一般Dialog／Morph／History的整合再測資料見 [390](integration-390.json)／[1440](integration-1440.json)；不是只依靠靜態樣式檢查。

## 截圖

Before是本輪修改前在同寬度隔離QA host保存；After另提供移除QA工具列的產品裁切圖，因此不宣稱是同一裁切區的像素diff。使用相同咖啡店隔離專案；問候語由實際時間更新。

|狀態|390|1440|
|---|---|---|
|Hero Before|[修改前](before-dashboard-390.png)|[修改前](before-dashboard-1440.png)|
|Hero After|[產品畫面](after-product-390.png)|[產品畫面](after-product-1440.png)|
|Empty|[空帳戶](empty-product-390.png)|[空帳戶](empty-product-1440.png)|
|登入|[標籤與欄位](auth-after-390.png)|[標籤與欄位](auth-after-1440.png)|
|註冊|[註冊表單](register-after-390.png)|[註冊表單](register-after-1440.png)|
|膠卷編輯|N/A：本輪滑鼠重現於桌面|[點擊後開啟](filmstrip-editor-after-1440.png)|

Auth與膠卷沒有本輪同狀態Before圖片；保留before來源快照與原稽核截圖參考，不能冒稱已取得像素級前後比對。Empty及filmstrip截圖含QA宿主邊界；完整狀態另見JSON與DOM操作紀錄。

## 實作狀態／待驗證

- UI-20／21 Discovery／Settings：已核准並實作SPA接線，待六寬度與瀏覽器完整操作驗證；沒有接Legacy Analyze route或更改金鑰保存／連線驗證。
- UI-22 Generate：ChoiceCard／Segment與共用radio／keyboard owner已完成；自動測試通過，六寬度與真實鍵盤／touch操作待驗證。
- UI-27 Template：展示摘要與來源原文分層、長內容、未知規格與連點返回guard已完成；新版本瀏覽器與影片整合待驗證。
- Template直達、refresh、back／forward、連點返回；filmstrip真實多點觸控、pointer capture跨視窗與低階裝置；讀屏、真實iOS／Android／Safari／Firefox、200% Auth及reduced-motion實機對照仍待驗證。
- 全站材質／progressive blur與效能trace是Phase 6；本輪未進入。

## 最新剩餘批次交付

[完整交付狀態](DELIVERY-STATUS.md)、[Generate／Template修改、測試與待驗證](remaining/README.md)。核准範圍實作完成；瀏覽器退出條件待補，沒有宣稱全站視覺驗收通過。

## 驗證台

<http://127.0.0.1:4324/phase5-harness?width=390>（1440亦可）。支援六寬度。

```powershell
$env:AUDIT_UI_PORT='4324'
node analysis/ui-audit/phase1/mock-server.cjs
```

先按「登入隔離帳戶並開啟工作區」，再執行Hero、Template、手機nav或Dialog／Morph回歸。Auth檢查可直接執行；它切到登入頁，之後如要測工作區需重新按登入隔離帳戶。截圖模式隱藏QA控制；reload可恢復。
全部API由memory-only mock終止，沒有production server import／proxy／database，沒有正式資料寫入。基線保留於before與baseline.json；Phase 4歷史browser-results沒有被本輪QA輸出取代。
