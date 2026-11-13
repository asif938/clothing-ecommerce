import { Logger, Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { CustomerContextModule } from "../customer-auth/customer-context.module";
import { ExperimentsCoreModule } from "./experiments-core.module";
import { ExperimentAssignmentsService } from "./experiment-assignments.service";
import { ExperimentsService } from "./experiments.service";
import { ExperimentsController, StoreExperimentsController } from "./experiments.controller";

/** A/B testing for blocks, announcement bars and offers (docs/PROJECT_SPEC.md §9.1, §16 M14). */
@Module({
  imports: [ExperimentsCoreModule, CustomerContextModule],
  controllers: [ExperimentsController, StoreExperimentsController],
  providers: [ExperimentsService],
  exports: [ExperimentsService],
})
export class ExperimentsModule implements OnModuleInit {
  private readonly logger = new Logger(ExperimentsModule.name);

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly assignments: ExperimentAssignmentsService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("experiments.purchase_conversions", async () => {
      const inserted = await this.assignments.conversionSweep();
      if (inserted > 0) this.logger.log(`Recorded ${inserted} A/B test purchase conversion(s)`);
    });
  }
}
