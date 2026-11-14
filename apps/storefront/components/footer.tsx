import type { MenuData } from "../lib/store-api";
import { toNavItems } from "../lib/nav-items";
import { uiText } from "../lib/ui-text";
import { NavLink } from "./nav-link";

interface FooterProps {
  brandName: string;
  footerVariant: "columns" | "compact";
  menu: MenuData | null;
  phone: string | null;
  email: string | null;
  locale: string;
  /** `storefront.*` UI strings from the API (admin-editable). */
  uiStrings: Record<string, { bn?: string; en?: string }>;
}

/**
 * Footer from the admin "footer" menu (§9.3). "columns": each top-level item is a column
 * heading (a link if it has a target) with its children listed under it; "compact": one row
 * of links. Contact details come from the brand settings.
 */
export function Footer({ brandName, footerVariant, menu, phone, email, locale, uiStrings }: FooterProps) {
  const text = uiText(uiStrings, locale);
  const year = new Date().getFullYear();
  const items = toNavItems(menu, locale);
  const hasContact = Boolean(phone || email);

  const contact = hasContact ? (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-surface-foreground">{text("storefront.footer.contact")}</span>
      {phone && (
        <a href={`tel:${phone.replace(/\s+/g, "")}`} className="hover:text-surface-foreground">
          {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="break-all hover:text-surface-foreground">
          {email}
        </a>
      )}
    </div>
  ) : null;

  return (
    <footer className="mt-auto border-t border-border bg-muted px-4 py-10 text-sm text-surface-foreground/70 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {footerVariant === "columns" ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-2">
                <NavLink item={item} className="font-medium text-surface-foreground">
                  {item.label}
                </NavLink>
                {item.children.map((child) => (
                  <NavLink key={child.id} item={child} className="hover:text-surface-foreground">
                    {child.label}
                  </NavLink>
                ))}
              </div>
            ))}
            {contact}
          </div>
        ) : (
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              {items.map((item) => (
                <NavLink key={item.id} item={item} className="hover:text-surface-foreground">
                  {item.label}
                </NavLink>
              ))}
            </nav>
            {contact}
          </div>
        )}
        <p className="mt-8 border-t border-border pt-6 text-xs text-surface-foreground/50">
          © {year} {brandName}
        </p>
      </div>
    </footer>
  );
}
