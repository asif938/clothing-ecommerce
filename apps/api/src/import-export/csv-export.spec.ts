import { describe, expect, it } from "vitest";
import { buildExportRows } from "./csv-export";

describe("buildExportRows", () => {
  it("emits one row per variant, carrying the product's shared fields", () => {
    const rows = buildExportRows([
      {
        slug: "panjabi",
        title: { en: "Panjabi", bn: "পাঞ্জাবি" },
        status: "active",
        tags: ["eid", "new"],
        category: { slug: "mens-wear" },
        variants: [
          { sku: "A1", price: 150000, compareAtPrice: 180000, costPrice: null, barcode: null, weightGrams: 300 },
          { sku: "A2", price: 160000, compareAtPrice: null, costPrice: null, barcode: null, weightGrams: null },
        ],
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sku: "A1", productSlug: "panjabi", productTitleEn: "Panjabi", categorySlug: "mens-wear", price: 150000, tags: "eid,new" });
    expect(rows[1]).toMatchObject({ sku: "A2", price: 160000, compareAtPrice: "" });
  });

  it("returns an empty list for a product with no variants", () => {
    expect(buildExportRows([{ slug: "x", title: {}, status: "draft", tags: [], category: null, variants: [] }])).toEqual([]);
  });
});
