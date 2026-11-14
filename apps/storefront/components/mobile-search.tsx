"use client";

import { useState } from "react";
import { SearchIcon } from "./icons";
import { SearchBox } from "./search-box";

/** Below `md` the search field is hidden behind an icon; tapping it opens a full-width row under the header. */
export function MobileSearch({ locale, label, placeholder }: { locale: string; label: string; placeholder: string }) {
  const [open, setOpen] = useState(false);
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
