// AI-assisted (Claude). Reviewed by the MARS+ team.
// Shared routing core used by the Web Worker and by the main-thread fallback.

import { TerrainGrid } from '../../domain/terrain/grid.js';
import { buildCostModel } from '../../domain/terrain/cost.js';
import { findPath } from '../../domain/routing/astar.js';
import { routeStats } from '../../domain/routing/route-stats.js';
import { checkTraverse } from '../../domain/validation/traverse-check.js';

export function createRouteCore() {
  let grid = null, model = null;

  function routeOn(m, a, b) {
    const ca = m.grid.cellOf(a.lon, a.lat), cb = m.grid.cellOf(b.lon, b.lat);
    if (ca < 0 || cb < 0) return { ok: false, code: 'outside' };
    if (m.blocked[ca] || m.blocked[cb]) return { ok: false, code: 'blocked' };
    const res = findPath(m, ca, cb);
    if (!res) return { ok: false, code: 'noRoute' };
    return { ok: true, stats: routeStats(m, res.path) };
  }

  return {
    init(meta, buffer, params) { grid = new TerrainGrid(meta, buffer); model = buildCostModel(grid, params); },

    route(a, b, options) {
      if (!model) return { ok: false, code: 'notReady' };
      const t0 = performance.now();
      let m = model;
      if (options?.requireLineOfSight && options.mask) {
        const blocked = new Uint8Array(model.blocked);
        for (let i = 0; i < blocked.length; i++) if (!options.mask[i]) blocked[i] = 1;
        m = { ...model, blocked };
      }
      const r = routeOn(m, a, b);
      return r.ok ? { ...r, ms: Math.round(performance.now() - t0) } : r;
    },

    /** Times of several legs under alternative parameters (sensitivity). legs: [{id, from:{lon,lat}, to:{lon,lat}}] */
    legs(legs, params) {
      if (!grid) return { ok: false, code: 'notReady' };
      const m = buildCostModel(grid, params);
      const out = {};
      for (const leg of legs) {
        const r = routeOn(m, leg.from, leg.to);
        out[leg.id] = r.ok ? { timeMin: r.stats.timeMin, distanceM: r.stats.distanceM, largeDuneM: r.stats.largeDuneM } : { timeMin: NaN, code: r.code };
      }
      return { ok: true, legs: out };
    },

    /** Obstacle model checked against the rover's real traverse. */
    validateTraverse(coords) {
      if (!model) return { ok: false, code: 'notReady' };
      return { ok: true, result: checkTraverse(model, coords) };
    },
  };
}
