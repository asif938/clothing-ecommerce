"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "../i18n/navigation";
import { api } from "../lib/api";
import { activeHref, NAV_GROUPS, NAV_TOP, type NavGroup } from "../lib/admin-nav";
import { AdminPwa } from "./admin-pwa";
import { NotificationBell } from "./notification-bell";

const STORAGE_KEY = "admin.nav.groups";

/** 16px stroke icons (no icon-library download), keyed by `NavGroup.icon`. Decorative: every one sits next to its text label. */
const ICON_PATHS: Record<NavGroup["icon"] | "home", string[]> = {
  home: ["M3 11l9-8 9 8", "M5 10v10h14V10"],
  orders: ["M6 3h12v18l-3-2-3 2-3-2-3 2z", "M9 8h6", "M9 12h6"],
  truck: ["M3 6h11v9H3z", "M14 9h4l3 3v3h-7", "M7 18.5a1.5 1.5 0 100-.01", "M17 18.5a1.5 1.5 0 100-.01"],
  tag: ["M3 12V4h8l9 9-8 8z", "M7.5 7.5h.01"],
  box: ["M3 7l9-4 9 4v10l-9 4-9-4z", "M3 7l9 4 9-4", "M12 11v10"],
  megaphone: ["M3 11v2a1 1 0 001 1h2l7 4V6L6 10H4a1 1 0 00-1 1z", "M17 8a5 5 0 010 8"],
  users: ["M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1", "M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7", "M21 20v-1a4 4 0 00-3-3.9", "M16 4.1a3.5 3.5 0 010 6.8"],
  file: ["M7 3h8l4 4v14H7z", "M15 3v4h4", "M10 12h6", "M10 16h6"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  gear: ["M4 7h10", "M18 7h2", "M4 17h2", "M10 17h10", "M16 5v4", "M8 15v4"],
};

function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof ICON_PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function localizedText(value: unknown, locale: string): string {
  if (!value || typeof value !== "object") return "";
  const text = value as { bn?: string; en?: string };
  return text[locale as "bn" | "en"] ?? text.bn ?? text.en ?? "";
}

function readOpenGroups(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

const linkBase = "relative flex items-center rounded-theme px-3 py-2 text-sm transition-colors";
const linkActive = "bg-muted font-medium text-surface-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand";
const linkIdle = "text-surface-foreground/70 hover:bg-muted hover:text-surface-foreground";

/**
 * The admin's left column. It is exactly as tall as the window: the brand header and the
 * account area stay put and only the menu in between scrolls, so the sidebar never rides
 * along with a long page. Menu sections collapse (the one holding the current page opens on
 * its own), and the search box narrows all 65 pages as you type.
 */
export function AdminSidebar({
  staff,
  onNavigate,
  onLogout,
  onLogoutAll,
}: {
  staff: { name: string; email: string };
  /** Called after a link is chosen — the mobile drawer uses it to close itself. */
  onNavigate?: () => void;
  onLogout: () => void;
  onLogoutAll: () => void;
}) {
  const t = useTranslations("shell");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const pathname = usePathname();
  const current = activeHref(pathname);
  const navRef = useRef<HTMLElement>(null);

  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // A remembered "collapsed" never hides the section that holds the page you are on.
    const saved = readOpenGroups();
    const holder = NAV_GROUPS.find((group) => group.items.some((item) => item.href === current));
    if (holder && saved[holder.key] === false) delete saved[holder.key];
    return saved;
  });
  const [brand, setBrand] = useState<{ name: string; logo: string | null } | null>(null);

  // The store's own name and logo (Settings → Brand) head the sidebar, so the admin reads as that brand's.
  useEffect(() => {
    let cancelled = false;
    api
      .get<Record<string, unknown>>("/store/config")
      .then((config) => {
        if (cancelled) return;
        const logo = config["brand.logoLight"];
        setBrand({ name: localizedText(config["brand.name"], locale), logo: typeof logo === "string" && logo.trim() ? logo : null });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [locale]);

  // Landing on a page opens the section that holds it, even if that section was collapsed by hand earlier (set during render, not in an effect).
  const [seenHref, setSeenHref] = useState(current);
  if (seenHref !== current) {
    setSeenHref(current);
    const holder = NAV_GROUPS.find((group) => group.items.some((item) => item.href === current));
    if (holder && openGroups[holder.key] === false) setOpenGroups({ ...openGroups, [holder.key]: true });
  }

  // Bring the current page into view when the menu first shows (it may sit far down the list).
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname]);

  function toggleGroup(key: string, nextOpen: boolean) {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: nextOpen };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private mode or blocked storage: the sections just won't remember their state.
      }
      return next;
    });
  }

  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!needle) return NAV_GROUPS;
    return NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => t(item.labelKey).toLowerCase().includes(needle)) })).filter((group) => group.items.length > 0);
  }, [needle, t]);
  const topMatches = !needle || t(NAV_TOP.labelKey).toLowerCase().includes(needle);

  const brandName = brand?.name || "Admin";
  const otherLocale = locale === "en" ? "bn" : "en";

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-5">
        {brand?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo URL comes from the media library; a custom loader adds nothing here.
          <img src={brand.logo} alt={brandName} className="h-7 w-auto max-w-[8.5rem]" />
        ) : (
          <span className="truncate text-base font-semibold tracking-tight text-surface-foreground">{brandName}</span>
        )}
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-surface-foreground/60">Admin</span>
        <div className="ml-auto">
          <NotificationBell compact />
        </div>
      </div>

      <div className="shrink-0 px-3 pb-1 pt-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("menuSearch")}
          aria-label={t("menuSearch")}
          className="h-9 w-full rounded-theme border border-transparent bg-muted px-3 text-sm outline-none transition-colors placeholder:text-surface-foreground/40 focus:border-border focus:bg-surface"
        />
      </div>

      <nav ref={navRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 [scrollbar-width:thin]">
        {topMatches && (
          <Link href={NAV_TOP.href} onClick={onNavigate} aria-current={current === NAV_TOP.href ? "page" : undefined} className={`${linkBase} gap-3 ${current === NAV_TOP.href ? linkActive : linkIdle}`}>
            <Icon name="home" />
            {t(NAV_TOP.labelKey)}
          </Link>
        )}

        {groups.map((group) => {
          const holdsCurrent = group.items.some((item) => item.href === current);
          const expanded = needle ? true : (openGroups[group.key] ?? holdsCurrent);
          return (
            <div key={group.key} className="mt-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.key, !expanded)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 rounded-theme px-3 py-2 text-left text-sm font-medium text-surface-foreground transition-colors hover:bg-muted"
              >
                <Icon name={group.icon} className="h-4 w-4 text-surface-foreground/55" />
                <span className="flex-1 truncate">{t(group.labelKey)}</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`h-3.5 w-3.5 text-surface-foreground/40 transition-transform ${expanded ? "rotate-180" : ""}`}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {expanded && (
                <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                  {group.items.map((item) => (
                    <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={item.href === current ? "page" : undefined} className={`${linkBase} ${item.href === current ? linkActive : linkIdle}`}>
                      {t(item.labelKey)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {!topMatches && groups.length === 0 && <p className="px-3 py-6 text-center text-sm text-surface-foreground/50">{t("menuNoMatch")}</p>}
      </nav>

      <div className="shrink-0 border-t border-border p-3 text-sm">
        <AdminPwa />
        <div className="flex items-center gap-3 px-2 py-1.5">
          <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-medium text-brand-foreground">
            {(staff.name || staff.email).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            {staff.name && <div className="truncate text-sm font-medium text-surface-foreground">{staff.name}</div>}
            <div className="truncate text-xs text-surface-foreground/60">{staff.email}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 pt-1 text-xs text-surface-foreground/60">
          <button type="button" onClick={onLogout} className="hover:text-surface-foreground">
            {tAuth("logout")}
          </button>
          <button type="button" onClick={onLogoutAll} className="hover:text-surface-foreground">
            {tAuth("logoutAll")}
          </button>
          <Link href={pathname} locale={otherLocale} hrefLang={otherLocale} lang={otherLocale} className="ml-auto rounded-full border border-border px-2 py-0.5 hover:bg-muted hover:text-surface-foreground">
            {otherLocale === "bn" ? "বাংলা" : "English"}
          </Link>
        </div>
      </div>
    </div>
  );
}
