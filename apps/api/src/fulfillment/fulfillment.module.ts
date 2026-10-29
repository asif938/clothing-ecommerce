import { Module } from "@nestjs/common";
import { StockReservationModule } from "../checkout/stock-reservation.module";
import { OrdersLifecycleModule } from "../checkout/orders-lifecycle.module";
import { PickListService } from "./pick-list.service";
import { PackingService } from "./packing.service";
import { HandoverService } from "./handover.service";
import { FulfillmentController } from "./fulfillment.controller";

@Module({
  imports: [StockReservationModule, OrdersLifecycleModule],
  controllers: [FulfillmentController],
  providers: [PickListService, PackingService, HandoverService],
})
export class FulfillmentModule {}
