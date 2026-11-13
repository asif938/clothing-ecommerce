"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "../i18n/navigation";

const TABS = [
  { href: "/support/inbox", key: "inbox" },
  { href: "/support/tickets", key: "tickets" },
  { href: "/support/canned-replies", key: "canned" },
  { href: "/support/calls", key: "calls" },
] as const;

/** Sub-navigation for the support screens (§8.2 Support, §16 M15). */
export function SupportTabs() {
  const t = useTranslations("supportTabs");
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
