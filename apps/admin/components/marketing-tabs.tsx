"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "../i18n/navigation";

const TABS = [
  { href: "/marketing/broadcasts", key: "broadcasts" },
  { href: "/marketing/journeys", key: "journeys" },
  { href: "/loyalty", key: "loyalty" },
  { href: "/gift-cards", key: "giftCards" },
  { href: "/store-credit", key: "storeCredit" },
  { href: "/referrals", key: "referrals" },
  { href: "/affiliates", key: "affiliates" },
  { href: "/marketing/audiences", key: "audiences" },
  { href: "/marketing/ad-spend", key: "adSpend" },
  { href: "/marketing/calendar", key: "calendar" },
] as const;

/** Sub-navigation for the M13 marketing screens (§8.2 Marketing). */
export function MarketingTabs() {
  const t = useTranslations("marketingTabs");
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

export const selectClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground";
export const textareaClass = "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground";
