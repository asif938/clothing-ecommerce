import { describe, expect, it } from "vitest";
import {
  aggregateCartAffinities,
  assignVariant,
  combinedScore,
  computeVisualVector,
  CONTROL_KEY,
  estimateBackground,
  fnv1a32,
  mergeRecommendationIds,
  normalCdf,
  normalQuantile,
  rankForYou,
  requiredVisitorsPerVariant,
  scorePairs,
  summarizeExperiment,
  tagSimilarity,
  tagTokens,
  twoProportionZTest,
  variantListProblems,
  viewedSeeds,
  VISUAL_HEIGHT,
  VISUAL_VECTOR_LENGTH,
  VISUAL_WIDTH,
  visualSimilarity,
} from "./index.ts";

describe("scorePairs", () => {
  it("scores co-occurrence by cosine, in both directions", () => {
    const pairs = scorePairs(
      [
        ["a", "b"],
        ["a", "b"],
        ["a", "c"],
        ["b"],
      ],
      { minSupport: 1, maxPerProduct: 10 },
    );
    const ab = pairs.find((p) => p.productId === "a" && p.relatedProductId === "b")!;
    const ba = pairs.find((p) => p.productId === "b" && p.relatedProductId === "a")!;
    // a in 3 baskets, b in 3, together in 2 → 2 / sqrt(9)
    expect(ab.score).toBeCloseTo(0.6667, 3);
    expect(ab.support).toBe(2);
    expect(ba.score).toBe(ab.score);
  });

  it("drops pairs under minSupport and caps per product", () => {
    const pairs = scorePairs(
      [
        ["a", "b", "c", "d"],
        ["a", "b"],
      ],
      { minSupport: 2, maxPerProduct: 1 },
    );
    expect(pairs).toEqual([
      { productId: "a", relatedProductId: "b", score: 1, support: 2 },
      { productId: "b", relatedProductId: "a", score: 1, support: 2 },
    ]);
  });

  it("counts a product once per basket and trims huge baskets", () => {
    const pairs = scorePairs([["a", "a", "b"]], { minSupport: 1, maxPerProduct: 5 });
    expect(pairs.find((p) => p.productId === "a")!.score).toBe(1);
    const big = Array.from({ length: 30 }, (_, i) => `p${String(i).padStart(2, "0")}`);
    const trimmed = scorePairs([big], { minSupport: 1, maxPerProduct: 100, maxBasketSize: 3 });
    expect(new Set(trimmed.map((p) => p.productId)).size).toBe(3);
  });
});

describe("rankForYou", () => {
  const info = new Map([
    ["seed", { categoryId: "shirts", popularity: 0.1 }],
    ["paired", { categoryId: "pants", popularity: 0 }],
    ["sameCategory", { categoryId: "shirts", popularity: 0 }],
    ["popular", { categoryId: "sarees", popularity: 1 }],
    ["bought", { categoryId: "shirts", popularity: 1 }],
  ]);

  it("ranks affinity first, then category, then popularity, never seeds or excluded", () => {
    const picks = rankForYou({
      seeds: [{ productId: "seed", weight: 1 }],
      affinities: new Map([["seed", [{ relatedProductId: "paired", score: 0.5 }, { relatedProductId: "bought", score: 0.9 }]]]),
      info,
      exclude: new Set(["bought"]),
      limit: 10,
    });
    expect(picks.map((p) => p.productId)).toEqual(["paired", "sameCategory", "popular"]);
    expect(picks[0]!.becauseOf).toBe("seed");
    expect(picks[1]!.becauseOf).toBeNull();
  });

  it("falls back to popularity with no seeds", () => {
    const picks = rankForYou({ seeds: [], affinities: new Map(), info, exclude: new Set(), limit: 2 });
    expect(picks.map((p) => p.productId)).toEqual(["bought", "popular"]);
  });

  it("weights recent views more", () => {
    expect(viewedSeeds(["x", "y", "x", "z"])).toEqual([
      { productId: "x", weight: 1 },
      { productId: "y", weight: 0.85 },
      { productId: "z", weight: 0.722 },
    ]);
  });
});

