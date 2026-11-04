import { Module, type OnModuleInit } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { SchedulerService } from "../queue/scheduler.service";
import { NotificationDriversService } from "./notification-drivers.service";
import { NotificationsService } from "./notifications.service";
import { NotificationDispatchService } from "./notification-dispatch.service";
import { NotificationTemplatesService } from "./notification-templates.service";
import { NotificationTemplatesController } from "./notification-templates.controller";
import { NotificationChannelRulesService } from "./notification-channel-rules.service";
import { NotificationChannelRulesController } from "./notification-channel-rules.controller";
import { NotificationLogsController } from "./notification-logs.controller";
import { StaffNotificationsService } from "./staff-notifications.service";
import { StaffNotificationsController } from "./staff-notifications.controller";

/**
 * Milestone 7 (docs/PROJECT_SPEC.md §16 M7). `NotificationsService` is the
 * one export other modules (checkout, orders-lifecycle, customer-auth)
 * inject to enqueue a customer-facing notification; everything else here is
 * this module's own admin/staff surface. The dispatch sweep registers with
 * `SchedulerService` the same way M2/M3's recurring sweeps did.
 */
@Module({
  imports: [ProvidersModule],
  controllers: [NotificationTemplatesController, NotificationChannelRulesController, NotificationLogsController, StaffNotificationsController],
  providers: [
    NotificationDriversService,
    NotificationsService,
    NotificationDispatchService,
    NotificationTemplatesService,
    NotificationChannelRulesService,
    StaffNotificationsService,
  ],
  exports: [NotificationsService, StaffNotificationsService],
})
export class NotificationsModule implements OnModuleInit {
  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("notifications.dispatch", () => this.dispatch.runSweep().then(() => undefined));
  }
}
