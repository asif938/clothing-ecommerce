import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CourierAreaMappingService } from "./courier-area-mapping.service";
import { createCourierAreaMappingSchema, updateCourierAreaMappingSchema, type CreateCourierAreaMappingDto, type UpdateCourierAreaMappingDto } from "./dto";

@ApiTags("couriers")
@Controller("admin/courier-area-mapping")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("couriers.manage")
export class CourierAreaMappingController {
  constructor(private readonly mapping: CourierAreaMappingService) {}

  @Get()
  list(@Query("courierProviderInstanceId") courierProviderInstanceId?: string) {
    return this.mapping.list(courierProviderInstanceId);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createCourierAreaMappingSchema)) body: CreateCourierAreaMappingDto, @Req() req: Request) {
    return this.mapping.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCourierAreaMappingSchema)) body: UpdateCourierAreaMappingDto, @Req() req: Request) {
    return this.mapping.update(id, body, req.staff!);
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.mapping.remove(id, req.staff!);
    return { ok: true };
  }
}
