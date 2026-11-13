> 後續已依新指示執行自動與瀏覽器檢查，詳見 [FOLLOWUP-RESULTS.md](FOLLOWUP-RESULTS.md)。本文件的「不驗證」只描述當時回合。

# Phase 4 補充修改｜本輪不驗證

依使用者最新指示，本輪沒有執行測試、語法／lint檢查或瀏覽器驗證；先前427／427的結果是上一版紀錄，不代表本輪已通過。

- 一般中央彈窗：進入scale0→1、退出scale1→0，時長相同。退出固定`cubic-bezier(.31,.01,.66,-.59)`，其精確時間反轉的進入曲線為`cubic-bezier(.34,1.59,.69,.99)`。Backdrop blur也採正反曲線，scrim alpha與window opacity保持不變，僅以scale／blur進出。Delete的legacyMotion特例維持原本曲線／淡出設定。
- Folder option：36×28改為54×42，圖示15改為22.5；採實際layout尺寸，不用scale放大。命中區至少54×44。Morph glyph讀取同一icon尺寸。
- 同步擴大tab／notch clearance至至少48px；insert depth扣回新增tab高度，讓原本cover露出的高度保持一致。窄卡的squircle半徑依tab可用寬度封頂，避免手機卡片的按鈕／缺口互擠。
- Secondary cover card：常態置中於primary cover後方、opacity0、visibility hidden；只有hover／expanded才顯示並抽出，離開後收回隱藏。Reduced Motion保持後層隱藏。
- 原測試斷言已配合新規格更新，但沒有執行。仍保留既有修改，不改Hero／Undo，不Commit／Push，不進入下一階段。

## 手機 Folder 橫扁化（取代上一段固定尺寸的手機規則）

- 手機標題強制一行；尾端16px漸層遮罩，保留完整名稱於原link／title。遮罩標題不啟動跑馬燈。
- 依桌面316px的幾何比例縮放preview、shell、tab、insert depth與headroom，取消coarse pointer固定176px底座。窄卡內容收緊，標籤保留24px高度，避免文字操作列把文件夾撐長。
- Option依卡寬縮放：在173px卡片上約29.6×23px，仍有至少44×44觸控區；桌面316px仍為54×42px。圖示與notch同步縮放，沒有對整張卡使用transform scale。
- 同一規則作用於Dashboard、Projects、History及readonly preview。本輪仍未執行測試／瀏覽器驗證，既有測試數字不代表本次修改已通過。
