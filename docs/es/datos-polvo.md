# Polvo: qué datos entran, cuáles no, y cómo se comprobaron

Fecha de descarga: **15 de noviembre de 2026**. Los archivos crudos quedan en `data/raw/dust/` (no se versionan). Los productos pequeños están en `app/data/dust/`. El manifiesto con URL, DOI, licencia, hash y pasos es `app/data/dust/catalog.json`. El script que los genera es `tools/dust/build_dust_products.py`.

Nada de lo que se dibuja está inventado. Si un sol o una celda no tiene observaciones, el producto lleva un hueco (código 255 en la frecuencia, o ausencia del sol en la tabla), no un cero rellenado.

## 1. Profundidad óptica de columna — Montabone et al. (se usa)

- Página: <https://www-mars.lmd.jussieu.fr/mars/dust_climatology/>
- Artículos: Montabone et al. 2015, *Icarus* 251, 65–95, <https://doi.org/10.1016/j.icarus.2014.12.034>; Montabone et al. 2020, *JGR Planets*, <https://doi.org/10.1029/2019JE006111>
- Archivos: mapas krigeados diarios `dustscenario_MY24` … `MY36`, NetCDF-3, 3° × 3°, variable `cdod610` (absorción a 9,3 μm normalizada a 610 Pa). Se descargan sin cuenta.
- Licencia: el atributo global `copyright` de cada NetCDF dice **CC BY-SA 3.0** (<https://creativecommons.org/licenses/by-sa/3.0/>). Se puede copiar y modificar si se cita, se dicen los cambios y la obra derivada queda en la misma licencia. Los NetCDF originales no se suben. Los `.u8.gz` son la obra derivada.
- Cambios: media en 12 intervalos de Ls de 30°. El mapa típico excluye MY25, MY28 y MY34 (tormentas que rodearon el planeta). Cada celda se guarda como entero de 0 a 255 con escala 0,01; por encima de 2,55 se recorta y el catálogo cuenta cuántas celdas se recortaron. El factor ×2,6 a «equivalente visible» es el de la sección 2.3.4 de Montabone et al. 2015 y solo se muestra como lectura secundaria, no como si fuera la variable publicada.

Comprobaciones que el script exige antes de escribir:

- En el mapa típico, la media global de Ls 60–90° (afelio) queda entre 0,05 y 0,15, y Ls 240–270° (perihelio) es más alta. Eso es el contraste estacional de fondo, no el τ ~0,5 del rover: el 0,5 es extinción visible local, y aquí la magnitud publicada es absorción infrarroja a 610 Pa.
- MY25, Ls 180–240°: media 0,72 y máximo 8,3.
- MY34 (tormenta global de 2018), Ls 180–240°: media 0,57 y máximo 9,0. La media diaria de todo el planeta llega a 0,95, por encima de cualquier año sin tormenta global. El núcleo pasa de 2; la media del planeta no tiene por qué pasar de 1.
- MY28, Ls 240–300° (la tormenta de 2007 cae más tarde que la de 2018): media 0,40 y máximo 2,5.

En MY36, la celda de Jezero en Ls 140–170° da un equivalente visible (×2,6 sobre la columna local) del orden de 0,45, parecido a la mediana de Mastcam-Z en esa época. En el afelio el orbital queda más bajo que el rover (~0,25 frente a ~0,45). No se reescala el mapa para forzar el acuerdo: son instrumentos y definiciones distintas.

## 2. Dónde ocurren las tormentas — MDAD v1.1 (se usa)

- Registro: <https://zenodo.org/records/7480334>, DOI [10.5281/zenodo.7480334](https://doi.org/10.5281/zenodo.7480334)
- Artículo: Battalio y Wang, 2021, *Icarus* 354, 114059, <https://doi.org/10.1016/j.icarus.2020.114059>
- Licencia confirmada en la API de Zenodo el día de la descarga: **CC BY 4.0**. Los md5 de los cinco `tar.gz` coinciden con los publicados.
- Formato: máscara uint8, 0,1°, dimensión `(sol, longitud, latitud)`. 0 = sin tormenta, 1–250 = miembro de tormenta, 255 = pixel sin dato. Ls medio en `timeList[:, 6]`. Cobertura MY28–MY32, y no todos los soles de cada año (MY28 empieza en Ls ~133°).
- Cambios: en cada celda de 2° y cada intervalo de Ls, porcentaje de soles con algún pixel de tormenta, contando solo los soles en los que al menos la mitad de los pixels de 0,1° estaban observados. Si no hay ningún sol observado, el valor es 255, no 0 %.

Comprobación: la media en latitudes medias del sur durante Ls 210–300° es mayor que en los trópicos del norte durante Ls 120–180°. Es la estación de tormentas, no un mapa pintado para que se vea así.

## 3. τ en Jezero — Mastcam-Z (se usa para la alerta)

- Tabla: <https://data.mendeley.com/datasets/gktjp9jptb/2>, DOI [10.17632/gktjp9jptb.2](https://doi.org/10.17632/gktjp9jptb.2), versión 2, Mark Lemmon. SHA-256 del archivo `m20-ztau-merged-1717.txt`: `00841f90df469a1839142898c372d360251e88e4412a3d43688fd8d3f43115cf`.
- Licencia confirmada en la API pública de Mendeley (`data_licence.short_name`): **CC BY 4.0**.
- El encabezado del archivo dice PRELIMINARY y la fecha de generación es el 27 de febrero de 2026. La interfaz lo dice.
- Artículo de la tormenta: Lemmon et al. 2022, *Geophys. Res. Lett.*, <https://doi.org/10.1029/2022GL100126>. El resumen habla de una profundidad óptica visible ~2. El cuerpo del artículo dice que las imágenes solares del sol 313 solo subieron un poco, y que RDS y TIRS vieron picos de ~1,7 (visible) y ~0,8 (infrarrojo). Esos picos del RDS no están en la tabla.
- Lo que sí está, columna `tau-I` (880 nm), mediana de las muestras válidas del sol:
  - fondo en soles 286–339 fuera de 313–317: mediana ~0,50 y ninguna mediana diaria llega a 1;
  - sol 313: no hay fila válida;
  - sol 314: 0,639; sol 315: 0,912; sol 316: 1,376; sol 317: 1,342 (tres muestras: 1,246, 1,342 y 1,413).
- Por eso el umbral del planificador es **1,0**: separa ese fondo de ese pico. Está en `config/model-parameters.json`. No es una regla de vuelo.

La alerta automática usa esa tabla. El escenario «días de tormenta» toma el máximo de las medianas diarias (1,376) y se enciende. El escenario típico y el peor toman la mediana de fondo y no se encienden. Un sol elegido usa la mediana de ese sol; si no hay dato, la alerta no se inventa. El checkbox sigue pudiendo forzarla o apagarla.

## 4. Fuentes que no se usan

| Fuente | Por qué no |
| --- | --- |
| Escenarios de polvo de la Mars Climate Database (`dust_clim.nc`, `dust_cold.nc`, `dust_warm.nc`, <https://www-mars.lmd.jussieu.fr/mars/dust_scenarios/>) | Son sintéticos: el caso frío es el mínimo bajado un 50 % y el cálido el máximo subido un 50 %. La base completa pide no transmitirla, ni en parte ni entera, a terceros (<https://www-mars.lmd.jussieu.fr/MCD_pro/mcd_pro.html>). El mapa típico de esta app es la media de los mapas krigeados observados, no ese archivo. |
| Opacidad derivada de MEDA | Los CSV derivados que ya usa el proyecto (TIRS, viento, presión, humedad) no traen τ. Sacar τ del RDS exige un modelo de transferencia radiativa; no se ha hecho aquí. El pico ~1,7 del artículo se cita y no se escribe como si fuera una medición nuestra. |

## 5. Resolución

La profundidad óptica orbital es una celda de 3° (unos 180 km en el ecuador). La frecuencia es una celda de 2° (unos 120 km), agregada desde máscaras de 0,1° (unos 6 km). Jezero cabe entero en una celda. El color del cráter es el de esa celda. No dice qué ruta, dentro del cráter, tiene más polvo.
