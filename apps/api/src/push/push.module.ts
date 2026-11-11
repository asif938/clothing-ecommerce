import { Module } from "@nestjs/common";
import { PushService } from "./push.service";
import { StorePushController } from "./store-push.controller";
import { AdminPushController } from "./admin-push.controller";
import { StaffPushController } from "./staff-push.controller";

@Module({
  controllers: [StorePushController, AdminPushController, StaffPushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
