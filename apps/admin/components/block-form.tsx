"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "../lib/api";
import { localized, type Localized } from "../lib/format";
import type { BlockField } from "../lib/block-fields";
import { MediaPickerField } from "./media-picker";
import { Button } from "./ui";

type Props = Record<string, unknown>;

const inputClass = "w-full rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground outline-none focus:border-brand";

/* ---------- lookups shared by every picker on the page (fetched once) ---------- */

interface CategoryOption { id: string; name: Localized; parentId: string | null }
interface CollectionOption { id: string; name: Localized }
interface ProductOption { id: string; title: Localized; slug: string }

let categoriesPromise: Promise<CategoryOption[]> | null = null;
let collectionsPromise: Promise<CollectionOption[]> | null = null;
const productCache = new Map<string, Promise<ProductOption | null>>();

const loadCategories = () => (categoriesPromise ??= api.get<CategoryOption[]>("/admin/lookups/categories").catch(() => []));
const loadCollections = () => (collectionsPromise ??= api.get<CollectionOption[]>("/admin/collections").catch(() => []));
function loadProduct(id: string): Promise<ProductOption | null> {
  if (!productCache.has(id)) productCache.set(id, api.get<ProductOption>(`/admin/products/${id}`).catch(() => null));
  return productCache.get(id)!;
}

function useAsync<T>(load: () => Promise<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    void load().then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
  }, [load]);
  return value;
}

/** "Men › Panjabi" style names so same-named subcategories can be told apart. */
function categoryPaths(categories: CategoryOption[], locale: string): { id: string; label: string }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path = (c: CategoryOption): string => {
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    const own = localized(c.name, locale);
    return parent ? `${path(parent)} › ${own}` : own;
  };
  return categories.map((c) => ({ id: c.id, label: path(c) })).sort((a, b) => a.label.localeCompare(b.label));
}

/* ---------- individual inputs ---------- */

function FieldShell({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-surface-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-surface-foreground/60">{hint}</span>}
    </div>
  );
}

function LocalizedInput({ value, onChange, multiline }: { value: Localized | undefined; onChange: (v: Localized) => void; multiline: boolean }) {
  const t = useTranslations("blocks");
  const v = value ?? {};
  const field = (lang: "bn" | "en") =>
    multiline ? (
      <textarea className={`${inputClass} min-h-24`} value={v[lang] ?? ""} onChange={(e) => onChange({ ...v, [lang]: e.target.value })} />
    ) : (
      <input className={inputClass} value={v[lang] ?? ""} onChange={(e) => onChange({ ...v, [lang]: e.target.value })} />
    );
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-surface-foreground/60">{t("bangla")}</span>
        {field("bn")}
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-surface-foreground/60">{t("english")}</span>
        {field("en")}
      </label>
    </div>
  );
}

