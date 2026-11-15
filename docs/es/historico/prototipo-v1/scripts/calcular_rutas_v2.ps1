# Motor v2: rutas y paradas con pendiente + arena (Stack 2020) + rocas (sombras HiRISE 25 cm).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$data = Join-Path $root 'data'
Add-Type -Path (Join-Path $PSScriptRoot 'ruta_motor_v2.cs')
Add-Type -AssemblyName System.Drawing
$m = Get-Content (Join-Path $data 'dtm_1m_meta.json') -Raw | ConvertFrom-Json
$om = Get-Content (Join-Path $data 'ortho_25cm_meta.json') -Raw | ConvertFrom-Json
$nr = [int]$m.filas; $nc = [int]$m.columnas; $Rmars = 3396190.0
$z1 = [RutaMotorV2]::LoadF((Join-Path $data 'dtm_1m_float32.bin'), $nr * $nc)
$rough1 = [RutaMotorV2]::Roughness1m($z1, $nr, $nc)
$geo1 = [IO.File]::ReadAllBytes((Join-Path $data 'geologia_1m_clase.bin'))
$img = [IO.File]::ReadAllBytes((Join-Path $data 'ortho_25cm_uint8.bin'))
$rock1 = [RutaMotorV2]::RocasDesdeOrtho($img, [int]$om.filas, [int]$om.columnas, 21, 0.65, 4)
$b = New-Object 'byte[]' (4 * $rock1.Length); [Buffer]::BlockCopy($rock1, 0, $b, 0, $b.Length); [IO.File]::WriteAllBytes((Join-Path $data 'rocas_1m_fraccion.bin'), $b)

# Calibracion: sombras por unidad geologica
$names = @{ 0 = 'sin unidad'; 1 = 'dunas grandes'; 2 = 'dunas pequenas'; 3 = 'Maaz/Seitah (roca)' }
foreach ($c in 0..3) {
  $v = New-Object System.Collections.Generic.List[double]; for ($i = 0; $i -lt $geo1.Length; $i += 5) { if ($geo1[$i] -eq $c) { $v.Add($rock1[$i]) } }
  if ($v.Count -eq 0) { continue }; $a = $v.ToArray(); [Array]::Sort($a)
  "{0,-20} sombras: media {1:P1}  p50 {2:P1}  p90 {3:P1}  p99 {4:P1}  >12%: {5:P1}" -f $names[$c], ($a | Measure-Object -Average).Average, $a[[int]($a.Length * .5)], $a[[int]($a.Length * .9)], $a[[int]($a.Length * .99)], (($a | Where-Object { $_ -gt 0.12 }).Count / $a.Length)
}

$L = @(77.4509, 18.4446)
$Mues = @(77.44137302, 18.43266059)   # Robine (sol 298): posicion del rover, sitio 9 drive 0
$Obs = @(77.44131402, 18.43260907)    # Malay (sol 337): sitio 9 drive 276, segunda cara del afloramiento
$out = [ordered]@{ generado = (Get-Date).ToString('s'); version = 2
  parametros = [ordered]@{ factor_velocidad = [RutaMotorV2]::VFactor; pendiente_bloqueo_deg = [RutaMotorV2]::SlopeBlock; rugosidad_ref_m = [RutaMotorV2]::RoughRef; dunas_grandes_extra = [RutaMotorV2]::DunaGrandeMult; dunas_pequenas_extra = [RutaMotorV2]::DunaPequenaMult; rocas_mult = [RutaMotorV2]::RockMult; rocas_bloqueo = [RutaMotorV2]::RockBlock }
  corridas = @(); paradas = $null }
