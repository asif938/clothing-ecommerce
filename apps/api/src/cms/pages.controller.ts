import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PagesService } from "./pages.service";
import {
  createPageSchema,
  schedulePageSchema,
  updatePageBlocksSchema,
  updatePageSchema,
  type CreatePageDto,
  type SchedulePageDto,
  type UpdatePageBlocksDto,
  type UpdatePageDto,
} from "./dto";

@ApiTags("cms")
@Controller("admin/cms/pages")
@UseGuards(StaffAuthGuard, PermissionsGuard)
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  @RequirePermissions("cms.manage")
  list() {
    return this.pages.list();
  }

  @Get(":id")
  @RequirePermissions("cms.manage")
  get(@Param("id") id: string) {
    return this.pages.get(id);
  }

  @Post()
  @RequirePermissions("cms.manage")
  create(@Body(new ZodValidationPipe(createPageSchema)) body: CreatePageDto, @Req() req: Request) {
    return this.pages.create(body, req.staff!);
  }

  @Patch(":id")
  @RequirePermissions("cms.manage")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updatePageSchema)) body: UpdatePageDto, @Req() req: Request) {
    return this.pages.update(id, body, req.staff!);
  }

  @Patch(":id/blocks")
  @RequirePermissions("cms.manage")
  updateBlocks(@Param("id") id: string, @Body(new ZodValidationPipe(updatePageBlocksSchema)) body: UpdatePageBlocksDto, @Req() req: Request) {
    return this.pages.updateBlocks(id, body, req.staff!);
  }

  @Post(":id/publish")
  @RequirePermissions("cms.publish")
  publish(@Param("id") id: string, @Req() req: Request) {
    return this.pages.publish(id, req.staff!);
  }

  @Post(":id/schedule")
  @RequirePermissions("cms.publish")
  schedule(@Param("id") id: string, @Body(new ZodValidationPipe(schedulePageSchema)) body: SchedulePageDto, @Req() req: Request) {
    return this.pages.schedule(id, body, req.staff!);
  }

  @Delete(":id")
  @RequirePermissions("cms.manage")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.pages.remove(id, req.staff!);
  }

  @Get(":id/versions")
  @RequirePermissions("cms.manage")
  listVersions(@Param("id") id: string) {
    return this.pages.listVersions(id);
  }

  @Post(":id/versions/:versionId/restore")
  @RequirePermissions("cms.manage")
  restoreVersion(@Param("id") id: string, @Param("versionId") versionId: string, @Req() req: Request) {
    return this.pages.restoreVersion(id, versionId, req.staff!);
  }

  @Post(":id/lock")
  @RequirePermissions("cms.manage")
  acquireLock(@Param("id") id: string, @Req() req: Request) {
    return this.pages.acquireLock(id, req.staff!);
  }

  @Post(":id/lock/heartbeat")
  @RequirePermissions("cms.manage")
  heartbeatLock(@Param("id") id: string, @Req() req: Request) {
    return this.pages.heartbeatLock(id, req.staff!);
  }

  @Delete(":id/lock")
  @RequirePermissions("cms.manage")
  releaseLock(@Param("id") id: string, @Req() req: Request) {
    return this.pages.releaseLock(id, req.staff!);
  }
}
