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
  ],
})
export class AppModule {}
