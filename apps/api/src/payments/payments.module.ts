import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { OrdersLifecycleModule } from "../checkout/orders-lifecycle.module";
import { ProvidersModule } from "../providers/providers.module";
import { PaymentsService } from "./payments.service";
import { MockPayController } from "./mock-pay.controller";
import { StorePaymentsController } from "./store-payments.controller";

@Module({
  imports: [OrdersLifecycleModule, ProvidersModule],
  controllers: [MockPayController, StorePaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule implements OnModuleInit {
  constructor(
    private readonly payments: PaymentsService,
    private readonly scheduler: SchedulerService,
  ) {}

  /** §10.1: "reconcile `pending` payments older than 15 min by querying the provider." */
  onModuleInit(): void {
    this.scheduler.registerRecurring("payments.reconcile_pending", () => this.payments.reconcilePending().then(() => undefined));
  }
}
