import { Body, Controller, Delete, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductVariantsService } from "./product-variants.service";
import { bulkUpdateVariantsSchema, updateVariantSchema, type BulkUpdateVariantsDto, type UpdateVariantDto } from "./dto";

@ApiTags("catalog")
@Controller("admin/products/:productId/variants")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class ProductVariantsController {
  constructor(private readonly variants: ProductVariantsService) {}

  @Post("generate")
  generate(@Param("productId") productId: string, @Req() req: Request) {
    return this.variants.generateMatrix(productId, req.staff!);
  }

  @Patch("bulk")
  bulkUpdate(@Param("productId") productId: string, @Body(new ZodValidationPipe(bulkUpdateVariantsSchema)) body: BulkUpdateVariantsDto, @Req() req: Request) {
    return this.variants.bulkUpdate(productId, body, req.staff!);
  }

  @Patch(":variantId")
  update(@Param("productId") productId: string, @Param("variantId") variantId: string, @Body(new ZodValidationPipe(updateVariantSchema)) body: UpdateVariantDto, @Req() req: Request) {
    return this.variants.update(productId, variantId, body, req.staff!);
  }

  @Delete(":variantId")
  remove(@Param("productId") productId: string, @Param("variantId") variantId: string, @Req() req: Request) {
    return this.variants.remove(productId, variantId, req.staff!);
  }
}
