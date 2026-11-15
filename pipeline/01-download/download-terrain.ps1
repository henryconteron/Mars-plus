# Downloads only the pilot-area window of the USGS HiRISE 1 m DTM (float32) and the 25 cm orthomosaic (uint8)
# with HTTP range requests. The ortho window is aligned to the DTM window (same origin, 4x4 pixels per DTM cell).
# AI-assisted (Claude). Reviewed by the MARS+ team.
param([string]$OutRoot, [switch]$Force)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\common\config.ps1')
$cfg = Get-MarsConfig
Use-CSharp 'lib\TiffRange.cs' 'TiffRange'
$site = $cfg.Site; $raw = $site.rawData; $marsR = [double]$site.marsRadiusM; $rad = [math]::PI / 180
$dtmBin = if ($OutRoot) { Join-Path $OutRoot 'dtm_1m_float32.bin' } else { Resolve-RepoPath $cfg.Root $raw.dtm }
$dtmMetaPath = $dtmBin -replace 'float32\.bin$', 'meta.json'
$orthoBin = if ($OutRoot) { Join-Path $OutRoot 'ortho_25cm_uint8.bin' } else { Resolve-RepoPath $cfg.Root $raw.ortho }
$orthoMetaPath = $orthoBin -replace 'uint8\.bin$', 'meta.json'
New-Item -ItemType Directory -Force (Split-Path $dtmBin), (Split-Path $orthoBin) | Out-Null

function Save-Meta($path, $url, $info, $r0, $c0, $nr, $nc) {
  Write-Utf8NoBom $path ([ordered]@{ source = $url; resM = $info.ScaleX; rows = $nr; cols = $nc; originXM = $info.TieX + $c0 * $info.ScaleX; originYM = $info.TieY - $r0 * $info.ScaleY; marsRadiusM = $marsR; projection = $site.projection } | ConvertTo-Json)
}

# --- DTM: window from the site bbox ---
if ((Test-Path $dtmBin) -and -not $Force) { Write-Step "DTM already present: $dtmBin" }
else {
  Write-Step 'DTM: reading header'
  $t = [TiffRange]::Open($site.sources.dtm)
  $b = $site.bboxLonLat
  $c0 = [int][math]::Floor(($marsR * $b.west * $rad - $t.TieX) / $t.ScaleX); $c1 = [int][math]::Ceiling(($marsR * $b.east * $rad - $t.TieX) / $t.ScaleX)
  $r0 = [int][math]::Floor(($t.TieY - $marsR * $b.north * $rad) / $t.ScaleY); $r1 = [int][math]::Ceiling(($t.TieY - $marsR * $b.south * $rad) / $t.ScaleY)
  Write-Step "DTM: rows $r0+$($r1 - $r0), cols $c0+$($c1 - $c0)"
  [IO.File]::WriteAllBytes($dtmBin, [TiffRange]::ReadWindow($t, $r0, $r1 - $r0, $c0, $c1 - $c0, 16))
  Save-Meta $dtmMetaPath $site.sources.dtm $t $r0 $c0 ($r1 - $r0) ($c1 - $c0)
}

# --- Orthoimage: aligned to the DTM window ---
if ((Test-Path $orthoBin) -and -not $Force) { Write-Step "Ortho already present: $orthoBin" }
else {
  $dm = Get-Content $dtmMetaPath -Raw | ConvertFrom-Json
  Write-Step 'Ortho: reading header'
  $t = [TiffRange]::Open($site.sources.ortho)
  $c0 = [int][math]::Round(([double]$dm.originXM - $t.TieX) / $t.ScaleX); $r0 = [int][math]::Round(($t.TieY - [double]$dm.originYM) / $t.ScaleY)
  $nc = [int]([int]$dm.cols / $t.ScaleX); $nr = [int]([int]$dm.rows / $t.ScaleY)
  Write-Step "Ortho: rows $r0+$nr, cols $c0+$nc (parallel)"
  [IO.File]::WriteAllBytes($orthoBin, [TiffRange]::ReadWindow($t, $r0, $nr, $c0, $nc, 16))
  Save-Meta $orthoMetaPath $site.sources.ortho $t $r0 $c0 $nr $nc
}
Write-Step 'Terrain download done'
