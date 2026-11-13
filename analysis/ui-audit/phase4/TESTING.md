# Phase 4｜測試結果與未驗證範圍

## 自動化

最終：**427／427 通過，0 失敗**；targeted suite **72／72 通過**。9 個 JS、22 個 CSS 語法檢查與 whitespace 檢查通過，5 個保護檔案雜湊一致。這些不是瀏覽器視覺驗收。

最終執行：

```powershell
$testFiles=(Get-ChildItem tests -Filter '*.test.js').FullName
node --test @testFiles
node analysis/ui-audit/phase4/verify.cjs
```

完整結果見 [test-results.txt](test-results.txt)，來源／語法／whitespace／保護雜湊見 [source-verification.json](source-verification.json)。最終 suite 應以該檔案尾端的 pass／fail 計數為準；早期 `target-tests.txt` 中曾失敗的 tag 與負零 assertion 不屬最終結果。

新增／更新的行為覆蓋：

- legacy geometry API 委派 canonical width model，Default／Compact 相同寬不產生不同幾何。
- preview frame16:9、tab／notch2:3、Dense minimum／coarse minimum；readonly anatomy 無 button、anchor、id。
- Trash 真實起點／mouth 終點、60／120Hz 終點一致、每 frame 沒有 layout read、延後第一個 RAF、強制 complete。
- abort／detached preview 不再寫 stale frame；Reduced Motion 與執行中 preference change 釋放 listener／RAF。
- Account trigger settled 後仍隱藏、回程 surface presence 從1到0；其他 adapter 的 keepTrigger opt-in 相容。
- Alert／Confirm／Prompt 的退出端點1→0、指定 easing、scrim 無 alpha 動畫；標籤 modal 在 page module 載入後才提供 shared animation 的載入順序；既有 Dialog／Restore／Router／Cover／ProjectStore／Undo 測試回歸。

保護檔案：`features/projects.js`、`global-toast.js`、SPA Router、Dashboard HTML、Dashboard page JS，與本輪 baseline 相同。這是範圍保護，不代表所有未實測行為已驗收。

另保留 `regression-timing-investigation.txt`：完整回歸曾因固定20ms觀察非同步儲存而過早斷言，導致後續modal測試狀態連帶失敗。已改成有上限地等待實際退出狀態，並斷言背景alpha不變；沒有延長正式動畫時間。最終完整重跑結果為427／427。

## 瀏覽器已做的局部檢查

- 修改前真的開啟 Dashboard／Projects／Delete confirm 並保存390／1440截圖。
- 初版 Folder 的375／390／1440三頁DOM量測；390下兩頁宿主寬差≤1px，History修正成雙欄。
- 9:16、1:1長名、多標籤與無封面 fixture 進入正式 SPA；主 title 是 link，History title 是 restore button。
- 真 readonly preview 寬172px／frame160×90／零互動元素；確認 isolated delete、disabled controls、Toast與一筆 mock DELETE。
- Live trace 也揭露背景 RAF 延遲問題，已據此修正時鐘；該舊 trace 不計為通過。

## 待驗證（不計為通過）

1. **最終版本全套重拍／視覺回歸**：最後Shell校準、readonly option／ambient、clock／complete，以及帳戶透明材質板尚未重新用瀏覽器確認。
2. **768／1024／1920**：原白名單問題的結果已作廢；修正host後的真正尺寸驗證尚未完成。
3. **Account Morph**：實際展開原按鈕不可見、關閉時材質／陰影／字樣連續性、快速中斷與 SPA 切頁的最終畫面；目前只有 Node lifecycle／frame 測試。
4. **一般中央彈窗**：最終實際退出曲線與背景 blur trace，尤其返回原頁面時的視覺時序；目前三種 service 分支已做自動化驗證。
5. **真機／瀏覽器**：iOS Safari、Android、Firefox、coarse pointer 44px target、safe-area、font scale與低階手機 paint／GPU成本。
6. **真正刷新率與長時間壓力**：60／120Hz是控制時鐘單元測試；不是120Hz真機效能保證。
7. **完整端到端動畫清理**：取消、極早確認、resize／旋轉、斷線、後退、頁面卸載時的最終畫面；以及Cover進入／回程，需瀏覽器回歸。
8. **正式 Auth／資料庫**：未操作正式刪除、復原或Undo；本輪只使用isolated mock。既有API／隊列行為用原測試保護，不擴張宣稱。
9. **D05**：依本輪「不改Undo」的明確指示保留原行為；未實作或驗收跨頁完整五秒的新契約。

## 安全重跑入口

`http://127.0.0.1:4319/phase4-harness?width=390`。啟動方式見README。先登入隔離工作區，再準備fixtures；比較三頁按鈕輸出DOM量測。需檢查 `report.width` 與 `report.viewport` 同時等於指定值，不能把fallback寬度當作通過。

本輪沒有新增框架、依賴、Skill、commit或push；目前停在Phase4的實作與待視覺驗收狀態。
