# MARS+ — Arquitectura y flujo de desarrollo del MVP

**Producto:** MARS+ · planificador de EVA para Marte (piloto: Octavia E. Butler Landing ↔ Issole, Jezero)
**Reto:** NASA Space Apps 2026 — *Interplanetary Survival Guide: Martian Map*
**Plazo:** domingo 15-nov-2026, 23:59 hora local · ~20 h de trabajo
**Basado en:** la auditoría del proyecto, la propuesta frontend de MARS+ (filtrada) y el stack aprobado

> **Actualización (14-nov):** donde este documento dice **Cesium**, ahora rige el globo WebGL2 propio del equipo. Ver [ADR-011](adr/011-globo-webgl2-del-equipo.md) y [`STACK_Y_ARQUITECTURA.md`](../../STACK_Y_ARQUITECTURA.md).

---

## 1. Principios

1. **Estático y sin compilación.** El producto es HTML/CSS/JS que cualquier hosting sirve tal cual. No hay servidor ni base de datos que se pueda caer durante la evaluación.
2. **La lógica no depende de la interfaz.** Las reglas de la misión (costo del terreno, rutas, filtros, dosis) son JavaScript puro, sin mapa ni DOM. Así se pueden probar solas.
3. **Una sola fuente de verdad para los parámetros del modelo.** El pipeline (C#) y la web (JS) leen el mismo `parametros_modelo.json`. Una prueba de paridad garantiza que los dos motores den el mismo resultado.
4. **Los datos pesados se calculan antes.** El navegador solo recibe productos derivados pequeños (~2 MB) con su manifiesto de procedencia.
5. **Publicar primero, mejorar después.** Nada opcional empieza antes de que exista un envío preliminar.
6. **Todo número visible tiene una fuente o un supuesto declarado** en la interfaz.

### 1.1 Requisito no negociable: el sitio debe funcionar y estar publicado
La presentación y la evaluación se hacen **sobre el enlace público**, nunca sobre `localhost`.

**"Funcional" significa que, desde el enlace público:**
1. Abre por HTTPS, sin login, en Chrome, Edge y Firefox de escritorio. En el móvil se ve y se puede leer.
2. Funciona el flujo completo: mapa local → ruta oficial Landing ↔ Issole → elegir A y B → planes y explicación → clima y radiación → cambio ES/EN (y el globo, si está incluido).
3. La consola no muestra errores y la vista inicial carga en menos de 5 s con una conexión normal.
4. No depende de nada local: ni servidor de PowerShell ni archivos fuera de `app/`.
5. Si Mars Trek falla, el mapa sigue siendo útil con una imagen base propia (`base-ortho-1m.png`) y nuestras capas.

**Cómo se garantiza:**
- **El hosting se configura en F0.** Se publica una página provisional desde la primera hora, así que la URL existe desde el principio y cada `push` la actualiza.
- **Primera versión publicada (`v0.1`) al terminar F3**, antes de cualquier tarea opcional.
- **Prueba de humo tras cada publicación:** ventana privada, otro navegador, el teléfono con datos móviles, y la consola sin errores.
- **Verificado el 14-nov:** las teselas de Mars Trek aceptan peticiones desde otros dominios (CORS), así que funcionan desde GitHub Pages en Leaflet y en Cesium.
- **Respaldo para la presentación:** capturas y una grabación corta del sitio publicado, por si falla la red del lugar.

---

## 2. Arquitectura

### 2.1 Vista general

```
                ┌──────────────────────── NAVEGADOR (app/) ────────────────────────┐
                │                                                                   │
 Usuario ──────▶│  UI (vistas y componentes, DOM, SVG, i18n, estilos MARS+)         │
                │        │ llama a                                                   │
                │        ▼                                                           │
                │  APLICACIÓN (casos de uso + estado/máquina de estados)             │
                │        │ usa                         │ usa puertos (interfaces)    │
                │        ▼                             ▼                             │
                │  DOMINIO (JS puro)            INFRAESTRUCTURA (adaptadores)        │
                │  terreno · rutas · planes     · repositorio de datos estáticos     │
                │  clima · radiación ·          · mapa Leaflet · globo Cesium        │
                │  explicación                  · Web Worker de rutas · Mars Trek    │
                │        ▲                             │ fetch                       │
                │        └── la infraestructura importa el dominio, nunca al revés   │
                └──────────────────────────────────────┼────────────────────────────┘
                                                       ▼
                     app/data/sites/jezero-issole/*.json · *.bin · *.png   (generado)
                                                       ▲
                ┌───────────────── PIPELINE (pipeline/, fuera del navegador) ───────┐
                │  01 descarga → 02 proceso → 03 modelo (C#) → 04 exportación       │
                │  PowerShell 5.1 + C# (.NET 4.8) · lee config/*.json · .env (clave)│
                └──────────────────────────────────────┬────────────────────────────┘
                                                       ▼
                        Fuentes NASA/USGS: HiRISE, Mars Trek, MEDA, RAD, Stack 2020…
```

### 2.2 Capas y regla de dependencias

| Capa | Responsabilidad | Puede importar | No puede importar |
|---|---|---|---|
| **domain/** | Reglas de la misión: costo del terreno, ruta de menor costo, cadena de filtros, dosis, ventana de clima, explicación estructurada | Solo `domain/` | DOM, Leaflet, Cesium, `fetch`, `window` |
| **application/** | Casos de uso (calcular ruta, evaluar planes, cargar sitio), estado y máquina de estados; define los **puertos** | `domain/` | DOM, Leaflet, Cesium |
| **infrastructure/** | Adaptadores concretos: datos estáticos (`fetch`), mapa Leaflet, globo Cesium, Web Worker, URLs de Mars Trek | `domain/`, `application/` (puertos) | `ui/` |
| **ui/** | Vistas, componentes, gráficas SVG, idioma | `application/` (casos de uso y estado) | `domain/` directamente, `infrastructure/` |
| **main.js** | **Raíz de composición:** crea los adaptadores, los conecta a los casos de uso y monta la UI | Todo | — |

**Regla de oro:** las flechas solo apuntan hacia el dominio. Si mañana cambiamos Leaflet por otra librería, solo cambia `infrastructure/map/`.

### 2.3 Estados de la aplicación (tomado de la propuesta MARS+)

```
 GLOBE ──(clic en Jezero)──▶ TRANSITION ──(fin del vuelo)──▶ LOCAL ──(A y B definidos)──▶ ROUTE
   ▲                                                          │  ▲                          │
   └────────────────────(botón "Ver Marte")───────────────────┘  └──(cambiar A/B o plan)────┘
```

- **GLOBE:** globo de Marte (Cesium). Solo **Jezero** es seleccionable, porque es el único sitio con datos del piloto.
- **TRANSITION:** vuelo de cámara; mientras tanto se cargan en segundo plano los datos del sitio.
- **LOCAL:** mapa Leaflet con capas, ruta oficial Landing ↔ Issole y paradas.
- **ROUTE:** la ruta A→B calculada en el navegador, más planes, explicación, clima y radiación.
- **Respaldo:** si Cesium no carga o se omite, la app arranca directamente en LOCAL con un vuelo animado 2D de Leaflet.

### 2.4 Flujo de un cálculo de ruta A→B

```
UI: SelectorPuntos ─▶ aplicación: calcularRuta(A,B) ─▶ puerto RouteSolver
   ─▶ infra: Web Worker (importa domain/routing/dijkstra.js + domain/terrain/cost.js)
   ─▶ devuelve {coordenadas, distancia, tiempo, desnivel, metros en dunas, pendiente máx}
   ─▶ aplicación: evaluarPlanes(paradas, clima, radiación, opciones) ─▶ domain/plans
   ─▶ estado actualizado ─▶ UI: capa de ruta + PanelRuta + PanelPlanes + PanelExplicacion
```

El cálculo corre en un **Web Worker**, así la interfaz no se congela. La meta es responder en menos de 0,5 s en la cuadrícula de 2 m (~225 mil celdas).

---

## 3. Estructura de carpetas

**Convención:** carpetas, archivos e identificadores del código en **inglés**, porque los jueces leen el repositorio y el README está en inglés. Documentación del equipo en **español**, dentro de `docs/es/`.

```
mars-plus/                                  ← raíz del repositorio (hoy: Desktop/martian-map)
├── README.md                               ← EN: qué es, cómo funciona, datos NASA, References, AI assistance
├── LICENSE                                 ← licencia del código (MIT)
├── ATTRIBUTION.md                          ← créditos y licencias de datos (HiRISE, Stack 2020, MEDA, RAD…)
├── .gitignore                              ← data/raw, data/interim, .env
├── .env.example                            ← NASA_API_KEY=  (plantilla, sin clave real)
│
├── config/                                 ← FUENTE ÚNICA DE VERDAD (la leen el pipeline y la app)
│   ├── site.jezero-issole.json             ← bbox, puntos, paradas objetivo, capas Trek, CRS, radio de Marte
│   └── model-parameters.json               ← Tobler, arena ×2, rocas, umbrales de clima, límites, cada uno con su fuente
│
├── app/                                    ← SITIO PUBLICABLE (GitHub Pages despliega esta carpeta)
│   ├── index.html                          ← carga estilos, librerías por CDN (versión fija + SRI) y src/main.js
│   ├── src/
│   │   ├── main.js                         ← raíz de composición
│   │   ├── domain/                         ← JS puro, sin DOM
│   │   │   ├── model/types.js              ← tipos JSDoc: Point, Route, Stop, Plan, Scenario, HourConditions
│   │   │   ├── terrain/cost.js             ← velocidad de Tobler, multiplicadores, celdas bloqueadas (= C# v2)
│   │   │   ├── terrain/grid.js             ← lectura de la cuadrícula, coordenadas ↔ celdas, vecinos
│   │   │   ├── routing/dijkstra.js         ← ruta de menor tiempo (montículo binario)
│   │   │   ├── routing/route-stats.js      ← distancia, desnivel, metros en dunas, pendiente máx
│   │   │   ├── plans/tasks.js              ← tareas (foto 25 min, muestra 50 min) y planes A/B/C
│   │   │   ├── plans/filters.js            ← los 5 filtros, cada uno una función pura
│   │   │   ├── plans/evaluate.js           ← cadena de filtros + orden de los planes viables
│   │   │   ├── weather/window.js           ← ventana de clima por hora y escenario
│   │   │   ├── radiation/dose.js           ← dosis = tasa × minutos en superficie (viaje + trabajo); la esclusa y la reserva no cuentan
│   │   │   └── explain/explain.js          ← explicación estructurada (claves + valores, sin texto fijo)
│   │   ├── application/
│   │   │   ├── ports.js                    ← contratos JSDoc: SiteRepository, RouteSolver, MapView, GlobeView
│   │   │   ├── store.js                    ← estado observable mínimo (suscribirse, actualizar)
│   │   │   ├── state-machine.js            ← GLOBE → TRANSITION → LOCAL → ROUTE
│   │   │   └── use-cases/
│   │   │       ├── load-site.js
│   │   │       ├── compute-route.js
│   │   │       ├── evaluate-plans.js
│   │   │       └── change-scenario.js
│   │   ├── infrastructure/
│   │   │   ├── data/static-site-repository.js  ← fetch de JSON/bin + verificación contra el manifiesto
│   │   │   ├── routing/route-worker.js         ← Web Worker (importa domain/routing)
│   │   │   ├── routing/worker-route-solver.js  ← implementa el puerto RouteSolver
│   │   │   ├── map/leaflet-map-view.js         ← implementa MapView (capas, clics A/B, ruta)
│   │   │   ├── map/mars-trek-layers.js         ← URLs WMTS de Mars Trek (HiRISE, CTX, THEMIS, Viking)
│   │   │   └── globe/cesium-globe-view.js      ← implementa GlobeView (Marte, vuelo a Jezero)
│   │   ├── ui/
│   │   │   ├── views/globe-view.js
│   │   │   ├── views/local-view.js
│   │   │   ├── components/
│   │   │   │   ├── layer-control.js
│   │   │   │   ├── point-selector.js
│   │   │   │   ├── route-panel.js
│   │   │   │   ├── plans-panel.js
│   │   │   │   ├── explanation-panel.js     ← "por qué este plan / por qué no" (sustituye al asistente con IA)
│   │   │   │   ├── weather-panel.js
│   │   │   │   ├── radiation-panel.js
│   │   │   │   ├── assumptions-panel.js     ← supuestos y límites con sus fuentes
│   │   │   │   └── stop-gallery.js          ← fotos del rover en las paradas
│   │   │   ├── charts/                      ← elevation-profile.js, weather-chart.js, dose-chart.js (SVG)
│   │   │   └── i18n/i18n.js
│   │   └── shared/                          ← utilidades sin dependencias (format.js, geo.js)
│   ├── i18n/es.json · en.json
│   ├── styles/
│   │   ├── tokens.css                       ← paleta MARS+, tipografía, espaciado, modo oscuro
│   │   ├── base.css
│   │   └── components.css
│   ├── assets/
│   │   ├── brand/mars-plus-logo.svg         ← sin elementos de marca NASA; marca de agua si es generado con IA
│   │   └── rover/                           ← 6–10 fotos seleccionadas (crédito NASA/JPL-Caltech)
│   └── data/sites/jezero-issole/            ← GENERADO por el pipeline (no se edita a mano)
│       ├── manifest.json                    ← versión, fecha, SHA-256 y fuente de cada archivo
│       ├── terrain-2m.json + terrain-2m.bin ← elevación, multiplicador y celdas bloqueadas en binario
│       ├── official-routes.geojson          ← Landing ↔ Issole a 1/2/5 m + ruta real del rover
│       ├── stops.json                       ← paradas con criterio y foto asociada
│       ├── geology.geojson                  ← unidades de Stack 2020 recortadas
│       ├── weather-issole.json              ← día típico, peor caso y tormenta (MEDA)
│       ├── radiation-oct2021.json           ← fondo y evento (RAD, detector E)
│       └── overlays/cost-2m.png · slope-2m.png
│
├── pipeline/                                ← PowerShell 5.1 + C#, fuera del navegador
│   ├── run-pipeline.ps1                     ← orquestador: -Step download|process|model|export|all
│   ├── common/                              ← Config.ps1 (lee config/ y .env), Log.ps1, StrictMode
│   ├── lib/                                 ← C# reutilizable: TiffRange.cs, Shapefile.cs, Raster.cs
│   ├── 01-download/                         ← dtm, ortho, meda, rad, geology, rover-images, donki
│   ├── 02-process/                          ← rocks-from-shadows, rasterize-geology, summarize-meda, extract-rad
│   ├── 03-model/                            ← RouteEngine.cs (motor oficial) + compute-official-routes.ps1
│   └── 04-export/                           ← export-web-data.ps1 (genera app/data + manifest)
│
├── data/                                    ← FUERA de git
│   ├── raw/                                 ← descargas originales (~2 GB: MEDA, RAD, ortho, DTM…)
│   └── interim/                             ← rasters intermedios (rocas, geología a 1 m)
│
├── tests/                                   ← se abren en el navegador con el servidor local
│   ├── index.html                           ← corre todo y muestra "N/N OK"
│   ├── harness.js                           ← mini-framework de asserts (sin dependencias)
│   ├── domain/cost.test.js · dijkstra.test.js · filters.test.js · dose.test.js
│   ├── scenarios/plans.scenarios.test.js    ← los 6 escenarios de la auditoría
│   └── parity/route-parity.test.js          ← ruta JS vs ruta oficial C# (diferencia de tiempo <1%)
│
├── tools/
│   └── dev-server.ps1                       ← servidor local (sirve la raíz: /app y /tests)
│
├── .github/workflows/pages.yml              ← publica app/ en GitHub Pages (sin compilación)
│
├── docs/
│   ├── en/                                  ← material para jueces: data-sources.md, model.md
│   └── es/                                  ← equipo: auditoría, informe de decisiones, catálogo
│       ├── adr/                             ← decisiones de arquitectura (una por archivo)
│       └── historico/                       ← documentos superados (investigación inicial, requisitos v1)
│
└── demo/
    ├── script.md                            ← guion de las 7 diapositivas (EN)
    └── screenshots/
```

### 3.1 Contratos de datos (`app/data/sites/jezero-issole/`)

| Archivo | Contenido | Formato | Peso aprox. |
|---|---|---|---|
| `terrain-2m.json` | `rows`, `cols`, `res`, `originX/Y`, `marsRadius`, `crs`, compensación de capas en el binario | JSON | 1 KB |
| `terrain-2m.bin` | Elevación (Uint16, cm sobre el mínimo) + multiplicador de costo (Uint16 ×1000) + bandera de bloqueo (Uint8) | binario | ~1,1 MB |
| `official-routes.geojson` | Rutas de ida y vuelta a 1/2/5 m, con sus estadísticas; ruta real del rover | GeoJSON | ~0,2 MB |
| `stops.json` | Parada de observación y de muestreo: coordenadas, criterio y foto | JSON | 2 KB |
| `geology.geojson` | 37 polígonos de Stack 2020 | GeoJSON | ~0,15 MB |
| `weather-issole.json` | 24 horas × (típico, peor, tormenta) | JSON | 5 KB |
| `radiation-oct2021.json` | Fondo, evento y serie | JSON | 30 KB |
| `base-ortho-1m.png` | Ortoimagen HiRISE reducida a 1 m/px: base de respaldo si Mars Trek no responde | PNG | ~0,6 MB |
| `manifest.json` | Para cada archivo: SHA-256, fecha, fuente, licencia y versión de parámetros | JSON | 2 KB |

**Total en el navegador: ~2 MB** (sin contar teselas ni librerías).

---

## 4. Tecnologías por parte del sistema

| Parte | Tecnología | Versión | Rol |
|---|---|---|---|
| Lenguaje de la app | JavaScript (ES2020, **módulos nativos**) + tipos JSDoc | — | Sin compilación; JSDoc da autocompletado y documentación |
| Mapa local | **Leaflet** (CDN, versión fija + SRI) | 1.9.4 | Proyección geográfica, compatible con las teselas de Mars Trek |
| Globo 3D | **CesiumJS** (CDN, versión fija + SRI) | fijada en la fase 6 | Marte como elipsoide propio, imágenes de Mars Trek, sin Cesium ion |
| Teselas | **Mars Trek WMTS** (NASA/JPL) | — | HiRISE 25 cm, CTX 6 m, THEMIS 100 m, Viking global (globo) |
| Cálculo en segundo plano | **Web Worker** (módulo) | — | Ruta A→B sin congelar la interfaz |
| Gráficas | SVG propio | — | Perfil, clima y dosis |
| Estilos | CSS con variables (`tokens.css`, paleta MARS+) | — | Tema oscuro, contraste AA |
| Idiomas | JSON ES/EN + `i18n.js` | — | Requisito de inglés |
| Pipeline | **PowerShell 5.1 + C# (.NET 4.8)** | ya instalados | Descarga, proceso, motor oficial y exportación |
| Configuración | JSON en `config/` + `.env` | — | Parámetros compartidos; la clave nunca va a la app |
| Pruebas | Página de pruebas propia (navegador) | — | Unitarias, escenarios y paridad JS↔C# |
| Servidor de desarrollo | `tools/dev-server.ps1` (HttpListener) | — | Sirve `/app` y `/tests` en localhost |
| Versiones | **Git para Windows** + GitHub | — | Commits pequeños en `main`, etiquetas por hito |
| Publicación | **GitHub Pages** vía Actions (`upload-pages-artifact`) | — | Publica `app/` sin compilación. Plan B: Netlify Drop |
| Demo | **Google Slides** (7 diapositivas, EN) | — | Enlace público de solo lectura |

### Paleta MARS+ y accesibilidad
| Token | Color | Uso permitido sobre fondo oscuro (#0f1115) |
|---|---|---|
| `--mars-terracotta` | #a2453e | Acentos, bordes, iconos, texto **grande** (contraste ~3:1; no pasa AA para texto normal) |
| `--mars-peach` | #e0a98b | Texto destacado y enlaces (contraste alto) |
| `--mars-golden` | #cc8e37 | Ruta de vuelta, avisos |
| `--mars-taupe` | #c2a198 | Texto secundario |
| `--mars-warm-gray` | #7d6d6d | Bordes y líneas de cuadrícula (no para texto) |

---

## 5. Flujo de desarrollo (fases)

**Ritmo de trabajo:** `main` siempre funciona; commits pequeños con mensajes `tipo: descripción` (`feat`, `fix`, `data`, `docs`, `test`); etiqueta `v0.1-preliminar` al publicar la primera versión y `v1.0-envio` al enviar. **Congelamiento de código: domingo 20:00.**

| Fase | Horas | Qué se hace | Tecnologías | Entregable / criterio de salida | Prioridad |
|---|---|---|---|---|---|
| **F0 · Preparación + hosting** | 1,5 | Instalar Git; crear el repositorio **público**; reorganizar carpetas según la sección 3; `.gitignore`, `.env.example`; limpiar duplicados; **activar GitHub Pages con el workflow y publicar una página provisional**; primeros ADR | Git, GitHub, GitHub Actions, PowerShell | Repositorio <50 MB; **URL pública respondiendo**; la otra sesión de Claude detenida | Must |
| **F1 · Pipeline consolidado** | 1,5 | `config/model-parameters.json` como fuente única; `run-pipeline.ps1`; `export-web-data.ps1` genera `app/data` + `manifest.json` | PowerShell 5.1, C# | `run-pipeline.ps1 -Step export` regenera todo sin errores | Must |
| **F2 · Dominio + pruebas** | 3 | Portar a JS el costo y Dijkstra; mover los filtros a `domain/plans`; pruebas unitarias, de escenarios y de paridad | JS (módulos), JSDoc, página de pruebas | `tests/` muestra todo OK; paridad de tiempo <1% frente a C# | Must |
| **F3 · Aplicación + UI local** | 5 | Puertos, estado y máquina de estados; adaptador Leaflet; selector A/B; paneles de ruta, planes, explicación, clima, radiación y supuestos; ES/EN; tokens MARS+ | Leaflet, Web Worker, SVG, CSS | Flujo LOCAL → ROUTE completo; sin errores en consola; ES/EN completos | Must |
| **F4 · Publicación v0.1 + envío preliminar** | 1,5 | Publicar la app completa (`v0.1`); prueba de humo (sección 1.1); README EN (+ References + *AI assistance*); ATTRIBUTION; **envío preliminar** del formulario con el enlace público | GitHub Pages | Los 5 criterios de "funcional" se cumplen en la URL pública; formulario guardado | Must |
| **F5 · Validez** | 2 | Fotos del rover en las paradas; confirmar las paradas (equipo de ciencia); panel de supuestos completo; sensibilidad de la arena si alcanza | JS, imágenes del rover | Cada supuesto visible con su fuente | Should |
| **F6 · Globo y transición** | 2 | Adaptador Cesium: Marte + Viking global + marcador de Jezero + vuelo → LOCAL. Si falla, vuelo 2D con Leaflet | CesiumJS | GLOBE → TRANSITION → LOCAL fluido, con respaldo funcionando | Could (después de F4) |
| **F7 · Demo** | 3 | Guion de 7 diapositivas (problema → solución → datos NASA → demo → validez → impacto → equipo), capturas, sin logos NASA | Google Slides | Enlace público a la presentación | Must |
| **F8 · Envío final** | 1 | Revisar y completar el formulario; probar enlaces; enviar **antes de las 21:00** | — | Proyecto enviado; etiqueta `v1.0-envio` | Must |
| **Total** | **20,5** | (18,5 h sin F6) | | | |

**Si falta tiempo, se recorta en este orden:** F6 → sensibilidad (F5) → fotos (F5). **Nunca** se recortan F4, F7 ni F8.

---

## 6. Calidad, seguridad y rendimiento

**Puertas de calidad (antes de cada `push`):**
1. `tests/` muestra todo OK, incluida la paridad JS↔C#.
2. La consola del navegador queda limpia en `/app`.
3. Cambiar a EN no deja textos en español.
4. Si cambió `model-parameters.json`, se regeneró `app/data` y el manifiesto.

**Presupuestos:**
- Carga inicial <3 MB, sin contar teselas.
- Ruta A→B <0,5 s.
- La interfaz nunca se bloquea: el cálculo va en el Worker.

**Seguridad:**
- Ningún secreto en `app/`. La clave de la NASA solo vive en `.env` y la usa el pipeline.
- Librerías por CDN con **versión fija y SRI** (`integrity`).
- Sin `eval` ni HTML inyectado desde los datos.

**Accesibilidad:**
- Contraste AA en el texto.
- Las leyendas no dependen solo del color: también usan patrón o etiqueta.
- Se puede navegar con teclado por los paneles.
- Las gráficas SVG tienen `title` y `desc`.

**Cumplimiento Space Apps:**
- README en inglés con *AI assistance*: qué hizo la IA (código, procesamiento) y qué decidió el equipo (la idea).
- Encabezado "AI-assisted" en los archivos generados con IA.
- Sin marca NASA en el contenido generado.
- References completas.

---

## 7. Decisiones de arquitectura (ADR iniciales para `docs/es/adr/`)

| ADR | Decisión | Alternativa descartada |
|---|---|---|
| 001 | Sitio estático, sin compilación, módulos JS nativos | React/Vite (requiere Node y compilación) |
| 002 | Leaflet para el mapa local | MapLibre (solo Web Mercator), Cesium 2D (más riesgo) |
| 003 | Cesium solo para el globo, con respaldo 2D | Cesium para todo |
| 004 | Rutas A→B en el navegador (Worker), con paridad frente al motor C# | Backend de rutas |
| 005 | `config/` como fuente única de parámetros | Constantes duplicadas en C# y JS |
| 006 | Mapa geológico Stack 2020 | SIM 3464 (desfase de 100–200 m) |
| 007 | Radiación con el detector E de RAD | Detector B (otra sesión) |
| 008 | Tormenta de polvo como alerta explícita | Inferirla solo con temperatura y viento |
| 009 | Panel de "explicación del plan" determinista | Asistente con IA (exigiría exponer una clave y declararlo) |
| 010 | Código en inglés, documentación del equipo en español | Todo en un solo idioma |

---

## 8. Migración desde la carpeta actual (fase F0)

| Hoy | Pasa a |
|---|---|
| `web/index.html` (v1) | Se reescribe como `app/index.html` + `app/src/...`; el v1 va a `docs/es/historico/` |
| `web/js/motor_planes.js` | Se divide en `domain/plans/{tasks,filters,evaluate}.js` + `domain/explain/` |
| `web/data/*.js` | Se regeneran como `app/data/sites/jezero-issole/*.json` |
| `web/prueba_motor.html` | Pasa a `tests/scenarios/plans.scenarios.test.js` |
| `scripts/ruta_motor_v2.cs`, `capas_terreno.cs`, `recorte_ortho.cs` | `pipeline/03-model/RouteEngine.cs`, `pipeline/lib/*.cs`, `pipeline/02-process/` |
| `scripts/descargar_*.ps1`, `indexar_*`, `recortar_geologia.ps1` | `pipeline/01-download/` |
| `scripts/resumir_meda.ps1`, `extraer_rad.ps1` | `pipeline/02-process/` (se elimina `resumir_rad.ps1`, que estaba duplicado) |
| `scripts/servidor.ps1` | `tools/dev-server.ps1` |
| `scripts/ruta_motor.cs`, `calcular_rutas.ps1`, `descargar_hirise_tiles.ps1` | `docs/es/historico/` (motor v1 y teselas descartadas) |
| `data/*` (2,1 GB) | `data/raw/` y `data/interim/` (fuera de git); se elimina SIM 3464 y los archivos vacíos |
| `auditoria`, `informe`, `catalogo`, `investigacion`, `requisitos`, `LEEME` | `docs/es/` (los superados, a `historico/`) |
