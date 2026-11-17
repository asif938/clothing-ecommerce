/**
 * The admin sidebar's structure: 64 flat links grouped by the job the owner is doing, so the
 * menu reads as ten sections instead of one long list. Labels are `shell.*` message keys
 * (bilingual); group icons are keys into the `GROUP_ICON_PATHS` map in the sidebar.
 */
export interface NavItem {
  href: string;
  labelKey: string;
}

export interface NavGroup {
  key: string;
  labelKey: string;
  icon: "orders" | "truck" | "tag" | "box" | "megaphone" | "users" | "file" | "chart" | "gear";
  items: NavItem[];
}

/** Always visible at the top, outside any group. */
export const NAV_TOP: NavItem = { href: "/", labelKey: "navDashboard" };

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "orders",
    labelKey: "navGroupOrders",
    icon: "orders",
    items: [
      { href: "/orders", labelKey: "navOrders" },
      { href: "/orders/kanban", labelKey: "navKanban" },
      { href: "/orders/queue", labelKey: "navMyQueue" },
      { href: "/approvals", labelKey: "navApprovals" },
      { href: "/returns", labelKey: "navReturns" },
      { href: "/refunds", labelKey: "navRefunds" },
      { href: "/abandoned-carts", labelKey: "navAbandonedCarts" },
      { href: "/finance/cod", labelKey: "navFinance" },
    ],
  },
  {
    key: "shipping",
    labelKey: "navGroupShipping",
    icon: "truck",
    items: [
      { href: "/fulfillment", labelKey: "navFulfillment" },
      { href: "/shipping", labelKey: "navShipping" },
      { href: "/courier-rules", labelKey: "navCourierRules" },
      { href: "/courier-area-mapping", labelKey: "navCourierAreaMapping" },
      { href: "/payment-rules", labelKey: "navPaymentRules" },
      { href: "/blocklist", labelKey: "navBlocklist" },
      { href: "/automation", labelKey: "navAutomation" },
    ],
  },
  {
    key: "catalog",
    labelKey: "navGroupCatalog",
    icon: "tag",
    items: [
      { href: "/products", labelKey: "navProducts" },
      { href: "/catalog", labelKey: "navCatalog" },
      { href: "/catalog/quality", labelKey: "navProductQuality" },
      { href: "/collections", labelKey: "navCollections" },
      { href: "/price-schedules", labelKey: "navPriceSchedules" },
      { href: "/media", labelKey: "navMedia" },
    ],
  },
  {
    key: "inventory",
    labelKey: "navGroupInventory",
    icon: "box",
    items: [
      { href: "/inventory", labelKey: "navInventory" },
      { href: "/purchase-orders", labelKey: "navPurchaseOrders" },
      { href: "/suppliers", labelKey: "navSuppliers" },
      { href: "/materials", labelKey: "navMaterials" },
    ],
  },
  {
    key: "marketing",
    labelKey: "navGroupMarketing",
    icon: "megaphone",
    items: [
      { href: "/discounts", labelKey: "navDiscounts" },
      { href: "/flash-sales", labelKey: "navFlashSales" },
      { href: "/marketing/broadcasts", labelKey: "navMarketing" },
      { href: "/loyalty", labelKey: "navLoyalty" },
      { href: "/gift-cards", labelKey: "navGiftCards" },
      { href: "/referrals", labelKey: "navReferrals" },
      { href: "/affiliates", labelKey: "navAffiliates" },
      { href: "/push", labelKey: "navPush" },
      { href: "/experiments", labelKey: "navExperiments" },
      { href: "/personalization", labelKey: "navPersonalization" },
      { href: "/feeds", labelKey: "navFeeds" },
    ],
  },
  {
    key: "customers",
    labelKey: "navGroupCustomers",
    icon: "users",
    items: [
      { href: "/customers", labelKey: "navCustomers" },
      { href: "/segments", labelKey: "navSegments" },
      { href: "/reviews", labelKey: "navReviews" },
      { href: "/product-questions", labelKey: "navProductQuestions" },
      { href: "/support/inbox", labelKey: "navSupport" },
      { href: "/support/tickets", labelKey: "navTickets" },
    ],
  },
  {
    key: "content",
    labelKey: "navGroupContent",
    icon: "file",
    items: [
      { href: "/cms/pages", labelKey: "navCmsPages" },
      { href: "/cms/announcements", labelKey: "navCmsAnnouncements" },
      { href: "/cms/menus", labelKey: "navCmsMenus" },
      { href: "/blog", labelKey: "navBlog" },
      { href: "/seo", labelKey: "navSeo" },
      { href: "/search", labelKey: "navSearch" },
    ],
  },
  {
    key: "reports",
    labelKey: "navGroupReports",
    icon: "chart",
    items: [
      { href: "/reports", labelKey: "navReports" },
      { href: "/reports/scheduled", labelKey: "navScheduledReports" },
      { href: "/alerts", labelKey: "navAlerts" },
      { href: "/ai", labelKey: "navAi" },
    ],
  },
  {
    key: "system",
    labelKey: "navGroupSystem",
    icon: "gear",
    items: [
      { href: "/settings", labelKey: "navSettings" },
      { href: "/staff", labelKey: "navStaff" },
      { href: "/staff/field-access", labelKey: "navFieldAccess" },
      { href: "/integrations", labelKey: "navIntegrations" },
      { href: "/api-keys", labelKey: "navApiKeys" },
      { href: "/webhooks", labelKey: "navWebhooks" },
      { href: "/notifications", labelKey: "navNotifications" },
      { href: "/import-export", labelKey: "navImportExport" },
      { href: "/config-bundle", labelKey: "navConfigBundle" },
      { href: "/system-health", labelKey: "navSystemHealth" },
      { href: "/launch-checklist", labelKey: "navLaunchChecklist" },
      { href: "/audit", labelKey: "navAudit" },
    ],
  },
];

/** The nav entry that "owns" a path: the longest href that is the path itself or a parent of it (so `/orders/123` lights up Orders, `/orders/kanban` lights up the board). */
export function activeHref(pathname: string): string | null {
  const all = [NAV_TOP, ...NAV_GROUPS.flatMap((group) => group.items)];
  let best: string | null = null;
  for (const { href } of all) {
    const matches = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
