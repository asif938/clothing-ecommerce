import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

/** Outbound webhooks (docs/PROJECT_SPEC.md §16 M17); the delivery sweep rides the existing scheduler tick. */
@Module({
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule implements OnModuleInit {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("webhooks.deliver", () => this.webhooks.deliverDue().then(() => undefined));
  }
}
