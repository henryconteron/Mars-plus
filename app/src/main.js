// AI-assisted (Claude). Reviewed by the MARS+ team.
// Composition root: builds adapters, wires use cases, mounts the UI.
import { createStore } from './application/store.js';
import { createRouteSession, settleRoute } from './application/route-session.js';
import { createMissionService } from './application/use-cases.js';
import { createStaticSiteRepository } from './infrastructure/data/static-site-repository.js';
import { createWorkerRouteSolver } from './infrastructure/routing/worker-route-solver.js';
import { createLeafletMapView } from './infrastructure/map/leaflet-map-view.js';
import { TerrainGrid } from './domain/terrain/grid.js';
import { ROUGHNESS_SCALES, meanAbsoluteDeviation } from './domain/terrain/roughness.js';
import { solarPosition, shadowMask } from './domain/terrain/sun.js';
import { viewshedMask } from './domain/terrain/viewshed.js';
import { rampColor } from './domain/dust/dust.js';
import { createI18n } from './ui/i18n.js';
import { createMissionPanel } from './ui/panels/mission-panel.js';
import { createRoutePanel } from './ui/panels/route-panel.js';
import { createPlansPanel } from './ui/panels/plans-panel.js';
import { createWeatherPanel, createRadiationPanel } from './ui/panels/conditions-panels.js';
import { createGeologyPanel, createAssumptionsPanel, createSourcesPanel } from './ui/panels/info-panels.js';
import { createPhotosPanel } from './ui/panels/photos-panel.js';
import { createSummaryBar } from './ui/panels/summary-bar.js';
import { createWelcome } from './ui/panels/welcome.js';
import { createWebGLGlobe, isWebGL2Supported } from './infrastructure/globe/webgl-globe.js';
import { createGlobeView } from './ui/views/globe-view.js';

const SITE_ID = 'jezero-issole';

