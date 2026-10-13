# P3 Generate 交接

本輪已修改 Generate；使用者最新授權 P1–P6 一起完成，覆蓋舊 P0/P1 階段限制。最後額度查詢五小時已用 85%，剩 15%；週已用 26%，剩 74%。Root 要求接近門檻停止擴展，未啟動桌面新檢查。

## 已修改

- `public/html/generate.html`：故事輸入 ARIA label/多行、階段 heading、風格/比例 group、進度條與 live status 語意。
- `public/css/generate.css`：工作區用既有 container/gutter/spacing/color/radius/shadow Tokens；手機移除 100dvh 撐高的第二層容器，四階段保留文字進度、風格兩欄、footer 垂直排列、focus ring、讀得清的 pending 字色、44px 選擇/送出/編輯操作；浮動新增分鏡 gradient 最亮端改既有 brand primary，保留動畫。
- `public/css/template-workflow.css`：移除 Phase2 自建 nested scroll，拖曳改操作頁面 scroller，footer 使用同一捲動區。
- `public/js/generate.js`：風格使用原生 button/aria-pressed，比例/分類/模板選擇同步 aria-pressed，IME Enter 不送出，頁面切換清理 phase inline transition/inert，保存當前 targetPhase，修新建分鏡重置時兩個 active panels；載入/錯誤/空模板狀態；模板資料逃逸與安全圖片網址/錯圖fallback，取消寫死已驗證/節奏/9:16/shorts。Math Curve 只在正在生成且 Phase4 可見時啟動，離頁/完成/錯誤/取消清理。動態卡片不再由 boundNodes 集合持續持有。
- `public/js/math-curve-loader.js`：保留 Rose Curve、78粒子、吸入彩色粒子；init 支援 root/signal、回傳 stop handle，cleanup RAF/事件/粒子，hidden tab 暫停，reduced motion 靜態曲線，已移除隱藏 Phase4 的自動初始化。
- `tests/generate-browser.js`：真 main.html+iframe Chrome fixture 四階段、鍵盤/IME、模板資料標示、背景任務恢復、不重送 API、Loader cleanup、結果/表格/reset；三尺寸可跑，已跑 390。

未修改 `public/js/features/creation.js` 或 `public/js/features/generation-task.js`。未改 API、schema、依賴，未 commit/PR/deploy。Marketplace 既有 edits 保留。

## 驗證

- `node --check public/js/generate.js`、`node --check public/js/math-curve-loader.js` 通過。
- `node --test tests/generation-task.test.js tests/creation-feature.test.js`：34/34 通過。
- Chrome 390 的四階段/keyboard/IME/task resume/loader cleanup/results/reset assertions 通過並輸出成功。進程最後 server.close 可能等待連線，輸出成功後仍曾回傳 session 31124。
- 已實際觀看六張 `.codex-backup/ui-validation/generate-{idea,direction,direction-actions,template,progress,result}-390.png`。

## 未驗收與下一步

**P3 功能已驗證手機 fixture，但視覺未完整驗收，勿宣告完整完成。** 圖中頂部 bar/card 貼 iframe 0px，來源新增 padding 未生效；direction-actions 主按鈕仍被 global bottom nav 壓到，結果頁也會被遮。Root 已收到結果，請定位 Shell `#spa-content` 是否更高 specificity/inline 清零，確保工作區有 gutter 與真正可捲到的下方保留空間。保留 floating navbar；不要以 overflow hidden 掩蓋。

生成結果目前同時有新增「生成分鏡」heading 與原有結果 heading，可將前者只在 progress 狀態顯示。桌面 1440、1024 尚未執行這支新 regression；empty/error UI 與 reduced-motion loader 新契約仍需有針對驗證。API/媒體/登入是本機 fixtures，不代表遠端服務已驗證。

PowerShell：

```powershell
$env:STORYBOARD_PLAYWRIGHT_PATH = 'C:\Users\orgal\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
node tests/generate-browser.js
```

規範沿用 `public/css/tokens.css` 與 `public/css/tokens/{spacing,typography,radius,colors,shadow,components,layout}.css`。維持 Router/Pages/Features 責任與原生 HTML/CSS/JS，避免全域 CSS 污染；不增加新 Token 系統或依賴。繼續前先查所有額度視窗；任一剩餘小於 10% 即停止實作並交接。
