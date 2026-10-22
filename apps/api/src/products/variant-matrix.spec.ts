import { describe, expect, it } from "vitest";
import { generateVariantCombinations, sameCombination } from "./variant-matrix";

describe("generateVariantCombinations", () => {
  it("produces exactly one empty-combination variant for a free-size product (zero options)", () => {
    expect(generateVariantCombinations([])).toEqual([[]]);
  });

  it("produces one combination per value for a single option", () => {
    const sizes = { id: "opt-size", values: [{ id: "s" }, { id: "m" }, { id: "l" }] };
    expect(generateVariantCombinations([sizes])).toEqual([["s"], ["m"], ["l"]]);
  });

  it("produces the full size × color cartesian product, in option order", () => {
    const size = { id: "opt-size", values: [{ id: "s" }, { id: "m" }] };
    const color = { id: "opt-color", values: [{ id: "red" }, { id: "blue" }, { id: "black" }] };

    const combos = generateVariantCombinations([size, color]);

    expect(combos).toHaveLength(6);
    expect(combos).toEqual([
      ["s", "red"],
      ["s", "blue"],
      ["s", "black"],
      ["m", "red"],
      ["m", "blue"],
      ["m", "black"],
    ]);
  });

  it("scales to three options", () => {
    const a = { id: "a", values: [{ id: "a1" }, { id: "a2" }] };
    const b = { id: "b", values: [{ id: "b1" }, { id: "b2" }] };
    const c = { id: "c", values: [{ id: "c1" }, { id: "c2" }, { id: "c3" }] };
    expect(generateVariantCombinations([a, b, c])).toHaveLength(12);
  });
});

describe("sameCombination", () => {
  it("treats a combination as a set, ignoring order", () => {
    expect(sameCombination(["m", "red"], ["red", "m"])).toBe(true);
  });

  it("is false for different lengths or different members", () => {
    expect(sameCombination(["m"], ["m", "red"])).toBe(false);
    expect(sameCombination(["m", "red"], ["m", "blue"])).toBe(false);
  });
});