function initialLang() {
  try { const saved = localStorage.getItem('marsplus.lang'); if (saved === 'en' || saved === 'es') return saved; } catch { /* storage unavailable */ }
  return (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

async function main() {
  const loading = document.getElementById('loading');
  const [en, es] = await Promise.all(['en', 'es'].map((l) => fetch(`i18n/${l}.json`).then((r) => r.json())));
  const i18n = createI18n({ en, es }, initialLang());
  document.documentElement.lang = i18n.lang;
  loading.textContent = i18n.t('app.loading');

  // --- GLOBE first (state GLOBE) when WebGL2 is available; "?view=local" opens the EVA map directly ---
  const globeRoot = document.getElementById('globe-view');
  const viewToggle = document.getElementById('view-toggle');
  let globe = null, globeView = null, store = null, pendingLocal = false;
  const goLocal = () => { if (store) store.set({ view: 'local' }); else pendingLocal = true; };
  const openLocal = new URLSearchParams(location.search).get('view') === 'local';
  const flatDust = new URLSearchParams(location.search).get('dust') === 'flat';
  const openDust = new URLSearchParams(location.search).get('layer') === 'dust';
  if (!openLocal) {
    try {
      const meta = await fetch('assets/globe/globe.json').then((r) => { if (!r.ok) throw new Error(`globe.json: HTTP ${r.status}`); return r.json(); });
      const webgl = isWebGL2Supported();
      globeRoot.hidden = false;
      loading.hidden = true; // the globe shows its own progress while the EVA data loads underneath
      globeView = createGlobeView(globeRoot, { i18n, assetBase: 'assets/globe/', dustBase: 'data/dust/', meta, onEnterMission: goLocal, preferFlat: flatDust || !webgl });
      if (webgl) {
        globe = createWebGLGlobe(globeView.canvas, { assetBase: 'assets/globe/', meta, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
        globe.start().then(() => {
          globeView.attach(globe);
          if (openDust && !flatDust) globeView.showDustLayer();
        }).catch((err) => {
          console.error(err);
          globeView.useFlat(); // the dust map still works as a flat Leaflet view
        });
      }
    } catch (err) {
      console.error(err);
      globeRoot.hidden = true; globe = null; globeView = null; loading.hidden = false;
    }
  }

  const repository = createStaticSiteRepository('data/', SITE_ID);
  const service = createMissionService({ repository, solver: createWorkerRouteSolver() });
  let data;
  try {
    data = await service.loadSite();
  } catch (err) {
    console.error(err);
    globeRoot.hidden = true;
    loading.hidden = false;
    loading.textContent = i18n.t('app.loadError');
    return;
  }

  const map = createLeafletMapView(document.getElementById('map'), { data, assetUrl: repository.assetUrl });
  const terrainGrid = new TerrainGrid(data.terrainMeta, await repository.loadTerrainBinary());
  const roughColors = ['#1c2430', '#2f6f8f', '#e0b043', '#d36a2c', '#f4efe6'];
  const roughStops = [0, 0.05, 0.15, 0.4, 1];
  for (const scale of ROUGHNESS_SCALES) {
    const mad = meanAbsoluteDeviation(terrainGrid.z, terrainGrid.rows, terrainGrid.cols, scale.radius);
    const rgba = new Uint8ClampedArray(mad.length * 4);
    for (let i = 0; i < mad.length; i++) {
      if (!Number.isFinite(mad[i])) continue;
      const rgb = rampColor(roughStops, roughColors, mad[i]);
      rgba[i * 4] = rgb[0]; rgba[i * 4 + 1] = rgb[1]; rgba[i * 4 + 2] = rgb[2]; rgba[i * 4 + 3] = 210;
    }
    map.setRaster(scale.id, `layer.${scale.id}`, rgba, terrainGrid.cols, terrainGrid.rows, 0.75);
  }
  const sun0 = data.params.sun;
  const paintShadows = (ls, hour) => {
    const lat = (terrainGrid.bounds.south + terrainGrid.bounds.north) / 2;
    const sun = solarPosition(lat, ls, hour, sun0.obliquityDeg);
    const mask = shadowMask(terrainGrid.z, terrainGrid.rows, terrainGrid.cols, terrainGrid.res, terrainGrid.cosLat, sun, sun0.marchM);
    const rgba = new Uint8ClampedArray(mask.length * 4);
    for (let i = 0; i < mask.length; i++) if (mask[i]) { rgba[i * 4 + 3] = 150; }
    map.setRaster('shadow', 'layer.shadow', rgba, terrainGrid.cols, terrainGrid.rows, 0.85);
  };
  paintShadows(sun0.defaultLs, sun0.defaultLtst);
  const habitat = data.site.points.landing;
  const habitatCell = terrainGrid.cellOf(habitat.lon, habitat.lat);
  const vis = data.params.visibility;
  const losMask = habitatCell >= 0
    ? viewshedMask(terrainGrid.z, terrainGrid.rows, terrainGrid.cols, terrainGrid.res, terrainGrid.cosLat, habitatCell, vis.habitatHeightM, vis.crewEyeHeightM)
    : new Uint8Array(terrainGrid.size);
  const losRgba = new Uint8ClampedArray(losMask.length * 4);
  for (let i = 0; i < losMask.length; i++) {
    if (!Number.isFinite(terrainGrid.z[i])) continue;
    if (losMask[i]) { losRgba[i * 4 + 1] = 160; losRgba[i * 4 + 3] = 70; }
    else { losRgba[i * 4] = 180; losRgba[i * 4 + 3] = 110; }
  }
  map.setRaster('los', 'layer.los', losRgba, terrainGrid.cols, terrainGrid.rows, 0.8);
  const firstPlan = service.evaluate(service.defaultPlanOptions());
  store = createStore({
    view: globeView && !pendingLocal ? 'globe' : 'local',
    officialRes: data.routes.primaryResM,
    pick: null, pointA: null, pointB: null,
    routeStatus: { kind: 'idle' }, userRoute: null,
    paceKey: 'normal', planOptions: firstPlan.evaluation.options, dustInfo: firstPlan.dustInfo,
    sun: { ls: data.params.sun.defaultLs, hour: data.params.sun.defaultLtst },
    losRequired: false,
    routeColor: 'budget',
    evaluation: firstPlan.evaluation, explanation: firstPlan.explanation,
    sensitivity: { status: 'idle', rows: null }, sensitivityView: null, traverseValidation: null, routingReady: false,
  });

  // Sensitivity rows (leg times per sand factor) -> view with the recommended plan under the current options
  const sensitivityView = (rows, options) => (rows ?? []).filter((r) => r.legs).map((r) => ({
    factor: r.factor, isModel: r.isModel,
    outMin: r.legs.landing_sampling.timeMin, backMin: r.legs.sampling_landing.timeMin,
    rec: service.evaluate(options, r.legs).evaluation.recommended,
  }));

  // --- actions (the only place that mutates state) ---
  const routes = createRouteSession();
  async function computeIfReady() {
    const id = routes.begin();
    const { pointA, pointB } = store.get();
    if (!pointA || !pointB) return;
    store.set({ routeStatus: { kind: 'computing' }, userRoute: null });
    const settled = await settleRoute(routes, id, () => service.computeRoute(pointA, pointB, store.get().losRequired ? { requireLineOfSight: true, mask: losMask } : undefined));
    if (settled.stale) return;
    if (settled.error) console.error(settled.error);
    store.set({ routeStatus: settled.status, userRoute: settled.userRoute });
  }
  const actions = {
    pick: (which) => store.set((s) => ({ pick: s.pick === which ? null : which })),
    clear: () => {
      routes.invalidate();
      store.set({ pick: null, pointA: null, pointB: null, userRoute: null, routeStatus: { kind: 'idle' } });
    },
    useMission: () => {
      store.set({ pick: null, pointA: { ...data.site.points.landing }, pointB: { lon: data.stops.sampling.lon, lat: data.stops.sampling.lat }, userRoute: null });
      computeIfReady();
    },
    setOption: (patch) => {
      const prev = store.get().planOptions;
      const next = { ...prev, ...patch };
      if (patch.dustFollowData) next.dustAlertOverride = null;
      else if (Object.hasOwn(patch, 'dustStormAlert') && !Object.hasOwn(patch, 'dustAlertOverride')) next.dustAlertOverride = patch.dustStormAlert;
      if (Object.hasOwn(patch, 'weatherScenario') || Object.hasOwn(patch, 'dustSol')) next.dustAlertOverride = null;
      delete next.dustFollowData;
      const result = service.evaluate(next);
      store.set({
        planOptions: result.evaluation.options, dustInfo: result.dustInfo,
        evaluation: result.evaluation, explanation: result.explanation,
        sensitivityView: sensitivityView(store.get().sensitivity.rows, result.evaluation.options),
      });
    },
    runSensitivity: async () => {
      if (store.get().sensitivity.status === 'running') return;
      store.set({ sensitivity: { status: 'running', rows: null }, sensitivityView: null });
      try {
        const rows = await service.sandSensitivity();
        store.set({ sensitivity: { status: 'done', rows }, sensitivityView: sensitivityView(rows, store.get().planOptions) });
      } catch (err) {
        console.error(err);
        store.set({ sensitivity: { status: 'error', rows: null } });
      }
    },
    setRouteColor: (routeColor) => store.set({ routeColor }),
    setLosRequired: (losRequired) => {
      store.set({ losRequired });
      computeIfReady();
    },
    setSun: ({ ls, hour }) => {
      const prev = store.get().sun;
      const next = { ls: Number.isFinite(ls) ? ls : prev.ls, hour: Number.isFinite(hour) ? hour : prev.hour };
      paintShadows(next.ls, next.hour);
      store.set({ sun: next });
    },
    setPace: (key) => {
      store.set({ paceKey: key });
      actions.setOption({ paceFactor: data.params.pace[key] });
    },
  };
  map.onClick((p) => {
    const { pick } = store.get();
    if (!pick) return;
    store.set({ [pick === 'A' ? 'pointA' : 'pointB']: p, pick: pick === 'A' && !store.get().pointB ? 'B' : null, userRoute: null, routeStatus: { kind: 'idle' } });
    computeIfReady();
  });

  // --- panels: the answer first (GO / NO-GO), then mission, plans, own route and details ---
  const sidebar = document.getElementById('sidebar');
  const ctx = { i18n, data, store, actions };
  const summaryEl = document.createElement('div');
  sidebar.append(summaryEl);
  const panels = [createSummaryBar(summaryEl, ctx)];
  const sections = [['mission', createMissionPanel], ['plans', createPlansPanel], ['route', createRoutePanel], ['photos', createPhotosPanel],
    ['weather', createWeatherPanel], ['radiation', createRadiationPanel], ['geology', createGeologyPanel], ['assumptions', createAssumptionsPanel], ['sources', createSourcesPanel]];
  for (const [id, factory] of sections) {
    const el = document.createElement('section'); el.className = 'section'; el.id = `panel-${id}`; sidebar.append(el); panels.push(factory(el, ctx));
  }

  const welcome = createWelcome(document.getElementById('welcome'), { i18n });
  const helpBtn = document.getElementById('help');
  helpBtn.addEventListener('click', () => welcome.open(helpBtn));

  const buildAll = () => {
    const { t } = i18n;
    document.getElementById('subtitle').textContent = t('app.subtitle');
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === i18n.lang)));
    helpBtn.setAttribute('aria-label', t('welcome.help')); helpBtn.title = t('welcome.help');
    document.getElementById('skip').textContent = t('app.skip');
    map.setLabels(i18n.html);
    panels.forEach((p) => p.build(store.get()));
    panels.forEach((p) => p.update(store.get()));
    welcome.rerender();
    globeView?.setTexts();
    applyView(store.get().view);
  };

  // --- view switching: GLOBE <-> LOCAL (EVA map) ---
  viewToggle.hidden = !globeView;
  viewToggle.addEventListener('click', () => store.set((s) => ({ view: s.view === 'globe' ? 'local' : 'globe' })));
  function applyView(view) {
    const onGlobe = view === 'globe' && Boolean(globeView);
    globeRoot.hidden = !onGlobe;
    if (globe) (onGlobe ? globe.resume() : globe.pause());
    viewToggle.textContent = i18n.t(onGlobe ? 'app.toMap' : 'app.toGlobe');
    viewToggle.setAttribute('aria-pressed', String(onGlobe));
    if (!onGlobe) map.invalidate();
  }

  let last = {};
  store.subscribe((s) => {
    if (s.view !== last.view) { applyView(s.view); if (s.view === 'globe') globeView?.focus(); }
    panels.forEach((p) => p.update(s));
    if (s.officialRes !== last.officialRes) map.showOfficial(s.officialRes);
    if (s.pointA !== last.pointA) map.setPoint('A', s.pointA);
    if (s.pointB !== last.pointB) map.setPoint('B', s.pointB);
    if (s.userRoute !== last.userRoute || s.routeColor !== last.routeColor || s.planOptions?.limitMin !== last.planOptions?.limitMin) {
      map.showUserRoute(s.userRoute, { mode: s.routeColor || 'budget', limitMin: s.planOptions.limitMin });
    }
    map.setPickCursor(Boolean(s.pick));
    last = s;
  });
  document.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    i18n.setLang(b.dataset.lang);
    try { localStorage.setItem('marsplus.lang', b.dataset.lang); } catch { /* ignore */ }
  }));
  i18n.onChange(buildAll);

  buildAll();
  map.showOfficial(store.get().officialRes);
  last = store.get();
  loading.remove();
  if (welcome.shouldShowOnLoad()) welcome.open();
  service.whenRoutingReady().then(() => store.set({ routingReady: true })).catch((err) => { console.error(err); store.set({ routingReady: 'error' }); });
  service.traverseValidation().then((v) => store.set({ traverseValidation: v })).catch((err) => console.error(err));
  window.MARSPLUS = { store, service, map, globe }; // debugging aid for the team (map.setTrekUrlForTest simulates an outage)
}

main();
