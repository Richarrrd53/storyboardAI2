# 隔離互動紀錄

2026-11-12：fixture@example.test（虛構測試身份）

- Rename：透過正式選單開啟，getJsDialog().type = prompt；未變更名稱，dismiss。IAB 不支援在原生 prompt 開啟時截圖，故無該狀態截圖。
- Delete：在獨立 4317 Mock 伺服器點擊確認，執行垃圾桶動畫，僅記憶體 fixture 標記刪除。
- Restore：點擊回收桶卡片，未按任何確定即建立兩個 .sys-bg；上層「是否還原此分鏡？」取消後露出下層「此分鏡在回收桶中…」及 undefined 說明。兩層皆取消。
- Cancel：先前手機 Delete Confirm 取消後專案保留。

此紀錄不代表正式資料刪除、復原、API 失敗回滾或 Undo 已驗證。
