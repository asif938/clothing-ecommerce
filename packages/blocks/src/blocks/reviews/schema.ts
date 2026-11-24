import { z } from "zod";
import { localizedTextSchema } from "@clothing/shared";

/**
 * Home page testimonials/reviews (docs/PROJECT_SPEC.md §9.1). Shows the
 * owner's own hand-written testimonials first, then approved customer
 * reviews pulled live from the store (`source`). `source: "none"` shows the
 * hand-written ones only.
 */
export const reviewsSourceSchema = z.enum(["recent", "top_rated", "with_photos", "none"]);

const testimonialSchema = z.object({
  name: z.string().trim().min(1).max(60),
  quote: localizedTextSchema,
  rating: z.number().int().min(1).max(5).default(5),
});

export const reviewsSchema = z.object({
  heading: localizedTextSchema.optional(),
  source: reviewsSourceSchema.default("recent"),
  /** Customer reviews below this star rating are left out. */
  minRating: z.number().int().min(1).max(5).default(4),
  /** How many customer reviews to show (hand-written testimonials come on top of this). */
  limit: z.number().int().min(1).max(12).default(6),
  testimonials: z.array(testimonialSchema).max(12).default([]),
  /** Badge on reviews written against a delivered order. */
  verifiedLabel: localizedTextSchema.optional(),
  /** Shown instead of a name when the reviewer has none. */
  fallbackName: localizedTextSchema.optional(),
});
export type ReviewsProps = z.infer<typeof reviewsSchema>;
