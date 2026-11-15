// Dust opacity and the seasonal maps. Numbers come from the published files
// (see app/data/dust/catalog.json). This module does not fill missing data.

export const CDOD_SCALE = 0.01;
export const VISIBLE_FROM_IR = 2.6;
export const FREQ_MISSING = 255;

// One colour per legend stop in catalog.json. Sequential, so a higher value is always lighter or warmer.
export const CDOD_COLORS = ['#16343f', '#1f6f6a', '#7eaa45', '#e0b043', '#d36a2c', '#f3e6d0'];
export const FREQ_COLORS = ['#241816', '#8a4632', '#d4722c', '#f0c14a', '#fff2d6'];
export const MISSING_COLOR = [90, 86, 82];

export function lsBinIndex(ls, binDeg = 30) {
  if (!Number.isFinite(ls)) return null;
  const n = Math.round(360 / binDeg);
  const wrapped = ((ls % 360) + 360) % 360;
  return Math.min(n - 1, Math.floor(wrapped / binDeg));
}

/** Nearest published cell. grid.lon0/lat0 are the coordinates of pixel (0, 0); row 0 is north. */
export function nearestCell(lat, lon, grid) {
  const lonWrapped = ((lon + 180) % 360 + 360) % 360 - 180;
  const x = Math.round((lonWrapped - grid.lon0) / grid.dlon);
  const width = grid.width;
  const col = ((x % width) + width) % width;
  const row = Math.max(0, Math.min(grid.height - 1, Math.round((grid.lat0 - lat) / Math.abs(grid.dlat))));
  return { col, row };
}

export function sampleVolume(bytes, band, lat, lon, grid) {
  const { col, row } = nearestCell(lat, lon, grid);
  const n = grid.width * grid.height;
  return bytes[band * n + row * grid.width + col];
}

/** Python 3 round(): half goes to the even integer. Used so medians match the builder. */
export function pythonRound(value) {
  const floor = Math.floor(value);
  const frac = value - floor;
  if (Math.abs(frac - 0.5) > 1e-9) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return pythonRound((sorted[mid - 1] + sorted[mid]) / 2);
}

export function solRecord(series, sol) {
  let lo = 0;
  let hi = series.sol.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = series.sol[mid];
    if (value === sol) return { sol, tauMilli: series.tau880milli[mid], ls: series.ls[mid], n: series.n[mid] };
    if (value < sol) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

/** Thousandths of τ880 for a weather scenario. Storm uses the maximum measured day; other scenarios use the background median. */
export function scenarioTauMilli(series, params, scenario) {
  const [from, to] = params.dust.backgroundSols;
  const [stormFrom, stormTo] = params.dust.stormSols;
  const background = [];
  const storm = [];
  for (let i = 0; i < series.sol.length; i++) {
    const sol = series.sol[i];
    const tau = series.tau880milli[i];
    if (sol >= stormFrom && sol <= stormTo) storm.push(tau);
    else if (sol >= from && sol <= to) background.push(tau);
  }
  if (scenario === 'storm') return storm.length ? Math.max(...storm) : null;
  return median(background);
}

export function selectDustTau(series, params, options) {
  const sol = options.dustSol;
  if (sol != null && sol !== '') {
    const n = Number(sol);
    if (!Number.isInteger(n)) return { tau: null, basis: 'sol-invalid', sol: n };
    const rec = solRecord(series, n);
    if (!rec) return { tau: null, basis: 'sol-missing', sol: n };
    return { tau: rec.tauMilli / 1000, tauMilli: rec.tauMilli, basis: 'sol', sol: n, ls: rec.ls, n: rec.n };
  }
  const milli = scenarioTauMilli(series, params, options.weatherScenario);
  if (milli == null) return { tau: null, basis: 'no-data', scenario: options.weatherScenario };
  return {
    tau: milli / 1000,
    tauMilli: milli,
    basis: options.weatherScenario === 'storm' ? 'storm-sols' : 'background-sols',
    scenario: options.weatherScenario,
  };
}

/** override null follows the threshold. true or false is the manual override. */
export function dustAlert({ tau, threshold, override }) {
  const auto = Number.isFinite(tau) && tau >= threshold;
  const manual = override === true || override === false;
  return {
    auto,
    active: manual ? override : auto,
    override: manual ? override : null,
    tau: Number.isFinite(tau) ? tau : null,
    threshold,
  };
}

export function applyDustAlert(params, series, options) {
  const picked = series ? selectDustTau(series, params, options) : { tau: null, basis: 'no-data' };
  const decision = dustAlert({
    tau: picked.tau,
    threshold: params.dust.alertTau880,
    override: options.dustAlertOverride ?? null,
  });
  return {
    options: { ...options, dustStormAlert: decision.active, dustTau: decision.tau, dustThreshold: decision.threshold },
    dustInfo: { ...picked, ...decision },
  };
}

export function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rampColor(stops, colors, value) {
  if (value <= stops[0]) return hexRgb(colors[0]);
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i]) {
      const span = stops[i] - stops[i - 1];
      const f = span === 0 ? 0 : (value - stops[i - 1]) / span;
      const a = hexRgb(colors[i - 1]);
      const b = hexRgb(colors[i]);
      return a.map((channel, k) => Math.round(channel + (b[k] - channel) * f));
    }
  }
  return hexRgb(colors[colors.length - 1]);
}

/** RGBA, row 0 = north, for one Ls bin of a uint8 volume. */
export function paintVolume({ bytes, grid, band, mode, stops, colors, scale = CDOD_SCALE, missing = FREQ_MISSING }) {
  const n = grid.width * grid.height;
  const rgba = new Uint8Array(n * 4);
  const offset = band * n;
  for (let i = 0; i < n; i++) {
    const sample = bytes[offset + i];
    const rgb = mode === 'frequency' && sample === missing
      ? MISSING_COLOR
      : rampColor(stops, colors, mode === 'frequency' ? sample : sample * scale);
    rgba.set(rgb, i * 4);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
