import { Global, Module } from "@nestjs/common";
import { CronController } from "./cron.controller";
import { QueueService } from "./queue.service";
import { SchedulerService } from "./scheduler.service";

@Global()
@Module({
  controllers: [CronController],
  providers: [QueueService, SchedulerService],
  exports: [QueueService, SchedulerService],
})
export class QueueModule {}
