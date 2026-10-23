import type { ListingParams } from "./store-api";

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Shared by `/c/[...slug]` and `/collections/[slug]` — turns Next's raw `searchParams` into both a typed `ListingParams` (for the API call) and a `URLSearchParams` (for building pagination/filter links that preserve every other param). */
export function parseListingSearchParams(raw: RawSearchParams): { params: Omit<ListingParams, "categoryId" | "collectionId" | "tag">; urlSearchParams: URLSearchParams } {
  const urlSearchParams = new URLSearchParams();
  const attributes: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(raw)) {
    const v = first(value);
    if (v === undefined) continue;
    urlSearchParams.set(key, v);
    if (key.startsWith("attr_")) attributes[key.slice("attr_".length)] = v.split(",").filter(Boolean);
  }

  const sortRaw = first(raw.sort);
  const sort = sortRaw === "newest" || sortRaw === "price_asc" || sortRaw === "price_desc" || sortRaw === "bestselling" ? sortRaw : "relevance";

  return {
    params: {
      sort,
      page: Number(first(raw.page)) || 1,
      priceMin: first(raw.priceMin) ? Number(first(raw.priceMin)) : undefined,
      priceMax: first(raw.priceMax) ? Number(first(raw.priceMax)) : undefined,
      inStockOnly: first(raw.inStockOnly) === "true",
      attributes,
    },
    urlSearchParams,
  };
}
