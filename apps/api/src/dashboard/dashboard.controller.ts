import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DashboardService } from "./dashboard.service";
import { dashboardQuerySchema, type DashboardQueryDto } from "./dto";

@ApiTags("dashboard")
@Controller("admin/dashboard")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reports.read")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQueryDto) {
    return this.dashboard.getKpis(query);
  }
}
