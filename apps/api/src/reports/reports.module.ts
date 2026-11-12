import { Module, type OnModuleInit } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { FinanceModule } from "../finance/finance.module";
import { SchedulerService } from "../queue/scheduler.service";
import { ReportsService } from "./reports.service";
import { ReportsController } from "./reports.controller";
import { ScheduledReportsService } from "./scheduled-reports.service";
import { AnomalyAlertsService } from "./anomaly-alerts.service";
import { AnomalyAlertsController, ScheduledReportsController } from "./scheduled-reports.controller";

/** Core reports (M8) plus M12's scheduled email reports and anomaly alerts, both driven by recurring scheduler handlers. */
@Module({
  imports: [NotificationsModule, FinanceModule],
  controllers: [ScheduledReportsController, AnomalyAlertsController, ReportsController],
  providers: [ReportsService, ScheduledReportsService, AnomalyAlertsService],
  exports: [AnomalyAlertsService],
})
export class ReportsModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledReportsService,
    private readonly anomalies: AnomalyAlertsService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("reports.scheduled_email", () => this.scheduled.runDue().then(() => undefined));
    this.scheduler.registerRecurring("alerts.anomaly_sweep", () => this.anomalies.runSweep().then(() => undefined));
  }
}
