// AI-assisted (Claude). Reviewed by the MARS+ team.
// Validation of the obstacle model against ground truth: Perseverance actually drove along its traverse,
// so terrain cells along it were passable. The share of those cells our model blocks is an upper bound
// on false obstacles. (Waypoints are end-of-drive positions joined by straight lines: approximate track.)

import { workspaceLimits } from '../terrain/workspace.js';

const MARS_R = 3396190;
const DEG = Math.PI / 180;

/**
 * @param {ReturnType<import('../terrain/cost.js').buildCostModel>} model
 * @param {number[][]} coords [lon, lat] of the rover traverse
 */
export function checkTraverse(model, coords) {
  const { grid, blocked, params } = model;
  const cells = new Set();
  let lengthInsideM = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lo1, la1] = coords[i - 1], [lo2, la2] = coords[i];
    const dx = (lo2 - lo1) * DEG * Math.cos(((la1 + la2) / 2) * DEG) * MARS_R, dy = (la2 - la1) * DEG * MARS_R;
    const len = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(len));
    for (let k = 0; k <= n; k++) {
      const c = grid.cellOf(lo1 + ((lo2 - lo1) * k) / n, la1 + ((la2 - la1) * k) / n);
      if (c < 0) continue;
      if (!cells.has(c)) { cells.add(c); lengthInsideM += len / n; }
    }
  }
  let blockedCells = 0, rockBlocked = 0, slopeBlocked = 0, largeDuneCells = 0;
  const duneLimit = workspaceLimits(params).maxLargeDuneFraction;
  for (const c of cells) {
    if (blocked[c]) blockedCells++;
    if (grid.rock[c] > params.terrain.rockBlockFraction) rockBlocked++;
    if (grid.slope[c] > params.terrain.slopeBlockDeg) slopeBlocked++;
    if (grid.duneLarge[c] > duneLimit) largeDuneCells++;
  }
  let areaBlocked = 0;
  for (let i = 0; i < grid.size; i++) if (blocked[i]) areaBlocked++;
  return {
    cellsInside: cells.size, lengthInsideM, blockedCells, rockBlocked, slopeBlocked, largeDuneCells,
    blockedShare: cells.size ? blockedCells / cells.size : 0, areaBlockedShare: areaBlocked / grid.size,
  };
}
