# Phase 7｜頁面與響應式QA清單

12類正式頁面／子狀態，六個指定CSS viewport：375／390／768／1024／1440／1920。72個首屏＋展開為504個頁面狀態／寬度組合。這是驗收清單數量，**已新執行瀏覽器案例為0**。

| 頁面 | 正式Route | 本輪HTTP | 需覆蓋狀態（每項六寬度） | 瀏覽器 |
|---|---|---|---|---|
| landing | `/` | 主殼 /main.html 200；隔離 / 仍為QA redirect | opening, product-scroll, workflow-scroll, video-play-pause, leave-return, reduced-motion | Pending |
| login | `/login` | 200；僅本地memory-only shell | default, password-show-hide, invalid-submit, server-error, keyboard-focus, 200%-text | Pending |
| register | `/register` | 200；僅本地memory-only shell | default, inactive-face-inert, password-show-hide, validation-no-submit, keyboard-focus, 200%-text | Pending |
| dashboard | `/dashboard` | 200；僅本地memory-only shell | real-project-hero, empty, loading, error-retry, long-title-200%-text, sidebar-expanded, sidebar-collapsed, account-panel, qc-open-close | Pending |
| projects | `/projects` | 200；僅本地memory-only shell | default, search-no-result, tag-filter, sort, option-menu, keyboard-focus, header-top, header-middle, header-bottom | Pending |
| project | `/project/audit-folder` | 200；僅本地memory-only shell | table, filmstrip-click, filmstrip-drag, shot-editor-cancel, cover-handoff, error-retry | Pending |
| generate | `/generate` | 200；僅本地memory-only shell | story-input, direction-choice-keyboard, direction-disabled, custom-duration42, template-choice, parameters, mock-loading-error-completion | Pending |
| template | `/template` | 200；僅本地memory-only shell | catalog, search, filter-combination, no-result, empty, load-error-retry | Pending |
| template-detail | `/template/phase7-long` | 200；僅本地memory-only shell | long-summary-expand, raw-source-dialog, missing-metadata, unknown-id, resize-return, refresh, back-forward, rapid-return | Pending |
| history | `/history` | 200；僅本地memory-only shell | deleted-cards, empty, restore-cancel, restore-accept-once, restore-error, mobile-back, nav-hidden | Pending |
| discovery | `/discovery` | 200；僅本地memory-only shell | spa-entry, deep-link-refresh, settings-roundtrip, search-empty, loading, error-retry | Pending |
| discovery-settings | `/discovery/settings` | 200；僅本地memory-only shell | deep-link, configured-masked, unconfigured, save-success, read-error-retry, save-error, abort-late-result, keyboard-focus | Pending |

此清單還不包含所有跨頁組合與真機手勢，不能宣稱504即為產品全部狀態。Modal／Prompt／Dropdown／User Panel／QC、短橫向、safe-area／軟鍵盤、hover／focus／touch、深連結／back-forward，須依對應component與Phase0 checklist追加。

非正式範圍：dev-test、test-folder-card、landing_demo、index_backup、generate-template及舊Analyze。舊Analyze沒有核准的新SPA入口；不測上傳或正式分析API。未將Demo當正式頁。

本輪路由來源重新核對 spa-router pageDefs／PageHost／AppShell 與 server/vercel既有對應；沒有重寫Router。API／生成後台結果及第三方影片需要額外受控整合環境，目前只跑VM/mock狀態測試。
