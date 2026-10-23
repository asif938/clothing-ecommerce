import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MenusService } from "./menus.service";
import { createMenuSchema, updateMenuSchema, type CreateMenuDto, type UpdateMenuDto } from "./dto";

@ApiTags("cms")
@Controller("admin/cms/menus")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("cms.manage")
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  @Get()
  list() {
    return this.menus.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createMenuSchema)) body: CreateMenuDto, @Req() req: Request) {
    return this.menus.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateMenuSchema)) body: UpdateMenuDto, @Req() req: Request) {
    return this.menus.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.menus.remove(id, req.staff!);
  }
}
