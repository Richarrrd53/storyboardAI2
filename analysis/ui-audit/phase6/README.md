> 後續更新（2026-11-14）：使用者已授權開始 [Phase7](../phase7/README.md)。Phase6未決項的本輪補驗／限制見該報告；以下保留Phase6交付時點，不代表Phase7已驗收。

# Phase 6｜材質、漸進模糊與動態整合

2026-11-14。依 Phase 0 的 C07／C10／C11、UI-18／19 與 Motion ownership 規範完成本輪整合。**實作完成；實機效能、跨瀏覽器及部分動態驗收仍 Pending，不進入 Phase 7。** 保留全部既有修改，未 Commit／Push，未操作正式使用者資料。

## 修改摘要

| 範圍 | 實際問題／修改 | 主要來源 |
|---|---|---|
| Header／Nav 材質降級 | 原本 data-opaque-surfaces 只改 Nav／Menu，Header與底部的1.5／4／8px blur仍持續繪製。補齊 explicit opaque、reduced transparency、backdrop／mask不支援時的共用配方；六個細節blur層 display:none，以每個邊緣一層漸層底色替代。 | tokens/components.css:64、shell.css:260 |
| 漸進模糊 | 正常模式保留三階強度、Header原有tint、底部152px幾何。新增底部tint只在降級模式顯示，正常模式 display:none，不新增活動blur。較舊不支援color-mix的瀏覽器保留無color-mix的底色備援。 | dynamic-mask.js:389、shell.css:274 |
| 焦點／可讀區 | overflow mask 不再淡化目前聚焦控制項；focusin/out重新計算。Header／底部overlay的邊界會避開聚焦元素及8px緩衝，scroll-padding規則保留。 | dynamic-mask.js:123、362–389 |
| 動態生命週期 | 隱藏分頁停止instance RAF；回到可見時刷新幾何，不把背景期間的捲動差誤當方向意圖。destroy冪等並清理focus、media、visibility listener與RAF。Nav狀態更新不再喚醒無關的橫向mask。 | dynamic-mask.js:126、302、555、678 |
| Reduced motion | Header不再自動隱藏、縮成膠囊或折起副標題；live media變更可更新狀態。Loading保留靜態曲線，不保留RAF／吸入粒子。 | dynamic-mask.js:241、258；math-curve-loader.js:86、148 |
| Loading | 以IntersectionObserver追蹤每個SVG的可見狀態；全部離屏才暫停，回到畫面續用原曲線。hidden／reduced變更取消舊RAF，stop／abort／重掛載釋放訂閱。 | math-curve-loader.js:128–155 |
| QC ambient | AppShell單一visibility owner發佈motion-suspended。僅QC光暈在hidden／inert／展開／關閉／workspace隱藏時暫停；不改3.2s光暈節奏。實測找到Dashboard舊animation shorthand覆蓋pause，加入精確state規則的!important。 | app-shell.js:1564、1686；components/quick-create.css:87 |
| Motion tokens | 將既有160／280／460ms命名為feedback／reveal／surface，原名保留alias；Header320ms集中於motion.css。沒有把不同時序硬併成相同值。 | tokens/motion.css:16；tokens.css:96 |
| 其餘整合 | Generate composer補齊-webkit-backdrop-filter，沿用既有配方；Template摘要移除無法插值的line-clamp/display之transition:all。 | creation-workspace.css:110；template-detail.css:235 |

產品路徑均相對 `public/`。完整材質分層、動態所有權與例外見 [MATERIAL-AND-MOTION-CONTRACT.md](MATERIAL-AND-MOTION-CONTRACT.md)。

## 保留範圍與基線

本輪開始時保存 [baseline.json](baseline.json) 及 before/；相對於當時已含Phase1–5修改的工作區建立基線，沒有 reset／stash。creation-workspace.css 的補存基線以Phase5現存內容還原本批唯一新增的webkit宣告，僅作來源對照，不當作獨立瀏覽器版本證據。

[來源驗證](source-verification.json) 確認以下檔案hash不變：

