"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { t } from "@clothing/shared";
import { Link, usePathname, useRouter } from "../i18n/navigation";
import { formatBdt } from "../lib/money";
import { buildListingQuery, clearFilters, countActiveFilters, setParam, toggleListValue, type ListingSortValue } from "../lib/listing-params";
import { format, LISTING_VIEW_VALUES, type ListingConfig, type ListingText, type ListingView } from "../lib/listing-config";
import type { ListingParams, ListingResult, ProductCard as ProductCardData } from "../lib/store-api";
import { CloseIcon, SearchIcon } from "./icons";
import { ListingFilters } from "./listing-filters";
import { ProductCard } from "./product-card";
import { ProductListRow } from "./product-list-row";

const VIEW_STORAGE_KEY = "listing-view";

const GRID_CLASS: Record<ListingView, string> = {
  large: "grid grid-cols-1 gap-y-10 sm:grid-cols-2 sm:gap-x-5",
  grid: "grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-3 xl:grid-cols-4",
  list: "grid grid-cols-1 gap-4 xl:grid-cols-2 xl:gap-x-8",
};

function ViewIcon({ view }: { view: ListingView }) {
  const common = { "aria-hidden": true, viewBox: "0 0 20 20", className: "h-5 w-5", fill: "currentColor" } as const;
  if (view === "large") return <svg {...common}><rect x="4" y="3" width="12" height="14" rx="1.5" /></svg>;
  if (view === "grid")
    return (
      <svg {...common}>
        <rect x="3" y="3" width="6" height="6" rx="1" />
        <rect x="11" y="3" width="6" height="6" rx="1" />
        <rect x="3" y="11" width="6" height="6" rx="1" />
        <rect x="11" y="11" width="6" height="6" rx="1" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3" y="3.5" width="5" height="5" rx="1" />
      <rect x="10" y="5" width="7" height="2" rx="1" />
      <rect x="3" y="11.5" width="5" height="5" rx="1" />
      <rect x="10" y="13" width="7" height="2" rx="1" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
}

interface Chip {
  key: string;
  label: string;
  remove: (params: URLSearchParams) => URLSearchParams;
}

/** Every active filter as a removable chip, labelled from the facets. */
function buildChips(params: URLSearchParams, facets: ListingResult["facets"], text: ListingText, lang: "bn" | "en"): Chip[] {
  const chips: Chip[] = [];
  const q = params.get("q");
  if (q) chips.push({ key: "q", label: `“${q}”`, remove: (p) => setParam(p, "q", null) });
  for (const id of (params.get("categoryIds") ?? "").split(",").filter(Boolean)) {
    const category = facets.categories?.find((c) => c.id === id);
    if (category) chips.push({ key: `cat-${id}`, label: t(category.name, lang), remove: (p) => toggleListValue(p, "categoryIds", id) });
  }
  for (const [key, value] of params) {
    if (!key.startsWith("attr_")) continue;
    const attribute = facets.attributes.find((a) => a.attributeId === key.slice(5));
    for (const id of value.split(",").filter(Boolean)) {
      const facetValue = attribute?.values.find((v) => v.valueId === id);
      if (facetValue) chips.push({ key: `${key}-${id}`, label: t(facetValue.label, lang), remove: (p) => toggleListValue(p, key, id) });
    }
  }
  const min = params.get("priceMin");
  const max = params.get("priceMax");
  if (min || max) {
    chips.push({ key: "price", label: `${min ? formatBdt(Number(min)) : "৳0"} – ${max ? formatBdt(Number(max)) : "…"}`, remove: (p) => setParam(setParam(p, "priceMin", null), "priceMax", null) });
  }
  if (params.get("onSale") === "true") chips.push({ key: "onSale", label: text.onSale, remove: (p) => setParam(p, "onSale", null) });
  if (params.get("inStockOnly") === "true") chips.push({ key: "inStock", label: text.inStock, remove: (p) => setParam(p, "inStockOnly", null) });
  return chips;
}

function readStoredView(): ListingView | null {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return LISTING_VIEW_VALUES.includes(stored as ListingView) ? (stored as ListingView) : null;
  } catch {
    return null;
  }
}

export interface ListingBrowserProps {
  initial: ListingResult;
  /** Everything the server asked the API for (scope, filters, page, page size) — "Load more" asks for the next page of the same. */
  query: ListingParams;
  config: ListingConfig;
  /** Category filter and search box — on `/shop` only. */
  showCategories: boolean;
  searchBox: boolean;
  text: ListingText;
  locale: string;
}

/**
 * The interactive part of every listing page (`/shop`, categories,
 * collections): search, sort, filters (sidebar on desktop, bottom sheet on
 * phones), removable filter chips, the large/grid/list view switch and
 * "Load more". Every filter, the sort and the page live in the URL, so
 * results are shareable and the back button works; the first page is
 * server-rendered. The view is the shopper's own choice, kept in this
 * browser.
 */
