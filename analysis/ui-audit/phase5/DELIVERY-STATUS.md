# Phase 5 交付狀態矩陣

2026-11-13：核准範圍實作已完成；尚有瀏覽器退出條件待驗證，未進入 Phase 6。

| 項目 | 已實作 | 證據 | 尚待驗證 |
|---|---|---|---|
| UI-08 filmstrip | 5px threshold後才接管 pointer，點擊可編輯、取消及離頁清理 | phase5-interactions.test.js；前批filmstrip截圖 | 真機多指、capture跨視窗、低階裝置 |
| UI-09 Template返回 | 保留列表／篩選，詳情重用；連點返回只dispatch一次 | templates-page.test.js；前批template-return-trace.json | 新版本完整history／直達／refresh／resize矩陣 |
| UI-13 Dashboard Hero／D01 | Hybrid；真實近期專案、空／loading／error、不虛構精選 | dashboard-page.test.js；前批六寬度geometry與截圖 | 真機與跨瀏覽器；不重做Hero |
| UI-20 Discovery | 正式入口及設定共用既有SPA外殼，owner／teardown | discovery-page與routes tests；discovery報告 | 六寬度實際進出／搜尋／loading／empty／error |
| UI-21 Settings | 區域tokens／返回／retry／離頁清理，既有key保存邊界 | discovery-settings-page.test.js、來源比對 | 六寬度、鍵盤、連線結果與不回顯操作 |
| UI-22 Generate | 共用radio ChoiceGroup、ChoiceCard／Segment／Action、disabled與清理 | phase5-choice-presentation.test.js；remaining報告 | 六寬度、focus／觸控、完整生成整合 |
| UI-25 Auth | visible labels／inactive inert／password button語意 | Auth相關測試；前批六寬度截圖 | 200%文字、讀屏、實際登入／註冊 |
| UI-26 Mobile Nav | route anchor／aria-current，profile button及獨立QC trigger | app-shell tests；前批mobile-nav-results.json | 真機／讀屏／跨瀏覽器 |
| UI-27 Template層級 | 展示與來源分層、長內容展開、已知規格、中文介面標籤 | presentation／templates／source-modal tests；remaining報告 | 六寬度新截圖、來源／影片播放／長內容操作 |

完整 Node suite 458／458；本批 JS／CSS／HTTP證據見 remaining/source-verification.json。這些檢查不替代視覺驗收。

Legacy Analyze未獲改造核准，維持既有獨立頁，未私接SPA。Progressive blur、全站材質／motion效能整合屬 Phase 6，沒有開始。Folder／Delete／Undo既有修改保留；本批未變更其行為。

驗證台：[工作區](http://127.0.0.1:4324/phase5-harness?width=390)、[Discovery](http://127.0.0.1:4324/discovery-harness?width=390)。細節與待驗證清單見 [剩餘項目交付](remaining/README.md)。
