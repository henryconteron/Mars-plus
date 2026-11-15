// AI-assisted (Claude). Reviewed by the MARS+ team.
// User route A -> B, computed in the browser (Web Worker) over the 2 m terrain grid.
import { h, s, clear } from '../../shared/dom.js';
import { fmt } from '../../shared/format.js';
import { renderElevationProfile } from '../charts/elevation-profile.js';

export function createRoutePanel(el, { i18n, actions }) {
  let btnA, btnB, status, stats, svg, hourLabel;

  function build(state) {
    const { t } = i18n;
    clear(el);
    btnA = h('button', { type: 'button', class: 'btn', onclick: () => actions.pick('A') }, t('route.setA'));
    btnB = h('button', { type: 'button', class: 'btn', onclick: () => actions.pick('B') }, t('route.setB'));
    status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    stats = h('div', { class: 'stats' });
    svg = s('svg', { class: 'chart', role: 'img' });
    const sun = state.sun;
    const ls = h('input', { type: 'number', min: 0, max: 360, step: 1, value: sun.ls, 'aria-label': t('route.sunLs'), onchange: (e) => actions.setSun({ ls: Number(e.target.value) }) });
    const hour = h('input', { type: 'range', min: 0, max: 24, step: 0.5, value: sun.hour, 'aria-label': t('route.sunHour'), oninput: (e) => actions.setSun({ hour: Number(e.target.value) }) });
    hourLabel = h('span', {}, `${t('route.sunHour')} ${sun.hour}`);
    el.append(
      h('h2', {}, t('route.title')),
      h('p', { class: 'lead' }, t('route.help')),
      h('div', { class: 'field' }, h('label', {}, t('route.sunLs'), ' ', ls), h('label', {}, hourLabel, ' ', hour)),
      h('div', { class: 'btn-row' }, btnA, btnB,
        h('button', { type: 'button', class: 'btn', onclick: actions.useMission }, t('route.mission')),
        h('button', { type: 'button', class: 'btn', onclick: actions.clear }, t('route.clear'))),
      status, stats, svg,
    );
  }

  function update(state) {
    const { t } = i18n;
    btnA.setAttribute('aria-pressed', String(state.pick === 'A'));
    if (hourLabel && state.sun) hourLabel.textContent = `${t('route.sunHour')} ${state.sun.hour}`;
    btnB.setAttribute('aria-pressed', String(state.pick === 'B'));
    const rs = state.routeStatus;
    status.className = `status${rs.kind === 'error' ? ' bad' : ''}`;
    status.textContent =
      state.routingReady === 'error' ? t('route.terrainError')
        : state.pick === 'A' ? t('route.pickA') : state.pick === 'B' ? t('route.pickB')
        : rs.kind === 'computing' ? t(state.routingReady ? 'route.computing' : 'route.loadingTerrain')
        : !state.routingReady && rs.kind === 'idle' ? t('route.loadingTerrain')
          : rs.kind === 'error' ? t(`route.${rs.code}`)
            : rs.kind === 'done' ? t('route.done', { ms: rs.ms }) : '';
    clear(stats);
    const r = state.userRoute;
    svg.style.display = r ? '' : 'none';
    if (!r) return;
    const stat = (k, v) => h('div', { class: 'stat' }, h('div', { class: 'k' }, t(k)), h('div', { class: 'v' }, v));
    stats.append(
      stat('route.distance', `${fmt(r.distanceM)} m`), stat('route.time', `${fmt(r.timeMin, 1)} min`),
      stat('route.climbDescent', `+${fmt(r.climbM, 1)} / −${fmt(r.descentM, 1)}`), stat('route.dunes', `${fmt(r.largeDuneM)} m`),
      stat('route.maxSlope', `${fmt(r.maxSlopeDeg, 1)}°`), stat('route.rocks', `${fmt(r.maxRockFraction * 100)}%`));
    renderElevationProfile(svg, [{ coords: r.coords, color: '#f4f1ee' }], t('route.profile'));
  }

  return { build, update };
}
