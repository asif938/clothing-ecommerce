import { Module } from "@nestjs/common";
import { NotifyMeModule } from "../notify-me/notify-me.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { StockLocationsController } from "./stock-locations.controller";
import { StockLocationsService } from "./stock-locations.service";

/** Stock locations, inventory levels, stock movements, low-stock, barcode labels (docs/PROJECT_SPEC.md §16 M2). `NotifyMeModule` is imported for M10's back-in-stock trigger (see `InventoryService.adjust()`). */
@Module({
  imports: [NotifyMeModule],
  controllers: [StockLocationsController, InventoryController],
  providers: [StockLocationsService, InventoryService],
  exports: [InventoryService, StockLocationsService],
})
export class InventoryModule {}
