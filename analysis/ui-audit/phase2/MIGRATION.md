# Phase 2：Owner／Alias／Layer 遷移表

2026-11-12～2026-11-13。以下是已修改的來源對照；不是宣稱411項Token或每個頁面皆已正規化。

|領域|Canonical|Alias／Legacy／例外|本輪消費者|
|---|---|---|---|
|Floating recipe|`tokens/components.css` 的`--surface-floating-*`|`--glass-floating-*`沿用Alias；blur.css僅raw blur，shadow.css僅通用elevation。@supports及QA attribute重定義是fallback狀態，不是競爭owner。|acrylic、Mobile Nav、Option Menu、User Panel、QC resting capsule|
|閱讀材質|`--surface-floating-reading-bg`，同Floating family|Menu／Account較高alpha；不把背景照片直接當文字底|Menu、Desktop/Mobile account panel|
|Composer材質|`--surface-composer-bg/blur`|`--creation-composer-bg`是context Alias；保留原有composer的漸層／12px blur比例|creation-workspace、Generate／QC；資料草稿和動畫controller不變|
|Opaque|`--surface-floating-opaque-bg`＋supports fallback|`data-opaque-surfaces`只為可重跑QA；不新增產品流程|同family消費者|
|Button|components/button.css|`.btn-xs`保留Legacy密集顯示；coarse pointer仍44px。不把ChoiceCard改成Pill。舊shine由原位置保留。|移除style.css的重複base／size／ghost／outline／danger／icon定義|
|Input/Search|components/input.css＋border tokens|QC field-wrapper有自己的focus-within，保留局部outline reset；不把所有native select換成自訂menu|全域三份reset移除，既有form/search classes及Prompt|
|Dialog|`--dialog-backdrop-*`／duration／enter/exit ease|來源為使用者最新指示；優先於Phase0先前的200/300ms研究候選。Delete專屬legacy保留原接受時點。|Service、Tag、建立模板、來源資訊；Logout／Restore透過Confirm|
|Error／Focus|`--color-text-danger`→red-600；focus-ring→blue-600|補red-700是因既有danger-active未有primitive；不是新配色系統|token consumers；透明合成的真實畫面仍須另量|
|Nav／Menu／Account|layer-nav200／dropdown300／popover400|不再用10000/10001/10060決定此family順序|Sidebar、MobileNav、Option portal、Account desktop|
|QC|dock500、backdrop498、nav501、content502|子元素內部z-index保留，不能把local stack當root portal|ai-creation-layer、capsule、quick-create、QC focus states|
|Sheet／Dialog|sheet690／scrim689、modal700|右側Shot Editor僅layer mapping，不改其drawer動畫；普通Service與legacyDelete都在modal role。system20000留給critical layer。|mobile account、editor、Tag／Source／sys／Service|
|Transition／Toast|transition650、toast800|Cover／Nav transition只換layer；不改軌跡、transform origin或Router|navigation style、flying cover、QC flight、loader|

## 暫保留與下一階段

- `--ai-dock-width` components380與aggregator clamp的既有競爭，依Phase0暫保留最終clamp；不借Phase2改QC尺寸。
- Header progressive-edge與多層mask維持原樣，性能層數調整在Phase6。
- AccountRow DOM／SurfaceMorph engine／鍵盤adapter在Phase3；本輪不複製或重寫Morph controller。
- Folder shape、Delete Preview／Trash geometry、Undo跨頁五秒在Phase4，相關Feature source未改。
- 原始Template內容層級／labels／來源文案及其他page-only尺寸留Phase5；沒有把原始使用者內容當設計裝飾刪除。
- 既有頁面局部高specificity／outline reset仍需逐消費者視覺驗證；沒有用新的全域!important整平所有元件。

## 數值驗證界線

Node測試解析實際Token來源，驗證alias不循環、必需引用存在、layer嚴格排序與control scale；依宣告色值計算focus／文字對比。這是foundation數學檢查，**不是實際DOM透明合成、字型載入或畫面對比測量**。
