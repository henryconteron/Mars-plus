// AI-assisted (Claude). Reviewed by the MARS+ team.
// Science-workspace acceptance. Thresholds come only from config/model-parameters.json
// (workspace.maxSlopeDeg, workspace.maxLargeDuneFraction). Bounds are inclusive:
// a slope equal to the limit, and a large-dune fraction equal to the limit, are acceptable.
// The same comparison is applied in pipeline/03-model/RouteEngine.cs (BestWorkspace).

export function workspaceLimits(params) {
  const w = params && params.workspace;
  const maxSlopeDeg = w && Number(w.maxSlopeDeg);
  const maxLargeDuneFraction = w && Number(w.maxLargeDuneFraction);
  if (!Number.isFinite(maxSlopeDeg) || !Number.isFinite(maxLargeDuneFraction)) {
    throw new Error('workspace thresholds missing from model parameters');
  }
  return { maxSlopeDeg, maxLargeDuneFraction };
}

/** @returns {boolean} true when both measurements are within the configured limits. */
export function isAcceptableWorkspace(maxSlopeDeg, largeDuneFraction, params) {
  const lim = workspaceLimits(params);
  return maxSlopeDeg <= lim.maxSlopeDeg && largeDuneFraction <= lim.maxLargeDuneFraction;
}

/**
 * Re-checks a stop's published criteria against the current parameters.
 * Missing fields are not treated as failures: the pipeline did not always export
 * the dune fraction. A value above its limit is a failure even if stop.ok is true.
 * Rock fraction uses terrain.rockBlockFraction (already the single source for blocking).
 */
export function workspaceRejects(criteria, params) {
  if (!criteria) return false;
  const lim = workspaceLimits(params);
  const rockLimit = params.terrain && Number(params.terrain.rockBlockFraction);
  if (Number.isFinite(criteria.maxSlopeDeg) && criteria.maxSlopeDeg > lim.maxSlopeDeg) return true;
  if (Number.isFinite(criteria.largeDuneFraction) && criteria.largeDuneFraction > lim.maxLargeDuneFraction) return true;
  if (Number.isFinite(criteria.rockFraction) && Number.isFinite(rockLimit) && criteria.rockFraction > rockLimit) return true;
  return false;
}
