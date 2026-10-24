import { describe, expect, it } from "vitest";
import { conditionsMatch, evaluatePaymentRules, type PaymentRule, type RuleContext } from "./payment-rules-engine";

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    total: 1000_00,
    subtotal: 1000_00,
    itemCount: 2,
    zoneId: "dhaka",
    districtId: "dist-dhaka",
    areaId: "area-gulshan",
    isDhakaCity: true,
    customerType: "new",
    ordersCount: 0,
    deliveredCount: 0,
    rejectionRate: 0,
    customerTags: [],
    riskLevel: "low",
    riskScore: 10,
    categoryIds: [],
    productIds: [],
    cartTags: [],
    hasFlashSaleItem: false,
    paymentMethod: "cod",
    now: new Date("2026-01-01T12:00:00Z"),
    utmSource: null,
    phoneBlocked: false,
    ...overrides,
  };
}

describe("conditionsMatch", () => {
  it("matches with no conditions at all", () => {
    expect(conditionsMatch({}, ctx())).toBe(true);
  });

  it("requires every condition by default (match: all)", () => {
    expect(conditionsMatch({ totalMin: 500_00, isDhakaCity: false }, ctx())).toBe(false);
  });

  it("matches any condition when match: 'any'", () => {
    expect(conditionsMatch({ match: "any", totalMin: 500_00, isDhakaCity: false }, ctx())).toBe(true);
  });

  it("matches a risk level in the allowed list", () => {
    expect(conditionsMatch({ riskLevels: ["high"] }, ctx({ riskLevel: "high" }))).toBe(true);
    expect(conditionsMatch({ riskLevels: ["high"] }, ctx({ riskLevel: "low" }))).toBe(false);
  });

  it("supports an overnight hour range", () => {
    expect(conditionsMatch({ hourRange: [22, 6] }, ctx({ now: new Date("2026-01-01T23:00:00Z") }))).toBe(true);
    expect(conditionsMatch({ hourRange: [22, 6] }, ctx({ now: new Date("2026-01-01T12:00:00Z") }))).toBe(false);
  });
});

function rule(overrides: Partial<PaymentRule>): PaymentRule {
  return { id: "r1", priority: 0, isActive: true, conditions: {}, actions: [], stopProcessing: false, ...overrides };
}

describe("evaluatePaymentRules", () => {
  it("blocks a blocklisted phone and records the matched rule (§6.5 default rule 1)", () => {
    const rules = [rule({ id: "blocklist", priority: 100, conditions: { phoneBlocked: true }, actions: [{ type: "block_order", message: "Blocked" }] })];
    const outcome = evaluatePaymentRules(rules, ctx({ phoneBlocked: true }));
    expect(outcome.blocked).toBe("Blocked");
    expect(outcome.matchedRuleIds).toEqual(["blocklist"]);
  });

  it("requires advance = delivery fee + OTP for high risk", () => {
    const rules = [rule({ conditions: { riskLevels: ["high"] }, actions: [{ type: "require_advance", kind: "delivery_fee" }, { type: "require_otp" }] })];
    const outcome = evaluatePaymentRules(rules, ctx({ riskLevel: "high" }));
    expect(outcome.advanceRequired).toEqual({ kind: "delivery_fee", amount: undefined, percent: undefined });
    expect(outcome.otpRequired).toBe(true);
  });

  it("the strictest advance requirement wins across multiple matching rules", () => {
    const rules = [
      rule({ id: "small", priority: 1, conditions: { totalMin: 0 }, actions: [{ type: "require_advance", kind: "delivery_fee" }] }),
      rule({ id: "big", priority: 2, conditions: { totalMin: 0 }, actions: [{ type: "require_advance", kind: "percent", percent: 20 }] }),
    ];
    const outcome = evaluatePaymentRules(rules, ctx());
    expect(outcome.advanceRequired?.kind).toBe("percent");
    expect(outcome.advanceRequired?.percent).toBe(20);
  });

  it("stopProcessing skips lower-priority rules", () => {
    const rules = [
      rule({ id: "first", priority: 10, stopProcessing: true, actions: [{ type: "show_message", message: "first" }] }),
      rule({ id: "second", priority: 1, actions: [{ type: "show_message", message: "second" }] }),
    ];
    const outcome = evaluatePaymentRules(rules, ctx());
    expect(outcome.messages).toEqual(["first"]);
  });

  it("ignores inactive rules", () => {
    const rules = [rule({ isActive: false, actions: [{ type: "block_order", message: "nope" }] })];
    expect(evaluatePaymentRules(rules, ctx()).blocked).toBeNull();
  });

  it("disable_cod also adds cod to disabledMethods", () => {
    const outcome = evaluatePaymentRules([rule({ actions: [{ type: "disable_cod" }] })], ctx());
    expect(outcome.codDisabled).toBe(true);
    expect(outcome.disabledMethods.has("cod")).toBe(true);
  });
});
