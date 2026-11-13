"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "../i18n/navigation";

const TABS = [
  { href: "/finance/cod", key: "tabCod" },
  { href: "/finance/gateway", key: "tabGateway" },
  { href: "/finance/profit", key: "tabProfit" },
  { href: "/finance/expenses", key: "tabExpenses" },
  { href: "/finance/pnl", key: "tabPnl" },
  { href: "/refunds", key: "tabRefunds" },
] as const;

/** Sub-navigation for the Finance screens (§8.2 Finance, §16 M12). */
export function FinanceTabs() {
  const t = useTranslations("finance");
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`rounded-theme px-3 py-1.5 text-sm ${pathname.startsWith(tab.href) ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground hover:opacity-80"}`}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
