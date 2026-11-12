import { describe, expect, it } from "vitest";
import { detectAnomalies } from "./anomaly";

const opts = { thresholdPercent: 50, minBaselineOrders: 5, baselineAverageOrders: 20 };

describe("detectAnomalies", () => {
  it("stays quiet within the threshold", () => {
    expect(detectAnomalies([{ metric: "orders", kind: "count", observed: 25, baseline: [20, 20, 20] }], opts)).toEqual([]);
  });
  it("flags a drop", () => {
    expect(detectAnomalies([{ metric: "orders", kind: "count", observed: 8, baseline: [20, 20, 20] }], opts)).toEqual([
      { metric: "orders", direction: "down", severity: "warning", observed: 8, expected: 20, change: -0.6 },
    ]);
  });
  it("flags a spike as critical at twice the threshold", () => {
    expect(detectAnomalies([{ metric: "revenue", kind: "count", observed: 50, baseline: [20, 20] }], opts)[0]).toMatchObject({ direction: "up", severity: "critical" });
  });
  it("treats orders dropping to zero as critical", () => {
    expect(detectAnomalies([{ metric: "orders", kind: "count", observed: 0, baseline: [20] }], opts)[0]?.severity).toBe("critical");
  });
  it("only alerts on rate increases, with a 5-point floor", () => {
    const baseline = [0.02, 0.02];
    expect(detectAnomalies([{ metric: "cancellation_rate", kind: "rate", observed: 0.04, baseline }], opts)).toEqual([]); // +2 points < 5-point floor
    expect(detectAnomalies([{ metric: "cancellation_rate", kind: "rate", observed: 0.0, baseline: [0.3] }], opts)).toEqual([]); // decrease
    expect(detectAnomalies([{ metric: "cancellation_rate", kind: "rate", observed: 0.1, baseline }], opts)[0]).toMatchObject({ direction: "up", severity: "warning" });
    expect(detectAnomalies([{ metric: "rejection_rate", kind: "rate", observed: 0.2, baseline }], opts)[0]?.severity).toBe("critical");
  });
  it("is silent for small stores and empty baselines", () => {
    expect(detectAnomalies([{ metric: "orders", kind: "count", observed: 0, baseline: [3, 3] }], { ...opts, baselineAverageOrders: 3 })).toEqual([]);
    expect(detectAnomalies([{ metric: "orders", kind: "count", observed: 0, baseline: [] }], opts)).toEqual([]);
  });
});
