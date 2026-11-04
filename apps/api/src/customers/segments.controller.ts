import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SegmentsService } from "./segments.service";
import {
  createSegmentSchema,
  previewSegmentSchema,
  updateSegmentSchema,
  type CreateSegmentDto,
  type PreviewSegmentDto,
  type UpdateSegmentDto,
} from "./dto";

@ApiTags("customers")
@Controller("admin/segments")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("customers.manage")
export class SegmentsController {
  constructor(private readonly segments: SegmentsService) {}

  @Get()
  list() {
    return this.segments.list();
  }

  @Post("preview")
  async preview(@Body(new ZodValidationPipe(previewSegmentSchema)) body: PreviewSegmentDto) {
    return { count: await this.segments.previewCount(body) };
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.segments.get(id);
  }

  @Get(":id/members")
  members(@Param("id") id: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.segments.members(id, Number(page ?? 1), Number(pageSize ?? 25));
  }

  @Post()
  create(@Body(new ZodValidationPipe(createSegmentSchema)) body: CreateSegmentDto, @Req() req: Request) {
    return this.segments.create(body, req.staff!);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body(new ZodValidationPipe(updateSegmentSchema)) body: UpdateSegmentDto, @Req() req: Request) {
    return this.segments.update(id, body, req.staff!);
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.segments.remove(id, req.staff!);
    return { ok: true };
  }
}
