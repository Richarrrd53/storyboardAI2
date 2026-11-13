# Phase 6｜Material／Motion Ownership Contract

## 材質階層

| 角色 | 元件／使用範圍 | 配方與owner | 本輪處理 |
|---|---|---|---|
| M0 Canvas／Solid | 內容閱讀區、Discovery／Settings／編輯設定 | colors.css＋頁面layout | 不增加透明或每卡blur |
| M1 Raised | Folder／Hero／一般卡片／Input | 已核准Component tokens／本體幾何 | Folder與Hero不重畫；保留正式實體背景 |
| M2 Matte Floating | Bottom Nav、QC collapsed、適合的浮動工具 | components.css surface-floating-* | 正常9px／120%／1.06配方不改；opaque／reduced-transparency共用備援 |
| M3 Floating Reading | Dropdown Morph、User Panel／Account sheet | floating-reading-bg＋floating border／shadow／highlight | 同family，沒有再給每層新的材質；circle variant補opaque |
| M4 Blocking | Alert／Confirm／Prompt／編輯Dialog | Dialog panel＋scrim、OverlayManager、ModalAnimation | 不改400ms與退出曲線，不改legacy delete／Undo；背景QC暫停 |
| M5 Cinematic | Landing film、Folder／cover media | 原媒體對比與scoped GSAP／handoff | 保留空間敘事，不把媒體面變成通用毛玻璃 |
| Navigation edge | Header／底部scroll readability | DynamicMaskSystem幾何；components.css edge-*材質；shell.css繪製 | 正常1.5／4／8px＋top tint；opaque與unsupported只畫tint |

同頁Solid＋Raised＋Floating＋Media可以共存，因用途不同。材質配方不進資料store；shape／layer不以加shadow或全域filter修補。

## 新增／正規化Token

- `--edge-detail-display`、`--edge-bottom-tint-display`：只控制導航邊緣blur細節與降級底色的繪製。geometry由JS計算，token不取代viewport量測。
- `--edge-tint-start`／`--edge-tint-middle`：正常50%／30%，不透明備援96%／75%。bottom只在降級顯示並反向漸層。`--edge-tint-fallback-bg`提供無color-mix的可讀底色。
- `--motion-header-duration:320ms`；`--motion-duration-feedback:160ms`、`--motion-duration-reveal:280ms`、`--motion-duration-surface:460ms`。既有fast／normal／surface名稱為精確同值alias，未把原本120／200／300ms tokens改值。
- explicit opaque、prefers-reduced-transparency、unsupported backdrop的floating／reading／composer／circle皆回solid；unsupported mask僅降級依賴mask的edge，不刪其他正常floating材質。
- 新QC pause `!important`屬狀態優先序例外：只影響rotator的animation-play-state，不改animation-name／duration／easing。實測證據為同一glow-loop從running變paused；恢復仍待驗。

## 動態所有權

| 動態 | owner | 進退／清理規則與本輪結果 |
|---|---|---|
| Header progressive／collapse | DynamicMask instance＋singleton auto reconciler | 每scroll owner一次instance；一個pending RAF；hidden取消，focus避讓；detach清理layer／observer／media／focus；reduced保持完整Header |
| Bottom Nav／jelly | AppShell手勢owner＋mobile-nav.css | 原事件與時序不變；setNavigation只喚醒相關垂直page mask |
| Sidebar／Account | AppShell＋Account adapter＋SurfaceMorph | 原expanded row及480／440ms不變；390／1440操作與中斷抽測保留原始結果 |
| Dropdown／Morph | SurfaceMorph singleton＋OverlayManager popover lease | 保留幾何連續與live reduced收束；不copy controller，不引入另一timeline owner |
| QC | QuickCompose資料／surface owner；AppShell只管理文件visibility；CSS管ambient state | 560ms展開不改；只暫停被隱藏或inert的彩光，沒有stop／reset創作session |
| Dialog | DialogService／ModalAnimation＋OverlayManager | Promise、focus、Escape、scale、scrim均由原owner；未移除blur tween或改成fade。中間幀平順度Pending |
| Folder／cover／trash | 原Component geometry與各自transition controller | 原碼hash不變；不在材質整合時改Folder／刪除敘事／Undo |
| Loading curve | initMathCurveLoader handle | 維持曲線／粒子配置；singleton stop前owner；IntersectionObserver、media及visibility可暫停，abort／stop清理；沒有把pref變更當任務完成 |
| Landing | initLandingPage scoped GSAP matchMedia＋Landing logic | 開場／workflow兩pin保留；destroy revert與asset refresh ownership不改；實測離頁pin=0，不呼叫全域killAll |
| Navigation | 既有Router／NavigationTransition／PageHost | 未重寫Router，頁面資產與store所有權不變 |

新規則只收斂責任邊界，不強制所有動態使用相同duration或spring。不同signature的差異是核准品牌契約；一般選項狀態沿用即時focus／低幅回饋。

## 證據與驗收界線

material-source-inventory.json記錄85筆CSS backdrop／mask來源，包含legacy、Demo及非正式頁；它不是85個已驗證的產品效果。動態JS內的mask／blur由上表owner與before來源補充。未使用或未實際進入的頁面不能僅因掃描到宣告而標為Passed。

本輪不調低三階數量：缺少可比真機trace，直接減層可能破壞可讀性。opaque是明確偏好／能力fallback，正常模式不是靠猜測降規。Safari／Firefox／系統偏好／軟鍵盤／GPUtrace待實測；完整清單見README。
