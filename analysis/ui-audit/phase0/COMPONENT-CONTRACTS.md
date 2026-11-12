# 共用 Component Contracts

2026-11-12｜規範；尚未實作。依 [Design System](DESIGN-SYSTEM-V4.md)／[D01–D05](APPROVED-DESIGN-DECISIONS.md)。現有路徑均為目前原始碼對照，提議新檔明列 Proposed；Component Owner 是責任模組而非指定人員。通用契約：事件／observer／timer／RAF 由建立者 dispose；資料屬 Feature，DOM 屬 Component，layout placement 屬 Host。

## C01｜Button／IconButton

|欄位|契約|
|---|---|
|Purpose|提供單一 action；導航用 link，不冒充 button。|
|Anatomy|button＋可選20px icon＋label＋busy indicator；IconButton需 accessible name，不能巢狀button。|
|Variants|primary／secondary／ghost／danger；36/44/52 density；icon-only。Shape pill為一般action，ChoiceCard不套用。|
|States|default、hover、pressed、focus-visible、disabled、busy；busy鎖重送並公告狀態。|
|Design Tokens|`--control-height-*`、`--button-*`、`--radius-pill`、`--icon-size-sm`、focus／space tokens。|
|Responsive Behavior|Desktop hit≥40，coarse pointer≥44；小視覺按鈕可增加透明hit區，不能蓋鄰項。|
|Motion Behavior|120ms press／200ms release；一般按鈕不使用強jelly；忙碌動畫可停止。|
|Accessibility|原生disabled、aria-busy；icon不重複朗讀label，Tab/Enter/Space可達；按鈕名不可只靠tooltip。|
|Ownership|現有 `css/style.css`、`tokens/components.css` 與頁面按鈕；Phase1僅Dialog scoped controls，Phase2共用規範遷移。|
|Allowed Exceptions|Nav/QC既有signature可有jelly；Folder option視覺36×28可保留但hit達標，不能套其尺寸到一般選單。|

## C02｜Input／Search

|欄位|契約|
|---|---|
|Purpose|編輯文字或查詢；搜尋與送出意圖分開。|
|Anatomy|可見label、input、可選leading icon／clear、help/error；Search包裝容器focus-within。|
|Variants|text／search／password／textarea；pill搜尋、rect/continuous表單，Prompt單欄。|
|States|empty、filled、focus、invalid、disabled、readonly、busy；錯誤不只變紅。|
|Design Tokens|`--input-*`、control-md44、body16／control14、space8/12、border-focus、focus-ring現有tokens。|
|Responsive Behavior|不強行截斷輸入值；視覺Viewport／keyboard出現時可捲到欄位與error，不被nav蓋住。|
|Motion Behavior|focus border／背景短feedback；無每鍵press彈跳；reduced無位移。|
|Accessibility|label關聯、autocomplete按用途、aria-invalid／describedby；IME composition中Enter不送出。clear有名稱。|
|Ownership|`style.css`／`shell.css` focus reset為Legacy衝突；Projects search在頁面CSS／JS；Phase1只新增Prompt scope，Phase2再擴展。|
|Allowed Exceptions|Generate設定choice不是input；native select保留；不將全站outline一次移除或加全域!important。|

## C03｜Dropdown／Morph Menu

|欄位|契約|
|---|---|
|Purpose|從Trigger展開短操作／選取集合，避免跨頁另造Controller。|
|Anatomy|原位trigger、portal shell、content、pill items、可選group label；trigger佔位不消失。|
|Variants|project-actions／tag-multiple／sort-radio／account adapter；尺寸與placement配置，內容不進engine。|
|States|closed、measuring、opening、open、closing、interrupted、disposed；一個active surface session。|
|Design Tokens|Floating recipe、continuous-lg/xl、radius-pill、space8/12、control-md44（compact桌面視覺36須hit40）。|
|Responsive Behavior|safe viewport內定位，溢出內部scroll；小螢幕長清單切Sheet adapter；resize/scroll政策由adapter宣告。|
|Motion Behavior|保留480/440ms Project signature，幾何連續／同progress；中斷接目前rect，不先刪DOM再fade。|
|Accessibility|action menu、checkbox/radio各自語意；arrows/Home/End按pattern，Escape關閉、focus回仍存在trigger；Tab不得永久困在非modal menu。|
|Ownership|現有 `js/components/project-option-morph.js`、`css/components/option-morph.css`；Proposed SurfaceMorph核心／adapter於Phase3抽取，不複製controller；Overlay負責層與dismiss，engine只管幾何／timeline。|
|Allowed Exceptions|Native select、combobox維持既有鍵盤模型；Account是rich popover不硬套menuitem；長Sheet不做小Trigger飛行。|

