// AI-assisted (Claude). Reviewed by the MARS+ team.
// GO/NO-GO edges: inclusive thresholds, hour boundary, dose = surface time only,
// workspace limits from config, and the viable-plan tie break.
import { test, assert, assertEqual, assertClose } from './harness.js';
import { buildCostModel } from '../app/src/domain/terrain/cost.js';
import { checkWeatherWindow } from '../app/src/domain/weather/window.js';
import { minutesOutside, evaDoseUGy } from '../app/src/domain/radiation/dose.js';
import { isAcceptableWorkspace, workspaceLimits, workspaceRejects } from '../app/src/domain/terrain/workspace.js';
import { FILTER_CHAIN } from '../app/src/domain/plans/filters.js';
import { evaluatePlans, defaultPlanOptions } from '../app/src/domain/plans/evaluate.js';
import { loadSiteFixture } from './fixtures.js';

function cell(over) {
  return { size: 1, z: [0], slope: [0], rock: [0], rough: [0], duneLarge: [0], duneSmall: [0], ...over };
}

function flatWeather() {
  const hours = [];
  for (let h = 0; h < 24; h++) {
    hours.push({ h, typical: { tempC: 0, windMs: 1 }, worst: { tempC: 0, windMs: 1 }, storm: { tempC: 0, windMs: 1 } });
  }
  return { hours };
}

function baseParams(extra = {}) {
  return {
    walking: { toblerFactor: 0.5 },
    pace: { slow: 1.4, normal: 1, fast: 0.8 },
    terrain: { slopeBlockDeg: 20, rockBlockFraction: 0.12, roughnessRefM: 0.25, largeDuneExtra: 1, smallDuneExtra: 0.3, rockMult: 6 },
    workspace: { maxSlopeDeg: 10, maxLargeDuneFraction: 0.5 },
    eva: { airlockMin: 20, reserveMin: 15, limitMin: 180, departureHours: [6, 7] },
    weather: { minGroundTempC: -20, maxMeanWindMs: 8 },
    radiation: { maxDoseUGyPerEva: 500 },
    tasks: {
      photo: { minutes: 25, stop: 'observation' },
      sample: { minutes: 50, stop: 'sampling' },
    },
    plans: [
      { id: 'A', tasks: ['photo'], scienceValue: 2 },
      { id: 'B', tasks: ['sample'], scienceValue: 2 },
    ],
    ...extra,
  };
}

const legs = {
  landing_observation: { timeMin: 40 },
  observation_landing: { timeMin: 40 },
  landing_sampling: { timeMin: 10 },
  sampling_landing: { timeMin: 10 },
};

const stops = {
  observation: { ok: true, criteria: { maxSlopeDeg: 10, largeDuneFraction: 0.5, rockFraction: 0.12 } },
  sampling: { ok: true, criteria: { maxSlopeDeg: 4, largeDuneFraction: 0, rockFraction: 0 } },
};

function evaluate(params, overrides = {}, custom = {}) {
  const input = {
    params,
    legs: custom.legs || legs,
    stops: custom.stops || stops,
    weather: custom.weather || flatWeather(),
    radiation: { backgroundUGyH: 12 },
  };
  return evaluatePlans(input, { ...defaultPlanOptions(params), ...overrides });
}

test('criteria: published parameter values match the stated GO/NO-GO thresholds', async () => {
  const { params } = await loadSiteFixture();
  assertEqual(params.terrain.slopeBlockDeg, 20);
  assertEqual(params.terrain.rockBlockFraction, 0.12);
  assertEqual(params.walking.toblerFactor, 0.5);
  assertEqual(params.terrain.largeDuneExtra, 1);
  assertEqual(params.terrain.rockMult, 6);
  assertEqual(params.eva.limitMin, 180);
  assertEqual(params.eva.airlockMin, 20);
  assertEqual(params.eva.reserveMin, 15);
  assertEqual(params.tasks.photo.minutes, 25);
  assertEqual(params.tasks.sample.minutes, 50);
  assertEqual(params.weather.minGroundTempC, -20);
  assertEqual(params.weather.maxMeanWindMs, 8);
  assertEqual(params.radiation.maxDoseUGyPerEva, 500);
  assertEqual(params.workspace.maxSlopeDeg, 10);
  assertEqual(params.workspace.maxLargeDuneFraction, 0.5);
  assertEqual(params.eva.departureHours[0], 6);
  assertEqual(params.eva.departureHours[params.eva.departureHours.length - 1], 17);
  assertEqual(params.eva.departureHours.length, 12);
  assert(!params.eva.departureHours.includes(5) && !params.eva.departureHours.includes(18), 'hours 5 and 18 are outside the window');
});

