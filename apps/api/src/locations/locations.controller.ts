import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { updateAreaSchema, type UpdateAreaDto } from "./dto";

/** Bangladesh locations tree + area management (docs/PROJECT_SPEC.md §5.2). */
@ApiTags("locations")
@Controller("admin/locations")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("locations.manage")
export class LocationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get("divisions")
  listDivisions() {
    return this.prisma.division.findMany({ orderBy: { code: "asc" } });
  }

  @Get("districts")
  listDistricts(@Query("divisionId") divisionId?: string) {
    return this.prisma.district.findMany({
      where: divisionId ? { divisionId } : undefined,
      orderBy: { code: "asc" },
    });
  }

  @Get("areas")
  listAreas(@Query("districtId") districtId?: string, @Query("search") search?: string) {
    return this.prisma.area.findMany({
      where: {
        ...(districtId ? { districtId } : {}),
        ...(search ? { code: { contains: search, mode: "insensitive" } } : {}),
      },
      orderBy: { code: "asc" },
    });
  }

  @Patch("areas/:id")
  async updateArea(@Param("id") id: string, @Body(new ZodValidationPipe(updateAreaSchema)) body: UpdateAreaDto, @Req() req: Request) {
    const before = await this.prisma.area.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.area.update({
      where: { id },
      data: { ...(body.name ? { name: body.name } : {}), ...(body.isActive !== undefined ? { isActive: body.isActive } : {}) },
    });
    await this.audit.record({
      actorType: "staff",
      actorId: req.staff!.id,
      action: "area.update",
      entityType: "area",
      entityId: id,
      before,
      after: updated,
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    return updated;
  }
}
