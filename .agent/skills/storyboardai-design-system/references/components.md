# Shared Component Rules

## General rule

Before adding a selector or markup pattern, determine whether the function already belongs to a shared component family. Prefer variants over separate near-duplicate components.

Page CSS controls placement and composition. Shared component CSS controls component appearance and interaction states.

## Button family

Use a small shared family:
- Primary
- Secondary
- Ghost
- Outline when genuinely needed
- Danger
- Icon

Do not create one-off page-local primary buttons. QC glow is not a button variant; it is a creation-trigger effect.

## Card family

Cards may differ by function but should feel related through shared surface, border, radius scale, shadow logic, typography hierarchy, spacing rhythm, and hover behavior.

Recommended families:
- Content Card
- Project Card
- Template Card
- Action Card
- Floating Card

## Project Folder Card (Storyboard Production Folder)

Dashboard「繼續創作」與 Projects 頁面必須使用同一個 **Project Folder Card** component（`public/css/components/project-card.css`）。差異只允許來自 size variant（`variant="compact"` 與 `variant="default"`），禁止建立兩套外觀近似但 CSS 不同的 Card。

#### 1. 核心隱喻與設計概念 (v0.3)
- **隱喻**：「一個裝著分鏡圖、腳本與拍攝規劃的製作資料夾。」
- 資料夾本身代表 Project，資料夾內露出的圖片代表專案內的 Storyboard Shots。
- 互動體驗應呈現「查看／抽出資料夾中的分鏡」之體感。
- 保留深海軍藍 App Shell、冷灰/白 Workspace、Pill 元件、柔和陰影與克制 Motion；不做黃色文具風、不模仿 Windows/macOS 系統 icon、不加紙張紋理。
- **整體比例規範 (v0.5)**：
  - 卡片本體 `max-width: 316px`（縮小約 8%，徹底根除橫向扁長感，比例更接近實體檔案夾）。
  - Folder Shell Body 高度維持（`min-height: 136px`，整體 Folder 含 Tab 達 ~160px），整體長寬比收斂至健康的 **2.2 ～ 2.3 : 1**。
  - Grid 欄寬限制：`repeat(auto-fill, minmax(260px, 316px))`。
  - **外層固定 Headroom 留白**：`.project-folder-card` 設置固定頂部留白 `padding-top: var(--folder-headroom, 56px)`（Compact 設為 `50px`），專供 Preview Zone 容納靜態露出與 Hover 抽出，絕不依賴外部脆弱的負邊距，杜絕被上方容器裁切。
  - **底部容器感留白**：`.project-folder-content` 底部 padding 保持厚實（`padding: 12px 18px 26px 18px`，Compact 為 `10px 16px 22px 16px`），使 Folder 呈現真正容納企劃資訊的容器層次。
- **純粹中性 Hover 規範**：Card Hover 時 Title 與外框維持自然中性沉穩，嚴禁變為高亮藍色（維持純黑/深海軍灰文字與柔和陰影）；Option Menu Hover 亦維持高透光霧面淡灰（`rgba(15, 23, 42, 0.06)`）與中性深色字，不得轉為藍色。

### 2. 元件層次架構 (v0.5 Preview Zone & Single Shell Architecture)
```
.project-folder-card (.project-card) [max-width: 316px, padding-top: 56px headroom]
├── .project-folder-preview-stack (Preview Activity Zone，height: 140px，margin-bottom: -46px，z-index: 10，overflow: visible)
│   ├── .project-preview-secondary (多鏡頭時露出後方第 2 鏡頭，右傾 +5deg，完全維持既有尺寸與動態，z-index: 10)
│   └── .project-preview-primary (主封面，依 Landscape 95% Boost + Continuous Depth Curve 計算，z-index: 20)
│
└── .project-folder-shell (純粹前層資料夾本體，min-height: 136px，z-index: 30)
    ├── .project-folder-header-row
    │   ├── .project-folder-tab (佔寬約 74% 的 Folder Tab，右上帶平滑 S-curve 反角)
    │   ├── .project-folder-shelf (中段水平過渡線)
    │   └── .project-folder-notch-wrap (佔寬約 26% 的 Option 缺口區域)
    │       └── .project-option-slot
    │           └── .project-option-btn (48x24px 雙圓點膠囊按鈕，background: var(--surface-folder)，stopPropagation)
    │
    └── .project-folder-content (padding-bottom: 26px 留白)
        ├── .project-updated (相對時間，如「2 天前編輯」)
        ├── .project-title-wrapper (右側漸層 Fade Mask)
        │   └── .project-title (單行不換行，實際 overflow 時於 Hover 啟動平滑往返滾動，Hover 不變藍)
        └── .project-meta
            ├── .project-meta-pill.project-meta-shot (如「4 鏡頭」)
            └── .project-meta-pill.project-meta-ratio (如「直向 9:16」、「橫向 16:9」、「方形 1:1」)
```
* **架構鐵則**：
  1. 圖片層（`.project-folder-preview-stack`）與資料夾外殼（`.project-folder-shell`）必須分離，外層容器絕對不得設為 `overflow: hidden`，以保證 Hover 抽卡動態能自然伸展。
  2. 專案頁與歷史頁外層容器（`.projects-body`, `.history-body`）設置 `padding-top: 24px`，確保第一排卡片的 Primary Cover 與 Hover 抽卡狀態絕不被 content-header 遮蔽或被動態漸層遮罩裁切。
  3. Header 寬度維持約 74%，Option Button 位於 26% 缺口處，按鈕與 Tab 曲線間距（Gap A）及與下方資料夾本體間距（Gap B）保持視覺平衡一致（~10–14px）。
  4. **Secondary Preview 完全保持現有規格**（尺寸、旋轉角度、位置、Hover 動態與 z-index 邏輯皆不受 Primary Cover 影響）。

