# 08｜決策摘要

稽核日期：2026-11-11～2026-11-12（Asia/Taipei）。基準：本地目前工作區，含既有未提交 Landing 變更；不是 GitHub HEAD 的遠端部署稽核。

## 全站現況

StoryboardAI已有明確的電影創作語彙：深色外殼、冷白工作區、實體Folder、膠卷、浮動導航與流體Morph。需要的是把這些特色變成可維護的元件契約，而非全站換主題。最嚴重的問題來自事件／非同步確認、元件幾何依賴頁面容器、以及overlay和focus所有權，不能全部歸因CSS。

已交付八份主報告、截圖索引、source/token inventory與隔離Mock。實際檢查範圍與未驗證項目見01；28項問題詳見04。這不是「全站所有狀態已通過」的結案聲明。

## 最嚴重的10個問題

|優先|問題|證據／行動|
|---|---|---|
|1|回收桶復原雙重確認，取消上層後還有undefined視窗|UI-01，Mock已重現；確認只由action擁有且await|
|2|Delete Confirm clone失去正確Folder幾何，動畫跟著失真|UI-02/24；component-local preview與snapshot|
|3|手機Dashboard/Projects Folder密度與比例不同|UI-03；390px Projects173px卡、Dashboard約74vw reel，先決定統一grid或正式reel例外|
|4|手機History未共用Folder geometry，呈大卡與淡化內容|UI-04；回收桶納入同一規格|
|5|重新命名仍是原生prompt，未共享Alert/Confirm外觀|UI-05；品牌Prompt Dialog，輸入/驗證/錯誤/焦點一起設計|
|6|自訂sys Dialog缺完整modal語意和focus生命週期|UI-06/10；Overlay/Dialog contract優先|
|7|Avatar與Folder主入口缺等價鍵盤操作|UI-07；button/link語意及可見focus|
|8|膠卷滑鼠click未開編輯，Enter可以|UI-08；pointer capture/drag threshold需trace及修復|
|9|Template一次返回操作仍停詳細頁|UI-09；已記錄但根因待trace，不藉此全面重寫router|
|10|Discovery進入／Settings返回呈不同殼體，Settings缺token|UI-20/21；統一正式入口和foundation契約|

## 最值得保留的特色

Folder的tab/notch與抽出預覽、16:9外框容納各比例素材、深色膠卷、Landing從film進入真實產品的敘事、floating nav/QC，以及適量的jelly release。這些讓它像創作工具，不能被一般SaaS卡片替代。

## 不應直接修改的材質／動畫

不要把Sidebar與所有閱讀面板改毛玻璃；不要拆掉Folder物件形狀；不要把所有Morph換fade；不要刪除Header progressive blur而不量可讀性/效能；不要重做已有matchMedia.revert清理的Landing。先保存baseline，再針對有證據的缺陷調整。

## 最需要統一的10個元件

1. Dialog family（Alert／Confirm／Prompt）。
2. Project Folder（Default／Compact／Preview／Recycle）。
3. Floating Surface／Overlay層級。
4. Morph Menu（action／tag／sort adapters）。
5. Sidebar AccountTrigger。
6. User Panel（Desktop與Mobile同內容）。
7. Button／IconButton與命中區。
8. Input／Search與focus/error。
9. Header／Toolbar／Progressive Edge。
10. Mobile Navigation／Quick Create的active與overlay契約。

## 推薦v4.0方向與完整階段

**有電影物件感的創作工作台**：實體閱讀面＋局部浮動acrylic＋內容承載cinematic視覺。以既有token與Vanilla JS SPA發展，參考Astryx語意token/可組合contract思路，不導入其框架或外觀。

Phase0 決策/基線 → Phase1 Dialog/確認流程 → Phase2 Tokens/Surface/Controls/Layers → Phase3 Morph/UserPanel/Sidebar → Phase4 Folder/Delete/Undo → Phase5 Hero與跨頁composition → Phase6 Blur/Motion調校 → Phase7 全站QA。完整目的、檔案、風險、驗收與回歸見07。

最先實作前三階段：先核准設計契約；再修雙重復原與品牌Prompt；接著統一Surface/Controls/token ownership。這比先美化Hero更能降低後續反覆重做。

## 需要你決定的項目

|決策|推薦|備選／代價|
|---|---|---|
|Dashboard Hero|A精緻工作區型，recent提前|B真實三鏡頭視覺型，圖像與動態成本較高|
|Sidebar Avatar|A整合Account Row，avatar固定36px|B工作區identity footer，現有無工作區功能時可能誤導|
|手機Folder密度|Dashboard/Projects同dense雙欄；History共享|保留Dashboard reel，但正式承認不同密度、同尺寸幾何仍一致|
|Floating material|冷中性matte acrylic；閱讀面solid|更強玻璃只留特定media overlay，不全站套|
|Morph強度|保留Project button→dot→surface；其他依語意節制|所有popover都強飛行會拖慢任務、不推薦|
|Undo跨頁政策|跨頁保留完整5秒撤銷|目前離頁flushAll提前commit；若保留需清楚告知|
|舊Analyze等頁|先分類legacy、停止擴散；由產品決定退役|如需正式upload analyze，另開明確接入範圍|

## 未實際驗證與限制

- 並非每個route都有六尺寸完整matrix：Landing/Projects完成六尺寸首屏；其他主要頁多為1440/390或375。Dashboard1024/768、所有頁1920/平板細節仍需補全。
- GSAP Skill未安裝，已報告且未自行安裝；使用官方文件＋原始碼review。
- 真實資料刪除／復原／rename/PATCH、正式Undo/rollback未操作；Mock完成刪除動畫與雙重確認重現，但沒有宣稱全部錯誤流程實測。
- Generate3～5、AI分析結果/loading/error、付費生成、API Key寫入、建立模板modal、所有native select/排序組合未完整實測。
- 未做真機Safari/Firefox、iOS軟鍵盤、安全區、VoiceOver/NVDA、JS disabled與reduced-motion實際模擬、性能trace。不能宣稱WCAG或效能全面合格。
- 無帳密寫入產物。截圖包含已授權測試帳號內容，不含密碼/API Key。既有工作區修改保留；本輪未改正式UI，未Commit/Push。

下一步等待你核准方向與階段；本輪停止於Audit與Planning。
