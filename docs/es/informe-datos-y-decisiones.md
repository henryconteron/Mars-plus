# Informe: recopilación de datos NASA y decisiones tomadas
**Proyecto:** Martian Map — piloto Octavia E. Butler Landing ↔ Issole (Jezero, Marte)
**Reto:** NASA Space Apps 2026, *Interplanetary Survival Guide: Martian Map*
**Fecha:** 14-nov-2026 · Trabajo autónomo de recopilación y descarga

---

## 1. Resumen ejecutivo
- Se revisaron los **5 recursos oficiales** del reto y se usan los 3 que aplican a Marte: Mars Trek, el programa de mapeo geológico USGS-NASA y la galería de imágenes en bruto de Perseverance. Worldview se descartó porque es de la Tierra, y el mapa de ruta de Curiosity se toma como referencia de diseño.
- Ya hay datos reales para **los tres grupos** (moverse, hacer ciencia, decidir cuándo) y para **8 tipos de datos**, muy por encima de los 3 que pide el reto.
- **Tres hallazgos cambian el proyecto:**
  1. **~61% de la ruta "óptima" actual cruza dunas grandes**, según el mapa geológico del equipo Mars 2020. El motor solo miraba la pendiente: hay que agregar la arena al mapa de costo.
  2. **El evento solar del 28-oct-2021 quedó medido en Marte:** la dosis subió de ~12 a **27,9 µGy/h** (×2,3) durante ~2 días. Es un caso real con números para el filtro de radiación.
  3. **La tormenta de polvo de los sols 313–317 ocurrió con el rover en Issole,** y tenemos el clima medido antes, durante y después.

---

## 2. ¿Estamos cumpliendo el reto?

| Lo que pide el reto | Estado | Evidencia o lo que falta |
|---|---|---|
| Mapa, herramienta o interfaz para un astronauta en una caminata, con datos NASA | ✅ | Página de planificación en el hábitat (piloto funcional) |
| Elegir objetivos científicos y lugar | ✅ | Alteración por agua en Issole (Séítah), muestras Robine y Malay |
| Lugar bien explorado por un rover | ✅ | Perseverance estuvo en Issole los sols 286–339 |
| **Al menos 3 tipos de datos en capas** | ✅ | Óptico, topográfico, térmico, geológico, atmosférico y radiación (6). Químico y espectral en camino (sección 4) |
| Seguridad primero; clima espacial y radiación | ✅ | Datos reales de RAD del evento del 28-oct-2021 y alertas solares |
| Movilidad con traje y carga; ruta que evite obstáculos | ✅ | **Implementado en el motor v2 (sección 7):** pendiente + arena (unidades de Stack 2020) + rocas detectadas por sombras en HiRISE 25 cm |
| Vista hiperlocal, que es lo que no ofrecen Mars Trek ni el mapeo USGS | ✅ | Cuadrícula de 2 m en ~1 km² |
| *Opcional:* formato (hábitat, tablet, HUD) | ✅ | Hábitat, justificado |
| *Opcional:* estático o interactivo | ✅ | Interactivo |
| *Opcional:* inspirarse en otros mapas de la NASA | ⚠️ | Falta tomar del mapa de Curiosity las regiones etiquetadas y una animación corta |
| *Opcional:* marco temporal | ✅ | Sols 286–339 + escenarios reales (tormenta y evento solar) |
| *Opcional:* fotos desde el suelo ("qué esperar al llegar") | 🔄 | Imágenes de Issole indexadas y en descarga desde la galería oficial |
| *Opcional:* rovers de apoyo o caminata en pareja | ❌ | No abordado. Sugerencia: plan en pareja (uno documenta y otro muestrea, lo que reduce el tiempo de trabajo) o rover que carga herramientas |

**Veredicto:** cumplimos lo obligatorio. Lo más débil es la **detección de obstáculos** (arena y rocas), que se resuelve con los datos ya descargados. Dos opciones del reto, la caminata en pareja y la inspiración en el mapa de Curiosity, son ganancias rápidas para el pitch.

