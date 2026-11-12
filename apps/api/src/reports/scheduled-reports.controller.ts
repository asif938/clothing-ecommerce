import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ScheduledReportsService } from "./scheduled-reports.service";
import { AnomalyAlertsService } from "./anomaly-alerts.service";
import { SCHEDULABLE_REPORTS } from "./report-catalog";
import { scheduledReportSchema, updateScheduledReportSchema, type ScheduledReportDto, type UpdateScheduledReportDto } from "./scheduled-reports.dto";

@ApiTags("reports")
@Controller("admin/reports/scheduled")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reports.schedule.manage")
export class ScheduledReportsController {
  constructor(private readonly scheduled: ScheduledReportsService) {}

  /** The catalog of schedulable reports, with the permission each needs. */
  @Get("catalog")
  catalog() {
    return Object.entries(SCHEDULABLE_REPORTS).map(([key, def]) => ({ key, ...def }));
  }

  @Get()
  list() {
    return this.scheduled.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(scheduledReportSchema)) body: ScheduledReportDto, @Req() req: Request) {
    return this.scheduled.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateScheduledReportSchema)) body: UpdateScheduledReportDto, @Req() req: Request) {
    return this.scheduled.update(id, body, req.staff!);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.scheduled.remove(id, req.staff!);
  }

  @Post(":id/send-now")
  sendNow(@Param("id") id: string, @Req() req: Request) {
    return this.scheduled.sendNow(id, req.staff!);
  }
}

const listAlertsQuerySchema = z.object({ all: z.coerce.boolean().default(false) });

@ApiTags("reports")
@Controller("admin/alerts")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("reports.read")
export class AnomalyAlertsController {
  constructor(private readonly alerts: AnomalyAlertsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listAlertsQuerySchema)) query: z.infer<typeof listAlertsQuerySchema>) {
    return this.alerts.list(query.all);
  }

  @Post("check")
  check(@Req() req: Request) {
    return this.alerts.checkNow(req.staff!);
  }

  @Post(":id/acknowledge")
  acknowledge(@Param("id") id: string, @Req() req: Request) {
    return this.alerts.acknowledge(id, req.staff!);
  }
}
