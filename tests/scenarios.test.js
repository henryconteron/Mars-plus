// AI-assisted (Claude). Reviewed by the MARS+ team.
// The six plan scenarios from the project audit (docs: informe-datos-y-decisiones.md, D13).
import { test, assert, assertEqual } from './harness.js';
import { evaluatePlans, defaultPlanOptions } from '../app/src/domain/plans/evaluate.js';
import { explainEvaluation } from '../app/src/domain/explain/explain.js';
import { loadSiteFixture } from './fixtures.js';

async function run(overrides) {
  const f = await loadSiteFixture();
  const input = { params: f.params, legs: f.legs, stops: f.stops, weather: f.weather, radiation: f.radiation };
  return evaluatePlans(input, { ...defaultPlanOptions(f.params), ...overrides });
}

test('scenario 1 · typical sol, 180 min → Plan C at 09:00 (Plan A is 5 min over)', async () => {
  const e = await run({});
  assertEqual(e.recommended?.planId, 'C');
  assertEqual(e.recommended?.departure, 9);
  assertEqual(Math.round(e.recommended.totalMin), 159);
  const a9 = e.results.find((r) => r.planId === 'A' && r.departure === 9);
  assertEqual(a9.filter, 3);
  assertEqual(a9.reason.values.overMin, 5);
});

test('scenario 2 · typical sol, 210 min → Plan A at 09:00 (184 min)', async () => {
  const e = await run({ limitMin: 210 });
  assertEqual(e.recommended?.planId, 'A');
  assertEqual(e.recommended?.departure, 9);
  assertEqual(Math.round(e.recommended.totalMin), 184);
});

test('scenario 3 · worst recorded sol, 210 min → Plan A at 10:00 (09:00 too cold)', async () => {
  const e = await run({ limitMin: 210, weatherScenario: 'worst' });
  assertEqual(e.recommended?.planId, 'A');
  assertEqual(e.recommended?.departure, 10);
  assertEqual(e.results.find((r) => r.planId === 'A' && r.departure === 9).reason.code, 'tooCold');
});

test('scenario 4 · storm-day weather without alert → Plan A at 10:00', async () => {
  const e = await run({ limitMin: 210, weatherScenario: 'storm' });
  assertEqual(e.recommended?.planId, 'A');
  assertEqual(e.recommended?.departure, 10);
});

test('scenario 5 · dust-storm alert → postpone (filter 4)', async () => {
  const e = await run({ limitMin: 210, weatherScenario: 'storm', dustStormAlert: true });
  assertEqual(e.recommended, null);
  assertEqual(e.closest.filter, 4);
  assertEqual(e.closest.reason.code, 'dustStorm');
  assertEqual(e.closest.planId, 'A', 'closest should be the plan that works without the alert');
  assertEqual(e.closest.departure, 10);
});

test('scenario 6 · solar particle event → postpone (filter 5)', async () => {
  const e = await run({ limitMin: 210, solarEventAlert: true });
  assertEqual(e.recommended, null);
  assertEqual(e.closest.filter, 5);
  assertEqual(e.closest.reason.code, 'solarEvent');
});

test('explanation: recommended plan comes with "why not" for the other plans', async () => {
  const ex = explainEvaluation(await run({}));
  assertEqual(ex[0].code, 'recommended');
  assert(ex.some((s) => s.code === 'whyNotPlan' && s.values.planId === 'A' && s.values.reason.code === 'overLimit'), 'should explain why Plan A is out');
});

test('explanation: the long route that misses the limit proposes the shorter plan with its time', async () => {
  const e = await run({});
  const ex = explainEvaluation(e);
  const alt = ex.find((s) => s.code === 'alternativeRoute' && s.values.planId === 'A');
  assert(alt, 'Plan A should be offered as the longer route');
  assertEqual(alt.values.kind, 'longer');
  assertEqual(alt.values.status, 'rejected');
  assertEqual(alt.values.reason.code, 'overLimit');
  assertEqual(Math.round(alt.values.recommendedMin), 159);
  assert(alt.values.totalMin > alt.values.recommendedMin, 'the rejected route must be the longer one');
  const open = ex.filter((s) => s.code === 'alternativeRoute' && s.values.kind === 'shorter' && s.values.status === 'viable');
  assert(open.length >= 1, 'a shorter plan that still fits should be listed with its own time');
  const shift = ex.find((s) => s.code === 'shiftedDeparture');
  assert(shift, 'the hour before the window should move the departure');
  assertEqual(shift.values.toHour, 9);
  assertEqual(shift.values.fromHour, 8);
});

test('explanation: a weather failure moves the departure and keeps the recalculated time', async () => {
  const e = await run({ limitMin: 210, weatherScenario: 'worst' });
  const ex = explainEvaluation(e);
  const s = ex.find((x) => x.code === 'shiftedDeparture');
  assert(s, 'departure should move off the cold hour');
  assertEqual(s.values.fromHour, 9);
  assertEqual(s.values.toHour, 10);
  assertEqual(s.values.reason.code, 'tooCold');
  assertEqual(Math.round(s.values.totalMin), 184);
});

test('explanation: a dust alert blocks the long route and the short one', async () => {
  const ex = explainEvaluation(await run({ limitMin: 210, weatherScenario: 'storm', dustStormAlert: true }));
  const s = ex.find((x) => x.code === 'noRouteEitherLength');
  assert(s, 'dust should veto every length');
  assertEqual(s.values.planId, 'A');
  assert(s.values.totalMin > 0, 'the plan that would have gone still has a computed duration');
});

test('explanation: a solar alert blocks the long route and the short one', async () => {
  const ex = explainEvaluation(await run({ limitMin: 210, solarEventAlert: true }));
  const s = ex.find((x) => x.code === 'noRouteEitherLength');
  assert(s, 'solar particles should veto every length');
  assertEqual(s.values.reason.code, 'solarEvent');
  assert(s.values.totalMin > 0);
});

test('explanation: when every route is over the limit, the shortest recalculated time is named', async () => {
  const e = await run({ limitMin: 60 });
  assertEqual(e.recommended, null);
  const ex = explainEvaluation(e);
  const s = ex.find((x) => x.code === 'shortestStillOver');
  assert(s, 'the shortest timed plan should be named');
  const min = Math.min(...e.results.filter((r) => r.totalMin > 0).map((r) => r.totalMin));
  assertEqual(s.values.totalMin, min);
  assertEqual(s.values.reason.code, 'overLimit');
});
