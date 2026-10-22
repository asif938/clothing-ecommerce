import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { createMediaFolderSchema, updateMediaFolderSchema, type CreateMediaFolderDto, type UpdateMediaFolderDto } from "./dto";

@ApiTags("media")
@Controller("admin/media-folders")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("media.manage")
export class MediaFoldersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.mediaFolder.findMany({ orderBy: { name: "asc" } });
  }

  @Post()
  async create(@Body(new ZodValidationPipe(createMediaFolderSchema)) body: CreateMediaFolderDto, @Req() req: Request) {
    const folder = await this.prisma.mediaFolder.create({ data: { name: body.name, parentId: body.parentId ?? null } });
    await this.audit.record({
      actorType: "staff",
      actorId: req.staff!.id,
      action: "media_folder.create",
      entityType: "media_folder",
      entityId: folder.id,
      after: { name: body.name },
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    return folder;
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body(new ZodValidationPipe(updateMediaFolderSchema)) body: UpdateMediaFolderDto, @Req() req: Request) {
    const before = await this.prisma.mediaFolder.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.mediaFolder.update({
      where: { id },
      data: { ...(body.name !== undefined ? { name: body.name } : {}), ...(body.parentId !== undefined ? { parentId: body.parentId } : {}) },
    });
    await this.audit.record({
      actorType: "staff",
      actorId: req.staff!.id,
      action: "media_folder.update",
      entityType: "media_folder",
      entityId: id,
      before: { name: before.name },
      after: { name: updated.name },
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
    return updated;
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    const [mediaCount, childCount] = await Promise.all([
      this.prisma.media.count({ where: { folderId: id, deletedAt: null } }),
      this.prisma.mediaFolder.count({ where: { parentId: id } }),
    ]);
    if (mediaCount > 0 || childCount > 0) {
      throw new BadRequestException({ code: "FOLDER_NOT_EMPTY", message: "Move or delete its contents first" });
    }
    const existing = await this.prisma.mediaFolder.findUniqueOrThrow({ where: { id } });
    await this.prisma.mediaFolder.delete({ where: { id } });
    await this.audit.record({
      actorType: "staff",
      actorId: req.staff!.id,
      action: "media_folder.delete",
      entityType: "media_folder",
      entityId: id,
      before: { name: existing.name },
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    });
  }
}
