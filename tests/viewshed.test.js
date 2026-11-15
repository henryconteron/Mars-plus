import { test, assert } from './harness.js';
import { lineOfSight, viewshedMask } from '../app/src/domain/terrain/viewshed.js';

test('viewshed: flat ground is open and a wall blocks the cell behind it', () => {
  const cols = 7, rows = 1, res = 2;
  const z = new Float32Array(cols);
  assert(lineOfSight(z, cols, res, 1, 0, 6, 2, 2), 'flat line stays clear');
  z[3] = 20;
  assert(!lineOfSight(z, cols, res, 1, 0, 6, 2, 2), 'a 20 m wall blocks a 2 m eye');
  const mask = viewshedMask(z, rows, cols, res, 1, 0, 3, 1.5);
  assert(mask[0] === 1, 'the origin sees itself');
  assert(mask[2] === 1, 'the near side of the wall is visible');
  assert(mask[6] === 0, 'the far side is hidden');
});
