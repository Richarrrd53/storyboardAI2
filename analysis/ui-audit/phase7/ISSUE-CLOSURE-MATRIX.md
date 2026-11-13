# Phase 7｜28項問題的驗收狀態

日期：2026-11-14。**本輪沒有新的瀏覽器驗證，因此沒有將任一項提升為完整Closed。** 實作與單元測試可通過，視覺／裝置條件另計。原始稽核保留於 ../04-VISUAL-ISSUES.md，不覆寫歷史證據。

| ID／項目 | 實作／處置階段 | 本輪判定 | 自動化證據 | 未關閉原因／後續 |
|---|---|---|---|---|
| UI-01 History／Restore | Phase1 | Pending-Acceptance | project-dialog-actions.test.js, project-card-interactions.test.js | 單一確認／取消零request／接受一次；鍵盤與視覺待重驗 |
| UI-02 Delete Confirm／Folder preview | Phase4 | Pending-Acceptance | project-card.test.js, project-trash-motion.test.js | readonly Preview＋共用幾何已實作；新六寬度像素比較待驗 |
| UI-03 ProjectFolder／手機跨頁 | Phase4 | Pending-Acceptance | project-card.test.js, projects-page.test.js, dashboard-page.test.js | 三頁Dense Tier已實作；同viewport≤1px新量測待驗 |
| UI-04 History／Folder density | Phase4 | Pending-Acceptance | history-page.test.js, project-card.test.js | History共用Folder；長列表首卡／header新畫面待驗 |
| UI-05 Rename Prompt | Phase1 | Pending-Acceptance | project-dialog-actions.test.js, dialog-service.test.js | 自訂Prompt已實作；IME／失敗重試有單元，實際鍵盤待驗 |
| UI-06 System Dialog accessibility | Phase1 | Pending-Acceptance | dialog-service.test.js, source-modal.test.js | inert／Tab trap／abort一次resolve有測試；讀屏與實際DOM焦點待驗 |
| UI-07 Folder／Account keyboard access | Phase3/4 | Pending-Acceptance | project-card.test.js, app-shell.test.js | button／link語意已實作；新Tab動線與tag不誤導航待驗 |
| UI-08 Project filmstrip edit click | Phase5 | Pending-Acceptance | phase5-interactions.test.js | 5px後capture有測試；真實touch與click/drag待重驗 |
| UI-09 Template return navigation | Phase5 | Pending-Acceptance | templates-page.test.js, template-routes.test.js | 連點guard已實作；原joint-history根因未完全定論，完整新history矩陣待驗 |
| UI-10 Input／focus tokens | Phase2 | Pending-Acceptance | design-foundations.test.js | QA-01修補placeholder；focus透明合成／對比與實際focus ring仍待驗 |
| UI-11 Sidebar expanded account | Phase3 | Pending-Acceptance | app-shell.test.js | Account Row已實作；短視窗／收展anchor新視覺待驗 |
| UI-12 User Panel／material & lifecycle | Phase3 | Pending-Acceptance | app-shell.test.js, project-option-morph.test.js | 共用account資料與Morph／sheet已實作；手勢／Escape／跨breakpoint待驗 |
| UI-13 Dashboard Hero purpose | Phase5 | Pending-Acceptance | dashboard-page.test.js | Hybrid Hero已實作；前批六寬度有證據，本輪有／無資料與200%未重拍 |
| UI-14 Project menu／Tag menu visual anatomy | Phase2/3 | Pending-Acceptance | design-foundations.test.js, project-option-morph.test.js | 共用Surface／pill規則已實作；touch長選單裁切仍待驗 |
| UI-15 Morph keyboard ownership | Phase3 | Pending-Acceptance | project-option-morph.test.js | 共用keyboard ownership有測試；真實Tab／return focus待驗 |
| UI-16 Morph layout animation cost | Phase3/6 | Pending-Acceptance | project-option-morph.test.js（只有行為，沒有實機效能） | 保留signature；沒有GPU／paint trace，不宣稱性能問題已解決 |
| UI-17 Layer／Portal system | Phase2/3/6 | Pending-Acceptance | dialog-service.test.js, app-shell.test.js, source-modal.test.js | Layer／portal及互斥有測試與Phase6歷史資料；本輪疊層／短橫向待驗 |
| UI-18 Acrylic／shared recipe drift | Phase2/6 | Pending-Acceptance | design-foundations.test.js | 共用recipe與opaque fallback已實作；本輪照片／文字／透明合成待驗 |
| UI-19 Header／progressive blur contract | Phase6 | Pending-Acceptance | dynamic-mask-lifecycle.test.js | Phase6六寬度歷史matrix可追；本輪nested／focus／RO與實機待驗 |
| UI-20 Discovery dual entry architecture | Phase5 | Pending-Acceptance | discovery-page.test.js, discovery-settings-routes.test.js, server-routing.test.js | 正式兩入口已統一SPA；HTTP11條route正常，瀏覽器deep-link／返回待驗 |
| UI-21 Discovery Settings brand/tokens | Phase5 | Pending-Acceptance | discovery-settings-page.test.js | state／error／abort有測試，未使用真key；手機computed color與系統回填待驗 |
| UI-22 Generate／control consistency | Phase5 | Pending-Acceptance | phase5-choice-presentation.test.js | radio／RTL／disabled／42秒有測試；完整keyboard／touch視覺待驗 |
| UI-23 Delete feedback／rollback | Protected Undo | Open-Protected | phase7-regression.test.js, projects-feature.test.js（不等於D05跨頁驗收） | 原router仍flushAll提前提交，commit失敗仍主要console；使用者禁止修改Undo，保持Open |
| UI-24 Delete animation lifecycle | Phase4 | Pending-Acceptance | project-trash-motion.test.js, dialog-service.test.js | elapsed／60–120Hz模擬／abort有測試；實機與API失敗後視覺未驗 |
| UI-25 Auth label／inactive form | Phase5 | Pending-Acceptance | phase5-interactions.test.js, design-foundations.test.js | visible label／inactive inert已實作；placeholder已補對比，200%與讀屏待驗 |
| UI-26 Mobile navigation semantics | Phase5 | Pending-Acceptance | app-shell.test.js | route anchor／aria-current與獨立QC trigger已實作；觸控與軟鍵盤待驗 |
| UI-27 Template content hierarchy | Phase5 | Pending-Acceptance | phase5-choice-presentation.test.js, templates-page.test.js, source-modal.test.js | 展示／原文分層與safe URL有測試；長內容／mixed-script新畫面待驗 |
| UI-28 Analyze／legacy reachability | Excluded legacy | Excluded-Scope | Route inventory；非正式入口 | 舊Analyze未有核准SPA入口，依既定範圍保留現況，不納正式頁驗收 |

上述檔案位於 tests/，均納入本輪471項suite；UI-16的「行為」通過不能推論效能通過。UI-23的deadline測試只驗同頁原有行為，沒有涵蓋或修改跨頁D05。UI-28依核准範圍排除，並非假裝已重設計。

每項原始驗收條件與機器可讀狀態見 issue-status.json。結果：26項Pending-Acceptance、1項Open-Protected、1項Excluded-Scope，0項本輪完整Closed。
