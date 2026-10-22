import { Body, Controller, Delete, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductRelationsService } from "./product-relations.service";
import { addProductRelationSchema, type AddProductRelationDto } from "./dto";

@ApiTags("catalog")
@Controller("admin/products/:productId/relations")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class ProductRelationsController {
  constructor(private readonly relations: ProductRelationsService) {}

  @Post()
  add(@Param("productId") productId: string, @Body(new ZodValidationPipe(addProductRelationSchema)) body: AddProductRelationDto, @Req() req: Request) {
    return this.relations.add(productId, body, req.staff!);
  }

  @Delete(":relationId")
  remove(@Param("productId") productId: string, @Param("relationId") relationId: string, @Req() req: Request) {
    return this.relations.remove(productId, relationId, req.staff!);
  }
}
