import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { CatalogExportService } from "./catalog-export.service";
import { CatalogImportService } from "./catalog-import.service";
import { ImportExportController } from "./import-export.controller";

/** CSV/Excel catalog import (dry-run + resumable background job) and export (docs/PROJECT_SPEC.md §16 M2). */
@Module({
  imports: [InventoryModule],
  controllers: [ImportExportController],
  providers: [CatalogImportService, CatalogExportService],
})
export class ImportExportModule {}
