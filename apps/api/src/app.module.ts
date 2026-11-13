import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env.schema";
import { PrismaModule } from "./prisma/prisma.module";
import { CacheModule } from "./cache/cache.module";
import { AuditModule } from "./audit/audit.module";
import { SettingsModule } from "./settings/settings.module";
import { AuthModule } from "./auth/auth.module";
import { StaffModule } from "./staff/staff.module";
import { RbacModule } from "./rbac/rbac.module";
import { UiStringsModule } from "./ui-strings/ui-strings.module";
import { LocationsModule } from "./locations/locations.module";
import { StorageModule } from "./storage/storage.module";
import { MediaModule } from "./media/media.module";
import { ProvidersModule } from "./providers/providers.module";
import { QueueModule } from "./queue/queue.module";
import { SetupModule } from "./setup/setup.module";
import { HealthModule } from "./health/health.module";
import { CatalogModule } from "./catalog/catalog.module";
import { ProductsModule } from "./products/products.module";
import { CollectionsModule } from "./collections/collections.module";
import { PriceSchedulesModule } from "./price-schedules/price-schedules.module";
import { InventoryModule } from "./inventory/inventory.module";
import { ImportExportModule } from "./import-export/import-export.module";
import { SearchModule } from "./search/search.module";
import { RevalidationModule } from "./revalidation/revalidation.module";
import { CmsModule } from "./cms/cms.module";
import { StoreCatalogModule } from "./store-catalog/store-catalog.module";
import { StoreContentModule } from "./store-content/store-content.module";
import { NewsletterModule } from "./newsletter/newsletter.module";
import { NotifyMeModule } from "./notify-me/notify-me.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { CustomersModule } from "./customers/customers.module";
import { SmsModule } from "./sms/sms.module";
import { CustomerAuthModule } from "./customer-auth/customer-auth.module";
import { AddressesModule } from "./addresses/addresses.module";
import { ShippingModule } from "./shipping/shipping.module";
import { DiscountsModule } from "./discounts/discounts.module";
import { BlocklistModule } from "./blocklist/blocklist.module";
import { PaymentRulesModule } from "./payment-rules/payment-rules.module";
import { RiskModule } from "./risk/risk.module";
import { CartModule } from "./cart/cart.module";
import { PaymentsModule } from "./payments/payments.module";
import { CheckoutModule } from "./checkout/checkout.module";
import { CouriersModule } from "./couriers/couriers.module";
import { CourierAreaMappingModule } from "./courier-area-mapping/courier-area-mapping.module";
import { ShipmentsModule } from "./shipments/shipments.module";
import { FulfillmentModule } from "./fulfillment/fulfillment.module";
import { OrdersModule } from "./orders/orders.module";
import { ReturnsModule } from "./returns/returns.module";
import { RefundsModule } from "./refunds/refunds.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { ProductQuestionsModule } from "./product-questions/product-questions.module";
import { TrackingModule } from "./tracking/tracking.module";
import { FeedsModule } from "./feeds/feeds.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ReportsModule } from "./reports/reports.module";
import { LaunchChecklistModule } from "./launch-checklist/launch-checklist.module";
import { PushModule } from "./push/push.module";
import { SizeRecommenderModule } from "./size-recommender/size-recommender.module";
import { AudienceModule } from "./audience/audience.module";
import { AbandonedCartModule } from "./abandoned-cart/abandoned-cart.module";
import { BlogModule } from "./blog/blog.module";
import { ProcurementModule } from "./procurement/procurement.module";
import { FinanceModule } from "./finance/finance.module";
import { AutomationModule } from "./automation/automation.module";
import { AutomationOutboxModule } from "./automation/automation-outbox.module";
import { OrderQueueModule } from "./order-queue/order-queue.module";
import { OrderConfirmationModule } from "./order-confirmation/order-confirmation.module";
import { CourierRulesModule } from "./courier-rules/courier-rules.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { LoyaltyModule } from "./loyalty/loyalty.module";
import { CrmModule } from "./crm/crm.module";
import { MarketingModule } from "./marketing/marketing.module";
import { AiModule } from "./ai/ai.module";
import { SeoAuditModule } from "./seo-audit/seo-audit.module";
import { ExperimentsModule } from "./experiments/experiments.module";
import { PersonalizationModule } from "./personalization/personalization.module";
import { SupportModule } from "./support/support.module";
import { StoreCreditModule } from "./store-credit/store-credit.module";
import { GiftCardsModule } from "./gift-cards/gift-cards.module";
import { ReferralsModule } from "./referrals/referrals.module";
import { AffiliatesModule } from "./affiliates/affiliates.module";
import { MaterialsModule } from "./materials/materials.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { ConfigBundleModule } from "./config-bundle/config-bundle.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
      },
    }),
    // Foundations first (Milestone 1, docs/PROJECT_SPEC.md §4): Prisma/cache/
    // audit/settings/auth are @Global, so every feature module below can
    // just inject their services without re-importing them.
    PrismaModule,
    CacheModule,
    AuditModule,
    RevalidationModule,
    SettingsModule,
    AuthModule,
    StorageModule,
    QueueModule,
    StaffModule,
    RbacModule,
    UiStringsModule,
    LocationsModule,
    MediaModule,
    ProvidersModule,
    SetupModule,
    HealthModule,
    // Milestone 2 (docs/PROJECT_SPEC.md §16 M2) — catalog and inventory.
    // Cart/checkout, CMS, etc. are added here starting Milestone 3+ (one
    // module per bounded context, see docs/PROJECT_SPEC.md §3.4).
    CatalogModule,
    InventoryModule,
    ProductsModule,
    CollectionsModule,
    PriceSchedulesModule,
    ImportExportModule,
    SearchModule,
    // Milestone 3 (docs/PROJECT_SPEC.md §16 M3) — theme, CMS core, storefront shell.
    CmsModule,
    StoreCatalogModule,
    StoreContentModule,
    NewsletterModule,
    // Milestone 4 (docs/PROJECT_SPEC.md §16 M4) — storefront catalog experience.
    NotifyMeModule,
    AnalyticsModule,
    // Milestone 5 (docs/PROJECT_SPEC.md §16 M5) — cart, checkout, shipping,
    // payment rules, customer auth.
    CustomersModule,
    SmsModule,
    CustomerAuthModule,
    AddressesModule,
    ShippingModule,
    DiscountsModule,
    BlocklistModule,
    PaymentRulesModule,
    RiskModule,
    CartModule,
    PaymentsModule,
    CheckoutModule,
    // Milestone 6 (docs/PROJECT_SPEC.md §16 M6) — order management and
    // fulfillment: couriers, shipments, pick/pack/handover, staff order
    // management, returns & exchanges, refunds queue.
    CouriersModule,
    CourierAreaMappingModule,
    ShipmentsModule,
    FulfillmentModule,
    OrdersModule,
    ReturnsModule,
    RefundsModule,
    // Milestone 7 (docs/PROJECT_SPEC.md §16 M7) — notifications and messaging.
    NotificationsModule,
    // Milestone 8 (docs/PROJECT_SPEC.md §16 M8) — marketing basics,
    // customers, reviews, tracking & feeds, reports. `CustomersModule` is
    // already imported above (M5); this milestone only added controllers
    // to it, not a new import here.
    ReviewsModule,
    ProductQuestionsModule,
    TrackingModule,
    FeedsModule,
    LaunchChecklistModule,
    DashboardModule,
    ReportsModule,
    // Milestone 10 (docs/PROJECT_SPEC.md §16 M10) — conversion features.
    // `PushModule` is imported early since `NotificationsModule` (M7,
    // already above) now depends on it for the `push` channel.
    PushModule,
    SizeRecommenderModule,
    AudienceModule,
    AbandonedCartModule,
    BlogModule,
    AutomationOutboxModule,
    OrderQueueModule,
    OrderConfirmationModule,
    CourierRulesModule,
    ApprovalsModule,
    // Milestone 13 (docs/PROJECT_SPEC.md §16 M13) — CRM, marketing automation and AI content.
    LoyaltyModule,
    CrmModule,
    MarketingModule,
    AiModule,
    SeoAuditModule,
    // §16 M14 — personalization and experimentation.
    PersonalizationModule,
    ExperimentsModule,
    // §16 M15 — support.
    SupportModule,
    // §16 M16 — loyalty extensions.
    StoreCreditModule,
    GiftCardsModule,
    ReferralsModule,
    AffiliatesModule,
    AutomationModule,
    // Milestone 12 (§16 M12): inventory and finance.
    ProcurementModule,
    FinanceModule,
    // §16 M17 — advanced analytics and procurement: materials & BOM (forecast/reorder live in
    // ProcurementModule, expenses/P&L in FinanceModule, cohorts/report builder in ReportsModule),
    // plus the public API, outbound webhooks and config bundles.
    MaterialsModule,
    ApiKeysModule,
    WebhooksModule,
    ConfigBundleModule,
  ],
})
export class AppModule {}
