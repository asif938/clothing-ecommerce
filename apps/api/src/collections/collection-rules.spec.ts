import { describe, expect, it } from "vitest";
import { buildProductWhereFromRules, type CollectionRules } from "./collection-rules";

describe("buildProductWhereFromRules", () => {
  it("matches nothing for an empty condition list (not everything)", () => {
    expect(buildProductWhereFromRules({ match: "all", conditions: [] })).toEqual({ id: { equals: "__none__" } });
  });

  it("combines conditions with AND for match: all", () => {
    const rules: CollectionRules = {
      match: "all",
      conditions: [
        { field: "category", op: "eq", value: "cat-1" },
        { field: "price", op: "lte", value: 500000 },
      ],
    };
    expect(buildProductWhereFromRules(rules)).toEqual({
      AND: [{ categoryId: "cat-1" }, { variants: { some: { price: { lte: 500000 } } } }],
    });
  });

  it("combines conditions with OR for match: any", () => {
    const rules: CollectionRules = {
      match: "any",
      conditions: [
        { field: "tag", op: "eq", value: "eid" },
        { field: "tag", op: "eq", value: "wedding" },
      ],
    };
    expect(buildProductWhereFromRules(rules)).toEqual({
      OR: [{ tags: { has: "eid" } }, { tags: { has: "wedding" } }],
    });
  });

  it("maps an attribute condition to a product_attribute_values lookup", () => {
    const rules: CollectionRules = { match: "all", conditions: [{ field: "attribute", op: "eq", value: { attributeId: "attr-1", attributeValueId: "val-1" } }] };
    expect(buildProductWhereFromRules(rules)).toEqual({ AND: [{ attributeValues: { some: { attributeId: "attr-1", attributeValueId: "val-1" } } }] });
  });

  it("maps a category 'in' condition to categoryId.in", () => {
    const rules: CollectionRules = { match: "any", conditions: [{ field: "category", op: "in", value: ["cat-1", "cat-2"] }] };
    expect(buildProductWhereFromRules(rules)).toEqual({ OR: [{ categoryId: { in: ["cat-1", "cat-2"] } }] });
  });
});
