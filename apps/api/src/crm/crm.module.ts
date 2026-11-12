import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { RfmService } from "./rfm.service";
import { RfmController } from "./crm.controller";

/** CRM analytics (docs/PROJECT_SPEC.md §16 M13): nightly RFM scores and segment presets. */
@Module({
  controllers: [RfmController],
  providers: [RfmService],
  exports: [RfmService],
})
export class CrmModule implements OnModuleInit {
  constructor(
    private readonly scheduler: SchedulerService,
    private readonly rfm: RfmService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("crm.rfm_nightly", () => this.rfm.runIfDue());
  }
}
