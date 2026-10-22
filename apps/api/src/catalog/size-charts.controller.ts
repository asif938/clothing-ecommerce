import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SizeChartsService } from "./size-charts.service";
import { createSizeChartSchema, updateSizeChartSchema, type CreateSizeChartDto, type UpdateSizeChartDto } from "./dto";

@ApiTags("catalog")
@Controller("admin/size-charts")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class SizeChartsController {
  constructor(private readonly sizeCharts: SizeChartsService) {}

  @Get()
  list() {
    return this.sizeCharts.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.sizeCharts.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSizeChartSchema)) body: CreateSizeChartDto, @Req() req: Request) {
    return this.sizeCharts.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateSizeChartSchema)) body: UpdateSizeChartDto, @Req() req: Request) {
    return this.sizeCharts.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.sizeCharts.remove(id, req.staff!);
  }
}
