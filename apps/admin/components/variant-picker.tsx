"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "../lib/api";
import { localized, type Localized } from "../lib/format";

export interface VariantOption {
  id: string;
  sku: string;
  barcode: string | null;
  price: number;
  productId: string;
  title: Localized;
  options: Localized[];
}

export function variantLabel(v: Pick<VariantOption, "sku" | "title" | "options">, locale: string): string {
  const opts = v.options.map((o) => localized(o, locale)).filter(Boolean).join(" / ");
  return `${localized(v.title, locale)}${opts ? ` — ${opts}` : ""} (${v.sku})`;
}

/** Search-as-you-type variant picker (SKU, barcode or product title) backed by `GET /admin/lookups/variants`. */
export function VariantPicker({ onPick, placeholder }: { onPick: (variant: VariantOption) => void; placeholder?: string }) {
  const t = useTranslations("m12");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<VariantOption[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const handle = setTimeout(() => {
      api
        .get<VariantOption[]>(`/admin/lookups/variants?q=${encodeURIComponent(term)}`)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  const visible = q.trim().length >= 2 ? results : [];

  return (
    <div className="relative w-full max-w-md">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder ?? t("variantSearch")}
        className="w-full rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground outline-none focus:border-brand"
      />
      {visible.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-theme border border-border bg-surface shadow-lg">
          {visible.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(v);
                  setQ("");
                  setResults([]);
                }}
                className="w-full px-3 py-2 text-left text-sm text-surface-foreground hover:bg-muted"
              >
                {variantLabel(v, locale)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
