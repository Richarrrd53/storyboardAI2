# Phase 5 剩餘項目｜Generate／Template 交付

日期：2026-11-13。依 Phase 0 核准範圍完成剩餘實作；**瀏覽器驗收尚未完成，Phase 6 未開始**。保留原有工作區修改，未 Commit／Push，未操作正式帳戶資料。

## 修改摘要

### Generate（UI-22）

- 新增共用 `ChoiceGroup`，由風格、比例 ChoiceCard 與時長 Segment 共用 radio 語意及 roving tabindex。元件只管理焦點與鍵盤，既有 Generate handler 仍唯一擁有值更新。
- Tab 進入單一有效選項；方向鍵循環、Home／End、RTL；略過 disabled／aria-disabled／disabled fieldset／hidden。Enter／Space 沿用原生 button，沒有額外合成 click owner。
- 比例移除 inline onclick，避免與掛載事件重複執行。頁面 AbortSignal 及重掛載釋放 keyboard listener，風格卡重建後重新掛載。
- ChoiceCard 保留形狀預覽與內容層級；時長使用共同軌道。44px 最小高度、立即 focus-ring、selected 狀態保留於 hover。沿用品牌與現有語意 tokens，沒有新增 Morph／彈跳。
- 42秒等非預設值不被強制改回30秒，顯示目前設定；只有使用者選取預設才更新值。合法既存字串風格索引會正規化，無效索引才使用推薦值。

### Template（UI-09／27）

- 新增 `TemplatePresentation`，列表、Generate 模板卡與詳情共用展示標題／摘要／標籤／已知規格。優先採用明確展示文案，其次從來源擷取摘要；來源衍生內容標為「來源說明摘錄」，不假裝是編輯摘要。
- 顯示層移除來源標題的 hashtag／促銷 URL，摘要不再直接堆疊整份來源描述。原始標題與說明（含空白、換行、URL）完整保存在來源視窗，使用 textContent，不改寫 template 物件、catalog 或生成輸入。
- 長內容可展開並同步 aria-expanded／controls，來源長字串可換行。敘事與來源的介面標籤改為可讀中文，移除兩個無功能的裝飾 emoji；來源原文與自訂敘事標籤保留。
- 缺少時長／鏡頭數／觀看數明確顯示未提供，不捏造規格；來源外連僅接受 HTTP／HTTPS。內部 timeline 的既有播放範圍 fallback 未修改。
- 搜尋涵蓋展示文案及原始來源。詳情連點返回只發出一次 history.back，等待 route acknowledgement 後才接受下一次；直達詳情仍使用既有 SPA 返回模板列表。

### 驗證台

沿用 memory-only helper，新增 Generate 控制項與 Template 長內容按鈕。補 `/template/:id` 的隔離殼體對應，避免詳情重新整理在驗證台回404。正式 server 路徑未改。

## 測試與保護範圍

- [完整 Node 測試](test-results.txt)：**458／458 通過**，fail／cancel／skip 均0。前次448，本批新增10案例。
- [針對性測試](targeted-tests.txt)：26／26，包含 radio／鍵盤／disabled／RTL／重掛載／abort、實際 Generate ratio handler 值更新、來源原文不變、長摘要、搜尋、連點返回與 Source Modal portal／退出清理。
- [來源與 HTTP 驗證](source-verification.json)：19個 JS 語法、8個 CSS 解析、驗證台 inline script 語法、whitespace 通過；7個入口／資源 HTTP200；隔離 catalog roundtrip 通過。
- 本批基線 SHA 比對：Creation／GenerationTask／TemplateWorkflow／Projects／GlobalToast、正式 server 與 Template catalog 不變；Router 核心 navigate 區塊不變。只新增頁面所需共用資產註冊。
- 前次全套測試曾發現 Source Modal 的 VM fixture 未載入新展示依賴，已補齊真實依賴並增加來源原文斷言；以上458為修正後重跑結果。

上述屬單元／模擬 DOM／HTTP／來源證據，**不等於真實瀏覽器渲染與操作驗收**。

## 驗證台入口與操作

- [工作區／Generate／Template](http://127.0.0.1:4324/phase5-harness?width=390)
- [Discovery／設定](http://127.0.0.1:4324/discovery-harness?width=390)

可將 width 換成375、768、1024、1440、1920。4324為本次更新 helper；舊4320／4323服務仍可能是舊程式版本。

重啟方式（前景執行；需要空閒4324埠）：

```powershell
$env:AUDIT_UI_PORT='4324'
node analysis/ui-audit/phase1/mock-server.cjs
```

1. 工作區先按「登入隔離帳戶並開啟工作區」。不用真實密碼。
2. 按「Generate 單選控制項」：準備42秒隔離 session，進入方向設定；以 Tab／方向鍵／Home／End 操作三組選項。驗證台不提交故事、不啟動 AI；請勿按生成。
3. 按「Template 長內容／原文」：準備兩份 memory-only 模板；搜尋咖啡、預覽、展開摘要與來源，連點返回；可重整詳情及測 back／forward。fixture 在 helper 重啟後消失，需重新準備。
4. 截圖模式隱藏 QA 工具列；重新整理驗證台恢復。
5. Discovery 設定以 fixture-only 字串測 loading／error／retry／返回；不要填真實 API keys。

所有 `/api` 都在本地 helper 終止；沒有 production import／proxy／database。新增控制端點只存在於 `analysis/`，不進入產品。

## 明列待驗證

本輪嘗試開啟本地頁面時，瀏覽器回覆「Local browser access is unavailable for this chat」。沒有改用 headless 等方式繞過，也沒有新截圖。

- **Generate**：六寬度實際排版／觸控／文字200%／focus視覺；鍵盤走完整頁面、隱藏階段不入焦點、disabled與重新掛載、42秒提示；與真實規劃／生成服務整合。
- **Template**：本批新展示層六寬度長來源、原文視窗、展開／收合、缺資料與錯誤；直達／refresh／back／forward／resize／快速返回的真實 history 矩陣；影片播放與外部來源整合。
- **Discovery／Settings**：六寬度、loading／empty／error／retry／晚到結果、SPA前後返回與key不回顯的完整瀏覽器操作，詳見 discovery/README.md。
- **跨頁**：真機 iOS／Android、多點觸控、pointer capture跨視窗、讀屏、Safari／Firefox、reduced-motion實機；Auth200%仍待。
- 此前 Hero／Auth六寬度、Template resize返回及Morph390／1440的截圖只代表當時版本；不得當成本批 Generate／Template 新程式的 After。

正式 Phase 5 視覺退出條件仍待上述證據，狀態為「實作完成／視覺驗收待補」。不因自動測試全過而標記所有頁面 Passed。
