import type { AuthenticatedStaff } from "../common/types";

/**
 * `cost_price` is permission-protected (docs/PROJECT_SPEC.md §5.3) — field-
 * level filtering of API responses by permission (§11.1), kept narrow to
 * this one field rather than a general framework since it's the only field
 * in the catalog with this requirement so far.
 */
export function stripCostPrice<T extends { variants?: { costPrice?: unknown }[] }>(product: T, actor: AuthenticatedStaff): T {
  if (actor.permissions.has("catalog.cost.read") || !product.variants) return product;
  return { ...product, variants: product.variants.map((variant) => ({ ...variant, costPrice: null })) };
}
