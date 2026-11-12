# 04｜具體問題與證據

稽核日期：2026-11-11～2026-11-12（Asia/Taipei）。基準：本地目前工作區，含既有未提交 Landing 變更；不是 GitHub HEAD 的遠端部署稽核。

P1＝核心流程／存取或明確操作缺陷，優先處理；P2＝跨頁品質／架構風險；P3＝內容與清理決策。沒有把美感偏好標成資料災難P0。V/M/S定義見01。性能風險與一次性異常都標明未量測／未定根因，截圖不能證明FPS。

此清單先採Hallmark的可讀性、層級、focus、RWD檢查，再以Unslop重新批判內容焦點與材質；Manual包括router、事件與資料生命週期，無需依賴scanner是否報錯。完整原始碼文字命中另見source-inventory.json，不等於此問題數量。

## UI-01｜History／Restore

- **Severity / Finding**：P1；M + S / Manual。
- **Page / Component 與現況**：點擊一張回收桶卡片，未接受任何確認即產生兩個 sys-bg；取消上層後露出下層 undefined。
- **Screenshot Evidence**：[截圖](screenshots/mock-restore-underlying-confirm-1440.jpg)
- **Code Location**：[public/js/components/project-card-interactions.js:240](../../public/js/components/project-card-interactions.js#L240)。
- **原因／假設**：非同步 confirm 回傳 Promise 未 await，if(isConfirmed) 立即真；restoreProject 又再 confirm。
- **Impact**：復原取消可被繞過第一層；重複視窗與焦點混亂。
- **Proposed Solution**：只由 ProjectActions.restoreProject 負責一次確認；卡片與menu皆傳送 restore intent。Dialog結果一律Promise，description預設空字串。
- **Regression Risk / 驗收**：卡片、menu、鍵盤、重複點擊都需一次確認；取消零restore request，接受恰一次；不能只刪掉文案。

## UI-02｜Delete Confirm／Folder preview

- **Severity / Finding**：P1；M + S / Manual。
- **Page / Component 與現況**：375px confirm clone 的 offsetWidth230，cover外觀寬203.2、卡片外觀寬184；preview超出shell，幾何不一致。
- **Screenshot Evidence**：[截圖](screenshots/mock-delete-confirm-375.jpg)
- **Code Location**：[public/css/style.css:350](../../public/css/style.css#L350)。
- **原因／假設**：clone離開home-recent-grid，失去container geometry；compact廣域min-width230與max-width25vw衝突，scale(.8)只是縮放失真。
- **Impact**：刪除前辨識失真，動畫跳尺寸。
- **Proposed Solution**：preview作正式非互動variant，component-local inline-size推導shell/tab/cover；trash讀snapshot，不再克隆帶state與ancestor依賴的live node。
- **Regression Risk / 驗收**：default/compact、375/390/768/1440、無封面、長題名、tags都驗；preview不可有可操作標籤。

## UI-03｜ProjectFolder／手機跨頁

- **Severity / Finding**：P1；V + S / Hallmark + Manual。
- **Page / Component 與現況**：390px Projects兩欄約173px寬、172px高，preview約161×91；Dashboard為74vw輪播卡，視覺比例與資訊密度顯著不同。
- **Screenshot Evidence**：[截圖](screenshots/projects-390.jpg)
- **Code Location**：[public/css/dashboard.css:3566](../../public/css/dashboard.css#L3566)。
- **原因／假設**：同renderer但compact/default、carousel/grid、祖先geometry共同控制。這是layout與density契約問題，不是元件完全沒共用。
- **Impact**：同一專案跨頁像不同物件，標題與meta縮小。
- **Proposed Solution**：先核准手機密度策略；推薦Dashboard與Projects同一雙欄size tier，compact僅減資訊，不另換shell曲率；或明確核准reel variant。
- **Regression Risk / 驗收**：同viewport下殼體比例差≤1px測量誤差；拒絕外層scale修版面；橫向輪播如保留需獨立規格。

## UI-04｜History／Folder density

- **Severity / Finding**：P1；V + S / Manual。
- **Page / Component 與現況**：390px回收桶是單欄大卡且上下預覽接近重疊，與Projects雙欄完全不同；deleted整體淡化。
- **Screenshot Evidence**：[截圖](screenshots/history-390.jpg)
- **Code Location**：[public/css/components/project-card.css:873](../../public/css/components/project-card.css#L873)。
- **原因／假設**：共用手機geometry範圍不含history-body；deleted樣式及舊grid規則另行影響。
- **Impact**：復原入口辨識與掃讀性較差。
- **Proposed Solution**：回收桶共享Folder local geometry及browse grid；以badge和操作提示表達deleted，避免整卡文字一起低對比。
- **Regression Risk / 驗收**：History deleted/default與Projects同一寬度比較；首屏header和首卡不可碰撞；長列表捲動。

## UI-05｜Rename Prompt

- **Severity / Finding**：P1；M + S / Manual。
- **Page / Component 與現況**：重新命名仍是瀏覽器原生prompt，與自訂Alert/Confirm沒有同一外觀。
- **Screenshot Evidence**：無實際畫面截圖；僅程式碼／工具回報，見 [Mock操作紀錄](mock-actions.md)（適用時）。
- **Code Location**：[public/js/features/projects.js:715](../../public/js/features/projects.js#L715)。
- **原因／假設**：ProjectActions同步依賴原生prompt；sys只有alert/confirm的自訂外觀。IAB原生prompt開啟不能截圖，已記錄dialog.type=prompt後dismiss。
- **Impact**：外觀割裂、無法統一驗證與錯誤狀態。
- **Proposed Solution**：新增DialogService.prompt variant：標題、名稱欄位、help/error、取消/儲存；同sys外框/材質/動態；await結果，不以原生modal擋住SPA。
- **Regression Risk / 驗收**：空白/全空格/長名稱/IME Enter/Escape/重複送出/PATCH失敗/離頁/焦點回原卡；不順手改動資料命名限制。

## UI-06｜System Dialog accessibility

- **Severity / Finding**：P1；M + S / Hallmark。
- **Page / Component 與現況**：Confirm開啟時背景仍出現在AX；sys-window未建立dialog role、aria-modal、標題關聯與focus trap。
- **Screenshot Evidence**：[截圖](screenshots/mock-delete-confirm-1440.jpg)
- **Code Location**：[public/js/sys.js:139](../../public/js/sys.js#L139)。
- **原因／假設**：自訂global confirm只建立div與按鈕，依timers關閉；沒有標準Dialog生命週期。
- **Impact**：鍵盤與輔助科技容易失去上下文。
- **Proposed Solution**：以共用DialogService與OverlayManager處理initial focus、inert、Tab cycle、Escape/cancel、return focus；Alert用適當alertdialog。
- **Regression Risk / 驗收**：APG鍵盤流程；巢狀dialog合法stack；route abort恰一次resolve；取消不寫資料。

## UI-07｜Folder／Account keyboard access

- **Severity / Finding**：P1；V + S / Hallmark。
- **Page / Component 與現況**：Avatar是clickable div；Folder本體也是div，未找到鍵盤開啟契約。AX只有更多選項是button。
- **Screenshot Evidence**：[截圖](screenshots/sidebar-expanded-1440.jpg)
- **Code Location**：[public/js/shell/app-shell.js:856](../../public/js/shell/app-shell.js#L856)。
- **原因／假設**：click事件提供滑鼠功能，DOM未提供等價button/link語意。
- **Impact**：鍵盤用戶無法穩定到達核心入口。
- **Proposed Solution**：Avatar用AccountTrigger button；Folder用獨立主link與兄弟menu button，避免button包button。
- **Regression Risk / 驗收**：Tab順序、Enter、Space、menu焦點、tag click不誤導頁；不可用整卡button包內部按鈕。

## UI-08｜Project filmstrip edit click

- **Severity / Finding**：P1；V + S / Manual。
- **Page / Component 與現況**：1440膠卷模式滑鼠點編輯鏡頭1後仍停原頁；同一元件Enter可開dialog。
- **Screenshot Evidence**：[截圖](screenshots/project-filmstrip-1440.jpg)
- **Code Location**：[public/js/project-detail.js:196](../../public/js/project-detail.js#L196)。
- **原因／假設**：scroll容器pointerdown立即capture，可能使click目標被重定向；此為高可信假設，未做事件trace。
- **Impact**：滑鼠和鍵盤行為不一致。
- **Proposed Solution**：超過drag threshold才capture；可互動子元素先排除；click與drag共享pointer session明確狀態。
- **Regression Risk / 驗收**：0/4/6px拖曳、放開、pointercancel、touch pan、scroll後點、編輯器focus，禁止用延遲強行彌補。

## UI-09｜Template return navigation

- **Severity / Finding**：P1；V / Manual。
- **Page / Component 與現況**：1440進detail、展開內容後resize390，點返回模板庫仍顯示detail且URL不變；catalog search存在但不可見。
- **Screenshot Evidence**：[截圖](screenshots/template-return-stuck-390.jpg)
- **Code Location**：[public/js/pages/templates.js:191](../../public/js/pages/templates.js#L191)。
- **原因／假設**：back委派parent.history，與iframe joint-history/resize及多次進入可能相關；未取得完整popstate trace，不宣稱定根因。
- **Impact**：使用者卡在詳細頁。
- **Proposed Solution**：先加只讀navigation trace與針對性回歸；同route update/browse restoration修復限component/history契約，不重構router。
- **Regression Risk / 驗收**：直達/由browse進/刷新/resize/back-forward/連點返回；保留search、category、scroll與focus。

## UI-10｜Input／focus tokens

- **Severity / Finding**：P1；V + S / Hallmark。
- **Page / Component 與現況**：style與shell對input/textarea/select含focus-visible一律outline none!important；Projects另用容器focus-within補回，其他欄位各有不同方案。
- **Screenshot Evidence**：[截圖](screenshots/projects-390.jpg)
- **Code Location**：[public/css/style.css:38](../../public/css/style.css#L38)。
- **原因／假設**：全域reset與元件focus衝突；button focus使用品牌soft色亦需量對比，不是宣告存在就達標。
- **Impact**：鍵盤可見性、低視力操作。
- **Proposed Solution**：定義高對比focus-ring semantic token；每個input host提供立即可見focus-within；移除reset前逐元件驗證。
- **Regression Risk / 驗收**：focus ring與相鄰背景≥3:1設計目標；實際透明合成驗證；native select、密碼show、錯誤欄位一起測。

## UI-11｜Sidebar expanded account

- **Severity / Finding**：P2；V + S / Unslop。
- **Page / Component 與現況**：展開Sidebar後底部仍是一顆42px頭像，沒有姓名/帳戶資訊和明確面板箭頭；左側大片空間未形成完整account區。
- **Screenshot Evidence**：[截圖](screenshots/sidebar-expanded-1440.jpg)
- **Code Location**：[public/css/dashboard.css:649](../../public/css/dashboard.css#L649)。
- **原因／假設**：footer DOM只含top-avatar，不是CSS把現成account row藏起來。
- **Impact**：帳戶入口辨識弱，展開用途不足。
- **Proposed Solution**：06提案A integrated account row或B workspace identity footer；推薦A，展開才顯示文字，avatar固定尺寸。
- **Regression Risk / 驗收**：collapsed↔expanded focus、最短視窗、長名稱、缺圖、panel anchored到live trigger。

## UI-12｜User Panel／material & lifecycle

- **Severity / Finding**：P2；V + S / Unslop + Manual。
- **Page / Component 與現況**：桌面使用白底矩形選項與rotateX+雙scale；手機bottom sheet，Escape觀察未關閉，背景點擊可關閉。
- **Screenshot Evidence**：[截圖](screenshots/user-panel-390.jpg)
- **Code Location**：[public/css/dashboard.css:734](../../public/css/dashboard.css#L734)。
- **原因／假設**：桌面transform scale(.33)加獨立scale3；mobile另外手勢controller；不是共享Morph adapter。
- **Impact**：手感、幾何與無障礙不一致。
- **Proposed Solution**：FloatingSurface account variant，共用資料與actions；desktop account-trigger morph，mobile sheet布局；Escape/focus契約共用。
- **Regression Risk / 驗收**：手機Escape與拖曳、點背景、重複開關、resize跨斷點、離頁清除scrim。

## UI-13｜Dashboard Hero purpose

- **Severity / Finding**：P2；V / Hallmark + Unslop。
- **Page / Component 與現況**：1440上方問候+大型攝影機科技背景+三張quick actions先佔約半屏；手機hero240px後再四個入口，繼續創作推到下方。
- **Screenshot Evidence**：[截圖](screenshots/dashboard-390.jpg)
- **Code Location**：[public/css/dashboard.css:2926](../../public/css/dashboard.css#L2926)。
- **原因／假設**：Hero主要導模板，卻像主創作入口；文案抽象，圖像與真實分鏡內容關聯弱。
- **Impact**：主次不清、回訪效率下降。
- **Proposed Solution**：06方案A精緻工作區為預設、B三鏡頭敘事作可選；保持QC作唯一主創作入口。
- **Regression Risk / 驗收**：1440/900與390/844可看見最近專案首列；空帳戶與有專案內容分別評估。

## UI-14｜Project menu／Tag menu visual anatomy

- **Severity / Finding**：P2；V + S / Unslop。
- **Page / Component 與現況**：Project action menu item為28px高、8px角；tag/sort為36px、高10px角，未符合使用者希望的內部pill規則。
- **Screenshot Evidence**：[截圖](screenshots/project-menu-open-1440.jpg)
- **Code Location**：[public/css/components/option-morph.css:85](../../public/css/components/option-morph.css#L85)。
- **原因／假設**：基礎menu與page覆寫分別決定item padding/height/radius。
- **Impact**：同一引擎視覺仍不一致，小字密集。
- **Proposed Solution**：外層squircle24～32；內層pill、desktop40/touch44；統一字級14、gap8、selected/disabled。
- **Regression Risk / 驗收**：內容長時不裁焦點/陰影；multi-check語意不退化為action按鈕。

## UI-15｜Morph keyboard ownership

- **Severity / Finding**：P2；V + S / Hallmark。
- **Page / Component 與現況**：generic opts.content分支有arrow/Home/End與開啟focus；Project action分支未共享同一鍵盤契約，close未找到restore focus。
- **Screenshot Evidence**：[截圖](screenshots/tag-filter-1440.jpg)
- **Code Location**：[public/js/components/project-option-morph.js:431](../../public/js/components/project-option-morph.js#L431)。
- **原因／假設**：通用化到openSurface後仍保留兩條互動分支。
- **Impact**：關閉後焦點漂移、不同menu鍵盤操作不同。
- **Proposed Solution**：抽KeyboardAdapter、menu/content roles、focus return；action menu和multi-select各自符合語意模式。
- **Regression Risk / 驗收**：Escape、Tab、outside、click action、trigger移除、route abort，focus只返回仍存在trigger。

## UI-16｜Morph layout animation cost

- **Severity / Finding**：P2；S / Motion Engineering。
- **Page / Component 與現況**：每幀寫width/height/left/top/radius，且will-change保留多個layout屬性；480/440ms不短。
- **Screenshot Evidence**：[截圖](screenshots/project-menu-1440.jpg)
- **Code Location**：[public/js/components/project-option-morph.js:344](../../public/js/components/project-option-morph.js#L344)。
- **原因／假設**：為了幾何連續的有意設計；不是單憑使用layout就已證明卡頓。
- **Impact**：弱手機可能layout/paint成本高，尚無FPS證據。
- **Proposed Solution**：離線measure final rect後用transform shell+counter-scale content；若保留size tween，限定單一小surface並以實機trace決策。
- **Regression Risk / 驗收**：低階Android性能trace、interrupt/resume、字形不可拉伸、trigger→surface逐幀連續。

## UI-17｜Layer／Portal system

- **Severity / Finding**：P2；S / Manual。
- **Page / Component 與現況**：layer-nav200/modal700但nav10000、menu10001、panel10050、sys20000；tags又用:has降nav。
- **Screenshot Evidence**：[截圖](screenshots/user-panel-1440.jpg)
- **Code Location**：[public/css/components/mobile-nav.css:32](../../public/css/components/mobile-nav.css#L32)。
- **原因／假設**：portal與祖先stacking context沒有一致管理；提高數值已成補丁。
- **Impact**：新popover可能穿過dialog、被nav遮擋。
- **Proposed Solution**：OverlayManager統一portal host和stack token，body inert與scroll lock計數；先mapping後改數值。
- **Regression Risk / 驗收**：menu→dialog、QC+panel、short landscape、route change、nested scroll；移除:has補丁前驗證。

## UI-18｜Acrylic／shared recipe drift

- **Severity / Finding**：P2；V + S / Unslop。
- **Page / Component 與現況**：QC強背景模糊、nav5px saturation250%、menu14px白.96、UserPanel白底；同浮層用途有多個材質owner。
- **Screenshot Evidence**：[截圖](screenshots/qc-open-375.jpg)
- **Code Location**：[public/css/components/mobile-nav.css:24](../../public/css/components/mobile-nav.css#L24)。
- **原因／假設**：tokens、component、page三層配方未建立層級。
- **Impact**：材質分散重心、累積compositing成本。
- **Proposed Solution**：採05的Material Hierarchy；nav/QC/menu共享floating family、可有density透明度variant，dialog保持高不透明度。
- **Regression Risk / 驗收**：明暗照片/文字背景可讀性、無backdrop fallback、動態背景重疊。

## UI-19｜Header／progressive blur contract

- **Severity / Finding**：P2；V + S / Manual。
- **Page / Component 與現況**：Header依content-body sibling與toolbar.nextElementSibling偵測；捲動時title scale .96、副標max-height變0，多層edge同時存在。
- **Screenshot Evidence**：[截圖](screenshots/discovery-scroll-1440.jpg)
- **Code Location**：[public/js/dynamic-mask.js:137](../../public/js/dynamic-mask.js#L137)。
- **原因／假設**：幾何、捲動方向、header layout與mask集中在同模組，DOM變更容易改錯blur範圍。
- **Impact**：標題與內容可能互遮、layout compensation回授；效能仍待量。
- **Proposed Solution**：明確scrollOwner/header/toolbar registration；top三階blur+單tint為基線，generic scroll保留opacity mask；不直接刪除效果。
- **Regression Risk / 驗收**：首/中/尾scroll、nested scroll、focus scrollIntoView、ResizeObserver重入、最後一項完整可見。

## UI-20｜Discovery dual entry architecture

- **Severity / Finding**：P2；V + S / Manual。
- **Page / Component 與現況**：SPA進入保留shell，Settings返回後變成standalone nav，品牌S漸層圖塊與主站logo不同，左側gutter消失。
- **Screenshot Evidence**：[截圖](screenshots/discovery-standalone-390.jpg)
- **Code Location**：[server.js:1226](../../server.js#L1226)。
- **原因／假設**：server獨立sendFile與SPA PageHost clone main是兩條組裝路徑，非單純某個padding寫錯。
- **Impact**：來回導覽時空間、身份與功能入口改變。
- **Proposed Solution**：保留Vanilla SPA；先決定正式Discovery殼體，統一bootstrap與布局契約；本輪不重寫router。
- **Regression Risk / 驗收**：外部deep link、從sidebar進、settings返回、手機快捷、refresh/history全測。

## UI-21｜Discovery Settings brand/tokens

- **Severity / Finding**：P2；V + S / Unslop。
- **Page / Component 與現況**：設定頁硬邊panel、黃綠說明區、無page gutter，與圓潤工作區不同；--blue/--lime未定義。
- **Screenshot Evidence**：[截圖](screenshots/discovery-settings-1440.jpg)
- **Code Location**：[public/css/discovery-settings.css:1](../../public/css/discovery-settings.css#L1)。
- **原因／假設**：standalone頁自有色彩與token缺口，沒有共用foundation import。
- **Impact**：可讀性、品牌與鍵盤狀態不穩。
- **Proposed Solution**：使用相同semantic foundations，form raised/solid、aside用中性inset；設定必要技術文案保留，focus token補齊。
- **Regression Risk / 驗收**：key保持隱藏、禁用/錯誤/成功、390/768/1024、link/outline computed color驗證。

## UI-22｜Generate／control consistency

- **Severity / Finding**：P2；V + S / Unslop。
- **Page / Component 與現況**：Generate創作設定的ratio/duration是近矩形choice；其他頁主要pill。這是合理語意區別，但與同頁suggestion、buttons沒有明確density表。
- **Screenshot Evidence**：[截圖](screenshots/generate-settings-scroll-390.jpg)
- **Code Location**：[public/css/generate.css:369](../../public/css/generate.css#L369)。
- **原因／假設**：選取型choice與action button未在DS分開，容易之後全部套pill導致資訊密度變差。
- **Impact**：同用途規則不清，未來統一容易誤傷。
- **Proposed Solution**：建立ChoiceCard/Segment/Action三類，不強行Morph native/select；字級/selected/focus/disabled共用。
- **Regression Risk / 驗收**：多比例、多風格選取、disabled、keyboard與touch，確認單選語意與現有multi選需求。

## UI-23｜Delete feedback／rollback

- **Severity / Finding**：P2；S / Manual。
- **Page / Component 與現況**：DeleteQueue commit失敗主要console.error；先顯示已移至回收桶，5秒後才API；router離頁flushAll提前commit。
- **Screenshot Evidence**：無實際畫面截圖；僅程式碼／工具回報，見 [Mock操作紀錄](mock-actions.md)（適用時）。
- **Code Location**：[public/js/features/projects.js:290](../../public/js/features/projects.js#L290)。
- **原因／假設**：資料狀態、動畫完成、undo窗口與route生命週期沒有對使用者一致的狀態表示。
- **Impact**：刪除失敗卻顯示成功，視覺與資料不同步；未實測正式失敗。
- **Proposed Solution**：operation狀態pending/committing/committed/failed；錯誤恢復卡片與toast重試；決定離頁是否保留5秒撤銷，不靜默縮短。
- **Regression Risk / 驗收**：Mock503/offline/undo-before-commit/離頁/登出/雙擊；API call count與store/DOM一致。

## UI-24｜Delete animation lifecycle

- **Severity / Finding**：P2；M + S / Motion Engineering。
- **Page / Component 與現況**：垃圾桶動畫使用每frame velocity/gravity而非elapsed-time；位移與scale基於固定-232；blur Math.max(s-0.5)未夾0。
- **Screenshot Evidence**：[截圖](screenshots/mock-delete-in-flight-1440.jpg)
- **Code Location**：[public/js/sys.js:239](../../public/js/sys.js#L239)。
- **原因／假設**：刷新率影響軌跡；Math.max單參數不做下限，初段可能產生負blur而被忽略；timer1s/1.5s與raf分離。
- **Impact**：高刷新率/中斷可能不一致；本輪非性能benchmark。
- **Proposed Solution**：時間正規化timeline，snapshot local origin與trash target，單session cancel/finish；prefers-reduced-motion跳至結果但保留undo。
- **Regression Risk / 驗收**：60/120Hz、慢CPU、route abort、cancel、reduced-motion、resize、API失敗後rollback。

## UI-25｜Auth label／inactive form

- **Severity / Finding**：P2；V + S / Hallmark。
- **Page / Component 與現況**：Login與Register欄位靠placeholder標示；AX會同時列出兩個panel；password show button沒有可讀名稱。
- **Screenshot Evidence**：[截圖](screenshots/register-375.jpg)
- **Code Location**：[public/html/login.html:50](../../public/html/login.html#L50)。
- **原因／假設**：切換可能僅以視覺變換隱藏，且未提供持續label與show/hide名稱。
- **Impact**：鍵盤、表單自動填寫、錯誤後欄位辨識。
- **Proposed Solution**：補label與autocomplete；inactive panel hidden/inert；保留filmstrip品牌外框。
- **Regression Risk / 驗收**：登入註冊互切Tab順序、show password狀態、讀屏名稱、錯誤定位。

## UI-26｜Mobile navigation semantics

- **Severity / Finding**：P2；V + S / Hallmark。
- **Page / Component 與現況**：route links以role tab混入create/profile buttons；create tab內另放button，AX可見嵌套操作。
- **Screenshot Evidence**：[截圖](screenshots/dashboard-375.jpg)
- **Code Location**：[public/js/shell/app-shell.js:227](../../public/js/shell/app-shell.js#L227)。
- **原因／假設**：把頁面導覽、開啟QC、開啟panel混成同一tablist。
- **Impact**：鍵盤/讀屏預期與active state不符。
- **Proposed Solution**：navigation landmark+route links aria-current；create/profile獨立button aria-expanded/controls，不假裝頁面tab。
- **Regression Risk / 驗收**：route current、panel selected、QC開關、縮小nav、focus可見、外層點不重複觸發。

## UI-27｜Template content hierarchy

- **Severity / Finding**：P3；V / Unslop。
- **Page / Component 與現況**：真實影片標題含大量hashtag與來源宣傳連結，featured卡敘述出現FB/IG長URL；detail有多段英文tracked labels與emoji。
- **Screenshot Evidence**：[截圖](screenshots/template-1440.jpg)
- **Code Location**：[public/js/pages/templates.js:29](../../public/js/pages/templates.js#L29)。
- **原因／假設**：原始內容與編輯後展示欄位未分層；不是把使用者內容的emoji全部當UI圖示錯誤。
- **Impact**：掃讀成本高，功能內容像資料dump。
- **Proposed Solution**：保留原始title/description於來源資訊；展示摘要與taxonomy獨立；不自動改寫來源事實；UI decorative emoji換同一icon。
- **Regression Risk / 驗收**：中英混排、超長hashtag/URL、無摘要、來源名稱可追溯；不偽造精選理由。

## UI-28｜Analyze／legacy reachability

- **Severity / Finding**：P3；S + M / Manual。
- **Page / Component 與現況**：server有/analyze及/analysis但SPA pageDefs不接受；舊html/analyze可直接讀取，仍是另一套upload頁。
- **Screenshot Evidence**：[截圖](screenshots/legacy-analyze-1440.jpg)
- **Code Location**：[public/js/spa-router.js:170](../../public/js/spa-router.js#L170)。
- **原因／假設**：殘留頁與正式入口不同步；Dashboard「AI劇本解析」實際開QC，不是舊upload頁。
- **Impact**：使用者對分析名稱與目的混淆。
- **Proposed Solution**：由產品決定退役或重新接入；scope inventory註明legacy，不私自新增route或刪頁。
- **Regression Risk / 驗收**：核准後再測導航、直達、404/redirect；本輪不上傳、不執行analyze API。

## 既有測試沒有涵蓋的真實契約

`tests/project-card-interactions.test.js` 的回收桶卡片案例把 `global.confirm` mock成同步 `() => true`，並mock restore callback；因此47個相關單元測試全過也無法排除本輪的Promise雙重確認。後續測試必須讓UI的真實async contract參與，驗證取消前不呼叫restore、整條鏈只有一個確認owner。本輪不修改測試或正式程式。
