import type { MenuData } from "../lib/store-api";
import { toNavItems } from "../lib/nav-items";
import { uiText } from "../lib/ui-text";
import { NavLink } from "./nav-link";

interface FooterProps {
  brandName: string;
  /** The "logo for dark backgrounds" (`brand.logoDark`); the brand name is set in type when there isn't one. */
  logoUrl: string | null;
  footerVariant: "columns" | "compact";
  menu: MenuData | null;
  phone: string | null;
  email: string | null;
  locale: string;
  /** `storefront.*` UI strings from the API (admin-editable). */
  uiStrings: Record<string, { bn?: string; en?: string }>;
}

const linkClass = "w-fit text-brand-foreground/70 transition-colors hover:text-brand-foreground";
const headingClass = "font-medium text-brand-foreground";

/**
 * Footer from the admin "footer" menu (§9.3). "columns": each top-level item is a column
 * heading (a link if it has a target) with its children listed under it; "compact": one row
 * of links. Contact details come from the brand settings. Painted in the brand color (text
 * color is picked for contrast in the root layout), so it closes the page with the same
 * weight as the announcement bar that opens it.
 */
export function Footer({ brandName, logoUrl, footerVariant, menu, phone, email, locale, uiStrings }: FooterProps) {
  const text = uiText(uiStrings, locale);
  const year = new Date().getFullYear();
  const items = toNavItems(menu, locale);
  const hasContact = Boolean(phone || email);

  const contact = hasContact ? (
    <div className="col-span-2 flex flex-col gap-3 sm:col-span-1">
      <span className={headingClass}>{text("storefront.footer.contact")}</span>
      {phone && (
        <a href={`tel:${phone.replace(/\s+/g, "")}`} className={linkClass}>
          {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={`${linkClass} break-all`}>
          {email}
        </a>
      )}
    </div>
  ) : null;

  return (
    <footer className="mt-auto bg-brand px-4 pb-8 pt-14 text-sm text-brand-foreground/70 sm:px-8 sm:pt-20">
      <div className="mx-auto max-w-6xl">
        {logoUrl ? (
          <div className="mb-10 sm:mb-14">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo URL already comes from the media library; a custom loader adds nothing here. */}
            <img src={logoUrl} alt={brandName} className="h-10 w-auto max-w-full sm:h-14" />
          </div>
        ) : (
          <p className="mb-10 font-display text-3xl leading-none text-brand-foreground sm:mb-14 sm:text-5xl">{brandName}</p>
        )}
        {footerVariant === "columns" ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-3">
                <NavLink item={item} className={headingClass}>
                  {item.label}
                </NavLink>
                {item.children.map((child) => (
                  <NavLink key={child.id} item={child} className={linkClass}>
                    {child.label}
                  </NavLink>
                ))}
              </div>
            ))}
            {contact}
          </div>
        ) : (
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <nav className="flex flex-wrap gap-x-6 gap-y-3">
              {items.map((item) => (
                <NavLink key={item.id} item={item} className={linkClass}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
            {contact}
          </div>
        )}
        <p className="mt-14 border-t border-brand-foreground/15 pt-6 text-xs text-brand-foreground/50">
          © {year} {brandName}
        </p>
      </div>
    </footer>
  );
}
