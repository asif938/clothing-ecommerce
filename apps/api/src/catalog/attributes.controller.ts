import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AttributesService } from "./attributes.service";
import {
  createAttributeSchema,
  createAttributeValueSchema,
  updateAttributeSchema,
  updateAttributeValueSchema,
  type CreateAttributeDto,
  type CreateAttributeValueDto,
  type UpdateAttributeDto,
  type UpdateAttributeValueDto,
} from "./dto";

@ApiTags("catalog")
@Controller("admin/attributes")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get()
  list() {
    return this.attributes.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.attributes.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createAttributeSchema)) body: CreateAttributeDto, @Req() req: Request) {
    return this.attributes.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateAttributeSchema)) body: UpdateAttributeDto, @Req() req: Request) {
    return this.attributes.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.attributes.remove(id, req.staff!);
  }

  @Post(":id/values")
  createValue(@Param("id") id: string, @Body(new ZodValidationPipe(createAttributeValueSchema)) body: CreateAttributeValueDto, @Req() req: Request) {
    return this.attributes.createValue(id, body, req.staff!);
  }

  @Patch(":id/values/:valueId")
  updateValue(
    @Param("id") id: string,
    @Param("valueId") valueId: string,
    @Body(new ZodValidationPipe(updateAttributeValueSchema)) body: UpdateAttributeValueDto,
    @Req() req: Request,
  ) {
    return this.attributes.updateValue(id, valueId, body, req.staff!);
  }

  @Delete(":id/values/:valueId")
  removeValue(@Param("id") id: string, @Param("valueId") valueId: string, @Req() req: Request) {
    return this.attributes.removeValue(id, valueId, req.staff!);
  }
}
