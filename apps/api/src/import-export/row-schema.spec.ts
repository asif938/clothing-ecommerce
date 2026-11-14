import { describe, expect, it } from "vitest";
import { validateImportRow } from "./row-schema";

describe("validateImportRow", () => {
  it("accepts a well-formed row and coerces numeric/array fields", () => {
    const { row, error } = validateImportRow(
      { sku: "PNJ-001-M-RED", productSlug: "panjabi", productTitleEn: "Panjabi", optionSize: "M", optionColor: "Red", price: 150000, onHand: "10", tags: "eid, new" },
      2,
    );
    expect(error).toBeNull();
    expect(row).toMatchObject({ sku: "PNJ-001-M-RED", productSlug: "panjabi", price: 150000, onHand: 10, tags: ["eid", "new"] });
  });

  it("is tolerant of header casing and spacing", () => {
    const { row, error } = validateImportRow({ SKU: "A1", "Product Slug": "a", Price: 1000 }, 2);
    expect(error).toBeNull();
    expect(row).toMatchObject({ sku: "A1", productSlug: "a", price: 1000 });
  });

  it("reports a missing sku with the 1-based row number", () => {
    const { row, error } = validateImportRow({ productSlug: "a", price: 1000 }, 5);
    expect(row).toBeNull();
    expect(error).toMatchObject({ row: 5, sku: null });
    expect(error?.message).toMatch(/sku/i);
  });

  it("reports a non-numeric price without crashing", () => {
    const { row, error } = validateImportRow({ sku: "A1", productSlug: "a", price: "not-a-number" }, 3);
    expect(row).toBeNull();
    expect(error?.row).toBe(3);
    expect(error?.sku).toBe("A1");
  });

  it("rejects a negative price", () => {
    const { error } = validateImportRow({ sku: "A1", productSlug: "a", price: -100 }, 4);
    expect(error?.message).toMatch(/not be negative/);
  });

  it("leaves tags undefined when the column is blank", () => {
    const { row } = validateImportRow({ sku: "A1", productSlug: "a", price: 1000, tags: "" }, 2);
    expect(row?.tags).toBeUndefined();
  });
});

describe("validateImportRow — merchant templates (§8.2 column mapping)", () => {
  const bdt = { priceUnit: "bdt" } as const;

  it("converts taka to poisha, tolerating thousands separators, currency marks and Bangla digits", () => {
    const { row } = validateImportRow({ variant_sku: "A1", product_handle: "a", price_bdt: "৳2,450", compare_at_price_bdt: "২৯৫০", cost_price_bdt: 1150.5 }, 2, undefined, bdt);
    expect(row).toMatchObject({ price: 245000, compareAtPrice: 295000, costPrice: 115050 });
  });

  it("rejects fractional poisha but not fractional taka", () => {
    expect(validateImportRow({ sku: "A1", productSlug: "a", price: 10.5 }, 2).error?.message).toMatch(/whole number of poisha/);
    expect(validateImportRow({ sku: "A1", productSlug: "a", price: 10.5 }, 2, undefined, bdt).row?.price).toBe(1050);
  });

  it("splits ; or , lists and > category paths", () => {
    const { row } = validateImportRow({ sku: "A1", productSlug: "a", price: 1, tags: "eid-2027;new-arrival", occasion: "Eid; Festive", category_path: "Kids > Boys > Panjabi" }, 2);
    expect(row).toMatchObject({ tags: ["eid-2027", "new-arrival"], occasion: ["Eid", "Festive"], categoryPath: ["Kids", "Boys", "Panjabi"] });
  });

  it("routes single-language text by script and lets explicit bn/en columns win", () => {
    const { row } = validateImportRow(
      { sku: "A1", productSlug: "a", price: 1, care_instructions: "ঠান্ডা পানিতে ধুয়ে নিন", fabric: "Cotton", title: "Panjabi", title_bn: "পাঞ্জাবি" },
      2,
    );
    expect(row).toMatchObject({ careInstructions: { bn: "ঠান্ডা পানিতে ধুয়ে নিন" }, fabric: { en: "Cotton" }, title: { en: "Panjabi", bn: "পাঞ্জাবি" } });
  });

  it("builds option slots and keeps the normalized colour hex at row level (applied to the colour option at import time)", () => {
    const named = validateImportRow({ sku: "A1", productSlug: "a", price: 1, option1_name: "Size", option1_value: "M", option2_name: "Color", option2_value: "Navy", color_hex: "1f2a44" }, 2);
    expect(named.row?.options).toEqual([
      { position: 0, name: "Size", value: "M" },
      { position: 1, name: "Color", value: "Navy" },
    ]);
    expect(named.row?.colorHex).toBe("#1F2A44");
    // Continuation row: both slots unnamed — the hex must not be pinned to the first (size) slot.
    const continuation = validateImportRow({ sku: "A2", productSlug: "a", price: 1, option1_value: "L", option2_value: "Off White", color_hex: "#F2EDE4" }, 3);
    expect(continuation.row?.options).toEqual([
      { position: 0, name: undefined, value: "L" },
      { position: 1, name: undefined, value: "Off White" },
    ]);
    expect(continuation.row?.colorHex).toBe("#F2EDE4");
  });

  it("warns (not fails) on a bad hex, and fails on bad status / featured flags", () => {
    expect(validateImportRow({ sku: "A1", productSlug: "a", price: 1, option1_name: "Color", option1_value: "Red", color_hex: "red" }, 2).warnings[0]).toMatch(/not a hex colour/);
    expect(validateImportRow({ sku: "A1", productSlug: "a", price: 1, status: "live" }, 2).error?.message).toMatch(/status must be one of/);
    expect(validateImportRow({ sku: "A1", productSlug: "a", price: 1, is_featured: "maybe" }, 2).error?.message).toMatch(/isFeatured/);
    expect(validateImportRow({ sku: "A1", productSlug: "a", price: 1, status: "Active", is_featured: "TRUE" }, 2).row).toMatchObject({ status: "active", isFeatured: true });
  });

  it("collects image file names and URLs", () => {
    const { row } = validateImportRow({ sku: "A1", productSlug: "a", price: 1, images: "A-1.jpg; https://cdn.example.com/a-2.jpg" }, 2);
    expect(row?.images).toEqual(["A-1.jpg", "https://cdn.example.com/a-2.jpg"]);
  });

  it("uses an explicit mapping instead of guessing", () => {
    const { row } = validateImportRow({ Code: "Z9", Group: "saree", Amount: 1850 }, 2, { Code: "sku", Group: "productSlug", Amount: "price" }, bdt);
    expect(row).toMatchObject({ sku: "Z9", productSlug: "saree", price: 185000 });
  });
});
