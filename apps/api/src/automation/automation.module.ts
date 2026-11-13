import { Logger, Module, type OnModuleInit } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersLifecycleModule } from "../checkout/orders-lifecycle.module";
import { OrderContextModule } from "./order-context.service";
import { OrderQueueModule } from "../order-queue/order-queue.module";
import { OrderConfirmationModule } from "../order-confirmation/order-confirmation.module";
import { SchedulerService } from "../queue/scheduler.service";
import { AutomationEngineService } from "./automation-engine.service";
import { AutomationRulesService } from "./automation-rules.service";
import { AutomationController } from "./automation.controller";
import { AUTOMATION_TASK_TYPE, type AutomationTaskPayload } from "./automation-outbox.service";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { WebhooksService } from "../webhooks/webhooks.service";

@Module({
  imports: [NotificationsModule, OrdersLifecycleModule, OrderContextModule, OrderQueueModule, OrderConfirmationModule, WebhooksModule],
  controllers: [AutomationController],
  providers: [AutomationEngineService, AutomationRulesService],
  exports: [AutomationEngineService],
})
export class AutomationModule implements OnModuleInit {
  private readonly logger = new Logger(AutomationModule.name);

  constructor(
    private readonly engine: AutomationEngineService,
    private readonly scheduler: SchedulerService,
    private readonly webhooks: WebhooksService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerHandler(AUTOMATION_TASK_TYPE, async (payload) => {
      // §16 M17 outbound webhooks ride the same after-commit trigger. A webhook
      // problem must never stop the automation rules from running, so it is
      // logged and swallowed.
      const { trigger, orderId } = payload as AutomationTaskPayload;
      await this.webhooks.dispatchOrderEvent(trigger, orderId).catch((error: unknown) => this.logger.error(`Webhook dispatch failed for ${trigger} on order ${orderId}: ${error instanceof Error ? error.message : error}`));
      await this.engine.handle(payload);
    });
  }
}
