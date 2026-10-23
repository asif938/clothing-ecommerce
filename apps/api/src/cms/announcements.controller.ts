import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AnnouncementsService } from "./announcements.service";
import { createAnnouncementSchema, updateAnnouncementSchema, type CreateAnnouncementDto, type UpdateAnnouncementDto } from "./dto";

@ApiTags("cms")
@Controller("admin/cms/announcements")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("cms.manage")
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  list() {
    return this.announcements.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createAnnouncementSchema)) body: CreateAnnouncementDto, @Req() req: Request) {
    return this.announcements.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateAnnouncementSchema)) body: UpdateAnnouncementDto, @Req() req: Request) {
    return this.announcements.update(id, body, req.staff!);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.announcements.remove(id, req.staff!);
  }
}
