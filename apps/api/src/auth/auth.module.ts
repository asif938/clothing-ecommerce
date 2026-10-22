import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PendingLoginStore } from "./pending-login.store";
import { SessionService } from "./session.service";
import { StaffAuthGuard } from "./staff-auth.guard";

/** @Global: StaffAuthGuard is used by nearly every admin controller. */
@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, PendingLoginStore, StaffAuthGuard],
  exports: [AuthService, SessionService, StaffAuthGuard],
})
export class AuthModule {}