## C04｜Dialog／Alert／Confirm／Prompt

|欄位|契約|
|---|---|
|Purpose|阻斷式訊息、明確確認、簡短資料輸入；Prompt必須有與Alert/Confirm同族的特殊外觀。|
|Anatomy|scrim、named modal panel、title、optional description（預設空字串）、body/input、inline error、cancel/primary pills；只有需要時render description。|
|Variants|alert／confirm／prompt；delete維持既有special preview橋接，幾何／Trash重做留Phase4；shot editor為複雜modal adapter後續遷移。|
|States|queued、opening、open、validating、submitting、error、closing、settled／aborted；Promise恰一次resolve。|
|Design Tokens|M4、continuous-xl、elevation-overlay、space16/24、control-md44；Prompt同外框／材質／排版，非原生prompt。|
|Responsive Behavior|max-inline-size與左右16px安全邊；窄／矮畫面body可scroll，actions可見；鍵盤不裁input，文字放大不固定死高度。|
|Motion Behavior|共用進退／cleanup；保留modal深度，避免transition:all／全屏50px blur tween；delete legacy adapter先維持原本完成時間，不能提前resolve改Undo起點。|
|Accessibility|role=dialog＋aria-modal、name/description；必要緊急訊息才alertdialog；focus trap、background inert、Escape政策、return focus，blocked時聲明busy。|
|Ownership|`js/sys.js`相容門面；Proposed `js/components/dialog-service.js`與scoped CSS、最小overlay helper由Phase1建立；Feature提供驗證／API callback，Service無專案CRUD。|
|Allowed Exceptions|Alert現存options含duration，但目前函式沒有自動關閉timer；相容參數不代表新增auto-dismiss。Trash narrative隔離adapter、Phase4替換。全站Modal一次全遷移不屬Phase1。|

## C05｜User Panel

|欄位|契約|
|---|---|
|Purpose|帳戶資訊與帳戶操作，屬FloatingSurface account variant。|
|Anatomy|identity header、真實次要資訊、分組pill actions、低強度分隔、logout action；資料同源。|
|Variants|desktop anchored popover／mobile bottom-sheet；不是兩套帳戶資料與視覺語言。|
|States|closed/opening/open/closing、loading account、missing avatar、error、logout pending。|
|Design Tokens|M3 floating family、continuous-xl、內pill、space12/16/24、text-primary/secondary/danger。|
|Responsive Behavior|Desktop anchor到AccountRow；Mobile safe-area、keyboard與高度限制，scroll body不拖動整頁。|
|Motion Behavior|Desktop共用SurfaceMorph account adapter；Mobile sheet drag/release；不再雙scale／rotateX各自競爭。|
|Accessibility|trigger aria-expanded/controls，操作保持原生button/link；Escape、outside、drag dismiss同一settle；mobile modal sheet trap/inert。|
|Ownership|`js/shell/app-shell.js`、`css/dashboard.css`現有；Phase3拆panel adapter、資料仍由既有auth/shell提供。|
|Allowed Exceptions|Logout可用danger文字、不是搶眼主要CTA；原有未實作帳戶項目不偽裝成新功能，是否隱藏由後續產品範圍決定。|

## C06｜Account Row

