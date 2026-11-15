# StoryboardAI 生成整合重構交接

更新日期：2026-11-15（Asia/Taipei）。**目前是部分實作，尚未完成全部階段與驗收，不可宣稱整體完成或可直接部署。**

使用者最新指示：額度低於 15% 後，已完成則略過後續驗證；未完成則整理交接文件。工具沒有帳戶剩餘額度讀取能力。本輪已停止新增驗證，整理現況交接。不要擅自 Commit、Push 或建立 PR。

## 工作區與基線

- 目錄：`D:/My Files/web/StoryboardAI2`。
- 分支：`main`。
- HEAD：`f262abacf0b15ac04ed581fb26c0dd195811bded`，與使用者參考提交相同。
- 開始前工作區乾淨；目前變更均為本次未提交實作。沒有 checkout、reset 或覆蓋較新提交。
- 初始測試：507 項，501 通過、6 失敗。`npm.ps1` 讀取使用者全域 npm 路徑遭拒，因此直接使用 `node --test`。
- 架構調查及依賴計畫：`analysis/creation-integration-plan.md`。

## 已實作的架構

### 共用狀態與流程

沿用 `CreationSessionStore` 與 `GenerationTask`，沒有建立 Template Copilot 或第二套手機故事輸入。

Session 新增／整理 `generationMode`、`entrySource`、`discussionStage`、`currentStep`、`selectedTemplateId`、`returnContext`、`templateSelectionState`、`templateRecommendation`、`templateSuggestions`、`recoveryNotice`。完整選定模板留在記憶體 `selectedTemplate`；`selectedTemplateId` 用於重新整理後載入。`templateValues` 是已確認內容；`templateSuggestions` 是 AI 建議。手動修改優先，確認創作設定時才採用尚未指定的建議。

`CreationController.selectTemplate/setTemplateMode/applyTemplateEntry` 集中處理切換、取消、直接套用與活動任務保護。QC 送出經過既有 new-session guard 時，保留模式、選定模板與返回來源。

使用 bounded、tab-scoped `sessionStorage` 草稿 checkpoint（最大 120,000 字元、24 小時有效），不保存完整模板、生成圖片、認證或 GenerationTask。重新整理恢復的是故事／討論／設定，不是假裝恢復伺服器生成工作。加入生成中／未儲存成果的 beforeunload 保護與恢復提示。這些新邊界仍需補實際測試。

### Creative Copilot

移除模板存在時隱藏／跳過 Copilot 的條件。原訊息、選項、自由補充、歷史、文字轉場與 AbortController 保留。故事與模板變數使用同一介面，傳遞 `discussionStage`。

後端只接受模板 ID，從資料庫載入保存內容，不信任前端送來的完整模板。上下文包含敘事、節點、變數、來源、保存分析與 prompt，超過 35,000 字元會拒絕。Prompt 明確禁止把來源 URL／標題當成已觀看影片，已有故事／答案應推導、不重問固定問卷。

共用 response contract 加入 `templatePatch: [{name,value}]`；前端以模板定義白名單接收建議，保留已確認值。模板摘要移至創作設定的可收合 details，可直接手動修改。

推薦統一顯示「推薦」。選項 Schema 要求明確 nullable `recommended`，保留 OpenAI strict adapter，有效值必須對應 options[].value，不依順序猜測，不代表選取。Provider 切換後重試使用新 Provider 與新 requestId，避免 idempotency 衝突（最後這項修改未重跑 Copilot 全套）。

### 共用分鏡企劃與映射

移除 GenerationTask 的舊模板獨立生成分支、固定 structure.length、依 index 覆蓋運鏡與時長等行為。兩模式共用 FreeformStoryboard 的 Prompt、Schema、時長／鏡數驗證、一次修復、企劃確認及逐鏡生圖／重試。

`FreeformStoryboard.nodes()` 產生穩定唯一 ID；每鏡 `sourceStructureId` 只能引用一個有效節點，多鏡可引用同一節點。不支援跨節點 ID 陣列。來源鏡頭時長與運鏡僅作參考，使用者時長與 Creative Brief 優先。映射保存到生成 shot payload。模板同樣保留 `confirmBeforeImages` 使用者選項。

