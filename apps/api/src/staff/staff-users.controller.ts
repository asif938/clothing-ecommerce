import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { createStaffUserSchema, updateStaffUserSchema, type CreateStaffUserDto, type UpdateStaffUserDto } from "./dto";
import { StaffUsersService } from "./staff-users.service";

@ApiTags("staff")
@Controller("admin/staff")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("staff.manage")
export class StaffUsersController {
  constructor(private readonly staffUsers: StaffUsersService) {}

  @Get()
  list() {
    return this.staffUsers.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createStaffUserSchema)) body: CreateStaffUserDto, @Req() req: Request) {
    return this.staffUsers.create(body, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateStaffUserSchema)) body: UpdateStaffUserDto, @Req() req: Request) {
    return this.staffUsers.update(id, body, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.staffUsers.softDelete(id, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }
}
