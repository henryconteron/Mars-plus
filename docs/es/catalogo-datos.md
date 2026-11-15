# Catálogo de datos NASA — trayecto Octavia E. Butler Landing ↔ Issole

Actualizado: 14-nov-2026 · Trayecto: 18.4446 °N 77.4509 °E → 18.43266 °N 77.44137 °E (886 m, rumbo 217°)
Estado: ✅ descargado · 🔗 enlace verificado (listo para descargar) · ⚠️ existe pero falta ubicarlo o tiene límites

---

## A. Moverse: óptica, topografía y térmica
*Para detectar obstáculos, pendientes y tipos de terreno, y estimar el esfuerzo de cruzarlos.*

| Dato | Fuente | Resolución | Cobertura del trayecto | Uso en la decisión | Estado |
|---|---|---|---|---|---|
| **Ortoimagen HiRISE** | Mars Trek WMTS, capa `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd` (NASA/JPL) · también en USGS (Mars 2020 TRN) | 25 cm/px | Completa | Ver rocas >~0,5 m, dunas y ondulaciones; revisar a mano los tramos críticos | ✅ en línea (teselas) |
| **Ortoimagen CTX** | Mars Trek, `JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0` | 6 m/px | Completa | Contexto regional, vista alejada | ✅ en línea |
| **DTM HiRISE** | USGS Astrogeology, `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif` | 1 m/px | Completa | Pendiente en el sentido de marcha, desnivel, rugosidad → costo de la ruta | ✅ recorte en `data/dtm_1m_float32.bin` |
| **Inercia térmica THEMIS de Jezero** | Zenodo 4931348 (Edwards & Buz, NAU), `Jezero_Thermal_Inertia_v1.tiff` · unidades J m⁻² K⁻¹ s⁻½, 0 = sin dato | 100 m/px | Completa (~9 × 7 píxeles) | Valor bajo = polvo y arena fina (más esfuerzo); valor alto = roca firme. Es contexto, no se convierte directo en velocidad | ✅ `data/termica/` |
| **THEMIS IR día/noche** | Mars Trek, `THEMIS_DayIR/NightIR_ControlledMosaics_100m_v2_oct2018` | 100 m/px | Completa | Capa visual de contraste térmico | ✅ en línea |
| **Mapa geológico de Jezero y Nili Planum** | USGS SIM 3464 (Sun & Stack 2020), escala 1:75.000, base de datos GIS de 349 MB (proyección MTM) | 1:75.000 | Completa | Polígonos de unidades: llanura de Máaz vs. Séítah, zonas eólicas | 🔗 pubs.usgs.gov/sim/3464 |
| **Mapa fotogeológico del sitio del rover** | Stack et al. 2020, *Space Sci. Rev.* (equipo Mars 2020), mapeo sobre HiRISE 25 cm | ~1:5.000 | Completa | Unidades más detalladas que SIM 3464 | ⚠️ falta ubicar los archivos GIS (catálogo USGS Astropedia) |
| **Abundancia de rocas** | No se encontró un producto público específico de Jezero | — | — | Hoy se reemplaza con la revisión de la ortoimagen de 25 cm | ⚠️ falta |
| **Clasificación de terreno NOAH-H** | Estudio con IA sobre HiRISE ESP_042315_1985 | 25 cm/px | Por confirmar | Arena, ondulaciones, roca fracturada | ⚠️ falta confirmar descarga |
| **Terreno observado en superficie** | Bell et al. 2022, *Sci. Adv.* (Mastcam-Z) | Puntual | Landing y alrededores | "Pavers" <30 cm; a >100 m bloques y crestas de 1–3 m; ondulaciones ≤20 cm | ✅ en el informe |

---

## B. Hacer ciencia: espectral, geofísica y química
*Para elegir dónde detenerse, qué observar y qué muestra tomar.*

