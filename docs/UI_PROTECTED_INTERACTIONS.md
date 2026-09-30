# StoryboardAI UI Protected Interaction Contracts

> **Version:** 1.0  
> **Status:** Active & Protected  
> **Rule:** 禁止以任何重構、清理 CSS 或簡化代碼的名義改動或破壞此合約所列之核心互動、JS 邏輯、動畫曲線 (easing)、幾何形變 (morph geometry) 與過渡時間 (duration)。

---

## 1. SPA Route Transition (單頁應用路由與轉場合約)

### 1.1 保護範圍
- **Route Transition:** 跨頁面路由切換的過渡動畫及時序。
- **Page-Main Transition:** `#page-main` 容器的掛載、卸載與淡入淡出（Loading / Blur / Fade）切換時序。
- **Route Loading Transition:** 劇目準備中 Loading 指示器 (`#transition-loader-overlay`) 與幾何曲線路徑動畫。
- **動態遮罩 (Dynamic Mask):** 頂部與底部黑色快門膠卷收合/展開轉場效果 (`#black-mask-top`, `#black-mask-bottom`)。

### 1.2 嚴格禁止
- 禁止重寫 SPA Router 核心流程 (`public/js/spa-router.js`)。
- 禁止改變路由切換的 transition timing 與 duration。
- 禁止移除轉場過程中的中間過渡狀態 (transition states)。
- 禁止變更 easing 函數（如 `cubic-bezier(0.16, 1, 0.3, 1)` 等已調校曲線）。
- 禁止引入第三方或新的 Router 架構取代既有流程。

---

## 2. Quick Create / QC (招牌快速建立互動合約)

### 2.1 保護範圍
- **Desktop QC Trigger:** 桌面端儀表板上的快速建立浮動觸發器。
- **Mobile QC Trigger:** 手機端底部浮動導航中央的建立膠囊/圓形按鈕。
- **QC 展開 / 收合動畫:**
  - 容器從觸發位置展開為 Matte Acrylic 磨砂壓克力浮動對話面板。
  - 收合時的逆向縮放與模糊淡出。
- **QC 輸入框 Morph:**
  - 觸發按鈕平滑變形為輸入框及選項卡片的形變幾何運動。
- **QC Suggestion 依序動畫:**
  - 創作方向與題材靈感標籤按順序逐一浮現的 Sequential Stagger Animation。
- **QC Diffuse Glow & Background Mask:**
  - 招牌彩色擴散微光 (`diffuse glow`) 與背景高斯模糊遮罩 (`backdrop-filter: blur(...)`)。
- **QC → Generate Synchronized Morph:**
  - QC 提交後與 `/generate` 頁面的無縫同軸鏡頭推進與形變對齊動畫。
- **Mobile Keyboard 處理:**
  - 鍵盤彈出時的 Viewport 與焦點調整邏輯 (`.ai-keyboard-open`)。

### 2.2 嚴格禁止
- 禁止改寫 QC 核心 JavaScript 邏輯。
- 禁止簡化或閹割動畫幀數與步驟。
- 禁止改動 transition duration 或 timing curve。
- 禁止改動 morph geometry（形變起點與終點座標映射）。
- 禁止將 QC 拆分或重做成另一套獨立且外觀不符的元件。

---

## 3. Project Option Morph (分鏡卡片選項形變選單合約)

### 3.1 保護範圍
- **⋮ (More Options) 觸發按鈕:** 分鏡卡片上的更多操作按鈕。
- **Button → Dot 形變:** 點擊後按鈕收縮為圓點。
- **Dot Parabola Movement:** 圓點沿拋物線幾何軌跡運動至定點。
- **Dot → Menu Surface 展開:** 圓點平滑擴展為磨砂毛玻璃選單面板 (`menu surface`)。
- **Sequential Blur Entrance:** 選單項目（開啟、編輯、刪除、復原等）伴隨依序模糊與滑入動畫進入。
- **Reverse Blur Exit:** 關閉時逆向模糊收合。
- **Menu Collapse & Restore / Delete 互動:** 刪除倒數、復原 Toast、卡片即時過渡狀態。

### 3.2 嚴格禁止
- 禁止因「CSS cleanup」刪除任何相關動畫狀態或 keyframes。
- 禁止修改拋物線計算與 transform 矩陣過渡邏輯。
- 禁止將其簡化為傳統原生 browser context menu 或平凡的下拉選單。

---

## 4. Mobile Bottom Navigation (手機端浮動導航合約)

### 4.1 保護範圍
- **Floating Capsule:** 手機底部的懸浮膠囊外觀與雙層高光。
- **Center Create Button:** 位於螢幕正中央 (Screen Center X) 的招牌快速建立按鈕。
- **Jelly / Selector Interaction:** 點擊分頁時的果凍感彈性過渡與指示條滑動 (`indicator motion`)。
- **Focus Track:** 導航焦點追蹤效果。
- **QC 聯動:** 點擊中央按鈕直接無縫觸發 QC 展開與蒙版遮罩。

### 4.2 允許與禁止
- **允許：** 調整 token、修復 safe-area 邊距、修正版面重疊與錯位 bug、提升視覺統一性。
- **禁止：** 重寫導航底層互動模型或更換為非懸浮膠囊的傳統貼底導航條。

---

## 5. 合約驗證清單 (QA Checklist)
每個重構 Sprint 完成時，必須逐項驗證以下項目，若有任何行為不符或退化，必須立即 rollback：
- [ ] SPA Route 切換無閃爍、無硬跳頁、加載遮罩正常。
- [ ] QC 桌面端展開/收合/提交正常，無卡頓。
- [ ] QC 手機端展開/收合/鍵盤彈出正常。
- [ ] QC → Generate 同步形變正常。
- [ ] 分鏡卡片 ⋮ 按鈕拋物線形變選單動畫完整。
- [ ] 手機端底部導航中央 Create 按鈕精確置中且果凍動效正常。
