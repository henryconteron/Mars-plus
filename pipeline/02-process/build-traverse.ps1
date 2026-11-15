# Builds Perseverance's real traverse from the landing site to Issole (end-of-drive waypoints up to sol 286)
# from the NASA MMGIS M20 waypoints file. Used as a reference line, not as a walking route.
# AI-assisted (Claude). Reviewed by the MARS+ team.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\common\config.ps1')
$cfg = Get-MarsConfig
$repo = $cfg.Root; $raw = $cfg.Site.rawData
$inv = [Globalization.CultureInfo]::InvariantCulture
$maxSol = [int]$cfg.Site.sources.roverTraverseMaxSol
$wp = Get-Content (Resolve-RepoPath $repo $raw.roverWaypoints) -Raw | ConvertFrom-Json
$points = @($wp.features | ForEach-Object { $_.properties } | Where-Object { [int]$_.sol -le $maxSol -and $_.final -eq 'y' } | Sort-Object { [double]$_.dist_total_m })
$coords = ($points | ForEach-Object { [string]::Format($inv, '[{0:F7},{1:F7}]', [double]$_.lon, [double]$_.lat) }) -join ','
$distance = [double]($points[-1].dist_total_m)
$json = [string]::Format($inv, '{{"type":"FeatureCollection","features":[{{"type":"Feature","properties":{{"id":"rover-traverse","label":"Perseverance actual traverse (sols 13-{0})","distanceM":{1:F1},"waypoints":{2}}},"geometry":{{"type":"LineString","coordinates":[{3}]}}}}]}}', $maxSol, $distance, $points.Count, $coords)
$outPath = Resolve-RepoPath $repo $raw.trajectory
New-Item -ItemType Directory -Force (Split-Path $outPath) | Out-Null
Write-Utf8NoBom $outPath $json
Write-Step ("Rover traverse: {0} waypoints, {1:N1} m" -f $points.Count, $distance)
