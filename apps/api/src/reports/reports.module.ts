import { Module, type OnModuleInit } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { FinanceModule } from "../finance/finance.module";
import { SchedulerService } from "../queue/scheduler.service";
import { ReportsService } from "./reports.service";
import { ReportsController } from "./reports.controller";
import { ScheduledReportsService } from "./scheduled-reports.service";
import { AnomalyAlertsService } from "./anomaly-alerts.service";
import { AnomalyAlertsController, ScheduledReportsController } from "./scheduled-reports.controller";
import { CohortsService } from "./cohorts.service";
import { ReportBuilderService } from "./report-builder.service";
import { CohortsController, ReportBuilderController } from "./analytics-reports.controller";

/** Core reports (M8), M12's scheduled email reports and anomaly alerts (recurring scheduler handlers), and M17's cohorts/LTV and report builder. */
@Module({
  imports: [NotificationsModule, FinanceModule],
  controllers: [ScheduledReportsController, AnomalyAlertsController, ReportsController, CohortsController, ReportBuilderController],
  providers: [ReportsService, ScheduledReportsService, AnomalyAlertsService, CohortsService, ReportBuilderService],
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
