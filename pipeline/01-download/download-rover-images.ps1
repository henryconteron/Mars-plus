# Indexes Perseverance raw images taken at Issole (official raw-images API, a challenge resource) and downloads
# a curated 800 px selection per sol: context (Navcam, Mastcam-Z, front Hazcam) and proximity science (WATSON, PIXL).
# Entry/descent cameras (EDL_*) are excluded: they were downlinked during these sols but do not show Issole.
# AI-assisted (Claude). Reviewed by the MARS+ team.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\common\config.ps1')
$cfg = Get-MarsConfig
$src = $cfg.Site.sources
$out = Resolve-RepoPath $cfg.Root $cfg.Site.rawData.roverImagesDir
New-Item -ItemType Directory -Force $out | Out-Null

$index = New-Object System.Collections.Generic.List[object]
foreach ($sol in $src.roverImagesSols[0]..$src.roverImagesSols[1]) {
  $page = 0
  do {
    $resp = Invoke-RestMethod ("{0}&sol={1}&num=100&page={2}" -f $src.roverImagesApi, $sol, $page) -TimeoutSec 90 -UserAgent 'mars-plus-pipeline'
    foreach ($im in $resp.images) {
      if ($im.camera.instrument -like 'EDL_*') { continue }
      $index.Add([pscustomobject]@{ sol = $sol; imageid = $im.imageid; instrument = $im.camera.instrument; utc = $im.date_taken_utc; title = $im.title; url800 = $im.image_files.medium; urlFull = $im.image_files.full_res })
    }
    $page++
  } while (@($resp.images).Count -eq 100 -and $page -lt 30)
}
Export-CsvUtf8NoBom $index (Join-Path $out 'rover-images-index.csv')

$quota = @{ NAVCAM_LEFT = 4; MCZ_LEFT = 4; FRONT_HAZCAM_LEFT_A = 1; SHERLOC_WATSON = 3; PIXL_MCC = 1 }
$new = 0
foreach ($group in ($index | Group-Object sol)) {
  foreach ($cam in $quota.Keys) {
    foreach ($img in @($group.Group | Where-Object { $_.instrument -eq $cam -and $_.url800 } | Select-Object -First $quota[$cam])) {
      $name = "sol{0:D3}_{1}_{2}.jpg" -f $img.sol, $img.instrument, $img.imageid.Substring(0, [math]::Min(40, $img.imageid.Length))
      try { if (Save-Url $img.url800 (Join-Path $out $name)) { $new++ } } catch { Write-Step "failed: $($img.imageid)" }
    }
  }
}
Write-Step ("Rover images: {0} indexed (EDL excluded), {1} new downloads" -f $index.Count, $new)
