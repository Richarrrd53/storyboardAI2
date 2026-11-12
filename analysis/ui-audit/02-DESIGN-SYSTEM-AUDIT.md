# 02｜Design System 現況與 v4.0 決策

稽核日期：2026-11-11～2026-11-12（Asia/Taipei）。基準：本地目前工作區，含既有未提交 Landing 變更；不是 GitHub HEAD 的遠端部署稽核。

## 判斷

已有成熟雛形：Primitive → Semantic → Component token、共用 shell、獨特 Folder、電影膠卷與 floating acrylic。問題是「元件契約未成為唯一真相」：不同頁祖先 CSS、inline geometry、legacy alias、JS 狀態與 portal 同時決定外觀。v4.0 應整理所有權，不應重套新主題。

Hallmark preflight：保留 `--blue-600 #2563eb`、深海軍藍 shell `#0c1324`、冷白 canvas `#f8fafc`、Noto Sans TC、Squircle、Pill、Folder、膠卷與流體動態。外部資料只提供架構觀點；不導入 React／StyleX、不修改 router。

## Foundations 實際來源

|Foundation|現有規範|具體問題／v4 建議|
|---|---|---|
|Color|`tokens/primitives.css`、`colors.css`、legacy aliases|品牌藍、slate、sky、gold、danger 等已具角色；頁面仍有 literal 色。保留品牌而非照 Hallmark 禁用現有藍系。新增 surface/on-surface 配對與 contrast 驗證|
|Typography|Noto Sans TC display/body；DM Sans fallback；Syne brand；DM Mono metadata|12/14/16/18/20/24/30/36/48；400～900。Folder meta 手機另用 10/11px、menu 12.5px、頁面標題各寫。建立 page-title、section、card、body、meta 五個語意角色，不全站改 500 字重|
|Spacing|4px scale：0/4/8/12/16/20/24/32/40/48/64/80/96/128|存在 3px gap、7px menu padding、14px margin，並非一律錯；先對應 optical adjustment，其他回到 scale|
|Sizing|button min38px、mobile nav64px、item48px、create54px|統一 control sm36、md40、lg48；touch hit44～48；sm 只限密集桌面且有命中補償|
|Border／radius|4/8/16/24/32/40、pill999、circle50%；continuous fallback + squircle @supports|同語意不可直接把 16 圓角換 27 squircle 當等價數值；需 screenshot 校準光學曲率。Folder fillet 必須局部 token，不能改 `--radius-lg` 污染子樹|
|Shadow|elevation0～4、overlay、floating shadow/highlight|Folder、Morph、User Panel、QC 又各寫 shadow。以 raised1、floating2、modal3 做角色映射，媒體不任意加 glow|
|Transparency|opacity tokens + rgba 配方|nav saturation250%、floating120%、menu .96、User Panel 自有背景。固定同用途 recipe，允許 media scrim 例外|
|Blur|6/12/20/24/28/50px；floating 10px／9px 重定義|不要只統一 blur 數字；由層級、重疊面積與背景複雜度決定。Header progressive 是 edge treatment，不是整頁材質|
|Motion|120/200/300/500/800ms；jelly120/420；aliases160/280/460|aliases 與 primitives 不一致；Morph480/440、sys400/1500、多段 JS timers。改為 feedback/enter/exit/morph/ambient 五類，詳見 05|
|Breakpoints|480、768、1024、1439/1440|Landing900、Settings800/520、各頁其他 media；可以有內容驅動例外，但 shell nav 閾值應唯一，JS 同步|
|Layers|0/10/100/200/300/400/500/600/700/800/20000|menu10000/10001、mobile nav10000、user panel10050 等逃離階梯。先做 OverlayManager 與 stacking map，再遷移數值|
|Containers|workspace max1440 token；Landing1280；Settings1080|不同內容可有不同 measure，但 Settings margin0/gutter0、工具頁過大 marketing hero 沒有組合規則。保留 full-width editor，browse capped，forms narrow|

## 重複 token 與 cascade

詳盡可追溯機器清單：[token-inventory.json](token-inventory.json)、[source-inventory.json](source-inventory.json)。這是文字掃描，不是 AST、不是實際套用次數，也不是 Hallmark pass 分數。113 個 CSS／非 vendor JS／HTML 檔案中，文字命中 `!important` 1398、`transition: all` 112、非 prefixed backdrop 宣告62、z-index196、media75。包含非正式頁與註解，不能直接當 1398 個缺陷。

