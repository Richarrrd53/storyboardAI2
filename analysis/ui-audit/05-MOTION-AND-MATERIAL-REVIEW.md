# 05｜Motion Engineering 與 Material Review

稽核日期：2026-11-11～2026-11-12（Asia/Taipei）。基準：本地目前工作區，含既有未提交 Landing 變更；不是 GitHub HEAD 的遠端部署稽核。

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
