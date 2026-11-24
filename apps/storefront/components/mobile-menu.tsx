"use client";

import { useEffect, useRef, useState } from "react";
import { OPEN_MENU_EVENT } from "../lib/bottom-nav";
import { usePathname } from "../i18n/navigation";
import type { NavItem } from "../lib/nav-items";
import { ChevronDownIcon, CloseIcon, HeartIcon, MenuIcon, UserIcon } from "./icons";
import { LanguageSwitch } from "./language-switch";
import { NavLink } from "./nav-link";

export interface MobileMenuLabels {
  menu: string;
  closeMenu: string;
  account: string;
  wishlist: string;
  trackOrder: string;
  otherLanguage: string;
  showSubmenu: string;
}

function DrawerItems({ items, depth, onNavigate, showSubmenu }: { items: NavItem[]; depth: number; onNavigate: () => void; showSubmenu: string }) {
  return (
    <ul className={depth === 0 ? "divide-y divide-border" : "flex flex-col"}>
      {items.map((item) =>
        item.children.length > 0 ? (
          <li key={item.id}>
            <details className="group">
              <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 ${depth === 0 ? "px-5 text-base font-medium" : "pl-9 pr-5 text-sm"} text-surface-foreground [&::-webkit-details-marker]:hidden`}>
                <span>{item.label}</span>
                <span className="sr-only">{showSubmenu}</span>
                <ChevronDownIcon className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="pb-2">
                {item.href && (
                  <NavLink item={item} onClick={onNavigate} className={`flex min-h-11 items-center ${depth === 0 ? "pl-9" : "pl-14"} pr-5 text-sm font-medium text-brand`}>
                    {item.label}
                  </NavLink>
                )}
                <DrawerItems items={item.children} depth={depth + 1} onNavigate={onNavigate} showSubmenu={showSubmenu} />
              </div>
            </details>
          </li>
        ) : (
          <li key={item.id}>
            <NavLink
              item={item}
              onClick={onNavigate}
              className={`flex min-h-12 items-center ${depth === 0 ? "px-5 text-base font-medium" : depth === 1 ? "pl-9 pr-5 text-sm" : "pl-14 pr-5 text-sm"} text-surface-foreground`}
            >
              {item.label}
            </NavLink>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * Phone/tablet navigation (below `lg`): a left drawer with the header menu as an
 * accordion, plus account, wishlist, order tracking and the language switch.
 * Closes on Escape, on backdrop tap and on navigation; locks page scroll while open.
 */
export function MobileMenu({ items, labels, brandName }: { items: NavItem[]; labels: MobileMenuLabels; brandName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeButton = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);

  // The bottom navigation's "Categories" tab opens this drawer.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_MENU_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MENU_EVENT, onOpen);
  }, []);

  // Close whenever the route changes (a link inside the drawer was followed).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to navigation, an external change.
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const opener = openButton.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={openButton}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={labels.menu}
        className="-ml-2 flex h-11 w-11 items-center justify-center rounded-theme text-surface-foreground lg:hidden"
      >
        <MenuIcon />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
          <div id="mobile-menu" role="dialog" aria-modal="true" aria-label={labels.menu} className="absolute inset-y-0 left-0 flex w-[85%] max-w-sm flex-col bg-surface shadow-xl">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pl-5 pr-2">
              <span className="truncate text-base font-semibold text-surface-foreground">{brandName}</span>
              <button ref={closeButton} type="button" onClick={close} aria-label={labels.closeMenu} className="flex h-11 w-11 items-center justify-center rounded-theme text-surface-foreground">
                <CloseIcon />
              </button>
            </div>

            <nav aria-label={labels.menu} className="flex-1 overflow-y-auto">
              {items.length > 0 && <DrawerItems items={items} depth={0} onNavigate={close} showSubmenu={labels.showSubmenu} />}
            </nav>

            <div className="shrink-0 border-t border-border bg-muted px-5 py-3 text-sm">
              <NavLink item={{ href: "/account", external: false }} onClick={close} className="flex min-h-11 items-center gap-3 text-surface-foreground">
                <UserIcon />
                {labels.account}
              </NavLink>
              <NavLink item={{ href: "/wishlist", external: false }} onClick={close} className="flex min-h-11 items-center gap-3 text-surface-foreground">
                <HeartIcon />
                {labels.wishlist}
              </NavLink>
              <NavLink item={{ href: "/track", external: false }} onClick={close} className="flex min-h-11 items-center gap-3 text-surface-foreground">
                <span className="inline-block w-5" aria-hidden="true" />
                {labels.trackOrder}
              </NavLink>
              <div className="pt-2">
                <LanguageSwitch label={labels.otherLanguage} className="inline-flex min-h-11 items-center rounded-theme border border-border px-4 font-medium text-surface-foreground" />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