|欄位|契約|
|---|---|
|Purpose|D03：Sidebar內整合的帳戶Trigger。|
|Anatomy|單一button內avatar約36、name、可選secondary、chevron；不巢狀第二個trigger。|
|Variants|expanded row／collapsed avatar；同資料、同avatar中心。|
|States|default、hover、pressed、focus、panel-open、missing name/image、auth loading。|
|Design Tokens|Proposed局部account-avatar36、touch44、space8/12、inverse text配shell、icon20。|
|Responsive Behavior|Desktop跟sidebar收展；mobile入口使用既有nav button並共用panel model，不硬塞整行。|
|Motion Behavior|文字clip/fade，avatar不放大；Morph讀live row或collapsed trigger，不用舊快取rect。|
|Accessibility|button可達、完整username可讀、aria-expanded；avatar裝飾alt空字串可但button需名稱。|
|Ownership|`app-shell.js` avatar/footer生成及 `dashboard.css` sidebar styles；Phase3。|
|Allowed Exceptions|次要資訊缺少時省略；不得自行新增假方案／工作區，長名可視覺省略但保留可存取名稱。|

## C07｜Sidebar／Header

|欄位|契約|
|---|---|
|Purpose|穩定導航與頁面上下文；Header可讀邊界及scroll狀態。|
|Anatomy|Sidebar：brand/nav/account；Header：title/subtitle/actions＋獨立非互動edge blur layer。|
|Variants|Sidebar collapsed/expanded；Header default/scrolled、with-toolbar；standalone Discovery後續確認殼體。|
|States|active route、hover/focus、transitioning、scrolled、overlay-open、short viewport。|
|Design Tokens|shell/canvas/text inverse、layout tokens、layers-nav；Header edge現存1.5/4/8＋tint（非新全域token）。|
|Responsive Behavior|≤768 mobile nav替代Sidebar；文字換行不壓actions；scroll-padding配合header真實高。|
|Motion Behavior|Sidebar單一寬度owner，anchor固定；Header映射scrollOwner不靠DOM sibling猜測是目標；Phase6才改mask註冊。|
|Accessibility|nav landmark、link aria-current、toggle有狀態；Header focus不可被fade遮，頁面heading層級連續。|
|Ownership|`app-shell.js`／`shell.css`／`dashboard.css`；blur由`dynamic-mask.js`，layout不得與mask各自寫補償高度。|
|Allowed Exceptions|Landing獨立marketing header；Discovery雙入口維持現況直到Phase5，不借正規化重寫Router。|

## C08｜Floating Surface

|欄位|契約|
|---|---|
|Purpose|為Menu、Account、QC、Sheet提供同族材質與overlay基礎；不是一個萬用DOM。|
|Anatomy|portal host、surface shell、單次border/highlight/shadow、content、可選scrim。|
|Variants|matte tool／menu／account／sheet／circle；密度／透明度由閱讀需求決定。|
|States|open/closed、modal/nonmodal、opaque fallback、reduced transparency效果降級、stacked。|
|Design Tokens|Canonical `--surface-floating-*` recipe、continuous radius、layers；強度不從各頁自創。|
|Responsive Behavior|safe bounds、visualViewport、scroll owner宣告；long-sheet獨立content scroll。|
|Motion Behavior|只提供surface primitive，動畫由interaction adapter；自身不再額外疊enter。|
|Accessibility|modal才trap/inert；nonmodal不鎖全頁；焦點邊不受mask裁切；opaque fallback依然可辨。|
|Ownership|Phase2 material recipe／layer mapping；Phase1只建立Dialog必需overlay最小契約；Phase3逐adapter接入。|
|Allowed Exceptions|Cinematic control overlay與Dialog不強制同alpha；沒有宣告原由不得Flat/Glass混搭。|

## C09｜Project Folder

|欄位|契約|
|---|---|
|Purpose|以單一幾何模型顯示真實專案，支援列表、preview與品牌動畫。|
|Anatomy|shell、header tab、notch/fillet、preview stage、media、primary title link、metadata/tags、兄弟option button。|
|Variants|Default／Dense（compact資訊密度）／Preview（readonly）／List；Deleted為狀態非新shell。Desktop layout context可選size tier。|
|States|normal、hover、pressed/focus、loading cover、no cover、pending-delete、deleted、restoring、error；pending資料狀態不能只靠opacity。|
|Design Tokens|`--card-*`、film tokens、space、radius；Proposed局部`folder-width/preview-width/preview-height/tab-height/notch-radius/insert-depth`同geometry計算產出。preview容器16:9、媒體contain；最終係數Phase4以既有notch造型校準。|
|Responsive Behavior|D02三頁同手機雙欄Dense；寬由grid可用空間決定，不能min-width230溢出173欄。Display Preview使用真正layout size，禁止外層scale修形；Title優先可讀與完整名稱入口。|
|Motion Behavior|保留抽出cover／hover物件感；動畫可transform，但不能用transform掩蓋常態layout。共用 geometry snapshot含shell/preview/media bounds、origin、shape、density與sourceRect，給Cover/Trash。|
|Accessibility|主入口link、option/tag為兄弟controls，不整卡button包button；Preview無可互動tag、重複id、tab stop；deleted仍有可讀狀態。|
|Ownership|`components/project-card.js`＋`project-card-interactions.js`＋`project-card.css`唯一renderer/interaction/style；Host `pages/dashboard.js`、`pages/projects.js`、`pages/history.js`只傳variant和grid。Phase4建立局部geometry resolver。|
|Allowed Exceptions|Preview可省meta但不破壞tab/notch；真實9:16/1:1媒體不裁成假16:9；Gallery特殊reel若未再核准不得代替D02雙欄。|

