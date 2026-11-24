import { uiText } from "./ui-text";

/** UI strings for writing a review (`storefront.review.*`, editable in the admin; defaults in `@clothing/shared`). */
export const REVIEW_TEXT_KEYS = [
  "writeReview",
  "pageTitle",
  "intro",
  "rating",
  "fit",
  "fitSmall",
  "fitTrue",
  "fitLarge",
  "titlePlaceholder",
  "bodyPlaceholder",
  "addPhoto",
  "uploading",
  "submit",
  "submitting",
  "thanks",
  "alreadyReviewed",
  "notDelivered",
  "invalidLink",
  "allDone",
  "failed",
  "continueShopping",
] as const;

export type ReviewText = Record<(typeof REVIEW_TEXT_KEYS)[number], string>;

export function resolveReviewText(strings: Record<string, { bn?: string; en?: string }>, locale: string): ReviewText {
  const text = uiText(strings, locale);
  return Object.fromEntries(REVIEW_TEXT_KEYS.map((key) => [key, text(`storefront.review.${key}`)])) as ReviewText;
}
