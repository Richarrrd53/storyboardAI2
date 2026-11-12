# 07｜可分批審閱的重構路線

稽核日期：2026-11-11～2026-11-12（Asia/Taipei）。基準：本地目前工作區，含既有未提交 Landing 變更；不是 GitHub HEAD 的遠端部署稽核。

本輪只規劃。每一Phase先產出隔離prototype／可審閱diff，經使用者指示才實作下一階段；本次不Commit/Push。估算是單人工程工作日量級，不含設計審閱等待、未知資料問題；不能直接相加當成承諾交期。

與原始建議排序不同：Dialog與確認流程提到Phase1，因為雙重復原與原生Prompt是已證實的核心操作問題；Folder在Hero前完成，因為Hero的recent layout依賴它。QA是各階段持續做，Phase7是全站gate，不是拖到最後才驗證。

## Phase 0｜決策與基線

- **目的**：以既有品牌凍結v4.0設計契約，不先寫全域覆寫。
- **具體範圍**：核准06的Hero、Account、Folder手機密度、material、motion與Undo政策；每頁/variant建立before capture及state matrix。
- **依賴**：無；需使用者確認設計選擇。
- **可能修改檔案**：public/css/tokens/*、tokens.css、分析文件；先改規格，不動runtime。
- **複雜度／估算**：中；約1～2個工程工作日作規劃量級，非交付承諾。
- **風險**：低；最主要風險是把合理品牌例外當錯誤清除。
- **驗收條件**：決策表每項有owner；token source唯一；allowed variant與breakpoint清楚；對未驗證狀態不標pass。
- **必要回歸**：六尺寸golden captures、長中英標題、無封面、empty/error；既有本地差異保存。

## Phase 1｜Dialog 與操作確認（提前）

- **目的**：先修UI-01雙重復原、UI-05命名輸入，以及modal可操作性。
- **具體範圍**：DialogService alert/confirm/prompt、OverlayManager最小核心；卡片restore刪除第一層確認；所有結果await；description預設空字串；初始focus/escape/return/inert。
- **依賴**：Phase0 Dialog anatomy/material；不依賴完整Morph Engine。
- **可能修改檔案**：public/js/sys.js、features/projects.js、components/project-card-interactions.js、components/dialog-service.js（新）、components/overlay-manager.js（新）、css/components/dialog.css、input.css、style.css。
- **複雜度／估算**：高；約2～4日量級。
- **風險**：中高：global confirm使用者不少，Promise/result契約不能一次無差別替換。
- **驗收條件**：卡片/menu復原一次確認；任一取消0 API、接受1 API；Prompt與Alert/Confirm同外框；IME不誤提交；error可重試；route teardown恰一次resolve。
- **必要回歸**：隔離fixture：restore double-click、cancel、rename trim/empty/long、PATCH503；Tab/Shift+Tab/Escape、screen-reader dialog name；確認舊alert callers不破。

## Phase 2｜Tokens／Surface／Control 與 Layer 正規化

- **目的**：建立共享浮層與可讀狀態，不強行統一所有幾何。
- **具體範圍**：canonical material recipes、Button/Input/Search/Chip roles、focus ring、layer map、移除有替代的全域reset；Settings缺token與gutter補齊。
- **依賴**：Phase0；Phase1 Overlay contract；先解析CSS import順序。
- **可能修改檔案**：public/css/tokens/*、tokens.css、style.css、shell.css、components/{acrylic,button,input,badge,bottom-sheet,dialog}.css、discovery-settings.css、auth.css。
- **複雜度／估算**：高；約2～4日量級。
- **風險**：高：global selector與!important牽連全站。
- **驗收條件**：每個token有單一owner或有記錄alias；generic control八狀態；opaque fallback可用；overlay stack不靠逐元件99999補丁；不改brand hue。
- **必要回歸**：A→B→A CSS載入/移除；Auth/Generate/Template/Discovery；native select與dense/editor例外；對比實際合成；短橫屏。

## Phase 3｜共用 Morph／User Panel／Sidebar

- **目的**：在既有openSurface基礎抽引擎，統一幾何與互動owner。
- **具體範圍**：Project facade、tag/sort/account adapters；Desktop account row A；mobile同內容sheet；focus、Escape、outside、scrollOwner、resize、interrupt、reduced與signal teardown。
- **依賴**：Phase1 Overlay；Phase2 materials/controls；Account A/B先決定。
- **可能修改檔案**：public/js/components/project-option-morph.js、surface-morph.js（新）、shell/app-shell.js、pages/projects.js、components/quick-compose.js（必要介面）、css/components/option-morph.css、mobile-nav.css、dashboard.css。
- **複雜度／估算**：高；約3～5日量級。
- **風險**：高：多套動畫與AppShell持久生命週期交界。
- **驗收條件**：trigger t0相同shape；途中反向連續；不scale文字；同menu內pill與state一致；Account鍵盤可達；一次只有一個top overlay owner。
- **必要回歸**：open→close→open、快速換trigger、nested scroll、resize/rotate、trigger被移除、SPA切換；375/390/768/1024/1440/1920；filter選取不退化。

## Phase 4｜Folder Geometry／Delete／Undo

- **目的**：修跨頁形狀、confirm preview與垃圾桶，建立唯一幾何資訊來源。
- **具體範圍**：component-local root sizing、Default/Compact/Preview/Recycle；兩頁手機grid策略；snapshot/measure；時間正規化trash；pending/failed/undo視覺同步。
- **依賴**：Phase0手機density/undo政策；Phase1 dialog；Phase2 material；不必等Hero。
- **可能修改檔案**：public/js/components/project-card.js、project-card-interactions.js、project-cover-transition.js、features/projects.js、sys.js、pages/{dashboard,projects,history}.js、css/components/project-card.css、dashboard.css、style.css。
- **複雜度／估算**：高；約3～5日量級。
- **風險**：高：封面飛行、hover與資料queue都依賴geometry；刪除需嚴格隔離。
- **驗收條件**：相同inline-size下跨頁shell/tab/cover差≤1px；無外層scale補救；preview無互動/duplicate id；60/120Hz軌跡時間一致；取消/錯誤恢復正確；正式資料不作測試。
- **必要回歸**：五種媒體比例、0/1/多鏡頭、tags長短、無封面/圖失敗；confirm從dashboard/projects；Undo窗口、route切換、503 rollback、session reset；cover cancel/handoff。

## Phase 5｜Page composition／Hero／功能入口

- **目的**：在元件穩定後處理頁面任務層級與品牌連續性。
- **具體範圍**：Hero A（或核准B）、recent提前、quick action整合；Discovery雙入口與Settings殼體契約；Template展示內容與return異常；Project filmstrip click/drag與mobile密度；Auth labels。
- **依賴**：Phase2～4元件契約；不重構router，routing修正僅針對經核准的缺陷。
- **可能修改檔案**：public/html/{dashboard,discovery,discovery-settings,login,template}.html、css/{dashboard,discovery,discovery-settings,template,template-detail,project-detail,auth}.css、js/pages/{dashboard,templates}.js、project-detail.js、必要shell/entry wiring。
- **複雜度／估算**：高；約3～6日量級，取決於Hero與Discovery整合範圍。
- **風險**：中高：編排與history/player/asset lifecycle互相影響。
- **驗收條件**：Hero不搶QC；首屏可見recent；Discovery直達與UI進入語言一致；Template返回保留browse state；filmstrip click可編輯且drag不誤觸。
- **必要回歸**：105模板長資料、長URL/hashtag、empty/error、history/back-forward、刷新深連結、tablet布局；不改來源事實、不新增未核准route。

## Phase 6｜Progressive blur／全站 Motion tuning

- **目的**：用測量決定降低效果，避免為統一犧牲品牌。
- **具體範圍**：Header registration、mask fade bounds、nav/QC合成budget、timing tokens、reduced JS；Landing既有scoped timelines只修實證缺陷。
- **依賴**：Phase3 Morph、Phase4 geometry、Phase5 layout；效果參數最後調。
- **可能修改檔案**：public/js/dynamic-mask.js、shell/app-shell.js、components/{quick-compose,navigation-transition,transition-loader,project-cover-transition}.js、landing-animation.js（如有實證）、css/shell.css、generate.css、mobile-nav.css、tokens/motion.css。
- **複雜度／估算**：中高；約2～4日量級。
- **風險**：高：scroll compensation、mask clipping與soft keyboard容易出隱性退化。
- **驗收條件**：頂/底last content與focus可見；無observer回授layout shift；reduced時callbacks與資料狀態相同；目標手機trace符合budget；不憑桌面截圖宣稱快。
- **必要回歸**：捲動首/中/尾、方向切換、慣性、focus scroll、軟鍵盤、orientation、背景tab、低階手機；iOS Safari/Android Chromium/Firefox fallback。

## Phase 7｜全站 Visual QA 與 Release Gate

- **目的**：把待驗證範圍清零，才分批交付；此階段不代表本輪已驗收。
- **具體範圍**：六尺寸×正式route×state matrix、a11y、performance、功能regression；保留before/after與approved exceptions。
- **依賴**：所有修改phase完成；測試帳號/fixtures可用；每階段已有小範圍QA。
- **可能修改檔案**：tests/*（有意義的behavior/geometry cases）、analysis/ui-audit/或後續QA目錄；只修實證產品問題。
- **複雜度／估算**：中高；約2～4日量級。
- **風險**：中：矩陣大；要防止只看首屏與正常狀態。
- **驗收條件**：P1=0、P2有owner/決策；每個正式頁desktop+mobile實測；無不可到達控制；無真實資料破壞；使用者核准視覺與互動。
- **必要回歸**：全部既有node tests＋targeted browser fixtures；真正鍵盤/讀屏；六尺寸截圖；iOS/Android實機；付費生成與設定寫入須另有受控環境。

## 前三階段的停止點

Phase0：使用者核准決策表。Phase1：先交「單次復原確認＋品牌Prompt＋Dialog鍵盤」小批。Phase2：交材質/controls/token before-after，不夾帶Hero重做。後續Phase3/4可在契約穩定後分開實作，但同一檔案不可由互相獨立的方案同時覆寫。

## 範圍邊界

不引入React/StyleX/新前端框架，不重構SPA Router，不刪除legacy頁直到產品確認，不以全域!important整平所有元件。動態/材質的合理例外必須記錄原因和驗收畫面。
