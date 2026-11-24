import { z } from "zod";
import { defineSetting } from "./registry.ts";

/**
 * Product listing pages — the all-products `/shop` page and the category and
 * collection pages, which share one layout (docs/PROJECT_SPEC.md §7.3). All
 * public: the storefront reads them from `GET /store/config`.
 */

const THEME = "settings.theme.write";

export const LISTING_SORTS = ["relevance", "newest", "bestselling", "price_asc", "price_desc"] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

/** Card layouts a shopper can switch between: one big photo per row on phones, the normal grid, or a compact list. */
export const LISTING_VIEWS = ["large", "grid", "list"] as const;
export type ListingView = (typeof LISTING_VIEWS)[number];

export const LISTING_PAGE_SIZES = ["12", "24", "36", "48"] as const;

export const SHOP_ENABLED = defineSetting({
  key: "shop.enabled",
  group: "shop",
  type: z.boolean(),
  default: true,
  label: { bn: "সব পণ্যের পেজ (/shop) চালু", en: "All-products page (/shop)" },
  help: { bn: "বন্ধ করলে /shop পেজ খুঁজে পাওয়া যাবে না", en: "When off, /shop shows a not-found page" },
  secret: false,
  public: true,
  permission: THEME,
  ui: { widget: "toggle" },
});

export const SHOP_SEARCH_BOX = defineSetting({
  key: "shop.searchBox",
  group: "shop",
  type: z.boolean(),
  default: true,
  label: { bn: "/shop পেজে সার্চ বক্স", en: "Search box on /shop" },
  secret: false,
  public: true,
  permission: THEME,
  ui: { widget: "toggle" },
});

export const LISTING_PAGE_SIZE = defineSetting({
  key: "listing.pageSize",
  group: "listing",
  type: z.enum(LISTING_PAGE_SIZES),
  default: "24",
  label: { bn: "প্রতিবার কয়টি পণ্য লোড হবে", en: "Products loaded at a time" },
  help: { bn: "\"আরও দেখুন\" চাপলে এতগুলো করে আসে", en: "\"Load more\" adds this many each time" },
  secret: false,
  public: true,
  permission: THEME,
  ui: { widget: "select", options: LISTING_PAGE_SIZES.map((value) => ({ value, label: { bn: value, en: value } })) },
});

export const LISTING_DEFAULT_SORT = defineSetting({
  key: "listing.defaultSort",
  group: "listing",
  type: z.enum(LISTING_SORTS),
  default: "relevance",
  label: { bn: "শুরুতে কোন ক্রমে সাজানো থাকবে", en: "Default sort" },
  help: { bn: "\"বাছাই করা\" মানে পণ্যের নিজস্ব ক্রম (sort weight)", en: "\"Featured\" uses each product's own sort weight" },
  secret: false,
  public: true,
  permission: THEME,
  ui: {
    widget: "select",
    options: [
      { value: "relevance", label: { bn: "বাছাই করা", en: "Featured" } },
      { value: "newest", label: { bn: "নতুন আগে", en: "Newest" } },
      { value: "bestselling", label: { bn: "বেশি বিক্রি", en: "Best selling" } },
      { value: "price_asc", label: { bn: "দাম: কম থেকে বেশি", en: "Price: low to high" } },
      { value: "price_desc", label: { bn: "দাম: বেশি থেকে কম", en: "Price: high to low" } },
    ],
  },
});

export const LISTING_VIEW_SWITCHER = defineSetting({
  key: "listing.viewSwitcher",
  group: "listing",
  type: z.boolean(),
  default: true,
  label: { bn: "ক্রেতা ভিউ বদলাতে পারবে (বড় ছবি / গ্রিড / লিস্ট)", en: "Let shoppers switch view (large / grid / list)" },
  secret: false,
  public: true,
  permission: THEME,
  ui: { widget: "toggle" },
});

export const LISTING_DEFAULT_VIEW = defineSetting({
  key: "listing.defaultView",
  group: "listing",
  type: z.enum(LISTING_VIEWS),
  default: "grid",
  label: { bn: "ডিফল্ট ভিউ", en: "Default view" },
  help: { bn: "ক্রেতা নিজে না বদলানো পর্যন্ত এটা দেখাবে", en: "Used until a shopper picks another one" },
  secret: false,
  public: true,
  permission: THEME,
  ui: {
    widget: "select",
    options: [
      { value: "large", label: { bn: "বড় ছবি", en: "Large photos" } },
      { value: "grid", label: { bn: "গ্রিড", en: "Grid" } },
      { value: "list", label: { bn: "লিস্ট", en: "List" } },
    ],
  },
});

function filterToggle(key: string, label: { bn: string; en: string }) {
  return defineSetting({ key, group: "listing", type: z.boolean(), default: true, label, secret: false, public: true, permission: THEME, ui: { widget: "toggle" } });
}

export const LISTING_FILTER_CATEGORIES = filterToggle("listing.filters.categories", { bn: "ফিল্টার: ক্যাটাগরি (শুধু /shop)", en: "Filter: categories (/shop only)" });
export const LISTING_FILTER_ATTRIBUTES = filterToggle("listing.filters.attributes", { bn: "ফিল্টার: সাইজ, রং ইত্যাদি", en: "Filter: size, colour and other attributes" });
export const LISTING_FILTER_PRICE = filterToggle("listing.filters.price", { bn: "ফিল্টার: দাম", en: "Filter: price" });
export const LISTING_FILTER_SALE = filterToggle("listing.filters.onSale", { bn: "ফিল্টার: শুধু ছাড়ে", en: "Filter: on sale" });
export const LISTING_FILTER_STOCK = filterToggle("listing.filters.inStock", { bn: "ফিল্টার: শুধু স্টকে আছে", en: "Filter: in stock" });

/** Tabs the phone bottom navigation bar can show (`theme.bottomNav.items`). `categories` opens the menu drawer, `search` the search field. */
export const BOTTOM_NAV_ITEMS = ["home", "shop", "categories", "search", "wishlist", "cart", "account", "track"] as const;
export type BottomNavItem = (typeof BOTTOM_NAV_ITEMS)[number];

export const THEME_BOTTOM_NAV_ENABLED = defineSetting({
  key: "theme.bottomNav.enabled",
  group: "theme",
  type: z.boolean(),
  default: true,
  label: { bn: "মোবাইলে নিচের ন্যাভিগেশন বার", en: "Bottom navigation bar on phones" },
  help: { bn: "ফোন ও ছোট ট্যাবলেটে নিচে স্থায়ী বার; প্রোডাক্ট ও চেকআউট পেজে লুকানো থাকে", en: "A fixed bar at the bottom on phones and small tablets; hidden on product and checkout pages" },
  secret: false,
  public: true,
  permission: THEME,
  ui: { widget: "toggle" },
});

export const THEME_BOTTOM_NAV_ITEMS = defineSetting({
  key: "theme.bottomNav.items",
  group: "theme",
  type: z
    .array(z.enum(BOTTOM_NAV_ITEMS))
    .min(2)
    .max(5)
    .refine((items) => new Set(items).size === items.length, { message: "Each tab can appear only once" }),
  default: ["home", "shop", "wishlist", "cart", "account"],
  label: { bn: "নিচের বারের ট্যাব (বাঁ থেকে ডানে)", en: "Bottom bar tabs (left to right)" },
  secret: false,
  public: true,
  permission: THEME,
  ui: { widget: "json" },
});
