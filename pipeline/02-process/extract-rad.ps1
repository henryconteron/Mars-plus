# Extracts total dose rates (detectors B and E, microGy/h) from Curiosity RAD RDR files into one compact CSV.
# MARS+ uses detector E (plastic, closer to tissue) — see docs/es/adr/007.
# AI-assisted (Claude). Reviewed by the MARS+ team.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\common\config.ps1')
$cfg = Get-MarsConfig
$repo = $cfg.Root; $raw = $cfg.Site.rawData
$radDir = Resolve-RepoPath $repo $raw.radDir
$rows = New-Object System.Collections.Generic.List[string]
$rows.Add('utc,sol_msl,duration_s,dose_B_uGy_h,dose_E_uGy_h')
$reObs = [regex]'\[OBSERVATION: (\d+)\][^\[]*?START_OBS_MARS="(\d+)[^"]*"\s*START_OBS_UTC="([^"]+)"\s*OBS_DURATION=(\d+)'
$reB = [regex]'\[DOSIMETRY_TOTAL_DOSE_B: (\d+)\]\s*([-\d.Ee+]+)'
$reE = [regex]'\[DOSIMETRY_TOTAL_DOSE_E: (\d+)\]\s*([-\d.Ee+]+)'
$solMin = [int]$cfg.Site.sources.radMslSols[0]; $solMax = [int]$cfg.Site.sources.radMslSols[1]
$files = Get-ChildItem $radDir -Filter 'RAD_RDR_*.TXT' | Where-Object { $_.Name -match '_(\d{4})_V\d+\.TXT$' -and [int]$Matches[1] -ge $solMin -and [int]$Matches[1] -le $solMax } | Sort-Object Name
foreach ($file in $files) {
  $text = [IO.File]::ReadAllText($file.FullName)
  $obs = @{}; foreach ($m in $reObs.Matches($text)) { $obs[$m.Groups[1].Value] = @($m.Groups[3].Value, $m.Groups[2].Value, $m.Groups[4].Value) }
  $doseB = @{}; foreach ($m in $reB.Matches($text)) { $doseB[$m.Groups[1].Value] = $m.Groups[2].Value }
  $doseE = @{}; foreach ($m in $reE.Matches($text)) { $doseE[$m.Groups[1].Value] = $m.Groups[2].Value }
  foreach ($key in ($obs.Keys | Sort-Object { [int]$_ })) {
    if ($doseB.ContainsKey($key) -and $doseE.ContainsKey($key)) { $o = $obs[$key]; $rows.Add("$($o[0]),$($o[1]),$($o[2]),$($doseB[$key]),$($doseE[$key])") }
  }
}
$outPath = Resolve-RepoPath $repo $raw.radiation
New-Item -ItemType Directory -Force (Split-Path $outPath) | Out-Null
Write-Utf8NoBom $outPath (($rows -join "`r`n") + "`r`n")
Write-Step "RAD: $($rows.Count - 1) observations"
