# Clips the Stack et al. 2020 photogeologic map to the pilot area (+100 m) and rasterizes its unit classes
# onto the 1 m DTM grid (1 = large aeolian bedforms, 2 = small bedforms, 3 = other unit, 0 = none).
# AI-assisted (Claude). Reviewed by the MARS+ team.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\common\config.ps1')
$cfg = Get-MarsConfig
Use-CSharp 'lib\Geology.cs' 'Geology'
$repo = $cfg.Root; $raw = $cfg.Site.rawData; $marsR = [double]$cfg.Site.marsRadiusM
$dm = Get-Content (Resolve-RepoPath $repo $raw.dtmMeta) -Raw | ConvertFrom-Json
$nRows = [int]$dm.rows; $nCols = [int]$dm.cols; $x0 = [double]$dm.originXM; $y0 = [double]$dm.originYM

Write-Step 'Geology: clipping Stack 2020 shapefile'
$parts = [Geology]::ClipShapefile((Resolve-RepoPath $repo $raw.geologyShapefile), $x0 - 100, $y0 - $nRows - 100, $x0 + $nCols + 100, $y0 + 100, $marsR).Split('|', 2)
$clipPath = Resolve-RepoPath $repo $raw.geologyVector
New-Item -ItemType Directory -Force (Split-Path $clipPath) | Out-Null
Write-Utf8NoBom $clipPath $parts[1]
Write-Step "Geology: $($parts[0]) polygons in the area"

Write-Step 'Geology: rasterizing to the 1 m grid'
$features = ($parts[1] | ConvertFrom-Json).features
$xs = New-Object 'System.Collections.Generic.List[double[]]'; $ys = New-Object 'System.Collections.Generic.List[double[]]'; $classes = @()
foreach ($f in $features) {
  $ring = $f.geometry.coordinates[0]
  $xs.Add([double[]]($ring | ForEach-Object { $_[0] })); $ys.Add([double[]]($ring | ForEach-Object { $_[1] }))
  $surface = [string]$f.properties.SurfUName
  $classes += $(if ($surface -match 'Aeolian bedforms, large') { 1 } elseif ($surface -match 'Aeolian bedforms, small') { 2 } else { 3 })
}
$grid = [Geology]::Rasterize($xs, $ys, [int[]]$classes, $nRows, $nCols, $x0, $y0, $marsR)
[IO.File]::WriteAllBytes((Resolve-RepoPath $repo $raw.geologyRaster), $grid)
Write-Step 'Geology done'