### 模板索引、搜尋與推薦

- 保留 legacy `/api/get-templates` 相容路徑。
- 新增 `/api/get-templates?view=index&limit=50&offset=0&query=...&category=...&tag=...&sort=...&direction=...`，每頁最多 100。
- 新增 `/api/templates/:id` 完整載入。
- 新增 `/api/templates/recommend`：輕量索引 → 關鍵字候選最多 12 → AI 排序最多 5 → 驗證 ID、去重 → 手動選取才載入完整資料。
- 索引 server cache 60 秒；推薦 cache 5 分鐘、100 筆；同內容含 Provider 的請求去重；每 IP 每分鐘 6 次，活動推薦最多 20。失敗回傳可手動選取訊息。
- `TemplatePresentation.filter()` 抽成共用分類／搜尋／標籤／排序邏輯。
- Generate 模板選擇改為縮圖＋資訊＋右側圓形 Eye／Check 橫列。顯示「敘事節點」，不再聲稱將生成相同鏡數。
- 預覽保存 Session、搜尋、排序、分類、標籤、列表 scrollTop；router history 增加 creationPreview，詳情返回使用 history.back，沒有另建模板輸入頁。
- PageAssetLoader 新增輕量索引／選定詳情快取，模板庫不必預載所有完整模板。保留舊 full-cache 相容，避免移除既有呼叫介面。

**效能限制：**候選數／欄位各有限制，但尚未制定整個 AI 推薦輸入的硬性總字元／token 上限。索引目前仍需從資料庫讀取 JSON content 才能投影輕量欄位，尚非持久索引或 SQL 搜尋。模板庫為保留既有完整分類／標籤計數，分頁取得全部輕量索引；Generate 結果是分頁載入。模板規模成長後仍需量測。

### QC、返回與動畫

QC 原有浮層加入輕量模板勾選、瀏覽、選定摘要、預覽／更換／取消；未另建獨立模板 composer。手機從模板庫套用，未送出時可開既有 QC，保留草稿。Generate 原 Header 加返回，創作步驟優先返回，再使用來源返回；不清除 GenerationTask。

沿用既有 Morph、文字 Handoff、漸進模糊及選項動畫的程式；新圓按鈕有 reduced-motion CSS。**尚未完成所有動畫／手勢實機驗收，不能以「沿用原碼」等同驗證通過。**

## 已執行的測試及證據

測試記錄位於 ignored 的 `temp/`，未提交。接手時請保留或自行重新擷取，不要把舊結果當作最新 HEAD 全面結果。

| 記錄 | 結果 | 範圍與時間限制 |
| --- | --- | --- |
| `temp/refactor-baseline.txt` | 507 / 501 pass / 6 fail | 修改前基線 |
| `temp/recommendation-tests.txt` | 37 pass | 第一階段 recommendation／OpenAI／Copilot |
| `temp/creation-contract-tests.txt` | 52 pass | 新增 22 integration + 30 GenerationTask；在後續 catalog／recovery 修改前執行 |
| `temp/refactor-final-tests.txt` | 529 / 523 pass / 6 fail | 中途全套，仍是原有 6 個失敗；**不是最後所有變更完成後的全套** |
| `temp/catalog-integration-tests.txt` | 53 pass / 0 fail | 最後一次定向測試：templates-page、page-asset-loader、creation-integration |
| `temp/live-provider-results.json` | Gemini 200；OpenAI TypeError | 真實 HTTP 呼叫結果，詳見下文 |

原有 6 個失敗（沒有改動對應實作來掩蓋）：

1. `math-curve-loader.test.js`：compact shares original curve/timing/cleanup。
2. `project-option-morph.test.js`：Window scroll and resize closes menu。
3. 同檔：Global listeners lifecycle。
4. 同檔：SurfaceMorph interrupted expansion preserves channels/return lifetime。
5. 同檔：SurfaceMorph bounds fit narrow/wide/offset visual viewports。
6. 同檔：SurfaceMorph resize during return releases overlay/listeners。

