import { Module } from "@nestjs/common";
import { StockReservationService } from "./stock-reservation.service";

/** Split out from `CheckoutModule` (same reasoning as `OrdersLifecycleModule`) so M6's fulfillment/returns/orders-admin modules can reserve/release/fulfill/restock stock without pulling in checkout's whole cart/discounts/payments import graph. */
@Module({
  providers: [StockReservationService],
  exports: [StockReservationService],
})
export class StockReservationModule {}
