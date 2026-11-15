// AI-assisted (Claude). Reviewed by the MARS+ team.
import { s, clear } from '../../shared/dom.js';

const R = 3396190;
function cumulative(coords) {
  const d = [0], p = Math.PI / 180;
  for (let i = 1; i < coords.length; i++) {
    const [lo1, la1] = coords[i - 1], [lo2, la2] = coords[i];
    const x = (lo2 - lo1) * p * Math.cos(((la1 + la2) / 2) * p), y = (la2 - la1) * p;
    d.push(d[i - 1] + R * Math.hypot(x, y));
  }
  return d;
}

/** @param {SVGSVGElement} svg @param {{coords:number[][], color:string, dash?:string}[]} series */
export function renderElevationProfile(svg, series, title) {
  clear(svg);
  const W = 400, H = 120, m = { l: 44, r: 8, t: 10, b: 20 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.append(s('title', {}, title));
  const prepared = series.filter((x) => x.coords?.length > 1).map((x) => ({ ...x, d: cumulative(x.coords), z: x.coords.map((c) => c[2]) }));
  if (!prepared.length) return;
  const zs = prepared.flatMap((p) => p.z), z0 = Math.min(...zs), z1 = Math.max(...zs) + 0.01;
  const dmax = Math.max(...prepared.map((p) => p.d[p.d.length - 1]));
  const X = (v) => m.l + (v / dmax) * (W - m.l - m.r), Y = (v) => m.t + (1 - (v - z0) / (z1 - z0)) * (H - m.t - m.b);
  svg.append(s('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: '#3a302b' }));
  for (const v of [z0, (z0 + z1) / 2, z1]) svg.append(s('text', { x: m.l - 4, y: Y(v) + 3, 'text-anchor': 'end' }, v.toFixed(0)));
  for (const v of [0, dmax / 2, dmax]) svg.append(s('text', { x: X(v), y: H - 6, 'text-anchor': 'middle' }, `${v.toFixed(0)} m`));
  for (const p of prepared) {
    if (p.grades && p.steepDeg) {
      for (let i = 1; i < p.d.length; i++) {
        const steep = p.grades[i - 1] >= p.steepDeg;
        svg.append(s('line', {
          x1: X(p.d[i - 1]).toFixed(1), y1: Y(p.z[i - 1]).toFixed(1),
          x2: X(p.d[i]).toFixed(1), y2: Y(p.z[i]).toFixed(1),
          stroke: steep ? '#e0703a' : p.color, 'stroke-width': steep ? 2.4 : 1.6,
        }));
      }
    } else {
      svg.append(s('polyline', { fill: 'none', stroke: p.color, 'stroke-width': 1.6, 'stroke-dasharray': p.dash ?? null, points: p.d.map((v, i) => `${X(v).toFixed(1)},${Y(p.z[i]).toFixed(1)}`).join(' ') }));
    }
  }
}