| Dato | Fuente | Resolución | Cobertura | Uso en la decisión | Estado |
|---|---|---|---|---|---|
| **Muestras Robine y Malay (Issole)** | Catálogo de muestras NASA; Herd et al. 2025 | Puntual | Issole | Cumulado de olivino + carbonatos y sulfatos hidratados = indicios de agua. Es la referencia de "qué muestrear" | ✅ en el informe |
| **Abrasión en Issole ("Quartier")** | Campaña del fondo del cráter (Sun et al. 2023, JGR, doi:10.1029/2022JE007613, §4.8). NASA reporta que SHERLOC detectó en Quartier señales compatibles con moléculas orgánicas | Parche de ~5 cm | Issole | Qué minerales y señales buscar en la parada | ⚠️ confirmar el sol y el nombre exacto con el Analyst's Notebook |
| **PIXL (química elemental)** | PDS Geosciences: pds-geosciences.wustl.edu/missions/mars2020/pixl.htm | Mapas submilimétricos del parche | Issole | Composición de la roca → qué documentar o muestrear | 🔗 verificado |
| **SHERLOC (espectros Raman/fluorescencia)** | PDS Geosciences: .../mars2020/sherloc.htm | Parche | Issole | Minerales (carbonatos, sulfatos) y posibles orgánicos | 🔗 verificado |
| **SuperCam (LIBS, Raman, VISIR a distancia)** | PDS Geosciences: .../mars2020/supercam.htm | Puntos a metros de distancia | Alrededor de Issole | Química de blancos cercanos sin abrasión | 🔗 verificado |
| **RIMFAX (radar del subsuelo)** | PDS Geosciences: .../mars2020/rimfax.htm | cm de resolución vertical, a lo largo del recorrido | **Solo donde manejó el rover**, no la línea recta | Capas bajo Séítah e Issole (contexto estratigráfico) | 🔗 verificado |
| **Analyst's Notebook Mars 2020** | an.rsl.wustl.edu/m20 | — | Todo | Buscador por sol, lugar e instrumento: la puerta para encontrar los datos de Issole (sols 286–340) | 🔗 verificado |
| **CRISM (minerales desde órbita)** | Brown et al. 2020; mapa de mineralogía Zenodo 5575824 | ~18 m/px | Parcial | Olivino y carbonatos a escala regional | ⚠️ cobertura por confirmar |
| **Fotos del rover en Issole** | Panorámicas MMGIS (sols 286, 328, 333 y 335) y fotos en bruto de Mastcam-Z/Navcam | — | Issole | "Lo que verás al llegar" | ⚠️ el enlace directo dio 403 |

---

## C. Decidir cuándo: meteorología y radiación
*Para decidir cuándo salir, cuánto tiempo permanecer afuera y cuándo acortar, regresar o posponer.*

| Dato | Fuente | Resolución | Cobertura | Uso en la decisión | Estado |
|---|---|---|---|---|---|
| **MEDA: temperatura y viento** | PDS Atmospheres (DOI 10.17189/1522849), carpeta `data_derived_env/sol_XXXX/` (archivos TIRS, WS, PS = presión, RHS = humedad) | ~1 s, por sol | Issole: sols 286–340 · Landing: sols 0–13 | Ventana de salida por hora | ✅ sol 286 · 🔗 resto verificado |
| **🌪️ Tormenta de polvo regional (5–11 ene 2022, sols 313–317)** | Lemmon et al. 2022, GRL, doi:10.1029/2022GL100126. Tabla Mastcam-Z doi:10.17632/gktjp9jptb.2 | Por sol | **Ocurrió con el rover en Issole** | Mastcam-Z 880 nm: sin dato el sol 313; medianas diarias 0,64 / 0,91 / 1,38 / 1,34 en los soles 314–317. El artículo cita además un pico del RDS cercano a 1,7, que no está en esa tabla | 🔗 Tabla Mastcam-Z, CC BY 4.0 |
| **Opacidad del polvo** | Mastcam-Z (Bell et al. 2022) y radiómetro RDS de MEDA | Por sol | Jezero | Visibilidad y calor | ⚠️ RDS no está en los productos derivados: buscar en `data_calibrated_env` |
| **Radiación RAD (Curiosity)** | PDS PPI: pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/ | Por hora/sol | Cráter Gale (referencia) | Tasa de fondo ~0,64 mSv/día (rayos cósmicos galácticos) | 🔗 verificado |
| **⚡ Evento solar del 28-oct-2021** | GRL 2023 (doaj d63ad051…): **primer evento a nivel del suelo registrado en la Tierra, la Luna y Marte**; RAD lo detectó | Horas | Marte (Gale) y Séítah en esas fechas | Caso real para "regresar al refugio" | 🔗 artículo · ⚠️ dosis exacta: confirmar en el PDS de RAD |
| **Alertas de clima espacial DONKI** | api.nasa.gov/DONKI (SEP, CME, FLR) | Eventos | Heliosfera (medido sobre todo desde la Tierra) | Alerta: "evento en curso, evaluar posponer" | ✅ feb–dic 2021 · ⚠️ dic 2021–feb 2022 necesita tu API key |

