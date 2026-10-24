import { describe, expect, it } from "vitest";
import { derivePrefix, formatOrderNumber } from "./order-number";

describe("formatOrderNumber", () => {
  it("formats the default template", () => {
    expect(formatOrderNumber("{PREFIX}{YYMMDD}{SEQ4}", "DEM", new Date(2026, 0, 5), 7)).toBe("DEM2601050007");
  });

  it("pads the sequence to 4 digits and handles 5+ digit sequences without truncating", () => {
    expect(formatOrderNumber("{PREFIX}{YYMMDD}{SEQ4}", "ABC", new Date(2026, 0, 5), 12345)).toBe("ABC26010512345");
  });
});

describe("derivePrefix", () => {
  it("takes the first 3 letters, uppercased", () => {
    expect(derivePrefix("Demo Fashion")).toBe("DEM");
  });

  it("strips non-letters before taking the first 3", () => {
    expect(derivePrefix("99 Store")).toBe("STO");
  });

  it("falls back to STR when the brand name has no usable letters", () => {
    expect(derivePrefix(null)).toBe("STR");
    expect(derivePrefix("123")).toBe("STR");
  });

  it("pads a 1-2 letter brand name out to 3 characters", () => {
    expect(derivePrefix("A")).toBe("AXX");
  });
});
