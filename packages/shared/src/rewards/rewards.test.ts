import { describe, expect, it } from "vitest";
import {
  GIFT_CARD_ALPHABET,
  allocateCredits,
  checkReferral,
  commissionBase,
  computeCommission,
  computeReferralDiscount,
  formatGiftCardCode,
  giftCardCodeFromBytes,
  giftCardUnusableReason,
  isAffiliateCodeShape,
  isGiftCardCodeShape,
  looksLikeReferralCode,
  normalizeGiftCardCode,
  validateGiftCardAmount,
  withinAttributionWindow,
  type ReferralCheckInput,
} from "./index.ts";

describe("gift card codes", () => {
  it("builds a 16-character code from the unambiguous alphabet", () => {
    const bytes = Uint8Array.from({ length: 64 }, (_, i) => (i * 37) % 256);
    const code = giftCardCodeFromBytes(bytes);
    expect(code).toHaveLength(16);
    expect([...code].every((c) => GIFT_CARD_ALPHABET.includes(c))).toBe(true);
    expect(isGiftCardCodeShape(code)).toBe(true);
  });

  it("skips bytes above the rejection limit so characters stay uniform", () => {
    const bytes = new Uint8Array(40).fill(255);
    bytes.set(Uint8Array.from({ length: 16 }, () => 0), 24);
    expect(giftCardCodeFromBytes(bytes)).toBe(GIFT_CARD_ALPHABET[0]!.repeat(16));
  });

  it("throws when the bytes run out", () => {
    expect(() => giftCardCodeFromBytes(new Uint8Array(10))).toThrow();
  });

  it("normalizes what shoppers type and formats for display", () => {
    expect(normalizeGiftCardCode(" abcd-efgh jkmn_pqrs ")).toBe("ABCDEFGHJKMNPQRS");
    expect(formatGiftCardCode("ABCDEFGHJKMNPQRS")).toBe("ABCD-EFGH-JKMN-PQRS");
    expect(isGiftCardCodeShape("ABCDEFGHJKMNPQR0")).toBe(false);
    expect(isGiftCardCodeShape("ABCD")).toBe(false);
  });
});

describe("validateGiftCardAmount", () => {
  const rules = { presets: [50_000, 100_000], allowCustom: true, minAmount: 20_000, maxAmount: 2_000_000 };
  it("accepts presets and whole-taka custom amounts in range", () => {
    expect(validateGiftCardAmount(50_000, rules)).toBeNull();
    expect(validateGiftCardAmount(75_000, rules)).toBeNull();
  });
  it("rejects out-of-range, fractional and non-preset amounts", () => {
    expect(validateGiftCardAmount(10_000, rules)).toBe("BELOW_MINIMUM");
    expect(validateGiftCardAmount(3_000_000, rules)).toBe("ABOVE_MAXIMUM");
    expect(validateGiftCardAmount(50_050, rules)).toBe("NOT_WHOLE_TAKA");
    expect(validateGiftCardAmount(75_000, { ...rules, allowCustom: false })).toBe("NOT_A_PRESET");
  });
});

describe("giftCardUnusableReason", () => {
  const now = new Date("2026-11-16T00:00:00Z");
  it("is usable when active, funded and not expired", () => {
    expect(giftCardUnusableReason({ status: "active", balance: 100, expiresAt: null }, now)).toBeNull();
  });
  it("treats a passed expiry date as expired even before the sweep runs", () => {
    expect(giftCardUnusableReason({ status: "active", balance: 100, expiresAt: new Date("2026-11-15T00:00:00Z") }, now)).toBe("EXPIRED");
  });
  it("rejects pending, disabled and empty cards", () => {
    expect(giftCardUnusableReason({ status: "pending", balance: 100, expiresAt: null }, now)).toBe("NOT_ACTIVE");
    expect(giftCardUnusableReason({ status: "disabled", balance: 100, expiresAt: null }, now)).toBe("NOT_ACTIVE");
    expect(giftCardUnusableReason({ status: "active", balance: 0, expiresAt: null }, now)).toBe("NO_BALANCE");
  });
});

describe("allocateCredits", () => {
  it("spends the gift card first, then store credit", () => {
    expect(allocateCredits({ amountDue: 150_000, giftCardBalance: 100_000, storeCreditBalance: 80_000, useStoreCredit: true })).toEqual({ giftCard: 100_000, storeCredit: 50_000, remaining: 0 });
  });
  it("never takes more than is due", () => {
    expect(allocateCredits({ amountDue: 30_000, giftCardBalance: 100_000, storeCreditBalance: 80_000, useStoreCredit: true })).toEqual({ giftCard: 30_000, storeCredit: 0, remaining: 0 });
  });
  it("leaves store credit alone unless the shopper opted in", () => {
    expect(allocateCredits({ amountDue: 150_000, giftCardBalance: 0, storeCreditBalance: 80_000, useStoreCredit: false })).toEqual({ giftCard: 0, storeCredit: 0, remaining: 150_000 });
  });
  it("handles negative inputs defensively", () => {
    expect(allocateCredits({ amountDue: -5, giftCardBalance: -1, storeCreditBalance: -1, useStoreCredit: true })).toEqual({ giftCard: 0, storeCredit: 0, remaining: 0 });
  });
});

