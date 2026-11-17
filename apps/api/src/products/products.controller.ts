import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { stripCostPrice } from "./cost-price.filter";
import { ProductsService } from "./products.service";
import {
  bulkDeleteProductsSchema,
  type BulkDeleteProductsDto,
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
  type CreateProductDto,
  type ListProductsQueryDto,
  type UpdateProductDto,
} from "./dto";

@ApiTags("catalog")
@Controller("admin/products")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(listProductsQuerySchema)) query: ListProductsQueryDto) {
    // The list projection never selects costPrice in the first place (see
    // ProductsService.list) — nothing to filter.
    return await this.products.list(query);
  }

  // Registered before `:id` so "trash" is never read as a product id.
  @Get("trash")
  listTrash() {
    return this.products.listTrash();
  }

  @Post("restore")
  restoreMany(@Body(new ZodValidationPipe(bulkDeleteProductsSchema)) body: BulkDeleteProductsDto, @Req() req: Request) {
    return this.products.restoreMany(body.ids, req.staff!);
  }

  /** Irreversible, so it needs its own permission on top of `catalog.manage` (method-level metadata replaces the class-level list). */
  @Post("purge")
  @RequirePermissions("catalog.manage", "catalog.purge")
  purgeMany(@Body(new ZodValidationPipe(bulkDeleteProductsSchema)) body: BulkDeleteProductsDto, @Req() req: Request) {
    return this.products.purgeMany(body.ids, req.staff!);
  }

  @Get(":id")
  async get(@Param("id") id: string, @Req() req: Request) {
    return stripCostPrice(await this.products.get(id), req.staff!);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createProductSchema)) body: CreateProductDto, @Req() req: Request) {
    return this.products.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductDto, @Req() req: Request) {
    return this.products.update(id, body, req.staff!);
  }

  @Post("bulk-delete")
  removeMany(@Body(new ZodValidationPipe(bulkDeleteProductsSchema)) body: BulkDeleteProductsDto, @Req() req: Request) {
    return this.products.removeMany(body.ids, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.products.remove(id, req.staff!);
  }

  @Get(":id/versions")
  listVersions(@Param("id") id: string) {
    return this.products.listVersions(id);
  }

  @Post(":id/versions/:versionId/restore")
  restoreVersion(@Param("id") id: string, @Param("versionId") versionId: string, @Req() req: Request) {
    return this.products.restoreVersion(id, versionId, req.staff!);
  }
}
