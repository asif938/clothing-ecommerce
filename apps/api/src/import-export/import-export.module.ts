import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { MediaModule } from "../media/media.module";
import { CatalogExportService } from "./catalog-export.service";
import { CatalogImportService } from "./catalog-import.service";
import { ImportExportController } from "./import-export.controller";

/** CSV/Excel catalog import (column mapping, dry-run, resumable background job, ZIP/URL images) and export (docs/PROJECT_SPEC.md §8.2, §16 M2). */
@Module({
  imports: [InventoryModule, MediaModule],
  controllers: [ImportExportController],
  providers: [CatalogImportService, CatalogExportService],
})
export class ImportExportModule {}
