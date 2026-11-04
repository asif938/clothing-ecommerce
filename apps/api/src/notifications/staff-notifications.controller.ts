import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { CurrentStaff } from "../common/current-staff.decorator";
import type { AuthenticatedStaff } from "../common/types";
import { StaffNotificationsService } from "./staff-notifications.service";

/** No `PermissionsGuard`/`@RequirePermissions` here — every staff member reads and clears only their own notifications, so plain authentication is the only check needed. */
@ApiTags("notifications")
@Controller("staff/notifications")
@UseGuards(StaffAuthGuard)
export class StaffNotificationsController {
  constructor(private readonly notifications: StaffNotificationsService) {}

  @Get()
  list(@CurrentStaff() staff: AuthenticatedStaff, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.notifications.listMine(staff.id, Number(page ?? 1), Number(pageSize ?? 20));
  }

  @Post(":id/read")
  async markRead(@CurrentStaff() staff: AuthenticatedStaff, @Param("id") id: string) {
    await this.notifications.markRead(staff.id, id);
    return { ok: true };
  }

  @Post("read-all")
  async markAllRead(@CurrentStaff() staff: AuthenticatedStaff) {
    await this.notifications.markAllRead(staff.id);
    return { ok: true };
  }
}
