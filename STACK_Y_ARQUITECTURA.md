# MARS+ — Stack tecnológico y arquitectura (documento base de desarrollo)

> Este es el documento de referencia para programar el MVP. Si una decisión no aparece aquí, se sigue lo que dice [`docs/es/arquitectura-mvp.md`](docs/es/arquitectura-mvp.md). Las decisiones están en [`docs/es/adr/`](docs/es/adr/) y las fases, en [`FASES_DESARROLLO.md`](FASES_DESARROLLO.md).
> **Objetivo del MVP:** un sitio **publicado y funcional** que planifique una EVA entre Octavia E. Butler Landing e Issole (Jezero). Debe calcular rutas de menor esfuerzo, evaluar qué plan es viable según el terreno, el tiempo, el clima y la radiación, y **explicar por qué**.

---

## 1. Stack

| Capa | Tecnología | Versión | Dónde vive |
|---|---|---|---|
| Lenguaje | JavaScript ES2020, **módulos nativos**, tipos con JSDoc | — | `app/src/` |
| Mapa local | **Leaflet** (CDN cdnjs, versión fija + SRI) | 1.9.4 | `app/src/infrastructure/map/` |
| Teselas | **Mars Trek WMTS** (NASA/JPL): HiRISE 25 cm, CTX 6 m, THEMIS 100 m | — | `mars-trek-layers.js` |
| Globo 3D de entrada | **WebGL2 propio del equipo MARS+** (sin librerías; [ADR-011](docs/es/adr/011-globo-webgl2-del-equipo.md)) | — | `app/src/infrastructure/globe/` + `app/src/ui/views/` |
| Cálculo de rutas | Algoritmo A* propio en un **Web Worker** | — | `domain/routing/` + `infrastructure/routing/` |
| Gráficas | SVG propio | — | `app/src/ui/charts/` |
| Estilos | CSS con variables (paleta MARS+), tema oscuro | — | `app/styles/` |
| Idiomas | JSON ES/EN + `i18n.js` | — | `app/i18n/` |
| Pipeline de datos | **PowerShell 5.1 + C# (.NET 4.8)** | ya instalados | `pipeline/` |
| Parámetros del modelo | `config/model-parameters.json` (**fuente única**: la leen el pipeline y la app) | — | `config/` |
| Pruebas | Página propia de pruebas en el navegador (sin dependencias) | — | `tests/` |
| Servidor local | `tools/dev-server.ps1` (HttpListener) | — | `tools/` |
| Versiones | Git + GitHub | — | raíz |
| Publicación | **GitHub Pages** (workflow incluido) **o Netlify** (`netlify.toml` incluido). Se publica la carpeta `app/` | — | `.github/workflows/pages.yml`, `netlify.toml` |
| Demo | Google Slides (7 diapositivas, EN) | — | `demo/` |

**Fuera del stack, por decisión:** React/Vite/TypeScript (requieren Node y compilación), MapLibre (solo Web Mercator), backend o base de datos, asistente con IA, CRISM y la PDS API dentro de la app.

---

## 2. Arquitectura

### 2.1 Capas y regla de dependencias
```
ui/  ──▶  application/  ──▶  domain/  ◀──  infrastructure/
                 │                               ▲
                 └──── puertos (contratos) ──────┘
main.js = raíz de composición: crea los adaptadores y los conecta
```

| Capa | Hace | Puede importar | Prohibido |
|---|---|---|---|
| `domain/` | Reglas de la misión: costo del terreno, A*, estadísticas de ruta, tareas, filtros, clima, dosis, explicación | solo `domain/` | DOM, `window`, `fetch`, Leaflet, WebGL |
| `application/` | Casos de uso, estado observable, máquina de estados, puertos | `domain/` | DOM, Leaflet, WebGL |
| `infrastructure/` | Adaptadores: datos estáticos, Leaflet, Worker de rutas, teselas de Mars Trek, globo WebGL2 | `domain/`, `application/ports.js` | `ui/` |
| `ui/` | Vistas, paneles, gráficas, idioma | `application/`, `shared/` | `domain/`, `infrastructure/` |

