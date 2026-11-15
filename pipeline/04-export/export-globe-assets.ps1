# Converts the MARS+ team's globe data (base64 inside JS files, data/raw/globe/) into compact static assets
# for app/assets/globe/, loaded on demand: Viking texture (2048 px fast + 4096 px full), MOLA elevation (int16, gzip),
# USGS global geology (Tanaka et al. 2014, uint8 indices, gzip) with bilingual unit names, sky background and the
# AI-generated logo with a visible watermark (Space Apps rule for AI-generated images).
# AI-assisted (Claude). Reviewed by the MARS+ team.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\common\config.ps1')
$cfg = Get-MarsConfig
Add-Type -AssemblyName System.Drawing
$srcDir = Join-Path $cfg.Root 'data\raw\globe'
$outDir = Join-Path $cfg.Root 'app\assets\globe'
New-Item -ItemType Directory -Force $outDir | Out-Null

function Read-JsObject([string]$path) {
  $t = [IO.File]::ReadAllText($path); $json = $t.Substring($t.IndexOf('{')); $json.Substring(0, $json.LastIndexOf('}') + 1) | ConvertFrom-Json
}
function Save-Jpeg([Drawing.Image]$img, [int]$w, [int]$h, [string]$path, [long]$quality) {
  $bmp = New-Object Drawing.Bitmap $w, $h
  $g = [Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.DrawImage($img, 0, 0, $w, $h); $g.Dispose()
  $codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object Drawing.Imaging.EncoderParameters 1; $ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter ([Drawing.Imaging.Encoder]::Quality), $quality
  $bmp.Save($path, $codec, $ep); $bmp.Dispose()
}

# --- Viking MDIM 2.1 colour mosaic (Mars Trek level 3) ---
Write-Step 'Globe: Viking texture'
$viking = [IO.File]::ReadAllText((Join-Path $srcDir 'viking-textura.js'))
$b64 = [regex]::Match($viking, 'base64,([A-Za-z0-9+/=]+)').Groups[1].Value
$jpg = [Convert]::FromBase64String($b64)
$fullPath = Join-Path $outDir 'viking-mdim21-full.jpg'
[IO.File]::WriteAllBytes($fullPath, $jpg)
$img = [Drawing.Image]::FromFile($fullPath)
$fullW = $img.Width; $fullH = $img.Height
Save-Jpeg $img 2048 1024 (Join-Path $outDir 'viking-mdim21-2048.jpg') 82
$img.Dispose()

# --- MOLA MEGDR elevation, 8 px/deg, int16 little-endian, gzip (kept compressed) ---
Write-Step 'Globe: MOLA elevation'
$mola = Read-JsObject (Join-Path $srcDir 'mola-elevaciones.js')
[IO.File]::WriteAllBytes((Join-Path $outDir 'mola-megdr-8ppd.i16.gz'), [Convert]::FromBase64String($mola.data))

# --- Global geologic map (Tanaka et al. 2014, USGS SIM 3292) ---
Write-Step 'Globe: geology'
$geo = Read-JsObject (Join-Path $srcDir 'geologia-marte.js')
[IO.File]::WriteAllBytes((Join-Path $outDir 'geology-tanaka2014.u8.gz'), [Convert]::FromBase64String($geo.data))
$english = @{
  lApd = 'Late Amazonian polar dune unit'; Ap = 'Amazonian polar unit'; lApc = 'Late Amazonian polar cap unit'; Hpe = 'Hesperian polar edifice unit'
  Hpu = 'Hesperian polar undivided unit'; Hp = 'Hesperian polar unit'; Apu = 'Amazonian polar undivided unit'; lHvf = 'Late Hesperian volcanic field unit'
  Ave = 'Amazonian volcanic edifice unit'; lNv = 'Late Noachian volcanic unit'; eHv = 'Early Hesperian volcanic unit'; Nve = 'Noachian volcanic edifice unit'
  AHv = 'Amazonian and Hesperian volcanic unit'; lAvf = 'Late Amazonian volcanic field unit'; lAv = 'Late Amazonian volcanic unit'; Hve = 'Hesperian volcanic edifice unit'
  Av = 'Amazonian volcanic unit'; lHv = 'Late Hesperian volcanic unit'; eNhm = 'Early Noachian highland massif unit'; mNhm = 'Middle Noachian highland massif unit'
  eAb = 'Early Amazonian basin unit'; lHb = 'Late Hesperian basin unit'; eHb = 'Early Hesperian basin unit'; HNb = 'Hesperian and Noachian basin unit'
  mAl = 'Middle Amazonian lowland unit'; lHl = 'Late Hesperian lowland unit'; lHt = 'Late Hesperian transition unit'; Hto = 'Hesperian transition outflow unit'
  Ht = 'Hesperian transition unit'; eHt = 'Early Hesperian transition unit'; AHtu = 'Amazonian and Hesperian transition undivided unit'; HNt = 'Hesperian and Noachian transition unit'
  Htu = 'Hesperian transition undivided unit'; mNh = 'Middle Noachian highland unit'; lNh = 'Late Noachian highland unit'; eHh = 'Early Hesperian highland unit'
  eNh = 'Early Noachian highland unit'; Nhe = 'Noachian highland edifice unit'; Nhu = 'Noachian highland undivided unit'; HNhu = 'Hesperian and Noachian highland undivided unit'
  Aa = 'Amazonian apron unit'; ANa = 'Amazonian and Noachian apron unit'; lAa = 'Late Amazonian apron unit'; AHi = 'Amazonian and Hesperian impact unit'
}
$units = foreach ($u in $geo.units) {
  if (-not $english.ContainsKey($u.code)) { throw "Missing English name for unit $($u.code)" }
  [ordered]@{ code = $u.code; color = $u.color; es = $u.label; en = $english[$u.code] }
}

# --- Sky background and watermarked AI logo ---
Copy-Item (Join-Path $srcDir 'cielo-nasa-svs.jpg') (Join-Path $outDir 'sky-nasa-svs.jpg') -Force
Write-Step 'Globe: logo with visible AI watermark'
$logo = [Drawing.Image]::FromFile((Join-Path $srcDir 'logo-mars-plus.png'))
$size = 320; $bmp = New-Object Drawing.Bitmap $size, $size
$g = [Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'
$g.DrawImage($logo, 0, 0, $size, $size)
$band = New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(185, 20, 17, 15))
$g.FillRectangle($band, 0, $size - 34, $size, 34)
$font = New-Object Drawing.Font 'Segoe UI', 13, ([Drawing.FontStyle]::Bold), ([Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
$g.DrawString('AI-generated image', $font, [Drawing.Brushes]::White, (New-Object Drawing.RectangleF 0, ($size - 34), $size, 34), $fmt)
$g.Dispose(); $logo.Dispose()
$bmp.Save((Join-Path $outDir 'mars-plus-logo-ai.png'), [Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()

# --- metadata for the app ---
# Middle dot built from its code point: PowerShell 5.1 reads BOM-less scripts as ANSI, which would garble a literal one.
$dot = "$([char]0x00B7) "
$globeMeta = [ordered]@{
  viking = [ordered]@{ fast = 'viking-mdim21-2048.jpg'; full = 'viking-mdim21-full.jpg'; fullSize = @($fullW, $fullH); source = 'https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m'; credit = 'NASA/JPL/USGS ' + $dot + 'Viking MDIM 2.1 via Mars Trek' }
  mola = [ordered]@{ file = 'mola-megdr-8ppd.i16.gz'; width = [int]$mola.width; height = [int]$mola.height; pixelsPerDegree = [int]$mola.pixelsPerDegree; source = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/'; credit = 'NASA Mars Global Surveyor ' + $dot + 'MOLA MEGDR (PDS)' }
  geology = [ordered]@{ file = 'geology-tanaka2014.u8.gz'; width = [int]$geo.width; height = [int]$geo.height; source = 'https://doi.org/10.3133/sim3292'; credit = 'Tanaka et al. 2014 ' + $dot + 'USGS SIM 3292 for NASA'; units = @($units) }
  sky = [ordered]@{ file = 'sky-nasa-svs.jpg'; source = 'https://svs.gsfc.nasa.gov/4851/'; credit = 'NASA Goddard SVS ' + $dot + 'ESA/Gaia/DPAC' }
  logo = [ordered]@{ file = 'mars-plus-logo-ai.png'; aiGenerated = $true; note = 'AI-generated image (watermarked)' }
  author = 'Globe renderer and data preparation: MARS+ team (AI-assisted); integrated into the app by Claude'
}
Write-Utf8NoBom (Join-Path $outDir 'globe.json') ($globeMeta | ConvertTo-Json -Depth 6)
Get-ChildItem $outDir | ForEach-Object { Write-Step ("  {0,-28} {1,8:N0} KB" -f $_.Name, ($_.Length / 1KB)) }
