// Dijkstra times on the same 8-neighbour graph as A*.
// reverse=false: seconds from `source` to each cell.
// reverse=true: seconds from each cell back to `source` (the edge is walked uphill the other way).

import { MinHeap } from './min-heap.js';
import { edgeTime } from '../terrain/cost.js';

const DR = [-1, -1, -1, 0, 0, 1, 1, 1];
const DC = [-1, 0, 1, -1, 1, -1, 0, 1];

export function timeField(model, source, reverse = false) {
  const { grid, blocked } = model;
  const { rows, cols, res, cosLat } = grid;
  const n = grid.size;
  const g = new Float64Array(n);
  g.fill(Infinity);
  if (source < 0 || source >= n || blocked[source]) return g;
  const stepLen = DR.map((dr, q) => Math.hypot(DC[q] * res * cosLat, dr * res));
  const open = new MinHeap();
  const closed = new Uint8Array(n);
  g[source] = 0;
  open.push(0, source);
  while (open.size > 0) {
    const u = open.pop();
    if (closed[u]) continue;
    closed[u] = 1;
    const ur = Math.floor(u / cols), uc = u % cols;
    for (let q = 0; q < 8; q++) {
      const vr = ur + DR[q], vc = uc + DC[q];
      if (vr < 1 || vc < 1 || vr >= rows - 1 || vc >= cols - 1) continue;
      const v = vr * cols + vc;
      if (closed[v] || blocked[v]) continue;
      if (DR[q] !== 0 && DC[q] !== 0 && (blocked[ur * cols + vc] || blocked[vr * cols + uc])) continue;
      const cost = reverse ? edgeTime(model, v, u, stepLen[q]) : edgeTime(model, u, v, stepLen[q]);
      const ng = g[u] + cost;
      if (ng < g[v]) { g[v] = ng; open.push(ng, v); }
    }
  }
  return g;
}

/** Round trip from `origin` within budgetS, using out and back because slope is directional. */
export function reachabilityMask(model, origin, budgetS) {
  const out = timeField(model, origin, false);
  const back = timeField(model, origin, true);
  const mask = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) if (out[i] + back[i] <= budgetS) mask[i] = 1;
  return mask;
}

/** Cells whose via-time is at most (1+factor) times the optimal A→B time. */
export function corridorMask(model, start, goal, factor) {
  const fromStart = timeField(model, start, false);
  const toGoal = timeField(model, goal, true);
  const optimal = fromStart[goal];
  const mask = new Uint8Array(fromStart.length);
  if (!Number.isFinite(optimal)) return mask;
  const limit = optimal * (1 + factor);
  for (let i = 0; i < fromStart.length; i++) if (fromStart[i] + toGoal[i] <= limit) mask[i] = 1;
  return mask;
}
