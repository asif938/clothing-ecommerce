import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { PurchaseOrdersController, SuppliersController } from "./procurement.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { SuppliersService } from "./suppliers.service";

/** Suppliers and purchase/production orders with receiving (docs/PROJECT_SPEC.md §16 M12). Materials & BOM are M17. */
@Module({
  imports: [InventoryModule],
  controllers: [SuppliersController, PurchaseOrdersController],
  providers: [SuppliersService, PurchaseOrdersService],
})
export class ProcurementModule {}
