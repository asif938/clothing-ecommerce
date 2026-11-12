import { describe, expect, it } from "vitest";
import { DEFAULT_DASHBOARD_LAYOUT, DASHBOARD_WIDGET_KEYS, sanitizeDashboardLayout } from "./widgets.ts";

describe("sanitizeDashboardLayout", () => {
  it("keeps order, drops unknown and duplicate keys", () => {
    expect(sanitizeDashboardLayout(["lowStock", "nope", "kpis", "lowStock"], () => true)).toEqual(["lowStock", "kpis"]);
  });
  it("hides widgets the viewer lacks permission for", () => {
    expect(sanitizeDashboardLayout(["kpis", "profitSnapshot"], (p) => p === "reports.read")).toEqual(["kpis"]);
  });
  it("the default layout only uses catalog keys", () => {
    expect(DEFAULT_DASHBOARD_LAYOUT.every((k) => DASHBOARD_WIDGET_KEYS.includes(k))).toBe(true);
  });
});
