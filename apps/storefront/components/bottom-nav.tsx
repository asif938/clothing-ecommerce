"use client";

import { useEffect, type ReactNode } from "react";
import { Link, usePathname } from "../i18n/navigation";
import { activeBottomNavItem, BOTTOM_NAV_HREF, isBottomNavHidden, OPEN_MENU_EVENT, OPEN_SEARCH_EVENT, type BottomNavKey, type BottomNavLabels } from "../lib/bottom-nav";
import { useCart } from "../lib/use-cart";
import { useLocalList } from "../lib/use-local-list";
import { BagIcon, GridIcon, HeartIcon, HomeIcon, SearchIcon, StoreIcon, TruckIcon, UserIcon } from "./icons";

const ICONS: Record<BottomNavKey, (props: { className?: string }) => ReactNode> = {
  home: HomeIcon,
  shop: StoreIcon,
  categories: GridIcon,
  search: SearchIcon,
  wishlist: HeartIcon,
  cart: BagIcon,
  account: UserIcon,
  track: TruckIcon,
};

/** Body class while the bar shows; `globals.css` turns it into `--bottom-nav-offset` below `lg`, which floating things (chat button, toasts) add to their `bottom`. */
const BODY_CLASS = "has-bottom-nav";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-semibold leading-[18px] text-brand-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Phone bottom navigation (below `lg`): up to five tabs chosen in Settings →
 * Theme, with live wishlist and cart counts and the current page's tab
 * highlighted. Hidden on product pages (their own sticky "Add to cart" bar
 * sits there) and on checkout. Renders a spacer in the page flow so the
 * footer's last line isn't covered.
 */
export function BottomNav({ items, labels }: { items: BottomNavKey[]; labels: BottomNavLabels }) {
  const pathname = usePathname();
  const hidden = isBottomNavHidden(pathname);
  const wishlist = useLocalList("wishlist");
  const cart = useCart();
  const active = activeBottomNavItem(pathname, items);

  useEffect(() => {
    if (hidden) return;
    document.body.classList.add(BODY_CLASS);
    return () => document.body.classList.remove(BODY_CLASS);
  }, [hidden]);

  if (hidden) return null;

  const counts: Partial<Record<BottomNavKey, number>> = { wishlist: wishlist.ids.length, cart: cart.itemCount };
  const cell = "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-none transition-colors";

  return (
    <>
      <div aria-hidden="true" className="h-[calc(3.5rem+env(safe-area-inset-bottom))] lg:hidden" />
      <nav aria-label={labels.label} className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <ul className="mx-auto flex max-w-xl">
          {items.map((key) => {
            const Icon = ICONS[key];
            const isActive = active === key;
            const color = isActive ? "font-medium text-brand" : "text-surface-foreground/60 hover:text-surface-foreground";
            const content = (
              <>
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" />
                  <Badge count={counts[key] ?? 0} />
                </span>
                <span className="max-w-full truncate">{labels[key]}</span>
              </>
            );
            const href = BOTTOM_NAV_HREF[key];
            const countLabel = (counts[key] ?? 0) > 0 ? ` (${counts[key]})` : "";
            return (
              <li key={key} className="flex flex-1">
                {href ? (
                  <Link href={href} aria-current={isActive ? "page" : undefined} aria-label={`${labels[key]}${countLabel}`} className={`${cell} ${color}`}>
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (key === "search") window.scrollTo({ top: 0, behavior: "smooth" });
                      window.dispatchEvent(new Event(key === "search" ? OPEN_SEARCH_EVENT : OPEN_MENU_EVENT));
                    }}
                    aria-label={labels[key]}
                    className={`${cell} ${color}`}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
