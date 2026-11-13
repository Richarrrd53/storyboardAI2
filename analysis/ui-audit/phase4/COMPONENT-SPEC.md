# Project Folder v4｜元件與動態契約

> 本頁保留初版規格；後續手機單行標題、橫扁比例、option等比縮小，以 [REQUESTED-ADJUSTMENTS.md](REQUESTED-ADJUSTMENTS.md) 最新段落為準，尚未驗證。

## 幾何

卡片寬度由宿主 grid 分配、上限 316px。卡片本身是 inline-size container；不以頁面祖先決定外殼形狀，不用常態 transform scale 補 layout。JS resolver 與 CSS native container layout 使用相同係數；動畫使用實際 snapshot，不能使用舊固定 cover fallback 作正式卡片尺寸。

|欄位|公式／規範|
|---|---|
|Preview frame width|card width − 12px|
|Preview frame height|preview width × 9／16；媒體 contain，保留真正比例|
|Insert depth|clamp(24px, width × .17, 46px)|
|Tab height|clamp(22px, width × .14, 36px)|
|Notch radius|Tab height × 2／3|
|Squircle vertical reference|Tab height × 10／9|
|Headroom|12px|
|Shell minimum|fine pointer：clamp(136px, width × .54, 160px)；coarse pointer：176px，容納 44px 操作|
|Density|width ≤268px：Dense；更寬：Default。Preview 依真正 layout width 使用同規格|
|Option|可見 36×28px，透明命中區 44×44px，保留 Morph trigger 真實 pill rect|
|Title|最多兩行、完整名稱保留於 link accessible name／title；主入口為真正 anchor|
|Phone grid|Dashboard／Projects／History：兩欄 minmax(0,1fr)，水平 gap12、垂直 gap28|

136px 最小 Shell 與 coarse-pointer 176px 是本輪最後的尺寸校準；對應最終瀏覽器重拍仍待驗證。已保存的初版量測 Shell 為133px，不能直接拿來宣稱這兩個新值已實機通過。

Default 與 Compact 可以有資訊量差異，例如 Dashboard 最近專案只顯示前兩個標籤與剩餘數量；不再有不同的文件夾幾何。Deleted 是同元件狀態；Preview 為 readonly variant，沿用 shell／tab／notch／stage。未新增 List 展示功能。

## DOM 與資料責任

- `ProjectCard.register(card, project)` 以 WeakMap 登錄資料；interaction adapter 在綁定時呼叫。
- `renderProjectCard(project, {readonly})` 是唯一 anatomy renderer。正常 title link、tag button、option button 為兄弟，沒有 button 包 button。
- `createPreview(source, {width})` 建立新 readonly root，使用同 renderer。從 source 只取資料／已載入圖片 URL，不 clone live card，也不複製任意 computed transform。
- Readonly root 為具專案名稱的 image role，沒有互動 tag、重複 id 或 tab stop；option 外觀隱藏但 notch geometry 保留。
- 圖片載入只改媒體 fitting／fallback，不重寫 frame 寬高；失敗保留草稿狀態。Portrait ambient／contain 材質沿用原組件。
- `captureGeometry` 包含 width、density、shape、origin、sourceRect、shell、tab、preview、media。layout width 避免 clientWidth 的整數捨入，飛行起點仍使用實際 transformed preview rect。

Owner：ProjectCard 負責 render／geometry，ProjectCardInteractions 負責導航／選單／焦點與 WeakMap 接線，CSS 負責常態尺寸；Host 只決定 grid／資訊 variant。Cover Transition 接入同一 snapshot，抽出／等待／handoff／return 的既有流程不重寫。

## Trash narrative

`ProjectTrashMotion.animate({preview, bin, signal, duration})` 回傳 `finished／cancel／complete／geometry`，不持有 project CRUD、store 或 Undo。

1. 確認按下時，量測真正 readonly preview 與垃圾桶 lid／mouth，換算父層 scale，快取幾何。
2. 依 elapsed time 的 quadratic arc 計算位移；終點為 mouth 中心。縮小量由 mouth／preview 寬度比例決定，不靠固定 −232px 深度。
3. 保留 rotateX、向上拋起、垃圾桶與 lid 回彈的敘事；結尾縮小／blur／fade，元件本身幾何不變。
4. 開始時間取啟動時 timestamp；延後第一個 RAF 不重設時間。視窗退出前 complete 末幀，避免 timer 與 RAF 不同步。
5. cancel／abort／detached node 移除 RAF／motion listener；Reduced Motion 直接完成末幀。每 frame 只寫已快取幾何。

sys.js 保留原本確認後 1000ms 開始關窗、1500ms 回傳接受結果的橋接時點。Feature 之後的刪除、原卡片移除、Toast、Undo deadline／commit／rollback 完全不在動態模組內。

## 兩項補充要求

Account adapter 使用 `transparentTrigger`，不使用 keepTrigger。材質板與 icon 分開插值，白色表面／邊框／陰影在回程退回0；原 trigger 僅在完成後還原。初始／中斷 frame 都有明確 surface presence，避免反向時白底跳回。

一般中央 Dialog：穩定態 scale(1) → scale(0)，退出 `cubic-bezier(.31,.01,.66,-.59)`；中途關閉保留當前 transform 以避免瞬跳。背景只反向 blur，不降低 opacity／background alpha。刪除特殊 confirm 仍由獨立 adapter 處理。