---

## 3. Recursos oficiales del hackathon: cómo se usó cada uno

| Recurso oficial | Decisión | Por qué |
|---|---|---|
| **JPL Mars Trek** | ✅ Usado | Sus teselas WMTS de HiRISE 25 cm, CTX 6 m y THEMIS cubren todo el trayecto y se cargan directo en la web, sin descargar gigas |
| **USGS-NASA Planetary Geologic Mapping** | ✅ Usado con criterio | Se eligió el mapa fotogeológico del equipo Mars 2020 (Stack et al. 2020, 1:5.000) en lugar del SIM 3464 (1:75.000). Ver decisión D3 |
| **Ruta propuesta de Curiosity (ejemplo)** | 📐 Referencia de diseño | Combina imagen base, ruta, regiones etiquetadas y un video corto. Se adopta la misma estructura para la presentación |
| **NASA Worldview** | ❌ No aplica | Son imágenes satelitales de la **Tierra**: no aportan datos de Marte |
| **Galería de imágenes en bruto de Perseverance** | ✅ Usado | Se usó su API JSON para indexar todas las imágenes de los sols 286–339 en Issole y bajar una selección |

---

## 4. Decisiones de descarga (qué, por qué y qué se descartó)

### D1 · Relieve: leer solo el recorte, no el archivo completo
- **Qué:** DTM HiRISE de 1 m (USGS), recorte de 920 × 979 m.
- **Por qué:** el archivo completo pesa 1,75 GB y el trayecto usa ~3,6 MB. El servidor acepta lecturas parciales y el TIFF no está comprimido, así que se leyeron solo las filas necesarias.
- **Resultado:** `data/dtm_1m_float32.bin`, 900.680 celdas sin huecos.

### D2 · Térmica: el mosaico específico de Jezero
- **Qué:** inercia térmica THEMIS de Jezero (Zenodo 4931348, NAU), 100 m/px, 1,7 MB.
- **Por qué:** es un producto hecho para Jezero, más útil que los mosaicos globales. Cubre el trayecto en ~9 × 7 píxeles.
- **Cómo se usará:** como **contexto por zona** (arena fina vs. roca). No se convierte a 2 m, porque eso inventaría un detalle que el dato no tiene.

### D3 · Geología: mapa del equipo Mars 2020 en vez de SIM 3464
- **Qué:** shapefile del mapa fotogeológico de Stack et al. 2020 (*Space Sci. Rev.*), 3,3 MB → recortado a 37 polígonos.
- **Por qué se descartó SIM 3464:**
  - Su propia documentación advierte **desfases de 100–200 m**, porque se dibujó sobre un mosaico CTX semicontrolado. Eso es demasiado para un trayecto de 886 m.
  - Además pesa 349 MB y viene en una geodatabase que no se puede leer aquí.
- **Por qué Stack 2020:** está dibujado a escala 1:5.000 sobre **la misma ortoimagen HiRISE de 25 cm** y en **la misma proyección que nuestro DTM** (Mars 2000 equirectangular). Encaja sin desfase.
- **Resultado:** `data/geologia/geologia_trayecto.geojson` y `web/data/geologia.js`.

| Unidad mapeada | Interpretación |
|---|---|
| Crater floor fractured rough | Formación Máaz (llanura del aterrizaje) |
| Crater floor fractured 1 | Formación Séítah (cumulado de olivino) |
| Aeolian bedforms, large / small | Dunas y ondulaciones de arena |
| Undifferentiated smooth | Cobertura lisa de regolito |

**Hallazgo D3:** la ruta óptima actual pasa **61% sobre dunas grandes**, igual que la línea recta (67%). El modelo de pendiente no las distingue. **Decisión para la siguiente versión:** bloquear o penalizar con fuerza "Aeolian bedforms, large" en el mapa de costo.

