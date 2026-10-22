import { describe, expect, it } from "vitest";
import { isLocalizedTextEmpty, t } from "./localized-text";

describe("t()", () => {
  it("returns the requested locale when present", () => {
    expect(t({ bn: "পাঞ্জাবি", en: "Panjabi" }, "en")).toBe("Panjabi");
  });

  it("falls back to the default locale when the requested one is missing", () => {
    expect(t({ bn: "পাঞ্জাবি" }, "en", "bn")).toBe("পাঞ্জাবি");
  });

  it("falls back to any available value when neither requested nor default locale is present", () => {
    expect(t({ en: "Panjabi" }, "bn", "bn")).toBe("Panjabi");
  });

  it("returns an empty string for null/undefined/empty fields", () => {
    expect(t(null, "bn")).toBe("");
    expect(t(undefined, "bn")).toBe("");
    expect(t({}, "bn")).toBe("");
  });
});

describe("isLocalizedTextEmpty()", () => {
  it("is true for null, undefined, and objects with no values", () => {
    expect(isLocalizedTextEmpty(null)).toBe(true);
    expect(isLocalizedTextEmpty(undefined)).toBe(true);
    expect(isLocalizedTextEmpty({})).toBe(true);
  });

  it("is false once any locale has a value", () => {
    expect(isLocalizedTextEmpty({ en: "x" })).toBe(false);
  });
});
