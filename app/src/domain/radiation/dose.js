// AI-assisted (Claude). Reviewed by the MARS+ team.
// Absorbed dose for time on the surface: dose (uGy) = rate (uGy/h) x hours.
// Keep in parity with pipeline/lib/EvaDose.cs.
//
// What counts as exposure at the unshielded surface rate (RAD detector E):
//   - walking between stops
//   - science tasks at the stops (the crew is outside)
// What does not:
//   - airlock time: the crew is inside the habitat, which shields galactic cosmic rays
//   - the reserve: unused margin on a nominal timeline, not time spent outside
// Galactic cosmic rays are uniform at this scale, so less time outside means less dose.

/** Minutes at the surface rate. */
export function minutesOutside(travelMin, workMin) {
  return travelMin + workMin;
}

export function evaDoseUGy(rateUGyPerHour, minutesOnSurface) {
  return (rateUGyPerHour * minutesOnSurface) / 60;
}

/** Share of one surface day represented by an exposure (0..1). */
export function shareOfSol(minutesOnSurface) {
  return minutesOnSurface / (24 * 60);
}
