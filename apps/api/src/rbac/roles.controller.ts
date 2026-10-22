import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PERMISSIONS } from "@clothing/shared/permissions";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { createRoleSchema, updateRoleSchema, type CreateRoleDto, type UpdateRoleDto } from "./dto";
import { RolesService } from "./roles.service";

@ApiTags("rbac")
@Controller("admin")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("rbac.manage")
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get("permissions")
  listPermissions() {
    return PERMISSIONS;
  }

  @Get("roles")
  list() {
    return this.roles.list();
  }

  @Post("roles")
  create(@Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleDto, @Req() req: Request) {
    return this.roles.create(body, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }

  @Patch("roles/:id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleDto, @Req() req: Request) {
    return this.roles.update(id, body, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }

  @Delete("roles/:id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.roles.delete(id, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }
}