- Projects Feature／GlobalToast（Undo相關資料流程）。
- Project Trash Motion／Project Folder CSS。
- SurfaceMorph／QuickCompose controller／Mobile Nav CSS；AppShell手勢區塊也逐字相同。
- sys.js（Dialog及legacy delete完成時間）、Landing logic／GSAP animation。

保留正常模式三階模糊、Folder幾何與cover handoff、Morph480／440ms、QC560ms、Nav jelly、Landing opening／workflow。沒有用全站fade替換它們，沒有修改Undo起點、五秒期限或資料提交／回滾。

## 測試結果

- [完整 Node suite](test-results.txt)：**464／464**，fail／cancel／skip均0；Phase5為458，本輪增加6案例。
- [針對性測試](targeted-tests.txt)：37／37，涵蓋聚焦mask、reduced Header、hidden RAF、重入清理、Nav不喚醒橫向mask、Loader離屏／live preference與Shell visibility owner。
- [來源／HTTP驗證](source-verification.json)：4個JS語法、9個CSS解析、驗證台inline script、whitespace、7個本地入口／資源HTTP200。9個CSS包含兩個基線保護檔的解析，不代表9個CSS都被修改。
- **六寬度瀏覽器矩陣通過**：375／390／768／1024／1440／1920，每個6狀態：首屏、中段、末尾、反轉、回頂、聚焦末項；四次SPA往返後舊layer仍連接數0，無橫向溢出、inner document reload數0。證據：browser-matrix-{width}.json。
- **Opaque實測通過**：Before六個blur仍顯示；After六個blur為display:none、getClientRects=0，只剩top／bottom tint繪製，沒有把computed blur字串誤當仍繪製。見 before-opaque-390.json／after-opaque-390.json。
- **品牌回歸部分通過**：390與1440的Project Morph在160／380／500ms中斷後均正常收回；1440 Account Morph同樣通過。Folder按鈕對齊與History返回通過，inner document reload數0。原始結果完整保留於 integration-390.json／integration-1440.json。
- **Dialog平順度未通過完整驗收**：上述integration總passed仍為false；Dialog的RAF只有1–6筆，未捕捉anticipation後的快速縮小段。沒有改測試門檻把它改成綠燈，也不由「sys.js未改」推論動畫一定正常。進入scale1、退出移除與scrim不淡出有記錄；中間連續性待更高取樣率重驗。
- **浮層／背景**：手機QC開啟期間未另打開Account sheet；關閉QC後Account sheet可開啟，expanded QC數0。桌面Account→登出Confirm後Morph數0、Dialog數1；修正後兩個背景光暈的animationName仍為glow-loop、playState均paused。見 overlay-state-desktop.json（發現問題）與 overlay-state-desktop-after.json（修正結果）。
- **Landing保留實測**：開場與workflow motion class存在、pin spacer兩個；點「創作流程」完成錨點捲動；離頁後pin spacer為0。既有隔離登入session使「登入」轉往Dashboard，未進行真實登入。見 landing-lifecycle.json。不是Landing六寬度或完整影片驗收。

## 前後截圖

皆為本地memory-only同一批24個隔離專案、同寬度、捲動比例0.5；截圖模式移除QA工具列。資料不是正式帳戶；一般模式刻意保留原有材質外觀。

| 狀態 | Before | After |
|---|---|---|
| 390一般三階模糊 | [before-middle-390.jpg](before-middle-390.jpg) | [after-middle-390.jpg](after-middle-390.jpg) |
| 1440一般三階模糊 | [before-middle-1440.jpg](before-middle-1440.jpg) | [after-middle-1440.jpg](after-middle-1440.jpg) |
| 390不透明模式 | [before-opaque-390.jpg](before-opaque-390.jpg) | [after-opaque-390.jpg](after-opaque-390.jpg) |

