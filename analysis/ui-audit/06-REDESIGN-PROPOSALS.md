# 06｜具體重設計提案（供核准，尚未實作）

稽核日期：2026-11-11～2026-11-12（Asia/Taipei）。基準：本地目前工作區，含既有未提交 Landing 變更；不是 GitHub HEAD 的遠端部署稽核。

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
2. Dialog用 `ProjectCard.render(project,{variant:'preview',interactive:false})` 的同一renderer，在自己的container解析幾何；不保留`is-expanded/is-menu-open`、複製id或可操作tag。
3. `snapshot(preview)`只建立一次presentation layer，sourceRect / targetTrashRect / transformOrigin統一座標系；用inert+aria-hidden，動畫不讀store。
4. Confirm、動畫、API分離：接受後開始operation；visual completion不是資料commit；pending提供Undo，失敗回到可理解的卡片狀態。
5. 取消／離頁／reduced-motion都可終止timeline，Promise只resolve一次；trash lid、folder、scrim共用同一clock。resize重新定位或安全完成，不用硬編碼-232。

Undo政策需先決定：建議跨頁仍保留完整5秒queue window，與現有router.flushAll提前提交不同；這屬行為決策，不能當UI整理暗改。Rollback必須恢復卡片opacity、transform、順序、focus與資料標記。

## Alert / Confirm / Prompt 與雙重復原修正方案

共用Dialog outer anatomy：title、可選description、可選body/input、footer。保留現有大圓角與有節制彈性，將滿屏50px blur降為由material決定的scrim。Prompt新增persistent label「分鏡名稱」、input48px、validation/helper預留行；取消/儲存為一致pill。Enter遇IME composition不提交；busy時避免重複儲存；失敗留在dialog可重試。

採明確結果型別 `{confirmed:boolean,value?:string}`，所有caller await。短期先修restore唯一confirm owner；長期不覆蓋window.alert/confirm/prompt，使用DialogService。卡片click只呼叫action；menu restore同路徑；任一取消都0 API；accepted一次只1 API。

## Header／Progressive Blur

保留三階edge當baseline，先規格化header slots（title/actions/subtitle/toolbar）與scroll owner。視覺高度desktop64～80、mobile56～72為起點，長project title可有明確兩列variant；header動態不要把可讀字一起scale .96當唯一策略。可改固定字級＋移位/副標收合，保持flow補償不改scrollTop。

替代A：固定小blur layer＋opacity/tint（低成本）；替代B：既有三階progressive（質感較強，須實機trace）。先比較照片內容背後的對比、底部最後一項可見性，再決定，不先刪mask。

## 跨頁重要決策

Discovery與Settings統一shell裝配，避免直達/從UI進入兩種產品；保留專業分析的較高密度，但減少行銷hero占位。Template內容整理展示摘要與來源原文；專業timeline可用media surface例外。Auth保留filmstrip，修label與focus，而非拆掉品牌圖形。所有正式頁至少有可辨識loading/empty/error，不能把network error當空資料。
