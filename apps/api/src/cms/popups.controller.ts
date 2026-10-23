import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PopupsService } from "./popups.service";
import { createPopupSchema, updatePopupSchema, type CreatePopupDto, type UpdatePopupDto } from "./dto";

@ApiTags("cms")
@Controller("admin/cms/popups")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("cms.manage")
export class PopupsController {
  constructor(private readonly popups: PopupsService) {}

  @Get()
  list() {
    return this.popups.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createPopupSchema)) body: CreatePopupDto, @Req() req: Request) {
    return this.popups.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updatePopupSchema)) body: UpdatePopupDto, @Req() req: Request) {
    return this.popups.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.popups.remove(id, req.staff!);
  }
}
