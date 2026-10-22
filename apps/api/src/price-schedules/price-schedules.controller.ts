import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PriceSchedulesService } from "./price-schedules.service";
import { createPriceScheduleSchema, type CreatePriceScheduleDto } from "./dto";

@ApiTags("catalog")
@Controller("admin/price-schedules")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class PriceSchedulesController {
  constructor(private readonly priceSchedules: PriceSchedulesService) {}

  @Get()
  list() {
    return this.priceSchedules.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createPriceScheduleSchema)) body: CreatePriceScheduleDto, @Req() req: Request) {
    return this.priceSchedules.create(body, req.staff!);
  }

  @Delete(":id")
  cancel(@Param("id") id: string, @Req() req: Request) {
    return this.priceSchedules.cancel(id, req.staff!);
  }
}
