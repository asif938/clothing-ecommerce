/**
 * Asia/Dhaka is UTC+6 with no daylight saving (spec §17 default time zone),
 * so day boundaries are a fixed offset — no tz database needed. Used by the
 * M12 scheduled reports, anomaly sweep and document numbers so "yesterday"
 * and "today" mean the shop's calendar day, not the server's UTC day.
 */
export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC instant of 00:00 Dhaka time on the Dhaka calendar day containing `date`. */
export function dhakaDayStart(date: Date): Date {
  const shifted = date.getTime() + DHAKA_OFFSET_MS;
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - DHAKA_OFFSET_MS);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** `YYYY-MM-DD` of the Dhaka calendar day containing `date`. */
export function dhakaDateKey(date: Date): string {
  return new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Dhaka-local calendar parts of `date`. */
export function dhakaParts(date: Date): { year: number; month: number; day: number; weekday: number; hour: number } {
  const shifted = new Date(date.getTime() + DHAKA_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay(), hour: shifted.getUTCHours() };
}

/** UTC instant for a Dhaka-local wall-clock time. `month` is 0-based and may overflow (Date.UTC normalizes it). */
export function dhakaWallClock(year: number, month: number, day: number, hour = 0): Date {
  return new Date(Date.UTC(year, month, day, hour) - DHAKA_OFFSET_MS);
}