**Observación a verificar:** según este mapa, el punto del rover en Issole cae en una unidad "Crater floor fractured rough" con ondulaciones pequeñas, en el borde con Séítah. Conviene revisarlo sobre la ortoimagen.

### D4 · Clima: todos los sols en Issole + aterrizaje, no un solo día
- **Qué:** MEDA derivado (temperatura de suelo TIRS, viento WS, presión PS, humedad RHS) de los sols **286–339 (Issole)** y **1–13 (aterrizaje)**, desde el PDS Atmospheres.
- **Por qué:** un solo día no permite hablar de "mejor hora". Con ~50 sols se calcula un **día típico** y un **peor caso**, y la tormenta de los sols 313–317 queda como escenario aparte.
- **Descartado:** los productos crudos y calibrados, porque los derivados ya traen las magnitudes físicas.
- **Pendiente:** la **opacidad del polvo** (radiómetro RDS) no está en los productos derivados.
- **Cobertura real:** 58 sols descargados (~550 MB): 53 en Issole (falta el 338, que no existe en el PDS) y 5 en el aterrizaje (1, 2, 4, 9 y 10; los demás sols tempranos no tienen productos derivados).
- **Resultado (`meda_dia_tipico_issole.csv`, 49 sols normales):**

| Hora (LTST) | Suelo típico | Suelo peor caso | Viento medio | Racha máx. |
|---|---|---|---|---|
| 08:00 | −32 °C | −51 °C | 1,6 m/s | 9 m/s |
| 09:00 | −13 °C | −33 °C | 2,5 | 11 |
| **10:00** | **+1 °C** | **−15 °C** | 3,7 | 17 |
| **12:00** | **+11 °C** | **+5 °C** | 4,7 | 19 |
| **14:00** | **+5 °C** | **−15 °C** | 5,3 | 18 |
| 15:00 | −5 °C | −16 °C | 6,2 | 17 |
| 16:00 | −19 °C | −30 °C | 6,1 | 17 |

- **Lectura para el filtro de clima:**
  - Con el criterio "suelo ≥ −20 °C y viento medio ≤ 8 m/s **incluso en el peor sol**", la ventana segura es **10:00–15:59**.
  - Un plan completo de ~155 min puede salir entre las **10:00 y las 13:00**.
  - Durante la tormenta (sols 313–317), el mediodía fue ~6 °C más frío y con más viento.
  - Las **rachas de 17–19 m/s al mediodía** son un dato nuevo para considerar, por ejemplo para el polvo en el visor o al manipular muestras.

### D5 · Radiación: RAD real del evento del 28-oct-2021 (y no solo DONKI)
- **Qué:** 12 días de RDR de RAD/Curiosity (22-oct al 2-nov-2021), extraídos a `data/rad/rad_dosis_oct2021.csv` (1.094 mediciones de dosis total en µGy/h).
- **Por qué:** DONKI mide desde la Tierra y solo sirve como alerta. RAD es **la única medición de radiación en la superficie de Marte**, y este evento fue el primero registrado a nivel del suelo en la Tierra, la Luna y Marte.
- **Resultado:**

| Fecha (2021) | Dosis media (detector E) | Máximo |
|---|---|---|
| 22–27 oct (fondo) | ~11,9 µGy/h (~286 µGy/día) | 12,9 |
| **28 oct** | **17,0 µGy/h** | **27,9** |
| **29 oct** | **16,8 µGy/h** | **26,8** |
| 30 oct – 3 nov | ~11,8 µGy/h | 12,9 |

- **Interpretación honesta:**
  - En superficie, este evento **duplicó la tasa durante ~2 días**. No fue catastrófico, porque la atmósfera marciana blinda parte de las partículas.
  - Una salida de 2,6 h ese día habría recibido ~44 µGy en lugar de ~31 µGy.
  - El valor del evento para la app es mostrar que **sí se detecta y se puede usar como regla de "posponer"**, no que la dosis sea letal.
  - Son µGy (dosis absorbida), no µSv (dosis equivalente).
