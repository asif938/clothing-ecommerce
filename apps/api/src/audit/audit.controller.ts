import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { PrismaService } from "../prisma/prisma.service";

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

@ApiTags("audit")
@Controller("admin/audit-logs")
@UseGuards(StaffAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions("audit.read")
  async list(
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("actorId") actorId?: string,
    @Query("page") page = "1",
    @Query("pageSize") pageSize = String(PAGE_SIZE_DEFAULT),
  ) {
    const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
    const sizeNum = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(pageSize, 10) || PAGE_SIZE_DEFAULT));

    const where = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * sizeNum,
        take: sizeNum,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page: pageNum, pageSize: sizeNum };
  }
}