### 2.2 Estados
`GLOBE` (globo de Marte) → vuelo guiado a Jezero → `LOCAL` (mapa + ruta oficial) → `ROUTE` (ruta A→B calculada).
- El estado vive en `store.view` (`'globe'` | `'local'`). El botón de la cabecera alterna entre los dos; el globo se pausa mientras no se ve.
- **Respaldo:** sin WebGL2, si el globo falla o con `?view=local`, la app arranca directamente en `LOCAL`.

### 2.3 Cadena de filtros (núcleo del dominio)
Planes **A** (foto + muestra), **C** (solo muestra) y **B** (solo documentación), probados en cada hora de salida y pasados por estos filtros en orden:
1. **Terreno:** hay ruta a cada parada y de vuelta.
2. **Ciencia:** la parada tiene espacio de trabajo seguro.
3. **Tiempo:** esclusa + viajes + trabajo + reserva ≤ límite.
4. **Clima:** alerta de polvo; suelo ≥ mínimo y viento ≤ máximo en cada hora afuera.
5. **Radiación:** alerta de evento solar; dosis = tasa × tiempo en superficie (caminata + tareas). La esclusa está dentro del hábitat y la reserva no se gasta en una EVA nominal, así que no cuentan como exposición. El filtro de clima sí cubre toda la ventana presupuestada, reserva incluida.

Un plan que falla un filtro se descarta con su **motivo estructurado** (código + valores), y la UI lo traduce. Ningún filtro compensa a otro.

---

## 3. Estructura de carpetas

```
martian-map/                       (repositorio: mars-plus)
├── STACK_Y_ARQUITECTURA.md        ← este documento
├── README.md                      ← EN, para jueces (incluye "AI assistance")
├── ATTRIBUTION.md                 ← créditos y licencias de datos y librerías
├── .gitignore · .env.example · netlify.toml
├── .github/workflows/pages.yml    ← publica app/ en GitHub Pages
├── config/
│   ├── model-parameters.json      ← parámetros con su fuente
│   └── site.jezero-issole.json    ← puntos, bbox, capas, radio de Marte
├── app/                           ← SE PUBLICA TAL CUAL
│   ├── index.html
│   ├── styles/  tokens.css · base.css · components.css · globe.css
│   ├── i18n/    es.json · en.json
│   ├── assets/  rover/ · globe/ (GENERADO por pipeline/04-export/export-globe-assets.ps1)
│   ├── data/sites/jezero-issole/  ← GENERADO por pipeline/04-export (no se edita a mano)
│   └── src/
│       ├── main.js
│       ├── domain/
│       │   ├── terrain/   grid.js · cost.js
│       │   ├── routing/   min-heap.js · astar.js · route-stats.js
│       │   ├── plans/     tasks.js · filters.js · evaluate.js
│       │   ├── weather/   window.js
│       │   ├── radiation/ dose.js
│       │   └── explain/   explain.js
│       ├── application/   ports.js · store.js · use-cases.js
│       ├── infrastructure/
│       │   ├── data/      static-site-repository.js
│       │   ├── routing/   route-core.js · route-worker.js · worker-route-solver.js (con respaldo sin Worker)
│       │   ├── map/       leaflet-map-view.js · mars-trek-layers.js
│       │   └── globe/     webgl-globe.js (renderizador del equipo: esfera trazada por rayos, cámara, vuelo)
│       ├── ui/
│       │   ├── i18n.js
│       │   ├── views/     globe-view.js (controles, capas, leyenda y botón "Planificar la EVA en Jezero")
│       │   ├── charts/    elevation-profile.js · weather-chart.js · dose-chart.js
│       │   └── panels/    common.js (textos de motivos y explicación) · mission-panel.js · route-panel.js
│       │                  plans-panel.js (veredicto + explicación + grilla) · conditions-panels.js (clima, radiación)
│       │                  info-panels.js (geología, supuestos, fuentes)
│       └── shared/        format.js · dom.js
├── pipeline/                      ← PowerShell 5.1 + C#, todo lee config/
│   ├── run-pipeline.ps1           ← orquestador: -Step download | process | export | all  [-IncludeRoverImages]
│   ├── common/config.ps1          ← config, rutas, logs, carga de C#, descargas idempotentes
│   ├── lib/                       ← TiffRange.cs (lectura parcial de GeoTIFF remotos) · Geology.cs · MedaHourly.cs
│   ├── 01-download/               ← download-terrain · download-meda · download-rad · download-references · download-rover-images
│   ├── 02-process/                ← process-geology · summarize-meda · extract-rad · build-traverse
│   ├── 03-model/RouteEngine.cs    ← motor oficial de rutas + ImageWriter
│   └── 04-export/                 ← export-web-data.ps1 (app/data + manifest; copia config/) · export-globe-assets.ps1 (app/assets/globe)
├── tests/   index.html · run.mjs · harness.js · fixtures.js · domain/scenarios/parity/validity/ui/globe/criteria/session/assets.test.js
├── tools/   dev-server.ps1
├── data/                          ← FUERA de git
│   ├── raw/                       ← descargas originales: dtm, ortho, meda, rad, geology, thermal, rover, globe (~1,7 GB)
│   └── interim/                   ← productos intermedios: geology, meda, rad, rover
├── docs/
│   ├── es/                        ← equipo: LEEME (índice), arquitectura, auditoría, informe, catálogo, adr/ (001–011)
│   │   └── historico/             ← documentos superados + prototipo v1 (web/, scripts/) como referencia
│   └── en/                        ← material para jueces
└── demo/
```