test('criteria: filter order is terrain, science, time, weather, radiation', () => {
  assertEqual(FILTER_CHAIN.map((f) => f.name).join(','), 'terrainFilter,scienceFilter,timeFilter,weatherFilter,radiationFilter');
});

test('criteria: a missing leg fails terrain and does not reach a zero dose limit', () => {
  const params = baseParams();
  const e = evaluate(params, { maxDoseUGy: 0, limitMin: 1 }, { legs: {} });
  const row = e.results.find((r) => r.planId === 'A' && r.departure === 6);
  assertEqual(row.filter, 1);
  assertEqual(row.reason.code, 'noRoute');
  assertEqual(row.doseUGy, undefined);
});

test('terrain: slope 20° and rock fraction 0.12 are walkable; anything above is blocked', async () => {
  const { params } = await loadSiteFixture();
  assertEqual(buildCostModel(cell({ slope: [20], rock: [0.12] }), params).blocked[0], 0);
  assertEqual(buildCostModel(cell({ slope: [20.01] }), params).blocked[0], 1);
  assertEqual(buildCostModel(cell({ rock: [0.12001] }), params).blocked[0], 1);
  assertEqual(buildCostModel(cell({ z: [NaN] }), params).blocked[0], 1);
});

test('terrain: full large dune is x2, full small dune is x1.3, rock 0.1 is x1.6', async () => {
  const { params } = await loadSiteFixture();
  assertClose(buildCostModel(cell({ duneLarge: [1] }), params).mult[0], 2, 1e-6);
  assertClose(buildCostModel(cell({ duneSmall: [1] }), params).mult[0], 1.3, 1e-6);
  assertClose(buildCostModel(cell({ rock: [0.1] }), params).mult[0], 1.6, 1e-6);
});

test('workspace: limits come from parameters and the bounds are inclusive', async () => {
  const { params } = await loadSiteFixture();
  const lim = workspaceLimits(params);
  assertEqual(lim.maxSlopeDeg, 10);
  assertEqual(lim.maxLargeDuneFraction, 0.5);
  assert(isAcceptableWorkspace(10, 0.5, params), 'slope 10 and dune 0.5 are acceptable');
  assert(!isAcceptableWorkspace(10.01, 0.5, params), 'slope above 10 is not a workspace');
  assert(!isAcceptableWorkspace(10, 0.50001, params), 'dune fraction above 0.5 is not a workspace');
  let threw = false;
  try { workspaceLimits({}); } catch { threw = true; }
  assert(threw, 'missing workspace thresholds must throw');
});

test('workspace: the science filter re-checks criteria even when stop.ok is true', () => {
  const params = baseParams({ plans: [{ id: 'A', tasks: ['photo'], scienceValue: 1 }], eva: { airlockMin: 20, reserveMin: 15, limitMin: 180, departureHours: [10] } });
  const steep = evaluate(params, {}, { stops: { observation: { ok: true, criteria: { maxSlopeDeg: 10.1, largeDuneFraction: 0.5 } } } });
  assertEqual(steep.results[0].filter, 2);
  assertEqual(steep.results[0].reason.code, 'noWorkspace');
  const dune = evaluate(params, {}, { stops: { observation: { ok: true, criteria: { maxSlopeDeg: 10, largeDuneFraction: 0.51 } } } });
  assertEqual(dune.results[0].reason.code, 'noWorkspace');
  const rocky = evaluate(params, {}, { stops: { observation: { ok: true, criteria: { maxSlopeDeg: 4, rockFraction: 0.13 } } } });
  assertEqual(rocky.results[0].reason.code, 'noWorkspace');
  const edge = evaluate(params, {}, { stops: { observation: { ok: true, criteria: { maxSlopeDeg: 10, largeDuneFraction: 0.5, rockFraction: 0.12 } } } });
  assertEqual(edge.results[0].status, 'viable');
  assert(workspaceRejects({ maxSlopeDeg: 4.5 }, params) === false, 'a stop without a dune field is not rejected');
});