describe("computeReferralDiscount", () => {
  it("applies a capped percent", () => {
    expect(computeReferralDiscount(500_000, { type: "percent", value: 10, maxDiscount: 30_000, minOrder: 0 })).toBe(30_000);
    expect(computeReferralDiscount(100_000, { type: "percent", value: 10, maxDiscount: 30_000, minOrder: 0 })).toBe(10_000);
  });
  it("applies a fixed amount but never more than the goods", () => {
    expect(computeReferralDiscount(20_000, { type: "fixed", value: 50_000, maxDiscount: 0, minOrder: 0 })).toBe(20_000);
  });
  it("respects the minimum order", () => {
    expect(computeReferralDiscount(90_000, { type: "fixed", value: 10_000, maxDiscount: 0, minOrder: 100_000 })).toBe(0);
  });
});

describe("checkReferral", () => {
  const base: ReferralCheckInput = {
    referrer: { id: "r1", phone: "+8801711111111", status: "active" },
    refereeCustomerId: "c2",
    refereePhone: "+8801722222222",
    refereePreviousOrders: 0,
    refereeAlreadyReferred: false,
    couponApplied: false,
    combinableWithCoupons: false,
  };
  it("accepts a new shopper", () => expect(checkReferral(base)).toBeNull());
  it("rejects unknown and blocked referrers", () => {
    expect(checkReferral({ ...base, referrer: null })).toBe("UNKNOWN_CODE");
    expect(checkReferral({ ...base, referrer: { ...base.referrer!, status: "blocked" } })).toBe("REFERRER_INACTIVE");
  });
  it("rejects self-referral by account or by phone", () => {
    expect(checkReferral({ ...base, refereeCustomerId: "r1" })).toBe("SELF_REFERRAL");
    expect(checkReferral({ ...base, refereeCustomerId: null, refereePhone: "+8801711111111" })).toBe("SELF_REFERRAL");
  });
  it("only works on a first order and once per person", () => {
    expect(checkReferral({ ...base, refereePreviousOrders: 1 })).toBe("NOT_FIRST_ORDER");
    expect(checkReferral({ ...base, refereeAlreadyReferred: true })).toBe("ALREADY_REFERRED");
  });
  it("doesn't stack with coupons unless allowed", () => {
    expect(checkReferral({ ...base, couponApplied: true })).toBe("COUPON_IN_USE");
    expect(checkReferral({ ...base, couponApplied: true, combinableWithCoupons: true })).toBeNull();
  });
  it("recognises the referral code format", () => {
    expect(looksLikeReferralCode("A1B2C3D4")).toBe(true);
    expect(looksLikeReferralCode("SUMMER10")).toBe(false);
  });
});

describe("affiliate commission", () => {
  it("computes percent in basis points and caps fixed at the base", () => {
    expect(computeCommission(123_456, { type: "percent", value: 1_000 })).toBe(12_345);
    expect(computeCommission(10_000, { type: "fixed", value: 50_000 })).toBe(10_000);
    expect(computeCommission(0, { type: "percent", value: 1_000 })).toBe(0);
  });
  it("bases commission on kept goods after order-level discounts", () => {
    const lines = [
      { lineTotal: 100_000, discountAllocated: 10_000, quantity: 2, rejectedQty: 0, returnedQty: 1 },
      { lineTotal: 50_000, discountAllocated: 0, quantity: 1, rejectedQty: 0, returnedQty: 0 },
    ];
    // full net 140k, kept net 45k + 50k = 95k; order-level 14k → share ceil(14k*95/140) = 9500
    expect(commissionBase(lines, 14_000)).toBe(85_500);
    expect(commissionBase([{ ...lines[0]!, returnedQty: 2 }], 0)).toBe(0);
  });
  it("checks the attribution window", () => {
    const now = new Date("2026-11-16T00:00:00Z");
    expect(withinAttributionWindow(new Date("2026-11-01T00:00:00Z"), now, 30)).toBe(true);
    expect(withinAttributionWindow(new Date("2026-10-01T00:00:00Z"), now, 30)).toBe(false);
    expect(withinAttributionWindow(null, now, 30)).toBe(false);
    expect(withinAttributionWindow(new Date("2026-11-17T00:00:00Z"), now, 30)).toBe(false);
  });
  it("validates affiliate codes", () => {
    expect(isAffiliateCodeShape("NUSRAT_10")).toBe(true);
    expect(isAffiliateCodeShape("AB")).toBe(false);
    expect(isAffiliateCodeShape("has space")).toBe(false);
  });
});
