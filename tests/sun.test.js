import { test, assert, assertClose } from './harness.js';
import { solarDeclinationDeg, solarPosition, shadowMask } from '../app/src/domain/terrain/sun.js';

const EPS = 25.19;

test('sun: equinox noon at Jezero is due south and 90° minus latitude', () => {
  const sun = solarPosition(18.44, 0, 12, EPS);
  assertClose(sun.declinationDeg, 0, 1e-6);
  assertClose(sun.altitudeDeg, 90 - 18.44, 1e-6);
  assertClose(sun.azimuthDeg, 180, 1e-4);
});

test('sun: solstice declination equals the obliquity, and morning is east of south', () => {
  assertClose(solarDeclinationDeg(90, EPS), EPS, 1e-6);
  assertClose(solarDeclinationDeg(270, EPS), -EPS, 1e-6);
  const morning = solarPosition(18.44, 0, 9, EPS);
  assert(morning.azimuthDeg < 180 && morning.azimuthDeg > 0, `morning azimuth ${morning.azimuthDeg}`);
  assert(morning.altitudeDeg > 0, 'the sun is up at 09:00 LTST at equinox');
});

test('sun: a wall to the east shadows the cell in the morning and not in the afternoon', () => {
  const rows = 9, cols = 9, res = 2;
  const z = new Float32Array(rows * cols);
  z[4 * cols + 7] = 30;
  const east = { altitudeDeg: 15, azimuthDeg: 90 };
  const west = { altitudeDeg: 15, azimuthDeg: 270 };
  const morning = shadowMask(z, rows, cols, res, 1, east, 40);
  const afternoon = shadowMask(z, rows, cols, res, 1, west, 40);
  assert(morning[4 * cols + 4] === 1, 'morning shadow from the eastern wall');
  assert(afternoon[4 * cols + 4] === 0, 'afternoon light does not see that wall');
});