test('dose: surface time is travel + work, not airlock or reserve', () => {
  assertEqual(minutesOutside(70, 50), 120);
  assertClose(evaDoseUGy(11.88, 120), 23.76, 1e-12);
  const params = baseParams();
  const slow = evaluate(params, { limitMin: 500, airlockMin: 20, reserveMin: 15 });
  const other = evaluate(params, { limitMin: 500, airlockMin: 5, reserveMin: 0 });
  const a = slow.results.find((r) => r.planId === 'B' && r.departure === 6);
  const b = other.results.find((r) => r.planId === 'B' && r.departure === 6);
  assertEqual(a.status, 'viable');
  assertClose(a.outsideMin, a.travelMin + a.workMin, 1e-12);
  assertClose(a.totalMin - a.outsideMin, 35, 1e-9);
  assertClose(b.totalMin - b.outsideMin, 5, 1e-9);
  assertClose(a.doseUGy, b.doseUGy, 1e-12);
  assertClose(a.doseUGy, 12 * a.outsideMin / 60, 1e-12);
  assert(Math.abs(a.doseUGy - 12 * a.totalMin / 60) > 1, 'dose must not use the full EVA clock');
});

test('dose: the limit is inclusive and uses surface minutes', () => {
  const params = baseParams({ plans: [{ id: 'B', tasks: ['sample'], scienceValue: 2 }] });
  const open = evaluate(params, { limitMin: 500, maxDoseUGy: 1e9, departureHours: [10] });
  const row = open.results.find((r) => r.status === 'viable');
  const exact = evaluate(params, { limitMin: 500, maxDoseUGy: row.doseUGy, departureHours: [10] });
  assertEqual(exact.results[0].status, 'viable');
  const under = evaluate(params, { limitMin: 500, maxDoseUGy: row.doseUGy - 0.01, departureHours: [10] });
  assertEqual(under.results[0].reason.code, 'doseOverLimit');
  assertEqual(under.results[0].filter, 5);
});

test('dose: the real Plan C exposure excludes the 35 min of airlock and reserve', async () => {
  const f = await loadSiteFixture();
  const e = evaluatePlans(
    { params: f.params, legs: f.legs, stops: f.stops, weather: f.weather, radiation: f.radiation },
    defaultPlanOptions(f.params),
  );
  const rec = e.recommended;
  assertEqual(rec.planId, 'C');
  assertClose(rec.totalMin - rec.outsideMin, f.params.eva.airlockMin + f.params.eva.reserveMin, 1e-6);
  assertClose(rec.doseUGy, f.radiation.backgroundUGyH * rec.outsideMin / 60, 1e-9);
  assert(rec.doseUGy < f.radiation.backgroundUGyH * rec.totalMin / 60, 'surface dose is below the old full-clock dose');
});

test('time: the EVA limit is inclusive', () => {
  const params = baseParams({ plans: [{ id: 'B', tasks: ['sample'], scienceValue: 2 }] });
  const open = evaluate(params, { limitMin: 500, departureHours: [10] });
  const total = open.results[0].totalMin;
  assertEqual(evaluate(params, { limitMin: total, departureHours: [10] }).results[0].status, 'viable');
  const over = evaluate(params, { limitMin: total - 0.01, departureHours: [10] }).results[0];
  assertEqual(over.filter, 3);
  assertEqual(over.reason.code, 'overLimit');
});

test('weather: temperature -20 °C and wind 8 m/s pass; the next step fails', () => {
  const hours = flatWeather().hours;
  hours[10] = { h: 10, typical: { tempC: -20, windMs: 8 }, worst: { tempC: -20, windMs: 8 }, storm: { tempC: -20, windMs: 8 } };
  const weather = { hours };
  const lim = { minGroundTempC: -20, maxMeanWindMs: 8 };
  assertEqual(checkWeatherWindow(weather, 'typical', 10, 30, lim), null);
  hours[10].typical.tempC = -20.01;
  assertEqual(checkWeatherWindow(weather, 'typical', 10, 30, lim).code, 'tooCold');
  hours[10].typical.tempC = -20;
  hours[10].typical.windMs = 8.01;
  assertEqual(checkWeatherWindow(weather, 'typical', 10, 30, lim).code, 'tooWindy');
});

test('weather: an exact return on the hour does not include that hour; float dust does not either', () => {
  const weather = flatWeather();
  weather.hours[11].typical = { tempC: -40, windMs: 1 };
  const lim = { minGroundTempC: -20, maxMeanWindMs: 8 };
  assertEqual(checkWeatherWindow(weather, 'typical', 10, 60, lim), null);
  assertEqual(checkWeatherWindow(weather, 'typical', 10, 60 + 1e-8, lim), null);
  assertEqual(checkWeatherWindow(weather, 'typical', 10, 61, lim).code, 'tooCold');
  assertEqual(checkWeatherWindow(weather, 'typical', 10, 61, lim).values.hour, 11);
});

