import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { DiscountsService } from "./discounts.service";
import { FlashSalesService } from "./flash-sales.service";
import { createDiscountSchema, createFlashSaleSchema, updateDiscountSchema, updateFlashSaleSchema, type CreateDiscountDto, type CreateFlashSaleDto, type UpdateDiscountDto, type UpdateFlashSaleDto } from "./dto";

/** Discounts & basic flash sales — the engine's admin CRUD (docs/PROJECT_SPEC.md §16 M5); the "full UI" (bulk unique codes, visual campaign builder) is M8's job, see docs/DECISIONS.md. */
@ApiTags("discounts")
@Controller("admin/discounts")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("discounts.manage")
export class DiscountsController {
  constructor(private readonly discounts: DiscountsService) {}

  @Get()
  list() {
    return this.discounts.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.discounts.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createDiscountSchema)) body: CreateDiscountDto, @Req() req: Request) {
    return this.discounts.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateDiscountSchema)) body: UpdateDiscountDto, @Req() req: Request) {
    return this.discounts.update(id, body, req.staff!);
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.discounts.remove(id, req.staff!);
    return { ok: true };
  }
}

@ApiTags("discounts")
@Controller("admin/flash-sales")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("discounts.manage")
export class FlashSalesController {
  constructor(private readonly flashSales: FlashSalesService) {}

  @Get()
  list() {
    return this.flashSales.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.flashSales.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createFlashSaleSchema)) body: CreateFlashSaleDto, @Req() req: Request) {
    return this.flashSales.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateFlashSaleSchema)) body: UpdateFlashSaleDto, @Req() req: Request) {
    return this.flashSales.update(id, body, req.staff!);
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.flashSales.remove(id, req.staff!);
    return { ok: true };
  }
}
