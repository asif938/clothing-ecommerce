import { Link } from "../i18n/navigation";
import type { MenuData } from "../lib/store-api";
import { toNavItems, type NavItem } from "../lib/nav-items";
import { uiText } from "../lib/ui-text";
import { CartLink } from "./cart-link";
import { CameraIcon, ChevronDownIcon, HeartIcon, UserIcon } from "./icons";
import { LanguageSwitch } from "./language-switch";
import { MobileMenu } from "./mobile-menu";
import { MobileSearch } from "./mobile-search";
import { NavLink } from "./nav-link";
import { SearchBox } from "./search-box";

interface HeaderProps {
  brandName: string;
  logoUrl: string | null;
  headerVariant: "centered" | "left" | "mega" | "minimal";
  menu: MenuData | null;
  locale: string;
  /** `storefront.*` UI strings from the API (admin-editable). */
  uiStrings: Record<string, { bn?: string; en?: string }>;
  /** §16 M14 — shows the "search by photo" shortcut when `visualSearch.enabled`. */
  visualSearch?: boolean;
}

const iconButton = "flex h-11 w-11 items-center justify-center rounded-full text-surface-foreground transition-colors hover:bg-muted";

/** Desktop dropdown: opens on hover and on keyboard focus inside the item (`focus-within`), so it works without a mouse. */
function DesktopNavItem({ item, mega }: { item: NavItem; mega: boolean }) {
  // The underline grows from the left on hover/focus (and for the open dropdown) — a quiet cue for where you are.
  const top =
    "relative flex h-16 items-center gap-1 text-sm font-medium tracking-wide text-surface-foreground/75 transition-colors after:absolute after:inset-x-0 after:bottom-4 after:h-px after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:text-surface-foreground hover:after:scale-x-100 group-hover:after:scale-x-100 group-focus-within:after:scale-x-100";
  if (item.children.length === 0) {
    return (
      <li>
        <NavLink item={item} className={top}>
          {item.label}
        </NavLink>
      </li>
    );
  }
  return (
    <li className={`group ${mega ? "" : "relative"}`}>
      <NavLink item={item} className={top}>
        {item.label}
        <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />
      </NavLink>
      <div
        className={`invisible absolute top-full z-30 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${
          mega ? "inset-x-0 border-y border-border bg-surface shadow-[0_18px_40px_-24px_rgb(0_0_0/0.25)]" : "left-0 min-w-56 rounded-b-theme border border-border bg-surface py-2 shadow-[0_18px_40px_-24px_rgb(0_0_0/0.25)]"
        }`}
      >
        {mega ? (
          <div className="mx-auto grid max-w-6xl grid-cols-4 gap-8 px-8 py-6">
            {item.children.map((child) => (
              <div key={child.id} className="flex flex-col gap-2">
                <NavLink item={child} className="text-sm font-semibold text-surface-foreground hover:text-brand">
                  {child.label}
                </NavLink>
                {child.children.map((grandchild) => (
                  <NavLink key={grandchild.id} item={grandchild} className="text-sm text-surface-foreground/70 hover:text-brand">
                    {grandchild.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <ul>
            {item.children.map((child) => (
              <li key={child.id}>
                <NavLink item={child} className="block px-4 py-2 text-sm text-surface-foreground/80 hover:bg-muted hover:text-surface-foreground">
                  {child.label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/**
 * Storefront header (docs/PROJECT_SPEC.md §4.4.3 header variants, §9.3 menus). Mobile-first:
 * below `lg` a menu drawer + logo + search icon + cart; from `lg` the menu inline with
 * dropdowns, plus wishlist, account and language. Every label comes from UI strings and every
 * menu entry from the admin "header" menu — nothing here is store-specific copy (golden rule 1).
 */
export function Header({ brandName, logoUrl, headerVariant, menu, locale, uiStrings, visualSearch = false }: HeaderProps) {
  const text = uiText(uiStrings, locale);
  const items = headerVariant === "minimal" ? [] : toNavItems(menu, locale);
  const centered = headerVariant === "centered";

  const logo = (
    <Link href="/" className="flex min-w-0 items-center font-display text-2xl leading-none text-surface-foreground lg:text-[1.65rem]">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- brand logo URL already comes pre-sized from media settings; a custom loader adds nothing here.
        <img src={logoUrl} alt={brandName} className="h-7 w-auto max-w-[11rem] lg:h-8 lg:max-w-[14rem]" />
      ) : (
        <span className="truncate">{brandName}</span>
      )}
    </Link>
  );

  const desktopNav =
    items.length > 0 ? (
      <nav aria-label={text("storefront.header.menu")} className="hidden lg:block">
        <ul className={`flex items-center gap-7 ${centered ? "justify-center" : ""}`}>
          {items.map((item) => (
            <DesktopNavItem key={item.id} item={item} mega={headerVariant === "mega"} />
          ))}
        </ul>
      </nav>
    ) : null;

  const placeholder = text("storefront.header.searchPlaceholder");

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-surface/90 backdrop-blur-md">
      <div className="relative mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 sm:px-6 lg:h-16 lg:gap-6 lg:px-8">
        <MobileMenu
          items={items}
          brandName={brandName}
          labels={{
            menu: text("storefront.header.menu"),
            closeMenu: text("storefront.header.closeMenu"),
            account: text("storefront.header.account"),
            wishlist: text("storefront.header.wishlist"),
            trackOrder: text("storefront.header.trackOrder"),
            otherLanguage: text("storefront.header.otherLanguage"),
            showSubmenu: text("storefront.header.showSubmenu"),
          }}
        />

        <div className={`flex min-w-0 flex-1 ${centered ? "justify-center lg:justify-start" : ""} lg:flex-none`}>{logo}</div>

        {!centered && <div className="hidden min-w-0 flex-1 lg:block">{desktopNav}</div>}
        {centered && <div className="hidden flex-1 lg:block" />}

        <div className="flex items-center">
          <div className="mr-2 hidden w-56 md:block lg:w-64">
            <SearchBox locale={locale} placeholder={placeholder} />
          </div>
          <MobileSearch locale={locale} label={text("storefront.header.search")} placeholder={placeholder} />
          {visualSearch && (
            <Link href="/search/photo" className={`${iconButton} hidden sm:flex`} aria-label={text("storefront.header.searchByPhoto")} title={text("storefront.header.searchByPhoto")}>
              <CameraIcon />
            </Link>
          )}
          <Link href="/wishlist" className={`${iconButton} hidden lg:flex`} aria-label={text("storefront.header.wishlist")} title={text("storefront.header.wishlist")}>
            <HeartIcon />
          </Link>
          <Link href="/account" className={`${iconButton} hidden lg:flex`} aria-label={text("storefront.header.account")} title={text("storefront.header.account")}>
            <UserIcon />
          </Link>
          <LanguageSwitch label={text("storefront.header.otherLanguage")} className="hidden h-11 items-center rounded-full px-3 text-sm font-medium text-surface-foreground/75 transition-colors hover:bg-muted hover:text-surface-foreground lg:flex" />
          <CartLink label={text("storefront.header.cart")} />
        </div>
      </div>
      {centered && desktopNav && <div className="mx-auto hidden max-w-6xl border-t border-border px-8 lg:block">{desktopNav}</div>}
    </header>
  );
}
