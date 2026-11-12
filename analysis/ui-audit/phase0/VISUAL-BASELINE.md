# Visual Baseline｜Phase 0 凍結

2026-11-12｜現況參考基線，不是v4目標已通過。資料來源：[63張索引](../SCREENSHOT-INDEX.md)、[頁面覆蓋](../01-PAGE-INVENTORY.md)、[測試紀錄](../VERIFICATION.md)、[113檔來源清單](../source-inventory.json)。本階段沒有重新操作產品或重拍，既有證據足以建立交接索引；缺漏留待對應實作Phase針對性補拍。

## 版本與證據可信度

- 本地工作區包含既有未提交Landing／package變更；不是GitHub HEAD／遠端部署基線。Phase0開始逐檔SHA-256比對113個已建檔CSS/JS/HTML：**113相符，0漂移，0缺檔**。這證明來源清單範圍內無變動，不證明API資料、字體或browser環境相同。
- 原圖日期2026-11-11～12，Desktop Chromium IAB CSS viewport；沒有實體iOS/Android、Safari/Firefox／GPU trace。沒有完整記錄browser版本、DPR、font load／資料fixture版本，因此這批是**人工Before參考**，不得作嚴格pixel golden或自動容差基準。
- V＝授權本地環境實際目視；M＝4317記憶體Mock隔離操作；S＝程式碼。Mock不是正式API驗證。原生rename prompt僅工具回報type=prompt並取消，沒有可用開窗截圖。
- 下方Manifest讀取所有原圖的實際編碼尺寸與SHA-256；像素尺寸不是CSS viewport／DPR獨立證明，檔名及前輪操作紀錄決定已知viewport。截圖都為viewport畫面，不能當整頁完整內容。
- 歷史測試47 passed/0 failed/0 skipped，詳見VERIFICATION；Phase0無runtime變更，不重跑測試、不宣稱新增測試Passed。雙重確認真async契約未被舊測試覆蓋。

## 可直接引用的 Before／After 對照

