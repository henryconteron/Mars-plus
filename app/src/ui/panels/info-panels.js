// AI-assisted (Claude). Reviewed by the MARS+ team.
// Static information panels: geology & science target, assumptions & limits, NASA data used.
import { h, clear } from '../../shared/dom.js';

const GEO = [
  ['largeDunes', '#cc8e37'], ['smallDunes', '#e0a98b'], ['seitah', '#a2453e'], ['maaz', '#7d6d6d'], ['other', '#4a3f3a'],
];

export function createGeologyPanel(el, { i18n }) {
  return {
    build() {
      const { t } = i18n;
      clear(el);
      el.append(h('h2', {}, t('geology.title')), h('p', { class: 'lead' }, t('geology.lead')),
        h('div', { class: 'legend' }, ...GEO.map(([k, c]) => h('span', {}, h('i', { class: 'sw', style: `background:${c};opacity:.85` }), t(`geo.${k}`)))),
        h('p', { class: 'note', style: 'color:var(--text)' }, t('geology.target')));
    },
    update() {},
  };
}

export function createAssumptionsPanel(el, { i18n, data }) {
  const p = data.params;
  return {
    build() {
      const { t, html } = i18n;
      clear(el);
      const items = [
        html('assumptions.speed', { speed: p.walking.source }),
        html('assumptions.sand', { sand: p.terrain.sources.sand }),
        html('assumptions.rocks', { rocks: p.terrain.sources.rocks }),
        html('assumptions.slope', { slope: p.terrain.sources.slope }),
        html('assumptions.eva', { airlock: p.eva.airlockMin, reserve: p.eva.reserveMin, photo: p.tasks.photo.minutes, sample: p.tasks.sample.minutes }),
        html('assumptions.weather', { minC: p.weather.minGroundTempC, maxMs: p.weather.maxMeanWindMs }),
        html('assumptions.dust', { tau: p.dust.alertTau880 }),
        html('assumptions.radiation', { rad: p.radiation.source }),
        html('assumptions.stops', { slope: p.workspace.maxSlopeDeg, dune: p.workspace.maxLargeDuneFraction }),
        t('assumptions.whole'),
      ];
      el.append(h('h2', {}, t('assumptions.title')), h('ul', { class: 'list' }, ...items.map((x) => h('li', { html: x }))));
    },
    update() {},
  };
}

const SOURCES = [
  ['HiRISE 1 m DTM & 25 cm orthoimage', 'USGS Astrogeology · Mars 2020 TRN mosaics', 'https://astrogeology.usgs.gov/search/map/mars-sample-return-terrain-relative-navigation-hirise-dtm-mosaic'],
  ['Mars Trek WMTS (HiRISE, CTX, THEMIS)', 'NASA/JPL Solar System Treks', 'https://trek.nasa.gov/mars/'],
  ['MEDA weather (Perseverance)', 'NASA PDS Atmospheres · DOI 10.17189/1522849', 'https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html'],
  ['Column dust optical depth, MY24–MY36', 'Montabone et al. 2015 and 2020 · CC BY-SA 3.0', 'https://doi.org/10.1016/j.icarus.2014.12.034'],
  ['Mars Dust Activity Database v1.1', 'Battalio and Wang · CC BY 4.0 · DOI 10.5281/zenodo.7480334', 'https://doi.org/10.5281/zenodo.7480334'],
  ['Mastcam-Z optical depth at Jezero', 'Lemmon · CC BY 4.0 · DOI 10.17632/gktjp9jptb.2', 'https://doi.org/10.1029/2022GL100126'],
  ['RAD dosimetry (Curiosity)', 'NASA PDS PPI · MSL-M-RAD-3-RDR-V1.0', 'https://pds-ppi.igpp.ucla.edu/data/MSL-M-RAD-3-RDR-V1.0/'],
  ['Perseverance traverse & waypoints', 'NASA MMGIS (M20)', 'https://science.nasa.gov/mission/mars-2020-perseverance/location-map/'],
  ['Photogeologic map of the Perseverance field site', 'Stack et al. 2020, Space Sci. Rev. (CC BY 4.0)', 'https://doi.org/10.1007/s11214-020-00739-x'],
  ['Samples Robine & Malay', 'NASA Mars rock samples catalog', 'https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples'],
];

export function createSourcesPanel(el, { i18n }) {
  return {
    build() {
      const { t } = i18n;
      clear(el);
      el.append(h('h2', {}, t('sources.title')),
        h('ul', { class: 'list' }, ...SOURCES.map(([name, who, url]) => h('li', {}, h('b', {}, name), ' — ', h('a', { href: url, target: '_blank', rel: 'noopener' }, who)))),
        h('p', { class: 'note' }, t('sources.ai')));
    },
    update() {},
  };
}
