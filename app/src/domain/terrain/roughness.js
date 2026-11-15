// Multi-scale roughness from the stored elevation grid.
// Same statistic as RouteEngine.Roughness1m: mean absolute deviation from the window mean.
// The published grid is posted at 2 m, so a requested 5 m or 25 m baseline is the nearest
// odd window the posting can represent (6 m and 26 m). This does not change walking cost:
// the cost model already uses its own roughness band, and there is no cited multiplier
// that should be stacked on top of it.

/** @type {{id:string,radius:number,meters:number,requestedM:number}[]} */
export const ROUGHNESS_SCALES = [
  { id: 'rough6', radius: 1, meters: 6, requestedM: 5 },
  { id: 'rough10', radius: 2, meters: 10, requestedM: 10 },
  { id: 'rough26', radius: 6, meters: 26, requestedM: 25 },
];

/**
 * Mean absolute deviation of elevation (m) inside a square window.
 * Cells with too much missing elevation stay NaN. The border of `radius` cells is NaN.
 * @param {Float32Array} z
 */
export function meanAbsoluteDeviation(z, rows, cols, radius) {
  const out = new Float32Array(rows * cols);
  out.fill(NaN);
  const need = Math.ceil(((2 * radius + 1) ** 2) * 0.5);
  for (let r = radius; r < rows - radius; r++) {
    for (let c = radius; c < cols - radius; c++) {
      let sum = 0;
      let n = 0;
      for (let i = -radius; i <= radius; i++) {
        const row = (r + i) * cols;
        for (let j = -radius; j <= radius; j++) {
          const v = z[row + c + j];
          if (Number.isFinite(v)) { sum += v; n++; }
        }
      }
      if (n < need) continue;
      const mean = sum / n;
      let dev = 0;
      for (let i = -radius; i <= radius; i++) {
        const row = (r + i) * cols;
        for (let j = -radius; j <= radius; j++) {
          const v = z[row + c + j];
          if (Number.isFinite(v)) dev += Math.abs(v - mean);
        }
      }
      out[r * cols + c] = dev / n;
    }
  }
  return out;
}