|Baseline ID／後續Phase|既有Before（相對screenshots）|保留／比較重點|缺漏／狀態|
|---|---|---|---|
|B01 Hero／P5|[1440](../screenshots/dashboard-1440.jpg)、[390](../screenshots/dashboard-390.jpg)、375/1920|冷白工作區、Welcome；A+B降低高度、最近首列與QC主次|1024/768、空帳戶、200%文字：Pending Verification|
|B02 Sidebar／P3|[collapsed](../screenshots/dashboard-1440.jpg)、[expanded](../screenshots/sidebar-expanded-1440.jpg)|海軍藍／nav對齊；36px AccountRow anchor收展|收展影片、keyboard、短視窗、長名：Pending Verification|
|B03 Account Panel／P3|[Desktop](../screenshots/user-panel-1440.jpg)、[Mobile](../screenshots/user-panel-390.jpg)|同資料／材質族；保留手機sheet、Desktop改連續Morph|拖曳、live geometry、breakpoint中斷：Pending Verification|
|B04 Folder／P4|[Projects390](../screenshots/projects-390.jpg)、[Dashboard390](../screenshots/dashboard-390.jpg)、[History390](../screenshots/history-390.jpg)、各1440、Projects375/768/1024/1920|同一物件shell/tab/notch；同寬三頁Dense雙欄；禁止scale補layout|三頁同fixture成組量測、History375/768、無封面與長名：Pending Verification|
|B05 Menu／P3|[穩態](../screenshots/project-menu-open-1440.jpg)、[中途](../screenshots/project-menu-1440.jpg)、[tag](../screenshots/tag-filter-1440.jpg)|Trigger→Dot→Surface連續；內pill／外squircle、focus|完整開關錄製、sort、多標籤、Mobile、快速中斷：Pending Verification|
|B06 Delete／P1 bridge/P4 geometry|[Mock1440](../screenshots/mock-delete-confirm-1440.jpg)、[Mock375](../screenshots/mock-delete-confirm-375.jpg)、[in-flight](../screenshots/mock-delete-in-flight-1440.jpg)|同Folder幾何與Trash origin；P1只確保未退步，P4修形|單frame不能驗全軌跡；60/120Hz／reduced／rollback／Undo：Pending Verification|
|B07 Restore／P1|[雙confirm](../screenshots/mock-restore-double-confirm-1440.jpg)、[下層](../screenshots/mock-restore-underlying-confirm-1440.jpg)、restore-evidence.json|取消不mutation、唯一確認owner；需新增單confirm After|Mobile、API count／取消／失敗：Pending Verification；Mock根因已確認|
|B08 Rename／P1|UI-05 source／mock-actions（無開窗圖）|Prompt同Alert/Confirm特殊外觀、輸入／busy／error|**實作前補拍受控native Dialog可用證據或記工具限制**；新增Prompt Before不可假造；全部After待驗|
|B09 Header／P6|[Discovery scroll](../screenshots/discovery-scroll-1440.jpg)、template-detail-scroll-1440、generate-settings-scroll-390|邊緣progressive blur用途與可讀空間，不立即刪層|首/中/尾同頁成組、focus邊界、trace：Pending Verification|
|B10 Mobile Nav／P5/6|dashboard-375/390、projects-768|Floating Acrylic／抬高create／active track及jelly|safe-area、實機touch、keyboard、focus mask、動畫：Pending Verification|
|B11 QC／P6|[展開375](../screenshots/qc-open-375.jpg)、dashboard-375（收合背景）|主要創作入口、展開層次與流體觸感|Desktop展開、完整close／中斷／keyboard：Pending Verification|
|B12 Landing／P6 preserve|landing首屏六width、[opening390](../screenshots/landing-opening-scroll-390.jpg)、[workflow390](../screenshots/landing-workflow-390.jpg)|電影膠卷→真產品的敘事、scoped timelines／pin|全progress影片、reduced、media load／route重入：Pending Verification|
|B13 各頁／P5/7|login/register、generate、project-detail/filmstrip/editor、template、discovery/settings（見完整Manifest）|保留功能辨識、資料與路由來回，逐issue比較|Generate後段/生成結果、Template進階手勢、設定成功/失敗、正式API回滾未驗|

## 已知截圖陷阱（優先於檔名）

`qc-390`實際User Panel，不可引用為QC；`shot-dialog-1440`實際filmstrip click未開窗，真正editor為`shot-editor-open-1440`；`template-390`仍是detail，列表用`template-catalog-390`；`template-advanced-390`沒有完整手機timeline；`landing-footer-390`不是最後footer；`project-menu-1440`是動畫中途，不能據此判穩態內容消失。`mock-delete-in-flight`僅一frame。Legacy Analyze為舊頁靜態Mock，不代表正式SPA入口可達。以上原圖不改名、不重寫歷史索引。

## 後續截圖／動態採集規約

1. 每個After登記B-ID、issue/contract、route進入方式（SPA／standalone／deep link）、版本與dirty hash、fixture id、CSS viewport寬高、DPR、browser版本、font ready、reduced motion、scroll位置、overlay狀態。敏感帳密／key不得進圖或報告。
2. 先重拍相同條件Before；原圖可作參考，但環境不匹配不能宣稱pixel regression。圖片固定fixture／seed，clock與loading準備完成後截穩態。截圖差異容差逐測試說明，不用大門檻吞幾何錯誤。
3. 手機Folder必須同viewport、同fixture、同density三頁組圖，加DOM尺寸：card/shell/tab/notch/preview/option/title bounds。截圖相似不等於幾何已一致。
4. Motion另錄開啟／中斷／關閉、trigger/live rect與完成事件，60/120Hz需記真實環境。靜態圖不可宣稱easing、cleanup或FPS通過。
5. 六width主頁＋受影響互動；不足則在Gate維持Pending。不為補證據操作真實delete/restore/rename；用記憶體Mock或已授權隔離fixture。
6. 原Before與以下SHA不覆寫；新截圖用新檔名／版本。若正式碼先有變動，先更新本地source snapshot並記drift，不拿舊圖假裝新版本。

