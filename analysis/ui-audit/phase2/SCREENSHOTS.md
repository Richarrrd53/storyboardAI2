# Phase 2 視覺基線與待補畫面

2026-11-12～2026-11-13。**本輪無After圖。** Windows Computer Use因無法可靠確認browser目前網址而停止本輪UI操作；未使用替代瀏覽器自動化繞過限制。下面只引用真實既有Before，不把舊圖當新成果。

|狀態|Before|After|
|---|---|---|
|Prompt Desktop|[Phase1 1440](../phase1/screenshots/after-prompt-1440.png)|Pending：等寬Pill、scale0進場／退出、constant-alpha scrim|
|Prompt Mobile error/busy|[390 error](../phase1/screenshots/after-prompt-error-390.png)、[375 busy](../phase1/screenshots/after-prompt-busy-375.png)|Pending：375/390輸入、按鈕、focus及鍵盤|
|Restore Confirm|[1440](../phase1/screenshots/after-restore-card-1440.png)、[390](../phase1/screenshots/after-restore-spa-390.png)|Pending：兩Pill均分、一次確認、背景退出不淡出|
|Alert／Confirm|[Alert](../phase1/screenshots/after-alert-1440.png)、[Confirm](../phase1/screenshots/after-confirm-1440.png)|Pending：共享按鈕、同族motion／material|
|Delete preservation|[1440](../phase1/screenshots/after-delete-legacy-1440.png)|Pending：保持Trash與接受時間；不可宣稱修好Folder Preview|
|Menu／QC／Account／Nav|[原稽核索引](../SCREENSHOT-INDEX.md)|Pending：同背景新material、layer重疊、opaque fallback|
|手機History|[原390](../screenshots/history-390.jpg)|Pending：Panel連結無document reload、Bottom Nav hidden與Back恢復|
|Template中央視窗|[原頁面狀態](../01-PAGE-INVENTORY.md)|Pending：建立模板／來源資訊等寬footer與同族scale/blur，不稱已看過新狀態|

補驗入口：`http://127.0.0.1:4318/phase1-harness`、`/phase2-visual?width=390`、`/phase2-visual?width=1440`。容器設定CSS viewport，並不等同實體裝置或效能測量。
