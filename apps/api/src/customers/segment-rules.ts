import type { Prisma } from "@clothing/db";

/**
 * Customer segments (docs/PROJECT_SPEC.md §5.5 `segments`, §8.2 "segments
 * builder (rules with live count)") — the same small condition-tree→Prisma-
 * `where` pattern `collections/collection-rules.ts` (M2) already
 * established for automatic collections, applied to `Customer` instead of
 * `Product`. No materialized membership table: a segment's members are
 * always computed live from its rules, so there is nothing to keep in sync
 * when a customer's stats change — see docs/DECISIONS.md.
 */
export type SegmentRuleField = "totalSpent" | "ordersCount" | "deliveredCount" | "rejectedAtDoorCount" | "riskScore" | "tag" | "status" | "inactiveDays" | "districtId";
export type SegmentRuleOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";

export interface SegmentRuleCondition {
  field: SegmentRuleField;
  op: SegmentRuleOp;
  value: unknown;
}

export interface SegmentRules {
  match: "all" | "any";
  conditions: SegmentRuleCondition[];
}

function numericFilter(field: "totalSpent" | "ordersCount" | "deliveredCount" | "rejectedAtDoorCount" | "riskScore", condition: SegmentRuleCondition): Prisma.CustomerWhereInput {
  const amount = condition.value as number;
  const filter =
    condition.op === "gt" ? { gt: amount } : condition.op === "gte" ? { gte: amount } : condition.op === "lt" ? { lt: amount } : condition.op === "lte" ? { lte: amount } : condition.op === "neq" ? { not: amount } : { equals: amount };
  return { [field]: filter } as Prisma.CustomerWhereInput;
}

function conditionToWhere(condition: SegmentRuleCondition): Prisma.CustomerWhereInput {
  switch (condition.field) {
    case "totalSpent":
    case "ordersCount":
    case "deliveredCount":
    case "rejectedAtDoorCount":
    case "riskScore":
      return numericFilter(condition.field, condition);
    case "tag":
      return condition.op === "in" ? { tags: { hasSome: condition.value as string[] } } : { tags: { has: condition.value as string } };
    case "status":
      return { status: condition.value as Prisma.CustomerWhereInput["status"] };
    case "districtId":
      return { addresses: { some: { districtId: condition.value as string } } };
    case "inactiveDays": {
      // "no order/login activity in at least N days" — null `lastSeenAt` (never seen) counts as inactive too.
      const cutoff = new Date(Date.now() - (condition.value as number) * 24 * 60 * 60 * 1000);
      return condition.op === "lt" || condition.op === "lte" ? { lastSeenAt: { gte: cutoff } } : { OR: [{ lastSeenAt: { lt: cutoff } }, { lastSeenAt: null }] };
    }
  }
}

export function buildCustomerWhereFromRules(rules: SegmentRules): Prisma.CustomerWhereInput {
  const clauses = rules.conditions.map(conditionToWhere);
  if (clauses.length === 0) return { id: { equals: "__none__" } };
  return rules.match === "all" ? { AND: clauses } : { OR: clauses };
}
