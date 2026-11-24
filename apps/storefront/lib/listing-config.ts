import { LISTING_SORT_VALUES, type ListingSortValue } from "./listing-params";
import { uiText } from "./ui-text";

export const LISTING_VIEW_VALUES = ["large", "grid", "list"] as const;
export type ListingView = (typeof LISTING_VIEW_VALUES)[number];

export interface ListingConfig {
  pageSize: number;
  defaultSort: ListingSortValue;
  viewSwitcher: boolean;
  defaultView: ListingView;
  filters: { categories: boolean; attributes: boolean; price: boolean; onSale: boolean; inStock: boolean };
}

const flag = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** Admin → Settings → listing / shop, read from the public store config with the same defaults as `@clothing/shared` (in case the API is behind on a deploy). */
export function readListingConfig(config: Record<string, unknown>): ListingConfig {
  const pageSize = Number(config["listing.pageSize"]);
  const sort = config["listing.defaultSort"];
  const view = config["listing.defaultView"];
  return {
    pageSize: [12, 24, 36, 48].includes(pageSize) ? pageSize : 24,
    defaultSort: LISTING_SORT_VALUES.includes(sort as ListingSortValue) ? (sort as ListingSortValue) : "relevance",
    viewSwitcher: flag(config["listing.viewSwitcher"], true),
    defaultView: LISTING_VIEW_VALUES.includes(view as ListingView) ? (view as ListingView) : "grid",
    filters: {
      categories: flag(config["listing.filters.categories"], true),
      attributes: flag(config["listing.filters.attributes"], true),
      price: flag(config["listing.filters.price"], true),
      onSale: flag(config["listing.filters.onSale"], true),
      inStock: flag(config["listing.filters.inStock"], true),
    },
  };
}

export function readShopConfig(config: Record<string, unknown>): { enabled: boolean; searchBox: boolean } {
  return { enabled: flag(config["shop.enabled"], true), searchBox: flag(config["shop.searchBox"], true) };
}

/** UI strings for the listing pages (`storefront.listing.*`, editable in the admin; defaults in `@clothing/shared`). */
export const LISTING_TEXT_KEYS = [
  "allProducts",
  "home",
  "search",
  "searchPlaceholder",
  "clearSearch",
  "filter",
  "filters",
  "sort",
  "sortRelevance",
  "sortBestMatch",
  "sortNewest",
  "sortBestselling",
  "sortPriceAsc",
  "sortPriceDesc",
  "productCount",
  "showing",
  "noResults",
  "noResultsHint",
  "clearAll",
  "apply",
  "close",
  "categories",
  "price",
  "priceMin",
  "priceMax",
  "onSale",
  "inStock",
  "loadMore",
  "loading",
  "previousPage",
  "nextPage",
  "showEarlier",
  "view",
  "viewLarge",
  "viewGrid",
  "viewList",
  "removeFilter",
  "showMore",
  "showLess",
  "loadFailed",
] as const;

export type ListingText = Record<(typeof LISTING_TEXT_KEYS)[number], string>;

export function resolveListingText(strings: Record<string, { bn?: string; en?: string }>, locale: string): ListingText {
  const text = uiText(strings, locale);
  return Object.fromEntries(LISTING_TEXT_KEYS.map((key) => [key, text(`storefront.listing.${key}`)])) as ListingText;
}

/** Fills `{name}` placeholders, e.g. `format("{count} products", { count: 12 })`. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
