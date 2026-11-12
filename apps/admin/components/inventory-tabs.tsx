"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "../i18n/navigation";

const TABS = [
  { href: "/inventory", key: "tabStock" },
  { href: "/inventory/transfers", key: "tabTransfers" },
  { href: "/inventory/stock-takes", key: "tabStockTakes" },
  { href: "/inventory/analysis", key: "tabAnalysis" },
  { href: "/purchase-orders", key: "tabPurchaseOrders" },
] as const;

/** Sub-navigation shared by the inventory screens (M2 stock + M12 operations/analysis). */
export function InventoryTabs() {
  const t = useTranslations("stockOps");
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
      {TABS.map((tab) => {
        const active = tab.href === "/inventory" ? pathname === "/inventory" : pathname.startsWith(tab.href);
        return (
          <Link key={tab.href} href={tab.href} className={`rounded-theme px-3 py-1.5 text-sm ${active ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground hover:opacity-80"}`}>
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
