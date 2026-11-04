import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { listTrackingLogsQuerySchema, type ListTrackingLogsQueryDto } from "./dto";

/** §10.5 "Event delivery log in admin" — lets staff confirm the acceptance scenario directly: filter by `eventId` and see one row per provider, all sharing the client pixel's event id. */
@ApiTags("tracking")
@Controller("admin/tracking/logs")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reports.read")
export class TrackingLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(listTrackingLogsQuerySchema)) query: ListTrackingLogsQueryDto) {
    const where = {
      ...(query.eventId ? { eventId: query.eventId } : {}),
      ...(query.eventName ? { eventName: query.eventName } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.trackingEventLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.trackingEventLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}
