Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

function New-RoundedPath {
    param([single]$x, [single]$y, [single]$w, [single]$h, [single]$r)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

# Dark rounded square as the "terminal window"
$pad = 48
$cornerR = 180
$bgPath = New-RoundedPath -x $pad -y $pad -w ($size - 2*$pad) -h ($size - 2*$pad) -r $cornerR
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 38, 38, 38))
$g.FillPath($bgBrush, $bgPath)
$bgBrush.Dispose()
$bgPath.Dispose()

# Three colored dots at the top — sage green, dusty blue, soft yellow (low-contrast / muted)
$dotR = 80
$dotY = 280
$dotSpacing = 230
$centerX = $size / 2
$leftX = $centerX - $dotSpacing
$rightX = $centerX + $dotSpacing
$dotXs = @($leftX, $centerX, $rightX)
$dotColors = @(
    [System.Drawing.Color]::FromArgb(255, 132, 169, 140),  # sage green
    [System.Drawing.Color]::FromArgb(255, 119, 154, 184),  # dusty blue
    [System.Drawing.Color]::FromArgb(255, 224, 197, 130)   # soft yellow
)
for ($i = 0; $i -lt 3; $i++) {
    $brush = New-Object System.Drawing.SolidBrush($dotColors[$i])
    $g.FillEllipse($brush, ($dotXs[$i] - $dotR), ($dotY - $dotR), (2 * $dotR), (2 * $dotR))
    $brush.Dispose()
}

# Centered ">_" prompt symbol in light grey monospace
$promptFont = New-Object System.Drawing.Font("Consolas", 240, [System.Drawing.FontStyle]::Bold)
$promptBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 200, 200, 200))
$format = New-Object System.Drawing.StringFormat
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString(">_", $promptFont, $promptBrush, $centerX, ($size / 2 + 180), $format)
$promptBrush.Dispose()
$promptFont.Dispose()
$format.Dispose()

$out = "C:\Work\ecogs\projects\AI.Pad\apps\desktop\build\icon.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

Write-Output "Saved: $out"
