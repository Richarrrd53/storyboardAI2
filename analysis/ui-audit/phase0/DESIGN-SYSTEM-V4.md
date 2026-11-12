# StoryboardAI Design System v4.0 Contract

2026-11-12｜Phase 0 規範凍結；沒有變更 runtime CSS Variables。方向為 **有電影物件感的創作工作台**。必須保留海軍藍外殼、冷白工作區、品牌藍、連續圓角／Pill、Folder 物件感、膠卷／鏡頭、Floating Acrylic、Progressive Blur、幾何 Morph 與有節制的 Jelly。

規範依據：[五項決策](APPROVED-DESIGN-DECISIONS.md)、[411 個變數的既有清單](../token-inventory.json)、[02 現況](../02-DESIGN-SYSTEM-AUDIT.md)。採 Hallmark 的層級、可讀性、RWD、互動檢查，以及 Unslop 的內容焦點／品牌批判；不將簡化當成抹除品牌。Unslop：Damir Sokolovsky（@heydamir），CC BY 4.0。沒有新增 Skill；沒有已安裝的 GSAP Skill，本階段沿用 [既有官方文件研究](../05-MOTION-AND-MATERIAL-REVIEW.md)。Meta Astryx 的 Token→Component→Composition／可存取性思路僅作架構參考，不導入 React／StyleX。

## 1. 規範等級與 Token 唯一來源

**Canonical**：後續新實作應使用的現存來源。**Alias**：與 Canonical 同義的相容入口，保留給舊呼叫。**Legacy**：既有使用仍有效，但不讓新元件增加依賴；遷移需自己的 Phase。**Proposed**：規格中新增的局部參數／待校準值，尚未存在 runtime，不得聲稱已落地。

載入順序維持 `tokens.css → primitives → colors → foundations → components → aggregator :root`。Canonical 是規範 owner，並非聲稱目前所有 computed style 已一致。頁面覆寫、selector specificity、`!important` 和 route asset loading 仍會影響最終值；不得靠調整 import 順序一次洗全站。

