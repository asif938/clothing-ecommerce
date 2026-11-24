"use client";

import { useEffect, useState } from "react";
import { OPEN_SEARCH_EVENT } from "../lib/bottom-nav";
import { SearchIcon } from "./icons";
import { SearchBox } from "./search-box";

/** Below `md` the search field is hidden behind an icon; tapping it opens a full-width row under the header. */
export function MobileSearch({ locale, label, placeholder }: { locale: string; label: string; placeholder: string }) {
  const [open, setOpen] = useState(false);

  // The bottom navigation's "Search" tab: open this row on phones; from `md` up the header's own field is visible, so focus it.
  useEffect(() => {
    const onOpen = () => {
      if (window.matchMedia("(min-width: 768px)").matches) document.querySelector<HTMLInputElement>("header input")?.focus();
      else setOpen(true);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-search"
        aria-label={label}
        className="flex h-11 w-11 items-center justify-center rounded-theme text-surface-foreground md:hidden"
      >
        <SearchIcon />
      </button>
      {open && (
        <div id="mobile-search" className="absolute inset-x-0 top-full z-30 border-b border-border bg-surface px-4 py-3 shadow-sm md:hidden">
          <SearchBox locale={locale} placeholder={placeholder} autoFocus fullWidth />
        </div>
      )}
    </>
  );
}
