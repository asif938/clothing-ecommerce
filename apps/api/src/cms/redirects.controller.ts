import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RedirectsService } from "./redirects.service";
import { createRedirectSchema, updateRedirectSchema, type CreateRedirectDto, type UpdateRedirectDto } from "./dto";

@ApiTags("cms")
@Controller("admin/cms/redirects")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("cms.manage")
export class RedirectsController {
  constructor(private readonly redirects: RedirectsService) {}

  @Get()
  list() {
    return this.redirects.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createRedirectSchema)) body: CreateRedirectDto, @Req() req: Request) {
    return this.redirects.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateRedirectSchema)) body: UpdateRedirectDto, @Req() req: Request) {
    return this.redirects.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.redirects.remove(id, req.staff!);
  }
}
