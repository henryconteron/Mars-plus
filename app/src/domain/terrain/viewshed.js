// Geometric line of sight on the elevation grid. Heights above the surface are
// scenario assumptions (antenna and eye), not a radio propagation model.
// Row increases south, column increases east.

/**
 * True when the straight line between the two cell surfaces, raised by the
 * given heights, stays above the terrain in between.
 */
export function lineOfSight(z, cols, res, cosLat, from, to, fromHeight, toHeight) {
  if (!Number.isFinite(z[from]) || !Number.isFinite(z[to])) return false;
  const fc = from % cols, fr = Math.floor(from / cols);
  const tc = to % cols, tr = Math.floor(to / cols);
  const steps = Math.max(Math.abs(tc - fc), Math.abs(tr - fr));
  if (steps <= 1) return true;
  const z0 = z[from] + fromHeight;
  const z1 = z[to] + toHeight;
  const full = Math.hypot((tc - fc) * res * cosLat, (fr - tr) * res);
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const ci = Math.round(fc + (tc - fc) * t);
    const ri = Math.round(fr + (tr - fr) * t);
    const zi = z[ri * cols + ci];
    if (!Number.isFinite(zi)) return false;
    const along = Math.hypot((ci - fc) * res * cosLat, (fr - ri) * res);
    const zLine = z0 + (z1 - z0) * (full === 0 ? t : along / full);
    if (zi > zLine + 0.05) return false;
  }
  return true;
}

/** 1 = the cell can see `origin`. The origin cell is visible to itself. */
export function viewshedMask(z, rows, cols, res, cosLat, origin, originHeight, targetHeight) {
  const mask = new Uint8Array(rows * cols);
  if (!Number.isFinite(z[origin])) return mask;
  mask[origin] = 1;
  for (let i = 0; i < z.length; i++) {
    if (i === origin || !Number.isFinite(z[i])) continue;
    if (lineOfSight(z, cols, res, cosLat, origin, i, originHeight, targetHeight)) mask[i] = 1;
  }
  return mask;
}
