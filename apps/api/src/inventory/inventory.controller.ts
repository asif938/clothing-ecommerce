import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { InventoryService } from "./inventory.service";
import {
  adjustStockSchema,
  barcodeLabelsQuerySchema,
  listInventoryQuerySchema,
  listMovementsQuerySchema,
  updateLowStockThresholdSchema,
  type AdjustStockDto,
  type BarcodeLabelsQueryDto,
  type ListInventoryQueryDto,
  type ListMovementsQueryDto,
  type UpdateLowStockThresholdDto,
} from "./dto";

@ApiTags("inventory")
@Controller("admin/inventory")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("inventory.manage")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listInventoryQuerySchema)) query: ListInventoryQueryDto) {
    return this.inventory.list(query);
  }

  @Get("low-stock")
  lowStock() {
    return this.inventory.lowStock();
  }

  @Get("movements")
  listMovements(@Query(new ZodValidationPipe(listMovementsQuerySchema)) query: ListMovementsQueryDto) {
    return this.inventory.listMovements(query);
  }

  @Get("barcode-labels")
  barcodeLabels(@Query(new ZodValidationPipe(barcodeLabelsQuerySchema)) query: BarcodeLabelsQueryDto) {
    return this.inventory.barcodeLabels(query.variantIds.split(",").map((id) => id.trim()).filter(Boolean));
  }

  @Post("adjust")
  adjust(@Body(new ZodValidationPipe(adjustStockSchema)) body: AdjustStockDto, @Req() req: Request) {
    return this.inventory.adjust(body, req.staff!);
  }

  @Patch(":variantId/:locationId/low-stock-threshold")
  setThreshold(
    @Param("variantId") variantId: string,
    @Param("locationId") locationId: string,
    @Body(new ZodValidationPipe(updateLowStockThresholdSchema)) body: UpdateLowStockThresholdDto,
    @Req() req: Request,
  ) {
    return this.inventory.setLowStockThreshold(variantId, locationId, body.lowStockThreshold, req.staff!);
  }
}
