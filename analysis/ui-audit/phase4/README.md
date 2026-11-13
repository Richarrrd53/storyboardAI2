# Phase 4｜Folder、Delete Preview／Trash 與補充動態修正

2026-11-13。**程式實作已完成；最終版瀏覽器視覺驗收仍有待驗證項目，不視為 Phase 4 全部 gates 通過。** 未進入 Phase 5，未 Commit／Push。

## 範圍與保護

依 Phase 0 C09／D02 實作共用 Folder、唯讀刪除預覽與丟入垃圾桶動畫。使用者本輪明確要求不改 Undo，因此 Phase 0 D05 的跨頁 Undo 改造不在本輪範圍，未宣稱通過其驗收。

保留開始時所有未提交修改；`before/` 保存本輪修改前來源，`baseline.json` 記錄起點。`features/projects.js`、`global-toast.js`、SPA Router、Dashboard HTML 與 Dashboard page JS 雜湊一致；Hero 與 Undo owner 沒有修改。Dashboard CSS 僅調整 Folder 宿主 grid／手機橫向 reel，以及 History grid。

## 修改摘要

1. **Folder 共用規格**：幾何由卡片寬度決定，移除 Dashboard compact 專屬外殼、封面與常態尺寸；手機 Dashboard 從 `74vw` 橫向 reel 改為雙欄，Projects／History 使用相同雙欄與 gap。保留抽出封面、Squircle tab／notch 與 hover 物件感。
2. **單一 geometry model／snapshot**：`resolveFolderGeometry` 統一定義；舊 geometry API 保留回傳結構並委派新模型。`captureGeometry` 提供 shell／tab／preview／實際 contain media／sourceRect／origin／density；Cover Transition 與 Trash 讀取同一介面。
3. **真正的唯讀 Preview**：由 `ProjectCard.createPreview` 使用同一 renderer 建立，從已登錄專案資料／既有圖片資源取內容。移除 live DOM clone、`.lock`、`scale(.8)`、`25vw` 限制。無 button／link／id／tab stop；保留 notch，隱藏唯讀選單外觀。
4. **Trash 動態**：新增只負責幾何與動態的 `ProjectTrashMotion`。量測真正預覽與垃圾桶 mouth，依 elapsed time 計算拋物線、縮小、rotateX、蓋子與淡出；不以每幀固定速度累加。RAF、signal、Reduced Motion、detached node 與 cancel／complete 有明確清理。
5. **帳戶 Morph 補充要求**：移除 User Panel 的 keepTrigger opt-in，展開後原按鈕保持隱藏。僅 account adapter 啟用透明 trigger 材質板，回程逐漸退去白底／邊框／陰影，最後還原原透明按鈕。反向中斷也包含 surface presence 插值；其他 menu 材質不受影響。
6. **一般中央彈窗補充要求**：既有共同 token／service 已使用 `cubic-bezier(.31,.01,.66,-.59)` 與 scale→0；本輪補上 computed transform 為 `none` 時明確以 `scale(1)` 起始，並對 alert／confirm／prompt 三種分支新增測試。背景僅還原 blur，不做 alpha 淡出；Delete 特殊 adapter 獨立保留。標籤編輯 modal 另修正了載入順序：每次動作才取得共用 ModalAnimation，避免頁面模組在 sys.js 前載入時永久使用會淡出背景的舊 fallback。

## 實際找到的根因

- 390px 修改前 Dashboard 寬 288.59375px、Projects 寬 173px，源自不同宿主 grid／reel，並非單純封面 CSS 問題。
- 刪除視窗 clone 依賴原頁面祖先選擇器，移出宿主後又受 `25vw` 和 scale 壓縮，造成 preview／tab／shell 脫節。
- History 原手機 grid 仍為單欄，初次三頁量測揭露此遺漏，已修正。
- 初次 live trace 發現背景分頁延後第一個 RAF；已改從動態啟動時 timestamp 起算，並在視窗退出前 complete 最後一幀。確認結果仍在既有 1500ms 時點回傳，Feature／Undo 計時不變。
- 初始 QA host 只允許 375／390／1440，768／1024 被退回 390；錯誤命名的測量檔已改為 `*-invalid-harness.json`，不計入通過。Host 已支援六種寬度；修正後的 768／1024／1920 重測因瀏覽器連線中斷而待驗證。

## 測試與視覺驗收

最終 Node 427／427、targeted 72／72 通過；9 JS／22 CSS 語法與範圍保護檢查通過。最終視覺 gate 仍為 Pending。

- 最終 Node 測試與語法／來源保護：[TESTING.md](TESTING.md)、[source-verification.json](source-verification.json)。
- 元件與動態契約：[COMPONENT-SPEC.md](COMPONENT-SPEC.md)。
- 修改前／實作中截圖、量測版本與限制：[EVIDENCE.md](EVIDENCE.md)。**現有 after 截圖是實作中已驗證版本，最後尺寸／材質／時鐘修正後尚未重拍，不能當成最終視覺簽核。**

本輪以 Hallmark 的幾何、層級、焦點及生命週期檢查，並以 Unslop 複查比例與材質理由；優先保留 Phase 0 已核准的品牌文件夾、acrylic 和 spring，不另換主題。未找到已安裝的 GSAP／Morph／ScrollTrigger 子 Skill，沒有安裝額外 Skill 或套件；本輪相關動畫使用原有 RAF／WAAPI 架構。

## 隔離驗證台

<http://127.0.0.1:4319/phase4-harness?width=390>，桌面可改 `width=1440`。支援 375、390、768、1024、1440、1920。

服務若未啟動：

```powershell
$env:AUDIT_UI_PORT='4319'
node analysis/ui-audit/phase1/mock-server.cjs
```

按「登入隔離帳戶並開啟工作區」，再按「準備長名／空封面隔離資料」。比較按鈕會依序進入 Dashboard／Projects／History 並輸出真實 DOM 量測；刪除預覽按鈕會開啟正式 adapter，仍需在真正的彈窗確認或取消。所有 API 在記憶體 fixture 終止，不連資料庫、不代理正式 API。

既有 `npm run audit:ui` 預設使用 4318；本機 npm-cli 路徑問題沿用前階段現況，直接 node 指令可避開，不修改全域安裝。
