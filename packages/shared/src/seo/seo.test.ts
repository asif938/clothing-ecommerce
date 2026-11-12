import { describe, expect, it } from "vitest";
import { checkProductQuality, type ProductQualityInput } from "../catalog/quality.ts";
import { scoreSeo } from "./score.ts";
import { classifyLink, extractLinks, matchStorefrontRoute, normalizePath } from "./links.ts";

const longText = "A comfortable cotton panjabi with fine embroidery around the collar, perfect for Eid and weddings.";

const complete: ProductQualityInput = {
  title: { bn: "পাঞ্জাবি", en: "Panjabi" },
  description: { bn: "আরামদায়ক সুতির পাঞ্জাবি, কলারে সূক্ষ্ম এমব্রয়ডারি, ঈদ ও বিয়ের জন্য উপযুক্ত।", en: longText },
  seoTitle: { en: "Cotton Panjabi" },
  seoDescription: { en: longText },
  categoryId: "cat",
  imageCount: 3,
  imagesMissingAlt: 0,
  hasSizeOption: true,
  hasSizeChart: true,
  weightGramsDefault: 400,
  variants: [{ price: 250_000, compareAtPrice: 300_000, weightGrams: null, costPrice: 120_000 }],
};

describe("checkProductQuality", () => {
  it("scores a complete product 100", () => {
    expect(checkProductQuality(complete)).toEqual({ score: 100, issues: [] });
  });

  it("flags each gap and deducts its weight", () => {
    const result = checkProductQuality({
      ...complete,
      description: { bn: "<p> </p>", en: longText },
      imageCount: 0,
      hasSizeChart: false,
      weightGramsDefault: null,
      variants: [{ price: 250_000, compareAtPrice: 250_000, weightGrams: null, costPrice: null }],
    });
    expect(result.issues).toEqual(["missing_images", "missing_description_bn", "missing_size_chart", "missing_weight", "compare_at_not_higher", "missing_cost"]);
    expect(result.score).toBe(100 - (25 + 10 + 10 + 5 + 5 + 3));
  });

  it("doesn't need a size chart for free-size products", () => {
    expect(checkProductQuality({ ...complete, hasSizeOption: false, hasSizeChart: false }).issues).not.toContain("missing_size_chart");
  });
});

describe("scoreSeo", () => {
  const good = {
    title: { bn: "সুতির পাঞ্জাবি — এমব্রয়ডারি করা", en: "Embroidered Cotton Panjabi for Eid" },
    seoTitle: null,
    seoDescription: { bn: "আরামদায়ক সুতির পাঞ্জাবি, কলারে সূক্ষ্ম এমব্রয়ডারি। ঈদ ও বিয়ের জন্য। সারা বাংলাদেশে ক্যাশ অন ডেলিভারি।", en: "A comfortable cotton panjabi with fine collar embroidery. Ideal for Eid and weddings, cash on delivery." },
    slug: "embroidered-cotton-panjabi",
    body: { bn: "ক".repeat(200), en: "a".repeat(200) },
    minBodyChars: 150,
    imageCount: 2,
    imagesWithAlt: 2,
  };

  it("gives a well-optimized page 100", () => {
    expect(scoreSeo(good)).toEqual({ score: 100, issues: [] });
  });

  it("reports per-locale and page-level problems", () => {
    const result = scoreSeo({ ...good, seoDescription: { en: good.seoDescription.en }, slug: "Panjabi_Eid", imagesWithAlt: 1, noindex: true });
    expect(result.issues).toEqual([
      { check: "description_missing", locale: "bn" },
      { check: "slug_not_clean", locale: null },
      { check: "images_missing_alt", locale: null },
      { check: "noindex", locale: null },
    ]);
    expect(result.score).toBe(Math.round(100 - (15 / 2 + 10 + 5 + 30)));
  });

  it("falls back to the plain title and flags lengths", () => {
    expect(scoreSeo({ ...good, title: { bn: "শার্ট", en: "x".repeat(70) } }).issues).toEqual([
      { check: "title_too_short", locale: "bn" },
      { check: "title_too_long", locale: "en" },
    ]);
  });
});

describe("extractLinks", () => {
  it("finds link fields at any depth and hrefs inside HTML", () => {
    const blocks = [
      { type: "hero", props: { ctaUrl: "/c/men", title: "Shop men" } },
      { type: "rich_text", props: { html: '<p>See <a href="/p/panjabi-1">this</a> and <a href="https://example.com/x">that</a></p>' } },
      { type: "menu", items: [{ link: { url: "/collections/eid" } }, { label: "No link", note: "/not-a-link-key" }] },
    ];
    expect(extractLinks(blocks)).toEqual(["/c/men", "/p/panjabi-1", "https://example.com/x", "/collections/eid"]);
  });

  it("dedupes", () => {
    expect(extractLinks({ a: { href: "/x" }, b: { href: "/x" } })).toEqual(["/x"]);
  });
});

describe("classifyLink / matchStorefrontRoute", () => {
  const own = ["https://shop.example.com"];
  it("classifies internal, own-absolute, external and skippable links", () => {
    expect(classifyLink("/p/a?ref=1#top", own)).toEqual({ kind: "internal", path: "/p/a" });
    expect(classifyLink("https://shop.example.com/c/men/", own)).toEqual({ kind: "internal", path: "/c/men" });
    expect(classifyLink("https://facebook.com/brand", own)).toEqual({ kind: "external", url: "https://facebook.com/brand" });
    expect(classifyLink("tel:+8801700000000", own)).toEqual({ kind: "skip" });
    expect(classifyLink("#reviews", own)).toEqual({ kind: "skip" });
  });

  it("maps paths to storefront routes, with or without a locale prefix", () => {
    expect(matchStorefrontRoute("/")).toEqual({ type: "home" });
    expect(matchStorefrontRoute("/en")).toEqual({ type: "home" });
    expect(matchStorefrontRoute("/en/p/panjabi")).toEqual({ type: "product", slug: "panjabi" });
    expect(matchStorefrontRoute("/c/men/panjabi")).toEqual({ type: "category", slugs: ["men", "panjabi"] });
    expect(matchStorefrontRoute("/collections/eid")).toEqual({ type: "collection", slug: "eid" });
    expect(matchStorefrontRoute("/pages/about")).toEqual({ type: "page", slug: "about" });
    expect(matchStorefrontRoute("/blog/style-tips")).toEqual({ type: "blog_post", slug: "style-tips" });
    expect(matchStorefrontRoute("/track")).toEqual({ type: "static", name: "track" });
    expect(matchStorefrontRoute("/shop/old-url")).toEqual({ type: "unknown" });
  });

  it("normalizes paths", () => {
    expect(normalizePath("/a/b/?x=1")).toBe("/a/b");
    expect(normalizePath("/")).toBe("/");
  });
});
