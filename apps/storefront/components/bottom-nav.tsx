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

/** Count bubble in the theme's accent (gold by default), so it reads against both the plain and the raised (brand) icon. */
function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span aria-hidden="true" className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-[18px] text-surface ring-2 ring-surface">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Phone bottom navigation (below `lg`): a floating rounded card with up to
 * five tabs chosen in Settings → Theme. Every tab shows its name; the current
 * page's tab lifts into a circle in the brand colour, ringed in the page
 * colour so it looks cut out of the bar. All colours come from the theme
 * (`brand`, `accent`, `surface`), so the bar follows each store's palette.
 * Wishlist and cart show live counts. Hidden on product pages (their own
 * sticky "Add to cart" bar sits there) and on checkout. Renders a spacer in
 * the page flow so the footer's last line isn't covered.
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

  return (
    <>
      <div aria-hidden="true" className="h-[calc(5rem+env(safe-area-inset-bottom))] lg:hidden" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
        <nav
          aria-label={labels.label}
          className="pointer-events-auto mx-auto max-w-md rounded-[1.375rem] border border-border bg-[color-mix(in_srgb,var(--color-surface),white_70%)] shadow-[0_6px_24px_-6px_rgb(0_0_0/0.18)]"
        >
          <ul className="flex h-[3.75rem] items-stretch">
            {items.map((key) => {
              const Icon = ICONS[key];
              const isActive = active === key;
              const count = counts[key] ?? 0;
              const content = (
                <>
                  <span
                    className={`relative flex items-center justify-center rounded-full transition-[transform,background-color,color,box-shadow] duration-300 ease-out-soft ${
                      isActive ? "h-[3.25rem] w-[3.25rem] -translate-y-5 bg-brand text-brand-foreground ring-[5px] ring-surface" : "h-7 w-7 translate-y-0 text-surface-foreground/55 group-hover:text-surface-foreground group-active:scale-90"
                    }`}
                  >
                    <Icon className={isActive ? "h-6 w-6" : "h-[22px] w-[22px]"} />
                    <Badge count={count} />
                  </span>
                  <span className={`absolute inset-x-0 bottom-2 truncate px-0.5 text-center text-[11px] leading-none transition-colors ${isActive ? "font-semibold text-brand" : "text-surface-foreground/60"}`}>
                    {labels[key]}
                  </span>
                </>
              );
              const href = BOTTOM_NAV_HREF[key];
              const ariaLabel = `${labels[key]}${count > 0 ? ` (${count})` : ""}`;
              const cell = "group relative flex flex-1 items-start justify-center pt-2 outline-none focus-visible:rounded-[1.375rem] focus-visible:ring-2 focus-visible:ring-accent";
              return (
                <li key={key} className="flex min-w-0 flex-1">
                  {href ? (
                    <Link href={href} aria-current={isActive ? "page" : undefined} aria-label={ariaLabel} className={cell}>
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (key === "search") window.scrollTo({ top: 0, behavior: "smooth" });
                        window.dispatchEvent(new Event(key === "search" ? OPEN_SEARCH_EVENT : OPEN_MENU_EVENT));
                      }}
                      aria-label={ariaLabel}
                      className={cell}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
