import { describe, expect, it } from "vitest";
import { pickCourierRule } from "./courier-rules.service";

const rule = (over: Partial<Parameters<typeof pickCourierRule>[0][number]>) => ({
  id: "r",
  name: "rule",
  priority: 100,
  conditions: { match: "all", rules: [] },
  courierProviderInstanceId: "courier-x",
  isActive: true,
  ...over,
});

const ctx = { "order.districtId": "ctg", "order.codAmount": 1_500_000, "order.isDhakaCity": false };

describe("pickCourierRule", () => {
  it("returns null when nothing matches", () => {
    expect(pickCourierRule([rule({ conditions: { match: "all", rules: [{ field: "order.districtId", op: "eq", value: "dhk" }] } })], ctx)).toBeNull();
  });
  it("lowest priority number wins among matches", () => {
    const rules = [
      rule({ id: "late", priority: 200, courierProviderInstanceId: "b" }),
      rule({ id: "early", priority: 10, courierProviderInstanceId: "a", conditions: { match: "all", rules: [{ field: "order.districtId", op: "eq", value: "ctg" }] } }),
    ];
    expect(pickCourierRule(rules, ctx)).toEqual({ ruleId: "early", ruleName: "rule", providerInstanceId: "a" });
  });
  it("skips inactive rules and falls through to the catch-all", () => {
    const rules = [rule({ id: "off", priority: 1, isActive: false, courierProviderInstanceId: "a" }), rule({ id: "all", priority: 999, courierProviderInstanceId: "z" })];
    expect(pickCourierRule(rules, ctx)?.providerInstanceId).toBe("z");
  });
  it("matches on money thresholds in poisha", () => {
    const big = rule({ conditions: { match: "all", rules: [{ field: "order.codAmount", op: "gte", value: 1_000_000 }] } });
    expect(pickCourierRule([big], ctx)).not.toBeNull();
    expect(pickCourierRule([big], { ...ctx, "order.codAmount": 500_000 })).toBeNull();
  });
  it("ignores a rule with a malformed condition blob instead of throwing", () => {
    expect(pickCourierRule([rule({ conditions: "garbage" })], ctx)).toBeNull();
  });
});
