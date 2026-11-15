// AI-assisted (Claude). Reviewed by the MARS+ team.
// Weather window checks over MEDA hourly conditions (typical | worst | storm scenarios).

/** @typedef {'typical'|'worst'|'storm'} WeatherScenario */

/** Conditions at a local solar hour for a scenario: {tempC, windMs} (values may be null). */
export function conditionsAt(weather, scenario, hour) {
  const row = weather.hours[((hour % 24) + 24) % 24];
  return row[scenario] ?? { tempC: null, windMs: null };
}

// An instant that lands on an hour boundary is the return (the crew is back inside),
// so that hour is not part of the window. The epsilon keeps float dust just past an
// integer hour from pulling the next hour in.
const HOUR_EDGE_H = 1e-9;

/**
 * Checks every hour the budgeted EVA overlaps, from departure up to but not including
 * an exact return on the hour.
 * @returns {null | {code:string, values:object}} first violation, or null when the window is fine
 */
export function checkWeatherWindow(weather, scenario, departureHour, totalMin, limits) {
  const end = departureHour + totalMin / 60;
  for (let h = Math.floor(departureHour); h < end - HOUR_EDGE_H; h++) {
    const c = conditionsAt(weather, scenario, h);
    const hour = ((h % 24) + 24) % 24;
    if (c.tempC == null || c.windMs == null) return { code: 'noWeatherData', values: { hour } };
    if (c.tempC < limits.minGroundTempC) return { code: 'tooCold', values: { hour, tempC: c.tempC, minC: limits.minGroundTempC } };
    if (c.windMs > limits.maxMeanWindMs) return { code: 'tooWindy', values: { hour, windMs: c.windMs, maxMs: limits.maxMeanWindMs } };
  }
  return null;
}
