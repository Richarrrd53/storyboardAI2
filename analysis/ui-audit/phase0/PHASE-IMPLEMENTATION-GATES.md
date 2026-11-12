# Phase 1–7 實作閘門

2026-11-12｜**全部實作 Gate：Not Started**。Phase0完成的是文件與基線凍結；以下不是執行授權。每一Phase開始需使用者指示，且先確認依賴。未跑測試、未拍After、缺必要裝置／狀態一律 **Pending Verification**，不能標Passed。

## 共用交付與退出規則

每階段建立獨立 evidence bundle：版本／dirty差異、契約ID、變更檔案、Before/After（同route/data/viewport/state）、動畫過程／中斷／Reduced Motion紀錄、測試命令和實際結果、Regression Checklist、未完成／已知風險、DS符合項／例外及理由。截圖比對以 [Visual Baseline](VISUAL-BASELINE.md) 的重新拍攝規則為準，不把舊截圖當新測試。

每個契約條目記 **Passed / Failed / Pending Verification / N/A（附理由）**；阻擋核心互動的Failed或必要Pending不得放行。單元測試全綠不能替代視覺／keyboard／API call count。安全性測試使用隔離Mock，正式使用者不執行delete/restore/rename。保存既有dirty工作；scope外變更立即拆除或停下確認，不能reset使用者檔案。

## Phase 1｜Dialog Service、Prompt、一次復原確認

- **目的／範圍**：UI-01/05/06；C04＋必要局部C01/02/08；保持API與delete signature bridge。完整交接見 [Handoff](PHASE-1-HANDOFF.md)。
- **進入條件／依賴**：Phase0六文件可讀；sys消費者盤點與async測試方案；before確認Mock仍能重現雙層。
- **可能檔案**：`public/js/sys.js`、`features/projects.js`、`components/project-card-interactions.js`；Proposed dialog-service／dialog CSS與必要載入接線；對應測試。Router不得改。
- **複雜度／風險**：中高；Promise truthiness、global compatibility、focus/inert、delete resolve時點。最小批次見handoff。
- **Before/After**：1440/390/375 Alert／Confirm／Prompt、長名稱／錯誤／busy；Mock Restore一次確認，Delete橋接對照既有1440/375。
- **動畫驗證**：enter/exit、快速開關、Escape、離頁abort、reduced；delete不提前resolve、不新增跳尺寸。
- **測試／Regression Checklist**：取消零mutation，確認恰一次，雙擊／IME／focus／route abort／stale epoch／API failure；四組既有47測試重跑＋真async新增案例。
- **退出條件**：單一確認owner；Prompt非native且與Confirm同族；可見focus／trap／return；所有受改動global呼叫相容；Delete/Undo無行為變更。DS C04與相關局部規範逐條勾選。
- **未完成事項欄**：Preview錯形、Undo跨頁、Morph／Account明列保留Phase3/4，不報Phase1修完。

## Phase 2｜Foundations 消費規則、Surface／Button／Layer

- **目的／範圍**：C01/02/08與UI-10/17/18；落實Canonical owner，mapping舊層與portal。不是一次重新命名411變數。
- **進入條件／依賴**：Phase1 Dialog gate通過；新增shared overlay界線已知；實際token consumer／CSS順序清單。
- **可能檔案**：`tokens.css`／`tokens/{components,blur,shadow,layers,border}.css`、`style.css`、`shell.css`、必要scoped component CSS；逐consumer遷移。
- **複雜度／風險**：高；CSS cascade／page asset卸載／stacking context，須分配方與layer兩批。
- **Before/After**：同背景Menu/QC/Nav/Dialog、opaque fallback、button/input states；1440/390與375。
- **動畫驗證**：layer切換不閃、menu→dialog、QC＋account；不在此替換signature。
- **測試／Regression Checklist**：focus對比合成實測、inert/scroll lock計數、portal遮擋、無backdrop/corner-shape fallback、跨頁樣式污染；Desktop/Mobile完整受影響路徑。
- **退出條件**：配方唯一owner；Legacy mapping可追；Dialog不被10000級Nav遮住；無新全域!important。C01/02/08符合表與例外清楚。
- **未完成事項欄**：未遷移consumer明列，不稱全站token已乾淨；Header層數優化留Phase6。

