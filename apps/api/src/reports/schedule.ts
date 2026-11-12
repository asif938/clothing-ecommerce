import type { ReportFrequency } from "@clothing/db";
import { addDays, dhakaDayStart, dhakaParts, dhakaWallClock } from "../common/dhaka-time";

/**
 * Scheduled email report cadence (docs/PROJECT_SPEC.md §8.2 "Scheduled email
 * reports (phase 2)", §16 M12), all in Dhaka time:
 *  - daily   → every day at the send hour, covering the previous day;
 *  - weekly  → every Saturday (start of the Bangladeshi work week) at the
 *              send hour, covering the previous 7 days;
 *  - monthly → the 1st of each month at the send hour, covering the
 *              previous calendar month.
 */
const SATURDAY = 6;

/** The first send time strictly after `after`. */
export function nextRunAt(frequency: ReportFrequency, after: Date, sendHour: number): Date {
  const p = dhakaParts(after);
  if (frequency === "daily") {
    const today = dhakaWallClock(p.year, p.month, p.day, sendHour);
    return today > after ? today : dhakaWallClock(p.year, p.month, p.day + 1, sendHour);
  }
  if (frequency === "weekly") {
    const daysUntil = (SATURDAY - p.weekday + 7) % 7;
    const candidate = dhakaWallClock(p.year, p.month, p.day + daysUntil, sendHour);
    return candidate > after ? candidate : dhakaWallClock(p.year, p.month, p.day + daysUntil + 7, sendHour);
  }
  const thisMonth = dhakaWallClock(p.year, p.month, 1, sendHour);
  return thisMonth > after ? thisMonth : dhakaWallClock(p.year, p.month + 1, 1, sendHour);
}

/** The reporting window a run at `runAt` covers: [from, to) as UTC instants on Dhaka day boundaries. */
export function reportPeriod(frequency: ReportFrequency, runAt: Date): { from: Date; to: Date } {
  const to = dhakaDayStart(runAt);
  if (frequency === "daily") return { from: addDays(to, -1), to };
  if (frequency === "weekly") return { from: addDays(to, -7), to };
  const p = dhakaParts(runAt);
  return { from: dhakaWallClock(p.year, p.month - 1, 1), to: dhakaWallClock(p.year, p.month, 1) };
}