---

## ✅ Descargado y procesado (14-nov-2026)

| Dato | Archivos | Resultado clave |
|---|---|---|
| **MEDA** (TIRS, WS, PS, RHS) · Landing sols 1–10 (con huecos: el PDS no tiene los sols 3, 5–8, 11–13) + Issole sols 286–339 | `data/meda/` (204 CSV, 666 MB) → `meda_horario_por_sol.csv`, `meda_dia_tipico_issole.csv`, `web/data/meda_tipico.js` | Día típico en Issole (49 sols sin tormenta): suelo sobre 0 °C solo entre ~10 y ~14 h; máximo de 11,4 °C a las 12 h; viento medio de 1–6 m/s, rachas de hasta 18,9 m/s a mediodía. **Durante la tormenta** (sols 313–317), el mediodía fue ~5 °C más frío y a las 9 h hubo ~9 °C menos |
| **RAD** (Curiosity, Gale), 22-oct a 7-nov-2021 | `data/rad/` (~1 GB) → `rad_dosis_oct2021.csv` (observaciones de ~16 min), `rad_dosis_diaria_oct2021.csv` | Fondo: **~10,9 µGy/h (~263 µGy/día)**, detector B de silicio. **28-oct-2021: pico de 28,4 µGy/h (2,6 veces el fondo)**; los días 28 y 29 subieron a ~384–393 µGy/día (+46%). El 30-oct ya había vuelto al fondo |
| **Mapa geológico SIM 3464** | `data/geologia/` (base de datos de 333 MB para QGIS/ArcGIS + hoja de 34,7 MB + folleto) | ⚠️ Según su propio readme, tiene **desplazamientos de 100–200 m** respecto al mosaico CTX de operaciones. Para un trayecto de 886 m hay que realinearlo o usarlo solo como referencia |
| **Inercia térmica THEMIS** | `data/termica/Jezero_Thermal_Inertia_v1.tiff` (890 × 890 px, 100 m, comprimido) | Cubre el trayecto |

Fallo menor: no se descargó el archivo de presión del sol 331.

## Prioridad de descarga sugerida
1. **MEDA de los sols 286–340** (Issole, con la tormenta) + **sols 1–13** (Landing). Cada sol pesa ~5–6 MB en TIRS + WS.
2. **RAD de Gale, oct-2021**, para cuantificar el escenario de tormenta solar.
3. **SIM 3464 (349 MB)**, para los polígonos geológicos (Máaz / Séítah).
4. **PIXL y SHERLOC de la abrasión de Issole**, ubicados por sol en el Analyst's Notebook.
5. RIMFAX del tramo del rover que llega a Issole.

## Fuentes
- Mars Trek WMTS: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars
- DTM y ortoimagen USGS (Mars 2020 TRN): https://astrogeology.usgs.gov/search/map/mars-sample-return-terrain-relative-navigation-hirise-dtm-mosaic
- Inercia térmica de Jezero (Zenodo): https://zenodo.org/record/4931348
- SIM 3464: https://pubs.usgs.gov/publication/sim3464
- Stack et al. 2020: https://link.springer.com/10.1007/s11214-020-00739-x
- Mapa de mineralogía Mars 2020 (Zenodo): https://zenodo.org/record/5575824
- PDS Geosciences Mars 2020 (PIXL, SHERLOC, SuperCam, RIMFAX): https://pds-geosciences.wustl.edu/missions/mars2020/
- Analyst's Notebook: https://an.rsl.wustl.edu/m20/AN/an3.aspx
- MEDA: https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html
- Tormenta de polvo en Jezero (Lemmon et al. 2022): https://hal-insu.archives-ouvertes.fr/insu-03874886
- Evento solar del 28-oct-2021 (GRL 2023): https://doaj.org/article/d63ad0511bc14badbf34a644e54a80ea
- RAD PDS: https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/
- Bell et al. 2022, Sci. Adv. 8, eabo4856 (copia local en Desktop/angiely/NASA)
