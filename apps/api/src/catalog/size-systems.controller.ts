import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SizeSystemsService } from "./size-systems.service";
import { createSizeSystemSchema, updateSizeSystemSchema, type CreateSizeSystemDto, type UpdateSizeSystemDto } from "./dto";

@ApiTags("catalog")
@Controller("admin/size-systems")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("catalog.manage")
export class SizeSystemsController {
  constructor(private readonly sizeSystems: SizeSystemsService) {}

  @Get()
  list() {
    return this.sizeSystems.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.sizeSystems.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSizeSystemSchema)) body: CreateSizeSystemDto, @Req() req: Request) {
    return this.sizeSystems.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateSizeSystemSchema)) body: UpdateSizeSystemDto, @Req() req: Request) {
    return this.sizeSystems.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.sizeSystems.remove(id, req.staff!);
  }
}
