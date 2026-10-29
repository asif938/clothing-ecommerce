import { Module } from "@nestjs/common";
import { StockReservationModule } from "../checkout/stock-reservation.module";
import { OrdersLifecycleModule } from "../checkout/orders-lifecycle.module";
import { OrderNumberModule } from "../checkout/order-number.module";
import { CustomersModule } from "../customers/customers.module";
import { LocationsModule } from "../locations/locations.module";
import { ShippingModule } from "../shipping/shipping.module";
import { RiskModule } from "../risk/risk.module";
import { OrdersAdminController } from "./orders-admin.controller";
import { OrdersAdminService } from "./orders-admin.service";
import { ManualOrderService } from "./manual-order.service";
import { OrderEditService } from "./order-edit.service";

@Module({
  imports: [StockReservationModule, OrdersLifecycleModule, OrderNumberModule, CustomersModule, LocationsModule, ShippingModule, RiskModule],
  controllers: [OrdersAdminController],
  providers: [OrdersAdminService, ManualOrderService, OrderEditService],
})
export class OrdersModule {}
