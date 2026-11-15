import { test, assert, assertClose } from './harness.js';
import { TerrainGrid } from '../app/src/domain/terrain/grid.js';
import { buildCostModel } from '../app/src/domain/terrain/cost.js';
import { findPath } from '../app/src/domain/routing/astar.js';
import { routeStats } from '../app/src/domain/routing/route-stats.js';
import { loadSiteFixture } from './fixtures.js';

test('profile: a route carries segment grades and a cumulative time that ends at the total', async () => {
  const f = await loadSiteFixture();
  const model = buildCostModel(new TerrainGrid(f.terrainMeta, f.terrainBin), f.params);
  const site = await (await fetch('../app/data/sites/jezero-issole/site.json')).json();
  const a = model.grid.cellOf(site.points.landing.lon, site.points.landing.lat);
  const b = model.grid.cellOf(f.stops.sampling.lon, f.stops.sampling.lat);
  const res = findPath(model, a, b);
  const stats = routeStats(model, res.path);
  assert(stats.grades.length === stats.coords.length - 1, 'one grade per segment');
  assert(stats.cumMin.length === stats.coords.length, 'time at every vertex');
  assertClose(stats.cumMin[0], 0, 1e-9);
  assertClose(stats.cumMin[stats.cumMin.length - 1], stats.timeMin, 1e-9);
  assert(stats.grades.every((g) => g >= 0 && g < 90), 'grades are absolute slopes in degrees');
});