### 3. Tokens 與外型規格
- `--surface-folder`: `#F8F9FB` (`var(--color-surface-secondary)`)
- `--surface-folder-border`: `var(--color-border-subtle, rgba(203, 213, 225, 0.85))`
- `--surface-meta`: `var(--color-surface-tertiary, #F1F5F9)`
- `--folder-text-primary`: `var(--color-text-primary, #0F172A)`
- `--folder-text-secondary`: `var(--color-text-secondary, #64748B)`
- 大圓角（Shell 20px，Tab 18px，Preview 14px），橫向構圖。
- **Option Button 色彩與 Folder Front Shell 統一**：
  - Option 按鈕常態採用 `background: var(--surface-folder)` 與 `border: 1px solid var(--surface-folder-border)`，搭配內凹微光澤 `box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6)`。
  - Hover 狀態輕微浮起：`background: var(--surface-folder-highlight, #FFFFFF)`，邊框與外陰影加深。Folder + Option Button 視覺上屬於同一個實體物件系統，而非外掛的白色 Floating Button。
  - Option Menu 維持獨立浮動層（`rgba(255, 255, 255, 0.96)`, blur 14px），兩者層級分明。
- **Unified Preview (Default) & Hover Ratio Reveal Morph (v0.4)**：
  - **Default（整齊統一眼界）**：所有專案 Primary Cover 預設採用一致尺寸的橫向 Preview（~2.25 : 1 構圖比例，寬度約 Folder 內寬 92%~95%：Default 為 **282px × 125px**，Compact 為 **254px × 113px**；露出高度約 58px / 46.4%）。預設狀態允許 `object-fit: cover` 裁切，徹底消除因直幅 9:16 過窄像書籤或高低不齊導致的 Grid 雜亂。
  - **Hover（抽出並 Morph 回真實比例）**：滑鼠懸停時，Primary Cover 向上抽出並平滑形變（Morph）回專案真實比例（9:16、1:1、4:3、16:9、21:9）：
    - 9:16 Portrait：展開為 94.5px × 168px，視覺重心微偏左（`--expanded-x: -18px`），旋轉 -4.0deg，避免居中書籤感。
    - 16:9 Landscape：展開為 282px × 158.6px，`--expanded-x: 0px`，旋轉 -5.0deg。
    - 1:1 Square：展開為 139.6px × 139.6px，`--expanded-x: -8px`，旋轉 -4.5deg。
  - 由獨立工具函式 `calculateProjectCoverGeometry({ aspectRatio, variant, isMobile })`（相容別名 `calculateBalancedPreviewSize`）計算 `--collapsed-*` 與 `--expanded-*` 變數並綁定至 inline style。
  - 抽出距離 `hoverLift` 限制在 14px ~ 18px 區間，平滑沉穩。

### 4. 互動與動效規範
1. **Hover Pull & Morph（抽卡與比例還原動效）**：
   - Primary Cover: `transform-origin: bottom center;`，平滑過渡 `width, height, transform, border-radius, box-shadow`（320ms, `cubic-bezier(.4, 0, .2, 1)`）。
   - 預設位移：`translateY(calc(var(--collapsed-insert-depth, 43px) - 46px)) translateX(0) rotate(0deg) scale(1)`。
   - Hover / Expanded 位移：`translateY(calc(var(--expanded-insert-depth, 56px) - 46px - var(--hover-lift, 16px))) translateX(var(--expanded-x, 0px)) rotate(var(--hover-rotate, -4.5deg)) scale(1.02)`。
   - Secondary Shot: 維持 `translateY(-8px) translateX(18px) rotate(6deg) scale(0.98)`。
   - Folder Shell: `translateY(-2px)`，陰影加深，**外框維持中性，禁止變藍，亦禁止本體旋轉**。
2. **Title Overflow 動畫**：
   - 僅在文字寬度超過容器時啟動。
   - Hover 等待 380–400ms 後向左滾動至尾端，停留 650ms，返回起點。滑出時平滑回位，禁止突兀重設；**文字顏色維持中性，禁止變為藍色**。
