import { test, assert, assertClose } from './harness.js';
import { ROUGHNESS_SCALES, meanAbsoluteDeviation } from '../app/src/domain/terrain/roughness.js';

test('roughness: scales are the 2 m posting nearest to 5, 10 and 25 m', () => {
  assert(ROUGHNESS_SCALES.map((s) => s.requestedM).join() === '5,10,25', 'requested baselines');
  assert(ROUGHNESS_SCALES[1].meters === 10 && ROUGHNESS_SCALES[1].radius === 2, '10 m is exactly five 2 m cells');
  assert(ROUGHNESS_SCALES[0].meters === 6, '5 m becomes a 6 m window');
  assert(ROUGHNESS_SCALES[2].meters === 26, '25 m becomes a 26 m window');
});

test('roughness: a flat window is zero and a known spike matches the hand value', () => {
  const rows = 5, cols = 5;
  const z = new Float32Array(rows * cols);
  const flat = meanAbsoluteDeviation(z, rows, cols, 1);
  assertEqualFinite(flat[2 * cols + 2], 0);
  z[2 * cols + 2] = 9;
  // 3x3: eight zeros and one 9. Mean 1. MAD = (8*1 + 8)/9 = 16/9.
  const spiked = meanAbsoluteDeviation(z, rows, cols, 1);
  assertClose(spiked[2 * cols + 2], 16 / 9, 1e-6);
  assert(Number.isNaN(spiked[0]), 'the border is not a full window');
});

function assertEqualFinite(actual, expected) {
  assert(actual === expected, `expected ${expected}, got ${actual}`);
}