- **Ubicación:** RAD está en el cráter Gale, a ~3.700 km de Jezero. Se usa como **referencia planetaria**, no como medición local.
- **Peso:** los RDR crudos ocupan ~790 MB. Se conservan para reproducir el cálculo; si hace falta espacio, el CSV extraído basta.

### D6 · Alertas DONKI: pendiente de la clave personal
- La clave pública `DEMO_KEY` quedó sin cupo y el servidor directo de CCMC no respondió desde esta red.
- **Decisión:** no bloquear el proyecto por esto. RAD (D5) cubre el caso marciano con datos reales. DONKI se completa cuando exista `martian-map/.env` con `NASA_API_KEY`.

### D7 · Imágenes de Issole: indexar todo, bajar una selección
- **Qué:** índice completo de las imágenes de los sols 286–339 desde la API de la galería oficial (recurso del hackathon), más una **selección por sol** a 800 px: Navcam y Mastcam-Z para el contexto, Hazcam frontal para la vista del astronauta, y WATSON y PIXL para el detalle de la abrasión.
- **Por qué:** el reto pide "qué esperar al llegar". Bajar todas las imágenes a resolución completa serían miles de archivos; el índice permite elegir después sin volver a buscar.
- **Pista científica:** en el sol 293 hay 188 imágenes WATSON, 60 ACI de SHERLOC y 8 de PIXL. Ahí ocurrió la **ciencia de proximidad sobre la abrasión de Issole**.
- **Resultado:**
  - **23.535 imágenes indexadas** en `indice_imagenes_sols_286_339.csv`.
  - **477 descargadas** (12 MB) en `data/imagenes_issole/`. Otras 10 fallaron y se pueden reintentar.
  - ~5.300 imágenes de cámaras de descenso (`EDL_*`) aparecen en estos sols porque se transmitieron entonces, pero **no muestran Issole**. Se excluyeron.
  - Los sols con más imágenes de proximidad (WATSON, PIXL, ACI) son el **339** (1.024), el **293** (256) y el **325** (192). Son los primeros que hay que revisar para ubicar el punto de muestreo y la abrasión.

### D8 · Química y espectros (PIXL, SHERLOC, SuperCam): enlaces listos, descarga diferida
- **Por qué diferida:** los productos del PDS son grandes y técnicos. Para el piloto alcanza con lo publicado: olivino + carbonatos + sulfatos hidratados (Herd et al. 2025), más la detección orgánica de SHERLOC en Quartier.
- **Siguiente paso:** con el sol 293 identificado (D7), ubicar en el Analyst's Notebook los productos exactos de esa abrasión.

### D9 · Descartados con razón
| Dato | Razón |
|---|---|
| SIM 3464 | Desfase de 100–200 m y formato geodatabase (ver D3) |
| CRISM | ~18 m/px: el trayecto entero son ~50 píxeles. No aporta a la escala de la caminata |
| RIMFAX | Solo existe bajo el camino del rover, no bajo nuestra ruta. Queda como contexto opcional |
| Abundancia de rocas | No existe un producto público específico de Jezero. Se reemplaza con HiRISE 25 cm + unidades de Stack 2020 |
| NASA Worldview | Datos de la Tierra |

---

## 5. Inventario final en `martian-map/data/`