3. **Option Button 與 Morph 選單**：
   - Option 按鈕尺寸：寬度 48px，高度 `calc(var(--radius-lg) * 1.5)`（36px），膠囊造型 `border-radius: 9999px`。
   - Morph 動畫起訖尺寸必須嚴格與按鈕寬高（48×36px）與膠囊圓角完全同步，消除縮放跳動。
   - Option 圖示採用固定雙點符號樣式，點擊時必須 `stopPropagation()`，不可因點擊 Option 打開專案。
   - 選單展開位置向下落入 Folder 本體腹地（`targetTop = rect.bottom + 8`），採用高透光冷霧毛玻璃（`rgba(255, 255, 255, 0.96)`, blur 14px）。
   - **Menu Item Hover 顏色**：採用中性輕灰背底（`rgba(15, 23, 42, 0.06)`）與深色中性文字（`#0f172a`），**嚴禁使用藍色**。
4. **App-Level Shared Element Return Transition (完整跨頁無縫歸位轉場)**：
   - 轉場元素掛載於全域獨立層 `#transition-layer`（置於 `#page-main` 之外），不受 SPA 頁面替換銷毀影響。
   - **Phase A (Extract 抽出與起飛)**：
     - 點擊卡片，Shell 下沉淡出（`translateY(+32px), opacity: 0`），Secondary 同步淡出（`translateY(+20px) scale(0.92), opacity: 0`）。
     - 克隆封面至 `#transition-layer`，原封面隱藏；Scrim 毛玻璃平滑淡入（`opacity: 1`）。
     - 於拋物線飛行約 40%~45% 進度處（~180ms）啟動 SPA `navigate('project', { id })`。
   - **Phase B (Center Hold 中央等待)**：
     - 封面以拋物線平滑抵達 Viewport 中央（500ms），保持 `position: fixed; opacity: 1;`，絕不提前縮小或淡出。
     - SPA 於封面後方依序完成：專案資料載入、專案骨架與表格渲染、第一鏡頭圖片 decode。
     - 啟動 3 秒超時安全機制（若超過 3 秒仍未 ready，執行 `--motion-ease-anticipate` 退出動畫作為 fallback）。
   - **Phase C (First Shot Ready & Return 歸位)**：
     - 第一鏡頭容器初始隱藏：`.shot-cell-thumb-wrap.is-transition-target { opacity: 0 !important; }`，正常參與表格 Layout。
     - 第一鏡頭圖片 decode 完成並經過 2 個 `requestAnimationFrame` 排版穩定後，取得其精確 `targetRect`。
     - 中央封面平滑飛向並形變落入第一鏡頭位置（380ms，`cubic-bezier(.4, 0, .2, 1)`）：同調變換 `left, top, width, height`、圓角由 `16px → 8px`、陰影由深散落至輕柔。
     - Scrim 同步以 320ms 淡出。
     - 抵達位置後執行 90ms 極致 Crossfade（Transition Cover `opacity 1 → 0`，Real First Shot `opacity 0 → 1`），無縫融合。
   - **全面同步**：Dashboard、`/projects` 與 `/history` 之 project-card 全數統一代碼與行為。

### 5. 禁忌清單 (Anti-patterns)
- ❌ 傳統黃色資料夾、粉嫩文具風、macOS/Windows 資料夾擬真或紙張紋理。
- ❌ Option 按鈕使用高對比純白懸浮塊（破壞與 Folder Front Shell 的一體性）。
- ❌ 16:9 / 橫向封面在未 Hover 時只露出細邊（必須維持至少 40% ~ 50% 可見高度）。
- ❌ 轉場時封面飛到中央就縮小消失、頁面加載完成後第一鏡突然跳出來（必須執行完整 Phase C Shared Element Return）。
- ❌ 第一鏡頭在轉場等待時使用 `display: none`（會破壞表格與 Row Layout，導致 Rect 量測失敗，必須使用 `opacity: 0`）。
- ❌ 整張卡片使用單一 `overflow: hidden` 容器導致圖片無法抽出。
- ❌ Folder 本體過厚或使用雙層前後全夾結構。
- ❌ 在超寬螢幕下無限制撐寬卡片使其過度扁長（必須設定 `max-width: 344px`）。
- ❌ 為不同比例硬寫 CSS 尺寸 preset（必須使用 `calculateBalancedPreviewSize` 目標面積正規化）。
- ❌ 卡片 Hover 或選單 Hover 時將文字或外框變為亮藍色（違反沉穩現代中性美學）。
- ❌ 改動 Secondary Preview 的尺寸、定位或動態。
- ❌ 在 `#page-main` 內部執行跨頁封面轉場（換頁時會被 SPA DOM 銷毀截斷）。
- ❌ 無限跑馬燈 Title（必須為定時單次往返）。
- ❌ 點擊 Option Button 開啟專案。

## Inputs

Use shared input surface, border, focus, typography, control height, and error states. Page-specific forms can change arrangement, not the global visual language.

## Floating surfaces

Popover, bottom sheet, floating menu, option menu, and QC may use matte acrylic. Share border, scrim, blur, shadow, and radius logic where possible.

## Iconography

Use a consistent system icon family. Typical standard icon size is 24px, with 20px or 16px for compact controls. Keep stroke weight and rounded linecap/linejoin visually consistent. Avoid Emoji as permanent interface icons.

## New component test

Before creating a new component, answer:
1. What existing family is closest?
2. Can a variant solve the difference?
3. Which existing tokens should it inherit?
4. Why would a new primitive be necessary?
