import { describe, expect, it } from "vitest";
import { reviewsSchema } from "./schema.ts";
import { reviewsDefaults } from "./defaults.ts";
import { buildReviewCards, type FeaturedReviewData } from "./cards.ts";

const review: FeaturedReviewData = {
  id: "r1",
  rating: 5,
  title: null,
  body: "Soft fabric",
  photoUrl: null,
  verified: true,
  authorName: null,
  product: { slug: "panjabi", title: { en: "Panjabi" }, imageUrl: null },
};

describe("reviews block", () => {
  it("accepts its own defaults", () => {
    expect(reviewsSchema.safeParse(reviewsDefaults).success).toBe(true);
  });

  it("rejects an out-of-range rating and an empty testimonial name", () => {
    expect(reviewsSchema.safeParse({ ...reviewsDefaults, minRating: 6 }).success).toBe(false);
    expect(reviewsSchema.safeParse({ ...reviewsDefaults, testimonials: [{ name: " ", quote: { en: "Hi" } }] }).success).toBe(false);
  });

  it("puts hand-written testimonials first, skips empty ones, and falls back to the localized name", () => {
    const props = reviewsSchema.parse({
      ...reviewsDefaults,
      testimonials: [
        { name: "Nusrat", quote: { bn: "দারুণ", en: "Great" }, rating: 4 },
        { name: "Empty", quote: { bn: "", en: "" } },
      ],
    });
    const cards = buildReviewCards(props, [review], "bn");
    expect(cards.map((c) => c.key)).toEqual(["t0", "r1"]);
    expect(cards[0]).toMatchObject({ name: "Nusrat", body: "দারুণ", rating: 4, verified: false, product: null });
    expect(cards[1]).toMatchObject({ name: "গ্রাহক", verified: true });
  });
});
