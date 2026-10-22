import { Module, type OnModuleInit } from "@nestjs/common";
import { SchedulerService } from "../queue/scheduler.service";
import { PriceSchedulesController } from "./price-schedules.controller";
import { PriceSchedulesService } from "./price-schedules.service";

/** Scheduled price changes on a variant/product/collection/category/tag (docs/PROJECT_SPEC.md §16 M2). */
@Module({
  controllers: [PriceSchedulesController],
  providers: [PriceSchedulesService],
  exports: [PriceSchedulesService],
})
export class PriceSchedulesModule implements OnModuleInit {
  constructor(
    private readonly priceSchedules: PriceSchedulesService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("price_schedule.sweep", () => this.priceSchedules.runSweep());
  }
}
