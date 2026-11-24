import type { ReviewsProps } from "./schema.ts";

export const reviewsDefaults: ReviewsProps = {
  heading: { bn: "গ্রাহকরা যা বলছেন", en: "What our customers say" },
  source: "recent",
  minRating: 4,
  limit: 6,
  testimonials: [],
  verifiedLabel: { bn: "যাচাইকৃত ক্রেতা", en: "Verified purchase" },
  fallbackName: { bn: "গ্রাহক", en: "Customer" },
};
