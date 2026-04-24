Add-Type -AssemblyName System.Drawing
$srcPath = 'C:\Users\VICTUS\.gemini\antigravity\brain\ddd9515c-f758-40e6-ba77-f6fc40cc74d4\extension_icon_1777011923846.png'
$src = [System.Drawing.Image]::FromFile($srcPath)
foreach ($size in @(16, 48, 128)) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()
    $outPath = Join-Path $PSScriptRoot "icon$size.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Created $outPath"
}
$src.Dispose()
