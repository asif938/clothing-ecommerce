import { describe, expect, it } from "vitest";
import { addressLooksInvalid, computeRiskScore, nameLooksInvalid, riskLevelFor, type RiskInput, type RiskWeights } from "./risk-score";

const weights: RiskWeights = {
  blocklisted_phone: 100,
  courier_history_low: 40,
  courier_history_medium: 20,
  doorstep_rejection: 15,
  cancelled_after_confirm: 10,
  new_customer_high_value: 15,
  same_phone_or_device_burst: 20,
  same_ip_multi_phone_burst: 25,
  address_too_short_or_test_words: 15,
  name_looks_invalid: 10,
  delivered_history_no_rejections: -30,
  otp_verified: -10,
};

function input(overrides: Partial<RiskInput> = {}): RiskInput {
  return {
    phoneBlocked: false,
    courierSuccessRatio: null,
    courierSampleSize: 0,
    previousDoorstepRejections: 0,
    previousCancelledAfterConfirm: 0,
    isNewCustomer: false,
    orderTotal: 1000_00,
    highValueThreshold: 5000_00,
    samePhoneOrDeviceOrdersLast24h: 0,
    sameIpDifferentPhonesLast24h: 0,
    addressLooksInvalid: false,
    nameLooksInvalid: false,
    deliveredCount: 0,
    rejectedAtDoorCount: 0,
    otpVerified: false,
    ...overrides,
  };
}

describe("computeRiskScore", () => {
  it("scores zero for a clean, ordinary order", () => {
    expect(computeRiskScore(input(), weights).score).toBe(0);
  });

  it("adds the full blocklist weight", () => {
    const result = computeRiskScore(input({ phoneBlocked: true }), weights);
    expect(result.score).toBe(100);
    expect(result.reasonCodes).toContain("blocklisted_phone");
  });

  it("caps repeated-signal weights at 3 occurrences", () => {
    const result = computeRiskScore(input({ previousDoorstepRejections: 10 }), weights);
    expect(result.score).toBe(3 * 15);
  });

  it("ignores courier history below the sample-size floor", () => {
    expect(computeRiskScore(input({ courierSuccessRatio: 0.1, courierSampleSize: 2 }), weights).score).toBe(0);
  });

  it("applies the low-success-ratio weight once the sample is large enough", () => {
    expect(computeRiskScore(input({ courierSuccessRatio: 0.3, courierSampleSize: 5 }), weights).score).toBe(40);
  });

  it("only flags new-customer-high-value when both conditions hold", () => {
    expect(computeRiskScore(input({ isNewCustomer: true, orderTotal: 1000_00, highValueThreshold: 5000_00 }), weights).score).toBe(0);
    expect(computeRiskScore(input({ isNewCustomer: true, orderTotal: 6000_00, highValueThreshold: 5000_00 }), weights).score).toBe(15);
  });

  it("never lets the total score go negative", () => {
    expect(computeRiskScore(input({ deliveredCount: 5, otpVerified: true }), weights).score).toBe(0);
  });

  it("combines multiple signals additively", () => {
    const result = computeRiskScore(input({ phoneBlocked: true, nameLooksInvalid: true }), weights);
    expect(result.score).toBe(110);
    expect(result.reasonCodes).toEqual(["blocklisted_phone", "name_looks_invalid"]);
  });
});

describe("riskLevelFor", () => {
  const thresholds = { low: 30, medium: 60 };
  it("low below the low threshold", () => expect(riskLevelFor(29, thresholds)).toBe("low"));
  it("medium at the low threshold", () => expect(riskLevelFor(30, thresholds)).toBe("medium"));
  it("high at the medium threshold", () => expect(riskLevelFor(60, thresholds)).toBe("high"));
});

describe("addressLooksInvalid", () => {
  it("flags a too-short address", () => expect(addressLooksInvalid("House 1")).toBe(true));
  it("flags an address containing a test word", () => expect(addressLooksInvalid("123 test street area")).toBe(true));
  it("accepts a normal, full address", () => expect(addressLooksInvalid("House 42, Road 11, Gulshan 1, Dhaka")).toBe(false));
});

describe("nameLooksInvalid", () => {
  it("flags an all-digit name", () => expect(nameLooksInvalid("12345")).toBe(true));
  it("flags a too-short name", () => expect(nameLooksInvalid("Al")).toBe(true));
  it("flags a repeated-character name", () => expect(nameLooksInvalid("aaaaaa")).toBe(true));
  it("accepts an ordinary name, including one with doubled letters", () => expect(nameLooksInvalid("Hassan Ahmed")).toBe(false));
});