|Foundation／Canonical owner|凍結規則與現存值|Alias／Legacy／Proposed|
|---|---|---|
|Color：`tokens/colors.css`|`--color-brand-primary`／`--color-action-primary-default` 用於品牌／操作；`--color-text-primary/secondary/tertiary/inverse`、`--color-border-default/focus/selected` 按語意使用。底色 `--color-surface-shell` #0c1324、`--color-bg-canvas` #f8fafc；品牌 blue-600 #2563eb。|Alias `--primary`、`--text-dark`、`--text-primary`、`--app-shell`、`--canvas` 保留；顏色名 `--peach/--lavender` 為 Legacy 新用法。Settings 未定義 `--blue/--lime` 為缺口，不能當新系統。|
|Surface：`colors.css`／`components.css`|實體 `--color-surface-primary`／`--color-surface-elevated`；Floating 完整 `--surface-floating-*` recipe 以 components.css 為 owner。`--card-bg`／`--card-border`／`--card-shadow` 為 Folder 相容 Component Token。|Alias `--surface-page`、`--surface-panel`、`--surface-interactive`、`--shadow-floating`；不新建另一套全域 glass token。|
|Type：`typography.css`|`--font-family-body` Noto Sans TC／DM Sans；display Noto Sans TC／Noto Sans；brand Syne 限品牌；mono DM Mono 限代碼／時間資料。既有 scale 12/14/16/18/20/24/30/36/48px＋hero clamp；正文16，控制14，小meta12；字重400/500/600/700/900；行高1.15/1.3/1.5/1.65。|`--font-body/display` 為 Alias。10/11px Folder meta 是待遷移 Legacy，不能用縮小所有文字維持雙欄。Hero clamp 僅品牌展示，不套 Dashboard Welcome。|
|Space：`spacing.css`|沿用 `--space-0…` 現存 scale：0/4/8/12/16/20/24/32/40/48/64/80/96/128px。控制內 gap4/8；群組12/16；區段24/32；page gutter 手機16、桌面24/32為 composition 起點。|幾何 fillet／光學對齊可局部非4倍數，需理由；禁止為頁名增加另一套 spacing scale。|
|Size：`sizing.css`|`--control-height-sm/md/lg`＝36/44/52px；Desktop hit40、Mobile hit44；icon16/20/24/32、stroke1.5/2/2.5；一般操作先用20／2。|舊提案36/40/48不取代現有36/44/52。`--account-avatar-size:36px` 為 Proposed 局部參數，D03 已核准約36的方向，非已存在全域 token。|
|Radius：`radius.css`|基礎4/8/16/24/32/40；優先 `--radius-continuous-*`，連續曲率有 `@supports` 對應；`--radius-pill:999px`、circle50%。Floating 用 continuous-lg/xl，Item Pill。|同名連續半徑在 fallback 與 @supports 內重定義是相容設計。不可把 squircle 替代數字直接硬套一般 border-radius。局部覆寫 `--radius-lg` 改全體子樹為 Legacy 風險。|
|Border／Focus：`border.css`|既有0.5/1/1.5/2/3px層級；常態細邊、focus ring2px＋offset2px。沿用 focus token，實測背景對比後調整其 owner。|全域 outline:none!important 不構成契約；新 Dialog 不繼承不可見 focus，採 scoped 可見 ring，不擴大全域 reset。|
|Elevation：`shadow.css`|`--elevation-0…4` 與 overlay；Content1、hover2、Floating使用 recipe；阻斷 Dialog 用獨立 scrim＋raised panel。|`--shadow-soft/card` Alias。高光／邊框只由配方 owner 加一次，不將 floating-shadow、highlight、inset 全部疊上。|
|Opacity：`opacity.css`|0/.06/.15/.4/.55/.7/.85/.95/1，按圖層功能使用；disabled 不代表可把整卡文字一起降到不可讀。|透明度不是可讀性保證；必須在真實照片與明暗背景合成驗證。|
|Blur：`blur.css` 強度；`components.css` recipe|強度0/6/12/20/24/28/50px沿用為 primitives。Floating 目前最終 recipe `blur(9px) saturate(120%) brightness(1.06)`。|blur.css同名10px較早宣告為 Legacy 重複 owner；後續 Phase2 歸一。Nav5px／250%、Menu14px等頁面覆寫待遷移，不宣稱已統一。|
|Gradient／Mask|Floating既有漸層配方、`--button-primary-bg`、film tokens 保留；遮罩由具體 scroll edge／media role 管理，裝飾不能抹除焦點或文字。|Header blur stops 1.5/4/8px＋tint 是既有 signature recipe，還不是通用全域 token；`--edge-mask-*` 若引入一律 Proposed，Phase6 才決定名稱。|
|Motion：`motion.css`|duration instant120／fast200／base300／medium500／slow800ms；ambient12s 只作可選 primitive。standard／decelerate／accelerate／smooth／spring／jelly 等既有 easing 按互動使用。|`--motion-fast160/normal280/surface460` 是既有平行 Legacy duration，**不是數值相同的 Alias**；先維持消費者，Phase6 按語意遷移。`--ease-*` 是對應現存 easing 的 Alias。|
|Layers：`layers.css`|base0、content10、sticky100、nav200、dropdown300、popover400、dock500、overlay600、modal700、toast800、system20000 是語意順序。Portal 限 app iframe document。|現有 nav10000/menu10001/panel10050/sys20000 為 Legacy 實際層；Phase1 做最小 Dialog 相容，Phase2 才統整，不單改700導致 Modal 被 Nav 蓋住。|
|Breakpoints：`breakpoint.css`|480／768／1024／1439／1440 現存邊界。≤768 shell mobile nav；769–1024 tablet；1025–1439 desktop；≥1440 wide。|CSS custom properties 不可直接放原生 media query 條件；JS／CSS 門檻需同步常數。Landing900、Settings800/520是現存內容斷點例外，Phase5/6再驗，不盲目整齊化。|

