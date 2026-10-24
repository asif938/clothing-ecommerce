import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { StaffAuthGuard } from "../auth/staff-auth.guard";
import { PermissionsGuard } from "../common/permissions.guard";
import { RequirePermissions } from "../common/require-permissions.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { BlocklistService } from "./blocklist.service";
import { createBlocklistEntrySchema, type CreateBlocklistEntryDto } from "./dto";

@ApiTags("blocklist")
@Controller("admin/blocklist")
@UseGuards(StaffAuthGuard, PermissionsGuard)
@RequirePermissions("blocklist.manage")
export class BlocklistController {
  constructor(private readonly blocklist: BlocklistService) {}

  @Get()
  list() {
    return this.blocklist.list();
  }

  @Post()
  create(@Body(new ZodValidationPipe(createBlocklistEntrySchema)) body: CreateBlocklistEntryDto, @Req() req: Request) {
    return this.blocklist.create(body, req.staff!);
  }

  @Delete(":id")
  async remove(@Param("id") id: string, @Req() req: Request) {
    await this.blocklist.remove(id, req.staff!);
    return { ok: true };
  }
}
