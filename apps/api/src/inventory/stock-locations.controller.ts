import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StockLocationsService } from "./stock-locations.service";
import { createStockLocationSchema, updateStockLocationSchema, type CreateStockLocationDto, type UpdateStockLocationDto } from "./dto";

@ApiTags("inventory")
@Controller("admin/stock-locations")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("inventory.manage")
export class StockLocationsController {
  constructor(private readonly locations: StockLocationsService) {}

  @Get()
  list() {
    return this.locations.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createStockLocationSchema)) body: CreateStockLocationDto, @Req() req: Request) {
    return this.locations.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateStockLocationSchema)) body: UpdateStockLocationDto, @Req() req: Request) {
    return this.locations.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.locations.remove(id, req.staff!);
  }
}
