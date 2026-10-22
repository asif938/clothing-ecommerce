import { Body, Controller, Delete, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProductMediaService } from "./product-media.service";
import { addProductMediaSchema, updateProductMediaSchema, type AddProductMediaDto, type UpdateProductMediaDto } from "./dto";

@ApiTags("catalog")
@Controller("admin/products/:productId/media")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class ProductMediaController {
  constructor(private readonly media: ProductMediaService) {}

  @Post()
  add(@Param("productId") productId: string, @Body(new ZodValidationPipe(addProductMediaSchema)) body: AddProductMediaDto, @Req() req: Request) {
    return this.media.add(productId, body, req.staff!);
  }

  @Patch(":entryId")
  update(@Param("productId") productId: string, @Param("entryId") entryId: string, @Body(new ZodValidationPipe(updateProductMediaSchema)) body: UpdateProductMediaDto, @Req() req: Request) {
    return this.media.update(productId, entryId, body, req.staff!);
  }

  @Delete(":entryId")
  remove(@Param("productId") productId: string, @Param("entryId") entryId: string, @Req() req: Request) {
    return this.media.remove(productId, entryId, req.staff!);
  }
}
