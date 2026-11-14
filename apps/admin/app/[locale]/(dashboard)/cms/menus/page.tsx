"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiError } from "../../../../../lib/api";
import { Banner, Button, Card } from "../../../../../components/ui";
import {
  addChild,
  changeType,
  cleanMenu,
  MAX_MENU_DEPTH,
  moveItem,
  newMenuItem,
  pathKey,
  removeItem,
  updateItem,
  validateMenu,
  type ItemPath,
  type MenuItem,
  type MenuItemType,
} from "../../../../../lib/menu-tree";

type Localized = { bn?: string; en?: string };
interface Menu {
  id: string;
  key: string;
  name: string;
  items: MenuItem[];
}
interface TargetOption {
  slug: string;
  label: string;
  name: Localized;
}
interface Targets {
  category: TargetOption[];
  collection: TargetOption[];
  page: TargetOption[];
}

/** The two layout slots the storefront reads (header.tsx / footer.tsx). */
const STANDARD_KEYS = ["header", "footer"] as const;
const TYPES: MenuItemType[] = ["category", "collection", "page", "product", "url"];

function pick(value: Localized | undefined, locale: string): string {
  if (!value) return "";
  return (locale === "en" ? value.en || value.bn : value.bn || value.en) ?? "";
}

const inputClass = "w-full rounded-theme border border-border bg-surface px-2 py-1.5 text-sm text-surface-foreground outline-none focus:border-brand";