test('weather: real MEDA edges — hour 16 wind of 8 m/s, storm gaps, and indexed hours', async () => {
  const { weather, params } = await loadSiteFixture();
  weather.hours.forEach((row, i) => assertEqual(row.h, i));
  assertEqual(weather.hours[16].worst.windMs, 8);
  const lim = params.weather;
  assertEqual(checkWeatherWindow(weather, 'typical', 16, 30, lim), null);
  assertEqual(checkWeatherWindow(weather, 'typical', 16, 60, lim), null);
  assertEqual(checkWeatherWindow(weather, 'typical', 16, 61, lim).code, 'tooCold');
  assertEqual(checkWeatherWindow(weather, 'worst', 16, 30, lim).code, 'tooCold');
  assertEqual(weather.hours[14].storm.windMs, null);
  assertEqual(checkWeatherWindow(weather, 'storm', 14, 30, lim).code, 'noWeatherData');
  assertEqual(checkWeatherWindow(weather, 'storm', 9, 30, lim).code, 'tooCold');
  assertEqual(checkWeatherWindow(weather, 'storm', 10, 30, lim), null);
});

test('ranking: higher science beats a shorter plan; equal plans take the earlier hour', () => {
  const params = baseParams();
  const sameScience = evaluate(params, { limitMin: 500, departureHours: [6] });
  assertEqual(sameScience.recommended.planId, 'B');
  assert(sameScience.recommended.totalMin < sameScience.results.find((r) => r.planId === 'A').totalMin, 'B is the shorter plan');

  const valued = baseParams({
    plans: [
      { id: 'A', tasks: ['photo'], scienceValue: 3 },
      { id: 'B', tasks: ['sample'], scienceValue: 1 },
    ],
  });
  assertEqual(evaluate(valued, { limitMin: 500, departureHours: [6] }).recommended.planId, 'A');

  const early = baseParams({
    plans: [{ id: 'A', tasks: ['photo'], scienceValue: 2 }],
    eva: { airlockMin: 20, reserveMin: 15, limitMin: 180, departureHours: [6, 17] },
  });
  assertEqual(evaluate(early, { limitMin: 500 }).recommended.departure, 6);
});

test('ranking: real viable list follows science, then duration, then earlier departure', async () => {
  const f = await loadSiteFixture();
  const e = evaluatePlans(
    { params: f.params, legs: f.legs, stops: f.stops, weather: f.weather, radiation: f.radiation },
    defaultPlanOptions(f.params),
  );
  const value = Object.fromEntries(f.params.plans.map((p) => [p.id, p.scienceValue]));
  for (let i = 1; i < e.viable.length; i++) {
    const prev = e.viable[i - 1], next = e.viable[i];
    const cmp = value[next.planId] - value[prev.planId] || prev.totalMin - next.totalMin || prev.departure - next.departure;
    assert(cmp <= 0, `${prev.planId}@${prev.departure} should rank ahead of ${next.planId}@${next.departure}`);
  }
});

test('pipeline: workspace thresholds are read from config, not literals, and dose matches the JS split', async () => {
  const [engine, doseCs, exportPs] = await Promise.all([
    fetch('../pipeline/03-model/RouteEngine.cs').then((r) => r.text()),
    fetch('../pipeline/lib/EvaDose.cs').then((r) => r.text()),
    fetch('../pipeline/04-export/export-web-data.ps1').then((r) => r.text()),
  ]);
  assert(/smax > WorkspaceMaxSlopeDeg/.test(engine), 'slope comparison uses the parameter');
  assert(/dl > WorkspaceMaxLargeDune/.test(engine), 'dune comparison uses the parameter');
  assert(!/smax > 10/.test(engine), 'slope limit is not a literal');
  assert(!/dl > 0\.5/.test(engine), 'dune limit is not a literal');
  assert(exportPs.includes('$mp.workspace.maxSlopeDeg') && exportPs.includes('$mp.workspace.maxLargeDuneFraction'), 'export loads both workspace fields');
  assert(/return travelMin \+ workMin;/.test(doseCs), 'C# surface time is travel + work');
  assert(/rateUGyPerHour \* minutesOutside \/ 60\.0/.test(doseCs), 'C# dose divides surface minutes by 60');
  assert(!/airlock/i.test(doseCs.split('MinutesOutside')[1].split('DoseUGy')[0]), 'C# surface time does not add airlock');
});
