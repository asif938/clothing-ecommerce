"use client";

import { useState, type ReactNode } from "react";
import { t } from "@clothing/shared";
import { setParam, toggleListValue } from "../lib/listing-params";
import type { ListingConfig, ListingText } from "../lib/listing-config";
import type { ListingResult } from "../lib/store-api";

/** Values shown before "Show more" in a long filter list. */
const COLLAPSED_COUNT = 6;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-1 border-b border-border pb-5 last:border-0">
      <legend className="mb-2 text-sm font-semibold text-surface-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

function CheckRow({ checked, onChange, label, count, indent = 0 }: { checked: boolean; onChange: () => void; label: string; count?: number; indent?: number }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm text-surface-foreground/85" style={indent ? { paddingInlineStart: `${indent * 1}rem` } : undefined}>
      <input type="checkbox" checked={checked} onChange={onChange} className="h-[18px] w-[18px] shrink-0 accent-[var(--color-brand)]" />
      <span className="flex-1">{label}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-surface-foreground/40">{count}</span>}
    </label>
  );
}

function Collapsible<T>({ items, render, text }: { items: T[]; render: (item: T) => ReactNode; text: ListingText }) {
  const [open, setOpen] = useState(false);
  const visible = open ? items : items.slice(0, COLLAPSED_COUNT);
  return (
    <>
      {visible.map(render)}
      {items.length > COLLAPSED_COUNT && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 w-fit py-1 text-xs font-medium text-brand underline underline-offset-4">
          {open ? text.showLess : `${text.showMore} (${items.length - COLLAPSED_COUNT})`}
        </button>
      )}
    </>
  );
}

/** Taka in the inputs, poisha in the URL (golden rule 3). */
function PriceFilter({ params, onChange, text }: { params: URLSearchParams; onChange: (next: URLSearchParams) => void; text: ListingText }) {
  const toTaka = (poisha: string | null) => (poisha ? String(Math.round(Number(poisha) / 100)) : "");
  const [min, setMin] = useState(toTaka(params.get("priceMin")));
  const [max, setMax] = useState(toTaka(params.get("priceMax")));

  function commit() {
    const toPoisha = (taka: string) => (/^\d+$/.test(taka.trim()) ? String(Number(taka.trim()) * 100) : null);
    const next = setParam(setParam(params, "priceMin", toPoisha(min)), "priceMax", toPoisha(max));
    if (next.toString() !== params.toString()) onChange(next);
  }

  const input = "min-h-11 w-full rounded-theme border border-border bg-surface px-3 text-sm tabular-nums";
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <label className="flex flex-1 flex-col gap-1 text-xs text-surface-foreground/60">
        {text.priceMin}
        <input inputMode="numeric" pattern="[0-9]*" value={min} onChange={(e) => setMin(e.target.value)} onBlur={commit} className={input} />
      </label>
      <span className="pb-3 text-surface-foreground/40">–</span>
      <label className="flex flex-1 flex-col gap-1 text-xs text-surface-foreground/60">
        {text.priceMax}
        <input inputMode="numeric" pattern="[0-9]*" value={max} onChange={(e) => setMax(e.target.value)} onBlur={commit} className={input} />
      </label>
      <button type="submit" className="sr-only">
        {text.apply}
      </button>
    </form>
  );
}

/**
 * The filter controls, used both in the desktop sidebar (each change applies
 * at once) and in the phone sheet (changes collect into a draft, applied by
 * "Show results"). Controlled: it only reads `params` and reports `onChange`.
 */
export function ListingFilters({
  facets,
  params,
  onChange,
  config,
  showCategories,
  text,
  locale,
}: {
  facets: ListingResult["facets"];
  params: URLSearchParams;
  onChange: (next: URLSearchParams) => void;
  config: ListingConfig;
  showCategories: boolean;
  text: ListingText;
  locale: string;
}) {
  const lang = locale as "bn" | "en";
  const selectedCategories = new Set((params.get("categoryIds") ?? "").split(",").filter(Boolean));
  const categories = showCategories && config.filters.categories ? (facets.categories ?? []).filter((c) => c.depth <= 2) : [];

  return (
    <div className="flex flex-col gap-5">
      {categories.length > 0 && (
        <Section title={text.categories}>
          <Collapsible
            items={categories}
            text={text}
            render={(category) => (
              <CheckRow
                key={category.id}
                checked={selectedCategories.has(category.id)}
                onChange={() => onChange(toggleListValue(params, "categoryIds", category.id))}
                label={t(category.name, lang)}
                count={category.count}
                indent={category.depth}
              />
            )}
          />
        </Section>
      )}

      {(config.filters.onSale || config.filters.inStock) && (
        <div className="flex flex-col gap-1 border-b border-border pb-5">
          {config.filters.onSale && (
            <CheckRow checked={params.get("onSale") === "true"} onChange={() => onChange(setParam(params, "onSale", params.get("onSale") === "true" ? null : "true"))} label={text.onSale} />
          )}
          {config.filters.inStock && (
            <CheckRow checked={params.get("inStockOnly") === "true"} onChange={() => onChange(setParam(params, "inStockOnly", params.get("inStockOnly") === "true" ? null : "true"))} label={text.inStock} />
          )}
        </div>
      )}

      {config.filters.price && facets.priceRange && (
        <Section title={text.price}>
          <PriceFilter key={`${params.get("priceMin")}-${params.get("priceMax")}`} params={params} onChange={onChange} text={text} />
        </Section>
      )}

      {config.filters.attributes &&
        facets.attributes.map((attribute) => {
          const key = `attr_${attribute.attributeId}`;
          const selected = new Set((params.get(key) ?? "").split(",").filter(Boolean));
          return (
            <Section key={attribute.attributeId} title={t(attribute.attributeName, lang)}>
              <Collapsible
                items={attribute.values}
                text={text}
                render={(value) => (
                  <CheckRow key={value.valueId} checked={selected.has(value.valueId)} onChange={() => onChange(toggleListValue(params, key, value.valueId))} label={t(value.label, lang)} count={value.count} />
                )}
              />
            </Section>
          );
        })}
    </div>
  );
}