新增 `tests/creation-integration.test.js` 覆蓋：模式、切換／取消模板、活動任務保護、bounded checkpoint、QC 新 Session 交接、手機套用保留草稿、預覽套用續用、4→8／6→10／60 秒、非法映射、唯一節點 ID、Brief 優先、變數契約、null 推薦、雙 Provider 模擬格式、輸入驗證、共用篩選、候選上限、推薦去重／cache／失敗降級、實際共用 Task 企劃確認、映射修復與 retry ID。

舊 `generation-task.test.js` 的兩鏡 fixture 現在明確隔離 lifecycle，注入小型 FreeformStoryboard stub；完整時長／映射驗證由新整合測試與既有 freeform-storyboard tests 負責。舊的固定鏡數／覆寫時長斷言改為新行為，沒有保留錯誤需求。

### 真實 Provider

對已啟動的 localhost:3000 執行一次／Provider 的一般故事討論：

- Gemini：HTTP 200、action=propose、`recommended=sensory_immersion`，確認是有效 options value；約 25.96 秒。
- OpenAI：呼叫端 `TypeError`，約 464 ms；沒有取得 HTTP 回應，**原因未診斷，不可宣稱相容性全部通過**。
- 該本機 server 在部分後續程式修改前啟動；重測須重新啟動最新版本。
- 真實模板故事討論、變數討論、推薦排序、最終文字分鏡與生圖、Provider 切換／重試尚未完成雙 Provider 驗證。
- 模擬雙 Provider 契約測試通過，不等於真實服務端到端驗證。

### 實際瀏覽器操作

使用 CUA 操作隔離 fixture server `http://127.0.0.1:3001`。它跑真正的 SPA／CSS／動畫，但 auth、API、AI、圖片與資料庫均為測試資料，沒有修改 production 認證。

已實際操作與觀察：

- 1440×1000：Generate 故事輸入、勾選模板、故事文字轉場、Copilot 推薦未自動選取、回答後進入模板選擇、橫列／搜尋／排序／選取、Eye 預覽詳情與返回。
- 預覽往返時，API metrics 的 Copilot 維持 2 次，generation 維持 0 次；沒有因預覽新增討論／生成。
- 375×812：手機 Header 返回按鈕、篩選列換行；DOM 幾何檢查 document 無水平溢出。實際按反向排序與 Eye 預覽。
- 390×844：實際捲到列表、取消／重新選取、圓按鈕、縮圖與資訊布局；確認模板進入同一個 Copilot 變數討論；回答後確實進入共用創作設定，含收合變數摘要、個人條件、比例、時長與分鏡確認設定。
- 在模板詳情 reload 後按「返回創作」，保留故事、搜尋「晨光」、名稱排序、方向與原選定模板。
- 最後瀏覽器停在創作設定；臨時 viewport override 已 reset。未將 UI 操作推進到生圖。

**未驗證：**768、1024、1920；真實手機虛擬鍵盤／長按／滑動手勢；QC 新模板 toolbar 的實際展開／Morph／長文 Handoff；手機從模板庫直接套用 QC 的完整實機流程；Bottom Nav 跟手與回彈；Header 捲動模糊；reduced-motion 實際切換；最終生圖／保存／失敗重試 UI。畫面剛載入時記錄到 MutationObserver observe 非 Node 的既有／待定位錯誤，不應忽略。

## 完成度

