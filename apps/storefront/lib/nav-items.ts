import { t } from "@clothing/shared";
import type { MenuData, MenuItem } from "./store-api";
import { isExternalHref, menuHref } from "./menu-href";

/** A menu item resolved for rendering: localized label and final href, ready to hand to client components. */
export interface NavItem {
  id: string;
  label: string;
  href: string | null;
  external: boolean;
  children: NavItem[];
}

const MAX_DEPTH = 3; // §9.3 menus are at most three levels deep.

function resolve(items: MenuItem[] | undefined, locale: string, depth: number): NavItem[] {
  if (!items || depth > MAX_DEPTH) return [];
  return items
    .map((item) => {
      const href = menuHref(item);
      return {
        id: item.id,
        label: t(item.label, locale as "bn" | "en"),
        href,
        external: href ? isExternalHref(href) : false,
        children: resolve(item.children, locale, depth + 1),
      };
    })
    .filter((item) => item.label.trim() !== "");
}

export function toNavItems(menu: MenuData | null, locale: string): NavItem[] {
  return resolve(menu?.items, locale, 1);
}
