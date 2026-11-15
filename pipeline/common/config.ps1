# Shared helpers for the MARS+ pipeline: configuration, paths, logging and C# loading.
# AI-assisted (Claude). Reviewed by the MARS+ team.
Set-StrictMode -Version Latest

function Get-MarsConfig {
  $repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
  $modelParams = Get-Content (Join-Path $repoRoot 'config\model-parameters.json') -Raw | ConvertFrom-Json
  $siteCfg = Get-Content (Join-Path $repoRoot 'config\site.jezero-issole.json') -Raw | ConvertFrom-Json
  $apiKey = $null
  $envFile = Join-Path $repoRoot '.env'
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) { if ($line -match '^\s*NASA_API_KEY\s*=\s*(\S+)') { $apiKey = $Matches[1] } }
  }
  [pscustomobject]@{ Root = $repoRoot; Params = $modelParams; Site = $siteCfg; ApiKey = $apiKey }
}

function Resolve-RepoPath([string]$repoRoot, [string]$relative) { Join-Path $repoRoot ($relative -replace '/', '\') }

function Write-Step([string]$text) { Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $text) }

# Windows PowerShell 5.1 writes a UTF-8 BOM from its utf8 encoding name and from parameterless File.WriteAllText.
# JSON consumers and the test suite expect BOM-free UTF-8. A leading U+FEFF in the string is stripped.
function Write-Utf8NoBom([string]$path, [string]$text) {
  if ($text.Length -gt 0 -and [int]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($path, $text, $utf8)
}

function Export-CsvUtf8NoBom($rows, [string]$path) {
  $lines = @($rows | ConvertTo-Csv -NoTypeInformation)
  Write-Utf8NoBom $path (($lines -join "`r`n") + "`r`n")
}

# Loads a C# file from pipeline/ once per PowerShell session.
function Use-CSharp([string]$relativeFile, [string]$typeName, [string[]]$references = @()) {
  if (-not ([System.Management.Automation.PSTypeName]$typeName).Type) {
    $path = Join-Path (Join-Path $PSScriptRoot '..') $relativeFile
    if ($references.Count -gt 0) { Add-Type -Path $path -ReferencedAssemblies $references } else { Add-Type -Path $path }
  }
}

# Downloads a URL to a file unless it already exists (use -Force to refresh).
function Save-Url([string]$url, [string]$dest, [switch]$Force) {
  if ((Test-Path $dest) -and -not $Force) { return $false }
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Invoke-WebRequest $url -OutFile $dest -UseBasicParsing -TimeoutSec 600 -UserAgent 'mars-plus-pipeline'
  return $true
}
