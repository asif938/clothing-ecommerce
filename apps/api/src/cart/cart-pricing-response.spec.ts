import { describe, expect, it } from "vitest";
import type { CartPricingResult } from "./cart-pricing.service";
import { toPricingResponse } from "./cart.controller";

describe("toPricingResponse", () => {
  it("serializes paymentRules.disabledMethods as an array, not {}", () => {
    const pricing = {
      total: 100_00,
      paymentRules: { disabledMethods: new Set(["cod", "bkash"]), advanceRequired: null, otpRequired: false, blocked: null, messages: [] },
    } as unknown as CartPricingResult;

    const wire = JSON.parse(JSON.stringify(toPricingResponse(pricing))) as { total: number; paymentRules: { disabledMethods: unknown } };

    expect(wire.paymentRules.disabledMethods).toEqual(["cod", "bkash"]);
    expect(wire.total).toBe(100_00);
  });

  it("keeps an empty rule outcome as an empty array", () => {
    const pricing = { paymentRules: { disabledMethods: new Set<string>(), advanceRequired: null, otpRequired: false, blocked: null, messages: [] } } as unknown as CartPricingResult;
    expect(toPricingResponse(pricing).paymentRules.disabledMethods).toEqual([]);
  });
});
