# Phase 1 驗收紀錄

2026-11-12。本文件區分實測通過與未驗項；不覆寫Phase0的凍結契約或宣稱Phase2–7完成。

|Gate／契約|狀態|證據／限制|
|---|---|---|
|1A Service／sys相容|Passed（本地）|明確結果＋boolean/void facade；native prompt不覆寫；Standalone按需載入與SPA靜態載入皆實際開窗。96測試含API型別。|
|1B 復原單owner|Passed（隔離）|Card雙擊1個dialog、Cancel無第二層；Menu Enter接受僅1 POST；API失敗rollback；deferred／stale epoch／在途去重單元測試。|
|1C Prompt|Passed（隔離）|同族外觀、1440/390/375截圖、label／預填、trim/empty/same、busy、503重試、composition模擬。真實輸入法仍待驗。|
|1D 相容回歸|Passed（本地範圍）|相關96項全過；實際SPA命名更新卡片與Sidebar名稱、Back取消Prompt、legacy Delete開啟／取消；原ModalAnimation測試通過。|
|C01/C02局部controls|Passed（Dialog範圍）|44px控制、Pill按鈕、可見input容器focus、busy/disabled/error；未改全站control。|
|C04普通Alert/Confirm/Prompt|Passed（Chromium）|modal命名、inert、Tab、Escape、return-focus、once settle、queued/abort；文字不經innerHTML。|
|C08最小Overlay|Passed（Dialog範圍）|保存既有inert／overflow、計數lease、焦點守衛與teardown；未遷移其他floating surfaces。|
|Delete bridge特例|Passed（相容測試）|clone／軌跡參數保持；1000/1500ms時序用假時計驗；cancel/abort釋放lease；Preview可聚焦子內容為Phase4已知問題。|
|Reduced Motion|Passed（受控分支）／Pending（實機）|JS分支與回呼單測、fixture模擬；未測OS偏好切換、Safari或GPU。|
|無關範圍保護|Passed|source-verification.json；Folder/Morph/Hero/Router/Tokens不變，Queue與delete action區段相同；既有dirty內容保留。|
|全站a11y／設備／效能|Pending Verification|不以DOM fake／桌面viewport冒稱螢幕閱讀器、實機touch keyboard、Firefox/Safari或FPS通過。|

## 動態核對

- 新Dialog統一200ms backdrop／300ms panel enter、160ms exit；一次session持有WAAPI與退出timer，交互中斷收束／abort立即清理。Dialog按鈕不加強jelly。
- Browser實際開啟／關閉、Esc、queue及Back中斷；截圖只證明穩態外觀，不能證明逐幀／easing品質。未錄製影片或性能trace，保持Pending。
- ModalAnimation通用export保持原始實作；Delete bridge維持原accepted narrative時序，不更改Undo queue起點。新增防重複接受／modal語意／abort lease屬Phase1相容保護，不是Trash重製。

## 可重跑方式

1. 執行README中的九組Node測試；本次原始輸出見test-results.txt。
2. `node analysis/ui-audit/phase1/mock-server.cjs`，僅綁127.0.0.1:4318、全部API終止於記憶體，沒有database／dotenv／正式server依賴。
3. `/phase1-harness`操作Alert/Confirm/Prompt、reset/failure/delay、queue/abort/IME；`/login`以任意fixture格式email／非空測試密碼登入Mock，勿輸入真帳密；由正式UI進History/Projects。
4. 對應 [SCREENSHOTS](SCREENSHOTS.md) 的viewport與state補拍，記錄差異；API log讀`/audit-log`。Harness report的requests為上次reset以來的累積紀錄，queue/IME/abort不得把先前restore POST算成自己發出的request。

## 未完成但不擴張的工作

Folder／Preview local geometry、Trash elapsed-time、Undo跨頁五秒、Morph engine／AccountRow、Hero、完整Layer遷移皆維持後續Phase。Phase1完成不等於上述issue關閉。沒有改API endpoint/payload、沒有正式資料mutation、沒有commit/push。
