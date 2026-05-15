# Fix encoding: re-write the feature cards with correct UTF-8 Chinese text
$file = "c:\My Files\web\StoryboardAI2\public\html\index.html"
$raw = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Build the correct card HTML with proper Chinese characters
$card1front = '<div class="ticket-film-area" style="background:linear-gradient(135deg,#2a1f0e,#3d2e12)">📝</div><div class="ticket-stub"><span class="ticket-category">TEMPLATE LIBRARY</span><span class="ticket-title">熱門爆點模板庫</span><div class="ticket-meta"><span class="ticket-seat">SEAT A-01</span><span class="ticket-number">NO. 001</span></div></div><div class="ticket-bottom-strip"></div>'
$card1back = '<div class="card-back-content"><h3>熱門爆點模板庫</h3><p>包含超過百種當前最熱門的短影音爆款模板，快速套用不卡關，讓創意瞬間抓住觀眾眼球。</p></div><div class="card-back-barcode"><div class="barcode-lines"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><span class="barcode-text">STORYBOARD-AI · 001</span></div>'

$card2front = '<div class="ticket-film-area" style="background:linear-gradient(135deg,#1f1510,#3a2415)">🎬</div><div class="ticket-stub"><span class="ticket-category">AI GENERATION</span><span class="ticket-title">AI短影音分鏡生成</span><div class="ticket-meta"><span class="ticket-seat">SEAT A-02</span><span class="ticket-number">NO. 002</span></div></div><div class="ticket-bottom-strip"></div>'
$card2back = '<div class="card-back-content"><h3>AI短影音分鏡生成</h3><p>只要輸入文字腳本，AI即可自動為您生成專業的短影音分鏡圖，大幅縮短前置作業時間。</p></div><div class="card-back-barcode"><div class="barcode-lines"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><span class="barcode-text">STORYBOARD-AI · 002</span></div>'

$card3front = '<div class="ticket-film-area" style="background:linear-gradient(135deg,#201a08,#3a3010)">✨</div><div class="ticket-stub"><span class="ticket-category">CUSTOMIZATION</span><span class="ticket-title">靈活自訂義修改</span><div class="ticket-meta"><span class="ticket-seat">SEAT B-01</span><span class="ticket-number">NO. 003</span></div></div><div class="ticket-bottom-strip"></div>'
$card3back = '<div class="card-back-content"><h3>靈活自訂義修改</h3><p>生成的分鏡支援細部調整，從運鏡方向到角色表情，讓每個畫面都符合您的完美想像。</p></div><div class="card-back-barcode"><div class="barcode-lines"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><span class="barcode-text">STORYBOARD-AI · 003</span></div>'

$card4front = '<div class="ticket-film-area" style="background:linear-gradient(135deg,#0e1f15,#1a3326)">🔒</div><div class="ticket-stub"><span class="ticket-category">OFFLINE · SECURE</span><span class="ticket-title">本地端離線運算</span><div class="ticket-meta"><span class="ticket-seat">SEAT B-02</span><span class="ticket-number">NO. 004</span></div></div><div class="ticket-bottom-strip"></div>'
$card4back = '<div class="card-back-content"><h3>本地端離線運算</h3><p>支援完全離線的 NPU 運算，確保未公開的商業機密與原創劇本獲得最高層級的資安保護。</p></div><div class="card-back-barcode"><div class="barcode-lines"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><span class="barcode-text">STORYBOARD-AI · 004</span></div>'

$card5front = '<div class="ticket-film-area" style="background:linear-gradient(135deg,#170f22,#2a1f3d)">📊</div><div class="ticket-stub"><span class="ticket-category">3D MOCAP</span><span class="ticket-title">3D 動作捕捉與參數調整</span><div class="ticket-meta"><span class="ticket-seat">SEAT C-01</span><span class="ticket-number">NO. 005</span></div></div><div class="ticket-bottom-strip"></div>'
$card5back = '<div class="card-back-content"><h3>3D 動作捕捉與參數調整</h3><p>整合 3D 動作捕捉技術，讓分鏡人物動作更自然，並提供多項專業運鏡參數供進階調整。</p></div><div class="card-back-barcode"><div class="barcode-lines"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><span class="barcode-text">STORYBOARD-AI · 005</span></div>'

$card6front = '<div class="ticket-film-area" style="background:linear-gradient(135deg,#1f1510,#3a2415)">🎯</div><div class="ticket-stub"><span class="ticket-category">ANALYTICS</span><span class="ticket-title">帳號數據精準企劃</span><div class="ticket-meta"><span class="ticket-seat">SEAT C-02</span><span class="ticket-number">NO. 006</span></div></div><div class="ticket-bottom-strip"></div>'
$card6back = '<div class="card-back-content"><h3>帳號數據精準企劃</h3><p>綁定社群帳號，透過 AI 深度分析觀眾輪廓與歷史數據，為您量身打造最高轉換率的企劃。</p></div><div class="card-back-barcode"><div class="barcode-lines"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div><span class="barcode-text">STORYBOARD-AI · 006</span></div>'

function MakeCard($front, $back) {
    return '<div class="feature-card card"><div class="card-inner"><div class="card-front">' + $front + '</div><div class="card-back">' + $back + '</div></div></div>'
}

$newGrid = '<div class="features-grid" id="feature-container">' + "`n                " +
    (MakeCard $card1front $card1back) + "`n                " +
    (MakeCard $card2front $card2back) + "`n                " +
    (MakeCard $card3front $card3back) + "`n                " +
    (MakeCard $card4front $card4back) + "`n                " +
    (MakeCard $card5front $card5back) + "`n                " +
    (MakeCard $card6front $card6back) + "`n                " +
    (MakeCard $card1front $card1back) + "`n                " +
    (MakeCard $card2front $card2back) + "`n                " +
    (MakeCard $card3front $card3back) + "`n                " +
    (MakeCard $card4front $card4back) + "`n                " +
    (MakeCard $card5front $card5back) + "`n                " +
    (MakeCard $card6front $card6back) + "`n            </div>"

$pattern = '(?s)<div class="features-grid" id="feature-container">.*?</div>(?=\s*</div>\s*</div>\s*</section>)'
$newContent = [regex]::Replace($raw, $pattern, $newGrid)
[System.IO.File]::WriteAllText($file, $newContent, (New-Object System.Text.UTF8Encoding $false))
Write-Host "Done."
