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
