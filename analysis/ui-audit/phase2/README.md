# 修正回合與 Phase 2 交付

2026-11-12～2026-11-13｜**程式修改與自動測試完成；瀏覽器／視覺驗收 Pending Verification。** 不將此狀態標成 Phase2 release gate Passed；未進入Phase3，未Commit／Push。

本輪依使用者最新四項修正與 [Phase0 Gate](../phase0/PHASE-IMPLEMENTATION-GATES.md) 執行。原有Phase1報告／截圖保留為歷史Before；目前變更以本目錄為準。

## 四項修正

|項目|根因／修改|驗證狀態|
|---|---|---|
|隔離驗證台無法操作|先前服務已停止，且4317產品Mock與4318驗證台容易混淆。新增`npm run audit:ui`、根路徑導向、health檢查、啟動等待、可見錯誤、固定外部JS及單一操作防重入；壞JSON回400而非讓服務崩潰。同服務已啟動時再次執行會提示現有入口。|HTTP測試確認入口、JS/CSS依賴、錯誤／重試fixture；本輪未取得瀏覽器可用性驗收。|
|中央彈窗底部按鈕|Prompt／Confirm／復原／登出採與Delete相同的`sys-btn primary/secondary`語彙：兩顆Pill等寬、44px控制高、12px gap、填滿footer。單一確認的Alert仍為一顆全寬；標籤、建立模板、來源資訊footer亦接共同規範。|程式及樣式解析完成；實際375/390/1440像素量測待驗。|
|中央彈窗動畫|一般Service彈窗改blur 0→50px、scale 0→1、400ms，enter為`cubic-bezier(.33,1.53,.69,.99)`；exit採現有Delete的`.31,.01,.66,-.59`曲線、scale→0、blur→0；退出不動畫scrim opacity/background alpha。標籤／模板共用ModalAnimation；來源資訊加相同開關、portal及cleanup。|動畫keyframes／曲線／背景不淡出、快速重開及Reduced Motion單測通過；逐幀視覺與實機性能未驗。|
|手機History整頁載入與Nav|User Panel回收桶anchor原本未綁SPA，而且帳戶事件要等fetchUser後才綁。現在先綁帳戶操作、攔截一般點擊並navigate('history')；History設Nav hidden/inert/aria-hidden，回Projects等主頁恢復。Ctrl／Cmd等修飾點擊保留原生行為。|事件與route／Nav狀態單測通過；實際document reload counter待瀏覽器驗。|

Delete分鏡專屬的clone、Trash軌跡、1000ms關閉／1500ms接受、既有背景淡出保留，透過明確legacy旗標與新普通Dialog政策區隔。Generic ModalAnimation的transition改列明屬性，加入timer owner，避免舊close completion把重開視窗關掉。**沒有改DeleteQueue／Undo政策。**

## 直接使用驗證台

目前本輪啟動的隔離服務保留在：

**[http://127.0.0.1:4318/phase1-harness](http://127.0.0.1:4318/phase1-harness)**

服務停止後，在repo執行：

```text
npm run audit:ui
```

不要直接雙擊harness.html，也不要把驗證台路徑套到正式server。啟動後頁面會先檢查`/audit-health`與載入依賴，成功才開啟操作按鈕。測試資料只在記憶體；不載入server.js／dotenv／資料庫或正式API代理。

- **執行隔離回歸**：檢查等寬按鈕、動畫、scrim退出、inert／abort、復原取消。這是可由使用者執行的runner，**本輪尚未在瀏覽器執行，不宣稱通過**。
- **375/390手機／1440桌面**：visual.html提供375／390／1440的iframe viewport容器，可在URL以width指定。不是實體手機。
- **登入隔離帳戶並開啟工作區**：只對本機fixture登入；不需輸入真實帳密。Panel→History檢查會記錄inner document load次數與Nav hidden狀態。
- **Opaque fallback**：只供QA切換root attribute檢查；不是新增正式產品設定。

## Phase 2 實作範圍

1. **材質唯一來源**：`tokens/components.css`擁有Floating bg／blur／border／shadow／highlight；移除blur.css／shadow.css的同名競爭定義，保留glass aliases。Nav、Menu、Account Panel、QC接相同family；長閱讀Panel與composer保留有明確用途的variant。
2. **Foundation補缺**：focus由blue-400改blue-600；error文字用已有red-600；補上已被danger-active引用卻缺失的red-700 primitive。沒有重命名整套變數。
3. **Control owner**：移除style.css的重複Button基礎／尺寸／variant覆寫，交回button.css；36/44/52、icon hit40／touch44。移除style/shell/dashboard全域input outline!important reset，Input/Search使用focus token；保留局部field-wrapper焦點設計。
4. **Layer／Portal**：Nav200、Menu300、Account400、QC500附近、Transition650、Sheet690、Modal700、Toast800；消費者改用語意Token。SourceModal可portal到body並在卸載時還原／清除；既有dialog lease測試覆蓋重疊owner的scroll/inert清理。
5. **Fallback**：無backdrop支援時浮層／composer採opaque底、停用blur；連續圓角fallback沿用。沒有在base canvas／Folder加backdrop，也沒有抽換Morph引擎。

[遷移對照](MIGRATION.md) 列Canonical／Alias／Legacy與具體消費者；[Gate紀錄](GATES.md) 列通過與Pending項目；[測試輸出](test-results.txt) 為本輪實際結果。

最終驗證（2026-11-13）：**178項相關測試全部通過；20份變更CSS通過語法解析。** 實際命令與測試界線見 [TESTING](TESTING.md)。

## 保護範圍

Router、Folder renderer／幾何樣式、ProjectOptionMorph JS、Dashboard Hero、Landing、Projects Feature（包含DeleteQueue／Undo）未改。Cover與Navigation transition JS僅換layer引用，不改幾何／timeline。`dashboard.css`變更限焦點reset、帳戶材質、layer與dialog footer，不改Folder／Hero規則。

沒有安裝框架或套件；CSS語法檢查使用工作區原有PostCSS。Hallmark／Unslop用於元件層級、材質、focus與品牌判讀；使用者明確要求的scale0／彈性曲線／動態blur優先，不套用取消品牌回彈或玻璃材質的通則。Unslop來源：Damir Sokolovsky（@heydamir），CC BY4.0。

## 尚未完成的驗收

本輪Windows瀏覽器工具因無法可靠確認目前瀏覽器網址而停用；沒有改走其他UI自動化來繞過限制。因此 **沒有新的After截圖、瀏覽器runner結果或動態影片**。HTTP及單元測試不能替代畫面／computed-style／實機驗證。

待驗：1440/390/375實際等寬膠囊、blur/scale中斷的連續性、完整退出scrim、手機User Panel→History無重載與返回Nav、A→B→A CSS卸載、QC/Menu/Sheet/Dialog遮擋、Opaque／corner-shape fallback、Safari／Firefox、軟鍵盤、讀屏與性能trace。詳見 [截圖待驗表](SCREENSHOTS.md)。Phase2不標整體Passed，停在此處供審閱。
