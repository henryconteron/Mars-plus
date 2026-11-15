// AI-assisted (Claude). Reviewed by the MARS+ team.
// Globe screen (state GLOBE): explore Mars in 3D and fly to Jezero to plan the EVA.
// Layout, controls and design follow the MARS+ team's globe proposal; texts come from i18n.
// The renderer (infrastructure/globe) is injected by main.js — this view never imports it.
import { h, clear } from '../../shared/dom.js';
import { CDOD_COLORS, FREQ_COLORS, FREQ_MISSING, VISIBLE_FROM_IR, paintVolume, sampleVolume } from '../../domain/dust/dust.js';
import { fetchDustCatalog, fetchGzipBytes, productSpec } from '../../infrastructure/dust/load-dust.js';
import { createDustFlatMap } from '../../infrastructure/map/dust-flat-map.js';

const LAYER_KEYS = ['viking', 'mola', 'geology', 'dust'];

const PLACES = {
  olympus: { lat: 18.65, lon: 226.2, distance: 1.24 },
  valles: { lat: -14.01, lon: 301.41, distance: 1.73 },
  hellas: { lat: -42.43, lon: 70.5, distance: 1.44 },
  jezero: { lat: 18.44, lon: 77.45, distance: 1.14 },
};
const JEZERO_APPROACH = { lat: 18.44, lon: 77.45, distance: 1.06 };

