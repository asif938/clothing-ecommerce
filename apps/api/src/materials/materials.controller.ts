import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BomService } from "./bom.service";
import { MaterialsService } from "./materials.service";
import {
  adjustMaterialSchema,
  createMaterialSchema,
  listMaterialsQuerySchema,
  receiveMaterialSchema,
  requirementsSchema,
  setBomSchema,
  updateMaterialSchema,
  type AdjustMaterialDto,
  type CreateMaterialDto,
  type ListMaterialsQueryDto,
  type ReceiveMaterialDto,
  type RequirementsDto,
  type SetBomDto,
  type UpdateMaterialDto,
} from "./dto";

@ApiTags("materials")
@Controller("admin/materials")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("materials.manage")
export class MaterialsController {
  constructor(
    private readonly materials: MaterialsService,
    private readonly bom: BomService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(listMaterialsQuerySchema)) query: ListMaterialsQueryDto) {
    return this.materials.list(query);
  }

  /** What a production run would need versus stock — declared before `:id` so it isn't read as an id. */
  @Post("requirements")
  requirements(@Body(new ZodValidationPipe(requirementsSchema)) body: RequirementsDto) {
    return this.bom.requirements(body);
  }

  @Get("requirements/purchase-orders/:id")
  purchaseOrderRequirements(@Param("id") id: string) {
    return this.bom.requirementsForPurchaseOrder(id);
  }

  @Get("bom/products/:productId")
  getBom(@Param("productId") productId: string) {
    return this.bom.get(productId);
  }

  @Put("bom/products/:productId")
  setBom(@Param("productId") productId: string, @Body(new ZodValidationPipe(setBomSchema)) body: SetBomDto, @Req() req: Request) {
    return this.bom.set(productId, body, req.staff!);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.materials.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createMaterialSchema)) body: CreateMaterialDto, @Req() req: Request) {
    return this.materials.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateMaterialSchema)) body: UpdateMaterialDto, @Req() req: Request) {
    return this.materials.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.materials.remove(id, req.staff!);
  }

  @Post(":id/receive")
  receive(@Param("id") id: string, @Body(new ZodValidationPipe(receiveMaterialSchema)) body: ReceiveMaterialDto, @Req() req: Request) {
    return this.materials.receive(id, body, req.staff!);
  }

  @Post(":id/adjust")
  adjust(@Param("id") id: string, @Body(new ZodValidationPipe(adjustMaterialSchema)) body: AdjustMaterialDto, @Req() req: Request) {
    return this.materials.adjust(id, body, req.staff!);
  }
}
