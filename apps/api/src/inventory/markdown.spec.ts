import { describe, expect, it } from "vitest";
import { pickMarkdownTier, suggestMarkdown } from "./markdown";

const tiers = [
  { minDays: 60, percentOff: 10 },
  { minDays: 90, percentOff: 20 },
  { minDays: 180, percentOff: 30 },
];

describe("pickMarkdownTier", () => {
  it("picks the deepest tier reached", () => {
    expect(pickMarkdownTier(59, tiers)).toBeNull();
    expect(pickMarkdownTier(60, tiers)?.percentOff).toBe(10);
    expect(pickMarkdownTier(120, tiers)?.percentOff).toBe(20);
    expect(pickMarkdownTier(400, tiers)?.percentOff).toBe(30);
  });
  it("does not depend on tier order", () => {
    expect(pickMarkdownTier(200, [...tiers].reverse())?.percentOff).toBe(30);
  });
});

describe("suggestMarkdown", () => {
  it("applies the tier and rounds down to whole taka", () => {
    // ৳1,299 − 20% = ৳1,039.20 → ৳1,039
    expect(suggestMarkdown({ price: 129_900, costPrice: 50_000, daysUnsold: 100, tiers, minMarginPercent: 10 })).toEqual({
      percentOff: 20,
      tierPercentOff: 20,
      suggestedPrice: 103_900,
      floorPrice: 55_000,
      cappedByMargin: false,
    });
  });
  it("never goes below cost + minimum margin", () => {
    const s = suggestMarkdown({ price: 100_000, costPrice: 80_000, daysUnsold: 200, tiers, minMarginPercent: 10 });
    expect(s).toMatchObject({ suggestedPrice: 88_000, cappedByMargin: true, tierPercentOff: 30, percentOff: 12 });
  });
  it("returns null when the floor leaves no room to mark down", () => {
    expect(suggestMarkdown({ price: 100_000, costPrice: 95_000, daysUnsold: 200, tiers, minMarginPercent: 10 })).toBeNull();
  });
  it("returns null before the first tier", () => {
    expect(suggestMarkdown({ price: 100_000, costPrice: 10_000, daysUnsold: 10, tiers, minMarginPercent: 10 })).toBeNull();
  });
  it("works without a known cost (no floor)", () => {
    expect(suggestMarkdown({ price: 100_000, costPrice: null, daysUnsold: 60, tiers, minMarginPercent: 10 })).toMatchObject({ suggestedPrice: 90_000, floorPrice: null });
  });
});