function Chips({ items, onRemove }: { items: { id: string; label: string }[]; onRemove: (id: string) => void }) {
  const t = useTranslations("blocks");
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-surface-foreground">
          {item.label}
          <button type="button" aria-label={`${t("remove")} ${item.label}`} onClick={() => onRemove(item.id)} className="text-surface-foreground/60 hover:text-danger">
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function CategorySelect({ value, onChange, multiple }: { value: string | string[] | undefined; onChange: (v: string | string[] | undefined) => void; multiple: boolean }) {
  const t = useTranslations("blocks");
  const locale = useLocale();
  const categories = useAsync(loadCategories, [] as CategoryOption[]);
  const options = useMemo(() => categoryPaths(categories, locale), [categories, locale]);
  const label = (id: string) => options.find((o) => o.id === id)?.label ?? t("missingItem");

  if (!multiple) {
    return (
      <select className={inputClass} value={(value as string | undefined) ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{t("chooseCategory")}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    );
  }
  const ids = (value as string[] | undefined) ?? [];
  return (
    <div className="flex flex-col gap-2">
      <Chips items={ids.map((id) => ({ id, label: label(id) }))} onRemove={(id) => onChange(ids.filter((x) => x !== id))} />
      <select className={inputClass} value="" onChange={(e) => e.target.value && onChange([...ids, e.target.value])}>
        <option value="">{t("addCategory")}</option>
        {options.filter((o) => !ids.includes(o.id)).map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function CollectionSelect({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const t = useTranslations("blocks");
  const locale = useLocale();
  const collections = useAsync(loadCollections, [] as CollectionOption[]);
  return (
    <select className={inputClass} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      <option value="">{collections.length === 0 ? t("noCollections") : t("chooseCollection")}</option>
      {collections.map((c) => (
        <option key={c.id} value={c.id}>{localized(c.name, locale)}</option>
      ))}
    </select>
  );
}

function useProductNames(ids: string[]): Map<string, string> {
  const locale = useLocale();
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const key = ids.join(",");
  useEffect(() => {
    let alive = true;
    void Promise.all(ids.map(async (id) => [id, await loadProduct(id)] as const)).then((rows) => {
      if (!alive) return;
      setNames(new Map(rows.map(([id, p]) => [id, p ? localized(p.title, locale) || p.slug : ""])));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the stable form of `ids`
  }, [key, locale]);
  return names;
}

function ProductSearch({ onPick, exclude }: { onPick: (p: ProductOption) => void; exclude: string[] }) {
  const t = useTranslations("blocks");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProductOption[]>([]);
  const searching = q.trim().length >= 2;
  useEffect(() => {
    if (q.trim().length < 2) return;
    const handle = setTimeout(() => {
      void api
        .get<{ data: ProductOption[] }>(`/admin/products?q=${encodeURIComponent(q.trim())}&pageSize=10`)
        .then((r) => setResults(r.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);
  return (
    <div className="flex flex-col gap-1">
      <input className={inputClass} value={q} placeholder={t("searchProduct")} onChange={(e) => setQ(e.target.value)} />
      {searching && results.length > 0 && (
        <ul className="max-h-48 overflow-y-auto rounded-theme border border-border">
          {results.filter((p) => !exclude.includes(p.id)).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  productCache.set(p.id, Promise.resolve(p));
                  onPick(p);
                  setQ("");
                  setResults([]);
                }}
              >
                {localized(p.title, locale) || p.slug}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && results.length === 0 && <span className="text-xs text-surface-foreground/60">{t("noResults")}</span>}
    </div>
  );
}

function ProductsInput({ value, onChange }: { value: string[] | undefined; onChange: (v: string[]) => void }) {
  const t = useTranslations("blocks");
  const ids = value ?? [];
  const names = useProductNames(ids);
  return (
    <div className="flex flex-col gap-2">
      <Chips items={ids.map((id) => ({ id, label: names.get(id) || t("missingItem") }))} onRemove={(id) => onChange(ids.filter((x) => x !== id))} />
      <ProductSearch exclude={ids} onPick={(p) => onChange([...ids, p.id])} />
    </div>
  );
}

function ProductInput({ value, onChange }: { value: string | undefined; onChange: (v: string) => void }) {
  const t = useTranslations("blocks");
  const names = useProductNames(value ? [value] : []);
  return (
    <div className="flex flex-col gap-2">
      {value && <span className="text-sm text-surface-foreground">{names.get(value) || t("missingItem")}</span>}
      <ProductSearch exclude={value ? [value] : []} onPick={(p) => onChange(p.id)} />
    </div>
  );
}

/* ---------- the form ---------- */

function FieldInput({ field, props, onChange }: { field: BlockField; props: Props; onChange: (next: Props) => void }) {
  const t = useTranslations("blocks");
  const value = props[field.key];
  const set = (v: unknown) => {
    const next: Props = { ...props, [field.key]: v };
    for (const key of field.clears ?? []) delete next[key];
    onChange(next);
  };
  const labelKey = field.key === "sourceId" ? `sourceId_${field.kind}` : field.key;
  const label = t(`fields.${labelKey}`);
  const hint = field.hint ? t(`hints.${field.hint}`) : undefined;

  switch (field.kind) {
    case "localizedText":
    case "localizedTextarea":
      return (
        <FieldShell label={label} hint={hint}>
          <LocalizedInput value={value as Localized | undefined} onChange={set} multiline={field.kind === "localizedTextarea"} />
        </FieldShell>
      );
    case "link":
      return (
        <FieldShell label={label} hint={hint ?? t("hints.link")}>
          <input className={inputClass} value={(value as string | undefined) ?? ""} placeholder="/collections/eid" onChange={(e) => set(e.target.value || undefined)} />
        </FieldShell>
      );
    case "text":
      return (
        <FieldShell label={label} hint={hint}>
          <input className={inputClass} value={(value as string | undefined) ?? ""} onChange={(e) => set(e.target.value || undefined)} />
        </FieldShell>
      );
    case "image":
      return <MediaPickerField label={label} hint={hint} value={value as string | null | undefined} onChange={set} />;
    case "select":
      return (
        <FieldShell label={label} hint={hint}>
          <select className={inputClass} value={(value as string | undefined) ?? field.options[0]} onChange={(e) => set(e.target.value)}>
            {field.options.map((o) => (
              <option key={o} value={o}>{t(`options.${o}`)}</option>
            ))}
          </select>
        </FieldShell>
      );
    case "number":
      return (
        <FieldShell label={label} hint={hint}>
          <input
            type="number"
            className={inputClass}
            min={field.min}
            max={field.max}
            value={(value as number | undefined) ?? ""}
            onChange={(e) => set(e.target.value === "" ? undefined : Math.min(field.max, Math.max(field.min, Math.round(Number(e.target.value)))))}
          />
        </FieldShell>
      );
    case "categories":
    case "category":
      return (
        <FieldShell label={label} hint={hint}>
          <CategorySelect value={value as string | string[] | undefined} onChange={set} multiple={field.kind === "categories"} />
        </FieldShell>
      );
    case "collection":
      return (
        <FieldShell label={label} hint={hint}>
          <CollectionSelect value={value as string | undefined} onChange={set} />
        </FieldShell>
      );
    case "products":
      return (
        <FieldShell label={label} hint={hint}>
          <ProductsInput value={value as string[] | undefined} onChange={set} />
        </FieldShell>
      );
    case "product":
      return (
        <FieldShell label={label} hint={hint}>
          <ProductInput value={value as string | undefined} onChange={set} />
        </FieldShell>
      );
    case "html":
      return (
        <FieldShell label={label} hint={hint}>
          <textarea className={`${inputClass} min-h-40 font-mono text-xs`} value={(value as string | undefined) ?? ""} onChange={(e) => set(e.target.value)} />
        </FieldShell>
      );
    case "list": {
      const items = (value as Props[] | undefined) ?? [];
      const setItem = (i: number, next: Props) => set(items.map((it, j) => (j === i ? next : it)));
      const move = (i: number, dir: -1 | 1) => {
        const target = i + dir;
        if (target < 0 || target >= items.length) return;
        const next = [...items];
        [next[i], next[target]] = [next[target]!, next[i]!];
        set(next);
      };
      return (
        <FieldShell label={label} hint={hint}>
          <div className="flex flex-col gap-3">
            {items.map((item, i) => (
              <div key={(item.id as string | undefined) ?? i} className="flex flex-col gap-3 rounded-theme border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-surface-foreground/60">
                    {t(`items.${field.itemLabel}`)} {i + 1}
                  </span>
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t("moveUp")} className="disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={t("moveDown")} className="disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => set(items.filter((_, j) => j !== i))} className="text-danger">{t("remove")}</button>
                  </div>
                </div>
                <BlockFieldsForm fields={field.itemFields} props={item} onChange={(next) => setItem(i, next)} />
              </div>
            ))}
            <div>
              <Button type="button" variant="secondary" onClick={() => set([...items, field.newItem()])} disabled={field.max !== undefined && items.length >= field.max}>
                + {t(`items.add_${field.itemLabel}`)}
              </Button>
              {field.max !== undefined && <span className="ml-2 text-xs text-surface-foreground/60">{t("maxItems", { max: field.max })}</span>}
            </div>
          </div>
        </FieldShell>
      );
    }
  }
}

export function BlockFieldsForm({ fields, props, onChange }: { fields: BlockField[]; props: Props; onChange: (next: Props) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {fields
        .filter((field) => !field.showIf || field.showIf(props))
        .map((field) => (
          <FieldInput key={`${field.key}-${field.kind}`} field={field} props={props} onChange={onChange} />
        ))}
    </div>
  );
}
