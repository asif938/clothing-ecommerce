import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { listNotificationLogsQuerySchema, type ListNotificationLogsQueryDto } from "./dto";

@ApiTags("notifications")
@Controller("admin/notifications/logs")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("notifications.manage")
export class NotificationLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(listNotificationLogsQuerySchema)) query: ListNotificationLogsQueryDto) {
    const where = {
      ...(query.event ? { event: query.event as never } : {}),
      ...(query.channel ? { channel: query.channel as never } : {}),
      ...(query.status ? { status: query.status as never } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.notificationLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
