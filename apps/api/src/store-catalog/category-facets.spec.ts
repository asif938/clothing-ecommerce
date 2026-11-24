import { describe, expect, it } from "vitest";
import { buildCategoryFacet, expandWithDescendants, type CategoryNode } from "./category-facets";

const categories: CategoryNode[] = [
  { id: "women", parentId: null, name: { en: "Women" }, slug: "women", sortOrder: 2 },
  { id: "men", parentId: null, name: { en: "Men" }, slug: "men", sortOrder: 1 },
  { id: "panjabi", parentId: "men", name: { en: "Panjabi" }, slug: "panjabi", sortOrder: 1 },
  { id: "shirt", parentId: "men", name: { en: "Shirt" }, slug: "shirt", sortOrder: 2 },
  { id: "saree", parentId: "women", name: { en: "Saree" }, slug: "saree", sortOrder: 1 },
  { id: "kids", parentId: null, name: { en: "Kids" }, slug: "kids", sortOrder: 3 },
];

describe("buildCategoryFacet", () => {
  it("rolls counts up to parents, keeps tree order, and drops empty categories", () => {
    const facet = buildCategoryFacet(categories, new Map([["panjabi", 3], ["shirt", 2], ["men", 1], ["saree", 4]]));
    expect(facet.map((f) => [f.id, f.depth, f.count])).toEqual([
      ["men", 0, 6],
      ["panjabi", 1, 3],
      ["shirt", 1, 2],
      ["women", 0, 4],
      ["saree", 1, 4],
    ]);
  });

  it("treats a category whose parent is missing as top level", () => {
    const facet = buildCategoryFacet([{ id: "orphan", parentId: "gone", name: {}, slug: "orphan", sortOrder: 0 }], new Map([["orphan", 2]]));
    expect(facet).toEqual([{ id: "orphan", slug: "orphan", name: {}, depth: 0, count: 2 }]);
  });
});

describe("expandWithDescendants", () => {
  it("includes every category below the chosen ones", () => {
    expect(expandWithDescendants(categories, ["men"]).sort()).toEqual(["men", "panjabi", "shirt"]);
    expect(expandWithDescendants(categories, ["saree", "kids"]).sort()).toEqual(["kids", "saree"]);
  });
});