export function ListingBrowser({ initial, query, config, showCategories, searchBox, text, locale }: ListingBrowserProps) {
  const lang = locale as "bn" | "en";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);
  const [navigating, startNavigation] = useTransition();

  const [items, setItems] = useState<ProductCardData[]>(initial.data);
  const startPage = initial.meta.page;
  const [lastPage, setLastPage] = useState(initial.meta.page);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState<ListingView>(config.defaultView);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<URLSearchParams>(params);
  const [searchText, setSearchText] = useState(params.get("q") ?? "");

  useEffect(() => {
    if (!config.viewSwitcher) return;
    const stored = readStoredView();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the shopper's saved view lives in localStorage, readable only after mount
    if (stored) setView(stored);
  }, [config.viewSwitcher]);

  useEffect(() => {
    if (!sheetOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  function navigate(next: URLSearchParams) {
    const qs = next.toString();
    startNavigation(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  function chooseView(next: ListingView) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Storage blocked — the choice still holds for this page view.
    }
  }

  async function loadMore() {
    const nextPage = lastPage + 1;
    setLoadingMore(true);
    setLoadError(false);
    try {
      const qs = buildListingQuery({ ...query, page: nextPage }).toString();
      const response = await fetch(`/api/v1/store/catalog/listing?${qs}`, { credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      const result = (await response.json()) as ListingResult;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...result.data.filter((p) => !seen.has(p.id))];
      });
      setLastPage(nextPage);
      // Keep the URL on the furthest page loaded, without a server round trip.
      const url = new URL(window.location.href);
      url.searchParams.set("page", String(nextPage));
      window.history.replaceState(window.history.state, "", url);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const total = initial.meta.total;
  const pageSize = initial.meta.pageSize;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const shownThrough = Math.min(total, lastPage * pageSize);
  const hasMore = lastPage < pageCount;
  const activeCount = countActiveFilters(params);
  const chips = buildChips(params, initial.facets, text, lang);
  const searching = !!params.get("q");
  const currentSort = query.sort ?? config.defaultSort;

  const sortOptions: { value: ListingSortValue; label: string }[] = [
    { value: "relevance", label: searching ? text.sortBestMatch : text.sortRelevance },
    { value: "newest", label: text.sortNewest },
    { value: "bestselling", label: text.sortBestselling },
    { value: "price_asc", label: text.sortPriceAsc },
    { value: "price_desc", label: text.sortPriceDesc },
  ];

  const pageHref = (page: number) => {
    const next = new URLSearchParams(params);
    if (page <= 1) next.delete("page");
    else next.set("page", String(page));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const filters = (current: URLSearchParams, onChange: (next: URLSearchParams) => void) => (
    <ListingFilters facets={initial.facets} params={current} onChange={onChange} config={config} showCategories={showCategories} text={text} locale={locale} />
  );

  const hasFilters = (showCategories && config.filters.categories && (initial.facets.categories?.length ?? 0) > 0) || config.filters.onSale || config.filters.inStock || (config.filters.price && !!initial.facets.priceRange) || (config.filters.attributes && initial.facets.attributes.length > 0);

  return (
    <div className="flex flex-col gap-5">
      {searchBox && (
        <form
          role="search"
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(setParam(params, "q", searchText.trim() || null));
          }}
        >
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-surface-foreground/40" />
          <input
            type="search"
            enterKeyHint="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder={text.searchPlaceholder}
            aria-label={text.search}
            maxLength={100}
            className="min-h-12 w-full rounded-theme border border-border bg-surface pl-11 pr-24 text-[15px] [&::-webkit-search-cancel-button]:hidden"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => {
                setSearchText("");
                if (params.get("q")) navigate(setParam(params, "q", null));
              }}
              aria-label={text.clearSearch}
              className="absolute right-[4.75rem] top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-surface-foreground/50"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
          <button type="submit" className="absolute right-1.5 top-1/2 min-h-9 -translate-y-1/2 rounded-theme bg-brand px-4 text-sm font-medium text-brand-foreground">
            {text.search}
          </button>
        </form>
      )}

      <div className="flex gap-8">
        {hasFilters && (
          <aside className="hidden w-60 shrink-0 lg:block" aria-label={text.filters}>
            {filters(params, navigate)}
          </aside>
        )}

        <div className={`flex min-w-0 flex-1 flex-col gap-4 transition-opacity ${navigating ? "opacity-60" : ""}`} aria-busy={navigating}>
          <div className="flex items-center gap-2">
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setDraft(new URLSearchParams(params));
                  setSheetOpen(true);
                }}
                className="flex min-h-11 items-center gap-2 rounded-theme border border-border px-3.5 text-sm font-medium text-surface-foreground lg:hidden"
              >
                <FilterIcon />
                {text.filter}
                {activeCount > 0 && <span className="min-w-5 rounded-full bg-brand px-1.5 text-center text-xs leading-5 text-brand-foreground">{activeCount}</span>}
              </button>
            )}
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-theme sm:flex-none border border-border pl-3.5 text-sm text-surface-foreground">
              <span className="sr-only sm:not-sr-only sm:text-surface-foreground/60">{text.sort}</span>
              <select value={currentSort} onChange={(e) => navigate(setParam(params, "sort", e.target.value === config.defaultSort ? null : e.target.value))} className="min-h-11 min-w-0 flex-1 bg-transparent pr-3 font-medium focus:outline-none">
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-surface-foreground/60">{format(text.productCount, { count: total })}</p>
            {config.viewSwitcher && (
              <div role="group" aria-label={text.view} className="flex shrink-0 rounded-theme border border-border">
                {LISTING_VIEW_VALUES.map((value) => {
                  const label = value === "large" ? text.viewLarge : value === "grid" ? text.viewGrid : text.viewList;
                  return (
                    <button key={value} type="button" onClick={() => chooseView(value)} aria-pressed={view === value} aria-label={label} title={label} className={`flex h-10 w-10 items-center justify-center ${view === value ? "text-surface-foreground" : "text-surface-foreground/35 hover:text-surface-foreground/70"}`}>
                      <ViewIcon view={value} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <button key={chip.key} type="button" onClick={() => navigate(chip.remove(params))} aria-label={`${text.removeFilter}: ${chip.label}`} className="flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-sm text-surface-foreground hover:bg-surface-foreground/10">
                  {chip.label}
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              ))}
              <button type="button" onClick={() => { setSearchText(""); navigate(clearFilters(params)); }} className="min-h-9 px-2 text-sm text-surface-foreground/70 underline underline-offset-4">
                {text.clearAll}
              </button>
            </div>
          )}

          {startPage > 1 && (
            <Link href={pageHref(startPage - 1)} className="self-center rounded-theme border border-border px-4 py-2.5 text-sm text-surface-foreground">
              {text.showEarlier}
            </Link>
          )}

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="text-base font-medium text-surface-foreground">{text.noResults}</p>
              <p className="text-sm text-surface-foreground/60">{text.noResultsHint}</p>
            </div>
          ) : (
            <div className={GRID_CLASS[view]}>
              {items.map((product) =>
                view === "list" ? <ProductListRow key={product.id} product={product} locale={locale} /> : <ProductCard key={product.id} product={product} locale={locale} />,
              )}
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-6 flex flex-col items-center gap-3">
              <p className="text-sm text-surface-foreground/60">{format(text.showing, { shown: shownThrough, total })}</p>
              {total > 0 && <div className="h-1 w-48 overflow-hidden rounded-full bg-muted"><div className="h-full bg-brand" style={{ width: `${Math.min(100, (shownThrough / total) * 100)}%` }} /></div>}
              {hasMore && (
                <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-2 min-h-12 min-w-48 rounded-theme border border-surface-foreground px-8 text-sm font-medium text-surface-foreground hover:bg-surface-foreground hover:text-surface disabled:opacity-60">
                  {loadingMore ? text.loading : text.loadMore}
                </button>
              )}
              {loadError && <p role="alert" className="text-sm text-danger">{text.loadFailed}</p>}
              {/* Plain page links so search engines (and shoppers without JS) can reach every page. */}
              <nav aria-label={`${text.previousPage} / ${text.nextPage}`} className="flex gap-4 text-xs text-surface-foreground/50">
                {startPage > 1 && <Link href={pageHref(startPage - 1)} className="underline underline-offset-4">{text.previousPage}</Link>}
                {hasMore && <Link href={pageHref(lastPage + 1)} className="underline underline-offset-4">{text.nextPage}</Link>}
              </nav>
            </div>
          )}
        </div>
      </div>

      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 lg:hidden" onClick={() => setSheetOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={text.filters} onClick={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full flex-col rounded-t-2xl bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold text-surface-foreground">{text.filters}</h2>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label={text.close} className="-mr-2 flex h-11 w-11 items-center justify-center text-surface-foreground/60">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{filters(draft, setDraft)}</div>
            <div className="flex gap-3 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => setDraft(clearFilters(draft))} className="min-h-12 flex-1 rounded-theme border border-border text-sm font-medium text-surface-foreground">
                {text.clearAll}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSheetOpen(false);
                  if (draft.toString() !== params.toString()) navigate(draft);
                }}
                className="min-h-12 flex-[2] rounded-theme bg-brand text-sm font-medium text-brand-foreground"
              >
                {text.apply}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
