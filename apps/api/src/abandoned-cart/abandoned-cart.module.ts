import { Module, type OnModuleInit } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { SchedulerService } from "../queue/scheduler.service";
import { AbandonedCartService } from "./abandoned-cart.service";
import { AbandonedCartController } from "./abandoned-cart.controller";

@Module({
  imports: [NotificationsModule],
  controllers: [AbandonedCartController],
  providers: [AbandonedCartService],
})
export class AbandonedCartModule implements OnModuleInit {
  constructor(
    private readonly abandonedCart: AbandonedCartService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("abandoned_cart.mark", () => this.abandonedCart.markAbandoned().then(() => undefined));
    this.scheduler.registerRecurring("abandoned_cart.sequence", () => this.abandonedCart.runSequence().then(() => undefined));
  }
}
