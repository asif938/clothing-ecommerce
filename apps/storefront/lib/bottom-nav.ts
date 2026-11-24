import { uiText } from "./ui-text";

/** Mirrors `BOTTOM_NAV_ITEMS` in `@clothing/shared/settings` (kept local so the client bundle doesn't load the settings registry). */
export const BOTTOM_NAV_KEYS = ["home", "shop", "categories", "search", "wishlist", "cart", "account", "track"] as const;
export type BottomNavKey = (typeof BOTTOM_NAV_KEYS)[number];

const DEFAULT_ITEMS: BottomNavKey[] = ["home", "shop", "wishlist", "cart", "account"];

/** Where each link tab goes; `categories` and `search` open the header's menu drawer / search field instead. */
export const BOTTOM_NAV_HREF: Partial<Record<BottomNavKey, string>> = {
  home: "/",
  shop: "/shop",
  wishlist: "/wishlist",
  cart: "/cart",
  account: "/account",
  track: "/track",
};

/** Window events the header's `MobileMenu` / `MobileSearch` listen for. */
export const OPEN_MENU_EVENT = "storefront:open-menu";
export const OPEN_SEARCH_EVENT = "storefront:open-search";

export interface BottomNavConfig {
  enabled: boolean;
  items: BottomNavKey[];
}

/** Admin → Settings → Theme, read from the public store config; invalid or missing values fall back to the default five tabs. */
export function readBottomNavConfig(config: Record<string, unknown>): BottomNavConfig {
  const raw = config["theme.bottomNav.items"];
  const items = Array.isArray(raw) ? [...new Set(raw.filter((item): item is BottomNavKey => BOTTOM_NAV_KEYS.includes(item as BottomNavKey)))].slice(0, 5) : [];
  return {
    enabled: config["theme.bottomNav.enabled"] !== false,
    items: items.length >= 2 ? items : DEFAULT_ITEMS,
  };
}

/**
 * Pages where the bar is hidden: the product page has its own sticky
 * "Add to cart" bar, and checkout / order confirmation are pages to finish,
 * not to wander off from. `pathname` is locale-less (next-intl's `usePathname`).
 */
export function isBottomNavHidden(pathname: string): boolean {
  return pathname.startsWith("/p/") || pathname === "/checkout" || pathname.startsWith("/checkout/") || pathname.startsWith("/confirm-order");
}

/** The tab that matches the current page, if any. */
export function activeBottomNavItem(pathname: string, items: BottomNavKey[]): BottomNavKey | null {
  const is = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const match = (key: BottomNavKey): boolean => {
    switch (key) {
      case "home":
        return pathname === "/";
      case "shop":
        return is("/shop") || is("/c") || is("/collections");
      case "search":
        return is("/search");
      case "wishlist":
        return is("/wishlist");
      case "cart":
        return is("/cart");
      case "account":
        return is("/account");
      case "track":
        return is("/track");
      default:
        return false;
    }
  };
  return items.find(match) ?? null;
}

export type BottomNavLabels = Record<BottomNavKey | "label", string>;

export function resolveBottomNavLabels(strings: Record<string, { bn?: string; en?: string }>, locale: string): BottomNavLabels {
  const text = uiText(strings, locale);
  return Object.fromEntries((["label", ...BOTTOM_NAV_KEYS] as const).map((key) => [key, text(`storefront.bottomNav.${key}`)])) as BottomNavLabels;
}
