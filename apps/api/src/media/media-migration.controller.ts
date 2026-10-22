import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { SuperAdminGuard } from "../common/super-admin.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { createMediaMigrationJobSchema, type CreateMediaMigrationJobDto } from "./dto";
import { MediaMigrationService } from "./media-migration.service";

/** "Move media to provider X" (change request 2026-10-22, §7) — Super Admin only, not permission-gated like the rest of the admin API. */
@ApiTags("media")
@Controller("admin/media-migrations")
@UseGuards(StaffAuthGuard, SuperAdminGuard)
export class MediaMigrationController {
  constructor(private readonly migrations: MediaMigrationService) {}

  @Get()
  list() {
    return this.migrations.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.migrations.get(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(createMediaMigrationJobSchema)) body: CreateMediaMigrationJobDto, @Req() req: Request) {
    return this.migrations.create(body, req.staff!);
  }
}
