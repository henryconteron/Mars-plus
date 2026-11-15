// Dust maps and the Jezero alert. The grids are the published measurements, reduced;
// these checks fail if a bin, a sol or the threshold is filled in by hand.
import { test, assert, assertEqual } from './harness.js';
import {
  CDOD_COLORS, FREQ_COLORS, FREQ_MISSING, VISIBLE_FROM_IR,
  applyDustAlert, lsBinIndex, nearestCell, paintVolume, sampleVolume, scenarioTauMilli, solRecord,
} from '../app/src/domain/dust/dust.js';
import { productSpec } from '../app/src/infrastructure/dust/load-dust.js';
import { evaluatePlans, defaultPlanOptions } from '../app/src/domain/plans/evaluate.js';
import { loadSiteFixture } from './fixtures.js';

const BASE = '../app/data/dust/';

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function gunzip(url) {
  const response = await fetch(url);
  assert(response.ok, `${url}: HTTP ${response.status}`);
  const buffer = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return new Uint8Array(buffer);
}

const catalog = () => fetch(`${BASE}catalog.json`).then((r) => r.json());

test('dust: catalog names the licences, papers and rejected sources', async () => {
  const c = await catalog();
  const byId = Object.fromEntries(c.provenance.map((p) => [p.id, p]));
  assertEqual(byId['montabone-cdod'].license, 'CC BY-SA 3.0');
  assertEqual(byId['montabone-cdod'].used, true);
  assert(byId['montabone-cdod'].papers.some((p) => p.doi === '10.1016/j.icarus.2014.12.034'), 'Montabone 2015 doi');
  assert(byId['montabone-cdod'].papers.some((p) => p.doi === '10.1029/2019JE006111'), 'Montabone 2020 doi');
  assertEqual(byId.mdad.license, 'CC BY 4.0');
  assertEqual(byId.mdad.datasetDoi, '10.5281/zenodo.7480334');
  assertEqual(byId['mastcamz-tau'].license, 'CC BY 4.0');
  assertEqual(byId['mastcamz-tau'].datasetDoi, '10.17632/gktjp9jptb.2');
  assertEqual(byId['mcd-dust-scenarios'].used, false);
  assertEqual(byId['meda-derived-opacity'].used, false);
  assertEqual(c.retrieved, '2026-11-15');
  assertEqual(c.cdod.visibleExtinctionFactor, VISIBLE_FROM_IR);
  assert(c.cdod.colorStops.length === CDOD_COLORS.length, 'optical-depth legend matches the ramp');
  assert(c.frequency.colorStops.length === FREQ_COLORS.length, 'frequency legend matches the ramp');
});

test('dust: published grids match the catalog hash and size', async () => {
  const c = await catalog();
  for (const spec of [productSpec(c, 'climatology'), productSpec(c, 'my34'), productSpec(c, 'frequency')]) {
    const raw = await fetch(BASE + spec.file).then((r) => r.arrayBuffer());
    const digest = await sha256(raw);
    const recorded = spec.mode === 'frequency' ? c.frequency.file : (spec.file.startsWith('cdod-my34') ? c.my34 : c.cdod.file);
    assertEqual(digest, recorded.sha256, spec.file);
    assertEqual(raw.byteLength, recorded.bytes, spec.file);
    const bytes = await gunzip(BASE + spec.file);
    assertEqual(bytes.length, spec.grid.width * spec.grid.height * c.lsBinStarts.length, spec.file);
  }
});

test('dust: Ls bins wrap and the Jezero cell is the published one', async () => {
  const c = await catalog();
  assertEqual(lsBinIndex(0, 30), 0);
  assertEqual(lsBinIndex(29.9, 30), 0);
  assertEqual(lsBinIndex(30, 30), 1);
  assertEqual(lsBinIndex(359.9, 30), 11);
  assertEqual(lsBinIndex(-10, 30), 11);
  assertEqual(lsBinIndex(154, 30), 5);
  const cell = nearestCell(c.jezeroTau.lat, c.jezeroTau.lon, c.cdod.grid);
  assertEqual(cell.row, c.cdod.jezero.latIndex);
  assertEqual(cell.col, c.cdod.jezero.lonIndex);
  const freq = nearestCell(c.jezeroTau.lat, c.jezeroTau.lon, c.frequency.grid);
  assertEqual(freq.row, c.frequency.jezero.latIndex);
  assertEqual(freq.col, c.frequency.jezero.lonIndex);
});

test('dust: seasonal means keep the published shape and the 2018 storm', async () => {
  const c = await catalog();
  const clim = c.cdod.globalMeanByBin.climatology;
  const my34 = c.cdod.globalMeanByBin.my34;
  assert(clim[2] < clim[8], 'perihelion (Ls 240-270) is dustier than aphelion (Ls 60-90)');
  assert(my34[6] > clim[6] * 2, 'MY34 Ls 180-210 is well above the typical year');
  assert(c.cdod.stormWindowMax['34'] > 2, 'MY34 storm core exceeds 2');
  assert(c.cdod.stormWindowMean['25'] > 0.4, 'MY25 storm window stays elevated');
  const bytes = await gunzip(BASE + c.cdod.file.file);
  const byte = sampleVolume(bytes, 2, c.jezeroTau.lat, c.jezeroTau.lon, c.cdod.grid);
  const full = c.cdod.jezero.climatologyCdod610[2];
  assert(Math.abs(byte * c.cdod.scale - full) <= c.cdod.scale / 2 + 1e-6, `Jezero aphelion byte ${byte} vs ${full}`);
});