## Phase 3｜Surface Morph、Account Row、User Panel

- **目的／範圍**：D03/D04，C03/05/06，UI-11/12/14/15/16；抽現有openSurface核心與語意adapter。
- **進入條件／依賴**：Phase2 Surface/Layer gate；Project Option current motion錄製，trigger/portal/keyboard contract固定。
- **可能檔案**：`project-option-morph.js`、`option-morph.css`、`app-shell.js`、account相關`dashboard.css`；Proposed surface-morph與adapters。
- **複雜度／風險**：高；幾何中斷、focus、scroll owner、跨斷點與singleton。
- **Before/After**：sidebar收/展、account panel Desktop/Mobile、project/tag/sort選單，1440/1024/768/390/375。
- **動畫驗證**：opening→close→reopen、中途resize/scroll、trigger移除、route teardown、live rect、reduced；保存Project dot-flight特色並比逐幀連續。
- **測試／Regression Checklist**：Action/checkbox/radio鍵盤、focus return、Escape/outside、同時兩menu、SPA重入無listener累積；弱手機trace，不以視感當效能數據。
- **退出條件**：36px左右同anchor AccountRow；同資料兩panel布局；共用engine無CRUD／複製controller；Native select/combobox不退化。
- **未完成事項欄**：機型性能Pending須明示；相關geometry/interaction必要項未驗不得Passed。

## Phase 4｜Folder、Delete Preview／Trash、五秒跨頁 Undo

- **目的／範圍**：D02/D05、C09、UI-02/03/04/23/24；資料計時與視覺幾何分批但共同驗收。
- **進入條件／依賴**：Phase1 dialog、Phase2 foundations與Phase3 menu接口穩定；Dense幾何樣張校準；session邊界政策須先列清，未核准部分不得自行實作。
- **可能檔案**：`project-card.js`、`project-card-interactions.js`、`project-card.css`、Host grid相關`dashboard.css`／pages樣式、`sys.js` delete adapter、`features/projects.js`、`global-toast.js`相關接線；Router只允許經核准的queue flush呼叫調整，不重寫Router。
- **複雜度／風險**：最高；geometry snapshot、API競態、stale callbacks與rollback。
- **Before/After**：三頁同資料375/390/768/1440、Preview／confirm、空封面／9:16／長名／tags；跨頁Undo Toast剩餘時間。
- **動畫驗證**：snapshot→trash、60/120Hz、取消／中斷、cover handoff、reduced；動畫結束不等於commit。
- **測試／Regression Checklist**：假時計deadline與API call count、4.9s undo、5s boundary、2s離頁剩3s、多筆／雙擊／503／offline／session stale；Mock限定所有delete/restore；回歸Prompt與menu intent。
- **退出條件**：三頁同寬geometry≤1px rounding差；Preview無新clone形變；無外層scale補layout；同session離頁不提前commit、完整五秒、failure回滾可見；D05逐項驗收。
- **未完成事項欄**：logout/reload/session-end若仍未核准，明列範圍及現況，不冒稱涵蓋完整session耐久性。

## Phase 5｜Dashboard Hybrid Hero 與各頁 Layout

