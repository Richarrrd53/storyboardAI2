# Phase 1 截圖索引

2026-11-12。全部After為本輪Chromium IAB實際截圖，使用本地Mock；非實體手機。Before沿用Phase0原圖，複本內容不改。檔名尺寸為CSS viewport：1440×900、390×844、375×812。

|Before來源|After|可比較內容／限制|
|---|---|---|
|[雙確認](screenshots/before-mock-restore-double-confirm-1440.jpg)、[取消上層仍有下層](screenshots/before-mock-restore-underlying-confirm-1440.jpg)|[正式History卡片1440](screenshots/after-restore-card-1440.png)、[SPA手機390](screenshots/after-restore-spa-390.png)、[Harness375](screenshots/after-restore-confirm-375.png)|History雙層→單確認，取消後0；資料同fixture，時間標籤隨日期不同。Harness與SPA背景不同，不作pixel diff。|
|原生Prompt：修改前實際觀察type=prompt、dismiss，無可匯出開窗圖|[Dashboard Prompt1440](screenshots/after-prompt-1440.png)、[空白error390](screenshots/after-prompt-error-390.png)|不把選單圖或自行畫的瀏覽器框假裝Before；對照的是原生→自訂同族輸入體驗。|
|[舊選單穩態](screenshots/before-project-menu-open-1440.jpg)|[改名成功1440](screenshots/after-rename-success-1440.png)|確認功能入口與名稱更新，這兩張不是相同state的像素比較。|
|無對應舊自訂Prompt狀態|[API失敗保留輸入375](screenshots/after-prompt-retry-375.png)、[儲存中375](screenshots/after-prompt-busy-375.png)|新Prompt的error/busy狀態；兩張來自隔離Harness。|
|舊Alert/Confirm見Phase0研究，不另造Before|[Alert1440](screenshots/after-alert-1440.png)、[Confirm1440](screenshots/after-confirm-1440.png)|同一M4材質、Squircle外框與內Pill、可讀focus。|
|[舊Delete Confirm1440](screenshots/before-mock-delete-confirm-1440.jpg)|[legacy Delete1440](screenshots/after-delete-legacy-1440.png)、[375](screenshots/after-delete-legacy-375.png)|僅相容參考；Before來自Dashboard compact，After來自Projects default，不能據此主張Folder比例修好了。錯形仍留Phase4。|

Screenshot不能證明API次數、动画完整軌跡、cleanup或FPS。操作與API紀錄見browser-evidence.json、spa-restore-api-log.json；測試輸出見test-results.txt。
