"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, Link } from "../../../i18n/navigation";
import { useCurrentStaff } from "../../../lib/use-current-staff";
import { api } from "../../../lib/api";
import { NotificationBell } from "../../../components/notification-bell";
import { AdminPwa } from "../../../components/admin-pwa";

const NAV_ITEMS = [
  { href: "/", labelKey: "navDashboard" },
  { href: "/orders", labelKey: "navOrders" },
  { href: "/orders/kanban", labelKey: "navKanban" },
  { href: "/orders/queue", labelKey: "navMyQueue" },
  { href: "/approvals", labelKey: "navApprovals" },
  { href: "/automation", labelKey: "navAutomation" },
  { href: "/courier-rules", labelKey: "navCourierRules" },
  { href: "/fulfillment", labelKey: "navFulfillment" },
  { href: "/returns", labelKey: "navReturns" },
  { href: "/refunds", labelKey: "navRefunds" },
  { href: "/finance/cod", labelKey: "navFinance" },
  { href: "/cms/pages", labelKey: "navCmsPages" },
  { href: "/cms/announcements", labelKey: "navCmsAnnouncements" },
  { href: "/blog", labelKey: "navBlog" },
  { href: "/products", labelKey: "navProducts" },
  { href: "/catalog", labelKey: "navCatalog" },
  { href: "/catalog/quality", labelKey: "navProductQuality" },
  { href: "/collections", labelKey: "navCollections" },
  { href: "/price-schedules", labelKey: "navPriceSchedules" },
  { href: "/inventory", labelKey: "navInventory" },
  { href: "/purchase-orders", labelKey: "navPurchaseOrders" },
  { href: "/suppliers", labelKey: "navSuppliers" },
  { href: "/materials", labelKey: "navMaterials" },
  { href: "/shipping", labelKey: "navShipping" },
  { href: "/payment-rules", labelKey: "navPaymentRules" },
  { href: "/courier-area-mapping", labelKey: "navCourierAreaMapping" },
  { href: "/blocklist", labelKey: "navBlocklist" },
  { href: "/notifications", labelKey: "navNotifications" },
  { href: "/discounts", labelKey: "navDiscounts" },
  { href: "/flash-sales", labelKey: "navFlashSales" },
  { href: "/abandoned-carts", labelKey: "navAbandonedCarts" },
  { href: "/marketing/broadcasts", labelKey: "navMarketing" },
  { href: "/loyalty", labelKey: "navLoyalty" },
  { href: "/gift-cards", labelKey: "navGiftCards" },
  { href: "/referrals", labelKey: "navReferrals" },
  { href: "/affiliates", labelKey: "navAffiliates" },
  { href: "/customers", labelKey: "navCustomers" },
  { href: "/segments", labelKey: "navSegments" },
  { href: "/reviews", labelKey: "navReviews" },
  { href: "/product-questions", labelKey: "navProductQuestions" },
  { href: "/reports", labelKey: "navReports" },
  { href: "/reports/scheduled", labelKey: "navScheduledReports" },
  { href: "/alerts", labelKey: "navAlerts" },
  { href: "/feeds", labelKey: "navFeeds" },
  { href: "/import-export", labelKey: "navImportExport" },
  { href: "/config-bundle", labelKey: "navConfigBundle" },
  { href: "/search", labelKey: "navSearch" },
  { href: "/seo", labelKey: "navSeo" },
  { href: "/ai", labelKey: "navAi" },
  { href: "/personalization", labelKey: "navPersonalization" },
  { href: "/experiments", labelKey: "navExperiments" },
  { href: "/support/inbox", labelKey: "navSupport" },
  { href: "/support/tickets", labelKey: "navTickets" },
  { href: "/settings", labelKey: "navSettings" },
  { href: "/staff", labelKey: "navStaff" },
  { href: "/staff/field-access", labelKey: "navFieldAccess" },
  { href: "/media", labelKey: "navMedia" },
  { href: "/integrations", labelKey: "navIntegrations" },
  { href: "/api-keys", labelKey: "navApiKeys" },
  { href: "/webhooks", labelKey: "navWebhooks" },
  { href: "/system-health", labelKey: "navSystemHealth" },
  { href: "/push", labelKey: "navPush" },
  { href: "/launch-checklist", labelKey: "navLaunchChecklist" },
  { href: "/audit", labelKey: "navAudit" },
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("shell");
  const tAuth = useTranslations("auth");
  const { staff, loading, unauthenticated } = useCurrentStaff();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (unauthenticated) router.replace("/login");
  }, [unauthenticated, router]);

  useEffect(() => {
    if (staff && !staff.totpEnabled) router.replace("/totp-setup");
  }, [staff, router]);

  if (loading || !staff || !staff.totpEnabled) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-surface-foreground/60">…</div>;
  }

  async function handleLogout() {
    await api.post("/auth/logout");
    router.replace("/login");
  }

  async function handleLogoutAll() {
    await api.post("/auth/logout-all");
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col justify-between border-r border-border bg-surface p-4">
        <div>
          <div className="mb-6 px-2 text-lg font-semibold text-surface-foreground">Admin</div>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-theme px-3 py-2 text-sm ${
                  pathname === item.href ? "bg-brand text-brand-foreground" : "text-surface-foreground hover:bg-muted"
                }`}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <NotificationBell />
          <AdminPwa />
          <div className="flex flex-col gap-2 px-2">
            <span className="truncate text-surface-foreground/70">{staff.email}</span>
            <button onClick={handleLogout} className="text-left text-surface-foreground/70 hover:text-surface-foreground">
              {tAuth("logout")}
            </button>
            <button onClick={handleLogoutAll} className="text-left text-surface-foreground/70 hover:text-surface-foreground">
              {tAuth("logoutAll")}
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
