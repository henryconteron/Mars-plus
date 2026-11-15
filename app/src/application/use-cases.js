// AI-assisted (Claude). Reviewed by the MARS+ team.
// Use cases. They depend on the domain and on ports, never on the DOM or on Leaflet.

import { evaluatePlans, defaultPlanOptions } from '../domain/plans/evaluate.js';
import { applyDustAlert } from '../domain/dust/dust.js';
import { explainEvaluation } from '../domain/explain/explain.js';
import { withLargeDuneFactor, largeDuneFactor } from '../domain/terrain/params.js';

/**
 * @param {{repository: import('./ports.js').SiteRepository, solver: import('./ports.js').RouteSolver}} deps
 */
export function createMissionService({ repository, solver }) {
  let site = null;
  let solverReady = null;

  const planInput = (legs) => ({ params: site.params, legs, stops: site.stops, weather: site.weather, radiation: site.radiation });

  /** Walking legs used by the plans, with their end points (landing, observation stop, sampling stop). */
  function legDefinitions() {
    const p = { landing: site.site.points.landing, observation: site.stops.observation, sampling: site.stops.sampling };
    const pt = (k) => ({ lon: p[k].lon, lat: p[k].lat });
    return ['landing_observation', 'observation_sampling', 'sampling_landing', 'landing_sampling', 'observation_landing']
      .map((id) => { const [from, to] = id.split('_'); return { id, from: pt(from), to: pt(to) }; });
  }

  return {
    /** Loads everything the first screen needs; terrain for A→B routing is loaded in the background. */
    async loadSite() {
      site = await repository.loadSite();
      solverReady = repository.loadTerrainBinary().then((buf) => solver.init(site.terrainMeta, buf, site.params));
      return site;
    },

    whenRoutingReady() { return solverReady; },

    /** Official legs at the primary resolution, keyed by id (used by the plan chain). */
    officialLegs(resM = site.routes.primaryResM) {
      return Object.fromEntries(site.routes.runs.filter((r) => r.resM === resM).map((r) => [r.id, r]));
    },

    defaultPlanOptions() { return defaultPlanOptions(site.params); },

    /** Evaluates every plan x departure through the filter chain and explains the outcome. */
    evaluate(options, legs = this.officialLegs()) {
      const applied = applyDustAlert(site.params, site.dust?.jezeroTau, options);
      const evaluation = evaluatePlans(planInput(legs), applied.options);
      return { evaluation, explanation: explainEvaluation(evaluation), dustInfo: applied.dustInfo };
    },

    /** Least-effort route between two points of the pilot area. */
    async computeRoute(a, b) {
      await solverReady;
      return solver.route(a, b);
    },

    /** Leg times for each sand factor (computed in the browser over the 2 m grid). Cached by the caller. */
    async sandSensitivity() {
      await solverReady;
      const defs = legDefinitions();
      const rows = [];
      for (const factor of site.params.sensitivity.largeDuneTimeFactors) {
        const res = await solver.legs(defs, withLargeDuneFactor(site.params, factor));
        rows.push({ factor, isModel: Math.abs(factor - largeDuneFactor(site.params)) < 1e-9, legs: res.ok ? res.legs : null });
      }
      return rows;
    },

    /** Obstacle model checked against Perseverance's real traverse. */
    async traverseValidation() {
      await solverReady;
      const res = await solver.validateTraverse(site.routes.roverPath.coords);
      return res.ok ? res.result : null;
    },
  };
}
