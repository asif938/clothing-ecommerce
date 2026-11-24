import type { ListingParams } from "./store-api";

type RawSearchParams = Record<string, string | string[] | undefined>;

export const LISTING_SORT_VALUES = ["relevance", "newest", "bestselling", "price_asc", "price_desc"] as const;
export type ListingSortValue = (typeof LISTING_SORT_VALUES)[number];

/** URL params that are listing state (everything else, e.g. utm_*, is passed through untouched). */
const FILTER_KEYS = ["q", "categoryIds", "priceMin", "priceMax", "inStockOnly", "onSale"] as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isSort(value: string | undefined): value is ListingSortValue {
  return LISTING_SORT_VALUES.includes(value as ListingSortValue);
}

function nonNegativeInt(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * Shared by `/shop`, `/c/[...slug]` and `/collections/[slug]` — turns Next's
 * raw `searchParams` into a typed `ListingParams` (for the API call) and a
 * `URLSearchParams` (for links that keep every other param). `priceMin` /
 * `priceMax` are poisha (golden rule 3). An unknown or missing `sort` falls
 * back to the admin's default sort.
 */
export function parseListingSearchParams(
  raw: RawSearchParams,
  defaultSort: ListingSortValue = "relevance",
): { params: Omit<ListingParams, "categoryId" | "collectionId" | "tag" | "pageSize">; urlSearchParams: URLSearchParams } {
  const urlSearchParams = new URLSearchParams();
  const attributes: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(raw)) {
    const v = first(value);
    if (v === undefined) continue;
    urlSearchParams.set(key, v);
    if (key.startsWith("attr_")) {
      const ids = v.split(",").filter(Boolean);
      if (ids.length > 0) attributes[key.slice("attr_".length)] = ids;
    }
  }

  const sortRaw = first(raw.sort);
  const q = first(raw.q)?.trim();
  const categoryIds = (first(raw.categoryIds) ?? "").split(",").filter(Boolean);
  const page = nonNegativeInt(first(raw.page));

  return {
    params: {
      sort: isSort(sortRaw) ? sortRaw : defaultSort,
      page: page && page >= 1 ? page : 1,
      priceMin: nonNegativeInt(first(raw.priceMin)),
      priceMax: nonNegativeInt(first(raw.priceMax)),
      inStockOnly: first(raw.inStockOnly) === "true",
      onSale: first(raw.onSale) === "true",
      q: q ? q.slice(0, 100) : undefined,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
      attributes,
    },
    urlSearchParams,
  };
}

/** The `/store/catalog/listing` query string for these params — used by the server render and by the client's "Load more". */
export function buildListingQuery(params: ListingParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.categoryId) query.set("categoryId", params.categoryId);
  if (params.collectionId) query.set("collectionId", params.collectionId);
  if (params.tag) query.set("tag", params.tag);
  if (params.q) query.set("q", params.q);
  if (params.categoryIds?.length) query.set("categoryIds", params.categoryIds.join(","));
  if (params.priceMin !== undefined) query.set("priceMin", String(params.priceMin));
  if (params.priceMax !== undefined) query.set("priceMax", String(params.priceMax));
  if (params.inStockOnly) query.set("inStockOnly", "true");
  if (params.onSale) query.set("onSale", "true");
  if (params.sort) query.set("sort", params.sort);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  for (const [attributeId, valueIds] of Object.entries(params.attributes ?? {})) {
    if (valueIds.length > 0) query.set(`attr_${attributeId}`, valueIds.join(","));
  }
  return query;
}

/** How many filters are on (each attribute value and category counts once) — the badge on the phone "Filter" button. */
export function countActiveFilters(params: URLSearchParams): number {
  let count = 0;
  for (const [key, value] of params) {
    if (key.startsWith("attr_") || key === "categoryIds") count += value.split(",").filter(Boolean).length;
    else if (key === "inStockOnly" || key === "onSale") count += value === "true" ? 1 : 0;
  }
  if (params.get("priceMin") || params.get("priceMax")) count += 1;
  return count;
}

/** A copy of `params` with every filter, search and page removed — "Clear all". Sort and unrelated params (utm_*) stay. */
export function clearFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of [...next.keys()]) {
    if (key.startsWith("attr_") || (FILTER_KEYS as readonly string[]).includes(key) || key === "page") next.delete(key);
  }
  return next;
}

/** Adds or removes one id in a comma-separated param (`attr_*`, `categoryIds`), and resets paging. */
export function toggleListValue(params: URLSearchParams, key: string, id: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const values = new Set((next.get(key) ?? "").split(",").filter(Boolean));
  if (values.has(id)) values.delete(id);
  else values.add(id);
  if (values.size > 0) next.set(key, [...values].join(","));
  else next.delete(key);
  next.delete("page");
  return next;
}

/** Sets or clears one param, and resets paging. */
export function setParam(params: URLSearchParams, key: string, value: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value === null || value === "") next.delete(key);
  else next.set(key, value);
  next.delete("page");
  return next;
}

/** Whether a page shows filtered or searched results — those URLs are kept out of search engines (§13.2). */
export function isFilteredListing(params: URLSearchParams): boolean {
  return countActiveFilters(params) > 0 || !!params.get("q");
}
