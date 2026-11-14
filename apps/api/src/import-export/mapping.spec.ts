import { describe, expect, it } from "vitest";
import { applyMapping, normalizeHeader, sanitizeMapping, sanitizeOptions, suggestMapping, suggestOptions } from "./mapping";

const MERCHANT_HEADERS = [
  "product_handle", "title_bn", "title_en", "category_path", "status", "option1_name", "option1_value", "option2_name", "option2_value", "color_hex",
  "variant_sku", "barcode", "price_bdt", "compare_at_price_bdt", "cost_price_bdt", "stock_qty", "weight_grams", "size_chart", "fabric", "fit",
  "occasion", "tags", "description_bn", "description_en", "care_instructions", "model_info", "images", "seo_title", "seo_description", "is_featured",
];

describe("normalizeHeader", () => {
  it("ignores BOM, case, spaces, underscores, hyphens, dots and brackets", () => {
    expect(normalizeHeader("﻿Variant SKU")).toBe("variantsku");
    expect(normalizeHeader("compare_at_price-(BDT).")).toBe("compareatpricebdt");
  });
});

describe("suggestMapping", () => {
  it("maps every column of the demo merchant template", () => {
    const mapping = suggestMapping(MERCHANT_HEADERS);
    expect(Object.values(mapping).filter((field) => field === null)).toEqual([]);
    expect(mapping).toMatchObject({
      product_handle: "productSlug",
      variant_sku: "sku",
      price_bdt: "price",
      stock_qty: "onHand",
      category_path: "categoryPath",
      care_instructions: "careInstructions",
      is_featured: "isFeatured",
    });
  });

  it("still maps the original fixed M2 template", () => {
    expect(suggestMapping(["sku", "productSlug", "productTitleEn", "optionSize", "optionColor", "price", "onHand", "categorySlug"])).toEqual({
      sku: "sku",
      productSlug: "productSlug",
      productTitleEn: "titleEn",
      optionSize: "optionSize",
      optionColor: "optionColor",
      price: "price",
      onHand: "onHand",
      categorySlug: "categorySlug",
    });
  });

  it("leaves unknown headers unmapped and never assigns one field twice", () => {
    expect(suggestMapping(["Notes", "price", "Price (BDT)"])).toEqual({ Notes: null, price: "price", "Price (BDT)": null });
  });
});

describe("suggestOptions", () => {
  it("reads taka from money headers that say so, poisha otherwise", () => {
    expect(suggestOptions({ price_bdt: "price" })).toEqual({ priceUnit: "bdt" });
    expect(suggestOptions({ "Price (Tk)": "price" })).toEqual({ priceUnit: "bdt" });
    expect(suggestOptions({ price: "price" })).toEqual({ priceUnit: "poisha" });
  });
});

describe("applyMapping", () => {
  it("projects raw cells onto fields, matching headers even when the saved mapping differs in casing or BOM", () => {
    const mapping = { variant_sku: "sku", product_handle: "productSlug", ignored: null } as const;
    expect(applyMapping({ "﻿product_handle": "p", "Variant SKU": "S1", ignored: "x" }, mapping)).toEqual({ productSlug: "p", sku: "S1" });
  });
});

describe("sanitizeMapping / sanitizeOptions", () => {
  it("drops unknown field names and rejects non-objects", () => {
    expect(sanitizeMapping({ a: "sku", b: "dropTables" })).toEqual({ a: "sku", b: null });
    expect(sanitizeMapping("nope")).toBeNull();
    expect(sanitizeMapping([1, 2])).toBeNull();
  });

  it("falls back to poisha for an unknown price unit", () => {
    expect(sanitizeOptions({ priceUnit: "usd" })).toEqual({ priceUnit: "poisha" });
    expect(sanitizeOptions({ priceUnit: "bdt" })).toEqual({ priceUnit: "bdt" });
  });
});
