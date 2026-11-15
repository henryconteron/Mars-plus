// AI-assisted (Claude). Reviewed by the MARS+ team.
// MapView implementation with Leaflet (global L, loaded from CDN with SRI in index.html).
// Geographic CRS (EPSG:4326 scheme) matches the Mars Trek tiling, so lon/lat are used directly.
import { trekTileUrl, TREK_ATTRIBUTION, TREK_MAX_NATIVE_ZOOM } from './mars-trek-layers.js';
import { escapeHtml } from '../../shared/dom.js';

const GEO_STYLE = {
  largeDunes: { color: '#cc8e37', fillColor: '#cc8e37', fillOpacity: 0.10 },
  smallDunes: { color: '#e0a98b', fillColor: '#e0a98b', fillOpacity: 0.10 },
  maaz: { color: '#9e8f88', fillColor: '#7d6d6d', fillOpacity: 0.06 },
  seitah: { color: '#c2584f', fillColor: '#a2453e', fillOpacity: 0.14 },
  other: { color: '#7d6d6d', fillColor: '#7d6d6d', fillOpacity: 0.04 },
};

export function createLeafletMapView(container, { data, assetUrl }) {
  const L = window.L;
  const { site, routes, stops, geology, overlays, terrainMeta } = data;
  const b = terrainMeta.bounds;
  const pilotBounds = L.latLngBounds([b.south, b.west], [b.north, b.east]);

  const map = L.map(container, { crs: L.CRS.EPSG4326, minZoom: 11, maxZoom: 20, zoomSnap: 0.5, attributionControl: true });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  map.fitBounds(pilotBounds.pad(0.02)); // a view must exist before vector layers are added

  // Panes: CTX underlay < local backup image < Trek base tiles < overlays
  map.createPane('ctxUnder').style.zIndex = 150;
  map.createPane('backup').style.zIndex = 160;
  const tile = (id, maxNative, extra = {}) => L.tileLayer(trekTileUrl(site.trekLayers[id]), { maxNativeZoom: maxNative, maxZoom: 20, tileSize: 256, attribution: TREK_ATTRIBUTION, ...extra });
  tile('ctx', TREK_MAX_NATIVE_ZOOM.ctx, { pane: 'ctxUnder', attribution: '' }).addTo(map);
  const ov = (key, opts) => L.imageOverlay(assetUrl(overlays[key].file), [[overlays[key].bounds.south, overlays[key].bounds.west], [overlays[key].bounds.north, overlays[key].bounds.east]], opts);
  ov('baseOrtho', { pane: 'backup', opacity: 1 }).addTo(map);

  const base = {
    hirise: tile('hirise', TREK_MAX_NATIVE_ZOOM.hirise),
    ctx: tile('ctx', TREK_MAX_NATIVE_ZOOM.ctx),
    themis: tile('themisNight', TREK_MAX_NATIVE_ZOOM.themisNight, { opacity: 0.85 }),
  };
  base.hirise.addTo(map);

  const layers = {
    cost: ov('cost', { opacity: 0.55 }),
    slope: ov('slope', { opacity: 0.75 }),
    geology: L.geoJSON(geology, { style: (f) => ({ weight: 0.8, ...(GEO_STYLE[f.properties.class] ?? GEO_STYLE.other) }), interactive: false }),
    official: L.layerGroup(),
    rover: L.polyline(routes.roverPath.coords.map(([lon, lat]) => [lat, lon]), { color: '#c792ea', weight: 2, dashArray: '4 6', opacity: 0.9 }),
    user: L.layerGroup(),
  };
  layers.geology.addTo(map);
  layers.official.addTo(map);
  layers.rover.addTo(map);
  layers.user.addTo(map);

  const pin = (cls, color, text = '') => L.divIcon({ className: '', html: `<div class="map-pin ${cls}" style="background:${color}">${text}</div>`, iconSize: cls ? [22, 22] : [14, 14], iconAnchor: cls ? [11, 11] : [7, 7] });
  const markers = {
    landing: L.marker([site.points.landing.lat, site.points.landing.lon], { icon: pin('', '#f4f1ee'), keyboard: true }).addTo(map),
    issole: L.marker([site.points.issole.lat, site.points.issole.lon], { icon: pin('', '#a2453e') }).addTo(map),
    sampling: L.circleMarker([stops.sampling.lat, stops.sampling.lon], { radius: 5, color: '#14110f', weight: 2, fillColor: '#7bd389', fillOpacity: 1 }).addTo(map),
    observation: L.circleMarker([stops.observation.lat, stops.observation.lon], { radius: 5, color: '#14110f', weight: 2, fillColor: '#5ec8f2', fillOpacity: 1 }).addTo(map),
  };
  const userPins = { A: null, B: null };
  let control = null;
  let clickHandler = null;
  let picking = false;
  let lastT = (k) => k;
  map.on('click', (e) => clickHandler && clickHandler({ lon: e.latlng.lng, lat: e.latlng.lat }));

  // Keyboard alternative to clicking: while choosing A/B, Enter places the point at the map centre (crosshair).
  const crosshair = L.DomUtil.create('div', 'map-crosshair', container);
  crosshair.setAttribute('aria-hidden', 'true');
  crosshair.hidden = true;
  container.addEventListener('keydown', (e) => {
    if (picking && e.key === 'Enter' && clickHandler) { const c = map.getCenter(); clickHandler({ lon: c.lng, lat: c.lat }); e.preventDefault(); }
  });

  // Robustness: if Mars Trek tiles keep failing, say so; the local HiRISE backup image stays visible underneath.
  const notice = L.control({ position: 'bottomleft' });
  notice.onAdd = () => { const d = L.DomUtil.create('div', 'map-notice'); d.setAttribute('role', 'status'); return d; };
  notice.addTo(map);
  const noticeEl = notice.getContainer();
  noticeEl.hidden = true;
  let consecutiveErrors = 0; // reset by any successful tile, so a later outage is still detected
  const refreshNotice = () => { noticeEl.hidden = consecutiveErrors < 3; noticeEl.textContent = lastT('map.trekDown'); };
  for (const layer of Object.values(base)) {
    layer.on('tileerror', () => { consecutiveErrors++; refreshNotice(); });
    layer.on('tileload', () => { consecutiveErrors = 0; refreshNotice(); });
  }

  return {
    /** Rebuilds texts that depend on the language. */
    setLabels(t) {
      const photoOf = (stop) => {
        const p = (site.photos ?? []).find((x) => x.stop === stop);
        return p ? `<img class="popup-photo" src="assets/rover/${escapeHtml(p.file)}" alt="${escapeHtml(t(p.caption))}" loading="lazy"><div class="popup-credit">${escapeHtml(p.camera)} · sol ${escapeHtml(p.sol)} · ${escapeHtml(p.credit)}</div>` : '';
      };
      lastT = t;
      container.setAttribute('aria-label', t('map.label'));
      refreshNotice();
      const w = data.params.workspace;
      const ws = { slope: w.maxSlopeDeg, dune: w.maxLargeDuneFraction };
      markers.landing.bindPopup(t('point.landing'));
      markers.issole.bindPopup(t('point.issole') + photoOf('observation'));
      markers.sampling.bindPopup(t('point.sampling', ws) + photoOf('sampling'));
      markers.observation.bindPopup(t('point.observation', ws) + photoOf('observation'));
      if (control) control.remove();
      control = L.control.layers(
        { [t('layer.hirise')]: base.hirise, [t('layer.ctx')]: base.ctx, [t('layer.themis')]: base.themis },
        { [t('layer.cost')]: layers.cost, [t('layer.slope')]: layers.slope, [t('layer.geology')]: layers.geology, [t('layer.official')]: layers.official, [t('layer.rover')]: layers.rover, [t('layer.user')]: layers.user },
        { collapsed: true },
      ).addTo(map);
    },
    showOfficial(resM) {
      layers.official.clearLayers();
      const run = (id) => routes.runs.find((r) => r.resM === resM && r.id === id);
      const line = (r, style) => r && L.polyline(r.coords.map(([lon, lat]) => [lat, lon]), style).addTo(layers.official);
      line(run('straight_landing_sampling'), { color: '#b9aaa2', weight: 2, dashArray: '2 6', opacity: 0.9 });
      line(run('sampling_landing'), { color: '#cc8e37', weight: 3, opacity: 0.95 });
      line(run('landing_sampling'), { color: '#5ec8f2', weight: 3, opacity: 0.95 });
    },
    onClick(fn) { clickHandler = fn; },
    setPickCursor(on) { picking = on; container.style.cursor = on ? 'crosshair' : ''; crosshair.hidden = !on; },
    /** Test hook: point the Trek base layers to another URL (used to simulate an outage). */
    setTrekUrlForTest(url) { Object.values(base).forEach((l) => l.setUrl(url)); },
    setPoint(which, p) {
      if (userPins[which]) { userPins[which].remove(); userPins[which] = null; }
      if (p) userPins[which] = L.marker([p.lat, p.lon], { icon: pin('ab', '#f4f1ee', which) }).addTo(map);
    },
    showUserRoute(coords) {
      layers.user.clearLayers();
      if (!coords) return;
      const ll = coords.map(([lon, lat]) => [lat, lon]);
      L.polyline(ll, { color: '#14110f', weight: 6, opacity: 0.7 }).addTo(layers.user);
      L.polyline(ll, { color: '#f4f1ee', weight: 3 }).addTo(layers.user);
    },
    fitPilot() { map.fitBounds(pilotBounds.pad(0.02)); },
    invalidate() { map.invalidateSize(); },
  };
}
