Add-Type -AssemblyName System.Drawing
$auditRoot = $PSScriptRoot
$canvas = [System.Drawing.Bitmap]::new(1060, 840)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#eef2f6'))
$font = [System.Drawing.Font]::new('Microsoft JhengHei', 17)
$small = [System.Drawing.Font]::new('Microsoft JhengHei', 12)
$ink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0f172a'))
$graphics.DrawString('StoryboardAI | 390px Folder Comparison', $font, $ink, 24, 14)
$names = @('dashboard-390', 'projects-390', 'history-390')
$labels = @('Dashboard / Reel', 'Projects / Grid', 'History / Single column')
for ($itemIndex = 0; $itemIndex -lt 3; $itemIndex++) {
    $source = [System.Drawing.Image]::FromFile((Join-Path $auditRoot ('screenshots/' + $names[$itemIndex] + '.jpg')))
    $itemX = 24 + $itemIndex * 345
    $itemHeight = [int]($source.Height * 320 / $source.Width)
    $graphics.DrawString($labels[$itemIndex], $small, $ink, $itemX, 52)
    $graphics.DrawImage($source, $itemX, 84, 320, $itemHeight)
    $source.Dispose()
}
$canvas.Save((Join-Path $auditRoot 'folder-comparison.jpg'), [System.Drawing.Imaging.ImageFormat]::Jpeg)
$graphics.Dispose()
$canvas.Dispose()
$font.Dispose()
$small.Dispose()
$ink.Dispose()
