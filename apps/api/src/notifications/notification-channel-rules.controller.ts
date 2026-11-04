import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotificationChannelRulesService } from "./notification-channel-rules.service";
import { updateChannelRuleSchema, type UpdateChannelRuleDto } from "./dto";

@ApiTags("notifications")
@Controller("admin/notifications/channel-rules")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("notifications.manage")
export class NotificationChannelRulesController {
  constructor(private readonly rules: NotificationChannelRulesService) {}

  @Get()
  list() {
    return this.rules.list();
  }

  @Patch(":event")
  update(@Param("event") event: string, @Body(new ZodValidationPipe(updateChannelRuleSchema)) body: UpdateChannelRuleDto) {
    return this.rules.update(event, body);
  }
}
