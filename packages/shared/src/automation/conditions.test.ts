import { describe, expect, it } from "vitest";
import { evaluateConditions, explainConditions, type ConditionGroup } from "./conditions.ts";
import { AUTOMATION_TEMPLATES, automationRuleInputSchema } from "./rules.ts";

const ctx = { "order.total": 2_000_000, "order.riskLevel": "high", "order.tags": ["vip", "gift"], "customer.rejectedAtDoorCount": 3, "customer.isFirstOrder": false };

describe("evaluateConditions", () => {
  it("matches everything when there are no rules", () => {
    expect(evaluateConditions({ match: "all", rules: [] }, ctx)).toBe(true);
  });
  it("requires every rule with match=all", () => {
    const g: ConditionGroup = { match: "all", rules: [{ field: "order.total", op: "gte", value: 1_500_000 }, { field: "order.riskLevel", op: "eq", value: "low" }] };
    expect(evaluateConditions(g, ctx)).toBe(false);
  });
  it("needs just one rule with match=any", () => {
    const g: ConditionGroup = { match: "any", rules: [{ field: "order.total", op: "lt", value: 100 }, { field: "order.riskLevel", op: "eq", value: "high" }] };
    expect(evaluateConditions(g, ctx)).toBe(true);
  });
  it("supports list contains / in / not_in", () => {
    expect(evaluateConditions({ match: "all", rules: [{ field: "order.tags", op: "contains", value: "vip" }] }, ctx)).toBe(true);
    expect(evaluateConditions({ match: "all", rules: [{ field: "order.tags", op: "not_contains", value: "vip" }] }, ctx)).toBe(false);
    expect(evaluateConditions({ match: "all", rules: [{ field: "order.riskLevel", op: "in", value: ["medium", "high"] }] }, ctx)).toBe(true);
    expect(evaluateConditions({ match: "all", rules: [{ field: "order.riskLevel", op: "not_in", value: ["high"] }] }, ctx)).toBe(false);
  });
  it("treats a missing field as satisfying only negative operators", () => {
    expect(evaluateConditions({ match: "all", rules: [{ field: "nope", op: "eq", value: "x" }] }, ctx)).toBe(false);
    expect(evaluateConditions({ match: "all", rules: [{ field: "nope", op: "neq", value: "x" }] }, ctx)).toBe(true);
    expect(evaluateConditions({ match: "all", rules: [{ field: "nope", op: "gt", value: 1 }] }, ctx)).toBe(false);
  });
  it("never compares across types with numeric operators", () => {
    expect(evaluateConditions({ match: "all", rules: [{ field: "order.riskLevel", op: "gt", value: 1 }] }, ctx)).toBe(false);
  });
  it("explains each rule", () => {
    const out = explainConditions({ match: "all", rules: [{ field: "order.total", op: "gt", value: 5 }] }, ctx);
    expect(out[0]).toMatchObject({ actual: 2_000_000, passed: true });
  });
});

describe("AUTOMATION_TEMPLATES", () => {
  it.each(AUTOMATION_TEMPLATES.map((t) => [t.key, t] as const))("template %s is a valid rule", (_key, t) => {
    const parsed = automationRuleInputSchema.safeParse({ name: t.name.en, trigger: t.trigger, conditions: t.conditions, actions: t.actions });
    expect(parsed.success).toBe(true);
  });
});
