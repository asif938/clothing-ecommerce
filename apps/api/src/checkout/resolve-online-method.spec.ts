import { describe, expect, it } from "vitest";
import { resolveOnlineMethod } from "./checkout.service";

describe("resolveOnlineMethod", () => {
  it("uses the chosen online method directly", () => {
    expect(resolveOnlineMethod({ paymentMethod: "bkash" }, ["cod", "bkash"], new Set())).toBe("bkash");
  });

  it("picks the first enabled online method for a COD advance when none was requested — never mock by default", () => {
    expect(resolveOnlineMethod({ paymentMethod: "cod" }, ["cod", "sslcommerz", "bkash"], new Set())).toBe("sslcommerz");
  });

  it("skips methods a payment rule disabled", () => {
    expect(resolveOnlineMethod({ paymentMethod: "cod" }, ["cod", "sslcommerz", "bkash"], new Set(["sslcommerz"]))).toBe("bkash");
  });

  it("rejects a requested advance method that isn't enabled", () => {
    expect(() => resolveOnlineMethod({ paymentMethod: "cod", advanceMethod: "mock" }, ["cod", "bkash"], new Set())).toThrow();
  });

  it("rejects a COD advance when no online method is enabled", () => {
    expect(() => resolveOnlineMethod({ paymentMethod: "cod" }, ["cod"], new Set())).toThrow();
  });
});
