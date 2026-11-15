// AI-assisted (Claude). Reviewed by the MARS+ team.
// Weather (MEDA) and radiation (RAD) panels.
import { h, s, clear } from '../../shared/dom.js';
import { fmt } from '../../shared/format.js';
import { renderWeatherChart } from '../charts/weather-chart.js';
import { renderDoseChart } from '../charts/dose-chart.js';

const shareOfSol = (minutes) => minutes / (24 * 60);

export function createWeatherPanel(el, { i18n, data }) {
  let svg;
  function build() {
    const { t } = i18n;
    clear(el);
    svg = s('svg', { class: 'chart', role: 'img' });
    el.append(h('h2', {}, t('weather.title')), h('p', { class: 'lead' }, t('weather.lead')), svg,
      h('div', { class: 'legend' },
        h('span', {}, h('i', { class: 'ln', style: 'background:#e0a98b' }), t('weather.typical')),
        h('span', {}, h('i', { class: 'ln', style: 'background:repeating-linear-gradient(90deg,#c2a198 0 4px,transparent 4px 7px)' }), t('weather.worst')),
        h('span', {}, h('i', { class: 'sw', style: 'background:#4a3f3a' }), t('weather.wind')),
        h('span', {}, h('i', { class: 'ln', style: 'background:repeating-linear-gradient(90deg,#a2453e 0 3px,transparent 3px 7px)' }), t('weather.threshold'))),
      h('p', { class: 'note' }, t('weather.note')));
  }
  function update(state) {
    const rec = state.evaluation?.recommended;
    renderWeatherChart(svg, data.weather, { band: rec ? [rec.departure, rec.returnHour] : null, minC: state.planOptions.minGroundTempC, title: i18n.t('weather.title') });
  }
  return { build, update };
}

export function createRadiationPanel(el, { i18n, data }) {
  let svg, evaLine;
  const rad = data.radiation;
  function build() {
    const { t } = i18n;
    clear(el);
    svg = s('svg', { class: 'chart', role: 'img' });
    evaLine = h('p', { class: 'note', style: 'color:var(--text)' });
    el.append(h('h2', {}, t('radiation.title')), h('p', { class: 'lead' }, t('radiation.lead')), svg,
      h('div', { class: 'legend' },
        h('span', {}, h('i', { class: 'ln', style: 'background:repeating-linear-gradient(90deg,#9e8f88 0 3px,transparent 3px 7px)' }), t('radiation.background', { bg: fmt(rad.backgroundUGyH, 1) })),
        h('span', {}, h('i', { class: 'ln', style: 'background:#ff8a80' }), t('radiation.event', { max: fmt(rad.event.maxUGyH, 1), ratio: fmt(rad.event.maxUGyH / rad.backgroundUGyH, 1) }))),
      evaLine, h('p', { class: 'note' }, t('radiation.note')));
    renderDoseChart(svg, rad, t('radiation.title'));
  }
  function update(state) {
    const rec = state.evaluation?.recommended;
    evaLine.textContent = rec
      ? i18n.t('radiation.eva', { dose: fmt(rec.doseUGy, 0), outsideMin: fmt(rec.outsideMin, 0), share: fmt(shareOfSol(rec.outsideMin) * 100, 0) })
      : i18n.t('radiation.noEva');
  }
  return { build, update };
}