/** Product targets are searched on demand (the catalog can be large); the other target types are loaded once. */
function ProductPicker({ value, onPick, locale, placeholder, emptyText }: { value?: string; onPick: (option: TargetOption) => void; locale: string; placeholder: string; emptyText: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TargetOption[] | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => {
      void api
        .get<{ data: { slug: string; title: Localized }[] }>(`/admin/products?q=${encodeURIComponent(query.trim())}&pageSize=10`)
        .then((r) => setResults(r.data.map((p) => ({ slug: p.slug, name: p.title, label: pick(p.title, locale) || p.slug }))))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, locale]);

  return (
    <div className="relative">
      <input className={inputClass} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={value ? `${placeholder} (${value})` : placeholder} aria-label={placeholder} />
      {results && query.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-theme border border-border bg-surface shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-xs text-surface-foreground/60">{emptyText}</li>}
          {results.map((option) => (
            <li key={option.slug}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onPick(option);
                  setQuery("");
                  setResults(null);
                }}
              >
                {option.label} <span className="text-xs text-surface-foreground/50">/{option.slug}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ItemEditorProps {
  item: MenuItem;
  path: ItemPath;
  siblings: number;
  targets: Targets;
  issues: Map<string, string[]>;
  locale: string;
  onChange: (path: ItemPath, patch: Partial<MenuItem>) => void;
  onType: (path: ItemPath, type: MenuItemType) => void;
  onMove: (path: ItemPath, direction: -1 | 1) => void;
  onRemove: (path: ItemPath) => void;
  onAddChild: (path: ItemPath) => void;
}

function ItemEditor({ item, path, siblings, targets, issues, locale, onChange, onType, onMove, onRemove, onAddChild }: ItemEditorProps) {
  const t = useTranslations("menus");
  const index = path[path.length - 1]!;
  const problems = issues.get(pathKey(path)) ?? [];

  function pickTarget(option: TargetOption) {
    // Fill empty labels from the target's own name — the common case needs no typing.
    onChange(path, { targetId: option.slug, label: { bn: item.label.bn || option.name.bn, en: item.label.en || option.name.en } });
  }

  const options = item.type === "category" || item.type === "collection" || item.type === "page" ? targets[item.type] : [];

  return (
    <li className={`rounded-theme border ${problems.length > 0 ? "border-danger" : "border-border"} bg-surface`}>
      <div className="flex flex-col gap-3 p-3">
        <div className="grid gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))_9rem_minmax(0,1.4fr)]">
          <label className="flex flex-col gap-1 text-xs font-medium text-surface-foreground/70">
            {t("labelBn")}
            <input className={inputClass} value={item.label.bn ?? ""} onChange={(e) => onChange(path, { label: { ...item.label, bn: e.target.value } })} lang="bn" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-surface-foreground/70">
            {t("labelEn")}
            <input className={inputClass} value={item.label.en ?? ""} onChange={(e) => onChange(path, { label: { ...item.label, en: e.target.value } })} lang="en" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-surface-foreground/70">
            {t("linkType")}
            <select className={inputClass} value={item.type} onChange={(e) => onType(path, e.target.value as MenuItemType)}>
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`type_${type}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-xs font-medium text-surface-foreground/70">
            <span>{item.type === "url" ? t("url") : t("target")}</span>
            {item.type === "url" ? (
              <input className={inputClass} value={item.url ?? ""} onChange={(e) => onChange(path, { url: e.target.value })} placeholder={t("urlPlaceholder")} aria-label={t("url")} />
            ) : item.type === "product" ? (
              <ProductPicker value={item.targetId} onPick={pickTarget} locale={locale} placeholder={t("searchProduct")} emptyText={t("noResults")} />
            ) : (
              <select
                className={inputClass}
                aria-label={t("target")}
                value={item.targetId ?? ""}
                onChange={(e) => {
                  const option = options.find((o) => o.slug === e.target.value);
                  if (option) pickTarget(option);
                  else onChange(path, { targetId: undefined });
                }}
              >
                <option value="">{t("noTarget")}</option>
                {item.targetId && !options.some((o) => o.slug === item.targetId) && <option value={item.targetId}>{t("missingTarget", { slug: item.targetId })}</option>}
                {options.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {problems.length > 0 && <p className="text-xs text-danger">{problems.join(" · ")}</p>}

        <div className="flex flex-wrap items-center gap-1 text-xs">
          <button type="button" className="rounded-theme px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={index === 0} onClick={() => onMove(path, -1)} aria-label={t("moveUp")}>
            ↑ {t("moveUp")}
          </button>
          <button type="button" className="rounded-theme px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={index === siblings - 1} onClick={() => onMove(path, 1)} aria-label={t("moveDown")}>
            ↓ {t("moveDown")}
          </button>
          {path.length < MAX_MENU_DEPTH && (
            <button type="button" className="rounded-theme px-2 py-1 text-brand hover:bg-muted" onClick={() => onAddChild(path)}>
              + {t("addChild")}
            </button>
          )}
          <button type="button" className="ml-auto rounded-theme px-2 py-1 text-danger hover:bg-muted" onClick={() => onRemove(path)}>
            {t("remove")}
          </button>
        </div>
      </div>

      {item.children && item.children.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-border bg-muted/40 p-3 pl-6">
          {item.children.map((child, childIndex) => (
            <ItemEditor
              key={child.id}
              item={child}
              path={[...path, childIndex]}
              siblings={item.children!.length}
              targets={targets}
              issues={issues}
              locale={locale}
              onChange={onChange}
              onType={onType}
              onMove={onMove}
              onRemove={onRemove}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** §9.3 menus: the storefront's header (navbar + mobile drawer) and footer are built from the "header" and "footer" menus edited here. */
export default function MenusPage() {
  const t = useTranslations("menus");
  const locale = useLocale();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("header");
  const [draft, setDraft] = useState<MenuItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [targets, setTargets] = useState<Targets>({ category: [], collection: [], page: [] });
  const [showIssues, setShowIssues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadMenus = useCallback(async () => {
    try {
      const list = await api.get<Menu[]>("/admin/cms/menus");
      setMenus(list);
      return list;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("loadFailed"));
      return [];
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    void loadMenus().then((list) => setDraft(list.find((m) => m.key === "header")?.items ?? []));
    void Promise.all([
      api.get<{ slug: string; name: Localized; parentId: string | null; id: string }[]>("/admin/categories").catch(() => []),
      api.get<{ slug: string; name: Localized }[]>("/admin/collections").catch(() => []),
      api.get<{ slug: string; title: string }[]>("/admin/cms/pages").catch(() => []),
    ]).then(([categories, collections, pages]) => {
      // Categories show their full path ("Men › Panjabi") so same-named children are distinguishable.
      const byId = new Map(categories.map((c) => [c.id, c]));
      const pathOf = (c: (typeof categories)[number]): string => {
        const names: string[] = [];
        let current: (typeof categories)[number] | undefined = c;
        for (let guard = 0; current && guard < 6; guard += 1) {
          names.unshift(pick(current.name, locale) || current.slug);
          current = current.parentId ? byId.get(current.parentId) : undefined;
        }
        return names.join(" › ");
      };
      setTargets({
        category: categories.map((c) => ({ slug: c.slug, name: c.name, label: pathOf(c) })).sort((a, b) => a.label.localeCompare(b.label)),
        collection: collections.map((c) => ({ slug: c.slug, name: c.name, label: pick(c.name, locale) || c.slug })),
        page: pages.map((p) => ({ slug: p.slug, name: { bn: p.title, en: p.title }, label: `${p.title} (/${p.slug})` })),
      });
    });
  }, [loadMenus, locale]);

  const selected = menus.find((m) => m.key === selectedKey) ?? null;

  function selectMenu(key: string) {
    if (dirty && !window.confirm(t("discardChanges"))) return;
    setSelectedKey(key);
    setDraft(menus.find((m) => m.key === key)?.items ?? []);
    setDirty(false);
    setShowIssues(false);
    setNotice(null);
  }

  const edit = (next: MenuItem[]) => {
    setDraft(next);
    setDirty(true);
    setNotice(null);
  };

  const issues = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!showIssues) return map;
    for (const issue of validateMenu(draft)) {
      const key = pathKey(issue.path);
      map.set(key, [...(map.get(key) ?? []), t(`issue_${issue.problem}`)]);
    }
    return map;
  }, [draft, showIssues, t]);

  async function createMenu(key: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post("/admin/cms/menus", { key, name: t(`name_${key}`), items: [] });
      await loadMenus();
      setSelectedKey(key);
      setDraft([]);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!selected) return;
    setShowIssues(true);
    if (validateMenu(draft).length > 0) {
      setError(t("fixIssues"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const items = cleanMenu(draft);
      await api.patch(`/admin/cms/menus/${selected.id}`, { items });
      await loadMenus();
      setDraft(items);
      setDirty(false);
      setShowIssues(false);
      setNotice(t("saved"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const otherKeys = menus.map((m) => m.key).filter((key) => !STANDARD_KEYS.includes(key as (typeof STANDARD_KEYS)[number]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-surface-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-surface-foreground/70">{t("subtitle")}</p>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <div className="flex flex-wrap gap-2" role="tablist">
        {[...STANDARD_KEYS, ...otherKeys].map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selectedKey === key}
            onClick={() => selectMenu(key)}
            className={`rounded-theme px-4 py-2 text-sm font-medium ${selectedKey === key ? "bg-brand text-brand-foreground" : "bg-muted text-surface-foreground"}`}
          >
            {STANDARD_KEYS.includes(key as (typeof STANDARD_KEYS)[number]) ? t(`name_${key}`) : key}
          </button>
        ))}
      </div>

      <Card className="flex flex-col gap-4">
        {STANDARD_KEYS.includes(selectedKey as (typeof STANDARD_KEYS)[number]) && <p className="text-sm text-surface-foreground/70">{t(`help_${selectedKey}`)}</p>}

        {!selected ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-surface-foreground/70">{t("notCreated")}</p>
            <Button disabled={busy} onClick={() => void createMenu(selectedKey)}>
              {t("create", { name: t(`name_${selectedKey}`) })}
            </Button>
          </div>
        ) : (
          <>
            {draft.length === 0 && <p className="text-sm text-surface-foreground/60">{t("empty")}</p>}
            <ul className="flex flex-col gap-3">
              {draft.map((item, index) => (
                <ItemEditor
                  key={item.id}
                  item={item}
                  path={[index]}
                  siblings={draft.length}
                  targets={targets}
                  issues={issues}
                  locale={locale}
                  onChange={(path, patch) => edit(updateItem(draft, path, patch))}
                  onType={(path, type) => edit(changeType(draft, path, type))}
                  onMove={(path, direction) => edit(moveItem(draft, path, direction))}
                  onRemove={(path) => edit(removeItem(draft, path))}
                  onAddChild={(path) => edit(addChild(draft, path))}
                />
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button variant="secondary" onClick={() => edit([...draft, newMenuItem()])}>
                + {t("addItem")}
              </Button>
              <Button disabled={busy || !dirty} onClick={() => void save()}>
                {t("save")}
              </Button>
              {dirty && <span className="text-xs text-warning">{t("unsaved")}</span>}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
