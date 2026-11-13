import { describe, expect, it } from "vitest";
import { effectiveBom, findShortages, materialNeeded, totalRequirements, unitMaterialCost, type BomLineInput } from "./bom";

const fabric = (variantId: string | null, quantity: number, wastagePercent = 0): BomLineInput => ({ variantId, materialId: "fabric", quantity, wastagePercent });
const button = (variantId: string | null, quantity: number): BomLineInput => ({ variantId, materialId: "button", quantity, wastagePercent: 0 });

describe("effectiveBom", () => {
  it("applies product-wide lines to every variant", () => {
    expect(effectiveBom([fabric(null, 150), button(null, 6)], "v-m")).toHaveLength(2);
  });

  it("lets a variant-specific line replace the product-wide one for the same material", () => {
    const lines = [fabric(null, 150), button(null, 6), fabric("v-xxl", 190)];
    const xxl = effectiveBom(lines, "v-xxl");
    expect(xxl.find((l) => l.materialId === "fabric")?.quantity).toBe(190);
    expect(xxl.find((l) => l.materialId === "button")?.quantity).toBe(6);
    expect(effectiveBom(lines, "v-m").find((l) => l.materialId === "fabric")?.quantity).toBe(150);
  });

  it("ignores lines for other variants", () => {
    expect(effectiveBom([fabric("v-xxl", 190)], "v-m")).toEqual([]);
  });
});

describe("materialNeeded", () => {
  it("adds wastage and rounds up", () => {
    expect(materialNeeded({ quantity: 150, wastagePercent: 0 }, 10)).toBe(1500);
    expect(materialNeeded({ quantity: 150, wastagePercent: 5 }, 10)).toBe(1575);
    expect(materialNeeded({ quantity: 3, wastagePercent: 10 }, 1)).toBe(4); // 3.3 → 4
  });

  it("needs nothing for zero units", () => {
    expect(materialNeeded({ quantity: 150, wastagePercent: 5 }, 0)).toBe(0);
  });
});

describe("totalRequirements", () => {
  it("sums across variants and products", () => {
    const bom = new Map<string, BomLineInput[]>([
      ["shirt", [fabric(null, 150), button(null, 6), fabric("v-xxl", 190)]],
      ["pant", [fabric(null, 200)]],
    ]);
    const needed = totalRequirements(
      [
        { productId: "shirt", variantId: "v-m", units: 10 },
        { productId: "shirt", variantId: "v-xxl", units: 5 },
        { productId: "pant", variantId: "p-32", units: 4 },
        { productId: "nobom", variantId: "x", units: 99 },
      ],
      bom,
    );
    expect(needed.get("fabric")).toBe(1500 + 950 + 800);
    expect(needed.get("button")).toBe(60 + 30);
    expect(needed.size).toBe(2);
  });
});

describe("findShortages", () => {
  it("lists only materials that fall short", () => {
    const shortages = findShortages(
      new Map([
        ["fabric", 3250],
        ["button", 90],
      ]),
      new Map([
        ["fabric", 3000],
        ["button", 500],
      ]),
    );
    expect(shortages).toEqual([{ materialId: "fabric", needed: 3250, onHand: 3000, short: 250 }]);
  });

  it("treats an unknown or negative stock as zero", () => {
    expect(findShortages(new Map([["a", 5]]), new Map([["a", -3]]))).toEqual([{ materialId: "a", needed: 5, onHand: 0, short: 5 }]);
    expect(findShortages(new Map([["a", 5]]), new Map())).toHaveLength(1);
  });
});

describe("unitMaterialCost", () => {
  it("prices one finished unit including wastage", () => {
    // 150cm @ 300 poisha/cm +10% = 49,500; 6 buttons @ 200 = 1,200.
    const cost = unitMaterialCost([fabric(null, 150, 10), button(null, 6)], new Map([["fabric", 300], ["button", 200]]));
    expect(cost).toBe(49_500 + 1_200);
  });

  it("counts uncosted materials as free", () => {
    expect(unitMaterialCost([fabric(null, 10)], new Map())).toBe(0);
  });
});
