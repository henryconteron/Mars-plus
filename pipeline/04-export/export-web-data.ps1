# Exports the site data consumed by app/ (see STACK_Y_ARQUITECTURA.md, section 4).
# Inputs: data/ (raw + processed) and config/. Output: app/data/sites/jezero-issole/
# AI-assisted (Claude). Reviewed by the MARS+ team.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\common\config.ps1')
$cfg = Get-MarsConfig
$repo = $cfg.Root; $mp = $cfg.Params; $site = $cfg.Site; $raw = $site.rawData
Add-Type -AssemblyName System.Drawing
Use-CSharp '03-model\RouteEngine.cs' 'RouteEngine' @('System.Drawing')
$inv = [Globalization.CultureInfo]::InvariantCulture

# --- parameters from the single source of truth ---
[RouteEngine]::ToblerFactor = [double]$mp.walking.toblerFactor
[RouteEngine]::SlopeBlockDeg = [double]$mp.terrain.slopeBlockDeg
[RouteEngine]::RoughRefM = [double]$mp.terrain.roughnessRefM
[RouteEngine]::LargeDuneExtra = [double]$mp.terrain.largeDuneExtra
[RouteEngine]::SmallDuneExtra = [double]$mp.terrain.smallDuneExtra
[RouteEngine]::RockMult = [double]$mp.terrain.rockMult
[RouteEngine]::RockBlock = [double]$mp.terrain.rockBlockFraction
[RouteEngine]::WorkspaceMaxSlopeDeg = [double]$mp.workspace.maxSlopeDeg
[RouteEngine]::WorkspaceMaxLargeDune = [double]$mp.workspace.maxLargeDuneFraction
$marsR = [double]$site.marsRadiusM

