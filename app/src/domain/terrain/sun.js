// Mars solar geometry and shadows on an elevation grid.
// Declination uses the mean obliquity: δ = asin(sin ε sin Ls). LTST is local true solar
// time, so the hour angle is (LTST − 12) × 15° and the equation of time is not applied.
// Azimuth is degrees clockwise from north. Shadows are ray-marched toward the Sun.

const DEG = Math.PI / 180;

export function solarDeclinationDeg(lsDeg, obliquityDeg) {
  return Math.asin(Math.sin(obliquityDeg * DEG) * Math.sin(lsDeg * DEG)) / DEG;
}

/** @returns {{altitudeDeg:number, azimuthDeg:number, declinationDeg:number}} */
export function solarPosition(latDeg, lsDeg, ltstHour, obliquityDeg) {
  const dec = solarDeclinationDeg(lsDeg, obliquityDeg) * DEG;
  const lat = latDeg * DEG;
  const hour = (((ltstHour % 24) + 24) % 24);
  const H = (hour - 12) * 15 * DEG;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // atan2 form gives azimuth from south, positive toward the west.
  const azSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
  let azimuth = azSouth / DEG + 180;
  azimuth = ((azimuth % 360) + 360) % 360;
  return { altitudeDeg: altitude / DEG, azimuthDeg: azimuth, declinationDeg: dec / DEG };
}

/**
 * 1 = in shadow, 0 = lit. Missing elevation stays 0 and is not a shadow claim.
 * marchM is the farthest terrain the ray inspects.
 */
export function shadowMask(z, rows, cols, res, cosLat, sun, marchM) {
  const mask = new Uint8Array(rows * cols);
  if (!(sun.altitudeDeg > 0)) {
    for (let i = 0; i < z.length; i++) if (Number.isFinite(z[i])) mask[i] = 1;
    return mask;
  }
  const east = Math.sin(sun.azimuthDeg * DEG);
  const north = Math.cos(sun.azimuthDeg * DEG);
  const tanAlt = Math.tan(sun.altitudeDeg * DEG);
  const step = res;
  const steps = Math.max(1, Math.ceil(marchM / step));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const z0 = z[r * cols + c];
      if (!Number.isFinite(z0)) continue;
      for (let s = 1; s <= steps; s++) {
        const dist = s * step;
        const cc = c + (east * dist) / (res * cosLat);
        const rr = r - (north * dist) / res;
        const ci = Math.round(cc), ri = Math.round(rr);
        if (ri < 0 || ci < 0 || ri >= rows || ci >= cols) break;
        const zi = z[ri * cols + ci];
        if (!Number.isFinite(zi)) break;
        if (zi > z0 + dist * tanAlt) { mask[r * cols + c] = 1; break; }
      }
    }
  }
  return mask;
}
