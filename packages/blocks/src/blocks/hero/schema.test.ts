import { describe, expect, it } from "vitest";
import { heroDefaults } from "./defaults.ts";
import { heroSchema, heroSlideLink, wrapSlideIndex } from "./schema.ts";

describe("hero schema", () => {
  it("accepts its defaults", () => {
    expect(heroSchema.safeParse(heroDefaults).success).toBe(true);
  });

  it("turns a hero saved before slides existed into one slide", () => {
    const old = { heading: { en: "New in" }, ctaText: { en: "Shop" }, ctaUrl: "/shop", imageUrl: "https://cdn.test/a.jpg", align: "center" };
    expect(heroSchema.parse(old)).toEqual({
      slides: [{ imageUrl: "https://cdn.test/a.jpg", heading: { en: "New in" }, ctaText: { en: "Shop" }, linkUrl: "/shop", align: "center", fit: "cover" }],
      autoplay: true,
      intervalSeconds: 5,
    });
  });

  it("allows a picture-only slide and keeps the interval in range", () => {
    expect(heroSchema.safeParse({ slides: [{ imageUrl: "https://cdn.test/banner.jpg", fit: "contain" }] }).success).toBe(true);
    expect(heroSchema.safeParse({ slides: [{ imageUrl: null }], intervalSeconds: 1 }).success).toBe(false);
    expect(heroSchema.safeParse({ slides: [] }).success).toBe(false);
  });
});

describe("heroSlideLink", () => {
  it("is a button with a label and a link, the whole picture with only a link, nothing without a link", () => {
    expect(heroSlideLink({ linkUrl: "/sale" }, "Shop now")).toEqual({ kind: "button", href: "/sale" });
    expect(heroSlideLink({ linkUrl: " /sale " }, "  ")).toEqual({ kind: "image", href: "/sale" });
    expect(heroSlideLink({ linkUrl: "" }, "Shop now")).toEqual({ kind: "none" });
    expect(heroSlideLink({}, "")).toEqual({ kind: "none" });
  });
});

describe("wrapSlideIndex", () => {
  it("wraps forwards and backwards", () => {
    expect(wrapSlideIndex(2, 1, 3)).toBe(0);
    expect(wrapSlideIndex(0, -1, 3)).toBe(2);
    expect(wrapSlideIndex(1, 1, 3)).toBe(2);
  });
});
