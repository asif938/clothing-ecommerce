import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersLifecycleModule } from "../checkout/orders-lifecycle.module";
import { OrderConfirmationService } from "./order-confirmation.service";
import { StoreOrderConfirmationController } from "./store-order-confirmation.controller";

@Module({
  imports: [NotificationsModule, OrdersLifecycleModule],
  controllers: [StoreOrderConfirmationController],
  providers: [OrderConfirmationService],
  exports: [OrderConfirmationService],
})
export class OrderConfirmationModule {}
