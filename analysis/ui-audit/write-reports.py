"""Generate audit-only Markdown from reviewed evidence; never edits public/."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).parent
def code(p,needle):
 s=(ROOT/p).read_text(encoding='utf-8-sig');i=s.find(needle)
 line=s.count('\n',0,i)+1 if i>=0 else 1
 return f'[{p}:{line}](../../{p}#L{line})'
def shot(name):return f'[截圖](screenshots/{name}.jpg)'
def write(name,s): (OUT/name).write_text(s.strip()+'\n',encoding='utf-8')
stamp='稽核日期：2026-11-11～2026-11-12（Asia/Taipei）。基準：本地目前工作區，含既有未提交 Landing 變更；不是 GitHub HEAD 的遠端部署稽核。'
write('01-PAGE-INVENTORY.md',f'''
# 01｜頁面、路由與驗證範圍

{stamp}

## 範圍與證據分級

- **V**：實際瀏覽器目視、點擊或捲動；**M**：獨立 Mock 的正式前端；**S**：只讀原始碼；**U**：本輪未驗證。
- 正式入口是 `main.html → js/main.js → #ifm → html/index.html → spa-router → PageHost → AppShell`。不可把 `html/dashboard.html` 單獨打開的結果當完整產品。
- 主要頁面使用使用者授權測試帳號登入 localhost:3000；沒有保存密碼、沒有執行正式 DELETE／restore／PATCH。Generate 僅填本地草稿、略過 AI 討論到設定頁，沒有生成、儲存或付費分析。
- localhost:4317／127.0.0.1:4317 是 `mock-server.cjs`，沒有載入 server.js、dotenv、資料庫或代理。API 全部在記憶體終止；Mock 登入與刪除不代表正式驗證通過。
- 瀏覽器為桌面 Chromium IAB，viewport 尺寸是真正 CSS viewport；不是實體 iOS／Android。未宣稱 Safari、Firefox、觸控硬體、GPU 效能或螢幕閱讀器已通過。

## 正式入口與子狀態

|產品頁／route|實際來源與入口|驗證與證據|未涵蓋|
|---|---|---|---|
|Landing `/`|`public/html/index.html`；router landing；`landing.js`、`landing-animation.js`|V：六尺寸首屏；390 捲動到產品、流程、功能段落|完整影片播放、所有 pinned 進度、JS 關閉、reduced-motion 實際模擬|
|Login `/login`、`#/login`|PageHost 共用 `html/login.html`、AuthPage|V：1440 真實登入、375 Mock；伺服器連線錯誤狀態曾出現後恢復|忘記密碼完整流程、螢幕閱讀器|
|Register `/register`|相同 AuthPage，showRegister|M：1440／375，僅切換顯示、不提交|建立帳號、條款外部頁|
|Dashboard `/dashboard`|`html/dashboard.html`、`pages/dashboard.js`|V：1440／1920／390／375；QC、Avatar、Sidebar、Project menu|1024／768 真實 Dashboard 未拍攝；新帳戶 empty 僅 S|
|Projects `/projects`|`html/projects.html`、`pages/projects.js`|V：六尺寸；搜尋無結果；標籤 Morph；專案選單|非空標籤選擇組合、所有排序組合、分頁大量資料|
|Project `/project/:id`|`pages/project-detail.js` 組 DOM；`project-detail.js` controller|V：1440／390；表格→膠卷；鍵盤 Enter 編輯器；滑鼠差異|儲存、再生成、所有比例、失敗回滾、手機編輯器鍵盤|
|Generate `/generate`、`?templateId=`|`html/generate.html`、`generate.js`、creation features|V：第一步 1440／390、第二步 390 捲動；停止於開始生成前|Phase 3～5、生成 loading／error／completion、套模板參數|
|History `/history`|`html/history.html`、`pages/history.js`|V：1440／390，真實 deleted cards；M：刪除→回收桶→雙重確認皆取消|正式復原、永久刪除（未操作）、正式 Undo|
|Template `/template`、`/template/:id`|`html/template.html`、`pages/templates.js`、`template-timeline.js`|V：1440／390 列表；1440 detail、逐鏡展開、進階區展開；390 返回異常|建立模板 modal、儲存、進階時間軸全部手勢、搜尋 native 選單完整操作|
|Discovery `/discovery`（SPA 進入）|Shell link 被 SPA 導覽；PageHost 複製 `discovery.html` main 並隱藏其 nav|V：1440 初始／捲動／連線就緒|真實搜尋與付費分析結果、retry、加入模板|
|Discovery `/discovery`（server 直達）|server.js 顯式 sendFile `html/discovery.html`，不是 main.html|V：從 Settings 返回後在 iframe 內呈現 standalone；390|直接 top-level 1440 與 SPA 並排比較待補|
|Discovery Settings `/discovery/settings`|server.js 顯式 sendFile `html/discovery-settings.html`；Discovery status link 可進|V：1440／390；未揭露或填寫 Key，未儲存|設定變更、失敗／成功回應、跨瀏覽器|
|Analyze `/analyze`、`/analysis`|server 有 catch-all，但 pageDefs 沒有對應，parse 回 landing|S：route 不一致；M：`/html/analyze.html` 375 靜態目視|正式 UI 未找到通往舊 upload Analyze 的入口，不能稱為已整合正式頁|

路由證據：{code('public/js/spa-router.js','const pageDefs')}、{code('public/js/pages/page-host.js','const views')}、{code('server.js','const spaRoutes')}。`isDashboardPage` 包含 analysis 不代表該 route 有實作。

## 非正式／舊頁

|檔案|分類|本輪處置|
|---|---|---|
|`public/html/dev-test.html`、`css/dev-test.css`、`js/dev-test.js`|開發測試台|S；排除正式品質統計，後續可做元件展示台|
|`html/test-folder-card.html`|Folder demo|S；可作幾何回歸參考，不能替代 SPA 實測|
|`html/landing_demo.html`、`html/index_backup.html`|Demo／備份|S；不建議同步重構，先確認是否仍部署|
|`html/generate-template.html`、`js/generate-template.js`|舊模板工作流候選|S；未證明正式入口可達，不當成正式新頁|
|`html/analyze.html`|舊上傳分析頁|M 靜態目視，未上傳影片；是否保留待決策|
|`public/js/dashboard.js`|legacy 候選|S；正式 SPA 以 pages/* 與 shell 為準，不直接假定所有舊程式都會執行|

## 狀態覆蓋表

|狀態|結果|
|---|---|
|Sidebar collapsed／expanded|V 1440；expanded footer 仍只有頭像，無 account row|
|User Panel desktop／mobile|V 1440／390；手機 Escape 未關閉，點背景可關閉；未測拖曳速度閾值|
|Project option open／close|V desktop，Escape 測試；M mobile/delete；未做逐幀錄影|
|Tag filter|V 1440，只有「全部標籤」的真實帳號資料；非空標籤內容為 S|
|Search empty|V Projects；Template 真實空結果待驗證，S 可見有專用 empty/error|
|Sort／Native select|S 契約；可見未全面展開；不應改成統一 action menu|
|QC collapsed／expanded|V 375 展開、關閉；390 曾仍為 User Panel，不能把 `qc-390.jpg` 誤當 QC 展開|
|Loading／Error|登入 server error 曾目視；其他多數為 S；真實網路故障回滾 U|
|Hover／Active／Focus|V Folder hover、選單 active、Search focus、編輯器 focus；完整鍵盤走查 U|
|Mobile nav|V 375／390／768；底部 nav 外觀；實機 safe-area 與軟鍵盤 U|
|Header scroll／mask|V Discovery scroll、Template detail scroll、Generate settings scroll；量化 FPS U|
|Delete Confirm／cancel／animation|M 375 confirm/cancel，1440 confirm/動畫；沒有觸發正式刪除|
|Restore double confirm|M 1440 明確重現，2 個 `.sys-bg`，兩層取消，S 根因確認|
|Rename prompt|M，瀏覽器回報 type=prompt，dismiss；原生 prompt 開啟時 IAB 不提供截圖|
|Undo／rollback|S；本輪未完整實測，列入下一階段阻擋驗收項|

## 截圖索引

完整清單見 [SCREENSHOT-INDEX.md](SCREENSHOT-INDEX.md)。檔名中的寬度是拍攝 viewport，並不代表該頁所有互動均在此寬度驗證。截圖是 viewport capture，內部 scroll owner 的完整內容以多張捲動畫面取代假冒 full-page。
''')

write('02-DESIGN-SYSTEM-AUDIT.md',f'''
# 02｜Design System 現況與 v4.0 決策

{stamp}

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
''')

components=[
('Button／IconButton','全站、sys、Template、Discovery','btn-primary / primary、hero-cta、card-apply、up-btn','高度38/40/44/48、focus/disabled 不同；統一 role/size/state','public/css/components/button.css','public/css/style.css'),
('Input／Textarea','Auth、Generate、QC、Settings、editor','pill／rect／composer／key-input','保留語意差異；統一 label/help/error/focus contract','public/css/components/input.css','public/css/auth.css'),
('Search','Projects、Template、Discovery','40px pill／寬 pill／表單欄位','統一搜尋語意、clear/loading/empty；容器寬度可不同','public/js/pages/projects.js','public/js/pages/templates.js'),
('Dropdown／Popover','Project option、Projects tag/sort、QC more、Template native select','action menu／multi-select／single native','抽共用 motion/positioning，保留語意 adapter；內部8px角與pill期望不同','public/js/components/project-option-morph.js','public/css/components/option-morph.css'),
('Alert／Confirm／Prompt','sys、ProjectActions、原生 rename','sys confirm／alert、native prompt','同一 DialogService；Promise 結果型別清楚；確認 owner 唯一','public/js/sys.js','public/js/features/projects.js'),
('Modal／Drawer／Bottom Sheet','tags、shot editor、User Panel、template editor','自有overlay、sys-bg、project-editor','共用 OverlayManager、inert/focus/escape/layers，避免只統一CSS','public/css/components/dialog.css','public/css/components/bottom-sheet.css'),
('Sidebar／AccountTrigger','AppShell、dashboard HTML','collapsed icon／expanded nav','footer只有div頭像；改為可鍵盤操作的account row','public/js/shell/app-shell.js','public/css/dashboard.css'),
('Header／Toolbar','Projects、History、Template detail、Project detail','單列／雙列／editor-menubar','固定 slot contract；scroll owner 與 progressive edge 權責分離','public/css/shell.css','public/js/dynamic-mask.js'),
('User Panel','Desktop Avatar、mobile Profile tab','desktop popover／mobile sheet','內容共用，布局有別；納入floating account variant','public/js/shell/app-shell.js','public/css/dashboard.css'),
('Project Folder','Dashboard／Projects／History／Confirm','compact／default／deleted／clone','共用DOM已存在但幾何context外漏；改component local sizing','public/js/components/project-card.js','public/css/components/project-card.css'),
('Tag／Badge／Chip','Folders、Template、Generate、Project detail','status／taxonomy／selection／spec','分開資訊badge與互動chip；文字/命中/selected不可混用','public/css/components/badge.css','public/js/pages/projects.js'),
('Navigation','Sidebar、mobile nav、auth tabs、template tabs','links被當tabs／button混入tablist','routes用nav+aria-current；局部內容tabs才採roving tabindex','public/js/shell/app-shell.js','public/css/components/mobile-nav.css'),
('Quick Create／Composer','global QC、Generate phase1','desktop capsule／mobile nav create／expanded field','入口共用brief；overlay語意、focus、escape與材料層級清楚','public/js/components/quick-compose.js','public/css/generate.css'),
('Filmstrip／CoverTransition','Landing、Project detail、Project opening','展示film／可拖曳film／flying cover','共用視覺語彙而非同一DOM；pointer capture不可吞edit click','public/js/components/project-cover-transition.js','public/js/project-detail.js'),
('Loading／Toast／Empty／Error','TransitionLoader、generation、Projects、Template','math curve／skeleton／toast／recovery','區分進度與ambient；錯誤可重試，資料空與載入失敗不可混淆','public/js/components/transition-loader.js','public/js/components/global-toast.js'),
('Template timeline／Inspector','template detail advanced、template editor','overview／advanced／drawer','專業密度可例外；統一label/icon與focus，不強套Folder外觀','public/js/template-timeline.js','public/css/template-editor.css')]
rows='\n'.join('|'+ '|'.join([a,b,c,d,f'`{e}`、`{f}`'])+'|' for a,b,c,d,e,f in components)
write('03-COMPONENT-INVENTORY.md',f'''
# 03｜共用元件與所有權

{stamp}

|Component|使用位置|現存 Variant／Context|問題與共用方向|預期修改檔案（本輪未改）|
|---|---|---|---|---|
{rows}

## Contract 應包含的內容

每個元件的規格需列：semantic role、anatomy slots、允許的 variant、尺寸與 material token、hover/active/focus/selected/disabled/busy/error、RWD、motion owner、mount/unmount、資料副作用 owner、測試入口。不能只列外觀 class。

Component＝Folder；Variant＝compact/default/preview/recycle；Context＝grid/reel/dialog；State＝hover/open/deleting/pending/failed。Context 只可決定可用 inline-size 與排列，不能決定 shell 形狀。

## 建議新增模組邊界（需先核准，尚未建立）

- `public/js/components/overlay-manager.js`：單一 top-layer owner、portal、outside/focus/escape/scroll lock、route signal teardown。
- `public/js/components/surface-morph.js`：共用幾何、timeline/interruption，不含任何 project CRUD。
- `public/js/components/dialog-service.js`：alert/confirm/prompt 三種内容契約；不覆蓋瀏覽器全域同名函式作長期架構。
- `project-option-morph.js`：保留 compatibility facade；Projects 的 `openSurface` 呼叫逐步改 adapter；User Panel 只接 account adapter。
- `ProjectCard.geometry`：render/measure/snapshot 三個接口；confirm preview 與 trash flight 依同一份 snapshot。
- `analysis/ui-audit/` 內的 mock 只作測試，不成為產品依賴。

## 已有資產應重用

ProjectCard 已共用 renderer；ProjectOptionMorph 已有 `openSurface`；Projects tag/sort 已使用它；ProjectDetail editor 已有 dialog role、焦點循環與 Escape；Landing 已有 matchMedia 清理；router 已有 AbortController 與 transition ownership。這些都是遷移起點，不能重做後造成新舊兩套長期並存。

## 依賴圖

```mermaid
flowchart TD
  T[Tokens 與 Material 決策] --> O[Overlay 與 Dialog 契約]
  O --> D[Alert Confirm Prompt 與復原確認 owner]
  O --> M[Surface Morph 核心]
  M --> A[Project Menu Tag Sort Account adapters]
  T --> F[Folder component-local geometry]
  F --> P[Confirm preview 與 Trash snapshot]
  O --> P
  A --> L[跨頁 Layout 與 Hero]
  P --> Q[Responsive 與 Regression]
  L --> Q
```
''')

# Each issue records confidence separately from severity. Source-only findings
# intentionally have no fabricated screenshot.
issues=[
('UI-01','P1','History／Restore','M + S / Manual','點擊一張回收桶卡片，未接受任何確認即產生兩個 sys-bg；取消上層後露出下層 undefined。','mock-restore-underlying-confirm-1440','public/js/components/project-card-interactions.js','const confirmFn = global.confirmDialog','非同步 confirm 回傳 Promise 未 await，if(isConfirmed) 立即真；restoreProject 又再 confirm。','只由 ProjectActions.restoreProject 負責一次確認；卡片與menu皆傳送 restore intent。Dialog結果一律Promise，description預設空字串。','復原取消可被繞過第一層；重複視窗與焦點混亂。','卡片、menu、鍵盤、重複點擊都需一次確認；取消零restore request，接受恰一次；不能只刪掉文案。'),
('UI-02','P1','Delete Confirm／Folder preview','M + S / Manual','375px confirm clone 的 offsetWidth230，cover外觀寬203.2、卡片外觀寬184；preview超出shell，幾何不一致。','mock-delete-confirm-375','public/css/style.css','.sys-preview .project-card.lock','clone離開home-recent-grid，失去container geometry；compact廣域min-width230與max-width25vw衝突，scale(.8)只是縮放失真。','preview作正式非互動variant，component-local inline-size推導shell/tab/cover；trash讀snapshot，不再克隆帶state與ancestor依賴的live node。','刪除前辨識失真，動畫跳尺寸。','default/compact、375/390/768/1440、無封面、長題名、tags都驗；preview不可有可操作標籤。'),
('UI-03','P1','ProjectFolder／手機跨頁','V + S / Hallmark + Manual','390px Projects兩欄約173px寬、172px高，preview約161×91；Dashboard為74vw輪播卡，視覺比例與資訊密度顯著不同。','projects-390','public/css/dashboard.css','width: 74vw','同renderer但compact/default、carousel/grid、祖先geometry共同控制。這是layout與density契約問題，不是元件完全沒共用。','先核准手機密度策略；推薦Dashboard與Projects同一雙欄size tier，compact僅減資訊，不另換shell曲率；或明確核准reel variant。','同一專案跨頁像不同物件，標題與meta縮小。','同viewport下殼體比例差≤1px測量誤差；拒絕外層scale修版面；橫向輪播如保留需獨立規格。'),
('UI-04','P1','History／Folder density','V + S / Manual','390px回收桶是單欄大卡且上下預覽接近重疊，與Projects雙欄完全不同；deleted整體淡化。','history-390','public/css/components/project-card.css',':is(.projects-body, .home-recent-grid)','共用手機geometry範圍不含history-body；deleted樣式及舊grid規則另行影響。','回收桶共享Folder local geometry及browse grid；以badge和操作提示表達deleted，避免整卡文字一起低對比。','復原入口辨識與掃讀性較差。','History deleted/default與Projects同一寬度比較；首屏header和首卡不可碰撞；長列表捲動。'),
('UI-05','P1','Rename Prompt','M + S / Manual','重新命名仍是瀏覽器原生prompt，與自訂Alert/Confirm沒有同一外觀。','', 'public/js/features/projects.js','const newTitle = promptFn','ProjectActions同步依賴原生prompt；sys只有alert/confirm的自訂外觀。IAB原生prompt開啟不能截圖，已記錄dialog.type=prompt後dismiss。','新增DialogService.prompt variant：標題、名稱欄位、help/error、取消/儲存；同sys外框/材質/動態；await結果，不以原生modal擋住SPA。','外觀割裂、無法統一驗證與錯誤狀態。','空白/全空格/長名稱/IME Enter/Escape/重複送出/PATCH失敗/離頁/焦點回原卡；不順手改動資料命名限制。'),
('UI-06','P1','System Dialog accessibility','M + S / Hallmark','Confirm開啟時背景仍出現在AX；sys-window未建立dialog role、aria-modal、標題關聯與focus trap。','mock-delete-confirm-1440','public/js/sys.js','function confirm(','自訂global confirm只建立div與按鈕，依timers關閉；沒有標準Dialog生命週期。','以共用DialogService與OverlayManager處理initial focus、inert、Tab cycle、Escape/cancel、return focus；Alert用適當alertdialog。','鍵盤與輔助科技容易失去上下文。','APG鍵盤流程；巢狀dialog合法stack；route abort恰一次resolve；取消不寫資料。'),
('UI-07','P1','Folder／Account keyboard access','V + S / Hallmark','Avatar是clickable div；Folder本體也是div，未找到鍵盤開啟契約。AX只有更多選項是button。','sidebar-expanded-1440','public/js/shell/app-shell.js',"const avatar = document.getElementById('top-avatar')",'click事件提供滑鼠功能，DOM未提供等價button/link語意。','Avatar用AccountTrigger button；Folder用獨立主link與兄弟menu button，避免button包button。','鍵盤用戶無法穩定到達核心入口。','Tab順序、Enter、Space、menu焦點、tag click不誤導頁；不可用整卡button包內部按鈕。'),
('UI-08','P1','Project filmstrip edit click','V + S / Manual','1440膠卷模式滑鼠點編輯鏡頭1後仍停原頁；同一元件Enter可開dialog。','project-filmstrip-1440','public/js/project-detail.js',"scrollContainer.setPointerCapture(e.pointerId)",'scroll容器pointerdown立即capture，可能使click目標被重定向；此為高可信假設，未做事件trace。','超過drag threshold才capture；可互動子元素先排除；click與drag共享pointer session明確狀態。','滑鼠和鍵盤行為不一致。','0/4/6px拖曳、放開、pointercancel、touch pan、scroll後點、編輯器focus，禁止用延遲強行彌補。'),
('UI-09','P1','Template return navigation','V / Manual','1440進detail、展開內容後resize390，點返回模板庫仍顯示detail且URL不變；catalog search存在但不可見。','template-return-stuck-390','public/js/pages/templates.js','function back()','back委派parent.history，與iframe joint-history/resize及多次進入可能相關；未取得完整popstate trace，不宣稱定根因。','先加只讀navigation trace與針對性回歸；同route update/browse restoration修復限component/history契約，不重構router。','使用者卡在詳細頁。','直達/由browse進/刷新/resize/back-forward/連點返回；保留search、category、scroll與focus。'),
('UI-10','P1','Input／focus tokens','V + S / Hallmark','style與shell對input/textarea/select含focus-visible一律outline none!important；Projects另用容器focus-within補回，其他欄位各有不同方案。','projects-390','public/css/style.css','/* ── Global Input Focus Reset','全域reset與元件focus衝突；button focus使用品牌soft色亦需量對比，不是宣告存在就達標。','定義高對比focus-ring semantic token；每個input host提供立即可見focus-within；移除reset前逐元件驗證。','鍵盤可見性、低視力操作。','focus ring與相鄰背景≥3:1設計目標；實際透明合成驗證；native select、密碼show、錯誤欄位一起測。'),
('UI-11','P2','Sidebar expanded account','V + S / Unslop','展開Sidebar後底部仍是一顆42px頭像，沒有姓名/帳戶資訊和明確面板箭頭；左側大片空間未形成完整account區。','sidebar-expanded-1440','public/css/dashboard.css','.side-footer','footer DOM只含top-avatar，不是CSS把現成account row藏起來。','06提案A integrated account row或B workspace identity footer；推薦A，展開才顯示文字，avatar固定尺寸。','帳戶入口辨識弱，展開用途不足。','collapsed↔expanded focus、最短視窗、長名稱、缺圖、panel anchored到live trigger。'),
('UI-12','P2','User Panel／material & lifecycle','V + S / Unslop + Manual','桌面使用白底矩形選項與rotateX+雙scale；手機bottom sheet，Escape觀察未關閉，背景點擊可關閉。','user-panel-390','public/css/dashboard.css','.user-panel.active','桌面transform scale(.33)加獨立scale3；mobile另外手勢controller；不是共享Morph adapter。','FloatingSurface account variant，共用資料與actions；desktop account-trigger morph，mobile sheet布局；Escape/focus契約共用。','手感、幾何與無障礙不一致。','手機Escape與拖曳、點背景、重複開關、resize跨斷點、離頁清除scrim。'),
('UI-13','P2','Dashboard Hero purpose','V / Hallmark + Unslop','1440上方問候+大型攝影機科技背景+三張quick actions先佔約半屏；手機hero240px後再四個入口，繼續創作推到下方。','dashboard-390','public/css/dashboard.css','.home-hero-card','Hero主要導模板，卻像主創作入口；文案抽象，圖像與真實分鏡內容關聯弱。','06方案A精緻工作區為預設、B三鏡頭敘事作可選；保持QC作唯一主創作入口。','主次不清、回訪效率下降。','1440/900與390/844可看見最近專案首列；空帳戶與有專案內容分別評估。'),
('UI-14','P2','Project menu／Tag menu visual anatomy','V + S / Unslop','Project action menu item為28px高、8px角；tag/sort為36px、高10px角，未符合使用者希望的內部pill規則。','project-menu-open-1440','public/css/components/option-morph.css','.global-project-option-menu .morph-item','基礎menu與page覆寫分別決定item padding/height/radius。','外層squircle24～32；內層pill、desktop40/touch44；統一字級14、gap8、selected/disabled。','同一引擎視覺仍不一致，小字密集。','內容長時不裁焦點/陰影；multi-check語意不退化為action按鈕。'),
('UI-15','P2','Morph keyboard ownership','V + S / Hallmark','generic opts.content分支有arrow/Home/End與開啟focus；Project action分支未共享同一鍵盤契約，close未找到restore focus。','tag-filter-1440','public/js/components/project-option-morph.js','if (opts.content) {','通用化到openSurface後仍保留兩條互動分支。','抽KeyboardAdapter、menu/content roles、focus return；action menu和multi-select各自符合語意模式。','關閉後焦點漂移、不同menu鍵盤操作不同。','Escape、Tab、outside、click action、trigger移除、route abort，focus只返回仍存在trigger。'),
('UI-16','P2','Morph layout animation cost','S / Motion Engineering','每幀寫width/height/left/top/radius，且will-change保留多個layout屬性；480/440ms不短。','project-menu-1440','public/js/components/project-option-morph.js','menu.style.width =','為了幾何連續的有意設計；不是單憑使用layout就已證明卡頓。','離線measure final rect後用transform shell+counter-scale content；若保留size tween，限定單一小surface並以實機trace決策。','弱手機可能layout/paint成本高，尚無FPS證據。','低階Android性能trace、interrupt/resume、字形不可拉伸、trigger→surface逐幀連續。'),
('UI-17','P2','Layer／Portal system','S / Manual','layer-nav200/modal700但nav10000、menu10001、panel10050、sys20000；tags又用:has降nav。','user-panel-1440','public/css/components/mobile-nav.css','z-index: 10000','portal與祖先stacking context沒有一致管理；提高數值已成補丁。','OverlayManager統一portal host和stack token，body inert與scroll lock計數；先mapping後改數值。','新popover可能穿過dialog、被nav遮擋。','menu→dialog、QC+panel、short landscape、route change、nested scroll；移除:has補丁前驗證。'),
('UI-18','P2','Acrylic／shared recipe drift','V + S / Unslop','QC強背景模糊、nav5px saturation250%、menu14px白.96、UserPanel白底；同浮層用途有多個材質owner。','qc-open-375','public/css/components/mobile-nav.css','backdrop-filter: blur(5px)','tokens、component、page三層配方未建立層級。','採05的Material Hierarchy；nav/QC/menu共享floating family、可有density透明度variant，dialog保持高不透明度。','材質分散重心、累積compositing成本。','明暗照片/文字背景可讀性、無backdrop fallback、動態背景重疊。'),
('UI-19','P2','Header／progressive blur contract','V + S / Manual','Header依content-body sibling與toolbar.nextElementSibling偵測；捲動時title scale .96、副標max-height變0，多層edge同時存在。','discovery-scroll-1440','public/js/dynamic-mask.js','updateHeader(scrollTop','幾何、捲動方向、header layout與mask集中在同模組，DOM變更容易改錯blur範圍。','明確scrollOwner/header/toolbar registration；top三階blur+單tint為基線，generic scroll保留opacity mask；不直接刪除效果。','標題與內容可能互遮、layout compensation回授；效能仍待量。','首/中/尾scroll、nested scroll、focus scrollIntoView、ResizeObserver重入、最後一項完整可見。'),
('UI-20','P2','Discovery dual entry architecture','V + S / Manual','SPA進入保留shell，Settings返回後變成standalone nav，品牌S漸層圖塊與主站logo不同，左側gutter消失。','discovery-standalone-390','server.js',"app.get('/discovery',",'server獨立sendFile與SPA PageHost clone main是兩條組裝路徑，非單純某個padding寫錯。','保留Vanilla SPA；先決定正式Discovery殼體，統一bootstrap與布局契約；本輪不重寫router。','來回導覽時空間、身份與功能入口改變。','外部deep link、從sidebar進、settings返回、手機快捷、refresh/history全測。'),
('UI-21','P2','Discovery Settings brand/tokens','V + S / Unslop','設定頁硬邊panel、黃綠說明區、無page gutter，與圓潤工作區不同；--blue/--lime未定義。','discovery-settings-1440','public/css/discovery-settings.css','.key-input:focus-within','standalone頁自有色彩與token缺口，沒有共用foundation import。','使用相同semantic foundations，form raised/solid、aside用中性inset；設定必要技術文案保留，focus token補齊。','可讀性、品牌與鍵盤狀態不穩。','key保持隱藏、禁用/錯誤/成功、390/768/1024、link/outline computed color驗證。'),
('UI-22','P2','Generate／control consistency','V + S / Unslop','Generate創作設定的ratio/duration是近矩形choice；其他頁主要pill。這是合理語意區別，但與同頁suggestion、buttons沒有明確density表。','generate-settings-scroll-390','public/css/generate.css','ratio','選取型choice與action button未在DS分開，容易之後全部套pill導致資訊密度變差。','建立ChoiceCard/Segment/Action三類，不強行Morph native/select；字級/selected/focus/disabled共用。','同用途規則不清，未來統一容易誤傷。','多比例、多風格選取、disabled、keyboard與touch，確認單選語意與現有multi選需求。'),
('UI-23','P2','Delete feedback／rollback','S / Manual','DeleteQueue commit失敗主要console.error；先顯示已移至回收桶，5秒後才API；router離頁flushAll提前commit。','', 'public/js/features/projects.js',"console.error('DeleteQueue commit failed:'",'資料狀態、動畫完成、undo窗口與route生命週期沒有對使用者一致的狀態表示。','operation狀態pending/committing/committed/failed；錯誤恢復卡片與toast重試；決定離頁是否保留5秒撤銷，不靜默縮短。','刪除失敗卻顯示成功，視覺與資料不同步；未實測正式失敗。','Mock503/offline/undo-before-commit/離頁/登出/雙擊；API call count與store/DOM一致。'),
('UI-24','P2','Delete animation lifecycle','M + S / Motion Engineering','垃圾桶動畫使用每frame velocity/gravity而非elapsed-time；位移與scale基於固定-232；blur Math.max(s-0.5)未夾0。','mock-delete-in-flight-1440','public/js/sys.js','let velocity =','刷新率影響軌跡；Math.max單參數不做下限，初段可能產生負blur而被忽略；timer1s/1.5s與raf分離。','時間正規化timeline，snapshot local origin與trash target，單session cancel/finish；prefers-reduced-motion跳至結果但保留undo。','高刷新率/中斷可能不一致；本輪非性能benchmark。','60/120Hz、慢CPU、route abort、cancel、reduced-motion、resize、API失敗後rollback。'),
('UI-25','P2','Auth label／inactive form','V + S / Hallmark','Login與Register欄位靠placeholder標示；AX會同時列出兩個panel；password show button沒有可讀名稱。','register-375','public/html/login.html','id="login-email"','切換可能僅以視覺變換隱藏，且未提供持續label與show/hide名稱。','補label與autocomplete；inactive panel hidden/inert；保留filmstrip品牌外框。','鍵盤、表單自動填寫、錯誤後欄位辨識。','登入註冊互切Tab順序、show password狀態、讀屏名稱、錯誤定位。'),
('UI-26','P2','Mobile navigation semantics','V + S / Hallmark','route links以role tab混入create/profile buttons；create tab內另放button，AX可見嵌套操作。','dashboard-375','public/js/shell/app-shell.js',"mobNav.setAttribute('role', 'tablist')",'把頁面導覽、開啟QC、開啟panel混成同一tablist。','navigation landmark+route links aria-current；create/profile獨立button aria-expanded/controls，不假裝頁面tab。','鍵盤/讀屏預期與active state不符。','route current、panel selected、QC開關、縮小nav、focus可見、外層點不重複觸發。'),
('UI-27','P3','Template content hierarchy','V / Unslop','真實影片標題含大量hashtag與來源宣傳連結，featured卡敘述出現FB/IG長URL；detail有多段英文tracked labels與emoji。','template-1440','public/js/pages/templates.js',"const name = t.name",'原始內容與編輯後展示欄位未分層；不是把使用者內容的emoji全部當UI圖示錯誤。','保留原始title/description於來源資訊；展示摘要與taxonomy獨立；不自動改寫來源事實；UI decorative emoji換同一icon。','掃讀成本高，功能內容像資料dump。','中英混排、超長hashtag/URL、無摘要、來源名稱可追溯；不偽造精選理由。'),
('UI-28','P3','Analyze／legacy reachability','S + M / Manual','server有/analyze及/analysis但SPA pageDefs不接受；舊html/analyze可直接讀取，仍是另一套upload頁。','legacy-analyze-1440','public/js/spa-router.js','if (pageDefs[route])','殘留頁與正式入口不同步；Dashboard「AI劇本解析」實際開QC，不是舊upload頁。','由產品決定退役或重新接入；scope inventory註明legacy，不私自新增route或刪頁。','使用者對分析名稱與目的混淆。','核准後再測導航、直達、404/redirect；本輪不上傳、不執行analyze API。')]
sections=[]
for iid,sev,comp,kind,desc,img,p,needle,cause,solution,impact,risk in issues:
 evidence=shot(img) if img else '無實際畫面截圖；僅程式碼／工具回報，見 [Mock操作紀錄](mock-actions.md)（適用時）。'
 sections.append(f'''## {iid}｜{comp}

- **Severity / Finding**：{sev}；{kind}。
- **Page / Component 與現況**：{desc}
- **Screenshot Evidence**：{evidence}
- **Code Location**：{code(p,needle)}。
- **原因／假設**：{cause}
- **Impact**：{impact}
- **Proposed Solution**：{solution}
- **Regression Risk / 驗收**：{risk}
''')
write('04-VISUAL-ISSUES.md',f'''# 04｜具體問題與證據

{stamp}

P1＝核心流程／存取或明確操作缺陷，優先處理；P2＝跨頁品質／架構風險；P3＝內容與清理決策。沒有把美感偏好標成資料災難P0。V/M/S定義見01。性能風險與一次性異常都標明未量測／未定根因，截圖不能證明FPS。

此清單先採Hallmark的可讀性、層級、focus、RWD檢查，再以Unslop重新批判內容焦點與材質；Manual包括router、事件與資料生命週期，無需依賴scanner是否報錯。完整原始碼文字命中另見source-inventory.json，不等於此問題數量。

'''+ '\n'.join(sections))

write('05-MOTION-AND-MATERIAL-REVIEW.md',f'''
# 05｜Motion Engineering 與 Material Review

{stamp}

## Skills 與判定方法

已讀實際 Hallmark v2.0.0 的 SKILL、redesign、gates、responsive、microinteractions 相關內容，以及 Unslop SKILL／refs。未找到已安裝 GSAP Skill：可用技能清單及 `.agents/skills`、使用者 `.agents/skills`／`.codex/skills` 未有相關項目；沒有自行安裝。故本報告是程式碼與瀏覽器 motion engineering review，**不是聲稱執行了不存在的 GSAP Skill**。

只引用官方 [GSAP context](https://gsap.com/docs/v3/GSAP/gsap.context()/) 的 scoped cleanup、[matchMedia](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/) 的 responsive／reduced-motion管理思路。下列架構是本專案提案，不要求 React 或套件升級。Project Option Morph 其實是自製 RAF，不是 MorphSVG；不可把所有Morph都當GSAP問題。

## 現有材質與推薦層級

|層級|使用對象|現況|v4.0 建議|
|---|---|---|---|
|0 Flat / Solid|canvas、Sidebar、表單長內容|冷白canvas、海軍藍sidebar已清楚|保持實體背景；sidebar不鋪毛玻璃，主閱讀區不採大面積透明|
|1 Raised|ProjectFolder、普通卡片、Auth、editor fields|Folder具物件層次；各頁shadow不同|高不透明度0.98～1、細邊、elevation1；Folder shell不需要backdrop|
|2 Matte Acrylic|Floating nav、QC collapsed、適合的浮動工具|9/10/5/14px、不同saturation混用|同family neutral/cool tint；起始研究blur8～12、saturate110～130、底色alpha.88～.96；數字是提案需實測|
|3 Floating Acrylic Overlay|action menu、User Panel desktop、mobile sheet|menu .96/14px，panel白底，sheet另寫|同surface/highlight/border/elevation配方；外大squircle內pill；長內容sheet更高不透明度，不把文字放在強烈變動背景上|
|4 Modal / Blocking|Confirm、Alert、Prompt、shot editor|sys高blur與彈性scale；editor drawer另實作|panel用solid或近solid raised；scrim提供dim、可選輕blur；與floating同圓角語言但不必同透明度|
|5 Cinematic / Media|Landing film、Project filmstrip、選配Hero視覺|深色媒體、影片與frame是產品特色|保留媒體的高對比和質感；透明度只放在必要control overlay，需on-media配對字色|

共存規則：同頁canvas實體＋Folder raised＋nav acrylic＋media深色可合理共存，因用途與層級不同；同層兩個action menu不應一個暖樹脂、一個冰玻璃。邊緣高光由material recipe擁有，避免component又疊第二層inset。先測opaque fallback，再測透明合成；透明token本身不能保證對比。

### 不應直接修改或移除

- Folder shell/tab/notch和抽出預覽的物件連續性。
- Floating Bottom Nav與QC的觸感；不是把所有互動換fade就叫正規化。
- Landing膠卷進入真實產品的敘事；已有scope cleanup與reduced分支，應保留。
- Project Cover飛行接到第一鏡的handoff與取消保護。
- Header progressive edge在捲動內容背後提供可讀性之用途。只有在無效、裁切或性能trace不合格時才降低層數。

## Blur／Mask 實際位置與用途

|來源|用途|判斷與替代方案|
|---|---|---|
|`dynamic-mask.js` renderEdge|top 1.5/4/8px + tint，bottom1.5/4/8px；host是scroll sibling|有合理層次，不是「多層一定錯」。先保存3階baseline；若慢手機paint成本過高，降為2階blur+單一tint，或只tint fallback|
|`shell.css` progressive-edge-blur|pointer-events:none，z19，header/toolbar z20|正確避免遮點擊，但視覺mask仍可能淡化可聚焦內容。明確可讀邊界與scroll-padding，不能僅靠pointer-events|
|`dynamic-mask.js` applyVertical/HorizontalMask|generic scroll overflow提示、carousel邊緣淡出|保留；焦點捲入時需確保不被fade吞掉。最後內容可見性與padding比mask形狀更重要|
|`project-card.css` title-wrapper mask|手機單行長標題右側fade|需要長標題可達完整資訊，手機無hover tooltip。建議容許2行或可存取詳細名稱；fade不作唯一資訊揭露|
|`mobile-nav.css` mask-image及多層track|選取指示器、pill clipping、acrylic|不刪；驗證active/focus track、抬高create hit區不裁切，避免mask把focus ring截掉|
|`generate.css`、QC focus field|展開創作場景、背景退後|保留一次focus變化；不要background filter＋scrim blur＋nav backdrop持續重複強化。關閉時釋放will-change與filter|
|`sys.js` ModalAnimation|全屏backdrop0→16／50px、panel scale|把blur動畫移到預先建立的blur layer opacity交叉淡入，或固定小blur+dim；不直接刪除Dialog的空間深度|
|`landing.css`／GSAP clipPath|電影stage→產品揭示|媒體敘事合理，屬品牌例外；實測clipPath+scale合成成本，手機可用2D transform，不改成無關展示頁|

現況已使用prefixed backdrop/mask，仍不能宣稱Safari完全支援。需在目標browser測 `backdrop-filter`、`mask-image`、`corner-shape`、`color-mix`、container query。`corner-shape`已有@supports fallback值得保留；對不支援的browser以圓角/opaque surface維持結構。

Modal焦點與Escape規格參考 [W3C APG Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)。本提案touch44～48px是產品品質目標，不誤稱WCAG2.2 AA一律要求44px：[Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) 的基準是24×24px並有例外，實際命中區與鄰近間距仍須檢查。

## Motion ownership inventory

|動態|實作與時序|所有權／風險|建議|
|---|---|---|---|
|Landing|GSAP2條scroll timeline，desktop開場2.8vh倍數、workflow2.5倍；mobile1.65/1.85倍；scrub|`initLandingPage`先destroy舊session，AbortController、matchMedia.revert、asset refresh100ms|保留；測A→auth→landing與breakpoint切換，不能用全域killAll誤殺工作區|
|Navigation|NavigationTransition + router AbortController/navSeq + TransitionLoader|已有stale guard與owner；非本次router重寫範圍|只補幾何/overlay teardown契約；路由異常先trace|
|Sidebar|dashboard.css width/layout轉場 + AppShell|layout會重排，關鍵是少量一次變化；不可一律禁layout動畫就用scale扭字|固定icon/avatar anchor；文字clip/fade；主區寬度單一owner、避免多套transition-all|
|Project option/tag/sort|RAF open480/close440；0～80縮dot，30～260飛行，90～350擴張，290顯內容，350～480settle|singleton已存在，會讀live trigger rect，navigation關閉；generic keyboard與project分支不一致|保留trajectory；抽engine，量測後transform shell；內容counter-scale並保持字形|
|User Panel|desktop rotateX/translate/scale(.33)×scale3；mobile translate3d+gesture|AppShell有時間閾值380/280ms避免toggle；缺共用focus/escape owner|同account adapter；觸發不應受魔法延遲誤吃使用者有效關閉|
|QC|collapse過渡560ms、多state field與nav placement|QuickCompose destroy有清timers/事件；背景depth在shell|OverlayManager只擁有modal部分，不重複擁有composer資料；測離頁中斷|
|Bottom nav|translate380／scale320／jelly press120 release420|AppShell sampling跟CSS幾何同步；touch-action:none限制原生手勢需實機測|保留小幅觸感；放大/回彈只限create與selection，不擴散到每個小按鈕|
|Folder hover|default320ms及transform；compact lift14px/rotate-4.5，mobile6～12/-2deg|pointerType touch有排除；title marquee有ResizeObserver cleanup|保留物件抽出，控制幅度；外殼不再額外scale，title reduced motion也應檢查|
|Cover transition|WAAPI/RAF，origin45%100%，cancel/handoff/source-target live rect|已有cancel與reduced分支，是可重用幾何資產|保留；與Folder snapshot整合，不再讀已被mask/transform改形的錯誤rect|
|sys Alert/Confirm|400ms enter/leave、blur、setTimeout；delete1s關閉/1.5sresolve|未統一Abort/finish/resolve；動畫與Promise時間分離|單controller/timeline完成語意，不能靠全域CSS0.01ms以為JS也停止|
|Delete trash|每frame velocity -16/-8，gravity1.1，z/-232縮放|60/120Hz結果不同；RAF沒獨立session取消；source clone幾何變形|elapsed時間或GSAP timeline，來源/目標snapshot，cancel保留資料狀態|
|Loading|math curve/rose/skeleton、text cycling|有品牌特色，但loading不是ambient；需確保停止與announcement|保留一種主要loading語彙，進度/完成不可只靠裝飾動畫|

## 共用 Surface Morph 架構（提案，未實作）

現有 `openSurface(trigger,options)` 已供 Projects tag/sort使用。應從這裡抽出核心，不能把整份Project controller複製到UserPanel。

```text
OverlayManager.open(owner, role, trigger, signal)
  → SurfaceMorph.measure(triggerRect, expandedSize, safeViewport)
  → session.closed → measuring → opening → open → closing → closed
  → interrupt: capture rendered rect + velocity → redirect to newest target
  → adapter: project-actions | filter-multiple | sort-radio | account
```

接口內容：`trigger`、`content`、`placement`、`width/min/max`、`material`、`shape`、`keyboardAdapter`、`dismissPolicy`、`returnFocus`、`onAction`、`signal`、`motionPreference`。CRUD不進engine。Portal限制在iframe app document，不飛到parent；API資料不得進動畫層。

開關連續性：以trigger實際position/shape為t0，保留trigger layout占位；transition shell與content共用progress，文字維持原尺寸；中斷不先remove再重新插入；close用live trigger或安全fallback。Scroll/Resize採明確policy（action menu關閉、account可reposition）；監聽真正scroll owner而非只window，visualViewport變化也納入。

Accessibility：action menu用menuitem、tag多選用menuitemcheckbox或合適selection pattern、account為popover內容；Combobox/native select保留其鍵盤模型。Escape/outside/focus-return/Tab和route teardown統一。手機長清單可用Bottom Sheet adapter，分享材質與語意而非硬套同一飛行軌跡。

Reduced Motion：media query變更時收束到當前意圖的穩態；0～100ms opacity feedback，取消飛行/彈性/旋轉，但仍resolve callback、更新aria與恢復focus。不能只把CSS duration設0.01ms。

## v4 Motion Language 建議值（待核准）

|語意|時間／curve|限制|
|---|---|---|
|Feedback／press|100～140ms standard；release160～220ms smooth|位移≤2px；不可每個按鈕強彈|
|Enter／exit|enter220～280、exit160～200ms decelerate/accelerate|有來源方向；不動畫大範圍blur|
|Expand／collapse|280～360ms smooth|文字不縮放；保留flow anchor|
|Signature Morph|360～480ms；關閉280～400ms|Project button→dot→surface可保留為品牌例外；不能所有小select都表演|
|Drag／release|直接跟手；release250～420ms，有限overshoot|distance/velocity clamp；pointercancel可恢復|
|Confirmation／trash|約650～900ms narrative，API等待另呈現|動畫不是資料成功；error/undo可理解|
|Ambient|預設無循環；只有有語意的loading或media|離屏/hidden pause，減少同頁持續compositing|

性能驗收不是主觀「看起來流暢」：在指定中低階手機記錄layout/paint/composite與長任務；約60Hz目標單幀16.7ms、120Hz8.3ms作預算參考，並標記機型、browser、節流方式。此次沒有trace，不填虛構FPS或電量節省數字。
''')

write('06-REDESIGN-PROPOSALS.md',f'''
# 06｜具體重設計提案（供核准，尚未實作）

{stamp}

設計方向：**有電影物件感的創作工作台**。深色shell界定空間，冷白canvas承載工作；Folder、膠卷和創作內容提供識別；acrylic留給浮動導航與操作層。保留品牌藍、Noto Sans TC與Squircle，不套外部主題。

## Dashboard Hero

|項目|A 精緻工作區型（推薦預設）|B 創作識別視覺型|
|---|---|---|
|用途|回訪者快速繼續創作；Hero作簡短context與可選模板入口|用真實三個鏡頭表達想法→分鏡的創作識別|
|Layout|desktop compact welcome/context band，高160～200px；左標題/短說明，右一個次要模板link；quick actions整合為一列；最近專案提前|desktop左右split，高220～260px；左context，右最多3張真實shot frame+細時間尺；不堆一組假dashboard|
|Material|solid/raised，無全幅攝影機科技背景；保留少量film edge細節|cinematic右區配raised左區，媒體限制在一個視覺焦點；不全區毛玻璃|
|Motion|首次enter一次180～240ms；pointer/focus只輕變surface|hover/focus可做一次鏡頭對齊或active shot切換；不auto-loop，不和QC同時發光|
|RWD|390 header+band約120～160px，quick actions2×2或橫列明確label；最近專案首列在844高首屏可辨|手機只一個代表shot＋序列刻度，高160～200px；不用把桌面3D縮成小圖；減少圖像解碼|
|成本|低：純layout、現有icon、無新API|中：2～3張thumbnail解碼與motion，需lazy/load dimensions與reduced fallback|
|風險|過度素化會失去品牌，需由film/tab語彙與真實內容支撐|若資料不足容易變展示樣板；只能使用現有可讀專案，不生成無關素材|

推薦A，B作經核准的品牌版本而非每次進頁都播放。新用戶empty和有最近專案的回訪者允許不同內容，但不虛構使用者成就。QC仍是主要創作入口；Hero CTA不可和QC競爭同一工作。

## Sidebar Avatar：兩個方向

**A｜整合 Account Row（推薦）**：expanded底部做一個約56～64px高的可按列，avatar36px固定，姓名一行14px、plan/email輔助12px、chevron置右；左右padding12/16，與nav起始基線一致。collapsed保留40～44px hit area，avatar仍36px，隱藏文字而非放大頭像。切換保持avatar中心anchor，文字clip/fade180ms；background hover只一層。優點：辨識直接、資訊完整、易連結Morph；代價：長名稱截斷需可存取名稱及短視窗footer空間。

**B｜Workspace Identity Footer**：expanded底部一塊安靜raised/inset區，第一行工作區或帳戶名，第二行avatar＋「帳戶與設定」按鈕；collapsed僅同一account button。優點：未來可承接工作區切換；缺點：現有產品若無工作區概念會暗示不存在功能，因此不能擅自增加workspace switch。現階段除非產品有此需求不推薦B。

兩案都不把照片放大再附姓名；trigger必須button並有aria-expanded/controls，缺圖用姓名字首，失敗圖不塌陷。

## User Panel＝Floating Surface 的 Account Variant

內容共用：identity區（avatar40、姓名、email可折行、plan次要）→操作群（僅現有可用功能）→回收桶與設定→分隔→登出。Placeholder功能若未接線應明確disabled或移除展示，不能像可用按鈕。

Desktop寬288～320px、外squircle28～32、padding12、identity padding8；內部操作pill高40、gap4；登出用中性文字＋danger hover，不做最大紅色主按鈕。Mobile同順序，full-width sheet，top radius32、safe area、max-height min(80dvh,內容高度)，scroll在sheet內；不要無理由把登出做不同按鈕樣式。

Desktop從AccountTrigger做SurfaceMorph，Mobile採位置合適的sheet enter/release；共用material family與dismiss/focus規則。DOM identity/data綁定同源；mobile布局不等於再寫一套帳戶資料模板。

## Dropdown / Morph Menu Specification

外框squircle24～32、細亮邊＋elevation2＋floating acrylic；padding8、item gap4、icon18/1.7stroke、文字14/500、desktop40/touch44；pill option radius999。Hover中性tint、active略深、selected品牌soft＋check、disabled真disabled+較弱文字；danger只用危險操作行。submenu／combobox另外定義鍵盤，Native Select不強換。

ProjectOption已有openSurface，先抽引擎再改adapters，不複製controller。mobile短action menu可保留anchored morph，內容長或鍵盤輸入時採sheet。內容可捲動時，scrollbar/上下fade不可遮住focus或最後選項。

## 唯一 Project Folder 規格

Anatomy：Root（sizing container）→ PreviewStack（primary16:9 frame、可選secondary）→ Shell（tab、fillet、notch、option slot）→ Content（updated、title、tags、specs）。真正媒體9:16/1:1/21:9以contain置入16:9 cover frame，**不是把外框跟媒體比例一起改**。preview和folder不是兩個各自縮放的物件。

|Token／契約|提議|
|---|---|
|`--folder-inline-size`|由grid/reel slot提供，root自身container-type；不依賴.home或.projects祖先|
|尺寸tier|regular寬260～316px；dense寬160～240px；preview寬160～200px（先做prototype校準）；低於160改單欄或另一種list，不無限縮文字|
|Grid|375：gutter16、gap12→165.5px；390→173px；768避免直接變358px巨卡，視container取2～3欄、單卡上限316；桌面auto-fit minmax時保留最小列寬|
|Cover|width=card inline-size−12～24px（依tier明確），height=width×9/16；讀offset size避免hover transformed rect混淆|
|Tab／notch|tab-height regular36、dense24～32；fillet=tab×2/3；notch由option槽與固定安全gap推導；squircle光學值以@supports校準|
|Shell|高度由內容需求及tier決定；不硬鎖整卡aspect-ratio再把文字塞進去；title兩行slot、metadata固定行高|
|Text|regular title16/22，dense14/20；meta最低12/16為目標；長名稱提供完整accessible name，不靠hover marquee|
|Option|視覺36×28（dense）或48×36（regular），hit44×44且不侵入相鄰卡/拖曳區|
|Surface|raised solid，shadow/highlight統一；deleted狀態不降低整體文字opacity|

正式variants：Default＝完整資訊；Compact＝最多2 tags與較少metadata，但不另換Folder骨架；Preview＝非互動、相同幾何、可省metadata；Recycle＝保留geometry、deleted badge、restore action。Reel/Grid是layout context，不是私下的形狀variant。

手機建議Dashboard與Projects同一dense tier雙欄；若保留Dashboard reel，需使用者明確接受較寬card。兩者可以不同排法，但相同inline-size時shell/tab/cover比例必須一致。禁止外層scale補救grid。

## Delete Confirm／Trash：共用幾何而非第三份DOM

1. 操作開啟前 `ProjectCard.measure(source)` 取得layout size、shell/tab/cover local rect與媒體contain rect，記錄data版本。
2. Dialog用 `ProjectCard.render(project,{{variant:'preview',interactive:false}})` 的同一renderer，在自己的container解析幾何；不保留`is-expanded/is-menu-open`、複製id或可操作tag。
3. `snapshot(preview)`只建立一次presentation layer，sourceRect / targetTrashRect / transformOrigin統一座標系；用inert+aria-hidden，動畫不讀store。
4. Confirm、動畫、API分離：接受後開始operation；visual completion不是資料commit；pending提供Undo，失敗回到可理解的卡片狀態。
5. 取消／離頁／reduced-motion都可終止timeline，Promise只resolve一次；trash lid、folder、scrim共用同一clock。resize重新定位或安全完成，不用硬編碼-232。

Undo政策需先決定：建議跨頁仍保留完整5秒queue window，與現有router.flushAll提前提交不同；這屬行為決策，不能當UI整理暗改。Rollback必須恢復卡片opacity、transform、順序、focus與資料標記。

## Alert / Confirm / Prompt 與雙重復原修正方案

共用Dialog outer anatomy：title、可選description、可選body/input、footer。保留現有大圓角與有節制彈性，將滿屏50px blur降為由material決定的scrim。Prompt新增persistent label「分鏡名稱」、input48px、validation/helper預留行；取消/儲存為一致pill。Enter遇IME composition不提交；busy時避免重複儲存；失敗留在dialog可重試。

採明確結果型別 `{{confirmed:boolean,value?:string}}`，所有caller await。短期先修restore唯一confirm owner；長期不覆蓋window.alert/confirm/prompt，使用DialogService。卡片click只呼叫action；menu restore同路徑；任一取消都0 API；accepted一次只1 API。

## Header／Progressive Blur

保留三階edge當baseline，先規格化header slots（title/actions/subtitle/toolbar）與scroll owner。視覺高度desktop64～80、mobile56～72為起點，長project title可有明確兩列variant；header動態不要把可讀字一起scale .96當唯一策略。可改固定字級＋移位/副標收合，保持flow補償不改scrollTop。

替代A：固定小blur layer＋opacity/tint（低成本）；替代B：既有三階progressive（質感較強，須實機trace）。先比較照片內容背後的對比、底部最後一項可見性，再決定，不先刪mask。

## 跨頁重要決策

Discovery與Settings統一shell裝配，避免直達/從UI進入兩種產品；保留專業分析的較高密度，但減少行銷hero占位。Template內容整理展示摘要與來源原文；專業timeline可用media surface例外。Auth保留filmstrip，修label與focus，而非拆掉品牌圖形。所有正式頁至少有可辨識loading/empty/error，不能把network error當空資料。
''')

phases=[
('Phase 0｜決策與基線','以既有品牌凍結v4.0設計契約，不先寫全域覆寫。','核准06的Hero、Account、Folder手機密度、material、motion與Undo政策；每頁/variant建立before capture及state matrix。','無；需使用者確認設計選擇。','public/css/tokens/*、tokens.css、分析文件；先改規格，不動runtime。','中；約1～2個工程工作日作規劃量級，非交付承諾。','低；最主要風險是把合理品牌例外當錯誤清除。','決策表每項有owner；token source唯一；allowed variant與breakpoint清楚；對未驗證狀態不標pass。','六尺寸golden captures、長中英標題、無封面、empty/error；既有本地差異保存。'),
('Phase 1｜Dialog 與操作確認（提前）','先修UI-01雙重復原、UI-05命名輸入，以及modal可操作性。','DialogService alert/confirm/prompt、OverlayManager最小核心；卡片restore刪除第一層確認；所有結果await；description預設空字串；初始focus/escape/return/inert。','Phase0 Dialog anatomy/material；不依賴完整Morph Engine。','public/js/sys.js、features/projects.js、components/project-card-interactions.js、components/dialog-service.js（新）、components/overlay-manager.js（新）、css/components/dialog.css、input.css、style.css。','高；約2～4日量級。','中高：global confirm使用者不少，Promise/result契約不能一次無差別替換。','卡片/menu復原一次確認；任一取消0 API、接受1 API；Prompt與Alert/Confirm同外框；IME不誤提交；error可重試；route teardown恰一次resolve。','隔離fixture：restore double-click、cancel、rename trim/empty/long、PATCH503；Tab/Shift+Tab/Escape、screen-reader dialog name；確認舊alert callers不破。'),
('Phase 2｜Tokens／Surface／Control 與 Layer 正規化','建立共享浮層與可讀狀態，不強行統一所有幾何。','canonical material recipes、Button/Input/Search/Chip roles、focus ring、layer map、移除有替代的全域reset；Settings缺token與gutter補齊。','Phase0；Phase1 Overlay contract；先解析CSS import順序。','public/css/tokens/*、tokens.css、style.css、shell.css、components/{acrylic,button,input,badge,bottom-sheet,dialog}.css、discovery-settings.css、auth.css。','高；約2～4日量級。','高：global selector與!important牽連全站。','每個token有單一owner或有記錄alias；generic control八狀態；opaque fallback可用；overlay stack不靠逐元件99999補丁；不改brand hue。','A→B→A CSS載入/移除；Auth/Generate/Template/Discovery；native select與dense/editor例外；對比實際合成；短橫屏。'),
('Phase 3｜共用 Morph／User Panel／Sidebar','在既有openSurface基礎抽引擎，統一幾何與互動owner。','Project facade、tag/sort/account adapters；Desktop account row A；mobile同內容sheet；focus、Escape、outside、scrollOwner、resize、interrupt、reduced與signal teardown。','Phase1 Overlay；Phase2 materials/controls；Account A/B先決定。','public/js/components/project-option-morph.js、surface-morph.js（新）、shell/app-shell.js、pages/projects.js、components/quick-compose.js（必要介面）、css/components/option-morph.css、mobile-nav.css、dashboard.css。','高；約3～5日量級。','高：多套動畫與AppShell持久生命週期交界。','trigger t0相同shape；途中反向連續；不scale文字；同menu內pill與state一致；Account鍵盤可達；一次只有一個top overlay owner。','open→close→open、快速換trigger、nested scroll、resize/rotate、trigger被移除、SPA切換；375/390/768/1024/1440/1920；filter選取不退化。'),
('Phase 4｜Folder Geometry／Delete／Undo','修跨頁形狀、confirm preview與垃圾桶，建立唯一幾何資訊來源。','component-local root sizing、Default/Compact/Preview/Recycle；兩頁手機grid策略；snapshot/measure；時間正規化trash；pending/failed/undo視覺同步。','Phase0手機density/undo政策；Phase1 dialog；Phase2 material；不必等Hero。','public/js/components/project-card.js、project-card-interactions.js、project-cover-transition.js、features/projects.js、sys.js、pages/{dashboard,projects,history}.js、css/components/project-card.css、dashboard.css、style.css。','高；約3～5日量級。','高：封面飛行、hover與資料queue都依賴geometry；刪除需嚴格隔離。','相同inline-size下跨頁shell/tab/cover差≤1px；無外層scale補救；preview無互動/duplicate id；60/120Hz軌跡時間一致；取消/錯誤恢復正確；正式資料不作測試。','五種媒體比例、0/1/多鏡頭、tags長短、無封面/圖失敗；confirm從dashboard/projects；Undo窗口、route切換、503 rollback、session reset；cover cancel/handoff。'),
('Phase 5｜Page composition／Hero／功能入口','在元件穩定後處理頁面任務層級與品牌連續性。','Hero A（或核准B）、recent提前、quick action整合；Discovery雙入口與Settings殼體契約；Template展示內容與return異常；Project filmstrip click/drag與mobile密度；Auth labels。','Phase2～4元件契約；不重構router，routing修正僅針對經核准的缺陷。','public/html/{dashboard,discovery,discovery-settings,login,template}.html、css/{dashboard,discovery,discovery-settings,template,template-detail,project-detail,auth}.css、js/pages/{dashboard,templates}.js、project-detail.js、必要shell/entry wiring。','高；約3～6日量級，取決於Hero與Discovery整合範圍。','中高：編排與history/player/asset lifecycle互相影響。','Hero不搶QC；首屏可見recent；Discovery直達與UI進入語言一致；Template返回保留browse state；filmstrip click可編輯且drag不誤觸。','105模板長資料、長URL/hashtag、empty/error、history/back-forward、刷新深連結、tablet布局；不改來源事實、不新增未核准route。'),
('Phase 6｜Progressive blur／全站 Motion tuning','用測量決定降低效果，避免為統一犧牲品牌。','Header registration、mask fade bounds、nav/QC合成budget、timing tokens、reduced JS；Landing既有scoped timelines只修實證缺陷。','Phase3 Morph、Phase4 geometry、Phase5 layout；效果參數最後調。','public/js/dynamic-mask.js、shell/app-shell.js、components/{quick-compose,navigation-transition,transition-loader,project-cover-transition}.js、landing-animation.js（如有實證）、css/shell.css、generate.css、mobile-nav.css、tokens/motion.css。','中高；約2～4日量級。','高：scroll compensation、mask clipping與soft keyboard容易出隱性退化。','頂/底last content與focus可見；無observer回授layout shift；reduced時callbacks與資料狀態相同；目標手機trace符合budget；不憑桌面截圖宣稱快。','捲動首/中/尾、方向切換、慣性、focus scroll、軟鍵盤、orientation、背景tab、低階手機；iOS Safari/Android Chromium/Firefox fallback。'),
('Phase 7｜全站 Visual QA 與 Release Gate','把待驗證範圍清零，才分批交付；此階段不代表本輪已驗收。','六尺寸×正式route×state matrix、a11y、performance、功能regression；保留before/after與approved exceptions。','所有修改phase完成；測試帳號/fixtures可用；每階段已有小範圍QA。','tests/*（有意義的behavior/geometry cases）、analysis/ui-audit/或後續QA目錄；只修實證產品問題。','中高；約2～4日量級。','中：矩陣大；要防止只看首屏與正常狀態。','P1=0、P2有owner/決策；每個正式頁desktop+mobile實測；無不可到達控制；無真實資料破壞；使用者核准視覺與互動。','全部既有node tests＋targeted browser fixtures；真正鍵盤/讀屏；六尺寸截圖；iOS/Android實機；付費生成與設定寫入須另有受控環境。')]
textparts=[]
for title,purpose,scope,deps,files,complexity,risk,accept,reg in phases:
 textparts.append(f'''## {title}

- **目的**：{purpose}
- **具體範圍**：{scope}
- **依賴**：{deps}
- **可能修改檔案**：{files}
- **複雜度／估算**：{complexity}
- **風險**：{risk}
- **驗收條件**：{accept}
- **必要回歸**：{reg}
''')
write('07-REFACTOR-ROADMAP.md',f'''# 07｜可分批審閱的重構路線

{stamp}

本輪只規劃。每一Phase先產出隔離prototype／可審閱diff，經使用者指示才實作下一階段；本次不Commit/Push。估算是單人工程工作日量級，不含設計審閱等待、未知資料問題；不能直接相加當成承諾交期。

與原始建議排序不同：Dialog與確認流程提到Phase1，因為雙重復原與原生Prompt是已證實的核心操作問題；Folder在Hero前完成，因為Hero的recent layout依賴它。QA是各階段持續做，Phase7是全站gate，不是拖到最後才驗證。

'''+ '\n'.join(textparts)+'''
## 前三階段的停止點

Phase0：使用者核准決策表。Phase1：先交「單次復原確認＋品牌Prompt＋Dialog鍵盤」小批。Phase2：交材質/controls/token before-after，不夾帶Hero重做。後續Phase3/4可在契約穩定後分開實作，但同一檔案不可由互相獨立的方案同時覆寫。

## 範圍邊界

不引入React/StyleX/新前端框架，不重構SPA Router，不刪除legacy頁直到產品確認，不以全域!important整平所有元件。動態/材質的合理例外必須記錄原因和驗收畫面。
''')

write('08-EXECUTIVE-SUMMARY.md',f'''
# 08｜決策摘要

{stamp}

## 全站現況

StoryboardAI已有明確的電影創作語彙：深色外殼、冷白工作區、實體Folder、膠卷、浮動導航與流體Morph。需要的是把這些特色變成可維護的元件契約，而非全站換主題。最嚴重的問題來自事件／非同步確認、元件幾何依賴頁面容器、以及overlay和focus所有權，不能全部歸因CSS。

已交付八份主報告、截圖索引、source/token inventory與隔離Mock。實際檢查範圍與未驗證項目見01；28項問題詳見04。這不是「全站所有狀態已通過」的結案聲明。

## 最嚴重的10個問題

|優先|問題|證據／行動|
|---|---|---|
|1|回收桶復原雙重確認，取消上層後還有undefined視窗|UI-01，Mock已重現；確認只由action擁有且await|
|2|Delete Confirm clone失去正確Folder幾何，動畫跟著失真|UI-02/24；component-local preview與snapshot|
|3|手機Dashboard/Projects Folder密度與比例不同|UI-03；390px Projects173px卡、Dashboard約74vw reel，先決定統一grid或正式reel例外|
|4|手機History未共用Folder geometry，呈大卡與淡化內容|UI-04；回收桶納入同一規格|
|5|重新命名仍是原生prompt，未共享Alert/Confirm外觀|UI-05；品牌Prompt Dialog，輸入/驗證/錯誤/焦點一起設計|
|6|自訂sys Dialog缺完整modal語意和focus生命週期|UI-06/10；Overlay/Dialog contract優先|
|7|Avatar與Folder主入口缺等價鍵盤操作|UI-07；button/link語意及可見focus|
|8|膠卷滑鼠click未開編輯，Enter可以|UI-08；pointer capture/drag threshold需trace及修復|
|9|Template一次返回操作仍停詳細頁|UI-09；已記錄但根因待trace，不藉此全面重寫router|
|10|Discovery進入／Settings返回呈不同殼體，Settings缺token|UI-20/21；統一正式入口和foundation契約|

## 最值得保留的特色

Folder的tab/notch與抽出預覽、16:9外框容納各比例素材、深色膠卷、Landing從film進入真實產品的敘事、floating nav/QC，以及適量的jelly release。這些讓它像創作工具，不能被一般SaaS卡片替代。

## 不應直接修改的材質／動畫

不要把Sidebar與所有閱讀面板改毛玻璃；不要拆掉Folder物件形狀；不要把所有Morph換fade；不要刪除Header progressive blur而不量可讀性/效能；不要重做已有matchMedia.revert清理的Landing。先保存baseline，再針對有證據的缺陷調整。

## 最需要統一的10個元件

1. Dialog family（Alert／Confirm／Prompt）。
2. Project Folder（Default／Compact／Preview／Recycle）。
3. Floating Surface／Overlay層級。
4. Morph Menu（action／tag／sort adapters）。
5. Sidebar AccountTrigger。
6. User Panel（Desktop與Mobile同內容）。
7. Button／IconButton與命中區。
8. Input／Search與focus/error。
9. Header／Toolbar／Progressive Edge。
10. Mobile Navigation／Quick Create的active與overlay契約。

## 推薦v4.0方向與完整階段

**有電影物件感的創作工作台**：實體閱讀面＋局部浮動acrylic＋內容承載cinematic視覺。以既有token與Vanilla JS SPA發展，參考Astryx語意token/可組合contract思路，不導入其框架或外觀。

Phase0 決策/基線 → Phase1 Dialog/確認流程 → Phase2 Tokens/Surface/Controls/Layers → Phase3 Morph/UserPanel/Sidebar → Phase4 Folder/Delete/Undo → Phase5 Hero與跨頁composition → Phase6 Blur/Motion調校 → Phase7 全站QA。完整目的、檔案、風險、驗收與回歸見07。

最先實作前三階段：先核准設計契約；再修雙重復原與品牌Prompt；接著統一Surface/Controls/token ownership。這比先美化Hero更能降低後續反覆重做。

## 需要你決定的項目

|決策|推薦|備選／代價|
|---|---|---|
|Dashboard Hero|A精緻工作區型，recent提前|B真實三鏡頭視覺型，圖像與動態成本較高|
|Sidebar Avatar|A整合Account Row，avatar固定36px|B工作區identity footer，現有無工作區功能時可能誤導|
|手機Folder密度|Dashboard/Projects同dense雙欄；History共享|保留Dashboard reel，但正式承認不同密度、同尺寸幾何仍一致|
|Floating material|冷中性matte acrylic；閱讀面solid|更強玻璃只留特定media overlay，不全站套|
|Morph強度|保留Project button→dot→surface；其他依語意節制|所有popover都強飛行會拖慢任務、不推薦|
|Undo跨頁政策|跨頁保留完整5秒撤銷|目前離頁flushAll提前commit；若保留需清楚告知|
|舊Analyze等頁|先分類legacy、停止擴散；由產品決定退役|如需正式upload analyze，另開明確接入範圍|

## 未實際驗證與限制

- 並非每個route都有六尺寸完整matrix：Landing/Projects完成六尺寸首屏；其他主要頁多為1440/390或375。Dashboard1024/768、所有頁1920/平板細節仍需補全。
- GSAP Skill未安裝，已報告且未自行安裝；使用官方文件＋原始碼review。
- 真實資料刪除／復原／rename/PATCH、正式Undo/rollback未操作；Mock完成刪除動畫與雙重確認重現，但沒有宣稱全部錯誤流程實測。
- Generate3～5、AI分析結果/loading/error、付費生成、API Key寫入、建立模板modal、所有native select/排序組合未完整實測。
- 未做真機Safari/Firefox、iOS軟鍵盤、安全區、VoiceOver/NVDA、JS disabled與reduced-motion實際模擬、性能trace。不能宣稱WCAG或效能全面合格。
- 無帳密寫入產物。截圖包含已授權測試帳號內容，不含密碼/API Key。既有工作區修改保留；本輪未改正式UI，未Commit/Push。

下一步等待你核准方向與階段；本輪停止於Audit與Planning。
''')

notes={
 'qc-390':'注意：此張實際仍為User Panel，不作QC證據；正確QC為qc-open-375。',
 'template-390':'注意：返回失敗時仍是detail，非catalog；正確列表為template-catalog-390。',
 'template-advanced-390':'注意：進階已開但viewport仍在detail內容，不能證明手機timeline完整可用。',
 'shot-dialog-1440':'注意：滑鼠click後仍是filmstrip，非dialog；真正editor為shot-editor-open-1440。',
 'landing-footer-390':'實際為功能/分鏡內容示例段，非最末頁尾。',
 'project-menu-1440':'Morph進行中，不能作穩態內容缺失證據；穩態為project-menu-open-1440。',
 'mock-delete-in-flight-1440':'單張動畫過程capture，無法證明逐幀或完整軌跡。',
}
index=['# Screenshot Index','',stamp,'','所有原圖為瀏覽器實際截圖；M開頭mock檔案為隔離資料，非真實API。檔名不等於已完整驗證狀態，以下註記優先。','', '|檔案|證據註記|','|---|---|']
for p in sorted((OUT/'screenshots').glob('*.jpg')):
 index.append(f'|[{p.name}](screenshots/{p.name})|{notes.get(p.stem,"Mock隔離測試" if p.stem.startswith("mock-") else "實際viewport畫面，詳見01覆蓋表")} |')
write('SCREENSHOT-INDEX.md','\n'.join(index))
write('README.md','''# StoryboardAI UI Audit / v4.0 Blueprint

請先讀 [08 決策摘要](08-EXECUTIVE-SUMMARY.md)，再讀 [06 設計提案](06-REDESIGN-PROPOSALS.md) 與 [07 路線圖](07-REFACTOR-ROADMAP.md)。

1. [頁面與狀態盤點](01-PAGE-INVENTORY.md)
2. [Design System稽核](02-DESIGN-SYSTEM-AUDIT.md)
3. [元件盤點](03-COMPONENT-INVENTORY.md)
4. [28項具體問題](04-VISUAL-ISSUES.md)
5. [Motion與Material](05-MOTION-AND-MATERIAL-REVIEW.md)
6. [重設計提案](06-REDESIGN-PROPOSALS.md)
7. [重構階段與驗收](07-REFACTOR-ROADMAP.md)
8. [決策摘要](08-EXECUTIVE-SUMMARY.md)

[截圖索引](SCREENSHOT-INDEX.md) · [Mock操作紀錄](mock-actions.md) · [雙重確認證據](restore-evidence.json) · [來源清單](source-inventory.json) · [Token清單](token-inventory.json)

本輪僅分析；正式HTML/CSS/JavaScript未修改，無Commit/Push。
''')
print('Wrote 8 primary reports + README + screenshot index')

with (OUT/'02-DESIGN-SYSTEM-AUDIT.md').open('a',encoding='utf-8') as f:
 f.write('''
## 其他Foundation精確基線

- sizing.css：control sm36/md44/lg52px，touch desktop40/mobile44；icon16/20/24/32，stroke1.5/2/2.5；avatar32/40/52。實際元件仍有38px button、42px avatar等偏差。上表v4的36/40/48是待核准提案，不是誤報既有token。
- opacity.css：0/.06/.15/.4/.55/.7/.85/.95/1；disabled不能只降opacity，需配native disabled/aria與cursor語意。
- border.css：.5/1/1.5/2/3px；既有focus-ring以blue400、width2、offset2、白色雙環shadow。問題是採用不一致與contrast未驗證，不是完全沒有focus token；應沿用名稱、校正實際色對與元件使用。

[手機Folder實際對照圖](folder-comparison.jpg)；三欄均來自390px viewport原圖的等比例縮圖。
''')
with (OUT/'04-VISUAL-ISSUES.md').open('a',encoding='utf-8') as f:
 f.write('''
## 既有測試沒有涵蓋的真實契約

`tests/project-card-interactions.test.js` 的回收桶卡片案例把 `global.confirm` mock成同步 `() => true`，並mock restore callback；因此47個相關單元測試全過也無法排除本輪的Promise雙重確認。後續測試必須讓UI的真實async contract參與，驗證取消前不呼叫restore、整條鏈只有一個確認owner。本輪不修改測試或正式程式。
''')
write('VERIFICATION.md','''# 稽核驗證紀錄

## 產品檔案保護

原始碼清單共113個非vendor CSS/JS/HTML，逐檔SHA-256儲存在source-inventory.json。產物檢查顯示從清單建立至交付，正式來源檔無hash差異。Git狀態仍保留使用者原有package/landing修改及舊分析產物，本輪新增僅analysis/ui-audit/。未Commit/Push。

## 既有相關單元測試

執行：`node --test tests/project-card.test.js tests/project-card-interactions.test.js tests/project-option-morph.test.js tests/history-page.test.js`

結果：47 passed、0 failed、0 skipped。這是現有測試基線，不代表UI/無障礙/性能通過。回收桶case使用同步confirm mock，不能覆蓋真正async confirm；已在04指出。

## 產物檢查

- 八份主報告均存在。
- 63張原始瀏覽器截圖；額外一張三頁Folder比較圖，原圖未改。
- issue code needles均存在，28項Code Location可追溯。
- 本地Markdown產物連結存在；source links使用repo相對路徑與行號。
- Screenshot index明確標註歷史檔名與實際畫面不符的capture，不把動畫中間幀當穩態缺陷。
- 原生Prompt開啟時IAB不提供screenshot；只記錄dialog.type=prompt並取消，沒有假造截圖。
- 真實API未執行刪除、復原或名稱修改；4317 Mock只改記憶體，無database。
- 本次啟動的本地server與Mock已停止；瀏覽器viewport override已reset。

未驗證的狀態列在01與08；不得將此文件解讀為全站release gate已通過。
''')
