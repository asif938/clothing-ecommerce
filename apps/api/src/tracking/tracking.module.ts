import { Module, type OnModuleInit } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { SchedulerService } from "../queue/scheduler.service";
import { TrackingDriversService } from "./tracking-drivers.service";
import { TrackingService } from "./tracking.service";
import { TrackingDispatchService } from "./tracking-dispatch.service";
import { TrackingLogsController } from "./tracking-logs.controller";

@Module({
  imports: [ProvidersModule],
  controllers: [TrackingLogsController],
  providers: [TrackingDriversService, TrackingService, TrackingDispatchService],
  exports: [TrackingService],
})
export class TrackingModule implements OnModuleInit {
  constructor(
    private readonly dispatch: TrackingDispatchService,
    private readonly scheduler: SchedulerService,
  ) {}

  onModuleInit(): void {
    this.scheduler.registerRecurring("tracking.dispatch", () => this.dispatch.runSweep().then(() => undefined));
  }
}
