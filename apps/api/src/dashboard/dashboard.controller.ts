import { Body, Controller, Delete, Get, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DashboardService } from "./dashboard.service";
import { DashboardLayoutsService } from "./dashboard-layouts.service";
import { PrismaService } from "../prisma/prisma.service";
import { dashboardQuerySchema, layoutScopeQuerySchema, saveLayoutSchema, type DashboardQueryDto, type LayoutScopeQueryDto, type SaveLayoutDto } from "./dto";

@ApiTags("dashboard")
@Controller("admin/dashboard")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reports.read")
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly layouts: DashboardLayoutsService,
    private readonly prisma: PrismaService,
  ) {}

  /** Role picker for the shared-layout editor. */
  @Get("layout/roles")
  @RequirePermissions("reports.read", "dashboard.layouts.manage")
  roles() {
    return this.prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  @Get()
  get(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto) {
    return this.dashboard.getKpis(query);
  }

  /** The viewer's resolved widget layout + the catalog they can pick from (§16 M12 custom dashboards). */
  @Get("layout")
  layout(@Req() req: Request) {
    return this.layouts.resolve(req.staff!);
  }

  /** A role's or the store default's saved layout, for the layout editor. */
  @Get("layout/shared")
  @RequirePermissions("reports.read", "dashboard.layouts.manage")
  shared(@Query(new ZodValidationPipe(layoutScopeQuerySchema)) query: LayoutScopeQueryDto) {
    return this.layouts.getShared(query.scope === "role" ? "role" : "default", query.roleId);
  }

  /** scope "staff" saves your own layout; "role"/"default" need `dashboard.layouts.manage` (checked in the service). */
  @Put("layout")
  save(@Body(new ZodValidationPipe(saveLayoutSchema)) body: SaveLayoutDto, @Req() req: Request) {
    return this.layouts.save(body, req.staff!);
  }

  @Delete("layout")
  reset(@Query(new ZodValidationPipe(layoutScopeQuerySchema)) query: LayoutScopeQueryDto, @Req() req: Request) {
    return this.layouts.reset(query, req.staff!);
  }
}