$outDir = Join-Path $repo ("app\data\sites\" + $site.id)
$ovDir = Join-Path $outDir 'overlays'
New-Item -ItemType Directory -Force $ovDir | Out-Null

# --- terrain layers at 1 m ---
Write-Step 'Loading terrain layers'
$dtmMeta = Get-Content (Resolve-RepoPath $repo $raw.dtmMeta) -Raw | ConvertFrom-Json
$nRows = [int]$dtmMeta.rows; $nCols = [int]$dtmMeta.cols
$x0 = [double]$dtmMeta.originXM; $y0 = [double]$dtmMeta.originYM
$z1 = [RouteEngine]::LoadFloat((Resolve-RepoPath $repo $raw.dtm), $nRows * $nCols)
$rough1 = [RouteEngine]::Roughness1m($z1, $nRows, $nCols)
$geo1 = [IO.File]::ReadAllBytes((Resolve-RepoPath $repo $raw.geologyRaster))
$orthoMeta = Get-Content (Resolve-RepoPath $repo $raw.orthoMeta) -Raw | ConvertFrom-Json
$ortho = [IO.File]::ReadAllBytes((Resolve-RepoPath $repo $raw.ortho))
$rock1 = [RouteEngine]::RocksFromOrtho($ortho, [int]$orthoMeta.rows, [int]$orthoMeta.cols, [int]$mp.rockDetection.windowPx, [double]$mp.rockDetection.shadowThreshold, 4)

$land = $site.points.landing; $tSamp = $site.stopTargets.sampling; $tObs = $site.stopTargets.observation
$runs = New-Object System.Collections.Generic.List[string]
$stopsJson = $null; $eng2 = $null
foreach ($k in 1, 2, 5) {
  Write-Step "Routes at $k m"
  $eng = New-Object RouteEngine -ArgumentList $z1, $rough1, $rock1, $geo1, $nRows, $nCols, $x0, $y0, $marsR, $k
  $whySamp = ''; $whyObs = ''
  $cL = $eng.Cell([double]$land.lon, [double]$land.lat)
  $cS = $eng.BestWorkspace([double]$tSamp.lat, [double]$tSamp.lon, [double]$tSamp.searchRadiusM, [double]$tSamp.platformRadiusM, [ref]$whySamp)
  $cO = $eng.BestWorkspace([double]$tObs.lat, [double]$tObs.lon, [double]$tObs.searchRadiusM, [double]$tObs.platformRadiusM, [ref]$whyObs)
  if ($cS -lt 0 -or $cO -lt 0) { throw "No workspace found at $k m" }
  $prevL = $null; $prevO = $null; $nextL = $null
  $null = $eng.TimeFrom($cL, [ref]$prevL)
  $null = $eng.TimeFrom($cO, [ref]$prevO)
  $null = $eng.TimeTo($cL, [ref]$nextL)
  $runs.Add($eng.StatsJson($eng.StraightLine($cL, $cS), 'straight_landing_sampling'))
  $runs.Add($eng.StatsJson([RouteEngine]::PathFrom($prevL, $cO), 'landing_observation'))
  $runs.Add($eng.StatsJson([RouteEngine]::PathFrom($prevL, $cS), 'landing_sampling'))
  $runs.Add($eng.StatsJson([RouteEngine]::PathFrom($prevO, $cS), 'observation_sampling'))
  $runs.Add($eng.StatsJson([RouteEngine]::PathTo($nextL, $cS), 'sampling_landing'))
  $runs.Add($eng.StatsJson([RouteEngine]::PathTo($nextL, $cO), 'observation_landing'))
  if ($k -eq 2) {
    $eng2 = $eng
    $stopsJson = [string]::Format($inv, '{{"resM":2,"sampling":{{"ok":true,"lon":{0:F7},"lat":{1:F7},"target":"{2}","criteria":{3}}},"observation":{{"ok":true,"lon":{4:F7},"lat":{5:F7},"target":"{6}","criteria":{7}}}}}',
      $eng.Lon($cS % $eng.NC), $eng.Lat([math]::Floor($cS / $eng.NC)), $tSamp.target, $whySamp,
      $eng.Lon($cO % $eng.NC), $eng.Lat([math]::Floor($cO / $eng.NC)), $tObs.target, $whyObs)
  }
}

# --- rover path (reference) ---
$traj = Get-Content (Resolve-RepoPath $repo $raw.trajectory) -Raw | ConvertFrom-Json
$roverFeature = $traj.features | Where-Object { $_.properties.id -eq 'rover-traverse' } | Select-Object -First 1
$roverCoords = ($roverFeature.geometry.coordinates | ForEach-Object { [string]::Format($inv, '[{0:F7},{1:F7}]', [double]$_[0], [double]$_[1]) }) -join ','
$routesJson = '{"paramsVersion":"' + $mp.version + '","primaryResM":2,"runs":[' + ($runs -join ',') + '],"roverPath":{"label":"' + $roverFeature.properties.label + '","distanceM":' + ([double]$roverFeature.properties.distanceM).ToString('0.0', $inv) + ',"coords":[' + $roverCoords + ']}}'
Write-Utf8NoBom (Join-Path $outDir 'routes.json') $routesJson
Write-Utf8NoBom (Join-Path $outDir 'stops.json') $stopsJson

# --- terrain grid for the browser (2 m) ---
Write-Step 'Terrain grid 2 m'
$zMin = 0.0
$bands = $eng2.ExportBands([ref]$zMin)
[IO.File]::WriteAllBytes((Join-Path $outDir 'terrain-2m.bin'), $bands)
$cellCount = $eng2.NR * $eng2.NC
$deg = 180.0 / [math]::PI / $marsR
$west = $eng2.X0 * $deg; $east = ($eng2.X0 + $eng2.NC * $eng2.Res) * $deg
$north = $eng2.Y0 * $deg; $south = ($eng2.Y0 - $eng2.NR * $eng2.Res) * $deg
$terrainMeta = [ordered]@{
  paramsVersion = $mp.version; rows = $eng2.NR; cols = $eng2.NC; resM = $eng2.Res
  originXM = $eng2.X0; originYM = $eng2.Y0; marsRadiusM = $marsR; nodata = 65535
  bounds = [ordered]@{ west = $west; south = $south; east = $east; north = $north }
  bands = @(
    [ordered]@{ name = 'z'; type = 'uint16'; offset = 0; scale = 0.01; add = $zMin; unit = 'm' },
    [ordered]@{ name = 'slope'; type = 'uint8'; offset = 2 * $cellCount; scale = 0.25; add = 0; unit = 'deg' },
    [ordered]@{ name = 'rough'; type = 'uint8'; offset = 3 * $cellCount; scale = 0.005; add = 0; unit = 'm' },
    [ordered]@{ name = 'duneLarge'; type = 'uint8'; offset = 4 * $cellCount; scale = (1.0 / 255); add = 0; unit = 'fraction' },
    [ordered]@{ name = 'duneSmall'; type = 'uint8'; offset = 5 * $cellCount; scale = (1.0 / 255); add = 0; unit = 'fraction' },
    [ordered]@{ name = 'rock'; type = 'uint8'; offset = 6 * $cellCount; scale = (1.0 / 255); add = 0; unit = 'fraction' }
  )
}
Write-Utf8NoBom (Join-Path $outDir 'terrain-2m.json') ($terrainMeta | ConvertTo-Json -Depth 5)

# --- overlays ---
Write-Step 'Overlays'
[ImageWriter]::SaveRgba([ImageWriter]::CostOverlay($eng2), $eng2.NC, $eng2.NR, (Join-Path $ovDir 'cost-2m.png'))
[ImageWriter]::SaveRgba([ImageWriter]::SlopeOverlay($eng2), $eng2.NC, $eng2.NR, (Join-Path $ovDir 'slope-2m.png'))
# Backup base image at 2 m/px (8x8 mean of the 25 cm orthoimage) to keep the payload small
$oW = [math]::Floor([int]$orthoMeta.cols / 8); $oH = [math]::Floor([int]$orthoMeta.rows / 8)
[ImageWriter]::SaveRgba([ImageWriter]::OrthoBase($ortho, [int]$orthoMeta.rows, [int]$orthoMeta.cols, 8), $oW, $oH, (Join-Path $ovDir 'base-ortho-2m.png'))
$oWest = [double]$orthoMeta.originXM * $deg; $oNorth = [double]$orthoMeta.originYM * $deg; $oW = $oW * 2; $oH = $oH * 2
$overlays = [ordered]@{
  cost = [ordered]@{ file = 'overlays/cost-2m.png'; bounds = [ordered]@{ west = $west; south = $south; east = $east; north = $north } }
  slope = [ordered]@{ file = 'overlays/slope-2m.png'; bounds = [ordered]@{ west = $west; south = $south; east = $east; north = $north } }
  baseOrtho = [ordered]@{ file = 'overlays/base-ortho-2m.png'; bounds = [ordered]@{ west = $oWest; south = $oNorth - $oH * $deg; east = $oWest + $oW * $deg; north = $oNorth } }
}
Write-Utf8NoBom (Join-Path $outDir 'overlays.json') ($overlays | ConvertTo-Json -Depth 4)

# --- geology (Stack et al. 2020) ---
Write-Step 'Geology'
$geoIn = Get-Content (Resolve-RepoPath $repo $raw.geologyVector) -Raw | ConvertFrom-Json
$geoFeatures = foreach ($f in $geoIn.features) {
  $surf = ([string]$f.properties.SurfUName).Trim(); $bed = ([string]$f.properties.BedrkUName).Trim()
  $cls = if ($surf -match 'Aeolian bedforms, large') { 'largeDunes' } elseif ($surf -match 'Aeolian bedforms, small') { 'smallDunes' } elseif ($bed -match 'fractured 1') { 'seitah' } elseif ($bed -match 'fractured rough') { 'maaz' } else { 'other' }
  $ring = ($f.geometry.coordinates[0] | ForEach-Object { [string]::Format($inv, '[{0:F7},{1:F7}]', [double]$_[0], [double]$_[1]) }) -join ','
  '{"type":"Feature","properties":{"class":"' + $cls + '","surface":"' + $surf + '","bedrock":"' + $bed + '"},"geometry":{"type":"Polygon","coordinates":[[' + $ring + ']]}}'
}
Write-Utf8NoBom (Join-Path $outDir 'geology.geojson') ('{"type":"FeatureCollection","source":"Stack et al. 2020, Space Sci. Rev. (Mars 2020 Science Team photogeologic map)","features":[' + ($geoFeatures -join ',') + ']}')

# --- weather (MEDA) ---
Write-Step 'Weather'
function NumOrNull($v) { if ($null -eq $v -or "$v" -eq '') { return 'null' } return ([double]$v).ToString('0.0', $inv) }
$med = Import-Csv (Resolve-RepoPath $repo $raw.weatherTypical)
$hours = foreach ($r in $med) {
  '{"h":' + [int]$r.hour + ',"typical":{"tempC":' + (NumOrNull $r.typical_temp_c) + ',"windMs":' + (NumOrNull $r.typical_wind_ms) + '},"worst":{"tempC":' + (NumOrNull $r.worst_temp_c) + ',"windMs":' + (NumOrNull $r.worst_wind_ms) + '},"storm":{"tempC":' + (NumOrNull $r.storm_temp_c) + ',"windMs":' + (NumOrNull $r.storm_wind_ms) + '},"gustMaxMs":' + (NumOrNull $r.gust_max_ms) + ',"sols":' + [int]$r.sols + '}'
}
Write-Utf8NoBom (Join-Path $outDir 'weather-issole.json') ('{"site":"Issole","sols":"286-339 (typical/worst exclude the dust storm, sols 313-317)","source":"MEDA derived TIRS/WS, NASA PDS Atmospheres (DOI 10.17189/1522849)","note":"Ground temperature from TIRS upward LW irradiance, emissivity 0.99. Hours are local true solar time (LTST).","hours":[' + ($hours -join ',') + ']}')

# --- radiation (RAD, detector E) ---
Write-Step 'Radiation'
$radRows = Import-Csv (Resolve-RepoPath $repo $raw.radiation) | Where-Object { $_.dose_E_uGy_h -ne '' -and [double]$_.dose_E_uGy_h -ge 0 }
$isEvent = { param($u) $u.StartsWith('2021-301') -or $u.StartsWith('2021-302') }
$bg = @($radRows | Where-Object { -not (& $isEvent $_.utc) } | ForEach-Object { [double]$_.dose_E_uGy_h }) | Measure-Object -Average
$ev = @($radRows | Where-Object { & $isEvent $_.utc } | ForEach-Object { [double]$_.dose_E_uGy_h }) | Measure-Object -Average -Maximum
$series = ($radRows | ForEach-Object { '["' + $_.utc + '",' + ([double]$_.dose_E_uGy_h).ToString('0.00', $inv) + ']' }) -join ','
$radJson = '{"source":"MSL RAD RDR, NASA PDS PPI (detector E), Gale crater","unit":"uGy/h (absorbed dose)","backgroundUGyH":' + $bg.Average.ToString('0.00', $inv) +
  ',"event":{"label":"Solar particle event of 28 Oct 2021 (first ground-level event seen on Earth, Moon and Mars)","days":["2021-301","2021-302"],"meanUGyH":' + $ev.Average.ToString('0.00', $inv) + ',"maxUGyH":' + $ev.Maximum.ToString('0.00', $inv) +
  '},"note":"Reference rate from Gale crater; Jezero is higher (less atmosphere above), so local dose would be somewhat larger.","series":[' + $series + ']}'
Write-Utf8NoBom (Join-Path $outDir 'radiation-oct2021.json') $radJson

# --- rover photos for the stops (selected in config/site.*.json, credited NASA/JPL-Caltech) ---
Write-Step 'Rover photos'
$photoDir = Join-Path $repo 'app\assets\rover'
New-Item -ItemType Directory -Force $photoDir | Out-Null
foreach ($ph in $site.photos) {
  $srcPhoto = Join-Path (Resolve-RepoPath $repo $raw.roverImagesDir) $ph.source
  if (-not (Test-Path $srcPhoto)) { throw "Rover photo not found: $($ph.source) (run download-rover-images.ps1)" }
  Copy-Item $srcPhoto (Join-Path $photoDir $ph.file) -Force
}

# --- configuration shipped with the app (single source of truth stays in config/) ---
Copy-Item (Join-Path $repo 'config\model-parameters.json') (Join-Path $repo 'app\data\model-parameters.json') -Force
Copy-Item (Join-Path $repo 'config\site.jezero-issole.json') (Join-Path $outDir 'site.json') -Force

# --- manifest ---
Write-Step 'Manifest'
$sources = @{
  'terrain-2m.bin' = 'HiRISE 1 m DTM (USGS Astrogeology, Mars 2020 TRN) + HiRISE 25 cm orthoimage + Stack et al. 2020'
  'routes.json' = 'MARS+ route engine (pipeline/03-model/RouteEngine.cs); rover path: NASA MMGIS M20 waypoints'
  'stops.json' = 'MARS+ workspace search around Robine/Malay rover positions (NASA MMGIS M20)'
  'geology.geojson' = 'Stack et al. 2020 (CC BY 4.0)'; 'weather-issole.json' = 'MEDA, NASA PDS Atmospheres'
  'radiation-oct2021.json' = 'MSL RAD, NASA PDS PPI'
  'overlays/base-ortho-2m.png' = 'HiRISE orthomosaic (NASA/JPL/University of Arizona; USGS Mars 2020 TRN)'
}
$files = Get-ChildItem $outDir -Recurse -File | Where-Object { $_.Name -ne 'manifest.json' }
$entries = foreach ($f in $files) {
  $rel = $f.FullName.Substring($outDir.Length + 1).Replace('\', '/')
  $src = if ($sources.ContainsKey($rel)) { $sources[$rel] } else { 'Derived by MARS+ pipeline' }
  [ordered]@{ file = $rel; bytes = $f.Length; sha256 = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); source = $src }
}
Write-Utf8NoBom (Join-Path $outDir 'manifest.json') ([ordered]@{ site = $site.id; generated = (Get-Date).ToString('s'); paramsVersion = $mp.version; files = @($entries) } | ConvertTo-Json -Depth 4)
$total = ($files | Measure-Object Length -Sum).Sum
Write-Step ("Done: {0} files, {1:N2} MB in {2}" -f $files.Count, ($total / 1MB), $outDir)
