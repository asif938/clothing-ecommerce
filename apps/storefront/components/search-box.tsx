"use client";

import { useEffect, useRef, useState } from "react";
import { t } from "@clothing/shared";
import { useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";

interface SuggestResult {
  products: { id: string; slug: string; title: { bn?: string; en?: string }; imageUrl: string | null; price: number | null }[];
  categories: { id: string; slug: string; name: { bn?: string; en?: string } }[];
}

const EMPTY: SuggestResult = { products: [], categories: [] };

/** Instant suggestions (docs/PROJECT_SPEC.md §7.2 "typo-tolerant... including Banglish like panjabi/punjabi") — debounced, client-side, hitting the same-origin rewrite so no API URL is exposed to the browser. */
export function SearchBox({ locale }: { locale: string }) {
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
    <div className="relative w-full max-w-xs">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={locale === "bn" ? "পণ্য খুঁজুন…" : "Search products…"}
        className="w-full rounded-theme border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand"
      />
      {open && hasSuggestions && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-theme border border-border bg-surface p-2 shadow-lg">
          {results.categories.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {results.categories.map((category) => (
                <a key={category.id} href={`/c/${category.slug}`} className="rounded-theme bg-muted px-2 py-1 text-xs text-surface-foreground">
                  {t(category.name, locale as "bn" | "en")}
                </a>
              ))}
            </div>
          )}
          {results.products.map((product) => (
            <a key={product.id} href={`/p/${product.slug}`} className="flex items-center gap-2 rounded-theme px-1 py-1.5 text-sm hover:bg-muted">
              {product.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- see apps/storefront/components/header.tsx
                <img src={product.imageUrl} alt="" className="h-8 w-8 rounded-theme object-cover" />
              )}
              <span className="flex-1 truncate">{t(product.title, locale as "bn" | "en")}</span>
              {product.price !== null && <span className="text-xs text-surface-foreground/60">{formatBdt(product.price)}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
