import { Link } from "../i18n/navigation";
import type { MenuData } from "../lib/store-api";

function text(value: { bn?: string; en?: string } | undefined, locale: string): string {
  if (!value) return "";
  return value[locale as "bn" | "en"] ?? value.bn ?? value.en ?? "";
}

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
}

/** Layout variant selected in admin (docs/PROJECT_SPEC.md §4.4.3) — same nav data, different arrangement. */
export function Header({ brandName, logoUrl, headerVariant, menu, locale }: HeaderProps) {
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
            <Link href={menuHref(item)}>{text(item.label, locale)}</Link>
            {headerVariant === "mega" && item.children && item.children.length > 0 && (
              <div className="absolute left-0 top-full z-10 hidden min-w-40 flex-col gap-1 rounded-theme border border-border bg-surface p-3 shadow-lg group-hover:flex">
                {item.children.map((child) => (
                  <Link key={child.id} href={menuHref(child)} className="text-xs text-surface-foreground/70">
                    {text(child.label, locale)}
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
      <div className={`mx-auto flex max-w-6xl items-center ${headerVariant === "centered" ? "flex-col gap-2" : "justify-between gap-4"}`}>
        {logo}
        {nav}
      </div>
    </header>
  );
}