| 使用者階段 | 現況 |
| --- | --- |
| Phase 1 推薦標記 | 已實作、單元／模擬通過；Gemini 真實案例有有效標記，OpenAI 真實驗證未完成 |
| Phase 2 Session | 已實作核心與部分恢復；完整狀態安全矩陣未驗收 |
| Phase 3 模板討論 | 已實作、fixture UI 走到設定；真實 Provider 變數推導與未知資訊追問未驗收 |
| Phase 4 邏輯階段／動畫 | 已實作邏輯階段與沿用轉場；全部入口動畫未驗收 |
| Phase 5 列表／預覽 | 已實作、1440／375／390 部分操作通過；其他尺寸及完整錯誤路徑未驗收 |
| Phase 6 推薦 | 已實作 bounded candidates／cache／降級，模擬通過；真實排序與大規模效能未驗收 |
| Phase 7 QC／手機 | 已實作控制與共用入口，單元通過；QC 實際互動驗收未完成 |
| Phase 8 結構／鏡數解耦 | 已實作、真實 validator/task 模擬回歸通過；真實 Provider 最終生成未驗收 |
| Phase 9 回歸 | 部分；6 個既有失敗仍存在，完整最終重跑與裝置驗收未完成 |
| Phase 10 交付 | 本交接文件；不是完成報告／可部署宣告 |

## 接手優先順序

1. 先看 `git status`、本計畫及 diff，不要 reset 或重新套參考提交。先檢查最近的程式碼變更，不立刻宣稱 529 項是最新版本結果。
2. 診斷 OpenAI 真實請求 TypeError（先檢查本機 server 可用性／過程退出與日誌；不要輸出 .env／金鑰）。必要時重啟最新 server，再測兩 Provider 的模板討論、推薦、文字分鏡與失敗重試。
3. 檢查 async lifecycle／資料安全邊界：重新整理時 selectedTemplateId 載入與 pendingQC 的競態、卸載中故事 ready 進入下一討論階段的恢復、同時切模板／搜尋時 stale reply、模板詳情讀取失敗的單獨 recovery、無 selectedTemplate 時的 mode 切換、清空手動變數代表明確留白或取消指定。
4. 確認 Session checkpoint 真正排除大型／敏感資料；大於上限時目前會略過寫入，可能留下較舊 checkpoint，需決定清除／裁切策略。Session 草稿超過 24 小時、storage malformed／quota/private mode 仍需測。選定模板更新後的 stable ID 舊資料遷移也需確認。
5. 補推薦 Prompt 整體字元／token 硬上限；AI ranking 不需要 source.description 等所有展示欄位，應另行投影。資料庫索引快取在 create/upsert 後目前主要靠 60 秒 TTL，需判斷是否主動失效。
6. 檢查共用搜尋對中文分類名稱的相容性（舊 templates.js 曾包含 CAT_MAP 類別中文）；確認 lightweight index 的 display copy、原始來源搜尋與來源 URL 預覽不退化。模板詳情 lazy load 的錯誤與返回分支需補測。
7. 完成使用者指定的六種尺寸及 QC／鍵盤／手勢／動畫操作驗收；不要用單元或固定截圖替代。修正視覺問題後再跑相依測試。
8. 視額度與使用者指示，再跑最新全套，分清原有 6 個失敗與新增失敗。只有所有必要工作完成，才能改成最終完成報告。

## 修改檔案

新增：

- `analysis/creation-integration-plan.md`
- `analysis/creation-integration-handoff.md`
- `lib/template-recommendations.js`
- `tests/creation-integration.test.js`
- `tests/helpers/creation-preview-server.js`（手動 QA fixture；`node tests/helpers/creation-preview-server.js`，綁定 127.0.0.1:3001）

修改：

- `lib/ai/copilot.js`
- `server.js`
- `public/js/features/creation.js`
- `public/js/features/creative-brief.js`
- `public/js/features/creative-copilot.js`
- `public/js/features/freeform-storyboard.js`
- `public/js/features/generation-task.js`
- `public/js/features/page-asset-loader.js`
- `public/js/features/template-workflow.js`
- `public/js/generate.js`
- `public/js/components/quick-compose.js`
- `public/js/components/template-presentation.js`
- `public/js/pages/templates.js`
- `public/js/spa-router.js`
- `public/js/template-timeline.js`
- `public/html/generate.html`
- `public/html/template.html`
- `public/css/generate.css`
- `public/css/components/quick-create.css`
- `tests/generation-task.test.js`
- `tests/templates-page.test.js`

沒有修改 Prisma schema、執行資料庫 migration、Commit、Push 或建立 PR。
