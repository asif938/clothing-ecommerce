import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CollectionsService } from "./collections.service";
import {
  addCollectionProductSchema,
  createCollectionSchema,
  previewRulesSchema,
  reorderCollectionProductsSchema,
  updateCollectionSchema,
  type AddCollectionProductDto,
  type CreateCollectionDto,
  type PreviewRulesDto,
  type ReorderCollectionProductsDto,
  type UpdateCollectionDto,
} from "./dto";

@ApiTags("catalog")
@Controller("admin/collections")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  list() {
    return this.collections.list();
  }

  @Post("preview")
  preview(@Body(new ZodValidationPipe(previewRulesSchema)) body: PreviewRulesDto) {
    return this.collections.previewCount(body.rules);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.collections.getWithProducts(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createCollectionSchema)) body: CreateCollectionDto, @Req() req: Request) {
    return this.collections.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateCollectionSchema)) body: UpdateCollectionDto, @Req() req: Request) {
    return this.collections.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.collections.remove(id, req.staff!);
  }

  @Post(":id/products")
  addProduct(@Param("id") id: string, @Body(new ZodValidationPipe(addCollectionProductSchema)) body: AddCollectionProductDto, @Req() req: Request) {
    return this.collections.addProduct(id, body, req.staff!);
  }

  @Patch(":id/products/reorder")
  reorder(@Param("id") id: string, @Body(new ZodValidationPipe(reorderCollectionProductsSchema)) body: ReorderCollectionProductsDto, @Req() req: Request) {
    return this.collections.reorderProducts(id, body, req.staff!);
  }

  @Delete(":id/products/:productId")
  removeProduct(@Param("id") id: string, @Param("productId") productId: string, @Req() req: Request) {
    return this.collections.removeProduct(id, productId, req.staff!);
  }
}
