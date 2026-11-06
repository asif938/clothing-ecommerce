import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { LaunchChecklistService } from "./launch-checklist.service";

@ApiTags("launch-checklist")
@Controller("admin/launch-checklist")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("launch_checklist.read")
export class LaunchChecklistController {
  constructor(private readonly checklist: LaunchChecklistService) {}

  @Get()
  async get() {
    const items = await this.checklist.compute();
    return { items, allDone: items.every((item) => item.done), pendingOwnerActions: items.filter((item) => !item.done && item.ownerAction).length };
  }
}
