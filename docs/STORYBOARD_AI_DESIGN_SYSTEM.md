# StoryboardAI Design System 規範手冊 (v1.0)

## 1. 核心視覺 DNA (Core Visual DNA)
StoryboardAI 的視覺體驗建立在三大支柱之上：
1. **Cold Editorial（冷調編導）**:
   - 核心底色：深板岩藍 (`#0f172a`)、深墨灰 (`#1e293b`) 與雪白背襯 (`#f8fafc` / `#fbfbfa`)。
   - 主色調：品牌電光藍 (`#2563eb`) 與高階深藍 (`#1d4ed8`)。全站常態主色嚴格統一為 Brand Blue，避免不同頁面自創紫色或黃色主色。
   - 排版層次：使用 `DM Mono` / 等寬字體標註工程級 Metadata，標題使用特粗幾何黑體 (`font-weight: 800~900`)。
2. **Film Language（電影膠捲語彙）**:
   - 經典齒孔：3:2 圓角矩形齒輪孔 (`.sprocket-hole`)，精準嵌於頂部膠捲條。
   - 膠捲 Header：暗黑調膠捲軌道 (`#18181b`)，搭配單色大寫編號（如 `#PROJECT_01`、`#SHOT_03`）。
   - 16:9 黃金短影音比例：所有縮圖容器嚴格維持 16:9 或 9:16（直式），搭配電影暗部過渡邊界。
3. **Matte Acrylic（磨砂壓克力厚板）**:
   - 高透光毛玻璃：`backdrop-filter: blur(16px~24px) saturate(180%)`。
   - 邊界高光：`border: 1px solid rgba(255, 255, 255, 0.75)`。
   - 深度陰影：多層次漫射柔和投影（Elevation 0 至 Elevation 4）。

---

## 2. Protected Interaction Contracts（四大保護互動契約）
任何重構與後續擴充，嚴禁破壞以下四組互動：
1. **SPA Route Transition & Dynamic Gradient Mask**:
   - 路由掛載點：`<main id="page-main" class="page-shell page-<route>">`。
   - 捲動主權：由 `.content-body[data-dynamic-mask]` 獨立擁有，具有上下動態邊緣羽化。
   - 換頁動畫：平滑漸顯與上浮（`cubic-bezier(0.16, 1, 0.3, 1)`）。
2. **AI Quick Compose (QC)**:
   - 底部常駐觸發膠囊與即時展開輸入板。
   - **Rainbow Ambient Glow 專屬權限**：彩虹流動光暈嚴格限制僅能出現在 AI QC 建立入口（膠囊與行動版中心 + 鈕），標準按鈕（如 `+ 新增分鏡`）一律禁止使用。
3. **Project Option Morph**:
   - 點擊按鈕 → 縮為高能粒子點 → 拋物線彈道軌跡 → 展開為目標操作介面。
4. **Mobile Portrait Floating Bottom Navigation**:
   - 5 個核心導航項目：首頁、我的分鏡、QC 快速建立（中心突起）、模板庫、個人設定。
   - 貝茲曲線彈性水滴指示器（Jelly Motion SVG）。
   - Safe Area 安全底部距離規範保證。

---

## 3. 全站版面與對齊錨點 (Alignment Anchors)
全站各頁面水平與垂直軸線嚴格對齊：
- **頁面最大寬度**：`1440px`。
- **水平左右 Gutters**：
  - Desktop (`>= 1025px`): `32px` (`var(--page-gutter)`)
  - Tablet (`769px ~ 1024px`): `24px`
  - Mobile (`<= 768px`): `16px`
- **對齊成果**：
  - Dashboard 打招呼標題、Hero 卡片、專案列表卡片之左緣
  - Projects 頁面標題與卡片網格之左緣
  - History 頁面標題與卡片網格之左緣
  - Template 頁面 Spotlight 與分類卡片之左緣
  - **完全座落於同一條垂直基準線**。
- **垂直節奏 (Vertical Rhythm)**：
  - Header 下方留白：`var(--content-gap, 24px)`
  - Section 間距：`var(--section-gap, 32px)`
  - 卡片間距：Desktop `24px` / Mobile `16px`
  - 行動版安全留白：`padding-bottom: calc(var(--mobile-nav-height, 64px) + env(safe-area-inset-bottom, 16px) + 32px)`

---

## 4. 共享組件層結構 (`public/css/components/`)
1. `button.css`：全站主要/次要/圓形/文字按鈕。
2. `cards.css`：基礎壓克力卡片與互動卡片。
3. `project-card.css`：標準化電影膠捲專案卡（`variant-compact` 與 `variant-full`）。
4. `filmstrip.css`：膠捲飾條、齒輪孔與剪輯流水號。
5. `acrylic.css`：霧面壓克力、玻璃毛玻璃濾鏡與光影邊框。
6. `badge.css`：規格、狀態、標籤膠囊。
7. `input.css`：輸入框、搜尋列、下拉選單。
8. `dialog.css`：對話框與浮動面板。
9. `bottom-sheet.css`：行動版抽屜選單與拖曳 Handle。
10. `mobile-nav.css`：行動版浮動底部導航列。
11. `option-morph.css`：Option Morph 動畫契約。
12. `quick-create.css`：AI Quick Compose 與 Rainbow Glow 專屬封裝。
