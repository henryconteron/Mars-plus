# Summarizes MEDA per sol and local solar hour, then builds the typical / worst / storm day at Issole.
# The regional dust storm (sols 313-317) is excluded from typical and worst and reported separately.
# AI-assisted (Claude). Reviewed by the MARS+ team.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\common\config.ps1')
$cfg = Get-MarsConfig
Use-CSharp 'lib\MedaHourly.cs' 'MedaHourly'
$repo = $cfg.Root; $raw = $cfg.Site.rawData
$medaDir = Resolve-RepoPath $repo $raw.medaDir
$issoleFirstSol = [int]$cfg.Site.sources.medaSols.issole[0]
$stormSols = 313..317

function Get-Product([int]$sol, [string]$product) { Get-ChildItem $medaDir -Filter ("WE__{0:D4}*_DER_{1}_*.CSV" -f $sol, $product) | Select-Object -First 1 }
function Get-Cell($stats, [int]$hour, [int]$k) { $stats.GetValue($hour, $k) }

$perSol = New-Object System.Collections.Generic.List[object]
$sols = Get-ChildItem $medaDir -Filter 'WE__*_DER_TIRS_*.CSV' | ForEach-Object { [int]$_.Name.Substring(4, 4) } | Sort-Object -Unique
foreach ($sol in $sols) {
  $tirsFile = Get-Product $sol 'TIRS'; $windFile = Get-Product $sol 'WS'; $pressFile = Get-Product $sol 'PS'
  $tempStats = [MedaHourly]::Compute($tirsFile.FullName, 'UPWARD_LW_IRRADIANCE', $true, 1e6)
  $windStats = if ($windFile) { , [MedaHourly]::Compute($windFile.FullName, 'HORIZONTAL_WIND_SPEED', $false, 100) } else { $null }
  $pressStats = if ($pressFile) { , [MedaHourly]::Compute($pressFile.FullName, 'PRESSURE', $false, 1e6) } else { $null }
  for ($hour = 0; $hour -lt 24; $hour++) {
    $row = [ordered]@{ sol = $sol; site = $(if ($sol -ge $issoleFirstSol) { 'Issole' } else { 'Landing' }); hour = $hour; ground_temp_mean_c = ''; ground_temp_min_c = ''; wind_mean_ms = ''; wind_max_ms = ''; pressure_mean_pa = '' }
    if ((Get-Cell $tempStats $hour 2) -gt 0) { $row.ground_temp_mean_c = [math]::Round((Get-Cell $tempStats $hour 0) / (Get-Cell $tempStats $hour 2), 1); $row.ground_temp_min_c = [math]::Round((Get-Cell $tempStats $hour 3), 1) }
    if ($windStats -and (Get-Cell $windStats $hour 2) -gt 0) { $row.wind_mean_ms = [math]::Round((Get-Cell $windStats $hour 0) / (Get-Cell $windStats $hour 2), 1); $row.wind_max_ms = [math]::Round((Get-Cell $windStats $hour 4), 1) }
    if ($pressStats -and (Get-Cell $pressStats $hour 2) -gt 0) { $row.pressure_mean_pa = [math]::Round((Get-Cell $pressStats $hour 0) / (Get-Cell $pressStats $hour 2), 1) }
    $perSol.Add([pscustomobject]$row)
  }
}
$hourlyPath = Resolve-RepoPath $repo $raw.weatherHourly
New-Item -ItemType Directory -Force (Split-Path $hourlyPath) | Out-Null
Export-CsvUtf8NoBom $perSol $hourlyPath
Write-Step "MEDA: $($sols.Count) sols summarized"

function Get-Summary($values) {
  $v = @($values | Where-Object { $_ -ne '' } | ForEach-Object { [double]$_ })
  if ($v.Count -eq 0) { return $null }
  return ($v | Measure-Object -Average -Minimum -Maximum)
}
function Round1($x) { if ($null -eq $x) { return $null } return [math]::Round($x, 1) }

$typical = foreach ($hour in 0..23) {
  $normal = @($perSol | Where-Object { $_.site -eq 'Issole' -and $_.hour -eq $hour -and $stormSols -notcontains $_.sol })
  $storm = @($perSol | Where-Object { $_.site -eq 'Issole' -and $_.hour -eq $hour -and $stormSols -contains $_.sol })
  $col = { param($set, $name) @($set | ForEach-Object { $_.$name }) }
  $tMean = Get-Summary (& $col $normal 'ground_temp_mean_c'); $tMin = Get-Summary (& $col $normal 'ground_temp_min_c')
  $wMean = Get-Summary (& $col $normal 'wind_mean_ms'); $wMax = Get-Summary (& $col $normal 'wind_max_ms')
  $sT = Get-Summary (& $col $storm 'ground_temp_mean_c'); $sW = Get-Summary (& $col $storm 'wind_mean_ms')
  [pscustomobject][ordered]@{
    hour = $hour
    typical_temp_c = Round1 $(if ($tMean) { $tMean.Average })
    worst_temp_c = Round1 $(if ($tMin) { $tMin.Minimum })
    typical_wind_ms = Round1 $(if ($wMean) { $wMean.Average })
    worst_wind_ms = Round1 $(if ($wMean) { $wMean.Maximum })
    gust_max_ms = Round1 $(if ($wMax) { $wMax.Maximum })
    sols = $(if ($tMean) { $tMean.Count } else { 0 })
    storm_temp_c = Round1 $(if ($sT) { $sT.Average })
    storm_wind_ms = Round1 $(if ($sW) { $sW.Average })
  }
}
Export-CsvUtf8NoBom $typical (Resolve-RepoPath $repo $raw.weatherTypical)
Write-Step 'MEDA typical/worst/storm day written'
