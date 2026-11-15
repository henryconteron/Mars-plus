// AI-assisted (Claude). Reviewed by the MARS+ team.
// Turns an evaluation into structured statements ({code, values}); the UI translates them.
// Deterministic "why / why not" explanation — no AI involved at runtime.

export function explainEvaluation(evaluation) {
  const { results, recommended, closest } = evaluation;
  const out = [];
  if (recommended) {
    out.push({ code: 'recommended', values: { planId: recommended.planId, departure: recommended.departure, totalMin: recommended.totalMin, returnHour: recommended.returnHour, doseUGy: recommended.doseUGy } });
    const sameHour = results.filter((r) => r.departure === recommended.departure && r.planId !== recommended.planId && r.status === 'rejected');
    for (const r of sameHour) out.push({ code: 'whyNotPlan', values: { planId: r.planId, filter: r.filter, reason: r.reason } });
    out.push(...routeAlternatives(results, recommended));
    const windows = viableWindows(results, recommended.planId);
    if (windows.length) out.push({ code: 'departureWindow', values: { planId: recommended.planId, from: windows[0], to: windows[windows.length - 1] } });
  } else if (closest) {
    out.push({ code: 'postpone', values: { planId: closest.planId, departure: closest.departure, filter: closest.filter, reason: closest.reason } });
    out.push(...blockedEitherWay(results, closest));
  }
  const counts = {};
  for (const r of results) if (r.status === 'rejected') counts[r.filter] = (counts[r.filter] ?? 0) + 1;
  out.push({ code: 'filterCounts', values: { counts, total: results.length, viable: evaluation.viable.length } });
  return out;
}

function viableWindows(results, planId) {
  return results.filter((r) => r.planId === planId && r.status === 'viable').map((r) => r.departure).sort((a, b) => a - b);
}

/** Other plans at the chosen hour, each with the duration the filters already computed. */
function routeAlternatives(results, recommended) {
  const out = [];
  const others = results.filter((r) => r.departure === recommended.departure && r.planId !== recommended.planId && r.totalMin > 0);
  others.sort((a, b) => b.totalMin - a.totalMin);
  for (const r of others) {
    const delta = r.totalMin - recommended.totalMin;
    if (Math.abs(delta) <= 0.05) continue;
    out.push({
      code: 'alternativeRoute',
      values: {
        planId: r.planId,
        kind: delta > 0 ? 'longer' : 'shorter',
        status: r.status,
        totalMin: r.totalMin,
        returnHour: r.returnHour ?? null,
        doseUGy: r.status === 'viable' ? r.doseUGy : null,
        filter: r.filter,
        reason: r.reason,
        recommendedMin: recommended.totalMin,
        recommendedId: recommended.planId,
      },
    });
  }
  const previous = results
    .filter((r) => r.planId === recommended.planId && r.departure < recommended.departure && r.status === 'rejected')
    .sort((a, b) => b.departure - a.departure)[0];
  if (previous && (previous.filter === 4 || previous.filter === 5)) {
    out.push({
      code: 'shiftedDeparture',
      values: {
        planId: recommended.planId,
        fromHour: previous.departure,
        toHour: recommended.departure,
        totalMin: recommended.totalMin,
        returnHour: recommended.returnHour,
        doseUGy: recommended.doseUGy,
        filter: previous.filter,
        reason: previous.reason,
      },
    });
  }
  return out;
}

/**
 * Nothing is viable. Dust and solar alerts do not depend on path length.
 * A time or dose miss names the shortest plan that was actually timed.
 */
function blockedEitherWay(results, closest) {
  const code = closest.reason?.code;
  if (code === 'dustStorm' || code === 'solarEvent') {
    return [{
      code: 'noRouteEitherLength',
      values: {
        planId: closest.planId,
        departure: closest.departure,
        totalMin: closest.totalMin ?? null,
        filter: closest.filter,
        reason: closest.reason,
      },
    }];
  }
  if (code === 'overLimit' || code === 'doseOverLimit') {
    const timed = results.filter((r) => r.totalMin > 0);
    if (!timed.length) return [];
    const shortest = [...timed].sort((a, b) => a.totalMin - b.totalMin || a.departure - b.departure)[0];
    return [{
      code: 'shortestStillOver',
      values: {
        planId: shortest.planId,
        departure: shortest.departure,
        totalMin: shortest.totalMin,
        filter: shortest.filter,
        reason: shortest.reason,
      },
    }];
  }
  return [];
}
