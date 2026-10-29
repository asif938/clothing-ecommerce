import { Module } from "@nestjs/common";
import { StockReservationModule } from "./stock-reservation.module";
import { OrdersLifecycleService } from "./orders-lifecycle.service";

/** Split out from `CheckoutModule` so `PaymentsModule` can depend on it without a module cycle (checkout needs payments to initiate a charge; payments needs this to react when one succeeds). M6 extended it to release stock on cancellation (§6.8), hence the `StockReservationModule` import. */
@Module({
  imports: [StockReservationModule],
  providers: [OrdersLifecycleService],
  exports: [OrdersLifecycleService],
})
export class OrdersLifecycleModule {}
