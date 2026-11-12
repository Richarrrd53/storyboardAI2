# Phase 1 Handoff｜Dialog／Prompt／一次復原確認

2026-11-12｜**Ready for implementation planning；實作 Not Started**。本文件只交接，不授權修改。依 [C04](COMPONENT-CONTRACTS.md)、[Phase1 Gate](PHASE-IMPLEMENTATION-GATES.md)、UI-01/05/06。目標是讓編輯專案名稱的輸入視窗有與Alert／Confirm同族的特殊外觀，並根除回收桶雙確認。

## 1. 已核對的現況與根因

|位置|現況|Phase1處置|
|---|---|---|
|`public/js/sys.js:87/139`|自訂global alert回Promise<void>、confirm回Promise<boolean>；innerHTML插文案；description未預設；缺modal focus/inert；ModalAnimation多timer。Alert options含duration但現有函式沒有自動關閉timer。|建立Service與相容門面；普通文字textContent，不將專案名當HTML；description缺省不顯示undefined。保留既有呼叫選項形狀，不憑options名稱新增auto-dismiss。|
|`components/project-card-interactions.js:240`|回收桶卡片同步呼叫confirmFn，Promise被當truthy，立即進restore action。|移除卡片的確認責任，只傳restore intent並處理async結果／重入。|
|`features/projects.js:662`|ProjectActions.restoreProject已await第二個confirm；先樂觀更新再API，失敗rollback。|此action為唯一復原確認owner；Menu和Card皆共用；取消不修改store與API。|
|`features/projects.js:709`|renameProject使用同步native prompt、直接.trim；空白alert、相同名稱no-op、API後更新。|改await Service.prompt；保留trim／empty／same-name規則與epoch保護，提供輸入驗證／busy／inline error。|
|`sys.js` delete分支及`style.css:350`|live card clone＋trash專屬動畫，preview錯形。|隔離legacy delete adapter，保持這一階段時序／操作；不修geometry，UI-02/24留Phase4。|
|`spa-router.js:307`／DeleteQueue|離頁flush提前commit，跨頁五秒尚未實作。|Phase1不改；D05 Phase4解決。|

Mock已重現2個 `.sys-bg`：[DOM證據](../restore-evidence.json)、[畫面](../screenshots/mock-restore-underlying-confirm-1440.jpg)。不是兩個文案太像，而是Promise未await＋雙owner。原四組47測試使用同步confirm mock，不能繼續只測同步true。

## 2. 精確範圍與檔案

|檔案|預計工作|限制|
|---|---|---|
|Proposed `public/js/components/dialog-service.js`|單例服務、結果／queue／session、三variant DOM、焦點／驗證／settle。|無ProjectsApi／ProjectStore；依既有Vanilla module風格，不加框架。|
|Proposed `public/js/components/overlay-manager.js`|僅Dialog需要的portal、modal stack、inert／scroll lock／Escape／returnFocus與cleanup租約。|Phase1不遷移全部Menu/QC/Panel；Phase2擴展通用能力，避免建立第二個競爭owner。|
|Proposed `public/css/components/dialog.css`|M4外框、Alert/Confirm/Prompt一致type/space/pill、input/error/busy/focus與mobile。|Scoped selector，不改全站.btn／input reset；不改正式token數值。|
|`public/js/sys.js`|alert/confirm相容facade；ModalAnimation現有外部使用者先盤點，delete legacy adapter保留。|不要刪未遷移export或改delete resolve時間；兼容既有type/btnText/projectEl。|
|`public/js/features/projects.js`|rename await prompt與field error；restore單一確認、同project在途去重、stale epoch。|CRUD仍用ProjectsApi；不改DeleteQueue／Undo／API endpoint與payload。|
|`public/js/components/project-card-interactions.js`|deleted卡片只dispatch一次intent、await/action-result處理；維持callback相容。|不能用移除action確認造成Menu復原無確認。|
|`public/html/index.html`及實際sys載入入口、CSS import入口|必要的Service/helper與scoped CSS載入順序；維持sys facade對舊入口可用。|本地index有既有dirty修改，須最小合併，不覆蓋；不重排整份shell。獨立頁按實際使用而非一次全加。|
|`tests/*`相關與Proposed Dialog測試|真async deferred、API calls、focus/lifecycle與整合Mock。|測試不發正式delete/restore/PATCH；測試產物不得成產品依賴。|

Phase1不含Hero、AccountRow/UserPanel、SurfaceMorph抽取、Folder geometry、Trash重製、Undo、Discovery殼體、Auth重製、Router重構；不裝新套件作為預設解法。

## 3. 非同步與結果契約（規格，非現有API）

Service 使用明確結果，不以物件truthiness判斷：

```text
DialogService.confirm(options)
  -> Promise<{confirmed:true} | {confirmed:false, reason:'cancel'|'escape'|'outside'|'abort'}>
DialogService.prompt(options)
  -> Promise<{confirmed:true, value:string} | {confirmed:false, reason:...}>
DialogService.alert(options)
  -> Promise<{dismissed:true, reason:'acknowledge'|'abort'}>
```

compat `global.confirm(message,description='',type='default',btnText,projectEl)` 仍回 **Promise<boolean>**；compat `global.alert(message,options)` 仍回 **Promise<void>**。不得使舊碼拿 `{confirmed:false}` 當true。**不全面覆蓋native global.prompt成Promise**：這會讓未遷移同步消費者 `.trim()` 崩潰。rename改顯式Service；Service缺失走明確錯誤／受控fallback，不自動當接受，也不以預設值假裝輸入成功。