describe("merge and cart helpers", () => {
  it("puts manual picks first and never repeats or returns the product itself", () => {
    expect(mergeRecommendationIds("self", ["m1", "self", "c1"], ["c1", "c2", "c3"], 3)).toEqual(["m1", "c1", "c2"]);
  });

  it("sums cart line affinities and skips items already in the cart", () => {
    const affinities = new Map([
      ["a", [{ relatedProductId: "x", score: 0.4 }, { relatedProductId: "b", score: 0.9 }]],
      ["b", [{ relatedProductId: "x", score: 0.3 }, { relatedProductId: "y", score: 0.6 }]],
    ]);
    expect(aggregateCartAffinities(["a", "b"], affinities, 5)).toEqual(["x", "y"]);
  });
});

describe("experiment assignment", () => {
  const experiment = {
    id: "exp1",
    trafficPercent: 100,
    variants: [
      { key: "control", weight: 50 },
      { key: "b", weight: 50 },
    ],
  };

  it("is deterministic and roughly follows the weights", () => {
    expect(assignVariant(experiment, "visitor-1")).toBe(assignVariant(experiment, "visitor-1"));
    const counts = { control: 0, b: 0 } as Record<string, number>;
    for (let i = 0; i < 4000; i++) counts[assignVariant(experiment, `v${i}`)!]! += 1;
    expect(counts.control! / 4000).toBeGreaterThan(0.45);
    expect(counts.control! / 4000).toBeLessThan(0.55);
  });

  it("honours traffic percent and keeps variants stable when traffic grows", () => {
    const low = { ...experiment, trafficPercent: 20 };
    let inLow = 0;
    for (let i = 0; i < 2000; i++) {
      const a = assignVariant(low, `v${i}`);
      if (a === null) continue;
      inLow++;
      expect(assignVariant({ ...experiment, trafficPercent: 60 }, `v${i}`)).toBe(a);
    }
    expect(inLow / 2000).toBeGreaterThan(0.15);
    expect(inLow / 2000).toBeLessThan(0.25);
    expect(assignVariant({ ...experiment, trafficPercent: 0 }, "v1")).toBeNull();
    expect(assignVariant(experiment, "")).toBeNull();
  });

  it("hashes with FNV-1a", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
  });

  it("validates variant lists per kind", () => {
    expect(variantListProblems("block", [{ key: CONTROL_KEY, name: "A", weight: 50 }])).toContain("An experiment needs a control and at least one other variant.");
    expect(
      variantListProblems("block", [
        { key: "b", name: "B", weight: 50, payload: { props: {} } },
        { key: CONTROL_KEY, name: "A", weight: 50 },
      ]),
    ).toContain('The first variant must be the control (key "control").');
    expect(
      variantListProblems("announcement", [
        { key: CONTROL_KEY, name: "A", weight: 50 },
        { key: "b", name: "B", weight: 50 },
      ]),
    ).toEqual(['Variant "b" needs a message.']);
    expect(
      variantListProblems("offer", [
        { key: CONTROL_KEY, name: "No offer", weight: 50, payload: { discountId: null } },
        { key: "b", name: "10%", weight: 50, payload: { discountId: "d1", message: { en: "10% off today" } } },
      ]),
    ).toEqual([]);
  });
});

describe("experiment statistics", () => {
  it("normal CDF and quantile agree with known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4);
    expect(normalQuantile(0.01)).toBeCloseTo(-2.326348, 4);
  });

  it("two-proportion z-test", () => {
    const { z, pValue } = twoProportionZTest(100, 1000, 130, 1000);
    expect(z).toBeCloseTo(2.098, 2);
    expect(pValue).toBeCloseTo(0.0359, 3);
    expect(twoProportionZTest(0, 0, 0, 10).pValue).toBe(1);
  });

  it("waits for enough visitors before a verdict", () => {
    const summary = summarizeExperiment(
      [
        { key: "control", visitors: 50, conversions: 5, revenue: 50_000 },
        { key: "b", visitors: 50, conversions: 20, revenue: 200_000 },
      ],
      95,
      100,
    );
    expect(summary.verdict).toBe("collecting");
    expect(summary.variants[1]!.uplift).toBeCloseTo(3, 6);
    expect(summary.variants[1]!.revenuePerVisitor).toBe(4000);
  });

  it("declares a significant winner and applies the Bonferroni correction", () => {
    const stats = [
      { key: "control", visitors: 1000, conversions: 100, revenue: 0 },
      { key: "b", visitors: 1000, conversions: 130, revenue: 0 },
    ];
    expect(summarizeExperiment(stats, 95, 100)).toMatchObject({ verdict: "winner", winnerKey: "b" });
    // Same data with a third (flat) variant: alpha halves to 0.025, p ≈ 0.036 no longer passes.
    const three = summarizeExperiment([...stats, { key: "c", visitors: 1000, conversions: 100, revenue: 0 }], 95, 100);
    expect(three.alpha).toBeCloseTo(0.025, 6);
    expect(three.verdict).toBe("no_difference");
  });

  it("reports when the control is better", () => {
    const summary = summarizeExperiment(
      [
        { key: "control", visitors: 2000, conversions: 300, revenue: 0 },
        { key: "b", visitors: 2000, conversions: 200, revenue: 0 },
      ],
      95,
      100,
    );
    expect(summary).toMatchObject({ verdict: "control_better", winnerKey: "control" });
  });

  it("estimates the sample size needed", () => {
    // 10% baseline, +20% relative uplift, 95% / 80% power ≈ 3,800 per variant.
    const n = requiredVisitorsPerVariant(0.1, 0.2, 95)!;
    expect(n).toBeGreaterThan(3500);
    expect(n).toBeLessThan(4100);
    expect(requiredVisitorsPerVariant(0, 0.2, 95)).toBeNull();
  });
});

