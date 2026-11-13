# Phase 5｜Workspace／Choice／Navigation 規範

## Dashboard Hero

容器為raised solid，既有圓角／語意token；Desktop min-height200px且不設max-height；手機min-height160px、88px代表畫面欄。Desktop視覺欄最多三張真實畫面，手機只呈現第一張；圖片object-fit contain，沒有圖片以分鏡構圖取代，不當作作品。長標題wrap，不複製Folder手機單行規則。200%文字允許增高。

view model只有loading／empty／project／error；projects仍由ProjectStore擁有。priority為最近非deleted、非pending-delete的作品；不新增API、進度數字或虛構featured。primary context action是繼續編輯，建立分鏡仍由QC擁有；模板為secondary button。

## ChoiceCard／Segment／Action（UI-22）

|元件|用途|幾何／狀態|鍵盤與互動|
|---|---|---|---|
|ChoiceCard|ratio／visual style，有內容預覽或形狀差異|保留較方正容器；使用語意border、selected surface、立即focus-ring；不可為一致性強套pill|單選radio group或既有明確多選契約；disabled可辨識，不能只靠hover|
|Segment|同組小型互斥設定／檢視|同尺寸軌道，selected與pressed有穩定視覺；不做下拉Morph|按實際radio／toggle語意，箭頭規則與Tab順序需對照功能|
|Action|送出／下一步／展開設定|既有button/pill contract；busy與disabled分開|原生button，一個DOM click owner，Enter／Space有效|

Generate風格／比例已使用ChoiceCard，時長已使用Segment，共用ChoiceGroup的radio語意、單一Tab入口、方向鍵／Home／End與disabled略過。值更新由既有Generate handler擁有；群組只管理鍵盤與語意，AbortSignal／重掛載清理。42秒等自訂時長保留並顯示提示。Native select／combobox保留原本鍵盤行為。六寬度實際視覺驗收待補，詳見remaining/README.md。

## Mobile Navigation

nav landmark → base track → route anchors／layout-only create slot／profile button。Focus track是裝飾，保持aria-hidden。route aria-current依selectedRoute決定，不跟著profile或QC indicator轉移。profile aria-pressed與expanded表示surface；QC由內部唯一trigger button擁有鍵盤及expanded。

## Auth

auth-field = visible label + clipped input pill；label不放進overflow hidden。inactive面保留flip幾何，使用inert／aria-hidden阻止焦點。密碼button有穩定controls／label／pressed；不更改登入API或密碼驗證條件。

## Template 展示／來源契約（UI-27）

TemplatePresentation只產生display view model，不修改catalog／template或生成輸入。優先displayTitle／displaySummary等明確編輯文案；來源衍生摘要須標明「來源說明摘錄」，移除顯示層hashtag／促銷URL；來源視窗保留逐字原文。未知規格顯示未提供，不能用timeline內部播放fallback冒充影片事實。列表／Generate模板卡／詳情共用這個owner；長內容展開同步aria-expanded，來源長字串可換行。