補充：qc-opaque-390.jpg、panel-opaque-390.jpg、landing-opening-after.jpg、landing-workflow-after.jpg、logout-after-desktop.jpg。這些沒有相同狀態的Before，不能當像素前後對比。logout截圖取得於光暈pause優先序修正之前；該修正的After只有DOM計算狀態JSON，沒有宣稱補拍成功。

## 效能與無法實測的項目

本輪瀏覽器在執行中可用，2026-11-14收尾時重新回覆「Local browser access is unavailable for this chat」。已保存的證據有效，但最後的pause恢復／重拍與viewport reset無法執行；沒有改用其他自動化方式繞過。當時桌面停在**本地隔離登出確認**，沒有按確定、沒有實際登出或刪除正式資料。

- [after-scroll-trace-390.json](after-scroll-trace-390.json) 是瀏覽器RAF取樣，間隔約33–250ms，且沒有可比的硬體／GPU baseline；不拿它換算FPS或宣稱效能提升。此檔舊欄afterLeaveLayerCount包含新頁的自有layer，不能當洩漏數；洩漏判斷以後續matrix的oldLayersStillConnected=0為準。
- 真實iOS／Android、低階裝置、60／120Hz、GPU／paint／composite／長任務trace、電量均待驗證。**沒有證據支持把正常三階改成兩階，所以維持三階。**
- Safari／Firefox、原生不支援backdrop／mask／color-mix的瀏覽器、原生reduced-transparency與系統reduced-motion live切換待實測。單元測試與explicit opaque QA不能替代這些組合。
- Loader offscreen、hidden／resume、live preference有模擬DOM測試；完整實機捲入捲出、背景切回與多SVG交錯待驗證。
- Dialog完整縮小曲線、QC光暈從paused回running、品牌動態的軟鍵盤／旋轉裝置／breakpoint中斷待驗證。桌面與手機兩次integration的false保留，未覆寫成Passed。
- Landing mobile opening／workflow、影片播放／離屏暫停／返回，以及全站其他頁面與動態狀態的完整回歸仍屬後續驗收；不把本輪六寬度Projects矩陣誤稱全站逐頁Passed。

## Skill判讀

Hallmark與Unslop沿用Phase0品牌方向。Hallmark本批四個CSS的機械檢查由89 FAIL／19 REFLEX變為88 FAIL／19 REFLEX，唯一消除的10a為Template transition:all。其餘含既有literal fallback／品牌QC漸層／stamp、排版與overlay規則；原始 findings 保留於 hallmark-before.json／hallmark-check.json，**不是Hallmark全綠**。

--render對CSS-only目標回覆no HTML page；實際渲染與視覺檢查由本輪CUA瀏覽器完成。使用者「保留既有品牌動畫／修改、不Commit」優先於skill通用的扁平化、改theme、清空dirty tree或metadata要求；不為lint重寫整站。新!important僅用於QC明確暫停state，已用實際computed state驗證。GSAP子Skill未安裝，未擅自安裝；Landing以現有scoped ownership、實際捲動與清理檢查。

Unslop第二輪視覺判讀：一般模式的浮動nav、Folder與Header層級保留；不透明模式使用可讀底色，避免失去blur後文字直接混入控制列。保留媒體／Folder物件／QC彩光的用途區別，沒有一律改平面。剩餘風險為低階裝置複合材質成本及交互中間幀，明列Pending，不用靜態截圖代替。

## 驗證台

[Phase6隔離入口](http://127.0.0.1:4326/phase6-harness?width=390)，可替換六種width。

```powershell
$env:AUDIT_UI_PORT='4326'
node analysis/ui-audit/phase1/mock-server.cjs
```

先按「登入隔離帳戶並開啟工作區」，再按「Phase6 捲動基線」；「Phase6 狀態矩陣」執行六狀態及SPA清理。「Opaque fallback」切換不透明配方；「捲動反轉與清理記錄」只作RAF觀察。「本輪Dialog／Morph／返回回歸」保留原判斷，不保證遠端低取樣率下通過。

服務只提供memory-only fixture，所有/api在本地終止，無production proxy／database。不要將隔離驗證台用於真實資料。Phase7未開始。
