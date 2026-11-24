import "server-only";
import { buildListingQuery } from "./listing-params";

/**
 * Server-only fetches against the real API (`API_URL`, infra-only env,
 * docs/PROJECT_SPEC.md §4.1) tagged for Next's cache, so the publishing
 * pipeline (§9.6) can invalidate exactly what changed via
 * `app/api/revalidate/route.ts`'s `revalidateTag` — the mechanism behind
 * "a brand color / header variant / hero text change reaches the live
 * site within 10s without a deploy" (M3 acceptance scenario). Every
 * helper also falls back to a 60s revalidate window on its own, so a
 * missed/failed revalidation call still self-heals shortly.
 */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function storeGet<T>(path: string, tags: string[]): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1${path}`, { next: { revalidate: 60, tags } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface PublicConfig {
  [key: string]: unknown;
}

export async function getStoreConfig(): Promise<PublicConfig> {
  return (await storeGet<PublicConfig>("/store/config", ["settings"])) ?? {};
}

export interface BlockInstance {
  id: string;
  type: string;
  props: Record<string, unknown>;
  visibility?: { devices?: ("mobile" | "tablet" | "desktop")[]; locales?: string[]; audience?: { mode: "all" | "guest" | "customer"; segmentIds?: string[] } };
  schedule?: { startsAt?: string | null; endsAt?: string | null };
  /** §9.1 `variants` / §16 M14 — present while the block is under a running A/B test; control first, `props: null` = the block's own. */
  experiment?: { experimentId: string; variants: { key: string; props: Record<string, unknown> | null }[] };
}

export interface PageData {
  id: string;
  slug: string;
  title: string;
  blocksPublished: BlockInstance[];
  seoTitle: { bn?: string; en?: string } | null;
  seoDescription: { bn?: string; en?: string } | null;
  noindex: boolean;
}

export async function getPage(slug: string): Promise<PageData | null> {
  return await storeGet<PageData>(`/store/pages/${slug}`, [`page:${slug}`, "pages"]);
}

// §16 M10 — blog/lookbook. A "lookbook" post is simply one built from the
// `lookbook` block type; there is no separate model/fetch path for it.
export interface BlogPostSummary {
  id: string;
  slug: string;
  title: LocalizedText;
  excerpt: LocalizedText | null;
  coverMediaId: string | null;
  tags: string[];
  publishedAt: string | null;
}

export interface BlogPostDetail extends BlogPostSummary {
  blocksPublished: BlockInstance[];
  seoTitle: LocalizedText | null;
  seoDescription: LocalizedText | null;
}

export async function getBlogPosts(page = 1, tag?: string): Promise<{ items: BlogPostSummary[]; total: number; page: number; pageSize: number }> {
  const query = new URLSearchParams({ page: String(page) });
  if (tag) query.set("tag", tag);
  return (await storeGet(`/store/blog-posts?${query.toString()}`, ["blog_posts"])) ?? { items: [], total: 0, page, pageSize: 9 };
}

export async function getBlogPost(slug: string): Promise<BlogPostDetail | null> {
  return await storeGet<BlogPostDetail>(`/store/blog-posts/${slug}`, [`blog_post:${slug}`, "blog_posts"]);
}

export interface MenuItem {
  id: string;
  label: { bn?: string; en?: string };
  type: "category" | "collection" | "product" | "page" | "url";
  targetId?: string;
  url?: string;
  children?: MenuItem[];
}

export interface MenuData {
  key: string;
  name: string;
  items: MenuItem[];
}

export async function getMenu(key: string): Promise<MenuData | null> {
  return await storeGet<MenuData>(`/store/menus/${key}`, [`menu:${key}`, "menus"]);
}

export interface AnnouncementBar {
  id: string;
  message: { bn?: string; en?: string };
  linkUrl: string | null;
  linkText: { bn?: string; en?: string } | null;
  /** §16 M14 — present while the bar is under a running A/B test; control first with `payload: null`. */
  experiment?: { experimentId: string; variants: { key: string; payload: { message: { bn?: string; en?: string }; linkText?: { bn?: string; en?: string } | null; linkUrl?: string | null } | null }[] };
}

/** Admin-editable storefront chrome text (`storefront.*` UI strings, golden rule 1). Missing keys fall back to the seeded defaults — see lib/ui-text.ts. */
export async function getUiStrings(): Promise<Record<string, { bn?: string; en?: string }>> {
  return (await storeGet<Record<string, { bn?: string; en?: string }>>("/store/ui-strings", ["ui_strings"])) ?? {};
}

export async function getAnnouncements(): Promise<AnnouncementBar[]> {
  return (await storeGet<AnnouncementBar[]>("/store/announcements", ["announcements"])) ?? [];
}

export interface PopupData {
  id: string;
  title: { bn?: string; en?: string };
  body: { bn?: string; en?: string };
  ctaText: { bn?: string; en?: string } | null;
  ctaUrl: string | null;
  trigger: "immediate" | "delay" | "exit_intent";
  delaySeconds: number | null;
}

export async function getPopups(): Promise<PopupData[]> {
  return (await storeGet<PopupData[]>("/store/popups", ["popups"])) ?? [];
}

export interface RedirectData {
  found?: false;
  toPath?: string;
  statusCode?: number;
}

/** §9.5 "auto-redirect on slug change" — checked by `pages/[slug]` once no CMS page matches, before giving up to a 404. */
export async function getRedirect(path: string): Promise<RedirectData | null> {
  const result = await storeGet<RedirectData>(`/store/redirects/lookup?path=${encodeURIComponent(path)}`, ["redirects"]);
  return result && result.toPath ? result : null;
}

export interface SitemapData {
  pages: { slug: string; updatedAt: string }[];
  products: { slug: string; updatedAt: string }[];
  categories: { slug: string; updatedAt: string }[];
  collections: { slug: string; updatedAt: string }[];
}

const EMPTY_SITEMAP: SitemapData = { pages: [], products: [], categories: [], collections: [] };

/** §13.2 "sitemap.xml index split by type" — read by `app/sitemap.ts`. */
export async function getSitemapData(): Promise<SitemapData> {
  return (await storeGet<SitemapData>("/store/sitemap", ["sitemap"])) ?? EMPTY_SITEMAP;
}

// ---------------------------------------------------------------------------
// Milestone 4 (docs/PROJECT_SPEC.md §16 M4) — storefront catalog experience.
// ---------------------------------------------------------------------------

export type LocalizedTextLike = { bn?: string; en?: string };
type LocalizedText = LocalizedTextLike;

export interface CategoryBreadcrumbEntry {
  id: string;
  slug: string;
  name: LocalizedText;
}

export interface CategoryDetail {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  seoTitle: LocalizedText | null;
  seoDescription: LocalizedText | null;
  breadcrumb: CategoryBreadcrumbEntry[];
}

export async function getCategory(slug: string): Promise<CategoryDetail | null> {
  return await storeGet<CategoryDetail>(`/store/catalog/categories/${slug}`, [`category:${slug}`, "categories"]);
}

export interface CollectionDetail {
  id: string;
  slug: string;
  name: LocalizedText;
  description: LocalizedText | null;
  imageUrl: string | null;
  bannerUrl: string | null;
  seoTitle: LocalizedText | null;
  seoDescription: LocalizedText | null;
}

export async function getCollection(slug: string): Promise<CollectionDetail | null> {
  return await storeGet<CollectionDetail>(`/store/catalog/collections/${slug}`, [`collection:${slug}`, "collections"]);
}

export interface ProductCard {
  id: string;
  slug: string;
  title: LocalizedText;
  imageUrl: string | null;
  priceFrom: number;
  compareAtFrom: number | null;
}

export interface ListingFacetValue {
  valueId: string;
  label: LocalizedText;
  count: number;
}

export interface ListingFacetAttribute {
  attributeId: string;
  attributeName: LocalizedText;
  values: ListingFacetValue[];
}

/** A category in the listing's category filter; counts include every category below it. */
export interface ListingFacetCategory {
  id: string;
  slug: string;
  name: LocalizedText;
  depth: number;
  count: number;
}

export interface ListingResult {
  data: ProductCard[];
  meta: { page: number; pageSize: number; total: number };
  facets: { attributes: ListingFacetAttribute[]; categories?: ListingFacetCategory[]; priceRange: { min: number; max: number } | null };
}

export interface ListingParams {
  categoryId?: string;
  collectionId?: string;
  tag?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: boolean;
  onSale?: boolean;
  /** Search inside the listing (`/shop?q=`). */
  q?: string;
  /** Category filter; each also matches the categories below it. */
  categoryIds?: string[];
  sort?: "relevance" | "newest" | "price_asc" | "price_desc" | "bestselling";
  page?: number;
  pageSize?: number;
  attributes?: Record<string, string[]>;
}

const EMPTY_LISTING: ListingResult = { data: [], meta: { page: 1, pageSize: 24, total: 0 }, facets: { attributes: [], priceRange: null } };

export async function getListing(params: ListingParams): Promise<ListingResult> {
  const query = buildListingQuery(params);
  const tag = params.categoryId ? `category:${params.categoryId}` : params.collectionId ? `collection:${params.collectionId}` : "listing";
  return (await storeGet<ListingResult>(`/store/catalog/listing?${query.toString()}`, [tag, "listing"])) ?? EMPTY_LISTING;
}

export interface SizeChartData {
  id: string;
  name: LocalizedText;
  unitDefault: "inch" | "cm";
  columns: { key: string; label: LocalizedText }[];
  rows: { size: string; measurements: Record<string, number> }[];
  howToMeasure: { content?: LocalizedText; imageMediaId?: string | null } | null;
  notes: LocalizedText | null;
}

export interface ProductOptionValueData {
  id: string;
  value: LocalizedText;
  colorHex: string | null;
  swatchImageUrl: string | null;
}

export interface ProductOptionData {
  id: string;
  name: LocalizedText;
  type: "size" | "color" | "generic";
  sizeSystem: { id: string; name: LocalizedText; values: { code: string; label: LocalizedText }[] } | null;
  values: ProductOptionValueData[];
}

export interface ProductVariantData {
  id: string;
  sku: string;
  barcode: string | null;
  optionValueIds: string[];
  price: number;
  compareAtPrice: number | null;
  weightGrams: number | null;
  isActive: boolean;
  available: boolean;
  lowStock: boolean;
}

export interface ProductMediaData {
  id: string;
  url: string | null;
  alt: LocalizedText | null;
  optionValueId: string | null;
}

export interface ProductDetail {
  id: string;
  slug: string;
  title: LocalizedText;
  subtitle: LocalizedText | null;
  description: LocalizedText | null;
  shortDescription: LocalizedText | null;
  tags: string[];
  productType: string;
  // §16 M10 — preorders/shop-the-look bundles.
  preorderReleaseDate: string | null;
  preorderLimit: number | null;
  bundleDiscountType: "none" | "percent" | "fixed_price";
  bundleDiscountValue: number | null;
  bundleItems: {
    id: string;
    quantity: number;
    product: { id: string; slug: string; title: LocalizedText };
    variant: { id: string; sku: string; optionValueIds: string[]; price: number; isActive: boolean };
    imageUrl: string | null;
  }[];
  careInstructions: LocalizedText | null;
  fabric: LocalizedText | null;
  modelInfo: LocalizedText | null;
  videoUrl: string | null;
  requiresShipping: boolean;
  ratingAvg: number;
  ratingCount: number;
  seoTitle: LocalizedText | null;
  seoDescription: LocalizedText | null;
  category: { id: string; slug: string; name: LocalizedText } | null;
  breadcrumb: CategoryBreadcrumbEntry[];
  sizeChart: SizeChartData | null;
  attributes: { attributeId: string; name: LocalizedText; value: unknown }[];
  options: ProductOptionData[];
  variants: ProductVariantData[];
  media: ProductMediaData[];
  relations: Record<string, ProductCard[]>;
}

export async function getProduct(slug: string): Promise<ProductDetail | null> {
  return await storeGet<ProductDetail>(`/store/catalog/products/${slug}`, [`product:${slug}`, "products"]);
}

/** §16 M14 — hand-picked relations first, then computed "bought together" and look-alike "similar" products. Not personal, so it's ISR-cached like the PDP. */
export interface ProductRecommendations {
  boughtTogether: ProductCard[];
  similar: ProductCard[];
}

export async function getProductRecommendations(productId: string): Promise<ProductRecommendations | null> {
  return await storeGet<ProductRecommendations>(`/store/recommendations/products/${productId}`, ["recommendations", "products"]);
}

export interface SuggestResult {
  products: { id: string; slug: string; title: LocalizedText; imageUrl: string | null; price: number | null }[];
  categories: { id: string; slug: string; name: LocalizedText }[];
}

export async function getSuggestions(q: string): Promise<SuggestResult> {
  return (await storeGet<SuggestResult>(`/store/catalog/suggest?q=${encodeURIComponent(q)}`, ["suggest"])) ?? { products: [], categories: [] };
}

export interface SearchResult {
  data: ProductCard[];
  meta: { page: number; pageSize: number; total: number };
}

const EMPTY_SEARCH: SearchResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };

/** M2's Postgres FTS + trigram + Banglish synonyms (§16 M2/M4) — a free-text query, not a category/collection scope filter, so it's `/store/search`, not `/store/catalog/listing`. */
export async function getSearchResults(q: string): Promise<SearchResult> {
  return (await storeGet<SearchResult>(`/store/search?q=${encodeURIComponent(q)}`, ["search"])) ?? EMPTY_SEARCH;
}

/** The login-free review page's order (`/review/<token>`); never cached — it changes as items are reviewed. `"invalid"` when the link is bad. */
export interface ReviewOrderData {
  orderNumber: string;
  delivered: boolean;
  items: { id: string; title: LocalizedText; sku: string; imageUrl: string | null; quantity: number; productSlug: string; reviewed: boolean }[];
}

export async function getReviewOrder(token: string): Promise<ReviewOrderData | "invalid" | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/store/reviews/order/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (response.status === 404 || response.status === 400) return "invalid";
    if (!response.ok) return null;
    return (await response.json()) as ReviewOrderData;
  } catch {
    return null;
  }
}
