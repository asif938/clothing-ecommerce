import { describe, expect, it } from "vitest";
import { computeDoorCharge, computeDoorstepRefundableAmount } from "./doorstep-rejection";

describe("computeDoorCharge", () => {
  it("is zero when the policy is free", () => {
    expect(computeDoorCharge("free", 6000, 5000)).toBe(0);
  });

  it("is just the delivery fee under delivery_fee_only", () => {
    expect(computeDoorCharge("delivery_fee_only", 6000, 5000)).toBe(6000);
  });

  it("adds the return shipping fee under delivery_fee_plus_return", () => {
    expect(computeDoorCharge("delivery_fee_plus_return", 6000, 5000)).toBe(11000);
  });
});

describe("computeDoorstepRefundableAmount", () => {
  it("refunds the full prepaid amount minus the door charge on full rejection", () => {
    expect(computeDoorstepRefundableAmount({ paidTotal: 150000, doorCharge: 6000, keptItemsValue: 0 })).toBe(144000);
  });

  it("also subtracts the kept items' value on a partial delivery", () => {
    expect(computeDoorstepRefundableAmount({ paidTotal: 150000, doorCharge: 6000, keptItemsValue: 50000 })).toBe(94000);
  });

  it("never goes negative — a COD order (paidTotal 0) refunds nothing", () => {
    expect(computeDoorstepRefundableAmount({ paidTotal: 0, doorCharge: 6000, keptItemsValue: 0 })).toBe(0);
  });

  it("clamps to zero when charges exceed what was paid", () => {
    expect(computeDoorstepRefundableAmount({ paidTotal: 5000, doorCharge: 6000, keptItemsValue: 0 })).toBe(0);
  });
});
