import { Body, Controller, Delete, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductOptionsService } from "./product-options.service";
import {
  createProductOptionSchema,
  createProductOptionValueSchema,
  updateProductOptionSchema,
  updateProductOptionValueSchema,
  type CreateProductOptionDto,
  type CreateProductOptionValueDto,
  type UpdateProductOptionDto,
  type UpdateProductOptionValueDto,
} from "./dto";

@ApiTags("catalog")
@Controller("admin/products/:productId/options")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class ProductOptionsController {
  constructor(private readonly options: ProductOptionsService) {}

  @Post()
  create(@Param("productId") productId: string, @Body(new ZodValidationPipe(createProductOptionSchema)) body: CreateProductOptionDto, @Req() req: Request) {
    return this.options.createOption(productId, body, req.staff!);
  }

  @Patch(":optionId")
  update(
    @Param("productId") productId: string,
    @Param("optionId") optionId: string,
    @Body(new ZodValidationPipe(updateProductOptionSchema)) body: UpdateProductOptionDto,
    @Req() req: Request,
  ) {
    return this.options.updateOption(productId, optionId, body, req.staff!);
  }

  @Delete(":optionId")
  remove(@Param("productId") productId: string, @Param("optionId") optionId: string, @Req() req: Request) {
    return this.options.removeOption(productId, optionId, req.staff!);
  }

  @Post(":optionId/values")
  createValue(
    @Param("productId") productId: string,
    @Param("optionId") optionId: string,
    @Body(new ZodValidationPipe(createProductOptionValueSchema)) body: CreateProductOptionValueDto,
    @Req() req: Request,
  ) {
    return this.options.createValue(productId, optionId, body, req.staff!);
  }

  @Patch(":optionId/values/:valueId")
  updateValue(
    @Param("productId") productId: string,
    @Param("optionId") optionId: string,
    @Param("valueId") valueId: string,
    @Body(new ZodValidationPipe(updateProductOptionValueSchema)) body: UpdateProductOptionValueDto,
    @Req() req: Request,
  ) {
    return this.options.updateValue(productId, optionId, valueId, body, req.staff!);
  }

  @Delete(":optionId/values/:valueId")
  removeValue(@Param("productId") productId: string, @Param("optionId") optionId: string, @Param("valueId") valueId: string, @Req() req: Request) {
    return this.options.removeValue(productId, optionId, valueId, req.staff!);
  }
}