function solidImage(bg: [number, number, number], fg: [number, number, number] | null, box?: { x0: number; y0: number; x1: number; y1: number }): Uint8Array {
  const pixels = new Uint8Array(VISUAL_WIDTH * VISUAL_HEIGHT * 3);
  for (let y = 0; y < VISUAL_HEIGHT; y++) {
    for (let x = 0; x < VISUAL_WIDTH; x++) {
      const inside = fg && box && x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1;
      const [r, g, b] = inside ? fg : bg;
      const i = (y * VISUAL_WIDTH + x) * 3;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
    }
  }
  return pixels;
}

describe("visual features", () => {
  const shirtBox = { x0: 10, y0: 8, x1: 38, y1: 40 };
  const pantsBox = { x0: 16, y0: 20, x1: 32, y1: 62 };
  const white: [number, number, number] = [250, 250, 250];

  it("produces a fixed-length vector and finds the background from the border", () => {
    const pixels = solidImage(white, [200, 20, 30], shirtBox);
    expect(estimateBackground(pixels, VISUAL_WIDTH, VISUAL_HEIGHT)).toEqual(white);
    const vector = computeVisualVector(pixels);
    expect(vector).toHaveLength(VISUAL_VECTOR_LENGTH);
    expect(visualSimilarity(vector, vector)).toBeCloseTo(1, 6);
  });

  it("ignores the background colour and ranks same colour + shape highest", () => {
    const redShirtOnWhite = computeVisualVector(solidImage(white, [200, 20, 30], shirtBox));
    const redShirtOnGrey = computeVisualVector(solidImage([120, 120, 120], [205, 25, 35], shirtBox));
    const blueShirt = computeVisualVector(solidImage(white, [20, 40, 200], shirtBox));
    const redPants = computeVisualVector(solidImage(white, [200, 20, 30], pantsBox));

    const sameGarment = visualSimilarity(redShirtOnWhite, redShirtOnGrey);
    expect(sameGarment).toBeGreaterThan(0.95);
    expect(visualSimilarity(redShirtOnWhite, redPants)).toBeLessThan(sameGarment);
    expect(visualSimilarity(redShirtOnWhite, blueShirt)).toBeLessThan(visualSimilarity(redShirtOnWhite, redPants));
  });

  it("falls back to whole-image colour for full-bleed photos", () => {
    const fabric = computeVisualVector(solidImage([30, 160, 60], null));
    expect(fabric.slice(52).every((v) => v === 0)).toBe(true);
    expect(visualSimilarity(fabric, fabric)).toBeCloseTo(1, 6);
  });

  it("rejects a short buffer and mismatched vectors", () => {
    expect(() => computeVisualVector(new Uint8Array(10))).toThrow(RangeError);
    expect(visualSimilarity([1, 2], [1, 2])).toBe(0);
  });

  it("tokenises tags and combines scores", () => {
    const a = tagTokens(["Navy Panjabi", "embroidered, cotton", null]);
    const b = tagTokens(["navy", "panjabi", "printed"]);
    expect(a.has("navy") && a.has("panjabi")).toBe(true);
    expect(tagSimilarity(a, b)).toBeCloseTo(2 / 5, 6);
    expect(tagTokens(["পাঞ্জাবি নীল"]).has("পাঞ্জাবি")).toBe(true);
    expect(combinedScore(0.5, null)).toBe(0.5);
    expect(combinedScore(0.5, 1)).toBe(0.7);
  });
});
