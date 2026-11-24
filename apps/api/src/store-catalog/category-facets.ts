/**
 * Category filter for listings (the all-products `/shop` page above all).
 * Pure so it is unit tested without a database.
 *
 * Counts are rolled up to every ancestor: a shopper picking "Men" expects
 * "Men → Panjabi" products too, even when no product sits on "Men" itself.
 */

export interface CategoryNode {
  id: string;
  parentId: string | null;
  name: unknown;
  slug: string;
  sortOrder: number;
}

export interface CategoryFacetValue {
  id: string;
  slug: string;
  name: unknown;
  /** 0 for a top-level category, 1 for its children, and so on. */
  depth: number;
  count: number;
}

function ancestorsOf(id: string, byId: Map<string, CategoryNode>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

/**
 * Turns per-category product counts into a tree-ordered list (parents before
 * their children, siblings by `sortOrder`) holding only categories that have
 * at least one product, directly or below them. A category whose parent is
 * missing or inactive is treated as top-level.
 */
export function buildCategoryFacet(categories: CategoryNode[], directCounts: Map<string, number>): CategoryFacetValue[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, number>();
  for (const [categoryId, count] of directCounts) {
    for (const id of ancestorsOf(categoryId, byId)) totals.set(id, (totals.get(id) ?? 0) + count);
  }

  const children = new Map<string | null, CategoryNode[]>();
  for (const category of categories) {
    if (!totals.get(category.id)) continue;
    const parent = category.parentId && byId.has(category.parentId) ? category.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(category);
    children.set(parent, list);
  }

  const out: CategoryFacetValue[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const list = (children.get(parentId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
    for (const category of list) {
      out.push({ id: category.id, slug: category.slug, name: category.name, depth, count: totals.get(category.id) ?? 0 });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

/** The chosen categories plus everything below them — what a category filter actually matches. */
export function expandWithDescendants(categories: Pick<CategoryNode, "id" | "parentId">[], selectedIds: string[]): string[] {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const list = children.get(category.parentId) ?? [];
    list.push(category.id);
    children.set(category.parentId, list);
  }
  const result = new Set<string>();
  const stack = [...selectedIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return [...result];
}
