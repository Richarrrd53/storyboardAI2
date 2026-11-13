# Phase 4 補充修正與回歸（2026-11-13）

本輪已完成；先前 REQUESTED-ADJUSTMENTS.md 的「未驗證」狀態以本輪列出的範圍更新。

- DialogService 的 Alert／Confirm／Prompt 改用與 Tag Editor 相同的 ModalAnimation。獨立宿主 fallback 也改用 individual scale，避免 computed transform matrix 與 scale(0) 混用。進場 .34,1.59,.69,.99；退場 .31,.01,.66,-.59，400ms；背景 alpha 不淡出。
- SurfaceMorph 的 close 不再於中斷展開時改走直線縮回，從最後呈現幀進入原有圓點／拋物線／還原流程。正在收回時忽略 focus／scroll／resize 的重複 dismissal；路由、modal、destroy 仍可強制終止。480／440ms 不變。
- Account 中繼圓點與所有 SurfaceMorph 共用 20px，依使用者條件不修改。
- Folder tab 移除額外 8px 右側空位，按 responsive option 寬度自動分配；390px 右緣誤差 -0.015625px，1440px 為 0。
- 手機 History 增加 44px 返回連結，正常點擊走 SPA projects；修飾鍵保留原生連結，不改 Router／Undo。

## 自動測試

431／431 通過，無 fail／cancel／skip：[完整輸出](followup-all-test-results.txt)。原本跑馬燈案例沿用上一個測試的 matchMedia=true，現明確指定 desktop，並新增 mobile 不跑馬燈的回歸。
來源檢查：10 JS、3 CSS，protected files 與 whitespace 通過（Phase 5 開始前執行），見 [補充來源驗證](followup-source-verification.json)。原 source-verification.json 與 browser-results.json 保留歷史證據。

## 實際瀏覽器

使用 memory-only 隔離服務，沒有操作正式資料。390／1440 都採樣到四類中央彈窗縮小過程；Project Morph 於160／380／500ms中斷後收回；桌面 Account 同三時點回歸通過。History手機返回專案後，文件載入次數維持0。

- [390px逐幀資料](followup-browser-390.json)
- [1440px逐幀資料](followup-browser-1440.json)
- [手機重新命名畫面](followup-rename-390.png)

動畫範圍包含 anticipation，部分 scale >1 是核准曲線的預期行為；DOM移除後 computed scale=none，不當作動畫數值。
殘餘路徑檢查：sys alert／一般 confirm、Rename、Restore、Logout 都進 DialogService；Tag Editor、Template新增視窗與Shot Editor沿用共用 ModalAnimation。Delete特殊adapter保留。未更改 Hero／Undo。

待驗證：真實iOS／Android的軟鍵盤、Safari／Firefox、實機觸控與低階裝置效能；本輪不是全站視覺簽核。驗證台新增「本輪 Dialog／Morph／返回回歸」按鈕。

## 後續授權

使用者已指示完成後開始Phase 5。Phase 4保護檢查的Hero hash只代表本輪修補完成前；Phase 5對Dashboard的變更另立baseline，不回寫成Phase 4回歸。

Phase 5整合再驗：390／1440的Dialog／Project Morph／Account Morph／History回歸皆通過；另保留focus-out關閉後不搶回焦點的測試。最終全套437／437，見Phase 5報告。手機回收桶返回按鈕[實際畫面](history-back-after-390.png)已保存；Panel→History nav hidden/inert與返回Projects皆實測。
