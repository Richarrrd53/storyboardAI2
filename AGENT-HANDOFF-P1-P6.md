# StoryboardAI2：P1–P6 整合與驗收報告

更新：2026-10-14（Asia/Taipei）。工作區：`D:/My Files/web/StoryboardAI2`。
**P1–P6 全部已整合完成並通過三尺寸視覺驗收與所有測試回歸。**

## 整合成果總結

- **完整單元測試**：`node --test tests/*.test.js` **238/238 通過**（100% 通過，0 失敗，0 跳過）。
- **完整跨尺寸瀏覽器回歸**：
  1. `tests/site-browser.js`：1440px / 1024px / 390px **全部通過**（15 頁面正式 iframe、無水平溢出、無未捕獲錯誤）。
  2. `tests/template-history-browser.js`：1440px / 1024px / 390px **全部通過**（History/deep link/back/forward/cache/filter/apply/recovery）。
  3. `tests/templates-browser.js`：1440px / 1024px / 390px **全部通過**（editor panels/storyboard/CSV/synchronized selection/zoom/full-sparse/apply）。
  4. `tests/generate-browser.js`：1440px / 1024px / 390px **全部通過**（4 phases/keyboard/IME/task resume/loader cleanup/results/reset）。
  5. `tests/generation-browser.js`：桌面＋正常動畫中斷／template cancellation／listener cleanup **全部通過**。
  6. `tests/template-generation-browser.js`：桌面滑鼠／滾輪與手機原生 touch 拖曳 **全部通過**。
- **程式碼語法與空白檢查**：`git diff --check` **0 錯誤**。
- **視覺驗收截圖**：已實際檢視 `.codex-backup/ui-validation/site/` 下全套 1440、1024、390 截圖與 Generate 系列截圖。

## 本次修正之已知問題

1. **Generate 手機頂部貼邊與底部導航按鈕遮擋**：
   - 根因：`public/css/shell.css` 中 `body.dashboard-layout #page-content` 擁有 higher specificity `(0,1,2)` 帶有 `padding: 0 !important; overflow: hidden !important;`，壓過 `.spa-gen-wrap`。
   - 修正：在 `public/css/generate.css` 加入 `body.dashboard-layout #page-content.spa-gen-wrap`，桌面指定 `padding: var(--space-8) var(--layout-gutter-desktop) var(--space-16) !important;`，手機指定 `padding: var(--space-5) var(--layout-gutter-mobile) calc(var(--workspace-bottom-inset) + var(--space-8)) !important;`，賦予完整的垂直捲動權限與安全底距。
2. **Phase 4 結果畫面重複 Heading**：
   - 修正：在 `public/js/generate.js` 的 `renderResults` 中動態隱藏 `.generation-phase-title`，並在 `public/css/generate.css` 加入 `:has(.generation-result-wrap:not([style*="display: none"]))` 規則雙重保護。
3. **Phase 2 創作方向短屏捲動與 Sticky Footer**：
   - 根因：Phase 2 在 `public/css/template-workflow.css` 原有獨立 `max-height` 與 `overflow-y: auto !important`，以供 600px 矮螢幕／手機滾動風格列表並讓確認按鈕 sticky 呈現。
   - 修正：保留獨立捲動與 sticky footer，修復 `bindDirectionScrolling` 拖曳指針事件，保證桌面滑鼠拖曳、滾輪與手機觸控均能流暢操作。
4. **離開 Generate 路由時的閒置 Phase 重置**：
   - 修正：在 `unmountGeneratePage()` 中，當 `GenerationTask.getState().status === 'idle'` 時，將 `CreationSessionStore.targetPhase` 與 `currentPhase` 安全重設為 1，避免殘留 Phase 2/3 導致重新進入時跳關。

## 階段狀態（P1–P6 全數完成）

### P1 模板 Marketplace 與詳情頁
- L1–L4 資訊揭露層次，頂部 Sticky Header，主標題轉場，Hero 雙欄，來源說明分離，動態分析卡，逐鏡拆解與進階分析收合。
- 測試覆蓋：`templates-browser.js`（3 尺寸）、`template-history-browser.js`（3 尺寸）、`templates-page.test.js`。

### P2 專案 Tags
- Option morph 中 `this` 引用修正；失敗保留 draft modal 並支援 inline error 與重試；成功時持久化並更新快取。
- 測試覆蓋：`projects-feature.test.js`、`projects-page.test.js`、`project-card.test.js`、`site-browser.js`。

### P3 Generate 四階段
- 四階段導航列、靈感推薦、風格卡與畫面比例原生按鈕語意、模板選擇資料防護、Rose Curve 動態粒子卸載清理。
- 手機底部安全間距完整相容浮動 Bottom Nav。
- 測試覆蓋：`generate-browser.js`（3 尺寸）、`generation-browser.js`、`template-generation-browser.js`。

### P4 Tokens、Shell 與其餘正式頁面
- 語意 Tokens 收斂、解除 alias 循環、Mobile Nav 對比與間距標準化、Project Workspace 兩行 Header 佈局拉伸修正。
- 測試覆蓋：`app-shell.test.js`、`project-detail.test.js`、`site-browser.js`。

### P5 整合回歸
- 跨頁面 SPA 導航無記憶體洩漏、無多重 iframe / 播放器實例、未破壞歷史堆疊。

### P6 全站視覺驗收
- 已完成 1440×900、1024×768、390×844 全套畫面截圖審查，排版無水平破版，Typography 與元件體系遵循 Design Tokens。