幾何接線：資料→同renderer＋GeometryResolver→browse或readonly preview→同一snapshot→Trash/cover adapter。不能clone帶祖先依賴的live card另補CSS。Snapshot不保存Token的任意舊computed transform，也不把DOM clone當唯一資料源；影像未載入時有穩定尺寸。正式係數未驗證前不能宣稱幾何契約已通過。

## C10｜Quick Create（QC）

|欄位|契約|
|---|---|
|Purpose|主要快速創作入口，Hero不另建競爭流程。|
|Anatomy|collapsed trigger、expanded composer、prompt、send/status、關閉入口；資料草稿與surface分離。|
|Variants|desktop dock／mobile composer／collapsed pill；維持既有feature語意。|
|States|closed/opening/expanded/closing、draft/empty、submitting、error、disabled；generation不在本輪重設。|
|Design Tokens|ai-dock／ai-pill與floating family；現有dock最終clamp寬度先保留，非380px硬切。|
|Responsive Behavior|mobile nav placement、safe-area／keyboard；展開不讓input與send被遮，關閉後恢復原scroll。|
|Motion Behavior|保存560ms展開／深度語彙，Phase6量測再收斂；與scrim/nav避免多層持續blur。|
|Accessibility|trigger狀態、input label、send busy、Escape策略；modal與非modal模式明確，不能重複focus owner。|
|Ownership|現有QuickCompose controller、`app-shell.js`及QC樣式（對照03 inventory）；資料由creation feature管理，Overlay不擁有draft。|
|Allowed Exceptions|可保留流體/jelly signature與內容斷點；不得重造QC、假資料或改生成API作視覺重構。|

## C11｜Mobile Bottom Nav

|欄位|契約|
|---|---|
|Purpose|小螢幕route導航與獨立create/account入口。|
|Anatomy|nav landmark、route links、active indicator、獨立create/profile buttons、acrylic track；無button包button。|
|Variants|standard／scroll compact／QC-open／account-open；不是所有入口都當tab。|
|States|route-current、hover/pressed/focus、panel-open、drag/release、keyboard-visible、reduced motion。|
|Design Tokens|mobile-nav現存height64、item48、indicator44、create54／offset-16、pill、floating recipe；層值Phase2遷移。|
|Responsive Behavior|≤768，safe-area底部、底部內容padding、軟鍵盤與短橫向；track mask不截hit zone。|
|Motion Behavior|保留translate380／scale320與press120/release420 signature，Phase6與shell controller同步；只在需要處jelly。|
|Accessibility|route aria-current；create/profile aria-expanded/controls；可見focus，非tablist混合action；hit≥44。|
|Ownership|`app-shell.js`＋`css/components/mobile-nav.css`；QC子button組裝及mask track需一起回歸。|
|Allowed Exceptions|導航可浮動Acrylic並保留抬高create；不能為扁平一致性移除signature，也不能為保留signature放棄讀屏語意。|

## Phase 1 不可跨越的界線

只處理 C04、其必須的 C01/C02/C08 局部能力、Restore action 的單一確認 owner。C03/C05/C06/C09/C10/C11 的重構均未授權開始；尤其 C09 Delete Preview 幾何與 D05 Undo 留 Phase4。現存問題可記錄，不能在Phase1為「共用」擴張成全站Surface重寫。
