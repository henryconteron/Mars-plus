import { test, assert, assertClose } from './harness.js';
import { buildCostModel } from '../app/src/domain/terrain/cost.js';
import { timeField, reachabilityMask } from '../app/src/domain/routing/time-field.js';

function openModel(cols, rows) {
  const z = new Float32Array(cols * rows);
  const grid = { rows, cols, res: 2, cosLat: 1, size: cols * rows, z };
  const params = {
    walking: { toblerFactor: 0.5 },
    terrain: { slopeBlockDeg: 20, roughnessRefM: 0.25, largeDuneExtra: 1, smallDuneExtra: 0.3, rockMult: 6, rockBlockFraction: 0.12 },
  };
  const model = buildCostModel({ ...grid, slope: z, rough: z, duneLarge: z, duneSmall: z, rock: z }, params);
  // buildCostModel blocks NaN. z is 0, so the border is still walkable here because slope is 0.
  // The search itself excludes the 1-cell border, matching A*.
  return model;
}

test('time field: flat round trip is symmetric and the origin costs nothing', () => {
  const model = openModel(6, 5);
  const origin = 2 * 6 + 2;
  const out = timeField(model, origin, false);
  const back = timeField(model, origin, true);
  assertClose(out[origin], 0, 1e-9);
  const there = 2 * 6 + 4;
  assert(Number.isFinite(out[there]), 'a neighbour of the interior is reached');
  assertClose(out[there], back[there], 1e-6, 'flat ground is the same both ways');
});

test('reachability: a zero walking budget keeps only the origin', () => {
  const model = openModel(6, 5);
  const origin = 2 * 6 + 2;
  const none = reachabilityMask(model, origin, 0);
  assert(none[origin] === 1, 'standing at the habitat is inside the budget');
  assert(none[2 * 6 + 3] === 0, 'a step costs more than zero');
  const wide = reachabilityMask(model, origin, 1e9);
  assert(wide[2 * 6 + 4] === 1, 'a huge budget covers the interior');
});
