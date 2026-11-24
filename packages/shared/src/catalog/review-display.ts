/**
 * Shared helpers for showing reviews outside the product page — the home
 * page `reviews` block (docs/PROJECT_SPEC.md §9.1 "testimonials/reviews").
 * Pure functions so the API and tests agree on exactly what is shown.
 */

/**
 * A reviewer's name for a public, site-wide showcase: first name plus the
 * last word's initial ("Rahim Uddin Khan" → "Rahim K."). A home page block
 * is seen by every visitor, so it shows less of a customer than their own
 * product review does. Returns null when there is no usable name — the
 * block then shows its own localized "Customer" fallback.
 */
export function maskReviewerName(name: string | null | undefined): string | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0]!;
  if (parts.length === 1) return first;
  const initial = Array.from(parts[parts.length - 1]!)[0]!;
  return `${first} ${initial.toUpperCase()}.`;
}

/** Shortens a review body for a card, cutting at a word boundary and adding an ellipsis. */
export function excerptReview(body: string, maxChars: number): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
