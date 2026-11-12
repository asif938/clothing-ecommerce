import { describe, expect, it } from "vitest";
import { nextRunAt, reportPeriod } from "./schedule";

// Dhaka = UTC+6. 2026-11-12 is a Thursday.
const at = (iso: string) => new Date(iso);

describe("nextRunAt", () => {
  it("daily: later today if the send hour hasn't passed, else tomorrow", () => {
    expect(nextRunAt("daily", at("2026-11-12T00:00:00Z"), 8)).toEqual(at("2026-11-12T02:00:00Z")); // 06:00 Dhaka → 08:00 Dhaka
    expect(nextRunAt("daily", at("2026-11-12T02:00:00Z"), 8)).toEqual(at("2026-11-13T02:00:00Z")); // exactly 08:00 → next day
  });
  it("daily: uses the Dhaka date, not the UTC date", () => {
    // 2026-11-12 20:00 UTC is already 02:00 on the 13th in Dhaka.
    expect(nextRunAt("daily", at("2026-11-12T20:00:00Z"), 8)).toEqual(at("2026-11-13T02:00:00Z"));
  });
  it("weekly: next Saturday at the send hour", () => {
    expect(nextRunAt("weekly", at("2026-11-12T05:00:00Z"), 8)).toEqual(at("2026-11-14T02:00:00Z"));
    expect(nextRunAt("weekly", at("2026-11-14T03:00:00Z"), 8)).toEqual(at("2026-11-21T02:00:00Z")); // Saturday after 08:00
  });
  it("monthly: the 1st at the send hour, rolling the year", () => {
    expect(nextRunAt("monthly", at("2026-11-12T05:00:00Z"), 8)).toEqual(at("2026-12-01T02:00:00Z"));
    expect(nextRunAt("monthly", at("2026-12-15T05:00:00Z"), 8)).toEqual(at("2027-01-01T02:00:00Z"));
  });
});

describe("reportPeriod", () => {
  it("daily covers the previous Dhaka day", () => {
    expect(reportPeriod("daily", at("2026-11-13T02:00:00Z"))).toEqual({ from: at("2026-11-11T18:00:00Z"), to: at("2026-11-12T18:00:00Z") });
  });
  it("weekly covers the previous 7 days", () => {
    const p = reportPeriod("weekly", at("2026-11-14T02:00:00Z"));
    expect(p.to).toEqual(at("2026-11-13T18:00:00Z"));
    expect(p.from).toEqual(at("2026-11-06T18:00:00Z"));
  });
  it("monthly covers the previous calendar month", () => {
    expect(reportPeriod("monthly", at("2027-01-01T02:00:00Z"))).toEqual({ from: at("2026-11-30T18:00:00Z"), to: at("2026-12-31T18:00:00Z") });
  });
});