| Carpeta o archivo | Grupo | Contenido |
|---|---|---|
| `dtm_1m_float32.bin` + `dtm_1m_meta.json` | Moverse | Relieve 1 m (USGS) |
| `termica/Jezero_Thermal_Inertia_v1.tiff` | Moverse | Inercia térmica 100 m |
| `geologia/geologia_trayecto.geojson` | Moverse / Ciencia | 37 unidades geológicas (Stack 2020) |
| `geologia/11214_2020_739_MOESM2_ESM.tif` | Moverse | Mapa geológico ráster completo |
| `rutas.json` | Moverse | Rutas a 1, 2 y 5 m |
| `meda/` | Decidir cuándo | CSV por sol + `meda_horario_por_sol.csv` + `meda_dia_tipico_issole.csv` |
| `rad/rad_dosis_oct2021.csv` | Decidir cuándo | Dosis RAD 22-oct a 2-nov-2021 |
| `imagenes_issole/` | Ciencia | Índice completo + selección de imágenes |
| `trayecto_landing_issole.geojson` | Todos | Puntos, rutas y recorrido del rover |

---

## 6. Próximos pasos
1. ✅ **Mapa de costo v2** con arena y rocas (D10, D11).
2. ✅ **Paradas de observación y muestreo** en Issole (D12).
3. ✅ **Cadena de filtros** de clima, radiación y tiempo, probada con 6 escenarios (D13).
4. ⏭️ Fuera del alcance por decisión del equipo: caminata en pareja y formato inspirado en el mapa de Curiosity.
5. ⏳ **Clave de api.nasa.gov** para completar DONKI.
6. ⏳ **Integrar el motor v2 y los filtros en la página** (mejora de la web).
7. ⏳ Revisar las fotos de proximidad (sols 339, 293 y 325) para confirmar el punto de muestreo.

## 7. Implementación de los próximos pasos (motor v2 y cadena de filtros)

### D10 · Rocas: ortoimagen original de 25 cm, no las teselas de Mars Trek
- **Problema:** las teselas de Mars Trek en el nivel máximo se ven suavizadas, porque están remuestreadas, y en ellas no se distinguen rocas.
- **Decisión:** leer de USGS el recorte de la ortoimagen HiRISE original de 25 cm (BigTIFF de 7 GB sin compresión) con peticiones parciales en paralelo. Son 3.680 × 3.916 píxeles (14 MB) con **el mismo origen que el DTM**.
- **Método:** detección por sombras, el mismo principio de los conteos de rocas de Golombek. Un píxel es "sombra" si es <65% de la media local de ~5 m; se calcula la fracción de sombra por celda de 1 m.
  - Más del 12% de sombra → **obstáculo** (celda bloqueada).
  - Menos del 12% → +6% de tiempo por cada 1% de sombra.
  - Al agregar a 2 o 5 m **se conserva el máximo**, para que un obstáculo no "desaparezca" al promediar.
- **Resultado y límite honesto:** las rocas detectables son escasas (≤1% de celdas bloqueadas a 1 m). Rocas de menos de ~0,75 m ocupan ≤3 píxeles y siguen siendo invisibles desde órbita: esa revisión queda para las fotos del rover.

### D11 · Arena: penalización basada en evidencia
- **Unidades usadas:** "Aeolian bedforms, large" y "small" del mapa Stack 2020, rasterizadas a 1 m.
- **Penalización:** **el doble de tiempo** en dunas grandes y +30% en ondulaciones pequeñas. Se basa en que caminar sobre arena cuesta 2,1–2,7 veces la energía de suelo firme (Lejeune et al. 1998, *J. Exp. Biol.* 201:2071).
  - Una primera prueba con el triple de tiempo era excesiva y desviaba la vuelta 260 m.
- **Hallazgo:** las dunas grandes cubren ~58% de la zona y rodean Issole. **No hay ruta sin arena:** el motor minimiza la arena, pero no la elimina.

### Resultado del motor v2 (2 m; estable a 1 y 5 m)

| Tramo | Distancia | Tiempo | Dunas grandes | Pend. máx |
|---|---|---|---|---|
| Línea recta (referencia) | 922 m | 40,9 min | 619 m | 13,7°, y cruza una celda con 38% de rocas |
| **Ida: Landing → Issole** | 948 m | **36,1 min** | 526 m | 10,6° |
| **Vuelta: Issole → Landing** | 956 m | **37,9 min** | 523 m | 9,9° |

