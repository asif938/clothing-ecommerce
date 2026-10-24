import { Module } from "@nestjs/common";
import { OrdersLifecycleService } from "./orders-lifecycle.service";

/** Split out from `CheckoutModule` so `PaymentsModule` can depend on it without a module cycle (checkout needs payments to initiate a charge; payments needs this to react when one succeeds). */
@Module({
  providers: [OrdersLifecycleService],
  exports: [OrdersLifecycleService],
})
export class OrdersLifecycleModule {}
