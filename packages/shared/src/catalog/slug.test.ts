import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug.ts";

describe("slugify", () => {
  it("lowercases and dashes", () => {
    expect(slugify("Panjabi Classic Fit")).toBe("panjabi-classic-fit");
  });

  it("strips punctuation", () => {
    expect(slugify("Men's Kurta (Summer '24)")).toBe("mens-kurta-summer-24");
  });

  it("collapses repeated separators", () => {
    expect(slugify("  A   --  B  ")).toBe("a-b");
  });

  it("falls back for non-ASCII-only input", () => {
    expect(slugify("পাঞ্জাবি", "product-123")).toBe("product-123");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free", async () => {
    expect(await uniqueSlug("panjabi", async () => false)).toBe("panjabi");
  });

  it("appends an incrementing suffix until free", async () => {
    const taken = new Set(["panjabi", "panjabi-2", "panjabi-3"]);
    const result = await uniqueSlug("panjabi", async (candidate) => taken.has(candidate));
    expect(result).toBe("panjabi-4");
  });
});
