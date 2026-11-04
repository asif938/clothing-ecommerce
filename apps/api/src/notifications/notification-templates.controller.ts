import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotificationTemplatesService } from "./notification-templates.service";
import {
  previewTemplateSchema,
  testSendSchema,
  updateMessageTemplateSchema,
  type PreviewTemplateDto,
  type TestSendDto,
  type UpdateMessageTemplateDto,
} from "./dto";
import type { NotificationChannel } from "@clothing/shared/notifications";

@ApiTags("notifications")
@Controller("admin/notifications/templates")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("notifications.manage")
export class NotificationTemplatesController {
  constructor(private readonly templates: NotificationTemplatesService) {}

  @Get()
  list() {
    return this.templates.list();
  }

  @Patch(":event/:channel")
  update(
    @Param("event") event: string,
    @Param("channel") channel: NotificationChannel,
    @Body(new ZodValidationPipe(updateMessageTemplateSchema)) body: UpdateMessageTemplateDto,
  ) {
    return this.templates.update(event, channel, body);
  }

  @Post("preview")
  preview(@Body(new ZodValidationPipe(previewTemplateSchema)) body: PreviewTemplateDto) {
    return this.templates.preview(body);
  }

  @Post("test-send")
  testSend(@Body(new ZodValidationPipe(testSendSchema)) body: TestSendDto) {
    return this.templates.testSend(body);
  }
}