export function createGlobeView(root, { i18n, assetBase, dustBase, meta, onEnterMission, preferFlat = false }) {
  const { t } = i18n;
  let globe = null, activeLayer = 'viking', layerError = null, selectedPlace = null, lastUnit;
  let dustCatalog = null, dustProduct = 'climatology', dustBin = 5, flat = false, flatMap = null, paintRequest = 0;
  const dustVolumes = new Map();
  const el = {};

  // --- static skeleton (created once; texts refreshed by setTexts) ---
  el.canvas = h('canvas', { class: 'g-canvas', tabindex: '0', 'aria-describedby': 'g-help' });
  el.flat = h('div', { class: 'g-flat', hidden: true });
  el.help = h('p', { id: 'g-help', class: 'sr-only' });
  el.status = h('p', { class: 'g-status', role: 'status' });
  el.center = h('span', { class: 'g-center', 'aria-hidden': 'true' });
  el.heroTitle = h('h2', {});
  el.heroLead = h('p', {});
  el.cta = h('button', { type: 'button', class: 'btn btn-primary g-cta', onclick: enterMission });
  el.hero = h('div', { class: 'g-hero' }, el.heroTitle, el.heroLead, el.cta);
  el.placesToggle = h('button', { type: 'button', class: 'g-round', 'aria-expanded': 'false', 'aria-controls': 'g-places', onclick: () => showPlaces(el.places.hidden) }, h('span', { class: 'g-place-icon', 'aria-hidden': 'true' }));
  el.placesTitle = h('h3', { id: 'g-places-title' });
  el.placeButtons = Object.keys(PLACES).map((key) => h('button', { type: 'button', 'data-place': key, 'aria-pressed': 'false', onclick: () => goToPlace(key) }, h('span', {}), h('small', {})));
  el.places = h('nav', { id: 'g-places', class: 'g-destinations', 'aria-labelledby': 'g-places-title', hidden: true }, el.placesTitle, ...el.placeButtons);
  el.reset = h('button', { type: 'button', class: 'g-round', onclick: () => { showPlaces(false); showLayers(false); select(null); globe?.reset(); } }, h('span', { class: 'g-globe-icon', 'aria-hidden': 'true' }));
  el.zoomOut = h('button', { type: 'button', onclick: () => globe?.zoom(1.39) }, h('span', { class: 'g-zoom-icon', 'aria-hidden': 'true' }));
  el.zoomIn = h('button', { type: 'button', onclick: () => globe?.zoom(0.72) }, h('span', { class: 'g-zoom-icon plus', 'aria-hidden': 'true' }));
  el.controls = h('div', { class: 'g-controls', role: 'group' }, h('div', { class: 'g-place-switcher' }, el.placesToggle, el.places), el.reset, h('div', { class: 'g-zoom', role: 'group' }, el.zoomOut, el.zoomIn));
  el.legendTitle = h('h3', {});
  el.legendDesc = h('p', { role: 'status' });
  el.legendBody = h('div', {});
  el.legend = h('section', { class: 'g-legend' }, el.legendTitle, el.legendDesc, el.legendBody);
  el.layersToggle = h('button', { type: 'button', class: 'g-layer-toggle', 'aria-expanded': 'false', 'aria-controls': 'g-layers', onclick: () => showLayers(el.layers.hidden) }, h('span', { class: 'g-layer-icon', 'aria-hidden': 'true' }), h('span', {}));
  el.layerInputs = LAYER_KEYS.map((key) => h('input', { type: 'radio', name: 'g-layer', value: key, checked: key === 'viking', onchange: () => selectLayer(key) }));
  el.layerLabels = el.layerInputs.map((input) => h('label', {}, input, h('span', {}, h('b', {}), h('small', {}))));
  el.layersLegend = h('legend', { class: 'sr-only' });
  el.layers = h('fieldset', { id: 'g-layers', class: 'g-layers', hidden: true }, el.layersLegend, h('div', { class: 'g-layer-options' }, ...el.layerLabels));
  el.tools = h('div', { class: 'g-tools' }, el.legend, h('div', { class: 'g-layer-switcher' }, el.layersToggle, el.layers));
  el.stage = h('div', { class: 'g-stage', 'data-layer': 'viking' }, el.canvas, el.flat, el.help, el.status, el.center, el.hero, el.controls, el.tools);
  el.source = h('a', { target: '_blank', rel: 'noopener' });
  el.credit = h('span', {});
  el.sky = h('a', { class: 'g-sky-credit', href: meta.sky.source, target: '_blank', rel: 'noopener' });
  el.team = h('span', { class: 'g-team-credit' });
  el.scaleText = h('output', {});
  el.scaleBar = h('span', { class: 'g-scale-bar', 'aria-hidden': 'true' });
  el.coords = h('output', {});
  el.detail = h('output', { class: 'g-detail', hidden: true });
  el.footer = h('footer', { class: 'g-footer' },
    h('div', { class: 'g-credit' }, h('div', { class: 'g-layer-credit' }, el.source, el.credit), el.sky, el.team),
    h('div', { class: 'g-position' }, h('div', { class: 'g-scale' }, el.scaleText, el.scaleBar), h('div', { class: 'g-readout' }, el.coords, el.detail)));
  root.append(el.stage, el.footer);
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.layers.hidden) { showLayers(false); el.layersToggle.focus(); } else if (!el.places.hidden) { showPlaces(false); el.placesToggle.focus(); }
  });

  const layerInfo = (key) => ({
    viking: { title: t('globe.legendViking'), desc: t('globe.vikingDesc'), src: meta.viking.source, credit: meta.viking.credit },
    mola: { title: t('globe.legendMola'), desc: t('globe.molaDesc'), src: meta.mola.source, credit: meta.mola.credit },
    geology: { title: t('globe.legendGeology'), desc: t('globe.geologyDesc'), src: meta.geology.source, credit: meta.geology.credit },
    dust: {
      title: t('globe.legendDust'),
      desc: t('globe.dustDesc'),
      src: dustProduct === 'frequency' ? 'https://doi.org/10.5281/zenodo.7480334' : (dustProduct === 'my34' ? 'https://doi.org/10.1029/2019JE006111' : 'https://doi.org/10.1016/j.icarus.2014.12.034'),
      credit: t(dustProduct === 'frequency' ? 'globe.dustCreditFreq' : (dustProduct === 'my34' ? 'globe.dustCreditMy34' : 'globe.dustCredit')),
    },
  }[key]);

  function setTexts() {
    root.setAttribute('aria-label', t('globe.region'));
    el.canvas.setAttribute('aria-label', t('globe.canvas'));
    el.canvas.textContent = t('globe.noWebgl');
    el.help.textContent = t('globe.help');
    el.heroTitle.textContent = t('globe.heroTitle');
    el.heroLead.textContent = t('globe.heroLead');
    el.cta.textContent = t('globe.cta');
    el.controls.setAttribute('aria-label', t('globe.controls'));
    for (const [btn, label] of [[el.placesToggle, 'globe.places'], [el.reset, 'globe.reset'], [el.zoomOut, 'globe.zoomOut'], [el.zoomIn, 'globe.zoomIn']]) { btn.setAttribute('aria-label', t(label)); btn.title = t(label); }
    el.placesTitle.textContent = t('globe.places');
    el.placeButtons.forEach((b) => { const k = b.dataset.place; b.children[0].textContent = t(`place.${k}`); b.children[1].textContent = t(`place.${k}Kind`); });
    el.layersToggle.children[1].textContent = t('globe.layers');
    el.layersLegend.textContent = t('globe.layers');
    LAYER_KEYS.forEach((k, i) => { const s = el.layerLabels[i].lastChild; s.children[0].textContent = t(`globe.layer.${k}`); s.children[1].textContent = t(`globe.layer.${k}Src`); });
    el.sky.textContent = t('globe.skyCredit');
    el.team.textContent = t('globe.teamCredit');
    el.coords.setAttribute('aria-label', t('globe.coords'));
    renderLegend();
    if (globe) onFrame(globe.camera);
  }

  function renderLegend() {
    const info = layerInfo(activeLayer);
    el.stage.dataset.layer = activeLayer;
    el.legendTitle.textContent = info.title;
    el.legendDesc.textContent = layerError ? t('globe.layerError') : info.desc;
    el.source.textContent = info.title;
    el.source.href = info.src;
    el.credit.textContent = info.credit;
    clear(el.legendBody);
    lastUnit = undefined;
    if (activeLayer === 'mola') {
      const stops = [[-8.2, '#33405c'], [-4, '#527a8e'], [0, '#acc2a1'], [4, '#d7bb82'], [8, '#b87550'], [12, '#a15141'], [17, '#da9b79'], [21.2, '#fff0dc']];
      const min = stops[0][0], max = stops[stops.length - 1][0], pct = (km) => (100 * (km - min)) / (max - min);
      el.legendBody.append(
        h('div', { class: 'g-ramp', style: `background:linear-gradient(90deg, ${stops.map(([km, c]) => `${c} ${pct(km)}%`).join(', ')})`, 'aria-hidden': 'true' }),
        h('ol', { class: 'g-ticks', 'aria-label': t('globe.elevationAxis') }, ...[min, 0, 8, 15, max].map((km) => h('li', { style: `left:${pct(km)}%` }, String(km).replace('-', '−')))),
        h('p', {}, t('globe.gridNote')));
    } else if (activeLayer === 'geology') {
      el.unitNow = h('p', { class: 'g-unit-now' });
      const list = h('ul', {}, ...meta.geology.units.map((u, i) => h('li', { 'data-unit': String(i + 1) }, h('span', { class: 'g-swatch', style: `background:${u.color}`, 'aria-hidden': 'true' }), `${u.code} · ${u[i18n.lang] ?? u.en}`)));
      el.legendBody.append(el.unitNow, h('details', { class: 'g-key' }, h('summary', {}, t('globe.unitsLegend', { n: meta.geology.units.length })), list));
    } else if (activeLayer === 'dust') {
      const from = dustBin * 30;
      const product = h('select', {
        onchange: (e) => { dustProduct = e.target.value; paintDust().catch((err) => { console.error(err); layerError = 'dust'; renderLegend(); }); },
      }, ...['climatology', 'my34', 'frequency'].map((key) => h('option', { value: key, selected: dustProduct === key }, t(`globe.dust.${key}`))));
      const season = h('input', {
        type: 'range', min: '0', max: '11', step: '1', value: String(dustBin),
        'aria-valuemin': '0', 'aria-valuemax': '330', 'aria-valuenow': String(from),
        'aria-label': t('globe.dustLs', { from, to: from + 30 }),
        oninput: (e) => { dustBin = Number(e.target.value); e.target.setAttribute('aria-valuenow', String(dustBin * 30)); paintDust(false).catch((err) => { console.error(err); layerError = 'dust'; }); },
      });
      el.dustLs = h('p', { class: 'g-dust-ls' }, t('globe.dustLs', { from, to: from + 30 }));
      const stops = dustCatalog ? productSpec(dustCatalog, dustProduct).stops : [0, 1];
      const colors = dustProduct === 'frequency' ? FREQ_COLORS : CDOD_COLORS;
      const ramp = h('div', { class: 'g-ramp', style: `background:linear-gradient(90deg, ${colors.join(', ')})`, 'aria-hidden': 'true' });
      const ticks = [stops[0], stops[Math.floor((stops.length - 1) / 2)], stops[stops.length - 1]];
      const max = stops[stops.length - 1];
      const pct = (value) => (100 * (value - stops[0])) / (max - stops[0] || 1);
      el.legendBody.append(
        h('label', { class: 'g-dust-field' }, t('globe.dustProduct'), product),
        el.dustLs,
        season,
        ramp,
        h('ol', { class: 'g-ticks', 'aria-label': t(dustProduct === 'frequency' ? 'globe.dustUnitFreq' : 'globe.dustUnitCdod') }, ...ticks.map((value) => h('li', { style: `left:${pct(value)}%` }, dustProduct === 'frequency' && value === max ? `≥${value}` : String(value)))),
        h('p', { class: 'g-dust-unit' }, t(dustProduct === 'frequency' ? 'globe.dustUnitFreq' : 'globe.dustUnitCdod')),
        h('p', {}, t('globe.dustResolution')),
        globe ? h('button', { type: 'button', class: 'g-flat-toggle', onclick: () => (flat ? useGlobe() : useFlat()) }, t(flat ? 'globe.dustGlobe' : 'globe.dustFlat')) : h('p', {}, t('globe.dustFlatOnly')),
      );
      el.legendBody.dataset.product = dustProduct;
    }
  }

  function showLayers(show) { if (show) showPlaces(false); el.layers.hidden = !show; el.layersToggle.setAttribute('aria-expanded', String(show)); }
  function showPlaces(show) { if (show) showLayers(false); el.places.hidden = !show; el.placesToggle.setAttribute('aria-expanded', String(show)); }
  function select(key) { selectedPlace = key; el.placeButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.place === key))); }
  function goToPlace(key) { showPlaces(false); el.placesToggle.focus({ preventScroll: true }); select(key); globe?.flyTo(PLACES[key]); }

  async function dustFrame() {
    if (!dustCatalog) dustCatalog = await fetchDustCatalog(dustBase);
    const spec = productSpec(dustCatalog, dustProduct);
    if (spec.stops.length !== (spec.mode === 'frequency' ? FREQ_COLORS : CDOD_COLORS).length) throw new Error('dust legend stops do not match the colour ramp');
    if (!dustVolumes.has(dustProduct)) {
      const bytes = await fetchGzipBytes(dustBase + spec.file);
      const expected = spec.grid.width * spec.grid.height * dustCatalog.lsBinStarts.length;
      if (bytes.length !== expected) throw new Error(`${spec.file}: ${bytes.length} bytes, expected ${expected}`);
      dustVolumes.set(dustProduct, bytes);
    }
    const colors = spec.mode === 'frequency' ? FREQ_COLORS : CDOD_COLORS;
    const rgba = paintVolume({ bytes: dustVolumes.get(dustProduct), grid: spec.grid, band: dustBin, mode: spec.mode, stops: spec.stops, colors, scale: dustCatalog.cdod.scale });
    return { rgba, spec };
  }

  async function paintDust(rebuildLegend = true) {
    const request = ++paintRequest;
    const frame = await dustFrame();
    if (request !== paintRequest) return;
    if (flat) {
      if (!flatMap) flatMap = createDustFlatMap(el.flat);
      flatMap.setPixels(frame.rgba, frame.spec.grid.width, frame.spec.grid.height);
      flatMap.setAttribution(t(dustProduct === 'frequency' ? 'globe.dustCreditFreq' : 'globe.dustCredit'));
      const jez = dustProduct === 'frequency' ? dustCatalog.frequency.jezero.percent[dustBin] : (dustProduct === 'my34' ? dustCatalog.cdod.jezero.my34Cdod610[dustBin] : dustCatalog.cdod.jezero.climatologyCdod610[dustBin]);
      const tip = dustProduct === 'frequency'
        ? t('globe.dustJezeroFreq', { value: jez == null ? t('globe.dustMissing') : jez })
        : t('globe.dustJezeroCdod', { value: Number(jez).toFixed(2) });
      flatMap.setMarker(dustCatalog.jezeroTau.lat, dustCatalog.jezeroTau.lon, tip);
      flatMap.invalidate();
    } else if (!(globe && globe.showRaster(frame.rgba, frame.spec.grid.width, frame.spec.grid.height))) {
      throw new Error('dust raster was not shown');
    }
    if (el.dustLs) {
      const from = dustBin * 30;
      el.dustLs.textContent = t('globe.dustLs', { from, to: from + 30 });
    }
    if (rebuildLegend || el.legendBody.dataset.product !== dustProduct) renderLegend();
    if (globe) onFrame(globe.camera);
  }

  function useFlat() {
    flat = true;
    el.stage.dataset.flat = '1';
    el.flat.hidden = false;
    el.canvas.hidden = true;
    activeLayer = 'dust';
    el.layerInputs.forEach((input) => { input.checked = input.value === 'dust'; input.disabled = input.value !== 'dust'; });
    return paintDust().catch((err) => { console.error(err); layerError = 'dust'; renderLegend(); });
  }

  function useGlobe() {
    if (!globe) return;
    flat = false;
    delete el.stage.dataset.flat;
    el.flat.hidden = true;
    el.canvas.hidden = false;
    el.layerInputs.forEach((input) => { input.disabled = false; });
    if (activeLayer === 'dust') paintDust().catch((err) => { console.error(err); layerError = 'dust'; renderLegend(); });
  }

  async function selectLayer(key) {
    if (flat && key !== 'dust') return;
    el.stage.dataset.loadingLayer = key;
    el.legendDesc.textContent = t('globe.loadingLayer', { layer: layerInfo(key).title });
    try {
      if (key === 'dust') {
        await paintDust(false);
        activeLayer = 'dust';
        layerError = null;
      } else {
        const ok = await globe.setLayer(key);
        if (!ok) return;
        activeLayer = key; layerError = null;
      }
    } catch (err) {
      console.error(err);
      layerError = key;
      el.layerInputs.forEach((input) => { input.checked = input.value === activeLayer; });
    } finally {
      delete el.stage.dataset.loadingLayer;
    }
    renderLegend();
    if (globe) onFrame(globe.camera);
  }

  function coordinate(value, pos, neg) { return `${Math.abs(value).toFixed(1).padStart(4, '0')}° ${value < -0.05 ? t(neg) : t(pos)}`; }

  function onFrame(camera) {
    el.coords.value = `${coordinate(camera.lat, 'dir.N', 'dir.S')} · ${coordinate(camera.lon, 'dir.E', 'dir.W')}`;
    const side = Math.min(el.canvas.clientWidth, el.canvas.clientHeight);
    if (side) {
      const kmPerPx = (2 * globe.perspective * (camera.distance - 1) * globe.marsRadiusKm) / side;
      const nominal = kmPerPx * 112, order = 10 ** Math.floor(Math.log10(nominal));
      const km = Math.max(...[1, 2, 5].filter((s) => s * order <= nominal)) * order;
      el.scaleText.value = `${km.toLocaleString(i18n.lang)} km`;
      el.scaleBar.style.width = `${(km / kmPerPx).toFixed(1)}px`;
    }
    el.zoomIn.disabled = camera.distance <= globe.range.min;
    el.zoomOut.disabled = camera.distance >= globe.range.max;
    const sample = globe.sampleCenter();
    el.detail.hidden = activeLayer !== 'mola' && activeLayer !== 'dust';
    if ('elevationKm' in sample) el.detail.value = t('globe.elevationKm', { km: sample.elevationKm.toFixed(1) });
    if (activeLayer === 'dust' && dustCatalog && dustVolumes.has(dustProduct)) {
      const spec = productSpec(dustCatalog, dustProduct);
      const byte = sampleVolume(dustVolumes.get(dustProduct), dustBin, camera.lat, camera.lon, spec.grid);
      if (spec.mode === 'frequency' && byte === FREQ_MISSING) el.detail.value = t('globe.dustMissing');
      else if (spec.mode === 'frequency') el.detail.value = t('globe.dustReadoutFreq', { value: byte });
      else {
        const ir = (byte * dustCatalog.cdod.scale).toFixed(2);
        const vis = (byte * dustCatalog.cdod.scale * (dustCatalog.cdod.visibleExtinctionFactor || VISIBLE_FROM_IR)).toFixed(2);
        const clipped = byte === 255 ? '≥' : '';
        el.detail.value = t('globe.dustReadoutCdod', { ir: clipped + ir, vis: clipped + vis });
      }
    }
    if ('unitIndex' in sample && el.unitNow && sample.unitIndex !== lastUnit) {
      lastUnit = sample.unitIndex;
      const u = meta.geology.units[sample.unitIndex - 1];
      clear(el.unitNow).append(...(u ? [h('span', { class: 'g-swatch', style: `background:${u.color}`, 'aria-hidden': 'true' }), `${u.code} · ${u[i18n.lang] ?? u.en}`] : [t('globe.noUnit')]));
      el.legendBody.querySelectorAll('[data-unit]').forEach((li) => li.toggleAttribute('aria-current', Number(li.dataset.unit) === sample.unitIndex));
    }
  }

  function enterMission() {
    if (!globe) { onEnterMission(); return; }
    showPlaces(false); showLayers(false); select('jezero');
    el.status.hidden = false;
    el.status.textContent = t('globe.flying');
    el.cta.disabled = true;
    globe.flyTo(JEZERO_APPROACH, () => { el.status.hidden = true; el.cta.disabled = false; onEnterMission(); });
  }

  setTexts();
  el.status.textContent = t('globe.loading');
  [el.placesToggle, el.reset, el.zoomIn, el.zoomOut, el.layersToggle].forEach((b) => { b.disabled = true; });
  if (preferFlat) useFlat();

  return {
    canvas: el.canvas,
    /** Connects the renderer once it started. */
    attach(g) {
      globe = g;
      globe.onFrame(onFrame);
      globe.onUserMove(() => select(null));
      el.status.hidden = true;
      [el.placesToggle, el.reset, el.zoomIn, el.zoomOut, el.layersToggle].forEach((b) => { b.disabled = false; });
      setTexts();
      onFrame(globe.camera);
    },
    fail(messageKey) { el.status.hidden = false; el.status.textContent = t(messageKey); },
    useFlat,
    showDustLayer() {
      const input = el.layerInputs.find((item) => item.value === 'dust');
      if (input) input.checked = true;
      return selectLayer('dust');
    },
    setTexts,
    focus() { el.cta.focus(); },
  };
}
