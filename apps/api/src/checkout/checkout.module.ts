import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { CartModule } from "../cart/cart.module";
import { DiscountsModule } from "../discounts/discounts.module";
import { RiskModule } from "../risk/risk.module";
import { BlocklistModule } from "../blocklist/blocklist.module";
import { PaymentRulesModule } from "../payment-rules/payment-rules.module";
import { PaymentsModule } from "../payments/payments.module";
import { CustomerAuthModule } from "../customer-auth/customer-auth.module";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { ProvidersModule } from "../providers/providers.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TrackingModule } from "../tracking/tracking.module";
import { AutomationOutboxModule } from "../automation/automation-outbox.module";
import { CheckoutService } from "./checkout.service";
import { CheckoutController } from "./checkout.controller";
import { CaptchaProvidersService } from "./captcha-providers.service";
import { StockReservationModule } from "./stock-reservation.module";
import { OrdersLifecycleModule } from "./orders-lifecycle.module";
import { OrderNumberModule } from "./order-number.module";
import { OrderExpiryService } from "./order-expiry.service";
import { OrdersService } from "./orders.service";
import { OrdersController } from "./orders.controller";

@Module({
  imports: [
    CartModule,
    DiscountsModule,
    RiskModule,
    BlocklistModule,
    PaymentRulesModule,
    PaymentsModule,
    CustomerAuthModule,
    CustomerContextModule,
    ProvidersModule,
    StockReservationModule,
    OrdersLifecycleModule,
    AutomationOutboxModule,
    OrderNumberModule,
    NotificationsModule,
    TrackingModule,
  ],
  controllers: [CheckoutController, OrdersController],
  providers: [CheckoutService, CaptchaProvidersService, OrderExpiryService, OrdersService],
  exports: [CheckoutService, StockReservationModule],
})
export class CheckoutModule implements OnModuleInit {
  constructor(
    private readonly orderExpiry: OrderExpiryService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("checkout.release_expired_orders", () => this.orderExpiry.runSweep().then(() => undefined));
  }
}
