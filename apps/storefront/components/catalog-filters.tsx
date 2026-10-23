"use client";

import { useSearchParams } from "next/navigation";
import { t } from "@clothing/shared";
import { useRouter, usePathname } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import type { ListingFacetAttribute } from "../lib/store-api";

const SORT_OPTIONS = [
  { value: "relevance", labelEn: "Relevance", labelBn: "সম্পর্কিত" },
  { value: "newest", labelEn: "Newest", labelBn: "নতুন" },
  { value: "price_asc", labelEn: "Price: Low to High", labelBn: "দাম: কম থেকে বেশি" },
  { value: "price_desc", labelEn: "Price: High to Low", labelBn: "দাম: বেশি থেকে কম" },
  { value: "bestselling", labelEn: "Bestselling", labelBn: "বেস্ট সেলিং" },
] as const;

/** Filter sidebar + sort (docs/PROJECT_SPEC.md §16 M4) — drives the listing page's `searchParams`, so every state is a shareable/bookmarkable URL, not client-only state. */
export function CatalogFilters({ facets, locale }: { facets: ListingFacetAttribute[]; locale: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    next.delete("page"); // any filter change resets pagination
    router.push(`${pathname}?${next.toString()}`);
  }

  function toggleAttributeValue(attributeId: string, valueId: string) {
    const key = `attr_${attributeId}`;
    const current = new Set((searchParams.get(key) ?? "").split(",").filter(Boolean));
    if (current.has(valueId)) current.delete(valueId);
    else current.add(valueId);
    updateParam(key, current.size > 0 ? [...current].join(",") : null);
  }

  return (
    <div className="flex flex-col gap-6 text-sm">
      <label className="flex flex-col gap-1">
        <span className="font-medium text-surface-foreground">{locale === "bn" ? "সাজান" : "Sort"}</span>
        <select
          className="rounded-theme border border-border bg-surface px-3 py-2"
          value={searchParams.get("sort") ?? "relevance"}
          onChange={(e) => updateParam("sort", e.target.value)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {locale === "bn" ? option.labelBn : option.labelEn}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={searchParams.get("inStockOnly") === "true"} onChange={(e) => updateParam("inStockOnly", e.target.checked ? "true" : null)} />
        {locale === "bn" ? "স্টকে আছে" : "In stock only"}
      </label>

      {facets.map((attribute) => {
        const selected = new Set((searchParams.get(`attr_${attribute.attributeId}`) ?? "").split(",").filter(Boolean));
        return (
          <div key={attribute.attributeId} className="flex flex-col gap-2">
            <span className="font-medium text-surface-foreground">{t(attribute.attributeName, locale as "bn" | "en")}</span>
            {attribute.values.map((value) => (
              <label key={value.valueId} className="flex items-center gap-2 text-surface-foreground/80">
                <input type="checkbox" checked={selected.has(value.valueId)} onChange={() => toggleAttributeValue(attribute.attributeId, value.valueId)} />
                {t(value.label, locale as "bn" | "en")} <span className="text-xs text-surface-foreground/40">({value.count})</span>
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function PriceRangeDisplay({ range }: { range: { min: number; max: number } | null }) {
  if (!range) return null;
  return (
    <p className="text-xs text-surface-foreground/50">
      {formatBdt(range.min)} – {formatBdt(range.max)}
    </p>
  );
}
