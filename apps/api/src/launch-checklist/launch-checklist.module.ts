import { Module } from "@nestjs/common";
import { LaunchChecklistController } from "./launch-checklist.controller";
import { LaunchChecklistService } from "./launch-checklist.service";

@Module({
  controllers: [LaunchChecklistController],
  providers: [LaunchChecklistService],
})
export class LaunchChecklistModule {}