---

## 4. Contratos de datos (`app/data/sites/jezero-issole/`)

| Archivo | Contenido |
|---|---|
| `terrain-2m.json` | `rows`, `cols`, `res`, `originX`, `originY`, `marsRadius`, y la descripción de cada banda del binario (tipo, escala, desplazamiento) |
| `terrain-2m.bin` | Bandas por celda: elevación (Uint16, cm sobre el mínimo; 65535 = sin dato), pendiente (Uint8, °×4), rugosidad (Uint8, m×200), dunas grandes y pequeñas (Uint8, fracción×255), rocas (Uint8, fracción×255) |
| `routes.json` | Rutas oficiales (ida y vuelta, 1/2/5 m, con estadísticas) y ruta real del rover |
| `stops.json` | Paradas de observación y muestreo, con su criterio |
| `geology.geojson` | Unidades de Stack et al. 2020 recortadas |
| `weather-issole.json` | 24 h × escenario típico, peor y tormenta (MEDA, sols 286–339) |
| `radiation-oct2021.json` | Fondo, evento y serie (RAD, detector E) |
| `overlays/*.png` + `overlays.json` | Costo, pendiente y ortoimagen de respaldo (2 m), con sus límites geográficos |
| `manifest.json` | SHA-256, tamaño, fuente y licencia de cada archivo, y la versión de los parámetros |

**Regla:** la app **calcula el costo** a partir de las bandas crudas y de `model-parameters.json`, igual que el motor C#. Así un cambio de parámetros se refleja en los dos lados, y una prueba de paridad lo verifica.

**Globo (`app/assets/globe/`, generado desde `data/raw/globe/`):**