test('dust: storm frequency is observed sols only, and the dust season is busier', async () => {
  const c = await catalog();
  assert(c.frequency.southDustSeasonMeanPercent > c.frequency.quietTropicsMeanPercent, 'southern dust season is busier');
  const bytes = await gunzip(BASE + c.frequency.file.file);
  // Ls 0-30 was not observed in every year; a missing Jezero percent is 255 in the grid, never a made-up zero.
  const bin = c.frequency.jezero.percent.findIndex((v) => v == null);
  if (bin >= 0) {
    const byte = sampleVolume(bytes, bin, c.jezeroTau.lat, c.jezeroTau.lon, c.frequency.grid);
    assertEqual(byte, FREQ_MISSING);
    assertEqual(c.frequency.jezero.observedSols[bin], 0);
  }
  const rgba = paintVolume({ bytes, grid: c.frequency.grid, band: 0, mode: 'frequency', stops: c.frequency.colorStops, colors: FREQ_COLORS });
  assertEqual(rgba.length, c.frequency.grid.width * c.frequency.grid.height * 4);
});

test('dust: Mastcam-Z sols are the measured ones, including the gap on sol 313', async () => {
  const c = await catalog();
  const series = c.jezeroTau;
  assertEqual(solRecord(series, 313), null);
  assertEqual(solRecord(series, 314).tauMilli, 639);
  assertEqual(solRecord(series, 316).tauMilli, 1376);
  assertEqual(solRecord(series, 317).tauMilli, 1342);
  assertEqual(solRecord(series, 286).n, 2);
  const params = { dust: { backgroundSols: [286, 339], stormSols: [313, 317], alertTau880: 1 } };
  assertEqual(scenarioTauMilli(series, params, 'storm'), 1376);
  assertEqual(scenarioTauMilli(series, params, 'typical'), series.backgroundMedianMilli);
  assert(series.backgroundMedianMilli < 1000, 'background median is below the threshold');
  assert(series.backgroundMaxMilli < 1000, 'no non-storm Issole day reaches the threshold');
  assert(series.stormMaxMilli >= 1000, 'the storm peak reaches the threshold');
});

test('dust: the alert follows τ880 unless the crew overrides it', async () => {
  const [c, site] = await Promise.all([catalog(), loadSiteFixture()]);
  const series = c.jezeroTau;
  const params = site.params;
  assertEqual(params.dust.alertTau880, 1);
  const storm = applyDustAlert(params, series, { ...defaultPlanOptions(params), weatherScenario: 'storm' });
  assertEqual(storm.dustInfo.basis, 'storm-sols');
  assert(storm.dustInfo.auto && storm.dustInfo.active, 'storm scenario turns the alert on');
  assertEqual(storm.options.dustStormAlert, true);
  const typical = applyDustAlert(params, series, defaultPlanOptions(params));
  assertEqual(typical.dustInfo.active, false);
  assertEqual(typical.dustInfo.basis, 'background-sols');
  const worst = applyDustAlert(params, series, { ...defaultPlanOptions(params), weatherScenario: 'worst' });
  assertEqual(worst.dustInfo.tauMilli, typical.dustInfo.tauMilli, 'worst weather does not invent a dustier day');
  const early = applyDustAlert(params, series, { ...defaultPlanOptions(params), dustSol: 314 });
  assertEqual(early.dustInfo.active, false, 'sol 314 is still under the threshold');
  const peak = applyDustAlert(params, series, { ...defaultPlanOptions(params), dustSol: 316 });
  assertEqual(peak.dustInfo.active, true);
  const gap = applyDustAlert(params, series, { ...defaultPlanOptions(params), dustSol: 313 });
  assertEqual(gap.dustInfo.basis, 'sol-missing');
  assertEqual(gap.dustInfo.tau, null);
  assertEqual(gap.dustInfo.active, false, 'a missing sol does not invent a tau');
  const forcedOff = applyDustAlert(params, series, { ...defaultPlanOptions(params), weatherScenario: 'storm', dustAlertOverride: false });
  assertEqual(forcedOff.dustInfo.auto, true);
  assertEqual(forcedOff.dustInfo.active, false);
  const input = { params, legs: site.legs, stops: site.stops, weather: site.weather, radiation: site.radiation };
  const postponed = evaluatePlans(input, { ...storm.options, limitMin: 210 });
  assertEqual(postponed.recommended, null);
  assertEqual(postponed.closest.reason.code, 'dustStorm');
  assertEqual(postponed.closest.reason.values.tau, storm.dustInfo.tau);
});
