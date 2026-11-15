# MARS+ — EVA planner for Mars (Jezero crater pilot)

**NASA Space Apps Challenge 2026 · Interplanetary Survival Guide: Martian Map**

MARS+ helps a crew inside the habitat decide **whether, when and how** to walk from **Octavia E. Butler Landing** to the **Issole outcrop** in Jezero crater (≈886 m away). The goal is to document signs of past water alteration, collect a sample and come back safely. MARS+ layers NASA orbital and surface data into a hyper-local map, computes **least-effort walking routes**, and runs every candidate plan through a transparent **chain of safety filters** that explains *why* a plan is GO or NO-GO.

> **Live site:** https://gchushig3.github.io/Mars-plus/ · **Code:** https://github.com/gchushig3/Mars-plus · **Demo:** _slides link coming soon_

---

## What it does

- **3D Mars globe as the entry screen:** a WebGL2 globe built by the MARS+ team. It has three global layers (Viking colour mosaic, MOLA elevation, USGS geologic map with all 44 units) and a guided flight to Jezero that opens the local planner. Without WebGL2, or with `?view=local`, the app starts directly on the local map.
- **Hyper-local map (≈1 km², 2 m grid):** HiRISE 25 cm imagery, slope, walking-cost layer, geology units, the official EVA route (out and back), the real Perseverance traverse, and the sampling and observation stops.
- **Least-effort route A → B:** click two points and an A* search runs in your browser (Web Worker) over the 2 m terrain grid. Cost = time to cross each cell, from directional slope, roughness, sand (aeolian bedforms) and rocks detected in HiRISE.
- **EVA plan chain:** plans **A** (photo + sample), **C** (sample only) and **B** (documentation only) × every departure hour → **terrain → science → time → weather → radiation**. A plan that fails one filter is rejected with its reason; nothing compensates for a safety failure.
- **Real conditions:** Perseverance MEDA weather at Issole (sols 286–339, including the January 2022 regional dust storm) and Curiosity RAD dosimetry around the **28 Oct 2021 solar particle event**.
- **Validity checks built in:**
  - **Sand sensitivity:** routes and plans are recomputed with sand ×1.5 / ×2 / ×3.
  - **Obstacle model vs. ground truth:** only 0.8% of the cells along Perseverance's real ~1 km drive inside the area are flagged as blocked.
  - **Real rover photos** of what the crew will see at Issole.
- **Explains itself:** "Recommended: Plan C, depart 09:00, back 11:39 … Plan A is out — Time: exceeds the 180-min limit by 5 min."
- **Bilingual:** English / Spanish.

## NASA data and resources used

| Data | Use | Source |
|---|---|---|
| HiRISE 1 m DTM (Mars 2020 TRN) | Slope, elevation, roughness | USGS Astrogeology / NASA |
| HiRISE 25 cm orthomosaic (Mars 2020 TRN) | Rock detection (shadows), offline base image | USGS Astrogeology / NASA/JPL/UArizona |
| Mars Trek WMTS (HiRISE, CTX, THEMIS) | Interactive base maps | NASA/JPL Solar System Treks |
| MEDA derived data (TIRS, WS) | Ground temperature and wind at Issole | NASA PDS Atmospheres, DOI 10.17189/1522849 |
| MSL RAD RDR | Surface dose rate, solar event of 28 Oct 2021 | NASA PDS PPI (MSL-M-RAD-3-RDR-V1.0) |
| Perseverance waypoints (MMGIS M20) | Rover traverse, Issole position | NASA/JPL |
| Mars Perseverance raw images | Context for the stops | NASA/JPL-Caltech (challenge resource) |
| Mars rock samples catalog | Robine and Malay samples | NASA |
| Viking MDIM 2.1 colour mosaic | Globe base layer | NASA/JPL/USGS, via Mars Trek |
| MOLA MEGDR (8 px/deg) | Globe elevation layer | NASA MGS, PDS Geosciences |
| Geologic Map of Mars (SIM 3292) | Globe geology layer (44 units) | USGS for NASA |
| Star field (Deep Star Maps) | Globe background | NASA Goddard SVS, ESA/Gaia/DPAC |

## How it works

```
pipeline/ (PowerShell + C#, offline)          app/ (static site, no build)
  HiRISE DTM + ortho, geology, MEDA, RAD  →   data/sites/jezero-issole/*  →  domain (JS): cost, A*, plan filters
  RouteEngine.cs (official routes)             (2.4 MB + manifest)            application: use cases, store
  config/model-parameters.json  ─────────── single source of truth ───────→   infrastructure: Leaflet, Worker
                                                                              ui: panels, SVG charts, i18n
  Viking, MOLA, Tanaka 2014 geology         →   assets/globe/* (on demand)  →  infrastructure: WebGL2 globe
```