- `--ai-dock-width`：components.css 的380px，在 aggregator legacy block 被 clamp(300px,21vw,360px) 蓋過。需將 compatible alias 指向 canonical component value。
- `--surface-floating-blur`：blur.css 10px → components.css 9px；實際 nav 再以 !important 5px/250% 蓋過。這是同語意三個 owner。
- `--surface-floating-shadow/highlight`：shadow.css 與 components.css；部分相同、部分新增 inset，應拆 composition，而非判定所有重複都應刪除。
- `--card-bg/border` 同值 aliases：可保留作 deprecated bridge，列移除條件。
- `--radius-continuous-*` 的 @supports 重定義是有意 progressive enhancement，**不是應刪除的重複**。
- Discovery Settings 使用 `--blue`／`--lime`，目前 public/css 沒找到定義；例如 focus outline、provider-link、return-search 宣告會失效。必須遷移成 semantic token。

## 風險結構

1. `style.css` 在 @import components 後再次定義 `.btn`、表單 focus reset；頁面 CSS 再覆寫。檔案名稱叫 component 不代表具有 cascade 優先權。
2. `shell.css` 也重複 input outline reset，`!important` 抹掉部分 focus；Projects 用 `:focus-within` 補回但其他欄位未必有。
3. `.project-card.variant-compact` 在 dashboard.css 是廣域選擇器，即使 portal 的 confirm clone 也會受影響。
4. Folder mobile geometry 只限 `:is(.projects-body,.home-recent-grid)`，回收桶 `.history-body` 與 Dialog portal 排除。
5. `PageAssetLoader.removePageCSS` 已有載入／移除生命週期。應測 A→B→A 與 CSS removal，不能因一次直達正確就假定跨頁無污染。

## v4.0 token ownership

Primitive（品牌物理值）→ Semantic（用途與 on-color）→ Material（solid/raised/acrylic/floating/media）→ Component（anatomy/density/geometry）→ State（hover/focus/open/busy）。頁面只擁有 layout slots/gap/measure，不擁有 Folder shell／Button 材質。Variant 改契約允許的欄位，Context 不得透過祖先補完內部結構。

## Hallmark 與 Unslop 的獨立結論

Hallmark：最需處理的是 focus/keyboard、menu/dialog contract、跨頁密度與內容階層，不以行銷頁規則要求所有工作區只有80字。既有品牌、材質與品牌動態優先，不執行重構、theme draw 或 CSS stamp。

Unslop 第二輪：通過 token 命名仍不足。Dashboard 鏡頭＋科技線條的 Hero、彩色 QC halo、白色工具卡各有不同視覺重心；該把創作的豐富度放在真實分鏡內容，讓 chrome 安靜。Folder 的物件隱喻值得保留，但 meta 膠囊過多會讓173px卡片像縮小桌面。Settings 的黃綠說明板、原生 Prompt 與電影工作區是三種語言。這些是獨立設計批評，並非要求全扁平、刪除所有彈性或毛玻璃。Unslop 作者 Damir Sokolovsky（[@heydamir](https://x.com/heydamir)），CC BY 4.0。

## 外部參考的採用邊界

參考 [Astryx tokens](https://astryx.atmeta.com/docs/tokens) 的語意角色與 [architecture](https://astryx.atmeta.com/blog/how-astryx-works) 的 composition 思路：將可組合 contract 明文化；不複製其視覺、不安裝套件。這是本專案提案，並非 Astryx 要求 Vanilla JS 使用某套 API。

## 其他Foundation精確基線

- sizing.css：control sm36/md44/lg52px，touch desktop40/mobile44；icon16/20/24/32，stroke1.5/2/2.5；avatar32/40/52。實際元件仍有38px button、42px avatar等偏差。上表v4的36/40/48是待核准提案，不是誤報既有token。
- opacity.css：0/.06/.15/.4/.55/.7/.85/.95/1；disabled不能只降opacity，需配native disabled/aria與cursor語意。
- border.css：.5/1/1.5/2/3px；既有focus-ring以blue400、width2、offset2、白色雙環shadow。問題是採用不一致與contrast未驗證，不是完全沒有focus token；應沿用名稱、校正實際色對與元件使用。

[手機Folder實際對照圖](folder-comparison.jpg)；三欄均來自390px viewport原圖的等比例縮圖。
