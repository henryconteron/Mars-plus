// AI-assisted (Claude). Reviewed by the MARS+ team.
// Runs every candidate (plan x departure hour) through the filter chain and ranks the viable ones.

import { planCatalog } from './tasks.js';
import { FILTER_CHAIN } from './filters.js';
import { minutesOutside } from '../radiation/dose.js';

/**
 * @typedef {{limitMin:number, reserveMin:number, airlockMin:number, paceFactor:number,
 *            weatherScenario:'typical'|'worst'|'storm', dustStormAlert:boolean, solarEventAlert:boolean,
 *            minGroundTempC:number, maxMeanWindMs:number, maxDoseUGy:number, departureHours:number[]}} PlanOptions
 * @typedef {{planId:string, departure:number, status:'viable'|'rejected', filter:number|null,
 *            reason:{code:string,values:object}|null, travelMin?:number, workMin?:number, totalMin?:number,
 *            outsideMin?:number, returnHour?:number, doseUGy?:number}} PlanResult
 */

/** Default options built from model parameters. */
export function defaultPlanOptions(params) {
  return {
    limitMin: params.eva.limitMin,
    reserveMin: params.eva.reserveMin,
    airlockMin: params.eva.airlockMin,
    paceFactor: params.pace.normal,
    weatherScenario: 'typical',
    dustStormAlert: false,
    dustAlertOverride: null,
    dustSol: null,
    solarEventAlert: false,
    minGroundTempC: params.weather.minGroundTempC,
    maxMeanWindMs: params.weather.maxMeanWindMs,
    maxDoseUGy: params.radiation.maxDoseUGyPerEva,
    departureHours: params.eva.departureHours,
  };
}

/** @returns {PlanResult} */
export function evaluateCandidate(input, plan, departure, options) {
  const ctx = { ...input, plan, departure, options, travelMin: 0, workMin: 0, totalMin: 0, doseUGy: 0 };
  for (let i = 0; i < FILTER_CHAIN.length; i++) {
    const fail = FILTER_CHAIN[i](ctx);
    if (fail) return finalize(ctx, 'rejected', i + 1, fail);
  }
  return finalize(ctx, 'viable', null, null);
}

function finalize(ctx, status, filter, reason) {
  const r = { planId: ctx.plan.id, departure: ctx.departure, status, filter, reason };
  if (ctx.totalMin > 0) {
    r.travelMin = ctx.travelMin; r.workMin = ctx.workMin; r.totalMin = ctx.totalMin;
    r.outsideMin = minutesOutside(ctx.travelMin, ctx.workMin);
    r.returnHour = ctx.departure + ctx.totalMin / 60;
  }
  if (status === 'viable') r.doseUGy = ctx.doseUGy;
  return r;
}

/**
 * @param {{params:object, legs:Record<string,{timeMin:number}>, stops:object, weather:object, radiation:object}} input
 * @param {PlanOptions} options
 */
export function evaluatePlans(input, options) {
  const plans = planCatalog(input.params);
  const value = Object.fromEntries(plans.map((p) => [p.id, p.scienceValue]));
  const results = [];
  for (const plan of plans) for (const h of options.departureHours) results.push(evaluateCandidate(input, plan, h, options));

  const viable = results.filter((r) => r.status === 'viable')
    .sort((a, b) => value[b.planId] - value[a.planId] || a.totalMin - b.totalMin || a.departure - b.departure);
  let closest = null;
  if (!viable.length) {
    // Under an alert every candidate fails the same way; point to the plan that would work without the alerts.
    const withoutAlerts = (options.dustStormAlert || options.solarEventAlert)
      ? evaluatePlans(input, { ...options, dustStormAlert: false, solarEventAlert: false }).recommended : null;
    closest = withoutAlerts
      ? results.find((r) => r.planId === withoutAlerts.planId && r.departure === withoutAlerts.departure)
      : [...results].sort((a, b) => b.filter - a.filter || value[b.planId] - value[a.planId] || a.departure - b.departure)[0];
  }
  return { options, results, viable, recommended: viable[0] ?? null, closest };
}
