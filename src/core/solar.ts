/**
 * Sunrise / sunset for a given date and lat/long. NOAA solar position
 * algorithm — pure math, no external deps. Accurate to ~1 minute, which
 * is plenty for "open the skylights at sunrise" style triggers.
 *
 * Returns Date objects in UTC. Caller is responsible for any timezone /
 * display conversion.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Returns { sunrise, sunset } as UTC Date objects for the given local date. */
export function sunTimes(
  date: Date,
  latitude: number,
  longitude: number,
): { sunrise: Date; sunset: Date } {
  // Day at noon UTC for stable angle calcs.
  const noon = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12));
  const J = julianDay(noon);
  const n = J - 2451545.0 + 0.0008;
  const Jstar = n - longitude / 360; // solar noon approximation
  const M = (357.5291 + 0.98560028 * Jstar) % 360; // mean anomaly
  const C =
    1.9148 * Math.sin(M * RAD) +
    0.02 * Math.sin(2 * M * RAD) +
    0.0003 * Math.sin(3 * M * RAD); // equation of the center
  const lambda = (M + C + 180 + 102.9372) % 360; // ecliptic longitude
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const delta = Math.asin(Math.sin(lambda * RAD) * Math.sin(23.44 * RAD)) * DEG; // declination
  const h0 = -0.83; // standard sun-edge-touches-horizon angle (degrees)
  const cosOmega =
    (Math.sin(h0 * RAD) - Math.sin(latitude * RAD) * Math.sin(delta * RAD)) /
    (Math.cos(latitude * RAD) * Math.cos(delta * RAD));

  if (cosOmega > 1) {
    // Polar night: sun never rises. Fall back to noon ± 12h.
    return { sunrise: noon, sunset: noon };
  }
  if (cosOmega < -1) {
    // Polar day: sun never sets.
    return { sunrise: noon, sunset: noon };
  }
  const omega = Math.acos(cosOmega) * DEG;
  const Jrise = Jtransit - omega / 360;
  const Jset = Jtransit + omega / 360;

  return {
    sunrise: new Date((Jrise - 2440587.5) * 86400000),
    sunset: new Date((Jset - 2440587.5) * 86400000),
  };
}

/**
 * Next occurrence of a solar event from `from`, with an optional offset
 * in minutes (negative = before the event). If today's event is already
 * past, returns tomorrow's.
 */
export function nextSolar(
  from: Date,
  kind: "sunrise" | "sunset",
  latitude: number,
  longitude: number,
  offsetMinutes = 0,
): Date {
  const today = sunTimes(from, latitude, longitude);
  const todayEvent = new Date(today[kind].getTime() + offsetMinutes * 60_000);
  if (todayEvent.getTime() > from.getTime()) return todayEvent;
  // Roll to tomorrow.
  const tomorrow = new Date(from.getTime() + 24 * 3600 * 1000);
  const t = sunTimes(tomorrow, latitude, longitude);
  return new Date(t[kind].getTime() + offsetMinutes * 60_000);
}