### 明確解決的重複 owner

1. Floating blur／shadow／highlight 配方的 Canonical owner 指向 `tokens/components.css`；`blur.css` 只擁有 raw 強度，`shadow.css` 擁有通用 elevation。Phase 2 才收斂實際重複宣告。
2. QC `--ai-dock-width` 現在 aggregator clamp(300px,21vw,360px) 蓋過 components 的380px。現況以 clamp 為準；380px是 Legacy 競爭宣告，寬度遷移限 QC 驗收階段，不在 Phase1偷改。
3. `--surface-panel` 現在 Alias 到 canvas，不等於所有 Raised 都該採同底；不要按變數字面猜角色。
4. Proposed 僅可落在對應 Component namespace；新增前先查411項清單，記錄消費者與 fallback。禁止另外導入整套 v4 palette／spacing 並長期並存。

## 2. Material Hierarchy（必須遵循）

|角色|材質／配方|限制與共存理由|
|---|---|---|
|M0 Base／Canvas／Sidebar|Solid 冷白／海軍藍|閱讀與空間框架，不設整頁 backdrop-filter。|
|M1 Content／ProjectFolder／表單|Solid／Raised，elevation0–1|Folder tab、殼體、cover 自身物件深度保留，無需 backdrop；hover可2。|
|M2 Floating Tools／QC／Navigation Overlay|Matte Acrylic family|配方包含 tint、單次 border/highlight、shadow；small controls可 circular variant，不各頁換不同暖冷樹脂。|
|M3 Menu／UserPanel／Floating Sheet|Floating Acrylic Overlay|同 family，長文字提高不透明度；尺寸不同不等於材質 owner 不同。|
|M4 Dialog／Confirm／Prompt|近實體 Raised Modal＋dim scrim|共用外框、字階、內 Pill、焦點。可用輕固定 blur 提供深度，不複製強玻璃背景到表單正文。|
|M5 Cinematic／Landing／Filmstrip／Hero media|依影片／分鏡內容|Control overlay 使用 on-media 字色與可讀底；保留媒體自身對比，不洗成冷白卡。|

M0＋M1＋M2＋M5 可在同頁共存，因框架／內容／浮動操作／媒體角色不同。**同時覆蓋同區域**時，Modal 先關閉非必要 Menu；背景 QC／Nav 不應繼續疊加強 blur／jelly。最多保留一個主要互動浮層；合法巢狀 Dialog 需 stack owner。沒有 backdrop-filter 時用 opaque fallback；corner-shape 不支援時保留 radius fallback。禁止新增每卡一層 backdrop；陰影不能當成修正 z-index 的方法。

Phase6 才根據裝置 trace 決定 header 三階是否降為兩階＋tint。遮罩外觀、可見內容邊界與互動 hit rect 必須分別驗證；pointer-events:none 不能證明沒有文字裁切。禁止動畫大範圍 blur 數值來增加「高級感」。

## 3. Component／Composition 規則

Component 擁有 Anatomy／local geometry／States；Variant 是正式內容或密度差；Context 僅決定空間與 placement；State 不可另建一套造型。Host 不用 `.dashboard .project-card` 一類規則重新定義 Folder 的殼。資料與 CRUD 留在 Feature／Action 層；動畫不擁有 API。

每個共用元件按 [Component Contracts](COMPONENT-CONTRACTS.md) 十個欄位驗收。新 CSS 使用 scoped class／data variant／局部參數，不加全域 `!important` 補丁。與舊 `.btn/.sys-*` 接軌需列遷移 owner 及回歸消費者；不透過刪 class 改變正式功能。

## 4. Motion Language

下表是工程契約／校準區間；既有 signature 在替換前須先記錄 current behavior。共享生命週期不代表統一所有時長。

