# Phase 2 測試紀錄

完成日期：2026-11-13（Asia/Taipei）。最後一輪：**178 passed、0 failed、0 skipped**。原始TAP輸出：[test-results.txt](test-results.txt)。

```text
node --test tests/dialog-service.test.js tests/modal-animation.test.js tests/app-shell.test.js tests/design-foundations.test.js tests/ui-audit-fixture.test.js tests/project-dialog-actions.test.js tests/project-card.test.js tests/project-card-interactions.test.js tests/project-option-morph.test.js tests/history-page.test.js tests/projects-feature.test.js tests/projects-page.test.js tests/project-cover-transition.test.js tests/project-detail-page.test.js tests/templates-page.test.js tests/source-modal.test.js
```

覆蓋：Dialog結果相容／queue／abort／focus／inert、精確scale與blur keyframes、退出scrim不淡出、快速重開、Reduced Motion、保留Delete接受時序、復原單owner與rollback、命名驗證與重試、History一般與修飾點擊、Nav隱藏／返回與indicator清除、Token owner／引用／數值對比／layer排序、SourceModal portal卸載，以及原有Folder／Menu／Cover／Projects／History／Template回歸。

CSS檢查：

```text
node analysis/ui-audit/phase2/verify-css.cjs
```

**20／20 份變更樣式表可由現有PostCSS解析**；見 [css-validation.json](css-validation.json)。這不驗證實際CSS cascade、stacking context、透明合成或像素外觀。

隔離服務測試使用隨機loopback port，測試完成即關閉，沒有連接正式server／資料庫。互動驗證台另外使用4318；啟動命令為`npm run audit:ui`，直接入口為`http://127.0.0.1:4318/phase1-harness`。服務已啟動時重跑命令會回報既有入口。

`repair-*`、`central-dialog-tests.txt`及`shell-tests.txt`是開發中的中間紀錄，其中保留了後續已修正的失敗；最終結果以本檔及test-results.txt為準。

**Pending Verification**：本輪沒有可用的瀏覽器UI驗證，沒有新After圖。宣告色值的數學測試不代表實際頁面對比已量測，HTTP健康檢查也不代表所有互動已目視通過。完整清單見 [GATES](GATES.md)／[SCREENSHOTS](SCREENSHOTS.md)。
