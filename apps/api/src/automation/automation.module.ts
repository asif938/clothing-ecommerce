import { Module, type OnModuleInit } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersLifecycleModule } from "../checkout/orders-lifecycle.module";
import { OrderContextModule } from "./order-context.service";
import { OrderQueueModule } from "../order-queue/order-queue.module";
import { OrderConfirmationModule } from "../order-confirmation/order-confirmation.module";
import { SchedulerService } from "../queue/scheduler.service";
import { AutomationEngineService } from "./automation-engine.service";
import { AutomationRulesService } from "./automation-rules.service";
import { AutomationController } from "./automation.controller";
import { AUTOMATION_TASK_TYPE } from "./automation-outbox.service";

@Module({
  imports: [NotificationsModule, OrdersLifecycleModule, OrderContextModule, OrderQueueModule, OrderConfirmationModule],
  controllers: [AutomationController],
  providers: [AutomationEngineService, AutomationRulesService],
  exports: [AutomationEngineService],
})
export class AutomationModule implements OnModuleInit {
  constructor(
    private readonly engine: AutomationEngineService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerHandler(AUTOMATION_TASK_TYPE, (payload) => this.engine.handle(payload));
  }
}