|互動角色|共用／Signature|時間與曲線規則|完成／中斷規則|
|---|---|---|---|
|Feedback／Press|共用；Nav/QC觸感例外|120ms press，200ms一般release；Jelly release沿用420ms限Nav/QC。小按鈕不加強彈。|pointercancel恢復，disabled不動，不因動效延遲可操作狀態。|
|Enter／Exit|共用 Dialog/Toast|以200/300ms既有token校準，enter decelerate，exit accelerate；大signature可例外。|一個 session resolve一次，timer不與視覺完成各自競爭。|
|Expand／Collapse|共用 Sidebar/QC語法|300–500ms smooth；QC既有560ms列 signature待量測例外。|固定anchor、文字不縮放；快速反向從目前進度接續。|
|Surface Morph|共享核心＋Project signature adapter|先保存現有 open480／close440ms button→dot→surface；不先替成通用300ms fade。|measure→opening→open→closing；中斷讀當下呈現幾何，同progress控制shell/content；不重排trigger占位。|
|Drag／Release|共用手勢契約；Sheet/Nav adapter|跟手無延遲，release約250–420ms按速度／距離有界校準。|超過threshold才判drag，不吞button click；pointercancel與lostcapture清理。|
|Scroll-linked|Header共用／Landing signature|Header映射真實scrollOwner，無獨立ambient；Landing沿用scoped ScrollTrigger與pin節奏。|scroll/resize讀寫分批；不全域kill所有timeline；return route不重複observer。|
|Cinematic／Cover／Trash|品牌Signature|Cover保存既有handoff/origin；Trash Phase4改elapsed-time，約650–900ms只是校準候選，API不綁動畫成功。|owner管理RAF/WAAPI/timeline，finish/cancel有唯一結束；snapshot不含錯誤scale；60/120Hz需測。|
|Reduced Motion|全站共用政策|去除飛行、旋轉、強彈與scroll pin必要替代，0–100ms非空間feedback可保留。|CSS＋JS／GSAP／RAF都需分支；切換偏好收束目前意圖，回呼／aria／焦點不可跳過。|

性能 gate 要記實機／browser／節流、layout/paint/composite／長任務；16.7ms/60Hz、8.3ms/120Hz是參考幀預算，未 trace 不填 FPS。Morph 每幀 layout 的成本是假設風險，不能僅見 width tween 就判定已卡頓。讀取幾何集中 measure，寫入集中 render，dispose釋放事件、observer、RAF、timer與will-change。

## 5. Responsive／Accessibility 與例外

- QA widths：375、390、768、1024、1440、1920；390×844／1440×900為效率比較點。內容可用 inline-size 才是 Folder 計算依據，safe-area／軟鍵盤需另驗。
- D02 手機同寬三頁 Dense＋雙欄；空間不足使用正式 Single/List，不縮小字或外層 Scale。Tablet 欄寬校準不可改變手機決策。
- 文字200%可重排；長中英名、URL、IME、多行錯誤、RTL如未測即標 Pending。Focus ring不可被 mask/overflow切掉。
- 目標 touch≥44px（產品標準），緊密 Desktop hit≥40px；不能聲稱 WCAG AA 一律44px。一般文字對比目標4.5:1，大字3:1、狀態／focus與鄰近底3:1；透明材質合成後再測，文件宣告不等於合格。
- Native語意優先；button含可存取名稱，route用link／aria-current，modal有name／description／focus管理，choice按真實單複選語意。
- 允許例外：Folder物件曲面、Cinematic媒體、Landing900斷點、Nav/QC signature、Native Select／Combobox、手機長Sheet。每筆例外要記 owner／理由／裝置／回歸／終止條件；禁止拿「品牌」掩蓋不可操作或低對比。

所有後續變更透過 [Phase Gates](PHASE-IMPLEMENTATION-GATES.md) 驗收；本文件沒有把現況問題標為已修復。
