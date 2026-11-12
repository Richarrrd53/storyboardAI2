# Phase 0｜已核准設計決策

日期：2026-11-12，Asia/Taipei。狀態：**規範凍結；尚未實作**。依據：本次使用者 Phase 0 指示及上一輪八份稽核報告。規範適用本地 Vanilla JS SPA，不代表遠端部署已更新。

本文件的五項決策優先於 [06 原提案](../06-REDESIGN-PROPOSALS.md) 與 [07 原路線圖](../07-REFACTOR-ROADMAP.md) 中的候選方案；舊報告保留作研究紀錄。Phase 0 不再修改 Tokens。數值標為「校準候選」時，不能宣稱已獲得像素級視覺核准。

## D01｜Dashboard Hero：A+B 混合（Approved）

- **決策**：A 的工作效率為主，加入 B 的真實分鏡／鏡頭視覺。Desktop 先以約 160–220px 高度校準；左側 Welcome、真實創作上下文，右側少量實際作品畫面。沒有作品時使用產品本身的鏡框／分鏡構圖，不捏造專案、數據或使用者紀錄。
- **取捨**：保留創作辨識，又讓最近專案提早出現。QC 保持主要創作入口；Hero 次要導引可指向既有模板／最近作品，不能另造競爭性的「開始創作」流程。
- **手機**：精簡文字與可選單張代表性分鏡；先保留最近專案的可見空間，避免照搬 Desktop 固定高度。
- **動態**：一次性輕進場；無大型常駐裝飾循環。Reduced Motion 直接顯示完整內容。
- **範圍／階段**：Dashboard layout，Phase 5；不重做 Landing，不改 QC 行為。
- **驗收**：1440×900 與 390×844，以有／無專案兩種資料確認最近專案首列可見；200% 文字放大可增高，不能裁字以硬守高度。
- **未定細節**：右側取用哪個既有媒體欄位、空帳戶構圖、最終高度與裁切焦點，於 Phase 5 靜態稿校準；混合方向不再重選。

## D02｜手機 Folder：同一 Dense Tier、雙欄（Approved）

- **決策**：Dashboard、Projects 同手機寬度採相同雙欄 Grid 與 Dense Folder；History 同一幾何契約。移除以頁面祖先決定造型的依賴是後續工作，不能只加全域覆寫。
- **不可變項**：Shell、Tab、Notch、Preview Zone 的比例計算來源相同；Title、Metadata、OptionButton 相同規則；不使用外層 Scale 修正尺寸。媒體畫幅與卡片 Preview 容器比例分開，直向媒體仍可 contain。
- **變項**：Desktop 容器可選不同列數／密度；Deleted 為狀態，不能生成另一套殼；Preview 為無操作展示 Variant。
- **不足寬度**：依可用 inline-size 與最小內容寬判定單欄／List，三頁使用同一規則。候選最小卡寬 160px、Gap 12px、左右 Gutter 各 16px 時，雙欄最低可用寬 332px／Viewport 約 364px；這是推導候選，須含 safe-area、縮放及長字驗證後鎖定，不能直接當新 breakpoint。
- **範圍／階段**：Phase 4 統一 Folder 與宿主 Grid；Phase 5 Hero 重排沿用該規格。
- **驗收**：375／390 同 viewport、同資料，在三頁量 Shell／Tab／Notch／Preview；除 1 CSS px 四捨五入差外一致。768 平板同頁比較，欄寬上限待校準，不私自切回 Dashboard 輪播。
- **未定細節**：Dense 最小／最大寬、Tablet 空間配置、單欄切換門檻、Title 兩行高度；方向已定，於 Phase 4 幾何樣張確認。

## D03｜Sidebar：Integrated Account Row A（Approved）

- **決策**：展開後 Avatar 約 36px、Username、可選真實次要資料、Chevron；整行單一 button，對齊導覽。收合保持同尺寸圓形 Avatar 與穩定中心，不用放大頭像填空。
- **取捨**：增加帳戶可辨識性，避免為帳戶再建大型品牌卡。無真實方案／工作區資訊時省略，不能填假資料。
- **Panel**：Desktop 從同一 live Trigger Morph；Mobile Bottom Sheet 共用資料、操作與材質族，布局可不同。
- **範圍／階段**：Phase 3；依賴 Phase 2 Surface／Layer 與共用 Overlay 契約。
- **驗收**：收展中 Avatar 不跳點、文字不被 Scale 拉伸；長名稱省略但可存取全名；44px touch hit area、鍵盤 Enter／Space、Panel 關閉後回焦點。
- **未定細節**：真實次要資料選擇、Chevron 尺寸與 Row padding，在既有 Token 內校準；不再重選方案 B。

