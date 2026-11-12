import { Module } from "@nestjs/common";
import { NotifyMeModule } from "../notify-me/notify-me.module";
import { PriceSchedulesModule } from "../price-schedules/price-schedules.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { StockLocationsController } from "./stock-locations.controller";
import { StockLocationsService } from "./stock-locations.service";
import { StockTransfersService } from "./stock-transfers.service";
import { StockTakesService } from "./stock-takes.service";
import { InventoryAnalysisService } from "./inventory-analysis.service";
import { InventoryAnalysisController, StockTakesController, StockTransfersController } from "./stock-operations.controller";
import { LookupsController } from "./lookups.controller";

/**
 * Stock locations, inventory levels, stock movements, low-stock, barcode
 * labels (docs/PROJECT_SPEC.md §16 M2), plus M12's transfers, stock takes,
 * size-curve and dead-stock analysis. `NotifyMeModule` is imported for M10's
 * back-in-stock trigger (see `InventoryService.adjust()`/
 * `afterMovementsCommitted()`); `PriceSchedulesModule` for accepting
 * markdown suggestions as price schedules.
 */
@Module({
  imports: [NotifyMeModule, PriceSchedulesModule],
  // Transfers/stock takes/analysis are registered before `InventoryController`
  // so their static paths win over its `:variantId/:locationId` routes.
  controllers: [StockLocationsController, StockTransfersController, StockTakesController, InventoryAnalysisController, InventoryController, LookupsController],
  providers: [StockLocationsService, InventoryService, StockTransfersService, StockTakesService, InventoryAnalysisService],
  exports: [InventoryService, StockLocationsService],
})
export class InventoryModule {}