Comparado con el motor v1 (solo pendiente, ~22,5 min): **el tiempo real sube un ~60%** al contar la arena. Esto cambia qué planes caben.

### D12 · Paradas en Issole
- **Muestreo:** el mejor espacio de trabajo a ≤6 m de la posición del rover durante Robine (sol 298, sitio 9/0). Requisitos: plataforma de 1,5 m de radio, pendiente <10°, sin rocas ni dunas grandes.
  - Resultado: pendiente máxima 4,5°, a 1,9 m del objetivo.
- **Observación:** el mejor espacio a ≤10 m de la posición durante Malay (sol 337, sitio 9/276), la segunda cara del afloramiento.
  - Resultado: pendiente máxima 4,7°.
- **Nota:** las dos paradas quedan a ~3 m entre sí, porque el afloramiento muestreado es pequeño. Las posiciones son del centro del rover; el brazo trabaja ~2 m por delante.

### D13 · Cadena de filtros implementada (`web/js/motor_planes.js`)
Planes A (foto + muestra), C (solo muestra) y B (solo documentación) × horas de 6:00 a 17:00, pasados por los 5 filtros: terreno → ciencia → tiempo → clima → radiación. Se probó con 6 escenarios en `web/prueba_motor.html`:

| Escenario | Resultado del motor |
|---|---|
| Día típico, límite 180 min | **Plan C a las 9:00** (159 min, 31,5 µGy). El Plan A se descarta en el filtro 3 por **5 min** |
| Día típico, límite 210 min | **Plan A a las 9:00** (184 min, 36,5 µGy); 17 planes viables |
| Peor sol registrado, 210 min | Plan A a las 10:00. Las 9:00 caen en el filtro 4 (suelo a −33 °C) |
| Clima de los días de tormenta, sin alerta | Plan A a las 10:00: la temperatura y el viento por sí solos **no** detectan la tormenta |
| **Tormenta de polvo activa** | **Posponer** (filtro 4: visibilidad reducida) |
| **Evento solar activo** | **Posponer** (filtro 5: permanecer en el refugio) |

**Decisión D13b:** la tormenta se modela como **alerta explícita**. La prueba mostró que la temperatura y el viento de MEDA no bastan. La opacidad no está en esos productos derivados. La medición que usa el planificador es la de Mastcam-Z (pico 1,38 a 880 nm en los soles 316–317; umbral 1,0). El detalle y las fuentes están en `docs/es/datos-polvo.md`.

---

## Fuentes
- Lejeune et al. 1998, *Mechanics and energetics of human locomotion on sand*, J. Exp. Biol. 201:2071–2080
- Ortoimagen HiRISE 25 cm (USGS): https://planetarymaps.usgs.gov/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif
- Recursos del reto: https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources
- Mars Trek: https://trek.nasa.gov/mars/
- USGS-NASA Planetary Geologic Mapping: https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars
- Galería de imágenes en bruto de Perseverance: https://mars.nasa.gov/mars2020/multimedia/raw-images/
- Ruta de Curiosity: https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/
- Stack et al. 2020 (datos): https://authors.library.caltech.edu/records/a7qs5-xhq84 · doi:10.1007/s11214-020-00739-x
- SIM 3464: https://pubs.usgs.gov/publication/sim3464
- Inercia térmica de Jezero: https://zenodo.org/record/4931348
- DTM USGS: https://astrogeology.usgs.gov/search/map/mars-sample-return-terrain-relative-navigation-hirise-dtm-mosaic
- MEDA: https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html
- RAD: https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/
- Evento del 28-oct-2021 (GRL 2023): https://doaj.org/article/d63ad0511bc14badbf34a644e54a80ea
- Tormenta en Jezero (Lemmon et al. 2022): https://hal-insu.archives-ouvertes.fr/insu-03874886