## D04｜Material by Role；Motion by Interaction（Approved）

- **決策**：Canvas 實體；Content Solid／Raised；Floating／Navigation Overlay Matte Acrylic；Media Cinematic；Dialog 為一致的高可讀 Modal Surface。相同用途不可各頁自由換材質。
- **Morph**：共用 Geometry／Animation／Lifecycle 核心，Adapter 擁有內容與鍵盤語意。外 Squircle、內 Pill。保留 Project Option 的 Trigger→Dot→Surface 品牌連續性；不複製整份 Controller 到每個元件。
- **例外**：Native Select、Combobox、長內容 Bottom Sheet 保留合理原生／語意操作，不強迫相同飛行動畫。例外需記錄角色與原因。
- **階段**：Phase 2 配方／分層；Phase 3 Morph／Account；Phase 6 Progressive Blur 與動態整合。
- **驗收**：共用材質 fallback、透明合成可讀性、動畫中斷與焦點、SPA teardown、Reduced Motion；單一時間／曲線套全站不算合格。
- **未定細節**：配方細調及手機效能取捨需實測；不撤銷 Acrylic／Morph 品牌方向。

## D05｜Undo：同 SPA Session 跨頁完整五秒（Approved，Phase 4 才實作）

現況 `ProjectDeleteQueue` 在 `features/projects.js`，Router unmount 會 `flushAll()` 提前提交；這與新決策衝突。Phase 0 不修改，Phase 1 不順手修正。

|責任|凍結契約|
|---|---|
|Owner|保留 session-level `ProjectDeleteQueue` 作唯一操作／計時 owner；不放到 page mount 或 Toast DOM。`ProjectActions` 協調意圖、Store 管資料、ProjectsApi 管 API。|
|計時|Phase 4 採 `undoOfferedAt`＋5000ms 的 deadline；起點是確認後 Undo 真正可用時。用單調時間來源計算剩餘值，route change 不重設、不縮短。背景計時延遲返回時重算，不承諾延長五秒。|
|跨頁|Page 解除自己的訂閱；Queue 不 flush、不清除。AppShell／GlobalToast 重新訂閱 pending entries，以原 deadline 顯示剩餘時間。不能重新給五秒或只留下不可操作的舊 Toast。|
|多操作|每個 projectId 獨立 entry／operationId，重複 intent 不重設 deadline；Toast 可排列或提供可達的待撤銷清單，不能讓後一筆覆蓋前一筆的可撤銷入口。呈現布局 Phase 4 校準。|
|Undo|deadline 前且 pending 時原子取消 timer、恢復 Store／頁面狀態，零 DELETE request；以 operationId 防止舊 callback 回寫。|
|Commit|deadline 到達後 pending→committing，只發一次 DELETE；committing 不再顯示可用 Undo，不假裝能取消已送出的 API。競態以原子狀態轉移決定唯一勝者。|
|Rollback|API 失敗→failed，恢復可見專案與一致 Store，告知失敗並提供重試；動畫完成不是資料成功。已撤銷 entry 的遲到回應不得覆蓋新狀態。|
|Session 邊界|**登出、重新整理、關閉頁面／工作階段結束：Pending Decision**。現有 reset／clear 行為是現況，不等於已核准新政策；不得推論成持久化、強制送出或靜默取消。|

Phase 4 驗收：t=2s 換頁仍有約3s；t=4.9s Undo 零 DELETE；t≥5s 恰一次 Commit；網路失敗 rollback；多筆、重複點擊、跨頁兩次、過期 Toast、stale session。計時容差記錄在測試，不以動畫時間偷扣。

## 尚待決定與變更管理

五項方向皆已核准。剩餘是各階段視覺校準，以及 D05 session 結束政策；不阻擋 Phase 0 文件交付，也不授權 Phase 1 開始。任何方向性變更須新增日期／理由／受影響契約與回歸範圍，不能透過局部 CSS 偷改決策。

下一步閱讀：[Design System](DESIGN-SYSTEM-V4.md)、[元件契約](COMPONENT-CONTRACTS.md)、[驗收閘門](PHASE-IMPLEMENTATION-GATES.md)、[Phase 1 交接](PHASE-1-HANDOFF.md)。
