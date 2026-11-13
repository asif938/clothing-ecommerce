import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { MaterialsModule } from "../materials/materials.module";
import { PurchaseOrdersController, ReorderController, SuppliersController } from "./procurement.controller";
import { PurchaseOrdersService } from "./purchase-orders.service";
import { ReorderService } from "./reorder.service";
import { SuppliersService } from "./suppliers.service";

/** Suppliers, purchase/production orders with receiving (M12), and demand forecasting / reorder suggestions (M17). Materials & BOM live in MaterialsModule. */
@Module({
  imports: [InventoryModule, MaterialsModule],
  controllers: [SuppliersController, PurchaseOrdersController, ReorderController],
  providers: [SuppliersService, PurchaseOrdersService, ReorderService],
  exports: [PurchaseOrdersService],
})
export class ProcurementModule {}
