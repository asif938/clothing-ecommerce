import { z } from "zod";

/**
 * Shared condition model for the automation rule builder and the courier
 * assignment rules (docs/PROJECT_SPEC.md §16 M11): `{ match: "all"|"any",
 * rules: [{ field, op, value }] }`. Pure and framework-free so the admin UI
 * can preview ("test with sample event") with exactly the evaluator the API
 * uses. Money values are integers in poisha (golden rule 3).
 */
export const CONDITION_OPERATORS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in", "contains", "not_contains"] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const conditionRuleSchema = z.object({
  field: z.string().min(1).max(80),
  op: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});
export type ConditionRule = z.infer<typeof conditionRuleSchema>;

export const conditionGroupSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  rules: z.array(conditionRuleSchema).max(30).default([]),
});
export type ConditionGroup = z.infer<typeof conditionGroupSchema>;

export type ConditionContext = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

/** Fields an order-triggered rule can test — drives the builder's field dropdown. */
export const ORDER_CONDITION_FIELDS: { key: string; type: "number" | "string" | "boolean" | "list"; label: { bn: string; en: string } }[] = [
  { key: "order.total", type: "number", label: { bn: "অর্ডার মোট (পয়সা)", en: "Order total (poisha)" } },
  { key: "order.codAmount", type: "number", label: { bn: "COD পরিমাণ (পয়সা)", en: "COD amount (poisha)" } },
  { key: "order.itemCount", type: "number", label: { bn: "আইটেম সংখ্যা", en: "Item count" } },
  { key: "order.status", type: "string", label: { bn: "অর্ডার স্ট্যাটাস", en: "Order status" } },
  { key: "order.paymentStatus", type: "string", label: { bn: "পেমেন্ট স্ট্যাটাস", en: "Payment status" } },
  { key: "order.channel", type: "string", label: { bn: "চ্যানেল", en: "Channel" } },
  { key: "order.riskLevel", type: "string", label: { bn: "রিস্ক লেভেল", en: "Risk level" } },
  { key: "order.riskScore", type: "number", label: { bn: "রিস্ক স্কোর", en: "Risk score" } },
  { key: "order.tags", type: "list", label: { bn: "অর্ডার ট্যাগ", en: "Order tags" } },
  { key: "order.isPrepaid", type: "boolean", label: { bn: "অগ্রিম পেমেন্ট হয়েছে", en: "Has advance/prepayment" } },
  { key: "order.hasDuplicate", type: "boolean", label: { bn: "সম্ভাব্য ডুপ্লিকেট", en: "Possible duplicate" } },
  { key: "order.divisionId", type: "string", label: { bn: "বিভাগ", en: "Division" } },
  { key: "order.districtId", type: "string", label: { bn: "জেলা", en: "District" } },
  { key: "order.isDhakaCity", type: "boolean", label: { bn: "ঢাকা সিটি", en: "Dhaka city" } },
  { key: "order.weightGrams", type: "number", label: { bn: "ওজন (গ্রাম)", en: "Weight (grams)" } },
  { key: "customer.orderCount", type: "number", label: { bn: "গ্রাহকের মোট অর্ডার", en: "Customer's order count" } },
  { key: "customer.isFirstOrder", type: "boolean", label: { bn: "প্রথম অর্ডার", en: "First order" } },
  { key: "customer.rejectedAtDoorCount", type: "number", label: { bn: "দরজায় প্রত্যাখ্যান সংখ্যা", en: "Doorstep rejection count" } },
  { key: "customer.tags", type: "list", label: { bn: "গ্রাহক ট্যাগ", en: "Customer tags" } },
];

function compare(actual: ConditionContext[string], op: ConditionOperator, expected: ConditionRule["value"]): boolean {
  if (actual === undefined || actual === null) {
    // A missing field satisfies only the negative operators.
    return op === "neq" || op === "not_in" || op === "not_contains";
  }
  switch (op) {
    case "eq":
      return Array.isArray(actual) ? false : actual === expected;
    case "neq":
      return Array.isArray(actual) ? true : actual !== expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "in":
      return Array.isArray(expected) && !Array.isArray(actual) && (expected as (string | number)[]).includes(actual as string | number);
    case "not_in":
      return !(Array.isArray(expected) && !Array.isArray(actual) && (expected as (string | number)[]).includes(actual as string | number));
    case "contains":
      if (Array.isArray(actual)) return actual.includes(expected as string | number);
      return typeof actual === "string" && typeof expected === "string" && actual.toLowerCase().includes(expected.toLowerCase());
    case "not_contains":
      if (Array.isArray(actual)) return !actual.includes(expected as string | number);
      return !(typeof actual === "string" && typeof expected === "string" && actual.toLowerCase().includes(expected.toLowerCase()));
  }
}

/** An empty rule list matches everything (a rule with no conditions is "always"). */
export function evaluateConditions(group: ConditionGroup, context: ConditionContext): boolean {
  if (group.rules.length === 0) return true;
  const results = group.rules.map((rule) => compare(context[rule.field], rule.op, rule.value));
  return group.match === "all" ? results.every(Boolean) : results.some(Boolean);
}

/** Per-rule pass/fail, for the builder's "test with sample event" explanation. */
export function explainConditions(group: ConditionGroup, context: ConditionContext): { rule: ConditionRule; actual: ConditionContext[string]; passed: boolean }[] {
  return group.rules.map((rule) => ({ rule, actual: context[rule.field], passed: compare(context[rule.field], rule.op, rule.value) }));
}
