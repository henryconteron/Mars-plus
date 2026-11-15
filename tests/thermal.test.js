import { test, assert, assertEqual } from './harness.js';

test('thermal inertia: the Jezero crop is the CC BY 4.0 THEMIS mosaic, moderate values only', async () => {
  const t = await (await fetch('../app/data/sites/jezero-issole/thermal-inertia.json')).json();
  assertEqual(t.doi, '10.5281/zenodo.4931348');
  assertEqual(t.license, 'CC BY 4.0');
  assertEqual(t.sourceMd5, '53fec7c990a90629e98c871a7a0da474');
  assertEqual(t.pixelM, 100);
  assertEqual(t.values.length, t.height);
  assertEqual(t.values[0].length, t.width);
  const flat = t.values.flat();
  assert(flat.length === t.width * t.height, 'every pixel is present');
  assert(flat.every((v) => v > 150 && v < 400), 'the traverse window is moderate thermal inertia, not dust and not the mosaic maximum');
  assert(t.bounds.west < 77.45 && t.bounds.east > 77.45, 'the crop covers the landing longitude');
  assert(t.bounds.south < 18.44 && t.bounds.north > 18.44, 'the crop covers the landing latitude');
  assert(/display only/i.test(t.cost), 'thermal inertia is not a walking-cost multiplier');
});
