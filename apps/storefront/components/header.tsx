import { t } from "@clothing/shared";
import { Link } from "../i18n/navigation";
import { SearchBox } from "./search-box";
import { CartLink } from "./cart-link";
import type { MenuData } from "../lib/store-api";

/**
 * `/c/[slug]`, `/p/[slug]` etc. look products/categories/collections/pages
 * up by slug, not database id — so a menu item's `targetId` is expected to
 * already hold that slug for every type except `url`. There's no menu
 * admin UI yet (deferred in M3, see docs/DECISIONS.md) to write a real
 * database id into it in the first place; when that UI exists, it should
 * either store the slug directly or resolve to one at save time, not
 * leave this route doing an id→slug lookup per render.
 */
function menuHref(item: MenuData["items"][number]): string {
  if (item.type === "url") return item.url ?? "#";
  if (item.type === "page") return `/pages/${item.targetId ?? ""}`;
  if (item.type === "category") return `/c/${item.targetId ?? ""}`;
  if (item.type === "collection") return `/collections/${item.targetId ?? ""}`;
  return `/p/${item.targetId ?? ""}`;
}

interface HeaderProps {
  brandName: string;
  logoUrl: string | null;
  headerVariant: "centered" | "left" | "mega" | "minimal";
  menu: MenuData | null;
  locale: string;
  /** §16 M14 — shows the "search by photo" shortcut when `visualSearch.enabled`. */
  visualSearch?: boolean;
}

/** Layout variant selected in admin (docs/PROJECT_SPEC.md §4.4.3) — same nav data, different arrangement. */
export function Header({ brandName, logoUrl, headerVariant, menu, locale, visualSearch = false }: HeaderProps) {
  const logo = (
    <Link href="/" className="text-lg font-semibold text-surface-foreground">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- brand logo URL already comes pre-sized from media settings; a custom loader adds nothing here.
        <img src={logoUrl} alt={brandName} className="h-8 w-auto" />
      ) : (
        brandName
      )}
    </Link>
  );

  const nav =
    headerVariant === "minimal" ? null : (
      <nav className="flex flex-wrap items-center gap-5 text-sm text-surface-foreground/80">
        {menu?.items.map((item) => (
          <div key={item.id} className="group relative">
            <Link href={menuHref(item)}>{t(item.label, locale as "bn" | "en")}</Link>
            {headerVariant === "mega" && item.children && item.children.length > 0 && (
              <div className="absolute left-0 top-full z-10 hidden min-w-40 flex-col gap-1 rounded-theme border border-border bg-surface p-3 shadow-lg group-hover:flex">
                {item.children.map((child) => (
                  <Link key={child.id} href={menuHref(child)} className="text-xs text-surface-foreground/70">
                    {t(child.label, locale as "bn" | "en")}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    );

  return (
    <header className="border-b border-border bg-surface px-4 py-3 sm:px-8">
      <div className={`mx-auto flex max-w-6xl items-center gap-4 ${headerVariant === "centered" ? "flex-col" : "justify-between"}`}>
        {logo}
        {nav}
        <div className="flex items-center gap-4">
          <SearchBox locale={locale} />
          {visualSearch && (
            <Link
              href="/search/photo"
              className="flex h-9 w-9 items-center justify-center rounded-theme border border-border text-surface-foreground"
              aria-label={locale === "bn" ? "ছবি দিয়ে খুঁজুন" : "Search by photo"}
              title={locale === "bn" ? "ছবি দিয়ে খুঁজুন" : "Search by photo"}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </Link>
          )}
          <CartLink locale={locale} />
        </div>
      </div>
    </header>
  );
}
