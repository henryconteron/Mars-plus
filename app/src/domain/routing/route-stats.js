// AI-assisted (Claude). Reviewed by the MARS+ team.
// Route statistics, computed exactly like RouteEngine.StatsJson.

import { edgeTime } from '../terrain/cost.js';

/**
 * @typedef {{distanceM:number,timeMin:number,climbM:number,descentM:number,maxSlopeDeg:number,
 *            largeDuneM:number,maxRockFraction:number,coords:number[][]}} RouteStats
 * @returns {RouteStats}
 */
export function routeStats(model, path) {
  const { grid } = model;
  const { cols, res, cosLat } = grid;
  let L = 0, T = 0, up = 0, down = 0, maxSlope = 0, dune = 0, maxRock = 0;
  const grades = [];
  const cumMin = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = ((b % cols) - (a % cols)) * res * cosLat;
    const dy = (Math.floor(b / cols) - Math.floor(a / cols)) * res;
    const len = Math.sqrt(dx * dx + dy * dy);
    L += len;
    T += edgeTime(model, a, b, len);
    const dz = grid.z[b] - grid.z[a];
    if (dz > 0) up += dz; else down -= dz;
    grades.push(len > 0 ? Math.atan2(Math.abs(dz), len) * 180 / Math.PI : 0);
    cumMin.push(T / 60);
    maxSlope = Math.max(maxSlope, grid.slope[b]);
    dune += len * grid.duneLarge[b];
    maxRock = Math.max(maxRock, grid.rock[b]);
  }
  return {
    distanceM: L, timeMin: T / 60, climbM: up, descentM: down, maxSlopeDeg: maxSlope,
    largeDuneM: dune, maxRockFraction: maxRock, coords: path.map((c) => grid.coordOf(c)),
    grades, cumMin,
  };
}