## 已知未驗覆蓋

Dashboard 1024/768；除Landing/Projects以外多數頁無完整六width。全部實機iOS/Android、Safari/Firefox、螢幕閱讀器、軟鍵盤／safe-area、性能trace、全站Reduced Motion、載入/錯誤/正式Undo／生成後段／永久刪除皆未全面驗。非正式Dev/Demo/Test保持原分類，不能併入正式頁Passed。詳情沿用01逐頁表。

## 原圖 Manifest（Phase0讀檔凍結）

以下由現有檔案計算；`Size`為編碼像素，`SHA-256`為原圖內容指紋。檔名含viewport寬，不表示所有狀態已測。

|File|Size|SHA-256|
|---|---|---|
|[dashboard-1440.jpg](../screenshots/dashboard-1440.jpg)|1440×900|0cdb8ce92aca68dce0a4734cf25f90a5b150bc736918fc916cbbd4c58bbc2a52|
|[dashboard-1920.jpg](../screenshots/dashboard-1920.jpg)|1920×1080|03e89820c9274f9647151ee7f60ae28a7690ea0350c6ced88e4758a6c7488164|
|[dashboard-375.jpg](../screenshots/dashboard-375.jpg)|375×812|0e3549cf31ee174916617f69fc91c9c57f9cccc4f017f71c638bf9c182c3dab1|
|[dashboard-390.jpg](../screenshots/dashboard-390.jpg)|390×844|0afacaef09e1f7c072a55a1683b6927565a7ef7b4fac95768dc18c380a6f1a82|
|[discovery-scroll-1440.jpg](../screenshots/discovery-scroll-1440.jpg)|1440×900|7cbd881c586dc3e6890e4a965227c2db1f49d01b6344bc6fe52c8e787937d8bf|
|[discovery-settings-1440.jpg](../screenshots/discovery-settings-1440.jpg)|1440×900|aa3eac0ce783d3846f2cfc2ade46c96f29bfd2c0c1233fc4487a955fe4cf9c54|
|[discovery-settings-390.jpg](../screenshots/discovery-settings-390.jpg)|390×844|33438d90901fd3586a4cb2ae4d6a047ab250c773d4e0dc7a4ae188349183f9be|
|[discovery-spa-1440.jpg](../screenshots/discovery-spa-1440.jpg)|1440×900|ad7f7ebeb6293f441cadcddb0366eb279d25677b5c43afbbdaf17b4d65089640|
|[discovery-standalone-390.jpg](../screenshots/discovery-standalone-390.jpg)|390×844|75afea9f98697185954be38de75daec46ca31ea1582219df2f3087e8b585b352|
|[generate-1440.jpg](../screenshots/generate-1440.jpg)|1440×900|29980cbc88940bf7e9c3f0c318300fb321708bc3b1183f3534c8196e3d5baeb1|
|[generate-390.jpg](../screenshots/generate-390.jpg)|390×844|7e71668e593ed1d104654188590567251105fc883915d71b1da901eacd1b1b79|
|[generate-settings-390.jpg](../screenshots/generate-settings-390.jpg)|390×844|f2a26ecedcecf426ee32b5650ef726812110fd02984d0bc1247a769dfb2bba4f|
|[generate-settings-scroll-390.jpg](../screenshots/generate-settings-scroll-390.jpg)|390×844|15d5a7db82492e64dc26b18b9a8fadf6cb857e42b4cda47af720c09db867eff1|
|[history-1440.jpg](../screenshots/history-1440.jpg)|1440×900|7bd5b6c4f759b91c6f0f89eefdd1c5f82e896289c2cb02f30bc175ffac0857bb|
|[history-390.jpg](../screenshots/history-390.jpg)|390×844|25273773f550488abe755eb6c1504445203a09c9efd6d6b515a0f78857996de2|
|[landing-1024.jpg](../screenshots/landing-1024.jpg)|1024×768|1fcd851bd6fff6e7d7c3c7f237735b7cfd7b6faee9b5b66ef3bd39ae21b04607|
|[landing-1440.jpg](../screenshots/landing-1440.jpg)|1440×900|6a79837caab79d181d9a90b1106d70beb26fa08534aa8952715fd023fb64a355|
|[landing-1920.jpg](../screenshots/landing-1920.jpg)|1920×1080|340227bed87cc4ddfb8a9f90e1bd6a578aa52f238b70b0f0e9a44a55d4891146|
|[landing-375.jpg](../screenshots/landing-375.jpg)|375×812|1f8f1a1989289b1e33b339c904538b3e8223f84865629b4894b6d741f84edf0e|
|[landing-390.jpg](../screenshots/landing-390.jpg)|390×844|97e9815991e492aaf825cd6a37a4bf2ba095e122091ee225c5ca7e700dbcfd93|
|[landing-768.jpg](../screenshots/landing-768.jpg)|768×1024|08445a7c2690352e79a6069b052c8ab366b15f504d28016235b0048e71bfdbb7|
|[landing-footer-390.jpg](../screenshots/landing-footer-390.jpg)|390×844|eb50213bd1a2e275d67decb609c40f97e87063c3716c5ecbdde6ac95c795e53c|
|[landing-opening-scroll-390.jpg](../screenshots/landing-opening-scroll-390.jpg)|390×844|87e60dae362ebcd93e735bd8b2afbe425fdf81217575b6a41a744717f6753819|
|[landing-workflow-390.jpg](../screenshots/landing-workflow-390.jpg)|390×844|b69717760bb828340cc4cd42641394b830fdbad3abcb23f83485b59a5eb56c65|
|[legacy-analyze-1440.jpg](../screenshots/legacy-analyze-1440.jpg)|1440×900|f907126eca7e74053aac565c97424be4e51f71d26d065d0a147af625458808af|
|[legacy-analyze-375.jpg](../screenshots/legacy-analyze-375.jpg)|375×812|72dcc34ed4ffa97d7b9147be35dc0a530774443781bb074530b294dc2b24e1a5|
|[login-1440.jpg](../screenshots/login-1440.jpg)|1440×900|75f11db2f73a69c02b1c7c409e1e73288e4c77f4117e78e6143deb08d16ea28e|
|[login-375.jpg](../screenshots/login-375.jpg)|375×812|98e334e2936858aed09be44b5b8af78d0426774106d314fda1b8e1ced2590705|
|[mock-delete-confirm-1440.jpg](../screenshots/mock-delete-confirm-1440.jpg)|1440×900|2d8939fcd7e550b1705924c037b65f625f50eb9388f93ac89a6c7c69c9ee11d2|
|[mock-delete-confirm-375.jpg](../screenshots/mock-delete-confirm-375.jpg)|375×812|ee1eb10b76c2a34acdbf63b6f04a77c7df24ce4e739ac70ea159b69e9c749727|
|[mock-delete-in-flight-1440.jpg](../screenshots/mock-delete-in-flight-1440.jpg)|1440×900|74caf71c7929e449bd110deaa33ffa05f6ead12d259ffec5ac9523982a76a29f|
|[mock-restore-double-confirm-1440.jpg](../screenshots/mock-restore-double-confirm-1440.jpg)|1440×900|9fda94fdb7908a806c2c1e3731066ce907d85017e2d9394e18a6af135285f516|
|[mock-restore-underlying-confirm-1440.jpg](../screenshots/mock-restore-underlying-confirm-1440.jpg)|1440×900|fabc8d6973e1aa7b06655e38579b0b921975aea9cc9b1054b7e5ba646aefd393|
|[project-detail-1440.jpg](../screenshots/project-detail-1440.jpg)|1440×900|abd9714f875909c7d0b01d727265317acaa51fb34c48da2e7803433f9fb25e0b|
|[project-detail-390.jpg](../screenshots/project-detail-390.jpg)|390×844|fdd63b82f402f907b5704f75c108939da0e2947756696c74a0a13aa7fcc238b5|
|[project-filmstrip-1440.jpg](../screenshots/project-filmstrip-1440.jpg)|1440×900|ea91868288f49d15fc09a5aaf2f1b7428afcc79d978909acd6c3cafbe4e74f55|
|[project-menu-1440.jpg](../screenshots/project-menu-1440.jpg)|1440×900|cd6bd192d023d93b9576f5114a77713f705ae90a5efcbef6ef4d23a57910a186|
|[project-menu-open-1440.jpg](../screenshots/project-menu-open-1440.jpg)|1440×900|237197447c3916007f491ad74a0ba870d893132ea36d283198cc752bbf549d78|
|[projects-1024.jpg](../screenshots/projects-1024.jpg)|1024×768|91fc2b5f36b2f7cc3b34db4347a8b555c07fe3ea9375f933e5622972611eb858|
|[projects-1440.jpg](../screenshots/projects-1440.jpg)|1440×900|dbffd61359228ff5f044662cf0717310551440f707bd7bd9aa34cd0af28158f8|
|[projects-1920.jpg](../screenshots/projects-1920.jpg)|1920×1080|b436864690b48a43ce859cea34374901eadc52cee22b87fb3b8b88aa1786a7cc|
|[projects-375.jpg](../screenshots/projects-375.jpg)|375×812|13a7b383952e57d91aa94cec0710ef18b971803109e8980a173b48df646e9748|
|[projects-390.jpg](../screenshots/projects-390.jpg)|390×844|d70a63835b4446e0b4692417ea81532452a37bc2b1ca1e0ec6269f52b3528a69|
|[projects-768.jpg](../screenshots/projects-768.jpg)|768×1024|3ec2fa40b9df0a2c6a00e259661cc07506c0aa61b5b8fffd1a2df613539d3088|
|[projects-empty-1440.jpg](../screenshots/projects-empty-1440.jpg)|1440×900|7f55815f99943587ad2464ec76b1abf7bb586b430c80e67b57872cbce490a6d7|
|[qc-390.jpg](../screenshots/qc-390.jpg)|390×844|e93f760b322631c27d5ef81e6ac1212b946658210144c7f1d3a0dfda15d5731d|
|[qc-open-375.jpg](../screenshots/qc-open-375.jpg)|375×812|202d3cb60736231de0babdbbb29cdcd460569d29ab71bbc695bd22a2a377cbad|
|[register-1440.jpg](../screenshots/register-1440.jpg)|1440×900|98237d17cd0a4bd06fc70abfe5f7fc978b9284ae249476b338eca89c83673edc|
|[register-375.jpg](../screenshots/register-375.jpg)|375×812|96cea5b226c02c7f7a1a2bd4a3a112e4d2f3abea7bde3afb200ce0bfd2a4e5ca|
|[shot-dialog-1440.jpg](../screenshots/shot-dialog-1440.jpg)|1440×900|655b7dfad2483134c8db5a8368ae5f45f172bc25ce98e8f9fdb9489cea21aafe|
|[shot-editor-open-1440.jpg](../screenshots/shot-editor-open-1440.jpg)|1440×900|5d254ad9c60cf349d503c4d6647a51cca4b0758248e9e8710abd51b0f5084564|
|[sidebar-expanded-1440.jpg](../screenshots/sidebar-expanded-1440.jpg)|1440×900|f1a34212616ad2307d47b652394f9affc0b289e33648f1e5eb0fbc2d74535642|
|[tag-filter-1440.jpg](../screenshots/tag-filter-1440.jpg)|1440×900|97d4a007eaf4b3d74cfb3c1b028963833183e14ccb5cb8625254c42059c03bfe|
|[template-1440.jpg](../screenshots/template-1440.jpg)|1440×900|89715c06dd78700ca16643fa13b3ebee6cdba7ef197606e123f923f4128ee7c4|
|[template-390.jpg](../screenshots/template-390.jpg)|390×844|7141f8d3009562c63948d30fad3f64c2cb4b3ef1b9e469db914ea90ed405dbdc|
|[template-advanced-1440.jpg](../screenshots/template-advanced-1440.jpg)|1440×900|a2a1c24dbafe76b82bea2b50b4578cbe3d292e4aad6e4e5283c2ac98efabbbc1|
|[template-advanced-390.jpg](../screenshots/template-advanced-390.jpg)|390×844|1e271453903a1a19682239aecae300a70fe9c666f63259ffdcf3c2355278c76b|
|[template-catalog-390.jpg](../screenshots/template-catalog-390.jpg)|390×844|152491fb2f638762bc8e189c7477f66a76a7b37b1d407e8032e029cb826dd93a|
|[template-detail-1440.jpg](../screenshots/template-detail-1440.jpg)|1440×900|8941ceeeefa0fb40a223d866fc3cb8aacc358db4e2638a8c13b2f1abe49747f8|
|[template-detail-scroll-1440.jpg](../screenshots/template-detail-scroll-1440.jpg)|1440×900|671f5f0f62a5a56d775edf1a492f62e93f08ff65d4f07128e52bd3af0e4fa69d|
|[template-return-stuck-390.jpg](../screenshots/template-return-stuck-390.jpg)|390×844|7141f8d3009562c63948d30fad3f64c2cb4b3ef1b9e469db914ea90ed405dbdc|
|[user-panel-1440.jpg](../screenshots/user-panel-1440.jpg)|1440×900|ba7f690ddc5da2146dcdfe919d0b50f47a9b3e7e7ef0b9138e35278ca2787259|
|[user-panel-390.jpg](../screenshots/user-panel-390.jpg)|390×844|c82ed58b7944aa62cbc6c75075e38a99d32787a70832be0fa235cf4676c33454|

