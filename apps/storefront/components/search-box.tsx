"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@clothing/shared";
import { Link, useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";

interface SuggestResult {
  products: { id: string; slug: string; title: { bn?: string; en?: string }; imageUrl: string | null; price: number | null }[];
  categories: { id: string; slug: string; name: { bn?: string; en?: string } }[];
}

const EMPTY: SuggestResult = { products: [], categories: [] };

/** Instant suggestions (docs/PROJECT_SPEC.md §7.2 "typo-tolerant... including Banglish like panjabi/punjabi") — debounced, client-side, hitting the same-origin rewrite so no API URL is exposed to the browser. */
export function SearchBox({ locale, placeholder, autoFocus = false, fullWidth = false }: { locale: string; placeholder: string; autoFocus?: boolean; fullWidth?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SuggestResult>(EMPTY);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale suggestions in response to the `query` dependency itself changing, not fetched/external data.
      setResults(EMPTY);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void fetch(`/api/v1/store/catalog/suggest?q=${encodeURIComponent(query)}`)
        .then((res) => (res.ok ? res.json() : EMPTY))
        .then((data: SuggestResult) => setResults(data))
        .catch(() => setResults(EMPTY));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function submit() {
    if (!query.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  const hasSuggestions = results.products.length > 0 || results.categories.length > 0;

  return (
    <div className={`relative w-full ${fullWidth ? "" : "max-w-xs"}`}>
      <input
        type="search"
        // Only the mobile search row uses this, right after an explicit tap on the search icon.
        autoFocus={autoFocus}
        aria-label={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="h-10 w-full rounded-full border border-transparent bg-muted px-4 text-sm outline-none transition-colors placeholder:text-surface-foreground/45 focus:border-accent focus:bg-surface"
      />
      {open && hasSuggestions && (
        <div className="absolute left-0 top-full z-20 mt-2 w-full rounded-theme border border-border bg-surface p-2 shadow-[0_18px_40px_-24px_rgb(0_0_0/0.3)]">
          {results.categories.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {results.categories.map((category) => (
                <Link key={category.id} href={`/c/${category.slug}`} className="rounded-theme bg-muted px-2 py-1 text-xs text-surface-foreground">
                  {t(category.name, locale as "bn" | "en")}
                </Link>
              ))}
            </div>
          )}
          {results.products.map((product) => (
            <Link key={product.id} href={`/p/${product.slug}`} className="flex items-center gap-2 rounded-theme px-1 py-1.5 text-sm hover:bg-muted">
              {product.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx
                <img src={product.imageUrl} alt="" className="h-8 w-8 rounded-theme object-cover" />
              )}
              <span className="flex-1 truncate">{t(product.title, locale as "bn" | "en")}</span>
              {product.price !== null && <span className="text-xs text-surface-foreground/60">{formatBdt(product.price)}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
