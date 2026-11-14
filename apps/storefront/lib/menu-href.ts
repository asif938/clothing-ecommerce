import type { MenuItem } from "./store-api";

/**
 * Storefront path for a menu item. Category/collection/product/page routes are
 * looked up by slug, and the admin Menus screen stores the target's slug in
 * `targetId` (docs/DECISIONS.md 2026-11-15). A target-less item renders as a
 * plain heading (`null`) rather than a dead `#` link.
 */
export function menuHref(item: Pick<MenuItem, "type" | "targetId" | "url">): string | null {
  if (item.type === "url") return item.url?.trim() || null;
  const target = item.targetId?.trim();
  if (!target) return null;
  switch (item.type) {
    case "page":
      return `/pages/${encodeURIComponent(target)}`;
    case "category":
      return `/c/${encodeURIComponent(target)}`;
    case "collection":
      return `/collections/${encodeURIComponent(target)}`;
    case "product":
      return `/p/${encodeURIComponent(target)}`;
    default:
      return null;
  }
}

/** External links (another host) open as plain anchors, not locale-prefixed app links. */
export function isExternalHref(href: string): boolean {
  return /^(https?:)?\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
}
