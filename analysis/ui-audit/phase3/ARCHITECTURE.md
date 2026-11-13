# Phase 3 架構與維護契約

## 責任與 API

|Owner|責任|
|---|---|
|SurfaceMorph|單一 active surface、trigger 幾何、viewport clamp、Portal、動態與中斷；不持有 CRUD 或登入邏輯|
|OverlayManager|modal inert／焦點鎖／捲動鎖，以及 non-modal dismissal lease；modal 開啟會清除非 modal surface|
|ProjectOptionMorph|既有 API 相容層、專案選項內容與 ProjectActions 委派|
|Projects page|標籤多選與排序資料、選取語意；經 openSurface 交給引擎呈現|
|UserPanelController|一份帳戶內容的桌面 Morph／手機 Sheet、drag、page signal 與 breakpoint 清理|
|AppShell|Account Row、真實帳號資料、回收桶／登出行為與既有導覽；不另建 User Panel outside-click owner|

`SurfaceMorph.open(trigger, options)` 回傳 `{menu, phase, close(reason), closed}`。options 包含 content DOM、label、role、keyboard、width／height fallback、radius、placement／align、signal、onOpened／onClose、keepTrigger、watchTriggerResize。height 先離屏量測，再限制於可視高度；量測副本移除 id，不綁互動。

一般 menu 使用 roving focus、ArrowUp／Down、Home／End，Tab 離開即關閉；account 使用 dialog role、原生內容 Tab 順序。手機 Sheet 為 `aria-modal=true`，由 modal lease trap focus。Native select／combobox 未遷移。

## Session 狀態

closed → opening → open → closing → closed。關閉中的相同 trigger 再開啟時沿用 surface，從最後寫入的 frame 反向插值；opening 中關閉亦從當前 frame 開始。另一個 trigger 開啟則替換舊 session。navigation／unmount／destroy／modal／trigger_removed 等清理不執行待完成專案 action，也不把焦點送回離頁節點。

開啟保留 480ms 品牌排程；完整關閉為 440ms；中斷使用相同時長的連續插值，避免重設成完整矩形。正常動態每 frame 只寫入已快取幾何，不交錯讀 layout。寬高與邊界仍有 paint 成本，尚未以真機 profiler 驗證效能。

桌面 Account Row 在 settled 時仍可見，回程時才暫時隱藏；選單使用大圓角外框、內部 pill。320px 桌面面板與手機 Sheet 都消費 Phase 2 Floating Surface tokens。手機保留背景 0.95 的層次變化及既有 Bottom Nav spring。

## 事件與釋放

- 引擎持有 RAF、motion preference listener、popover lease。finish／destroy 取消並移除 Portal，還原 trigger 可見性與 aria-expanded。
- popover lease 持有 window scroll capture、resize／orientation、visualViewport、keydown、document pointerdown／focusin、signal 及 observer。release 可重複呼叫。
- trigger 尺寸觀察為可選：account dialog 預設啟用，filters 預設不啟用，以免選取文字改變就關閉。頁面捲動／視窗改變仍會關閉一般浮層。
- UserPanelController 持有 Sheet WAAPI、timer、pointermove／up／cancel、modal lease、resize、motion preference 與 page abort。建立者負責 destroy；AppShell 移除舊計時阻擋與第二組全域 click handler。
- Mobile drag 只由 handle／非互動 header 發起；超過 6px 才 capture；距離 30% 或向下速度 >0.38px/ms 才 dismiss。pointercancel 回彈，不提交關閉。
- 同一手機模式 resize 保留 Sheet；跨模式關閉並將焦點送回目前入口。下一次開啟重用同一 account DOM，不在 resize 事件中自動建立另一套面板。
- Modal lease 存在時，Shell 的 resize handler 不修改 Bottom Nav inert／aria-hidden，避免多個 owner 互相覆寫。

## 載入順序與後續遷移

index.html：OverlayManager → SurfaceMorph → ProjectOptionMorph；UserPanelController → AppShell。DialogService 使用同一 OverlayManager instance，不能重載另一份 manager。

其他適合 Morph 的自訂浮層應新增內容 Adapter，透過 open／openSurface 接入；不得複製 timeline。QC、Folder、Hero、封面過場、Undo 與原生輸入語意維持原有 owner，不在本輪擴張遷移範圍。未新增框架、套件或 GSAP plugin。