- **Clean architecture:** `domain/` is pure JavaScript (no DOM). `infrastructure/` adapts Leaflet, the Web Worker and the static data; `ui/` only talks to `application/`.
- **Parity:** the browser engine and the pipeline engine (C#) read the same parameters. `tests/` checks that their route times differ by **<1%**.
- See `STACK_Y_ARQUITECTURA.md` (Spanish) for the full stack and architecture.

## Run locally (Windows)

```powershell
# regenerate app data (needs the raw data in data/, see pipeline/)
powershell -ExecutionPolicy Bypass -File pipeline\run-pipeline.ps1
# serve the repo
powershell -ExecutionPolicy Bypass -File tools\dev-server.ps1
# app:   http://localhost:8770/app/
# tests in the browser: http://localhost:8770/tests/
# same suite without Windows, from the repo root (this is what CI runs):
node tests/run.mjs
```

## Deploy

`app/` is a static site with no build step:
- **GitHub Pages:** `.github/workflows/pages.yml` publishes `app/` on every push to `main` (Settings → Pages → Source: GitHub Actions).
- **Netlify:** `netlify.toml` publishes `app/`.

## Assumptions and limits (stated in the app)

- Walking speed: Tobler hiking function scaled ×0.5 (~2.5 km/h on flat ground) for a pressurized suit. This is a scenario assumption, not a measured value.
- Sand doubles walking time (based on Lejeune et al. 1998, energy cost of walking on sand). About 520 m of large dunes surround Issole and cannot be avoided.
- Rocks are detected from HiRISE shadows; rocks smaller than ~0.75 m are invisible from orbit.
- Radiation rate comes from Gale crater (RAD). Jezero is higher, so the local dose would be somewhat larger. The nominal dose is that rate times time on the surface (walking and tasks). Airlock time is inside the habitat, and the reserve is unused margin, so neither is counted as exposure. The weather check still covers the whole budgeted window, including the reserve.
- The dust storm is modeled as an explicit alert, because dust opacity is not in the derived MEDA files.
- Stops are the flattest rock-free workspaces near the rover positions for Robine and Malay.

## AI assistance (Space Apps "Super Intelligence" disclosure)

- **What the team defined:** the mission concept, the route objective (least-effort, least-exposure EVA from Octavia E. Butler Landing to Issole), the science target (signs of water alteration) and the product direction (MARS+).
- **What the team built:** the 3D globe (WebGL2 renderer, layers and design), made with AI assistance.
- **What the AI did:** this project used **Claude (Anthropic)** as a development assistant to:
  - research and locate NASA datasets;
  - write the data-processing pipeline (PowerShell/C#), the route engine, the web application code and the tests;
  - integrate the team's globe into the app;
  - draft documentation.
- **AI-generated image:** the MARS+ logo was generated with AI. It is shown with a visible "AI-generated image" label, and `app/assets/globe/globe.json` declares it (`logo.aiGenerated`). No other AI-generated images, audio or video are used.
- **Marking:** every AI-assisted source file carries the header `AI-assisted (Claude). Reviewed by the MARS+ team.`

## References

**Data**
- USGS Astrogeology, *Mars 2020 Terrain Relative Navigation HiRISE DTM and orthoimage mosaics*.
- NASA/JPL, *Mars Trek WMTS*: https://trek.nasa.gov/mars/
- MEDA bundle, NASA PDS Atmospheres, DOI 10.17189/1522849.
- MSL RAD RDR, NASA PDS PPI, MSL-M-RAD-3-RDR-V1.0.
- Stack, K. M. et al. (2020). *Photogeologic Map of the Perseverance Rover Field Site in Jezero Crater*. Space Sci. Rev. 216, 127. doi:10.1007/s11214-020-00739-x (CC BY 4.0).
- Tanaka, K. L. et al. (2014). *Geologic Map of Mars*. USGS Scientific Investigations Map 3292. doi:10.3133/sim3292.
- USGS Astrogeology, *Mars Viking Colorized Global Mosaic (MDIM 2.1)*.
- Smith, D. E. et al., *MGS MOLA Mission Experiment Gridded Data Records (MEGDR)*, NASA PDS Geosciences, MGS-M-MOLA-5-MEGDR-L3-V1.0.
- NASA Goddard Scientific Visualization Studio, *Deep Star Maps 2020* (ESA/Gaia/DPAC).

**Literature**
- Bell, J. F. III et al. (2022). *Geological, multispectral, and meteorological imaging results from the Mars 2020 Perseverance rover in Jezero crater*. Sci. Adv. 8, eabo4856.
- Lemmon, M. T. et al. (2022). *Dust, sand, and winds within an active Martian storm in Jezero crater*. GRL, doi:10.1029/2022GL100126.
- Hassler, D. M. et al. (2014). *Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover*. Science 343.
- Lejeune, T. M. et al. (1998). *Mechanics and energetics of human locomotion on sand*. J. Exp. Biol. 201, 2071–2080.
- Tobler, W. (1993). *Three presentations on geographical analysis and modeling* (hiking function).
- Golombek, M. P. et al., rock abundance from HiRISE shadow detection (method principle).

**Software**
- Leaflet 1.9.4 (BSD-2-Clause).
- IBM Plex Sans / Mono (SIL Open Font License).

See `ATTRIBUTION.md` for credits and licenses.
