"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "../lib/api";
import { localized, type Localized } from "../lib/format";

export interface ProductOption {
  id: string;
  title: Localized;
  slug: string;
}

/** Search-as-you-type product picker (title in either language or a tag) backed by `GET /admin/products?q=`. Picks one product per click; the caller decides whether that adds or replaces. */
export function ProductPicker({ onPick, exclude = [], placeholder }: { onPick: (product: ProductOption) => void; exclude?: string[]; placeholder?: string }) {
  const t = useTranslations("blocks");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductOption[]>([]);
  const searching = q.trim().length >= 2;

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const handle = setTimeout(() => {
      api
        .get<{ data: ProductOption[] }>(`/admin/products?q=${encodeURIComponent(term)}&pageSize=10`)
        .then((r) => setResults(r.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  const visible = searching ? results.filter((p) => !exclude.includes(p.id)) : [];

  return (
    <div className="relative w-full max-w-md">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder ?? t("searchProduct")}
        className="w-full rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground outline-none focus:border-brand"
      />
      {visible.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-theme border border-border bg-surface shadow-lg">
          {visible.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(p);
                  setQ("");
                  setResults([]);
                }}
                className="w-full px-3 py-2 text-left text-sm text-surface-foreground hover:bg-muted"
              >
                {localized(p.title, locale) || p.slug}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && visible.length === 0 && <span className="text-xs text-surface-foreground/60">{t("noResults")}</span>}
    </div>
  );
}