| Archivo | Contenido | Cuándo se descarga |
|---|---|---|
| `viking-mdim21-2048.jpg` · `viking-mdim21-full.jpg` | Mosaico Viking MDIM 2.1 (2048 px y 4096 px) | El rápido al abrir; el completo después, en segundo plano |
| `mola-megdr-8ppd.i16.gz` | Elevación MOLA MEGDR, Int16 en metros, 2880 × 1440 | Al elegir la capa de elevación |
| `geology-tanaka2014.u8.gz` | Índice de unidad (Uint8) del mapa de Tanaka et al. 2014, 4096 × 2048 | Al elegir la capa de geología |
| `sky-nasa-svs.jpg` | Fondo de estrellas (NASA SVS / ESA Gaia) | Al abrir |
| `mars-plus-logo-ai.png` | Logo MARS+ **generado con IA**, con la marca visible "AI-generated image" | Al abrir |
| `globe.json` | Tamaños, fuentes y créditos de cada capa; 44 unidades geológicas con color y nombre EN/ES | Al abrir |

---

## 5. Convenciones

- **Código, carpetas e identificadores en inglés.** Documentación del equipo en español; la de los jueces, en inglés.
- **Módulos ES** con `import`/`export`, sin variables globales. Funciones puras en `domain/`.
- **Textos visibles solo desde `i18n/*.json`**, nunca escritos directamente en el código de la UI.
- **Cada número que se muestra lleva su fuente o supuesto** en el panel de supuestos.
- **Encabezado en cada archivo** generado con asistencia de IA: `// AI-assisted (Claude). Reviewed by the MARS+ team.` (requisito de Space Apps).
- **Commits** pequeños en `main`: `feat:`, `fix:`, `data:`, `test:`, `docs:`. Etiquetas `v0.1-preliminar` y `v1.0-envio`.
- **PowerShell:** `Set-StrictMode -Version Latest` y nombres que no choquen entre mayúsculas y minúsculas (lección de la auditoría).

---

## 6. Cómo se trabaja

```powershell
# Desde la raíz del repositorio (martian-map\)
# 1a. Regenerar los datos de la app tras cambiar config/ (usa data/ ya descargado)
powershell -ExecutionPolicy Bypass -File pipeline\run-pipeline.ps1 -Step export
# 1b. Desde cero en otra computadora: descarga (~1,7 GB, omite lo existente) + proceso + export
powershell -ExecutionPolicy Bypass -File pipeline\run-pipeline.ps1 -Step all

# 2. Servidor local (sirve app/ y tests/)
powershell -ExecutionPolicy Bypass -File tools\dev-server.ps1
#    App:     http://localhost:8770/app/
#    Pruebas: http://localhost:8770/tests/

# 3. Publicar: commit + push a main → GitHub Pages se actualiza solo (~1 min)
```

> **Caché después de publicar:** GitHub Pages deja que el navegador guarde los archivos hasta 10 minutos. Para ver la versión nueva de inmediato, recarga con **Ctrl+F5**. Quien visita por primera vez, como un juez, siempre recibe la versión nueva.

**Puerta de calidad antes de cada publicación:**
1. Todas las pruebas en verde, incluida la paridad JS↔C# (<1%).
2. La consola de `/app/` sin errores.
3. Con el idioma en EN no queda ningún texto en español.
4. Prueba de humo en la URL pública: ventana privada, otro navegador y el móvil.

**Presupuestos:** carga inicial <3 MB sin contar teselas (la textura completa del globo, 2,6 MB, llega después y en segundo plano); ruta A→B <0,5 s; la interfaz nunca se bloquea.

**Seguridad:** ningún secreto en `app/`. La clave de la NASA solo vive en `.env` y la usa el pipeline.

---

## 7. Definición de "terminado" del MVP
- [ ] URL pública HTTPS sin login que carga en <5 s.
- [ ] Mapa con HiRISE, capas de costo, pendiente y geología, ruta oficial, ruta del rover y paradas.
- [ ] Ruta A→B dentro de la zona del piloto, con estadísticas y perfil.
- [ ] Panel de planes con escenarios (típico, peor, tormenta, evento solar), límite, ritmo y tareas, más la explicación del resultado.
- [ ] Clima y radiación con sus gráficas y fuentes.
- [ ] Panel de supuestos y límites.
- [ ] ES/EN completo.
- [ ] Pruebas en verde.
- [ ] README en inglés con References y AI assistance.
