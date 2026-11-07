import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BundleItemsService } from "./bundle-items.service";
import { addBundleItemSchema, updateBundleItemSchema, type AddBundleItemDto, type UpdateBundleItemDto } from "./dto";

@ApiTags("catalog")
@Controller("admin/products/:productId/bundle-items")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class BundleItemsController {
  constructor(private readonly bundleItems: BundleItemsService) {}

  @Get()
  list(@Param("productId") productId: string) {
    return this.bundleItems.list(productId);
  }

  @Post()
  add(@Param("productId") productId: string, @Body(new ZodValidationPipe(addBundleItemSchema)) body: AddBundleItemDto, @Req() req: Request) {
    return this.bundleItems.add(productId, body, req.staff!);
  }

  @Patch(":itemId")
  update(@Param("productId") productId: string, @Param("itemId") itemId: string, @Body(new ZodValidationPipe(updateBundleItemSchema)) body: UpdateBundleItemDto, @Req() req: Request) {
    return this.bundleItems.update(productId, itemId, body, req.staff!);
  }

  @Delete(":itemId")
  remove(@Param("productId") productId: string, @Param("itemId") itemId: string, @Req() req: Request) {
    return this.bundleItems.remove(productId, itemId, req.staff!);
  }
}