## 來源及工作區保護紀錄

113檔目前路徑＋SHA清單的集合指紋：`b04b19e068d7b3e737a2acb6bd88958bad21c71b517f9df22d4175ac6114f173`。計算規則為依路徑排序的 `path + 空格 + lowercase SHA256 + LF`，整份UTF-8再SHA-256；逐檔值仍在原source-inventory.json。比對結果：113 checked，0 drift。

以下為Phase0完成時既有dirty tracked檔案內容指紋；並非本階段修改清單。既有untracked `analysis/landing-round2/`、`public/screenshot/current/` 保留。

|既有dirty檔|SHA-256|
|---|---|
|package-lock.json|d70231231c9f063830d6b2b3c0b904b780cf41952b154fdb931542ad45901e72|
|package.json|17d2c6a38eafff133aa8b8ddd5ee841fdfd81b36e5aa0835568d8264bbbefdd3|
|public/css/landing.css|18a32cc71318fb7c26e3095dcc8bba8eeb4fd4fd44aa60f2d02e3f386868bf01|
|public/html/index.html|acc641c30c8cf7923f240bac5074dd5563bba252ab7977d3ed96ee1c8b2270f1|
|public/js/landing-animation.js|3a3995897af4ae9bddb85e87fbca5dcf34a12406026d0957bebb0357a8479086|
|public/js/landing.js|1c124b2c400de4c78e75a89ba8ddaa5fc08a0512e5ca98b9656ada11501d06f0|

Phase0只新增本目錄六份Markdown文件；未Commit／Push，未修改產品／Tokens／Router，未啟動Phase1。來源 hash相符屬文件保護檢查，不能標作UI測試Passed。

## 文件完整性檢查

Phase0本地檢查：六份預期Markdown均存在；11組元件均含Purpose、Anatomy、Variants、States、Design Tokens、Responsive Behavior、Motion Behavior、Accessibility、Ownership、Allowed Exceptions十欄；63張原圖可讀取尺寸並計算SHA；本目錄Markdown本地連結0失效。工作區tracked dirty檔案名與開始時相同，113檔來源0漂移。這些結果只驗證文件／產物完整性，Phase1–7仍全部Not Started。