呼叫盤點須包含賦值後的`confirmFn/promptFn`、inline HTML handlers及sys其他export，不能只搜尋`confirm(`。目前UI相關：ProjectActions restore/delete、卡片confirmFn、rename promptFn、projects錯誤alerts、template.js／template-timeline.js／upload.js／generate-template.js alerts。`creative-brief.confirm`、`freeform-storyboard.prompt`與generation-task的prompt是業務方法，**不是系統Dialog**，不得批次替換。實作前重新盤點動態載入與測試fake。

Restore：card/menu→ProjectActions.restoreProject→一次await confirm→接受才mutation／API。同project in-flight共享或拒絕重複intent，cancel後可重新開；去重key含operation/session，不能永久鎖死。callbacks按既有成功／失敗邏輯執行一次；舊epoch回應不回寫。

Rename：預填現名→select/focus欄位→trim檢查（不改現有名稱長度規則）→空白inline error→相同名稱no-op／關閉且零PATCH→有效名稱送出。Feature提供async submit callback，Service僅管理busy與顯示其錯誤，不直接呼叫API；失敗保留輸入可重試，成功再close／toast／refresh。提交中禁重送；關閉／離頁不等於能撤銷已送出的server request，epoch guard防止stale回寫，必要時後續refetch。不得自行發補償PATCH回舊名。

## 4. Dialog／Overlay 生命週期

1. Service queue普通阻斷請求，避免兩個互搶焦點；同operation由Feature去重。真正巢狀modal需明確parent，不能用queue隱藏雙確認根因。
2. Portal在app iframe document的專用host；兼容現有sys20000與nav10000層。開啟新Dialog前關閉非必要Popover；Phase1只呼叫現有close接口，不改Morph引擎。
3. capture activeElement／returnFocus target、保存原有inert與scroll狀態；Dialog host不能被自己inert。租約／計數釋放，不把原本inert節點強制開回去。
4. Prompt initial focus名稱欄；destructive Confirm預設focus取消；一般Alert focus確認。Tab/ShiftTab環繞，title唯一id／aria-labelledby；只有實際description才describedby；error使用適當live region。
5. Escape預設取消Confirm/Prompt；outside政策顯式：Confirm/Prompt預設不當作接受，建議不關以免誤觸丟輸入；Alert以確認按鈕結束。提交中dismiss政策須明確並公告busy，不靠長timer吃點擊。
6. DOM使用textContent與安全節點，服務不接受任意HTML專案名稱。多行訊息保留換行，不能把undefined顯示為字。
7. Opening/closing以一個session持有timer/RAF/animation；settle guard只resolve一次。離頁透過既有page signal／navigation事件取消與清理，不需改Router；沒有可用signal的legacy入口使用相容owner。
8. 關閉後restore focus到仍在DOM的trigger；消失時回頁面heading／合理主區，不聚焦已刪卡片。離頁abort不搶新頁已設focus。
9. Reduced Motion取消空間彈跳，流程、busy、回呼與focus照常完成；不能僅依全域0.01ms CSS。

Delete legacy adapter在Phase1可暫維持原動畫；最小modal a11y lease由同Overlay owner管理，不能新舊trap重疊。**不先替換其視覺或時序**，因confirm resolve會啟動DeleteQueue，改快會改產品行為。若橋接無法隔離，停止該子批次列阻擋，不能隱性擴張Phase4。

## 5. 最小可交付批次與必要回歸

|批次|交付|測試與停止點|
|---|---|---|
|1A 契約／Service|Service、最小Overlay、scoped Dialog、sys facade，delete保留bridge。|Unit：deferred結果、settle一次、queue/abort/cleanup；1440/390/375 Alert/Confirm focus／escape／long text／reduced；舊confirm保持boolean，所有compat消費者smoke。|
|1B Restore|卡片移除確認，Action唯一owner與在途去重。|Mock Card/Menu/Enter：開啟前後一次dialog；先不回Promise時API為0；cancel/escape為0；接受為1；雙擊仍1；503 rollback、epoch改變不回寫；description非undefined。|
|1C Rename Prompt|正式特殊外觀Prompt、await/驗證/busy/error重試。|空/空格、同名、長中英、IME Enter、Escape、重複submit、PATCH失敗重試、route abort、trigger消失focus；成功API和refresh恰一次。不得操作真實專案。|
|1D 整合驗收|受影響入口、相容export與Delete bridge regression、證據bundle。|重跑四組既有tests＋新增async integration，記實際passed/failed數；Mock delete確認/取消/動畫時序不變，跨頁Undo已知問題未碰。每個After對baseline ID。|

四組既有測試命令：

```text
node --test tests/project-card.test.js tests/project-card-interactions.test.js tests/project-option-morph.test.js tests/history-page.test.js
```

前輪47 passed僅是歷史基線；Phase0未重跑，也不能拿它為上述批次Passed。新測試應讓真實async contract參與，不用`()=>true`掩蓋Promise問題。Browser integration涵蓋inert／Tab／focus與visualViewport，純DOM fake不足。

## 6. 交付判定與風險

最高風險是全域同步／非同步混用、delete resolve時間變動、modal與其他overlay重複lock、頁面卸載後stale回寫。依批次驗證，任何必要項Pending就維持未通過。新增diff必須限上表、記錄例外，不修改API、正式token或scope外dirty檔。Phase1結束需附Before/After、動畫紀錄、API call count、測試結果、契約符合表、未完成清單；使用者指示前不開始1A。
