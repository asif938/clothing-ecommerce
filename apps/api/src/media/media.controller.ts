import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { updateMediaSchema, type UpdateMediaDto } from "./dto";
import { MediaService } from "./media.service";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

@ApiTags("media")
@Controller("admin/media")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("media.manage")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(@Query("folderId") folderId?: string) {
    return this.media.list(folderId);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@UploadedFile() file: Express.Multer.File, @Query("folderId") folderId: string | undefined, @Req() req: Request) {
    return this.media.upload(file, folderId ?? null, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateMediaSchema)) body: UpdateMediaDto, @Req() req: Request) {
    return this.media.update(id, body, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request) {
    return this.media.softDelete(id, req.staff!, { ip: req.ip ?? null, userAgent: req.get("user-agent") ?? null });
  }

  @Get(":id/usage")
  usage(@Param("id") id: string) {
    return this.media.usage(id);
  }
}
