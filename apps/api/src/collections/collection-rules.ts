import type { Prisma } from "@clothing/db";

/**
 * Automatic collections (docs/PROJECT_SPEC.md §5.3 `collections.rules`,
 * §8.2 "rule builder with live preview count"): a small condition tree
 * evaluated into a Prisma `where` clause, kept as a pure function so the
 * rule→query mapping is unit-testable without a database.
 */
export type RuleField = "category" | "tag" | "price" | "attribute" | "status";
export type RuleOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";

export interface RuleCondition {
  field: RuleField;
  op: RuleOp;
  value: unknown;
}

export interface CollectionRules {
  match: "all" | "any";
  conditions: RuleCondition[];
}

function conditionToWhere(condition: RuleCondition): Prisma.ProductWhereInput {
  switch (condition.field) {
    case "category":
      return condition.op === "in" ? { categoryId: { in: condition.value as string[] } } : { categoryId: condition.value as string };
    case "tag":
      return condition.op === "in" ? { tags: { hasSome: condition.value as string[] } } : { tags: { has: condition.value as string } };
    case "status":
      return { status: condition.value as Prisma.ProductWhereInput["status"] };
    case "price": {
      const amount = condition.value as number;
      const priceFilter: Record<string, number> =
        condition.op === "gt" ? { gt: amount } : condition.op === "gte" ? { gte: amount } : condition.op === "lt" ? { lt: amount } : condition.op === "lte" ? { lte: amount } : { equals: amount };
      return { variants: { some: { price: priceFilter } } };
    }
    case "attribute": {
      const { attributeId, attributeValueId } = condition.value as { attributeId: string; attributeValueId?: string };
      return { attributeValues: { some: { attributeId, ...(attributeValueId ? { attributeValueId } : {}) } } };
    }
  }
}

export function buildProductWhereFromRules(rules: CollectionRules): Prisma.ProductWhereInput {
  const clauses = rules.conditions.map(conditionToWhere);
  if (clauses.length === 0) return { id: { equals: "__none__" } }; // no conditions = no matches, not "everything"
  return rules.match === "all" ? { AND: clauses } : { OR: clauses };
}
