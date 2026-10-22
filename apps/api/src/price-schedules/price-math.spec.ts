import { describe, expect, it } from "vitest";
import { computeScheduledPrice } from "./price-math";

describe("computeScheduledPrice", () => {
  it("uses the fixed price when set", () => {
    expect(computeScheduledPrice(150000, { newPrice: 99900, percentChange: null })).toBe(99900);
  });

  it("applies a percent discount, rounded to the nearest poisha", () => {
    // 150000 * 0.85 = 127500 exactly
    expect(computeScheduledPrice(150000, { newPrice: null, percentChange: -15 })).toBe(127500);
    // 99900 * 0.9 = 89910 exactly; use a value that forces rounding
    expect(computeScheduledPrice(10001, { newPrice: null, percentChange: -10 })).toBe(9001); // 9000.9 -> 9001
  });

  it("applies a percent increase", () => {
    expect(computeScheduledPrice(100000, { newPrice: null, percentChange: 10 })).toBe(110000);
  });

  it("never goes below zero", () => {
    expect(computeScheduledPrice(100, { newPrice: null, percentChange: -200 })).toBe(0);
  });

  it("returns the current price unchanged when neither is set", () => {
    expect(computeScheduledPrice(50000, { newPrice: null, percentChange: null })).toBe(50000);
  });
});
