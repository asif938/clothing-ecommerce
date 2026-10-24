import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ShippingService } from "./shipping.service";
import { createRateSchema, createZoneSchema, updateRateSchema, updateZoneSchema, type CreateRateDto, type CreateZoneDto, type UpdateRateDto, type UpdateZoneDto } from "./dto";

/** Shipping zones & rates editor (docs/PROJECT_SPEC.md §16 M5). */
@ApiTags("shipping")
@Controller("admin/shipping")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("shipping.manage")
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get("zones")
  listZones() {
    return this.shipping.listZones();
  }

  @Get("zones/:id")
  getZone(@Param("id") id: string) {
    return this.shipping.getZone(id);
  }

  @Post("zones")
  createZone(@Body(new ZodValidationPipe(createZoneSchema)) body: CreateZoneDto, @Req() req: Request) {
    return this.shipping.createZone(body, req.staff!);
  }

  @Patch("zones/:id")
  updateZone(@Param("id") id: string, @Body(new ZodValidationPipe(updateZoneSchema)) body: UpdateZoneDto, @Req() req: Request) {
    return this.shipping.updateZone(id, body, req.staff!);
  }

  @Delete("zones/:id")
  async deleteZone(@Param("id") id: string, @Req() req: Request) {
    await this.shipping.deleteZone(id, req.staff!);
    return { ok: true };
  }

  @Post("zones/:zoneId/rates")
  createRate(@Param("zoneId") zoneId: string, @Body(new ZodValidationPipe(createRateSchema)) body: CreateRateDto, @Req() req: Request) {
    return this.shipping.createRate(zoneId, body, req.staff!);
  }

  @Patch("rates/:id")
  updateRate(@Param("id") id: string, @Body(new ZodValidationPipe(updateRateSchema)) body: UpdateRateDto, @Req() req: Request) {
    return this.shipping.updateRate(id, body, req.staff!);
  }

  @Delete("rates/:id")
  async deleteRate(@Param("id") id: string, @Req() req: Request) {
    await this.shipping.deleteRate(id, req.staff!);
    return { ok: true };
  }
}
