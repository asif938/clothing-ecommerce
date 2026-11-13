import { describe, expect, it } from "vitest";
import { BUNDLE_FORMAT, bundleSchema, findIdReferences, menuItemsFromPortable, menuItemsToPortable, orderByParent, sameValue, stableStringify, type SlugLookup } from "./bundle";

const lookup = (entries: Partial<Record<keyof SlugLookup, [string, string][]>>): SlugLookup => ({
  category: new Map(entries.category ?? []),
  collection: new Map(entries.collection ?? []),
  product: new Map(entries.product ?? []),
  page: new Map(entries.page ?? []),
});

describe("menu portability", () => {
  const menu = [
    { id: "a", type: "category", label: { en: "Men" }, targetId: "cat-1", children: [{ id: "b", type: "page", targetId: "pg-1", label: { en: "Size guide" } }] },
    { id: "c", type: "url", url: "https://example.com", label: { en: "Blog" } },
  ];

  it("swaps ids for slugs on export, including nested children", () => {
    const out = menuItemsToPortable(menu, lookup({ category: [["cat-1", "men"]], page: [["pg-1", "size-guide"]] }));
    expect(out[0]).toMatchObject({ targetSlug: "men" });
    expect(out[0]).not.toHaveProperty("targetId");
    expect(out[0]!.children![0]).toMatchObject({ targetSlug: "size-guide" });
    expect(out[1]).toEqual(menu[1]);
  });

  it("resolves slugs to this deployment's ids on import and reports dead links", () => {
    const portable = menuItemsToPortable(menu, lookup({ category: [["cat-1", "men"]], page: [["pg-1", "size-guide"]] }));
    const { items, unresolved } = menuItemsFromPortable(portable, lookup({ category: [["men", "new-cat"]] }));
    expect(items[0]).toMatchObject({ targetId: "new-cat" });
    expect(items[0]!.children![0]).not.toHaveProperty("targetId");
    expect(unresolved).toEqual(["page:size-guide"]);
  });

  it("round-trips when every target exists", () => {
    const ids = lookup({ category: [["cat-1", "men"]], page: [["pg-1", "size-guide"]] });
    const bySlug = lookup({ category: [["men", "cat-1"]], page: [["size-guide", "pg-1"]] });
    const { items, unresolved } = menuItemsFromPortable(menuItemsToPortable(menu, ids), bySlug);
    expect(unresolved).toEqual([]);
    expect(items).toEqual(menu);
  });
});

describe("findIdReferences", () => {
  it("finds embedded media and entity ids anywhere in the blocks", () => {
    const blocks = [{ type: "hero", props: { imageMediaId: "m1", heading: { en: "Hi" } } }, { type: "grid", props: { collectionId: "col1", productIds: ["p1"], columns: 4 } }];
    expect(findIdReferences(blocks)).toEqual(["collectionId", "imageMediaId", "productIds"]);
  });

  it("ignores empty references and plain fields", () => {
    expect(findIdReferences([{ props: { imageMediaId: null, productIds: [], mediaId: "", title: "x" } }])).toEqual([]);
  });
});

describe("stableStringify / sameValue", () => {
  it("ignores key order and undefined", () => {
    expect(sameValue({ a: 1, b: { c: 2, d: [1, { x: 1, y: 2 }] } }, { b: { d: [1, { y: 2, x: 1 }], c: 2 }, a: 1, z: undefined })).toBe(true);
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("orderByParent", () => {
  const cat = (slug: string, parentSlug: string | null) => ({ slug, parentSlug });

  it("puts parents first regardless of input order", () => {
    const { ordered, orphans } = orderByParent([cat("shirts", "men"), cat("men", null), cat("polo", "shirts")], new Set());
    expect(ordered.map((c) => c.slug)).toEqual(["men", "shirts", "polo"]);
    expect(orphans).toEqual([]);
  });

  it("accepts a parent that already exists on the target", () => {
    expect(orderByParent([cat("shirts", "men")], new Set(["men"])).ordered).toHaveLength(1);
  });

  it("returns categories with a missing parent or a cycle as orphans", () => {
    const { ordered, orphans } = orderByParent([cat("a", "ghost"), cat("x", "y"), cat("y", "x"), cat("ok", null)], new Set());
    expect(ordered.map((c) => c.slug)).toEqual(["ok"]);
    expect(orphans.map((c) => c.slug).sort()).toEqual(["a", "x", "y"]);
  });
});

describe("bundleSchema", () => {
  it("accepts a minimal bundle and rejects other formats or newer versions", () => {
    expect(bundleSchema.safeParse({ format: BUNDLE_FORMAT, version: 1 }).success).toBe(true);
    expect(bundleSchema.safeParse({ format: "something-else", version: 1 }).success).toBe(false);
    expect(bundleSchema.safeParse({ format: BUNDLE_FORMAT, version: 99 }).success).toBe(false);
  });

  it("rejects a malformed section", () => {
    expect(bundleSchema.safeParse({ format: BUNDLE_FORMAT, version: 1, data: { uiStrings: [{ key: "a", bn: 1, en: "x" }] } }).success).toBe(false);
  });
});
