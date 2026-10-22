import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { StockLocationsController } from "./stock-locations.controller";
import { StockLocationsService } from "./stock-locations.service";

/** Stock locations, inventory levels, stock movements, low-stock, barcode labels (docs/PROJECT_SPEC.md §16 M2). */
@Module({
  controllers: [StockLocationsController, InventoryController],
  providers: [StockLocationsService, InventoryService],
  exports: [InventoryService, StockLocationsService],
})
export class InventoryModule {}