- **目的／範圍**：D01、UI-08/09/13/20/21/22/25/26/27；依功能分小批，非一次重寫所有頁。
- **進入條件／依賴**：Phase4 Dense Folder／grid穩定；Hero真實資料來源與樣張確認；Template返回與filmstrip click先trace驗根因；Discovery正式殼體／legacy Analyze去留需產品決策。
- **可能檔案**：`pages/dashboard.js`／`dashboard.css`，`project-detail.js`、templates相關、Discovery/bootstrap/CSS、Auth markup、`app-shell.js` nav語意；只改核准子範圍，Router不重寫。
- **複雜度／風險**：高，跨頁assembly、navigation、pointer與資料內容；Legacy Analyze未決不私接route。
- **Before/After**：六width主要頁，Hero有／無資料；Discovery SPA/直達/settings來回；Auth兩panel；Template列表/詳情／長內容。
- **動畫驗證**：Hero輕進場、folder hover／cover、filmstrip drag/click、history返回、nav active與QC，不破壞前階段。
- **測試／Regression Checklist**：Hero首列可見、200%文字、Template back/forward與resize、pointerthreshold/cancel、Auth labels/inactive inert、nav語意、設定key不曝光。
- **退出條件**：每個已實作子批次有獨立證據與DS例外；來源內容可追、不假造精選資料；未核准舊頁不擴張範圍。
- **未完成事項欄**：尚未執行的子頁不能因Hero完成一起Passed；API結果loading/error未驗清楚列出。

## Phase 6｜Progressive Blur、Material／Motion 全站整合

- **目的／範圍**：UI-18/19與Motion表；C07/10/11，保留Landing/QC/Nav/cover signature，降低無理由重疊。
- **進入條件／依賴**：Phase2–5結構穩定；指定目標browser/裝置，先量測current trace再調層數。
- **可能檔案**：`dynamic-mask.js`、`shell.css`、`mobile-nav.css`、QC相關、`motion.css`消費者；Landing只有證據充分的scoped調整。
- **複雜度／風險**：高；合成成本／scroll feedback／browser fallback／lifecycle。
- **Before/After**：Header首/中/尾、nav/QC/panel重疊、Landing opening/workflow、focus scrollIntoView、reduced對照；Desktop/Mobile加真實iOS/Android。
- **動畫驗證**：scroll方向反轉、快速route切換、breakpoint/media query變更、hidden/offscreen暫停、RAF與observer清理、低階手機trace。
- **測試／Regression Checklist**：mask末項可見、touch/focus不裁切、多scroll owner、ResizeObserver不循環、Safari/Firefox fallback、reduced JS仍完成callback、no duplicate init。
- **退出條件**：每項blur有role和owner；調整有before/after trace支撐；保留signature有對照；無效層才降級，不以全站fade替Morph。
- **未完成事項欄**：未取得實機／trace不得聲稱效能提升或跨browser達標。

## Phase 7｜全站 Visual／Responsive／Regression QA

- **目的／範圍**：重跑 [01頁面及狀態清單](../01-PAGE-INVENTORY.md) 正式入口；逐一關閉28項issue，legacy/demo另列。
- **進入條件／依賴**：Phase1–6各必要gate通過；例外／待決清單已review；基線與版本可追溯。
- **可能檔案**：測試／evidence／文件；若發現修補需回對應Phase範圍，不開無界全域覆寫。
- **複雜度／風險**：高；跨頁組合、設備／字體、APIs、route lifecycle與race。
- **Before/After**：六width同資料主要頁；Modal/Prompt/Menu/Sidebar/QC/Nav/Empty/Error/Loading/Focus各狀態；每張After對應baseline ID。
- **動畫驗證**：signature全流程及中斷、reduced、60/120Hz、實機手勢、離頁重入多次；靜態圖不能替代。
- **測試／Regression Checklist**：全套相關單元／整合＋隔離E2E；鍵盤／讀屏、對比、fallback、safe-area、軟鍵盤、deep link/history、API failure、五秒Undo。
- **退出條件**：每個issue有證據／測試／關閉理由；必要Pending清零或有使用者明確接受的release範圍；不因單一綠測試報全站Passed。
- **未完成事項欄**：列所有未驗頁面／browser／互動／資料狀態與owner，沒有測試的項目維持Pending。