foreach ($k in 1, 2, 5) {
  $mo = New-Object RutaMotorV2 -ArgumentList $z1, $rough1, $rock1, $geo1, $nr, $nc, ([double]$m.x_origen_m), ([double]$m.y_origen_m), $Rmars, $k
  $s = $mo.Row($L[1]) * $mo.NC + $mo.Col($L[0])
  $why1 = ''; $why2 = ''
  $pm = $mo.MejorEspacioTrabajo($Mues[1], $Mues[0], 6, 1.5, [ref]$why1)
  $po = $mo.MejorEspacioTrabajo($Obs[1], $Obs[0], 10, 1.0, [ref]$why2)
  "{0} m: bloqueadas {1:P1} | muestreo: {2} | observacion: {3}" -f $k, (@(0..($mo.NR * $mo.NC - 1) | Where-Object { $mo.Blocked($_) }).Count / ($mo.NR * $mo.NC)), $why1, $why2
  $prevL = $null; $nextL = $null; $prevO = $null
  $tL = $mo.TiempoDesde($s, [ref]$prevL); $tHL = $mo.TiempoHacia($s, [ref]$nextL); $tO = $mo.TiempoDesde($po, [ref]$prevO)
  $leg = { param($name, $path, $t) $j = $mo.Stats($path, $name, '') | ConvertFrom-Json; $j }
  $runs = @(
    ($mo.Stats($mo.StraightLine($s, $pm), 'recta_landing_muestreo', '') | ConvertFrom-Json),
    ($mo.Stats([RutaMotorV2]::Camino($prevL, $po), 'landing_observacion', '') | ConvertFrom-Json),
    ($mo.Stats([RutaMotorV2]::Camino($prevL, $pm), 'landing_muestreo', '') | ConvertFrom-Json),
    ($mo.Stats([RutaMotorV2]::Camino($prevO, $pm), 'observacion_muestreo', '') | ConvertFrom-Json),
    ($mo.Stats([RutaMotorV2]::CaminoHacia($nextL, $pm), 'muestreo_landing', '') | ConvertFrom-Json),
    ($mo.Stats([RutaMotorV2]::CaminoHacia($nextL, $po), 'observacion_landing', '') | ConvertFrom-Json)
  )
  foreach ($ru in $runs) { "{0,4} m  {1,-24} {2,7:F1} m {3,6:F1} min  +{4:F1}/-{5:F1} m  pend.max {6:F1}  dunas {7} m  rocas max {8:P0}" -f $k, $ru.nombre, $ru.dist_m, $ru.tiempo_min, $ru.subida_m, $ru.bajada_m, $ru.pendiente_max_deg, $ru.metros_en_dunas_grandes, $ru.rocas_max }
  $out.corridas += $runs
  if ($k -eq 2) {
    $out.paradas = [ordered]@{
      puntos = [ordered]@{
        muestreo = [ordered]@{ ok = ($pm -ge 0); lon = $mo.Lon($pm % $mo.NC); lat = $mo.Lat([math]::Floor($pm / $mo.NC)); objetivo = 'Robine (sol 298), sitio 9/0'; criterio = $why1 }
        observacion = [ordered]@{ ok = ($po -ge 0); lon = $mo.Lon($po % $mo.NC); lat = $mo.Lat([math]::Floor($po / $mo.NC)); objetivo = 'Malay (sol 337), sitio 9/276'; criterio = $why2 } }
      tramos = [ordered]@{}
    }
    foreach ($ru in $runs | Where-Object { $_.nombre -notmatch '^recta' }) { $out.paradas.tramos[$ru.nombre] = [ordered]@{ tiempo_min = $ru.tiempo_min; dist_m = $ru.dist_m } }
    # Capa de costo (2 m) para la web: verde = facil, rojo = costoso, negro = bloqueado
    $bmp = New-Object System.Drawing.Bitmap $mo.NC, $mo.NR
    for ($yy = 0; $yy -lt $mo.NR; $yy++) { for ($c = 0; $c -lt $mo.NC; $c++) { $i = $yy * $mo.NC + $c
      if ($mo.Blocked($i)) { $col = [System.Drawing.Color]::FromArgb(200, 20, 20, 20) }
      else { $mu = [math]::Min(1, ($mo.Mult($i) - 1) / 3); $col = [System.Drawing.Color]::FromArgb([int](40 + 110 * $mu), [int](60 + 190 * $mu), [int](200 - 120 * $mu), 40) }
      $bmp.SetPixel($c, $yy, $col) } }
    $bmp.Save((Join-Path $root 'web\data\costo_2m.png'), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  }
}
$out | ConvertTo-Json -Depth 7 -Compress | Out-File (Join-Path $data 'rutas_v2.json') -Encoding utf8
"var RUTAS_V2 = " + ($out | ConvertTo-Json -Depth 7 -Compress) + ";" | Out-File (Join-Path $root 'web\data\rutas_v2.js') -Encoding utf8
"listo"

