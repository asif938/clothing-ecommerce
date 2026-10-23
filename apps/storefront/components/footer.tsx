import { t } from "@clothing/shared";
import { Link } from "../i18n/navigation";
import type { MenuData } from "../lib/store-api";

interface FooterProps {
  brandName: string;
  footerVariant: "columns" | "compact";
  menu: MenuData | null;
  phone: string | null;
  email: string | null;
  locale: string;
}

export function Footer({ brandName, footerVariant, menu, phone, email, locale }: FooterProps) {
  const year = new Date().getFullYear();
  const items = menu?.items ?? [];

  return (
    <footer className="mt-auto border-t border-border bg-muted px-4 py-8 text-sm text-surface-foreground/70 sm:px-8">
      <div className="mx-auto max-w-6xl">
        {footerVariant === "columns" ? (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-2">
                <span className="font-medium text-surface-foreground">{t(item.label, locale as "bn" | "en")}</span>
                {item.children?.map((child) => (
                  <Link key={child.id} href={child.url ?? "#"} className="text-xs">
                    {t(child.label, locale as "bn" | "en")}
                  </Link>
                ))}
              </div>
            ))}
            <div className="flex flex-col gap-1 text-xs">
              {phone && <span>{phone}</span>}
              {email && <span>{email}</span>}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {items.map((item) => (
              <Link key={item.id} href={item.url ?? "#"} className="text-xs">
                {t(item.label, locale as "bn" | "en")}
              </Link>
            ))}
          </div>
        )}
        <p className="mt-6 text-xs text-surface-foreground/50">
          © {year} {brandName}
        </p>
      </div>
    </footer>
  );
}
