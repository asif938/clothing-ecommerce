import { uiText } from "./ui-text";

/** UI strings the product-card buttons and quick-add sheet use (`storefront.card.*`, editable in the admin, defaults in `@clothing/shared`). */
export const CARD_TEXT_KEYS = [
  "addToWishlist",
  "removeFromWishlist",
  "quickAdd",
  "preorder",
  "addedToCart",
  "viewCart",
  "viewDetails",
  "chooseOption",
  "outOfStock",
  "addFailed",
  "close",
] as const;

export type CardText = Record<(typeof CARD_TEXT_KEYS)[number], string>;

/** Resolved on the server (layout) so the client components get plain strings for the current locale. */
export function resolveCardText(strings: Record<string, { bn?: string; en?: string }>, locale: string): CardText {
  const text = uiText(strings, locale);
  return Object.fromEntries(CARD_TEXT_KEYS.map((key) => [key, text(`storefront.card.${key}`)])) as CardText;
}
